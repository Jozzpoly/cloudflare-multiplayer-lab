import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const BASE = "http://127.0.0.1:8794";
const PAGE_URL = `${BASE}/world-v0/`;
const ROOM_ID = "yard-1";
const CYCLES = Number(process.env.MW_WORLD_V0_AUTHORITY_REPEAT_CYCLES || 3);
const OUTPUT = process.env.MW_WORLD_V0_AUTHORITY_REPEAT_OUTPUT || "world-v0-authority-loss-repeat.json";
const DEBUG_PORTS = [9971, 9972];
const TIMEOUT_MS = 45_000;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function assert(value, message) { if (!value) throw new Error(message); }

function findChrome() {
  const override = process.env.CHROME_BIN?.trim();
  if (override) return override;
  const probe = spawnSync("bash", ["-lc", "command -v google-chrome || command -v google-chrome-stable || command -v chromium || command -v chromium-browser"], { encoding: "utf8" });
  const binary = probe.stdout.trim().split("\n")[0];
  if (!binary) throw new Error(`Chrome/Chromium binary not found: ${probe.stderr || "no candidate"}`);
  return binary;
}

let worker = null;
function startWorker() {
  const child = spawn("npx", ["wrangler", "dev", "--env", "reliability_play", "--ip", "127.0.0.1", "--port", "8794"], {
    stdio: ["ignore", "pipe", "pipe"], detached: true,
  });
  const logs = [];
  child.stdout.on("data", (chunk) => logs.push(chunk));
  child.stderr.on("data", (chunk) => logs.push(chunk));
  worker = { child, logs };
}
async function stopWorker() {
  if (!worker?.child || worker.child.exitCode !== null) return;
  try { process.kill(-worker.child.pid, "SIGTERM"); } catch { try { worker.child.kill("SIGTERM"); } catch {} }
  const deadline = Date.now() + 4000;
  while (Date.now() < deadline && worker.child.exitCode === null) await sleep(50);
  if (worker.child.exitCode === null) {
    try { process.kill(-worker.child.pid, "SIGKILL"); } catch { try { worker.child.kill("SIGKILL"); } catch {} }
  }
}
async function waitPing(expectUp, timeout = 20_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    let up = false;
    try { up = (await fetch(`${BASE}/api/ping`, { cache: "no-store", signal: AbortSignal.timeout(700) })).ok; } catch {}
    if (up === expectUp) return;
    await sleep(80);
  }
  throw new Error(`worker did not become ${expectUp ? "up" : "down"}`);
}

class Cdp {
  constructor(url) {
    this.ws = new WebSocket(url); this.nextId = 1; this.pending = new Map();
    this.opened = new Promise((resolve, reject) => {
      this.ws.addEventListener("open", resolve, { once: true });
      this.ws.addEventListener("error", () => reject(new Error("CDP open failed")), { once: true });
    });
    this.ws.addEventListener("message", async (event) => {
      const raw = typeof event.data === "string" ? event.data : await event.data.text();
      const message = JSON.parse(raw); if (!message.id) return;
      const waiter = this.pending.get(message.id); if (!waiter) return;
      this.pending.delete(message.id);
      if (message.error) waiter.reject(new Error(`${waiter.method}: ${message.error.message}`));
      else waiter.resolve(message.result || {});
    });
  }
  async call(method, params = {}, sessionId) {
    await this.opened; const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, method });
      const payload = { id, method, params }; if (sessionId) payload.sessionId = sessionId;
      this.ws.send(JSON.stringify(payload));
    });
  }
  async evaluate(sessionId, expression) {
    const result = await this.call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, userGesture: true }, sessionId);
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || "browser evaluate failed");
    return result.result?.value;
  }
  close() { try { this.ws.close(); } catch {} }
}

async function waitDebugger(port) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(1000) });
      if (response.ok) { const value = await response.json(); if (value.webSocketDebuggerUrl) return value; }
    } catch {}
    await sleep(100);
  }
  throw new Error(`debugger ${port} unavailable`);
}
async function startBrowser(binary, index) {
  const profile = mkdtempSync(join(tmpdir(), `mw-authority-repeat-${index}-`));
  const child = spawn(binary, [
    "--headless=new", "--no-sandbox", "--disable-dev-shm-usage",
    "--disable-background-networking", "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding",
    "--use-gl=angle", "--use-angle=swiftshader-webgl", "--enable-unsafe-swiftshader",
    `--remote-debugging-port=${DEBUG_PORTS[index]}`, "--remote-debugging-address=127.0.0.1",
    `--user-data-dir=${profile}`, "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"] });
  const stderr = []; child.stderr.on("data", (chunk) => stderr.push(chunk));
  const info = await waitDebugger(DEBUG_PORTS[index]);
  const cdp = new Cdp(info.webSocketDebuggerUrl); await cdp.opened;
  const created = await cdp.call("Target.createTarget", { url: PAGE_URL });
  const attached = await cdp.call("Target.attachToTarget", { targetId: created.targetId, flatten: true });
  await cdp.call("Runtime.enable", {}, attached.sessionId); await cdp.call("Page.enable", {}, attached.sessionId);
  return { profile, child, stderr, cdp, targetId: created.targetId, sessionId: attached.sessionId };
}
async function stopBrowser(browser) {
  if (!browser) return; browser.cdp?.close(); if (browser.child?.exitCode === null) browser.child.kill("SIGKILL");
  try { rmSync(browser.profile, { recursive: true, force: true }); } catch {}
}
async function evaluate(browser, expression) { return browser.cdp.evaluate(browser.sessionId, expression); }
async function waitFor(browser, expression, label, timeout = TIMEOUT_MS) {
  const deadline = Date.now() + timeout; let last = null;
  while (Date.now() < deadline) {
    try { last = await evaluate(browser, expression); if (last) return last; } catch (error) { last = error instanceof Error ? error.message : String(error); }
    await sleep(120);
  }
  throw new Error(`${label} timeout · last=${JSON.stringify(last)}`);
}
async function boot(browser) {
  await waitFor(browser, `document.readyState === "complete" && document.querySelector("#enter")?.disabled === false && typeof window.__sharedYardV0PublicRoomEntry === "function"`, "browser boot", 35_000);
}
async function enterRoom(browser, name) {
  const result = await evaluate(browser, `(() => {
    const input=document.querySelector("#callsign"); input.value=${JSON.stringify(name)}; input.dispatchEvent(new Event("input",{bubbles:true}));
    const button=document.querySelector('.public-room-card[data-room-id=${JSON.stringify(ROOM_ID)}]');
    if(!button || button.disabled) return {ok:false,text:button?.textContent||null}; button.click(); return {ok:true};
  })()`);
  assert(result?.ok, `entry unavailable ${JSON.stringify(result)}`);
}
const live = `(() => { const e=window.__sharedYardV0Evidence?.(); return e && !e.runtimeFailed && e.identity?.worldEpoch && Number.isInteger(e.protocolStartTick) && Number.isInteger(e.localBoundaryTick) && e.localBoundaryTick >= e.protocolStartTick + 60 && e.metrics?.guardMismatches===0; })()`;

const chrome = findChrome(); let a = null; let b = null;
const result = { verdict: "WORLD_V0_AUTHORITY_LOSS_REPEAT_FAIL", cyclesRequested: CYCLES, cycles: [], generatedAt: new Date().toISOString() };
try {
  startWorker(); await waitPing(true);
  a = await startBrowser(chrome, 0); b = await startBrowser(chrome, 1); await boot(a); await boot(b);
  await enterRoom(a, "Repeat-A"); await waitFor(a, `window.__sharedYardV0Session?.().networkState === "waiting for peer"`, "A waiting");
  await enterRoom(b, "Repeat-B"); await waitFor(a, live, "A initial live"); await waitFor(b, live, "B initial live");

  for (let cycle = 1; cycle <= CYCLES; cycle += 1) {
    const beforeA = await evaluate(a, `window.__sharedYardV0Evidence()`); const beforeB = await evaluate(b, `window.__sharedYardV0Evidence()`);
    assert(beforeA.identity.worldEpoch === beforeB.identity.worldEpoch, `cycle ${cycle} pre-reset epoch disagreement`);
    const oldEpoch = beforeA.identity.worldEpoch; const oldASession = beforeA.session.actorSessionId; const oldBSession = beforeB.session.actorSessionId;
    await stopWorker(); await waitPing(false, 5000);
    await waitFor(a, `window.__sharedYardV0Evidence?.().session?.actorResume?.pending === true`, `A cycle ${cycle} resume pending`, 12_000);
    await waitFor(b, `window.__sharedYardV0Evidence?.().session?.actorResume?.pending === true`, `B cycle ${cycle} resume pending`, 12_000);
    startWorker(); await waitPing(true);
    await waitFor(a, `(() => { const e=window.__sharedYardV0Evidence?.(); return e && !e.runtimeFailed && e.identity?.worldEpoch && e.identity.worldEpoch !== ${JSON.stringify(oldEpoch)} && e.session?.roomRecovery?.lastRecoveredEpoch===e.identity.worldEpoch && (e.lifecycleEvents||[]).some(x=>x.type==="room-reconnect-attempt" && x.reason==="authority_epoch_lost_recovery") && Number.isInteger(e.protocolStartTick) && Number.isInteger(e.localBoundaryTick) && e.localBoundaryTick>=e.protocolStartTick+40 && e.metrics?.guardMismatches===0; })()`, `A cycle ${cycle} recovered`, 35_000);
    await waitFor(b, `(() => { const e=window.__sharedYardV0Evidence?.(); return e && !e.runtimeFailed && e.identity?.worldEpoch && e.identity.worldEpoch !== ${JSON.stringify(oldEpoch)} && e.session?.roomRecovery?.lastRecoveredEpoch===e.identity.worldEpoch && (e.lifecycleEvents||[]).some(x=>x.type==="room-reconnect-attempt" && x.reason==="authority_epoch_lost_recovery") && Number.isInteger(e.protocolStartTick) && Number.isInteger(e.localBoundaryTick) && e.localBoundaryTick>=e.protocolStartTick+40 && e.metrics?.guardMismatches===0; })()`, `B cycle ${cycle} recovered`, 35_000);
    const afterA = await evaluate(a, `window.__sharedYardV0Evidence()`); const afterB = await evaluate(b, `window.__sharedYardV0Evidence()`);
    assert(afterA.identity.worldEpoch === afterB.identity.worldEpoch, `cycle ${cycle} replacement epoch disagreement`);
    assert(afterA.session.actorSessionId !== oldASession && afterB.session.actorSessionId !== oldBSession, `cycle ${cycle} stale ActorSession survived authority loss`);
    result.cycles.push({ cycle, oldEpoch, newEpoch: afterA.identity.worldEpoch, oldASession, newASession: afterA.session.actorSessionId, oldBSession, newBSession: afterB.session.actorSessionId, aBoundary: afterA.localBoundaryTick, bBoundary: afterB.localBoundaryTick, aGuardMismatches: afterA.metrics.guardMismatches, bGuardMismatches: afterB.metrics.guardMismatches });
  }

  const finalA0 = await evaluate(a, `window.__sharedYardV0Evidence()`); const finalB0 = await evaluate(b, `window.__sharedYardV0Evidence()`); await sleep(5000);
  const finalA = await evaluate(a, `window.__sharedYardV0Evidence()`); const finalB = await evaluate(b, `window.__sharedYardV0Evidence()`);
  assert(finalA.localBoundaryTick > finalA0.localBoundaryTick + 200 && finalB.localBoundaryTick > finalB0.localBoundaryTick + 200, "post-cycle progression stalled");
  assert(!finalA.runtimeFailed && !finalB.runtimeFailed && finalA.metrics.guardMismatches === 0 && finalB.metrics.guardMismatches === 0, "post-cycle final health failed");
  result.verdict = "WORLD_V0_AUTHORITY_LOSS_REPEAT_PASS";
  result.final = { epoch: finalA.identity.worldEpoch, aBoundaryDelta: finalA.localBoundaryTick-finalA0.localBoundaryTick, bBoundaryDelta: finalB.localBoundaryTick-finalB0.localBoundaryTick };
  writeFileSync(OUTPUT, JSON.stringify(result, null, 2)); console.log(result.verdict, JSON.stringify(result));
} catch (error) {
  result.error = error instanceof Error ? error.stack || error.message : String(error);
  try { result.aAtError = a ? await evaluate(a, `window.__sharedYardV0Evidence?.()`) : null; } catch {}
  try { result.bAtError = b ? await evaluate(b, `window.__sharedYardV0Evidence?.()`) : null; } catch {}
  writeFileSync(OUTPUT, JSON.stringify(result, null, 2)); throw error;
} finally {
  await stopWorker(); await stopBrowser(b); await stopBrowser(a);
}
