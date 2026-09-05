import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { WORLD_V0_BROWSER_UI_REVISION } from "../public/world-v0/build-contract.js";

const BASE = (process.env.MW_WORLD_V0_SESSION_BASE_URL || "http://127.0.0.1:8787").replace(/\/$/, "");
const PAGE_URL = `${BASE}/world-v0/`;
const DEBUG_PORT = 9560;
const TIMEOUT_MS = 30_000;
const OUTPUT = process.env.MW_WORLD_V0_SESSION_OUTPUT || "world-v0-session-friction-evidence.json";
const EXPECTED_UI = WORLD_V0_BROWSER_UI_REVISION;

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

async function waitFor(cdp, sessionId, expression, label, timeoutMs = TIMEOUT_MS) {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < timeoutMs) {
    try {
      last = await cdp.evaluate(sessionId, expression);
      if (last) return last;
    } catch (error) { last = error instanceof Error ? error.message : String(error); }
    await sleep(120);
  }
  throw new Error(`${label} timeout · last=${JSON.stringify(last)}`);
}

function wsUrl(player, run) {
  const base = new URL(BASE);
  const protocol = base.protocol === "https:" ? "wss:" : "ws:";
  const url = new URL(`${protocol}//${base.host}/world-v0/ws`);
  url.searchParams.set("player", player);
  url.searchParams.set("run", run);
  return url.toString();
}

function waitForPeerStart(url) {
  const socket = new WebSocket(url);
  let identity = null;
  let settled = false;
  const started = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (!settled) reject(new Error("raw peer start timeout"));
    }, TIMEOUT_MS);
    socket.addEventListener("open", () => {});
    socket.addEventListener("error", () => {
      clearTimeout(timer);
      if (!settled) reject(new Error("raw peer websocket error"));
    });
    socket.addEventListener("message", async (event) => {
      const raw = typeof event.data === "string" ? event.data : await event.data.text();
      const message = JSON.parse(raw);
      if (message.type === "world_v0_welcome") {
        identity = {
          worldId: message.worldId,
          worldEpoch: message.worldEpoch,
          simBuildId: message.simBuildId,
          clientSimRevision: message.clientSimRevision,
        };
        socket.send(JSON.stringify({ type: "world_v0_ready", ...identity }));
      }
      if (message.type === "world_v0_start") {
        settled = true;
        clearTimeout(timer);
        resolve({ socket, start: message, identity });
      }
      if (message.type === "world_v0_error" && !settled) {
        clearTimeout(timer);
        reject(new Error(`raw peer server error ${message.error}`));
      }
    });
  });
  return { socket, started };
}

const chrome = findChrome();
const profile = mkdtempSync(join(tmpdir(), "mw-session-friction-"));
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
let rawPeer = null;
const result = { verdict: "WORLD_V0_SESSION_FRICTION_FAIL", generatedAt: new Date().toISOString(), page: PAGE_URL };
try {
  const debuggerInfo = await waitForDebugger();
  cdp = new Cdp(debuggerInfo.webSocketDebuggerUrl);
  await cdp.opened;

  const { targetId } = await cdp.call("Target.createTarget", { url: PAGE_URL });
  const { sessionId } = await cdp.call("Target.attachToTarget", { targetId, flatten: true });
  await cdp.call("Runtime.enable", {}, sessionId);
  await cdp.call("Page.enable", {}, sessionId);
  await cdp.call("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true,
    screenWidth: 390,
    screenHeight: 844,
    screenOrientation: { type: "portraitPrimary", angle: 0 },
  }, sessionId);
  await waitFor(cdp, sessionId, `document.readyState === "complete" && document.querySelector("#enter")?.disabled === false && typeof window.__sharedYardV0Session === "function"`, "session page boot");

  const suffix = Date.now().toString(36).slice(-7);
  const run = `sess-${suffix}`;
  const player = `owner-${suffix}`;
  await cdp.evaluate(sessionId, `(() => {
    document.querySelector("#callsign").value = ${JSON.stringify(player)};
    document.querySelector("#run").value = ${JSON.stringify(run)};
    document.querySelector("#enter").click();
    return true;
  })()`);

  await waitFor(cdp, sessionId, `(() => {
    const s = window.__sharedYardV0Session?.();
    return s?.networkState === "waiting for peer" && !document.querySelector("#copy-invite")?.classList.contains("hidden");
  })()`, "invite-ready waiting state");

  const waiting = await cdp.evaluate(sessionId, `({ session: window.__sharedYardV0Session(), evidence: window.__sharedYardV0Evidence(), location: location.href, restartHidden: document.querySelector("#restart-round").classList.contains("hidden") })`);
  assert(waiting.evidence.runtimeFailed === false, `waiting runtime failed ${waiting.evidence.runtimeFailureReason}`);
  assert(waiting.evidence.protocolStartTick === null, `waiting protocol unexpectedly started ${waiting.evidence.protocolStartTick}`);
  assert(waiting.session.runKey === run, `run key drift ${waiting.session.runKey}`);
  const invite = new URL(waiting.session.inviteUrl);
  assert(invite.searchParams.get("run") === run, `invite run mismatch ${invite}`);
  assert(!invite.searchParams.has("player"), `invite leaked player identity ${invite}`);
  assert(new URL(waiting.location).searchParams.get("run") === run, `browser URL not canonicalized ${waiting.location}`);
  assert(waiting.restartHidden === true, "restart must stay hidden while waiting");

  const peer = waitForPeerStart(wsUrl(`peer-${suffix}`, run));
  rawPeer = peer.socket;
  const peerStarted = await peer.started;
  await waitFor(cdp, sessionId, `(() => { const e = window.__sharedYardV0Evidence?.(); return Number.isInteger(e?.protocolStartTick) && e?.identity?.worldEpoch; })()`, "browser round start");
  const live = await cdp.evaluate(sessionId, `window.__sharedYardV0Evidence()`);
  assert(live.runtimeFailed === false, `live runtime failed ${live.runtimeFailureReason}`);
  assert(live.identity?.worldEpoch === peerStarted.identity?.worldEpoch, "browser/raw peer epoch mismatch");
  const firstEpoch = live.identity.worldEpoch;

  rawPeer.close(1000, "session-smoke-peer-leave");
  rawPeer = null;
  await waitFor(cdp, sessionId, `(() => {
    const s = window.__sharedYardV0Session?.();
    const e = window.__sharedYardV0Evidence?.();
    return s?.networkState === "waiting for peer" &&
      e?.identity?.worldEpoch && e.identity.worldEpoch !== ${JSON.stringify(firstEpoch)} &&
      e?.session?.roomRecovery?.pending === false &&
      e?.lifecycleEvents?.some((event) => event.type === "room-recovered" && event.sourceEpoch === ${JSON.stringify(firstEpoch)});
  })()`, "automatic same-room recovery after peer leaves");

  const recovered = await cdp.evaluate(sessionId, `({ session: window.__sharedYardV0Session(), evidence: window.__sharedYardV0Evidence(), inviteHidden: document.querySelector("#copy-invite").classList.contains("hidden"), restartHidden: document.querySelector("#restart-round").classList.contains("hidden") })`);
  assert(recovered.evidence.runtimeFailed === false, `recovery runtime failed ${recovered.evidence.runtimeFailureReason}`);
  assert(recovered.evidence.identity.worldEpoch !== firstEpoch, "room recovery reused old world epoch");
  assert(recovered.evidence.protocolStartTick === null, `recovered waiting epoch unexpectedly active ${recovered.evidence.protocolStartTick}`);
  assert(recovered.session.runKey === run, `room recovery changed Run key ${recovered.session.runKey}`);
  assert(recovered.session.restartAvailable === false, "manual restart remained primary after automatic recovery");
  assert(recovered.inviteHidden === false, "invite action missing after room recovery");
  assert(recovered.restartHidden === true, "restart action should stay hidden after automatic room recovery");
  assert(recovered.evidence.session?.roomRecovery?.lastRecoveredEpoch === recovered.evidence.identity.worldEpoch, `recovery provenance drift ${JSON.stringify(recovered.evidence.session?.roomRecovery)}`);
  assert(recovered.evidence.lifecycleEvents?.some((event) => event.type === "room-recovered" && event.sourceEpoch === firstEpoch && event.recoveredEpoch === recovered.evidence.identity.worldEpoch), "room-recovered lifecycle evidence missing");

  Object.assign(result, {
    verdict: "WORLD_V0_SESSION_FRICTION_PASS",
    run,
    firstEpoch,
    secondEpoch: recovered.evidence.identity.worldEpoch,
    inviteUrl: waiting.session.inviteUrl,
    waiting: {
      networkState: waiting.session.networkState,
      protocolStartTick: waiting.evidence.protocolStartTick,
    },
    recovery: {
      networkState: recovered.session.networkState,
      protocolStartTick: recovered.evidence.protocolStartTick,
      restartAvailable: recovered.session.restartAvailable,
      runtimeFailed: recovered.evidence.runtimeFailed,
      roomRecovery: recovered.evidence.session?.roomRecovery,
    },
  });
  writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
  console.log("WORLD_V0_SESSION_FRICTION_PASS", JSON.stringify({ run, firstEpoch, secondEpoch: recovered.evidence.identity.worldEpoch, automaticRoomRecovery: true }));
} catch (error) {
  result.error = error instanceof Error ? error.stack || error.message : String(error);
  result.chromeStderr = Buffer.concat(stderr).toString("utf8").slice(-8000);
  writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
  throw error;
} finally {
  try { if (rawPeer?.readyState === WebSocket.OPEN) rawPeer.close(1000, "cleanup"); } catch { /* cleanup */ }
  cdp?.close();
  if (child.exitCode === null) child.kill("SIGKILL");
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* cleanup */ }
}
