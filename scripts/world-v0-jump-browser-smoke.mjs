import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  WORLD_V0_BROWSER_UI_REVISION,
  WORLD_V0_EXPECTED_SIM_BUILD_ID,
} from "../public/world-v0/build-contract.js";

const BASE = (process.env.MW_WORLD_V0_JUMP_BROWSER_BASE_URL || "http://127.0.0.1:8787").replace(/\/$/, "");
const PAGE_URL = `${BASE}/world-v0/`;
const OUTPUT = process.env.MW_WORLD_V0_JUMP_BROWSER_OUTPUT || "world-v0-jump-browser-evidence.json";
const DEBUG_PORT = 9572;
const TIMEOUT_MS = 50_000;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function findChrome() {
  const override = process.env.CHROME_BIN?.trim();
  if (override) return override;
  const probe = spawnSync("bash", ["-lc", "command -v google-chrome || command -v google-chrome-stable || command -v chromium || command -v chromium-browser"], { encoding: "utf8" });
  const binary = probe.stdout.trim().split("\n")[0];
  if (!binary) throw new Error(`Chrome/Chromium binary not found: ${probe.stderr || "no candidate"}`);
  return binary;
}

class Cdp {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.nextId = 1;
    this.pending = new Map();
    this.opened = new Promise((resolve, reject) => {
      this.ws.addEventListener("open", resolve, { once: true });
      this.ws.addEventListener("error", () => reject(new Error("CDP open failed")), { once: true });
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
      const payload = { id, method, params };
      if (sessionId) payload.sessionId = sessionId;
      this.ws.send(JSON.stringify(payload));
    });
  }
  async evaluate(sessionId, expression) {
    const result = await this.call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, userGesture: true }, sessionId);
    if (result.exceptionDetails) throw new Error(`Browser evaluate failed: ${result.exceptionDetails.text || "unknown"}`);
    return result.result?.value;
  }
  close() { try { this.ws.close(); } catch { /* cleanup */ } }
}

async function waitForDebugger() {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < TIMEOUT_MS) {
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
  throw new Error(`Chrome debugger unavailable: ${last}`);
}

async function waitFor(cdp, sessionId, expression, label, timeoutMs = TIMEOUT_MS) {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < timeoutMs) {
    try {
      last = await cdp.evaluate(sessionId, expression);
      if (last) return last;
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    await sleep(80);
  }
  throw new Error(`${label} timeout · last=${JSON.stringify(last)}`);
}

async function waitForReadyState(cdp, sessionId, expression, label, timeoutMs = TIMEOUT_MS) {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < timeoutMs) {
    try {
      last = await cdp.evaluate(sessionId, expression);
      if (last?.ready === true) return last;
    } catch (error) {
      last = { evaluationError: error instanceof Error ? error.message : String(error) };
    }
    await sleep(100);
  }
  const error = new Error(`${label} timeout · state=${JSON.stringify(last)}`);
  error.lastState = last;
  throw error;
}

const runwayStateExpression = `(() => {
  const e = window.__sharedYardV0Evidence?.();
  const i = window.__sharedYardV0Inspection?.();
  const c = i?.companion;
  const state = {
    networkState: e?.networkState ?? null,
    runtimeFailed: e?.runtimeFailed ?? null,
    runtimeFailureReason: e?.runtimeFailureReason ?? null,
    localBoundaryTick: e?.localBoundaryTick ?? null,
    protocolStartTick: e?.protocolStartTick ?? null,
    jump: e?.jump ? { ...e.jump } : null,
    guards: e?.metrics ? {
      matches: e.metrics.guardMatches,
      mismatches: e.metrics.guardMismatches,
      pending: e.metrics.guardPending,
      firstStateMismatch: e.metrics.firstStateMismatch,
      corrections: e.metrics.corrections,
      serverLate: e.metrics.serverLate,
      serverRejected: e.metrics.serverRejected,
    } : null,
    inspection: i ? {
      mode: i.mode,
      qualificationEligible: i.qualificationEligible,
      companion: c ? {
        state: c.state,
        slot: c.slot,
        acceptedRecords: c.acceptedRecords,
        rejectedRecords: c.rejectedRecords,
        consumedFresh: c.consumedFresh,
        consumedHeld: c.consumedHeld,
        leaseExpiredSeen: c.leaseExpiredSeen,
        failureReason: c.failureReason,
        lastBoundaryTick: c.lastBoundaryTick,
      } : null,
    } : null,
    visibility: document.visibilityState,
    jumpButtonDisabled: document.querySelector("#jump-button")?.disabled ?? null,
  };
  state.ready = Boolean(
    state.networkState?.startsWith("live") &&
    state.runtimeFailed === false &&
    state.jump?.buttonEnabled === true &&
    state.guards?.matches >= 8 &&
    state.guards?.mismatches === 0 &&
    state.inspection?.mode === "inspection" &&
    state.inspection?.companion?.state === "live"
  );
  return state;
})()`;

async function pressSpace(cdp, sessionId) {
  await cdp.call("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: " ",
    code: "Space",
    windowsVirtualKeyCode: 32,
    nativeVirtualKeyCode: 32,
  }, sessionId);
  await cdp.call("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: " ",
    code: "Space",
    windowsVirtualKeyCode: 32,
    nativeVirtualKeyCode: 32,
  }, sessionId);
}

const chrome = findChrome();
const profile = mkdtempSync(join(tmpdir(), "mw-jump-browser-"));
const child = spawn(chrome, [
  "--headless=new",
  "--no-sandbox",
  "--disable-dev-shm-usage",
  "--disable-background-networking",
  "--disable-background-timer-throttling",
  "--disable-backgrounding-occluded-windows",
  "--disable-renderer-backgrounding",
  "--use-gl=angle",
  "--use-angle=swiftshader-webgl",
  "--enable-unsafe-swiftshader",
  `--remote-debugging-port=${DEBUG_PORT}`,
  "--remote-debugging-address=127.0.0.1",
  `--user-data-dir=${profile}`,
  "about:blank",
], { stdio: ["ignore", "ignore", "pipe"] });
const stderr = [];
child.stderr.on("data", (chunk) => stderr.push(chunk));

let cdp = null;
const result = {
  verdict: "WORLD_V0_JUMP_BROWSER_FAIL",
  generatedAt: new Date().toISOString(),
  page: PAGE_URL,
  stages: {},
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
    `document.readyState === "complete" && document.querySelector("#inspect-solo")?.disabled === false && typeof window.__sharedYardV0Inspection === "function"`,
    "jump browser boot",
  );
  result.stages.boot = { ready: true };

  const run = `jb-${Date.now().toString(36).slice(-8)}`;
  await cdp.evaluate(sessionId, `(() => {
    document.querySelector("#callsign").value = "jump-browser";
    document.querySelector("#run").value = ${JSON.stringify(run)};
    document.querySelector("#inspect-solo").click();
    return true;
  })()`);

  const runway = await waitForReadyState(cdp, sessionId, runwayStateExpression, "jump exact-state runway", 20_000);
  result.stages.runway = runway;

  const baseline = await cdp.evaluate(sessionId, `window.__sharedYardV0Evidence()`);
  assert(baseline.uiRevision === WORLD_V0_BROWSER_UI_REVISION, `UI revision ${baseline.uiRevision}`);
  assert(baseline.expectedSimBuildId === WORLD_V0_EXPECTED_SIM_BUILD_ID, `SimBuild ${baseline.expectedSimBuildId}`);
  assert(baseline.runtimeFailed === false, `runtime failed before jump ${baseline.runtimeFailureReason}`);
  assert(baseline.metrics.guardMismatches === 0, `pre-jump guard mismatch ${baseline.metrics.guardMismatches}`);
  assert(Number.isFinite(baseline.jump?.selfY), `baseline Y missing ${JSON.stringify(baseline.jump)}`);
  const baselineY = baseline.jump.selfY;
  const baselineGuardMatches = baseline.metrics.guardMatches;
  result.stages.baseline = {
    boundary: baseline.localBoundaryTick,
    protocolStartTick: baseline.protocolStartTick,
    y: baselineY,
    vy: baseline.jump.selfVy,
    guards: baselineGuardMatches,
    corrections: baseline.metrics.corrections,
  };

  await pressSpace(cdp, sessionId);

  const airborne = await waitFor(
    cdp,
    sessionId,
    `(() => {
      const e = window.__sharedYardV0Evidence?.();
      if (!e || e.runtimeFailed || e.metrics?.guardMismatches) return false;
      if ((e.jump?.pulsesGenerated || 0) < 1 || (e.jump?.authorityApplied || 0) < 1) return false;
      if (!Number.isFinite(e.jump?.selfY) || e.jump.selfY < ${JSON.stringify(baselineY + 0.35)}) return false;
      return { y:e.jump.selfY, vy:e.jump.selfVy, boundary:e.localBoundaryTick, guards:e.metrics.guardMatches, corrections:e.metrics.corrections };
    })()`,
    "browser airborne jump",
    12_000,
  );
  result.stages.airborne = airborne;

  await pressSpace(cdp, sessionId);
  const airRejected = await waitFor(
    cdp,
    sessionId,
    `(() => {
      const e = window.__sharedYardV0Evidence?.();
      if (!e || e.runtimeFailed || e.metrics?.guardMismatches) return false;
      return (e.jump?.pulsesGenerated || 0) >= 2 && (e.jump?.authorityRejected || 0) >= 1 ?
        { y:e.jump.selfY, vy:e.jump.selfVy, boundary:e.localBoundaryTick, rejected:e.jump.authorityRejected, guards:e.metrics.guardMatches, corrections:e.metrics.corrections } : false;
    })()`,
    "browser airborne rejection",
    8_000,
  );
  result.stages.airRejected = airRejected;

  const landed = await waitFor(
    cdp,
    sessionId,
    `(() => {
      const e = window.__sharedYardV0Evidence?.();
      if (!e || e.runtimeFailed || e.metrics?.guardMismatches) return false;
      if (!Number.isFinite(e.jump?.selfY) || !Number.isFinite(e.jump?.selfVy)) return false;
      return e.jump.selfY <= ${JSON.stringify(baselineY + 0.08)} && Math.abs(e.jump.selfVy) < 0.8 ?
        { y:e.jump.selfY, vy:e.jump.selfVy, boundary:e.localBoundaryTick, guards:e.metrics.guardMatches, corrections:e.metrics.corrections } : false;
    })()`,
    "browser landing",
    12_000,
  );
  result.stages.landed = landed;

  await pressSpace(cdp, sessionId);
  const rejump = await waitFor(
    cdp,
    sessionId,
    `(() => {
      const e = window.__sharedYardV0Evidence?.();
      if (!e || e.runtimeFailed || e.metrics?.guardMismatches) return false;
      return (e.jump?.pulsesGenerated || 0) >= 3 && (e.jump?.authorityApplied || 0) >= 2 && e.jump.selfY >= ${JSON.stringify(baselineY + 0.3)} ?
        { y:e.jump.selfY, vy:e.jump.selfVy, boundary:e.localBoundaryTick, applied:e.jump.authorityApplied, guards:e.metrics.guardMatches, corrections:e.metrics.corrections } : false;
    })()`,
    "browser grounded rejump",
    10_000,
  );
  result.stages.rejump = rejump;

  await waitFor(
    cdp,
    sessionId,
    `(() => {
      const e = window.__sharedYardV0Evidence?.();
      return e?.runtimeFailed === false && e?.metrics?.guardMismatches === 0 && e?.metrics?.guardMatches >= ${JSON.stringify(baselineGuardMatches + 12)};
    })()`,
    "post-jump exact-state runway",
    10_000,
  );

  const finalEvidence = await cdp.evaluate(sessionId, `window.__sharedYardV0Evidence()`);
  const inspection = await cdp.evaluate(sessionId, `window.__sharedYardV0Inspection()`);
  assert(finalEvidence.runtimeFailed === false, `runtime failed ${finalEvidence.runtimeFailureReason}`);
  assert(finalEvidence.metrics.guardMismatches === 0, `guard mismatches ${finalEvidence.metrics.guardMismatches}`);
  assert(finalEvidence.metrics.firstStateMismatch == null, `first mismatch ${JSON.stringify(finalEvidence.metrics.firstStateMismatch)}`);
  assert(finalEvidence.jump.pulsesGenerated === 3, `generated pulses ${finalEvidence.jump.pulsesGenerated}`);
  assert(finalEvidence.jump.authorityApplied >= 2, `authority applied ${finalEvidence.jump.authorityApplied}`);
  assert(finalEvidence.jump.authorityRejected >= 1, `authority rejected ${finalEvidence.jump.authorityRejected}`);
  assert(inspection.mode === "inspection" && inspection.qualificationEligible === false, "browser jump run must remain inspection evidence");
  assert(inspection.companion.failureReason == null, `AUTO companion failure ${inspection.companion.failureReason}`);
  assert(inspection.companion.rejectedRecords === 0, `AUTO rejected records ${inspection.companion.rejectedRecords}`);

  Object.assign(result, {
    verdict: "WORLD_V0_JUMP_BROWSER_PASS",
    run,
    uiRevision: finalEvidence.uiRevision,
    simBuildId: finalEvidence.expectedSimBuildId,
    baseline: { y: baselineY, boundary: baseline.localBoundaryTick, guards: baselineGuardMatches },
    airborne,
    airRejected,
    landed,
    rejump,
    final: {
      boundary: finalEvidence.localBoundaryTick,
      y: finalEvidence.jump.selfY,
      vy: finalEvidence.jump.selfVy,
      pulsesGenerated: finalEvidence.jump.pulsesGenerated,
      authorityApplied: finalEvidence.jump.authorityApplied,
      authorityRejected: finalEvidence.jump.authorityRejected,
      guardMatches: finalEvidence.metrics.guardMatches,
      guardMismatches: finalEvidence.metrics.guardMismatches,
      firstStateMismatch: finalEvidence.metrics.firstStateMismatch,
      corrections: finalEvidence.metrics.corrections,
      maxRewind: finalEvidence.metrics.maxRewind,
      maxReplaySteps: finalEvidence.metrics.maxReplaySteps,
      serverLate: finalEvidence.metrics.serverLate,
      serverRejected: finalEvidence.metrics.serverRejected,
      correctionEvents: finalEvidence.corrections,
    },
    inspection,
  });
  writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
  console.log("WORLD_V0_JUMP_BROWSER_PASS", JSON.stringify({
    baselineY,
    airborne,
    airRejected,
    landed,
    rejump,
    final: result.final,
  }));
} catch (error) {
  result.error = error instanceof Error ? error.stack || error.message : String(error);
  if (error?.lastState) result.lastState = error.lastState;
  if (cdp) {
    try {
      const targets = await cdp.call("Target.getTargets");
      const pageTarget = targets.targetInfos?.find((target) => target.type === "page" && target.url.includes("/world-v0/"));
      if (pageTarget) {
        const { sessionId } = await cdp.call("Target.attachToTarget", { targetId: pageTarget.targetId, flatten: true });
        result.failureState = await cdp.evaluate(sessionId, runwayStateExpression);
      }
    } catch (diagnosticError) {
      result.failureDiagnosticError = diagnosticError instanceof Error ? diagnosticError.message : String(diagnosticError);
    }
  }
  result.chromeStderr = Buffer.concat(stderr).toString("utf8").slice(-8000);
  writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
  throw error;
} finally {
  cdp?.close();
  if (child.exitCode === null) child.kill("SIGKILL");
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* cleanup */ }
}
