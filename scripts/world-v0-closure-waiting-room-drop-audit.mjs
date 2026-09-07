import net from "node:net";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const BASE = (process.env.MW_WORLD_V0_WAITING_DROP_BASE || "http://127.0.0.1:8787").replace(/\/$/, "");
const TARGET = new URL(BASE);
const PROXY_PORT = Number(process.env.MW_WORLD_V0_WAITING_DROP_PROXY_PORT || 8793);
const CHROME_PORT = Number(process.env.MW_WORLD_V0_WAITING_DROP_CHROME_PORT || 9272);
const OUTPUT = process.env.MW_WORLD_V0_WAITING_DROP_OUTPUT || "world-v0-closure-waiting-room-drop.json";
const TIMEOUT_MS = 20_000;

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function assert(condition, message) { if (!condition) throw new Error(message); }
function hardClose(socket) {
  if (!socket || socket.destroyed) return;
  try {
    if (typeof socket.resetAndDestroy === "function") socket.resetAndDestroy();
    else socket.destroy();
  } catch { try { socket.destroy(); } catch {} }
}

function createTcpProxy() {
  let accepted = 0;
  let hardDrops = 0;
  const pairs = new Set();
  const server = net.createServer((client) => {
    accepted += 1;
    client.setNoDelay(true);
    const upstream = net.connect({
      host: TARGET.hostname,
      port: Number(TARGET.port || (TARGET.protocol === "https:" ? 443 : 80)),
    });
    upstream.setNoDelay(true);
    const pair = { client, upstream };
    pairs.add(pair);
    const retire = () => {
      pairs.delete(pair);
      hardClose(client);
      hardClose(upstream);
    };
    client.on("error", retire);
    upstream.on("error", retire);
    client.on("close", () => { pairs.delete(pair); hardClose(upstream); });
    upstream.on("close", () => { pairs.delete(pair); hardClose(client); });
    client.pipe(upstream);
    upstream.pipe(client);
  });
  return {
    async listen() {
      await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(PROXY_PORT, "127.0.0.1", resolve);
      });
    },
    hardDropAll() {
      const activeBeforeDrop = pairs.size;
      for (const pair of [...pairs]) {
        hardDrops += 1;
        hardClose(pair.client);
        hardClose(pair.upstream);
        pairs.delete(pair);
      }
      return { activeBeforeDrop, hardDrops };
    },
    snapshot() { return { activePairs: pairs.size, accepted, hardDrops }; },
    async close() {
      for (const pair of [...pairs]) {
        hardClose(pair.client);
        hardClose(pair.upstream);
      }
      pairs.clear();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

function findChrome() {
  const override = process.env.CHROME_BIN?.trim();
  if (override) return override;
  const probe = spawnSync("bash", ["-lc", "command -v google-chrome || command -v google-chrome-stable || command -v chromium || command -v chromium-browser"], { encoding: "utf8" });
  const binary = probe.stdout.trim().split("\n")[0];
  if (!binary) throw new Error(`Chrome binary not found: ${probe.stderr || "no candidate"}`);
  return binary;
}
function chromeVersion(binary) {
  const result = spawnSync(binary, ["--version"], { encoding: "utf8" });
  return (result.stdout || result.stderr || "unknown").trim();
}
async function waitForDebugger(port) {
  const deadline = Date.now() + TIMEOUT_MS;
  let last = null;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) {
        const value = await response.json();
        if (value.webSocketDebuggerUrl) return value;
      }
    } catch (error) { last = error; }
    await sleep(100);
  }
  throw new Error(`CDP unavailable: ${last instanceof Error ? last.message : last}`);
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
    if (result.exceptionDetails) throw new Error(`browser evaluate failed: ${result.exceptionDetails.text}`);
    return result.result?.value;
  }
  close() { try { this.ws.close(); } catch {} }
}

async function startClient(binary, url) {
  const profile = mkdtempSync(join(tmpdir(), "mw-wait-drop-"));
  const child = spawn(binary, [
    "--headless=new", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
    "--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding",
    `--remote-debugging-port=${CHROME_PORT}`, "--remote-debugging-address=127.0.0.1", `--user-data-dir=${profile}`, "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"] });
  const info = await waitForDebugger(CHROME_PORT);
  const cdp = new Cdp(info.webSocketDebuggerUrl);
  await cdp.opened;
  const { targetId } = await cdp.call("Target.createTarget", { url });
  const { sessionId } = await cdp.call("Target.attachToTarget", { targetId, flatten: true });
  await cdp.call("Runtime.enable", {}, sessionId);
  await cdp.call("Page.enable", {}, sessionId);
  return { profile, child, cdp, sessionId };
}
async function stopClient(client) {
  if (!client) return;
  client.cdp?.close();
  if (client.child?.exitCode === null) client.child.kill("SIGKILL");
  await sleep(100);
  try { rmSync(client.profile, { recursive: true, force: true }); } catch {}
}
async function evidence(client) {
  return client.cdp.evaluate(client.sessionId, "window.__sharedYardV0Evidence ? window.__sharedYardV0Evidence() : null");
}
async function waitFor(client, expression, label, timeoutMs = TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    try {
      last = await client.cdp.evaluate(client.sessionId, expression);
      if (last) return last;
    } catch (error) { last = error instanceof Error ? error.message : String(error); }
    await sleep(50);
  }
  throw new Error(`${label} timeout · last=${JSON.stringify(last)}`);
}

async function freshWelcome(runKey, playerId) {
  const wsBase = BASE.replace(/^http/, "ws");
  const params = new URLSearchParams({ run: runKey, player: playerId });
  const ws = new WebSocket(`${wsBase}/world-v0/ws?${params}`);
  return await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { try { ws.close(); } catch {} reject(new Error("fresh replacement welcome timeout")); }, 8000);
    ws.addEventListener("message", async (event) => {
      try {
        const raw = typeof event.data === "string" ? event.data : await event.data.text();
        const message = JSON.parse(raw);
        if (message?.type !== "world_v0_welcome") return;
        clearTimeout(timer);
        try { ws.close(1000, "waiting-room-falsifier-done"); } catch {}
        resolve(message);
      } catch (error) { clearTimeout(timer); reject(error); }
    });
    ws.addEventListener("error", () => { clearTimeout(timer); reject(new Error("fresh replacement websocket error")); }, { once: true });
  });
}

const chrome = findChrome();
const version = chromeVersion(chrome);
const proxy = createTcpProxy();
let client = null;
let result = null;
try {
  await proxy.listen();
  const suffix = Date.now().toString(36).slice(-7);
  const runKey = `wd-${suffix}`;
  const player = `Wait-${suffix}`;
  client = await startClient(chrome, `http://127.0.0.1:${PROXY_PORT}/world-v0/?player=${player}&run=${runKey}`);
  await waitFor(client,
    'document.readyState === "complete" && typeof window.__sharedYardV0Evidence === "function" && !document.querySelector("#enter")?.disabled',
    "browser boot");
  await client.cdp.evaluate(client.sessionId, 'document.querySelector("#enter").click(); true');
  await waitFor(client,
    '(() => { const e=window.__sharedYardV0Evidence?.(); return e?.networkState === "waiting for peer" && Boolean(e?.identity?.worldEpoch) && Boolean(e?.session?.actorSessionId) && e?.protocolStartTick === null && e?.localBoundaryTick === null; })()',
    "waiting-room admission");

  const before = await evidence(client);
  const oldEpoch = before.identity.worldEpoch;
  const oldSession = before.session.actorSessionId;
  const drop = proxy.hardDropAll();
  assert(drop.activeBeforeDrop >= 1, `proxy did not own browser transport: ${JSON.stringify(drop)}`);

  await waitFor(client,
    '(() => { const e=window.__sharedYardV0Evidence?.(); return String(e?.networkState || "").startsWith("closed") && e?.session?.actorResume?.pending === false; })()',
    "waiting-room fail-closed transport state", 8000);
  await sleep(500);
  const after = await evidence(client);
  assert(after.protocolStartTick === null && after.localBoundaryTick === null, "waiting-room browser unexpectedly entered active simulation");
  assert(after.session.actorResume.pending === false, "waiting-room browser incorrectly armed ActorSession resume");
  assert(after.session.actorResume.attempts === 0, `waiting-room browser spent ActorSession retry budget: ${after.session.actorResume.attempts}`);
  assert(after.runtimeFailed === false, "waiting-room fail-closed path became runtime failure");

  await sleep(200);
  const replacement = await freshWelcome(runKey, `Fresh-${suffix}`);
  assert(replacement.resumed === false, "replacement actor unexpectedly resumed old session");
  assert(replacement.worldEpoch !== oldEpoch, "authority did not retire waiting-room epoch after disconnect");
  assert(replacement.selfSessionId !== oldSession, "replacement reused retired ActorSession identity");

  result = {
    revision: "world-v0-closure-waiting-room-drop-v2-fail-closed",
    chromeVersion: version,
    runKey,
    before: {
      worldEpoch: oldEpoch,
      actorSessionId: oldSession,
      networkState: before.networkState,
      protocolStartTick: before.protocolStartTick,
      localBoundaryTick: before.localBoundaryTick,
    },
    afterDrop: {
      networkState: after.networkState,
      protocolStartTick: after.protocolStartTick,
      localBoundaryTick: after.localBoundaryTick,
      actorResumePending: after.session.actorResume.pending,
      actorResumeAttempts: after.session.actorResume.attempts,
      runtimeFailed: after.runtimeFailed,
    },
    authorityReplacement: {
      worldEpoch: replacement.worldEpoch,
      actorSessionId: replacement.selfSessionId,
      oldEpochRetired: replacement.worldEpoch !== oldEpoch,
      oldSessionRetired: replacement.selfSessionId !== oldSession,
    },
    proxy: { drop, current: proxy.snapshot() },
    verdict: "WORLD_V0_CLOSURE_WAITING_ROOM_FAIL_CLOSED_PASS",
    interpretation: "A pure pre-start waiting-room transport loss remains fail-closed: the browser does not arm ActorSession recovery, while authority retires the old WorldEpoch/ActorSession and a fresh actor receives a new epoch.",
    nonClaim: "This is a local Chromium/Workerd lifecycle falsifier. It does not estimate production incidence or network quality.",
  };
  writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
  console.log("WORLD_V0_CLOSURE_WAITING_ROOM_DROP", JSON.stringify(result, null, 2));
  console.log(result.verdict);
} finally {
  await stopClient(client);
  try { await proxy.close(); } catch {}
}
