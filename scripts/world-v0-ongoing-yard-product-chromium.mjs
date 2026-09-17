import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const BASE = process.env.MW_WORLD_V0_ONGOING_BASE ?? "http://127.0.0.1:8787";
const OUTPUT = process.env.MW_WORLD_V0_ONGOING_OUTPUT ?? "world-v0-ongoing-yard-product.json";
const PORTS = [9252, 9253];
const TIMEOUT_MS = 45_000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function assert(condition, message) { if (!condition) throw new Error(message); }
function distance3(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); }

function findChrome() {
  const override = process.env.CHROME_BIN?.trim();
  if (override) return override;
  const probe = spawnSync("bash", ["-lc", "command -v google-chrome || command -v google-chrome-stable || command -v chromium || command -v chromium-browser"], { encoding: "utf8" });
  const binary = probe.stdout.trim().split("\n")[0];
  if (!binary) throw new Error(`Chrome binary not found: ${probe.stderr || "no candidate"}`);
  return binary;
}

async function waitForDebugger(port) {
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
  throw new Error(`CDP ${port} unavailable`);
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
    return await new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, method });
      const payload = { id, method, params };
      if (sessionId) payload.sessionId = sessionId;
      this.ws.send(JSON.stringify(payload));
    });
  }
  async eval(sessionId, expression) {
    const result = await this.call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, userGesture: true }, sessionId);
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || "browser evaluation failed");
    return result.result?.value;
  }
  close() { try { this.ws.close(); } catch {} }
}

async function startClient(binary, index) {
  const port = PORTS[index];
  const profile = mkdtempSync(join(tmpdir(), `mw-ongoing-${index}-`));
  const child = spawn(binary, [
    "--headless=new", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
    "--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding",
    `--remote-debugging-port=${port}`, "--remote-debugging-address=127.0.0.1", `--user-data-dir=${profile}`, "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"] });
  const cdp = new Cdp(await waitForDebugger(port));
  await cdp.opened;
  const { targetId } = await cdp.call("Target.createTarget", { url: `${BASE}/world-v0/` });
  const { sessionId } = await cdp.call("Target.attachToTarget", { targetId, flatten: true });
  await cdp.call("Runtime.enable", {}, sessionId);
  await cdp.call("Page.enable", {}, sessionId);
  return { profile, child, cdp, sessionId };
}

async function stopClient(client) {
  if (!client) return;
  client.cdp?.close();
  if (client.child?.exitCode === null) client.child.kill("SIGKILL");
  await sleep(100);
  try { rmSync(client.profile, { recursive: true, force: true }); } catch {}
}

async function waitFor(client, expression, label, timeoutMs = TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    try {
      last = await client.cdp.eval(client.sessionId, expression);
      if (last) return last;
    } catch (error) { last = error instanceof Error ? error.message : String(error); }
    await sleep(100);
  }
  throw new Error(`${label} timeout · last=${JSON.stringify(last)}`);
}

async function evidence(client) {
  return client.cdp.eval(client.sessionId, "window.__sharedYardV0Evidence?.() ?? null");
}

async function enterRoom(client, name, roomId) {
  await waitFor(client, `(() => { const b=document.querySelector('[data-room-id="${roomId}"]'); return document.readyState === "complete" && typeof window.__sharedYardV0Evidence === "function" && b && !b.disabled; })()`, `${name} room list ready`);
  await client.cdp.eval(client.sessionId, `(() => { const input=document.querySelector('#callsign'); input.value=${JSON.stringify(name)}; input.dispatchEvent(new Event('input', { bubbles:true })); document.querySelector('[data-room-id="${roomId}"]').click(); return true; })()`);
}

async function holdKey(client, code, ms) {
  await client.cdp.eval(client.sessionId, `window.dispatchEvent(new KeyboardEvent('keydown', { code:${JSON.stringify(code)}, bubbles:true })); true`);
  await sleep(ms);
  await client.cdp.eval(client.sessionId, `window.dispatchEvent(new KeyboardEvent('keyup', { code:${JSON.stringify(code)}, bubbles:true })); true`);
}

const chrome = findChrome();
const chromeVersion = (spawnSync(chrome, ["--version"], { encoding: "utf8" }).stdout || "unknown").trim();
const clients = [];
try {
  clients[0] = await startClient(chrome, 0);
  await enterRoom(clients[0], "OngoingA", "yard-1");
  await waitFor(clients[0], `(() => { const e=window.__sharedYardV0Evidence?.(); return e?.lifecycle?.r0 === true && e.lifecycle.topology?.revision === 1 && e.lifecycle.topology.actors?.length === 1 && Number.isInteger(e.protocolStartTick) && e.localBoundaryTick >= e.protocolStartTick + 80 && e.metrics.guardMismatches === 0 && e.inputScheduler.authored > 30; })()`, "A live solo Yard");

  const soloBefore = await evidence(clients[0]);
  await holdKey(clients[0], "KeyW", 700);
  await waitFor(clients[0], `(() => { const e=window.__sharedYardV0Evidence?.(); return e && e.localBoundaryTick >= ${soloBefore.localBoundaryTick + 30} && e.metrics.guardMismatches === 0; })()`, "A solo movement settle");
  const soloAfter = await evidence(clients[0]);
  assert(distance3(soloBefore.livePhysics.selfPosition, soloAfter.livePhysics.selfPosition) > 0.08, "A did not move while alone");

  const directory = await clients[0].cdp.eval(clients[0].sessionId, "fetch('/api/world-v0/rooms', { cache:'no-store' }).then(r => r.json())");
  const yard = directory.rooms.find((room) => room.id === "yard-1");
  assert(directory.revision === "world-v0-public-room-directory-r5-ongoing-yard", "directory revision mismatch");
  assert(yard?.occupancy === 1 && yard.connected === 1, "directory did not expose live 1/2 occupancy");
  assert(yard?.state === "live" && yard.joinable === true, "live solo Yard was not joinable");
  assert(String(yard.joinPath).includes("lifecycle=r0"), "public join path did not carry ongoing lifecycle");

  const sentinel = `ongoing-${Date.now()}`;
  await clients[0].cdp.eval(clients[0].sessionId, `window.__ongoingDocumentSentinel=${JSON.stringify(sentinel)}; true`);

  clients[1] = await startClient(chrome, 1);
  await waitFor(clients[1], `(() => { const b=document.querySelector('[data-room-id="yard-1"]'); return b && !b.disabled && /Live/.test(b.textContent) && /Join/.test(b.textContent); })()`, "B sees live joinable Yard");
  await enterRoom(clients[1], "OngoingB", "yard-1");

  await waitFor(clients[0], `(() => { const e=window.__sharedYardV0Evidence?.(); return e && !e.runtimeFailed && e.lifecycle.topology?.revision === 2 && e.lifecycle.topology.actors?.length === 2 && e.presentation?.remotePresence === "PEER" && e.metrics.guardMismatches === 0 && (e.lifecycleEvents||[]).some(x=>x.type==='r0-topology-rebase-complete'); })()`, "A observes B without restart");
  await waitFor(clients[1], `(() => { const e=window.__sharedYardV0Evidence?.(); return e && !e.runtimeFailed && e.lifecycle.topology?.revision === 2 && e.lifecycle.topology.actors?.length === 2 && e.presentation?.remotePresence === "PEER" && e.metrics.guardMismatches === 0 && (e.lifecycleEvents||[]).some(x=>x.type==='r0-late-join-bootstrap'); })()`, "B joins running Yard");

  const joinedA = await evidence(clients[0]);
  const joinedB = await evidence(clients[1]);
  assert(joinedA.identity.worldEpoch === soloAfter.identity.worldEpoch, "A WorldEpoch rotated when B joined");
  assert(joinedB.identity.worldEpoch === soloAfter.identity.worldEpoch, "B joined a different WorldEpoch");
  assert(joinedA.session.actorSessionId === soloAfter.session.actorSessionId, "A ActorSession changed when B joined");
  assert(await clients[0].cdp.eval(clients[0].sessionId, "window.__ongoingDocumentSentinel") === sentinel, "A document was replaced");
  assert(joinedA.lifecycle.topology.digest === joinedB.lifecycle.topology.digest, "clients disagree on topology digest");

  const authoredA = joinedA.inputScheduler.authored;
  const authoredB = joinedB.inputScheduler.authored;
  await Promise.all([holdKey(clients[0], "KeyW", 650), holdKey(clients[1], "KeyD", 650)]);
  await waitFor(clients[0], `(() => { const e=window.__sharedYardV0Evidence?.(); return e && e.inputScheduler.authored > ${authoredA + 8} && e.metrics.guardMismatches === 0; })()`, "A continues after join");
  await waitFor(clients[1], `(() => { const e=window.__sharedYardV0Evidence?.(); return e && e.inputScheduler.authored > ${authoredB + 8} && e.metrics.guardMismatches === 0; })()`, "B continues after join");

  const finalA = await evidence(clients[0]);
  const finalB = await evidence(clients[1]);
  const result = {
    revision: "world-v0-ongoing-yard-public-flow-v1",
    chromeVersion,
    directory: { occupancy: yard.occupancy, connected: yard.connected, state: yard.state, joinable: yard.joinable },
    worldEpoch: finalA.identity.worldEpoch,
    solo: { boundary: soloAfter.localBoundaryTick, movedMeters: distance3(soloBefore.livePhysics.selfPosition, soloAfter.livePhysics.selfPosition) },
    join: {
      topologyRevision: finalA.lifecycle.topology.revision,
      topologyDigest: finalA.lifecycle.topology.digest,
      incumbentActorSessionPreserved: finalA.session.actorSessionId === soloAfter.session.actorSessionId,
      documentPreserved: true,
    },
    continuation: {
      aAuthored: finalA.inputScheduler.authored,
      bAuthored: finalB.inputScheduler.authored,
      aGuardMatches: finalA.metrics.guardMatches,
      bGuardMatches: finalB.metrics.guardMatches,
      aGuardMismatches: finalA.metrics.guardMismatches,
      bGuardMismatches: finalB.metrics.guardMismatches,
    },
    verdict: "WORLD_V0_ONGOING_YARD_PUBLIC_FLOW_PASS",
  };
  writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  console.log(result.verdict);
} catch (error) {
  const failure = { verdict: "WORLD_V0_ONGOING_YARD_PUBLIC_FLOW_FAIL", error: error instanceof Error ? error.stack || error.message : String(error), pages: [] };
  for (const client of clients) {
    try { failure.pages.push(await evidence(client)); } catch {}
  }
  writeFileSync(OUTPUT, JSON.stringify(failure, null, 2));
  console.error(failure.error);
  process.exitCode = 1;
} finally {
  await Promise.all(clients.map(stopClient));
}
