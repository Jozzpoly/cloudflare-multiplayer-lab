import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const BASE = (process.env.MW_WORLD_V0_SMOOTHNESS_BASE_URL || "http://127.0.0.1:8787").replace(/\/$/, "");
const LABEL = process.env.MW_WORLD_V0_SMOOTHNESS_LABEL || "specimen";
const OUTPUT = process.env.MW_WORLD_V0_SMOOTHNESS_OUTPUT || `world-v0-smoothness-${LABEL}.json`;
const PAGE_URL = `${BASE}/world-v0/`;
const DEBUG_PORTS = [9662, 9663];
const TIMEOUT_MS = 45_000;
const MOVEMENT_STEPS = Number(process.env.MW_WORLD_V0_SMOOTHNESS_STEPS || 160);
const MOVEMENT_INTERVAL_MS = Number(process.env.MW_WORLD_V0_SMOOTHNESS_INTERVAL_MS || 50);

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function assert(condition, message) { if (!condition) throw new Error(message); }
function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1))];
}

function findChrome() {
  const override = process.env.CHROME_BIN?.trim();
  if (override) return override;
  const probe = spawnSync("bash", ["-lc", "command -v google-chrome || command -v google-chrome-stable || command -v chromium || command -v chromium-browser"], { encoding: "utf8" });
  const binary = probe.stdout.trim().split("\n")[0];
  if (!binary) throw new Error(`Chrome/Chromium binary not found: ${probe.stderr || "no candidate"}`);
  return binary;
}

async function waitForDebugger(port) {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < TIMEOUT_MS) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(1500) });
      if (response.ok) {
        const value = await response.json();
        if (value.webSocketDebuggerUrl) return value;
      }
      last = `HTTP ${response.status}`;
    } catch (error) { last = error instanceof Error ? error.message : String(error); }
    await sleep(100);
  }
  throw new Error(`Chrome debugger ${port} unavailable: ${last}`);
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

async function startBrowser(binary, index) {
  const port = DEBUG_PORTS[index];
  const profile = mkdtempSync(join(tmpdir(), `mw-smooth-${LABEL}-${index}-`));
  const stderr = [];
  const child = spawn(binary, [
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
    const { targetId } = await cdp.call("Target.createTarget", { url: PAGE_URL });
    const { sessionId } = await cdp.call("Target.attachToTarget", { targetId, flatten: true });
    await cdp.call("Runtime.enable", {}, sessionId);
    await cdp.call("Page.enable", {}, sessionId);
    await cdp.call("Emulation.setDeviceMetricsOverride", {
      width: 1280,
      height: 800,
      deviceScaleFactor: 1,
      mobile: false,
      screenWidth: 1280,
      screenHeight: 800,
      screenOrientation: { type: "landscapePrimary", angle: 90 },
    }, sessionId);
    return { index, port, profile, stderr, child, cdp, sessionId };
  } catch (error) {
    cdp?.close();
    if (child.exitCode === null) child.kill("SIGKILL");
    try { rmSync(profile, { recursive: true, force: true }); } catch { /* cleanup */ }
    throw error;
  }
}

async function stopBrowser(client) {
  if (!client) return;
  client.cdp?.close();
  if (client.child?.exitCode === null) client.child.kill("SIGKILL");
  try { rmSync(client.profile, { recursive: true, force: true }); } catch { /* cleanup */ }
}

async function evalIn(client, expression) {
  return await client.cdp.evaluate(client.sessionId, expression);
}

async function waitFor(client, expression, label, timeoutMs = TIMEOUT_MS) {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < timeoutMs) {
    try {
      last = await evalIn(client, expression);
      if (last) return last;
    } catch (error) { last = error instanceof Error ? error.message : String(error); }
    await sleep(100);
  }
  throw new Error(`${label} timeout · last=${JSON.stringify(last)}`);
}

async function mouse(client, type, x, y, button = "none", buttons = 0, clickCount = 0) {
  await client.cdp.call("Input.dispatchMouseEvent", { type, x, y, button, buttons, clickCount }, client.sessionId);
}

async function joystickGeometry(client) {
  return await evalIn(client, `(() => {
    const el = document.querySelector("#joystick");
    const r = el?.getBoundingClientRect();
    return r ? { x:r.left+r.width/2, y:r.top+r.height/2, width:r.width, height:r.height, display:getComputedStyle(el).display } : null;
  })()`);
}

async function pressJoystick(client, geometry) {
  await mouse(client, "mousePressed", geometry.x, geometry.y, "left", 1, 1);
}

async function moveJoystick(client, geometry, angle, amplitude = 0.72) {
  const radius = Math.min(geometry.width, geometry.height) * 0.36 * amplitude;
  const x = geometry.x + Math.cos(angle) * radius;
  const y = geometry.y + Math.sin(angle) * radius;
  await mouse(client, "mouseMoved", x, y, "left", 1, 0);
}

async function releaseJoystick(client, geometry) {
  await mouse(client, "mouseReleased", geometry.x, geometry.y, "left", 0, 1);
}

function correctionSummary(evidence) {
  const corrections = Array.isArray(evidence?.corrections) ? evidence.corrections : [];
  const reasons = {};
  const rewind = [];
  const self = [];
  const remote = [];
  const prop = [];
  for (const event of corrections) {
    reasons[event.reason || "unknown"] = (reasons[event.reason || "unknown"] || 0) + 1;
    if (Number.isFinite(event.rewind)) rewind.push(event.rewind);
    if (Number.isFinite(event.delta?.self)) self.push(event.delta.self);
    if (Number.isFinite(event.delta?.remote)) remote.push(event.delta.remote);
    if (Number.isFinite(event.delta?.prop)) prop.push(event.delta.prop);
  }
  return {
    retained: corrections.length,
    reasons,
    rewindMedian: percentile(rewind, 0.5),
    rewindP95: percentile(rewind, 0.95),
    selfP95: percentile(self, 0.95),
    remoteP95: percentile(remote, 0.95),
    propP95: percentile(prop, 0.95),
  };
}

async function diagnostic(client) {
  if (!client) return null;
  try {
    return await evalIn(client, `({
      href: location.href,
      status: document.querySelector("#boot-status")?.textContent || null,
      evidence: window.__sharedYardV0Evidence?.() || null,
    })`);
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

const result = {
  verdict: "WORLD_V0_SMOOTHNESS_REGRESSION_FAIL",
  generatedAt: new Date().toISOString(),
  label: LABEL,
  page: PAGE_URL,
  movementSteps: MOVEMENT_STEPS,
  movementIntervalMs: MOVEMENT_INTERVAL_MS,
};

const chrome = findChrome();
let a = null;
let b = null;
try {
  a = await startBrowser(chrome, 0);
  b = await startBrowser(chrome, 1);
  const bootPredicate = `document.readyState === "complete" && document.querySelector("#enter")?.disabled === false && typeof window.__sharedYardV0Evidence === "function"`;
  await waitFor(a, bootPredicate, "A boot");
  await waitFor(b, bootPredicate, "B boot");

  const suffix = Date.now().toString(36).slice(-6);
  const run = `sm-${suffix}`;
  for (const [client, name] of [[a, `A-${suffix}`], [b, `B-${suffix}`]]) {
    await evalIn(client, `(() => {
      const c=document.querySelector("#callsign");
      const r=document.querySelector("#run");
      if (!c || !r) throw new Error("entry inputs missing");
      c.value=${JSON.stringify(name)};
      r.value=${JSON.stringify(run)};
      document.querySelector("#enter").click();
      return true;
    })()`);
  }

  const livePredicate = `(() => {
    const e=window.__sharedYardV0Evidence?.();
    return Boolean(e && !e.runtimeFailed && e.identity?.worldEpoch && Number.isInteger(e.protocolStartTick) && Number.isInteger(e.localBoundaryTick) && e.localBoundaryTick >= 60);
  })()`;
  await waitFor(a, livePredicate, "A live world");
  await waitFor(b, livePredicate, "B live world");

  const beforeA = await evalIn(a, `window.__sharedYardV0Evidence()`);
  const beforeB = await evalIn(b, `window.__sharedYardV0Evidence()`);
  assert(beforeA.identity.worldEpoch === beforeB.identity.worldEpoch, "clients started in different epochs");

  const joyA = await joystickGeometry(a);
  const joyB = await joystickGeometry(b);
  assert(joyA && joyA.width > 20 && joyA.height > 20 && joyA.display !== "none", `A joystick unavailable ${JSON.stringify(joyA)}`);
  assert(joyB && joyB.width > 20 && joyB.height > 20 && joyB.display !== "none", `B joystick unavailable ${JSON.stringify(joyB)}`);

  await pressJoystick(a, joyA);
  await pressJoystick(b, joyB);

  const samples = [];
  const movementStartedAt = Date.now();
  for (let step = 0; step < MOVEMENT_STEPS; step += 1) {
    const phase = step * 0.17;
    await Promise.all([
      moveJoystick(a, joyA, phase),
      moveJoystick(b, joyB, -phase * 1.07 + Math.PI * 0.65),
    ]);
    if (step % 20 === 0) {
      const [ea, eb] = await Promise.all([
        evalIn(a, `window.__sharedYardV0Evidence()`),
        evalIn(b, `window.__sharedYardV0Evidence()`),
      ]);
      samples.push({
        atMs: Date.now() - movementStartedAt,
        a: { boundary: ea.localBoundaryTick, corrections: ea.metrics?.corrections ?? null, state: ea.networkState },
        b: { boundary: eb.localBoundaryTick, corrections: eb.metrics?.corrections ?? null, state: eb.networkState },
      });
    }
    await sleep(MOVEMENT_INTERVAL_MS);
  }
  await releaseJoystick(a, joyA);
  await releaseJoystick(b, joyB);
  await sleep(1200);

  const afterA = await evalIn(a, `window.__sharedYardV0Evidence()`);
  const afterB = await evalIn(b, `window.__sharedYardV0Evidence()`);
  assert(!afterA.runtimeFailed && !afterB.runtimeFailed, `runtime failure A=${afterA.runtimeFailureReason} B=${afterB.runtimeFailureReason}`);
  assert(afterA.identity?.worldEpoch === beforeA.identity?.worldEpoch, "A epoch changed during movement");
  assert(afterB.identity?.worldEpoch === beforeB.identity?.worldEpoch, "B epoch changed during movement");
  assert((afterA.metrics?.guardMismatches ?? 0) === 0 && (afterB.metrics?.guardMismatches ?? 0) === 0, "state guard mismatch during movement");

  function side(before, after) {
    const tickDelta = Math.max(1, (after.localBoundaryTick ?? 0) - (before.localBoundaryTick ?? 0));
    const correctionDelta = Math.max(0, (after.metrics?.corrections ?? 0) - (before.metrics?.corrections ?? 0));
    return {
      uiRevision: after.uiRevision || null,
      clientSimRevision: after.clientSimRevision || after.identity?.clientSimRevision || null,
      simBuildId: after.expectedSimBuildId || after.identity?.simBuildId || null,
      networkState: after.networkState,
      boundaryBefore: before.localBoundaryTick,
      boundaryAfter: after.localBoundaryTick,
      tickDelta,
      correctionsBefore: before.metrics?.corrections ?? null,
      correctionsAfter: after.metrics?.corrections ?? null,
      correctionDelta,
      correctionsPerSecond: correctionDelta / (tickDelta / 60),
      generationRotations: after.metrics?.generationRotations ?? null,
      maxCorrection: after.metrics?.maxCorrection ?? null,
      latestRewind: after.metrics?.latestRewind ?? null,
      maxRewind: after.metrics?.maxRewind ?? null,
      serverLate: after.metrics?.serverLate ?? null,
      serverRejected: after.metrics?.serverRejected ?? null,
      leaseExpiredSeen: after.metrics?.leaseExpiredSeen ?? null,
      guardMatches: after.metrics?.guardMatches ?? null,
      guardMismatches: after.metrics?.guardMismatches ?? null,
      rtt: after.rtt ?? null,
      frame: after.frame ?? null,
      inputScheduler: after.inputScheduler ?? null,
      retainedCorrections: correctionSummary(after),
    };
  }

  Object.assign(result, {
    verdict: "WORLD_V0_SMOOTHNESS_REGRESSION_PASS",
    run,
    worldEpoch: afterA.identity.worldEpoch,
    movementDurationMs: Date.now() - movementStartedAt,
    samples,
    a: side(beforeA, afterA),
    b: side(beforeB, afterB),
  });
  writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
  console.log("WORLD_V0_SMOOTHNESS_REGRESSION_PASS", JSON.stringify({
    label: LABEL,
    aRate: result.a.correctionsPerSecond,
    bRate: result.b.correctionsPerSecond,
    aMaxSelf: result.a.maxCorrection?.self ?? null,
    bMaxSelf: result.b.maxCorrection?.self ?? null,
    aState: result.a.networkState,
    bState: result.b.networkState,
  }));
} catch (error) {
  result.error = error instanceof Error ? error.stack || error.message : String(error);
  result.aDiagnostic = await diagnostic(a);
  result.bDiagnostic = await diagnostic(b);
  result.aChromeStderr = a ? Buffer.concat(a.stderr).toString("utf8").slice(-5000) : null;
  result.bChromeStderr = b ? Buffer.concat(b.stderr).toString("utf8").slice(-5000) : null;
  writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
  throw error;
} finally {
  await stopBrowser(b);
  await stopBrowser(a);
}
