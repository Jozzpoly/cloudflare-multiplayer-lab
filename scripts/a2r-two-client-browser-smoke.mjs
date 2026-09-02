import { existsSync } from "node:fs";
import { join } from "node:path";
import { spawn, spawnSync } from "node:child_process";

const HOST = "127.0.0.1";
const WORKER_PORT = 8787;
const DRIVER_PORT = 9515;
const BASE_URL = `http://${HOST}:${WORKER_PORT}`;
const DRIVER_URL = `http://${HOST}:${DRIVER_PORT}`;
const PROCESS_LOG_LIMIT = 180;
const CLEAN_BASELINE_PROP_DELTA = 0.08;
const MIN_NEW_AUTHORITY_PROP_MOTION = 0.5;
const MAX_SETTLED_PROP_DELTA = 0.08;
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
  await Promise.race([new Promise((resolve) => proc.child.once("exit", resolve)), sleep(1800)]);
  if (proc.child.exitCode === null) {
    try {
      if (process.platform === "win32") proc.child.kill("SIGKILL");
      else process.kill(-proc.child.pid, "SIGKILL");
    } catch { /* teardown only */ }
  }
}

async function waitFor(label, fn, timeoutMs = 30_000, intervalMs = 200) {
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
              "--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--window-size=1100,700",
            ],
          },
        },
      },
    },
  });
  if (!session.sessionId) throw new Error("ChromeDriver did not return session id");
  return session.sessionId;
}

async function execute(sessionId, script) {
  return driver(`/session/${sessionId}/execute/sync`, {
    method: "POST",
    body: { script, args: [] },
  });
}

async function state(sessionId) {
  return execute(sessionId, `return window.__WS0_TWO_CLIENT__?.snapshot?.() ?? null;`);
}

async function bootAndEnter(sessionId, callsign) {
  await driver(`/session/${sessionId}/url`, { method: "POST", body: { url: `${BASE_URL}/world0-two-client/` } });
  await waitFor(`${callsign} bootstrap`, async () => execute(sessionId, `
    const status = document.querySelector('#boot-status')?.textContent || '';
    return status.includes('ws0-a2r-two-client-intent-client-v1') && document.querySelector('#enter')?.disabled === false;
  `), 25_000);
  await execute(sessionId, `
    const input = document.querySelector('#callsign');
    input.value = ${JSON.stringify(callsign)};
    document.querySelector('#enter').click();
    return true;
  `);
}

async function keyDrive(sessionId, key, durationMs) {
  await driver(`/session/${sessionId}/actions`, {
    method: "POST",
    body: {
      actions: [{
        type: "key",
        id: `keyboard-${sessionId.slice(0, 6)}`,
        actions: [
          { type: "keyDown", value: key },
          { type: "pause", duration: durationMs },
          { type: "keyUp", value: key },
          { type: "pause", duration: 900 },
        ],
      }],
    },
  });
}

let wrangler = null;
let chromedriver = null;
const sessions = [];
let lastA = null;
let lastB = null;
try {
  const npx = process.platform === "win32" ? "npx.cmd" : "npx";
  wrangler = startManaged(npx, ["wrangler", "dev", "--env", "staging", "--ip", HOST, "--port", String(WORKER_PORT)], "wrangler");
  await waitFor("local Wrangler", async () => {
    const response = await fetch(`${BASE_URL}/api/ping`);
    return response.ok && (await response.json())?.ok === true;
  });

  for (const path of ["/world0-two-client/", "/world0-two-client/app.js", "/world0-a2r/fixed-step-clock.js"]) {
    const response = await fetch(`${BASE_URL}${path}`);
    if (!response.ok) throw new Error(`probe asset ${path} returned ${response.status}`);
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

  const a = await createSession();
  const b = await createSession();
  sessions.push(a, b);
  await bootAndEnter(a, "probe-a");
  await bootAndEnter(b, "probe-b");

  // This is a harness-cleanliness precondition, not a product SLO. Before A
  // acts we need both local worlds to already represent the same quiet props
  // closely enough that a later shared-contact result is causally interpretable.
  const baseline = await waitFor("clean two-client local-world baseline", async () => {
    const sa = await state(a);
    const sb = await state(b);
    lastA = sa;
    lastB = sb;
    const ready = (s) => s && s.networkState === "live · local self + delayed peer intent" && s.playerCount === 2 &&
      s.hasRemoteBody === true && s.localSteps >= 45 && s.localDroppedSteps === 0 && s.peerInputCount > 0 &&
      Number.isFinite(s.divergence?.prop) && s.divergence.prop <= CLEAN_BASELINE_PROP_DELTA;
    return ready(sa) && ready(sb) ? { sa, sb } : false;
  }, 25_000);

  const beforePeerB = baseline.sb.peerInputCount;
  const baselineAuthorityMotion = Math.max(
    baseline.sa.telemetry?.maxPropDisplacement ?? 0,
    baseline.sb.telemetry?.maxPropDisplacement ?? 0,
  );
  console.log(`TWO-CLIENT CLEAN BASELINE\nA ${JSON.stringify(baseline.sa)}\nB ${JSON.stringify(baseline.sb)}`);

  await keyDrive(a, "d", 1900);

  const exercised = await waitFor("delayed remote cause moves passive-client local prop", async () => {
    const sa = await state(a);
    const sb = await state(b);
    lastA = sa;
    lastB = sb;
    if (!sa || !sb) return false;
    if (sa.localDroppedSteps !== 0 || sb.localDroppedSteps !== 0) return false;
    if (sb.peerInputCount <= beforePeerB || sb.peerInputSeq <= 0) return false;
    if (sa.latestAck <= 0 || sb.latestAck <= 0) return false;
    if ((sa.telemetry?.activePlayers ?? 0) !== 2 || (sb.telemetry?.activePlayers ?? 0) !== 2) return false;

    const authorityMotion = Math.min(
      sa.telemetry?.maxPropDisplacement ?? 0,
      sb.telemetry?.maxPropDisplacement ?? 0,
    );
    if (authorityMotion - baselineAuthorityMotion < MIN_NEW_AUTHORITY_PROP_MOTION) return false;

    // B never receives movement input in this trace. Its only local cause for
    // following A's authoritative prop displacement is the delayed peer_input
    // driving A's remote dynamic body through B's local Box3D world. A small
    // final max prop delta therefore proves the passive local world actually
    // reproduced the shared consequence; it cannot be satisfied by a static
    // local prop while authority alone moves by >0.5 m.
    if (!Number.isFinite(sb.divergence?.prop) || sb.divergence.prop > MAX_SETTLED_PROP_DELTA) return false;

    const finite = [sa.divergence.self, sa.divergence.remote, sa.divergence.prop, sb.divergence.self, sb.divergence.remote, sb.divergence.prop]
      .every((value) => Number.isFinite(value));
    return finite ? { sa, sb, authorityMotion } : false;
  }, 20_000);

  console.log(
    `TWO-CLIENT BROWSER CAUSAL SMOKE PASS · authority prop motion ${exercised.authorityMotion.toFixed(3)} · ` +
    `passive-B final prop Δ ${exercised.sb.divergence.prop.toFixed(3)}\n` +
    `A ${JSON.stringify(exercised.sa)}\nB ${JSON.stringify(exercised.sb)}`,
  );
} catch (error) {
  if (lastA) console.error(`\n--- last A state ---\n${JSON.stringify(lastA)}`);
  if (lastB) console.error(`\n--- last B state ---\n${JSON.stringify(lastB)}`);
  if (wrangler?.logs?.length) console.error(`\n--- wrangler tail ---\n${wrangler.logs.join("\n")}`);
  if (chromedriver?.logs?.length) console.error(`\n--- chromedriver tail ---\n${chromedriver.logs.join("\n")}`);
  throw error;
} finally {
  for (const sessionId of sessions) {
    await driver(`/session/${sessionId}`, { method: "DELETE" }).catch(() => {});
  }
  await stopManaged(chromedriver);
  await stopManaged(wrangler);
}
