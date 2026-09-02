import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawn, spawnSync } from "node:child_process";

const HOST = "127.0.0.1";
const WORKER_PORT = 8787;
const DRIVER_PORT = 9515;
const BASE_URL = `http://${HOST}:${WORKER_PORT}`;
const DRIVER_URL = `http://${HOST}:${DRIVER_PORT}`;
const DELAYS_MS = [40, 50, 60, 70, 80, 90, 100];
const REPEATS = 2;
const STOP_AT_MS = 3500;
const REST_SAMPLE_MS = [2000, 4000];
const PROCESS_LOG_LIMIT = 160;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function appendLog(target, chunk) {
  target.push(...String(chunk).split(/\r?\n/).filter(Boolean));
  if (target.length > PROCESS_LOG_LIMIT) target.splice(0, target.length - PROCESS_LOG_LIMIT);
}
function startManaged(command, args, name) {
  const logs = [];
  const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, CI: "1" }, detached: process.platform !== "win32" });
  child.stdout.on("data", (chunk) => appendLog(logs, chunk));
  child.stderr.on("data", (chunk) => appendLog(logs, chunk));
  return { child, logs, name };
}
async function stopManaged(proc) {
  if (!proc?.child || proc.child.exitCode !== null) return;
  try { process.platform === "win32" ? proc.child.kill("SIGTERM") : process.kill(-proc.child.pid, "SIGTERM"); } catch { /* teardown */ }
  await Promise.race([new Promise((resolve) => proc.child.once("exit", resolve)), sleep(1400)]);
  if (proc.child.exitCode === null) {
    try { process.platform === "win32" ? proc.child.kill("SIGKILL") : process.kill(-proc.child.pid, "SIGKILL"); } catch { /* teardown */ }
  }
}
async function waitFor(label, fn, timeoutMs = 25_000, intervalMs = 120) {
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
  const value = await driver("/session", { method: "POST", body: { capabilities: { alwaysMatch: { browserName: "chrome", "goog:chromeOptions": { args: [
    "--headless=new", "--no-sandbox", "--disable-dev-shm-usage", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows", "--window-size=700,420",
  ] } } } } });
  if (!value.sessionId) throw new Error("ChromeDriver did not return session id");
  return value.sessionId;
}
async function execute(sessionId, script) {
  return driver(`/session/${sessionId}/execute/sync`, { method: "POST", body: { script, args: [] } });
}
async function state(sessionId) { return execute(sessionId, `return window.__RC1__?.snapshot?.() ?? null;`); }
async function evidence(sessionId) { return execute(sessionId, `return window.__RC1__?.exportEvidence?.() ?? null;`); }
async function schedule(sessionId, trace, epochMs) {
  return execute(sessionId, `return window.__RC1__.scheduleTrace(${JSON.stringify(trace)}, ${Math.trunc(epochMs)});`);
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
function mean(values) {
  const finite = values.filter(Number.isFinite);
  return finite.length ? finite.reduce((sum, value) => sum + value, 0) / finite.length : NaN;
}
function peerDelayStats(ev) {
  const values = (ev?.peerEvents || []).filter((e) => Number.isFinite(e.appliedAt) && Number.isFinite(e.receivedAt)).map((e) => e.appliedAt - e.receivedAt);
  return { count: values.length, meanMs: mean(values), minMs: values.length ? Math.min(...values) : NaN, maxMs: values.length ? Math.max(...values) : NaN };
}
function latestAuthorityRow(ev) { return ev?.authorityHistory?.at(-1)?.row || null; }
function fmt(value) { return Number.isFinite(value) ? value.toFixed(4) : "—"; }

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
  const chromedriverFromEnv = process.env.CHROMEWEBDRIVER ? join(process.env.CHROMEWEBDRIVER, process.platform === "win32" ? "chromedriver.exe" : "chromedriver") : null;
  const executable = findExecutable([chromedriverFromEnv, "chromedriver"]);
  if (!executable) throw new Error("ChromeDriver not found");
  chromedriver = startManaged(executable, [`--port=${DRIVER_PORT}`, "--log-level=WARNING"], "chromedriver");
  await waitFor("ChromeDriver", async () => {
    const response = await fetch(`${DRIVER_URL}/status`);
    return response.ok && (await response.json())?.value?.ready === true;
  });

  console.log(`RC1 contention boundary: ${DELAYS_MS.join(", ")}ms × ${REPEATS} fresh runs`);
  for (const delayMs of DELAYS_MS) {
    for (let repeat = 1; repeat <= REPEATS; repeat += 1) {
      const sessions = [];
      try {
        const a = await createSession();
        const b = await createSession();
        sessions.push(a, b);
        const key = `b${delayMs}r${repeat}-${Date.now().toString(36)}`.slice(-20);
        await driver(`/session/${a}/url`, { method: "POST", body: { url: `${BASE_URL}/world0-rc1/?player=A-${key}&delayMs=${delayMs}` } });
        await driver(`/session/${b}/url`, { method: "POST", body: { url: `${BASE_URL}/world0-rc1/?player=B-${key}&delayMs=${delayMs}` } });

        const ready = await waitFor(`${delayMs}/${repeat} ready`, async () => {
          const sa = await state(a);
          const sb = await state(b);
          const ok = (s) => s && s.networkState === "live" && s.playerCount === 2 && s.hasRemoteBody && s.localSteps >= 45 && s.localDroppedSteps === 0 && s.peerApplied > 0;
          return ok(sa) && ok(sb) ? { sa, sb } : false;
        });
        const baselineDropped = Math.max(ready.sa.telemetry?.droppedTicks ?? 0, ready.sb.telemetry?.droppedTicks ?? 0);

        const epochMs = Date.now() + 700;
        await schedule(a, traceA, epochMs);
        await schedule(b, traceB, epochMs);
        const samples = [];
        let previous = null;
        for (const afterStopMs of REST_SAMPLE_MS) {
          const target = epochMs + STOP_AT_MS + afterStopMs;
          await sleep(Math.max(0, target - Date.now()));
          const sa = await state(a);
          const sb = await state(b);
          if (!sa || !sb || sa.networkState !== "live" || sb.networkState !== "live") throw new Error(`${delayMs}/${repeat} lost live state`);
          if (sa.localDroppedSteps !== 0 || sb.localDroppedSteps !== 0) throw new Error(`${delayMs}/${repeat} local dropped steps`);
          const droppedNow = Math.max(sa.telemetry?.droppedTicks ?? 0, sb.telemetry?.droppedTicks ?? 0);
          if (!sa.telemetry?.finite || !sb.telemetry?.finite || droppedNow !== baselineDropped) {
            throw new Error(`${delayMs}/${repeat} authority health changed: baseline drops ${baselineDropped}, now ${droppedNow}`);
          }
          const sample = {
            afterStopMs,
            aToB: rowRms(sa.row, sb.row),
            aDrift: previous ? rowRms(sa.row, previous.aRow) : null,
            bDrift: previous ? rowRms(sb.row, previous.bRow) : null,
            aRow: sa.row,
            bRow: sb.row,
          };
          samples.push(sample);
          previous = { aRow: sa.row, bRow: sb.row };
        }

        const evA = await evidence(a);
        const evB = await evidence(b);
        const authorityRow = latestAuthorityRow(evA) || latestAuthorityRow(evB);
        const final = samples.at(-1);
        const result = {
          delayMs,
          repeat,
          baselineDroppedTicks: baselineDropped,
          peerDelayA: peerDelayStats(evA),
          peerDelayB: peerDelayStats(evB),
          samples,
          final: {
            aToB: final.aToB,
            aToAuthority: rowRms(final.aRow, authorityRow),
            bToAuthority: rowRms(final.bRow, authorityRow),
            aDrift2to4s: final.aDrift,
            bDrift2to4s: final.bDrift,
          },
        };
        results.push(result);
        console.log(
          `${String(delayMs).padStart(3)}ms r${repeat}  actual≈${fmt((result.peerDelayA.meanMs + result.peerDelayB.meanMs) / 2)}ms  ` +
          `A↔B@4s=${fmt(result.final.aToB)}  A↔auth=${fmt(result.final.aToAuthority)}  B↔auth=${fmt(result.final.bToAuthority)}  ` +
          `drift2→4=${fmt(Math.max(result.final.aDrift2to4s, result.final.bDrift2to4s))}  warmDrops=${baselineDropped}`,
        );
      } finally {
        for (const sessionId of sessions) await driver(`/session/${sessionId}`, { method: "DELETE" }).catch(() => {});
      }
    }
  }

  const summary = DELAYS_MS.map((delayMs) => {
    const group = results.filter((result) => result.delayMs === delayMs);
    return {
      delayMs,
      repeats: group.length,
      meanActualPeerDelayMs: mean(group.map((r) => (r.peerDelayA.meanMs + r.peerDelayB.meanMs) / 2)),
      finalAToBMean: mean(group.map((r) => r.final.aToB)),
      finalAToBMin: Math.min(...group.map((r) => r.final.aToB)),
      finalAToBMax: Math.max(...group.map((r) => r.final.aToB)),
    };
  });
  writeFileSync("rc1-contention-boundary.json", JSON.stringify({
    revision: "ws0-rc1-contention-boundary-v1",
    generatedAt: new Date().toISOString(),
    design: { delaysMs: DELAYS_MS, repeats: REPEATS, restSampleMs: REST_SAMPLE_MS },
    summary,
    results,
  }, null, 2));
  console.log("\nBoundary summary:");
  for (const row of summary) console.log(`${row.delayMs}ms actual≈${fmt(row.meanActualPeerDelayMs)} A↔B mean=${fmt(row.finalAToBMean)} range=${fmt(row.finalAToBMin)}..${fmt(row.finalAToBMax)}`);
  console.log("RC1 CONTENTION BOUNDARY STRUCTURAL PASS");
} catch (error) {
  if (wrangler?.logs?.length) console.error(`\n--- wrangler tail ---\n${wrangler.logs.join("\n")}`);
  if (chromedriver?.logs?.length) console.error(`\n--- chromedriver tail ---\n${chromedriver.logs.join("\n")}`);
  throw error;
} finally {
  await stopManaged(chromedriver);
  await stopManaged(wrangler);
}
