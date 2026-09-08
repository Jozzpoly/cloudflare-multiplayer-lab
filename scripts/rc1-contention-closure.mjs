import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawn, spawnSync } from "node:child_process";

const HOST = "127.0.0.1";
const WORKER_PORT = 8787;
const DRIVER_PORT = 9515;
const BASE_URL = `http://${HOST}:${WORKER_PORT}`;
const DRIVER_URL = `http://${HOST}:${DRIVER_PORT}`;
const PROCESS_LOG_LIMIT = 180;
const DELAYS_MS = [50, 100, 150];
const STOP_AT_MS = 3500;
const SAMPLE_AFTER_STOP_MS = [250, 1000, 2000, 4000, 8000, 12000];
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
  } catch {
    try { proc.child.kill("SIGTERM"); } catch { /* already stopped */ }
  }
  await Promise.race([new Promise((resolve) => proc.child.once("exit", resolve)), sleep(1500)]);
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
  return execute(sessionId, `return window.__RC1__?.snapshot?.() ?? null;`);
}

async function evidence(sessionId) {
  return execute(sessionId, `return window.__RC1__?.exportEvidence?.() ?? null;`);
}

async function schedule(sessionId, trace, epochMs) {
  return execute(sessionId, `return window.__RC1__.scheduleTrace(${JSON.stringify(trace)}, ${Math.trunc(epochMs)});`);
}

function distance3(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return NaN;
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function rowRms(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || !a.length) return NaN;
  const values = a.map((position, index) => distance3(position, b[index])).filter(Number.isFinite);
  if (!values.length) return NaN;
  return Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / values.length);
}

function latestAuthorityRow(ev) {
  const history = ev?.authorityHistory || [];
  const sample = history.at(-1);
  return sample?.row || null;
}

function fmt(value) {
  return Number.isFinite(value) ? value.toFixed(4) : "—";
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

  console.log("RC1 contention closure — long-rest test");

  for (const delayMs of DELAYS_MS) {
    const sessions = [];
    try {
      const a = await createSession();
      const b = await createSession();
      sessions.push(a, b);
      const key = `c${delayMs}-${Date.now().toString(36)}`.slice(-20);
      await driver(`/session/${a}/url`, { method: "POST", body: { url: `${BASE_URL}/world0-rc1/?player=A-${key}&delayMs=${delayMs}` } });
      await driver(`/session/${b}/url`, { method: "POST", body: { url: `${BASE_URL}/world0-rc1/?player=B-${key}&delayMs=${delayMs}` } });

      await waitFor(`closure/${delayMs} ready`, async () => {
        const sa = await state(a);
        const sb = await state(b);
        const ready = (s) => s && s.networkState === "live" && s.playerCount === 2 && s.hasRemoteBody &&
          s.localSteps >= 45 && s.localDroppedSteps === 0 && s.peerApplied > 0;
        return ready(sa) && ready(sb);
      }, 25_000);

      const epochMs = Date.now() + 700;
      await schedule(a, traceA, epochMs);
      await schedule(b, traceB, epochMs);

      const samples = [];
      let previous = null;
      for (const afterStopMs of SAMPLE_AFTER_STOP_MS) {
        const target = epochMs + STOP_AT_MS + afterStopMs;
        await sleep(Math.max(0, target - Date.now()));
        const sa = await state(a);
        const sb = await state(b);
        if (!sa || !sb || sa.networkState !== "live" || sb.networkState !== "live") {
          throw new Error(`closure/${delayMs} lost live state`);
        }
        if (sa.localDroppedSteps !== 0 || sb.localDroppedSteps !== 0) {
          throw new Error(`closure/${delayMs} local dropped steps`);
        }
        if (!sa.telemetry?.finite || !sb.telemetry?.finite || sa.telemetry.droppedTicks !== 0 || sb.telemetry.droppedTicks !== 0) {
          throw new Error(`closure/${delayMs} authority unhealthy: ${JSON.stringify({ a: sa.telemetry, b: sb.telemetry })}`);
        }

        const current = {
          afterStopMs,
          aToB: rowRms(sa.row, sb.row),
          aDriftSincePrevious: previous ? rowRms(sa.row, previous.aRow) : null,
          bDriftSincePrevious: previous ? rowRms(sb.row, previous.bRow) : null,
          aRow: sa.row,
          bRow: sb.row,
          aTelemetry: sa.telemetry,
          bTelemetry: sb.telemetry,
        };
        samples.push(current);
        previous = { aRow: sa.row, bRow: sb.row };
        console.log(
          `${String(delayMs).padStart(3)}ms  rest=${String(afterStopMs).padStart(5)}ms  ` +
          `A↔B=${fmt(current.aToB)}  ΔA=${fmt(current.aDriftSincePrevious)}  ΔB=${fmt(current.bDriftSincePrevious)}`,
        );
      }

      const evA = await evidence(a);
      const evB = await evidence(b);
      const authorityRow = latestAuthorityRow(evA) || latestAuthorityRow(evB);
      const final = samples.at(-1);
      const result = {
        delayMs,
        samples,
        final: {
          aToB: final.aToB,
          aToAuthority: rowRms(final.aRow, authorityRow),
          bToAuthority: rowRms(final.bRow, authorityRow),
          authorityRow,
        },
        meta: { a: evA.meta, b: evB.meta },
      };
      results.push(result);
      console.log(
        `${delayMs}ms FINAL @12s: A↔B=${fmt(result.final.aToB)}  ` +
        `A↔auth=${fmt(result.final.aToAuthority)}  B↔auth=${fmt(result.final.bToAuthority)}`,
      );
    } finally {
      for (const sessionId of sessions) {
        await driver(`/session/${sessionId}`, { method: "DELETE" }).catch(() => {});
      }
    }
  }

  writeFileSync("rc1-contention-closure.json", JSON.stringify({
    revision: "ws0-rc1-contention-closure-v1",
    generatedAt: new Date().toISOString(),
    delaysMs: DELAYS_MS,
    stopAtMs: STOP_AT_MS,
    sampleAfterStopMs: SAMPLE_AFTER_STOP_MS,
    results,
    note: "Structural PASS does not require convergence or divergence; measured closure is the research result.",
  }, null, 2));
  console.log("RC1 CONTENTION CLOSURE STRUCTURAL PASS");
} catch (error) {
  if (wrangler?.logs?.length) console.error(`\n--- wrangler tail ---\n${wrangler.logs.join("\n")}`);
  if (chromedriver?.logs?.length) console.error(`\n--- chromedriver tail ---\n${chromedriver.logs.join("\n")}`);
  throw error;
} finally {
  await stopManaged(chromedriver);
  await stopManaged(wrangler);
}
