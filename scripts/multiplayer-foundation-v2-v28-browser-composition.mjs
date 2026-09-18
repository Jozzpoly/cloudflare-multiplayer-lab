import { spawn, spawnSync } from "node:child_process";
import { openMf6ResumeTransport } from "./multiplayer-foundation-v2-transport-proxy.mjs";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const BASE = (process.env.MW_MF6_BROWSER_BASE || "http://127.0.0.1:8787").replace(/\/$/, "");
const WS_BASE = BASE.replace(/^http/, "ws");
const RUN = process.env.MW_MF6_BROWSER_RUN || `m6b-${Date.now().toString(36)}`;
const OUTPUT = process.env.MW_MF6_BROWSER_OUTPUT || "mf6-browser-composition.json";
const DEBUG_PORT = 9396;
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

async function authorityStatus() {
  const response = await fetch(`${BASE}/api/world-v0/status?run=${encodeURIComponent(RUN)}`, { cache: "no-store" });
  assert(response.ok, `authority status HTTP ${response.status}`);
  return response.json();
}

async function openRawPeer(index) {
  const peer = makeRawPeer(index);
  const welcome = await waitFor(() => peer.welcome || false, `raw ${index} welcome`);
  assert(welcome.topology?.modeRevision === "multiplayer-foundation-v2-v28-dynamic-composition-r0", "mf6 mode revision mismatch");
  peer.ws.send(JSON.stringify({ type: "world_v0_ready", ...identity(welcome), ...topologyFields(peer) }));
  return peer;
}

function startZeroFeed(peer) {
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
          { targetTick: nextTarget, x: 0, z: 0, jump: false },
          { targetTick: nextTarget + 1, x: 0, z: 0, jump: false },
        ],
      }));
      nextTarget += 2;
    }
  }, 35);
  return { stop() { running = false; clearInterval(timer); } };
}

async function killTransportViaRebind(peer) {
  const hardTransport = await openMf6ResumeTransport({
    base: BASE,
    player: peer.playerId,
    run: RUN,
    resume: peer.welcome.resumeToken,
  });
  assert(hardTransport.welcome.selfSessionId === peer.welcome.selfSessionId, "browser churn hard transport ActorSession drift");
  assert(hardTransport.welcome.selfNetEntityId === peer.welcome.selfNetEntityId, "browser churn hard transport ActorId drift");
  assert(hardTransport.welcome.worldEpoch === peer.welcome.worldEpoch, "browser churn hard transport WorldEpoch drift");
  hardTransport.reset();
  await sleep(100);
  return { mechanism: "raw-websocket-tcp-rst", signal: "TCP_RST" };
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
const result = { verdict: "MF6_V28_BROWSER_COMPOSITION_FAIL", run: RUN, generatedAt: new Date().toISOString() };

try {
  // Start a live five-actor world before the browser arrives.
  for (let index = 0; index < 5; index += 1) rawPeers.push(await openRawPeer(index));
  const epoch = rawPeers[0].welcome.worldEpoch;
  assert(rawPeers.every((peer) => peer.welcome.worldEpoch === epoch), "raw peers changed WorldEpoch");
  await waitFor(() => rawPeers.every((peer) => peer.topology?.revision === 5) || false, "raw topology revision 5");
  for (const peer of rawPeers) feeds.push(startZeroFeed(peer));

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

  // Retire raw actor:2 through the real reservation horizon while the browser and
  // four other raw peers keep the world alive.
  const retired = rawPeers[2];
  const oldResumeToken = retired.welcome.resumeToken;
  const killedTransport = await killTransportViaRebind(retired);
  const replacementReady = await waitFor(async () => {
    const status = await authorityStatus();
    return status.worldEpoch === epoch &&
      status.lifecycleMode === "mf6" &&
      status.replaceableReservations >= 1 &&
      Array.isArray(status.replaceableSlots) &&
      status.replaceableSlots.includes(retired.welcome.slot)
      ? status
      : false;
  }, "browser churn authority soft reservation", 120_000);

  const replacement = await openRawPeer(6);
  rawPeers.push(replacement);
  assert(replacement.welcome.worldEpoch === epoch, "browser churn replacement rotated WorldEpoch");
  assert(replacement.welcome.selfNetEntityId === "actor:6", `replacement identity ${replacement.welcome.selfNetEntityId}`);
  assert(replacement.welcome.slot === 2, `replacement slot ${replacement.welcome.slot}`);
  feeds.push(startZeroFeed(replacement));

  const after = await waitFor(
    async () => {
      const e = await cdp.eval(browserSession, "window.__sharedYardV0Evidence()");
      const ids = e?.lifecycle?.topology?.actors?.map((actor) => actor.netEntityId) || [];
      return e &&
        e.lifecycle?.topology?.revision === 8 &&
        ids.length === 6 &&
        ids.includes("actor:6") &&
        !ids.includes("actor:2") &&
        e.livePhysics?.actorBodyCount === 6 &&
        e.session?.selfNetEntityId === "actor:5" &&
        !e.runtimeFailed &&
        e.metrics?.guardMismatches === 0 &&
        e.metrics?.guardMatches > before.metrics.guardMatches &&
        e.metrics?.rebases > before.metrics.rebases
        ? e : false;
    },
    "browser exact topology rebase after replacement",
    50_000,
  );

  const resumeResponse = await fetch(`${BASE}/api/world-v0/resume-check`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      run: RUN,
      playerId: retired.playerId,
      resumeToken: oldResumeToken,
      worldEpoch: epoch,
    }),
  });
  const staleResume = await resumeResponse.json();
  assert(resumeResponse.ok && staleResume.valid === false, `retired resume survived ${JSON.stringify(staleResume)}`);

  Object.assign(result, {
    verdict: "MF6_V28_BROWSER_COMPOSITION_PASS",
    worldEpoch: epoch,
    before: {
      topologyRevision: before.lifecycle.topology.revision,
      actorIds: before.lifecycle.topology.actors.map((actor) => actor.netEntityId),
      actorBodyCount: before.livePhysics.actorBodyCount,
      guardMatches: before.metrics.guardMatches,
      guardMismatches: before.metrics.guardMismatches,
      rebases: before.metrics.rebases,
      boundaryTick: before.localBoundaryTick,
    },
    after: {
      topologyRevision: after.lifecycle.topology.revision,
      actorIds: after.lifecycle.topology.actors.map((actor) => actor.netEntityId),
      actorBodyCount: after.livePhysics.actorBodyCount,
      selfNetEntityId: after.session.selfNetEntityId,
      guardMatches: after.metrics.guardMatches,
      guardMismatches: after.metrics.guardMismatches,
      rebases: after.metrics.rebases,
      boundaryTick: after.localBoundaryTick,
    },
    replacementReady: {
      boundaryTick: replacementReady.boundaryTick,
      connectedPlayers: replacementReady.connectedPlayers,
      softReservedSlots: replacementReady.softReservedSlots,
      replaceableReservations: replacementReady.replaceableReservations,
    },
    replacement: {
      actorId: replacement.welcome.selfNetEntityId,
      slot: replacement.welcome.slot,
      staleResumeRejected: true,
      transportLoss: {
        mechanism: killedTransport.mechanism,
        signal: killedTransport.signal,
      },
    },
    nonClaim: "This proves neutral-input real-Chromium self+N bootstrap and churn rebase only. General N-peer input prediction/reconciliation, N-peer presentation, impairment, performance, deployed edge and human 3-6 remain unproven.",
  });
  writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
  console.log("MF6_V28_BROWSER_COMPOSITION_EVIDENCE", JSON.stringify(result));
  console.log(result.verdict);
} catch (error) {
  result.error = error instanceof Error ? error.stack || error.message : String(error);
  writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
  console.error(result.error);
  process.exitCode = 1;
} finally {
  for (const feed of feeds) try { feed.stop(); } catch {}
  for (const peer of rawPeers) try { peer.ws.close(1000, "mf6_browser_probe_done"); } catch {}
  cdp?.close();
  if (chrome?.exitCode === null) chrome.kill("SIGKILL");
  await sleep(100);
  rmSync(profile, { recursive: true, force: true });
}
