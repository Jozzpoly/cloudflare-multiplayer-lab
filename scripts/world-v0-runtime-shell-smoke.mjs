import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const BASE = (process.env.MW_WORLD_V0_SHELL_BASE_URL || "http://127.0.0.1:8787").replace(/\/$/, "");
const PAGE_URL = `${BASE}/world-v0/`;
const DEBUG_PORT = 9444;
const TIMEOUT_MS = 25_000;
const OUTPUT = process.env.MW_WORLD_V0_SHELL_OUTPUT || "world-v0-runtime-shell-evidence.json";

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function assert(condition, message) { if (!condition) throw new Error(message); }

function findChrome() {
  const override = process.env.CHROME_BIN?.trim();
  if (override) return override;
  const probe = spawnSync("bash", ["-lc", "command -v google-chrome || command -v google-chrome-stable || command -v chromium || command -v chromium-browser"], { encoding: "utf8" });
  const binary = probe.stdout.trim().split("\n")[0];
  if (!binary) throw new Error(`Chrome/Chromium binary not found: ${probe.stderr || "no candidate on PATH"}`);
  return binary;
}

function chromeVersion(binary) {
  const result = spawnSync(binary, ["--version"], { encoding: "utf8" });
  return (result.stdout || result.stderr || "unknown").trim();
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
  throw new Error(`Chrome DevTools endpoint unavailable: ${last}`);
}

class Cdp {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.nextId = 1;
    this.pending = new Map();
    this.opened = new Promise((resolve, reject) => {
      this.ws.addEventListener("open", resolve, { once: true });
      this.ws.addEventListener("error", () => reject(new Error("CDP WebSocket open failed")), { once: true });
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
      const message = { id, method, params };
      if (sessionId) message.sessionId = sessionId;
      this.ws.send(JSON.stringify(message));
    });
  }
  async evaluate(sessionId, expression) {
    const result = await this.call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, userGesture: true }, sessionId);
    if (result.exceptionDetails) throw new Error(`Browser evaluation failed: ${result.exceptionDetails.text || "unknown exception"}`);
    return result.result?.value;
  }
  close() { try { this.ws.close(); } catch { /* best effort */ } }
}

async function waitFor(cdp, sessionId, expression, label) {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < TIMEOUT_MS) {
    try {
      last = await cdp.evaluate(sessionId, expression);
      if (last === true) return;
    } catch (error) { last = error instanceof Error ? error.message : String(error); }
    await sleep(120);
  }
  throw new Error(`${label} timeout · last=${JSON.stringify(last)}`);
}

async function setViewport(cdp, sessionId, { width, height, deviceScaleFactor, mobile }) {
  await cdp.call("Emulation.setDeviceMetricsOverride", {
    width, height, deviceScaleFactor, mobile,
    screenWidth: width, screenHeight: height,
    screenOrientation: mobile ? { type: "portraitPrimary", angle: 0 } : { type: "landscapePrimary", angle: 90 },
  }, sessionId);
  await sleep(300);
}

async function screenshot(cdp, sessionId, filename) {
  const result = await cdp.call("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false }, sessionId);
  const bytes = Buffer.from(result.data || "", "base64");
  assert(bytes.length > 15_000, `${filename}: screenshot suspiciously small (${bytes.length} bytes)`);
  writeFileSync(filename, bytes);
  return { filename, bytes: bytes.length };
}

function assertRectInViewport(rect, width, height, name) {
  assert(rect.left >= 0 && rect.right <= width, `${name} clipped horizontally ${JSON.stringify(rect)}`);
  assert(rect.top >= 0 && rect.bottom <= height, `${name} clipped vertically ${JSON.stringify(rect)}`);
}

const chrome = findChrome();
const version = chromeVersion(chrome);
const profile = mkdtempSync(join(tmpdir(), "mw-world-v0-runtime-shell-"));
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
const evidence = { verdict: "WORLD_V0_RUNTIME_SHELL_RENDER_FAIL", generatedAt: new Date().toISOString(), page: PAGE_URL, chromeVersion: version };
try {
  const debuggerInfo = await waitForDebugger();
  cdp = new Cdp(debuggerInfo.webSocketDebuggerUrl);
  await cdp.opened;
  const { targetId } = await cdp.call("Target.createTarget", { url: PAGE_URL });
  const { sessionId } = await cdp.call("Target.attachToTarget", { targetId, flatten: true });
  await cdp.call("Runtime.enable", {}, sessionId);
  await cdp.call("Page.enable", {}, sessionId);

  await setViewport(cdp, sessionId, { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await waitFor(cdp, sessionId, `document.readyState === "complete" && document.querySelector("#enter")?.disabled === false && document.querySelector("#hud") instanceof HTMLDetailsElement`, "Shared Yard shell boot");
  const desktopBoot = await cdp.evaluate(sessionId, `({
    heading: document.querySelector("#boot h1")?.textContent,
    status: document.querySelector("#boot-status")?.textContent,
    diagnosticsOpen: document.querySelector("#hud")?.open,
    hudTag: document.querySelector("#hud")?.tagName,
    canvas: { width: document.querySelector("canvas")?.width || 0, height: document.querySelector("canvas")?.height || 0 },
  })`);
  assert(desktopBoot.heading === "Enter the yard", `shell heading drift ${desktopBoot.heading}`);
  assert(desktopBoot.diagnosticsOpen === false, "diagnostics should be collapsed by default");
  assert(desktopBoot.hudTag === "DETAILS", `diagnostics shell drift ${desktopBoot.hudTag}`);
  const screenshots = { desktopBoot: await screenshot(cdp, sessionId, "world-v0-runtime-shell-desktop-boot.png") };

  const suffix = Date.now().toString(36).slice(-7);
  await cdp.evaluate(sessionId, `(() => {
    const callsign = document.querySelector("#callsign");
    const run = document.querySelector("#run");
    callsign.value = "shell-${suffix}";
    run.value = "shell-${suffix}";
    callsign.dispatchEvent(new Event("input", { bubbles: true }));
    run.dispatchEvent(new Event("input", { bubbles: true }));
    document.querySelector("#enter").click();
    return true;
  })()`);
  await waitFor(cdp, sessionId, `document.querySelector("#boot")?.classList.contains("compact") === true`, "Shared Yard compact shell");
  await waitFor(cdp, sessionId, `document.querySelector("#m-net")?.textContent.includes("waiting for peer") === true || document.querySelector("#m-net")?.textContent.includes("peer joined") === true`, "Shared Yard one-player waiting state");
  const desktopWaiting = await cdp.evaluate(sessionId, `({
    compact: document.querySelector("#boot")?.classList.contains("compact"),
    inputsDisplay: getComputedStyle(document.querySelector(".inputs")).display,
    diagnosticsOpen: document.querySelector("#hud")?.open,
    network: document.querySelector("#m-net")?.textContent,
    uiRevision: window.__sharedYardV0Evidence?.().uiRevision,
  })`);
  assert(desktopWaiting.compact === true && desktopWaiting.inputsDisplay === "none", `desktop compact contract failed ${JSON.stringify(desktopWaiting)}`);
  assert(desktopWaiting.diagnosticsOpen === false, "diagnostics opened unexpectedly after entering");
  assert(desktopWaiting.uiRevision === "shared-yard-v0-browser-ui-v2-shell", `UI revision drift ${desktopWaiting.uiRevision}`);
  screenshots.desktopWaiting = await screenshot(cdp, sessionId, "world-v0-runtime-shell-desktop-waiting.png");

  await setViewport(cdp, sessionId, { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await waitFor(cdp, sessionId, `innerWidth === 390 && document.querySelector("#boot")?.classList.contains("compact") === true`, "Shared Yard mobile compact shell");
  const mobile = await cdp.evaluate(sessionId, `({
    width: innerWidth,
    height: innerHeight,
    boot: (() => { const r=document.querySelector("#boot").getBoundingClientRect(); return {left:r.left,right:r.right,top:r.top,bottom:r.bottom}; })(),
    hud: (() => { const r=document.querySelector("#hud").getBoundingClientRect(); return {left:r.left,right:r.right,top:r.top,bottom:r.bottom}; })(),
    joystick: (() => { const r=document.querySelector("#joystick").getBoundingClientRect(); return {left:r.left,right:r.right,top:r.top,bottom:r.bottom}; })(),
    diagnosticsOpen: document.querySelector("#hud")?.open,
  })`);
  assertRectInViewport(mobile.boot, 390, 844, "mobile boot");
  assertRectInViewport(mobile.hud, 390, 844, "mobile diagnostics summary");
  assertRectInViewport(mobile.joystick, 390, 844, "mobile joystick");
  assert(mobile.diagnosticsOpen === false, "mobile diagnostics should remain collapsed");
  screenshots.mobileWaiting = await screenshot(cdp, sessionId, "world-v0-runtime-shell-mobile-waiting.png");

  await cdp.evaluate(sessionId, `document.querySelector("#hud").open = true; true`);
  await sleep(180);
  const mobileOpen = await cdp.evaluate(sessionId, `(() => { const r=document.querySelector("#hud").getBoundingClientRect(); return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,open:document.querySelector("#hud").open}; })()`);
  assertRectInViewport(mobileOpen, 390, 844, "mobile open diagnostics");
  assert(mobileOpen.open === true, "mobile diagnostics did not open");
  screenshots.mobileDiagnostics = await screenshot(cdp, sessionId, "world-v0-runtime-shell-mobile-diagnostics.png");

  evidence.verdict = "WORLD_V0_RUNTIME_SHELL_RENDER_PASS";
  evidence.desktopBoot = desktopBoot;
  evidence.desktopWaiting = desktopWaiting;
  evidence.mobile = mobile;
  evidence.mobileOpen = mobileOpen;
  evidence.screenshots = screenshots;
  writeFileSync(OUTPUT, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(`${evidence.verdict} · ${version} · network=${desktopWaiting.network} · ui=${desktopWaiting.uiRevision}`);
} catch (error) {
  evidence.error = error instanceof Error ? error.stack || error.message : String(error);
  evidence.stderrTail = Buffer.concat(stderr).toString("utf8").slice(-8000);
  writeFileSync(OUTPUT, `${JSON.stringify(evidence, null, 2)}\n`);
  throw error;
} finally {
  cdp?.close();
  if (child.exitCode === null) child.kill("SIGKILL");
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* cleanup only */ }
}
