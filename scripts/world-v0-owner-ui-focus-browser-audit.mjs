import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const BASE = (process.env.MW_WORLD_V0_OWNER_UI_BASE || "http://127.0.0.1:8787").replace(/\/$/, "");
const PAGE_URL = `${BASE}/world-v0/?run=owner-ui-audit`;
const PORT = 9971;
const TIMEOUT_MS = 30_000;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
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

async function waitDebugger() {
  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${PORT}/json/version`, { signal: AbortSignal.timeout(1000) });
      if (response.ok) {
        const value = await response.json();
        if (value.webSocketDebuggerUrl) return value;
      }
    } catch {}
    await sleep(100);
  }
  throw new Error("Chrome debugger unavailable");
}

async function waitFor(cdp, page, expression, label) {
  const deadline = Date.now() + TIMEOUT_MS;
  let last = null;
  while (Date.now() < deadline) {
    try { last = await cdp.evaluate(page, expression); if (last) return last; }
    catch (error) { last = error instanceof Error ? error.message : String(error); }
    await sleep(100);
  }
  throw new Error(`${label} timeout: ${JSON.stringify(last)}`);
}

async function key(cdp, page, type, keyValue, code, vk, text = undefined) {
  const payload = { type, key: keyValue, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk };
  if (text !== undefined) { payload.text = text; payload.unmodifiedText = text; }
  await cdp.call("Input.dispatchKeyEvent", payload, page);
}

const profile = mkdtempSync(join(tmpdir(), "mw-owner-ui-audit-"));
const chrome = findChrome();
const child = spawn(chrome, [
  "--headless=new", "--no-sandbox", "--disable-dev-shm-usage",
  "--disable-background-networking", "--disable-background-timer-throttling",
  "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding",
  "--use-gl=angle", "--use-angle=swiftshader-webgl", "--enable-unsafe-swiftshader",
  `--remote-debugging-port=${PORT}`, "--remote-debugging-address=127.0.0.1",
  `--user-data-dir=${profile}`, "about:blank",
], { stdio: ["ignore", "ignore", "pipe"] });
let cdp = null;
let desktop = null;
let mobile = null;
try {
  const info = await waitDebugger();
  cdp = new Cdp(info.webSocketDebuggerUrl);
  await cdp.opened;

  const d = await cdp.call("Target.createTarget", { url: PAGE_URL });
  desktop = (await cdp.call("Target.attachToTarget", { targetId: d.targetId, flatten: true })).sessionId;
  await cdp.call("Runtime.enable", {}, desktop);
  await cdp.call("Page.enable", {}, desktop);
  await waitFor(cdp, desktop, `document.readyState === "complete" && typeof window.__sharedYardV0PlayableControl === "function" && document.querySelector("#enter")?.disabled === false`, "desktop boot");

  const desktopControls = await cdp.evaluate(desktop, `(() => {
    document.querySelector("#jump-button")?.classList.remove("hidden");
    document.querySelector("#joystick")?.classList.add("active");
    document.querySelector("#camera-gimbal")?.classList.add("active");
    const display=(s)=>getComputedStyle(document.querySelector(s)).display;
    return { coarse: matchMedia("(pointer: coarse)").matches, joystick: display("#joystick"), gimbal: display("#camera-gimbal"), jump: display("#jump-button") };
  })()`);
  assert(desktopControls.joystick === "none" && desktopControls.gimbal === "none" && desktopControls.jump === "none", `desktop touch controls visible ${JSON.stringify(desktopControls)}`);

  await cdp.evaluate(desktop, `(() => {
    window.__ownerUiKeyTrace=[];
    addEventListener("keydown",e=>window.__ownerUiKeyTrace.push({type:"down",code:e.code}));
    addEventListener("keyup",e=>window.__ownerUiKeyTrace.push({type:"up",code:e.code}));
    const summary=document.querySelector("#hud summary");
    summary.focus();
    return document.activeElement===summary;
  })()`);

  await key(cdp, desktop, "keyDown", "w", "KeyW", 87, "w");
  const whileW = await cdp.evaluate(desktop, `({ trace: window.__ownerUiKeyTrace.slice(), raw: window.__sharedYardV0PlayableControl().rawInput, active: document.activeElement?.tagName })`);
  assert(whileW.trace.some((e) => e.code === "KeyW" && e.type === "down"), `focused Diagnostics still swallowed W ${JSON.stringify(whileW)}`);
  assert(Math.hypot(Number(whileW.raw?.x || 0), Number(whileW.raw?.z || 0)) > 0.5, `gameplay input did not receive focused-summary W ${JSON.stringify(whileW)}`);
  await key(cdp, desktop, "keyUp", "w", "KeyW", 87);
  const afterW = await cdp.evaluate(desktop, `window.__sharedYardV0PlayableControl().rawInput`);
  assert(Math.hypot(Number(afterW?.x || 0), Number(afterW?.z || 0)) < 0.01, `W keyup did not neutralize input ${JSON.stringify(afterW)}`);

  await cdp.evaluate(desktop, `window.__ownerUiKeyTrace=[]`);
  await key(cdp, desktop, "keyDown", " ", "Space", 32, " ");
  await key(cdp, desktop, "keyUp", " ", "Space", 32);
  const spaceTrace = await cdp.evaluate(desktop, `window.__ownerUiKeyTrace.slice()`);
  assert(!spaceTrace.some((e) => e.code === "Space"), `Diagnostics activation Space leaked to gameplay ${JSON.stringify(spaceTrace)}`);

  await cdp.evaluate(desktop, `(() => { window.__ownerUiKeyTrace=[]; const i=document.querySelector("#callsign"); i.value=""; i.focus(); return true; })()`);
  await key(cdp, desktop, "keyDown", "w", "KeyW", 87, "w");
  await key(cdp, desktop, "keyUp", "w", "KeyW", 87);
  const inputProbe = await cdp.evaluate(desktop, `({ value: document.querySelector("#callsign").value, trace: window.__ownerUiKeyTrace.slice() })`);
  assert(inputProbe.value === "w", `editable W typing regressed ${JSON.stringify(inputProbe)}`);
  assert(!inputProbe.trace.some((e) => e.code === "KeyW"), `editable W leaked to gameplay ${JSON.stringify(inputProbe)}`);

  const m = await cdp.call("Target.createTarget", { url: "about:blank" });
  mobile = (await cdp.call("Target.attachToTarget", { targetId: m.targetId, flatten: true })).sessionId;
  await cdp.call("Runtime.enable", {}, mobile);
  await cdp.call("Page.enable", {}, mobile);
  await cdp.call("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true, screenWidth: 390, screenHeight: 844 }, mobile);
  await cdp.call("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 }, mobile);
  await cdp.call("Page.navigate", { url: PAGE_URL }, mobile);
  await waitFor(cdp, mobile, `document.readyState === "complete" && document.querySelector("#enter")?.disabled === false`, "mobile boot");
  const mobileControls = await cdp.evaluate(mobile, `(() => {
    document.querySelector("#jump-button")?.classList.remove("hidden");
    const display=(s)=>getComputedStyle(document.querySelector(s)).display;
    return { coarse: matchMedia("(pointer: coarse)").matches, joystick: display("#joystick"), gimbal: display("#camera-gimbal"), jump: display("#jump-button") };
  })()`);
  assert(mobileControls.coarse === true, `mobile emulation did not expose coarse pointer ${JSON.stringify(mobileControls)}`);
  assert(mobileControls.joystick !== "none" && mobileControls.gimbal !== "none" && mobileControls.jump !== "none", `mobile touch controls hidden ${JSON.stringify(mobileControls)}`);

  console.log("WORLD_V0_OWNER_UI_FOCUS_BROWSER_PASS", JSON.stringify({ desktopControls, whileW, inputProbe, mobileControls }));
} finally {
  cdp?.close();
  if (child.exitCode === null) child.kill("SIGKILL");
  try { rmSync(profile, { recursive: true, force: true }); } catch {}
}
