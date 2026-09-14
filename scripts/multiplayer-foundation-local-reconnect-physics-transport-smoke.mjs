import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { tmpdir } from "node:os";

const AUTHORITY_PORT = 8792;
const AUTHORITY_ORIGIN = `http://127.0.0.1:${AUTHORITY_PORT}`;
const DEBUG_PORT = 9692;
const TIMEOUT_MS = 60_000;
const CONFIG = resolve("wrangler.foundation-replication-physics-test.jsonc");
const WRANGLER_BIN = resolve("node_modules/wrangler/bin/wrangler.js");
const DIST_ROOT = resolve(".foundation-browser-reconnect-dist");
const FIXTURE_PATH = resolve("scripts/fixtures/multiplayer-foundation-browser-reconnect-physics-client.mjs");
const BOX3D_ROOT = resolve("public/world-v0/box3d-i4");
const RUN = `reconnect-triad-${Date.now().toString(36)}`;
const SESSIONS = ["session-alpha", "session-bravo", "session-charlie"];
const RECONNECT_SESSION = "session-bravo";
const PERSIST_DIR = mkdtempSync(join(tmpdir(), "mw-foundation-reconnect-do-"));

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}
function boundedAppend(current, chunk) {
  const next = current + String(chunk);
  return next.length > 24000 ? next.slice(-24000) : next;
}
function contentType(pathname) {
  const extension = extname(pathname);
  if (extension === ".mjs" || extension === ".js") return "text/javascript; charset=utf-8";
  if (extension === ".wasm") return "application/wasm";
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
    ["node_modules/typescript/bin/tsc", "-p", "tsconfig.multiplayer-foundation-browser.json", "--outDir", DIST_ROOT],
    { encoding: "utf8" },
  );
  if (result.status !== 0) {
    throw new Error(`foundation reconnect browser TypeScript emit failed\n${result.stdout || ""}\n${result.stderr || ""}`);
  }
}
function startFixtureServer() {
  const server = createServer((request, response) => {
    try {
      const url = new URL(request.url || "/", "http://127.0.0.1");
      if (url.pathname === "/client") {
        response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
        response.end("<!doctype html><meta charset=utf-8><title>Foundation reconnect client</title><script type=module src=/reconnect-fixture.mjs></script>");
        return;
      }
      let path = null;
      if (url.pathname === "/reconnect-fixture.mjs") path = FIXTURE_PATH;
      else if (url.pathname.startsWith("/runtime/")) path = safeChild(DIST_ROOT, url.pathname.slice("/runtime/".length));
      else if (url.pathname.startsWith("/box3d/")) path = safeChild(BOX3D_ROOT, url.pathname.slice("/box3d/".length));
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
      if (!address || typeof address === "string") return reject(new Error("reconnect fixture server address unavailable"));
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
  const deadline = Date.now() + 35_000;
  while (Date.now() < deadline) {
    if (server.child.exitCode !== null) throw new Error(`wrangler exited before reconnect readiness with ${server.child.exitCode}\n${server.output()}`);
    try {
      const response = await fetch(`${AUTHORITY_ORIGIN}/health`, { signal: AbortSignal.timeout(1000) });
      if (response.ok) return;
    } catch {
      // workerd is still starting.
    }
    await sleep(100);
  }
  throw new Error(`reconnect wrangler readiness timeout\n${server.output()}`);
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
    `${AUTHORITY_ORIGIN}/foundation-physics/status?run=${encodeURIComponent(RUN)}`,
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
  return await cdp.evaluate(client.sessionId, "window.__multiplayerFoundationReconnectEvidence || null");
}
async function waitForClient(cdp, client, predicate, label) {
  const deadline = Date.now() + TIMEOUT_MS;
  let last = null;
  while (Date.now() < deadline) {
    try {
      last = await evidence(cdp, client);
      if (last?.status === "MULTIPLAYER_FOUNDATION_BROWSER_RECONNECT_CLIENT_FAIL") {
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
  profile = mkdtempSync(join(tmpdir(), "mw-foundation-reconnect-chrome-"));
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

  const debuggerInfo = await waitForDebugger(DEBUG_PORT);
  cdp = new Cdp(debuggerInfo.webSocketDebuggerUrl);
  await cdp.opened;

  const clients = [];
  for (let index = 0; index < SESSIONS.length; index += 1) {
    const client = await createClient(cdp, fixture.origin, SESSIONS[index]);
    clients.push(client);
    const expectedRevision = index + 1;
    await waitForClient(cdp, client, (value) => value?.latestTopologyRevision === expectedRevision, `reconnect initial topology revision ${expectedRevision}`);
    if (expectedRevision < 3) {
      await waitForStatus(
        (value) => value.topologyRevision === expectedRevision && value.readyCurrentTopology === expectedRevision,
        `reconnect authority ready count ${expectedRevision}`,
      );
    }
  }

  const phase1Evidence = [];
  for (const client of clients) {
    phase1Evidence.push(await waitForClient(
      cdp,
      client,
      (value) => value?.status === "MULTIPLAYER_FOUNDATION_BROWSER_RECONNECT_PHASE1_PASS",
      "reconnect phase-1 PASS",
    ));
  }

  const phase1Authority = await waitForStatus(
    (value) => value.mode === "reconnect"
      && value.boundaryTick === 33
      && value.topologyRevision === 3
      && value.readyCurrentTopology === 3
      && value.connectedTransports === 3
      && value.inputBatches === 6
      && value.acceptedInputRecords === 90
      && value.committedInputRecords === 90
      && value.inputCommitsSent === 18
      && value.correctionSyncs === 3
      && value.continuationTicks === 30,
    "reconnect phase-1 authority boundary",
  );
  assert.deepEqual(phase1Authority.actors.map((actor) => actor.actorId), ["actor:0", "actor:1", "actor:2"]);
  assert(phase1Authority.actors.every((actor) => actor.transportConnected === true));
  const stableTopologyRevision = phase1Authority.topologyRevision;
  const stableTopologyDigest = phase1Authority.topologyDigest;
  const stableActors = phase1Authority.actors.map(({ actorId, actorSessionId }) => ({ actorId, actorSessionId }));

  const reconnectClient = clients.find((client) => client.actorSessionId === RECONNECT_SESSION);
  assert(reconnectClient, "designated reconnect client missing");
  const disconnectIdentity = await cdp.evaluate(reconnectClient.sessionId, "window.__disconnectFoundationTransport()");
  assert.equal(disconnectIdentity.actorSessionId, RECONNECT_SESSION);
  assert.equal(disconnectIdentity.selfActorId, "actor:1");
  assert.equal(disconnectIdentity.topologyRevision, stableTopologyRevision);
  assert.equal(disconnectIdentity.topologyDigest, stableTopologyDigest);

  await waitForClient(
    cdp,
    reconnectClient,
    (value) => value?.status === "MULTIPLAYER_FOUNDATION_BROWSER_RECONNECT_DISCONNECTED",
    "controlled browser disconnect",
  );
  const disconnectedAuthority = await waitForStatus(
    (value) => value.boundaryTick === 33
      && value.connectedTransports === 2
      && value.topologyRevision === stableTopologyRevision
      && value.topologyDigest === stableTopologyDigest
      && value.actors.find((actor) => actor.actorSessionId === RECONNECT_SESSION)?.transportConnected === false,
    "authority observes transport-only disconnect",
  );
  assert.deepEqual(disconnectedAuthority.actors.map(({ actorId, actorSessionId }) => ({ actorId, actorSessionId })), stableActors);
  assert.equal(disconnectedAuthority.resumeSyncs, 0);
  assert.deepEqual(disconnectedAuthority.resumedSessions, []);

  const resumeIdentity = await cdp.evaluate(reconnectClient.sessionId, "window.__resumeFoundationTransport()");
  assert.equal(resumeIdentity.actorSessionId, RECONNECT_SESSION);
  assert.equal(resumeIdentity.selfActorId, "actor:1");
  assert.equal(resumeIdentity.topologyRevision, stableTopologyRevision);
  assert.equal(resumeIdentity.topologyDigest, stableTopologyDigest);

  const resumeEvidence = await waitForClient(
    cdp,
    reconnectClient,
    (value) => value?.status === "MULTIPLAYER_FOUNDATION_BROWSER_RECONNECT_RESUME_PASS",
    "browser ActorSession resume",
  );
  assert.equal(resumeEvidence.resumedActorId, "actor:1");
  assert.equal(resumeEvidence.resumeTick, 33);
  assert.equal(resumeEvidence.resumeSyncs, 1);
  assert.equal(resumeEvidence.topologyRevision, stableTopologyRevision);
  assert.equal(resumeEvidence.topologyDigest, stableTopologyDigest);

  const resumedAuthority = await waitForStatus(
    (value) => value.boundaryTick === 33
      && value.connectedTransports === 3
      && value.readyCurrentTopology === 3
      && value.resumeSyncs === 1
      && value.resumedSessions?.length === 1
      && value.resumedSessions[0] === RECONNECT_SESSION
      && value.topologyRevision === stableTopologyRevision
      && value.topologyDigest === stableTopologyDigest
      && value.actors.find((actor) => actor.actorSessionId === RECONNECT_SESSION)?.transportConnected === true,
    "authority ActorSession resume ready",
  );
  assert.deepEqual(resumedAuthority.actors.map(({ actorId, actorSessionId }) => ({ actorId, actorSessionId })), stableActors);

  for (const client of clients) {
    const started = await cdp.evaluate(client.sessionId, "window.__startFoundationReconnectPhase2()");
    assert.equal(started, true);
  }

  const finalEvidence = [];
  for (const client of clients) {
    finalEvidence.push(await waitForClient(
      cdp,
      client,
      (value) => value?.status === "MULTIPLAYER_FOUNDATION_BROWSER_RECONNECT_CLIENT_PASS",
      "reconnect final client PASS",
    ));
  }

  const finalAuthority = await waitForStatus(
    (value) => value.boundaryTick === 63
      && value.topologyRevision === stableTopologyRevision
      && value.topologyDigest === stableTopologyDigest
      && value.connectedTransports === 3
      && value.readyCurrentTopology === 3
      && value.inputBatches === 12
      && value.acceptedInputRecords === 180
      && value.committedInputRecords === 180
      && value.inputCommitsSent === 36
      && value.correctionSyncs === 6
      && value.resumeSyncs === 1
      && value.continuationTicks === 60,
    "reconnect final authority convergence",
  );

  assert.equal(finalAuthority.syncsSent, 13);
  assert.equal(finalAuthority.invalidMessages, 0);
  assert.equal(finalAuthority.staleReady, 0);
  assert(finalAuthority.maxPropHorizontalDisplacement > 0.05, `reconnect shared props did not move materially: ${finalAuthority.maxPropHorizontalDisplacement}`);
  assert.deepEqual(finalAuthority.actors.map(({ actorId, actorSessionId }) => ({ actorId, actorSessionId })), stableActors);
  assert(finalAuthority.actors.every((actor) => actor.transportConnected === true));
  assert.deepEqual(finalAuthority.resumedSessions, [RECONNECT_SESSION]);

  for (let index = 0; index < finalEvidence.length; index += 1) {
    const value = finalEvidence[index];
    assert.equal(value.actorSessionId, SESSIONS[index]);
    assert.equal(value.selfActorId, `actor:${index}`);
    assert.equal(value.topologyRevision, stableTopologyRevision);
    assert.equal(value.topologyDigest, stableTopologyDigest);
    assert.equal(value.exactContinuationTicks, 60);
    assert.equal(value.correctionTick, 63);
    assert.equal(value.correctionGuardMatched, true);
    assert.equal(value.inputResults, 4);
    assert.equal(value.commitMessages, 12);
    assert.equal(value.commitRecords, 180);
    assert.deepEqual(value.commitSources, [...SESSIONS].sort());
    assert.equal(value.finalSeedBytes, finalAuthority.finalSeedBytes);
    assert.equal(value.finalSeedFnv1a32, finalAuthority.finalSeedFnv1a32);
  }
  assert.deepEqual(finalEvidence[0].syncReasons, ["join", "topology_change", "topology_change", "correction", "correction"]);
  assert.deepEqual(finalEvidence[1].syncReasons, ["join", "topology_change", "correction", "resume", "correction"]);
  assert.deepEqual(finalEvidence[2].syncReasons, ["join", "correction", "correction"]);
  assert.equal(finalEvidence[0].resumeSyncs, 0);
  assert.equal(finalEvidence[1].resumeSyncs, 1);
  assert.equal(finalEvidence[2].resumeSyncs, 0);

  console.log("MULTIPLAYER_FOUNDATION_RECONNECT_PHYSICS_TRANSPORT_PASS", JSON.stringify({
    run: RUN,
    environment: "wrangler-workerd + chromium + box3d-i4",
    box3dBuild: finalAuthority.box3dBuild,
    worldId: finalAuthority.worldId,
    worldEpoch: finalAuthority.worldEpoch,
    phase1BoundaryTick: 33,
    disconnectedTransports: disconnectedAuthority.connectedTransports,
    resumedSession: RECONNECT_SESSION,
    resumedActorId: "actor:1",
    finalBoundaryTick: finalAuthority.boundaryTick,
    topologyRevision: finalAuthority.topologyRevision,
    topologyDigest: finalAuthority.topologyDigest,
    actors: finalAuthority.actors,
    syncsSent: finalAuthority.syncsSent,
    correctionSyncs: finalAuthority.correctionSyncs,
    resumeSyncs: finalAuthority.resumeSyncs,
    inputBatches: finalAuthority.inputBatches,
    acceptedInputRecords: finalAuthority.acceptedInputRecords,
    committedInputRecords: finalAuthority.committedInputRecords,
    inputCommitsSent: finalAuthority.inputCommitsSent,
    continuationTicks: finalAuthority.continuationTicks,
    maxPropHorizontalDisplacement: finalAuthority.maxPropHorizontalDisplacement,
    finalSeedBytes: finalAuthority.finalSeedBytes,
    finalSeedFnv1a32: finalAuthority.finalSeedFnv1a32,
    clients: finalEvidence.map((value) => ({
      actorSessionId: value.actorSessionId,
      selfActorId: value.selfActorId,
      syncReasons: value.syncReasons,
      resumeSyncs: value.resumeSyncs,
      exactContinuationTicks: value.exactContinuationTicks,
      correctionGuardMatched: value.correctionGuardMatched,
    })),
  }));
} finally {
  await stopBrowser(cdp, browser);
  cdp?.close();
  await stopWrangler(wrangler);
  if (fixtureServer) await new Promise((resolvePromise) => fixtureServer.close(resolvePromise));
  await removeTreeBestEffort(profile, "Chrome reconnect profile");
  await removeTreeBestEffort(PERSIST_DIR, "Wrangler reconnect persistence");
  await removeTreeBestEffort(DIST_ROOT, "foundation reconnect browser dist", 10, 100);
}