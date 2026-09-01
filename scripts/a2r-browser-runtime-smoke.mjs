import { existsSync } from "node:fs";
import { join } from "node:path";
import { spawn, spawnSync } from "node:child_process";

const HOST = "127.0.0.1";
const WORKER_PORT = 8787;
const DRIVER_PORT = 9515;
const BASE_URL = `http://${HOST}:${WORKER_PORT}`;
const DRIVER_URL = `http://${HOST}:${DRIVER_PORT}`;
const PROCESS_LOG_LIMIT = 160;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function appendLog(target, chunk) {
  const lines = String(chunk).split(/\r?\n/).filter(Boolean);
  target.push(...lines);
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
    try { proc.child.kill("SIGTERM"); } catch { /* already gone */ }
  }
  await Promise.race([
    new Promise((resolve) => proc.child.once("exit", resolve)),
    sleep(2000),
  ]);
  if (proc.child.exitCode === null) {
    try {
      if (process.platform === "win32") proc.child.kill("SIGKILL");
      else process.kill(-proc.child.pid, "SIGKILL");
    } catch {
      try { proc.child.kill("SIGKILL"); } catch { /* already gone */ }
    }
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
  const suffix = lastError ? ` · last error: ${lastError instanceof Error ? lastError.message : String(lastError)}` : "";
  throw new Error(`${label} timed out after ${timeoutMs} ms${suffix}`);
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

async function driverRequest(path, { method = "GET", body } = {}) {
  const response = await fetch(`${DRIVER_URL}${path}`, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({ value: { error: "invalid_response", message: `HTTP ${response.status}` } }));
  if (!response.ok || payload?.value?.error) {
    const message = payload?.value?.message || payload?.value?.error || `HTTP ${response.status}`;
    throw new Error(`WebDriver ${method} ${path}: ${message}`);
  }
  return payload.value;
}

async function browserState(sessionId) {
  return driverRequest(`/session/${sessionId}/execute/sync`, {
    method: "POST",
    body: {
      script: `
        const text = (selector) => document.querySelector(selector)?.textContent?.trim() ?? null;
        return {
          title: document.title,
          bootStatus: text('#boot-status'),
          enterDisabled: document.querySelector('#enter')?.disabled ?? null,
          enterText: text('#enter'),
          net: text('#net'),
          local: text('#m-local'),
          ack: text('#m-ack'),
          playerDelta: text('#m-player-delta'),
          propDelta: text('#m-prop-delta'),
          phase: text('#m-phase'),
          notice: text('#notice'),
          noticeHidden: document.querySelector('#notice')?.classList.contains('hidden') ?? null,
        };
      `,
      args: [],
    },
  });
}

let wrangler = null;
let chromedriver = null;
let sessionId = null;

try {
  const npx = process.platform === "win32" ? "npx.cmd" : "npx";
  wrangler = startManaged(
    npx,
    ["wrangler", "dev", "--env", "staging", "--ip", HOST, "--port", String(WORKER_PORT)],
    "wrangler",
  );

  await waitFor("local Wrangler /api/ping", async () => {
    const response = await fetch(`${BASE_URL}/api/ping`);
    if (!response.ok) return false;
    const json = await response.json();
    return json?.ok === true;
  });

  for (const path of ["/world0-a2r/", "/world0-a2r/app.js", "/world0-a2r/fixed-step-clock.js"]) {
    const response = await fetch(`${BASE_URL}${path}`);
    if (!response.ok) throw new Error(`A2R asset ${path} returned ${response.status}`);
  }

  const chromedriverFromEnv = process.env.CHROMEWEBDRIVER
    ? join(process.env.CHROMEWEBDRIVER, process.platform === "win32" ? "chromedriver.exe" : "chromedriver")
    : null;
  const driverExecutable = findExecutable([chromedriverFromEnv, "chromedriver"]);
  if (!driverExecutable) throw new Error("ChromeDriver executable not found on runner");

  chromedriver = startManaged(driverExecutable, [`--port=${DRIVER_PORT}`, "--log-level=WARNING"], "chromedriver");
  await waitFor("ChromeDriver", async () => {
    const response = await fetch(`${DRIVER_URL}/status`);
    if (!response.ok) return false;
    const json = await response.json();
    return json?.value?.ready === true;
  });

  const session = await driverRequest("/session", {
    method: "POST",
    body: {
      capabilities: {
        alwaysMatch: {
          browserName: "chrome",
          "goog:chromeOptions": {
            args: [
              "--headless=new",
              "--no-sandbox",
              "--disable-dev-shm-usage",
              "--disable-background-timer-throttling",
              "--disable-renderer-backgrounding",
              "--enable-unsafe-swiftshader",
              "--use-angle=swiftshader",
              "--window-size=1280,720",
            ],
          },
        },
      },
    },
  });
  sessionId = session.sessionId;
  if (!sessionId) throw new Error("ChromeDriver did not return a session id");

  await driverRequest(`/session/${sessionId}/url`, {
    method: "POST",
    body: { url: `${BASE_URL}/world0-a2r/` },
  });

  const booted = await waitFor("A2R browser bootstrap", async () => {
    const state = await browserState(sessionId);
    if (state?.bootStatus?.includes("box3d.js 0.1.1 inline ready") && state.enterDisabled === false) return state;
    return false;
  }, 25_000);

  await driverRequest(`/session/${sessionId}/execute/sync`, {
    method: "POST",
    body: {
      script: `document.querySelector('#enter').click(); return true;`,
      args: [],
    },
  });

  const live = await waitFor("A2R local WebSocket + physics startup", async () => {
    const state = await browserState(sessionId);
    const match = /^(\d+) steps · (\d+) dropped$/.exec(state?.local || "");
    if (state?.net === "live · local physics" && match && Number(match[1]) >= 30) return state;
    return false;
  }, 20_000);

  await driverRequest(`/session/${sessionId}/actions`, {
    method: "POST",
    body: {
      actions: [{
        type: "key",
        id: "keyboard",
        actions: [
          { type: "keyDown", value: "d" },
          { type: "pause", duration: 900 },
          { type: "keyUp", value: "d" },
          { type: "pause", duration: 900 },
        ],
      }],
    },
  });

  const exercised = await waitFor("A2R exercised browser state", async () => {
    const state = await browserState(sessionId);
    const localMatch = /^(\d+) steps · (\d+) dropped$/.exec(state?.local || "");
    const ackMatch = /^(\d+) \/ (\d+)$/.exec(state?.ack || "");
    if (!localMatch || !ackMatch) return false;
    if (state.net !== "live · local physics") return false;
    if (Number(localMatch[1]) < 90 || Number(localMatch[2]) !== 0) return false;
    if (Number(ackMatch[1]) <= 0 || Number(ackMatch[2]) <= 0) return false;
    if (!state.playerDelta || state.playerDelta === "—") return false;
    return state;
  }, 15_000);

  console.log(
    `A2R browser runtime smoke PASS · ${booted.bootStatus} · ${live.net} · ${exercised.local} · ack ${exercised.ack} · raw player Δ ${exercised.playerDelta} · phase ${exercised.phase}`,
  );
} catch (error) {
  if (wrangler?.logs?.length) console.error(`\n--- wrangler tail ---\n${wrangler.logs.join("\n")}`);
  if (chromedriver?.logs?.length) console.error(`\n--- chromedriver tail ---\n${chromedriver.logs.join("\n")}`);
  throw error;
} finally {
  if (sessionId) {
    await driverRequest(`/session/${sessionId}`, { method: "DELETE" }).catch(() => {});
  }
  await stopManaged(chromedriver);
  await stopManaged(wrangler);
}
