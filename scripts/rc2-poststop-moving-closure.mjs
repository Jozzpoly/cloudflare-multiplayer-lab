import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawn, spawnSync } from "node:child_process";

const HOST = "127.0.0.1";
const WORKER_PORT = 8787;
const DRIVER_PORT = 9515;
const BASE_URL = `http://${HOST}:${WORKER_PORT}`;
const DRIVER_URL = `http://${HOST}:${DRIVER_PORT}`;
const REPEAT = Math.max(1, Math.trunc(Number(process.env.RC2_REPEAT || 1)));
const OUTPUT = process.env.RC2_OUTPUT || `rc2-poststop-moving-r${REPEAT}.json`;
const DELAY_MS = 100;
const STOP_AT_MS = 3500;
const EARLIEST_POST_STOP_MS = 200;
const MOTION_WINDOW_MS = 200;
const MIN_QUALIFYING_SPLIT_M = 0.10;
const MAX_PLAYER_XZ_DRIFT_M = 0.02;
const MIN_PROP_ROW_DRIFT_M = 0.01;
const PROCESS_LOG_LIMIT = 180;
const TRACKED_PROP_IDS = ["prop-0", "prop-1", "prop-2", "prop-3"];
const POST_CLOSURE_OFFSETS_MS = [120, 500, 1000, 2000, 4000];
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
  child.on("error", (error) => appendLog(logs, `${name} spawn error: ${error.message}`));
  return { child, logs, name };
}

async function stopManaged(proc) {
  if (!proc?.child || proc.child.exitCode !== null) return;
  try {
    if (process.platform === "win32") proc.child.kill("SIGTERM");
    else process.kill(-proc.child.pid, "SIGTERM");
  } catch { /* teardown */ }
  await Promise.race([new Promise((resolve) => proc.child.once("exit", resolve)), sleep(1500)]);
  if (proc.child.exitCode === null) {
    try {
      if (process.platform === "win32") proc.child.kill("SIGKILL");
      else process.kill(-proc.child.pid, "SIGKILL");
    } catch { /* teardown */ }
  }
}

async function waitFor(label, fn, timeoutMs = 30_000, intervalMs = 100) {
  const started = Date.now();
  let lastError = null;
  while (Date.now() - started < timeoutMs) {
    try {
      const value = await fn();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
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
  const value = await driver("/session", {
    method: "POST",
    body: {
      capabilities: {
        alwaysMatch: {
          browserName: "chrome",
          "goog:chromeOptions": {
            args: [
              "--headless=new", "--no-sandbox", "--disable-dev-shm-usage",
              "--disable-background-timer-throttling", "--disable-renderer-backgrounding",
              "--disable-backgrounding-occluded-windows", "--window-size=700,420",
            ],
          },
        },
      },
    },
  });
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
function distanceXZ(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return NaN;
  return Math.hypot(a[0] - b[0], a[2] - b[2]);
}
function rowRms(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || !a.length) return NaN;
  const ds = a.map((p, i) => distance3(p, b[i])).filter(Number.isFinite);
  return ds.length ? Math.sqrt(ds.reduce((sum, d) => sum + d * d, 0) / ds.length) : NaN;
}
function vectorRmsFromClosure(eventA, eventB, field) {
  const bById = new Map((eventB?.props || []).map((prop) => [prop.id, prop]));
  const distances = (eventA?.props || []).map((prop) => distance3(prop[field], bById.get(prop.id)?.[field])).filter(Number.isFinite);
  return distances.length ? Math.sqrt(distances.reduce((sum, d) => sum + d * d, 0) / distances.length) : NaN;
}
function maxVectorMagnitude(eventA, eventB, field) {
  const values = [...(eventA?.props || []), ...(eventB?.props || [])]
    .map((prop) => Array.isArray(prop[field]) ? Math.hypot(...prop[field]) : NaN)
    .filter(Number.isFinite);
  return values.length ? Math.max(...values) : NaN;
}
function authorityRowFromEvent(event) {
  const byId = new Map((event?.props || []).map((prop) => [prop.id, prop.authorityPosition]));
  return TRACKED_PROP_IDS.map((id) => byId.get(id) || [NaN, NaN, NaN]);
}
function zeroInput(event) {
  return event && Math.hypot(Number(event.x) || 0, Number(event.z) || 0) <= 0.01;
}
function causalityStopped(ev) {
  const traceEvents = ev?.traceEvents || [];
  const peerEvents = ev?.peerEvents || [];
  const lastTrace = traceEvents.at(-1);
  const appliedPeers = peerEvents.filter((event) => Number.isFinite(event.appliedAt));
  const lastAppliedPeer = appliedPeers.at(-1);
  const pendingNonZeroPeer = peerEvents.some((event) => !Number.isFinite(event.appliedAt) && !zeroInput(event));
  return zeroInput(lastTrace) && zeroInput(lastAppliedPeer) && !pendingNonZeroPeer;
}
function fmt(value) { return Number.isFinite(value) ? value.toFixed(4) : "—"; }

function healthyAgainstBaseline(sa, sb, baselineDropped) {
  if (!sa || !sb || sa.networkState !== "live" || sb.networkState !== "live") return false;
  if (sa.localDroppedSteps !== 0 || sb.localDroppedSteps !== 0) return false;
  if (!sa.telemetry?.finite || !sb.telemetry?.finite) return false;
  return Math.max(sa.telemetry?.droppedTicks ?? 0, sb.telemetry?.droppedTicks ?? 0) === baselineDropped;
}

async function samplePair(a, b, label, baselineDropped) {
  const [sa, sb] = await Promise.all([state(a), state(b)]);
  if (!healthyAgainstBaseline(sa, sb, baselineDropped)) {
    throw new Error(`${label} unhealthy: ${JSON.stringify({
      a: sa?.telemetry, b: sb?.telemetry,
      localDropsA: sa?.localDroppedSteps, localDropsB: sb?.localDroppedSteps,
      baselineDropped,
    })}`);
  }
  return {
    label,
    wall: Date.now(),
    aToB: rowRms(sa.row, sb.row),
    aRow: sa.row,
    bRow: sb.row,
    aSelf: sa.selfPosition,
    aRemote: sa.remotePosition,
    bSelf: sb.selfPosition,
    bRemote: sb.remotePosition,
    authorityTickA: sa.latestAuthorityTick,
    authorityTickB: sb.latestAuthorityTick,
  };
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
    localLinearVelocityRmsAtoB: vectorRmsFromClosure(eventA, eventB, "preservedLinearVelocity"),
    localAngularVelocityRmsAtoB: vectorRmsFromClosure(eventA, eventB, "preservedAngularVelocity"),
    maxLocalLinearSpeed: maxVectorMagnitude(eventA, eventB, "preservedLinearVelocity"),
    maxLocalAngularSpeed: maxVectorMagnitude(eventA, eventB, "preservedAngularVelocity"),
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
    const key = `rc2-post-r${REPEAT}-${Date.now().toString(36)}`.slice(-20);
    await Promise.all([
      driver(`/session/${a}/url`, { method: "POST", body: { url: `${BASE_URL}/world0-rc2/?player=A-${key}&delayMs=${DELAY_MS}` } }),
      driver(`/session/${b}/url`, { method: "POST", body: { url: `${BASE_URL}/world0-rc2/?player=B-${key}&delayMs=${DELAY_MS}` } }),
    ]);

    const ready = await waitFor(`poststop/r${REPEAT} ready`, async () => {
      const [sa, sb] = await Promise.all([state(a), state(b)]);
      const ok = (s) => s && s.networkState === "live" && s.playerCount === 2 && s.hasRemoteBody &&
        s.localSteps >= 45 && s.localDroppedSteps === 0 && s.peerApplied > 0 && s.latestAuthorityPropCount >= 12;
      return ok(sa) && ok(sb) ? { sa, sb } : false;
    }, 25_000);

    const baselineDropped = Math.max(ready.sa.telemetry?.droppedTicks ?? 0, ready.sb.telemetry?.droppedTicks ?? 0);
    const epochMs = Date.now() + 700;
    await Promise.all([schedule(a, traceA, epochMs), schedule(b, traceB, epochMs)]);
    await sleep(Math.max(0, epochMs + STOP_AT_MS + EARLIEST_POST_STOP_MS - Date.now()));

    await waitFor(`poststop/r${REPEAT} causal forcing ended`, async () => {
      const [evA, evB] = await Promise.all([evidence(a), evidence(b)]);
      return causalityStopped(evA) && causalityStopped(evB);
    }, 2500, 40);

    const first = await samplePair(a, b, "poststop/pre-window", baselineDropped);
    await sleep(MOTION_WINDOW_MS);
    const second = await samplePair(a, b, "poststop/pre-closure", baselineDropped);
    const [preEvA, preEvB] = await Promise.all([evidence(a), evidence(b)]);
    if (!causalityStopped(preEvA) || !causalityStopped(preEvB)) {
      throw new Error("poststop non-zero causality reappeared during qualification window");
    }

    const playerDrifts = [
      distanceXZ(first.aSelf, second.aSelf),
      distanceXZ(first.aRemote, second.aRemote),
      distanceXZ(first.bSelf, second.bSelf),
      distanceXZ(first.bRemote, second.bRemote),
    ].filter(Number.isFinite);
    const maxPlayerXzDrift = playerDrifts.length ? Math.max(...playerDrifts) : NaN;
    const propRowDriftA = rowRms(first.aRow, second.aRow);
    const propRowDriftB = rowRms(first.bRow, second.bRow);
    const maxPropRowDrift = Math.max(propRowDriftA, propRowDriftB);
    const observedSplit = second.aToB;

    let qualificationReason = "QUALIFIED_POST_CAUSALITY_MOVING_SPLIT";
    if (!(observedSplit >= MIN_QUALIFYING_SPLIT_M)) qualificationReason = "NON_DISCRIMINATING_NO_SPLIT";
    else if (!(maxPlayerXzDrift <= MAX_PLAYER_XZ_DRIFT_M)) qualificationReason = "NON_DISCRIMINATING_PLAYERS_STILL_MOVING";
    else if (!(maxPropRowDrift >= MIN_PROP_ROW_DRIFT_M)) qualificationReason = "NON_DISCRIMINATING_PROPS_ALREADY_QUIESCENT";

    const qualification = {
      reason: qualificationReason,
      minimumSplitM: MIN_QUALIFYING_SPLIT_M,
      maxPlayerXzDriftM: MAX_PLAYER_XZ_DRIFT_M,
      minimumPropRowDriftM: MIN_PROP_ROW_DRIFT_M,
      observedSplitM: observedSplit,
      observedMaxPlayerXzDriftM: maxPlayerXzDrift,
      observedPropRowDriftA: propRowDriftA,
      observedPropRowDriftB: propRowDriftB,
      observedMaxPropRowDriftM: maxPropRowDrift,
      motionWindowMs: MOTION_WINDOW_MS,
      causalityStoppedA: causalityStopped(preEvA),
      causalityStoppedB: causalityStopped(preEvB),
    };

    if (qualificationReason !== "QUALIFIED_POST_CAUSALITY_MOVING_SPLIT") {
      return {
        repeat: REPEAT,
        delayMs: DELAY_MS,
        classification: qualificationReason,
        baselineDroppedTicks: baselineDropped,
        qualification,
        preSamples: [first, second],
        closure: null,
        postSamples: [],
        meta: { a: preEvA.meta, b: preEvB.meta },
      };
    }

    const closure = await applyMatchedClosure(a, b, `poststop-moving-r${REPEAT}`);
    const postSamples = [];
    const closureWall = Date.now();
    for (const offset of POST_CLOSURE_OFFSETS_MS) {
      await sleep(Math.max(0, closureWall + offset - Date.now()));
      const sample = await samplePair(a, b, `poststop/+${offset}`, baselineDropped);
      sample.aToAuthorityTarget = rowRms(sample.aRow, closure.authorityRow);
      sample.bToAuthorityTarget = rowRms(sample.bRow, closure.authorityRow);
      postSamples.push(sample);
    }

    const [evA, evB] = await Promise.all([evidence(a), evidence(b)]);
    if (!causalityStopped(evA) || !causalityStopped(evB)) {
      throw new Error("poststop causality was not stopped through observation window");
    }
    const final = postSamples.at(-1);
    return {
      repeat: REPEAT,
      delayMs: DELAY_MS,
      classification: "QUALIFIED_CLOSURE_EXECUTED",
      baselineDroppedTicks: baselineDropped,
      qualification,
      preSamples: [first, second],
      closure: {
        authorityTick: closure.eventA.authorityTick,
        authorityServerTime: closure.eventA.authorityServerTime,
        maxVelocityMutation: closure.maxVelocityMutation,
        maxPositionCorrectionA: closure.maxPositionCorrectionA,
        maxPositionCorrectionB: closure.maxPositionCorrectionB,
        authorityRow: closure.authorityRow,
        localLinearVelocityRmsAtoB: closure.localLinearVelocityRmsAtoB,
        localAngularVelocityRmsAtoB: closure.localAngularVelocityRmsAtoB,
        maxLocalLinearSpeed: closure.maxLocalLinearSpeed,
        maxLocalAngularSpeed: closure.maxLocalAngularSpeed,
      },
      postSamples,
      final: {
        aToB: final.aToB,
        aToAuthorityTarget: final.aToAuthorityTarget,
        bToAuthorityTarget: final.bToAuthorityTarget,
      },
      meta: { a: evA.meta, b: evB.meta },
      closureEvents: { a: evA.closureEvents, b: evB.closureEvents },
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

  console.log(`RC2 post-stop moving r${REPEAT} — causality stopped, props still moving, transform-only closure`);
  const result = await runExperiment();
  writeFileSync(OUTPUT, JSON.stringify({
    revision: "ws0-rc2-poststop-moving-closure-v1",
    generatedAt: new Date().toISOString(),
    design: {
      repeat: REPEAT,
      delayMs: DELAY_MS,
      stopAtMs: STOP_AT_MS,
      earliestPostStopMs: EARLIEST_POST_STOP_MS,
      motionWindowMs: MOTION_WINDOW_MS,
      minimumQualifyingSplitM: MIN_QUALIFYING_SPLIT_M,
      maximumPlayerXzDriftM: MAX_PLAYER_XZ_DRIFT_M,
      minimumPropRowDriftM: MIN_PROP_ROW_DRIFT_M,
      closureState: "authority position+rotation for all props; pre-existing local linear/angular velocities explicitly preserved",
      intent: "Separate incomplete moving-body closure state from continued delayed player causality.",
      qualificationSemantics: "Thresholds only qualify a discriminating experimental specimen; they are not product SLOs.",
    },
    result,
  }, null, 2));

  console.log(`classification=${result.classification}`);
  console.log(`pre split=${fmt(result.qualification.observedSplitM)} playerΔxz=${fmt(result.qualification.observedMaxPlayerXzDriftM)} propΔ=${fmt(result.qualification.observedMaxPropRowDriftM)}`);
  if (result.closure) {
    console.log(
      `closure tick=${result.closure.authorityTick} maxCorrection=${fmt(Math.max(result.closure.maxPositionCorrectionA, result.closure.maxPositionCorrectionB))} ` +
      `velocityMutation=${result.closure.maxVelocityMutation} localLinearVelA↔B=${fmt(result.closure.localLinearVelocityRmsAtoB)} ` +
      `localAngularVelA↔B=${fmt(result.closure.localAngularVelocityRmsAtoB)} maxLinearSpeed=${fmt(result.closure.maxLocalLinearSpeed)} maxAngularSpeed=${fmt(result.closure.maxLocalAngularSpeed)}`,
    );
    for (const sample of result.postSamples) {
      console.log(`${sample.label} A↔B=${fmt(sample.aToB)} A↔target=${fmt(sample.aToAuthorityTarget)} B↔target=${fmt(sample.bToAuthorityTarget)}`);
    }
  }
  console.log(`RC2 POST-STOP STRUCTURAL PASS — ${OUTPUT}`);
} catch (error) {
  if (wrangler?.logs?.length) console.error(`\n--- wrangler tail ---\n${wrangler.logs.join("\n")}`);
  if (chromedriver?.logs?.length) console.error(`\n--- chromedriver tail ---\n${chromedriver.logs.join("\n")}`);
  throw error;
} finally {
  await stopManaged(chromedriver);
  await stopManaged(wrangler);
}
