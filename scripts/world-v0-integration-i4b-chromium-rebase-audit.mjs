import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  WORLD_V0_CLIENT_HISTORY,
  WORLD_V0_TIMING,
} from "../src/world-v0-contract.ts";
import { WORLD_V0_EXPECTED_SIM_BUILD_ID } from "../public/world-v0/build-contract.js";

const BASE = process.env.MW_WORLD_V0_I4B_BASE ?? "http://127.0.0.1:8796";
const PAGE = `${BASE}/world-v0/`;
const OUTPUT = process.env.MW_WORLD_V0_I4B_OUTPUT || "world-v0-i4b-chromium-rebase.json";
const PORTS = [9232, 9233];
const TIMEOUT_MS = 45_000;
const OFFLINE_MS = Number(process.env.MW_WORLD_V0_I4B_OFFLINE_MS || 1500);

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function assert(condition, message) { if (!condition) throw new Error(message); }
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
  const profile = mkdtempSync(join(tmpdir(), `mw-i4b-${index}-`));
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
  await cdp.call("Network.enable", {}, sessionId);
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
async function setOffline(client, offline) {
  await client.cdp.call("Network.emulateNetworkConditions", {
    offline,
    latency: 0,
    downloadThroughput: offline ? 0 : -1,
    uploadThroughput: offline ? 0 : -1,
    connectionType: offline ? "none" : "wifi",
  }, client.sessionId);
}

const chrome = findChrome();
const version = chromeVersion(chrome);
const clients = [];
let runKey = null;
try {
  const suffix = Date.now().toString(36).slice(-7);
  runKey = `i4b-${suffix}`;
  clients.push(await startClient(chrome, 0, `${PAGE}?player=I4BA-${suffix}&run=${runKey}`));
  clients.push(await startClient(chrome, 1, `${PAGE}?player=I4BB-${suffix}&run=${runKey}`));
  await Promise.all(clients.map((client, index) => waitFor(client,
    'document.readyState === "complete" && typeof window.__sharedYardV0Evidence === "function" && !document.querySelector("#enter")?.disabled',
    `client ${index} boot`)));
  for (const client of clients) await client.cdp.evaluate(client.sessionId, 'document.querySelector("#enter").click(); true');
  await Promise.all(clients.map((client, index) => waitFor(client,
    '(() => { const e=window.__sharedYardV0Evidence?.(); return e?.identity?.worldEpoch && Number.isInteger(e?.protocolStartTick) && e.localBoundaryTick >= e.protocolStartTick + 100 && e.metrics.guardMismatches === 0; })()',
    `client ${index} baseline`)));

  const beforeA = await evidence(clients[0]);
  const beforeB = await evidence(clients[1]);
  assert(beforeA.identity.simBuildId === WORLD_V0_EXPECTED_SIM_BUILD_ID, "client A SimBuildId drift");
  assert(beforeA.identity.worldEpoch === beforeB.identity.worldEpoch, "baseline epoch disagreement");
  assert(beforeA.session.actorSessionId && beforeA.session.actorSessionId !== beforeB.session.actorSessionId, "baseline ActorSession identity missing");

  await setOffline(clients[0], true);
  await waitFor(clients[0], '(() => window.__sharedYardV0Evidence?.().session?.actorResume?.pending === true)()', "client A actor resume pending", 12_000);
  const droppedA = await evidence(clients[0]);
  const sourceBoundary = droppedA.session.actorResume.sourceBoundary;
  assert(Number.isInteger(sourceBoundary), "resume source boundary missing");

  await sleep(OFFLINE_MS);
  await waitFor(clients[1], `(() => { const e=window.__sharedYardV0Evidence?.(); return !e.runtimeFailed && e.localBoundaryTick >= ${sourceBoundary + WORLD_V0_TIMING.inputLeaseMissingTicks + 12}; })()`, "healthy peer survives long gap", 12_000);
  const duringB = await evidence(clients[1]);
  assert(duringB.identity.worldEpoch === beforeB.identity.worldEpoch, "healthy peer epoch rotated during A drop");
  assert(duringB.metrics.guardMismatches === 0, "healthy peer exact-state mismatch during A drop");

  await setOffline(clients[0], false);
  await waitFor(clients[0], `(() => { const e=window.__sharedYardV0Evidence?.(); return e && !e.runtimeFailed && e.metrics.rebases >= 1 && e.session.actorResume.pending === false && e.metrics.latestRebaseGapTicks > ${WORLD_V0_TIMING.inputLeaseMissingTicks} && e.localBoundaryTick >= e.metrics.latestRebaseBoundary + 30 && e.metrics.guardMismatches === 0; })()`, "client A exact authority rebase and continuation", 30_000);
  await sleep(500);
  const afterA = await evidence(clients[0]);
  const afterB = await evidence(clients[1]);

  assert(afterA.identity.worldEpoch === beforeA.identity.worldEpoch, "A rebase rotated WorldEpoch");
  assert(afterA.session.actorSessionId === beforeA.session.actorSessionId, "A rebase changed ActorSession");
  assert(afterA.session.selfNetEntityId === beforeA.session.selfNetEntityId, "A rebase changed NetEntityId");
  assert(afterA.metrics.latestRebaseGapTicks > WORLD_V0_CLIENT_HISTORY.retainTicks, "A rebase did not cross history horizon");
  assert(afterA.metrics.latestRebaseGapTicks > WORLD_V0_TIMING.inputLeaseMissingTicks, "A rebase did not cross input lease");
  assert(afterA.metrics.latestRebaseBytes > 1024, "A rebase seed unexpectedly small");
  assert(/^[0-9a-f]{8}$/.test(afterA.metrics.latestRebaseHash || ""), "A rebase checksum evidence missing");
  assert(afterA.metrics.guardMismatches === 0 && afterA.metrics.firstStateMismatch === null, "A exact guard failed after rebase");
  assert(afterA.metrics.guardMatches > beforeA.metrics.guardMatches, "A exact guard did not continue after rebase");
  assert(afterB.identity.worldEpoch === beforeB.identity.worldEpoch && !afterB.runtimeFailed, "healthy B continuity failed");
  const resumeComplete = afterA.lifecycleEvents.find((event) => event.type === "actor-resume-complete");
  const rebaseEvent = afterA.lifecycleEvents.find((event) => event.type === "authority-rebase");
  assert(resumeComplete?.resumeCount >= 1, "browser resume completion evidence missing");
  assert(rebaseEvent?.gapTicks === afterA.metrics.latestRebaseGapTicks, "browser rebase lifecycle/metric gap mismatch");

  const result = {
    revision: "world-v0-integration-i4b-real-chromium-rebase-v1",
    runKey,
    chromeVersion: version,
    offlineMs: OFFLINE_MS,
    simBuildId: afterA.identity.simBuildId,
    worldEpoch: afterA.identity.worldEpoch,
    actorSession: {
      before: beforeA.session.actorSessionId,
      after: afterA.session.actorSessionId,
      preserved: beforeA.session.actorSessionId === afterA.session.actorSessionId,
      netEntityPreserved: beforeA.session.selfNetEntityId === afterA.session.selfNetEntityId,
    },
    gap: {
      sourceBoundary,
      healthyPeerBoundaryDuringGap: duringB.localBoundaryTick,
      rebaseBoundary: afterA.metrics.latestRebaseBoundary,
      gapTicks: afterA.metrics.latestRebaseGapTicks,
      historyRetainTicks: WORLD_V0_CLIENT_HISTORY.retainTicks,
      inputLeaseMissingTicks: WORLD_V0_TIMING.inputLeaseMissingTicks,
    },
    seed: { bytes: afterA.metrics.latestRebaseBytes, fnv1a32: afterA.metrics.latestRebaseHash },
    exactness: {
      rebaseCount: afterA.metrics.rebases,
      guardMatchesBefore: beforeA.metrics.guardMatches,
      guardMatchesAfter: afterA.metrics.guardMatches,
      guardMismatches: afterA.metrics.guardMismatches,
      firstStateMismatch: afterA.metrics.firstStateMismatch,
    },
    healthyPeer: { boundaryAfter: afterB.localBoundaryTick, runtimeFailed: afterB.runtimeFailed, guardMismatches: afterB.metrics.guardMismatches },
    verdict: "WORLD_V0_INTEGRATION_I4B_REAL_CHROMIUM_EXACT_REBASE_PASS",
    nonClaim: "This proves automatic same-ActorSession browser recovery through a controlled per-target network outage on local Wrangler/Chrome, beyond both the retained rewind horizon and actor input lease. It does not claim remote Cloudflare placement, process-loss reconstruction, durable persistence, cross-build replay, or mobile browser behavior.",
  };
  writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
  console.log("WORLD_V0_INTEGRATION_I4B_REAL_CHROMIUM_REBASE", JSON.stringify(result, null, 2));
  console.log(result.verdict);
} catch (error) {
  const diagnostic = {
    verdict: "WORLD_V0_INTEGRATION_I4B_REAL_CHROMIUM_REBASE_FAIL",
    error: error instanceof Error ? error.stack || error.message : String(error),
    runKey,
    chromeVersion: version,
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
  try { if (clients[0]) await setOffline(clients[0], false); } catch {}
  await Promise.all(clients.map(stopClient));
}
