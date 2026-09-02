import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawn, spawnSync } from "node:child_process";

const HOST = "127.0.0.1";
const WORKER_PORT = 8787;
const DRIVER_PORT = 9515;
const BASE_URL = `http://${HOST}:${WORKER_PORT}`;
const DRIVER_URL = `http://${HOST}:${DRIVER_PORT}`;
const PROCESS_LOG_LIMIT = 220;
const RC1_REVISION = "ws0-rc1-temporal-envelope-v1";
const SHIFT_MIN_MS = 0;
const SHIFT_MAX_MS = 240;
const SHIFT_STEP_MS = 5;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const DELAYS_MS = process.env.RC1_DELAYS
  ? process.env.RC1_DELAYS.split(",").map(Number).filter(Number.isFinite)
  : [0, 50, 100, 150];

const SCENARIOS = [
  {
    name: "one-sided",
    analysisStartMs: -100,
    durationMs: 4700,
    a: [
      { atMs: 0, x: 1, z: 0 },
      { atMs: 2000, x: 0, z: 0 },
    ],
    b: [{ atMs: 0, x: 0, z: 0 }],
  },
  {
    name: "opposed",
    analysisStartMs: 1350,
    durationMs: 5600,
    a: [
      { atMs: 0, x: 0, z: 0 },
      { atMs: 1500, x: 1, z: 0 },
      { atMs: 3500, x: 0, z: 0 },
    ],
    b: [
      { atMs: 0, x: 0, z: -1 },
      { atMs: 360, x: 0, z: 0 },
      { atMs: 1500, x: -1, z: 0 },
      { atMs: 3500, x: 0, z: 0 },
    ],
  },
  {
    name: "opposed-reversal",
    analysisStartMs: 1350,
    durationMs: 5700,
    a: [
      { atMs: 0, x: 0, z: 0 },
      { atMs: 1500, x: 1, z: 0 },
      { atMs: 2700, x: -1, z: 0 },
      { atMs: 3400, x: 0, z: 0 },
    ],
    b: [
      { atMs: 0, x: 0, z: -1 },
      { atMs: 360, x: 0, z: 0 },
      { atMs: 1500, x: -1, z: 0 },
      { atMs: 3400, x: 0, z: 0 },
    ],
  },
];

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
  } catch {
    try { proc.child.kill("SIGTERM"); } catch { /* already stopped */ }
  }
  await Promise.race([new Promise((resolve) => proc.child.once("exit", resolve)), sleep(1800)]);
  if (proc.child.exitCode === null) {
    try {
      if (process.platform === "win32") proc.child.kill("SIGKILL");
      else process.kill(-proc.child.pid, "SIGKILL");
    } catch { /* teardown only */ }
  }
}

async function waitFor(label, fn, timeoutMs = 30_000, intervalMs = 120) {
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
  const session = await driver("/session", {
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
  if (!session.sessionId) throw new Error("ChromeDriver did not return session id");
  return session.sessionId;
}

async function deleteSession(sessionId) {
  await driver(`/session/${sessionId}`, { method: "DELETE" }).catch(() => {});
}

async function execute(sessionId, script) {
  return driver(`/session/${sessionId}/execute/sync`, {
    method: "POST",
    body: { script, args: [] },
  });
}

async function navigate(sessionId, url) {
  await driver(`/session/${sessionId}/url`, { method: "POST", body: { url } });
}

async function state(sessionId) {
  return execute(sessionId, `return window.__RC1__?.snapshot?.() ?? null;`);
}

async function evidence(sessionId) {
  return execute(sessionId, `return window.__RC1__?.exportEvidence?.() ?? null;`);
}

async function schedule(sessionId, trace, epochMs) {
  const traceJson = JSON.stringify(trace);
  return execute(sessionId, `return window.__RC1__.scheduleTrace(${traceJson}, ${Math.trunc(epochMs)});`);
}

function distance3(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return NaN;
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function rowError(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || !a.length) return NaN;
  let squared = 0;
  let count = 0;
  for (let index = 0; index < a.length; index += 1) {
    const d = distance3(a[index], b[index]);
    if (!Number.isFinite(d)) continue;
    squared += d * d;
    count += 1;
  }
  return count ? Math.sqrt(squared / count) : NaN;
}

function rms(values) {
  const finite = values.filter(Number.isFinite);
  if (!finite.length) return NaN;
  return Math.sqrt(finite.reduce((sum, value) => sum + value * value, 0) / finite.length);
}

function mean(values) {
  const finite = values.filter(Number.isFinite);
  return finite.length ? finite.reduce((sum, value) => sum + value, 0) / finite.length : NaN;
}

function percentile(values, p) {
  const finite = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!finite.length) return NaN;
  const index = Math.min(finite.length - 1, Math.max(0, Math.ceil(finite.length * p) - 1));
  return finite[index];
}

function nearestByWall(history, targetWall) {
  if (!history.length || !Number.isFinite(targetWall)) return null;
  let low = 0;
  let high = history.length - 1;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (history[mid].wall < targetWall) low = mid + 1;
    else high = mid;
  }
  const next = history[low];
  const prev = low > 0 ? history[low - 1] : null;
  if (!prev) return next;
  return Math.abs(prev.wall - targetWall) <= Math.abs(next.wall - targetWall) ? prev : next;
}

function metricAtShift(localHistory, authority, shiftMs, selector) {
  const errors = [];
  for (const sample of authority) {
    const local = nearestByWall(localHistory, sample.serverTime + shiftMs);
    if (!local) continue;
    const error = selector(local, sample);
    if (Number.isFinite(error)) errors.push(error);
  }
  return {
    rms: rms(errors),
    mean: mean(errors),
    peak: errors.length ? Math.max(...errors) : NaN,
    p95: percentile(errors, 0.95),
    final: errors.length ? errors.at(-1) : NaN,
    samples: errors.length,
  };
}

function bestShift(localHistory, authority, selector) {
  let best = null;
  for (let shiftMs = SHIFT_MIN_MS; shiftMs <= SHIFT_MAX_MS; shiftMs += SHIFT_STEP_MS) {
    const metrics = metricAtShift(localHistory, authority, shiftMs, selector);
    if (!Number.isFinite(metrics.rms)) continue;
    if (!best || metrics.rms < best.rms) best = { shiftMs, ...metrics };
  }
  return best;
}

function authorityMovement(authority) {
  if (authority.length < 2) return NaN;
  const baseline = authority[0].row;
  return Math.max(...authority.map((sample) => rowError(sample.row, baseline)).filter(Number.isFinite));
}

function analyzeClient(evidence, analysisStartWall) {
  const localHistory = evidence.localHistory.filter((sample) => Number.isFinite(sample.wall));
  const authority = evidence.authorityHistory.filter(
    (sample) => Number.isFinite(sample.serverTime) && sample.serverTime >= analysisStartWall,
  );
  if (authority.length < 8) throw new Error(`insufficient authority samples: ${authority.length}`);
  if (localHistory.length < 30) throw new Error(`insufficient local samples: ${localHistory.length}`);

  const rowSelector = (local, auth) => rowError(local.row, auth.row);
  const remoteSelector = (local, auth) => distance3(local.remote, auth.remote);
  const selfSelector = (local, auth) => distance3(local.self, auth.self);

  const rowSame = metricAtShift(localHistory, authority, 0, rowSelector);
  const rowBest = bestShift(localHistory, authority, rowSelector);
  const remoteSame = metricAtShift(localHistory, authority, 0, remoteSelector);
  const remoteBest = bestShift(localHistory, authority, remoteSelector);
  const selfSame = metricAtShift(localHistory, authority, 0, selfSelector);
  const selfBest = bestShift(localHistory, authority, selfSelector);

  const applicationDelays = evidence.peerEvents
    .filter((event) => Number.isFinite(event.appliedAt) && Number.isFinite(event.receivedAt))
    .map((event) => event.appliedAt - event.receivedAt);

  return {
    authoritySamples: authority.length,
    localSamples: localHistory.length,
    authorityRowMovement: authorityMovement(authority),
    row: {
      sameTime: rowSame,
      bestAligned: rowBest,
      phaseGain: Number.isFinite(rowSame.rms) && Number.isFinite(rowBest?.rms) && rowBest.rms > 0 ? rowSame.rms / rowBest.rms : NaN,
    },
    remote: { sameTime: remoteSame, bestAligned: remoteBest },
    self: { sameTime: selfSame, bestAligned: selfBest },
    peerApplicationDelay: {
      count: applicationDelays.length,
      mean: mean(applicationDelays),
      p50: percentile(applicationDelays, 0.5),
      p95: percentile(applicationDelays, 0.95),
      max: applicationDelays.length ? Math.max(...applicationDelays) : NaN,
    },
    meta: evidence.meta,
    traceEvents: evidence.traceEvents,
  };
}

function fmt(value, digits = 3) {
  return Number.isFinite(value) ? value.toFixed(digits) : "—";
}

function compactLine(run) {
  const b = run.b;
  return [
    run.scenario.padEnd(18),
    `${String(run.delayMs).padStart(3)}ms`,
    `move=${fmt(b.authorityRowMovement)}`,
    `row0=${fmt(b.row.sameTime.rms)}`,
    `row*=${fmt(b.row.bestAligned?.rms)}`,
    `shift=${String(b.row.bestAligned?.shiftMs ?? "—").padStart(3)}ms`,
    `peak*=${fmt(b.row.bestAligned?.peak)}`,
    `final*=${fmt(b.row.bestAligned?.final)}`,
    `remote*=${fmt(b.remote.bestAligned?.rms)}`,
  ].join("  ");
}

let wrangler = null;
let chromedriver = null;
const results = [];
try {
  const npx = process.platform === "win32" ? "npx.cmd" : "npx";
  wrangler = startManaged(npx, ["wrangler", "dev", "--env", "staging", "--ip", HOST, "--port", String(WORKER_PORT)], "wrangler");
  await waitFor("local Wrangler", async () => {
    const response = await fetch(`${BASE_URL}/api/ping`);
    return response.ok && (await response.json())?.ok === true;
  });

  for (const path of ["/world0-rc1/", "/world0-rc1/runner.js", "/world0-a2r/fixed-step-clock.js"]) {
    const response = await fetch(`${BASE_URL}${path}`);
    if (!response.ok) throw new Error(`RC1 asset ${path} returned ${response.status}`);
  }

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

  console.log("RC1 integrated temporal causality envelope");
  console.log(`delays: ${DELAYS_MS.join(", ")} ms`);

  for (const scenario of SCENARIOS) {
    for (const delayMs of DELAYS_MS) {
      const sessions = [];
      try {
        const a = await createSession();
        const b = await createSession();
        sessions.push(a, b);
        const nonce = `${scenario.name}-${delayMs}-${Date.now()}`.replace(/[^A-Za-z0-9_-]/g, "-").slice(-20);
        const aUrl = `${BASE_URL}/world0-rc1/?player=A-${nonce}&delayMs=${delayMs}`;
        const bUrl = `${BASE_URL}/world0-rc1/?player=B-${nonce}&delayMs=${delayMs}`;
        await navigate(a, aUrl);
        await navigate(b, bUrl);

        await waitFor(`${scenario.name}/${delayMs} ready`, async () => {
          const sa = await state(a);
          const sb = await state(b);
          const ready = (s) => s && s.revision === RC1_REVISION && s.networkState === "live" && s.playerCount === 2 &&
            s.hasRemoteBody === true && s.localSteps >= 30 && s.localDroppedSteps === 0 && s.peerReceived > 0 && s.peerApplied > 0;
          return ready(sa) && ready(sb) ? { sa, sb } : false;
        }, 25_000);

        const epochMs = Date.now() + 700;
        await schedule(a, scenario.a, epochMs);
        await schedule(b, scenario.b, epochMs);
        await sleep(scenario.durationMs + 850);

        const finalA = await state(a);
        const finalB = await state(b);
        for (const [label, s] of [["A", finalA], ["B", finalB]]) {
          if (!s || s.networkState !== "live") throw new Error(`${scenario.name}/${delayMs} ${label} not live: ${JSON.stringify(s)}`);
          if (s.localDroppedSteps !== 0) throw new Error(`${scenario.name}/${delayMs} ${label} local dropped steps ${s.localDroppedSteps}`);
          if (s.playerCount !== 2 || !s.hasRemoteBody) throw new Error(`${scenario.name}/${delayMs} ${label} lost two-player local world`);
          if (!s.telemetry?.finite || s.telemetry?.droppedTicks !== 0) throw new Error(`${scenario.name}/${delayMs} ${label} authority unhealthy: ${JSON.stringify(s.telemetry)}`);
        }

        const evA = await evidence(a);
        const evB = await evidence(b);
        const analysisStartWall = epochMs + scenario.analysisStartMs;
        const analysisA = analyzeClient(evA, analysisStartWall);
        const analysisB = analyzeClient(evB, analysisStartWall);
        const movement = Math.max(analysisA.authorityRowMovement, analysisB.authorityRowMovement);
        if (!(movement > 0.12)) {
          throw new Error(`${scenario.name}/${delayMs} did not exercise tracked shared row: movement=${movement}`);
        }

        const run = {
          scenario: scenario.name,
          delayMs,
          analysisStartWall,
          epochMs,
          a: analysisA,
          b: analysisB,
          finalState: { a: finalA, b: finalB },
        };
        results.push(run);
        console.log(compactLine(run));
      } finally {
        for (const sessionId of sessions) await deleteSession(sessionId);
        await sleep(350);
      }
    }
  }

  const byScenario = Object.fromEntries(SCENARIOS.map((scenario) => [scenario.name, results.filter((run) => run.scenario === scenario.name)]));
  const contrasts = [];
  for (const delayMs of DELAYS_MS) {
    const one = results.find((run) => run.scenario === "one-sided" && run.delayMs === delayMs);
    const opposed = results.find((run) => run.scenario === "opposed" && run.delayMs === delayMs);
    const reversal = results.find((run) => run.scenario === "opposed-reversal" && run.delayMs === delayMs);
    if (!one || !opposed || !reversal) continue;
    contrasts.push({
      delayMs,
      passiveBestRowRms: one.b.row.bestAligned?.rms,
      opposedBestRowRms: opposed.b.row.bestAligned?.rms,
      reversalBestRowRms: reversal.b.row.bestAligned?.rms,
      opposedVsPassive: opposed.b.row.bestAligned?.rms / one.b.row.bestAligned?.rms,
      reversalVsPassive: reversal.b.row.bestAligned?.rms / one.b.row.bestAligned?.rms,
    });
  }

  const output = {
    revision: RC1_REVISION,
    generatedAt: new Date().toISOString(),
    design: {
      delaysMs: DELAYS_MS,
      shiftSearchMs: [SHIFT_MIN_MS, SHIFT_MAX_MS, SHIFT_STEP_MS],
      scenarios: SCENARIOS,
      note: "CI success means structural execution was valid, not that residuals were small.",
    },
    results,
    byScenario,
    contrasts,
  };
  writeFileSync("rc1-envelope.json", JSON.stringify(output, null, 2));

  console.log("\nRC1 contrasts (B local shared row, best phase-aligned RMS):");
  for (const contrast of contrasts) {
    console.log(
      `${String(contrast.delayMs).padStart(3)}ms  passive=${fmt(contrast.passiveBestRowRms)}  ` +
      `opposed=${fmt(contrast.opposedBestRowRms)} (${fmt(contrast.opposedVsPassive, 2)}x)  ` +
      `reversal=${fmt(contrast.reversalBestRowRms)} (${fmt(contrast.reversalVsPassive, 2)}x)`,
    );
  }
  console.log("RC1 STRUCTURAL RUN PASS — research values written to rc1-envelope.json");
} catch (error) {
  if (wrangler?.logs?.length) console.error(`\n--- wrangler tail ---\n${wrangler.logs.join("\n")}`);
  if (chromedriver?.logs?.length) console.error(`\n--- chromedriver tail ---\n${chromedriver.logs.join("\n")}`);
  throw error;
} finally {
  await stopManaged(chromedriver);
  await stopManaged(wrangler);
}
