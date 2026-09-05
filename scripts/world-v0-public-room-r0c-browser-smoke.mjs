import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  WORLD_V0_PUBLIC_ROOM_ENTRY_REVISION,
  WORLD_V0_PUBLIC_ROOM_IDS,
} from "../public/world-v0/public-room-entry.js";

const BASE = (process.env.MW_WORLD_V0_R0C_BASE_URL || "http://127.0.0.1:8787").replace(/\/$/, "");
const PAGE_URL = `${BASE}/world-v0/`;
const WS_BASE = BASE.replace(/^http/, "ws");
const DEBUG_PORT = 9568;
const TIMEOUT_MS = 35_000;

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
    await sleep(120);
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

async function openPassivePeer(player, run) {
  const ws = new WebSocket(`${WS_BASE}/world-v0/ws?player=${encodeURIComponent(player)}&run=${encodeURIComponent(run)}`);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${player} welcome timeout`)), 5000);
    ws.addEventListener("error", () => reject(new Error(`${player} websocket error`)), { once: true });
    ws.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (message.type !== "world_v0_welcome") return;
      clearTimeout(timer);
      resolve(message);
    });
  });
  return {
    ws,
    close() { try { ws.close(1000, "r0c_cleanup"); } catch { /* cleanup */ } },
  };
}

async function openDrivingPeer(player, run) {
  const ws = new WebSocket(`${WS_BASE}/world-v0/ws?player=${encodeURIComponent(player)}&run=${encodeURIComponent(run)}`);
  let identity = null;
  let protocolStartTick = null;
  let nextTarget = null;
  let batchSeq = 0;
  let readySent = false;
  let pingSeq = 0;
  let pingTimer = null;
  let closed = false;

  function send(payload) {
    if (ws.readyState !== WebSocket.OPEN) return false;
    ws.send(JSON.stringify(payload));
    return true;
  }

  function fillFuture(boundaryTick) {
    if (!identity || protocolStartTick === null || nextTarget === null) return;
    const horizon = boundaryTick + 28;
    while (nextTarget <= horizon && ws.readyState === WebSocket.OPEN) {
      const count = Math.min(2, horizon - nextTarget + 1);
      const records = [];
      for (let index = 0; index < count; index += 1) {
        records.push({ targetTick: nextTarget + index, x: 0, z: 0, jump: false });
      }
      batchSeq += 1;
      send({ type: "world_v0_input_batch", ...identity, batchSeq, records });
      nextTarget += count;
    }
  }

  const welcome = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${player} welcome timeout`)), 5000);
    ws.addEventListener("error", () => reject(new Error(`${player} websocket error`)), { once: true });
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
      if (message.type === "world_v0_epoch_ended") {
        if (pingTimer) clearInterval(pingTimer);
        pingTimer = null;
      }
    });
    ws.addEventListener("close", () => {
      closed = true;
      if (pingTimer) clearInterval(pingTimer);
      pingTimer = null;
    });
  });

  return {
    ws,
    welcome,
    close() {
      closed = true;
      if (pingTimer) clearInterval(pingTimer);
      pingTimer = null;
      try { ws.close(1000, "r0c_cleanup"); } catch { /* cleanup */ }
    },
    get closed() { return closed; },
  };
}

const chrome = findChrome();
const profile = mkdtempSync(join(tmpdir(), "mw-r0c-entry-"));
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
let waitingPeer = null;
let fullA = null;
let fullB = null;
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

  const boot = await waitForBrowser(cdp, sessionId, `(() => {
    const p = window.__sharedYardV0PublicRoomEntry?.();
    if (document.readyState !== "complete" || document.querySelector("#enter")?.disabled !== false) return null;
    if (p?.revision !== ${JSON.stringify(WORLD_V0_PUBLIC_ROOM_ENTRY_REVISION)} || p.rooms?.length !== 3 || p.loading) return null;
    return {
      publicRoom: p,
      href: location.href,
      advancedOpen: document.querySelector("#entry-advanced")?.open,
      advancedContainsRun: document.querySelector("#entry-advanced")?.contains(document.querySelector("#run")),
      advancedContainsInspect: document.querySelector("#entry-advanced")?.contains(document.querySelector("#inspect-solo")),
      legacyEntryDisplay: getComputedStyle(document.querySelector("#boot .entry-actions")).display,
      cards: [...document.querySelectorAll(".public-room-card")].map((node) => ({ id: node.dataset.roomId, disabled: node.disabled, text: node.textContent })),
    };
  })()`, "R0c directory boot");

  assert(new URL(boot.href).searchParams.has("run") === false, `base URL unexpectedly gained room identity ${boot.href}`);
  assert(boot.publicRoom.mode === "directory" && boot.publicRoom.visible === true, `directory mode ${JSON.stringify(boot.publicRoom)}`);
  assert(JSON.stringify(boot.publicRoom.rooms.map((room) => room.id)) === JSON.stringify(WORLD_V0_PUBLIC_ROOM_IDS), `room IDs ${JSON.stringify(boot.publicRoom.rooms)}`);
  assert(boot.advancedOpen === false, "Advanced must remain closed by default");
  assert(boot.advancedContainsRun && boot.advancedContainsInspect, "raw Room ID / Inspect must remain in Advanced");
  assert(boot.legacyEntryDisplay === "none", `legacy generated-room Enter remained primary: ${boot.legacyEntryDisplay}`);
  assert(boot.cards.length === 3, `public room card count ${boot.cards.length}`);

  waitingPeer = await openDrivingPeer("R0C-Waiting", "yard-2");
  await waitForBrowser(cdp, sessionId, `(() => {
    const p = window.__sharedYardV0PublicRoomEntry?.();
    const room = p?.rooms?.find((item) => item.id === "yard-2");
    const button = document.querySelector('[data-room-id="yard-2"]');
    return room?.occupancy === 1 && room.state === "waiting" && room.joinable === true && button && !button.disabled ? { p, text: button.textContent } : null;
  })()`, "yard-2 waiting occupancy reflected in UI", 10_000);

  fullA = await openPassivePeer("R0C-Full-A", "yard-3");
  fullB = await openPassivePeer("R0C-Full-B", "yard-3");
  const full = await waitForBrowser(cdp, sessionId, `(() => {
    const p = window.__sharedYardV0PublicRoomEntry?.();
    const room = p?.rooms?.find((item) => item.id === "yard-3");
    const button = document.querySelector('[data-room-id="yard-3"]');
    return room?.occupancy === 2 && room.joinable === false && button?.disabled ? { room, text: button.textContent } : null;
  })()`, "yard-3 full state reflected in UI", 10_000);
  assert(full.room.occupancy === 2 && full.room.joinable === false, `full room contract ${JSON.stringify(full)}`);

  await cdp.evaluate(sessionId, `(() => {
    document.querySelector("#callsign").value = "R0C-Browser";
    document.querySelector('[data-room-id="yard-2"]').click();
    return true;
  })()`);

  const live = await waitForBrowser(cdp, sessionId, `(() => {
    const e = window.__sharedYardV0Evidence?.();
    if (!e) return null;
    if (e.runtimeFailed) return { failed: true, e };
    return e.runKey === "yard-2" && e.identity?.worldEpoch && String(e.networkState || "").startsWith("live") && e.lifecycleEvents?.some((event) => event.type === "world-start") ? { failed: false, e, href: location.href } : null;
  })()`, "one-click Yard 2 reaches LIVE", 12_000);

  assert(live.failed === false, `R0c runtime failure ${live.e.runtimeFailureReason}`);
  assert(new URL(live.href).searchParams.get("run") === "yard-2", `canonical Yard URL missing ${live.href}`);
  assert(live.e.publicRoomEntry?.selectedRoom === "yard-2", `selected public room evidence ${JSON.stringify(live.e.publicRoomEntry)}`);
  assert(live.e.friendEntry?.roomKey === "yard-2", `underlying Friend Entry room drift ${JSON.stringify(live.e.friendEntry)}`);
  assert(live.e.metrics?.guardMismatches === 0, `guard mismatches ${live.e.metrics?.guardMismatches}`);
  assert(live.e.metrics?.firstStateMismatch == null, `first exact-state mismatch ${JSON.stringify(live.e.metrics?.firstStateMismatch)}`);
  assert(live.e.session?.inviteUrl && new URL(live.e.session.inviteUrl).searchParams.get("run") === "yard-2", `deep-link invite drift ${live.e.session?.inviteUrl}`);

  console.log("WORLD_V0_PUBLIC_ROOM_R0C_PASS", JSON.stringify({
    revision: WORLD_V0_PUBLIC_ROOM_ENTRY_REVISION,
    rooms: WORLD_V0_PUBLIC_ROOM_IDS,
    waitingObserved: "yard-2:1/2",
    fullBlocked: "yard-3:2/2",
    selectedRoom: "yard-2",
    canonicalUrl: true,
    reachedLive: true,
    guardMismatches: live.e.metrics.guardMismatches,
    advancedFallbackPreserved: true,
  }));
} catch (error) {
  console.error("WORLD_V0_PUBLIC_ROOM_R0C_FAIL", error instanceof Error ? error.stack || error.message : String(error));
  console.error(Buffer.concat(stderr).toString("utf8").slice(-7000));
  process.exitCode = 1;
} finally {
  waitingPeer?.close();
  fullA?.close();
  fullB?.close();
  cdp?.close();
  if (child.exitCode === null) child.kill("SIGKILL");
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* cleanup */ }
}
