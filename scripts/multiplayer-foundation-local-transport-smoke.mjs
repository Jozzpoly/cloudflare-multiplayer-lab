import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { tmpdir } from "node:os";

const AUTHORITY_PORT = 8794;
const AUTHORITY_ORIGIN = `http://127.0.0.1:${AUTHORITY_PORT}`;
const DEBUG_PORT = 9690;
const TIMEOUT_MS = 45_000;
const CONFIG = resolve("wrangler.foundation-replication-test.jsonc");
const WRANGLER_BIN = resolve("node_modules/wrangler/bin/wrangler.js");
const DIST_ROOT = resolve(".foundation-browser-dist");
const FIXTURE_PATH = resolve("scripts/fixtures/multiplayer-foundation-browser-transport-client.mjs");
const RUN = `triad-${Date.now().toString(36)}`;
const SESSIONS = ["session-alpha", "session-bravo", "session-charlie"];
const PERSIST_DIR = mkdtempSync(join(tmpdir(), "mw-foundation-transport-do-"));

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}
function boundedAppend(current, chunk) {
  const next = current + String(chunk);
  return next.length > 16000 ? next.slice(-16000) : next;
}
function contentType(pathname) {
  const extension = extname(pathname);
  if (extension === ".mjs" || extension === ".js") return "text/javascript; charset=utf-8";
  if (extension === ".html") return "text/html; charset=utf-8";
  return "application/octet-stream";
}
function safeChild(root, relativePath) {
  const candidate = resolve(root, normalize(relativePath).replace(/^[/\\]+/, ""));
  if (candidate !== root && !candidate.startsWith(root + "/")) throw new Error("path traversal rejected");
  return candidate;
}
function compileBrowserRuntime() {
  rmSync(DIST_ROOT, { recursive: true, force: true });
  const result = spawnSync(
    process.execPath,
    ["node_modules/typescript/bin/tsc", "-p", "tsconfig.multiplayer-foundation-browser.json"],
    { encoding: "utf8" },
  );
  if (result.status !== 0) {
    throw new Error(`foundation browser TypeScript emit failed\n${result.stdout || ""}\n${result.stderr || ""}`);
  }
}
function startFixtureServer() {
  const server = createServer((request, response) => {
    try {
      const url = new URL(request.url || "/", "http://127.0.0.1");
      if (url.pathname === "/client") {
        response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
        response.end("<!doctype html><meta charset=utf-8><title>Foundation transport client</title><script type=module src=/transport-fixture.mjs></script>");
        return;
      }
      let path = null;
      if (url.pathname === "/transport-fixture.mjs") path = FIXTURE_PATH;
      else if (url.pathname.startsWith("/runtime/")) path = safeChild(DIST_ROOT, url.pathname.slice("/runtime/".length));
      if (!path) {
        response.writeHead(404, { "content-type": "text/plain" });
        response.end("not found");
        return;
      }
      response.writeHead(200, { "content-type": contentType(path), "cache-control": "no-store" });
      response.end(readFileSync(path));
    } catch (error) {
      response.writeHead(500, { "content-type": "text/plain" });
      response.end(error instanceof Error ? error.message : String(error));
    }
  });
  return new Promise((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("fixture server address unavailable"));
        return;
      }
      resolvePromise({ server, origin: `http://127.0.0.1:${address.port}` });
    });
  });
}
function startWrangler() {
  const child = spawn(process.execPath, [
    WRANGLER_BIN,
    "dev",
    "--config",
    CONFIG,
    "--ip",
    "127.0.0.1",
    "--port",
    String(AUTHORITY_PORT),
    "--persist-to",
    PERSIST_DIR,
    "--log-level",
    "error",
  ], {
    cwd: process.cwd(),
    env: { ...process.env, CI: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (chunk) => { output = boundedAppend(output, chunk); });
  child.stderr.on("data", (chunk) => { output = boundedAppend(output, chunk); });
  return { child, output: () => output };
}
async function waitForWrangler(server) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (server.child.exitCode !== null) {
      throw new Error(`wrangler exited before readiness with ${server.child.exitCode}\n${server.output()}`);
    }
    try {
      const response = await fetch(`${AUTHORITY_ORIGIN}/health`, { signal: AbortSignal.timeout(1000) });
      if (response.ok) return;
    } catch {
      // workerd is still starting.
    }
    await sleep(100);
  }
  throw new Error(`wrangler readiness timeout\n${server.output()}`);
}
async function stopWrangler(server) {
  if (!server || server.child.exitCode !== null) return;
  server.child.kill("SIGTERM");
  const exited = await Promise.race([
    new Promise((resolveExit) => server.child.once("exit", () => resolveExit(true))),
    sleep(5000).then(() => false),
  ]);
  if (!exited && server.child.exitCode === null) {
    server.child.kill("SIGKILL");
    await new Promise((resolveExit) => server.child.once("exit", resolveExit));
  }
}
async function status() {
  const response = await fetch(
    `${AUTHORITY_ORIGIN}/foundation-replication/status?run=${encodeURIComponent(RUN)}`,
    { signal: AbortSignal.timeout(3000) },
  );
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  return body;
}
async function waitForStatus(predicate, label) {
  const deadline = Date.now() + TIMEOUT_MS;
  let last = null;
  while (Date.now() < deadline) {
    try {
      last = await status();
      if (predicate(last)) return last;
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    await sleep(100);
  }
  throw new Error(`${label} timeout · last=${JSON.stringify(last)}`);
}
function findChrome() {
  const override = process.env.CHROME_BIN?.trim();
  if (override) return override;
  const probe = spawnSync(
    "bash",
    ["-lc", "command -v google-chrome || command -v google-chrome-stable || command -v chromium || command -v chromium-browser"],
    { encoding: "utf8" },
  );
  const binary = probe.stdout.trim().split("\n")[0];
  if (!binary) throw new Error(`Chrome/Chromium binary not found: ${probe.stderr || "no candidate"}`);
  return binary;
}
async function waitForDebugger(port) {
  const deadline = Date.now() + TIMEOUT_MS;
  let last = null;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(1500) });
      if (response.ok) {
        const value = await response.json();
        if (value.webSocketDebuggerUrl) return value;
      }
      last = `HTTP ${response.status}`;
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    await sleep(100);
  }
  throw new Error(`Chrome debugger unavailable: ${last}`);
}
async function waitForProcessExit(child, timeoutMs) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return true;
  return await new Promise((resolvePromise) => {
    const timer = setTimeout(() => {
      child.removeListener("exit", onExit);
      resolvePromise(false);
    }, timeoutMs);
    const onExit = () => {
      clearTimeout(timer);
      resolvePromise(true);
    };
    child.once("exit", onExit);
  });
}
async function removeTreeBestEffort(path, label, attempts = 20, delayMs = 150) {
  if (!path) return;
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      rmSync(path, { recursive: true, force: true });
      return;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await sleep(delayMs);
    }
  }
  console.warn(`${label} cleanup warning: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}
class Cdp {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.nextId = 1;
    this.pending = new Map();
    this.opened = new Promise((resolvePromise, reject) => {
      this.ws.addEventListener("open", resolvePromise, { once: true });
      this.ws.addEventListener("error", () => reject(new Error("CDP WebSocket open failed")), { once: true });
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
    return await new Promise((resolvePromise, reject) => {
      this.pending.set(id, { resolve: resolvePromise, reject, method });
      const payload = { id, method, params };
      if (sessionId) payload.sessionId = sessionId;
      this.ws.send(JSON.stringify(payload));
    });
  }
  async evaluate(sessionId, expression) {
    const result = await this.call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, sessionId);
    if (result.exceptionDetails) throw new Error(`Browser evaluation failed: ${result.exceptionDetails.text || "unknown"}`);
    return result.result?.value;
  }
  close() {
    try { this.ws.close(); } catch { /* cleanup */ }
  }
}
async function createClient(cdp, fixtureOrigin, actorSessionId) {
  const url = `${fixtureOrigin}/client?session=${encodeURIComponent(actorSessionId)}&run=${encodeURIComponent(RUN)}&authorityPort=${AUTHORITY_PORT}`;
  const { targetId } = await cdp.call("Target.createTarget", { url });
  const { sessionId } = await cdp.call("Target.attachToTarget", { targetId, flatten: true });
  await cdp.call("Runtime.enable", {}, sessionId);
  await cdp.call("Page.enable", {}, sessionId);
  return { targetId, sessionId, actorSessionId };
}
async function evidence(cdp, client) {
  return await cdp.evaluate(client.sessionId, "window.__multiplayerFoundationTransportEvidence || null");
}
async function waitForClient(cdp, client, predicate, label) {
  const deadline = Date.now() + TIMEOUT_MS;
  let last = null;
  while (Date.now() < deadline) {
    try {
      last = await evidence(cdp, client);
      if (last?.status === "MULTIPLAYER_FOUNDATION_BROWSER_TRANSPORT_CLIENT_FAIL") {
        throw new Error(`${client.actorSessionId} failed: ${last.error}\n${last.stack || ""}`);
      }
      if (predicate(last)) return last;
    } catch (error) {
      if (String(error).includes(`${client.actorSessionId} failed:`)) throw error;
      last = error instanceof Error ? error.message : String(error);
    }
    await sleep(100);
  }
  throw new Error(`${label} timeout · ${client.actorSessionId} · last=${JSON.stringify(last)}`);
}
async function stopBrowser(cdp, child) {
  if (!child) return;
  if (child.exitCode === null && child.signalCode === null && cdp) {
    try { await cdp.call("Browser.close"); } catch { /* browser may close CDP first */ }
  }
  if (await waitForProcessExit(child, 5000)) return;
  try { child.kill("SIGKILL"); } catch { /* cleanup fallback */ }
  await waitForProcessExit(child, 3000);
}

let fixtureServer = null;
let wrangler = null;
let browser = null;
let profile = null;
let cdp = null;
try {
  compileBrowserRuntime();
  const fixture = await startFixtureServer();
  fixtureServer = fixture.server;
  wrangler = startWrangler();
  await waitForWrangler(wrangler);

  const chrome = findChrome();
  profile = mkdtempSync(join(tmpdir(), "mw-foundation-transport-chrome-"));
  browser = spawn(chrome, [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--disable-background-networking",
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
    `--remote-debugging-port=${DEBUG_PORT}`,
    "--remote-debugging-address=127.0.0.1",
    `--user-data-dir=${profile}`,
    "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"] });
  const chromeStderr = [];
  browser.stderr.on("data", (chunk) => chromeStderr.push(chunk));

  const debuggerInfo = await waitForDebugger(DEBUG_PORT);
  cdp = new Cdp(debuggerInfo.webSocketDebuggerUrl);
  await cdp.opened;

  const clients = [];
  for (let index = 0; index < SESSIONS.length; index += 1) {
    const client = await createClient(cdp, fixture.origin, SESSIONS[index]);
    clients.push(client);
    const expectedRevision = index + 1;
    await waitForClient(
      cdp,
      client,
      (value) => value?.latestTopologyRevision === expectedRevision,
      `client initial topology revision ${expectedRevision}`,
    );
    await waitForStatus(
      (value) => value.topologyRevision === expectedRevision && value.readyCurrentTopology === expectedRevision,
      `authority ready count ${expectedRevision}`,
    );
  }

  const clientEvidence = [];
  for (const client of clients) {
    clientEvidence.push(await waitForClient(
      cdp,
      client,
      (value) => value?.status === "MULTIPLAYER_FOUNDATION_BROWSER_TRANSPORT_CLIENT_PASS",
      "transport client PASS",
    ));
  }
  const authority = await waitForStatus(
    (value) => value.topologyRevision === 3 && value.readyCurrentTopology === 3 && value.inputBatches === 3 && value.acceptedInputRecords === 6,
    "authority final triad state",
  );

  assert.equal(authority.connectedTransports, 3);
  assert.equal(authority.actors.length, 3);
  assert.deepEqual(authority.actors.map((actor) => actor.actorSessionId), SESSIONS);
  assert.deepEqual(authority.actors.map((actor) => actor.actorId), ["actor:0", "actor:1", "actor:2"]);
  assert.equal(authority.syncsSent, 6);
  assert.equal(authority.invalidMessages, 0);
  assert.equal(authority.staleReady, 0);
  assert.equal(authority.seedBytes, 8);
  assert.match(authority.seedFnv1a32, /^[0-9a-f]{8}$/);

  const finalTopologyDigest = clientEvidence[0].topologyDigest;
  for (let index = 0; index < clientEvidence.length; index += 1) {
    const value = clientEvidence[index];
    assert.equal(value.actorSessionId, SESSIONS[index]);
    assert.equal(value.selfActorId, `actor:${index}`);
    assert.equal(value.topologyRevision, 3);
    assert.equal(value.remoteActors, 2);
    assert.equal(value.topologyDigest, finalTopologyDigest);
    assert.deepEqual(value.inputStatuses, ["accepted", "accepted"]);
  }
  assert.deepEqual(clientEvidence[0].syncReasons, ["join", "topology_change", "topology_change"]);
  assert.deepEqual(clientEvidence[1].syncReasons, ["join", "topology_change"]);
  assert.deepEqual(clientEvidence[2].syncReasons, ["join"]);
  assert.deepEqual(clientEvidence[0].topologyRevisions, [1, 2, 3]);
  assert.deepEqual(clientEvidence[1].topologyRevisions, [2, 3]);
  assert.deepEqual(clientEvidence[2].topologyRevisions, [3]);

  console.log("MULTIPLAYER_FOUNDATION_LOCAL_TRANSPORT_PASS", JSON.stringify({
    run: RUN,
    environment: "wrangler-workerd + chromium",
    worldId: authority.worldId,
    worldEpoch: authority.worldEpoch,
    topologyRevision: authority.topologyRevision,
    topologyDigest: authority.topologyDigest,
    actors: authority.actors,
    connectedTransports: authority.connectedTransports,
    readyCurrentTopology: authority.readyCurrentTopology,
    syncsSent: authority.syncsSent,
    inputBatches: authority.inputBatches,
    acceptedInputRecords: authority.acceptedInputRecords,
    seedBytes: authority.seedBytes,
    seedFnv1a32: authority.seedFnv1a32,
    clients: clientEvidence.map((value) => ({
      actorSessionId: value.actorSessionId,
      selfActorId: value.selfActorId,
      remoteActors: value.remoteActors,
      syncReasons: value.syncReasons,
      topologyRevisions: value.topologyRevisions,
      inputStatuses: value.inputStatuses,
    })),
  }));
} finally {
  await stopBrowser(cdp, browser);
  cdp?.close();
  await stopWrangler(wrangler);
  if (fixtureServer) await new Promise((resolvePromise) => fixtureServer.close(resolvePromise));
  await removeTreeBestEffort(profile, "Chrome profile");
  await removeTreeBestEffort(PERSIST_DIR, "Wrangler persistence");
  await removeTreeBestEffort(DIST_ROOT, "foundation browser dist", 10, 100);
}
