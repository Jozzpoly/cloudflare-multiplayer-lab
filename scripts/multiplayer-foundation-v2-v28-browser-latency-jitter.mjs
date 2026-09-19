import { spawn, spawnSync } from "node:child_process";
import { createShapedTcpProxy } from "./multiplayer-foundation-v2-shaped-tcp-proxy.mjs";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const BASE = (process.env.MW_MF6_LATENCY_BASE || "http://127.0.0.1:8787").replace(/\/$/, "");
const WS_BASE = BASE.replace(/^http/, "ws");
const RUN = process.env.MW_MF6_LATENCY_RUN || `m6l-${Date.now().toString(36)}`;
const OUTPUT = process.env.MW_MF6_LATENCY_OUTPUT || "mf6-browser-latency-jitter.json";
const PROXY_PORT = Number(process.env.MW_MF6_LATENCY_PROXY_PORT || 8792);
const PAGE_BASE = `http://127.0.0.1:${PROXY_PORT}`;
const INPUT_LEAD_PROBE_RAW = process.env.MW_MF6_INPUT_LEAD_PROBE?.trim() || "";
const INPUT_LEAD_PROBE = INPUT_LEAD_PROBE_RAW === "" ? null : Number(INPUT_LEAD_PROBE_RAW);
if (INPUT_LEAD_PROBE !== null &&
    (!Number.isInteger(INPUT_LEAD_PROBE) || INPUT_LEAD_PROBE < 1 || INPUT_LEAD_PROBE > 32)) {
  throw new Error(`invalid MW_MF6_INPUT_LEAD_PROBE ${INPUT_LEAD_PROBE_RAW}`);
}
const INPUT_ESTIMATE_CEILING_PROBE_RAW = process.env.MW_MF6_INPUT_ESTIMATE_CEILING_PROBE?.trim() || "";
if (!["", "0", "1"].includes(INPUT_ESTIMATE_CEILING_PROBE_RAW)) {
  throw new Error(`invalid MW_MF6_INPUT_ESTIMATE_CEILING_PROBE ${INPUT_ESTIMATE_CEILING_PROBE_RAW}`);
}
const INPUT_ESTIMATE_CEILING_PROBE = INPUT_ESTIMATE_CEILING_PROBE_RAW === ""
  ? null
  : INPUT_ESTIMATE_CEILING_PROBE_RAW === "1";
const DEBUG_PORT = 9400;
const TIMEOUT_MS = 45_000;
const EXPECTED_ACTORS = 6;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const assert = (value, message) => { if (!value) throw new Error(message); };

async function waitFor(fn, label, timeout = TIMEOUT_MS) {
  const deadline = Date.now() + timeout;
  let last = null;
  while (Date.now() < deadline) {
    try {
      last = await fn();
      if (last) return last;
    } catch (error) { last = error; }
    await sleep(50);
  }
  throw new Error(`${label} timeout · last=${last instanceof Error ? last.message : JSON.stringify(last)}`);
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

function makeRawPeer(index) {
  const playerId = `raw-${index}`;
  const ws = new WebSocket(`${WS_BASE}/world-v0/ws?player=${playerId}&run=${encodeURIComponent(RUN)}&lifecycle=mf6`);
  const peer = { index, playerId, ws, messages: [], welcome: null, topology: null, latestBoundary: 0, nextBatchSeq: 1 };
  ws.addEventListener("message", (event) => {
    try {
      const message = JSON.parse(String(event.data));
      peer.messages.push(message);
      // The sustained hostile command-train probe needs enough authority history to
      // classify every command window after the train completes.
      if (peer.messages.length > 6000) peer.messages.shift();
      if (Number.isInteger(message.boundaryTick)) peer.latestBoundary = Math.max(peer.latestBoundary, message.boundaryTick);
      if (Number.isInteger(message.state?.boundaryTick)) peer.latestBoundary = Math.max(peer.latestBoundary, message.state.boundaryTick);
      if (message.topology?.revision && message.topology?.digest) peer.topology = message.topology;
      if (message.type === "world_v0_welcome") peer.welcome = message;
    } catch {}
  });
  return peer;
}

async function openRawPeer(index) {
  const peer = makeRawPeer(index);
  const welcome = await waitFor(() => peer.welcome || false, `raw ${index} welcome`);
  assert(welcome.topology?.modeRevision === "multiplayer-foundation-v2-v28-dynamic-composition-r0", "mf6 mode revision mismatch");
  peer.ws.send(JSON.stringify({ type: "world_v0_ready", ...identity(welcome), ...topologyFields(peer) }));
  return peer;
}

function startFeed(peer, vector) {
  let running = true;
  let nextTarget = Math.max(peer.latestBoundary + 2, Number(peer.welcome?.protocolStartTick || 0));
  const timer = setInterval(() => {
    if (!running || peer.ws.readyState !== WebSocket.OPEN || !peer.topology) return;
    if (nextTarget < peer.latestBoundary + 2) nextTarget = peer.latestBoundary + 2;
    const horizon = peer.latestBoundary + 8;
    while (nextTarget + 1 <= horizon) {
      const batchSeq = peer.nextBatchSeq++;
      peer.ws.send(JSON.stringify({
        type: "world_v0_input_batch",
        ...identity(peer.welcome),
        ...topologyFields(peer),
        batchSeq,
        records: [
          { targetTick: nextTarget, x: vector[0], z: vector[1], jump: false },
          { targetTick: nextTarget + 1, x: vector[0], z: vector[1], jump: false },
        ],
      }));
      nextTarget += 2;
    }
  }, 35);
  return { stop() { running = false; clearInterval(timer); } };
}

async function keyDrive(cdp, sessionId, code, key, _keyCode, durationMs) {
  const quotedCode = JSON.stringify(code);
  const quotedKey = JSON.stringify(key);

  await cdp.eval(sessionId, `(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", {
      code: ${quotedCode},
      key: ${quotedKey},
      bubbles: true,
      cancelable: true,
    }));
    return true;
  })()`);

  const engaged = await waitFor(
    async () => {
      const control = await cdp.eval(sessionId, "window.__sharedYardV0PlayableControl?.()");
      const raw = control?.rawInput;
      const world = control?.worldInput;
      return raw && world &&
        Math.hypot(Number(raw.x || 0), Number(raw.z || 0)) >= 0.5 &&
        Math.hypot(Number(world.x || 0), Number(world.z || 0)) >= 0.5
        ? control
        : false;
    },
    `${code} playable input engagement`,
    5_000,
  );

  await sleep(durationMs);

  await cdp.eval(sessionId, `(() => {
    window.dispatchEvent(new KeyboardEvent("keyup", {
      code: ${quotedCode},
      key: ${quotedKey},
      bubbles: true,
      cancelable: true,
    }));
    return true;
  })()`);

  const released = await waitFor(
    async () => {
      const control = await cdp.eval(sessionId, "window.__sharedYardV0PlayableControl?.()");
      const raw = control?.rawInput;
      return raw && Math.hypot(Number(raw.x || 0), Number(raw.z || 0)) < 0.05
        ? control
        : false;
    },
    `${code} playable input release`,
    5_000,
  );

  return { engaged, released };
}

function distance3(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return 0;
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function canonicalInputWitnessRange(peer, sessionId, expected, minTargetTick, maxTargetTickExclusive = Infinity) {
  if (!peer || !sessionId || !expected) return { first: null, last: null, count: 0 };
  let first = null;
  let last = null;
  let count = 0;
  for (const message of peer.messages) {
    if (message?.type !== "world_v0_consumed" || !Number.isInteger(message.targetTick)) continue;
    if (message.targetTick < minTargetTick || message.targetTick >= maxTargetTickExclusive) continue;
    const player = (message.players || []).find((candidate) => candidate?.sessionId === sessionId);
    if (!player || !player.fresh) continue;
    if (Math.abs(Number(player.x) - Number(expected.x)) > 1e-6) continue;
    if (Math.abs(Number(player.z) - Number(expected.z)) > 1e-6) continue;
    const witness = {
      targetTick: message.targetTick,
      boundaryTick: message.boundaryTick,
      x: player.x,
      z: player.z,
      source: player.source,
      fresh: Boolean(player.fresh),
    };
    if (!first) first = witness;
    last = witness;
    count += 1;
  }
  return { first, last, count };
}

function canonicalInputWitness(peer, sessionId, expected, minTargetTick, maxTargetTickExclusive = Infinity) {
  return canonicalInputWitnessRange(peer, sessionId, expected, minTargetTick, maxTargetTickExclusive).last;
}

function ackStatusAnalysis(ackRecords, minSeq = 0) {
  const selected = (ackRecords || []).filter((record) => Number(record.seq) > minSeq);
  const byStatus = {};
  for (const record of selected) {
    const status = String(record.status || "unknown");
    if (!byStatus[status]) byStatus[status] = {
      records: 0,
      marginSumTicks: 0,
      minMarginTicks: null,
      maxMarginTicks: null,
    };
    const bucket = byStatus[status];
    const margin = Number(record.marginTicks);
    bucket.records += 1;
    if (Number.isFinite(margin)) {
      bucket.marginSumTicks += margin;
      bucket.minMarginTicks = bucket.minMarginTicks === null ? margin : Math.min(bucket.minMarginTicks, margin);
      bucket.maxMarginTicks = bucket.maxMarginTicks === null ? margin : Math.max(bucket.maxMarginTicks, margin);
    }
  }
  return Object.fromEntries(Object.entries(byStatus).map(([status, bucket]) => [status, {
    records: bucket.records,
    meanMarginTicks: bucket.records > 0 ? bucket.marginSumTicks / bucket.records : null,
    minMarginTicks: bucket.minMarginTicks,
    maxMarginTicks: bucket.maxMarginTicks,
  }]));
}

function commandAckAnalysis(ackRecords, commandTrain, minSeq = 0) {
  const viableStatuses = new Set(["accepted", "superseded", "duplicate_same"]);
  return commandTrain.commands.map((command, index) => {
    const maxTargetTickExclusive = command.maxTargetTickExclusive;
    const matching = (ackRecords || []).filter((record) =>
      Number(record.seq) > minSeq &&
      record.targetTick >= command.startAuthorityBoundary &&
      record.targetTick < maxTargetTickExclusive &&
      Math.abs(Number(record.x) - Number(command.expected.x)) <= 1e-6 &&
      Math.abs(Number(record.z) - Number(command.expected.z)) <= 1e-6
    );
    const viable = matching.filter((record) => viableStatuses.has(record.status));
    const late = matching.filter((record) => record.status === "late");
    const margins = matching.map((record) => Number(record.marginTicks)).filter(Number.isFinite);
    const viableMargins = viable.map((record) => Number(record.marginTicks)).filter(Number.isFinite);
    const statuses = Object.fromEntries(
      [...new Set(matching.map((record) => record.status))]
        .map((status) => [status, matching.filter((record) => record.status === status).length]),
    );
    return {
      index,
      code: command.code,
      matchingRecords: matching.length,
      viableRecords: viable.length,
      lateRecords: late.length,
      statuses,
      maxArrivalMarginTicks: margins.length ? Math.max(...margins) : null,
      maxViableArrivalMarginTicks: viableMargins.length ? Math.max(...viableMargins) : null,
      minViableTargetTick: viable.length ? Math.min(...viable.map((record) => record.targetTick)) : null,
      maxViableTargetTick: viable.length ? Math.max(...viable.map((record) => record.targetTick)) : null,
      survivingFutureSpanTicks: viable.length
        ? Math.max(...viable.map((record) => record.targetTick)) - command.startAuthorityBoundary
        : null,
      deliveredInWindow: command.deliveredInWindow,
      firstCanonicalOnsetTicks: command.firstCanonicalOnsetTicks,
    };
  });
}

async function runDirectionalCommandTrain(cdp, sessionId, authorityPeer, selfSessionId, {
  count = 8,
  holdMs = 700,
} = {}) {
  const specs = [
    { code: "KeyA", key: "a" },
    { code: "KeyD", key: "d" },
  ];
  const commands = [];
  let active = null;

  for (let index = 0; index < count; index += 1) {
    const next = specs[index % specs.length];
    const startAuthorityBoundary = authorityPeer.latestBoundary;
    const timingAtStart = await cdp.eval(sessionId, "window.__sharedYardV0Evidence()");
    const browserAuthorityEstimateTick = timingAtStart?.inputScheduler?.authorityEstimateTick ?? null;
    const browserInputAuthorshipEstimateTick = timingAtStart?.inputScheduler?.inputAuthorshipEstimateTick ?? browserAuthorityEstimateTick;
    const browserInputLeadTicks = timingAtStart?.inputScheduler?.inputLeadTicks ?? null;
    const browserObservedAuthorityBoundary = timingAtStart?.metrics?.latestAuthorityBoundary ?? null;
    const previousCode = active?.code ? JSON.stringify(active.code) : null;
    const previousKey = active?.key ? JSON.stringify(active.key) : null;
    const nextCode = JSON.stringify(next.code);
    const nextKey = JSON.stringify(next.key);

    await cdp.eval(sessionId, `(() => {
      ${previousCode ? `window.dispatchEvent(new KeyboardEvent("keyup", { code: ${previousCode}, key: ${previousKey}, bubbles: true, cancelable: true }));` : ""}
      window.dispatchEvent(new KeyboardEvent("keydown", {
        code: ${nextCode},
        key: ${nextKey},
        bubbles: true,
        cancelable: true,
      }));
      return true;
    })()`);

    const engaged = await waitFor(
      async () => {
        const control = await cdp.eval(sessionId, "window.__sharedYardV0PlayableControl?.()");
        const raw = control?.rawInput;
        const world = control?.worldInput;
        return raw && world &&
          Math.hypot(Number(raw.x || 0), Number(raw.z || 0)) >= 0.5 &&
          Math.hypot(Number(world.x || 0), Number(world.z || 0)) >= 0.5
          ? control
          : false;
      },
      `command train ${index} engagement`,
      5_000,
    );

    const expected = {
      x: Number(engaged.worldInput.x),
      z: Number(engaged.worldInput.z),
    };
    await sleep(holdMs);
    const afterHold = await cdp.eval(sessionId, "window.__sharedYardV0Evidence()");

    commands.push({
      index,
      code: next.code,
      startAuthorityBoundary,
      browserAuthorityEstimateTick,
      browserInputAuthorshipEstimateTick,
      browserInputLeadTicks,
      browserObservedAuthorityBoundary,
      estimateLagTicks: Number.isFinite(browserAuthorityEstimateTick)
        ? startAuthorityBoundary - browserAuthorityEstimateTick
        : null,
      authorshipEstimateLagTicks: Number.isFinite(browserInputAuthorshipEstimateTick)
        ? startAuthorityBoundary - browserInputAuthorshipEstimateTick
        : null,
      observedBoundaryLagTicks: Number.isInteger(browserObservedAuthorityBoundary)
        ? startAuthorityBoundary - browserObservedAuthorityBoundary
        : null,
      expected,
      browserPositionAfterHold: afterHold?.livePhysics?.actorPositions?.[selfSessionId] || null,
    });
    active = next;
  }

  if (active) {
    const code = JSON.stringify(active.code);
    const key = JSON.stringify(active.key);
    await cdp.eval(sessionId, `(() => {
      window.dispatchEvent(new KeyboardEvent("keyup", {
        code: ${code},
        key: ${key},
        bubbles: true,
        cancelable: true,
      }));
      return true;
    })()`);
  }

  await waitFor(
    async () => {
      const control = await cdp.eval(sessionId, "window.__sharedYardV0PlayableControl?.()");
      const raw = control?.rawInput;
      return raw && Math.hypot(Number(raw.x || 0), Number(raw.z || 0)) < 0.05 ? control : false;
    },
    "command train release",
    5_000,
  );

  const endAuthorityBoundary = authorityPeer.latestBoundary;
  // Raw authority observation is unshaped. Give the tail enough time to receive any
  // already-consumed window records before classifying them.
  await sleep(1_200);

  const classified = commands.map((command, index) => {
    const maxTargetTickExclusive = index + 1 < commands.length
      ? commands[index + 1].startAuthorityBoundary
      : endAuthorityBoundary;
    const witnessRange = canonicalInputWitnessRange(
      authorityPeer,
      selfSessionId,
      command.expected,
      command.startAuthorityBoundary,
      maxTargetTickExclusive,
    );
    return {
      ...command,
      maxTargetTickExclusive,
      canonicalWitness: witnessRange.last,
      firstCanonicalWitness: witnessRange.first,
      canonicalWitnessCount: witnessRange.count,
      firstCanonicalOnsetTicks: witnessRange.first
        ? witnessRange.first.targetTick - command.startAuthorityBoundary
        : null,
      lastCanonicalOffsetTicks: witnessRange.last
        ? witnessRange.last.targetTick - command.startAuthorityBoundary
        : null,
      deliveredInWindow: Boolean(witnessRange.first),
    };
  });

  return {
    count,
    holdMs,
    endAuthorityBoundary,
    tailAuthorityBoundary: authorityPeer.latestBoundary,
    commands: classified,
    delivered: classified.filter((command) => command.deliveredInWindow).length,
  };
}

function findChrome() {
  const override = process.env.CHROME_BIN?.trim();
  if (override) return override;
  const probe = spawnSync("bash", ["-lc", "command -v google-chrome || command -v google-chrome-stable || command -v chromium || command -v chromium-browser"], { encoding: "utf8" });
  const binary = probe.stdout.trim().split("\n")[0];
  if (!binary) throw new Error(`Chrome binary not found: ${probe.stderr || "no candidate"}`);
  return binary;
}

class Cdp {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.nextId = 1;
    this.pending = new Map();
    this.opened = new Promise((resolve, reject) => {
      this.ws.addEventListener("open", resolve, { once: true });
      this.ws.addEventListener("error", () => reject(new Error("CDP open failed")), { once: true });
    });
    this.ws.addEventListener("message", async (event) => {
      const raw = typeof event.data === "string" ? event.data : await event.data.text();
      const message = JSON.parse(raw);
      if (!message.id) return;
      const waiter = this.pending.get(message.id);
      if (!waiter) return;
      this.pending.delete(message.id);
      if (message.error) waiter.reject(new Error(`${waiter.method}: ${message.error.message}`));
      else waiter.resolve(message.result || {});
    });
  }
  async call(method, params = {}, sessionId) {
    await this.opened;
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, method });
      const payload = { id, method, params };
      if (sessionId) payload.sessionId = sessionId;
      this.ws.send(JSON.stringify(payload));
    });
  }
  async eval(sessionId, expression) {
    const result = await this.call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, userGesture: true }, sessionId);
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || "browser evaluation failed");
    return result.result?.value;
  }
  close() { try { this.ws.close(); } catch {} }
}

async function waitDebugger() {
  return waitFor(async () => {
    try {
      const response = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`);
      if (!response.ok) return false;
      const value = await response.json();
      return value.webSocketDebuggerUrl || false;
    } catch { return false; }
  }, "Chrome debugger", 20_000);
}

const rawPeers = [];
const feeds = [];
const profile = mkdtempSync(join(tmpdir(), "mf6-browser-"));
const proxy = createShapedTcpProxy({ target: BASE, port: PROXY_PORT, seed: 0x5f3759df });
let chrome = null;
let cdp = null;
let browserSession = null;
const result = {
  verdict: "MF6_V28_BROWSER_LATENCY_JITTER_FAIL",
  run: RUN,
  generatedAt: new Date().toISOString(),
  requestedInputLeadProbeTicks: INPUT_LEAD_PROBE,
  requestedInputEstimateCeilingProbe: INPUT_ESTIMATE_CEILING_PROBE,
};
let lastModerateDiagnostic = null;
let lastHostileDiagnostic = null;

try {
  await proxy.listen();

  // Boot the browser shell before loading the authority with five active raw peers.
  // The browser does not join the world until #enter is clicked, so this preserves
  // actor ordering while removing unrelated WebGL/asset bootstrap pressure from the
  // network-timing experiment.
  const browserShellStartedAt = Date.now();

  const binary = findChrome();
  chrome = spawn(binary, [
    "--headless=new", "--no-sandbox", "--disable-dev-shm-usage",
    "--disable-background-networking", "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding",
    "--use-gl=angle", "--use-angle=swiftshader-webgl", "--enable-unsafe-swiftshader",
    `--remote-debugging-port=${DEBUG_PORT}`, "--remote-debugging-address=127.0.0.1",
    `--user-data-dir=${profile}`, "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"] });

  cdp = new Cdp(await waitDebugger());
  await cdp.opened;
  const pageUrl = new URL(`${PAGE_BASE}/world-v0/`);
  pageUrl.searchParams.set("run", RUN);
  pageUrl.searchParams.set("lifecycle", "mf6");
  pageUrl.searchParams.set("player", "mf6-browser");
  if (INPUT_LEAD_PROBE !== null) pageUrl.searchParams.set("mf6InputLeadProbe", String(INPUT_LEAD_PROBE));
  if (INPUT_ESTIMATE_CEILING_PROBE !== null) {
    pageUrl.searchParams.set("mf6InputEstimateCeilingProbe", INPUT_ESTIMATE_CEILING_PROBE ? "1" : "0");
  }
  const { targetId } = await cdp.call("Target.createTarget", { url: pageUrl.toString() });
  ({ sessionId: browserSession } = await cdp.call("Target.attachToTarget", { targetId, flatten: true }));
  await cdp.call("Runtime.enable", {}, browserSession);
  await cdp.call("Page.enable", {}, browserSession);

  await waitFor(
    () => cdp.eval(browserSession, 'document.readyState === "complete" && document.querySelector("#enter")?.disabled === false && typeof window.__sharedYardV0Evidence === "function"'),
    "browser shell",
  );
  const browserShellReadyMs = Date.now() - browserShellStartedAt;

  // Establish the five-actor world only after the shell is ready. The browser then
  // enters sixth, preserving the same MF6 actor:5 identity and tested topology.
  for (let index = 0; index < 5; index += 1) rawPeers.push(await openRawPeer(index));
  const epoch = rawPeers[0].welcome.worldEpoch;
  assert(rawPeers.every((peer) => peer.welcome.worldEpoch === epoch), "raw peers changed WorldEpoch");
  await waitFor(() => rawPeers.every((peer) => peer.topology?.revision === 5) || false, "raw topology revision 5");
  for (const peer of rawPeers) {
    peer.feed = startFeed(peer, [0, 0]);
    feeds.push(peer.feed);
  }

  await cdp.eval(browserSession, 'document.querySelector("#enter").click(); true');

  const before = await waitFor(
    async () => {
      const e = await cdp.eval(browserSession, "window.__sharedYardV0Evidence()");
      return e &&
        e.lifecycle?.mf6 === true &&
        e.lifecycle?.topology?.revision === 6 &&
        e.lifecycle.topology.actors?.length === 6 &&
        e.livePhysics?.actorBodyCount === 6 &&
        e.identity?.worldEpoch === epoch &&
        !e.runtimeFailed &&
        e.metrics?.guardMismatches === 0 &&
        e.metrics?.guardMatches >= 5
        ? e : false;
    },
    "six-actor browser exact bootstrap",
    50_000,
  );
  assert(before.session?.selfNetEntityId === "actor:5", `browser identity ${before.session?.selfNetEntityId}`);
  assert(before.livePhysics.netEntityOrder.length === 18, "browser six-actor entity order mismatch");
  const expectedInputLead = INPUT_LEAD_PROBE ?? before.inputScheduler?.contractInputLeadTicks;
  assert(
    before.inputScheduler?.inputLeadTicks === expectedInputLead,
    `browser effective input lead ${before.inputScheduler?.inputLeadTicks}, expected ${expectedInputLead}`,
  );
  assert(
    before.inputScheduler?.simulationLeadTicks === 2,
    `browser simulation lead drift ${before.inputScheduler?.simulationLeadTicks}`,
  );

  const tracked = rawPeers[0];
  const second = rawPeers[1];
  assert(
    before.livePhysics.trackedRemoteSessionId === tracked.welcome.selfSessionId,
    `browser tracked unexpected remote ${before.livePhysics.trackedRemoteSessionId}`,
  );
  assert(
    before.livePhysics.trackedRemoteNetEntityId === tracked.welcome.selfNetEntityId,
    `browser tracked unexpected remote actor ${before.livePhysics.trackedRemoteNetEntityId}`,
  );

  const baselineRemotePosition = before.livePhysics.remotePosition;
  assert(Array.isArray(baselineRemotePosition), "tracked remote position missing at baseline");

  // Phase A: preserve the old exact control. One explicitly tracked remote moves.
  tracked.feed.stop();
  tracked.feed = startFeed(tracked, [0.72, 0]);
  feeds.push(tracked.feed);

  const singleRemote = await waitFor(
    async () => {
      const e = await cdp.eval(browserSession, "window.__sharedYardV0Evidence()");
      if (!e) return false;
      if (e.runtimeFailed) throw new Error(`single tracked remote runtime failure: ${e.runtimeFailureReason}`);
      const position = e.livePhysics?.remotePosition;
      const moved = Array.isArray(position)
        ? Math.hypot(
            position[0] - baselineRemotePosition[0],
            position[1] - baselineRemotePosition[1],
            position[2] - baselineRemotePosition[2],
          )
        : 0;
      return e.metrics?.guardMismatches === 0 &&
        e.metrics?.guardMatches >= before.metrics.guardMatches + 12 &&
        moved >= 0.25
        ? e
        : false;
    },
    "single tracked remote exact control",
    25_000,
  );

  // Phase B: the old fixed-2 failure boundary. A second independent remote must now
  // remain exact and visibly move inside the browser's replicated physics state.
  const secondBaseline = singleRemote.livePhysics?.actorPositions?.[second.welcome.selfSessionId];
  assert(Array.isArray(secondBaseline), "second remote baseline position missing");
  second.feed.stop();
  second.feed = startFeed(second, [-0.72, 0]);
  feeds.push(second.feed);

  const twoRemoteExact = await waitFor(
    async () => {
      const e = await cdp.eval(browserSession, "window.__sharedYardV0Evidence()");
      if (!e) return false;
      if (e.runtimeFailed) throw new Error(`two-remote runtime failure: ${e.runtimeFailureReason}`);
      const position = e.livePhysics?.actorPositions?.[second.welcome.selfSessionId];
      const moved = Array.isArray(position)
        ? Math.hypot(
            position[0] - secondBaseline[0],
            position[1] - secondBaseline[1],
            position[2] - secondBaseline[2],
          )
        : 0;
      return e.metrics?.guardMismatches === 0 &&
        e.metrics?.guardMatches >= singleRemote.metrics.guardMatches + 12 &&
        moved >= 0.25
        ? e
        : false;
    },
    "two active remotes exact",
    25_000,
  );

  // Phase C: all five remote ActorSessions drive authority concurrently.
  const allRemoteBaselines = Object.fromEntries(
    rawPeers.map((peer) => [
      peer.welcome.selfSessionId,
      [...(twoRemoteExact.livePhysics?.actorPositions?.[peer.welcome.selfSessionId] || [])],
    ]),
  );
  for (const [sessionId, position] of Object.entries(allRemoteBaselines)) {
    assert(position.length === 3, `missing baseline for remote ${sessionId}`);
  }

  const vectors = [
    [0.62, 0],
    [-0.62, 0],
    [0, 0.62],
    [0, -0.62],
    [0.44, 0.44],
  ];
  rawPeers.forEach((peer, index) => {
    peer.feed.stop();
    peer.feed = startFeed(peer, vectors[index]);
    feeds.push(peer.feed);
  });

  const allRemoteExact = await waitFor(
    async () => {
      const e = await cdp.eval(browserSession, "window.__sharedYardV0Evidence()");
      if (!e) return false;
      if (e.runtimeFailed) throw new Error(`five-remote runtime failure: ${e.runtimeFailureReason}`);
      const positions = e.livePhysics?.actorPositions || {};
      const movedAll = rawPeers.every((peer) => {
        const sessionId = peer.welcome.selfSessionId;
        const from = allRemoteBaselines[sessionId];
        const to = positions[sessionId];
        return Array.isArray(to) && Math.hypot(
          to[0] - from[0],
          to[1] - from[1],
          to[2] - from[2],
        ) >= 0.18;
      });
      return e.metrics?.guardMismatches === 0 &&
        e.metrics?.guardMatches >= twoRemoteExact.metrics.guardMatches + 20 &&
        movedAll
        ? e
        : false;
    },
    "five active remotes exact",
    30_000,
  );

  const selfSessionId = allRemoteExact.session.actorSessionId;
  const baselineSelfPosition = allRemoteExact.livePhysics?.actorPositions?.[selfSessionId];
  assert(Array.isArray(baselineSelfPosition), "browser self baseline position missing");

  const baseline = {
    guardMatches: allRemoteExact.metrics.guardMatches,
    corrections: allRemoteExact.metrics.corrections,
    maxRewind: allRemoteExact.metrics.maxRewind,
    rttSamples: allRemoteExact.rtt.samples,
    selfPosition: [...baselineSelfPosition],
    inputScheduler: { ...allRemoteExact.inputScheduler },
    serverLate: allRemoteExact.metrics.serverLate,
    serverRejected: allRemoteExact.metrics.serverRejected,
    latestAuthorityBoundary: allRemoteExact.metrics.latestAuthorityBoundary,
    localBoundaryTick: allRemoteExact.localBoundaryTick,
    proxy: proxy.snapshot(),
  };

  // Moderate sustained impairment: exercise browser-authored input while all five
  // remote ActorSessions remain active.
  proxy.setProfile({ name: "moderate", latencyMs: 60, jitterMs: 15 });
  const moderateStimulus = await keyDrive(cdp, browserSession, "KeyD", "d", 68, 1100);

  const moderate = await waitFor(
    async () => {
      const e = await cdp.eval(browserSession, "window.__sharedYardV0Evidence()");
      if (!e) return false;
      if (e.runtimeFailed) throw new Error(`moderate impairment runtime failure: ${e.runtimeFailureReason}`);
      const position = e.livePhysics?.actorPositions?.[selfSessionId];
      const proxyState = proxy.snapshot();
      const checks = {
        exact: e.metrics?.guardMismatches === 0,
        guardProgress: e.metrics?.guardMatches >= baseline.guardMatches + 20,
        rttProgress: e.rtt?.samples >= baseline.rttSamples + 3,
        selfMotion: distance3(position, baseline.selfPosition) >= 0.35,
        c2uShaped: proxyState.clientToUpstream.shapedChunks > 0,
        u2cShaped: proxyState.upstreamToClient.shapedChunks > 0,
      };
      lastModerateDiagnostic = {
        checks,
        guardMatches: e.metrics?.guardMatches,
        guardMismatches: e.metrics?.guardMismatches,
        firstStateMismatch: e.metrics?.firstStateMismatch,
        corrections: e.metrics?.corrections,
        maxRewind: e.metrics?.maxRewind,
        maxReplaySteps: e.metrics?.maxReplaySteps,
        rtt: e.rtt,
        selfMotion: distance3(position, baseline.selfPosition),
        inputScheduler: { ...e.inputScheduler },
        inputSchedulerDelta: {
          pumps: e.inputScheduler.pumps - baseline.inputScheduler.pumps,
          authored: e.inputScheduler.authored - baseline.inputScheduler.authored,
          superseded: e.inputScheduler.superseded - baseline.inputScheduler.superseded,
        },
        serverLateDelta: e.metrics.serverLate - baseline.serverLate,
        serverRejectedDelta: e.metrics.serverRejected - baseline.serverRejected,
        networkState: e.networkState,
        localBoundaryTick: e.localBoundaryTick,
        latestAuthorityBoundary: e.metrics.latestAuthorityBoundary,
        proxy: proxyState,
      };
      return Object.values(checks).every(Boolean) ? { evidence: e, proxy: proxyState } : false;
    },
    "moderate active-N latency jitter exactness",
    35_000,
  );

  proxy.setProfile({ name: "hostile", latencyMs: 100, jitterMs: 25 });

  // Do not let a short successful speculative move qualify the hostile profile before
  // ordered-stream queues and RTT observations have lived under the new impairment.
  // Six seconds is apparatus dwell only; it does not change runtime timing semantics.
  await sleep(6_000);
  const hostileWarmup = await cdp.eval(browserSession, "window.__sharedYardV0Evidence()");
  assert(hostileWarmup && !hostileWarmup.runtimeFailed, "hostile warmup runtime failure");
  assert(hostileWarmup.metrics?.guardMismatches === 0, "hostile warmup exact-state mismatch");

  const hostileStartPosition = hostileWarmup.livePhysics.actorPositions[selfSessionId];
  const hostileStartGuardMatches = hostileWarmup.metrics.guardMatches;
  const hostileStartRttSamples = hostileWarmup.rtt.samples;
  const hostileStartInputScheduler = { ...hostileWarmup.inputScheduler };
  const hostileStartServerLate = hostileWarmup.metrics.serverLate;
  const hostileStartServerRejected = hostileWarmup.metrics.serverRejected;
  const hostileStartLocalBoundary = hostileWarmup.localBoundaryTick;
  const hostileStartAuthorityBoundary = hostileWarmup.metrics.latestAuthorityBoundary;
  const hostileStartArrival = { ...(hostileWarmup.inputScheduler?.arrival || {}) };
  const hostileStartAckSeq = hostileWarmup.inputScheduler?.ackTrace?.latestSeq || 0;

  const hostileCommandTrain = await runDirectionalCommandTrain(
    cdp,
    browserSession,
    rawPeers[0],
    selfSessionId,
    { count: 8, holdMs: 700 },
  );

  const hostile = await waitFor(
    async () => {
      const e = await cdp.eval(browserSession, "window.__sharedYardV0Evidence()");
      if (!e) return false;
      if (e.runtimeFailed) throw new Error(`hostile impairment runtime failure: ${e.runtimeFailureReason}`);
      const proxyState = proxy.snapshot();
      const deliveryRatio = hostileCommandTrain.delivered / hostileCommandTrain.count;
      const currentArrival = e.inputScheduler?.arrival || {};
      const hostileAckRecords = e.inputScheduler?.ackTrace?.records || [];
      const commandAck = commandAckAnalysis(
        hostileAckRecords,
        hostileCommandTrain,
        hostileStartAckSeq,
      );
      const ackStatus = ackStatusAnalysis(hostileAckRecords, hostileStartAckSeq);
      const arrivalRecordsDelta = Number(currentArrival.records || 0) - Number(hostileStartArrival.records || 0);
      const arrivalLateDelta = Number(currentArrival.late || 0) - Number(hostileStartArrival.late || 0);
      const arrivalSeverelyLateDelta = Number(currentArrival.severelyLate || 0) - Number(hostileStartArrival.severelyLate || 0);
      const arrivalSafeDelta = Number(currentArrival.safe || 0) - Number(hostileStartArrival.safe || 0);
      const arrivalMarginSumDelta = Number(currentArrival.marginSumTicks || 0) - Number(hostileStartArrival.marginSumTicks || 0);
      const checks = {
        exact: e.metrics?.guardMismatches === 0,
        guardProgress: e.metrics?.guardMatches >= hostileStartGuardMatches + 20,
        rttProgress: e.rtt?.samples >= hostileStartRttSamples + 3,
        sustainedCanonicalAgency: hostileCommandTrain.delivered === hostileCommandTrain.count,
        c2uProgress: proxyState.clientToUpstream.shapedChunks > moderate.proxy.clientToUpstream.shapedChunks,
        u2cProgress: proxyState.upstreamToClient.shapedChunks > moderate.proxy.upstreamToClient.shapedChunks,
      };
      lastHostileDiagnostic = {
        checks,
        guardMatches: e.metrics?.guardMatches,
        guardMismatches: e.metrics?.guardMismatches,
        firstStateMismatch: e.metrics?.firstStateMismatch,
        corrections: e.metrics?.corrections,
        maxRewind: e.metrics?.maxRewind,
        maxReplaySteps: e.metrics?.maxReplaySteps,
        maxAuthoritySilenceTicks: e.metrics?.maxAuthoritySilenceTicks,
        rtt: e.rtt,
        maxSelfExcursion: Math.max(
          0,
          ...hostileCommandTrain.commands.map((command) =>
            distance3(command.browserPositionAfterHold, hostileStartPosition)),
        ),
        inputScheduler: { ...e.inputScheduler },
        inputSchedulerDelta: {
          pumps: e.inputScheduler.pumps - hostileStartInputScheduler.pumps,
          authored: e.inputScheduler.authored - hostileStartInputScheduler.authored,
          superseded: e.inputScheduler.superseded - hostileStartInputScheduler.superseded,
        },
        serverLateDelta: e.metrics.serverLate - hostileStartServerLate,
        serverRejectedDelta: e.metrics.serverRejected - hostileStartServerRejected,
        networkState: e.networkState,
        localBoundaryTick: e.localBoundaryTick,
        localBoundaryDelta: e.localBoundaryTick - hostileStartLocalBoundary,
        latestAuthorityBoundary: e.metrics.latestAuthorityBoundary,
        authorityBoundaryDelta: e.metrics.latestAuthorityBoundary - hostileStartAuthorityBoundary,
        agencyDelivery: {
          delivered: hostileCommandTrain.delivered,
          total: hostileCommandTrain.count,
          ratio: deliveryRatio,
          missedCommandIndexes: hostileCommandTrain.commands
            .filter((command) => !command.deliveredInWindow)
            .map((command) => command.index),
        },
        arrivalMargin: {
          records: arrivalRecordsDelta,
          late: arrivalLateDelta,
          severelyLate: arrivalSeverelyLateDelta,
          safe: arrivalSafeDelta,
          lateFraction: arrivalRecordsDelta > 0 ? arrivalLateDelta / arrivalRecordsDelta : null,
          severelyLateFraction: arrivalRecordsDelta > 0 ? arrivalSeverelyLateDelta / arrivalRecordsDelta : null,
          safeFraction: arrivalRecordsDelta > 0 ? arrivalSafeDelta / arrivalRecordsDelta : null,
          meanMarginTicks: arrivalRecordsDelta > 0 ? arrivalMarginSumDelta / arrivalRecordsDelta : null,
        },
        phaseError: {
          estimateLagTicks: hostileCommandTrain.commands
            .map((command) => command.estimateLagTicks)
            .filter(Number.isFinite),
          authorshipEstimateLagTicks: hostileCommandTrain.commands
            .map((command) => command.authorshipEstimateLagTicks)
            .filter(Number.isFinite),
          observedBoundaryLagTicks: hostileCommandTrain.commands
            .map((command) => command.observedBoundaryLagTicks)
            .filter(Number.isFinite),
        },
        ackStatus,
        commandAck,
        commandTrain: hostileCommandTrain,
        proxy: proxyState,
      };
      return Object.values(checks).every(Boolean) ? { evidence: e, proxy: proxyState } : false;
    },
    "hostile sustained command delivery",
    15_000,
  );

  proxy.passthrough();
  const settleStartGuardMatches = hostile.evidence.metrics.guardMatches;

  const settled = await waitFor(
    async () => {
      const e = await cdp.eval(browserSession, "window.__sharedYardV0Evidence()");
      if (!e || e.runtimeFailed) return false;
      return e.metrics?.guardMismatches === 0 &&
        e.metrics?.guardMatches >= settleStartGuardMatches + 15 &&
        e.metrics?.firstStateMismatch === null
        ? e
        : false;
    },
    "post-latency exact settlement",
    25_000,
  );

  Object.assign(result, {
    verdict: "MF6_V28_BROWSER_LATENCY_JITTER_PASS",
    worldEpoch: epoch,
    actorIds: settled.lifecycle.topology.actors.map((actor) => actor.netEntityId),
    browserSelf: {
      actorSessionId: selfSessionId,
      netEntityId: settled.session.selfNetEntityId,
    },
    bootstrap: {
      revision: "mf6-browser-shell-before-five-peer-load-v1",
      shellReadyMs: browserShellReadyMs,
    },
    baseline,
    moderate: {
      profile: { latencyMs: 60, jitterMs: 15 },
      stimulus: moderateStimulus,
      guardMatches: moderate.evidence.metrics.guardMatches,
      guardMismatches: moderate.evidence.metrics.guardMismatches,
      corrections: moderate.evidence.metrics.corrections,
      maxRewind: moderate.evidence.metrics.maxRewind,
      maxReplaySteps: moderate.evidence.metrics.maxReplaySteps,
      rtt: moderate.evidence.rtt,
      maxAuthoritySilenceTicks: moderate.evidence.metrics.maxAuthoritySilenceTicks,
      inputScheduler: moderate.evidence.inputScheduler,
      diagnostic: lastModerateDiagnostic,
      proxy: moderate.proxy,
    },
    hostile: {
      profile: { latencyMs: 100, jitterMs: 25 },
      stimulus: {
        type: "directional-command-train",
        commandCount: hostileCommandTrain.count,
        holdMs: hostileCommandTrain.holdMs,
      },
      guardMatches: hostile.evidence.metrics.guardMatches,
      guardMismatches: hostile.evidence.metrics.guardMismatches,
      corrections: hostile.evidence.metrics.corrections,
      maxRewind: hostile.evidence.metrics.maxRewind,
      maxReplaySteps: hostile.evidence.metrics.maxReplaySteps,
      rtt: hostile.evidence.rtt,
      maxAuthoritySilenceTicks: hostile.evidence.metrics.maxAuthoritySilenceTicks,
      inputScheduler: hostile.evidence.inputScheduler,
      warmup: {
        guardMatches: hostileWarmup.metrics.guardMatches,
        guardMismatches: hostileWarmup.metrics.guardMismatches,
        rtt: hostileWarmup.rtt,
        inputScheduler: hostileWarmup.inputScheduler,
        serverLate: hostileWarmup.metrics.serverLate,
        serverRejected: hostileWarmup.metrics.serverRejected,
        localBoundaryTick: hostileWarmup.localBoundaryTick,
        latestAuthorityBoundary: hostileWarmup.metrics.latestAuthorityBoundary,
      },
      diagnostic: lastHostileDiagnostic,
      proxy: hostile.proxy,
    },
    settled: {
      guardMatches: settled.metrics.guardMatches,
      guardMismatches: settled.metrics.guardMismatches,
      firstStateMismatch: settled.metrics.firstStateMismatch,
      corrections: settled.metrics.corrections,
      maxRewind: settled.metrics.maxRewind,
      maxReplaySteps: settled.metrics.maxReplaySteps,
      rtt: settled.rtt,
      proxy: proxy.snapshot(),
    },
    interpretation: "Eight consecutive browser direction commands were each canonically consumed inside their own authority-time window while five remote actors remained active under sustained bidirectional TCP latency+jitter, with exact V28 state preserved.",
    nonClaim: "This shapes an ordered TCP byte stream. It does not emulate datagram packet loss/reorder, burst loss, simultaneous multi-client impairment, repeated hard outages, deployed-edge behavior, performance limits, N-peer presentation quality, or human 3-6 play.",
  });
  writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
  console.log("MF6_V28_BROWSER_LATENCY_JITTER_EVIDENCE", JSON.stringify(result));
  console.log(result.verdict);
} catch (error) {
  result.error = error instanceof Error ? error.stack || error.message : String(error);
  result.diagnostic = {
    moderate: lastModerateDiagnostic,
    hostile: lastHostileDiagnostic,
    proxy: proxy.snapshot(),
  };
  writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
  console.error("MF6_V28_BROWSER_LATENCY_JITTER_DIAGNOSTIC", JSON.stringify(result.diagnostic));
  console.error(result.error);
  process.exitCode = 1;
} finally {
  for (const feed of feeds) try { feed.stop(); } catch {}
  for (const peer of rawPeers) try { peer.ws.close(1000, "mf6_latency_jitter_probe_done"); } catch {}
  cdp?.close();
  if (chrome?.exitCode === null) chrome.kill("SIGKILL");
  try { await proxy.close(); } catch {}
  await sleep(100);
  rmSync(profile, { recursive: true, force: true });
}
