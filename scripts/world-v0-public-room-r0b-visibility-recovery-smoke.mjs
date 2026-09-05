import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { WORLD_V0_BROWSER_UI_REVISION } from "../public/world-v0/build-contract.js";

const BASE = (process.env.MW_WORLD_V0_R0B_BASE_URL || "http://127.0.0.1:8787").replace(/\/$/, "");
const ROOM = "yard-2";
const PAGE_URL = `${BASE}/world-v0/?run=${ROOM}`;
const WS_BASE = BASE.replace(/^http/, "ws");
const DEBUG_PORT = 9566;
const TIMEOUT_MS = 30_000;

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function assert(condition, message) { if (!condition) throw new Error(message); }

function findChrome() {
  const override = process.env.CHROME_BIN?.trim();
  if (override) return override;
  const probe = spawnSync("bash", ["-lc", "command -v google-chrome || command -v google-chrome-stable || command -v chromium || command -v chromium-browser"], { encoding: "utf8" });
  const binary = probe.stdout.trim().split("\n")[0];
  if (!binary) throw new Error(`Chrome/Chromium binary not found: ${probe.stderr || "no candidate"}`);
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
      if (message.error) waiter.reject(new Error(`CDP ${waiter.method}: ${message.error.message}`));
      else waiter.resolve(message.result || {});
    });
  }
  async call(method, params = {}, sessionId = undefined) {
    await this.opened;
    const id = this.nextId++;
    return await new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, method });
      const payload = { id, method, params };
      if (sessionId) payload.sessionId = sessionId;
      this.ws.send(JSON.stringify(payload));
    });
  }
  async evaluate(sessionId, expression) {
    const result = await this.call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, userGesture: true }, sessionId);
    if (result.exceptionDetails) throw new Error(`Browser evaluate failed: ${result.exceptionDetails.text || "unknown"}`);
    return result.result?.value;
  }
  close() { try { this.ws.close(); } catch { /* cleanup */ } }
}

async function waitForDebugger() {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < TIMEOUT_MS) {
    try {
      const response = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`, { signal: AbortSignal.timeout(1500) });
      if (response.ok) {
        const value = await response.json();
        if (value.webSocketDebuggerUrl) return value;
      }
      last = `HTTP ${response.status}`;
    } catch (error) { last = error instanceof Error ? error.message : String(error); }
    await sleep(100);
  }
  throw new Error(`Chrome debugger unavailable: ${last}`);
}

async function waitForBrowser(cdp, sessionId, expression, label, timeout = TIMEOUT_MS) {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < timeout) {
    try {
      last = await cdp.evaluate(sessionId, expression);
      if (last) return last;
    } catch (error) { last = error instanceof Error ? error.message : String(error); }
    await sleep(100);
  }
  throw new Error(`${label} timeout · last=${JSON.stringify(last)}`);
}

async function waitForRoom(predicate, label, timeout = 8000) {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < timeout) {
    const response = await fetch(`${BASE}/api/world-v0/rooms`, { cache: "no-store" });
    assert(response.ok, `directory HTTP ${response.status}`);
    const payload = await response.json();
    last = payload.rooms.find((room) => room.id === ROOM);
    if (last && predicate(last)) return last;
    await sleep(100);
  }
  throw new Error(`${label} timeout · last=${JSON.stringify(last)}`);
}

function identityFrom(message) {
  return {
    worldId: message.worldId,
    worldEpoch: message.worldEpoch,
    simBuildId: message.simBuildId,
    clientSimRevision: message.clientSimRevision,
  };
}

async function openDrivingPeer(player) {
  const ws = new WebSocket(`${WS_BASE}/world-v0/ws?player=${encodeURIComponent(player)}&run=${ROOM}`);
  let identity = null;
  let protocolStartTick = null;
  let nextTarget = null;
  let batchSeq = 0;
  let readySent = false;
  let pingSeq = 0;
  let pingTimer = null;
  let ended = false;
  let epochEndResolve;
  let epochEndReject;
  const epochEnded = new Promise((resolve, reject) => {
    epochEndResolve = resolve;
    epochEndReject = reject;
  });

  function send(payload) {
    if (ws.readyState !== WebSocket.OPEN) return false;
    ws.send(JSON.stringify(payload));
    return true;
  }

  function fillFuture(boundaryTick) {
    if (!identity || protocolStartTick === null || nextTarget === null) return;
    const horizon = boundaryTick + 28;
    while (nextTarget <= horizon && ws.readyState === WebSocket.OPEN) {
      const records = [];
      for (let i = 0; i < 2; i += 1) records.push({ targetTick: nextTarget + i, x: 0, z: 0, jump: false });
      batchSeq += 1;
      send({ type: "world_v0_input_batch", ...identity, batchSeq, records });
      nextTarget += 2;
    }
  }

  const welcomed = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${player} welcome timeout`)), 5000);
    ws.addEventListener("error", () => reject(new Error(`${player} websocket error before welcome`)), { once: true });
    ws.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (message.type === "world_v0_welcome") {
        identity = identityFrom(message);
        clearTimeout(timer);
        resolve(message);
        if (!pingTimer) {
          pingTimer = setInterval(() => {
            pingSeq += 1;
            send({ type: "world_v0_ping", id: `${player}-${pingSeq}` });
          }, 70);
        }
      }
      if (message.type === "world_v0_roster" && identity && message.players?.length === 2 && !readySent) {
        readySent = true;
        send({ type: "world_v0_ready", ...identity });
      }
      if (message.type === "world_v0_start") {
        protocolStartTick = message.protocolStartTick;
        nextTarget = protocolStartTick;
        fillFuture(message.boundaryTick);
      }
      if (message.type === "world_v0_pong") fillFuture(message.boundaryTick);
      if (message.type === "world_v0_epoch_ended" && !ended) {
        ended = true;
        if (pingTimer) clearInterval(pingTimer);
        pingTimer = null;
        epochEndResolve(message);
      }
    });
    ws.addEventListener("close", (event) => {
      if (pingTimer) clearInterval(pingTimer);
      pingTimer = null;
      if (!ended) epochEndReject(new Error(`${player} closed before epoch end ${event.code}:${event.reason}`));
    });
  });

  const welcome = await welcomed;
  return {
    welcome,
    epochEnded,
    close(reason = "cleanup") {
      if (pingTimer) clearInterval(pingTimer);
      pingTimer = null;
      try { ws.close(1000, reason); } catch { /* cleanup */ }
    },
  };
}

const chrome = findChrome();
const profile = mkdtempSync(join(tmpdir(), "mw-r0b-visibility-recovery-"));
const child = spawn(chrome, [
  "--headless=new",
  "--no-sandbox",
  "--disable-dev-shm-usage",
  "--disable-background-networking",
  "--disable-background-timer-throttling",
  "--disable-backgrounding-occluded-windows",
  "--disable-renderer-backgrounding",
  "--use-gl=angle",
  "--use-angle=swiftshader-webgl",
  "--enable-unsafe-swiftshader",
  `--remote-debugging-port=${DEBUG_PORT}`,
  "--remote-debugging-address=127.0.0.1",
  `--user-data-dir=${profile}`,
  "about:blank",
], { stdio: ["ignore", "ignore", "pipe"] });
const stderr = [];
child.stderr.on("data", (chunk) => stderr.push(chunk));

let cdp = null;
let peerA = null;
let peerB = null;
try {
  const debuggerInfo = await waitForDebugger();
  cdp = new Cdp(debuggerInfo.webSocketDebuggerUrl);
  await cdp.opened;
  const { targetId } = await cdp.call("Target.createTarget", { url: PAGE_URL });
  const { sessionId } = await cdp.call("Target.attachToTarget", { targetId, flatten: true });
  await cdp.call("Runtime.enable", {}, sessionId);
  await cdp.call("Page.enable", {}, sessionId);

  await waitForBrowser(cdp, sessionId, `document.readyState === "complete" && document.querySelector("#enter")?.disabled === false && typeof window.__sharedYardV0Evidence === "function"`, "page boot");
  await cdp.evaluate(sessionId, `(() => { document.querySelector("#callsign").value = "R0B-Hidden"; document.querySelector("#run").value = ${JSON.stringify(ROOM)}; document.querySelector("#enter").click(); return true; })()`);
  const waiting = await waitForBrowser(cdp, sessionId, `(() => { const e=window.__sharedYardV0Evidence?.(); return e?.networkState === "waiting for peer" && e.identity ? e : null; })()`, "browser waiting");
  assert(waiting.uiRevision === WORLD_V0_BROWSER_UI_REVISION, `UI revision ${waiting.uiRevision}`);
  const epochA = waiting.identity.worldEpoch;

  peerA = await openDrivingPeer("R0B-Hidden-Peer-A");
  const liveA = await waitForBrowser(cdp, sessionId, `(() => { const e=window.__sharedYardV0Evidence?.(); return e?.identity?.worldEpoch === ${JSON.stringify(epochA)} && String(e.networkState || "").startsWith("live") ? e : null; })()`, "initial live epoch", 8000);
  assert(liveA.metrics.guardMismatches === 0, `initial guard mismatch ${JSON.stringify(liveA.metrics.firstStateMismatch)}`);

  const hiddenState = await cdp.evaluate(sessionId, `(() => {
    window.__r0bSyntheticVisibility = "hidden";
    window.__r0bDropInputBatches = true;
    if (!window.__r0bOriginalWebSocketSend) {
      window.__r0bOriginalWebSocketSend = WebSocket.prototype.send;
      WebSocket.prototype.send = function(data) {
        if (window.__r0bDropInputBatches && typeof data === "string" && data.includes('"type":"world_v0_input_batch"')) return;
        return window.__r0bOriginalWebSocketSend.call(this, data);
      };
    }
    try {
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => window.__r0bSyntheticVisibility });
    } catch (error) {
      return "visibility-override-error:" + (error?.message || error);
    }
    document.dispatchEvent(new Event("visibilitychange"));
    return document.visibilityState;
  })()`);
  assert(hiddenState === "hidden", `synthetic hidden transition failed: ${hiddenState}`);

  const ended = await Promise.race([
    peerA.epochEnded,
    sleep(8000).then(() => { throw new Error("input lease epoch end timeout while input batches suppressed"); }),
  ]);
  assert(ended.reason === "input_lease_expired:actor:0", `unexpected hidden epoch end ${ended.reason}`);
  assert(ended.worldEpoch === epochA, `ended epoch mismatch ${ended.worldEpoch} != ${epochA}`);
  peerA = null;

  const pendingHidden = await waitForBrowser(cdp, sessionId, `(() => {
    const e = window.__sharedYardV0Evidence?.();
    return e?.session?.roomRecovery?.pending && e.session.roomRecovery.waitingForVisibility ? e : null;
  })()`, "hidden client records pending room recovery", 5000);
  assert(pendingHidden.session.roomRecovery.reason === "input_lease_expired:actor:0", `pending reason ${JSON.stringify(pendingHidden.session.roomRecovery)}`);
  assert(pendingHidden.runtimeFailed === false, `runtime failed while hidden ${pendingHidden.runtimeFailureReason}`);

  const emptyHidden = await waitForRoom((room) => room.occupancy === 0 && room.state === "empty" && room.worldEpoch === null, "room not empty while hidden");
  assert(emptyHidden.joinable === true, `hidden empty room not joinable ${JSON.stringify(emptyHidden)}`);
  await sleep(700);
  const stillEmpty = await waitForRoom((room) => room.occupancy === 0 && room.state === "empty" && room.worldEpoch === null, "hidden client unexpectedly reconnected", 1500);
  assert(stillEmpty.occupancy === 0, "reconnect loop occurred while synthetic hidden");

  const visibleState = await cdp.evaluate(sessionId, `(() => {
    window.__r0bDropInputBatches = false;
    window.__r0bSyntheticVisibility = "visible";
    document.dispatchEvent(new Event("visibilitychange"));
    return document.visibilityState;
  })()`);
  assert(visibleState === "visible", `synthetic visible transition failed: ${visibleState}`);

  const recovered = await waitForBrowser(cdp, sessionId, `(() => { const e=window.__sharedYardV0Evidence?.(); return e?.runKey === ${JSON.stringify(ROOM)} && e?.identity?.worldEpoch && e.identity.worldEpoch !== ${JSON.stringify(epochA)} && e.networkState === "waiting for peer" && e.session?.roomRecovery?.pending === false ? e : null; })()`, "same-room visibility recovery", 12_000);
  const epochB = recovered.identity.worldEpoch;
  assert(recovered.session.roomRecovery.lastRecoveredEpoch === epochB, `recovery snapshot ${JSON.stringify(recovered.session.roomRecovery)}`);
  assert(recovered.runtimeFailed === false, `runtime failed after visible ${recovered.runtimeFailureReason}`);
  assert(recovered.metrics.guardMismatches === 0, `recovery guard mismatch ${JSON.stringify(recovered.metrics.firstStateMismatch)}`);
  assert(recovered.lifecycleEvents?.some((event) => event.type === "room-recovered" && event.sourceEpoch === epochA && event.recoveredEpoch === epochB), `room-recovered event missing ${JSON.stringify(recovered.lifecycleEvents)}`);

  const waitingB = await waitForRoom((room) => room.occupancy === 1 && room.state === "waiting" && room.worldEpoch === epochB, "directory did not expose recovered waiting epoch");
  assert(waitingB.joinable === true, `recovered waiting room not joinable ${JSON.stringify(waitingB)}`);

  peerB = await openDrivingPeer("R0B-Hidden-Peer-B");
  const liveB = await waitForBrowser(cdp, sessionId, `(() => { const e=window.__sharedYardV0Evidence?.(); return e?.identity?.worldEpoch === ${JSON.stringify(epochB)} && String(e.networkState || "").startsWith("live") ? e : null; })()`, "recovered epoch live", 8000);
  assert(liveB.runtimeFailed === false, `runtime failed in recovered live epoch ${liveB.runtimeFailureReason}`);
  assert(liveB.metrics.guardMismatches === 0, `recovered live guard mismatch ${JSON.stringify(liveB.metrics.firstStateMismatch)}`);

  const liveRoom = await waitForRoom((room) => room.occupancy === 2 && room.state === "live" && room.worldEpoch === epochB, "directory did not expose recovered live epoch");
  assert(liveRoom.capacity === 2, `capacity drift ${JSON.stringify(liveRoom)}`);

  console.log("WORLD_V0_PUBLIC_ROOM_R0B_VISIBILITY_LEASE_PASS", JSON.stringify({
    room: ROOM,
    epochA,
    epochEndReason: ended.reason,
    hiddenPendingRecovery: true,
    noReconnectWhileHidden: true,
    epochB,
    automaticRecoveryAfterVisible: true,
    replacementPeerReachedLive: true,
    guardMismatches: liveB.metrics.guardMismatches,
    visibilitySignal: "explicit-apparatus-bridge",
    uiRevision: liveB.uiRevision,
  }));
} catch (error) {
  console.error("WORLD_V0_PUBLIC_ROOM_R0B_VISIBILITY_LEASE_FAIL", error);
  if (stderr.length) console.error(Buffer.concat(stderr).toString("utf8").slice(-5000));
  process.exitCode = 1;
} finally {
  peerA?.close("cleanup");
  peerB?.close("cleanup");
  cdp?.close();
  try { child.kill("SIGTERM"); } catch { /* cleanup */ }
  await sleep(150);
  rmSync(profile, { recursive: true, force: true });
}
