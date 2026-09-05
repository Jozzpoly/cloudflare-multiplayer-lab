import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const BASE = (process.env.MW_WORLD_V0_TWO_PHONE_BASE_URL || "http://127.0.0.1:8787").replace(/\/$/, "");
const PAGE_URL = `${BASE}/world-v0/`;
const DEBUG_PORT = 9573;
const TIMEOUT_MS = 30_000;
const OUTPUT = process.env.MW_WORLD_V0_TWO_PHONE_OUTPUT || "world-v0-two-phone-interruption-probe.json";

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function assert(condition, message) { if (!condition) throw new Error(message); }
function mag2(value) { return Math.hypot(value?.x || 0, value?.z ?? value?.y ?? 0); }

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

async function setMobileViewport(cdp, sessionId, width, height, orientationType, angle) {
  await cdp.call("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 2,
    mobile: true,
    screenWidth: width,
    screenHeight: height,
    screenOrientation: { type: orientationType, angle },
  }, sessionId);
  await cdp.call("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 }, sessionId);
  await sleep(180);
}

async function touch(cdp, sessionId, type, points) {
  await cdp.call("Input.dispatchTouchEvent", {
    type,
    touchPoints: points.map((point) => ({ x: point.x, y: point.y, id: point.id, radiusX: 2, radiusY: 2, force: 1 })),
  }, sessionId);
}

async function preparePage(cdp) {
  const { targetId } = await cdp.call("Target.createTarget", { url: PAGE_URL });
  const { sessionId } = await cdp.call("Target.attachToTarget", { targetId, flatten: true });
  await cdp.call("Runtime.enable", {}, sessionId);
  await cdp.call("Page.enable", {}, sessionId);
  await setMobileViewport(cdp, sessionId, 390, 844, "portraitPrimary", 0);
  await waitFor(cdp, sessionId, `document.readyState === "complete" && document.querySelector("#enter")?.disabled === false && typeof window.__sharedYardV0Evidence === "function"`, "mobile page boot");
  const callsign = `tp-${Date.now().toString(36).slice(-7)}`;
  await cdp.eval(sessionId, `(() => { document.querySelector("#callsign").value=${JSON.stringify(callsign)}; document.querySelector("#enter").click(); return true; })()`);
  await waitFor(cdp, sessionId, `window.__sharedYardV0Evidence?.().networkState === "waiting for peer"`, "waiting for peer");
  return { targetId, sessionId };
}

async function elementRect(cdp, sessionId, selector) {
  return await cdp.eval(sessionId, `(() => {
    const e = document.querySelector(${JSON.stringify(selector)});
    const r = e.getBoundingClientRect();
    const s = getComputedStyle(e);
    return { left:r.left, top:r.top, right:r.right, bottom:r.bottom, width:r.width, height:r.height, display:s.display, visibility:s.visibility, opacity:s.opacity };
  })()`);
}

async function probeBlurControl(cdp, sessionId, control) {
  const selector = control === "joystick" ? "#joystick" : "#camera-gimbal";
  const rect = await elementRect(cdp, sessionId, selector);
  const id = control === "joystick" ? 51 : 61;
  const start = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  const moved = control === "joystick"
    ? { x: start.x, y: start.y - rect.height * 0.28 }
    : { x: start.x + rect.width * 0.24, y: start.y - rect.height * 0.24 };

  await touch(cdp, sessionId, "touchStart", [{ id, ...start }]);
  await touch(cdp, sessionId, "touchMove", [{ id, ...moved }]);
  await sleep(100);
  const before = await cdp.eval(sessionId, control === "joystick"
    ? `window.__sharedYardV0PlayableControl().rawInput`
    : `window.__sharedYardV0Evidence().presentation.cameraGimbalInput`);
  assert(mag2(before) > 0.2, `${control} failed to activate before blur ${JSON.stringify(before)}`);
  await cdp.eval(sessionId, `window.dispatchEvent(new Event("blur")); true`);
  await sleep(80);
  const after = await cdp.eval(sessionId, control === "joystick"
    ? `window.__sharedYardV0PlayableControl().rawInput`
    : `window.__sharedYardV0Evidence().presentation.cameraGimbalInput`);
  await touch(cdp, sessionId, "touchEnd", []);
  await sleep(50);
  return { control, before, after, staleAfterBlur: mag2(after) > 0.05 };
}

async function syntheticCanvasSequence(cdp, sessionId, interruption) {
  return await cdp.eval(sessionId, `(() => {
    const canvas = document.querySelector("#viewport canvas");
    const rect = canvas.getBoundingClientRect();
    const fire = (type, pointerId, x, y) => canvas.dispatchEvent(new PointerEvent(type, {
      pointerId,
      pointerType: "touch",
      clientX: x,
      clientY: y,
      bubbles: true,
      cancelable: true,
      isPrimary: pointerId % 2 === 1,
    }));
    const first = { id: 901, x: rect.left + rect.width * 0.34, y: rect.top + rect.height * 0.46 };
    const second = { id: 902, x: rect.left + rect.width * 0.66, y: rect.top + rect.height * 0.46 };
    const before = window.__sharedYardV0PlayableControl().cameraOrbit;
    fire("pointerdown", first.id, first.x, first.y);
    fire("pointermove", first.id, first.x + 34, first.y - 8);
    const afterFirstMove = window.__sharedYardV0PlayableControl().cameraOrbit;
    if (${JSON.stringify(interruption)} === "lostpointercapture") {
      fire("lostpointercapture", first.id, first.x + 34, first.y - 8);
    } else {
      window.dispatchEvent(new Event("blur"));
    }
    const beforeSecondTouch = window.__sharedYardV0PlayableControl().cameraOrbit;
    fire("pointerdown", second.id, second.x, second.y);
    fire("pointermove", second.id, second.x + 72, second.y);
    const afterSecondMove = window.__sharedYardV0PlayableControl().cameraOrbit;
    fire("pointercancel", first.id, first.x + 34, first.y - 8);
    fire("pointercancel", second.id, second.x + 72, second.y);
    return { before, afterFirstMove, beforeSecondTouch, afterSecondMove };
  })()`);
}

function distanceChanged(sample) {
  return Math.abs((sample.afterSecondMove?.distance || 0) - (sample.beforeSecondTouch?.distance || 0)) > 0.02;
}

async function layoutState(cdp, sessionId, label) {
  return await cdp.eval(sessionId, `(() => {
    const rectOf = (selector) => {
      const e = document.querySelector(selector);
      const r = e.getBoundingClientRect();
      const s = getComputedStyle(e);
      return { left:r.left, top:r.top, right:r.right, bottom:r.bottom, width:r.width, height:r.height, display:s.display, visibility:s.visibility };
    };
    const within = (r) => r.left >= -1 && r.top >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1;
    const overlap = (a,b) => Math.max(0, Math.min(a.right,b.right)-Math.max(a.left,b.left)) * Math.max(0, Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top));
    const joystick=rectOf("#joystick"), gimbal=rectOf("#camera-gimbal"), boot=rectOf("#boot"), hud=rectOf("#hud"), session=rectOf("#session-actions");
    const evidence=window.__sharedYardV0Evidence();
    return {
      label:${JSON.stringify(label)}, innerWidth, innerHeight,
      fov:evidence.presentation.cameraFov,
      preset:evidence.presentation.cameraPreset,
      joystick,gimbal,boot,hud,session,
      joystickWithin:within(joystick), gimbalWithin:within(gimbal), bootWithin:within(boot), hudWithin:within(hud), sessionWithin:within(session),
      controlOverlap:overlap(joystick,gimbal),
      runtimeFailed:evidence.runtimeFailed,
    };
  })()`);
}

async function probePostRotationControls(cdp, sessionId) {
  const joystick = await elementRect(cdp, sessionId, "#joystick");
  const joy = { x: joystick.left + joystick.width / 2, y: joystick.top + joystick.height / 2 };
  await touch(cdp, sessionId, "touchStart", [{ id: 71, ...joy }]);
  await touch(cdp, sessionId, "touchMove", [{ id: 71, x: joy.x, y: joy.y - joystick.height * 0.24 }]);
  await sleep(70);
  const joystickDuring = await cdp.eval(sessionId, `window.__sharedYardV0PlayableControl().rawInput`);
  await touch(cdp, sessionId, "touchEnd", []);
  await sleep(50);
  const joystickAfter = await cdp.eval(sessionId, `window.__sharedYardV0PlayableControl().rawInput`);

  const gimbal = await elementRect(cdp, sessionId, "#camera-gimbal");
  const gim = { x: gimbal.left + gimbal.width / 2, y: gimbal.top + gimbal.height / 2 };
  await touch(cdp, sessionId, "touchStart", [{ id: 81, ...gim }]);
  await touch(cdp, sessionId, "touchMove", [{ id: 81, x: gim.x + gimbal.width * 0.2, y: gim.y - gimbal.height * 0.2 }]);
  await sleep(160);
  const gimbalDuring = await cdp.eval(sessionId, `window.__sharedYardV0Evidence().presentation.cameraGimbalInput`);
  await touch(cdp, sessionId, "touchEnd", []);
  await sleep(50);
  const gimbalAfter = await cdp.eval(sessionId, `window.__sharedYardV0Evidence().presentation.cameraGimbalInput`);

  return {
    joystickDuring,
    joystickAfter,
    gimbalDuring,
    gimbalAfter,
    safe: mag2(joystickDuring) > 0.2 && mag2(joystickAfter) < 1e-6 && mag2(gimbalDuring) > 0.2 && mag2(gimbalAfter) < 1e-6,
  };
}

const chrome = findChrome();
const profile = mkdtempSync(join(tmpdir(), "mw-two-phone-probe-"));
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
const result = { verdict: "WORLD_V0_TWO_PHONE_PROBE_APPARATUS_FAIL", generatedAt: new Date().toISOString(), page: PAGE_URL, blockers: [] };

try {
  const info = await debuggerInfo();
  cdp = new Cdp(info.webSocketDebuggerUrl);
  await cdp.opened;
  const { targetId, sessionId } = await preparePage(cdp);

  const joystickBlur = await probeBlurControl(cdp, sessionId, "joystick");
  const gimbalBlur = await probeBlurControl(cdp, sessionId, "gimbal");
  const canvasLostCapture = await syntheticCanvasSequence(cdp, sessionId, "lostpointercapture");
  const canvasBlur = await syntheticCanvasSequence(cdp, sessionId, "blur");

  await setMobileViewport(cdp, sessionId, 844, 390, "landscapePrimary", 90);
  const landscape = await layoutState(cdp, sessionId, "landscape-844x390");
  await setMobileViewport(cdp, sessionId, 390, 844, "portraitPrimary", 0);
  const portraitReturn = await layoutState(cdp, sessionId, "portrait-return-390x844");
  const postRotationControls = await probePostRotationControls(cdp, sessionId);

  const canvasLostCaptureSticky = distanceChanged(canvasLostCapture);
  const canvasBlurSticky = distanceChanged(canvasBlur);
  const landscapeSafe = landscape.innerWidth === 844 && landscape.innerHeight === 390 && landscape.fov === 55 && landscape.preset === "desktop-orbit" && landscape.joystickWithin && landscape.gimbalWithin && landscape.bootWithin && landscape.hudWithin && landscape.sessionWithin && landscape.controlOverlap === 0 && !landscape.runtimeFailed;
  const portraitReturnSafe = portraitReturn.innerWidth === 390 && portraitReturn.innerHeight === 844 && portraitReturn.fov === 62 && portraitReturn.preset === "portrait-orbit" && portraitReturn.joystickWithin && portraitReturn.gimbalWithin && portraitReturn.bootWithin && portraitReturn.hudWithin && portraitReturn.sessionWithin && portraitReturn.controlOverlap === 0 && !portraitReturn.runtimeFailed;

  if (joystickBlur.staleAfterBlur) result.blockers.push("joystick-input-survives-window-blur");
  if (gimbalBlur.staleAfterBlur) result.blockers.push("gimbal-input-survives-window-blur");
  if (canvasLostCaptureSticky) result.blockers.push("canvas-touch-state-survives-lostpointercapture-event-path");
  if (canvasBlurSticky) result.blockers.push("canvas-touch-state-survives-window-blur");
  if (!landscapeSafe) result.blockers.push("landscape-layout-or-projection-unsafe");
  if (!portraitReturnSafe) result.blockers.push("portrait-return-layout-or-projection-unsafe");
  if (!postRotationControls.safe) result.blockers.push("touch-controls-unsafe-after-rotation");

  Object.assign(result, {
    joystickBlur,
    gimbalBlur,
    canvasLostCapture: { ...canvasLostCapture, staleSecondTouchAsPinch: canvasLostCaptureSticky, claimBoundary: "Synthetic event-path witness. It proves current app state is not cleared by lostpointercapture on the canvas; it does not alone prove a real Android browser will omit pointercancel/pointerup." },
    canvasBlur: { ...canvasBlur, staleSecondTouchAsPinch: canvasBlurSticky },
    landscape,
    portraitReturn,
    postRotationControls,
    landscapeSafe,
    portraitReturnSafe,
    runtime: await cdp.eval(sessionId, `window.__sharedYardV0Evidence()`),
  });
  result.verdict = result.blockers.length ? "WORLD_V0_TWO_PHONE_CURRENT_RELEASE_BLOCKERS" : "WORLD_V0_TWO_PHONE_CURRENT_RELEASE_SAFE_IN_EMULATED_ENVELOPE";
  writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
  console.log(result.verdict, JSON.stringify({ blockers: result.blockers, landscapeSafe, portraitReturnSafe, postRotationControlsSafe: postRotationControls.safe }));
  await cdp.call("Target.closeTarget", { targetId });
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
