import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const BASE = process.env.MW_WORLD_V0_RENDER_BASE ?? "http://127.0.0.1:8787";
const OUTPUT = process.env.MW_WORLD_V0_RENDER_OUTPUT ?? "world-v0-smoothness-render-discontinuity-v2.json";
const LATENCY_MS = Number(process.env.MW_WORLD_V0_RENDER_LATENCY_MS ?? 90);
const STRESS_MS = Number(process.env.MW_WORLD_V0_RENDER_STRESS_MS ?? 4500);
const PORT = 9393;
const PLAYER_SPEED = 5.2;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const assert = (value, message) => { if (!value) throw new Error(message); };

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
  return { name, sessionId, targetId };
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
async function enter(cdp, page, callsign, room) {
  await waitFor(cdp, page, `(() => { const b=document.querySelector('[data-room-id="${room}"]'); return b && !b.disabled && typeof window.__sharedYardV0Evidence==='function' && typeof window.__mwLightRenderProbe==='function'; })()`, `${page.name} ready`);
  await cdp.eval(page.sessionId, `(() => { const i=document.querySelector('#callsign'); i.value=${JSON.stringify(callsign)}; i.dispatchEvent(new Event('input',{bubbles:true})); document.querySelector('[data-room-id="${room}"]').click(); return true; })()`);
}
async function key(cdp, page, type, code) {
  await cdp.eval(page.sessionId, `window.dispatchEvent(new KeyboardEvent(${JSON.stringify(type)},{code:${JSON.stringify(code)},bubbles:true,cancelable:true})); true`);
}
async function nudgeCamera(cdp, page, dx) {
  await cdp.eval(page.sessionId, `(() => {
    const c=document.querySelector('canvas'); if(!c) return false;
    const r=c.getBoundingClientRect(); const x=r.left+r.width*0.5; const y=r.top+r.height*0.5; const id=94;
    c.dispatchEvent(new PointerEvent('pointerdown',{pointerId:id,pointerType:'mouse',button:0,clientX:x,clientY:y,bubbles:true,cancelable:true}));
    c.dispatchEvent(new PointerEvent('pointermove',{pointerId:id,pointerType:'mouse',buttons:1,clientX:x+${Number(dx)},clientY:y,bubbles:true,cancelable:true}));
    c.dispatchEvent(new PointerEvent('pointerup',{pointerId:id,pointerType:'mouse',button:0,clientX:x+${Number(dx)},clientY:y,bubbles:true,cancelable:true}));
    return true;
  })()`);
}
async function startSampler(cdp, page) {
  return cdp.eval(page.sessionId, `(() => {
    if (typeof window.__mwLightRenderProbe !== 'function') throw new Error('light render probe missing');
    window.__mwRenderSamples = [];
    window.__mwRenderSamplerActive = true;
    const loop = (now) => {
      if (!window.__mwRenderSamplerActive) return;
      const p = window.__mwLightRenderProbe();
      if (p?.self && p?.remote) {
        window.__mwRenderSamples.push({ t: now, ...p });
        if (window.__mwRenderSamples.length > 1200) window.__mwRenderSamples.splice(0, window.__mwRenderSamples.length - 1200);
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    return true;
  })()`);
}
async function stopSampler(cdp, page) {
  return cdp.eval(page.sessionId, `(() => { window.__mwRenderSamplerActive=false; return window.__mwRenderSamples || []; })()`);
}

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1))];
}
function analyze(samples, key) {
  const intervals = [];
  for (let i = 1; i < samples.length; i += 1) {
    const a = samples[i - 1];
    const b = samples[i];
    const dtMs = b.t - a.t;
    if (!(dtMs >= 5 && dtMs <= 50)) continue;
    const dx = b[key][0] - a[key][0];
    const dz = b[key][2] - a[key][2];
    const distance = Math.hypot(dx, dz);
    const speed = distance / (dtMs / 1000);
    const expected = PLAYER_SPEED * (dtMs / 1000);
    const correctionDelta = Math.max(0, b.corrections - a.corrections);
    const excessDistance = Math.max(0, distance - expected);
    intervals.push({
      dtMs,
      distance,
      speed,
      excessDistance,
      correctionDelta,
      correctionAssociated: correctionDelta > 0 || a.correctionWindowActive || b.correctionWindowActive,
      boundaryFrom: a.localBoundaryTick,
      boundaryTo: b.localBoundaryTick,
    });
  }
  const correctionIntervals = intervals.filter((entry) => entry.correctionAssociated);
  const teleportLike = correctionIntervals.filter((entry) => entry.speed > PLAYER_SPEED * 2 && entry.excessDistance > 0.04);
  const map = (list, keyName) => list.map((entry) => entry[keyName]);
  const allSpeeds = map(intervals, "speed");
  const correctionSpeeds = map(correctionIntervals, "speed");
  const correctionExcess = map(correctionIntervals, "excessDistance");
  return {
    sampledIntervals: intervals.length,
    correctionAssociatedIntervals: correctionIntervals.length,
    medianDtMs: percentile(map(intervals, "dtMs"), 0.5),
    p95DtMs: percentile(map(intervals, "dtMs"), 0.95),
    p95ApparentSpeed: percentile(allSpeeds, 0.95),
    maxApparentSpeed: allSpeeds.length ? Math.max(...allSpeeds) : 0,
    correctionP95ApparentSpeed: percentile(correctionSpeeds, 0.95),
    correctionMaxApparentSpeed: correctionSpeeds.length ? Math.max(...correctionSpeeds) : 0,
    correctionP95ExcessDistance: percentile(correctionExcess, 0.95),
    correctionMaxExcessDistance: correctionExcess.length ? Math.max(...correctionExcess) : 0,
    teleportLikeIntervals: teleportLike.length,
    worstTeleportLike: [...teleportLike].sort((a, b) => b.excessDistance - a.excessDistance).slice(0, 8),
  };
}

const chrome = findChrome();
const profile = mkdtempSync(join(tmpdir(), "mw-render-discontinuity-v2-"));
const child = spawn(chrome, [
  "--headless=new", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
  "--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding",
  `--remote-debugging-port=${PORT}`, "--remote-debugging-address=127.0.0.1", `--user-data-dir=${profile}`, "about:blank",
], { stdio: ["ignore", "ignore", "pipe"] });
let cdp = null;
try {
  cdp = new Cdp(await waitDebugger());
  await cdp.opened;
  const author = await createPage(cdp, await createContext(cdp), "author");
  const observer = await createPage(cdp, await createContext(cdp), "observer");
  await Promise.all([setLatency(cdp, author, LATENCY_MS), setLatency(cdp, observer, LATENCY_MS)]);
  await enter(cdp, author, "Render2A", "yard-1");
  await waitFor(cdp, author, `(() => { const e=window.__sharedYardV0Evidence?.(); return e?.lifecycle?.topology?.revision===1 && Number.isInteger(e.protocolStartTick) && e.localBoundaryTick>=e.protocolStartTick+40 && e.metrics.guardMismatches===0; })()`, "author solo live");
  await enter(cdp, observer, "Render2B", "yard-1");
  await Promise.all([
    waitFor(cdp, author, `(() => { const e=window.__sharedYardV0Evidence?.(); return e?.lifecycle?.topology?.revision===2 && e.presentation?.remotePresence==='PEER' && e.metrics.guardMismatches===0 && e.networkState.startsWith('live'); })()`, "author topology2"),
    waitFor(cdp, observer, `(() => { const e=window.__sharedYardV0Evidence?.(); return e?.lifecycle?.topology?.revision===2 && e.presentation?.remotePresence==='PEER' && e.metrics.guardMismatches===0 && e.networkState.startsWith('live'); })()`, "observer topology2"),
  ]);
  await sleep(900);
  const beforeAuthor = await cdp.eval(author.sessionId, "window.__sharedYardV0Evidence()" );
  const beforeObserver = await cdp.eval(observer.sessionId, "window.__sharedYardV0Evidence()" );
  await Promise.all([startSampler(cdp, author), startSampler(cdp, observer)]);

  await key(cdp, author, "keydown", "KeyW");
  const stepMs = 25;
  for (let step = 0; step < Math.ceil(STRESS_MS / stepMs); step += 1) {
    await nudgeCamera(cdp, author, step % 2 === 0 ? 2.5 : 3.5);
    await sleep(stepMs);
  }
  await key(cdp, author, "keyup", "KeyW");
  await sleep(900);

  const [authorSamples, observerSamples] = await Promise.all([stopSampler(cdp, author), stopSampler(cdp, observer)]);
  const afterAuthor = await cdp.eval(author.sessionId, "window.__sharedYardV0Evidence()" );
  const afterObserver = await cdp.eval(observer.sessionId, "window.__sharedYardV0Evidence()" );
  const result = {
    revision: "world-v0-smoothness-render-discontinuity-v2-light-hook",
    requestedLatencyMs: LATENCY_MS,
    stressMs: STRESS_MS,
    instrumentation: "test-only lightweight selfMesh/remoteMesh/correction counter hook; full evidence is sampled only before/after",
    physicalReference: {
      playerIntentSpeed: PLAYER_SPEED,
      diagnosticTeleportLike: "render interval 5..50ms + correction association + apparent horizontal speed > 10.4m/s + >0.04m excess over 5.2m/s envelope",
      thresholdStatus: "diagnostic negative-control classifier, not yet universal Owner-ready threshold",
    },
    author: {
      sampleCount: authorSamples.length,
      correctionDelta: afterAuthor.metrics.corrections - beforeAuthor.metrics.corrections,
      guardMismatchDelta: afterAuthor.metrics.guardMismatches - beforeAuthor.metrics.guardMismatches,
      frameP95Ms: afterAuthor.frame.p95Ms,
      self: analyze(authorSamples, "self"),
      remote: analyze(authorSamples, "remote"),
    },
    observer: {
      sampleCount: observerSamples.length,
      correctionDelta: afterObserver.metrics.corrections - beforeObserver.metrics.corrections,
      guardMismatchDelta: afterObserver.metrics.guardMismatches - beforeObserver.metrics.guardMismatches,
      frameP95Ms: afterObserver.frame.p95Ms,
      self: analyze(observerSamples, "self"),
      remote: analyze(observerSamples, "remote"),
    },
  };
  assert(result.author.guardMismatchDelta === 0 && result.observer.guardMismatchDelta === 0, "exactness failed during presentation probe");
  assert(result.author.sampleCount >= 180 && result.observer.sampleCount >= 180, "insufficient rAF samples");
  assert(result.author.self.sampledIntervals >= 120 && result.observer.remote.sampledIntervals >= 120, "rAF cadence still too disturbed for a valid presentation measurement");
  const totalTeleportLike = result.author.self.teleportLikeIntervals + result.author.remote.teleportLikeIntervals + result.observer.self.teleportLikeIntervals + result.observer.remote.teleportLikeIntervals;
  result.totalTeleportLikeIntervals = totalTeleportLike;
  result.badPresentationSignature = totalTeleportLike > 0;
  result.verdict = result.badPresentationSignature
    ? "RENDER_CADENCE_CORRECTION_DISCONTINUITY_REPRODUCED"
    : "NO_TELEPORT_LIKE_RENDER_INTERVAL_REPRODUCED";
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
