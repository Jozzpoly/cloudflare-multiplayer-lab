import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const BASE = (process.env.MW_MF6_N_INPUT_BASE || "http://127.0.0.1:8787").replace(/\/$/, "");
const WS_BASE = BASE.replace(/^http/, "ws");
const RUN = process.env.MW_MF6_N_INPUT_RUN || `m6n-${Date.now().toString(36)}`;
const OUTPUT = process.env.MW_MF6_N_INPUT_OUTPUT || "mf6-browser-n-input-composition.json";
const DEBUG_PORT = 9397;
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
      if (peer.messages.length > 2000) peer.messages.shift();
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
let chrome = null;
let cdp = null;
let browserSession = null;
const result = { verdict: "MF6_V28_BROWSER_N_INPUT_COMPOSITION_FAIL", run: RUN, generatedAt: new Date().toISOString() };

try {
  // Start a live five-actor world before the browser arrives.
  for (let index = 0; index < 5; index += 1) rawPeers.push(await openRawPeer(index));
  const epoch = rawPeers[0].welcome.worldEpoch;
  assert(rawPeers.every((peer) => peer.welcome.worldEpoch === epoch), "raw peers changed WorldEpoch");
  await waitFor(() => rawPeers.every((peer) => peer.topology?.revision === 5) || false, "raw topology revision 5");
  for (const peer of rawPeers) {
    peer.feed = startFeed(peer, [0, 0]);
    feeds.push(peer.feed);
  }

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
  const pageUrl = `${BASE}/world-v0/?run=${encodeURIComponent(RUN)}&lifecycle=mf6&player=mf6-browser`;
  const { targetId } = await cdp.call("Target.createTarget", { url: pageUrl });
  ({ sessionId: browserSession } = await cdp.call("Target.attachToTarget", { targetId, flatten: true }));
  await cdp.call("Runtime.enable", {}, browserSession);
  await cdp.call("Page.enable", {}, browserSession);

  await waitFor(
    () => cdp.eval(browserSession, 'document.readyState === "complete" && document.querySelector("#enter")?.disabled === false && typeof window.__sharedYardV0Evidence === "function"'),
    "browser shell",
  );
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

  Object.assign(result, {
    verdict: "MF6_V28_BROWSER_N_INPUT_COMPOSITION_PASS",
    worldEpoch: epoch,
    topologyRevision: before.lifecycle.topology.revision,
    actorIds: before.lifecycle.topology.actors.map((actor) => actor.netEntityId),
    browserSelf: before.session.selfNetEntityId,
    trackedRemote: {
      sessionId: tracked.welcome.selfSessionId,
      actorId: tracked.welcome.selfNetEntityId,
      guardMatchesBefore: before.metrics.guardMatches,
      guardMatchesAfter: singleRemote.metrics.guardMatches,
    },
    secondRemote: {
      sessionId: second.welcome.selfSessionId,
      actorId: second.welcome.selfNetEntityId,
      guardMatchesAfter: twoRemoteExact.metrics.guardMatches,
    },
    fiveRemoteConcurrent: {
      sessionIds: rawPeers.map((peer) => peer.welcome.selfSessionId),
      actorIds: rawPeers.map((peer) => peer.welcome.selfNetEntityId),
      vectors,
      guardMatchesAfter: allRemoteExact.metrics.guardMatches,
      guardMismatches: allRemoteExact.metrics.guardMismatches,
      boundaryTick: allRemoteExact.localBoundaryTick,
    },
    firstStateMismatch: allRemoteExact.metrics.firstStateMismatch,
    interpretation: "V28 browser exact prediction/replay now composes self plus all five concurrently active remote ActorSessions. The previous actor:1 divergence boundary is closed at this scope.",
    nonClaim: "This qualifies local Workerd/Chromium N-peer input composition only. N-peer remote presentation quality, impairment, performance, deployed edge, and real human 3-6 play remain unproven.",
  });
  writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
  console.log("MF6_V28_BROWSER_N_INPUT_COMPOSITION_EVIDENCE", JSON.stringify(result));
  console.log(result.verdict);
} catch (error) {
  result.error = error instanceof Error ? error.stack || error.message : String(error);
  writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
  console.error(result.error);
  process.exitCode = 1;
} finally {
  for (const feed of feeds) try { feed.stop(); } catch {}
  for (const peer of rawPeers) try { peer.ws.close(1000, "mf6_n_input_probe_done"); } catch {}
  cdp?.close();
  if (chrome?.exitCode === null) chrome.kill("SIGKILL");
  await sleep(100);
  rmSync(profile, { recursive: true, force: true });
}
