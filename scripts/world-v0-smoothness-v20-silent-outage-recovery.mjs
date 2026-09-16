import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { WORLD_V0_CLIENT_HISTORY, WORLD_V0_TIMING } from "../src/world-v0-contract.ts";
import { WORLD_V0_EXPECTED_SIM_BUILD_ID } from "../public/world-v0/build-contract.js";

const BASE = process.env.MW_WORLD_V0_V20_SILENT_BASE ?? "http://127.0.0.1:8787";
const PAGE = `${BASE}/world-v0/`;
const OUTPUT = process.env.MW_WORLD_V0_V20_SILENT_OUTPUT ?? "world-v0-v20-silent-outage.json";
const OFFLINE_MS = Number(process.env.MW_WORLD_V0_V20_SILENT_OFFLINE_MS ?? 14000);
const PORTS = [9332, 9333];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const assert = (condition, message) => { if (!condition) throw new Error(message); };

function findChrome() {
  const override = process.env.CHROME_BIN?.trim();
  if (override) return override;
  const probe = spawnSync("bash", ["-lc", "command -v google-chrome || command -v google-chrome-stable || command -v chromium || command -v chromium-browser"], { encoding: "utf8" });
  const binary = probe.stdout.trim().split("\n")[0];
  if (!binary) throw new Error("Chrome binary not found");
  return binary;
}

async function waitDebugger(port) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) {
        const value = await response.json();
        if (value.webSocketDebuggerUrl) return value.webSocketDebuggerUrl;
      }
    } catch {}
    await sleep(100);
  }
  throw new Error(`CDP unavailable on ${port}`);
}

class Cdp {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.id = 1;
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
    const id = this.id++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, method });
      const payload = { id, method, params };
      if (sessionId) payload.sessionId = sessionId;
      this.ws.send(JSON.stringify(payload));
    });
  }
  async eval(sessionId, expression) {
    const result = await this.call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, userGesture: true }, sessionId);
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || "browser eval failed");
    return result.result?.value;
  }
  close() { try { this.ws.close(); } catch {} }
}

async function startClient(binary, index, url) {
  const port = PORTS[index];
  const profile = mkdtempSync(join(tmpdir(), `mw-v20-silent-${index}-`));
  const child = spawn(binary, [
    "--headless=new", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
    "--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding",
    `--remote-debugging-port=${port}`, "--remote-debugging-address=127.0.0.1", `--user-data-dir=${profile}`, "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"] });
  const cdp = new Cdp(await waitDebugger(port));
  await cdp.opened;
  const { targetId } = await cdp.call("Target.createTarget", { url });
  const { sessionId } = await cdp.call("Target.attachToTarget", { targetId, flatten: true });
  await cdp.call("Runtime.enable", {}, sessionId);
  await cdp.call("Page.enable", {}, sessionId);
  await cdp.call("Network.enable", {}, sessionId);
  return { profile, child, cdp, sessionId };
}

async function stopClient(client) {
  if (!client) return;
  client.cdp?.close();
  if (client.child?.exitCode === null) client.child.kill("SIGKILL");
  await sleep(100);
  rmSync(client.profile, { recursive: true, force: true });
}

async function evidence(client) {
  return client.cdp.eval(client.sessionId, "window.__sharedYardV0Evidence?.() ?? null");
}

async function waitFor(client, expression, label, timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    try {
      last = await client.cdp.eval(client.sessionId, expression);
      if (last) return last;
    } catch (error) { last = error instanceof Error ? error.message : String(error); }
    await sleep(100);
  }
  throw new Error(`${label} timeout last=${JSON.stringify(last)}`);
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

const clients = [];
let runKey = null;
try {
  const chrome = findChrome();
  const suffix = Date.now().toString(36).slice(-7);
  runKey = `v20-silent-${suffix}`;
  clients.push(await startClient(chrome, 0, `${PAGE}?player=V20A-${suffix}&run=${runKey}`));
  clients.push(await startClient(chrome, 1, `${PAGE}?player=V20B-${suffix}&run=${runKey}`));

  await Promise.all(clients.map((client, index) => waitFor(client,
    'document.readyState === "complete" && typeof window.__sharedYardV0Evidence === "function" && !document.querySelector("#enter")?.disabled',
    `client ${index} boot`)));
  for (const client of clients) await client.cdp.eval(client.sessionId, 'document.querySelector("#enter").click(); true');
  await Promise.all(clients.map((client, index) => waitFor(client,
    '(() => { const e=window.__sharedYardV0Evidence?.(); return e?.identity?.worldEpoch && Number.isInteger(e?.protocolStartTick) && e.localBoundaryTick >= e.protocolStartTick + 100 && e.metrics.guardMismatches === 0; })()',
    `client ${index} baseline`)));

  const beforeA = await evidence(clients[0]);
  const beforeB = await evidence(clients[1]);
  assert(beforeA.identity.simBuildId === WORLD_V0_EXPECTED_SIM_BUILD_ID, "SimBuildId drift");
  assert(beforeA.identity.worldEpoch === beforeB.identity.worldEpoch, "baseline epoch disagreement");
  assert(beforeA.session.actorSessionId && beforeA.session.actorSessionId !== beforeB.session.actorSessionId, "baseline ActorSession identity missing");
  const sourceBoundary = beforeA.localBoundaryTick;
  const silenceResumeBefore = beforeA.metrics.authoritySilenceResumes;

  await setOffline(clients[0], true);
  await sleep(OFFLINE_MS);

  const duringA = await evidence(clients[0]);
  await waitFor(clients[1], `(() => { const e=window.__sharedYardV0Evidence?.(); return !e.runtimeFailed && e.localBoundaryTick >= ${sourceBoundary + WORLD_V0_TIMING.inputLeaseMissingTicks + 12} && e.metrics.guardMismatches === 0; })()`, "healthy peer crosses outage horizon", 15_000);
  const duringB = await evidence(clients[1]);

  assert(duringA.runtimeFailed !== true, "silent client failed while transport was only traffic-blocked");
  assert(duringA.session.actorResume.pending === false, "silent traffic block incorrectly became ActorSession resume");
  assert(duringA.metrics.authoritySilenceResumes === silenceResumeBefore, "authority silence resume fired during traffic-only outage");
  assert(duringA.identity.worldEpoch === beforeA.identity.worldEpoch, "silent outage rotated WorldEpoch before reconnect");
  assert(duringA.session.actorSessionId === beforeA.session.actorSessionId, "silent outage changed ActorSession before reconnect");
  assert(duringB.localBoundaryTick - sourceBoundary > WORLD_V0_CLIENT_HISTORY.retainTicks, "outage did not cross retained history horizon");
  assert(duringB.localBoundaryTick - sourceBoundary > WORLD_V0_TIMING.inputLeaseMissingTicks, "outage did not cross input lease horizon");

  await setOffline(clients[0], false);
  await waitFor(clients[0], `(() => {
    const e=window.__sharedYardV0Evidence?.();
    if (!e || e.runtimeFailed || e.session?.actorResume?.pending || e.metrics?.guardMismatches !== 0) return false;
    return e.identity?.worldEpoch === ${JSON.stringify(beforeA.identity.worldEpoch)} &&
      e.session?.actorSessionId === ${JSON.stringify(beforeA.session.actorSessionId)} &&
      e.session?.selfNetEntityId === ${JSON.stringify(beforeA.session.selfNetEntityId)} &&
      e.localBoundaryTick >= ${Math.max(sourceBoundary + 30, duringB.localBoundaryTick - 12)} &&
      e.metrics.guardMatches > ${beforeA.metrics.guardMatches};
  })()`, "silent client exact recovery after network restore", 35_000);

  const afterA = await evidence(clients[0]);
  const afterB = await evidence(clients[1]);
  assert(afterA.identity.worldEpoch === beforeA.identity.worldEpoch, "recovery rotated WorldEpoch");
  assert(afterA.session.actorSessionId === beforeA.session.actorSessionId, "recovery changed ActorSession");
  assert(afterA.session.selfNetEntityId === beforeA.session.selfNetEntityId, "recovery changed NetEntityId");
  assert(afterA.metrics.guardMismatches === 0 && afterA.metrics.firstStateMismatch === null, "recovery exact-state mismatch");
  assert(afterA.metrics.guardMatches > beforeA.metrics.guardMatches, "exact guards did not resume after connectivity restore");
  assert(afterB.metrics.guardMismatches === 0 && !afterB.runtimeFailed, "healthy peer regressed during outage");

  const result = {
    revision: "world-v0-smoothness-v20-silent-outage-recovery-v1",
    runKey,
    offlineMs: OFFLINE_MS,
    sourceBoundary,
    healthyPeerBoundaryDuringGap: duringB.localBoundaryTick,
    gapTicks: duringB.localBoundaryTick - sourceBoundary,
    identity: {
      worldEpochPreserved: afterA.identity.worldEpoch === beforeA.identity.worldEpoch,
      actorSessionPreserved: afterA.session.actorSessionId === beforeA.session.actorSessionId,
      netEntityPreserved: afterA.session.selfNetEntityId === beforeA.session.selfNetEntityId,
    },
    duringSilence: {
      actorResumePending: duringA.session.actorResume.pending,
      authoritySilenceResumesBefore: silenceResumeBefore,
      authoritySilenceResumesDuring: duringA.metrics.authoritySilenceResumes,
      localBoundary: duringA.localBoundaryTick,
    },
    recovery: {
      boundaryAfter: afterA.localBoundaryTick,
      guardMatchesBefore: beforeA.metrics.guardMatches,
      guardMatchesAfter: afterA.metrics.guardMatches,
      guardMismatches: afterA.metrics.guardMismatches,
      rebases: afterA.metrics.rebases,
      authoritySilenceResumes: afterA.metrics.authoritySilenceResumes,
    },
    verdict: "WORLD_V0_V20_SILENT_OUTAGE_EXACT_RECOVERY_PASS",
  };
  writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  console.log(result.verdict);
} catch (error) {
  const diagnostic = { verdict: "WORLD_V0_V20_SILENT_OUTAGE_EXACT_RECOVERY_FAIL", error: error instanceof Error ? error.stack || error.message : String(error), runKey, pages: [] };
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
