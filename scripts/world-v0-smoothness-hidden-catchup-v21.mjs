import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const BASE = process.env.MW_WORLD_V0_V21_BASE ?? "http://127.0.0.1:8787";
const ALT_BASE = process.env.MW_WORLD_V0_V21_ALT_BASE ?? BASE.replace("127.0.0.1", "localhost");
const OUTPUT = process.env.MW_WORLD_V0_V21_OUTPUT ?? "world-v0-smoothness-hidden-catchup-v21.json";
const HIDDEN_MS = Number(process.env.MW_WORLD_V0_V21_HIDDEN_MS ?? 5000);
const PORT = 9292;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const assert = (value, message) => { if (!value) throw new Error(message); };

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1))];
}
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
async function createPage(cdp, base, name) {
  const { targetId } = await cdp.call("Target.createTarget", { url: `${base}/world-v0/` });
  const { sessionId } = await cdp.call("Target.attachToTarget", { targetId, flatten: true });
  await cdp.call("Runtime.enable", {}, sessionId);
  await cdp.call("Page.enable", {}, sessionId);
  return { targetId, sessionId, base, name };
}
async function waitFor(cdp, page, expression, label, timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    try {
      last = await cdp.eval(page.sessionId, expression);
      if (last) return last;
    } catch (error) { last = error instanceof Error ? error.message : String(error); }
    await sleep(80);
  }
  throw new Error(`${label} timeout last=${JSON.stringify(last)}`);
}
async function evidence(cdp, page) { return cdp.eval(page.sessionId, "window.__sharedYardV0Evidence?.() ?? null"); }
async function enter(cdp, page, callsign, room = "yard-3") {
  await waitFor(cdp, page, `(() => { const b=document.querySelector('[data-room-id="${room}"]'); return document.readyState==='complete' && typeof window.__sharedYardV0Evidence==='function' && b && !b.disabled; })()`, `${callsign} room ready`);
  const result = await cdp.eval(page.sessionId, `(() => { const i=document.querySelector('#callsign'); const b=document.querySelector('[data-room-id="${room}"]'); i.value=${JSON.stringify(callsign)}; i.dispatchEvent(new Event('input',{bubbles:true})); b.click(); return { ok:true }; })()`);
  assert(result?.ok, `${callsign} entry failed`);
}

const chrome = findChrome();
const profile = mkdtempSync(join(tmpdir(), "mw-hidden-catchup-v21-"));
const child = spawn(chrome, [
  "--headless=new", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
  // Intentionally no anti-background-throttling flags.
  `--remote-debugging-port=${PORT}`, "--remote-debugging-address=127.0.0.1", `--user-data-dir=${profile}`, "about:blank",
], { stdio: ["ignore", "ignore", "pipe"] });
let cdp = null;
const pages = [];
try {
  cdp = new Cdp(await waitDebugger());
  await cdp.opened;
  const a = await createPage(cdp, BASE, "A"); pages.push(a);
  await cdp.call("Target.activateTarget", { targetId: a.targetId });
  await enter(cdp, a, "CatchA");
  await waitFor(cdp, a, `(() => { const e=window.__sharedYardV0Evidence?.(); return e && !e.runtimeFailed && e.lifecycle?.topology?.revision===1 && Number.isInteger(e.protocolStartTick) && e.localBoundaryTick>=e.protocolStartTick+60 && e.metrics?.guardMismatches===0; })()`, "A solo live");

  const b = await createPage(cdp, ALT_BASE, "B"); pages.push(b);
  await cdp.call("Target.activateTarget", { targetId: b.targetId });
  await enter(cdp, b, "CatchB");
  await Promise.all([
    waitFor(cdp, a, `(() => { const e=window.__sharedYardV0Evidence?.(); return e && !e.runtimeFailed && e.lifecycle?.topology?.revision===2 && e.presentation?.remotePresence==='PEER' && e.metrics?.guardMismatches===0; })()`, "A topology2"),
    waitFor(cdp, b, `(() => { const e=window.__sharedYardV0Evidence?.(); return e && !e.runtimeFailed && e.lifecycle?.topology?.revision===2 && e.presentation?.remotePresence==='PEER' && e.metrics?.guardMismatches===0; })()`, "B topology2"),
  ]);

  const joinedB = await evidence(cdp, b);
  await cdp.call("Target.activateTarget", { targetId: a.targetId });
  await sleep(150);
  assert(await cdp.eval(a.sessionId, "document.visibilityState") === "visible", "A not visible");
  assert(await cdp.eval(b.sessionId, "document.visibilityState") === "hidden", "B not hidden");

  const hiddenBefore = await evidence(cdp, b);
  await sleep(HIDDEN_MS);
  const hiddenAfter = await evidence(cdp, b);
  const authorityBefore = hiddenBefore.metrics.latestAuthorityBoundary ?? hiddenBefore.localBoundaryTick;
  const authorityAfter = hiddenAfter.metrics.latestAuthorityBoundary ?? hiddenAfter.localBoundaryTick;
  const authorityProgress = authorityAfter - authorityBefore;
  const localProgress = hiddenAfter.localBoundaryTick - hiddenBefore.localBoundaryTick;
  const hiddenGap = authorityAfter - hiddenAfter.localBoundaryTick;
  assert(authorityProgress >= 60, `authority did not progress while hidden: ${authorityProgress}`);
  assert(hiddenGap >= 40, `hidden staleness not reproduced: gap=${hiddenGap}`);
  assert(hiddenAfter.metrics.guardMismatches === 0, "hidden interval exactness regression");

  await cdp.eval(b.sessionId, `(() => {
    window.__mwV21RafSamples=[];
    let remaining=240;
    const sample=(t)=>{
      const e=window.__sharedYardV0Evidence?.();
      window.__mwV21RafSamples.push({
        t,
        boundary:e?.localBoundaryTick ?? null,
        authority:e?.metrics?.latestAuthorityBoundary ?? null,
        networkState:e?.networkState ?? null,
        corrections:e?.metrics?.corrections ?? null,
        serverLate:e?.metrics?.serverLate ?? null,
        guardMismatches:e?.metrics?.guardMismatches ?? null,
      });
      remaining-=1;
      if(remaining>0) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
    return true;
  })()`);

  const restoreStart = performance.now();
  const restorePolling = [];
  await cdp.call("Target.activateTarget", { targetId: b.targetId });
  let settled = false;
  while (performance.now() - restoreStart < 5000) {
    const e = await evidence(cdp, b);
    const gap = Number.isInteger(e?.metrics?.latestAuthorityBoundary) ? e.metrics.latestAuthorityBoundary - e.localBoundaryTick : null;
    restorePolling.push({ elapsedMs: performance.now() - restoreStart, boundary: e?.localBoundaryTick, authority: e?.metrics?.latestAuthorityBoundary, gap, networkState: e?.networkState, corrections: e?.metrics?.corrections, serverLate: e?.metrics?.serverLate });
    if (!e?.runtimeFailed && e?.metrics?.guardMismatches===0 && Number.isInteger(gap) && gap <= 4 && performance.now()-restoreStart > 250) { settled = true; break; }
    await sleep(20);
  }
  assert(settled, "hidden client did not catch up within 5s");
  await sleep(250);

  const finalB = await evidence(cdp, b);
  const rafSamples = await cdp.eval(b.sessionId, "window.__mwV21RafSamples ?? []");
  const rafIntervals = [];
  for (let i = 1; i < rafSamples.length; i += 1) {
    const from = rafSamples[i - 1];
    const to = rafSamples[i];
    if (!Number.isFinite(from.t) || !Number.isFinite(to.t) || !Number.isInteger(from.boundary) || !Number.isInteger(to.boundary)) continue;
    rafIntervals.push({ dtMs: to.t - from.t, boundaryDelta: to.boundary - from.boundary, gapAfter: Number.isInteger(to.authority) ? to.authority - to.boundary : null, networkState: to.networkState });
  }
  const boundaryDeltas = rafIntervals.map((x) => x.boundaryDelta);
  const frameDts = rafIntervals.map((x) => x.dtMs);
  const positiveDeltas = boundaryDeltas.filter((x) => x > 0);
  const catchupIntervals = rafIntervals.filter((x) => x.boundaryDelta > 2 || x.networkState === "prediction backlog");

  assert(finalB.metrics.guardMismatches === 0, "exact state diverged during hidden catch-up");
  assert(finalB.identity.worldEpoch === joinedB.identity.worldEpoch, "WorldEpoch changed across hidden interval");
  assert(finalB.session.actorSessionId === joinedB.session.actorSessionId, "ActorSession changed across hidden interval");
  assert(finalB.session.selfNetEntityId === joinedB.session.selfNetEntityId, "NetEntity changed across hidden interval");

  const result = {
    revision: "world-v0-smoothness-hidden-catchup-v21-v1",
    chromeVersion: (spawnSync(chrome, ["--version"], { encoding: "utf8" }).stdout || "unknown").trim(),
    hiddenMs: HIDDEN_MS,
    hidden: {
      localBoundaryBefore: hiddenBefore.localBoundaryTick,
      localBoundaryAfter: hiddenAfter.localBoundaryTick,
      authorityBefore,
      authorityAfter,
      localProgress,
      authorityProgress,
      hiddenGap,
    },
    restore: {
      settledMs: restorePolling.length ? restorePolling[restorePolling.length - 1].elapsedMs : null,
      pollSamples: restorePolling,
      rafSampleCount: rafSamples.length,
      rafIntervalCount: rafIntervals.length,
      p50FrameDtMs: percentile(frameDts, 0.5),
      p95FrameDtMs: percentile(frameDts, 0.95),
      maxFrameDtMs: frameDts.length ? Math.max(...frameDts) : 0,
      p50BoundaryDeltaPerRaf: percentile(positiveDeltas, 0.5),
      p95BoundaryDeltaPerRaf: percentile(positiveDeltas, 0.95),
      maxBoundaryDeltaPerRaf: positiveDeltas.length ? Math.max(...positiveDeltas) : 0,
      framesAtOrAbove20Ticks: rafIntervals.filter((x) => x.boundaryDelta >= 20).length,
      catchupIntervals,
      correctionsDelta: finalB.metrics.corrections - hiddenAfter.metrics.corrections,
      serverLateDelta: finalB.metrics.serverLate - hiddenAfter.metrics.serverLate,
      authoritySilenceResumeDelta: finalB.metrics.authoritySilenceResumes - hiddenAfter.metrics.authoritySilenceResumes,
      finalGap: finalB.metrics.latestAuthorityBoundary - finalB.localBoundaryTick,
      finalNetworkState: finalB.networkState,
      guardMismatches: finalB.metrics.guardMismatches,
    },
    verdict: "WORLD_V0_V21_HIDDEN_CATCHUP_CHARACTERIZED",
  };
  writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  console.log(result.verdict);
} catch (error) {
  const failure = { verdict: "WORLD_V0_V21_HIDDEN_CATCHUP_NOT_CHARACTERIZED", error: error instanceof Error ? error.stack || error.message : String(error), pages: [] };
  if (cdp) for (const page of pages) { try { failure.pages.push({ name: page.name, evidence: await evidence(cdp, page) }); } catch {} }
  writeFileSync(OUTPUT, JSON.stringify(failure, null, 2));
  console.error(failure.error);
  process.exitCode = 1;
} finally {
  cdp?.close();
  if (child.exitCode === null) child.kill("SIGKILL");
  await sleep(100);
  try { rmSync(profile, { recursive: true, force: true }); } catch {}
}
