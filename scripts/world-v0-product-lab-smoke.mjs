import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const BASE = (process.env.MW_WORLD_V0_LAB_BASE_URL || "http://127.0.0.1:8787").replace(/\/$/, "");
const PAGE_URL = `${BASE}/world-v0-lab/`;
const DEBUG_PORT = 9333;
const TIMEOUT_MS = 20_000;
const OUTPUT = process.env.MW_WORLD_V0_LAB_OUTPUT || "world-v0-product-lab-evidence.json";
const MODES = [
  { key: "baseline", title: "Qualified V0" },
  { key: "presence", title: "Presence pass" },
  { key: "core", title: "Core playset" },
  { key: "broad", title: "Broad playset" },
];

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
  assert(bytes.length > 20_000, `${filename}: screenshot suspiciously small (${bytes.length} bytes)`);
  writeFileSync(filename, bytes);
  return { filename, bytes: bytes.length };
}

async function captureMode(cdp, sessionId, viewportName, mode) {
  await cdp.evaluate(sessionId, `document.querySelector('[data-mode="${mode.key}"]').click(); true`);
  await waitFor(cdp, sessionId, `document.querySelector("#card-title")?.textContent === ${JSON.stringify(mode.title)} && window.__worldV0ProductLabState?.mode === ${JSON.stringify(mode.key)}`, `${viewportName} ${mode.key}`);
  await sleep(180);
  return await screenshot(cdp, sessionId, `world-v0-product-lab-${viewportName}-${mode.key}.png`);
}

const chrome = findChrome();
const version = chromeVersion(chrome);
const profile = mkdtempSync(join(tmpdir(), "mw-world-v0-product-lab-"));
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
const evidence = { verdict: "WORLD_V0_PRODUCT_LAB_RENDER_FAIL", generatedAt: new Date().toISOString(), page: PAGE_URL, chromeVersion: version };
try {
  const debuggerInfo = await waitForDebugger();
  cdp = new Cdp(debuggerInfo.webSocketDebuggerUrl);
  await cdp.opened;
  const existing = await cdp.call("Target.getTargets");
  const { targetId } = await cdp.call("Target.createTarget", { url: PAGE_URL });
  await cdp.call("Target.activateTarget", { targetId });
  const { sessionId } = await cdp.call("Target.attachToTarget", { targetId, flatten: true });
  await cdp.call("Runtime.enable", {}, sessionId);
  await cdp.call("Page.enable", {}, sessionId);
  for (const target of existing.targetInfos || []) {
    if (target.type !== "page" || target.targetId === targetId) continue;
    try { await cdp.call("Target.closeTarget", { targetId: target.targetId }); } catch { /* cleanup only */ }
  }

  await setViewport(cdp, sessionId, { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await waitFor(cdp, sessionId, `document.readyState === "complete" && document.querySelector("canvas") instanceof HTMLCanvasElement && document.querySelectorAll(".mode").length === 4 && !!window.__worldV0ProductLabState`, "Product Lab desktop boot");
  const boot = await cdp.evaluate(sessionId, `({
    title: document.title,
    heading: document.querySelector(".title")?.textContent,
    modes: [...document.querySelectorAll(".mode")].map((node) => node.textContent.trim()),
    canvas: { width: document.querySelector("canvas")?.width || 0, height: document.querySelector("canvas")?.height || 0 },
    bodyOverflow: getComputedStyle(document.body).overflow,
    state: window.__worldV0ProductLabState,
  })`);
  assert(boot.title.includes("Product Lab"), `unexpected title ${boot.title}`);
  assert(boot.heading === "Shared Yard V0.5", `unexpected heading ${boot.heading}`);
  assert(JSON.stringify(boot.modes) === JSON.stringify(["V0", "Presence", "Core set", "Broad set"]), `mode contract drift ${JSON.stringify(boot.modes)}`);
  assert(boot.canvas.width > 1000 && boot.canvas.height > 600, `desktop canvas too small ${JSON.stringify(boot.canvas)}`);

  const screenshots = { desktop: {}, mobile: {} };
  for (const mode of MODES) screenshots.desktop[mode.key] = await captureMode(cdp, sessionId, "desktop", mode);

  await setViewport(cdp, sessionId, { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await cdp.evaluate(sessionId, `document.querySelector("#reset").click(); true`);
  await waitFor(cdp, sessionId, `innerWidth === 390 && window.__worldV0ProductLabState?.mobile === true`, "Product Lab mobile framing");
  const mobileState = await cdp.evaluate(sessionId, `({
    width: innerWidth,
    height: innerHeight,
    camera: window.__worldV0ProductLabState?.camera,
    modesRect: (() => { const r = document.querySelector("#modes").getBoundingClientRect(); return {left:r.left,right:r.right,top:r.top,bottom:r.bottom}; })(),
    cardRect: (() => { const r = document.querySelector("#card").getBoundingClientRect(); return {left:r.left,right:r.right,top:r.top,bottom:r.bottom}; })(),
    brandRect: (() => { const r = document.querySelector("#brand").getBoundingClientRect(); return {left:r.left,right:r.right,top:r.top,bottom:r.bottom}; })(),
    tagRect: (() => { const r = document.querySelector("#labtag").getBoundingClientRect(); return {left:r.left,right:r.right,top:r.top,bottom:r.bottom}; })(),
  })`);
  assert(mobileState.width === 390, `mobile viewport drift ${mobileState.width}`);
  assert(mobileState.camera?.fov >= 56 && mobileState.camera?.distance >= 26, `mobile camera framing contract drift ${JSON.stringify(mobileState.camera)}`);
  for (const [name, rect] of Object.entries({ modes: mobileState.modesRect, card: mobileState.cardRect, brand: mobileState.brandRect, tag: mobileState.tagRect })) {
    assert(rect.left >= 0 && rect.right <= 390, `mobile ${name} clipped horizontally ${JSON.stringify(rect)}`);
    assert(rect.top >= 0 && rect.bottom <= 844, `mobile ${name} clipped vertically ${JSON.stringify(rect)}`);
  }
  assert(mobileState.cardRect.bottom < mobileState.modesRect.top, `mobile card overlaps mode bar ${JSON.stringify({ card: mobileState.cardRect, modes: mobileState.modesRect })}`);
  for (const mode of MODES) screenshots.mobile[mode.key] = await captureMode(cdp, sessionId, "mobile", mode);

  // Deep-link semantics are part of the Lab's low-attention review contract.
  await cdp.call("Page.navigate", { url: `${PAGE_URL}?mode=core` }, sessionId);
  await waitFor(cdp, sessionId, `window.__worldV0ProductLabState?.mode === "core" && document.querySelector("#card-title")?.textContent === "Core playset"`, "Product Lab deep link");

  evidence.verdict = "WORLD_V0_PRODUCT_LAB_RENDER_PASS";
  evidence.boot = boot;
  evidence.mobile = mobileState;
  evidence.screenshots = screenshots;
  evidence.deepLink = { mode: "core", pass: true };
  writeFileSync(OUTPUT, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(`${evidence.verdict} · ${version} · captures=8 · deepLink=core`);
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
