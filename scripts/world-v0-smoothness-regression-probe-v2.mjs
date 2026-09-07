import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const BASE = (process.env.MW_WORLD_V0_SMOOTHNESS_BASE_URL || "http://127.0.0.1:8787").replace(/\/$/, "");
const LABEL = process.env.MW_WORLD_V0_SMOOTHNESS_LABEL || "specimen";
const OUTPUT = process.env.MW_WORLD_V0_SMOOTHNESS_OUTPUT || `world-v0-smoothness-${LABEL}.json`;
const PAGE_URL = `${BASE}/world-v0/`;
const DEBUG_PORTS = [9762, 9763];
const TIMEOUT_MS = 45_000;
const MOVEMENT_MS = Number(process.env.MW_WORLD_V0_SMOOTHNESS_MOVEMENT_MS || 12000);
const PHASE_MS = Number(process.env.MW_WORLD_V0_SMOOTHNESS_PHASE_MS || 300);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const assert = (condition, message) => { if (!condition) throw new Error(message); };

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1))];
}

function findChrome() {
  const override = process.env.CHROME_BIN?.trim();
  if (override) return override;
  const p = spawnSync("bash", ["-lc", "command -v google-chrome || command -v google-chrome-stable || command -v chromium || command -v chromium-browser"], { encoding: "utf8" });
  const binary = p.stdout.trim().split("\n")[0];
  if (!binary) throw new Error(`Chrome/Chromium binary not found: ${p.stderr || "no candidate"}`);
  return binary;
}

async function waitForDebugger(port) {
  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(1200) });
      if (response.ok) {
        const body = await response.json();
        if (body.webSocketDebuggerUrl) return body;
      }
    } catch { /* retry */ }
    await sleep(80);
  }
  throw new Error(`Chrome debugger ${port} unavailable`);
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
      const msg = JSON.parse(raw);
      if (!msg.id) return;
      const waiter = this.pending.get(msg.id);
      if (!waiter) return;
      this.pending.delete(msg.id);
      if (msg.error) waiter.reject(new Error(`${waiter.method}: ${msg.error.message}`));
      else waiter.resolve(msg.result || {});
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
    const out = await this.call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, sessionId);
    if (out.exceptionDetails) throw new Error(out.exceptionDetails.text || "browser evaluate failed");
    return out.result?.value;
  }
  close() { try { this.ws.close(); } catch {} }
}

async function startBrowser(binary, index) {
  const port = DEBUG_PORTS[index];
  const profile = mkdtempSync(join(tmpdir(), `mw-smooth-v2-${LABEL}-${index}-`));
  const stderr = [];
  const child = spawn(binary, [
    "--headless=new", "--no-sandbox", "--disable-dev-shm-usage",
    "--disable-background-networking", "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding",
    "--use-gl=angle", "--use-angle=swiftshader-webgl", "--enable-unsafe-swiftshader",
    `--remote-debugging-port=${port}`, "--remote-debugging-address=127.0.0.1",
    `--user-data-dir=${profile}`, "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"] });
  child.stderr.on("data", (chunk) => stderr.push(chunk));
  let cdp;
  try {
    const info = await waitForDebugger(port);
    cdp = new Cdp(info.webSocketDebuggerUrl);
    await cdp.opened;
    const { targetId } = await cdp.call("Target.createTarget", { url: PAGE_URL });
    const { sessionId } = await cdp.call("Target.attachToTarget", { targetId, flatten: true });
    await cdp.call("Runtime.enable", {}, sessionId);
    await cdp.call("Page.enable", {}, sessionId);
    await cdp.call("Emulation.setDeviceMetricsOverride", {
      width: 1280, height: 800, deviceScaleFactor: 1, mobile: false,
      screenWidth: 1280, screenHeight: 800,
      screenOrientation: { type: "landscapePrimary", angle: 90 },
    }, sessionId);
    return { child, profile, stderr, cdp, sessionId };
  } catch (error) {
    cdp?.close();
    if (child.exitCode === null) child.kill("SIGKILL");
    rmSync(profile, { recursive: true, force: true });
    throw error;
  }
}

async function stopBrowser(client) {
  if (!client) return;
  client.cdp?.close();
  if (client.child?.exitCode === null) client.child.kill("SIGKILL");
  rmSync(client.profile, { recursive: true, force: true });
}

const evalIn = (client, expression) => client.cdp.eval(client.sessionId, expression);

async function waitFor(client, expression, label, timeoutMs = TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    try {
      last = await evalIn(client, expression);
      if (last) return last;
    } catch (error) { last = error instanceof Error ? error.message : String(error); }
    await sleep(100);
  }
  throw new Error(`${label} timeout · last=${JSON.stringify(last)}`);
}

function driverExpression(offset = 0) {
  const sequence = [
    ["KeyW"], ["KeyW", "KeyD"], ["KeyD"], ["KeyS", "KeyD"],
    ["KeyS"], ["KeyS", "KeyA"], ["KeyA"], ["KeyW", "KeyA"],
  ];
  return `(() => {
    const sequence=${JSON.stringify(sequence)};
    const phaseMs=${PHASE_MS};
    const totalMs=${MOVEMENT_MS};
    const offset=${offset};
    const all=["KeyW","KeyA","KeyS","KeyD"];
    const release=()=>{ for(const code of all) dispatchEvent(new KeyboardEvent("keyup",{code,bubbles:true})); };
    const apply=(codes)=>{ release(); for(const code of codes) dispatchEvent(new KeyboardEvent("keydown",{code,bubbles:true})); };
    release();
    let phase=0;
    apply(sequence[(phase+offset)%sequence.length]);
    const timer=setInterval(()=>{ phase+=1; apply(sequence[(phase+offset)%sequence.length]); },phaseMs);
    setTimeout(()=>{ clearInterval(timer); release(); window.__smoothDriverDone=true; },totalMs);
    window.__smoothDriverDone=false;
    return true;
  })()`;
}

function summarize(before, after) {
  const ticks = Math.max(1, (after.localBoundaryTick ?? 0) - (before.localBoundaryTick ?? 0));
  const correctionDelta = Math.max(0, (after.metrics?.corrections ?? 0) - (before.metrics?.corrections ?? 0));
  const retained = Array.isArray(after.corrections) ? after.corrections : [];
  const rewinds = retained.map((x) => x.rewind).filter(Number.isFinite);
  const self = retained.map((x) => x.delta?.self).filter(Number.isFinite);
  const remote = retained.map((x) => x.delta?.remote).filter(Number.isFinite);
  const reasons = {};
  for (const event of retained) reasons[event.reason || "unknown"] = (reasons[event.reason || "unknown"] || 0) + 1;
  return {
    uiRevision: after.uiRevision || null,
    clientSimRevision: after.clientSimRevision || after.identity?.clientSimRevision || null,
    simBuildId: after.expectedSimBuildId || after.identity?.simBuildId || null,
    state: after.networkState,
    runtimeFailed: after.runtimeFailed,
    runtimeFailureReason: after.runtimeFailureReason || null,
    worldEpoch: after.identity?.worldEpoch || null,
    tickDelta: ticks,
    correctionDelta,
    correctionsPerSecond: correctionDelta / (ticks / 60),
    generationRotations: after.metrics?.generationRotations ?? null,
    maxCorrection: after.metrics?.maxCorrection ?? null,
    maxRewind: after.metrics?.maxRewind ?? null,
    serverLate: after.metrics?.serverLate ?? null,
    leaseExpiredSeen: after.metrics?.leaseExpiredSeen ?? null,
    serverRejected: after.metrics?.serverRejected ?? null,
    guardMatches: after.metrics?.guardMatches ?? null,
    guardMismatches: after.metrics?.guardMismatches ?? null,
    rtt: after.rtt ?? null,
    frame: after.frame ?? null,
    inputScheduler: after.inputScheduler ?? null,
    retainedCorrections: {
      count: retained.length,
      reasons,
      rewindMedian: percentile(rewinds, 0.5),
      rewindP95: percentile(rewinds, 0.95),
      selfP95: percentile(self, 0.95),
      remoteP95: percentile(remote, 0.95),
    },
  };
}

async function diag(client) {
  if (!client) return null;
  try { return await evalIn(client, `window.__sharedYardV0Evidence?.() || null`); }
  catch (e) { return { diagnosticError: e instanceof Error ? e.message : String(e) }; }
}

const result = { verdict: "WORLD_V0_SMOOTHNESS_V2_FAIL", generatedAt: new Date().toISOString(), label: LABEL, movementMs: MOVEMENT_MS, phaseMs: PHASE_MS };
const chrome = findChrome();
let a, b;
try {
  a = await startBrowser(chrome, 0);
  b = await startBrowser(chrome, 1);
  const boot = `document.readyState==="complete" && document.querySelector("#enter")?.disabled===false && typeof window.__sharedYardV0Evidence==="function"`;
  await Promise.all([waitFor(a, boot, "A boot"), waitFor(b, boot, "B boot")]);

  const suffix = Date.now().toString(36).slice(-6);
  const run = `kv-${suffix}`;
  await Promise.all([[a,`A-${suffix}`],[b,`B-${suffix}`]].map(([client,name]) => evalIn(client, `(() => {
    document.querySelector("#callsign").value=${JSON.stringify(name)};
    document.querySelector("#run").value=${JSON.stringify(run)};
    document.querySelector("#enter").click(); return true;
  })()`)));

  const live = `(() => { const e=window.__sharedYardV0Evidence?.(); return Boolean(e && !e.runtimeFailed && e.identity?.worldEpoch && Number.isInteger(e.localBoundaryTick) && e.localBoundaryTick>=60); })()`;
  await Promise.all([waitFor(a, live, "A live"), waitFor(b, live, "B live")]);
  const [beforeA,beforeB] = await Promise.all([evalIn(a,`window.__sharedYardV0Evidence()`),evalIn(b,`window.__sharedYardV0Evidence()`)]);
  assert(beforeA.identity.worldEpoch===beforeB.identity.worldEpoch,"different starting epochs");

  const startedAt=Date.now();
  await Promise.all([evalIn(a,driverExpression(0)),evalIn(b,driverExpression(3))]);
  await sleep(MOVEMENT_MS+800);
  const [doneA,doneB] = await Promise.all([evalIn(a,`window.__smoothDriverDone===true`),evalIn(b,`window.__smoothDriverDone===true`)]);
  assert(doneA&&doneB,"in-page movement driver did not finish");
  const [afterA,afterB] = await Promise.all([evalIn(a,`window.__sharedYardV0Evidence()`),evalIn(b,`window.__sharedYardV0Evidence()`)]);

  const aSummary=summarize(beforeA,afterA), bSummary=summarize(beforeB,afterB);
  const validOpen = !String(aSummary.state).startsWith("closed") && !String(bSummary.state).startsWith("closed") && !aSummary.runtimeFailed && !bSummary.runtimeFailed;
  const sameEpoch = afterA.identity?.worldEpoch===beforeA.identity?.worldEpoch && afterB.identity?.worldEpoch===beforeB.identity?.worldEpoch;
  Object.assign(result,{ verdict: validOpen&&sameEpoch ? "WORLD_V0_SMOOTHNESS_V2_PASS" : "WORLD_V0_SMOOTHNESS_V2_SPECIMEN_ENDED", run, wallDurationMs:Date.now()-startedAt, sameEpoch, validOpen, a:aSummary, b:bSummary });
  writeFileSync(OUTPUT,JSON.stringify(result,null,2));
  console.log(result.verdict,JSON.stringify({label:LABEL,wallMs:result.wallDurationMs,aRate:aSummary.correctionsPerSecond,bRate:bSummary.correctionsPerSecond,aFrame:aSummary.frame?.p95Ms,bFrame:bSummary.frame?.p95Ms,aRtt:aSummary.rtt?.medianMs,bRtt:bSummary.rtt?.medianMs,aState:aSummary.state,bState:bSummary.state}));
  if (!validOpen || !sameEpoch) process.exitCode=2;
} catch (error) {
  result.error=error instanceof Error ? error.stack||error.message : String(error);
  result.aDiagnostic=await diag(a); result.bDiagnostic=await diag(b);
  writeFileSync(OUTPUT,JSON.stringify(result,null,2));
  throw error;
} finally { await stopBrowser(b); await stopBrowser(a); }
