import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const BASE = process.env.MW_WORLD_V0_ROLE_BASE ?? "http://127.0.0.1:8787";
const OUTPUT = process.env.MW_WORLD_V0_ROLE_OUTPUT ?? "world-v0-smoothness-counterbalanced-role.json";
const PORT = 9372;
const NETWORK_LATENCY_MS = Number(process.env.MW_WORLD_V0_ROLE_LATENCY_MS ?? 90);
const STRESS_MS = Number(process.env.MW_WORLD_V0_ROLE_STRESS_MS ?? 4000);
const STRESS_STEP_MS = 25;
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
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    await sleep(100);
  }
  throw new Error(`${label} timeout last=${JSON.stringify(last)}`);
}
async function evidence(cdp, page) { return cdp.eval(page.sessionId, "window.__sharedYardV0Evidence?.() ?? null"); }
async function visibility(cdp, page) { return cdp.eval(page.sessionId, "document.visibilityState"); }

async function createContext(cdp) {
  const { browserContextId } = await cdp.call("Target.createBrowserContext", {});
  return browserContextId;
}
async function createPage(cdp, browserContextId, name) {
  const { targetId } = await cdp.call("Target.createTarget", { url: `${BASE}/world-v0/?lifecycle=r0`, browserContextId });
  const { sessionId } = await cdp.call("Target.attachToTarget", { targetId, flatten: true });
  await cdp.call("Runtime.enable", {}, sessionId);
  await cdp.call("Page.enable", {}, sessionId);
  await cdp.call("Network.enable", {}, sessionId);
  await cdp.call("Network.emulateNetworkConditions", {
    offline: false,
    latency: NETWORK_LATENCY_MS,
    downloadThroughput: 12_500_000,
    uploadThroughput: 12_500_000,
    connectionType: "wifi",
  }, sessionId);
  return { name, targetId, sessionId, browserContextId };
}
async function closePage(cdp, page) {
  try { await cdp.call("Target.closeTarget", { targetId: page.targetId }); } catch {}
}
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
    const r=c.getBoundingClientRect(); const x=r.left+r.width*0.5; const y=r.top+r.height*0.5; const id=91;
    c.dispatchEvent(new PointerEvent('pointerdown',{pointerId:id,pointerType:'mouse',button:0,clientX:x,clientY:y,bubbles:true,cancelable:true}));
    c.dispatchEvent(new PointerEvent('pointermove',{pointerId:id,pointerType:'mouse',buttons:1,clientX:x+${Number(dx)},clientY:y,bubbles:true,cancelable:true}));
    c.dispatchEvent(new PointerEvent('pointerup',{pointerId:id,pointerType:'mouse',button:0,clientX:x+${Number(dx)},clientY:y,bubbles:true,cancelable:true}));
    return true;
  })()`);
}
function metricDelta(before, after) {
  const retainedReasons = {};
  for (const entry of after.corrections || []) retainedReasons[entry.reason] = (retainedReasons[entry.reason] || 0) + 1;
  return {
    selfNetEntityId: after.session?.selfNetEntityId ?? null,
    corrections: after.metrics.corrections - before.metrics.corrections,
    superseded: after.inputScheduler.superseded - before.inputScheduler.superseded,
    serverLate: after.metrics.serverLate - before.metrics.serverLate,
    authoritySilenceResumes: after.metrics.authoritySilenceResumes - before.metrics.authoritySilenceResumes,
    maxCorrection: after.metrics.maxCorrection,
    maxRewind: after.metrics.maxRewind,
    guardMismatches: after.metrics.guardMismatches,
    rttMedianMs: after.rtt.medianMs,
    rttP95Ms: after.rtt.p95Ms,
    retainedCorrectionReasons: retainedReasons,
  };
}

async function runRound(cdp, contexts, { room, first, second }) {
  const pages = {
    A: await createPage(cdp, contexts.A, `A-${room}`),
    B: await createPage(cdp, contexts.B, `B-${room}`),
  };
  try {
    assert(await visibility(cdp, pages.A) === "visible", `${room} A context not visible`);
    assert(await visibility(cdp, pages.B) === "visible", `${room} B context not visible`);

    await enter(cdp, pages[first], `Role${first}`, room);
    await waitFor(cdp, pages[first], `(() => { const e=window.__sharedYardV0Evidence?.(); return e?.lifecycle?.topology?.revision===1 && Number.isInteger(e.protocolStartTick) && e.localBoundaryTick>=e.protocolStartTick+60 && e.metrics.guardMismatches===0; })()`, `${room} first solo live`);
    await enter(cdp, pages[second], `Role${second}`, room);
    await Promise.all([
      waitFor(cdp, pages.A, `(() => { const e=window.__sharedYardV0Evidence?.(); return e?.lifecycle?.topology?.revision===2 && e.presentation?.remotePresence==='PEER' && e.metrics.guardMismatches===0 && e.networkState.startsWith('live'); })()`, `${room} A topology2`),
      waitFor(cdp, pages.B, `(() => { const e=window.__sharedYardV0Evidence?.(); return e?.lifecycle?.topology?.revision===2 && e.presentation?.remotePresence==='PEER' && e.metrics.guardMismatches===0 && e.networkState.startsWith('live'); })()`, `${room} B topology2`),
    ]);

    await sleep(700);
    const beforeA = await evidence(cdp, pages.A);
    const beforeB = await evidence(cdp, pages.B);
    assert(beforeA.identity.worldEpoch === beforeB.identity.worldEpoch, `${room} clients not in same WorldEpoch`);

    await Promise.all([key(cdp, pages.A, "keydown", "KeyW"), key(cdp, pages.B, "keydown", "KeyW")]);
    const steps = Math.ceil(STRESS_MS / STRESS_STEP_MS);
    for (let step = 0; step < steps; step += 1) {
      const dx = step % 2 === 0 ? 2.5 : 3.5;
      await Promise.all([nudgeCamera(cdp, pages.A, dx), nudgeCamera(cdp, pages.B, dx)]);
      await sleep(STRESS_STEP_MS);
    }
    await Promise.all([key(cdp, pages.A, "keyup", "KeyW"), key(cdp, pages.B, "keyup", "KeyW")]);

    await Promise.all([
      waitFor(cdp, pages.A, `(() => { const e=window.__sharedYardV0Evidence?.(); return e && !e.runtimeFailed && e.metrics.guardMismatches===0 && e.networkState.startsWith('live') && Number.isInteger(e.metrics.latestAuthorityBoundary) && e.localBoundaryTick>=e.metrics.latestAuthorityBoundary-4; })()`, `${room} A settle`, 20_000),
      waitFor(cdp, pages.B, `(() => { const e=window.__sharedYardV0Evidence?.(); return e && !e.runtimeFailed && e.metrics.guardMismatches===0 && e.networkState.startsWith('live') && Number.isInteger(e.metrics.latestAuthorityBoundary) && e.localBoundaryTick>=e.metrics.latestAuthorityBoundary-4; })()`, `${room} B settle`, 20_000),
    ]);
    await sleep(500);
    const afterA = await evidence(cdp, pages.A);
    const afterB = await evidence(cdp, pages.B);
    const deltaA = metricDelta(beforeA, afterA);
    const deltaB = metricDelta(beforeB, afterB);

    assert(deltaA.guardMismatches === 0 && deltaB.guardMismatches === 0, `${room} exact guard mismatch`);
    assert(deltaA.authoritySilenceResumes === 0 && deltaB.authoritySilenceResumes === 0, `${room} recovery contaminated active-visible role test`);
    assert(deltaA.selfNetEntityId !== deltaB.selfNetEntityId, `${room} actor identity collision`);
    assert((first === "A" ? deltaA : deltaB).selfNetEntityId === "actor:0", `${room} first joiner did not receive actor:0`);
    assert((second === "A" ? deltaA : deltaB).selfNetEntityId === "actor:1", `${room} second joiner did not receive actor:1`);

    return {
      room,
      first,
      second,
      worldEpoch: afterA.identity.worldEpoch,
      A: deltaA,
      B: deltaB,
    };
  } finally {
    await Promise.all([closePage(cdp, pages.A), closePage(cdp, pages.B)]);
    await sleep(350);
  }
}

function classify(round1, round2) {
  const role0 = [round1.A, round2.B];
  const role1 = [round1.B, round2.A];
  const corrections0 = role0.map((entry) => entry.corrections);
  const corrections1 = role1.map((entry) => entry.corrections);
  const total = [...corrections0, ...corrections1].reduce((sum, value) => sum + value, 0);
  const role1HigherBoth = corrections1.every((value, index) => value > corrections0[index] * 1.5 && value - corrections0[index] >= 5);
  const role0HigherBoth = corrections0.every((value, index) => value > corrections1[index] * 1.5 && value - corrections1[index] >= 5);
  const aHigherBoth = round1.A.corrections > round1.B.corrections * 1.5 && round2.A.corrections > round2.B.corrections * 1.5;
  const bHigherBoth = round1.B.corrections > round1.A.corrections * 1.5 && round2.B.corrections > round2.A.corrections * 1.5;
  let classification = "ASYMMETRY_NOT_STABLE_UNDER_COUNTERBALANCE";
  if (total < 20) classification = "INSUFFICIENT_CORRECTION_PRESSURE";
  else if (role1HigherBoth) classification = "ASYMMETRY_TRACKS_SECOND_JOINER_ACTOR1";
  else if (role0HigherBoth) classification = "ASYMMETRY_TRACKS_FIRST_JOINER_ACTOR0";
  else if (aHigherBoth || bHigherBoth) classification = "ASYMMETRY_TRACKS_CLIENT_CONTEXT_MORE_THAN_JOIN_ROLE";
  return {
    classification,
    role0Corrections: corrections0,
    role1Corrections: corrections1,
    totalCorrections: total,
    role0Mean: corrections0.reduce((a, b) => a + b, 0) / corrections0.length,
    role1Mean: corrections1.reduce((a, b) => a + b, 0) / corrections1.length,
  };
}

const chrome = findChrome();
const profile = mkdtempSync(join(tmpdir(), "mw-role-counterbalance-"));
const child = spawn(chrome, [
  "--headless=new", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
  `--remote-debugging-port=${PORT}`, "--remote-debugging-address=127.0.0.1", `--user-data-dir=${profile}`, "about:blank",
], { stdio: ["ignore", "ignore", "pipe"] });
let cdp = null;
let contexts = null;
try {
  cdp = new Cdp(await waitDebugger());
  await cdp.opened;
  contexts = { A: await createContext(cdp), B: await createContext(cdp) };
  const round1 = await runRound(cdp, contexts, { room: "yard-1", first: "A", second: "B" });
  const round2 = await runRound(cdp, contexts, { room: "yard-2", first: "B", second: "A" });
  const analysis = classify(round1, round2);
  const result = {
    revision: "world-v0-smoothness-counterbalanced-role-v1",
    chromeVersion: (spawnSync(chrome, ["--version"], { encoding: "utf8" }).stdout || "unknown").trim(),
    browserContexts: 2,
    bothContextsVisibleRequired: true,
    emulatedNetworkLatencyMs: NETWORK_LATENCY_MS,
    stress: { durationMs: STRESS_MS, stepMs: STRESS_STEP_MS, input: "hold W + repeated camera yaw nudges on both clients" },
    rounds: [round1, round2],
    analysis,
    verdict: "COUNTERBALANCED_CORRECTION_ASYMMETRY_MEASURED",
  };
  writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  console.log(result.verdict);
} catch (error) {
  const failure = { verdict: "COUNTERBALANCED_CORRECTION_ASYMMETRY_NOT_MEASURED", error: error instanceof Error ? error.stack || error.message : String(error) };
  writeFileSync(OUTPUT, JSON.stringify(failure, null, 2));
  console.error(failure.error);
  process.exitCode = 1;
} finally {
  if (cdp && contexts) {
    for (const id of Object.values(contexts)) { try { await cdp.call("Target.disposeBrowserContext", { browserContextId: id }); } catch {} }
  }
  cdp?.close();
  if (child.exitCode === null) child.kill("SIGKILL");
  await sleep(100);
  try { rmSync(profile, { recursive: true, force: true }); } catch {}
}
