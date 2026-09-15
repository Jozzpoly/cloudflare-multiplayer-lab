import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const BASE = process.env.MW_WORLD_V0_MATRIX_BASE ?? "http://127.0.0.1:8787";
const OUTPUT = process.env.MW_WORLD_V0_MATRIX_OUTPUT ?? "world-v0-smoothness-latency-camera-matrix.json";
const PORT = 9382;
const PHASE_MS = Number(process.env.MW_WORLD_V0_MATRIX_PHASE_MS ?? 2500);
const STEP_MS = 25;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function assert(value, message) { if (!value) throw new Error(message); }

function findChrome() {
  const override = process.env.CHROME_BIN?.trim();
  if (override) return override;
  const probe = spawnSync("bash", ["-lc", "command -v google-chrome || command -v google-chrome-stable || command -v chromium || command -v chromium-browser"], { encoding: "utf8" });
  const binary = probe.stdout.trim().split("\n")[0];
  if (!binary) throw new Error("Chrome binary not found");
  return binary;
}

async function waitDebugger() {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (response.ok) {
        const body = await response.json();
        if (body.webSocketDebuggerUrl) return body.webSocketDebuggerUrl;
      }
    } catch {}
    await sleep(100);
  }
  throw new Error("CDP unavailable");
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

async function waitFor(cdp, page, expression, label, timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    try {
      last = await cdp.eval(page.sessionId, expression);
      if (last) return last;
    } catch (error) { last = error instanceof Error ? error.message : String(error); }
    await sleep(100);
  }
  throw new Error(`${label} timeout last=${JSON.stringify(last)}`);
}

async function createContext(cdp) {
  return (await cdp.call("Target.createBrowserContext", {})).browserContextId;
}
async function createPage(cdp, browserContextId, name) {
  const { targetId } = await cdp.call("Target.createTarget", { url: `${BASE}/world-v0/?lifecycle=r0`, browserContextId });
  const { sessionId } = await cdp.call("Target.attachToTarget", { targetId, flatten: true });
  await cdp.call("Runtime.enable", {}, sessionId);
  await cdp.call("Page.enable", {}, sessionId);
  await cdp.call("Network.enable", {}, sessionId);
  return { name, targetId, sessionId, browserContextId };
}
async function setLatency(cdp, page, latency) {
  await cdp.call("Network.emulateNetworkConditions", {
    offline: false,
    latency,
    downloadThroughput: 12_500_000,
    uploadThroughput: 12_500_000,
    connectionType: "wifi",
  }, page.sessionId);
}
async function evidence(cdp, page) { return cdp.eval(page.sessionId, "window.__sharedYardV0Evidence?.() ?? null"); }
async function enter(cdp, page, callsign, room) {
  await waitFor(cdp, page, `(() => { const b=document.querySelector('[data-room-id="${room}"]'); return b && !b.disabled && typeof window.__sharedYardV0Evidence==='function'; })()`, `${page.name} ready`);
  await cdp.eval(page.sessionId, `(() => { const i=document.querySelector('#callsign'); i.value=${JSON.stringify(callsign)}; i.dispatchEvent(new Event('input',{bubbles:true})); document.querySelector('[data-room-id="${room}"]').click(); return true; })()`);
}
async function key(cdp, page, type, code) {
  await cdp.eval(page.sessionId, `window.dispatchEvent(new KeyboardEvent(${JSON.stringify(type)},{code:${JSON.stringify(code)},bubbles:true,cancelable:true})); true`);
}
async function nudgeCamera(cdp, page, dx) {
  await cdp.eval(page.sessionId, `(() => {
    const c=document.querySelector('canvas'); if(!c) return false;
    const r=c.getBoundingClientRect(); const x=r.left+r.width*0.5; const y=r.top+r.height*0.5; const id=92;
    c.dispatchEvent(new PointerEvent('pointerdown',{pointerId:id,pointerType:'mouse',button:0,clientX:x,clientY:y,bubbles:true,cancelable:true}));
    c.dispatchEvent(new PointerEvent('pointermove',{pointerId:id,pointerType:'mouse',buttons:1,clientX:x+${Number(dx)},clientY:y,bubbles:true,cancelable:true}));
    c.dispatchEvent(new PointerEvent('pointerup',{pointerId:id,pointerType:'mouse',button:0,clientX:x+${Number(dx)},clientY:y,bubbles:true,cancelable:true}));
    return true;
  })()`);
}

function reasonCounts(evidence, minTargetTick) {
  const counts = {};
  for (const event of evidence.corrections || []) {
    if (!Number.isInteger(event.targetTick) || event.targetTick < minTargetTick) continue;
    counts[event.reason] = (counts[event.reason] || 0) + 1;
  }
  return counts;
}

function delta(before, after, phaseStartBoundary) {
  return {
    corrections: after.metrics.corrections - before.metrics.corrections,
    superseded: after.inputScheduler.superseded - before.inputScheduler.superseded,
    authored: after.inputScheduler.authored - before.inputScheduler.authored,
    serverLate: after.metrics.serverLate - before.metrics.serverLate,
    guardMismatches: after.metrics.guardMismatches - before.metrics.guardMismatches,
    authoritySilenceResumes: after.metrics.authoritySilenceResumes - before.metrics.authoritySilenceResumes,
    reasonsSincePhaseStartTick: reasonCounts(after, phaseStartBoundary),
    maxCorrection: after.metrics.maxCorrection,
    maxRewind: after.metrics.maxRewind,
    rttMedianMs: after.rtt.medianMs,
    rttP95Ms: after.rtt.p95Ms,
    frameP95Ms: after.frame.p95Ms,
  };
}

async function runPhase(cdp, author, observer, { name, latencyMs, rotate }) {
  await Promise.all([setLatency(cdp, author, latencyMs), setLatency(cdp, observer, latencyMs)]);
  await sleep(Math.max(700, latencyMs * 5));
  const beforeAuthor = await evidence(cdp, author);
  const beforeObserver = await evidence(cdp, observer);
  const phaseStartBoundary = Math.min(beforeAuthor.localBoundaryTick, beforeObserver.localBoundaryTick);

  await key(cdp, author, "keydown", "KeyW");
  const steps = Math.ceil(PHASE_MS / STEP_MS);
  for (let step = 0; step < steps; step += 1) {
    if (rotate) await nudgeCamera(cdp, author, step % 2 === 0 ? 2.5 : 3.5);
    await sleep(STEP_MS);
  }
  await key(cdp, author, "keyup", "KeyW");

  await Promise.all([
    waitFor(cdp, author, `(() => { const e=window.__sharedYardV0Evidence?.(); return e && !e.runtimeFailed && e.metrics.guardMismatches===0 && e.networkState.startsWith('live') && Number.isInteger(e.metrics.latestAuthorityBoundary) && e.localBoundaryTick>=e.metrics.latestAuthorityBoundary-4; })()`, `${name} author settle`, 20_000),
    waitFor(cdp, observer, `(() => { const e=window.__sharedYardV0Evidence?.(); return e && !e.runtimeFailed && e.metrics.guardMismatches===0 && e.networkState.startsWith('live') && Number.isInteger(e.metrics.latestAuthorityBoundary) && e.localBoundaryTick>=e.metrics.latestAuthorityBoundary-4; })()`, `${name} observer settle`, 20_000),
  ]);
  await sleep(Math.max(500, latencyMs * 3));
  const afterAuthor = await evidence(cdp, author);
  const afterObserver = await evidence(cdp, observer);
  const authorDelta = delta(beforeAuthor, afterAuthor, phaseStartBoundary);
  const observerDelta = delta(beforeObserver, afterObserver, phaseStartBoundary);
  assert(authorDelta.guardMismatches === 0 && observerDelta.guardMismatches === 0, `${name} guard mismatch`);
  assert(authorDelta.authoritySilenceResumes === 0 && observerDelta.authoritySilenceResumes === 0, `${name} recovery contamination`);
  return { name, latencyMs, rotate, phaseStartBoundary, author: authorDelta, observer: observerDelta };
}

const chrome = findChrome();
const profile = mkdtempSync(join(tmpdir(), "mw-latency-camera-matrix-"));
const child = spawn(chrome, [
  "--headless=new", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
  `--remote-debugging-port=${PORT}`, "--remote-debugging-address=127.0.0.1", `--user-data-dir=${profile}`, "about:blank",
], { stdio: ["ignore", "ignore", "pipe"] });
let cdp = null;
try {
  cdp = new Cdp(await waitDebugger());
  await cdp.opened;
  const authorContext = await createContext(cdp);
  const observerContext = await createContext(cdp);
  const author = await createPage(cdp, authorContext, "author");
  const observer = await createPage(cdp, observerContext, "observer");
  await Promise.all([setLatency(cdp, author, 0), setLatency(cdp, observer, 0)]);

  await enter(cdp, author, "MatrixAuthor", "yard-3");
  await waitFor(cdp, author, `(() => { const e=window.__sharedYardV0Evidence?.(); return e?.lifecycle?.topology?.revision===1 && Number.isInteger(e.protocolStartTick) && e.localBoundaryTick>=e.protocolStartTick+60 && e.metrics.guardMismatches===0; })()`, "author solo live");
  await enter(cdp, observer, "MatrixObserver", "yard-3");
  await Promise.all([
    waitFor(cdp, author, `(() => { const e=window.__sharedYardV0Evidence?.(); return e?.lifecycle?.topology?.revision===2 && e.presentation?.remotePresence==='PEER' && e.metrics.guardMismatches===0 && e.networkState.startsWith('live'); })()`, "author topology2"),
    waitFor(cdp, observer, `(() => { const e=window.__sharedYardV0Evidence?.(); return e?.lifecycle?.topology?.revision===2 && e.presentation?.remotePresence==='PEER' && e.metrics.guardMismatches===0 && e.networkState.startsWith('live'); })()`, "observer topology2"),
  ]);
  await sleep(800);

  const phases = [];
  phases.push(await runPhase(cdp, author, observer, { name: "fixed-0ms", latencyMs: 0, rotate: false }));
  phases.push(await runPhase(cdp, author, observer, { name: "orbit-0ms", latencyMs: 0, rotate: true }));
  phases.push(await runPhase(cdp, author, observer, { name: "fixed-90ms", latencyMs: 90, rotate: false }));
  phases.push(await runPhase(cdp, author, observer, { name: "orbit-90ms", latencyMs: 90, rotate: true }));

  const byName = Object.fromEntries(phases.map((phase) => [phase.name, phase]));
  const interaction = {
    authorSupersessionIncreaseFromOrbitAt90ms: byName["orbit-90ms"].author.superseded - byName["fixed-90ms"].author.superseded,
    authorLateIncreaseFromOrbitAt90ms: byName["orbit-90ms"].author.serverLate - byName["fixed-90ms"].author.serverLate,
    authorCorrectionIncreaseFromOrbitAt90ms: byName["orbit-90ms"].author.corrections - byName["fixed-90ms"].author.corrections,
    observerCorrectionIncreaseFromOrbitAt90ms: byName["orbit-90ms"].observer.corrections - byName["fixed-90ms"].observer.corrections,
  };

  assert(byName["orbit-0ms"].author.superseded > byName["fixed-0ms"].author.superseded, "camera orbit did not increase future supersession at zero added latency");
  assert(byName["orbit-90ms"].author.superseded > byName["fixed-90ms"].author.superseded, "camera orbit did not increase future supersession under latency");
  assert(interaction.authorLateIncreaseFromOrbitAt90ms > 0, "camera orbit under latency did not increase server-late revisions over fixed-camera control");
  assert(interaction.authorCorrectionIncreaseFromOrbitAt90ms > 0, "camera orbit under latency did not increase author corrections over fixed-camera control");

  const result = {
    revision: "world-v0-smoothness-latency-camera-matrix-v1",
    chromeVersion: (spawnSync(chrome, ["--version"], { encoding: "utf8" }).stdout || "unknown").trim(),
    phaseMs: PHASE_MS,
    phases,
    interaction,
    verdict: "CAMERA_LATENCY_INTERACTION_CORRECTION_PRESSURE_MEASURED",
    nonClaim: "This is a controlled local-browser differential experiment, not a calibrated model of Cloudflare edge latency. CDP latency values are causal stress controls, not production RTT estimates.",
  };
  writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  console.log(result.verdict);
} catch (error) {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
} finally {
  if (cdp) cdp.close();
  if (child.exitCode === null) child.kill("SIGKILL");
  await sleep(100);
  try { rmSync(profile, { recursive: true, force: true }); } catch {}
}
