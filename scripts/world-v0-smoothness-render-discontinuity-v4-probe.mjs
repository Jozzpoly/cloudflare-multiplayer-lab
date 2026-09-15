import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const BASE = process.env.MW_WORLD_V0_RENDER_BASE ?? "http://127.0.0.1:8787";
const OUTPUT = process.env.MW_WORLD_V0_RENDER_OUTPUT ?? "world-v0-smoothness-render-discontinuity-v4.json";
const LATENCY_MS = Number(process.env.MW_WORLD_V0_RENDER_LATENCY_MS ?? 90);
const STRESS_MS = Number(process.env.MW_WORLD_V0_RENDER_STRESS_MS ?? 4500);
const PORT = 9494;
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

function wsUrl(runKey, playerId) {
  const url = new URL("/world-v0/ws", BASE);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("player", playerId);
  url.searchParams.set("run", runKey);
  url.searchParams.set("lifecycle", "r0");
  return url.toString();
}

function identityFrom(message) {
  return {
    worldId: message.worldId,
    worldEpoch: message.worldEpoch,
    simBuildId: message.simBuildId,
    clientSimRevision: message.clientSimRevision,
  };
}

class RawPeer {
  constructor(runKey) {
    this.runKey = runKey;
    this.playerId = `V4Node-${Date.now().toString(36)}`;
    this.ws = new WebSocket(wsUrl(runKey, this.playerId));
    this.welcome = null;
    this.identity = null;
    this.topology = null;
    this.protocolStartTick = null;
    this.latestBoundaryTick = 0;
    this.predictionLeadTicks = 8;
    this.inputBatchSize = 2;
    this.batchSeq = 0;
    this.sentThrough = null;
    this.accepted = 0;
    this.late = 0;
    this.superseded = 0;
    this.errors = [];
    this.closed = false;
    this.ready = new Promise((resolve, reject) => {
      this.resolveReady = resolve;
      this.rejectReady = reject;
    });
    this.ws.addEventListener("error", () => this.rejectReady(new Error("raw peer WebSocket error")), { once: true });
    this.ws.addEventListener("close", (event) => {
      this.closed = true;
      if (!this.welcome) this.rejectReady(new Error(`raw peer closed before welcome ${event.code} ${event.reason || ""}`));
    });
    this.ws.addEventListener("message", async (event) => {
      try {
        const raw = typeof event.data === "string" ? event.data : await event.data.text();
        this.handle(JSON.parse(raw));
      } catch (error) {
        this.errors.push(error instanceof Error ? error.message : String(error));
      }
    });
  }
  topologyFields() {
    if (!this.topology) return {};
    return { topologyRevision: this.topology.revision, topologyDigest: this.topology.digest };
  }
  sendReady() {
    if (!this.identity || !this.topology || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ type: "world_v0_ready", ...this.identity, ...this.topologyFields() }));
  }
  fillZeroFuture() {
    if (!this.identity || !this.topology || !Number.isInteger(this.protocolStartTick) || this.ws.readyState !== WebSocket.OPEN) return;
    const horizon = Math.max(this.protocolStartTick, this.latestBoundaryTick + this.predictionLeadTicks - 1);
    let next = Math.max(this.protocolStartTick, this.latestBoundaryTick + 1, Number.isInteger(this.sentThrough) ? this.sentThrough + 1 : this.protocolStartTick);
    while (next <= horizon) {
      const records = [];
      while (records.length < this.inputBatchSize && next <= horizon) {
        records.push({ targetTick: next, x: 0, z: 0, jump: false });
        next += 1;
      }
      this.batchSeq += 1;
      this.ws.send(JSON.stringify({
        type: "world_v0_input_batch",
        ...this.identity,
        ...this.topologyFields(),
        batchSeq: this.batchSeq,
        records,
      }));
      this.sentThrough = records[records.length - 1].targetTick;
    }
  }
  handle(message) {
    if (message.type === "world_v0_error") throw new Error(`raw peer server error ${message.error}`);
    const observedBoundary = Number.isInteger(message.boundaryTick)
      ? message.boundaryTick
      : (Number.isInteger(message.state?.boundaryTick) ? message.state.boundaryTick : null);
    if (Number.isInteger(observedBoundary)) this.latestBoundaryTick = Math.max(this.latestBoundaryTick, observedBoundary);

    if (message.type === "world_v0_welcome") {
      this.welcome = message;
      this.identity = identityFrom(message);
      this.topology = message.topology;
      this.protocolStartTick = Number.isInteger(message.protocolStartTick) ? message.protocolStartTick : null;
      this.predictionLeadTicks = message.simulation?.timing?.predictionLeadTicks ?? 8;
      this.inputBatchSize = message.simulation?.timing?.inputBatchSize ?? 2;
      assert(this.identity.worldId === `shared-yard-v0-${this.runKey}`, `raw peer WorldId mismatch ${this.identity.worldId}`);
      assert(this.topology?.revision === 2, `late raw peer expected topology revision 2, got ${this.topology?.revision}`);
      assert(Number.isInteger(this.protocolStartTick), "late raw peer welcome missing active protocolStartTick");
      this.sendReady();
      this.fillZeroFuture();
      this.resolveReady({
        worldEpoch: this.identity.worldEpoch,
        sessionId: message.selfSessionId,
        topologyRevision: this.topology.revision,
        protocolStartTick: this.protocolStartTick,
      });
      return;
    }

    if (!this.identity) return;
    if (message.type === "world_v0_topology_changed") {
      this.topology = message.topology;
      this.sendReady();
      this.fillZeroFuture();
      return;
    }
    if (message.type === "world_v0_ready_ack" || message.type === "world_v0_snapshot" || message.type === "world_v0_consumed" || message.type === "world_v0_pong") {
      this.fillZeroFuture();
      return;
    }
    if (message.type === "world_v0_batch_ack") {
      for (const record of message.records || []) {
        if (record.status === "accepted" || record.status === "duplicate_same") this.accepted += 1;
        else if (record.status === "late") this.late += 1;
        else if (record.status === "superseded") this.superseded += 1;
      }
      this.fillZeroFuture();
    }
  }
  snapshot() {
    return {
      playerId: this.playerId,
      worldEpoch: this.identity?.worldEpoch ?? null,
      topologyRevision: this.topology?.revision ?? null,
      protocolStartTick: this.protocolStartTick,
      latestBoundaryTick: this.latestBoundaryTick,
      batchSeq: this.batchSeq,
      sentThrough: this.sentThrough,
      accepted: this.accepted,
      late: this.late,
      superseded: this.superseded,
      errors: [...this.errors],
      closed: this.closed,
    };
  }
  close() { try { this.ws.close(1000, "render_probe_v4_complete"); } catch {} }
}

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1))];
}
function cadence(samples) {
  const dts = [];
  for (let i = 1; i < samples.length; i += 1) dts.push(samples[i].t - samples[i - 1].t);
  const valid = dts.filter((dt) => dt >= 5 && dt <= 50);
  return {
    intervals: dts.length,
    validIntervals: valid.length,
    validRatio: dts.length ? valid.length / dts.length : 0,
    medianDtMs: percentile(valid, 0.5),
    p95DtMs: percentile(valid, 0.95),
    maxDtMs: dts.length ? Math.max(...dts) : 0,
  };
}
function analyze(samples, key) {
  const intervals = [];
  for (let i = 1; i < samples.length; i += 1) {
    const a = samples[i - 1];
    const b = samples[i];
    const dtMs = b.t - a.t;
    if (!(dtMs >= 5 && dtMs <= 50)) continue;
    if (!a[key] || !b[key]) continue;
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
  const correctionExcess = correctionIntervals.map((entry) => entry.excessDistance);
  return {
    sampledIntervals: intervals.length,
    correctionAssociatedIntervals: correctionIntervals.length,
    correctionP95ExcessDistance: percentile(correctionExcess, 0.95),
    correctionMaxExcessDistance: correctionExcess.length ? Math.max(...correctionExcess) : 0,
    teleportLikeIntervals: teleportLike.length,
    worstTeleportLike: [...teleportLike].sort((a, b) => b.excessDistance - a.excessDistance).slice(0, 8),
  };
}

const chrome = findChrome();
const profile = mkdtempSync(join(tmpdir(), "mw-render-discontinuity-v4-"));
const child = spawn(chrome, [
  "--headless=new", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
  "--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding",
  `--remote-debugging-port=${PORT}`, "--remote-debugging-address=127.0.0.1", `--user-data-dir=${profile}`, "about:blank",
], { stdio: ["ignore", "ignore", "pipe"] });
let cdp = null;
let rawPeer = null;
try {
  cdp = new Cdp(await waitDebugger());
  await cdp.opened;
  const runKey = `v4-${Date.now().toString(36)}`;
  const url = `${BASE}/world-v0/?run=${encodeURIComponent(runKey)}&lifecycle=r0`;
  const { targetId } = await cdp.call("Target.createTarget", { url });
  const { sessionId } = await cdp.call("Target.attachToTarget", { targetId, flatten: true });
  const page = { targetId, sessionId };
  await cdp.call("Runtime.enable", {}, sessionId);
  await cdp.call("Page.enable", {}, sessionId);
  await cdp.call("Network.enable", {}, sessionId);
  await cdp.call("Network.emulateNetworkConditions", {
    offline: false,
    latency: LATENCY_MS,
    downloadThroughput: 12_500_000,
    uploadThroughput: 12_500_000,
    connectionType: "wifi",
  }, sessionId);

  await waitFor(cdp, page, `(() => document.querySelector('#enter') && !document.querySelector('#enter').disabled && typeof window.__sharedYardV0Evidence==='function' && typeof window.__mwRenderProbeV3StartSampler==='function')()`, "single browser bootstrap");
  await cdp.eval(sessionId, `(() => { const c=document.querySelector('#callsign'); c.value='V4Browser'; c.dispatchEvent(new Event('input',{bubbles:true})); const r=document.querySelector('#run'); r.value=${JSON.stringify(runKey)}; r.dispatchEvent(new Event('input',{bubbles:true})); document.querySelector('#enter').click(); return true; })()`);
  const solo = await waitFor(cdp, page, `(() => { const e=window.__sharedYardV0Evidence?.(); return e?.lifecycle?.topology?.revision===1 && Number.isInteger(e.protocolStartTick) && e.localBoundaryTick>=e.protocolStartTick+35 && e.metrics.guardMismatches===0 && e.networkState.includes('solo') ? {epoch:e.identity.worldEpoch,boundary:e.localBoundaryTick} : false; })()`, "browser solo R0 live", 55_000);

  rawPeer = new RawPeer(runKey);
  const rawReady = await Promise.race([
    rawPeer.ready,
    sleep(20_000).then(() => { throw new Error(`raw peer ready timeout ${JSON.stringify(rawPeer.snapshot())}`); }),
  ]);
  const topology2 = await waitFor(cdp, page, `(() => { const e=window.__sharedYardV0Evidence?.(); return e?.lifecycle?.topology?.revision===2 && e.presentation?.remotePresence==='PEER' && e.metrics.guardMismatches===0 && e.networkState.startsWith('live') && !e.runtimeFailed ? {boundary:e.localBoundaryTick, corrections:e.metrics.corrections} : false; })()`, "browser topology2 after raw late join", 45_000);
  await sleep(900);

  await cdp.eval(sessionId, "window.__mwRenderProbeV3StartSampler()");
  await sleep(1500);
  const controlSamples = await cdp.eval(sessionId, "window.__mwRenderProbeV3StopSampler()");
  const controlCadence = cadence(controlSamples);
  assert(controlCadence.validRatio >= 0.8, `single-renderer sampler invalid cadence ratio ${controlCadence.validRatio}`);
  assert(controlCadence.validIntervals >= 50, `single-renderer sampler insufficient control intervals ${controlCadence.validIntervals}`);

  const before = await cdp.eval(sessionId, "window.__sharedYardV0Evidence()");
  await cdp.eval(sessionId, "window.__mwRenderProbeV3StartSampler()");
  await cdp.eval(sessionId, `window.__mwRenderProbeV3StartStress({durationMs:${STRESS_MS},intervalMs:8,yawStep:0.004})`);
  await sleep(STRESS_MS + 850);
  const stressInfo = await cdp.eval(sessionId, "window.__mwRenderProbeV3StopStress()");
  await sleep(650);
  const samples = await cdp.eval(sessionId, "window.__mwRenderProbeV3StopSampler()");
  const after = await cdp.eval(sessionId, "window.__sharedYardV0Evidence()");

  const result = {
    revision: "world-v0-smoothness-render-discontinuity-v4-single-renderer-raw-peer",
    requestedLatencyMs: LATENCY_MS,
    stressMs: STRESS_MS,
    apparatus: {
      renderedClients: 1,
      secondPeer: "Node WebSocket protocol peer with zero canonical input",
      browserSampling: "in-page rAF",
      measuredPhaseCdpPolling: false,
      runKey,
      solo,
      rawReady,
      topology2,
      rawPeer: rawPeer.snapshot(),
    },
    controlCadence,
    stressInfo,
    cadence: cadence(samples),
    sampleCount: samples.length,
    correctionDelta: after.metrics.corrections - before.metrics.corrections,
    serverLateDelta: after.metrics.serverLate - before.metrics.serverLate,
    guardMismatchDelta: after.metrics.guardMismatches - before.metrics.guardMismatches,
    authoritySilenceResumeDelta: after.metrics.authoritySilenceResumes - before.metrics.authoritySilenceResumes,
    self: analyze(samples, "self"),
    remote: analyze(samples, "remote"),
    physicalReference: {
      playerIntentSpeed: PLAYER_SPEED,
      diagnosticTeleportLike: "render interval 5..50ms + correction association + apparent horizontal speed > 10.4m/s + >0.04m excess over 5.2m/s envelope",
      thresholdStatus: "diagnostic negative-control classifier only; not yet an Owner-ready SLO",
    },
  };

  assert(result.guardMismatchDelta === 0, "exactness failed during V4 render probe");
  assert(result.authoritySilenceResumeDelta === 0, "V4 stress accidentally entered recovery path");
  assert(result.cadence.validRatio >= 0.75, `stress rAF cadence invalid ratio ${result.cadence.validRatio}`);
  assert(result.cadence.validIntervals >= 180, `insufficient stress rAF evidence ${result.cadence.validIntervals}`);
  assert(result.stressInfo.steps >= STRESS_MS / 20, "continuous-input stress did not run often enough");
  assert(result.apparatus.rawPeer.errors.length === 0, `raw peer protocol errors ${JSON.stringify(result.apparatus.rawPeer.errors)}`);

  result.signature = {
    negativeControlPressurePresent: result.correctionDelta >= 20 && result.serverLateDelta > 0,
    renderedDiscontinuityObserved: result.self.teleportLikeIntervals > 0,
    correctionDelta: result.correctionDelta,
    serverLateDelta: result.serverLateDelta,
    teleportLikeIntervals: result.self.teleportLikeIntervals,
  };
  result.verdict = result.signature.negativeControlPressurePresent && result.signature.renderedDiscontinuityObserved
    ? "SINGLE_RENDERER_NEGATIVE_CONTROL_DISCONTINUITY_REPRODUCED"
    : "SINGLE_RENDERER_NEGATIVE_CONTROL_NOT_REPRODUCED";

  writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  console.log(result.verdict);
} catch (error) {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
} finally {
  rawPeer?.close();
  if (cdp) cdp.close();
  if (child.exitCode === null) child.kill("SIGKILL");
  await sleep(100);
  rmSync(profile, { recursive: true, force: true });
}
