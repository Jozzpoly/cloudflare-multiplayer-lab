import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const BASE = process.env.MW_WORLD_V0_LIFECYCLE_BASE ?? "http://127.0.0.1:8787";
const OUTPUT = process.env.MW_WORLD_V0_LIFECYCLE_OUTPUT ?? "world-v0-smoothness-browser-lifecycle.json";
const PORT = 9272;
const HIDDEN_MS = Number(process.env.MW_WORLD_V0_LIFECYCLE_HIDDEN_MS ?? 5000);
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
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (r.ok) { const body = await r.json(); if (body.webSocketDebuggerUrl) return body.webSocketDebuggerUrl; }
    } catch {}
    await sleep(100);
  }
  throw new Error("CDP unavailable");
}
class Cdp {
  constructor(url) {
    this.ws = new WebSocket(url); this.id = 1; this.pending = new Map();
    this.opened = new Promise((resolve, reject) => { this.ws.addEventListener("open", resolve, { once: true }); this.ws.addEventListener("error", () => reject(new Error("CDP open failed")), { once: true }); });
    this.ws.addEventListener("message", async (event) => {
      const raw = typeof event.data === "string" ? event.data : await event.data.text(); const msg = JSON.parse(raw); if (!msg.id) return;
      const waiter = this.pending.get(msg.id); if (!waiter) return; this.pending.delete(msg.id);
      if (msg.error) waiter.reject(new Error(`${waiter.method}: ${msg.error.message}`)); else waiter.resolve(msg.result || {});
    });
  }
  async call(method, params = {}, sessionId) {
    await this.opened; const id = this.id++;
    return new Promise((resolve, reject) => { this.pending.set(id, { resolve, reject, method }); const payload = { id, method, params }; if (sessionId) payload.sessionId = sessionId; this.ws.send(JSON.stringify(payload)); });
  }
  async eval(sessionId, expression) {
    const result = await this.call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, userGesture: true }, sessionId);
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || "browser eval failed");
    return result.result?.value;
  }
  close() { try { this.ws.close(); } catch {} }
}

async function createPage(cdp, name) {
  // Separate browser contexts are essential: the product deliberately treats two
  // same-profile tabs as the same human/ActorSession and performs live rebind.
  // We need independent identities while keeping both tabs in one Chrome process
  // so normal visibility/background scheduling still applies.
  const { browserContextId } = await cdp.call("Target.createBrowserContext", {});
  const { targetId } = await cdp.call("Target.createTarget", { url: `${BASE}/world-v0/`, browserContextId });
  const { sessionId } = await cdp.call("Target.attachToTarget", { targetId, flatten: true });
  await cdp.call("Runtime.enable", {}, sessionId); await cdp.call("Page.enable", {}, sessionId);
  return { name, targetId, sessionId, browserContextId };
}
async function waitFor(cdp, page, expression, label, timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs; let last = null;
  while (Date.now() < deadline) {
    try { last = await cdp.eval(page.sessionId, expression); if (last) return last; } catch (error) { last = error instanceof Error ? error.message : String(error); }
    await sleep(100);
  }
  throw new Error(`${label} timeout last=${JSON.stringify(last)}`);
}
async function evidence(cdp, page) { return cdp.eval(page.sessionId, "window.__sharedYardV0Evidence?.() ?? null"); }
async function visibility(cdp, page) { return cdp.eval(page.sessionId, "document.visibilityState"); }
async function enter(cdp, page, callsign, room = "yard-3") {
  await waitFor(cdp, page, `(() => { const b=document.querySelector('[data-room-id="${room}"]'); return b && !b.disabled && typeof window.__sharedYardV0Evidence==='function'; })()`, `${callsign} ready`);
  await cdp.eval(page.sessionId, `(() => { const i=document.querySelector('#callsign'); i.value=${JSON.stringify(callsign)}; i.dispatchEvent(new Event('input',{bubbles:true})); document.querySelector('[data-room-id="${room}"]').click(); return true; })()`);
}

const chrome = findChrome();
const profile = mkdtempSync(join(tmpdir(), "mw-browser-lifecycle-"));
const child = spawn(chrome, [
  "--headless=new", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
  // Intentionally NO anti-background-throttling flags. This is the point of the probe.
  `--remote-debugging-port=${PORT}`, "--remote-debugging-address=127.0.0.1", `--user-data-dir=${profile}`, "about:blank",
], { stdio: ["ignore", "ignore", "pipe"] });
let cdp = null;
const pages = [];
try {
  cdp = new Cdp(await waitDebugger()); await cdp.opened;
  const a = await createPage(cdp, "A"); pages.push(a);
  await cdp.call("Target.activateTarget", { targetId: a.targetId });
  await enter(cdp, a, "LifeA");
  await waitFor(cdp, a, `(() => { const e=window.__sharedYardV0Evidence?.(); return e?.lifecycle?.topology?.revision===1 && Number.isInteger(e.protocolStartTick) && e.localBoundaryTick>=e.protocolStartTick+50 && e.metrics.guardMismatches===0; })()`, "A solo live");

  const b = await createPage(cdp, "B"); pages.push(b);
  await cdp.call("Target.activateTarget", { targetId: b.targetId });
  await enter(cdp, b, "LifeB");
  await Promise.all([
    waitFor(cdp, a, `(() => { const e=window.__sharedYardV0Evidence?.(); return e?.lifecycle?.topology?.revision===2 && e.presentation?.remotePresence==='PEER' && e.metrics.guardMismatches===0; })()`, "A topology2"),
    waitFor(cdp, b, `(() => { const e=window.__sharedYardV0Evidence?.(); return e?.lifecycle?.topology?.revision===2 && e.presentation?.remotePresence==='PEER' && e.metrics.guardMismatches===0; })()`, "B topology2"),
  ]);
  const joinedA = await evidence(cdp, a); const joinedB = await evidence(cdp, b);
  assert(joinedA.session.actorSessionId !== joinedB.session.actorSessionId, "browser contexts did not isolate ActorSession identity");
  assert(joinedA.identity.worldEpoch === joinedB.identity.worldEpoch, "independent contexts did not join same WorldEpoch");

  await cdp.call("Target.activateTarget", { targetId: a.targetId });
  await sleep(150);
  const visA = await visibility(cdp, a); const visB = await visibility(cdp, b);
  assert(visA === "visible", `A not visible after activation: ${visA}`);
  assert(visB === "hidden", `B not hidden after A activation: ${visB}`);

  const hiddenBefore = await evidence(cdp, b);
  await sleep(HIDDEN_MS);
  const hiddenAfter = await evidence(cdp, b);
  const authorityBefore = hiddenBefore.metrics.latestAuthorityBoundary ?? hiddenBefore.localBoundaryTick;
  const authorityAfter = hiddenAfter.metrics.latestAuthorityBoundary ?? hiddenAfter.localBoundaryTick;
  const localProgress = hiddenAfter.localBoundaryTick - hiddenBefore.localBoundaryTick;
  const authorityProgress = authorityAfter - authorityBefore;
  const hiddenGap = authorityAfter - hiddenAfter.localBoundaryTick;

  await cdp.call("Target.activateTarget", { targetId: b.targetId });
  const restoreSamples = [];
  const restoreStart = performance.now();
  while (performance.now() - restoreStart < 2200) {
    const [vis, e] = await Promise.all([visibility(cdp, b), evidence(cdp, b)]);
    restoreSamples.push({
      elapsedMs: performance.now() - restoreStart,
      visibility: vis,
      networkState: e?.networkState,
      boundary: e?.localBoundaryTick,
      latestAuthorityBoundary: e?.metrics?.latestAuthorityBoundary,
      guardMismatches: e?.metrics?.guardMismatches,
      authoritySilenceResumes: e?.metrics?.authoritySilenceResumes,
    });
    if (e?.networkState !== "prediction backlog" && Number.isInteger(e?.metrics?.latestAuthorityBoundary) && e.localBoundaryTick >= e.metrics.latestAuthorityBoundary - 4 && performance.now() - restoreStart > 300) break;
    await sleep(20);
  }
  const finalB = await evidence(cdp, b);
  const sawBacklog = restoreSamples.some((sample) => sample.networkState === "prediction backlog");
  const maxObservedRestoreGap = Math.max(...restoreSamples.map((sample) => Number.isInteger(sample.latestAuthorityBoundary) ? sample.latestAuthorityBoundary - sample.boundary : 0));

  assert(authorityProgress >= 60, `authority did not progress materially while B hidden: ${authorityProgress}`);
  assert(hiddenGap >= 40, `hidden tab did not accumulate temporal staleness: gap=${hiddenGap}, localProgress=${localProgress}, authorityProgress=${authorityProgress}`);
  assert(sawBacklog, `visibility restore never exposed prediction backlog; max observed gap=${maxObservedRestoreGap}`);
  assert(finalB.metrics.guardMismatches === 0, "exact state diverged during lifecycle probe");

  const result = {
    revision: "world-v0-smoothness-browser-lifecycle-v2-isolated-contexts",
    chromeVersion: (spawnSync(chrome, ["--version"], { encoding: "utf8" }).stdout || "unknown").trim(),
    antiBackgroundFlagsUsed: false,
    browserContexts: 2,
    hiddenMs: HIDDEN_MS,
    identity: { independentActorSessions: true, sameWorldEpoch: true },
    visibility: { activeA: visA, backgroundB: visB },
    hiddenInterval: {
      localBoundaryBefore: hiddenBefore.localBoundaryTick,
      localBoundaryAfter: hiddenAfter.localBoundaryTick,
      latestAuthorityBefore: authorityBefore,
      latestAuthorityAfter: authorityAfter,
      localProgress,
      authorityProgress,
      hiddenGap,
    },
    restore: {
      sawPredictionBacklog: sawBacklog,
      maxObservedGapTicks: maxObservedRestoreGap,
      samples: restoreSamples,
      finalBoundary: finalB.localBoundaryTick,
      finalLatestAuthorityBoundary: finalB.metrics.latestAuthorityBoundary,
      authoritySilenceResumes: finalB.metrics.authoritySilenceResumes,
      guardMismatches: finalB.metrics.guardMismatches,
    },
    verdict: "NORMAL_BROWSER_BACKGROUND_STALENESS_REPRODUCED",
  };
  writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2)); console.log(result.verdict);
} catch (error) {
  const failure = { verdict: "NORMAL_BROWSER_BACKGROUND_STALENESS_NOT_REPRODUCED", error: error instanceof Error ? error.stack || error.message : String(error), pages: [] };
  if (cdp) for (const page of pages) { try { failure.pages.push({ name: page.name, visibility: await visibility(cdp, page), evidence: await evidence(cdp, page) }); } catch {} }
  writeFileSync(OUTPUT, JSON.stringify(failure, null, 2)); console.error(failure.error); process.exitCode = 1;
} finally {
  if (cdp) {
    for (const page of pages) { try { await cdp.call("Target.disposeBrowserContext", { browserContextId: page.browserContextId }); } catch {} }
  }
  cdp?.close(); if (child.exitCode === null) child.kill("SIGKILL"); await sleep(100); try { rmSync(profile, { recursive: true, force: true }); } catch {}
}
