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
const MOVING_CLOSURE_AT_MS = 2800;
const QUIESCENT_CLOSURE_AFTER_STOP_MS = 2000;
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
  return driver(`/session/${sessionId}/execute/sync`, {
    method: "POST",
    body: { script, args: [] },
  });
}

async function state(sessionId) {
  return execute(sessionId, `return window.__RC2__?.snapshot?.() ?? null;`);
}

async function evidence(sessionId) {
  return execute(sessionId, `return window.__RC2__?.exportEvidence?.() ?? null;`);
}

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
  const values = a.map((position, index) => distance3(position, b[index])).filter(Number.isFinite);
  return values.length ? Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / values.length) : NaN;
}

function authorityRowFromEvent(event) {
  const byId = new Map((event?.props || []).map((prop) => [prop.id, prop.authorityPosition]));
  return TRACKED_PROP_IDS.map((id) => byId.get(id) || [NaN, NaN, NaN]);
}

function fmt(value) {
  return Number.isFinite(value) ? value.toFixed(4) : "—";
}

function healthyAgainstBaseline(sa, sb, baselineDropped) {
  if (!sa || !sb || sa.networkState !== "live" || sb.networkState !== "live") return false;
  if (sa.localDroppedSteps !== 0 || sb.localDroppedSteps !== 0) return false;
  if (!sa.telemetry?.finite || !sb.telemetry?.finite) return false;
  const drops = Math.max(sa.telemetry?.droppedTicks ?? 0, sb.telemetry?.droppedTicks ?? 0);
  return drops === baselineDropped;
}

async function samplePair(a, b, label, baselineDropped) {
  const [sa, sb] = await Promise.all([state(a), state(b)]);
  if (!healthyAgainstBaseline(sa, sb, baselineDropped)) {
    throw new Error(`${label} unhealthy: ${JSON.stringify({ a: sa?.telemetry, b: sb?.telemetry, localDropsA: sa?.localDroppedSteps, localDropsB: sb?.localDroppedSteps, baselineDropped })}`);
  }
  return {
    label,
    wall: Date.now(),
    aToB: rowRms(sa.row, sb.row),
    aRow: sa.row,
    bRow: sb.row,
    authorityTickA: sa.latestAuthorityTick,
    authorityTickB: sb.latestAuthorityTick,
    stateA: sa,
    stateB: sb,
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
    throw new Error(`${label} closure snapshot skew: ${JSON.stringify({ tickA: eventA?.authorityTick, tickB: eventB?.authorityTick })}`);
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
  return { eventA, eventB, authorityRow: authorityRowA, maxVelocityMutation };
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

async function runCondition(kind) {
  const sessions = [];
  try {
    const a = await createSession();
    const b = await createSession();
    sessions.push(a, b);
    const key = `rc2-${kind}-${Date.now().toString(36)}`.slice(-20);
    await Promise.all([
      driver(`/session/${a}/url`, { method: "POST", body: { url: `${BASE_URL}/world0-rc1/?player=A-${key}&delayMs=${DELAY_MS}` } }),
      driver(`/session/${b}/url`, { method: "POST", body: { url: `${BASE_URL}/world0-rc1/?player=B-${key}&delayMs=${DELAY_MS}` } }),
    ]);

    const ready = await waitFor(`${kind} ready`, async () => {
      const [sa, sb] = await Promise.all([state(a), state(b)]);
      const ok = (s) => s && s.networkState === "live" && s.playerCount === 2 && s.hasRemoteBody &&
        s.localSteps >= 45 && s.localDroppedSteps === 0 && s.peerApplied > 0 && s.latestAuthorityPropCount >= 12;
      return ok(sa) && ok(sb) ? { sa, sb } : false;
    }, 25_000);
    const baselineDropped = Math.max(ready.sa.telemetry?.droppedTicks ?? 0, ready.sb.telemetry?.droppedTicks ?? 0);

    const epochMs = Date.now() + 700;
    await Promise.all([schedule(a, traceA, epochMs), schedule(b, traceB, epochMs)]);
    const samples = [];
    let closure = null;

    if (kind === "moving") {
      await sleep(Math.max(0, epochMs + MOVING_CLOSURE_AT_MS - Date.now()));
      const pre = await samplePair(a, b, "moving/pre", baselineDropped);
      samples.push(pre);
      closure = await applyMatchedClosure(a, b, "moving");
      await sleep(120);
      const immediate = await samplePair(a, b, "moving/+120ms", baselineDropped);
      immediate.aToAuthorityTarget = rowRms(immediate.aRow, closure.authorityRow);
      immediate.bToAuthorityTarget = rowRms(immediate.bRow, closure.authorityRow);
      samples.push(immediate);

      for (const afterStopMs of [250, 2000, 4000]) {
        await sleep(Math.max(0, epochMs + STOP_AT_MS + afterStopMs - Date.now()));
        samples.push(await samplePair(a, b, `moving/rest+${afterStopMs}`, baselineDropped));
      }
    } else if (kind === "quiescent") {
      await sleep(Math.max(0, epochMs + STOP_AT_MS + QUIESCENT_CLOSURE_AFTER_STOP_MS - Date.now()));
      const pre = await samplePair(a, b, "quiescent/pre", baselineDropped);
      samples.push(pre);
      closure = await applyMatchedClosure(a, b, "quiescent");

      const closureWall = Date.now();
      for (const afterClosureMs of [120, 1000, 2000, 4000]) {
        await sleep(Math.max(0, closureWall + afterClosureMs - Date.now()));
        const sample = await samplePair(a, b, `quiescent/+${afterClosureMs}`, baselineDropped);
        sample.aToAuthorityTarget = rowRms(sample.aRow, closure.authorityRow);
        sample.bToAuthorityTarget = rowRms(sample.bRow, closure.authorityRow);
        samples.push(sample);
      }
    } else {
      throw new Error(`unknown condition ${kind}`);
    }

    const evA = await evidence(a);
    const evB = await evidence(b);
    const final = samples.at(-1);
    const result = {
      kind,
      delayMs: DELAY_MS,
      baselineDroppedTicks: baselineDropped,
      closure: {
        authorityTick: closure.eventA.authorityTick,
        authorityServerTime: closure.eventA.authorityServerTime,
        maxVelocityMutation: closure.maxVelocityMutation,
        maxPositionCorrectionA: Math.max(...closure.eventA.props.map((prop) => prop.positionCorrection)),
        maxPositionCorrectionB: Math.max(...closure.eventB.props.map((prop) => prop.positionCorrection)),
        authorityRow: closure.authorityRow,
      },
      samples: samples.map(({ stateA, stateB, ...sample }) => sample),
      final: {
        aToB: final.aToB,
        aToAuthorityTarget: rowRms(final.aRow, closure.authorityRow),
        bToAuthorityTarget: rowRms(final.bRow, closure.authorityRow),
      },
      meta: { a: evA.meta, b: evB.meta },
      closureEvents: { a: evA.closureEvents, b: evB.closureEvents },
    };

    console.log(`\n${kind.toUpperCase()} closure tick ${result.closure.authorityTick}`);
    for (const sample of result.samples) {
      console.log(`${sample.label.padEnd(22)} A↔B=${fmt(sample.aToB)} A↔target=${fmt(sample.aToAuthorityTarget)} B↔target=${fmt(sample.bToAuthorityTarget)}`);
    }
    console.log(`${kind} final A↔B=${fmt(result.final.aToB)} A↔target=${fmt(result.final.aToAuthorityTarget)} B↔target=${fmt(result.final.bToAuthorityTarget)}`);
    return result;
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

  console.log("RC2 sparse authority closure — position+rotation only, local velocities preserved");
  const moving = await runCondition("moving");
  const quiescent = await runCondition("quiescent");
  const results = { moving, quiescent };

  writeFileSync("rc2-sparse-authority-closure.json", JSON.stringify({
    revision: "ws0-rc2-sparse-authority-closure-v1",
    generatedAt: new Date().toISOString(),
    design: {
      delayMs: DELAY_MS,
      movingClosureAtMs: MOVING_CLOSURE_AT_MS,
      stopAtMs: STOP_AT_MS,
      quiescentClosureAfterStopMs: QUIESCENT_CLOSURE_AFTER_STOP_MS,
      closureState: "authority position+rotation for all props; pre-existing local linear/angular velocities explicitly preserved",
    },
    results,
    note: "Structural PASS validates the falsifier execution only. Whether sparse closure is sufficient is determined from the measured post-closure histories, not from a CI error threshold.",
  }, null, 2));
  console.log("RC2 SPARSE AUTHORITY CLOSURE STRUCTURAL PASS");
} catch (error) {
  if (wrangler?.logs?.length) console.error(`\n--- wrangler tail ---\n${wrangler.logs.join("\n")}`);
  if (chromedriver?.logs?.length) console.error(`\n--- chromedriver tail ---\n${chromedriver.logs.join("\n")}`);
  throw error;
} finally {
  await stopManaged(chromedriver);
  await stopManaged(wrangler);
}
