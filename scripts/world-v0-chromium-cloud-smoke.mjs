import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  WORLD_V0_BROWSER_UI_REVISION,
  WORLD_V0_EXPECTED_SIM_BUILD_ID,
} from "../public/world-v0/build-contract.js";

const STAGING_PAGE = "https://cloudflare-multiplayer-lab-staging.jozzpoly.workers.dev/world-v0/";
const DEBUG_PORTS = [9222, 9223];
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
  const probe = spawnSync(
    "bash",
    ["-lc", "command -v google-chrome || command -v google-chrome-stable || command -v chromium || command -v chromium-browser"],
    { encoding: "utf8" },
  );
  const binary = probe.stdout.trim().split("\n")[0];
  if (!binary) throw new Error(`Chrome/Chromium binary not found: ${probe.stderr || "no candidate on PATH"}`);
  return binary;
}

function chromeVersion(binary) {
  const result = spawnSync(binary, ["--version"], { encoding: "utf8" });
  return (result.stdout || result.stderr || "unknown").trim();
}

async function waitForDebugger(port) {
  const base = `http://127.0.0.1:${port}`;
  const started = Date.now();
  let last = null;
  while (Date.now() - started < BROWSER_TIMEOUT_MS) {
    try {
      const response = await fetch(`${base}/json/version`, { signal: AbortSignal.timeout(2000) });
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
  throw new Error(`Chrome DevTools endpoint ${port} unavailable: ${last}`);
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
    const result = await this.call(
      "Runtime.evaluate",
      { expression, awaitPromise: true, returnByValue: true, userGesture: true },
      sessionId,
    );
    if (result.exceptionDetails) {
      throw new Error(`Browser evaluation failed: ${result.exceptionDetails.text || "unknown exception"}`);
    }
    return result.result?.value;
  }

  close() {
    try { this.ws.close(); } catch { /* best effort */ }
  }
}

async function startBrowserClient(binary, index, url) {
  const port = DEBUG_PORTS[index];
  const profile = mkdtempSync(join(tmpdir(), `mw-world-v0-chrome-${index}-`));
  const stderr = [];
  const child = spawn(binary, [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
    `--remote-debugging-port=${port}`,
    "--remote-debugging-address=127.0.0.1",
    `--user-data-dir=${profile}`,
    "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"] });
  child.stderr.on("data", (chunk) => stderr.push(chunk));

  let cdp = null;
  try {
    const debuggerInfo = await waitForDebugger(port);
    cdp = new Cdp(debuggerInfo.webSocketDebuggerUrl);
    await cdp.opened;

    const existing = await cdp.call("Target.getTargets");
    const { targetId } = await cdp.call("Target.createTarget", { url });
    await cdp.call("Target.activateTarget", { targetId });
    const { sessionId } = await cdp.call("Target.attachToTarget", { targetId, flatten: true });
    await cdp.call("Runtime.enable", {}, sessionId);
    await cdp.call("Page.enable", {}, sessionId);

    for (const target of existing.targetInfos || []) {
      if (target.type !== "page" || target.targetId === targetId) continue;
      try { await cdp.call("Target.closeTarget", { targetId: target.targetId }); } catch { /* cleanup only */ }
    }

    return {
      index,
      port,
      url,
      profile,
      stderr,
      child,
      debuggerInfo,
      cdp,
      page: { targetId, sessionId, url },
    };
  } catch (error) {
    if (cdp) cdp.close();
    child.kill("SIGKILL");
    try { rmSync(profile, { recursive: true, force: true }); } catch { /* cleanup only */ }
    throw error;
  }
}

async function stopBrowserClient(client) {
  if (!client) return;
  client.cdp?.close();
  if (client.child && client.child.exitCode === null) {
    const closed = new Promise((resolve) => client.child.once("close", resolve));
    client.child.kill("SIGKILL");
    await Promise.race([closed, sleep(2500)]);
  }
  try { rmSync(client.profile, { recursive: true, force: true }); }
  catch (error) { console.warn(`Chrome profile cleanup failed for client ${client.index}: ${error instanceof Error ? error.message : String(error)}`); }
}

async function waitFor(client, predicateExpression, label, timeoutMs = RUN_TIMEOUT_MS) {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < timeoutMs) {
    try {
      last = await client.cdp.evaluate(client.page.sessionId, predicateExpression);
      if (last) return last;
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    await sleep(150);
  }
  throw new Error(`${label} timeout · last=${JSON.stringify(last)}`);
}

async function evidence(client) {
  return await client.cdp.evaluate(
    client.page.sessionId,
    `window.__sharedYardV0Evidence ? window.__sharedYardV0Evidence() : null`,
  );
}

async function dispatchMovement(client, code, down) {
  const type = down ? "keydown" : "keyup";
  const key = code === "KeyD" ? "d" : code === "KeyA" ? "a" : code;
  await client.cdp.evaluate(
    client.page.sessionId,
    `window.dispatchEvent(new KeyboardEvent(${JSON.stringify(type)}, { code: ${JSON.stringify(code)}, key: ${JSON.stringify(key)}, bubbles: true })); true`,
  );
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
const clients = [];
let runKey = null;
try {
  const suffix = Date.now().toString(36).slice(-7);
  runKey = `chr-${suffix}`;
  const urls = [
    `${STAGING_PAGE}?player=${encodeURIComponent(`CA-${suffix}`)}&run=${encodeURIComponent(runKey)}`,
    `${STAGING_PAGE}?player=${encodeURIComponent(`CB-${suffix}`)}&run=${encodeURIComponent(runKey)}`,
  ];

  clients.push(await startBrowserClient(chromeBinary, 0, urls[0]));
  clients.push(await startBrowserClient(chromeBinary, 1, urls[1]));

  await Promise.all(clients.map((client, index) => waitFor(
    client,
    `document.readyState === "complete" && typeof window.__sharedYardV0Evidence === "function" && !document.querySelector("#enter")?.disabled`,
    `client ${index} browser boot`,
  )));

  for (const client of clients) {
    await client.cdp.evaluate(client.page.sessionId, `document.querySelector("#enter").click(); true`);
  }

  await Promise.all(clients.map((client, index) => waitFor(
    client,
    `(() => { const e = window.__sharedYardV0Evidence?.(); return e?.identity?.worldEpoch && Number.isInteger(e?.protocolStartTick); })()`,
    `client ${index} Shared Yard handshake/start`,
  )));

  const firstA = await evidence(clients[0]);
  const firstB = await evidence(clients[1]);
  assert(firstA.identity.worldId === firstB.identity.worldId, "Chromium clients joined different WorldId values");
  assert(firstA.identity.worldEpoch === firstB.identity.worldEpoch, "Chromium clients joined different WorldEpoch values");
  assert(firstA.identity.simBuildId === firstB.identity.simBuildId, "Chromium clients joined different SimBuildId values");

  await dispatchMovement(clients[0], "KeyD", true);
  await dispatchMovement(clients[1], "KeyA", true);

  await Promise.all(clients.map((client, index) => waitFor(
    client,
    `(() => { const e = window.__sharedYardV0Evidence?.(); return e && !e.runtimeFailed && e.metrics.guardMismatches === 0 && e.metrics.guardMatches >= ${MIN_GUARD_MATCHES} && Number.isInteger(e.protocolStartTick) && e.localBoundaryTick >= e.protocolStartTick + ${MIN_ACTIVE_TICKS}; })()`,
    `client ${index} exact-state qualification`,
  )));

  await dispatchMovement(clients[0], "KeyD", false);
  await dispatchMovement(clients[1], "KeyA", false);
  await sleep(800);

  const finalA = await evidence(clients[0]);
  const finalB = await evidence(clients[1]);
  validateFinalEvidence(finalA, "clientA");
  validateFinalEvidence(finalB, "clientB");
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
      clients: clients.map((client) => ({
        port: client.port,
        browserProduct: client.debuggerInfo.Browser || null,
        userAgent: client.debuggerInfo["User-Agent"] || null,
      })),
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
    runKey,
    clients: [],
  };
  for (const client of clients) {
    const item = {
      index: client.index,
      port: client.port,
      stderrTail: Buffer.concat(client.stderr).toString("utf8").slice(-8000),
      evidence: null,
    };
    try { item.evidence = await evidence(client); }
    catch (clientError) { item.evidence = { error: clientError instanceof Error ? clientError.message : String(clientError) }; }
    diagnostic.clients.push(item);
  }
  writeFileSync(OUTPUT, JSON.stringify(diagnostic, null, 2));
  console.error(diagnostic.error);
  process.exitCode = 1;
} finally {
  await Promise.all(clients.map((client) => stopBrowserClient(client)));
}
