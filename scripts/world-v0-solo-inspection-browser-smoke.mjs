import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  WORLD_V0_BROWSER_UI_REVISION,
  WORLD_V0_EXPECTED_SIM_BUILD_ID,
} from "../public/world-v0/build-contract.js";

const BASE = (process.env.MW_WORLD_V0_SOLO_BASE_URL || "http://127.0.0.1:8787").replace(/\/$/, "");
const PAGE_URL = `${BASE}/world-v0/`;
const DEBUG_PORT = 9564;
const TIMEOUT_MS = 45_000;
const OUTPUT = process.env.MW_WORLD_V0_SOLO_OUTPUT || "world-v0-solo-inspection-evidence.json";

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function assert(condition, message) { if (!condition) throw new Error(message); }

function findChrome() {
  const override = process.env.CHROME_BIN?.trim();
  if (override) return override;
  const probe = spawnSync("bash", ["-lc", "command -v google-chrome || command -v google-chrome-stable || command -v chromium || command -v chromium-browser"], { encoding: "utf8" });
  const binary = probe.stdout.trim().split("\n")[0];
  if (!binary) throw new Error(`Chrome/Chromium binary not found: ${probe.stderr || "no candidate"}`);
  return binary;
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
    } catch (error) { last = error instanceof Error ? error.message : String(error); }
    await sleep(100);
  }
  throw new Error(`Chrome debugger unavailable: ${last}`);
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

async function waitFor(cdp, sessionId, expression, label) {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < TIMEOUT_MS) {
    try {
      last = await cdp.evaluate(sessionId, expression);
      if (last) return last;
    } catch (error) { last = error instanceof Error ? error.message : String(error); }
    await sleep(100);
  }
  throw new Error(`${label} timeout · last=${JSON.stringify(last)}`);
}

const chrome = findChrome();
const profile = mkdtempSync(join(tmpdir(), "mw-solo-inspection-"));
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
  verdict: "WORLD_V0_SOLO_INSPECTION_FAIL",
  generatedAt: new Date().toISOString(),
  page: PAGE_URL,
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
    "solo inspection boot",
  );

  const suffix = Date.now().toString(36).slice(-7);
  const run = `solo-${suffix}`;
  await cdp.evaluate(sessionId, `(() => {
    document.querySelector("#callsign").value = "solo-human";
    document.querySelector("#run").value = ${JSON.stringify(run)};
    document.querySelector("#inspect-solo").click();
    return true;
  })()`);

  await waitFor(
    cdp,
    sessionId,
    `(() => {
      const inspection = window.__sharedYardV0Inspection?.();
      const evidence = window.__sharedYardV0Evidence?.();
      return inspection?.mode === "inspection" && inspection?.companion?.state === "live" && evidence?.networkState?.startsWith("live");
    })()`,
    "real-authority inspection start",
  );

  await waitFor(
    cdp,
    sessionId,
    `(() => {
      const inspection = window.__sharedYardV0Inspection?.();
      const evidence = window.__sharedYardV0Evidence?.();
      const companion = inspection?.companion;
      return evidence?.runtimeFailed === false &&
        evidence?.metrics?.guardMatches >= 8 &&
        evidence?.metrics?.guardMismatches === 0 &&
        companion?.acceptedRecords >= 8 &&
        companion?.consumedFresh >= 4 &&
        companion?.failureReason == null;
    })()`,
    "solo inspection exact-state runway",
  );

  const evidence = await cdp.evaluate(sessionId, `window.__sharedYardV0Evidence()`);
  const inspection = await cdp.evaluate(sessionId, `window.__sharedYardV0Inspection()`);
  const companion = inspection.companion;

  assert(evidence.uiRevision === WORLD_V0_BROWSER_UI_REVISION, `UI revision ${evidence.uiRevision}`);
  assert(evidence.expectedSimBuildId === WORLD_V0_EXPECTED_SIM_BUILD_ID, `SimBuild ${evidence.expectedSimBuildId}`);
  assert(evidence.runtimeFailed === false, `primary runtime failed ${evidence.runtimeFailureReason}`);
  assert(evidence.metrics.guardMismatches === 0, `primary guard mismatches ${evidence.metrics.guardMismatches}`);
  assert(evidence.metrics.firstStateMismatch == null, `primary first mismatch ${JSON.stringify(evidence.metrics.firstStateMismatch)}`);
  assert(inspection.mode === "inspection", `inspection mode ${inspection.mode}`);
  assert(inspection.qualificationEligible === false, "inspection must never be multiplayer qualification evidence");
  assert(companion.slot === 1, `AUTO companion slot ${companion.slot}`);
  assert(companion.playerId === "AUTO_solo-human", `AUTO companion id ${companion.playerId}`);
  assert(companion.state === "live", `AUTO companion state ${companion.state}`);
  assert(companion.failureReason == null, `AUTO companion failure ${companion.failureReason}`);
  assert(companion.rejectedRecords === 0, `AUTO rejected records ${companion.rejectedRecords}`);
  assert(companion.leaseExpiredSeen === 0, `AUTO lease expirations ${companion.leaseExpiredSeen}`);
  assert(companion.recordsSent >= companion.acceptedRecords && companion.acceptedRecords >= 8, `AUTO record accounting ${JSON.stringify(companion)}`);
  assert(evidence.presentation.remotePresence === "PEER", `AUTO peer not represented in primary scene ${evidence.presentation.remotePresence}`);

  Object.assign(result, {
    verdict: "WORLD_V0_SOLO_INSPECTION_PASS",
    run,
    uiRevision: evidence.uiRevision,
    simBuildId: evidence.expectedSimBuildId,
    primary: {
      networkState: evidence.networkState,
      boundaryTick: evidence.localBoundaryTick,
      guardMatches: evidence.metrics.guardMatches,
      guardMismatches: evidence.metrics.guardMismatches,
      guardPending: evidence.metrics.guardPending,
      corrections: evidence.metrics.corrections,
      runtimeFailed: evidence.runtimeFailed,
    },
    inspection,
  });
  writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
  console.log("WORLD_V0_SOLO_INSPECTION_PASS", JSON.stringify({
    run,
    boundaryTick: evidence.localBoundaryTick,
    guardMatches: evidence.metrics.guardMatches,
    acceptedRecords: companion.acceptedRecords,
    consumedFresh: companion.consumedFresh,
  }));
} catch (error) {
  result.error = error instanceof Error ? error.stack || error.message : String(error);
  result.chromeStderr = Buffer.concat(stderr).toString("utf8").slice(-8000);
  writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
  throw error;
} finally {
  cdp?.close();
  if (child.exitCode === null) child.kill("SIGKILL");
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* cleanup */ }
}
