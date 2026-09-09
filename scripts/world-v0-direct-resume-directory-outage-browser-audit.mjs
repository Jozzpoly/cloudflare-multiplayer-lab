import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const BASE = (process.env.MW_WORLD_V0_DIRECT_OUTAGE_BASE || "http://127.0.0.1:8787").replace(/\/$/, "");
const WS_BASE = BASE.replace(/^http/, "ws");
const ROOM = process.env.MW_WORLD_V0_DIRECT_OUTAGE_ROOM || "yard-2";
const PORT = 9911;
const TIMEOUT_MS = 30_000;

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function assert(value, message) { if (!value) throw new Error(message); }

async function waitFor(fn, label, timeout = TIMEOUT_MS) {
  const deadline = Date.now() + timeout;
  let last = null;
  while (Date.now() < deadline) {
    try { last = await fn(); if (last) return last; } catch (error) { last = error; }
    await sleep(80);
  }
  throw new Error(`${label} timeout · last=${last instanceof Error ? last.message : JSON.stringify(last)}`);
}

function rawClient(player) {
  const ws = new WebSocket(`${WS_BASE}/world-v0/ws?${new URLSearchParams({ run: ROOM, player })}`);
  const messages = [];
  ws.addEventListener("message", async (event) => {
    const raw = typeof event.data === "string" ? event.data : await event.data.text();
    try { messages.push(JSON.parse(raw)); } catch {}
  });
  return { ws, messages };
}

async function welcome(client, label) {
  return waitFor(() => client.messages.find((m) => m?.type === "world_v0_welcome") || false, label);
}

async function room() {
  const response = await fetch(`${BASE}/api/world-v0/rooms?r=${Date.now()}`, { cache: "no-store" });
  assert(response.ok, `directory HTTP ${response.status}`);
  const payload = await response.json();
  return payload.rooms?.find((value) => value.id === ROOM) || null;
}

function findChrome() {
  const override = process.env.CHROME_BIN?.trim();
  if (override) return override;
  const probe = spawnSync("bash", ["-lc", "command -v google-chrome || command -v google-chrome-stable || command -v chromium || command -v chromium-browser"], { encoding: "utf8" });
  const binary = probe.stdout.trim().split("\n")[0];
  if (!binary) throw new Error(`Chrome not found: ${probe.stderr || "no candidate"}`);
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
    const value = await this.call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, userGesture: true }, sessionId);
    if (value.exceptionDetails) throw new Error(value.exceptionDetails.text || "evaluate failed");
    return value.result?.value;
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
  }, "Chrome debugger");
}

await waitFor(async () => {
  try { return (await fetch(`${BASE}/api/ping`, { cache: "no-store" })).ok; } catch { return false; }
}, "worker ready", 20_000);

const a = rawClient("DirectOutageA");
const aw = await welcome(a, "A welcome");
const b = rawClient("DirectOutageB");
const bw = await welcome(b, "B welcome");
assert(aw.worldEpoch === bw.worldEpoch, "pair epoch mismatch");
assert(aw.protocolStartTick == null && bw.protocolStartTick == null, "apparatus expected prestart pair");
const oldEpoch = aw.worldEpoch;

a.ws.close(1000, "direct_outage_drop_a");
b.ws.close(1000, "direct_outage_drop_b");
await waitFor(async () => {
  const value = await room();
  return value?.worldEpoch === oldEpoch && value.connected === 0 && value.reserved === 2 ? value : false;
}, "vacant resumable room");

const stored = {
  revision: "world-v0-session-continuity-r3-live-rebind",
  runKey: ROOM,
  playerId: "DirectOutageA",
  worldEpoch: oldEpoch,
  sessionId: aw.selfSessionId,
  resumeToken: aw.resumeToken,
  netEntityId: aw.selfNetEntityId,
  slot: aw.slot,
  savedAt: new Date().toISOString(),
};

const profile = mkdtempSync(join(tmpdir(), "mw-direct-outage-"));
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
  const created = await cdp.call("Target.createTarget", { url: "about:blank" });
  const attached = await cdp.call("Target.attachToTarget", { targetId: created.targetId, flatten: true });
  page = attached.sessionId;
  await cdp.call("Runtime.enable", {}, page);
  await cdp.call("Page.enable", {}, page);

  const store = JSON.stringify({ revision: "world-v0-session-continuity-r3-live-rebind", sessions: { [ROOM]: stored } });
  const origin = new URL(BASE).origin;
  await cdp.call("Page.addScriptToEvaluateOnNewDocument", { source: `(() => {
    if (location.origin !== ${JSON.stringify(origin)}) return;
    localStorage.setItem("shared-yard-v0-actor-sessions-v1", ${JSON.stringify(store)});
    const originalFetch = window.fetch.bind(window);
    window.fetch = (...args) => {
      const target = String(args[0]?.url || args[0] || "");
      if (target.includes("/api/world-v0/rooms")) return Promise.reject(new TypeError("injected-directory-outage"));
      return originalFetch(...args);
    };
  })();` }, page);
  await cdp.call("Page.navigate", { url: `${BASE}/world-v0/?run=${encodeURIComponent(ROOM)}` }, page);

  await waitFor(async () => await cdp.evaluate(page, `document.readyState === "complete" && typeof window.__sharedYardV0FriendEntry === "function"`), "direct page boot");
  await sleep(2400);
  const entry = await cdp.evaluate(page, `window.__sharedYardV0FriendEntry()`);
  assert(entry.directLinkResumable === true, `valid local Resume authority was silently downgraded during directory outage: ${JSON.stringify(entry)}`);
  assert(entry.enterLabel === "Resume world", `outage resume label drift: ${JSON.stringify(entry)}`);

  await cdp.evaluate(page, `document.querySelector("#enter").click()`);
  const resumed = await waitFor(async () => {
    const session = await cdp.evaluate(page, `window.__sharedYardV0Session?.()`);
    return session?.actorSessionId ? session : false;
  }, "authority resume after directory outage");
  assert(resumed.actorSessionId === aw.selfSessionId, `ActorSession changed after outage resume: ${JSON.stringify(resumed)}`);
  assert(resumed.identity?.worldEpoch === oldEpoch || resumed.worldEpoch === oldEpoch, `WorldEpoch changed after outage resume: ${JSON.stringify(resumed)}`);

  console.log("WORLD_V0_DIRECT_RESUME_DIRECTORY_OUTAGE_PASS", JSON.stringify({
    room: ROOM,
    worldEpoch: oldEpoch,
    actorSessionId: aw.selfSessionId,
    directLinkResumable: entry.directLinkResumable,
    directoryFailedClosed: true,
  }));
} finally {
  try { a.ws.close(1000, "done"); } catch {}
  try { b.ws.close(1000, "done"); } catch {}
  cdp?.close();
  if (child.exitCode === null) child.kill("SIGKILL");
  try { rmSync(profile, { recursive: true, force: true }); } catch {}
}
