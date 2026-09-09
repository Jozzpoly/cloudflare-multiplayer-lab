import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const BASE = (process.env.MW_WORLD_V0_JOIN_CLARITY_BASE || "http://127.0.0.1:8787").replace(/\/$/, "");
const WS_BASE = BASE.replace(/^http/, "ws");
const FULL_ROOM = process.env.MW_WORLD_V0_JOIN_CLARITY_FULL_ROOM || "yard-1";
const TRANSPORT_ROOM = process.env.MW_WORLD_V0_JOIN_CLARITY_TRANSPORT_ROOM || "yard-2";
const PORT = 9931;
const TIMEOUT_MS = 45_000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function assert(value, message) { if (!value) throw new Error(message); }

async function waitFor(fn, label, timeout = TIMEOUT_MS) {
  const deadline = Date.now() + timeout;
  let last = null;
  while (Date.now() < deadline) {
    try { last = await fn(); if (last) return last; } catch (error) { last = error; }
    await sleep(100);
  }
  throw new Error(`${label} timeout · ${last instanceof Error ? last.message : JSON.stringify(last)}`);
}

function rawClient(room, player) {
  const params = new URLSearchParams({ run: room, player });
  const ws = new WebSocket(`${WS_BASE}/world-v0/ws?${params}`);
  const messages = [];
  ws.addEventListener("message", async (event) => {
    const raw = typeof event.data === "string" ? event.data : await event.data.text();
    try { messages.push(JSON.parse(raw)); } catch {}
  });
  return { ws, messages };
}

async function welcome(client, label) {
  return waitFor(() => client.messages.find((message) => message?.type === "world_v0_welcome") || false, label, 15_000);
}

function findChrome() {
  const override = process.env.CHROME_BIN?.trim();
  if (override) return override;
  const probe = spawnSync("bash", ["-lc", "command -v google-chrome || command -v google-chrome-stable || command -v chromium || command -v chromium-browser"], { encoding: "utf8" });
  const binary = probe.stdout.trim().split("\n")[0];
  if (!binary) throw new Error(`Chrome/Chromium not found: ${probe.stderr || "no candidate"}`);
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
  async call(method, params = {}, sessionId) {
    await this.opened;
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
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
  return waitFor(async () => {
    try {
      const response = await fetch(`http://127.0.0.1:${PORT}/json/version`, { signal: AbortSignal.timeout(1000) });
      if (!response.ok) return false;
      const value = await response.json();
      return value.webSocketDebuggerUrl ? value : false;
    } catch { return false; }
  }, "Chrome debugger", 20_000);
}

async function navigate(cdp, page, url) {
  await cdp.call("Page.navigate", { url }, page);
  await waitFor(async () => await cdp.evaluate(page, `document.readyState === "complete" && typeof window.__sharedYardV0Evidence === "function" && document.querySelector("#enter")?.disabled === false`), `page ready ${url}`, 30_000);
}

async function setEntry(cdp, page, callsign) {
  return cdp.evaluate(page, `(() => {
    const input = document.querySelector("#callsign");
    input.value = ${JSON.stringify(callsign)};
    input.dispatchEvent(new Event("input", { bubbles: true }));
    return { disabled: document.querySelector("#enter")?.disabled, label: document.querySelector("#enter")?.textContent };
  })()`);
}

await waitFor(async () => {
  try { return (await fetch(`${BASE}/api/ping`, { cache: "no-store" })).ok; } catch { return false; }
}, "local worker", 20_000);

const fullA = rawClient(FULL_ROOM, "ClarityFullA");
const aw = await welcome(fullA, "full A welcome");
const fullB = rawClient(FULL_ROOM, "ClarityFullB");
const bw = await welcome(fullB, "full B welcome");
assert(aw.worldEpoch === bw.worldEpoch, "full room epoch mismatch");

const profile = mkdtempSync(join(tmpdir(), "mw-join-clarity-"));
const child = spawn(findChrome(), [
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
  const created = await cdp.call("Target.createTarget", { url: "about:blank" });
  const attached = await cdp.call("Target.attachToTarget", { targetId: created.targetId, flatten: true });
  page = attached.sessionId;
  await cdp.call("Runtime.enable", {}, page);
  await cdp.call("Page.enable", {}, page);

  await navigate(cdp, page, `${BASE}/world-v0/?run=${encodeURIComponent(FULL_ROOM)}`);
  await setEntry(cdp, page, "ClarityFreshThird");
  await cdp.evaluate(page, `document.querySelector("#enter").click()`);
  const capacity = await waitFor(async () => {
    const evidence = await cdp.evaluate(page, `window.__sharedYardV0Evidence?.()`);
    return evidence?.session?.end?.classification === "capacity-full" ? evidence : false;
  }, "capacity classification", 15_000);
  const capacityNotice = await cdp.evaluate(page, `document.querySelector("#notice")?.textContent || ""`);
  assert(capacityNotice.includes("full right now"), `capacity notice not specific: ${capacityNotice}`);
  assert(!capacityNotice.includes("temporarily unreachable"), `old conflated notice survived: ${capacityNotice}`);
  assert(capacity.networkState === "join failed · capacity-full", `capacity network state drift: ${capacity.networkState}`);

  await cdp.call("Page.addScriptToEvaluateOnNewDocument", { source: `(() => {
    const NativeWebSocket = window.WebSocket;
    window.WebSocket = class ForcedJoinFailureWebSocket extends NativeWebSocket {
      constructor() { super("ws://127.0.0.1:9/world-v0-forced-failure"); }
    };
  })();` }, page);
  await navigate(cdp, page, `${BASE}/world-v0/?run=${encodeURIComponent(TRANSPORT_ROOM)}`);
  await setEntry(cdp, page, "ClarityTransport");
  await cdp.evaluate(page, `document.querySelector("#enter").click()`);
  const transport = await waitFor(async () => {
    const evidence = await cdp.evaluate(page, `window.__sharedYardV0Evidence?.()`);
    return evidence?.session?.end?.classification === "connection-handshake" ? evidence : false;
  }, "transport classification", 15_000);
  const transportNotice = await cdp.evaluate(page, `document.querySelector("#notice")?.textContent || ""`);
  assert(transportNotice.includes("connection or handshake problem"), `transport notice not specific: ${transportNotice}`);
  assert(!transportNotice.includes("full"), `transport incorrectly blamed capacity: ${transportNotice}`);
  assert(transport.networkState === "join failed · connection-handshake", `transport network state drift: ${transport.networkState}`);

  console.log("WORLD_V0_JOIN_FAILURE_CLARITY_BROWSER_PASS", JSON.stringify({
    capacity: { classification: capacity.session.end.classification, notice: capacityNotice },
    transport: { classification: transport.session.end.classification, notice: transportNotice },
  }));
} finally {
  try { fullA.ws.close(1000, "done"); } catch {}
  try { fullB.ws.close(1000, "done"); } catch {}
  cdp?.close();
  if (child.exitCode === null) child.kill("SIGKILL");
  try { rmSync(profile, { recursive: true, force: true }); } catch {}
}
