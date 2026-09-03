import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  WORLD_V0_BROWSER_UI_REVISION,
  WORLD_V0_EXPECTED_SIM_BUILD_ID,
} from "../public/world-v0/build-contract.js";

const STAGING_PAGE = "https://cloudflare-multiplayer-lab-staging.jozzpoly.workers.dev/world-v0/";
const DEBUG_PORT = 9222;
const DEBUG_BASE = `http://127.0.0.1:${DEBUG_PORT}`;
const BROWSER_TIMEOUT_MS = 45_000;
const RUN_TIMEOUT_MS = 35_000;
const MIN_GUARD_MATCHES = 20;
const MIN_ACTIVE_TICKS = 150;
const OUTPUT = process.env.MW_WORLD_V0_CHROMIUM_OUTPUT || "world-v0-chromium-cloud-evidence.json";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function findChrome() {
  const override = process.env.CHROME_BIN?.trim();
  if (override) return override;
  const probe = spawnSync("bash", ["-lc", "command -v google-chrome || command -v google-chrome-stable || command -v chromium || command -v chromium-browser"], {
    encoding: "utf8",
  });
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
  while (Date.now() - started < BROWSER_TIMEOUT_MS) {
    try {
      const response = await fetch(`${DEBUG_BASE}/json/version`, { signal: AbortSignal.timeout(2000) });
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
      try {
        const raw = typeof event.data === "string" ? event.data : await event.data.text();
        const message = JSON.parse(raw);
        if (!message.id) return;
        const waiter = this.pending.get(message.id);
        if (!waiter) return;
        this.pending.delete(message.id);
        if (message.error) waiter.reject(new Error(`CDP ${waiter.method}: ${message.error.message}`));
        else waiter.resolve(message.result || {});
      } catch (error) {
        for (const waiter of this.pending.values()) waiter.reject(error);
        this.pending.clear();
      }
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
    const result = await this.call("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    }, sessionId);
    if (result.exceptionDetails) {
      throw new Error(`Browser evaluation failed: ${result.exceptionDetails.text || "unknown exception"}`);
    }
    return result.result?.value;
  }

  close() {
    try { this.ws.close(); } catch { /* best effort */ }
  }
}

async function createPage(cdp, url) {
  const { targetId } = await cdp.call("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await cdp.call("Target.attachToTarget", { targetId, flatten: true });
  await cdp.call("Runtime.enable", {}, sessionId);
  await cdp.call("Page.enable", {}, sessionId);
  await cdp.call("Page.navigate", { url }, sessionId);
  return { targetId, sessionId, url };
}

async function waitFor(cdp, page, predicateExpression, label, timeoutMs = RUN_TIMEOUT_MS) {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < timeoutMs) {
    try {
      last = await cdp.evaluate(page.sessionId, predicateExpression);
      if (last) return last;
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    await sleep(150);
  }
  throw new Error(`${label} timeout · last=${JSON.stringify(last)}`);
}

async function evidence(cdp, page) {
  return await cdp.evaluate(page.sessionId, `window.__sharedYardV0Evidence ? window.__sharedYardV0Evidence() : null`);
}

async function dispatchMovement(cdp, page, code, down) {
  const type = down ? "keydown" : "keyup";
  const key = code === "KeyD" ? "d" : code === "KeyA" ? "a" : code;
  await cdp.evaluate(page.sessionId, `window.dispatchEvent(new KeyboardEvent(${JSON.stringify(type)}, { code: ${JSON.stringify(code)}, key: ${JSON.stringify(key)}, bubbles: true })); true`);
}

function validateCorrectionEvents(events, label) {
  assert(Array.isArray(events), `${label}: corrections evidence missing`);
  for (const event of events) {
    for (const key of ["reason", "targetTick", "boundaryBefore", "checkpointStart", "rewind", "replaySteps", "durationMs", "coldFirst", "delta"]) {
      assert(Object.hasOwn(event, key), `${label}: correction missing ${key}`);
    }
    assert(["peer-record", "authority-consumed"].includes(event.reason), `${label}: unexpected correction reason ${event.reason}`);
    assert(Number.isInteger(event.targetTick) && Number.isInteger(event.boundaryBefore), `${label}: invalid correction tick`);
    assert(Number.isFinite(event.durationMs) && event.durationMs >= 0, `${label}: invalid correction duration`);
    assert(event.delta && [event.delta.self, event.delta.remote, event.delta.prop].every(Number.isFinite), `${label}: invalid correction deltas`);
  }
}

function validateFinalEvidence(value, label) {
  assert(value, `${label}: evidence missing`);
  assert(value.uiRevision === WORLD_V0_BROWSER_UI_REVISION, `${label}: UI revision drift ${value.uiRevision}`);
  assert(value.expectedSimBuildId === WORLD_V0_EXPECTED_SIM_BUILD_ID, `${label}: expected SimBuildId drift`);
  assert(value.identity?.simBuildId === WORLD_V0_EXPECTED_SIM_BUILD_ID, `${label}: live SimBuildId drift ${value.identity?.simBuildId}`);
  assert(value.runtimeFailed === false, `${label}: runtime failed ${JSON.stringify(value.metrics?.firstStateMismatch)}`);
  assert(value.metrics?.guardMismatches === 0, `${label}: exact guard mismatch ${JSON.stringify(value.metrics?.firstStateMismatch)}`);
  assert(value.metrics?.firstStateMismatch === null, `${label}: first state mismatch populated`);
  assert(value.metrics?.guardMatches >= MIN_GUARD_MATCHES, `${label}: only ${value.metrics?.guardMatches} exact guard matches`);
  assert(value.metrics?.guardPending === 0, `${label}: ${value.metrics?.guardPending} state guards still pending`);
  assert(value.metrics?.remapFailures === 0, `${label}: remap failures ${value.metrics?.remapFailures}`);
  assert(Number.isInteger(value.protocolStartTick), `${label}: protocolStartTick missing`);
  assert(value.localBoundaryTick >= value.protocolStartTick + MIN_ACTIVE_TICKS, `${label}: insufficient active run B(${value.localBoundaryTick}) start=${value.protocolStartTick}`);
  validateCorrectionEvents(value.corrections, label);
}

const chromeBinary = findChrome();
const detectedChromeVersion = chromeVersion(chromeBinary);
const profile = mkdtempSync(join(tmpdir(), "mw-world-v0-chrome-"));
const child = spawn(chromeBinary, [
  "--headless=new",
  "--no-sandbox",
  "--disable-gpu",
  "--disable-dev-shm-usage",
  "--disable-background-timer-throttling",
  "--disable-backgrounding-occluded-windows",
  "--disable-renderer-backgrounding",
  `--remote-debugging-port=${DEBUG_PORT}`,
  "--remote-debugging-address=127.0.0.1",
  `--user-data-dir=${profile}`,
  "about:blank",
], { stdio: ["ignore", "ignore", "pipe"] });
const stderr = [];
child.stderr.on("data", (chunk) => stderr.push(chunk));

let cdp = null;
let pages = [];
try {
  const debuggerInfo = await waitForDebugger();
  cdp = new Cdp(debuggerInfo.webSocketDebuggerUrl);
  await cdp.opened;

  const suffix = Date.now().toString(36).slice(-7);
  const runKey = `chr-${suffix}`;
  const pageAUrl = `${STAGING_PAGE}?player=${encodeURIComponent(`CA-${suffix}`)}&run=${encodeURIComponent(runKey)}`;
  const pageBUrl = `${STAGING_PAGE}?player=${encodeURIComponent(`CB-${suffix}`)}&run=${encodeURIComponent(runKey)}`;
  pages = [await createPage(cdp, pageAUrl), await createPage(cdp, pageBUrl)];

  for (const [index, page] of pages.entries()) {
    await waitFor(cdp, page, `document.readyState === "complete" && typeof window.__sharedYardV0Evidence === "function" && !document.querySelector("#enter")?.disabled`, `page ${index} browser boot`);
  }

  for (const page of pages) {
    await cdp.evaluate(page.sessionId, `document.querySelector("#enter").click(); true`);
  }

  await Promise.all(pages.map((page, index) => waitFor(
    cdp,
    page,
    `(() => { const e = window.__sharedYardV0Evidence?.(); return e?.identity?.worldEpoch && Number.isInteger(e?.protocolStartTick); })()`,
    `page ${index} Shared Yard handshake/start`,
  )));

  let firstA = await evidence(cdp, pages[0]);
  let firstB = await evidence(cdp, pages[1]);
  assert(firstA.identity.worldId === firstB.identity.worldId, "Chromium pages joined different WorldId values");
  assert(firstA.identity.worldEpoch === firstB.identity.worldEpoch, "Chromium pages joined different WorldEpoch values");
  assert(firstA.identity.simBuildId === firstB.identity.simBuildId, "Chromium pages joined different SimBuildId values");

  // Drive both real browser clients inward through the central Shared Yard
  // barricade. The keys remain down until the exact-state run has accumulated
  // enough active canonical history.
  await dispatchMovement(cdp, pages[0], "KeyD", true);
  await dispatchMovement(cdp, pages[1], "KeyA", true);

  await Promise.all(pages.map((page, index) => waitFor(
    cdp,
    page,
    `(() => { const e = window.__sharedYardV0Evidence?.(); return e && !e.runtimeFailed && e.metrics.guardMismatches === 0 && e.metrics.guardMatches >= ${MIN_GUARD_MATCHES} && Number.isInteger(e.protocolStartTick) && e.localBoundaryTick >= e.protocolStartTick + ${MIN_ACTIVE_TICKS}; })()`,
    `page ${index} exact-state qualification`,
  )));

  await dispatchMovement(cdp, pages[0], "KeyD", false);
  await dispatchMovement(cdp, pages[1], "KeyA", false);
  await sleep(800);

  const finalA = await evidence(cdp, pages[0]);
  const finalB = await evidence(cdp, pages[1]);
  validateFinalEvidence(finalA, "pageA");
  validateFinalEvidence(finalB, "pageB");
  assert(finalA.identity.worldEpoch === finalB.identity.worldEpoch, "final Chromium WorldEpoch disagreement");
  assert(finalA.identity.simBuildId === finalB.identity.simBuildId, "final Chromium SimBuildId disagreement");

  const result = {
    verdict: "WORLD_V0_PASS_REAL_CHROMIUM_EXACT_STATE_ENVELOPE",
    generatedAt: new Date().toISOString(),
    provenance: {
      githubSha: process.env.GITHUB_SHA || null,
      githubRunId: process.env.GITHUB_RUN_ID || null,
      githubRunAttempt: process.env.GITHUB_RUN_ATTEMPT || null,
    },
    runtime: {
      chromeBinary,
      chromeVersion: detectedChromeVersion,
      browserProduct: debuggerInfo.Browser || null,
      userAgent: debuggerInfo["User-Agent"] || null,
    },
    runKey,
    identity: finalA.identity,
    pages: [finalA, finalB],
    nonClaim: "This qualifies the actual Shared Yard V0 browser/Worker path on GitHub-hosted Linux x64 Chrome only. It does not qualify Android Chromium performance, Firefox/WebKit, reconnect/bootstrap, persistence or runtime entity lifecycle.",
  };
  writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
  console.log(`${result.verdict} · ${detectedChromeVersion}`);
  console.log(`epoch=${result.identity.worldEpoch} guards=${finalA.metrics.guardMatches}/${finalB.metrics.guardMatches} corrections=${finalA.metrics.corrections}/${finalB.metrics.corrections}`);
  console.log(`boundaries=${finalA.localBoundaryTick}/${finalB.localBoundaryTick} start=${finalA.protocolStartTick}`);
} catch (error) {
  const diagnostic = {
    verdict: "WORLD_V0_FAIL_REAL_CHROMIUM",
    generatedAt: new Date().toISOString(),
    error: error instanceof Error ? error.stack || error.message : String(error),
    chromeVersion: detectedChromeVersion,
    stderrTail: Buffer.concat(stderr).toString("utf8").slice(-8000),
    pageEvidence: [],
  };
  if (cdp) {
    for (const page of pages) {
      try { diagnostic.pageEvidence.push(await evidence(cdp, page)); } catch (pageError) {
        diagnostic.pageEvidence.push({ error: pageError instanceof Error ? pageError.message : String(pageError) });
      }
    }
  }
  writeFileSync(OUTPUT, JSON.stringify(diagnostic, null, 2));
  console.error(diagnostic.error);
  process.exitCode = 1;
} finally {
  if (cdp) cdp.close();
  child.kill("SIGKILL");
  rmSync(profile, { recursive: true, force: true });
}
