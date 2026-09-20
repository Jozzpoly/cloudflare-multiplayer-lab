import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const BASE = (process.env.MW_MF6_F5_BASE || "http://127.0.0.1:8787").replace(/\/$/, "");
const WS_BASE = BASE.replace(/^http/, "ws");
const RUN = process.env.MW_MF6_F5_RUN || `m5b-${Date.now().toString(36)}`;
const OUTPUT = process.env.MW_MF6_F5_OUTPUT || "mf6-f5-background-visibility.json";
const HIDDEN_MS = Number(process.env.MW_MF6_F5_HIDDEN_MS || 15000);
const FREEZE_MS = Number(process.env.MW_MF6_F5_FREEZE_MS || 0);
const DEBUG_PORT = Number(process.env.MW_MF6_F5_DEBUG_PORT || 9410);
const TIMEOUT_MS = 45000;
const EXPECTED_ACTORS = 6;
const STEP_MS = 1000 / 60;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const assert = (value, message) => { if (!value) throw new Error(message); };

async function waitFor(fn, label, timeout = TIMEOUT_MS) {
  const deadline = Date.now() + timeout;
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
  const playerId = `f5-raw-${index}`;
  const ws = new WebSocket(`${WS_BASE}/world-v0/ws?player=${playerId}&run=${encodeURIComponent(RUN)}&lifecycle=mf6`);
  const peer = {
    index,
    playerId,
    ws,
    messages: [],
    welcome: null,
    topology: null,
    latestBoundary: 0,
    nextBatchSeq: 1,
  };
  ws.addEventListener("message", (event) => {
    try {
      const message = JSON.parse(String(event.data));
      peer.messages.push(message);
      if (peer.messages.length > 4000) peer.messages.shift();
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
  assert(
    welcome.topology?.modeRevision === "multiplayer-foundation-v2-v28-dynamic-composition-r0",
    "mf6 mode revision mismatch",
  );
  peer.ws.send(JSON.stringify({
    type: "world_v0_ready",
    ...identity(welcome),
    ...topologyFields(peer),
  }));
  return peer;
}

function startFeed(peer, vector) {
  let running = true;
  let nextTarget = Math.max(peer.latestBoundary + 2, Number(peer.welcome?.protocolStartTick || 0));
  const timer = setInterval(() => {
    if (!running || peer.ws.readyState !== WebSocket.OPEN || !peer.topology) return;
    if (nextTarget < peer.latestBoundary + 2) nextTarget = peer.latestBoundary + 2;
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
  return { stop() { running = false; clearInterval(timer); } };
}

async function authorityStatus() {
  const response = await fetch(`${BASE}/api/world-v0/status?run=${encodeURIComponent(RUN)}`, {
    cache: "no-store",
  });
  assert(response.ok, `authority status HTTP ${response.status}`);
  return response.json();
}

function findChrome() {
  const override = process.env.CHROME_BIN?.trim();
  if (override) return override;
  const probe = spawnSync("bash", [
    "-lc",
    "command -v google-chrome || command -v google-chrome-stable || command -v chromium || command -v chromium-browser",
  ], { encoding: "utf8" });
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
    const result = await this.call("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    }, sessionId);
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
    } catch {
      return false;
    }
  }, "Chrome debugger", 20000);
}

function canonicalWitness(peer, selfSessionId, expected, minBoundary) {
  for (const message of peer.messages) {
    if (message.type !== "world_v0_consumed") continue;
    if (!Number.isInteger(message.boundaryTick) || message.boundaryTick < minBoundary) continue;
    const player = (message.players || []).find((entry) => entry.sessionId === selfSessionId);
    if (!player || !player.fresh) continue;
    if (Math.abs(Number(player.x) - Number(expected.x)) > 1e-6) continue;
    if (Math.abs(Number(player.z) - Number(expected.z)) > 1e-6) continue;
    return {
      boundaryTick: message.boundaryTick,
      targetTick: message.targetTick,
      x: player.x,
      z: player.z,
      fresh: Boolean(player.fresh),
      source: player.source,
    };
  }
  return null;
}

async function foregroundAgencyProbe(cdp, sessionId, authorityPeer, selfSessionId) {
  const startBoundary = authorityPeer.latestBoundary;
  await cdp.eval(sessionId, `(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", {
      code: "KeyD", key: "d", bubbles: true, cancelable: true,
    }));
    return true;
  })()`);

  const engaged = await waitFor(async () => {
    const control = await cdp.eval(sessionId, "window.__sharedYardV0PlayableControl?.()");
    const raw = control?.rawInput;
    const world = control?.worldInput;
    return raw && world &&
      Math.hypot(Number(raw.x || 0), Number(raw.z || 0)) >= 0.5 &&
      Math.hypot(Number(world.x || 0), Number(world.z || 0)) >= 0.5
      ? control
      : false;
  }, "post-background command engagement", 5000);

  const expected = {
    x: Number(engaged.worldInput.x),
    z: Number(engaged.worldInput.z),
  };
  await sleep(900);
  await cdp.eval(sessionId, `(() => {
    window.dispatchEvent(new KeyboardEvent("keyup", {
      code: "KeyD", key: "d", bubbles: true, cancelable: true,
    }));
    return true;
  })()`);

  const witness = await waitFor(
    () => canonicalWitness(authorityPeer, selfSessionId, expected, startBoundary) || false,
    "post-background canonical agency",
    7000,
  );
  return { startBoundary, expected, witness };
}

const rawPeers = [];
const feeds = [];
const profile = mkdtempSync(join(tmpdir(), "mf6-f5-background-"));
let chrome = null;
let cdp = null;
let browserSession = null;
let coverSession = null;
let coverTargetId = null;
const result = {
  verdict: FREEZE_MS > 0 ? "MF6_F5_FROZEN_LIFECYCLE_FAIL" : "MF6_F5_BACKGROUND_VISIBILITY_FAIL",
  run: RUN,
  generatedAt: new Date().toISOString(),
  hiddenMs: HIDDEN_MS,
  freezeMs: FREEZE_MS,
};

try {
  for (let index = 0; index < 5; index += 1) rawPeers.push(await openRawPeer(index));
  const epoch = rawPeers[0].welcome.worldEpoch;
  assert(rawPeers.every((peer) => peer.welcome.worldEpoch === epoch), "raw peers changed WorldEpoch");
  await waitFor(() => rawPeers.every((peer) => peer.topology?.revision === 5) || false, "raw topology revision 5");

  const vectors = [
    [0.62, 0],
    [-0.62, 0],
    [0, 0.62],
    [0, -0.62],
    [0.44, 0.44],
  ];
  rawPeers.forEach((peer, index) => feeds.push(startFeed(peer, vectors[index])));

  const binary = findChrome();
  chrome = spawn(binary, [
    "--headless=new",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--use-gl=angle",
    "--use-angle=swiftshader-webgl",
    "--enable-unsafe-swiftshader",
    `--remote-debugging-port=${DEBUG_PORT}`,
    "--remote-debugging-address=127.0.0.1",
    `--user-data-dir=${profile}`,
    "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"] });

  cdp = new Cdp(await waitDebugger());
  await cdp.opened;

  const pageUrl = `${BASE}/world-v0/?run=${encodeURIComponent(RUN)}&lifecycle=mf6&player=mf6-browser`;
  const gameTarget = await cdp.call("Target.createTarget", { url: pageUrl });
  ({ sessionId: browserSession } = await cdp.call("Target.attachToTarget", {
    targetId: gameTarget.targetId,
    flatten: true,
  }));
  await cdp.call("Runtime.enable", {}, browserSession);
  await cdp.call("Page.enable", {}, browserSession);
  await cdp.call("Page.bringToFront", {}, browserSession);

  await waitFor(
    () => cdp.eval(
      browserSession,
      'document.readyState === "complete" && document.querySelector("#enter")?.disabled === false && typeof window.__sharedYardV0Evidence === "function"',
    ),
    "browser shell",
  );
  await cdp.eval(browserSession, 'document.querySelector("#enter").click(); true');

  const before = await waitFor(async () => {
    const e = await cdp.eval(browserSession, "window.__sharedYardV0Evidence()");
    return e &&
      e.lifecycle?.mf6 === true &&
      e.lifecycle?.topology?.revision === 6 &&
      e.lifecycle.topology.actors?.length === 6 &&
      e.livePhysics?.actorBodyCount === 6 &&
      e.identity?.worldEpoch === epoch &&
      !e.runtimeFailed &&
      e.metrics?.guardMismatches === 0 &&
      e.metrics?.guardMatches >= 8
      ? e
      : false;
  }, "six-actor exact foreground bootstrap", 50000);

  const beforeVisibility = await cdp.eval(browserSession, "document.visibilityState");
  assert(beforeVisibility === "visible", `foreground visibility ${beforeVisibility}`);

  const selfSessionId = before.session.actorSessionId;
  const selfTopologyActor = before.lifecycle.topology.actors.find(
    (actor) => actor.sessionId === selfSessionId,
  );
  assert(selfTopologyActor, "browser self missing from topology");
  const browserIdentity = {
    worldEpoch: before.identity.worldEpoch,
    actorSessionId: before.session.actorSessionId,
    netEntityId: before.session.selfNetEntityId,
    slot: selfTopologyActor.slot,
  };
  const authorityBefore = await authorityStatus();

  const cover = await cdp.call("Target.createTarget", { url: "about:blank" });
  coverTargetId = cover.targetId;
  ({ sessionId: coverSession } = await cdp.call("Target.attachToTarget", {
    targetId: coverTargetId,
    flatten: true,
  }));
  await cdp.call("Runtime.enable", {}, coverSession);
  await cdp.call("Page.enable", {}, coverSession);
  await cdp.call("Page.bringToFront", {}, coverSession);

  const hiddenState = await waitFor(async () => {
    const visibility = await cdp.eval(browserSession, "document.visibilityState");
    return visibility === "hidden" ? visibility : false;
  }, "game target hidden behind foreground tab", 10000);

  // Deliberately do not poll/evaluate the hidden page during the dwell. CDP activity
  // against the target could itself perturb browser scheduling pressure.
  await sleep(HIDDEN_MS);

  const hiddenEvidence = await cdp.eval(browserSession, "window.__sharedYardV0Evidence()");
  const hiddenVisibility = await cdp.eval(browserSession, "document.visibilityState");
  const authorityHidden = await authorityStatus();

  const hiddenSchedulerPumps = hiddenEvidence.inputScheduler.pumps - before.inputScheduler.pumps;
  const hiddenSchedulerAuthored = hiddenEvidence.inputScheduler.authored - before.inputScheduler.authored;
  const hiddenExpectedSchedulerPumps = HIDDEN_MS / STEP_MS;
  const hiddenSchedulerPumpRatio = hiddenExpectedSchedulerPumps > 0
    ? hiddenSchedulerPumps / hiddenExpectedSchedulerPumps
    : null;

  let freezeEvidence = null;
  if (FREEZE_MS > 0) {
    const authorityBeforeFreeze = await authorityStatus();
    const beforeFreezePumps = hiddenEvidence.inputScheduler.pumps;
    const beforeFreezeAuthored = hiddenEvidence.inputScheduler.authored;
    const beforeFreezeLocalBoundary = hiddenEvidence.localBoundaryTick;
    const beforeFreezeGuardMatches = hiddenEvidence.metrics.guardMatches;

    await cdp.call("Page.setWebLifecycleState", { state: "frozen" }, browserSession);
    await sleep(FREEZE_MS);

    // Do not evaluate the page while frozen. Observe the authority independently.
    const authorityFrozen = await authorityStatus();
    await cdp.call("Page.setWebLifecycleState", { state: "active" }, browserSession);

    const thawed = await waitFor(async () => {
      const visibility = await cdp.eval(browserSession, "document.visibilityState");
      const e = await cdp.eval(browserSession, "window.__sharedYardV0Evidence()");
      return visibility === "hidden" && e && !e.runtimeFailed ? { visibility, evidence: e } : false;
    }, "frozen page thawed while still hidden", 15000);

    freezeEvidence = {
      requestedMs: FREEZE_MS,
      lifecycleCommand: "Page.setWebLifecycleState:frozen->active",
      visibilityAfterThaw: thawed.visibility,
      schedulerPumpsAfterThaw:
        thawed.evidence.inputScheduler.pumps - beforeFreezePumps,
      schedulerAuthoredAfterThaw:
        thawed.evidence.inputScheduler.authored - beforeFreezeAuthored,
      localBoundaryDeltaAfterThaw:
        thawed.evidence.localBoundaryTick - beforeFreezeLocalBoundary,
      guardMatchesDeltaAfterThaw:
        thawed.evidence.metrics.guardMatches - beforeFreezeGuardMatches,
      guardMismatchesAfterThaw: thawed.evidence.metrics.guardMismatches,
      firstStateMismatchAfterThaw: thawed.evidence.metrics.firstStateMismatch,
      actorResumePendingAfterThaw: Boolean(thawed.evidence.session?.actorResume?.pending),
      networkStateAfterThaw: thawed.evidence.networkState,
      authorityBoundaryDelta:
        authorityFrozen.boundaryTick - authorityBeforeFreeze.boundaryTick,
      authorityConnectedPlayers: authorityFrozen.connectedPlayers,
      authorityDroppedTicksDelta:
        Number(authorityFrozen.droppedTicks || 0) - Number(authorityBeforeFreeze.droppedTicks || 0),
      authorityCatchupStepsDelta:
        Number(authorityFrozen.catchupSteps || 0) - Number(authorityBeforeFreeze.catchupSteps || 0),
      leaseExpiredConnectedSlots: authorityFrozen.leaseExpiredConnectedSlots || [],
      staleConnectedSlots: authorityFrozen.staleConnectedSlots || [],
      browserSlotLeaseExpired:
        (authorityFrozen.leaseExpiredConnectedSlots || []).includes(browserIdentity.slot),
      browserSlotStale:
        (authorityFrozen.staleConnectedSlots || []).includes(browserIdentity.slot),
    };
  }

  await cdp.call("Page.bringToFront", {}, browserSession);
  const visibleAgain = await waitFor(
    () => cdp.eval(browserSession, "document.visibilityState").then((value) => value === "visible" ? value : false),
    "game target visible again",
    10000,
  );

  const recovered = await waitFor(async () => {
    const e = await cdp.eval(browserSession, "window.__sharedYardV0Evidence()");
    if (!e || e.runtimeFailed) return false;
    return e.identity?.worldEpoch === browserIdentity.worldEpoch &&
      e.session?.actorSessionId === browserIdentity.actorSessionId &&
      e.session?.selfNetEntityId === browserIdentity.netEntityId &&
      e.lifecycle?.topology?.actors?.length === EXPECTED_ACTORS &&
      e.livePhysics?.actorBodyCount === EXPECTED_ACTORS &&
      e.metrics?.guardMismatches === 0 &&
      e.metrics?.guardMatches >= before.metrics.guardMatches + 10
      ? e
      : false;
  }, "same-identity exact foreground recovery", 30000);

  const agency = await foregroundAgencyProbe(cdp, browserSession, rawPeers[0], selfSessionId);
  const afterAgency = await waitFor(async () => {
    const e = await cdp.eval(browserSession, "window.__sharedYardV0Evidence()");
    return e && !e.runtimeFailed && e.metrics?.guardMismatches === 0 ? e : false;
  }, "post-background exact agency settle", 10000);
  const authorityAfter = await authorityStatus();

  Object.assign(result, {
    verdict: FREEZE_MS > 0 ? "MF6_F5_FROZEN_LIFECYCLE_COMPLETE" : "MF6_F5_BACKGROUND_VISIBILITY_COMPLETE",
    apparatus: {
      chromeBackgroundProtectionFlagsPresent: false,
      beforeVisibility,
      hiddenState,
      hiddenVisibility,
      visibleAgain,
    },
    identity: {
      before: browserIdentity,
      after: {
        worldEpoch: afterAgency.identity.worldEpoch,
        actorSessionId: afterAgency.session.actorSessionId,
        netEntityId: afterAgency.session.selfNetEntityId,
      },
      preserved:
        afterAgency.identity.worldEpoch === browserIdentity.worldEpoch &&
        afterAgency.session.actorSessionId === browserIdentity.actorSessionId &&
        afterAgency.session.selfNetEntityId === browserIdentity.netEntityId,
    },
    hidden: {
      durationMs: HIDDEN_MS,
      schedulerPumps: hiddenSchedulerPumps,
      schedulerAuthored: hiddenSchedulerAuthored,
      expectedSchedulerPumps: hiddenExpectedSchedulerPumps,
      schedulerPumpRatio: hiddenSchedulerPumpRatio,
      guardMatchesDelta: hiddenEvidence.metrics.guardMatches - before.metrics.guardMatches,
      guardMismatches: hiddenEvidence.metrics.guardMismatches,
      localBoundaryDelta: hiddenEvidence.localBoundaryTick - before.localBoundaryTick,
      observedAuthorityBoundaryDelta:
        hiddenEvidence.metrics.latestAuthorityBoundary - before.metrics.latestAuthorityBoundary,
      rttSamplesDelta: hiddenEvidence.rtt.samples - before.rtt.samples,
      networkState: hiddenEvidence.networkState,
      actorResumePending: Boolean(hiddenEvidence.session?.actorResume?.pending),
      authorityBoundaryDelta: authorityHidden.boundaryTick - authorityBefore.boundaryTick,
      authorityDroppedTicksDelta:
        Number(authorityHidden.droppedTicks || 0) - Number(authorityBefore.droppedTicks || 0),
      authorityCatchupStepsDelta:
        Number(authorityHidden.catchupSteps || 0) - Number(authorityBefore.catchupSteps || 0),
      authorityConnectedPlayers: authorityHidden.connectedPlayers,
    },
    freeze: freezeEvidence,
    recovery: {
      guardMatches: recovered.metrics.guardMatches,
      guardMismatches: recovered.metrics.guardMismatches,
      firstStateMismatch: recovered.metrics.firstStateMismatch,
      rebases: recovered.metrics.rebases,
      corrections: recovered.metrics.corrections,
      networkState: recovered.networkState,
      actorResumePending: Boolean(recovered.session?.actorResume?.pending),
      localBoundaryTick: recovered.localBoundaryTick,
      latestAuthorityBoundary: recovered.metrics.latestAuthorityBoundary,
    },
    postForegroundAgency: agency,
    final: {
      guardMatches: afterAgency.metrics.guardMatches,
      guardMismatches: afterAgency.metrics.guardMismatches,
      firstStateMismatch: afterAgency.metrics.firstStateMismatch,
      authorityBoundary: authorityAfter.boundaryTick,
      authorityConnectedPlayers: authorityAfter.connectedPlayers,
    },
    interpretation: FREEZE_MS > 0
      ? "After reproducing a real hidden tab without anti-background-throttling flags, CDP freezes the page for a bounded interval while five remote actors continue driving authority. The page is thawed while still hidden, returned to foreground, and must preserve exact same-identity recovery plus fresh authority-consumed agency."
      : "Real Chromium tab visibility is changed by placing another tab in front while Chrome runs without the previous anti-background-throttling flags. Five remote actors continue driving the shared authority. The specimen measures hidden-page scheduler progression, same-identity exact recovery and fresh authority-consumed agency after returning to foreground.",
    nonClaim: "Headless Chromium/CDP lifecycle control is machine evidence, not proof of desktop/mobile OS process eviction or all real-device background policies.",
  });

  writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
  console.log("MF6_F5_BACKGROUND_VISIBILITY", JSON.stringify(result));
  console.log(result.verdict);
} catch (error) {
  result.error = error instanceof Error ? error.stack || error.message : String(error);
  try {
    result.visibilityAtFailure = browserSession
      ? await cdp.eval(browserSession, "document.visibilityState")
      : null;
  } catch {}
  writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
  console.error(result.error);
  process.exitCode = 1;
} finally {
  for (const feed of feeds) try { feed.stop(); } catch {}
  for (const peer of rawPeers) try { peer.ws.close(1000, "mf6_f5_background_probe_done"); } catch {}
  if (coverTargetId && cdp) {
    try { await cdp.call("Target.closeTarget", { targetId: coverTargetId }); } catch {}
  }
  cdp?.close();
  if (chrome?.exitCode === null) chrome.kill("SIGKILL");
  await sleep(100);
  rmSync(profile, { recursive: true, force: true });
}
