import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { tmpdir } from "node:os";

const DIST_ROOT = resolve(".foundation-browser-dist");
const FIXTURE_PATH = resolve("scripts/fixtures/multiplayer-foundation-browser-client.mjs");
const TOPOLOGY_FIXTURE_PATH = resolve("scripts/fixtures/multiplayer-foundation-browser-topology-rebootstrap.mjs");
const BOX3D_ROOT = resolve("public/world-v0/box3d-i4");
const DEBUG_PORT = 9688;
const TIMEOUT_MS = 45_000;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
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
    ["node_modules/typescript/bin/tsc", "-p", "tsconfig.multiplayer-foundation-browser.json"],
    { encoding: "utf8" },
  );
  if (result.status !== 0) {
    throw new Error(`foundation browser TypeScript emit failed\n${result.stdout || ""}\n${result.stderr || ""}`);
  }
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
function startFixtureServer() {
  const server = createServer((request, response) => {
    try {
      const url = new URL(request.url || "/", "http://127.0.0.1");
      if (url.pathname === "/" || url.pathname === "/topology") {
        const fixtureSrc = url.pathname === "/topology" ? "/topology-fixture.mjs" : "/fixture.mjs";
        response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
        response.end(`<!doctype html><meta charset=utf-8><title>Foundation browser smoke</title><script type=module src=${fixtureSrc}></script>`);
        return;
      }
      let path = null;
      if (url.pathname === "/fixture.mjs") path = FIXTURE_PATH;
      else if (url.pathname === "/topology-fixture.mjs") path = TOPOLOGY_FIXTURE_PATH;
      else if (url.pathname.startsWith("/runtime/")) path = safeChild(DIST_ROOT, url.pathname.slice("/runtime/".length));
      else if (url.pathname.startsWith("/box3d/")) path = safeChild(BOX3D_ROOT, url.pathname.slice("/box3d/".length));
      if (!path) {
        response.writeHead(404, { "content-type": "text/plain" });
        response.end("not found");
        return;
      }
      const bytes = readFileSync(path);
      response.writeHead(200, { "content-type": contentType(path), "cache-control": "no-store" });
      response.end(bytes);
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
      resolvePromise({ server, url: `http://127.0.0.1:${address.port}/` });
    });
  });
}
async function waitForDebugger(port) {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < TIMEOUT_MS) {
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
    const result = await this.call(
      "Runtime.evaluate",
      { expression, awaitPromise: true, returnByValue: true },
      sessionId,
    );
    if (result.exceptionDetails) throw new Error(`Browser evaluation failed: ${result.exceptionDetails.text || "unknown"}`);
    return result.result?.value;
  }
  close() {
    try { this.ws.close(); } catch { /* cleanup */ }
  }
}
async function waitForEvidence(cdp, sessionId, globalName, passStatus, failStatus) {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < TIMEOUT_MS) {
    try {
      last = await cdp.evaluate(sessionId, `window[${JSON.stringify(globalName)}] || null`);
      if (last?.status === passStatus) return last;
      if (last?.status === failStatus) {
        throw new Error(`browser fixture failed: ${last.error}\n${last.stack || ""}`);
      }
    } catch (error) {
      if (String(error).includes("browser fixture failed:")) throw error;
      last = error instanceof Error ? error.message : String(error);
    }
    await sleep(100);
  }
  throw new Error(`browser foundation evidence timeout · ${globalName} · last=${JSON.stringify(last)}`);
}
async function createFixtureTarget(cdp, url, globalName, passStatus, failStatus) {
  const { targetId } = await cdp.call("Target.createTarget", { url });
  const { sessionId } = await cdp.call("Target.attachToTarget", { targetId, flatten: true });
  await cdp.call("Runtime.enable", {}, sessionId);
  await cdp.call("Page.enable", {}, sessionId);
  const evidence = await waitForEvidence(cdp, sessionId, globalName, passStatus, failStatus);
  return { targetId, evidence };
}

let server = null;
let browser = null;
let profile = null;
let cdp = null;
try {
  compileBrowserRuntime();
  const fixture = await startFixtureServer();
  server = fixture.server;
  const chrome = findChrome();
  profile = mkdtempSync(join(tmpdir(), "mw-foundation-browser-"));
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
  const stderr = [];
  browser.stderr.on("data", (chunk) => stderr.push(chunk));

  const debuggerInfo = await waitForDebugger(DEBUG_PORT);
  cdp = new Cdp(debuggerInfo.webSocketDebuggerUrl);
  await cdp.opened;

  const staticRun = await createFixtureTarget(
    cdp,
    fixture.url,
    "__multiplayerFoundationBrowserEvidence",
    "MULTIPLAYER_FOUNDATION_BROWSER_CLIENT_PASS",
    "MULTIPLAYER_FOUNDATION_BROWSER_CLIENT_FAIL",
  );
  const evidence = staticRun.evidence;
  assert(evidence.environment === "chromium", `unexpected browser environment ${evidence.environment}`);
  assert(evidence.activeActors === 6 && evidence.remoteActors === 5, "browser self + N actor coverage failed");
  assert(evidence.dynamicEntities === 18, `browser dynamic entity count ${evidence.dynamicEntities}`);
  assert(evidence.exactContinuationTicks === 80, `browser exact continuation ${evidence.exactContinuationTicks}`);
  assert(evidence.activeActorPropContacts > 0, "browser contact-rich checkpoint missing");
  assert(evidence.seedBytes > 0, "browser byte seed missing");
  console.log("MULTIPLAYER_FOUNDATION_BROWSER_CLIENT_PASS", JSON.stringify(evidence));
  await cdp.call("Target.closeTarget", { targetId: staticRun.targetId });

  const topologyRun = await createFixtureTarget(
    cdp,
    `${fixture.url}topology`,
    "__multiplayerFoundationTopologyEvidence",
    "MULTIPLAYER_FOUNDATION_BROWSER_TOPOLOGY_REBOOTSTRAP_PASS",
    "MULTIPLAYER_FOUNDATION_BROWSER_TOPOLOGY_REBOOTSTRAP_FAIL",
  );
  const topology = topologyRun.evidence;
  assert(topology.environment === "chromium", `unexpected topology browser environment ${topology.environment}`);
  assert(topology.initial?.activeActors === 2 && topology.initial?.remoteActors === 1, "browser topology initial 2-player boundary failed");
  assert(topology.lateJoin?.activeActors === 6 && topology.lateJoin?.remoteActors === 5, "browser topology 2→6 rebootstrap failed");
  assert(topology.churn?.activeActors === 6 && topology.churn?.remoteActors === 5, "browser topology churn coverage failed");
  assert(topology.lateJoin?.topologyRevision === 6, `browser late-join topology revision ${topology.lateJoin?.topologyRevision}`);
  assert(topology.churn?.topologyRevision === 8, `browser churn topology revision ${topology.churn?.topologyRevision}`);
  assert(topology.exactPreJoinTicks === 8, `browser pre-join exact ticks ${topology.exactPreJoinTicks}`);
  assert(topology.exactPostJoinTicks === 12, `browser post-join exact ticks ${topology.exactPostJoinTicks}`);
  assert(topology.exactPostChurnTicks === 30, `browser post-churn exact ticks ${topology.exactPostChurnTicks}`);
  assert(topology.churnRemovedActor === "actor:2" && topology.churnReplacementActor === "actor:6", "browser churn identity transition failed");
  assert(topology.initial?.contacts > 0, "browser topology initial contact-rich boundary missing");
  assert(topology.churn?.contacts > 0, "browser topology churn contact state missing");
  console.log("MULTIPLAYER_FOUNDATION_BROWSER_TOPOLOGY_REBOOTSTRAP_PASS", JSON.stringify(topology));
  await cdp.call("Target.closeTarget", { targetId: topologyRun.targetId });
} finally {
  cdp?.close();
  if (browser?.exitCode === null) browser.kill("SIGKILL");
  if (server) await new Promise((resolvePromise) => server.close(resolvePromise));
  if (profile) rmSync(profile, { recursive: true, force: true });
  rmSync(DIST_ROOT, { recursive: true, force: true });
}
