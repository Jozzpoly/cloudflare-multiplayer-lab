import { existsSync } from "node:fs";
import { join } from "node:path";
import { spawn, spawnSync } from "node:child_process";

const DRIVER_PORT = 9516;
const DRIVER_URL = `http://127.0.0.1:${DRIVER_PORT}`;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function start(command, args) {
  return spawn(command, args, {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, CI: "1" },
    detached: process.platform !== "win32",
  });
}
async function stop(child) {
  if (!child || child.exitCode !== null) return;
  try {
    if (process.platform === "win32") child.kill("SIGTERM");
    else process.kill(-child.pid, "SIGTERM");
  } catch {
    try { child.kill("SIGTERM"); } catch { /* already gone */ }
  }
  await Promise.race([new Promise((resolve) => child.once("exit", resolve)), sleep(1200)]);
  if (child.exitCode === null) {
    try {
      if (process.platform === "win32") child.kill("SIGKILL");
      else process.kill(-child.pid, "SIGKILL");
    } catch { /* teardown only */ }
  }
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
async function waitFor(label, fn, timeoutMs = 15_000) {
  const started = Date.now();
  let lastError = null;
  while (Date.now() - started < timeoutMs) {
    try {
      const value = await fn();
      if (value) return value;
    } catch (error) { lastError = error; }
    await sleep(100);
  }
  throw new Error(`${label} timed out${lastError ? `: ${lastError.message}` : ""}`);
}
async function driver(path, { method = "GET", body } = {}) {
  const response = await fetch(`${DRIVER_URL}${path}`, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json();
  if (!response.ok || payload?.value?.error) throw new Error(payload?.value?.message || `WebDriver ${response.status}`);
  return payload.value;
}
async function execute(sessionId, script) {
  return driver(`/session/${sessionId}/execute/sync`, {
    method: "POST",
    body: { script, args: [] },
  });
}
async function keyPulse(sessionId) {
  await driver(`/session/${sessionId}/actions`, {
    method: "POST",
    body: {
      actions: [{
        type: "key",
        id: "keyboard",
        actions: [
          { type: "keyDown", value: "d" },
          { type: "pause", duration: 35 },
          { type: "keyUp", value: "d" },
        ],
      }],
    },
  });
}

let chromedriver = null;
let sessionId = null;
try {
  const chromedriverFromEnv = process.env.CHROMEWEBDRIVER
    ? join(process.env.CHROMEWEBDRIVER, process.platform === "win32" ? "chromedriver.exe" : "chromedriver")
    : null;
  const executable = findExecutable([chromedriverFromEnv, "chromedriver"]);
  if (!executable) throw new Error("ChromeDriver not found");
  chromedriver = start(executable, [`--port=${DRIVER_PORT}`, "--log-level=WARNING"]);
  await waitFor("ChromeDriver", async () => {
    const response = await fetch(`${DRIVER_URL}/status`);
    return response.ok && (await response.json())?.value?.ready === true;
  });

  const session = await driver("/session", {
    method: "POST",
    body: {
      capabilities: {
        alwaysMatch: {
          browserName: "chrome",
          "goog:chromeOptions": {
            args: ["--headless=new", "--no-sandbox", "--disable-dev-shm-usage", "--window-size=800,600"],
          },
        },
      },
    },
  });
  sessionId = session.sessionId;
  await driver(`/session/${sessionId}/url`, {
    method: "POST",
    body: { url: "data:text/html,<html><body tabindex='0'>A2R timestamp probe</body></html>" },
  });
  await execute(sessionId, `
    document.body.focus();
    window.__a2rStampEvents = [];
    window.__a2rBlock = null;
    for (const type of ['keydown', 'keyup']) {
      window.addEventListener(type, (event) => {
        const delivery = performance.now();
        window.__a2rStampEvents.push({
          type, code: event.code, key: event.key,
          timeStamp: event.timeStamp,
          delivery,
          deliveryLagMs: delivery - event.timeStamp,
        });
      });
    }
    return { timeOrigin: performance.timeOrigin, now: performance.now() };
  `);

  // Baseline: with an unblocked renderer, delivery - Event.timeStamp should be small.
  await keyPulse(sessionId);
  await sleep(80);
  const baseline = await execute(sessionId, `return window.__a2rStampEvents.splice(0);`);
  if (!Array.isArray(baseline) || baseline.length < 2) throw new Error(`baseline keyboard events missing: ${JSON.stringify(baseline)}`);

  const trials = [];
  for (let trial = 0; trial < 2; trial += 1) {
    await execute(sessionId, `
      window.__a2rStampEvents = [];
      window.__a2rBlock = null;
      setTimeout(() => {
        const start = performance.now();
        const targetEnd = start + 250;
        window.__a2rBlock = { start, targetEnd, end: null };
        while (performance.now() < targetEnd) {}
        window.__a2rBlock.end = performance.now();
      }, 100);
      return performance.now();
    `);
    // Send synthesized hardware input while the renderer is expected to be
    // inside the busy loop. If Chrome creates the event before JS dispatch,
    // Event.timeStamp should predate handler delivery by a substantial amount.
    await sleep(155);
    await keyPulse(sessionId);
    await sleep(100);
    const result = await execute(sessionId, `return { events: window.__a2rStampEvents, block: window.__a2rBlock };`);
    if (!result?.block?.end || !Array.isArray(result.events) || result.events.length < 2) {
      throw new Error(`blocked keyboard trial incomplete: ${JSON.stringify(result)}`);
    }
    trials.push(result);
  }

  const baselineMaxLag = Math.max(...baseline.map((event) => event.deliveryLagMs));
  const blockedLags = trials.flatMap((trial) => trial.events.map((event) => event.deliveryLagMs));
  const blockedMaxLag = Math.max(...blockedLags);
  const blockedMedianLag = [...blockedLags].sort((a, b) => a - b)[Math.floor(blockedLags.length / 2)];
  const preserved = blockedMaxLag >= 60 && blockedMedianLag >= 20;

  console.log(`A2R browser Event.timeStamp probe · baseline max handler lag ${baselineMaxLag.toFixed(1)} ms · blocked median/max ${blockedMedianLag.toFixed(1)}/${blockedMaxLag.toFixed(1)} ms · preserves pre-dispatch timing=${preserved}`);
  for (let index = 0; index < trials.length; index += 1) {
    const trial = trials[index];
    console.log(`  trial ${index + 1} block ${trial.block.start.toFixed(1)}→${trial.block.end.toFixed(1)} ms · events ${JSON.stringify(trial.events)}`);
  }
} finally {
  if (sessionId) await driver(`/session/${sessionId}`, { method: "DELETE" }).catch(() => {});
  await stop(chromedriver);
}
