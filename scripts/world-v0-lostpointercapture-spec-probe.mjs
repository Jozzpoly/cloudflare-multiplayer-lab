import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const BASE = (process.env.MW_WORLD_V0_CAPTURE_SPEC_BASE_URL || "http://127.0.0.1:8787").replace(/\/$/, "");
const PAGE_URL = `${BASE}/world-v0/`;
const DEBUG_PORT = 9569;
const TIMEOUT_MS = 30_000;
const OUTPUT = process.env.MW_WORLD_V0_CAPTURE_SPEC_OUTPUT || "world-v0-lostpointercapture-spec-probe.json";

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function assert(condition, message) { if (!condition) throw new Error(message); }
function mag(value) { return Math.hypot(value?.x || 0, value?.z ?? value?.y ?? 0); }

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
  async eval(sessionId, expression) {
    const result = await this.call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, userGesture: true }, sessionId);
    if (result.exceptionDetails) throw new Error(`Browser evaluate failed: ${result.exceptionDetails.text || "unknown"}`);
    return result.result?.value;
  }
  close() { try { this.ws.close(); } catch {} }
}

async function debuggerInfo() {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < TIMEOUT_MS) {
    try {
      const response = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`, { signal: AbortSignal.timeout(1200) });
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
      last = await cdp.eval(sessionId, expression);
      if (last) return last;
    } catch (error) { last = error instanceof Error ? error.message : String(error); }
    await sleep(100);
  }
  throw new Error(`${label} timeout · last=${JSON.stringify(last)}`);
}

async function touch(cdp, sessionId, type, points) {
  await cdp.call("Input.dispatchTouchEvent", {
    type,
    touchPoints: points.map((point) => ({ x: point.x, y: point.y, id: point.id, radiusX: 2, radiusY: 2, force: 1 })),
  }, sessionId);
}

async function preparePage(cdp, label) {
  const { targetId } = await cdp.call("Target.createTarget", { url: PAGE_URL });
  const { sessionId } = await cdp.call("Target.attachToTarget", { targetId, flatten: true });
  await cdp.call("Runtime.enable", {}, sessionId);
  await cdp.call("Page.enable", {}, sessionId);
  await cdp.call("Emulation.setDeviceMetricsOverride", {
    width: 390, height: 844, deviceScaleFactor: 2, mobile: true,
    screenWidth: 390, screenHeight: 844,
    screenOrientation: { type: "portraitPrimary", angle: 0 },
  }, sessionId);
  await cdp.call("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 }, sessionId);
  await waitFor(cdp, sessionId, `document.readyState === "complete" && document.querySelector("#enter")?.disabled === false && typeof window.__sharedYardV0Evidence === "function"`, `${label} boot`);
  const suffix = `${label}-${Date.now().toString(36).slice(-6)}`;
  await cdp.eval(sessionId, `(() => { document.querySelector("#callsign").value=${JSON.stringify(suffix)}; document.querySelector("#enter").click(); return true; })()`);
  await waitFor(cdp, sessionId, `window.__sharedYardV0Evidence?.().networkState === "waiting for peer"`, `${label} waiting`);
  return { targetId, sessionId };
}

async function probeControl(cdp, control) {
  const { targetId, sessionId } = await preparePage(cdp, control);
  const setup = await cdp.eval(sessionId, `(() => {
    const element = document.querySelector(${JSON.stringify(control === "joystick" ? "#joystick" : "#camera-gimbal")});
    const rect = element.getBoundingClientRect();
    window.__mwCaptureSpec = { pointerId: null, lost: 0, lostTarget: null };
    element.addEventListener("pointerdown", (event) => { window.__mwCaptureSpec.pointerId = event.pointerId; }, { capture: true, once: true });
    element.addEventListener("lostpointercapture", (event) => { window.__mwCaptureSpec.lost += 1; window.__mwCaptureSpec.lostTarget = event.currentTarget.id; });
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, width: rect.width, height: rect.height };
  })()`);
  const pointerId = control === "joystick" ? 61 : 71;
  await touch(cdp, sessionId, "touchStart", [{ id: pointerId, x: setup.x, y: setup.y }]);
  const moved = control === "joystick"
    ? { x: setup.x, y: setup.y - setup.height * 0.28 }
    : { x: setup.x + setup.width * 0.24, y: setup.y - setup.height * 0.24 };
  await touch(cdp, sessionId, "touchMove", [{ id: pointerId, ...moved }]);
  await sleep(80);
  const before = await cdp.eval(sessionId, control === "joystick"
    ? `({ input: window.__sharedYardV0PlayableControl().rawInput, spec: window.__mwCaptureSpec })`
    : `({ input: window.__sharedYardV0Evidence().presentation.cameraGimbalInput, spec: window.__mwCaptureSpec })`);
  assert(mag(before.input) > 0.2, `${control} did not become active ${JSON.stringify(before)}`);

  const release = await cdp.eval(sessionId, `(() => {
    const element = document.querySelector(${JSON.stringify(control === "joystick" ? "#joystick" : "#camera-gimbal")});
    const id = window.__mwCaptureSpec.pointerId;
    const hadCapture = Number.isInteger(id) && element.hasPointerCapture(id);
    if (hadCapture) element.releasePointerCapture(id);
    return { pointerId:id, hadCapture, hasCaptureAfter:Number.isInteger(id) ? element.hasPointerCapture(id) : false };
  })()`);
  assert(release.hadCapture === true && release.hasCaptureAfter === false, `${control} capture transition missing ${JSON.stringify(release)}`);

  // Force the next pointer event after explicit release so the UA must process pending capture.
  const outside = control === "joystick" ? { x: 195, y: 250 } : { x: 195, y: 500 };
  await touch(cdp, sessionId, "touchMove", [{ id: pointerId, ...outside }]);
  await sleep(100);
  const after = await cdp.eval(sessionId, control === "joystick"
    ? `({ input: window.__sharedYardV0PlayableControl().rawInput, spec: window.__mwCaptureSpec })`
    : `({ input: window.__sharedYardV0Evidence().presentation.cameraGimbalInput, spec: window.__mwCaptureSpec })`);
  await touch(cdp, sessionId, "touchEnd", []);
  await sleep(40);
  await cdp.call("Target.closeTarget", { targetId });

  return {
    control,
    before: before.input,
    release,
    lostPointerCaptureEvents: after.spec?.lost ?? 0,
    lostTarget: after.spec?.lostTarget ?? null,
    afterProcessedLoss: after.input,
    staleAfterProcessedLoss: mag(after.input) > 0.2,
  };
}

const chrome = findChrome();
const profile = mkdtempSync(join(tmpdir(), "mw-capture-spec-"));
const child = spawn(chrome, [
  "--headless=new", "--no-sandbox", "--disable-dev-shm-usage",
  "--disable-background-networking", "--disable-background-timer-throttling",
  "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding",
  "--use-gl=angle", "--use-angle=swiftshader-webgl", "--enable-unsafe-swiftshader",
  `--remote-debugging-port=${DEBUG_PORT}`, "--remote-debugging-address=127.0.0.1",
  `--user-data-dir=${profile}`, "about:blank",
], { stdio: ["ignore", "ignore", "pipe"] });
const stderr = [];
child.stderr.on("data", (chunk) => stderr.push(chunk));
let cdp = null;
const result = { verdict: "WORLD_V0_CAPTURE_SPEC_PROBE_FAIL", generatedAt: new Date().toISOString(), page: PAGE_URL };

try {
  const info = await debuggerInfo();
  cdp = new Cdp(info.webSocketDebuggerUrl);
  await cdp.opened;
  const joystick = await probeControl(cdp, "joystick");
  const gimbal = await probeControl(cdp, "gimbal");
  Object.assign(result, { joystick, gimbal });

  for (const sample of [joystick, gimbal]) {
    assert(sample.lostPointerCaptureEvents >= 1, `${sample.control} did not observe spec-processed lostpointercapture ${JSON.stringify(sample)}`);
    assert(sample.staleAfterProcessedLoss === true, `${sample.control} input already safe after processed loss ${JSON.stringify(sample)}`);
  }
  result.verdict = "WORLD_V0_CAPTURE_SPEC_STALE_INPUT_WITNESS";
  writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
  console.log(result.verdict, JSON.stringify({ joystick, gimbal }));
} catch (error) {
  result.error = error instanceof Error ? error.stack || error.message : String(error);
  result.chromeStderr = Buffer.concat(stderr).toString("utf8").slice(-5000);
  writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
  throw error;
} finally {
  cdp?.close();
  if (child.exitCode === null) child.kill("SIGKILL");
  try { rmSync(profile, { recursive: true, force: true }); } catch {}
}
