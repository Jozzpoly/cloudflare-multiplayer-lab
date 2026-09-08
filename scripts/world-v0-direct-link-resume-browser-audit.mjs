import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const BASE = (process.env.MW_WORLD_V0_DIRECT_RESUME_BASE || "http://127.0.0.1:8787").replace(/\/$/, "");
const PAGE_URL = `${BASE}/world-v0/`;
const ROOM_ID = process.env.MW_WORLD_V0_DIRECT_RESUME_ROOM || "yard-3";
const DIRECT_URL = `${PAGE_URL}?run=${encodeURIComponent(ROOM_ID)}`;
const OUTPUT = process.env.MW_WORLD_V0_DIRECT_RESUME_OUTPUT || "world-v0-direct-link-resume.json";
const PORTS = [9772, 9773];
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

async function startBrowser(binary, index) {
  const profile = mkdtempSync(join(tmpdir(), `mw-direct-resume-${index}-`));
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
  return { child, profile, stderr, cdp };
}

async function stopBrowser(browser) {
  if (!browser) return;
  browser.cdp?.close();
  if (browser.child?.exitCode === null) browser.child.kill("SIGKILL");
  try { rmSync(browser.profile, { recursive: true, force: true }); } catch {}
}

async function attachPage(browser, url) {
  const { targetId } = await browser.cdp.call("Target.createTarget", { url });
  const { sessionId } = await browser.cdp.call("Target.attachToTarget", { targetId, flatten: true });
  await browser.cdp.call("Runtime.enable", {}, sessionId);
  await browser.cdp.call("Page.enable", {}, sessionId);
  await browser.cdp.call("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true,
    screenWidth: 390,
    screenHeight: 844,
    screenOrientation: { type: "portraitPrimary", angle: 0 },
  }, sessionId);
  return { targetId, sessionId, url };
}

async function closePage(browser, page) {
  if (!page?.targetId) return;
  try { await browser.cdp.call("Target.closeTarget", { targetId: page.targetId }); } catch {}
  page.targetId = null;
  page.sessionId = null;
}

async function evaluate(browser, page, expression) {
  return await browser.cdp.evaluate(page.sessionId, expression);
}

async function waitFor(browser, page, expression, label, timeout = TIMEOUT_MS) {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < timeout) {
    try {
      last = await evaluate(browser, page, expression);
      if (last) return last;
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    await sleep(120);
  }
  throw new Error(`${label} timeout: ${JSON.stringify(last)}`);
}

async function bootDirectory(browser, page) {
  await waitFor(browser, page,
    `document.readyState === "complete" && document.querySelector("#enter")?.disabled === false && typeof window.__sharedYardV0PublicRoomEntry === "function"`,
    "directory boot");
  await waitFor(browser, page,
    `window.__sharedYardV0PublicRoomEntry().rooms.some((room) => room.id === ${JSON.stringify(ROOM_ID)})`,
    "room directory visible");
}

async function bootDirect(browser, page) {
  await waitFor(browser, page,
    `document.readyState === "complete" && document.querySelector("#enter")?.disabled === false && typeof window.__sharedYardV0FriendEntry === "function"`,
    "direct-link boot");
}

async function enterRoom(browser, page, name) {
  const result = await evaluate(browser, page, `(() => {
    const input = document.querySelector("#callsign");
    input.value = ${JSON.stringify(name)};
    input.dispatchEvent(new Event("input", { bubbles: true }));
    const button = document.querySelector('.public-room-card[data-room-id=${JSON.stringify(ROOM_ID)}]');
    if (!button || button.disabled) return { ok: false, text: button?.textContent || null };
    button.click();
    return { ok: true };
  })()`);
  assert(result?.ok, `room entry unavailable ${JSON.stringify(result)}`);
}

async function roomDirectory() {
  const response = await fetch(`${BASE}/api/world-v0/rooms?r=${Date.now()}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(5000),
  });
  assert(response.ok, `directory HTTP ${response.status}`);
  const value = await response.json();
  return value.rooms.find((room) => room.id === ROOM_ID);
}

const chrome = findChrome();
let ownerBrowser = null;
let peerBrowser = null;
let ownerPage = null;
let peerPage = null;
let activeProbePage = null;
let resumePage = null;
const result = {
  verdict: "WORLD_V0_DIRECT_LINK_RESUME_FAIL",
  roomId: ROOM_ID,
  directUrl: DIRECT_URL,
  generatedAt: new Date().toISOString(),
};

try {
  ownerBrowser = await startBrowser(chrome, 0);
  peerBrowser = await startBrowser(chrome, 1);
  ownerPage = await attachPage(ownerBrowser, PAGE_URL);
  peerPage = await attachPage(peerBrowser, PAGE_URL);
  await bootDirectory(ownerBrowser, ownerPage);
  await bootDirectory(peerBrowser, peerPage);

  await enterRoom(ownerBrowser, ownerPage, "Owner-A");
  await waitFor(ownerBrowser, ownerPage,
    `window.__sharedYardV0Session?.().networkState === "waiting for peer"`,
    "owner waiting");
  await enterRoom(peerBrowser, peerPage, "Peer-B");

  const live = `(() => {
    const e = window.__sharedYardV0Evidence?.();
    return e && !e.runtimeFailed && e.identity?.worldEpoch && Number.isInteger(e.localBoundaryTick) && e.localBoundaryTick >= 48 && e.metrics?.guardMismatches === 0;
  })()`;
  await waitFor(ownerBrowser, ownerPage, live, "owner live");
  await waitFor(peerBrowser, peerPage, live, "peer live");

  const ownerBefore = await evaluate(ownerBrowser, ownerPage, `window.__sharedYardV0Evidence()`);
  const peerBefore = await evaluate(peerBrowser, peerPage, `window.__sharedYardV0Evidence()`);
  const peerName = await evaluate(peerBrowser, peerPage, `document.querySelector("#callsign")?.value || null`);
  assert(ownerBefore.identity.worldEpoch === peerBefore.identity.worldEpoch, "initial WorldEpoch mismatch");
  const original = {
    worldEpoch: peerBefore.identity.worldEpoch,
    actorSessionId: peerBefore.session.actorSessionId,
    netEntityId: peerBefore.session.selfNetEntityId,
    boundary: peerBefore.localBoundaryTick,
    playerId: peerName,
  };

  // Red-team the persisted token while the original ActorSession transport is still live.
  // A second tab may know the token, but it must not be offered Resume until the seat is
  // actually represented as reserved/offline by the authority-backed directory.
  activeProbePage = await attachPage(peerBrowser, DIRECT_URL);
  await bootDirect(peerBrowser, activeProbePage);
  const activeProbe = await evaluate(peerBrowser, activeProbePage, `({
    entry: window.__sharedYardV0FriendEntry(),
    status: document.querySelector("#boot-status")?.textContent || null,
    callsign: document.querySelector("#callsign")?.value || null,
  })`);
  assert(activeProbe.entry?.directLinkResumable === false, `live ActorSession incorrectly resumable ${JSON.stringify(activeProbe)}`);
  assert(activeProbe.entry?.enterLabel === "Enter world", `live ActorSession direct-link label ${activeProbe.entry?.enterLabel}`);
  const peerDuringProbe = await evaluate(peerBrowser, peerPage, `window.__sharedYardV0Evidence()`);
  assert(peerDuringProbe.identity?.worldEpoch === original.worldEpoch, "active probe rotated WorldEpoch");
  assert(peerDuringProbe.session?.actorSessionId === original.actorSessionId, "active probe stole ActorSession");
  assert(!String(peerDuringProbe.networkState || "").startsWith("closed"), `active probe closed original peer ${peerDuringProbe.networkState}`);
  await closePage(peerBrowser, activeProbePage);
  activeProbePage = null;

  // Now reproduce the actual Owner flow: close the live tab, then reopen the exact
  // same public Yard URL in the same browser profile.
  await closePage(peerBrowser, peerPage);
  peerPage = null;

  const reservedStarted = Date.now();
  let reservedRoom = null;
  while (Date.now() - reservedStarted < 8000) {
    reservedRoom = await roomDirectory();
    if (reservedRoom?.occupancy === 2 && reservedRoom?.connected === 1 && reservedRoom?.reserved === 1 && reservedRoom?.state === "live-reserved") break;
    await sleep(150);
  }
  assert(reservedRoom?.occupancy === 2 && reservedRoom?.connected === 1 && reservedRoom?.reserved === 1, `reserved directory mismatch ${JSON.stringify(reservedRoom)}`);

  const ownerBoundaryAfterClose = ownerBefore.localBoundaryTick + 12;
  await waitFor(ownerBrowser, ownerPage, `(() => {
    const e = window.__sharedYardV0Evidence?.();
    return e && !e.runtimeFailed && e.identity?.worldEpoch === ${JSON.stringify(original.worldEpoch)} && e.localBoundaryTick >= ${ownerBoundaryAfterClose};
  })()`, "owner remains live after peer tab close");

  resumePage = await attachPage(peerBrowser, DIRECT_URL);
  await bootDirect(peerBrowser, resumePage);
  const directResume = await evaluate(peerBrowser, resumePage, `({
    entry: window.__sharedYardV0FriendEntry(),
    status: document.querySelector("#boot-status")?.textContent || null,
    callsign: document.querySelector("#callsign")?.value || null,
  })`);
  assert(directResume.entry?.directLinkResumable === true, `reserved direct link not resumable ${JSON.stringify(directResume)}`);
  assert(directResume.entry?.enterLabel === "Resume world", `reserved direct-link label ${directResume.entry?.enterLabel}`);
  assert(directResume.callsign === original.playerId, `reserved direct-link callsign ${directResume.callsign} != ${original.playerId}`);

  await evaluate(peerBrowser, resumePage, `document.querySelector("#enter").click()`);
  await waitFor(peerBrowser, resumePage, `(() => {
    const e = window.__sharedYardV0Evidence?.();
    return e && !e.runtimeFailed && e.identity?.worldEpoch === ${JSON.stringify(original.worldEpoch)} &&
      e.session?.actorSessionId === ${JSON.stringify(original.actorSessionId)} &&
      e.session?.selfNetEntityId === ${JSON.stringify(original.netEntityId)} &&
      Number.isInteger(e.localBoundaryTick) && e.localBoundaryTick > ${original.boundary};
  })()`, "same ActorSession resumed from direct Yard link");

  const peerAfter = await evaluate(peerBrowser, resumePage, `window.__sharedYardV0Evidence()`);
  const ownerAfter = await evaluate(ownerBrowser, ownerPage, `window.__sharedYardV0Evidence()`);
  const restoredRoom = await roomDirectory();
  assert(peerAfter.metrics.guardMismatches === 0, `peer guard mismatch ${peerAfter.metrics.guardMismatches}`);
  assert(ownerAfter.metrics.guardMismatches === 0, `owner guard mismatch ${ownerAfter.metrics.guardMismatches}`);
  assert(ownerAfter.identity.worldEpoch === original.worldEpoch, "owner WorldEpoch rotated during direct resume");
  assert(ownerAfter.localBoundaryTick > ownerBoundaryAfterClose, "owner progression stopped during direct resume");
  assert(restoredRoom?.occupancy === 2 && restoredRoom?.connected === 2 && restoredRoom?.reserved === 0 && restoredRoom?.state === "live", `restored directory mismatch ${JSON.stringify(restoredRoom)}`);
  assert(peerAfter.lifecycleEvents.some((event) => event.type === "cross-page-resume-intent"), "direct resume intent lifecycle missing");
  assert(peerAfter.lifecycleEvents.some((event) => event.type === "actor-resume-complete" && event.bootstrapFromAuthority === true), "direct authority bootstrap lifecycle missing");

  Object.assign(result, {
    verdict: "WORLD_V0_DIRECT_LINK_RESUME_PASS",
    original,
    activeProbe,
    reservedRoom,
    directResume,
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
  console.log("WORLD_V0_DIRECT_LINK_RESUME_PASS", JSON.stringify({
    roomId: ROOM_ID,
    worldEpoch: original.worldEpoch,
    actorSessionId: original.actorSessionId,
  }));
} catch (error) {
  result.error = error instanceof Error ? error.stack || error.message : String(error);
  result.ownerStderr = ownerBrowser ? Buffer.concat(ownerBrowser.stderr).toString("utf8").slice(-5000) : null;
  result.peerStderr = peerBrowser ? Buffer.concat(peerBrowser.stderr).toString("utf8").slice(-5000) : null;
  writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
  throw error;
} finally {
  await closePage(peerBrowser, resumePage);
  await closePage(peerBrowser, activeProbePage);
  await closePage(peerBrowser, peerPage);
  await closePage(ownerBrowser, ownerPage);
  await stopBrowser(peerBrowser);
  await stopBrowser(ownerBrowser);
}
