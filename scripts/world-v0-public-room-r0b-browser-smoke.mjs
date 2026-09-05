import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { WORLD_V0_BROWSER_UI_REVISION } from "../public/world-v0/build-contract.js";

const BASE = (process.env.MW_WORLD_V0_R0B_BASE_URL || "http://127.0.0.1:8787").replace(/\/$/, "");
const PAGE_URL = `${BASE}/world-v0/?run=yard-1`;
const WS_BASE = BASE.replace(/^http/, "ws");
const DEBUG_PORT = 9564;
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

function identityFrom(message) {
  return {
    worldId: message.worldId,
    worldEpoch: message.worldEpoch,
    simBuildId: message.simBuildId,
    clientSimRevision: message.clientSimRevision,
  };
}

async function openPeer(player, { readyWhenTwo = false } = {}) {
  const ws = new WebSocket(`${WS_BASE}/world-v0/ws?player=${encodeURIComponent(player)}&run=yard-1`);
  let identity = null;
  let welcome = null;
  let start = null;
  let readySent = false;
  const messages = [];

  const welcomed = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${player} welcome timeout`)), 5000);
    ws.addEventListener("error", () => reject(new Error(`${player} websocket error`)), { once: true });
    ws.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      messages.push(message);
      if (message.type === "world_v0_welcome") {
        welcome = message;
        identity = identityFrom(message);
        clearTimeout(timer);
        resolve(message);
      }
      if (message.type === "world_v0_roster" && readyWhenTwo && identity && message.players?.length === 2 && !readySent) {
        readySent = true;
        ws.send(JSON.stringify({ type: "world_v0_ready", ...identity }));
      }
      if (message.type === "world_v0_start") start = message;
    });
  });

  await welcomed;
  return {
    ws,
    get welcome() { return welcome; },
    get start() { return start; },
    get messages() { return messages; },
    close(reason = "r0b_peer_left") { try { ws.close(1000, reason); } catch { /* cleanup */ } },
  };
}

async function directoryRoom(id) {
  const response = await fetch(`${BASE}/api/world-v0/rooms`, { cache: "no-store" });
  assert(response.ok, `directory HTTP ${response.status}`);
  const payload = await response.json();
  return payload.rooms.find((room) => room.id === id);
}

const chrome = findChrome();
const profile = mkdtempSync(join(tmpdir(), "mw-r0b-room-recovery-"));
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
  await cdp.evaluate(sessionId, `(() => { document.querySelector("#callsign").value = "R0B-Browser"; document.querySelector("#run").value = "yard-1"; document.querySelector("#enter").click(); return true; })()`);

  const initial = await waitForBrowser(cdp, sessionId, `(() => { const e=window.__sharedYardV0Evidence?.(); return e?.networkState === "waiting for peer" && e.identity ? e : null; })()`, "initial waiting room");
  assert(initial.uiRevision === WORLD_V0_BROWSER_UI_REVISION, `UI revision ${initial.uiRevision}`);
  assert(initial.runKey === "yard-1", `initial room ${initial.runKey}`);
  const epochA = initial.identity.worldEpoch;
  assert(epochA, "missing initial world epoch");

  peerA = await openPeer("R0B-Peer-A");
  await waitForBrowser(cdp, sessionId, `window.__sharedYardV0Evidence?.().networkState === "ready · awaiting start" || window.__sharedYardV0Evidence?.().networkState === "both connected · ready" || window.__sharedYardV0Evidence?.().networkState === "peer joined"`, "first peer observed", 5000);
  const occupiedA = await directoryRoom("yard-1");
  assert(occupiedA.occupancy === 2, `yard-1 occupancy before leave ${JSON.stringify(occupiedA)}`);
  assert(occupiedA.worldEpoch === epochA, `directory epoch A mismatch ${occupiedA.worldEpoch} != ${epochA}`);

  peerA.close("r0b_peer_left");
  peerA = null;

  const recovered = await waitForBrowser(cdp, sessionId, `(() => { const e=window.__sharedYardV0Evidence?.(); return e?.runKey === "yard-1" && e?.identity?.worldEpoch && e.identity.worldEpoch !== ${JSON.stringify(epochA)} && e.networkState === "waiting for peer" && e.session?.roomRecovery?.pending === false ? e : null; })()`, "automatic same-room recovery", 12_000);
  const epochB = recovered.identity.worldEpoch;
  assert(epochB !== epochA, "room recovery reused old epoch");
  assert(recovered.session.roomRecovery.lastRecoveredEpoch === epochB, `last recovered epoch ${JSON.stringify(recovered.session.roomRecovery)}`);
  assert(recovered.lifecycleEvents?.some((event) => event.type === "room-recovered" && event.details?.sourceEpoch === epochA && event.details?.recoveredEpoch === epochB), `room-recovered lifecycle missing ${JSON.stringify(recovered.lifecycleEvents)}`);
  assert(recovered.runtimeFailed === false, `runtime failed during recovery ${recovered.runtimeFailureReason}`);
  assert(recovered.metrics.guardMismatches === 0, `guard mismatch during recovery ${JSON.stringify(recovered.metrics.firstStateMismatch)}`);

  const waitingB = await directoryRoom("yard-1");
  assert(waitingB.occupancy === 1 && waitingB.state === "waiting", `yard-1 not waiting after recovery ${JSON.stringify(waitingB)}`);
  assert(waitingB.worldEpoch === epochB, `directory epoch B mismatch ${waitingB.worldEpoch} != ${epochB}`);

  peerB = await openPeer("R0B-Peer-B", { readyWhenTwo: true });
  const live = await waitForBrowser(cdp, sessionId, `(() => { const e=window.__sharedYardV0Evidence?.(); return e?.identity?.worldEpoch === ${JSON.stringify(epochB)} && String(e.networkState || "").startsWith("live") ? e : null; })()`, "fresh epoch reaches live", 8000);
  assert(live.runtimeFailed === false, `runtime failed in recovered live epoch ${live.runtimeFailureReason}`);
  assert(live.metrics.guardMismatches === 0, `recovered epoch guard mismatch ${JSON.stringify(live.metrics.firstStateMismatch)}`);
  assert(live.protocolStartTick !== null, "recovered epoch did not schedule protocol");

  const liveRoom = await directoryRoom("yard-1");
  assert(liveRoom.occupancy === 2 && liveRoom.state === "live", `directory not live after replacement peer ${JSON.stringify(liveRoom)}`);
  assert(liveRoom.worldEpoch === epochB, `live directory epoch mismatch ${liveRoom.worldEpoch} != ${epochB}`);

  console.log("WORLD_V0_PUBLIC_ROOM_R0B_PASS", JSON.stringify({
    room: "yard-1",
    epochA,
    epochB,
    automaticRecovery: true,
    replacementPeerReachedLive: true,
    guardMismatches: live.metrics.guardMismatches,
    uiRevision: live.uiRevision,
  }));
} catch (error) {
  console.error("WORLD_V0_PUBLIC_ROOM_R0B_FAIL", error);
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
