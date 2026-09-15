import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const BASE = process.env.MW_WORLD_V0_R0B2_BASE ?? "http://127.0.0.1:8787";
const PAGE = `${BASE}/world-v0/`;
const OUTPUT = process.env.MW_WORLD_V0_R0B2_OUTPUT || "world-v0-r0b2-chromium.json";
const PORTS = [9242, 9243];
const TIMEOUT_MS = 45_000;

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function assert(condition, message) { if (!condition) throw new Error(message); }
function distance3(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return Infinity;
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
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
  const profile = mkdtempSync(join(tmpdir(), `mw-r0b2-${index}-`));
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
async function clickEnter(client) {
  await client.cdp.evaluate(client.sessionId, 'document.querySelector("#enter").click(); true');
}
async function holdKey(client, code, ms) {
  await client.cdp.evaluate(client.sessionId, `window.dispatchEvent(new KeyboardEvent("keydown", { code: ${JSON.stringify(code)}, bubbles: true })); true`);
  await sleep(ms);
  await client.cdp.evaluate(client.sessionId, `window.dispatchEvent(new KeyboardEvent("keyup", { code: ${JSON.stringify(code)}, bubbles: true })); true`);
}

const chrome = findChrome();
const version = chromeVersion(chrome);
const clients = [];
let runKey = null;
try {
  const suffix = Date.now().toString(36).slice(-7);
  runKey = `r0b2-${suffix}`;
  const urlA = `${PAGE}?player=R0A-${suffix}&run=${runKey}&lifecycle=r0`;
  clients[0] = await startClient(chrome, 0, urlA);
  await waitFor(clients[0], 'document.readyState === "complete" && typeof window.__sharedYardV0Evidence === "function" && !document.querySelector("#enter")?.disabled', "A boot");
  await clickEnter(clients[0]);
  await waitFor(clients[0], '(() => { const e=window.__sharedYardV0Evidence?.(); return e?.lifecycle?.r0 === true && e?.lifecycle?.topology?.revision === 1 && e.lifecycle.topology.actors?.length === 1 && Number.isInteger(e.protocolStartTick) && e.localBoundaryTick >= e.protocolStartTick + 90 && e.metrics.guardMismatches === 0 && e.inputScheduler.authored > 30 && Array.isArray(e.livePhysics?.selfPosition); })()', "A sustained solo world");

  const soloBeforeMove = await evidence(clients[0]);
  await holdKey(clients[0], "KeyW", 700);
  await waitFor(clients[0], `(() => { const e=window.__sharedYardV0Evidence?.(); return e && e.localBoundaryTick >= ${soloBeforeMove.localBoundaryTick + 35} && e.metrics.guardMismatches === 0; })()`, "A canonical solo movement settles");
  const soloMoved = await evidence(clients[0]);
  assert(distance3(soloBeforeMove.livePhysics.selfPosition, soloMoved.livePhysics.selfPosition) > 0.08, "A did not physically move while solo");
  assert(soloMoved.inputScheduler.authored > soloBeforeMove.inputScheduler.authored, "A solo input authorship did not advance");

  const sentinel = `r0b2-sentinel-${suffix}`;
  await clients[0].cdp.evaluate(clients[0].sessionId, `(() => { window.__r0b2DocumentSentinel=${JSON.stringify(sentinel)}; const canvas=document.querySelector("#viewport canvas"); canvas.dispatchEvent(new WheelEvent("wheel", { deltaY: 260, bubbles: true, cancelable: true })); return true; })()`);
  await waitFor(clients[0], '(() => { const e=window.__sharedYardV0Evidence?.(); return e?.presentation?.cameraOrbit?.userAdjusted === true; })()', "A camera adjustment");
  const beforeJoinA = await evidence(clients[0]);
  const sentinelBefore = await clients[0].cdp.evaluate(clients[0].sessionId, "window.__r0b2DocumentSentinel");
  assert(sentinelBefore === sentinel, "A document sentinel was not installed");
  assert(beforeJoinA.lifecycle.topology.entityOrder.length === 13, "solo topology should contain 13 dynamic entities");
  assert(beforeJoinA.presentation.remotePresence === null, "solo A unexpectedly rendered a peer");

  const urlB = `${PAGE}?player=R0B-${suffix}&run=${runKey}&lifecycle=r0`;
  clients[1] = await startClient(chrome, 1, urlB);
  await waitFor(clients[1], 'document.readyState === "complete" && typeof window.__sharedYardV0Evidence === "function" && !document.querySelector("#enter")?.disabled', "B boot");
  await clickEnter(clients[1]);

  await waitFor(clients[0], '(() => { const e=window.__sharedYardV0Evidence?.(); const ev=(e?.lifecycleEvents||[]).find((x)=>x.type==="r0-topology-rebase-complete"); return e && !e.runtimeFailed && e.lifecycle?.topology?.revision === 2 && e.lifecycle.topology.actors?.length === 2 && e.lifecycle.topologyTransitionPending === false && e.presentation?.remotePresence === "PEER" && e.metrics.guardMismatches === 0 && ev && e.localBoundaryTick >= ev.boundaryTick + 35; })()', "A topology 1->2 rebase and continuation");
  await waitFor(clients[1], '(() => { const e=window.__sharedYardV0Evidence?.(); const ev=(e?.lifecycleEvents||[]).find((x)=>x.type==="r0-late-join-bootstrap"); return e && !e.runtimeFailed && e.lifecycle?.topology?.revision === 2 && e.lifecycle.topology.actors?.length === 2 && Number.isInteger(e.protocolStartTick) && e.presentation?.remotePresence === "PEER" && e.metrics.guardMismatches === 0 && ev && e.localBoundaryTick >= ev.boundaryTick + 35; })()', "B late-join bootstrap and continuation");

  const joinedA = await evidence(clients[0]);
  const joinedB = await evidence(clients[1]);
  const sentinelAfter = await clients[0].cdp.evaluate(clients[0].sessionId, "window.__r0b2DocumentSentinel");
  assert(sentinelAfter === sentinel, "A document was replaced during topology transition");
  assert(joinedA.identity.worldEpoch === beforeJoinA.identity.worldEpoch, "A WorldEpoch rotated during late join");
  assert(joinedB.identity.worldEpoch === beforeJoinA.identity.worldEpoch, "B joined a different WorldEpoch");
  assert(joinedA.session.actorSessionId === beforeJoinA.session.actorSessionId, "A ActorSession changed during late join");
  assert(joinedA.session.selfNetEntityId === beforeJoinA.session.selfNetEntityId, "A NetEntityId changed during late join");
  assert(joinedA.lifecycle.topology.entityOrder.length === 14 && joinedB.lifecycle.topology.entityOrder.length === 14, "topology 2 should contain 14 dynamic entities");
  assert(joinedA.lifecycle.topology.digest === joinedB.lifecycle.topology.digest, "browser topology digest disagreement");
  assert(joinedA.presentation.cameraOrbit.userAdjusted === true, "A camera adjustment was lost");
  assert(Math.abs(joinedA.presentation.cameraOrbit.distance - beforeJoinA.presentation.cameraOrbit.distance) < 1e-9, "A camera distance reset during topology rebase");
  assert(Math.abs(joinedA.presentation.cameraOrbit.yaw - beforeJoinA.presentation.cameraOrbit.yaw) < 1e-9, "A camera yaw reset during topology rebase");
  assert(Math.abs(joinedA.presentation.cameraOrbit.pitch - beforeJoinA.presentation.cameraOrbit.pitch) < 1e-9, "A camera pitch reset during topology rebase");
  assert(joinedA.metrics.rebases >= beforeJoinA.metrics.rebases + 1, "A topology transition did not use authority rebase");
  assert((joinedB.lifecycleEvents || []).some((event) => event.type === "r0-late-join-bootstrap"), "B late-join bootstrap evidence missing");

  const authoredA = joinedA.inputScheduler.authored;
  const authoredB = joinedB.inputScheduler.authored;
  const posA = joinedA.livePhysics.selfPosition;
  const posB = joinedB.livePhysics.selfPosition;
  await Promise.all([holdKey(clients[0], "KeyW", 700), holdKey(clients[1], "KeyD", 700)]);
  await waitFor(clients[0], `(() => { const e=window.__sharedYardV0Evidence?.(); return e && e.inputScheduler.authored > ${authoredA + 10} && e.metrics.guardMismatches === 0 && e.metrics.guardMatches > ${joinedA.metrics.guardMatches}; })()`, "A post-join canonical input and exact guard");
  await waitFor(clients[1], `(() => { const e=window.__sharedYardV0Evidence?.(); return e && e.inputScheduler.authored > ${authoredB + 10} && e.metrics.guardMismatches === 0 && e.metrics.guardMatches > ${joinedB.metrics.guardMatches}; })()`, "B post-join canonical input and exact guard");
  const finalA = await evidence(clients[0]);
  const finalB = await evidence(clients[1]);
  assert(distance3(posA, finalA.livePhysics.selfPosition) > 0.08, "A did not continue moving after B joined");
  assert(distance3(posB, finalB.livePhysics.selfPosition) > 0.08, "B did not move after late join");
  assert(finalA.metrics.guardMismatches === 0 && finalB.metrics.guardMismatches === 0, "exact state guard mismatch after dynamic join");
  assert(finalA.lifecycle.topology.digest === finalB.lifecycle.topology.digest, "final topology digest disagreement");
  assert(distance3(finalA.livePhysics.remotePosition, finalB.livePhysics.selfPosition) < 1.0, "A remote/B self prediction disagreement too large");
  assert(distance3(finalB.livePhysics.remotePosition, finalA.livePhysics.selfPosition) < 1.0, "B remote/A self prediction disagreement too large");

  const topologyEvent = (finalA.lifecycleEvents || []).find((event) => event.type === "r0-topology-rebase-complete");
  const result = {
    revision: "world-v0-lifecycle-independence-r0b2-real-chromium-v1",
    runKey,
    chromeVersion: version,
    worldEpoch: finalA.identity.worldEpoch,
    solo: {
      actorSessionId: beforeJoinA.session.actorSessionId,
      topologyRevision: beforeJoinA.lifecycle.topology.revision,
      topologyDigest: beforeJoinA.lifecycle.topology.digest,
      entityCount: beforeJoinA.lifecycle.topology.entityOrder.length,
      movedMeters: distance3(soloBeforeMove.livePhysics.selfPosition, soloMoved.livePhysics.selfPosition),
      boundary: beforeJoinA.localBoundaryTick,
    },
    transition: {
      boundaryTick: topologyEvent?.boundaryTick ?? null,
      topologyRevision: finalA.lifecycle.topology.revision,
      topologyDigest: finalA.lifecycle.topology.digest,
      entityCount: finalA.lifecycle.topology.entityOrder.length,
      worldEpochPreserved: finalA.identity.worldEpoch === beforeJoinA.identity.worldEpoch,
      actorSessionPreserved: finalA.session.actorSessionId === beforeJoinA.session.actorSessionId,
      documentSentinelPreserved: sentinelAfter === sentinel,
      cameraPreserved: Math.abs(finalA.presentation.cameraOrbit.distance - beforeJoinA.presentation.cameraOrbit.distance) < 1e-9,
      aRebases: finalA.metrics.rebases,
      bRebases: finalB.metrics.rebases,
    },
    continuation: {
      aAuthored: finalA.inputScheduler.authored,
      bAuthored: finalB.inputScheduler.authored,
      aGuardMatches: finalA.metrics.guardMatches,
      bGuardMatches: finalB.metrics.guardMatches,
      aGuardMismatches: finalA.metrics.guardMismatches,
      bGuardMismatches: finalB.metrics.guardMismatches,
      aMovedMeters: distance3(posA, finalA.livePhysics.selfPosition),
      bMovedMeters: distance3(posB, finalB.livePhysics.selfPosition),
    },
    verdict: "WORLD_V0_LIFECYCLE_INDEPENDENCE_R0B2_REAL_CHROMIUM_PASS",
    nonClaim: "This proves the bounded opt-in R0 browser transition from one live actor to two live actors in one local Workerd WorldEpoch, including exact authority rebase, preserved incumbent document/session/camera state, and continued browser input/guard correctness. It does not prove 2->1 topology removal, actor replacement, more than two actors, remote Cloudflare placement, mobile browsers, or production UX readiness.",
  };
  writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
  console.log("WORLD_V0_LIFECYCLE_INDEPENDENCE_R0B2_REAL_CHROMIUM", JSON.stringify(result, null, 2));
  console.log(result.verdict);
} catch (error) {
  const diagnostic = {
    verdict: "WORLD_V0_LIFECYCLE_INDEPENDENCE_R0B2_REAL_CHROMIUM_FAIL",
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
  await Promise.all(clients.map(stopClient));
}
