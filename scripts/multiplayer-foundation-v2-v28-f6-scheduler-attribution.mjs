import { spawn } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";

const BASE = (process.env.MW_F6_BASE || "http://127.0.0.1:8787").replace(/\/$/, "");
const WS_BASE = BASE.replace(/^http/, "ws");
const MODE = process.env.MW_F6_MODE || "authority-only";
const RUN = process.env.MW_F6_RUN || `f6-${Date.now().toString(36)}`;
const OUTPUT = process.env.MW_F6_OUTPUT || `mf6-f6-${MODE}.json`;
const PROXY_PORT = Number(process.env.MW_F6_PROXY_PORT || 8792);
const CONTROL_MS = Number(process.env.MW_F6_CONTROL_MS || 15000);
const STEP_MS = 1000 / 60;
const POLL_MS = 250;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const assert = (value, message) => { if (!value) throw new Error(message); };

async function waitFor(fn, label, timeoutMs = 45000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    try {
      last = await fn();
      if (last) return last;
    } catch (error) {
      last = error;
    }
    await sleep(50);
  }
  throw new Error(`${label} timeout · last=${last instanceof Error ? last.message : JSON.stringify(last)}`);
}

async function status() {
  const response = await fetch(`${BASE}/api/world-v0/status?run=${encodeURIComponent(RUN)}`, {
    headers: { "cache-control": "no-store" },
  });
  if (!response.ok) throw new Error(`status HTTP ${response.status}`);
  const value = await response.json();
  return {
    atMs: Date.now(),
    ok: value.ok,
    lifecycleMode: value.lifecycleMode ?? null,
    worldEpoch: value.worldEpoch ?? null,
    boundaryTick: Number.isInteger(value.boundaryTick) ? value.boundaryTick : null,
    players: Number.isInteger(value.players) ? value.players : null,
    connectedPlayers: Number.isInteger(value.connectedPlayers) ? value.connectedPlayers : null,
    physicsLoopActive: Boolean(value.physicsLoopActive),
    droppedTicks: Number.isInteger(value.droppedTicks) ? value.droppedTicks : null,
    catchupSteps: Number.isInteger(value.catchupSteps) ? value.catchupSteps : null,
    failure: value.failure ?? null,
  };
}

function schedulerSummary(samples) {
  const valid = samples.filter((sample) =>
    sample.lifecycleMode === "mf6" &&
    sample.physicsLoopActive &&
    Number.isInteger(sample.boundaryTick) &&
    Number.isInteger(sample.droppedTicks) &&
    Number.isInteger(sample.catchupSteps)
  );
  if (valid.length < 2) {
    return {
      samples: valid.length,
      wallMs: null,
      expectedTicks: null,
      boundaryDelta: null,
      droppedTicksDelta: null,
      catchupStepsDelta: null,
      progressRatio: null,
      droppedRatio: null,
      zeroProgressIntervals: null,
      droppedTickIntervals: null,
      maxDroppedTicksInInterval: null,
    };
  }
  const first = valid[0];
  const last = valid[valid.length - 1];
  const wallMs = Math.max(1, last.atMs - first.atMs);
  const expectedTicks = wallMs / STEP_MS;
  let zeroProgressIntervals = 0;
  let droppedTickIntervals = 0;
  let maxDroppedTicksInInterval = 0;
  const intervals = [];
  for (let index = 1; index < valid.length; index += 1) {
    const previous = valid[index - 1];
    const current = valid[index];
    const wall = Math.max(1, current.atMs - previous.atMs);
    const expected = wall / STEP_MS;
    const boundary = current.boundaryTick - previous.boundaryTick;
    const dropped = current.droppedTicks - previous.droppedTicks;
    const catchup = current.catchupSteps - previous.catchupSteps;
    if (boundary === 0) zeroProgressIntervals += 1;
    if (dropped > 0) droppedTickIntervals += 1;
    maxDroppedTicksInInterval = Math.max(maxDroppedTicksInInterval, dropped);
    intervals.push({
      atMs: current.atMs,
      wallMs: wall,
      expectedTicks: expected,
      boundaryDelta: boundary,
      droppedTicksDelta: dropped,
      catchupStepsDelta: catchup,
      progressRatio: expected > 0 ? boundary / expected : null,
    });
  }
  return {
    samples: valid.length,
    wallMs,
    expectedTicks,
    boundaryDelta: last.boundaryTick - first.boundaryTick,
    droppedTicksDelta: last.droppedTicks - first.droppedTicks,
    catchupStepsDelta: last.catchupSteps - first.catchupSteps,
    progressRatio: expectedTicks > 0 ? (last.boundaryTick - first.boundaryTick) / expectedTicks : null,
    droppedRatio: expectedTicks > 0 ? (last.droppedTicks - first.droppedTicks) / expectedTicks : null,
    zeroProgressIntervals,
    droppedTickIntervals,
    maxDroppedTicksInInterval,
    first,
    last,
    intervals,
  };
}

function identity(message) {
  return {
    worldId: message.worldId,
    worldEpoch: message.worldEpoch,
    simBuildId: message.simBuildId,
    clientSimRevision: message.clientSimRevision,
  };
}

function topologyFields(peer) {
  assert(peer.topology, `${peer.playerId}: topology missing`);
  return { topologyRevision: peer.topology.revision, topologyDigest: peer.topology.digest };
}

function makePeer(index) {
  const playerId = `f6-p${index}`;
  const ws = new WebSocket(`${WS_BASE}/world-v0/ws?player=${playerId}&run=${encodeURIComponent(RUN)}&lifecycle=mf6`);
  const peer = { playerId, ws, welcome: null, topology: null, latestBoundary: 0, nextBatchSeq: 1 };
  ws.addEventListener("message", (event) => {
    try {
      const message = JSON.parse(String(event.data));
      if (message.type === "world_v0_welcome") peer.welcome = message;
      if (message.topology?.revision && message.topology?.digest) peer.topology = message.topology;
      if (Number.isInteger(message.boundaryTick)) peer.latestBoundary = Math.max(peer.latestBoundary, message.boundaryTick);
      if (Number.isInteger(message.state?.boundaryTick)) peer.latestBoundary = Math.max(peer.latestBoundary, message.state.boundaryTick);
    } catch {}
  });
  return peer;
}

async function openPeer(index) {
  const peer = makePeer(index);
  const welcome = await waitFor(() => peer.welcome || false, `peer ${index} welcome`);
  peer.ws.send(JSON.stringify({ type: "world_v0_ready", ...identity(welcome), ...topologyFields(peer) }));
  return peer;
}

function startFeed(peer, vector) {
  let nextTarget = Math.max(peer.latestBoundary + 2, Number(peer.welcome?.protocolStartTick || 0));
  const timer = setInterval(() => {
    if (peer.ws.readyState !== WebSocket.OPEN || !peer.topology) return;
    nextTarget = Math.max(nextTarget, peer.latestBoundary + 2);
    const horizon = peer.latestBoundary + 14;
    while (nextTarget + 1 <= horizon) {
      peer.ws.send(JSON.stringify({
        type: "world_v0_input_batch",
        ...identity(peer.welcome),
        ...topologyFields(peer),
        batchSeq: peer.nextBatchSeq++,
        records: [
          { targetTick: nextTarget, x: vector[0], z: vector[1], jump: false },
          { targetTick: nextTarget + 1, x: vector[0], z: vector[1], jump: false },
        ],
      }));
      nextTarget += 2;
    }
  }, 35);
  return () => clearInterval(timer);
}

async function pollWhile(predicate, samples) {
  while (predicate()) {
    try { samples.push(await status()); } catch (error) {
      samples.push({ atMs: Date.now(), statusError: error instanceof Error ? error.message : String(error) });
    }
    await sleep(POLL_MS);
  }
  try { samples.push(await status()); } catch {}
}

async function runAuthorityOnly() {
  const peers = [];
  const stopFeeds = [];
  const samples = [];
  const vectors = [[0.62,0],[-0.62,0],[0,0.62],[0,-0.62],[0.44,0.44],[-0.44,0.44]];
  try {
    for (let index = 0; index < 6; index += 1) peers.push(await openPeer(index));
    await waitFor(() => peers.every((peer) => peer.topology?.revision === 6) || false, "topology revision 6");
    peers.forEach((peer,index) => stopFeeds.push(startFeed(peer, vectors[index])));
    await waitFor(async () => {
      const current = await status();
      return current.physicsLoopActive && current.players === 6 ? current : false;
    }, "authority-only active six");
    let running = true;
    const polling = pollWhile(() => running, samples);
    await sleep(CONTROL_MS);
    running = false;
    await polling;
    return {
      mode: MODE,
      run: RUN,
      generatedAt: new Date().toISOString(),
      scheduler: schedulerSummary(samples),
      samples,
      interpretation: "Six active MF6 raw peers drive the authority without Chromium or shaped TCP. This is a co-located runner authority baseline, not deployed-edge evidence.",
    };
  } finally {
    for (const stop of stopFeeds) try { stop(); } catch {}
    for (const peer of peers) try { peer.ws.close(1000, "f6_authority_only_done"); } catch {}
  }
}

async function runBrowserHostile() {
  const innerOutput = `mf6-f6-inner-${RUN}.json`;
  const samples = [];
  let childRunning = true;
  let childExited = false;
  let observedExitCode = null;
  let forcedAfterFinalEvidence = false;
  const child = spawn(process.execPath, ["scripts/multiplayer-foundation-v2-v28-browser-latency-jitter.mjs"], {
    env: {
      ...process.env,
      MW_MF6_LATENCY_BASE: BASE,
      MW_MF6_LATENCY_RUN: RUN,
      MW_MF6_LATENCY_OUTPUT: innerOutput,
      MW_MF6_LATENCY_PROXY_PORT: String(PROXY_PORT),
    },
    stdio: "inherit",
  });

  const childExit = new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      childExited = true;
      observedExitCode = code;
      resolve({ kind: "exit", code, signal });
    });
  });

  const finalEvidence = (async () => {
    const deadline = Date.now() + 180_000;
    while (Date.now() < deadline) {
      try {
        const value = JSON.parse(readFileSync(innerOutput, "utf8"));
        const final =
          value?.verdict === "MF6_V28_BROWSER_LATENCY_JITTER_PASS" ||
          (value?.verdict === "MF6_V28_BROWSER_LATENCY_JITTER_FAIL" && Boolean(value?.error));
        if (final) return { kind: "evidence", value };
      } catch {}
      await sleep(200);
    }
    throw new Error("browser-hostile final evidence timeout");
  })();

  const polling = pollWhile(() => childRunning, samples);
  const completion = await Promise.race([childExit, finalEvidence]);
  let inner = completion.kind === "evidence" ? completion.value : null;

  // Scheduler attribution ends when the inner harness has committed its final
  // evidence, not when Node eventually releases every diagnostic handle.
  childRunning = false;
  await polling;

  if (!inner) {
    try { inner = JSON.parse(readFileSync(innerOutput, "utf8")); } catch {}
  }

  if (completion.kind === "evidence" && !childExited) {
    // Give the harness time to execute its own finally cleanup. If a diagnostic
    // handle still keeps the child alive, terminate only that already-complete child.
    await Promise.race([childExit, sleep(2_500)]);
    if (!childExited) {
      forcedAfterFinalEvidence = true;
      child.kill("SIGTERM");
      await Promise.race([childExit, sleep(1_500)]);
    }
    if (!childExited) {
      child.kill("SIGKILL");
      await Promise.race([childExit, sleep(1_000)]);
    }
  }

  rmSync(innerOutput, { force: true });
  const hostile = inner?.hostile?.diagnostic || inner?.diagnostic?.hostile || null;
  return {
    mode: MODE,
    run: RUN,
    generatedAt: new Date().toISOString(),
    childExitCode: observedExitCode,
    childForcedAfterFinalEvidence: forcedAfterFinalEvidence,
    scheduler: schedulerSummary(samples),
    browser: inner ? {
      verdict: inner.verdict,
      exact: hostile ? hostile.guardMismatches === 0 && hostile.firstStateMismatch == null : null,
      delivered: hostile?.agencyDelivery?.delivered ?? null,
      total: hostile?.agencyDelivery?.total ?? null,
      rttMedianMs: hostile?.rtt?.medianMs ?? null,
      rttP95Ms: hostile?.rtt?.p95Ms ?? null,
      serverRejected: hostile?.serverRejectedDelta ?? null,
      tooFuture: hostile?.ackStatus?.too_future?.records || 0,
      authorityWindowTicks: (hostile?.commandTrain?.commands || []).map((command) =>
        Number(command.maxTargetTickExclusive) - Number(command.startAuthorityBoundary)
      ).filter(Number.isFinite),
    } : null,
    samples,
    interpretation: "The full Chromium + five remote peers + shaped ordered-TCP MF6 apparatus runs co-located with Workerd while authority droppedTicks/catchupSteps are sampled out-of-band through the status surface. Sampling stops when the inner harness commits final evidence; a lingering diagnostic child handle may then be terminated without changing that evidence.",
  };
}

let result;
try {
  if (MODE === "authority-only") result = await runAuthorityOnly();
  else if (MODE === "browser-hostile") result = await runBrowserHostile();
  else throw new Error(`unknown MW_F6_MODE ${MODE}`);
  writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
  console.log("MF6_F6_SCHEDULER_ATTRIBUTION_SPECIMEN", JSON.stringify({
    mode: result.mode,
    run: result.run,
    scheduler: result.scheduler,
    browser: result.browser || null,
  }));
  console.log("MF6_F6_SCHEDULER_ATTRIBUTION_SPECIMEN_COMPLETE");
} catch (error) {
  result = {
    mode: MODE,
    run: RUN,
    generatedAt: new Date().toISOString(),
    error: error instanceof Error ? error.stack || error.message : String(error),
  };
  writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
  console.error(result.error);
  process.exitCode = 1;
}
