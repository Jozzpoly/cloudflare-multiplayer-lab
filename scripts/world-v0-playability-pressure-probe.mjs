import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const BASE = (process.env.MW_WORLD_V0_PLAYABILITY_BASE_URL || "http://127.0.0.1:8787").replace(/\/$/, "");
const OUTPUT = process.env.MW_WORLD_V0_PLAYABILITY_OUTPUT || "world-v0-playability-pressure.json";
const DEBUG_PORTS = [9762, 9763];
const TIMEOUT_MS = 45_000;
const CHANGE_INTERVAL_MS = Number(process.env.MW_WORLD_V0_PLAYABILITY_CHANGE_MS || 90);
const CHANGE_COUNT = Number(process.env.MW_WORLD_V0_PLAYABILITY_CHANGE_COUNT || 48);

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function assert(condition, message) { if (!condition) throw new Error(message); }

function findChrome() {
  const override = process.env.CHROME_BIN?.trim();
  if (override) return override;
  const probe = spawnSync("bash", ["-lc", "command -v google-chrome || command -v google-chrome-stable || command -v chromium || command -v chromium-browser"], { encoding: "utf8" });
  const binary = probe.stdout.trim().split("\n")[0];
  if (!binary) throw new Error(`Chrome/Chromium binary not found: ${probe.stderr || "no candidate"}`);
  return binary;
}

async function waitForDebugger(port) {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < TIMEOUT_MS) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(1500) });
      if (response.ok) {
        const value = await response.json();
        if (value.webSocketDebuggerUrl) return value;
      }
      last = `HTTP ${response.status}`;
    } catch (error) { last = error instanceof Error ? error.message : String(error); }
    await sleep(100);
  }
  throw new Error(`Chrome debugger ${port} unavailable: ${last}`);
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
    const result = await this.call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, userGesture: true }, sessionId);
    if (result.exceptionDetails) throw new Error(`Browser evaluate failed: ${result.exceptionDetails.text || "unknown"}`);
    return result.result?.value;
  }
  close() { try { this.ws.close(); } catch { /* cleanup */ } }
}

async function startBrowser(binary, index, url) {
  const port = DEBUG_PORTS[index];
  const profile = mkdtempSync(join(tmpdir(), `mw-playability-${index}-`));
  const stderr = [];
  const child = spawn(binary, [
    "--headless=new",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--disable-background-networking",
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
    "--use-gl=angle",
    "--use-angle=swiftshader-webgl",
    "--enable-unsafe-swiftshader",
    `--remote-debugging-port=${port}`,
    "--remote-debugging-address=127.0.0.1",
    `--user-data-dir=${profile}`,
    "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"] });
  child.stderr.on("data", (chunk) => stderr.push(chunk));
  let cdp = null;
  try {
    const info = await waitForDebugger(port);
    cdp = new Cdp(info.webSocketDebuggerUrl);
    await cdp.opened;
    const existing = await cdp.call("Target.getTargets");
    const { targetId } = await cdp.call("Target.createTarget", { url });
    const { sessionId } = await cdp.call("Target.attachToTarget", { targetId, flatten: true });
    await cdp.call("Runtime.enable", {}, sessionId);
    await cdp.call("Page.enable", {}, sessionId);
    for (const target of existing.targetInfos || []) {
      if (target.type !== "page" || target.targetId === targetId) continue;
      try { await cdp.call("Target.closeTarget", { targetId: target.targetId }); } catch { /* cleanup */ }
    }
    return { index, profile, stderr, child, cdp, sessionId };
  } catch (error) {
    cdp?.close();
    if (child.exitCode === null) child.kill("SIGKILL");
    try { rmSync(profile, { recursive: true, force: true }); } catch { /* cleanup */ }
    throw error;
  }
}

async function stopBrowser(client) {
  if (!client) return;
  client.cdp?.close();
  if (client.child?.exitCode === null) client.child.kill("SIGKILL");
  try { rmSync(client.profile, { recursive: true, force: true }); } catch { /* cleanup */ }
}

async function evaluate(client, expression) {
  return await client.cdp.evaluate(client.sessionId, expression);
}

async function waitFor(client, expression, label, timeoutMs = TIMEOUT_MS) {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < timeoutMs) {
    try {
      last = await evaluate(client, expression);
      if (last) return last;
    } catch (error) { last = error instanceof Error ? error.message : String(error); }
    await sleep(120);
  }
  throw new Error(`${label} timeout · last=${JSON.stringify(last)}`);
}

async function evidence(client) {
  return await evaluate(client, `window.__sharedYardV0Evidence?.() || null`);
}

async function setKey(client, code, down) {
  const type = down ? "keydown" : "keyup";
  await evaluate(client, `window.dispatchEvent(new KeyboardEvent(${JSON.stringify(type)}, { code: ${JSON.stringify(code)}, key: ${JSON.stringify(code)}, bubbles: true })); true`);
}

async function switchDirection(client, previous, next) {
  if (previous) await setKey(client, previous, false);
  if (next) await setKey(client, next, true);
}

function summarize(start, end) {
  const ticks = Math.max(1, (end.localBoundaryTick || 0) - (start.localBoundaryTick || 0));
  const corrections = Math.max(0, (end.metrics?.corrections || 0) - (start.metrics?.corrections || 0));
  const rotations = Math.max(0, (end.metrics?.generationRotations || 0) - (start.metrics?.generationRotations || 0));
  return {
    tickSpan: ticks,
    corrections,
    generationRotations: rotations,
    correctionsPer1000Ticks: corrections / ticks * 1000,
    finalNetworkState: end.networkState,
    inputLeadTicks: end.inputScheduler?.inputLeadTicks ?? null,
    simulationLeadTicks: end.inputScheduler?.simulationLeadTicks ?? null,
    authored: end.inputScheduler?.authored ?? null,
    superseded: end.inputScheduler?.superseded ?? null,
    maxRewind: end.metrics?.maxRewind ?? null,
    maxReplaySteps: end.metrics?.maxReplaySteps ?? null,
    maxCorrection: end.metrics?.maxCorrection ?? null,
    guardMatches: end.metrics?.guardMatches ?? null,
    guardMismatches: end.metrics?.guardMismatches ?? null,
    firstStateMismatch: end.metrics?.firstStateMismatch ?? null,
    serverLate: end.metrics?.serverLate ?? null,
    serverRejected: end.metrics?.serverRejected ?? null,
    frameP95Ms: end.frame?.p95Ms ?? null,
    frameMaxMs: end.frame?.maxMs ?? null,
  };
}

function validate(end, label) {
  assert(end && end.runtimeFailed === false, `${label}: runtime failure ${end?.runtimeFailureReason}`);
  assert(end.metrics?.guardMismatches === 0, `${label}: state guard mismatch`);
  assert(end.metrics?.firstStateMismatch == null, `${label}: first state mismatch ${JSON.stringify(end.metrics?.firstStateMismatch)}`);
  assert(!String(end.networkState || "").startsWith("closed"), `${label}: network closed ${end.networkState}`);
}

const chrome = findChrome();
const suffix = Date.now().toString(36).slice(-6);
const runKey = `pr-${suffix}`;
const clients = [];
let start = [];
let end = [];
const result = {
  verdict: "WORLD_V0_PLAYABILITY_PRESSURE_FAIL",
  generatedAt: new Date().toISOString(),
  runKey,
  base: BASE,
  changeIntervalMs: CHANGE_INTERVAL_MS,
  changeCount: CHANGE_COUNT,
};

try {
  const urls = [
    `${BASE}/world-v0/?player=${encodeURIComponent(`PA-${suffix}`)}&run=${encodeURIComponent(runKey)}`,
    `${BASE}/world-v0/?player=${encodeURIComponent(`PB-${suffix}`)}&run=${encodeURIComponent(runKey)}`,
  ];
  clients.push(await startBrowser(chrome, 0, urls[0]));
  clients.push(await startBrowser(chrome, 1, urls[1]));

  await Promise.all(clients.map((client, index) => waitFor(
    client,
    `document.readyState === "complete" && typeof window.__sharedYardV0Evidence === "function" && document.querySelector("#enter")?.disabled === false`,
    `client ${index} boot`,
  )));
  for (const client of clients) await evaluate(client, `document.querySelector("#enter").click(); true`);
  await Promise.all(clients.map((client, index) => waitFor(
    client,
    `(() => { const e = window.__sharedYardV0Evidence?.(); return e?.identity?.worldEpoch && Number.isInteger(e?.protocolStartTick) && e.localBoundaryTick >= e.protocolStartTick + 24; })()`,
    `client ${index} started`,
  )));

  start = await Promise.all(clients.map(evidence));
  assert(start[0].identity.worldEpoch === start[1].identity.worldEpoch, "clients started different epochs");
  assert(start[0].identity.simBuildId === start[1].identity.simBuildId, "clients started different SimBuildId values");

  const patternA = ["KeyD", "KeyW", "KeyA", "KeyS"];
  const patternB = ["KeyA", "KeyS", "KeyD", "KeyW"];
  let prevA = null;
  let prevB = null;
  for (let i = 0; i < CHANGE_COUNT; i += 1) {
    const nextA = patternA[i % patternA.length];
    const nextB = patternB[i % patternB.length];
    await Promise.all([
      switchDirection(clients[0], prevA, nextA),
      switchDirection(clients[1], prevB, nextB),
    ]);
    prevA = nextA;
    prevB = nextB;
    await sleep(CHANGE_INTERVAL_MS);
  }
  await Promise.all([
    switchDirection(clients[0], prevA, null),
    switchDirection(clients[1], prevB, null),
  ]);
  await sleep(1400);

  await Promise.all(clients.map((client, index) => waitFor(
    client,
    `(() => { const e = window.__sharedYardV0Evidence?.(); return e && !e.runtimeFailed && e.metrics?.guardMismatches === 0 && e.metrics?.guardPending === 0; })()`,
    `client ${index} pressure drain`,
  )));
  end = await Promise.all(clients.map(evidence));
  validate(end[0], "clientA");
  validate(end[1], "clientB");
  assert(end[0].identity.worldEpoch === end[1].identity.worldEpoch, "clients ended different epochs");

  const summaries = [summarize(start[0], end[0]), summarize(start[1], end[1])];
  Object.assign(result, {
    verdict: "WORLD_V0_PLAYABILITY_PRESSURE_PASS",
    simBuildId: end[0].identity.simBuildId,
    clientSimRevision: end[0].clientSimRevision,
    clients: summaries,
    aggregate: {
      meanCorrectionsPer1000Ticks: summaries.reduce((sum, value) => sum + value.correctionsPer1000Ticks, 0) / summaries.length,
      maxCorrectionsPer1000Ticks: Math.max(...summaries.map((value) => value.correctionsPer1000Ticks)),
      totalCorrections: summaries.reduce((sum, value) => sum + value.corrections, 0),
      maxSelfCorrection: Math.max(...summaries.map((value) => value.maxCorrection?.self || 0)),
      maxRemoteCorrection: Math.max(...summaries.map((value) => value.maxCorrection?.remote || 0)),
      maxPropCorrection: Math.max(...summaries.map((value) => value.maxCorrection?.prop || 0)),
    },
  });
  writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
  console.log("WORLD_V0_PLAYABILITY_PRESSURE_PASS", JSON.stringify(result.aggregate));
} catch (error) {
  result.error = error instanceof Error ? error.stack || error.message : String(error);
  result.start = start;
  result.end = end;
  writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
  throw error;
} finally {
  await Promise.all(clients.map(stopBrowser));
}
