import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const BASE = (process.env.MW_WORLD_V0_CROSS_PAGE_BASE || "http://127.0.0.1:8787").replace(/\/$/, "");
const PAGE_URL = `${BASE}/world-v0/`;
const ROOM_ID = process.env.MW_WORLD_V0_CROSS_PAGE_ROOM || "yard-3";
const OUTPUT = process.env.MW_WORLD_V0_CROSS_PAGE_OUTPUT || "world-v0-cross-page-resume.json";
const PORTS = [9672, 9673];
const TIMEOUT_MS = 45_000;

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function assert(value, message) { if (!value) throw new Error(message); }

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
      if (message.error) waiter.reject(new Error(`${waiter.method}: ${message.error.message}`));
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
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || "browser evaluation failed");
    return result.result?.value;
  }
  close() { try { this.ws.close(); } catch {} }
}

async function waitDebugger(port) {
  const started = Date.now();
  while (Date.now() - started < TIMEOUT_MS) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(1200) });
      if (response.ok) {
        const value = await response.json();
        if (value.webSocketDebuggerUrl) return value;
      }
    } catch {}
    await sleep(100);
  }
  throw new Error(`debugger ${port} unavailable`);
}

async function attachPage(client, url) {
  const { targetId } = await client.cdp.call("Target.createTarget", { url });
  const { sessionId } = await client.cdp.call("Target.attachToTarget", { targetId, flatten: true });
  await client.cdp.call("Runtime.enable", {}, sessionId);
  await client.cdp.call("Page.enable", {}, sessionId);
  await client.cdp.call("Emulation.setDeviceMetricsOverride", {
    width: 390, height: 844, deviceScaleFactor: 2, mobile: true,
    screenWidth: 390, screenHeight: 844,
    screenOrientation: { type: "portraitPrimary", angle: 0 },
  }, sessionId);
  client.targetId = targetId;
  client.sessionId = sessionId;
}

async function startBrowser(binary, index) {
  const profile = mkdtempSync(join(tmpdir(), `mw-cross-page-${index}-`));
  const child = spawn(binary, [
    "--headless=new", "--no-sandbox", "--disable-dev-shm-usage",
    "--disable-background-networking", "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding",
    "--use-gl=angle", "--use-angle=swiftshader-webgl", "--enable-unsafe-swiftshader",
    `--remote-debugging-port=${PORTS[index]}`, "--remote-debugging-address=127.0.0.1",
    `--user-data-dir=${profile}`, "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"] });
  const stderr = [];
  child.stderr.on("data", (chunk) => stderr.push(chunk));
  const debuggerInfo = await waitDebugger(PORTS[index]);
  const cdp = new Cdp(debuggerInfo.webSocketDebuggerUrl);
  await cdp.opened;
  const client = { child, profile, stderr, cdp, targetId: null, sessionId: null };
  await attachPage(client, PAGE_URL);
  return client;
}

async function stopBrowser(client) {
  if (!client) return;
  client.cdp?.close();
  if (client.child?.exitCode === null) client.child.kill("SIGKILL");
  try { rmSync(client.profile, { recursive: true, force: true }); } catch {}
}

async function evaluate(client, expression) { return await client.cdp.evaluate(client.sessionId, expression); }
async function waitFor(client, expression, label, timeout = TIMEOUT_MS) {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < timeout) {
    try {
      last = await evaluate(client, expression);
      if (last) return last;
    } catch (error) { last = error instanceof Error ? error.message : String(error); }
    await sleep(120);
  }
  throw new Error(`${label} timeout: ${JSON.stringify(last)}`);
}

async function roomDirectory() {
  const response = await fetch(`${BASE}/api/world-v0/rooms?r=${Date.now()}`, { cache: "no-store", signal: AbortSignal.timeout(5000) });
  assert(response.ok, `directory HTTP ${response.status}`);
  const value = await response.json();
  return value.rooms.find((room) => room.id === ROOM_ID);
}

async function boot(client) {
  await waitFor(client, `document.readyState === "complete" && document.querySelector("#enter")?.disabled === false && typeof window.__sharedYardV0PublicRoomEntry === "function"`, "browser boot");
  await waitFor(client, `window.__sharedYardV0PublicRoomEntry().rooms.some((room) => room.id === ${JSON.stringify(ROOM_ID)})`, "room directory visible");
}

async function enterRoom(client, name) {
  await evaluate(client, `(() => {
    const input = document.querySelector("#callsign");
    input.value = ${JSON.stringify(name)};
    input.dispatchEvent(new Event("input", { bubbles: true }));
    const button = document.querySelector('.public-room-card[data-room-id=${JSON.stringify(ROOM_ID)}]');
    if (!button || button.disabled) return { ok: false, text: button?.textContent || null };
    button.click();
    return { ok: true };
  })()`);
}

const chrome = findChrome();
let owner = null;
let peer = null;
const result = { verdict: "WORLD_V0_CROSS_PAGE_RESUME_FAIL", roomId: ROOM_ID, generatedAt: new Date().toISOString() };

try {
  owner = await startBrowser(chrome, 0);
  peer = await startBrowser(chrome, 1);
  await boot(owner);
  await boot(peer);

  await enterRoom(owner, "Owner-A");
  await waitFor(owner, `window.__sharedYardV0Session?.().networkState === "waiting for peer"`, "owner waiting");
  await enterRoom(peer, "Peer-B");

  const live = `(() => {
    const e = window.__sharedYardV0Evidence?.();
    return e && !e.runtimeFailed && e.identity?.worldEpoch && Number.isInteger(e.localBoundaryTick) && e.localBoundaryTick >= 48 && e.metrics?.guardMismatches === 0;
  })()`;
  await waitFor(owner, live, "owner live");
  await waitFor(peer, live, "peer live");

  const ownerBefore = await evaluate(owner, `window.__sharedYardV0Evidence()`);
  const peerBefore = await evaluate(peer, `window.__sharedYardV0Evidence()`);
  assert(ownerBefore.identity.worldEpoch === peerBefore.identity.worldEpoch, "initial WorldEpoch mismatch");
  const original = {
    worldEpoch: peerBefore.identity.worldEpoch,
    actorSessionId: peerBefore.session.actorSessionId,
    netEntityId: peerBefore.session.selfNetEntityId,
    boundary: peerBefore.localBoundaryTick,
  };

  await peer.cdp.call("Target.closeTarget", { targetId: peer.targetId });
  peer.targetId = null;
  peer.sessionId = null;

  const reservedStarted = Date.now();
  let reservedRoom = null;
  while (Date.now() - reservedStarted < 8000) {
    reservedRoom = await roomDirectory();
    if (reservedRoom?.occupancy === 2 && reservedRoom?.connected === 1 && reservedRoom?.reserved === 1 && reservedRoom?.state === "live-reserved") break;
    await sleep(150);
  }
  assert(reservedRoom?.occupancy === 2 && reservedRoom?.connected === 1 && reservedRoom?.reserved === 1, `reserved directory mismatch ${JSON.stringify(reservedRoom)}`);

  const ownerBoundaryAfterCloseTarget = original.boundary + 12;
  await waitFor(owner, `(() => {
    const e = window.__sharedYardV0Evidence?.();
    return e && !e.runtimeFailed && e.identity?.worldEpoch === ${JSON.stringify(original.worldEpoch)} && e.localBoundaryTick >= ${ownerBoundaryAfterCloseTarget};
  })()`, "owner stays live after peer page close");

  await attachPage(peer, PAGE_URL);
  await boot(peer);
  const resumeCard = await waitFor(peer, `(() => {
    const entry = window.__sharedYardV0PublicRoomEntry?.();
    const room = entry?.rooms?.find((candidate) => candidate.id === ${JSON.stringify(ROOM_ID)});
    const button = document.querySelector('.public-room-card[data-room-id=${JSON.stringify(ROOM_ID)}]');
    if (!room || !button) return false;
    return room.resumableHere && !button.disabled && /Resume/.test(button.textContent || "") ? {
      room, text: button.textContent, callsign: document.querySelector("#callsign")?.value || null,
    } : false;
  })()`, "resume card available");
  assert(resumeCard.room.connected === 1 && resumeCard.room.reserved === 1, `resume room presence ${JSON.stringify(resumeCard.room)}`);

  await evaluate(peer, `document.querySelector('.public-room-card[data-room-id=${JSON.stringify(ROOM_ID)}]').click()`);
  await waitFor(peer, `(() => {
    const e = window.__sharedYardV0Evidence?.();
    return e && !e.runtimeFailed && e.identity?.worldEpoch === ${JSON.stringify(original.worldEpoch)} &&
      e.session?.actorSessionId === ${JSON.stringify(original.actorSessionId)} &&
      e.session?.selfNetEntityId === ${JSON.stringify(original.netEntityId)} &&
      Number.isInteger(e.localBoundaryTick) && e.localBoundaryTick > ${original.boundary};
  })()`, "same ActorSession resumed from reopened page");

  const peerAfter = await evaluate(peer, `window.__sharedYardV0Evidence()`);
  const ownerAfter = await evaluate(owner, `window.__sharedYardV0Evidence()`);
  const restoredRoom = await roomDirectory();
  assert(peerAfter.metrics.guardMismatches === 0, `peer guard mismatch ${peerAfter.metrics.guardMismatches}`);
  assert(ownerAfter.metrics.guardMismatches === 0, `owner guard mismatch ${ownerAfter.metrics.guardMismatches}`);
  assert(ownerAfter.identity.worldEpoch === original.worldEpoch, "owner WorldEpoch rotated");
  assert(ownerAfter.localBoundaryTick > ownerBoundaryAfterCloseTarget, "owner progression stopped");
  assert(restoredRoom?.occupancy === 2 && restoredRoom?.connected === 2 && restoredRoom?.reserved === 0 && restoredRoom?.state === "live", `restored directory mismatch ${JSON.stringify(restoredRoom)}`);
  assert(peerAfter.lifecycleEvents.some((event) => event.type === "cross-page-resume-intent"), "cross-page resume intent lifecycle missing");
  assert(peerAfter.lifecycleEvents.some((event) => event.type === "actor-resume-complete" && event.bootstrapFromAuthority === true), "authority bootstrap resume lifecycle missing");

  Object.assign(result, {
    verdict: "WORLD_V0_CROSS_PAGE_RESUME_PASS",
    original,
    reservedRoom,
    resumeCard,
    restoredRoom,
    peerAfter: {
      worldEpoch: peerAfter.identity.worldEpoch,
      actorSessionId: peerAfter.session.actorSessionId,
      netEntityId: peerAfter.session.selfNetEntityId,
      boundary: peerAfter.localBoundaryTick,
      guardMismatches: peerAfter.metrics.guardMismatches,
    },
    ownerAfter: {
      worldEpoch: ownerAfter.identity.worldEpoch,
      boundary: ownerAfter.localBoundaryTick,
      guardMismatches: ownerAfter.metrics.guardMismatches,
    },
  });
  writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
  console.log("WORLD_V0_CROSS_PAGE_RESUME_PASS", JSON.stringify({ roomId: ROOM_ID, worldEpoch: original.worldEpoch, actorSessionId: original.actorSessionId }));
} catch (error) {
  result.error = error instanceof Error ? error.stack || error.message : String(error);
  writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
  throw error;
} finally {
  await stopBrowser(peer);
  await stopBrowser(owner);
}
