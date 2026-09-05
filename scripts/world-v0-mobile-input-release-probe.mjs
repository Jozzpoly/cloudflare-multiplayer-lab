import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const BASE = (process.env.MW_WORLD_V0_MOBILE_RELEASE_BASE_URL || "http://127.0.0.1:8787").replace(/\/$/, "");
const PAGE_URL = `${BASE}/world-v0/`;
const DEBUG_PORT = 9568;
const TIMEOUT_MS = 30_000;
const OUTPUT = process.env.MW_WORLD_V0_MOBILE_RELEASE_OUTPUT || "world-v0-mobile-input-release-probe.json";
const REQUIRE_SAFE = process.env.MW_WORLD_V0_REQUIRE_RELEASE_SAFE === "1";

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function assert(condition, message) { if (!condition) throw new Error(message); }
function magnitude2(value) { return Math.hypot(value?.x || 0, value?.z ?? value?.y ?? 0); }

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

async function waitFor(cdp, sessionId, expression, label) {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < TIMEOUT_MS) {
    try {
      last = await cdp.evaluate(sessionId, expression);
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

const chrome = findChrome();
const profile = mkdtempSync(join(tmpdir(), "mw-mobile-release-"));
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
const result = {
  verdict: "WORLD_V0_MOBILE_INPUT_RELEASE_PROBE_FAIL",
  generatedAt: new Date().toISOString(),
  page: PAGE_URL,
  requireSafe: REQUIRE_SAFE,
};

try {
  const debuggerInfo = await waitForDebugger();
  cdp = new Cdp(debuggerInfo.webSocketDebuggerUrl);
  await cdp.opened;
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

  await waitFor(cdp, sessionId, `document.readyState === "complete" && document.querySelector("#enter")?.disabled === false && typeof window.__sharedYardV0Evidence === "function"`, "page boot");
  const suffix = Date.now().toString(36).slice(-6);
  await cdp.evaluate(sessionId, `(() => {
    document.querySelector("#callsign").value = ${JSON.stringify(`release-${suffix}`)};
    document.querySelector("#enter").click();
    return true;
  })()`);
  await waitFor(cdp, sessionId, `window.__sharedYardV0Evidence?.().networkState === "waiting for peer"`, "waiting state");

  const geometry = await cdp.evaluate(sessionId, `(() => {
    const joy = document.querySelector("#joystick").getBoundingClientRect();
    const gim = document.querySelector("#camera-gimbal").getBoundingClientRect();
    window.__mwReleaseProbe = { joystickPointer: null, joystickLost: 0, gimbalPointer: null, gimbalLost: 0 };
    const joystick = document.querySelector("#joystick");
    const gimbal = document.querySelector("#camera-gimbal");
    joystick.addEventListener("pointerdown", (event) => { window.__mwReleaseProbe.joystickPointer = event.pointerId; }, { capture: true, once: true });
    joystick.addEventListener("lostpointercapture", () => { window.__mwReleaseProbe.joystickLost += 1; });
    gimbal.addEventListener("pointerdown", (event) => { window.__mwReleaseProbe.gimbalPointer = event.pointerId; }, { capture: true, once: true });
    gimbal.addEventListener("lostpointercapture", () => { window.__mwReleaseProbe.gimbalLost += 1; });
    return {
      joystick: { x: joy.left + joy.width / 2, y: joy.top + joy.height / 2, width: joy.width, height: joy.height },
      gimbal: { x: gim.left + gim.width / 2, y: gim.top + gim.height / 2, width: gim.width, height: gim.height, display: getComputedStyle(gimbal).display },
    };
  })()`);
  assert(geometry.gimbal.display !== "none", `mobile gimbal hidden ${JSON.stringify(geometry.gimbal)}`);

  await touch(cdp, sessionId, "touchStart", [{ id: 31, x: geometry.joystick.x, y: geometry.joystick.y }]);
  await touch(cdp, sessionId, "touchMove", [{ id: 31, x: geometry.joystick.x, y: geometry.joystick.y - geometry.joystick.height * 0.28 }]);
  await sleep(80);
  const joystickBeforeLoss = await cdp.evaluate(sessionId, `({ control: window.__sharedYardV0PlayableControl(), probe: window.__mwReleaseProbe })`);
  assert(magnitude2(joystickBeforeLoss.control?.rawInput) > 0.2, `joystick did not become active ${JSON.stringify(joystickBeforeLoss)}`);
  const joystickRelease = await cdp.evaluate(sessionId, `(() => {
    const element = document.querySelector("#joystick");
    const pointerId = window.__mwReleaseProbe.joystickPointer;
    const hadCapture = Number.isInteger(pointerId) && element.hasPointerCapture(pointerId);
    if (hadCapture) element.releasePointerCapture(pointerId);
    return { pointerId, hadCapture, hasCaptureAfter: Number.isInteger(pointerId) ? element.hasPointerCapture(pointerId) : false };
  })()`);
  assert(joystickRelease.hadCapture === true, `joystick capture unavailable ${JSON.stringify(joystickRelease)}`);
  await sleep(80);
  const joystickAfterLoss = await cdp.evaluate(sessionId, `({ control: window.__sharedYardV0PlayableControl(), probe: window.__mwReleaseProbe })`);
  const joystickSafe = magnitude2(joystickAfterLoss.control?.rawInput) < 1e-6;
  await touch(cdp, sessionId, "touchEnd", []);
  await sleep(60);

  await touch(cdp, sessionId, "touchStart", [{ id: 41, x: geometry.gimbal.x, y: geometry.gimbal.y }]);
  await touch(cdp, sessionId, "touchMove", [{ id: 41, x: geometry.gimbal.x + geometry.gimbal.width * 0.24, y: geometry.gimbal.y - geometry.gimbal.height * 0.24 }]);
  await sleep(100);
  const gimbalBeforeLoss = await cdp.evaluate(sessionId, `({ evidence: window.__sharedYardV0Evidence(), probe: window.__mwReleaseProbe })`);
  const gimbalBeforeInput = gimbalBeforeLoss.evidence?.presentation?.cameraGimbalInput;
  assert(magnitude2(gimbalBeforeInput) > 0.2, `gimbal did not become active ${JSON.stringify(gimbalBeforeLoss)}`);
  const gimbalRelease = await cdp.evaluate(sessionId, `(() => {
    const element = document.querySelector("#camera-gimbal");
    const pointerId = window.__mwReleaseProbe.gimbalPointer;
    const hadCapture = Number.isInteger(pointerId) && element.hasPointerCapture(pointerId);
    if (hadCapture) element.releasePointerCapture(pointerId);
    return { pointerId, hadCapture, hasCaptureAfter: Number.isInteger(pointerId) ? element.hasPointerCapture(pointerId) : false };
  })()`);
  assert(gimbalRelease.hadCapture === true, `gimbal capture unavailable ${JSON.stringify(gimbalRelease)}`);
  await sleep(80);
  const gimbalAfterLoss = await cdp.evaluate(sessionId, `({ evidence: window.__sharedYardV0Evidence(), probe: window.__mwReleaseProbe })`);
  const gimbalAfterInput = gimbalAfterLoss.evidence?.presentation?.cameraGimbalInput;
  const gimbalSafe = magnitude2(gimbalAfterInput) < 1e-6;
  await touch(cdp, sessionId, "touchEnd", []);
  await sleep(60);

  const normalAfterCleanup = await cdp.evaluate(sessionId, `({ control: window.__sharedYardV0PlayableControl(), evidence: window.__sharedYardV0Evidence(), probe: window.__mwReleaseProbe })`);
  const cleanupSafe = magnitude2(normalAfterCleanup.control?.rawInput) < 1e-6 && magnitude2(normalAfterCleanup.evidence?.presentation?.cameraGimbalInput) < 1e-6;

  Object.assign(result, {
    joystick: {
      pointerRelease: joystickRelease,
      lostPointerCaptureEvents: joystickAfterLoss.probe?.joystickLost ?? 0,
      inputBeforeLoss: joystickBeforeLoss.control?.rawInput,
      inputAfterLoss: joystickAfterLoss.control?.rawInput,
      safeAfterLoss: joystickSafe,
    },
    gimbal: {
      pointerRelease: gimbalRelease,
      lostPointerCaptureEvents: gimbalAfterLoss.probe?.gimbalLost ?? 0,
      inputBeforeLoss: gimbalBeforeInput,
      inputAfterLoss: gimbalAfterInput,
      safeAfterLoss: gimbalSafe,
    },
    cleanupSafe,
    apparatusNote: "cameraGimbalInput is read from __sharedYardV0Evidence().presentation, not the playable-control helper",
  });

  assert((result.joystick.lostPointerCaptureEvents || 0) >= 1, `joystick lostpointercapture not observed ${JSON.stringify(result.joystick)}`);
  assert((result.gimbal.lostPointerCaptureEvents || 0) >= 1, `gimbal lostpointercapture not observed ${JSON.stringify(result.gimbal)}`);
  assert(cleanupSafe, `normal touchEnd cleanup failed ${JSON.stringify(normalAfterCleanup)}`);

  if (REQUIRE_SAFE) {
    assert(joystickSafe, `joystick retained input after lostpointercapture ${JSON.stringify(result.joystick)}`);
    assert(gimbalSafe, `gimbal retained input after lostpointercapture ${JSON.stringify(result.gimbal)}`);
    result.verdict = "WORLD_V0_MOBILE_INPUT_RELEASE_SAFE";
  } else {
    const witness = !joystickSafe || !gimbalSafe;
    assert(witness, `probe did not reproduce stale input; runtime may already be safe ${JSON.stringify(result)}`);
    result.verdict = "WORLD_V0_MOBILE_INPUT_RELEASE_WITNESS";
  }

  writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
  console.log(result.verdict, JSON.stringify({ joystickSafe, gimbalSafe, cleanupSafe }));
} catch (error) {
  result.error = error instanceof Error ? error.stack || error.message : String(error);
  result.chromeStderr = Buffer.concat(stderr).toString("utf8").slice(-5000);
  writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
  throw error;
} finally {
  cdp?.close();
  if (child.exitCode === null) child.kill("SIGKILL");
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* cleanup */ }
}
