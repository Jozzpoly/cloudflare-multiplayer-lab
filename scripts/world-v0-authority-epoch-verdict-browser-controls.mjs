import http from "node:http";
import net from "node:net";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const BASE = (process.env.MW_WORLD_V0_AUTHORITY_VERDICT_BASE || "http://127.0.0.1:8796").replace(/\/$/, "");
const OUTPUT = process.env.MW_WORLD_V0_AUTHORITY_VERDICT_OUTPUT || "world-v0-authority-epoch-verdict-controls.json";
const PROXY_PORT = Number(process.env.MW_WORLD_V0_AUTHORITY_VERDICT_PROXY_PORT || 8797);
const PROXY_BASE = `http://127.0.0.1:${PROXY_PORT}`;
const PORTS = [9971, 9972];
const TIMEOUT_MS = 45_000;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function assert(value, message) { if (!value) throw new Error(message); }
function hardClose(socket) {
  if (!socket || socket.destroyed) return;
  try {
    if (typeof socket.resetAndDestroy === "function") socket.resetAndDestroy();
    else socket.destroy();
  } catch { try { socket.destroy(); } catch {} }
}

function createSelectiveProxy() {
  const target = new URL(BASE);
  const targetHost = target.hostname;
  const targetPort = Number(target.port || 80);
  let blockWs = false;
  let blockDirectory = false;
  let acceptedWs = 0;
  let blockedWs = 0;
  let directoryRequests = 0;
  let blockedDirectory = 0;
  let hardDrops = 0;
  const pairs = new Set();

  const server = http.createServer((req, res) => {
    if (req.url?.startsWith("/api/world-v0/rooms")) {
      directoryRequests += 1;
      if (blockDirectory) {
        blockedDirectory += 1;
        hardClose(req.socket);
        return;
      }
    }
    const upstream = http.request({
      hostname: targetHost,
      port: targetPort,
      method: req.method,
      path: req.url,
      headers: { ...req.headers, host: target.host },
    }, (upstreamResponse) => {
      res.writeHead(upstreamResponse.statusCode || 502, upstreamResponse.headers);
      upstreamResponse.pipe(res);
    });
    upstream.on("error", () => {
      if (!res.headersSent) res.writeHead(502, { "content-type": "text/plain" });
      res.end("proxy upstream error");
    });
    req.pipe(upstream);
  });

  server.on("upgrade", (req, client, head) => {
    if (req.url?.startsWith("/world-v0/ws")) {
      acceptedWs += 1;
      if (blockWs) {
        blockedWs += 1;
        hardClose(client);
        return;
      }
    }
    const upstream = net.connect({ host: targetHost, port: targetPort });
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
    upstream.on("connect", () => {
      let request = `${req.method} ${req.url} HTTP/${req.httpVersion}\r\n`;
      for (let i = 0; i < req.rawHeaders.length; i += 2) {
        const name = req.rawHeaders[i];
        const value = req.rawHeaders[i + 1];
        request += `${name}: ${value}\r\n`;
      }
      request += "\r\n";
      upstream.write(request);
      if (head?.length) upstream.write(head);
      client.pipe(upstream);
      upstream.pipe(client);
    });
  });

  return {
    async listen() {
      await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(PROXY_PORT, "127.0.0.1", resolve);
      });
    },
    setMode({ ws, directory }) {
      blockWs = Boolean(ws);
      blockDirectory = Boolean(directory);
    },
    dropActiveWebSockets() {
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
      return { blockWs, blockDirectory, activePairs: pairs.size, acceptedWs, blockedWs, directoryRequests, blockedDirectory, hardDrops };
    },
    async close() {
      blockWs = true;
      blockDirectory = true;
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

async function waitDebugger(port) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(1000) });
      if (response.ok) {
        const value = await response.json();
        if (value.webSocketDebuggerUrl) return value;
      }
    } catch {}
    await sleep(100);
  }
  throw new Error(`Chrome debugger ${port} unavailable`);
}

async function startBrowser(binary, index, url) {
  const profile = mkdtempSync(join(tmpdir(), `mw-authority-verdict-${index}-`));
  const child = spawn(binary, [
    "--headless=new", "--no-sandbox", "--disable-dev-shm-usage",
    "--disable-background-networking", "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding",
    "--use-gl=angle", "--use-angle=swiftshader-webgl", "--enable-unsafe-swiftshader",
    `--remote-debugging-port=${PORTS[index]}`, "--remote-debugging-address=127.0.0.1",
    `--user-data-dir=${profile}`, "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"] });
  const stderr = [];
  child.stderr.on("data", (chunk) => stderr.push(chunk));
  const info = await waitDebugger(PORTS[index]);
  const cdp = new Cdp(info.webSocketDebuggerUrl);
  await cdp.opened;
  const created = await cdp.call("Target.createTarget", { url });
  const attached = await cdp.call("Target.attachToTarget", { targetId: created.targetId, flatten: true });
  await cdp.call("Runtime.enable", {}, attached.sessionId);
  await cdp.call("Page.enable", {}, attached.sessionId);
  return { profile, child, stderr, cdp, targetId: created.targetId, sessionId: attached.sessionId };
}
async function stopBrowser(browser) {
  if (!browser) return;
  browser.cdp?.close();
  if (browser.child?.exitCode === null) browser.child.kill("SIGKILL");
  await sleep(120);
  try { rmSync(browser.profile, { recursive: true, force: true }); } catch {}
}
async function evalIn(browser, expression) { return browser.cdp.evaluate(browser.sessionId, expression); }
async function evidence(browser) { return evalIn(browser, `window.__sharedYardV0Evidence?.()`); }
async function waitFor(browser, expression, label, timeout = TIMEOUT_MS) {
  const deadline = Date.now() + timeout;
  let last = null;
  while (Date.now() < deadline) {
    try { last = await evalIn(browser, expression); if (last) return last; }
    catch (error) { last = error instanceof Error ? error.message : String(error); }
    await sleep(35);
  }
  throw new Error(`${label} timeout · last=${JSON.stringify(last)}`);
}
async function bootAndEnter(browser) {
  await waitFor(browser, `document.readyState === "complete" && typeof window.__sharedYardV0Evidence === "function" && document.querySelector("#enter")?.disabled === false`, "boot");
  await evalIn(browser, `document.querySelector("#enter").click(); true`);
}

const chrome = findChrome();
const proxy = createSelectiveProxy();

async function runCase({ room, mode, suffix }) {
  let a = null, b = null;
  proxy.setMode({ ws: false, directory: false });
  try {
    a = await startBrowser(chrome, 0, `${PROXY_BASE}/world-v0/?player=VerdictA-${suffix}&run=${room}`);
    b = await startBrowser(chrome, 1, `${BASE}/world-v0/?player=VerdictB-${suffix}&run=${room}`);
    await bootAndEnter(a); await bootAndEnter(b);
    const liveExpr = `(() => { const e=window.__sharedYardV0Evidence?.(); return e && !e.runtimeFailed && e.identity?.worldEpoch && Number.isInteger(e.protocolStartTick) && Number.isInteger(e.localBoundaryTick) && e.localBoundaryTick>=e.protocolStartTick+40 && e.metrics?.guardMismatches===0; })()`;
    await waitFor(a, liveExpr, `${mode} A live`); await waitFor(b, liveExpr, `${mode} B live`);
    const before = await evidence(a);
    const sourceEpoch = before.identity.worldEpoch;
    const sourceSession = before.session.actorSessionId;
    const sourceNet = before.session.selfNetEntityId;

    proxy.setMode({ ws: true, directory: mode === "unknown" });
    const drop = proxy.dropActiveWebSockets();
    assert(drop.activeBeforeDrop >= 1, `${mode}: proxy did not own A websocket`);
    await waitFor(a, `window.__sharedYardV0Evidence?.().session?.actorResume?.pending === true`, `${mode} actor resume pending`, 12_000);
    await waitFor(a, `(() => window.__sharedYardV0Evidence?.().session?.actorResume?.attempts >= 1)()`, `${mode} blocked exact resume attempt`, 12_000);

    const expectedKind = mode === "same-epoch" ? "same-epoch" : "unknown";
    const expectedReason = mode === "same-epoch" ? "authority-still-reports-source" : "directory-unreachable";
    await waitFor(a, `(() => (window.__sharedYardV0Evidence?.().lifecycleEvents||[]).some(x=>x.type==="authority-epoch-verdict" && x.kind===${JSON.stringify(expectedKind)} && x.reason===${JSON.stringify(expectedReason)}))()`, `${mode} authority verdict`, 15_000);
    const during = await evidence(a);
    const proxyDuring = proxy.snapshot();
    assert(proxyDuring.blockedWs >= 1, `${mode}: no websocket attempt was actually blocked`);
    if (mode === "same-epoch") assert(proxyDuring.directoryRequests >= 1 && proxyDuring.blockedDirectory === 0, "same-epoch: directory was not reachable through selective proxy");
    else assert(proxyDuring.blockedDirectory >= 1, "unknown: directory request was not actually blocked");
    assert(during.identity?.worldEpoch === sourceEpoch, `${mode}: source epoch changed before exact recovery`);
    assert(during.session?.roomRecovery?.pending === false, `${mode}: fresh room recovery started without epoch-gone proof`);
    assert(!(during.lifecycleEvents||[]).some(x=>x.type==="authority-epoch-lost-confirmed"), `${mode}: false epoch-lost confirmation`);

    proxy.setMode({ ws: false, directory: false });
    await waitFor(a, `(() => { const e=window.__sharedYardV0Evidence?.(); return e && !e.runtimeFailed && !e.session?.actorResume?.pending && e.identity?.worldEpoch===${JSON.stringify(sourceEpoch)} && e.session?.actorSessionId===${JSON.stringify(sourceSession)} && e.session?.selfNetEntityId===${JSON.stringify(sourceNet)} && (e.lifecycleEvents||[]).some(x=>x.type==="actor-resume-complete"); })()`, `${mode} exact ActorSession recovery`, 20_000);
    const after = await evidence(a);
    const peerAfter = await evidence(b);
    assert(after.metrics?.guardMismatches === 0, `${mode}: exact guard mismatch`);
    assert(after.session?.actorSessionId === sourceSession, `${mode}: ActorSession changed`);
    assert(after.identity?.worldEpoch === sourceEpoch, `${mode}: WorldEpoch changed`);
    assert(peerAfter.identity?.worldEpoch === sourceEpoch && !peerAfter.runtimeFailed, `${mode}: healthy peer lost source epoch`);
    return {
      mode, room, sourceEpoch, sourceSession, sourceNet, drop, proxyDuring,
      verdict: (during.lifecycleEvents||[]).find(x=>x.type==="authority-epoch-verdict" && x.kind===expectedKind),
      after: {
        worldEpoch: after.identity.worldEpoch,
        actorSessionId: after.session.actorSessionId,
        netEntityId: after.session.selfNetEntityId,
        guardMismatches: after.metrics.guardMismatches,
        runtimeFailed: after.runtimeFailed,
      },
    };
  } finally {
    proxy.setMode({ ws: false, directory: false });
    await stopBrowser(b); await stopBrowser(a);
    await sleep(200);
  }
}

const suffix = Date.now().toString(36).slice(-6);
const result = { generatedAt: new Date().toISOString(), proxyBase: PROXY_BASE, cases: [] };
try {
  await proxy.listen();
  result.cases.push(await runCase({ room: "yard-1", mode: "same-epoch", suffix: `s${suffix}` }));
  result.cases.push(await runCase({ room: "yard-3", mode: "unknown", suffix: `u${suffix}` }));
  result.verdict = "WORLD_V0_AUTHORITY_EPOCH_VERDICT_CONTROLS_PASS";
  writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
  console.log(result.verdict, JSON.stringify(result.cases.map(c=>({ mode:c.mode, epoch:c.sourceEpoch, kind:c.verdict?.kind, reason:c.verdict?.reason, proxy:c.proxyDuring }))));
} catch (error) {
  result.verdict = "WORLD_V0_AUTHORITY_EPOCH_VERDICT_CONTROLS_FAIL";
  result.error = error instanceof Error ? error.stack || error.message : String(error);
  result.proxy = proxy.snapshot();
  writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
  throw error;
} finally {
  await proxy.close();
}
