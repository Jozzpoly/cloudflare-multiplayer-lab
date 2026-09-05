import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { WORLD_V0_BROWSER_UI_REVISION } from "../public/world-v0/build-contract.js";
import { WORLD_V0_FRIEND_ENTRY_REVISION } from "../public/world-v0/friend-entry.js";
import { WORLD_V0_PUBLIC_ROOM_ENTRY_REVISION } from "../public/world-v0/public-room-entry.js";

const BASE = (process.env.MW_WORLD_V0_SHELL_BASE_URL || "http://127.0.0.1:8787").replace(/\/$/, "");
const PAGE_URL = `${BASE}/world-v0/`;
const DEBUG_PORT = 9444;
const TIMEOUT_MS = 30_000;
const OUTPUT = process.env.MW_WORLD_V0_SHELL_OUTPUT || "world-v0-runtime-shell-evidence.json";

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

async function waitFor(cdp, sessionId, expression, label) {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < TIMEOUT_MS) {
    try {
      last = await cdp.evaluate(sessionId, expression);
      if (last) return last;
    } catch (error) { last = error instanceof Error ? error.message : String(error); }
    await sleep(120);
  }
  throw new Error(`${label} timeout · last=${JSON.stringify(last)}`);
}

async function setViewport(cdp, sessionId, { width, height, deviceScaleFactor, mobile }) {
  await cdp.call("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor,
    mobile,
    screenWidth: width,
    screenHeight: height,
    screenOrientation: mobile ? { type: "portraitPrimary", angle: 0 } : { type: "landscapePrimary", angle: 90 },
  }, sessionId);
  await sleep(250);
}

async function screenshot(cdp, sessionId, filename) {
  const shot = await cdp.call("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false }, sessionId);
  const bytes = Buffer.from(shot.data || "", "base64");
  assert(bytes.length > 12_000, `${filename}: screenshot suspiciously small (${bytes.length})`);
  writeFileSync(filename, bytes);
  return { filename, bytes: bytes.length };
}

function assertRect(rect, width, height, label) {
  assert(rect && [rect.left, rect.right, rect.top, rect.bottom].every(Number.isFinite), `${label} rect missing ${JSON.stringify(rect)}`);
  assert(rect.left >= -0.5 && rect.right <= width + 0.5, `${label} clipped horizontally ${JSON.stringify(rect)}`);
  assert(rect.top >= -0.5 && rect.bottom <= height + 0.5, `${label} clipped vertically ${JSON.stringify(rect)}`);
}

const chrome = findChrome();
const profile = mkdtempSync(join(tmpdir(), "mw-friend-ready-shell-"));
const stderr = [];
const child = spawn(chrome, [
  "--headless=new",
  "--no-sandbox",
  "--disable-dev-shm-usage",
  "--disable-background-networking",
  "--disable-background-timer-throttling",
  "--disable-backgrounding-occluded-windows",
  "--disable-renderer-backgrounding",
  "--enable-unsafe-swiftshader",
  `--remote-debugging-port=${DEBUG_PORT}`,
  "--remote-debugging-address=127.0.0.1",
  `--user-data-dir=${profile}`,
  "about:blank",
], { stdio: ["ignore", "ignore", "pipe"] });
child.stderr.on("data", (chunk) => stderr.push(chunk));

let cdp = null;
const evidence = {
  verdict: "WORLD_V0_FRIEND_READY_SHELL_FAIL",
  generatedAt: new Date().toISOString(),
  page: PAGE_URL,
  uiRevision: WORLD_V0_BROWSER_UI_REVISION,
  friendEntryRevision: WORLD_V0_FRIEND_ENTRY_REVISION,
  claimBoundary: "Public-Room R0c entry/session shell only; shared-world correctness is covered by dedicated public-room, lifecycle and exact-state falsifiers",
  publicRoomEntryRevision: WORLD_V0_PUBLIC_ROOM_ENTRY_REVISION,
};

try {
  const debuggerInfo = await waitForDebugger();
  cdp = new Cdp(debuggerInfo.webSocketDebuggerUrl);
  await cdp.opened;
  const { targetId } = await cdp.call("Target.createTarget", { url: PAGE_URL });
  const { sessionId } = await cdp.call("Target.attachToTarget", { targetId, flatten: true });
  await cdp.call("Runtime.enable", {}, sessionId);
  await cdp.call("Page.enable", {}, sessionId);
  await setViewport(cdp, sessionId, { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

  await waitFor(cdp, sessionId, `(() => { const p=window.__sharedYardV0PublicRoomEntry?.(); return document.readyState === "complete" && document.querySelector("#enter")?.disabled === false && typeof window.__sharedYardV0FriendEntry === "function" && p?.revision === "world-v0-public-room-entry-r0c-v1" && p?.rooms?.length === 3 && p.loading === false; })()`, "Public Room desktop boot");

  const desktopBoot = await cdp.evaluate(sessionId, `(() => {
    const rect = (selector) => { const r = document.querySelector(selector)?.getBoundingClientRect(); return r ? {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height} : null; };
    return {
      heading: document.querySelector("#boot h1")?.textContent,
      status: document.querySelector("#boot-status")?.textContent,
      enter: document.querySelector("#enter")?.textContent,
      advancedOpen: document.querySelector("#entry-advanced")?.open,
      inspectInsideAdvanced: document.querySelector("#entry-advanced")?.contains(document.querySelector("#inspect-solo")),
      roomKey: document.querySelector("#run")?.value,
      diagnosticsOpen: document.querySelector("#hud")?.open,
      publicRoom: window.__sharedYardV0PublicRoomEntry?.(),
      legacyEntryDisplay: getComputedStyle(document.querySelector("#boot .entry-actions")).display,
      boot: rect("#boot"),
      name: rect("#callsign"),
      firstYard: rect('[data-room-id="yard-1"]'),
    };
  })()`);
  assert(desktopBoot.heading === "Enter Multi_World", `desktop heading drift ${desktopBoot.heading}`);
  assert(desktopBoot.status.includes("Choose a shared Yard"), `desktop public-room status drift ${desktopBoot.status}`);
  assert(desktopBoot.enter === "Enter world", `advanced compatibility action drift ${desktopBoot.enter}`);
  assert(desktopBoot.advancedOpen === false, "advanced/inspection should be closed by default");
  assert(desktopBoot.inspectInsideAdvanced === true, "Inspect solo escaped advanced entry surface");
  assert(/^yard-[A-Za-z0-9_-]{14}$/.test(desktopBoot.roomKey), `strong generated-room fallback missing ${desktopBoot.roomKey}`);
  assert(desktopBoot.publicRoom?.revision === WORLD_V0_PUBLIC_ROOM_ENTRY_REVISION, `public room revision drift ${JSON.stringify(desktopBoot.publicRoom)}`);
  assert(desktopBoot.publicRoom?.mode === "directory" && desktopBoot.publicRoom?.visible === true && desktopBoot.publicRoom?.rooms?.length === 3, `public room directory shell drift ${JSON.stringify(desktopBoot.publicRoom)}`);
  assert(desktopBoot.legacyEntryDisplay === "none", `legacy generated-room action remained primary ${desktopBoot.legacyEntryDisplay}`);
  assert(desktopBoot.diagnosticsOpen === false, "diagnostics should be collapsed by default");
  assertRect(desktopBoot.boot, 1440, 900, "desktop boot");
  assertRect(desktopBoot.name, 1440, 900, "desktop name input");
  assertRect(desktopBoot.firstYard, 1440, 900, "desktop first Yard action");
  const screenshots = { desktopBoot: await screenshot(cdp, sessionId, "world-v0-runtime-shell-desktop-boot.png") };

  const suffix = Date.now().toString(36).slice(-7);
  const selectedRoom = await cdp.evaluate(sessionId, `(() => {
    const callsign = document.querySelector("#callsign");
    callsign.value = ${JSON.stringify(`shell-${suffix}`)};
    callsign.dispatchEvent(new Event("input", { bubbles: true }));
    const snapshot = window.__sharedYardV0PublicRoomEntry?.();
    const room = snapshot?.rooms?.find((item) => item.occupancy === 0 && item.joinable === true);
    if (!room) return null;
    document.querySelector('[data-room-id="' + room.id + '"]')?.click();
    return room.id;
  })()`);
  assert(selectedRoom, "no empty shared Yard available for shell entry");
  await waitFor(cdp, sessionId, `window.__sharedYardV0Session?.().networkState === "waiting for peer" && document.querySelector("#boot")?.classList.contains("compact") === true`, "Friend-Ready waiting shell");

  const desktopWaiting = await cdp.evaluate(sessionId, `({
    heading: document.querySelector("#boot h1")?.textContent,
    status: document.querySelector("#boot-status")?.textContent,
    compact: document.querySelector("#boot")?.classList.contains("compact"),
    inputsDisplay: getComputedStyle(document.querySelector(".inputs")).display,
    inviteVisible: !document.querySelector("#copy-invite")?.classList.contains("hidden"),
    inviteText: document.querySelector("#copy-invite")?.textContent,
    inviteUrl: window.__sharedYardV0Session?.().inviteUrl,
    uiRevision: window.__sharedYardV0Evidence?.().uiRevision,
    friendEntry: window.__sharedYardV0FriendEntry?.(),
    publicRoomEntry: window.__sharedYardV0PublicRoomEntry?.(),
  })`);
  assert(desktopWaiting.heading === "Shared Yard", `compact heading drift ${desktopWaiting.heading}`);
  assert(desktopWaiting.status.includes("Waiting in this Yard"), `compact public-room status drift ${desktopWaiting.status}`);
  assert(desktopWaiting.compact === true && desktopWaiting.inputsDisplay === "none", `compact entry shell failed ${JSON.stringify(desktopWaiting)}`);
  assert(desktopWaiting.inviteVisible === true && desktopWaiting.inviteText === "Invite friend", `invite action unavailable ${JSON.stringify(desktopWaiting)}`);
  assert(desktopWaiting.uiRevision === WORLD_V0_BROWSER_UI_REVISION, `UI revision drift ${desktopWaiting.uiRevision}`);
  assert(desktopWaiting.friendEntry?.mode === "host" && desktopWaiting.friendEntry?.roomKey === selectedRoom, `friend entry room drift ${JSON.stringify(desktopWaiting.friendEntry)}`);
  assert(desktopWaiting.publicRoomEntry?.selectedRoom === selectedRoom, `public-room selection drift ${JSON.stringify(desktopWaiting.publicRoomEntry)}`);
  assert(new URL(desktopWaiting.inviteUrl).searchParams.get("run") === selectedRoom, `invite URL room drift ${desktopWaiting.inviteUrl}`);
  screenshots.desktopWaiting = await screenshot(cdp, sessionId, "world-v0-runtime-shell-desktop-waiting.png");

  await setViewport(cdp, sessionId, { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await waitFor(cdp, sessionId, `innerWidth === 390 && document.querySelector("#boot")?.classList.contains("compact") === true`, "Friend-Ready portrait shell");
  const mobile = await cdp.evaluate(sessionId, `(() => {
    const rect = (selector) => { const r = document.querySelector(selector)?.getBoundingClientRect(); return r ? {left:r.left,right:r.right,top:r.top,bottom:r.bottom} : null; };
    return {
      boot: rect("#boot"),
      hud: rect("#hud"),
      sessionActions: rect("#session-actions"),
      joystick: rect("#joystick"),
      gimbal: rect("#camera-gimbal"),
      diagnosticsOpen: document.querySelector("#hud")?.open,
      inviteText: document.querySelector("#copy-invite")?.textContent,
    };
  })()`);
  for (const [name, rect] of Object.entries({ boot: mobile.boot, hud: mobile.hud, sessionActions: mobile.sessionActions, joystick: mobile.joystick, gimbal: mobile.gimbal })) {
    assertRect(rect, 390, 844, `portrait ${name}`);
  }
  assert(mobile.diagnosticsOpen === false, "portrait diagnostics should remain collapsed");
  assert(mobile.inviteText === "Invite friend", `portrait invite label drift ${mobile.inviteText}`);
  screenshots.mobileWaiting = await screenshot(cdp, sessionId, "world-v0-runtime-shell-mobile-waiting.png");

  await cdp.evaluate(sessionId, `document.querySelector("#hud").open = true; true`);
  await sleep(180);
  const mobileDiagnostics = await cdp.evaluate(sessionId, `(() => { const r=document.querySelector("#hud").getBoundingClientRect(); return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,open:document.querySelector("#hud").open}; })()`);
  assertRect(mobileDiagnostics, 390, 844, "portrait diagnostics open");
  assert(mobileDiagnostics.open === true, "portrait diagnostics did not open");
  screenshots.mobileDiagnostics = await screenshot(cdp, sessionId, "world-v0-runtime-shell-mobile-diagnostics.png");

  evidence.verdict = "WORLD_V0_FRIEND_READY_SHELL_PASS";
  evidence.desktopBoot = desktopBoot;
  evidence.desktopWaiting = desktopWaiting;
  evidence.mobile = mobile;
  evidence.mobileDiagnostics = mobileDiagnostics;
  evidence.screenshots = screenshots;
  writeFileSync(OUTPUT, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(`${evidence.verdict} · ui=${WORLD_V0_BROWSER_UI_REVISION} · friend-entry=${WORLD_V0_FRIEND_ENTRY_REVISION}`);
} catch (error) {
  evidence.error = error instanceof Error ? error.stack || error.message : String(error);
  evidence.stderrTail = Buffer.concat(stderr).toString("utf8").slice(-8000);
  writeFileSync(OUTPUT, `${JSON.stringify(evidence, null, 2)}\n`);
  throw error;
} finally {
  cdp?.close();
  if (child.exitCode === null) child.kill("SIGKILL");
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* cleanup */ }
}
