import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  WORLD_V0_BROWSER_UI_REVISION,
  WORLD_V0_EXPECTED_SIM_BUILD_ID,
} from "../public/world-v0/build-contract.js";

const BASE = (process.env.MW_WORLD_V0_JUMP_ROLLBACK_BASE_URL || "http://127.0.0.1:8787").replace(/\/$/, "");
const PAGE_URL = `${BASE}/world-v0/`;
const OUTPUT = process.env.MW_WORLD_V0_JUMP_ROLLBACK_OUTPUT || "world-v0-jump-browser-rollback-evidence.json";
const DEBUG_PORT = 9576;
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

const DROP_FIRST_JUMP_BATCH = `(() => {
  const NativeWebSocket = window.WebSocket;
  let dropped = false;
  window.__mwJumpDropEvidence = { dropped: false };
  class DropFirstJumpWebSocket extends NativeWebSocket {
    send(data) {
      if (!dropped && typeof data === "string") {
        try {
          const message = JSON.parse(data);
          if (message?.type === "world_v0_input_batch" && Array.isArray(message.records) && message.records.some((record) => record?.jump === true)) {
            dropped = true;
            window.__mwJumpDropEvidence = {
              dropped: true,
              batchSeq: message.batchSeq,
              records: message.records.map((record) => ({ targetTick: record.targetTick, x: record.x, z: record.z, jump: Boolean(record.jump) })),
              atPerformanceMs: performance.now(),
            };
            return;
          }
        } catch { /* non-JSON traffic passes through */ }
      }
      return super.send(data);
    }
  }
  window.WebSocket = DropFirstJumpWebSocket;
})();`;

const chrome = findChrome();
const profile = mkdtempSync(join(tmpdir(), "mw-jump-rollback-"));
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
  verdict: "WORLD_V0_JUMP_BROWSER_ROLLBACK_FAIL",
  generatedAt: new Date().toISOString(),
  page: PAGE_URL,
};

try {
  const debuggerInfo = await waitForDebugger();
  cdp = new Cdp(debuggerInfo.webSocketDebuggerUrl);
  await cdp.opened;

  const { targetId } = await cdp.call("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await cdp.call("Target.attachToTarget", { targetId, flatten: true });
  await cdp.call("Runtime.enable", {}, sessionId);
  await cdp.call("Page.enable", {}, sessionId);
  await cdp.call("Page.addScriptToEvaluateOnNewDocument", { source: DROP_FIRST_JUMP_BATCH }, sessionId);
  await cdp.call("Page.navigate", { url: PAGE_URL }, sessionId);

  await waitFor(
    cdp,
    sessionId,
    `document.readyState === "complete" && document.querySelector("#inspect-solo")?.disabled === false && typeof window.__sharedYardV0Inspection === "function" && window.__mwJumpDropEvidence?.dropped === false`,
    "rollback browser boot",
  );

  const run = `jr-${Date.now().toString(36).slice(-8)}`;
  await cdp.evaluate(sessionId, `(() => {
    document.querySelector("#callsign").value = "jump-rollback";
    document.querySelector("#run").value = ${JSON.stringify(run)};
    document.querySelector("#inspect-solo").click();
    return true;
  })()`);

  await waitFor(
    cdp,
    sessionId,
    `(() => {
      const e = window.__sharedYardV0Evidence?.();
      const i = window.__sharedYardV0Inspection?.();
      return Number.isInteger(e?.localBoundaryTick) && Number.isInteger(e?.protocolStartTick) &&
        e.localBoundaryTick >= e.protocolStartTick && e?.runtimeFailed === false &&
        e?.jump?.buttonEnabled === true && e?.metrics?.guardMatches >= 8 && e?.metrics?.guardMismatches === 0 &&
        i?.mode === "inspection" && i?.companion?.state === "live";
    })()`,
    "rollback exact-state runway",
    25_000,
  );

  const baseline = await cdp.evaluate(sessionId, `window.__sharedYardV0Evidence()`);
  assert(baseline.uiRevision === WORLD_V0_BROWSER_UI_REVISION, `UI revision ${baseline.uiRevision}`);
  assert(baseline.expectedSimBuildId === WORLD_V0_EXPECTED_SIM_BUILD_ID, `SimBuild ${baseline.expectedSimBuildId}`);
  assert(baseline.runtimeFailed === false, `runtime failed before rollback probe ${baseline.runtimeFailureReason}`);
  assert(baseline.metrics.guardMismatches === 0, `pre-probe guard mismatch ${baseline.metrics.guardMismatches}`);
  assert(Number.isFinite(baseline.jump?.selfY), `baseline Y missing ${JSON.stringify(baseline.jump)}`);
  const baselineY = baseline.jump.selfY;
  const baselineGuards = baseline.metrics.guardMatches;

  await pressSpace(cdp, sessionId);

  const dropped = await waitFor(
    cdp,
    sessionId,
    `window.__mwJumpDropEvidence?.dropped ? window.__mwJumpDropEvidence : false`,
    "drop first canonical jump batch",
    6_000,
  );
  assert(dropped.records?.some((record) => record.jump === true), `dropped batch lacks jump pulse ${JSON.stringify(dropped)}`);
  const droppedJumpRecord = dropped.records.find((record) => record.jump === true);

  const correction = await waitFor(
    cdp,
    sessionId,
    `(() => {
      const e = window.__sharedYardV0Evidence?.();
      if (!e || e.runtimeFailed || e.metrics?.guardMismatches) return false;
      const causal = (e.corrections || []).find((event) =>
        event?.usedBefore?.self?.jump === true && event?.resolvedAfter?.self?.jump === false &&
        Number.isInteger(event?.targetTick) && event.targetTick === ${JSON.stringify(droppedJumpRecord.targetTick)}
      );
      return causal ? {
        targetTick: causal.targetTick,
        boundaryBefore: causal.boundaryBefore,
        rewind: causal.rewind,
        replaySteps: causal.replaySteps,
        durationMs: causal.durationMs,
        delta: causal.delta,
        usedBefore: causal.usedBefore,
        resolvedAfter: causal.resolvedAfter,
        metrics: {
          corrections: e.metrics.corrections,
          maxRewind: e.metrics.maxRewind,
          maxReplaySteps: e.metrics.maxReplaySteps,
          guardMatches: e.metrics.guardMatches,
          guardMismatches: e.metrics.guardMismatches,
        },
        y: e.jump?.selfY,
        vy: e.jump?.selfVy,
      } : false;
    })()`,
    "jump-specific contradiction correction",
    12_000,
  );

  assert(correction.rewind > 0, `correction did not rewind ${JSON.stringify(correction)}`);
  assert(correction.replaySteps > 0, `correction did not replay ${JSON.stringify(correction)}`);
  assert(correction.boundaryBefore > correction.targetTick, `correction boundary did not cross jump tick ${JSON.stringify(correction)}`);
  assert(correction.metrics.guardMismatches === 0, `guard mismatch during rollback ${JSON.stringify(correction)}`);

  const recovered = await waitFor(
    cdp,
    sessionId,
    `(() => {
      const e = window.__sharedYardV0Evidence?.();
      if (!e || e.runtimeFailed || e.metrics?.guardMismatches) return false;
      if (e.metrics.guardMatches < ${JSON.stringify(baselineGuards + 8)}) return false;
      if (!Number.isFinite(e.jump?.selfY) || !Number.isFinite(e.jump?.selfVy)) return false;
      return Math.abs(e.jump.selfY - ${JSON.stringify(baselineY)}) < 0.12 && Math.abs(e.jump.selfVy) < 0.8 ? {
        boundary: e.localBoundaryTick,
        y: e.jump.selfY,
        vy: e.jump.selfVy,
        guards: e.metrics.guardMatches,
        corrections: e.metrics.corrections,
      } : false;
    })()`,
    "post-correction grounded recovery",
    12_000,
  );

  await pressSpace(cdp, sessionId);
  const canonicalRejump = await waitFor(
    cdp,
    sessionId,
    `(() => {
      const e = window.__sharedYardV0Evidence?.();
      if (!e || e.runtimeFailed || e.metrics?.guardMismatches) return false;
      return e.jump?.pulsesGenerated >= 2 && e.jump?.authorityApplied >= 1 && e.jump.selfY > ${JSON.stringify(baselineY + 0.35)} ? {
        boundary: e.localBoundaryTick,
        y: e.jump.selfY,
        vy: e.jump.selfVy,
        authorityApplied: e.jump.authorityApplied,
        guards: e.metrics.guardMatches,
        corrections: e.metrics.corrections,
      } : false;
    })()`,
    "canonical jump after rollback",
    12_000,
  );

  await waitFor(
    cdp,
    sessionId,
    `(() => {
      const e = window.__sharedYardV0Evidence?.();
      return e?.runtimeFailed === false && e?.metrics?.guardMismatches === 0 && e?.metrics?.guardMatches >= ${JSON.stringify(baselineGuards + 14)};
    })()`,
    "post-rollback exact-state runway",
    10_000,
  );

  const finalEvidence = await cdp.evaluate(sessionId, `window.__sharedYardV0Evidence()`);
  const inspection = await cdp.evaluate(sessionId, `window.__sharedYardV0Inspection()`);
  const dropEvidence = await cdp.evaluate(sessionId, `window.__mwJumpDropEvidence`);
  const causalEvents = finalEvidence.corrections.filter((event) =>
    event?.usedBefore?.self?.jump === true && event?.resolvedAfter?.self?.jump === false
  );

  assert(dropEvidence.dropped === true, "jump batch was not dropped");
  assert(finalEvidence.runtimeFailed === false, `runtime failed ${finalEvidence.runtimeFailureReason}`);
  assert(finalEvidence.metrics.guardMismatches === 0, `guard mismatches ${finalEvidence.metrics.guardMismatches}`);
  assert(finalEvidence.metrics.firstStateMismatch == null, `first mismatch ${JSON.stringify(finalEvidence.metrics.firstStateMismatch)}`);
  assert(finalEvidence.metrics.corrections >= 1, `no corrections ${finalEvidence.metrics.corrections}`);
  assert(finalEvidence.metrics.maxRewind >= 1, `no rewind ${finalEvidence.metrics.maxRewind}`);
  assert(finalEvidence.metrics.maxReplaySteps >= 1, `no replay ${finalEvidence.metrics.maxReplaySteps}`);
  assert(causalEvents.length >= 1, "no jump-specific correction event retained");
  assert(finalEvidence.metrics.serverRejected === 0, `server rejected ${finalEvidence.metrics.serverRejected}`);
  assert(inspection.mode === "inspection" && inspection.qualificationEligible === false, "rollback run must remain inspection evidence");
  assert(inspection.companion.failureReason == null, `AUTO companion failure ${inspection.companion.failureReason}`);
  assert(inspection.companion.rejectedRecords === 0, `AUTO rejected records ${inspection.companion.rejectedRecords}`);

  Object.assign(result, {
    verdict: "WORLD_V0_JUMP_BROWSER_ROLLBACK_PASS",
    run,
    uiRevision: finalEvidence.uiRevision,
    simBuildId: finalEvidence.expectedSimBuildId,
    baseline: {
      boundary: baseline.localBoundaryTick,
      y: baselineY,
      guards: baselineGuards,
    },
    dropped: dropEvidence,
    correction,
    recovered,
    canonicalRejump,
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
      generationRotations: finalEvidence.metrics.generationRotations,
      serverLate: finalEvidence.metrics.serverLate,
      serverRejected: finalEvidence.metrics.serverRejected,
      causalEvents,
    },
    inspection,
  });
  writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
  console.log("WORLD_V0_JUMP_BROWSER_ROLLBACK_PASS", JSON.stringify({
    dropped: dropEvidence,
    correction,
    recovered,
    canonicalRejump,
    final: result.final,
  }));
} catch (error) {
  result.error = error instanceof Error ? error.stack || error.message : String(error);
  if (cdp) {
    try {
      const targets = await cdp.call("Target.getTargets");
      const pageTarget = targets.targetInfos?.find((target) => target.type === "page" && target.url.includes("/world-v0/"));
      if (pageTarget) {
        const { sessionId } = await cdp.call("Target.attachToTarget", { targetId: pageTarget.targetId, flatten: true });
        result.failureEvidence = await cdp.evaluate(sessionId, `({
          drop: window.__mwJumpDropEvidence || null,
          evidence: window.__sharedYardV0Evidence?.() || null,
          inspection: window.__sharedYardV0Inspection?.() || null,
          visibility: document.visibilityState,
        })`);
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
