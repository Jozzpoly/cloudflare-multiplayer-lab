import net from "node:net";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const BASE = (process.env.MW_WORLD_V0_START_WINDOW_BASE || "http://127.0.0.1:8787").replace(/\/$/, "");
const TARGET = new URL(BASE);
const PROXY_PORT = Number(process.env.MW_WORLD_V0_START_WINDOW_PROXY_PORT || 8791);
const OUTPUT = process.env.MW_WORLD_V0_START_WINDOW_OUTPUT || "world-v0-closure-start-window.json";
const PORTS = [9262, 9263];
const TIMEOUT_MS = 30_000;

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function assert(condition, message) { if (!condition) throw new Error(message); }

function hardClose(socket) {
  if (!socket || socket.destroyed) return;
  try {
    if (typeof socket.resetAndDestroy === "function") socket.resetAndDestroy();
    else socket.destroy();
  } catch { try { socket.destroy(); } catch {} }
}

function createDirectionalProxy() {
  let blockDownstream = false;
  let accepted = 0;
  let blockedDownstreamChunks = 0;
  let blockedDownstreamBytes = 0;
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
    client.on("data", (chunk) => {
      if (!upstream.destroyed) upstream.write(chunk);
    });
    upstream.on("data", (chunk) => {
      if (blockDownstream) {
        blockedDownstreamChunks += 1;
        blockedDownstreamBytes += chunk.length;
        return;
      }
      if (!client.destroyed) client.write(chunk);
    });
  });
  return {
    async listen() {
      await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(PROXY_PORT, "127.0.0.1", resolve);
      });
    },
    blockDownstream() { blockDownstream = true; },
    unblockDownstream() { blockDownstream = false; },
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
    snapshot() {
      return { blockDownstream, activePairs: pairs.size, accepted, blockedDownstreamChunks, blockedDownstreamBytes, hardDrops };
    },
    async close() {
      blockDownstream = true;
      for (const pair of [...pairs]) {
        hardClose(pair.client);
        hardClose(pair.upstream);
      }
      pairs.clear();
      await new Promise((resolve) => server.close(() => resolve()));
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
  const deadline = Date.now() + 20_000;
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
  throw new Error(`CDP ${port} unavailable: ${last instanceof Error ? last.message : last}`);
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
        if (message?.type === "world_v0_welcome") {
          window.__mwCapturedWelcome = {
            worldId: message.worldId,
            worldEpoch: message.worldEpoch,
            selfSessionId: message.selfSessionId,
            selfNetEntityId: message.selfNetEntityId,
            resumeToken: message.resumeToken,
            protocolStartTick: message.protocolStartTick,
            resumed: message.resumed,
          };
        }
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
      if (message?.type === "world_v0_ready" && !window.__mwReadyReleased) {
        window.__mwHeldReady = { socket: this, data: String(data) };
        window.__mwReadyHeld = true;
        return;
      }
    } catch {}
    return nativeSend.call(this, data);
  };
  window.__mwReleaseReady = () => {
    const held = window.__mwHeldReady;
    if (!held || window.__mwReadyReleased) return false;
    window.__mwReadyReleased = true;
    nativeSend.call(held.socket, held.data);
    return true;
  };
})();`;

async function startClient(binary, index, url, preloadScript = null) {
  const port = PORTS[index];
  const profile = mkdtempSync(join(tmpdir(), `mw-start-window-${index}-`));
  const stderr = [];
  const child = spawn(binary, [
    "--headless=new", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
    "--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding",
    `--remote-debugging-port=${port}`, "--remote-debugging-address=127.0.0.1", `--user-data-dir=${profile}`, "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"] });
  child.stderr.on("data", (chunk) => stderr.push(chunk));
  const info = await waitForDebugger(port);
  const cdp = new Cdp(info.webSocketDebuggerUrl);
  await cdp.opened;
  const { targetId } = await cdp.call("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await cdp.call("Target.attachToTarget", { targetId, flatten: true });
  await cdp.call("Runtime.enable", {}, sessionId);
  await cdp.call("Page.enable", {}, sessionId);
  if (preloadScript) await cdp.call("Page.addScriptToEvaluateOnNewDocument", { source: preloadScript }, sessionId);
  await cdp.call("Page.navigate", { url }, sessionId);
  return { index, port, profile, stderr, child, cdp, sessionId, targetId };
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

const chrome = findChrome();
const version = chromeVersion(chrome);
const proxy = createDirectionalProxy();
const clients = [];
let runKey = null;
let result = null;
try {
  await proxy.listen();
  const suffix = Date.now().toString(36).slice(-7);
  runKey = `sw-${suffix}`;
  const playerA = `StartA-${suffix}`;
  const playerB = `StartB-${suffix}`;
  clients.push(await startClient(chrome, 0, `${BASE}/world-v0/?player=${playerA}&run=${runKey}`));
  clients.push(await startClient(chrome, 1, `http://127.0.0.1:${PROXY_PORT}/world-v0/?player=${playerB}&run=${runKey}`, HOLD_READY_SCRIPT));
  const [a, b] = clients;

  await Promise.all(clients.map((client, index) => waitFor(client,
    'document.readyState === "complete" && typeof window.__sharedYardV0Evidence === "function" && !document.querySelector("#enter")?.disabled',
    `client ${index} boot`)));

  await a.cdp.evaluate(a.sessionId, 'document.querySelector("#enter").click(); true');
  await waitFor(a,
    '(() => { const e=window.__sharedYardV0Evidence?.(); return Boolean(e?.session?.actorSessionId && e?.identity?.worldEpoch && e?.networkState === "waiting for peer"); })()',
    "A waiting-room admission");

  await b.cdp.evaluate(b.sessionId, 'document.querySelector("#enter").click(); true');
  await waitFor(b,
    '(() => Boolean(window.__mwReadyHeld && window.__mwCapturedWelcome?.resumeToken && window.__sharedYardV0Evidence?.().session?.actorSessionId))()',
    "B fresh welcome with ready held");

  const beforeB = await evidence(b);
  const capturedWelcome = await b.cdp.evaluate(b.sessionId, "window.__mwCapturedWelcome");
  assert(capturedWelcome?.resumed === false, "B initial welcome unexpectedly resumed");
  assert(typeof capturedWelcome?.resumeToken === "string" && capturedWelcome.resumeToken.length > 0, "B private resume token not captured");
  assert(beforeB.protocolStartTick === null, `B processed protocol start before release: ${beforeB.protocolStartTick}`);
  assert(beforeB.localBoundaryTick === null, `B local simulation existed before start: ${beforeB.localBoundaryTick}`);

  proxy.blockDownstream();
  const released = await b.cdp.evaluate(b.sessionId, "window.__mwReleaseReady()");
  assert(released === true, "B held ready could not be released");

  await waitFor(a,
    '(() => { const e=window.__sharedYardV0Evidence?.(); return Number.isInteger(e?.protocolStartTick) && Number.isInteger(e?.localBoundaryTick); })()',
    "A observes committed world_v0_start");
  const startedA = await evidence(a);
  assert(startedA.identity.worldEpoch === beforeB.identity.worldEpoch, "A/B epoch changed before targeted drop");

  const isolatedB = await evidence(b);
  assert(isolatedB.protocolStartTick === null, `blocked B unexpectedly processed start: ${isolatedB.protocolStartTick}`);
  assert(isolatedB.localBoundaryTick === null, `blocked B unexpectedly materialized local simulation: ${isolatedB.localBoundaryTick}`);
  const blockedProxy = proxy.snapshot();
  assert(blockedProxy.blockedDownstreamChunks > 0 && blockedProxy.blockedDownstreamBytes > 0,
    `proxy did not suppress authority->B traffic: ${JSON.stringify(blockedProxy)}`);

  const drop = proxy.hardDropAll();
  proxy.unblockDownstream();
  assert(drop.activeBeforeDrop >= 1, `no B transport existed at hard drop: ${JSON.stringify(drop)}`);

  await waitFor(b, `(() => {
    const e=window.__sharedYardV0Evidence?.();
    if (!e || e.runtimeFailed || e.session?.actorResume?.pending) return false;
    const pending=(e.lifecycleEvents || []).find((event) => event.type === "actor-resume-pending" && event.sourceBoundary === null);
    const attempt=(e.lifecycleEvents || []).find((event) => event.type === "actor-resume-attempt");
    const complete=(e.lifecycleEvents || []).find((event) => event.type === "actor-resume-complete" && event.bootstrapFromAuthority === true);
    return Boolean(pending && attempt && complete && Number.isInteger(e.protocolStartTick) && Number.isInteger(e.localBoundaryTick) && e.metrics?.guardMismatches === 0 && e.metrics?.rebases >= 1);
  })()`, "B automatic exact recovery from committed-start window", 25_000);

  const recoveredB = await evidence(b);
  const liveA = await evidence(a);
  const pendingEvent = (recoveredB.lifecycleEvents || []).find((event) => event.type === "actor-resume-pending" && event.sourceBoundary === null);
  const attemptEvent = (recoveredB.lifecycleEvents || []).find((event) => event.type === "actor-resume-attempt");
  const completeEvent = (recoveredB.lifecycleEvents || []).find((event) => event.type === "actor-resume-complete" && event.bootstrapFromAuthority === true);
  assert(pendingEvent && attemptEvent && completeEvent, "B recovery lifecycle evidence incomplete");
  assert(recoveredB.identity.worldEpoch === startedA.identity.worldEpoch, "B recovery rotated WorldEpoch");
  assert(recoveredB.session.actorSessionId === capturedWelcome.selfSessionId, "B recovery changed ActorSession identity");
  assert(recoveredB.session.selfNetEntityId === capturedWelcome.selfNetEntityId, "B recovery changed NetEntity identity");
  assert(recoveredB.protocolStartTick === startedA.protocolStartTick, "B recovered a different protocolStartTick");
  assert(recoveredB.metrics.guardMismatches === 0 && recoveredB.metrics.firstStateMismatch === null, "B exact-state guard failed after bootstrap resume");
  assert(recoveredB.metrics.rebases >= 1, "B did not apply authority rebase during bootstrap resume");
  assert(liveA.runtimeFailed === false, "healthy A failed during targeted B pre-start loss");
  assert(liveA.identity.worldEpoch === startedA.identity.worldEpoch, "healthy A WorldEpoch rotated after B drop");
  assert(Number.isInteger(liveA.protocolStartTick), "healthy A lost committed protocol start");

  result = {
    revision: "world-v0-closure-start-window-v2-recovered",
    runKey,
    chromeVersion: version,
    worldEpoch: startedA.identity.worldEpoch,
    browserB: {
      actorSessionId: capturedWelcome.selfSessionId,
      netEntityId: capturedWelcome.selfNetEntityId,
      beforeRelease: { networkState: beforeB.networkState, protocolStartTick: beforeB.protocolStartTick, localBoundaryTick: beforeB.localBoundaryTick },
      afterAuthorityStartWhileDownstreamBlocked: { networkState: isolatedB.networkState, protocolStartTick: isolatedB.protocolStartTick, localBoundaryTick: isolatedB.localBoundaryTick },
      recovered: {
        networkState: recoveredB.networkState,
        protocolStartTick: recoveredB.protocolStartTick,
        localBoundaryTick: recoveredB.localBoundaryTick,
        sameActorSession: recoveredB.session.actorSessionId === capturedWelcome.selfSessionId,
        sameNetEntity: recoveredB.session.selfNetEntityId === capturedWelcome.selfNetEntityId,
        sameWorldEpoch: recoveredB.identity.worldEpoch === startedA.identity.worldEpoch,
        rebaseBoundary: completeEvent.boundaryTick,
        guardMismatches: recoveredB.metrics.guardMismatches,
        rebases: recoveredB.metrics.rebases,
      },
    },
    healthyA: { protocolStartTick: liveA.protocolStartTick, localBoundaryTick: liveA.localBoundaryTick, runtimeFailed: liveA.runtimeFailed },
    proxy: { blocked: blockedProxy, drop },
    recoveryLifecycle: {
      pendingSourceBoundary: pendingEvent.sourceBoundary,
      firstAttempt: attemptEvent.attempt,
      bootstrapFromAuthority: completeEvent.bootstrapFromAuthority,
      recoveredBoundary: completeEvent.boundaryTick,
    },
    verdict: "WORLD_V0_CLOSURE_START_WINDOW_BROWSER_RECOVERY_PASS",
    interpretation: "Authority committed the run while world_v0_start was suppressed from one admitted browser; after an abnormal transport loss, that browser automatically rebound the same ActorSession and bootstrapped exact active-world state from the authority recording seed without ever having received the original start state.",
    nonClaim: "This is a deliberately isolated local Chromium/Workerd handshake-window proof using directional proxy suppression. It does not estimate real-world incidence, mobile radio behavior, process loss, persistence, or tab-destruction continuity.",
  };
  writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
  console.log("WORLD_V0_CLOSURE_START_WINDOW", JSON.stringify(result, null, 2));
  console.log(result.verdict);
} catch (error) {
  const diagnostic = {
    revision: "world-v0-closure-start-window-v1",
    runKey,
    chromeVersion: version,
    verdict: "WORLD_V0_CLOSURE_START_WINDOW_APPARATUS_FAIL",
    error: error instanceof Error ? error.stack || error.message : String(error),
    proxy: proxy.snapshot(),
    pages: [],
  };
  for (const client of clients) {
    try { diagnostic.pages.push(await evidence(client)); }
    catch (pageError) { diagnostic.pages.push({ error: pageError instanceof Error ? pageError.message : String(pageError) }); }
  }
  writeFileSync(OUTPUT, JSON.stringify(diagnostic, null, 2));
  console.error(diagnostic.error);
  process.exitCode = 1;
} finally {
  proxy.unblockDownstream();
  await Promise.all(clients.map(stopClient));
  try { await proxy.close(); } catch {}
}
