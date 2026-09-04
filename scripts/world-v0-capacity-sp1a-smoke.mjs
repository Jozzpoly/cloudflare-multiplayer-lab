import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const BASE = (process.env.MW_WORLD_V0_CAPACITY_BASE_URL || "http://127.0.0.1:8787").replace(/\/$/, "");
const PAGE_URL = `${BASE}/world-v0-capacity-cc11/`;
const OUTPUT = process.env.MW_WORLD_V0_CAPACITY_SP1A_OUTPUT || "world-v0-capacity-sp1a-evidence.json";
const DEBUG_PORT = Number(process.env.MW_WORLD_V0_CAPACITY_DEBUG_PORT || 9442);
const TIMEOUT_MS = Number(process.env.MW_WORLD_V0_CAPACITY_TIMEOUT_MS || 180_000);
const REALTIME_BUDGET_MS = 1000 / 60;

function parseCounts(raw, fallback) {
  const values = String(raw || "").split(",").map((value) => Number(value.trim())).filter((value) => Number.isInteger(value) && value > 0);
  return values.length ? values : fallback;
}

function parseScenarios(raw, fallback) {
  const values = String(raw || "").split(",").map((value) => value.trim()).filter(Boolean);
  return values.length ? values : fallback;
}

const options = {
  counts: parseCounts(process.env.MW_WORLD_V0_CAPACITY_COUNTS, [640]),
  ticks: Number(process.env.MW_WORLD_V0_CAPACITY_TICKS || 144),
  scenarios: parseScenarios(process.env.MW_WORLD_V0_CAPACITY_SCENARIOS, ["hetero-pile", "ram-chain", "wake-churn"]),
  histories: [true],
  repeats: Math.max(2, Number(process.env.MW_WORLD_V0_CAPACITY_REPEATS || 2)),
  stopAfterFirstBroken: false,
};

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

function chromeVersion(binary) {
  const result = spawnSync(binary, ["--version"], { encoding: "utf8" });
  return (result.stdout || result.stderr || "unknown").trim();
}

async function waitForDebugger() {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < 30_000) {
    try {
      const response = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`, { signal: AbortSignal.timeout(1500) });
      if (response.ok) {
        const value = await response.json();
        if (value.webSocketDebuggerUrl) return value;
      }
      last = `HTTP ${response.status}`;
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    await sleep(100);
  }
  throw new Error(`Chrome DevTools endpoint unavailable: ${last}`);
}

class Cdp {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.nextId = 1;
    this.pending = new Map();
    this.opened = new Promise((resolve, reject) => {
      this.ws.addEventListener("open", resolve, { once: true });
      this.ws.addEventListener("error", () => reject(new Error("CDP WebSocket open failed")), { once: true });
    });
    this.ws.addEventListener("message", async (event) => {
      const raw = typeof event.data === "string" ? event.data : await event.data.text();
      const message = JSON.parse(raw);
      if (!message.id) return;
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

  async evaluate(sessionId, expression) {
    const result = await this.call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, sessionId);
    if (result.exceptionDetails) {
      const detail = result.exceptionDetails.exception?.description || result.exceptionDetails.text || "unknown exception";
      throw new Error(`Browser evaluation failed: ${detail}`);
    }
    return result.result?.value;
  }

  close() {
    for (const waiter of this.pending.values()) waiter.reject(new Error("CDP closed"));
    this.pending.clear();
    try { this.ws.close(); } catch { /* best effort */ }
  }
}

async function waitFor(cdp, sessionId, expression, label, timeoutMs = 60_000) {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < timeoutMs) {
    try {
      last = await cdp.evaluate(sessionId, expression);
      if (last === true) return;
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    await sleep(150);
  }
  throw new Error(`${label} timeout · last=${JSON.stringify(last)}`);
}

function correctedRunClassification(run) {
  if (run.failure) {
    if (/replay_|replay:|diverged|seek_mismatch|state_hash_mismatch/.test(run.failure)) return "replay-exactness";
    return `runtime:${run.failure}`;
  }
  if (!run.finite) return "non-finite";
  if (run.physicsStepMs?.p95 >= REALTIME_BUDGET_MS) return "physics-step-budget";
  if (run.managedTickMs?.p95 >= REALTIME_BUDGET_MS) return "managed-tick-budget";
  return "within-lab-envelope";
}

function correctEvidence(source) {
  const corrected = structuredClone(source);
  for (const cell of corrected.cells || []) {
    for (const run of cell.repeats || []) {
      run.sourceClassification = run.classification;
      run.classification = correctedRunClassification(run);
      if (run.historyMetrics) {
        run.historyMetrics.recordingInitialCapacityBytes = run.historyMetrics.recordingCapacityBytes;
        run.historyMetrics.maxInitialCapacityRatio = run.historyMetrics.maxSegmentCapacityRatio;
        delete run.historyMetrics.recordingCapacityBytes;
        delete run.historyMetrics.maxSegmentCapacityRatio;
      }
    }
    const badRun = (cell.repeats || []).find((run) => run.classification !== "within-lab-envelope");
    if (badRun) {
      cell.determinismStatus = "not-evaluable-after-run-failure";
      cell.classification = badRun.classification;
      continue;
    }
    const hashes = (cell.repeats || []).map((run) => run.finalHash);
    const deterministic = hashes.length >= 2 && hashes.every((hash) => hash != null && hash === hashes[0]);
    cell.deterministic = deterministic;
    cell.determinismStatus = deterministic ? "pass" : "fail";
    cell.classification = deterministic ? "within-lab-envelope" : "determinism";
  }

  const boundaries = {};
  for (const historyEnabled of corrected.options?.histories || [true]) {
    for (const scenario of corrected.options?.scenarios || []) {
      const key = `${scenario}:${historyEnabled ? "history" : "raw"}`;
      const ordered = (corrected.cells || [])
        .filter((cell) => cell.scenario === scenario && cell.history === historyEnabled)
        .sort((a, b) => a.count - b.count);
      const firstBroken = ordered.find((cell) => cell.classification !== "within-lab-envelope") ?? null;
      const good = ordered.filter((cell) => cell.classification === "within-lab-envelope");
      const lastKnownGood = good.length ? good[good.length - 1] : null;
      boundaries[key] = {
        lastKnownGood: lastKnownGood ? { count: lastKnownGood.count, classification: lastKnownGood.classification } : null,
        firstBroken: firstBroken ? { count: firstBroken.count, classification: firstBroken.classification } : null,
      };
    }
  }
  corrected.boundaries = boundaries;
  corrected.historyContract = {
    ...corrected.historyContract,
    recordingInitialCapacityBytes: corrected.historyContract?.recordingCapacityBytes,
    recordingBufferSemantics: "initial preallocation; grows on demand",
  };
  delete corrected.historyContract.recordingCapacityBytes;
  corrected.semanticCorrection = {
    revision: "sp1a-recording-preallocation-v1",
    sourceLabRevision: source.labRevision,
    rule: "recording size crossing the initial allocation is observation, not failure",
  };
  return corrected;
}

async function waitForChildExit(child, timeoutMs = 3000) {
  if (child.exitCode !== null) return;
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    sleep(timeoutMs),
  ]);
  if (child.exitCode === null) child.kill("SIGKILL");
}

const chrome = findChrome();
const version = chromeVersion(chrome);
const profile = mkdtempSync(join(tmpdir(), "mw-world-v0-sp1a-"));
const stderr = [];
const child = spawn(chrome, [
  "--headless=new",
  "--no-sandbox",
  "--disable-dev-shm-usage",
  "--disable-background-networking",
  "--disable-background-timer-throttling",
  "--disable-backgrounding-occluded-windows",
  "--disable-renderer-backgrounding",
  "--disable-gpu",
  `--remote-debugging-port=${DEBUG_PORT}`,
  "--remote-debugging-address=127.0.0.1",
  `--user-data-dir=${profile}`,
  "about:blank",
], { stdio: ["ignore", "ignore", "pipe"] });
child.stderr.on("data", (chunk) => stderr.push(chunk));

let cdp = null;
let timeoutHandle = null;
const envelope = {
  verdict: "WORLD_V0_CAPACITY_SP1A_FAIL",
  generatedAt: new Date().toISOString(),
  page: PAGE_URL,
  chromeVersion: version,
  options,
};

try {
  const debuggerInfo = await waitForDebugger();
  cdp = new Cdp(debuggerInfo.webSocketDebuggerUrl);
  await cdp.opened;
  const { targetId } = await cdp.call("Target.createTarget", { url: PAGE_URL });
  const { sessionId } = await cdp.call("Target.attachToTarget", { targetId, flatten: true });
  await cdp.call("Runtime.enable", {}, sessionId);
  await cdp.call("Page.enable", {}, sessionId);

  await waitFor(
    cdp,
    sessionId,
    `document.readyState === "complete" && !!window.__worldV0CapacityCC11 && (window.__worldV0CapacityCC11.ready === true || !!window.__worldV0CapacityCC11.bootError)`,
    "SP1A source lab boot",
  );

  const boot = await cdp.evaluate(sessionId, `({
    title: document.title,
    ready: window.__worldV0CapacityCC11?.ready,
    bootError: window.__worldV0CapacityCC11?.bootError,
    revision: window.__worldV0CapacityCC11?.revision,
  })`);
  assert(boot.ready === true, `SP1A source lab boot failed: ${boot.bootError || "unknown"}`);

  const expression = `window.__worldV0CapacityCC11.runSuite(${JSON.stringify(options)})`;
  const started = Date.now();
  const timeoutPromise = new Promise((_, reject) => {
    timeoutHandle = setTimeout(() => reject(new Error(`SP1A exceeded ${TIMEOUT_MS} ms harness timeout`)), TIMEOUT_MS);
  });
  const sourceEvidence = await Promise.race([cdp.evaluate(sessionId, expression), timeoutPromise]);
  clearTimeout(timeoutHandle);
  timeoutHandle = null;
  assert(sourceEvidence?.verdict === "WORLD_V0_CAPACITY_CC11_COMPLETE", `unexpected source verdict ${sourceEvidence?.verdict}`);

  const corrected = correctEvidence(sourceEvidence);
  const runs = (corrected.cells || []).flatMap((cell) => cell.repeats || []);
  const crossed = runs.filter((run) => (run.historyMetrics?.maxInitialCapacityRatio || 0) > 1);
  assert(crossed.length > 0, "SP1A calibration did not cross the initial recording allocation");
  assert(crossed.every((run) => run.historyMetrics.replayFailures === 0), "recording growth crossed initial allocation with replay failure");
  assert((corrected.cells || []).every((cell) => cell.determinismStatus === "pass"), "SP1A deterministic repeats did not all pass");
  assert((corrected.cells || []).every((cell) => cell.classification === "within-lab-envelope"), "SP1A corrected classification still reports a real failure");

  envelope.verdict = "WORLD_V0_CAPACITY_SP1A_PASS";
  envelope.boot = boot;
  envelope.elapsedMs = Date.now() - started;
  envelope.crossedInitialAllocationRuns = crossed.map((run) => ({
    scenario: run.scenario,
    count: run.count,
    maxSegmentBytes: run.historyMetrics.maxSegmentBytes,
    initialCapacityBytes: run.historyMetrics.recordingInitialCapacityBytes,
    ratio: run.historyMetrics.maxInitialCapacityRatio,
    replayFailures: run.historyMetrics.replayFailures,
    correctedClassification: run.classification,
    sourceClassification: run.sourceClassification,
  }));
  envelope.evidence = corrected;
  writeFileSync(OUTPUT, `${JSON.stringify(envelope, null, 2)}\n`);
  console.log(`${envelope.verdict} · ${version} · elapsed=${envelope.elapsedMs}ms · crossings=${crossed.length}`);
} catch (error) {
  if (timeoutHandle) clearTimeout(timeoutHandle);
  envelope.error = error instanceof Error ? error.stack || error.message : String(error);
  envelope.stderrTail = Buffer.concat(stderr).toString("utf8").slice(-12000);
  writeFileSync(OUTPUT, `${JSON.stringify(envelope, null, 2)}\n`);
  throw error;
} finally {
  if (timeoutHandle) clearTimeout(timeoutHandle);
  cdp?.close();
  if (child.exitCode === null) child.kill("SIGTERM");
  await waitForChildExit(child);
  child.stderr?.destroy();
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* cleanup */ }
}
