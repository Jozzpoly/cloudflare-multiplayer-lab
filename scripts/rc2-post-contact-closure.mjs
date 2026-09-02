import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawn, spawnSync } from "node:child_process";

const HOST = "127.0.0.1";
const WORKER_PORT = 8787;
const DRIVER_PORT = 9515;
const BASE_URL = `http://${HOST}:${WORKER_PORT}`;
const DRIVER_URL = `http://${HOST}:${DRIVER_PORT}`;
const DELAY_MS = 100;
const STOP_AT_MS = 3500;
const OFFSET_MS = Math.max(0, Math.trunc(Number(process.env.RC2_POST_CONTACT_OFFSET_MS || 250)));
const REPEAT = Math.max(1, Math.trunc(Number(process.env.RC2_REPEAT || 1)));
const OUTPUT = process.env.RC2_OUTPUT || `rc2-post-contact-${OFFSET_MS}ms-r${REPEAT}.json`;
const MIN_QUALIFYING_SPLIT_M = 0.10;
const PROCESS_LOG_LIMIT = 180;
const TRACKED_PROP_IDS = ["prop-0", "prop-1", "prop-2", "prop-3"];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function appendLog(target, chunk) {
  target.push(...String(chunk).split(/\r?\n/).filter(Boolean));
  if (target.length > PROCESS_LOG_LIMIT) target.splice(0, target.length - PROCESS_LOG_LIMIT);
}
function startManaged(command, args, name) {
  const logs = [];
  const child = spawn(command, args, {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, CI: "1" },
    detached: process.platform !== "win32",
  });
  child.stdout.on("data", (chunk) => appendLog(logs, chunk));
  child.stderr.on("data", (chunk) => appendLog(logs, chunk));
  return { child, logs, name };
}
async function stopManaged(proc) {
  if (!proc?.child || proc.child.exitCode !== null) return;
  try { process.platform === "win32" ? proc.child.kill("SIGTERM") : process.kill(-proc.child.pid, "SIGTERM"); } catch { /* teardown */ }
  await Promise.race([new Promise((resolve) => proc.child.once("exit", resolve)), sleep(1500)]);
  if (proc.child.exitCode === null) {
    try { process.platform === "win32" ? proc.child.kill("SIGKILL") : process.kill(-proc.child.pid, "SIGKILL"); } catch { /* teardown */ }
  }
}
async function waitFor(label, fn, timeoutMs = 30_000, intervalMs = 100) {
  const started = Date.now();
  let lastError = null;
  while (Date.now() - started < timeoutMs) {
    try { const value = await fn(); if (value) return value; } catch (error) { lastError = error; }
    await sleep(intervalMs);
  }
  throw new Error(`${label} timed out${lastError ? `: ${lastError.message}` : ""}`);
}
function findExecutable(candidates) {
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (candidate.includes("/") && existsSync(candidate)) return candidate;
    const found = spawnSync("which", [candidate], { encoding: "utf8" });
    if (found.status === 0 && found.stdout.trim()) return found.stdout.trim();
  }
  return null;
}
async function driver(path, { method = "GET", body } = {}) {
  const response = await fetch(`${DRIVER_URL}${path}`, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({ value: { error: "invalid_response", message: `HTTP ${response.status}` } }));
  if (!response.ok || payload?.value?.error) throw new Error(payload?.value?.message || payload?.value?.error || `HTTP ${response.status}`);
  return payload.value;
}
async function createSession() {
  const value = await driver("/session", { method: "POST", body: { capabilities: { alwaysMatch: {
    browserName: "chrome",
    "goog:chromeOptions": { args: [
      "--headless=new", "--no-sandbox", "--disable-dev-shm-usage",
      "--disable-background-timer-throttling", "--disable-renderer-backgrounding",
      "--disable-backgrounding-occluded-windows", "--window-size=700,420",
    ] },
  } } } });
  if (!value.sessionId) throw new Error("ChromeDriver did not return session id");
  return value.sessionId;
}
async function execute(sessionId, script) {
  return driver(`/session/${sessionId}/execute/sync`, { method: "POST", body: { script, args: [] } });
}
async function state(sessionId) { return execute(sessionId, `return window.__RC2__?.snapshot?.() ?? null;`); }
async function evidence(sessionId) { return execute(sessionId, `return window.__RC2__?.exportEvidence?.() ?? null;`); }
async function schedule(sessionId, trace, epochMs) {
  return execute(sessionId, `return window.__RC2__.scheduleTrace(${JSON.stringify(trace)}, ${Math.trunc(epochMs)});`);
}
async function closeProps(sessionId, label) {
  return execute(sessionId, `return window.__RC2__.applyAuthorityPropsOnce(${JSON.stringify(label)});`);
}
function distance3(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return NaN;
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}
function rowRms(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || !a.length) return NaN;
  const ds = a.map((p, i) => distance3(p, b[i])).filter(Number.isFinite);
  return ds.length ? Math.sqrt(ds.reduce((sum, d) => sum + d * d, 0) / ds.length) : NaN;
}
function authorityRowFromEvent(event) {
  const byId = new Map((event?.props || []).map((prop) => [prop.id, prop.authorityPosition]));
  return TRACKED_PROP_IDS.map((id) => byId.get(id) || [NaN, NaN, NaN]);
}
function vectorMagnitude(vector) {
  return Array.isArray(vector) ? Math.hypot(...vector) : NaN;
}
function stats(values) {
  const finite = values.filter(Number.isFinite);
  if (!finite.length) return { count: 0, mean: NaN, max: NaN };
  return {
    count: finite.length,
    mean: finite.reduce((sum, value) => sum + value, 0) / finite.length,
    max: Math.max(...finite),
  };
}
function fmt(value) { return Number.isFinite(value) ? value.toFixed(4) : "—"; }
function healthyAgainstBaseline(sa, sb, baselineDropped) {
  if (!sa || !sb || sa.networkState !== "live" || sb.networkState !== "live") return false;
  if (sa.localDroppedSteps !== 0 || sb.localDroppedSteps !== 0) return false;
  if (!sa.telemetry?.finite || !sb.telemetry?.finite) return false;
  return Math.max(sa.telemetry?.droppedTicks ?? 0, sb.telemetry?.droppedTicks ?? 0) === baselineDropped;
}
async function samplePair(a, b, label, baselineDropped) {
  const [sa, sb, evA, evB] = await Promise.all([state(a), state(b), evidence(a), evidence(b)]);
  if (!healthyAgainstBaseline(sa, sb, baselineDropped)) {
    throw new Error(`${label} unhealthy: ${JSON.stringify({
      a: sa?.telemetry, b: sb?.telemetry,
      localDropsA: sa?.localDroppedSteps, localDropsB: sb?.localDroppedSteps,
      baselineDropped,
    })}`);
  }
  const authorityA = evA?.authorityHistory?.at(-1)?.row || null;
  const authorityB = evB?.authorityHistory?.at(-1)?.row || null;
  return {
    label,
    wall: Date.now(),
    aToB: rowRms(sa.row, sb.row),
    aToLatestAuthority: rowRms(sa.row, authorityA),
    bToLatestAuthority: rowRms(sb.row, authorityB),
    authorityAToB: rowRms(authorityA, authorityB),
    aRow: sa.row,
    bRow: sb.row,
  };
}
function latestAppliedPeerInput(ev) {
  const applied = (ev?.peerEvents || []).filter((event) => Number.isFinite(event.appliedAt));
  return applied.at(-1) || null;
}
function latestTraceInput(ev) {
  return (ev?.traceEvents || []).at(-1) || null;
}
function isZeroInput(event) {
  return event && Math.hypot(Number(event.x) || 0, Number(event.z) || 0) <= 1e-9;
}
async function verifyCausalInputStopped(a, b) {
  const [evA, evB] = await Promise.all([evidence(a), evidence(b)]);
  const facts = {
    aSelf: latestTraceInput(evA),
    bSelf: latestTraceInput(evB),
    aRemote: latestAppliedPeerInput(evA),
    bRemote: latestAppliedPeerInput(evB),
  };
  if (!isZeroInput(facts.aSelf) || !isZeroInput(facts.bSelf) || !isZeroInput(facts.aRemote) || !isZeroInput(facts.bRemote)) {
    throw new Error(`post-contact treatment reached before causal inputs stopped: ${JSON.stringify(facts)}`);
  }
  return facts;
}
async function applyMatchedClosure(a, b, label) {
  await waitFor(`${label} matching authority tick`, async () => {
    const [sa, sb] = await Promise.all([state(a), state(b)]);
    return Number.isFinite(sa?.latestAuthorityTick) && sa.latestAuthorityTick === sb?.latestAuthorityTick &&
      sa.latestAuthorityPropCount >= 12 && sb.latestAuthorityPropCount >= 12;
  }, 5000, 20);
  const [eventA, eventB] = await Promise.all([closeProps(a, label), closeProps(b, label)]);
  if (!eventA || !eventB || eventA.authorityTick !== eventB.authorityTick) {
    throw new Error(`${label} closure snapshot skew: ${eventA?.authorityTick}/${eventB?.authorityTick}`);
  }
  if (eventA.propCount < 12 || eventB.propCount < 12) throw new Error(`${label} incomplete prop closure`);
  const maxVelocityMutation = Math.max(
    ...eventA.props.flatMap((prop) => [prop.linearVelocityMutation, prop.angularVelocityMutation]),
    ...eventB.props.flatMap((prop) => [prop.linearVelocityMutation, prop.angularVelocityMutation]),
  );
  if (!Number.isFinite(maxVelocityMutation) || maxVelocityMutation > 1e-9) {
    throw new Error(`${label} did not preserve local velocities: ${maxVelocityMutation}`);
  }
  const authorityRowA = authorityRowFromEvent(eventA);
  const authorityRowB = authorityRowFromEvent(eventB);
  if (rowRms(authorityRowA, authorityRowB) > 1e-9) throw new Error(`${label} authority target mismatch`);
  return {
    eventA,
    eventB,
    authorityRow: authorityRowA,
    maxVelocityMutation,
    maxPositionCorrectionA: Math.max(...eventA.props.map((prop) => prop.positionCorrection)),
    maxPositionCorrectionB: Math.max(...eventB.props.map((prop) => prop.positionCorrection)),
    linearSpeedA: stats(eventA.props.map((prop) => vectorMagnitude(prop.preservedLinearVelocity))),
    linearSpeedB: stats(eventB.props.map((prop) => vectorMagnitude(prop.preservedLinearVelocity))),
    angularSpeedA: stats(eventA.props.map((prop) => vectorMagnitude(prop.preservedAngularVelocity))),
    angularSpeedB: stats(eventB.props.map((prop) => vectorMagnitude(prop.preservedAngularVelocity))),
  };
}

const traceA = [
  { atMs: 0, x: 0, z: 0 },
  { atMs: 1500, x: 1, z: 0 },
  { atMs: STOP_AT_MS, x: 0, z: 0 },
];
const traceB = [
  { atMs: 0, x: 0, z: -1 },
  { atMs: 360, x: 0, z: 0 },
  { atMs: 1500, x: -1, z: 0 },
  { atMs: STOP_AT_MS, x: 0, z: 0 },
];

async function runExperiment() {
  const sessions = [];
  try {
    const a = await createSession();
    const b = await createSession();
    sessions.push(a, b);
    const key = `pc${OFFSET_MS}r${REPEAT}-${Date.now().toString(36)}`.slice(-20);
    await Promise.all([
      driver(`/session/${a}/url`, { method: "POST", body: { url: `${BASE_URL}/world0-rc2/?player=A-${key}&delayMs=${DELAY_MS}` } }),
      driver(`/session/${b}/url`, { method: "POST", body: { url: `${BASE_URL}/world0-rc2/?player=B-${key}&delayMs=${DELAY_MS}` } }),
    ]);
    const ready = await waitFor(`post-contact ${OFFSET_MS}/${REPEAT} ready`, async () => {
      const [sa, sb] = await Promise.all([state(a), state(b)]);
      const ok = (s) => s && s.networkState === "live" && s.playerCount === 2 && s.hasRemoteBody &&
        s.localSteps >= 45 && s.localDroppedSteps === 0 && s.peerApplied > 0 && s.latestAuthorityPropCount >= 12;
      return ok(sa) && ok(sb) ? { sa, sb } : false;
    }, 25_000);
    const baselineDropped = Math.max(ready.sa.telemetry?.droppedTicks ?? 0, ready.sb.telemetry?.droppedTicks ?? 0);

    const epochMs = Date.now() + 700;
    await Promise.all([schedule(a, traceA, epochMs), schedule(b, traceB, epochMs)]);
    const requestedClosureWall = epochMs + STOP_AT_MS + OFFSET_MS;
    await sleep(Math.max(0, requestedClosureWall - Date.now()));

    const inputStopEvidence = await verifyCausalInputStopped(a, b);
    const pre = await samplePair(a, b, `post-contact-${OFFSET_MS}/pre`, baselineDropped);
    if (pre.aToB < MIN_QUALIFYING_SPLIT_M) {
      return {
        offsetMs: OFFSET_MS,
        repeat: REPEAT,
        delayMs: DELAY_MS,
        classification: "NON_DISCRIMINATING_NO_SPLIT",
        baselineDroppedTicks: baselineDropped,
        qualification: {
          thresholdM: MIN_QUALIFYING_SPLIT_M,
          observedSplitM: pre.aToB,
          reason: "NON_DISCRIMINATING_NO_SPLIT",
        },
        inputStopEvidence,
        pre,
        closure: null,
        postSamples: [],
      };
    }

    const closure = await applyMatchedClosure(a, b, `post-contact-${OFFSET_MS}`);
    const closureWall = Math.max(closure.eventA.wall, closure.eventB.wall);
    const postSamples = [];
    for (const afterClosureMs of [120, 500, 1000, 2000, 4000]) {
      await sleep(Math.max(0, closureWall + afterClosureMs - Date.now()));
      const sample = await samplePair(a, b, `post-contact-${OFFSET_MS}/+${afterClosureMs}`, baselineDropped);
      sample.aToClosureTarget = rowRms(sample.aRow, closure.authorityRow);
      sample.bToClosureTarget = rowRms(sample.bRow, closure.authorityRow);
      postSamples.push(sample);
    }
    const final = postSamples.at(-1);
    return {
      offsetMs: OFFSET_MS,
      repeat: REPEAT,
      delayMs: DELAY_MS,
      classification: "QUALIFIED_CLOSURE_EXECUTED",
      baselineDroppedTicks: baselineDropped,
      qualification: {
        thresholdM: MIN_QUALIFYING_SPLIT_M,
        observedSplitM: pre.aToB,
        reason: "QUALIFIED_POST_CONTACT_SPLIT",
      },
      inputStopEvidence,
      requestedClosureWall,
      actualClosureAfterStopMs: closureWall - (epochMs + STOP_AT_MS),
      pre,
      closure: {
        authorityTick: closure.eventA.authorityTick,
        authorityServerTime: closure.eventA.authorityServerTime,
        maxVelocityMutation: closure.maxVelocityMutation,
        maxPositionCorrectionA: closure.maxPositionCorrectionA,
        maxPositionCorrectionB: closure.maxPositionCorrectionB,
        linearSpeedA: closure.linearSpeedA,
        linearSpeedB: closure.linearSpeedB,
        angularSpeedA: closure.angularSpeedA,
        angularSpeedB: closure.angularSpeedB,
        authorityRow: closure.authorityRow,
      },
      postSamples,
      final: {
        aToB: final.aToB,
        aToLatestAuthority: final.aToLatestAuthority,
        bToLatestAuthority: final.bToLatestAuthority,
      },
    };
  } finally {
    for (const sessionId of sessions) await driver(`/session/${sessionId}`, { method: "DELETE" }).catch(() => {});
  }
}

let wrangler = null;
let chromedriver = null;
try {
  const npx = process.platform === "win32" ? "npx.cmd" : "npx";
  wrangler = startManaged(npx, ["wrangler", "dev", "--env", "staging", "--ip", HOST, "--port", String(WORKER_PORT)], "wrangler");
  await waitFor("local Wrangler", async () => {
    const response = await fetch(`${BASE_URL}/api/ping`);
    return response.ok && (await response.json())?.ok === true;
  });
  const chromedriverFromEnv = process.env.CHROMEWEBDRIVER
    ? join(process.env.CHROMEWEBDRIVER, process.platform === "win32" ? "chromedriver.exe" : "chromedriver")
    : null;
  const executable = findExecutable([chromedriverFromEnv, "chromedriver"]);
  if (!executable) throw new Error("ChromeDriver not found");
  chromedriver = startManaged(executable, [`--port=${DRIVER_PORT}`, "--log-level=WARNING"], "chromedriver");
  await waitFor("ChromeDriver", async () => {
    const response = await fetch(`${DRIVER_URL}/status`);
    return response.ok && (await response.json())?.value?.ready === true;
  });

  console.log(`RC2 post-contact closure offset=${OFFSET_MS}ms r${REPEAT}`);
  const result = await runExperiment();
  writeFileSync(OUTPUT, JSON.stringify({
    revision: "ws0-rc2-post-contact-closure-v1",
    generatedAt: new Date().toISOString(),
    design: {
      delayMs: DELAY_MS,
      stopAtMs: STOP_AT_MS,
      requestedOffsetMs: OFFSET_MS,
      repeat: REPEAT,
      minimumQualifyingSplitM: MIN_QUALIFYING_SPLIT_M,
      closureState: "authority position+rotation for all props; pre-existing local linear/angular velocities explicitly preserved",
      causalStopGate: "Both local trace inputs and each client's latest applied peer input must be zero before treatment.",
      qualificationSemantics: "Split threshold is an experimental discrimination gate, not a product SLO or incidence estimate.",
    },
    result,
  }, null, 2));

  console.log(`classification=${result.classification}`);
  console.log(`pre A↔B=${fmt(result.pre?.aToB)}`);
  if (result.closure) {
    console.log(`actual closure after stop=${fmt(result.actualClosureAfterStopMs)}ms tick=${result.closure.authorityTick}`);
    console.log(`max correction=${fmt(Math.max(result.closure.maxPositionCorrectionA, result.closure.maxPositionCorrectionB))} velocityMutation=${result.closure.maxVelocityMutation}`);
    console.log(`prop linear speed mean/max A=${fmt(result.closure.linearSpeedA.mean)}/${fmt(result.closure.linearSpeedA.max)} B=${fmt(result.closure.linearSpeedB.mean)}/${fmt(result.closure.linearSpeedB.max)}`);
    for (const sample of result.postSamples) {
      console.log(`${sample.label} A↔B=${fmt(sample.aToB)} A↔latestAuth=${fmt(sample.aToLatestAuthority)} B↔latestAuth=${fmt(sample.bToLatestAuthority)}`);
    }
  }
  console.log(`RC2 POST-CONTACT STRUCTURAL PASS — ${OUTPUT}`);
} catch (error) {
  if (wrangler?.logs?.length) console.error(`\n--- wrangler tail ---\n${wrangler.logs.join("\n")}`);
  if (chromedriver?.logs?.length) console.error(`\n--- chromedriver tail ---\n${chromedriver.logs.join("\n")}`);
  throw error;
} finally {
  await stopManaged(chromedriver);
  await stopManaged(wrangler);
}
