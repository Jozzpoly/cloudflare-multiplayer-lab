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
const MAX_SETTLED_PASSIVE_PROP_DELTA = 0.08;
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

async function createSession({ width, height }) {
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
              "--enable-unsafe-swiftshader", "--use-angle=swiftshader", `--window-size=${width},${height}`,
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

async function touchState(sessionId) {
  return execute(sessionId, `return window.__WS0_TOUCH__?.snapshot?.() ?? null;`);
}

async function bootAndEnter(sessionId, callsign, { touch = false } = {}) {
  const suffix = touch ? "?touch=1" : "";
  await driver(`/session/${sessionId}/url`, { method: "POST", body: { url: `${BASE_URL}/world0-two-client/${suffix}` } });
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
  if (touch) {
    await waitFor(`${callsign} touch controls`, async () => {
      const snapshot = await touchState(sessionId);
      return snapshot?.touchCapable === true && snapshot?.forced === true && snapshot?.visible === true ? snapshot : false;
    }, 10_000);
  }
}

async function touchDrive(sessionId, direction, durationMs) {
  const point = await execute(sessionId, `
    const button = document.querySelector('.touch-dir[data-dir=${JSON.stringify(direction)}]');
    if (!button) return null;
    const rect = button.getBoundingClientRect();
    return {
      x: Math.round(rect.left + rect.width / 2),
      y: Math.round(rect.top + rect.height / 2),
      visible: rect.width > 0 && rect.height > 0,
    };
  `);
  if (!point?.visible) throw new Error(`touch ${direction} button is not visible`);

  await driver(`/session/${sessionId}/actions`, {
    method: "POST",
    body: {
      actions: [{
        type: "pointer",
        id: `touch-${sessionId.slice(0, 6)}`,
        parameters: { pointerType: "touch" },
        actions: [
          { type: "pointerMove", duration: 0, origin: "viewport", x: point.x, y: point.y },
          { type: "pointerDown", button: 0 },
          { type: "pause", duration: durationMs },
          { type: "pointerUp", button: 0 },
          { type: "pause", duration: 900 },
        ],
      }],
    },
  });
}

let wrangler = null;
let chromedriver = null;
const sessions = [];
let lastDesktop = null;
let lastMobile = null;
let lastTouch = null;
try {
  const npx = process.platform === "win32" ? "npx.cmd" : "npx";
  wrangler = startManaged(npx, ["wrangler", "dev", "--env", "staging", "--ip", HOST, "--port", String(WORKER_PORT)], "wrangler");
  await waitFor("local Wrangler", async () => {
    const response = await fetch(`${BASE_URL}/api/ping`);
    return response.ok && (await response.json())?.ok === true;
  });

  for (const path of ["/world0-two-client/", "/world0-two-client/app.js", "/world0-two-client/touch-controls.js", "/world0-a2r/fixed-step-clock.js"]) {
    const response = await fetch(`${BASE_URL}${path}`);
    if (!response.ok) throw new Error(`human mobile asset ${path} returned ${response.status}`);
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

  const desktop = await createSession({ width: 1100, height: 700 });
  const mobile = await createSession({ width: 430, height: 850 });
  sessions.push(desktop, mobile);
  await bootAndEnter(desktop, "human-desktop");
  await bootAndEnter(mobile, "human-mobile", { touch: true });

  const baseline = await waitFor("clean desktop + mobile local-world baseline", async () => {
    const sd = await state(desktop);
    const sm = await state(mobile);
    const st = await touchState(mobile);
    lastDesktop = sd;
    lastMobile = sm;
    lastTouch = st;
    const ready = (s) => s && s.networkState === "live · local self + delayed peer intent" && s.playerCount === 2 &&
      s.hasRemoteBody === true && s.localSteps >= 45 && s.localDroppedSteps === 0 && s.peerInputCount > 0 &&
      Number.isFinite(s.divergence?.prop) && s.divergence.prop <= CLEAN_BASELINE_PROP_DELTA;
    return ready(sd) && ready(sm) && st?.visible === true ? { sd, sm, st } : false;
  }, 25_000);

  const beforePeerDesktop = baseline.sd.peerInputCount;
  const beforeAckMobile = baseline.sm.latestAck;
  const baselineAuthorityMotion = Math.max(
    baseline.sd.telemetry?.maxPropDisplacement ?? 0,
    baseline.sm.telemetry?.maxPropDisplacement ?? 0,
  );
  const baselineDropped = Math.max(
    baseline.sd.telemetry?.droppedTicks ?? 0,
    baseline.sm.telemetry?.droppedTicks ?? 0,
  );
  console.log(`DESKTOP + MOBILE CLEAN BASELINE\nD ${JSON.stringify(baseline.sd)}\nM ${JSON.stringify(baseline.sm)}\nT ${JSON.stringify(baseline.st)}`);

  // Slot 1 starts on the +X side. Holding touch-left crosses the shared prop row.
  // Desktop remains zero-input, so any locally reproduced desktop prop motion must
  // come from the delayed peer_input caused by the mobile player's touch intent.
  await touchDrive(mobile, "left", 1900);

  const exercised = await waitFor("mobile touch cause moves passive desktop local prop", async () => {
    const sd = await state(desktop);
    const sm = await state(mobile);
    const st = await touchState(mobile);
    lastDesktop = sd;
    lastMobile = sm;
    lastTouch = st;
    if (!sd || !sm || !st) return false;
    if (sd.localDroppedSteps !== 0 || sm.localDroppedSteps !== 0) return false;
    if ((sd.telemetry?.droppedTicks ?? 0) !== baselineDropped || (sm.telemetry?.droppedTicks ?? 0) !== baselineDropped) return false;
    if (sd.peerInputCount <= beforePeerDesktop || sd.peerInputSeq <= 0) return false;
    if (sm.latestAck <= beforeAckMobile) return false;
    if ((sd.telemetry?.activePlayers ?? 0) !== 2 || (sm.telemetry?.activePlayers ?? 0) !== 2) return false;
    if (st.lastDirection !== "left" || st.pointerDowns < 1 || st.pointerReleases < 1 || st.keyDowns < 1 || st.keyUps < 1) return false;
    if (st.activePointers !== 0 || st.activeCodes?.length !== 0) return false;

    const authorityMotion = Math.min(
      sd.telemetry?.maxPropDisplacement ?? 0,
      sm.telemetry?.maxPropDisplacement ?? 0,
    );
    if (authorityMotion - baselineAuthorityMotion < MIN_NEW_AUTHORITY_PROP_MOTION) return false;

    if (!Number.isFinite(sd.divergence?.prop) || sd.divergence.prop > MAX_SETTLED_PASSIVE_PROP_DELTA) return false;
    const finite = [sd.divergence.self, sd.divergence.remote, sd.divergence.prop, sm.divergence.self, sm.divergence.remote, sm.divergence.prop]
      .every((value) => Number.isFinite(value));
    return finite ? { sd, sm, st, authorityMotion } : false;
  }, 20_000);

  console.log(
    `DESKTOP + MOBILE CAUSAL SMOKE PASS · mobile touch authority prop motion ${exercised.authorityMotion.toFixed(3)} · ` +
    `passive-desktop final prop Δ ${exercised.sd.divergence.prop.toFixed(3)}\n` +
    `D ${JSON.stringify(exercised.sd)}\nM ${JSON.stringify(exercised.sm)}\nT ${JSON.stringify(exercised.st)}`,
  );
} catch (error) {
  if (lastDesktop) console.error(`\n--- last desktop state ---\n${JSON.stringify(lastDesktop)}`);
  if (lastMobile) console.error(`\n--- last mobile state ---\n${JSON.stringify(lastMobile)}`);
  if (lastTouch) console.error(`\n--- last touch state ---\n${JSON.stringify(lastTouch)}`);
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
