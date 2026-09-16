import net from "node:net";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const BASE = (process.env.MW_WORLD_V0_RAPID_BASE || "http://127.0.0.1:8787").replace(/\/$/, "");
const TARGET = new URL(BASE);
const MODE = process.env.MW_WORLD_V0_RAPID_MODE || "baseline";
const OUTPUT = process.env.MW_WORLD_V0_RAPID_OUTPUT || `world-v0-jump-rapid-${MODE}.json`;
const PROXY_PORT = Number(process.env.MW_WORLD_V0_RAPID_PROXY_PORT || 8796);
const DELAY_MS = Number(process.env.MW_WORLD_V0_RAPID_DELAY_MS || 90);
const STRESS_MS = Number(process.env.MW_WORLD_V0_RAPID_STRESS_MS || 4000);
const PORTS = [9804, 9805];
const TARGET_PAGE = `http://127.0.0.1:${PROXY_PORT}/world-v0/`;
const PEER_PAGE = `${BASE}/world-v0/`;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function assert(value, message) { if (!value) throw new Error(message); }

function hardClose(socket) { if (socket && !socket.destroyed) { try { socket.destroy(); } catch {} } }

function createOrderedDelayProxy() {
  let delayMs = 0;
  const pairs = new Set();
  const timers = new Set();
  let delayedChunks = 0;
  let delayedBytes = 0;
  const server = net.createServer((client) => {
    client.setNoDelay(true);
    const upstream = net.connect({ host: TARGET.hostname, port: Number(TARGET.port || 80) });
    upstream.setNoDelay(true);
    const pair = { client, upstream, nextClientWriteAt: 0 };
    pairs.add(pair);
    const retire = () => { pairs.delete(pair); hardClose(client); hardClose(upstream); };
    client.on("error", retire); upstream.on("error", retire);
    client.on("close", () => { pairs.delete(pair); hardClose(upstream); });
    upstream.on("close", () => { pairs.delete(pair); hardClose(client); });
    client.on("data", (chunk) => {
      const payload = Buffer.from(chunk);
      const now = Date.now();
      const scheduledAt = Math.max(now + delayMs, pair.nextClientWriteAt);
      pair.nextClientWriteAt = scheduledAt + 1;
      const wait = Math.max(0, scheduledAt - now);
      if (!wait) { if (!upstream.destroyed) upstream.write(payload); return; }
      delayedChunks += 1; delayedBytes += payload.byteLength;
      const timer = setTimeout(() => {
        timers.delete(timer);
        if (!upstream.destroyed) upstream.write(payload);
      }, wait);
      timers.add(timer);
    });
    upstream.on("data", (chunk) => { if (!client.destroyed) client.write(chunk); });
  });
  return {
    async listen() { await new Promise((resolve, reject) => { server.once("error", reject); server.listen(PROXY_PORT, "127.0.0.1", resolve); }); },
    setDelay(ms) { delayMs = Math.max(0, Number(ms) || 0); },
    snapshot() { return { delayMs, delayedChunks, delayedBytes, activePairs: pairs.size }; },
    async close() {
      for (const timer of timers) clearTimeout(timer);
      for (const pair of [...pairs]) { hardClose(pair.client); hardClose(pair.upstream); }
      pairs.clear(); timers.clear();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

function findChrome() {
  const override = process.env.CHROME_BIN?.trim();
  if (override) return override;
  const probe = spawnSync("bash", ["-lc", "command -v google-chrome || command -v google-chrome-stable || command -v chromium || command -v chromium-browser"], { encoding: "utf8" });
  const binary = probe.stdout.trim().split("\n")[0];
  if (!binary) throw new Error("Chrome/Chromium binary not found");
  return binary;
}

class Cdp {
  constructor(url) {
    this.ws = new WebSocket(url); this.nextId = 1; this.pending = new Map();
    this.opened = new Promise((resolve, reject) => {
      this.ws.addEventListener("open", resolve, { once: true });
      this.ws.addEventListener("error", () => reject(new Error("CDP open failed")), { once: true });
    });
    this.ws.addEventListener("message", async (event) => {
      const raw = typeof event.data === "string" ? event.data : await event.data.text();
      const message = JSON.parse(raw); if (!message.id) return;
      const waiter = this.pending.get(message.id); if (!waiter) return;
      this.pending.delete(message.id);
      if (message.error) waiter.reject(new Error(`${waiter.method}: ${message.error.message}`));
      else waiter.resolve(message.result || {});
    });
  }
  async call(method, params = {}, sessionId) {
    await this.opened; const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, method });
      const payload = { id, method, params }; if (sessionId) payload.sessionId = sessionId;
      this.ws.send(JSON.stringify(payload));
    });
  }
  async eval(sessionId, expression) {
    const out = await this.call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, userGesture: true }, sessionId);
    if (out.exceptionDetails) throw new Error(out.exceptionDetails.text || "browser eval failed");
    return out.result?.value;
  }
  close() { try { this.ws.close(); } catch {} }
}

async function waitDebugger(port) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (r.ok) { const j = await r.json(); if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl; }
    } catch {}
    await sleep(100);
  }
  throw new Error(`debugger ${port} unavailable`);
}

async function startBrowser(binary, index, url) {
  const profile = mkdtempSync(join(tmpdir(), `mw-jump-rapid-${MODE}-${index}-`));
  const child = spawn(binary, [
    "--headless=new", "--no-sandbox", "--disable-dev-shm-usage",
    "--disable-background-networking", "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding",
    "--use-gl=angle", "--use-angle=swiftshader-webgl", "--enable-unsafe-swiftshader",
    `--remote-debugging-port=${PORTS[index]}`, "--remote-debugging-address=127.0.0.1",
    `--user-data-dir=${profile}`, "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"] });
  const cdp = new Cdp(await waitDebugger(PORTS[index])); await cdp.opened;
  const { targetId } = await cdp.call("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await cdp.call("Target.attachToTarget", { targetId, flatten: true });
  await cdp.call("Runtime.enable", {}, sessionId); await cdp.call("Page.enable", {}, sessionId);
  await cdp.call("Page.navigate", { url }, sessionId);
  return { child, profile, cdp, sessionId };
}
async function stopBrowser(b) { if (!b) return; b.cdp?.close(); if (b.child?.exitCode === null) b.child.kill("SIGKILL"); await sleep(100); try { rmSync(b.profile, { recursive: true, force: true }); } catch {} }
async function evalIn(b, expression) { return b.cdp.eval(b.sessionId, expression); }
async function evidence(b) { return evalIn(b, "window.__sharedYardV0Evidence?.() || null"); }
async function waitFor(b, expression, label, timeout = 45_000) {
  const deadline = Date.now() + timeout; let last = null;
  while (Date.now() < deadline) {
    try { last = await evalIn(b, expression); if (last) return last; } catch (error) { last = String(error); }
    await sleep(75);
  }
  throw new Error(`${label} timeout: ${JSON.stringify(last)}`);
}

const installRapidDriver = `(() => {
  const state = { presses: [], deliveries: [], transitions: [], lastSig: null, lastDeliveredSequence: 0, startedAt: performance.now() };
  window.__mwRapidState = state;
  window.__mwRapidTimer = setInterval(() => {
    const e = window.__sharedYardV0Evidence?.();
    const j = e?.inputScheduler?.jumpDelivery;
    if (!j || e.runtimeFailed) return;
    const sig = [j.pressSequence,j.pending,j.edgeArmed,j.pendingSequence,j.firstAuthoredTick,j.lastAuthoredTick,j.deliveredSequence,j.deliveredTick,j.rearmedTick].join('|');
    if (sig !== state.lastSig) {
      state.lastSig = sig;
      if (state.transitions.length < 1000) state.transitions.push({ t: performance.now(), boundary: e.localBoundaryTick, ...j });
    }
    if (j.deliveredSequence > state.lastDeliveredSequence) {
      state.lastDeliveredSequence = j.deliveredSequence;
      state.deliveries.push({
        t: performance.now(), boundary: e.localBoundaryTick, sequence: j.deliveredSequence,
        deliveredTick: j.deliveredTick, firstAuthoredTick: j.firstAuthoredTick,
        lastAuthoredTick: j.lastAuthoredTick, lastDeliveredApplied: j.lastDeliveredApplied,
      });
    }
    if (j.edgeArmed && !j.pending) {
      const before = {
        priorDeliveredSequence: j.deliveredSequence,
        priorDeliveredTick: j.deliveredTick,
        priorLastAuthoredTick: j.lastAuthoredTick,
        rearmedTick: j.rearmedTick,
      };
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ', bubbles: true, cancelable: true }));
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', key: ' ', bubbles: true, cancelable: true }));
      const after = window.__sharedYardV0Evidence?.()?.inputScheduler?.jumpDelivery;
      if (after?.pressSequence > j.pressSequence) {
        state.presses.push({ t: performance.now(), boundary: e.localBoundaryTick, sequence: after.pressSequence, ...before });
      }
    }
  }, 4);
  return true;
})()`;

const chrome = findChrome(); const proxy = createOrderedDelayProxy();
let target = null; let peer = null;
const result = { revision: "world-v0-jump-rapid-repress-v1", mode: MODE, delayMs: DELAY_MS, stressMs: STRESS_MS, verdict: "RAPID_REPRESS_FAIL" };
try {
  await proxy.listen(); proxy.setDelay(0);
  const suffix = Date.now().toString(36).slice(-7); const runKey = `rapid-${MODE.slice(0,4)}-${suffix}`;
  target = await startBrowser(chrome, 0, `${TARGET_PAGE}?player=RapidA-${suffix}&run=${runKey}`);
  peer = await startBrowser(chrome, 1, `${PEER_PAGE}?player=RapidB-${suffix}&run=${runKey}`);
  await Promise.all([target, peer].map((b, i) => waitFor(b, 'document.readyState==="complete" && typeof window.__sharedYardV0Evidence==="function" && !document.querySelector("#enter")?.disabled', `boot ${i}`)));
  await evalIn(target, 'document.querySelector("#enter").click(); true');
  await evalIn(peer, 'document.querySelector("#enter").click(); true');
  await Promise.all([target, peer].map((b, i) => waitFor(b, '(() => { const e=window.__sharedYardV0Evidence?.(); return e?.identity?.worldEpoch && Number.isInteger(e.protocolStartTick) && e.localBoundaryTick>=e.protocolStartTick+90 && e.metrics.guardMismatches===0 && e.inputScheduler?.jumpDelivery?.edgeArmed===true; })()', `live ${i}`)));

  const before = await evidence(target);
  proxy.setDelay(DELAY_MS);
  await evalIn(target, installRapidDriver);
  await sleep(STRESS_MS);
  proxy.setDelay(0);
  await sleep(1200);
  const trace = await evalIn(target, '(() => { clearInterval(window.__mwRapidTimer); return window.__mwRapidState; })()');
  await sleep(700);
  const after = await evidence(target);

  const presses = trace?.presses || [];
  const deliveries = trace?.deliveries || [];
  const overlaps = presses.filter((p) => Number.isInteger(p.priorLastAuthoredTick) && Number.isInteger(p.rearmedTick) && p.rearmedTick < p.priorLastAuthoredTick);
  const falseBeforeAuthorship = deliveries.filter((d) => !Number.isInteger(d.firstAuthoredTick) || d.deliveredTick < d.firstAuthoredTick);
  const outsideAuthoredRange = deliveries.filter((d) => Number.isInteger(d.firstAuthoredTick) && Number.isInteger(d.lastAuthoredTick) && (d.deliveredTick < d.firstAuthoredTick || d.deliveredTick > d.lastAuthoredTick));

  assert(after.runtimeFailed === false, `runtime failed: ${after.runtimeFailureReason}`);
  assert(after.metrics.guardMismatches === 0 && after.metrics.firstStateMismatch === null, "exact-state guard mismatch");
  assert(after.metrics.authoritySilenceResumes === before.metrics.authoritySilenceResumes, "recovery contamination");
  assert(presses.length >= 2, `insufficient accepted presses: ${presses.length}`);

  const summary = {
    runKey,
    presses: presses.length,
    deliveries: deliveries.length,
    unsafeOverlapCount: overlaps.length,
    falseBeforeAuthorshipCount: falseBeforeAuthorship.length,
    outsideAuthoredRangeCount: outsideAuthoredRange.length,
    overlapExamples: overlaps.slice(0, 8),
    falseAssociationExamples: falseBeforeAuthorship.slice(0, 8),
    correctionDelta: after.metrics.corrections - before.metrics.corrections,
    serverLateDelta: after.metrics.serverLate - before.metrics.serverLate,
    supersededDelta: after.inputScheduler.superseded - before.inputScheduler.superseded,
    appliedDelta: after.inputScheduler.jumpDelivery.appliedCount - before.inputScheduler.jumpDelivery.appliedCount,
    maxCorrection: after.metrics.maxCorrection,
    maxRewind: after.metrics.maxRewind,
    proxy: proxy.snapshot(),
    finalJump: after.inputScheduler.jumpDelivery,
  };

  if (MODE === "baseline") {
    assert(summary.unsafeOverlapCount > 0 || summary.falseBeforeAuthorshipCount > 0,
      `baseline did not reproduce unsafe rapid re-press overlap: ${JSON.stringify(summary)}`);
    result.verdict = "RAPID_REPRESS_BASELINE_OVERLAP_REPRODUCED";
  } else if (MODE === "v26") {
    assert(summary.unsafeOverlapCount === 0, `V26 still rearmed inside prior authored true window: ${JSON.stringify(summary.overlapExamples)}`);
    assert(summary.falseBeforeAuthorshipCount === 0 && summary.outsideAuthoredRangeCount === 0,
      `V26 accepted canonical true outside pending authored range: ${JSON.stringify(summary.falseAssociationExamples)}`);
    result.verdict = "RAPID_REPRESS_V26_DRAIN_BARRIER_HELD";
  } else {
    throw new Error(`unknown mode ${MODE}`);
  }
  Object.assign(result, summary, { trace });
  writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
  console.log(result.verdict, JSON.stringify(summary));
} catch (error) {
  result.error = error instanceof Error ? error.stack || error.message : String(error);
  try { result.targetEvidence = target ? await evidence(target) : null; } catch {}
  result.proxy = proxy.snapshot();
  writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
  console.error(result.verdict, result.error);
  process.exitCode = 1;
} finally {
  await stopBrowser(target); await stopBrowser(peer); await proxy.close();
}
