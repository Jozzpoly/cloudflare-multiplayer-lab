import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const BASE = (process.env.MW_WORLD_V0_CAPACITY_BASE_URL || "http://127.0.0.1:8787").replace(/\/$/, "");
const PAGE_URL = `${BASE}/world-v0-capacity/`;
const DEBUG_PORT = Number(process.env.MW_WORLD_V0_CAPACITY_DEBUG_PORT || 9444);
const TIMEOUT_MS = Number(process.env.MW_WORLD_V0_CAPACITY_TIMEOUT_MS || 180_000);
const OUTPUT = process.env.MW_WORLD_V0_CAPACITY_OUTPUT || "world-v0-capacity-cartography-evidence.json";
const counts = (process.env.MW_WORLD_V0_CAPACITY_COUNTS || "16,32,64,128").split(",").map(Number).filter((value) => Number.isInteger(value) && value > 0);
const ticks = Number(process.env.MW_WORLD_V0_CAPACITY_TICKS || 180);
const repeats = Number(process.env.MW_WORLD_V0_CAPACITY_REPEATS || 1);

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function assert(condition, message) { if (!condition) throw new Error(message); }

function findChrome() {
  const override = process.env.CHROME_BIN?.trim();
  if (override) return override;
  const probe = spawnSync("bash", ["-lc", "command -v google-chrome || command -v google-chrome-stable || command -v chromium || command -v chromium-browser"], { encoding: "utf8" });
  const binary = probe.stdout.trim().split("\n")[0];
  if (!binary) throw new Error(`Chrome/Chromium binary not found: ${probe.stderr || "no candidate on PATH"}`);
  return binary;
}

async function waitForDebugger() {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < 20_000) {
    try {
      const response = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`, { signal: AbortSignal.timeout(1500) });
      if (response.ok) {
        const value = await response.json();
        if (value.webSocketDebuggerUrl) return value;
      }
      last = `HTTP ${response.status}`;
    } catch (error) { last = error instanceof Error ? error.message : String(error); }
    await sleep(100);
  }
  throw new Error(`Chrome DevTools endpoint unavailable: ${last}`);
}

class Cdp {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.nextId = 1;
    this.pending = new Map();
    this.events = [];
    this.opened = new Promise((resolve, reject) => {
      this.ws.addEventListener("open", resolve, { once: true });
      this.ws.addEventListener("error", () => reject(new Error("CDP WebSocket open failed")), { once: true });
    });
    this.ws.addEventListener("message", async (event) => {
      const raw = typeof event.data === "string" ? event.data : await event.data.text();
      const message = JSON.parse(raw);
      if (!message.id) { this.events.push(message); return; }
      const waiter = this.pending.get(message.id);
      if (!waiter) return;
      this.pending.delete(message.id);
      if (message.error) waiter.reject(new Error(`CDP ${waiter.method}: ${message.error.message}`));
      else waiter.resolve(message.result || {});
    });
  }
  async call(method, params = {}, sessionId = undefined) {
    await this.opened;
    const id = this.nextId++;
    return await new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, method });
      const message = { id, method, params };
      if (sessionId) message.sessionId = sessionId;
      this.ws.send(JSON.stringify(message));
    });
  }
  async evaluate(sessionId, expression, awaitPromise = true) {
    const result = await this.call("Runtime.evaluate", { expression, awaitPromise, returnByValue: true, userGesture: true }, sessionId);
    if (result.exceptionDetails) throw new Error(`Browser evaluation failed: ${result.exceptionDetails.text || "unknown exception"}`);
    return result.result?.value;
  }
  close() { try { this.ws.close(); } catch { /* best effort */ } }
}

const chrome = findChrome();
const profile = mkdtempSync(join(tmpdir(), "mw-world-v0-capacity-"));
const stderr = [];
const child = spawn(chrome, [
  "--headless=new", "--no-sandbox", "--disable-dev-shm-usage",
  "--disable-background-networking", "--disable-background-timer-throttling",
  "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding",
  "--enable-unsafe-swiftshader",
  `--remote-debugging-port=${DEBUG_PORT}`, "--remote-debugging-address=127.0.0.1",
  `--user-data-dir=${profile}`, "about:blank",
], { stdio: ["ignore", "ignore", "pipe"] });
child.stderr.on("data", (chunk) => stderr.push(chunk));

let cdp = null;
const evidence = {
  verdict: "WORLD_V0_CAPACITY_APPARATUS_FAIL",
  generatedAt: new Date().toISOString(),
  page: PAGE_URL,
  requested: { counts, ticks, repeats },
};

try {
  const debuggerInfo = await waitForDebugger();
  cdp = new Cdp(debuggerInfo.webSocketDebuggerUrl);
  await cdp.opened;
  const { targetId } = await cdp.call("Target.createTarget", { url: PAGE_URL });
  const { sessionId } = await cdp.call("Target.attachToTarget", { targetId, flatten: true });
  await cdp.call("Runtime.enable", {}, sessionId);
  await cdp.call("Page.enable", {}, sessionId);

  const started = Date.now();
  while (Date.now() - started < 30_000) {
    const ready = await cdp.evaluate(sessionId, "window.__mwCapacity?.ready === true").catch(() => false);
    if (ready) break;
    await sleep(150);
  }
  assert(await cdp.evaluate(sessionId, "window.__mwCapacity?.ready === true"), "capacity lab did not become ready");

  const runExpression = `window.__mwCapacity.runSuite(${JSON.stringify({ counts, ticks, repeats })})`;
  const runPromise = cdp.evaluate(sessionId, runExpression, true);
  const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error(`capacity suite timeout after ${TIMEOUT_MS} ms`)), TIMEOUT_MS));
  const result = await Promise.race([runPromise, timeoutPromise]);
  assert(result?.verdict === "WORLD_V0_CAPACITY_CARTOGRAPHY_COMPLETE", `unexpected cartography verdict ${result?.verdict}`);
  assert(Array.isArray(result.results) && result.results.length > 0, "capacity suite returned no cells");

  evidence.verdict = "WORLD_V0_CAPACITY_APPARATUS_PASS";
  evidence.result = result;
  writeFileSync(OUTPUT, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(`${evidence.verdict} · cells=${result.results.length} · firstBroken=${JSON.stringify(result.firstBroken)}`);
} catch (error) {
  evidence.error = error instanceof Error ? error.stack || error.message : String(error);
  evidence.stderrTail = Buffer.concat(stderr).toString("utf8").slice(-8000);
  writeFileSync(OUTPUT, `${JSON.stringify(evidence, null, 2)}\n`);
  throw error;
} finally {
  cdp?.close();
  if (child.exitCode === null) child.kill("SIGKILL");
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* cleanup only */ }
}
