import net from "node:net";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const BASE = (process.env.MW_WORLD_V0_UNCOMMITTED_READY_BASE || "http://127.0.0.1:8787").replace(/\/$/, "");
const TARGET = new URL(BASE);
const PROXY_PORT = Number(process.env.MW_WORLD_V0_UNCOMMITTED_READY_PROXY_PORT || 8794);
const CHROME_PORT = Number(process.env.MW_WORLD_V0_UNCOMMITTED_READY_CHROME_PORT || 9282);
const OUTPUT = process.env.MW_WORLD_V0_UNCOMMITTED_READY_OUTPUT || "world-v0-closure-uncommitted-ready.json";
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
    const upstream = net.connect({ host: TARGET.hostname, port: Number(TARGET.port || 80) });
    upstream.setNoDelay(true);
    const pair = { client, upstream };
    pairs.add(pair);
    const retire = () => { pairs.delete(pair); hardClose(client); hardClose(upstream); };
    client.on("error", retire);
    upstream.on("error", retire);
    client.on("close", () => { pairs.delete(pair); hardClose(upstream); });
    upstream.on("close", () => { pairs.delete(pair); hardClose(client); });
    client.pipe(upstream);
    upstream.pipe(client);
  });
  return {
    async listen() { await new Promise((resolve, reject) => { server.once("error", reject); server.listen(PROXY_PORT, "127.0.0.1", resolve); }); },
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
      for (const pair of [...pairs]) { hardClose(pair.client); hardClose(pair.upstream); }
      pairs.clear();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

function connectRaw(run, player) {
  const wsBase = BASE.replace(/^http/, "ws");
  const ws = new WebSocket(`${wsBase}/world-v0/ws?${new URLSearchParams({ run, player })}`);
  const messages = [];
  const state = { opened: false, closed: false, closeCode: null, closeReason: null };
  ws.addEventListener("open", () => { state.opened = true; });
  ws.addEventListener("message", async (event) => {
    try {
      const raw = typeof event.data === "string" ? event.data : await event.data.text();
      messages.push(JSON.parse(raw));
    } catch {}
  });
  ws.addEventListener("close", (event) => {
    state.closed = true;
    state.closeCode = event.code;
    state.closeReason = event.reason;
  });
  return { ws, messages, state };
}
async function waitRaw(client, predicate, label, timeoutMs = TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = client.messages.find(predicate) || null;
    if (last) return last;
    await sleep(25);
  }
  throw new Error(`${label} timeout · messages=${JSON.stringify(client.messages.slice(-8))}`);
}
function identity(welcome) {
  return { worldId: welcome.worldId, worldEpoch: welcome.worldEpoch, simBuildId: welcome.simBuildId, clientSimRevision: welcome.clientSimRevision };
}
async function freshWelcome(run, player) {
  const client = connectRaw(run, player);
  const welcome = await waitRaw(client, (m) => m?.type === "world_v0_welcome", `${player} fresh welcome`);
  try { client.ws.close(1000, "uncommitted-ready-falsifier-done"); } catch {}
  return welcome;
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

const HOLD_READY_SCRIPT = `(() => {
  const NativeWebSocket = window.WebSocket;
  const nativeSend = NativeWebSocket.prototype.send;
  function WrappedWebSocket(...args) {
    const ws = new NativeWebSocket(...args);
    ws.addEventListener("message", (event) => {
      try {
        const message = JSON.parse(String(event.data));
        if (message?.type === "world_v0_welcome") window.__mwCapturedWelcome = {
          worldEpoch: message.worldEpoch,
          selfSessionId: message.selfSessionId,
          selfNetEntityId: message.selfNetEntityId,
          resumeToken: message.resumeToken,
        };
      } catch {}
    });
    return ws;
  }
  Object.setPrototypeOf(WrappedWebSocket, NativeWebSocket);
  WrappedWebSocket.prototype = NativeWebSocket.prototype;
  window.WebSocket = WrappedWebSocket;
  NativeWebSocket.prototype.send = function(data) {
    try {
      const message = JSON.parse(String(data));
      if (message?.type === "world_v0_ready" && (window.__mwHeldReadyCount || 0) === 0) {
        window.__mwHeldReadyCount = 1;
        window.__mwHeldReady = String(data);
        return;
      }
    } catch {}
    return nativeSend.call(this, data);
  };
})();`;

async function startBrowser(binary, url) {
  const profile = mkdtempSync(join(tmpdir(), "mw-uncommitted-ready-"));
  const child = spawn(binary, [
    "--headless=new", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
    "--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding",
    `--remote-debugging-port=${CHROME_PORT}`, "--remote-debugging-address=127.0.0.1", `--user-data-dir=${profile}`, "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"] });
  const info = await waitForDebugger(CHROME_PORT);
  const cdp = new Cdp(info.webSocketDebuggerUrl);
  await cdp.opened;
  const { targetId } = await cdp.call("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await cdp.call("Target.attachToTarget", { targetId, flatten: true });
  await cdp.call("Runtime.enable", {}, sessionId);
  await cdp.call("Page.enable", {}, sessionId);
  await cdp.call("Page.addScriptToEvaluateOnNewDocument", { source: HOLD_READY_SCRIPT }, sessionId);
  await cdp.call("Page.navigate", { url }, sessionId);
  return { profile, child, cdp, sessionId };
}
async function stopBrowser(browser) {
  if (!browser) return;
  browser.cdp?.close();
  if (browser.child?.exitCode === null) browser.child.kill("SIGKILL");
  await sleep(100);
  try { rmSync(browser.profile, { recursive: true, force: true }); } catch {}
}
async function evidence(browser) {
  return browser.cdp.evaluate(browser.sessionId, "window.__sharedYardV0Evidence ? window.__sharedYardV0Evidence() : null");
}
async function waitBrowser(browser, expression, label, timeoutMs = TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    try {
      last = await browser.cdp.evaluate(browser.sessionId, expression);
      if (last) return last;
    } catch (error) { last = error instanceof Error ? error.message : String(error); }
    await sleep(50);
  }
  throw new Error(`${label} timeout · last=${JSON.stringify(last)}`);
}

const chrome = findChrome();
const version = chromeVersion(chrome);
const proxy = createTcpProxy();
let browser = null;
let rawA = null;
let result = null;
try {
  await proxy.listen();
  const suffix = Date.now().toString(36).slice(-7);
  const run = `ur-${suffix}`;
  rawA = connectRaw(run, `ReadyA-${suffix}`);
  const aw = await waitRaw(rawA, (m) => m?.type === "world_v0_welcome", "A welcome");

  browser = await startBrowser(chrome, `http://127.0.0.1:${PROXY_PORT}/world-v0/?player=ReadyB-${suffix}&run=${run}`);
  await waitBrowser(browser,
    'document.readyState === "complete" && typeof window.__sharedYardV0Evidence === "function" && !document.querySelector("#enter")?.disabled',
    "browser boot");
  await browser.cdp.evaluate(browser.sessionId, 'document.querySelector("#enter").click(); true');
  await waitBrowser(browser,
    '(() => { const e=window.__sharedYardV0Evidence?.(); return window.__mwHeldReadyCount >= 1 && e?.networkState === "both connected · ready" && e?.protocolStartTick === null && e?.localBoundaryTick === null; })()',
    "B locally ready with outbound ready suppressed");

  const rosterA = await waitRaw(rawA, (m) => m?.type === "world_v0_roster" && m.players?.length === 2, "A two-player roster");
  rawA.ws.send(JSON.stringify({ type: "world_v0_ready", ...identity(aw) }));
  await waitRaw(rawA, (m) => m?.type === "world_v0_ready_ack", "A ready ack");
  await sleep(400);
  assert(!rawA.messages.some((m) => m?.type === "world_v0_start"), "authority committed start despite B ready never leaving browser");
  rawA.ws.send(JSON.stringify({ type: "world_v0_ping", id: "pre-drop-771" }));
  const pong = await waitRaw(rawA, (m) => m?.type === "world_v0_pong" && m.id === "pre-drop-771", "A pre-drop pong");
  assert(pong.protocolStartTick === null, `authority protocol unexpectedly committed: ${pong.protocolStartTick}`);

  const before = await evidence(browser);
  const captured = await browser.cdp.evaluate(browser.sessionId, "window.__mwCapturedWelcome");
  assert(captured?.worldEpoch === aw.worldEpoch, "A/B initial epoch mismatch");
  assert(typeof captured?.resumeToken === "string" && captured.resumeToken.length > 0, "B resume token missing");
  const drop = proxy.hardDropAll();
  assert(drop.activeBeforeDrop >= 1, `B proxy transport absent at drop: ${JSON.stringify(drop)}`);

  await waitBrowser(browser,
    '(() => { const e=window.__sharedYardV0Evidence?.(); return (e?.lifecycleEvents || []).some((event) => event.type === "actor-resume-attempt"); })()',
    "B automatic ambiguity recovery attempt", 8000);
  const afterDrop = await evidence(browser);

  await waitBrowser(browser,
    '(() => { const e=window.__sharedYardV0Evidence?.(); return !e?.runtimeFailed && (e?.lifecycleEvents || []).some((event) => event.type === "actor-resume-prestart-complete"); })()',
    "B prestart ActorSession resume complete", 8000);
  const resumedPreStart = await evidence(browser);
  assert(resumedPreStart.identity?.worldEpoch === aw.worldEpoch, "B prestart resume rotated WorldEpoch");
  assert(resumedPreStart.session?.actorSessionId === captured.selfSessionId, "B prestart resume changed ActorSession");
  assert(!rawA.messages.some((m) => m?.type === "world_v0_epoch_ended"), "authority ended ambiguity epoch during successful resume");

  const startA = await waitRaw(rawA, (m) => m?.type === "world_v0_start", "A start after B resumed ready", 8000);
  await waitBrowser(browser,
    '(() => { const e=window.__sharedYardV0Evidence?.(); return !e?.runtimeFailed && Number.isInteger(e?.protocolStartTick) && Number.isInteger(e?.localBoundaryTick); })()',
    "B active after ambiguity recovery", 8000);
  const activeB = await evidence(browser);
  assert(startA.worldEpoch === aw.worldEpoch, "authority rotated epoch before recovered start");
  assert(activeB.identity?.worldEpoch === aw.worldEpoch, "B active world rotated after ambiguity recovery");
  assert(activeB.session?.actorSessionId === captured.selfSessionId, "B active ActorSession changed after ambiguity recovery");
  assert(activeB.metrics?.guardMismatches === 0, "B exact-state guard mismatch after ambiguity recovery");
  assert(!rawA.messages.some((m) => m?.type === "world_v0_epoch_ended"), "authority ended recovered ambiguity epoch");

  result = {
    revision: "world-v0-closure-uncommitted-ready-v2-recovered",
    chromeVersion: version,
    run,
    authorityBeforeDrop: {
      worldEpoch: aw.worldEpoch,
      rosterPlayers: rosterA.players.length,
      protocolStartTick: pong.protocolStartTick,
      startObserved: false,
    },
    browserBeforeDrop: {
      networkState: before.networkState,
      protocolStartTick: before.protocolStartTick,
      localBoundaryTick: before.localBoundaryTick,
      heldReadyCount: await browser.cdp.evaluate(browser.sessionId, "window.__mwHeldReadyCount || 0"),
      actorSessionId: captured.selfSessionId,
    },
    recovery: {
      attemptObserved: (afterDrop.lifecycleEvents || []).some((event) => event.type === "actor-resume-attempt"),
      prestartResumeObserved: (resumedPreStart.lifecycleEvents || []).some((event) => event.type === "actor-resume-prestart-complete"),
      sameWorldEpoch: activeB.identity?.worldEpoch === aw.worldEpoch,
      sameActorSession: activeB.session?.actorSessionId === captured.selfSessionId,
      protocolStartTick: activeB.protocolStartTick,
      localBoundaryTick: activeB.localBoundaryTick,
      guardMismatches: activeB.metrics?.guardMismatches,
    },
    proxy: { drop, current: proxy.snapshot() },
    verdict: "WORLD_V0_CLOSURE_UNCOMMITTED_READY_RECOVERY_PASS",
    interpretation: "A two-player pre-start room remains resumable across the unavoidable ready-delivery ambiguity: the browser's first ready never reached authority, authority remained unscheduled, transport dropped, the same ActorSession resumed inside bounded grace, the browser re-sent ready, and the original WorldEpoch then started normally.",
    nonClaim: "This is a bounded local Chromium/Workerd causal proof. It does not provide persistence, process-loss recovery, cross-tab token persistence, or a guarantee beyond the configured pre-start ambiguity grace.",
  };
  writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
  console.log("WORLD_V0_CLOSURE_UNCOMMITTED_READY", JSON.stringify(result, null, 2));
  console.log(result.verdict);
} finally {
  try { rawA?.ws.close(1000, "uncommitted-ready-done"); } catch {}
  await stopBrowser(browser);
  try { await proxy.close(); } catch {}
}
