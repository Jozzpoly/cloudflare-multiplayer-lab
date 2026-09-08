import net from "node:net";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { WORLD_V0_EXPECTED_SIM_BUILD_ID } from "../public/world-v0/build-contract.js";

const BASE = (process.env.MW_WORLD_V0_JUMP_DELIVERY_BASE || "http://127.0.0.1:8787").replace(/\/$/, "");
const TARGET = new URL(BASE);
const PROXY_PORT = Number(process.env.MW_WORLD_V0_JUMP_DELIVERY_PROXY_PORT || 8795);
const LOSS_DELAY_MS = Number(process.env.MW_WORLD_V0_JUMP_DELIVERY_LOSS_DELAY_MS || 180);
const RECOVERY_DELAY_MS = Number(process.env.MW_WORLD_V0_JUMP_DELIVERY_RECOVERY_DELAY_MS || 45);
const OUTPUT = process.env.MW_WORLD_V0_JUMP_DELIVERY_OUTPUT || "world-v0-jump-delivery-persistence.json";
const R1_WINDOW_TICKS = 6;
const PORTS = [9794, 9795];
const TIMEOUT_MS = 45_000;
const TARGET_PAGE = `http://127.0.0.1:${PROXY_PORT}/world-v0/`;
const PEER_PAGE = `${BASE}/world-v0/`;

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function assert(value, message) { if (!value) throw new Error(message); }

function hardClose(socket) {
  if (!socket || socket.destroyed) return;
  try { socket.destroy(); } catch {}
}

function createOrderedDelayProxy() {
  let delayMs = 0;
  let accepted = 0;
  let delayedChunks = 0;
  let delayedBytes = 0;
  let queuedWrites = 0;
  const pairs = new Set();
  const timers = new Set();

  const server = net.createServer((client) => {
    accepted += 1;
    client.setNoDelay(true);
    const upstream = net.connect({
      host: TARGET.hostname,
      port: Number(TARGET.port || (TARGET.protocol === "https:" ? 443 : 80)),
    });
    upstream.setNoDelay(true);
    const pair = { client, upstream, nextClientWriteAt: 0 };
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
      const payload = Buffer.from(chunk);
      const now = Date.now();
      const activeDelay = delayMs;
      const desiredAt = now + activeDelay;
      const scheduledAt = Math.max(desiredAt, pair.nextClientWriteAt);
      pair.nextClientWriteAt = scheduledAt + 1;
      const waitMs = Math.max(0, scheduledAt - now);
      if (waitMs <= 0) {
        if (!upstream.destroyed) upstream.write(payload);
        return;
      }
      delayedChunks += 1;
      delayedBytes += payload.byteLength;
      queuedWrites += 1;
      const timer = setTimeout(() => {
        timers.delete(timer);
        queuedWrites = Math.max(0, queuedWrites - 1);
        if (!upstream.destroyed) upstream.write(payload);
      }, waitMs);
      timers.add(timer);
    });
    upstream.on("data", (chunk) => {
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
    setDelay(value) { delayMs = Math.max(0, Number(value) || 0); },
    snapshot() { return { delayMs, accepted, activePairs: pairs.size, delayedChunks, delayedBytes, queuedWrites }; },
    async close() {
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
      queuedWrites = 0;
      for (const pair of [...pairs]) {
        hardClose(pair.client);
        hardClose(pair.upstream);
      }
      pairs.clear();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

function findChrome() {
  const override = process.env.CHROME_BIN?.trim();
  if (override) return override;
  const probe = spawnSync("bash", ["-lc", "command -v google-chrome || command -v google-chrome-stable || command -v chromium || command -v chromium-browser"], { encoding: "utf8" });
  const binary = probe.stdout.trim().split("\n")[0];
  if (!binary) throw new Error(`Chrome/Chromium binary not found: ${probe.stderr || "no candidate"}`);
  return binary;
}

function chromeVersion(binary) {
  const result = spawnSync(binary, ["--version"], { encoding: "utf8" });
  return (result.stdout || result.stderr || "unknown").trim();
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
    const response = await this.call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, userGesture: true }, sessionId);
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.text || "browser evaluate failed");
    return response.result?.value;
  }
  close() { try { this.ws.close(); } catch {} }
}

async function waitDebugger(port) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(1200) });
      if (response.ok) {
        const value = await response.json();
        if (value.webSocketDebuggerUrl) return value;
      }
    } catch {}
    await sleep(100);
  }
  throw new Error(`debugger ${port} unavailable`);
}

async function startBrowser(binary, index, url) {
  const profile = mkdtempSync(join(tmpdir(), `mw-jump-delivery-${index}-`));
  const stderr = [];
  const child = spawn(binary, [
    "--headless=new", "--no-sandbox", "--disable-dev-shm-usage",
    "--disable-background-networking", "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding",
    "--use-gl=angle", "--use-angle=swiftshader-webgl", "--enable-unsafe-swiftshader",
    `--remote-debugging-port=${PORTS[index]}`, "--remote-debugging-address=127.0.0.1",
    `--user-data-dir=${profile}`, "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"] });
  child.stderr.on("data", (chunk) => stderr.push(chunk));
  const info = await waitDebugger(PORTS[index]);
  const cdp = new Cdp(info.webSocketDebuggerUrl);
  await cdp.opened;
  const { targetId } = await cdp.call("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await cdp.call("Target.attachToTarget", { targetId, flatten: true });
  await cdp.call("Runtime.enable", {}, sessionId);
  await cdp.call("Page.enable", {}, sessionId);
  await cdp.call("Page.navigate", { url }, sessionId);
  return { child, profile, stderr, cdp, sessionId };
}

async function stopBrowser(browser) {
  if (!browser) return;
  browser.cdp?.close();
  if (browser.child?.exitCode === null) browser.child.kill("SIGKILL");
  await sleep(100);
  try { rmSync(browser.profile, { recursive: true, force: true }); } catch {}
}

async function evaluate(browser, expression) { return browser.cdp.evaluate(browser.sessionId, expression); }
async function evidence(browser) { return evaluate(browser, "window.__sharedYardV0Evidence?.() || null"); }

async function waitFor(browser, expression, label, timeout = TIMEOUT_MS) {
  const deadline = Date.now() + timeout;
  let last = null;
  while (Date.now() < deadline) {
    try {
      last = await evaluate(browser, expression);
      if (last) return last;
    } catch (error) { last = error instanceof Error ? error.message : String(error); }
    await sleep(75);
  }
  throw new Error(`${label} timeout: ${JSON.stringify(last)}`);
}

async function triggerJump(browser) {
  return evaluate(browser, `(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space", key: " ", bubbles: true, cancelable: true }));
    setTimeout(() => window.dispatchEvent(new KeyboardEvent("keyup", { code: "Space", key: " ", bubbles: true, cancelable: true })), 20);
    return window.__sharedYardV0Evidence?.() || null;
  })()`);
}

const chrome = findChrome();
const proxy = createOrderedDelayProxy();
let target = null;
let peer = null;
const result = {
  revision: "world-v0-jump-delivery-persistence-audit-v1",
  verdict: "WORLD_V0_JUMP_DELIVERY_PERSISTENCE_FAIL",
  lossDelayMs: LOSS_DELAY_MS,
  recoveryDelayMs: RECOVERY_DELAY_MS,
  r1WindowTicks: R1_WINDOW_TICKS,
  chromeVersion: chromeVersion(chrome),
  generatedAt: new Date().toISOString(),
};

try {
  assert(LOSS_DELAY_MS >= 150, `loss delay too small for R1 falsifier: ${LOSS_DELAY_MS}`);
  assert(RECOVERY_DELAY_MS >= 0 && RECOVERY_DELAY_MS < LOSS_DELAY_MS, "recovery delay must be smaller than loss delay");
  await proxy.listen();
  proxy.setDelay(0);
  const suffix = Date.now().toString(36).slice(-7);
  const runKey = `jump-r2-${suffix}`;
  target = await startBrowser(chrome, 0, `${TARGET_PAGE}?player=JumpR2A-${suffix}&run=${runKey}`);
  peer = await startBrowser(chrome, 1, `${PEER_PAGE}?player=JumpR2B-${suffix}&run=${runKey}`);

  await Promise.all([target, peer].map((browser, index) => waitFor(browser,
    'document.readyState === "complete" && typeof window.__sharedYardV0Evidence === "function" && !document.querySelector("#enter")?.disabled',
    `client ${index} boot`)));
  await evaluate(target, 'document.querySelector("#enter").click(); true');
  await evaluate(peer, 'document.querySelector("#enter").click(); true');
  await Promise.all([target, peer].map((browser, index) => waitFor(browser,
    '(() => { const e=window.__sharedYardV0Evidence?.(); return e?.identity?.worldEpoch && Number.isInteger(e?.protocolStartTick) && e.localBoundaryTick >= e.protocolStartTick + 90 && e.metrics?.guardMismatches === 0 && e.inputScheduler?.jumpDelivery?.edgeArmed === true; })()',
    `client ${index} live baseline`)));

  const baseline = await evidence(target);
  assert(baseline.identity?.simBuildId === WORLD_V0_EXPECTED_SIM_BUILD_ID, `SimBuild drift ${baseline.identity?.simBuildId}`);
  const baseJump = baseline.inputScheduler?.jumpDelivery;
  assert(baseJump && Number.isInteger(baseJump.pressSequence), "jump delivery evidence missing");
  const basePressSequence = baseJump.pressSequence;
  const baseAppliedCount = baseJump.appliedCount;
  const serverLateBefore = baseline.metrics.serverLate;
  const beforeProxy = proxy.snapshot();

  proxy.setDelay(LOSS_DELAY_MS);
  await triggerJump(target);
  await waitFor(target,
    `(() => { const j=window.__sharedYardV0Evidence?.()?.inputScheduler?.jumpDelivery; return j?.pressSequence === ${basePressSequence + 1} && j.pending === true && Number.isInteger(j.firstAuthoredTick) && Number.isInteger(j.lastAuthoredTick) && j.lastAuthoredTick >= j.firstAuthoredTick + ${R1_WINDOW_TICKS - 1}; })()`,
    "R2 authored beyond old six-tick window");

  // Keep the lossy leg active long enough that the first six authored jump ticks
  // have crossed the ordered proxy under 180 ms one-way delay. Later recovery
  // traffic may not overtake them because createOrderedDelayProxy preserves FIFO.
  await sleep(240);
  const lossEvidence = await evidence(target);
  const lossJump = lossEvidence.inputScheduler.jumpDelivery;
  assert(lossJump.pending === true, `jump unexpectedly delivered inside forced-loss leg: ${JSON.stringify(lossJump)}`);
  const firstAuthoredTick = lossJump.firstAuthoredTick;
  proxy.setDelay(RECOVERY_DELAY_MS);

  await waitFor(target,
    `(() => { const j=window.__sharedYardV0Evidence?.()?.inputScheduler?.jumpDelivery; return j?.deliveredSequence === ${basePressSequence + 1} && j.pending === false && Number.isInteger(j.deliveredTick); })()`,
    "R2 canonical jump delivery after transport recovery");
  const delivered = await evidence(target);
  const firstJump = delivered.inputScheduler.jumpDelivery;
  assert(firstJump.deliveredTick - firstAuthoredTick >= R1_WINDOW_TICKS,
    `delivery did not escape old R1 window: first=${firstAuthoredTick} delivered=${firstJump.deliveredTick}`);
  assert(firstJump.lastDeliveredApplied === true,
    `grounded delivery did not apply jump: ${JSON.stringify(firstJump)}`);
  assert(firstJump.appliedCount === baseAppliedCount + 1,
    `first press applied count mismatch: ${baseAppliedCount} -> ${firstJump.appliedCount}`);
  assert(delivered.metrics.serverLate > serverLateBefore,
    `forced-loss leg produced no server late evidence: ${serverLateBefore} -> ${delivered.metrics.serverLate}`);

  await waitFor(target,
    `(() => { const j=window.__sharedYardV0Evidence?.()?.inputScheduler?.jumpDelivery; return j?.edgeArmed === true && Number.isInteger(j.rearmedTick) && j.rearmedTick > j.deliveredTick; })()`,
    "R2 canonical false re-arms next edge");

  // The first jump is now physically airborne. A second press is deliberately made
  // after canonical false has re-armed the edge but before the actor can land. Its
  // canonical true must clear delivery pending even though support rejects the
  // physical impulse. This is the no-coyote/no-landing-buffer guard.
  proxy.setDelay(0);
  await sleep(150);
  const beforeAirPress = await evidence(target);
  assert(beforeAirPress.inputScheduler.jumpDelivery.edgeArmed === true, "second edge was not armed");
  await triggerJump(target);
  await waitFor(target,
    `(() => { const j=window.__sharedYardV0Evidence?.()?.inputScheduler?.jumpDelivery; return j?.deliveredSequence === ${basePressSequence + 2} && j.pending === false; })()`,
    "R2 airborne press canonical delivery");
  const airborneDelivered = await evidence(target);
  const secondJump = airborneDelivered.inputScheduler.jumpDelivery;
  assert(secondJump.lastDeliveredApplied === false,
    `airborne press incorrectly received support/coyote impulse: ${JSON.stringify(secondJump)}`);
  assert(secondJump.appliedCount === baseAppliedCount + 1,
    `airborne press added physical impulse: ${baseAppliedCount} -> ${secondJump.appliedCount}`);

  await waitFor(target,
    `(() => { const j=window.__sharedYardV0Evidence?.()?.inputScheduler?.jumpDelivery; return j?.edgeArmed === true && Number.isInteger(j.rearmedTick) && j.rearmedTick > j.deliveredTick; })()`,
    "R2 airborne press re-arm");
  await sleep(1000);
  const finalEvidence = await evidence(target);
  const finalJump = finalEvidence.inputScheduler.jumpDelivery;
  const afterProxy = proxy.snapshot();
  assert(finalJump.appliedCount === baseAppliedCount + 1,
    `airborne press became delayed landing impulse: ${baseAppliedCount} -> ${finalJump.appliedCount}`);
  assert(finalEvidence.runtimeFailed === false, `browser runtime failed: ${finalEvidence.runtimeFailureReason}`);
  assert(finalEvidence.metrics.guardMismatches === 0 && finalEvidence.metrics.firstStateMismatch === null,
    `exact-state guard failed: ${JSON.stringify(finalEvidence.metrics.firstStateMismatch)}`);
  assert(afterProxy.delayedChunks > beforeProxy.delayedChunks && afterProxy.delayedBytes > beforeProxy.delayedBytes,
    `proxy did not exercise ordered outbound delay: ${JSON.stringify({ beforeProxy, afterProxy })}`);

  Object.assign(result, {
    verdict: "WORLD_V0_JUMP_DELIVERY_PERSISTENCE_PASS",
    runKey,
    simBuildId: baseline.identity.simBuildId,
    worldEpoch: baseline.identity.worldEpoch,
    actorSessionId: baseline.session.actorSessionId,
    firstPress: {
      sequence: basePressSequence + 1,
      firstAuthoredTick,
      deliveredTick: firstJump.deliveredTick,
      deliverySpanTicks: firstJump.deliveredTick - firstAuthoredTick,
      lastDeliveredApplied: firstJump.lastDeliveredApplied,
      rearmedTick: firstJump.rearmedTick,
    },
    airbornePress: {
      sequence: basePressSequence + 2,
      deliveredTick: secondJump.deliveredTick,
      lastDeliveredApplied: secondJump.lastDeliveredApplied,
      appliedCountAfter: secondJump.appliedCount,
    },
    appliedCountBefore: baseAppliedCount,
    appliedCountFinal: finalJump.appliedCount,
    serverLateBefore,
    serverLateAfter: finalEvidence.metrics.serverLate,
    guardMismatches: finalEvidence.metrics.guardMismatches,
    proxy: { before: beforeProxy, after: afterProxy },
    finding: "A jump press remains pending until the authority canonically consumes jump=true. Forced ordered transport loss carries the first successful delivery beyond the complete former six-tick R1 window; recovery still yields exactly one grounded impulse. A second airborne press is canonically delivered but clears pending with jumpApplied=false and never becomes a delayed landing impulse.",
    nonClaim: "This proves bounded recovery for the exercised 180 ms -> 45 ms ordered transport transition. It does not claim survival of arbitrary permanent network failure or add gameplay coyote time / landing buffering.",
  });
  writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
  console.log(result.verdict, JSON.stringify(result));
} catch (error) {
  result.error = error instanceof Error ? error.stack || error.message : String(error);
  result.proxy = proxy.snapshot();
  try { result.targetEvidence = target ? await evidence(target) : null; } catch {}
  writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
  console.error(result.verdict, result.error);
  process.exitCode = 1;
} finally {
  await stopBrowser(target);
  await stopBrowser(peer);
  await proxy.close();
}
