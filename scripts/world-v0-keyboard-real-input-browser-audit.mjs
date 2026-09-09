import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const BASE = (process.env.MW_WORLD_V0_KEYBOARD_REAL_BASE || "http://127.0.0.1:8787").replace(/\/$/, "");
const URL = `${BASE}/world-v0/?run=keyboard-real`;
const PORT = 9891;
const TIMEOUT_MS = 30_000;

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

async function waitDebugger() {
  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${PORT}/json/version`, { signal: AbortSignal.timeout(1200) });
      if (response.ok) {
        const value = await response.json();
        if (value.webSocketDebuggerUrl) return value;
      }
    } catch {}
    await sleep(100);
  }
  throw new Error("Chrome debugger unavailable");
}

const profile = mkdtempSync(join(tmpdir(), "mw-keyboard-real-"));
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
let page = null;
try {
  const info = await waitDebugger();
  cdp = new Cdp(info.webSocketDebuggerUrl);
  await cdp.opened;
  const created = await cdp.call("Target.createTarget", { url: URL });
  const attached = await cdp.call("Target.attachToTarget", { targetId: created.targetId, flatten: true });
  page = attached.sessionId;
  await cdp.call("Runtime.enable", {}, page);
  await cdp.call("Page.enable", {}, page);

  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    const ready = await cdp.evaluate(page, `document.readyState === "complete" && document.querySelector("#enter")?.disabled === false`);
    if (ready) break;
    await sleep(100);
  }
  assert(await cdp.evaluate(page, `document.querySelector("#enter")?.disabled === false`), "entry never became ready");

  await cdp.evaluate(page, `(() => { const i = document.querySelector("#callsign"); i.value = ""; i.focus(); return document.activeElement === i; })()`);

  const keys = [
    ["w", "KeyW", 87], ["a", "KeyA", 65], ["s", "KeyS", 83], ["d", "KeyD", 68],
    ["W", "KeyW", 87], ["A", "KeyA", 65], ["S", "KeyS", 83], ["D", "KeyD", 68],
  ];
  for (const [key, code, vk] of keys) {
    await cdp.call("Input.dispatchKeyEvent", {
      type: "keyDown",
      key,
      code,
      text: key,
      unmodifiedText: key,
      windowsVirtualKeyCode: vk,
      nativeVirtualKeyCode: vk,
    }, page);
    await cdp.call("Input.dispatchKeyEvent", {
      type: "keyUp",
      key,
      code,
      windowsVirtualKeyCode: vk,
      nativeVirtualKeyCode: vk,
    }, page);
  }

  const snapshot = await cdp.evaluate(page, `({
    value: document.querySelector("#callsign")?.value || "",
    active: document.activeElement?.id || null,
    network: window.__sharedYardV0Session?.().networkState || null,
  })`);
  assert(snapshot.value === "wasdWASD", `real keyboard text interception regression: ${JSON.stringify(snapshot)}`);
  assert(snapshot.active === "callsign", `callsign lost focus: ${snapshot.active}`);
  assert(snapshot.network === "idle", `typing touched gameplay/network state: ${snapshot.network}`);

  console.log("WORLD_V0_KEYBOARD_REAL_INPUT_PASS", JSON.stringify(snapshot));
} finally {
  cdp?.close();
  if (child.exitCode === null) child.kill("SIGKILL");
  try { rmSync(profile, { recursive: true, force: true }); } catch {}
}
