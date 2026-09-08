import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { WORLD_V0_BROWSER_UI_REVISION } from "../public/world-v0/build-contract.js";

const BASE = (process.env.MW_WORLD_V0_PLAYABLE_BASE_URL || "http://127.0.0.1:8787").replace(/\/$/, "");
const PAGE_URL = `${BASE}/world-v0/`;
const DEBUG_PORT = 9555;
const TIMEOUT_MS = 45_000;
const OUTPUT = process.env.MW_WORLD_V0_PLAYABLE_OUTPUT || "world-v0-playable-a1-evidence.json";
const EXPECTED_UI = "shared-yard-v0-browser-ui-v4-playable-control";

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

async function createPage(cdp, viewport) {
  const { targetId } = await cdp.call("Target.createTarget", { url: PAGE_URL });
  const { sessionId } = await cdp.call("Target.attachToTarget", { targetId, flatten: true });
  await cdp.call("Runtime.enable", {}, sessionId);
  await cdp.call("Page.enable", {}, sessionId);
  await cdp.call("Emulation.setDeviceMetricsOverride", {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: viewport.scale,
    mobile: viewport.mobile,
    screenWidth: viewport.width,
    screenHeight: viewport.height,
    screenOrientation: { type: viewport.mobile ? "portraitPrimary" : "landscapePrimary", angle: viewport.mobile ? 0 : 90 },
  }, sessionId);
  await waitFor(cdp, sessionId, `document.readyState === "complete" && document.querySelector("#enter")?.disabled === false && typeof window.__sharedYardV0PlayableControl === "function"`, "page boot");
  return { targetId, sessionId };
}

async function enter(cdp, page, callsign, run) {
  await cdp.evaluate(page.sessionId, `(() => {
    document.querySelector("#callsign").value = ${JSON.stringify(callsign)};
    document.querySelector("#run").value = ${JSON.stringify(run)};
    document.querySelector("#enter").click();
    return true;
  })()`);
}

async function mouse(cdp, sessionId, type, x, y, button = "none", buttons = 0, clickCount = 0) {
  await cdp.call("Input.dispatchMouseEvent", { type, x, y, button, buttons, clickCount }, sessionId);
}

const chrome = findChrome();
const profile = mkdtempSync(join(tmpdir(), "mw-playable-a1-"));
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
const result = { verdict: "WORLD_V0_PLAYABLE_A1_FAIL", generatedAt: new Date().toISOString(), page: PAGE_URL };
try {
  assert(WORLD_V0_BROWSER_UI_REVISION === EXPECTED_UI, `build-contract UI revision ${WORLD_V0_BROWSER_UI_REVISION}`);
  const debuggerInfo = await waitForDebugger();
  cdp = new Cdp(debuggerInfo.webSocketDebuggerUrl);
  await cdp.opened;

  const mobile = await createPage(cdp, { width: 390, height: 844, scale: 2, mobile: true });
  const desktop = await createPage(cdp, { width: 1440, height: 900, scale: 1, mobile: false });
  const suffix = Date.now().toString(36).slice(-7);
  const run = `play-${suffix}`;
  await enter(cdp, mobile, `phone-${suffix}`, run);
  await waitFor(cdp, mobile.sessionId, `window.__sharedYardV0Evidence?.().networkState === "waiting for peer"`, "mobile waiting");
  await enter(cdp, desktop, `desk-${suffix}`, run);

  const live = `(() => { const e = window.__sharedYardV0Evidence?.(); return e?.localBoundaryTick !== null && e?.metrics?.guardMatches >= 1 && !e?.runtimeFailed; })()`;
  await waitFor(cdp, mobile.sessionId, live, "mobile live");
  await waitFor(cdp, desktop.sessionId, live, "desktop live");

  const before = await cdp.evaluate(mobile.sessionId, `({ evidence: window.__sharedYardV0Evidence(), control: window.__sharedYardV0PlayableControl() })`);
  assert(before.evidence.uiRevision === EXPECTED_UI, `mobile UI revision ${before.evidence.uiRevision}`);
  assert(before.evidence.presentation.cameraPreset === "portrait-orbit", `mobile camera preset ${before.evidence.presentation.cameraPreset}`);
  assert(before.evidence.presentation.movementMapping === "camera-relative-v1", "camera-relative movement evidence missing");
  assert(before.evidence.runtimeFailureReason === null && before.evidence.runtimeFailureAt === null, "failure provenance should start empty");

  const dragStart = { x: 210, y: 350 };
  await mouse(cdp, mobile.sessionId, "mousePressed", dragStart.x, dragStart.y, "left", 1, 1);
  await mouse(cdp, mobile.sessionId, "mouseMoved", dragStart.x + 90, dragStart.y - 35, "none", 1, 0);
  await mouse(cdp, mobile.sessionId, "mouseReleased", dragStart.x + 90, dragStart.y - 35, "left", 0, 1);
  await sleep(120);
  const afterDrag = await cdp.evaluate(mobile.sessionId, `window.__sharedYardV0PlayableControl()`);
  assert(afterDrag.cameraOrbit.userAdjusted === true, "camera drag did not mark user adjustment");
  assert(Math.abs(afterDrag.cameraOrbit.yaw - before.control.cameraOrbit.yaw) > 0.2, `camera yaw barely changed ${before.control.cameraOrbit.yaw} -> ${afterDrag.cameraOrbit.yaw}`);

  const joy = await cdp.evaluate(mobile.sessionId, `(() => { const r = document.querySelector("#joystick").getBoundingClientRect(); return { x:r.left+r.width/2, y:r.top+r.height/2, width:r.width, height:r.height }; })()`);
  await mouse(cdp, mobile.sessionId, "mousePressed", joy.x, joy.y, "left", 1, 1);
  await mouse(cdp, mobile.sessionId, "mouseMoved", joy.x, joy.y - joy.height * 0.22, "none", 1, 0);
  await sleep(80);
  const joystickUp = await cdp.evaluate(mobile.sessionId, `window.__sharedYardV0PlayableControl()`);
  assert(joystickUp.rawInput.z < -0.2, `joystick up must be raw forward (z<0), got ${JSON.stringify(joystickUp.rawInput)}`);
  assert(Math.hypot(joystickUp.worldInput.x, joystickUp.worldInput.z) > 0.2, `joystick world input missing ${JSON.stringify(joystickUp.worldInput)}`);
  await mouse(cdp, mobile.sessionId, "mouseReleased", joy.x, joy.y - joy.height * 0.22, "left", 0, 1);
  await sleep(80);
  const joystickReleased = await cdp.evaluate(mobile.sessionId, `window.__sharedYardV0PlayableControl()`);
  assert(Math.hypot(joystickReleased.rawInput.x, joystickReleased.rawInput.z) < 1e-6, `joystick did not release ${JSON.stringify(joystickReleased.rawInput)}`);

  // Preserve the live multiplayer verdict before exercising lifecycle persistence.
  const finalMobile = await cdp.evaluate(mobile.sessionId, `window.__sharedYardV0Evidence()`);
  const finalDesktop = await cdp.evaluate(desktop.sessionId, `window.__sharedYardV0Evidence()`);
  for (const [label, evidence] of [["mobile", finalMobile], ["desktop", finalDesktop]]) {
    assert(evidence.runtimeFailed === false, `${label} runtime failed ${evidence.runtimeFailureReason}`);
    assert(evidence.metrics.guardMismatches === 0, `${label} guard mismatch`);
    assert(evidence.metrics.remapFailures === 0, `${label} remap failure`);
    assert(evidence.metrics.guardMatches >= 1, `${label} missing exact B0`);
  }
  assert(finalDesktop.presentation.cameraPreset === "desktop-orbit", `desktop camera preset ${finalDesktop.presentation.cameraPreset}`);

  // Lifecycle evidence is intentionally tested only after the live verdict has been captured.
  const persisted = await cdp.evaluate(mobile.sessionId, `(() => { window.dispatchEvent(new Event("pagehide")); return window.__sharedYardV0LastEvidence?.(); })()`);
  assert(persisted?.persistedReason === "pagehide", `last-session persistence missing ${JSON.stringify(persisted)}`);
  assert(persisted?.uiRevision === EXPECTED_UI, `persisted UI revision drift ${persisted?.uiRevision}`);

  Object.assign(result, {
    verdict: "WORLD_V0_PLAYABLE_A1_PASS",
    run,
    before,
    afterDrag,
    joystickUp,
    persisted: {
      persistedReason: persisted.persistedReason,
      uiRevision: persisted.uiRevision,
      runtimeFailed: persisted.runtimeFailed,
    },
    final: { mobile: finalMobile, desktop: finalDesktop },
  });
  writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
  console.log("WORLD_V0_PLAYABLE_A1_PASS", JSON.stringify({ run, yawBefore: before.control.cameraOrbit.yaw, yawAfter: afterDrag.cameraOrbit.yaw, joystickRaw: joystickUp.rawInput }));
} catch (error) {
  result.error = error instanceof Error ? error.stack || error.message : String(error);
  result.chromeStderr = Buffer.concat(stderr).toString("utf8").slice(-8000);
  writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
  throw error;
} finally {
  cdp?.close();
  if (child.exitCode === null) child.kill("SIGKILL");
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* cleanup */ }
}
