import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawn, spawnSync } from "node:child_process";

const HOST = "127.0.0.1";
const WORKER_PORT = 8787;
const DRIVER_PORT = 9515;
const BASE_URL = `http://${HOST}:${WORKER_PORT}`;
const DRIVER_URL = `http://${HOST}:${DRIVER_PORT}`;
const MODE = process.env.RC2_MODE || "moving";
const REPEAT = Math.max(1, Math.trunc(Number(process.env.RC2_REPEAT || 1)));
const OUTPUT = process.env.RC2_OUTPUT || `rc2-${MODE}-r${REPEAT}.json`;
const DELAY_MS = 100;
const STOP_AT_MS = 3500;
const MOVING_CLOSURE_AT_MS = 2800;
const QUIESCENT_FIRST_SAMPLE_MS = 2000;
const QUIESCENT_SECOND_SAMPLE_MS = 3000;
const MIN_QUALIFYING_SPLIT_M = 0.10;
const MAX_QUIESCENT_DRIFT_M = 0.005;
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
    stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, CI: "1" },
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
    label, wall: Date.now(), aToB: rowRms(sa.row, sb.row),
    aRow: sa.row, bRow: sb.row,
    authorityTickA: sa.latestAuthorityTick, authorityTickB: sb.latestAuthorityTick,
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
    eventA, eventB, authorityRow: authorityRowA, maxVelocityMutation,
    maxPositionCorrectionA: Math.max(...eventA.props.map((prop) => prop.positionCorrection)),
    maxPositionCorrectionB: Math.max(...eventB.props.map((prop) => prop.positionCorrection)),
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
  if (!new Set(["moving", "quiescent"]).has(MODE)) throw new Error(`unsupported RC2_MODE ${MODE}`);
  const sessions = [];
  try {
    const a = await createSession();
    const b = await createSession();
    sessions.push(a, b);
    const key = `rc2-${MODE}-r${REPEAT}-${Date.now().toString(36)}`.slice(-20);
    await Promise.all([
      driver(`/session/${a}/url`, { method: "POST", body: { url: `${BASE_URL}/world0-rc2/?player=A-${key}&delayMs=${DELAY_MS}` } }),
      driver(`/session/${b}/url`, { method: "POST", body: { url: `${BASE_URL}/world0-rc2/?player=B-${key}&delayMs=${DELAY_MS}` } }),
    ]);
    const ready = await waitFor(`${MODE} ready`, async () => {
      const [sa, sb] = await Promise.all([state(a), state(b)]);
      const ok = (s) => s && s.networkState === "live" && s.playerCount === 2 && s.hasRemoteBody &&
        s.localSteps >= 45 && s.localDroppedSteps === 0 && s.peerApplied > 0 && s.latestAuthorityPropCount >= 12;
      return ok(sa) && ok(sb) ? { sa, sb } : false;
    }, 25_000);
    const baselineDropped = Math.max(ready.sa.telemetry?.droppedTicks ?? 0, ready.sb.telemetry?.droppedTicks ?? 0);
    const epochMs = Date.now() + 700;
    await Promise.all([schedule(a, traceA, epochMs), schedule(b, traceB, epochMs)]);
    const preSamples = [];
    let qualified = false;
    let qualification = null;

    if (MODE === "moving") {
      await sleep(Math.max(0, epochMs + MOVING_CLOSURE_AT_MS - Date.now()));
      const pre = await samplePair(a, b, "moving/pre", baselineDropped);
      preSamples.push(pre);
      qualified = pre.aToB >= MIN_QUALIFYING_SPLIT_M;
      qualification = {
        thresholdM: MIN_QUALIFYING_SPLIT_M,
        observedSplitM: pre.aToB,
        reason: qualified ? "QUALIFIED_ACTIVE_SPLIT" : "NON_DISCRIMINATING_NO_ACTIVE_SPLIT",
      };
    } else {
      await sleep(Math.max(0, epochMs + STOP_AT_MS + QUIESCENT_FIRST_SAMPLE_MS - Date.now()));
      const first = await samplePair(a, b, "quiescent/pre+2s", baselineDropped);
      preSamples.push(first);
      await sleep(Math.max(0, epochMs + STOP_AT_MS + QUIESCENT_SECOND_SAMPLE_MS - Date.now()));
      const second = await samplePair(a, b, "quiescent/pre+3s", baselineDropped);
      preSamples.push(second);
      const aDrift = rowRms(first.aRow, second.aRow);
      const bDrift = rowRms(first.bRow, second.bRow);
      const maxDrift = Math.max(aDrift, bDrift);
      qualified = first.aToB >= MIN_QUALIFYING_SPLIT_M && second.aToB >= MIN_QUALIFYING_SPLIT_M && maxDrift <= MAX_QUIESCENT_DRIFT_M;
      qualification = {
        thresholdM: MIN_QUALIFYING_SPLIT_M,
        maxAllowedDriftM: MAX_QUIESCENT_DRIFT_M,
        firstSplitM: first.aToB,
        secondSplitM: second.aToB,
        aDriftM: aDrift,
        bDriftM: bDrift,
        maxDriftM: maxDrift,
        reason: qualified ? "QUALIFIED_STABLE_SPLIT" : "NON_DISCRIMINATING_NO_STABLE_SPLIT",
      };
    }

    if (!qualified) {
      const [evA, evB] = await Promise.all([evidence(a), evidence(b)]);
      return {
        mode: MODE, repeat: REPEAT, delayMs: DELAY_MS,
        classification: qualification.reason,
        baselineDroppedTicks: baselineDropped,
        qualification,
        preSamples,
        closure: null,
        postSamples: [],
        meta: { a: evA.meta, b: evB.meta },
      };
    }

    const closure = await applyMatchedClosure(a, b, MODE);
    const postSamples = [];
    const closureWall = Date.now();
    const offsets = MODE === "moving" ? [120] : [120, 1000, 2000, 4000];
    for (const offset of offsets) {
      await sleep(Math.max(0, closureWall + offset - Date.now()));
      const sample = await samplePair(a, b, `${MODE}/+${offset}`, baselineDropped);
      sample.aToAuthorityTarget = rowRms(sample.aRow, closure.authorityRow);
      sample.bToAuthorityTarget = rowRms(sample.bRow, closure.authorityRow);
      postSamples.push(sample);
    }
    if (MODE === "moving") {
      for (const afterStopMs of [250, 2000, 4000]) {
        await sleep(Math.max(0, epochMs + STOP_AT_MS + afterStopMs - Date.now()));
        const sample = await samplePair(a, b, `moving/rest+${afterStopMs}`, baselineDropped);
        sample.aToAuthorityTarget = rowRms(sample.aRow, closure.authorityRow);
        sample.bToAuthorityTarget = rowRms(sample.bRow, closure.authorityRow);
        postSamples.push(sample);
      }
    }
    const [evA, evB] = await Promise.all([evidence(a), evidence(b)]);
    const final = postSamples.at(-1);
    return {
      mode: MODE, repeat: REPEAT, delayMs: DELAY_MS,
      classification: "QUALIFIED_CLOSURE_EXECUTED",
      baselineDroppedTicks: baselineDropped,
      qualification,
      preSamples,
      closure: {
        authorityTick: closure.eventA.authorityTick,
        authorityServerTime: closure.eventA.authorityServerTime,
        maxVelocityMutation: closure.maxVelocityMutation,
        maxPositionCorrectionA: closure.maxPositionCorrectionA,
        maxPositionCorrectionB: closure.maxPositionCorrectionB,
        authorityRow: closure.authorityRow,
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

  console.log(`RC2 ${MODE} r${REPEAT} — transform-only closure; local velocities preserved`);
  const result = await runExperiment();
  writeFileSync(OUTPUT, JSON.stringify({
    revision: "ws0-rc2-sparse-authority-closure-v2",
    generatedAt: new Date().toISOString(),
    design: {
      mode: MODE, repeat: REPEAT, delayMs: DELAY_MS,
      minimumQualifyingSplitM: MIN_QUALIFYING_SPLIT_M,
      maxQuiescentDriftM: MAX_QUIESCENT_DRIFT_M,
      closureState: "authority position+rotation for all props; pre-existing local linear/angular velocities explicitly preserved",
      qualificationSemantics: "The split threshold is an experimental discrimination gate, not a product SLO or incidence estimate.",
    },
    result,
  }, null, 2));

  console.log(`classification=${result.classification}`);
  for (const sample of result.preSamples) console.log(`${sample.label} A↔B=${fmt(sample.aToB)}`);
  if (result.closure) {
    console.log(`closure tick=${result.closure.authorityTick} maxCorrection=${fmt(Math.max(result.closure.maxPositionCorrectionA, result.closure.maxPositionCorrectionB))} velocityMutation=${result.closure.maxVelocityMutation}`);
    for (const sample of result.postSamples) {
      console.log(`${sample.label} A↔B=${fmt(sample.aToB)} A↔target=${fmt(sample.aToAuthorityTarget)} B↔target=${fmt(sample.bToAuthorityTarget)}`);
    }
  }
  console.log(`RC2 STRUCTURAL PASS — ${OUTPUT}`);
} catch (error) {
  if (wrangler?.logs?.length) console.error(`\n--- wrangler tail ---\n${wrangler.logs.join("\n")}`);
  if (chromedriver?.logs?.length) console.error(`\n--- chromedriver tail ---\n${chromedriver.logs.join("\n")}`);
  throw error;
} finally {
  await stopManaged(chromedriver);
  await stopManaged(wrangler);
}
