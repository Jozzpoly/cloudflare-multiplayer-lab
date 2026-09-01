import { existsSync } from "node:fs";
import { join } from "node:path";
import { spawn, spawnSync } from "node:child_process";

const HOST = "127.0.0.1";
const WORKER_PORT = 8787;
const DRIVER_PORT = 9515;
const BASE_URL = `http://${HOST}:${WORKER_PORT}`;
const DRIVER_URL = `http://${HOST}:${DRIVER_PORT}`;

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
  await Promise.race([new Promise((resolve) => child.once("exit", resolve)), sleep(1500)]);
  if (child.exitCode === null) {
    try {
      if (process.platform === "win32") child.kill("SIGKILL");
      else process.kill(-child.pid, "SIGKILL");
    } catch { /* teardown only */ }
  }
}

async function waitFor(label, fn, timeoutMs = 25_000) {
  const started = Date.now();
  let lastError = null;
  while (Date.now() - started < timeoutMs) {
    try {
      const value = await fn();
      if (value) return value;
    } catch (error) { lastError = error; }
    await sleep(200);
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
  const payload = await response.json();
  if (!response.ok || payload?.value?.error) throw new Error(payload?.value?.message || `WebDriver ${response.status}`);
  return payload.value;
}

async function state(sessionId) {
  return driver(`/session/${sessionId}/execute/sync`, {
    method: "POST",
    body: {
      script: `
        const text = (selector) => document.querySelector(selector)?.textContent?.trim() ?? null;
        return {
          net: text('#net'), local: text('#m-local'), ack: text('#m-ack'),
          playerDelta: text('#m-player-delta'), propDelta: text('#m-prop-delta'),
          phase: text('#m-phase'), notice: text('#notice'),
          bootStatus: text('#boot-status'), enterDisabled: document.querySelector('#enter')?.disabled ?? null,
        };
      `,
      args: [],
    },
  });
}

function parsePair(text) {
  const match = /([0-9.]+)\s*\/\s*([0-9.]+)/.exec(text || "");
  return match ? [Number(match[1]), Number(match[2])] : null;
}

let wrangler = null;
let chromedriver = null;
let sessionId = null;
try {
  const npx = process.platform === "win32" ? "npx.cmd" : "npx";
  wrangler = start(npx, ["wrangler", "dev", "--env", "staging", "--ip", HOST, "--port", String(WORKER_PORT)]);
  await waitFor("Wrangler", async () => {
    const response = await fetch(`${BASE_URL}/api/ping`);
    return response.ok && (await response.json())?.ok === true;
  });

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
    body: { capabilities: { alwaysMatch: { browserName: "chrome", "goog:chromeOptions": { args: [
      "--headless=new", "--no-sandbox", "--disable-dev-shm-usage", "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding", "--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--window-size=1280,720",
    ] } } } },
  });
  sessionId = session.sessionId;
  await driver(`/session/${sessionId}/url`, { method: "POST", body: { url: `${BASE_URL}/world0-a2r/` } });
  await waitFor("A2R bootstrap", async () => {
    const s = await state(sessionId);
    return s.bootStatus?.includes("box3d.js 0.1.1 inline ready") && s.enterDisabled === false;
  });
  await driver(`/session/${sessionId}/execute/sync`, { method: "POST", body: { script: `document.querySelector('#enter').click(); return true;`, args: [] } });

  const baseline = await waitFor("A2R live baseline", async () => {
    const s = await state(sessionId);
    const local = /^(\d+) steps · (\d+) dropped$/.exec(s.local || "");
    return s.net === "live · local physics" && local && Number(local[1]) >= 30 && Number(local[2]) === 0 ? s : false;
  });
  const baselineProp = parsePair(baseline.propDelta) || [0, 0];

  await driver(`/session/${sessionId}/actions`, {
    method: "POST",
    body: { actions: [{ type: "key", id: "keyboard", actions: [
      { type: "keyDown", value: "d" },
      { type: "pause", duration: 2200 },
      { type: "keyUp", value: "d" },
      { type: "pause", duration: 1200 },
    ] }] },
  });

  const exercised = await waitFor("A2R browser contact proxy", async () => {
    const s = await state(sessionId);
    const local = /^(\d+) steps · (\d+) dropped$/.exec(s.local || "");
    const ack = /^(\d+) \/ (\d+)$/.exec(s.ack || "");
    const prop = parsePair(s.propDelta);
    if (!local || !ack || !prop || s.net !== "live · local physics") return false;
    if (Number(local[1]) < 150 || Number(local[2]) !== 0) return false;
    if (Number(ack[1]) <= 0 || Number(ack[2]) <= 0) return false;
    if (prop[1] <= baselineProp[1] + 0.02) return false;
    return s;
  }, 20_000);

  console.log(`A2R browser contact proxy PASS · baseline prop Δ ${baseline.propDelta} → exercised ${exercised.propDelta} · player Δ ${exercised.playerDelta} · ${exercised.local} · ack ${exercised.ack} · phase ${exercised.phase}`);
} finally {
  if (sessionId) await driver(`/session/${sessionId}`, { method: "DELETE" }).catch(() => {});
  await stop(chromedriver);
  await stop(wrangler);
}
