import net from "node:net";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { WORLD_V0_CLIENT_HISTORY, WORLD_V0_TIMING } from "../src/world-v0-contract.ts";
import { WORLD_V0_EXPECTED_SIM_BUILD_ID } from "../public/world-v0/build-contract.js";

const BASE = process.env.MW_WORLD_V0_DUAL_BROWSER_BASE ?? "http://127.0.0.1:8787";
const TARGET = new URL(BASE);
const PROXY_PORT = Number(process.env.MW_WORLD_V0_DUAL_BROWSER_PROXY_PORT || 8790);
const PAGE = `http://127.0.0.1:${PROXY_PORT}/world-v0/`;
const OUTPUT = process.env.MW_WORLD_V0_DUAL_BROWSER_OUTPUT || "world-v0-closure-dual-browser-grace.json";
const OFFLINE_MS = Number(process.env.MW_WORLD_V0_DUAL_BROWSER_OFFLINE_MS || 14000);
const PORTS = [9252, 9253];
const TIMEOUT_MS = 45_000;

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function assert(condition, message) { if (!condition) throw new Error(message); }

function hardClose(socket) {
  if (!socket || socket.destroyed) return;
  try {
    if (typeof socket.resetAndDestroy === "function") socket.resetAndDestroy();
    else socket.destroy();
  } catch { try { socket.destroy(); } catch {} }
}

function createBlockingTcpProxy() {
  let blocked = false;
  let accepted = 0;
  let blockedAccepts = 0;
  let hardDrops = 0;
  const pairs = new Set();
  const server = net.createServer((client) => {
    accepted += 1;
    client.setNoDelay(true);
    if (blocked) {
      blockedAccepts += 1;
      hardClose(client);
      return;
    }
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
    blockAndDropAll() {
      blocked = true;
      const activeBeforeDrop = pairs.size;
      for (const pair of [...pairs]) {
        hardDrops += 1;
        hardClose(pair.client);
        hardClose(pair.upstream);
        pairs.delete(pair);
      }
      return { activeBeforeDrop, hardDrops };
    },
    unblock() { blocked = false; },
    snapshot() { return { blocked, activePairs: pairs.size, accepted, blockedAccepts, hardDrops }; },
    async close() {
      blocked = true;
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

async function startClient(binary, index, url) {
  const port = PORTS[index];
  const profile = mkdtempSync(join(tmpdir(), `mw-dual-grace-${index}-`));
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
  const { targetId } = await cdp.call("Target.createTarget", { url });
  const { sessionId } = await cdp.call("Target.attachToTarget", { targetId, flatten: true });
  await cdp.call("Runtime.enable", {}, sessionId);
  await cdp.call("Page.enable", {}, sessionId);
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
    await sleep(100);
  }
  throw new Error(`${label} timeout · last=${JSON.stringify(last)}`);
}

function targetedRebase(e, sourceBoundary) {
  return (e?.lifecycleEvents || []).find((event) =>
    event.type === "authority-rebase" &&
    event.sourceBoundary === sourceBoundary &&
    event.gapTicks > WORLD_V0_TIMING.inputLeaseMissingTicks);
}

const chrome = findChrome();
const version = chromeVersion(chrome);
const clients = [];
const proxy = createBlockingTcpProxy();
let runKey = null;
let dropEvidence = null;
try {
  await proxy.listen();
  const suffix = Date.now().toString(36).slice(-7);
  runKey = `dual-${suffix}`;
  clients.push(await startClient(chrome, 0, `${PAGE}?player=DualA-${suffix}&run=${runKey}`));
  clients.push(await startClient(chrome, 1, `${PAGE}?player=DualB-${suffix}&run=${runKey}`));

  await Promise.all(clients.map((client, index) => waitFor(client,
    'document.readyState === "complete" && typeof window.__sharedYardV0Evidence === "function" && !document.querySelector("#enter")?.disabled',
    `client ${index} boot`)));
  for (const client of clients) await client.cdp.evaluate(client.sessionId, 'document.querySelector("#enter").click(); true');
  await Promise.all(clients.map((client, index) => waitFor(client,
    '(() => { const e=window.__sharedYardV0Evidence?.(); return e?.identity?.worldEpoch && Number.isInteger(e?.protocolStartTick) && e.localBoundaryTick >= e.protocolStartTick + 100 && e.metrics.guardMismatches === 0; })()',
    `client ${index} baseline`)));

  const before = await Promise.all(clients.map(evidence));
  assert(before[0].identity.simBuildId === WORLD_V0_EXPECTED_SIM_BUILD_ID, "SimBuildId drift");
  assert(before[0].identity.worldEpoch === before[1].identity.worldEpoch, "baseline WorldEpoch disagreement");
  assert(before[0].session.actorSessionId && before[1].session.actorSessionId, "baseline ActorSession identity missing");
  assert(before[0].session.actorSessionId !== before[1].session.actorSessionId, "distinct actors share ActorSession");

  dropEvidence = proxy.blockAndDropAll();
  assert(dropEvidence.activeBeforeDrop >= 2, `proxy did not own both live transports: ${JSON.stringify(dropEvidence)}`);
  await Promise.all(clients.map((client, index) => waitFor(client,
    '(() => window.__sharedYardV0Evidence?.().session?.actorResume?.pending === true)()',
    `client ${index} actor resume pending`, 12_000)));

  const dropped = await Promise.all(clients.map(evidence));
  const sourceBoundaries = dropped.map((item, index) => {
    const value = item.session.actorResume.sourceBoundary;
    assert(Number.isInteger(value), `client ${index} resume source boundary missing`);
    return value;
  });

  await sleep(OFFLINE_MS);
  const beforeRestore = await Promise.all(clients.map(evidence));
  for (let i = 0; i < beforeRestore.length; i += 1) {
    assert(beforeRestore[i].runtimeFailed === false, `client ${i} failed before transport restoration`);
    assert(beforeRestore[i].session.actorResume.pending === true, `client ${i} stopped recovery before restoration`);
  }
  const blockedProxy = proxy.snapshot();
  assert(blockedProxy.blocked === true, "proxy unexpectedly unblocked during outage");
  assert(blockedProxy.blockedAccepts > 0, "browser did not attempt any reconnect while proxy was blocked");

  proxy.unblock();

  await Promise.all(clients.map((client, index) => waitFor(client, `(() => {
    const e=window.__sharedYardV0Evidence?.();
    if (!e || e.runtimeFailed || e.session.actorResume.pending || e.metrics.guardMismatches !== 0) return false;
    const targeted=(e.lifecycleEvents || []).find((event) =>
      event.type === "authority-rebase" &&
      event.sourceBoundary === ${sourceBoundaries[index]} &&
      event.gapTicks > ${WORLD_V0_TIMING.inputLeaseMissingTicks});
    return Boolean(targeted && e.localBoundaryTick >= targeted.boundaryTick + 30);
  })()`, `client ${index} exact same-world recovery`, 30_000)));

  const after = await Promise.all(clients.map(evidence));
  const oldEpoch = before[0].identity.worldEpoch;
  assert(after[0].identity.worldEpoch === oldEpoch && after[1].identity.worldEpoch === oldEpoch, "WorldEpoch rotated across dual hard drop");
  assert(after[0].identity.worldEpoch === after[1].identity.worldEpoch, "recovered clients disagree on WorldEpoch");

  const clientResults = after.map((item, index) => {
    const rebase = targetedRebase(item, sourceBoundaries[index]);
    assert(rebase, `client ${index} targeted authority rebase missing`);
    assert(item.session.actorSessionId === before[index].session.actorSessionId, `client ${index} ActorSession changed`);
    assert(item.session.selfNetEntityId === before[index].session.selfNetEntityId, `client ${index} NetEntityId changed`);
    assert(rebase.gapTicks > WORLD_V0_CLIENT_HISTORY.retainTicks, `client ${index} gap did not cross history horizon`);
    assert(rebase.gapTicks > WORLD_V0_TIMING.inputLeaseMissingTicks, `client ${index} gap did not cross input lease`);
    assert(item.metrics.guardMismatches === 0 && item.metrics.firstStateMismatch === null, `client ${index} exact guard failed`);
    return {
      actorSessionId: item.session.actorSessionId,
      netEntityId: item.session.selfNetEntityId,
      sourceBoundary: sourceBoundaries[index],
      attemptsBeforeRestore: beforeRestore[index].session.actorResume.attempts,
      rebaseBoundary: rebase.boundaryTick,
      gapTicks: rebase.gapTicks,
      guardMismatches: item.metrics.guardMismatches,
      rebaseCount: item.metrics.rebases,
    };
  });

  const result = {
    revision: "world-v0-closure-dual-browser-grace-v2-hard-drop-proxy",
    runKey,
    chromeVersion: version,
    offlineMs: OFFLINE_MS,
    simBuildId: after[0].identity.simBuildId,
    worldEpoch: after[0].identity.worldEpoch,
    proxy: { drop: dropEvidence, beforeRestore: blockedProxy, afterRestore: proxy.snapshot() },
    clients: clientResults,
    verdict: "WORLD_V0_CLOSURE_DUAL_BROWSER_GRACE_PASS",
    nonClaim: "This proves same-WorldEpoch/same-ActorSession exact recovery for two real Chromium clients after a controlled TCP proxy hard-drop that severs both browser and upstream Worker transports, blocks all reconnect attempts for the stated duration, and then restores transport. It remains local Workerd/Chromium evidence and does not prove mobile radio handover, browser process loss, cross-tab resume-token persistence, Durable Object process-loss reconstruction, remote Cloudflare placement, or persistence after the bounded WorldEpoch grace has actually expired.",
  };
  writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
  console.log("WORLD_V0_CLOSURE_DUAL_BROWSER_GRACE", JSON.stringify(result, null, 2));
  console.log(result.verdict);
} catch (error) {
  const diagnostic = {
    verdict: "WORLD_V0_CLOSURE_DUAL_BROWSER_GRACE_FAIL",
    error: error instanceof Error ? error.stack || error.message : String(error),
    runKey,
    chromeVersion: version,
    offlineMs: OFFLINE_MS,
    proxy: { drop: dropEvidence, current: proxy.snapshot() },
    pages: [],
  };
  for (const client of clients) {
    try { diagnostic.pages.push(await evidence(client)); }
    catch (e) { diagnostic.pages.push({ error: e instanceof Error ? e.message : String(e) }); }
  }
  writeFileSync(OUTPUT, JSON.stringify(diagnostic, null, 2));
  console.error(diagnostic.error);
  process.exitCode = 1;
} finally {
  proxy.unblock();
  await Promise.all(clients.map(stopClient));
  try { await proxy.close(); } catch {}
}
