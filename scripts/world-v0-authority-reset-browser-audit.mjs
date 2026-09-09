import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const BASE = "http://127.0.0.1:8791";
const PAGE_URL = `${BASE}/world-v0/`;
const ROOM_ID = "yard-2";
const PORTS = [9961, 9962];
const TIMEOUT_MS = 50_000;
const OBSERVE_AFTER_RECOVERY_MS = 8_000;
const OUTPUT = process.env.MW_WORLD_V0_AUTHORITY_RESET_BROWSER_OUTPUT || "world-v0-authority-reset-browser.json";
const EXPECT = process.env.MW_WORLD_V0_AUTHORITY_RESET_EXPECT || "either";

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
  const child = spawn("npx", ["wrangler", "dev", "--env", "reliability_play", "--ip", "127.0.0.1", "--port", "8791"], {
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  const logs = [];
  child.stdout.on("data", (chunk) => logs.push(chunk));
  child.stderr.on("data", (chunk) => logs.push(chunk));
  worker = { child, logs, startedAt: new Date().toISOString() };
  return worker;
}
async function stopWorker() {
  if (!worker?.child || worker.child.exitCode !== null) return;
  try { process.kill(-worker.child.pid, "SIGTERM"); } catch { try { worker.child.kill("SIGTERM"); } catch {} }
  const deadline = Date.now() + 5000;
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
  throw new Error(`worker ping did not become ${expectUp ? "up" : "down"}`);
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
      if (message.error) waiter.reject(new Error(`${waiter.method}: ${message.error.message}`));
      else waiter.resolve(message.result || {});
    });
  }
  async call(method, params = {}, sessionId) {
    await this.opened;
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, method });
      const payload = { id, method, params };
      if (sessionId) payload.sessionId = sessionId;
      this.ws.send(JSON.stringify(payload));
    });
  }
  async evaluate(sessionId, expression) {
    const result = await this.call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, userGesture: true }, sessionId);
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || "browser evaluation failed");
    return result.result?.value;
  }
  close() { try { this.ws.close(); } catch {} }
}

async function waitDebugger(port) {
  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(1000) });
      if (response.ok) {
        const value = await response.json();
        if (value.webSocketDebuggerUrl) return value;
      }
    } catch {}
    await sleep(100);
  }
  throw new Error(`debugger ${port} unavailable`);
}
async function startBrowser(binary, index) {
  const profile = mkdtempSync(join(tmpdir(), `mw-authority-reset-browser-${index}-`));
  const child = spawn(binary, [
    "--headless=new", "--no-sandbox", "--disable-dev-shm-usage",
    "--disable-background-networking", "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding",
    "--use-gl=angle", "--use-angle=swiftshader-webgl", "--enable-unsafe-swiftshader",
    `--remote-debugging-port=${PORTS[index]}`, "--remote-debugging-address=127.0.0.1",
    `--user-data-dir=${profile}`, "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"] });
  const stderr = [];
  child.stderr.on("data", (chunk) => stderr.push(chunk));
  const info = await waitDebugger(PORTS[index]);
  const cdp = new Cdp(info.webSocketDebuggerUrl);
  await cdp.opened;
  return { profile, child, stderr, cdp };
}
async function stopBrowser(browser) {
  if (!browser) return;
  browser.cdp?.close();
  if (browser.child?.exitCode === null) browser.child.kill("SIGKILL");
  try { rmSync(browser.profile, { recursive: true, force: true }); } catch {}
}
async function attachPage(browser) {
  const created = await browser.cdp.call("Target.createTarget", { url: PAGE_URL });
  const attached = await browser.cdp.call("Target.attachToTarget", { targetId: created.targetId, flatten: true });
  await browser.cdp.call("Runtime.enable", {}, attached.sessionId);
  await browser.cdp.call("Page.enable", {}, attached.sessionId);
  return { targetId: created.targetId, sessionId: attached.sessionId };
}
async function evaluate(browser, page, expression) { return browser.cdp.evaluate(page.sessionId, expression); }
async function waitFor(browser, page, expression, label, timeout = TIMEOUT_MS) {
  const deadline = Date.now() + timeout;
  let last = null;
  while (Date.now() < deadline) {
    try { last = await evaluate(browser, page, expression); if (last) return last; }
    catch (error) { last = error instanceof Error ? error.message : String(error); }
    await sleep(120);
  }
  throw new Error(`${label} timeout · last=${JSON.stringify(last)}`);
}
async function boot(browser, page) {
  await waitFor(browser, page, `document.readyState === "complete" && document.querySelector("#enter")?.disabled === false && typeof window.__sharedYardV0PublicRoomEntry === "function"`, "page boot", 35_000);
  await waitFor(browser, page, `window.__sharedYardV0PublicRoomEntry().rooms.some((r) => r.id === ${JSON.stringify(ROOM_ID)})`, "room directory");
}
async function enter(browser, page, name) {
  const value = await evaluate(browser, page, `(() => {
    const input=document.querySelector("#callsign"); input.value=${JSON.stringify(name)}; input.dispatchEvent(new Event("input",{bubbles:true}));
    const button=document.querySelector('.public-room-card[data-room-id=${JSON.stringify(ROOM_ID)}]');
    if(!button || button.disabled) return {ok:false,text:button?.textContent||null}; button.click(); return {ok:true};
  })()`);
  assert(value?.ok, `entry unavailable ${JSON.stringify(value)}`);
}

const live = `(() => { const e=window.__sharedYardV0Evidence?.(); return e && !e.runtimeFailed && e.identity?.worldEpoch && Number.isInteger(e.localBoundaryTick) && e.localBoundaryTick>=48 && e.metrics?.guardMismatches===0; })()`;
const chrome = findChrome();
let aBrowser, bBrowser, aPage, bPage;
const result = { generatedAt: new Date().toISOString(), roomId: ROOM_ID, expected: EXPECT };
try {
  startWorker(); await waitPing(true);
  aBrowser = await startBrowser(chrome, 0); bBrowser = await startBrowser(chrome, 1);
  aPage = await attachPage(aBrowser); bPage = await attachPage(bBrowser);
  await boot(aBrowser, aPage); await boot(bBrowser, bPage);
  await enter(aBrowser, aPage, "ResetBrowserA");
  await waitFor(aBrowser, aPage, `window.__sharedYardV0Session?.().networkState === "waiting for peer"`, "A waiting");
  await enter(bBrowser, bPage, "ResetBrowserB");
  await waitFor(aBrowser, aPage, live, "A live"); await waitFor(bBrowser, bPage, live, "B live");
  const beforeA = await evaluate(aBrowser, aPage, `window.__sharedYardV0Evidence()`);
  const beforeB = await evaluate(bBrowser, bPage, `window.__sharedYardV0Evidence()`);
  assert(beforeA.identity.worldEpoch === beforeB.identity.worldEpoch, "initial epoch mismatch");
  result.oldEpoch = beforeA.identity.worldEpoch;
  result.beforeA = beforeA; result.beforeB = beforeB;

  result.authorityKilledAt = new Date().toISOString();
  await stopWorker(); await waitPing(false, 5000);
  await waitFor(aBrowser, aPage, `window.__sharedYardV0Evidence?.().lifecycleEvents?.some((x)=>x.type==="actor-resume-pending" && x.code===1006)`, "A saw reset 1006", 10_000);
  await waitFor(bBrowser, bPage, `window.__sharedYardV0Evidence?.().lifecycleEvents?.some((x)=>x.type==="actor-resume-pending" && x.code===1006)`, "B saw reset 1006", 10_000);

  result.authorityRestartedAt = new Date().toISOString();
  startWorker(); await waitPing(true, 20_000);

  const deadline = Date.now() + 40_000;
  let outcome = null;
  while (Date.now() < deadline) {
    const a = await evaluate(aBrowser, aPage, `window.__sharedYardV0Evidence()`);
    const b = await evaluate(bBrowser, bPage, `window.__sharedYardV0Evidence()`);
    const bothRecovered = !a.runtimeFailed && !b.runtimeFailed && a.identity?.worldEpoch && a.identity.worldEpoch === b.identity?.worldEpoch && a.identity.worldEpoch !== result.oldEpoch && a.lifecycleEvents?.some((x)=>x.type==="room-recovered") && b.lifecycleEvents?.some((x)=>x.type==="room-recovered") && Number.isInteger(a.protocolStartTick) && Number.isInteger(b.protocolStartTick) && Number.isInteger(a.localBoundaryTick) && Number.isInteger(b.localBoundaryTick);
    if (bothRecovered) { outcome = "recovered"; result.recoveredA = a; result.recoveredB = b; break; }
    const fatalA = a.runtimeFailed && a.runtimeFailureReason === "actor_session_resume_exhausted";
    const fatalB = b.runtimeFailed && b.runtimeFailureReason === "actor_session_resume_exhausted";
    if (fatalA || fatalB) { outcome = "fatal"; result.fatalA = a; result.fatalB = b; break; }
    await sleep(150);
  }
  if (!outcome) {
    result.timeoutA = await evaluate(aBrowser, aPage, `window.__sharedYardV0Evidence()`);
    result.timeoutB = await evaluate(bBrowser, bPage, `window.__sharedYardV0Evidence()`);
    throw new Error("authority reset browser outcome timeout");
  }

  result.outcome = outcome;
  if (outcome === "recovered") {
    const startA = result.recoveredA.localBoundaryTick;
    const startB = result.recoveredB.localBoundaryTick;
    await sleep(OBSERVE_AFTER_RECOVERY_MS);
    const afterA = await evaluate(aBrowser, aPage, `window.__sharedYardV0Evidence()`);
    const afterB = await evaluate(bBrowser, bPage, `window.__sharedYardV0Evidence()`);
    result.afterA = afterA; result.afterB = afterB;
    assert(!afterA.runtimeFailed && !afterB.runtimeFailed, "runtime failed after fresh authority recovery");
    assert(afterA.identity?.worldEpoch === afterB.identity?.worldEpoch && afterA.identity?.worldEpoch !== result.oldEpoch, "replacement epoch identity mismatch");
    assert(afterA.localBoundaryTick > startA + 120 && afterB.localBoundaryTick > startB + 120, "replacement epoch did not progress");
    assert(afterA.metrics?.guardMismatches === 0 && afterB.metrics?.guardMismatches === 0, "guard mismatch after authority recovery");
    result.verdict = "WORLD_V0_AUTHORITY_RESET_BROWSER_RECOVERED";
  } else {
    result.verdict = "WORLD_V0_AUTHORITY_RESET_BROWSER_FATAL_CONFIRMED";
  }

  if (EXPECT !== "either") assert(outcome === EXPECT, `expected ${EXPECT} but observed ${outcome}`);
  writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
  console.log(result.verdict, JSON.stringify({ oldEpoch: result.oldEpoch, outcome, newEpoch: result.afterA?.identity?.worldEpoch || null }));
} catch (error) {
  result.error = error instanceof Error ? error.stack || error.message : String(error);
  for (const [name,browser,page] of [["a",aBrowser,aPage],["b",bBrowser,bPage]]) {
    try { if (browser && page) result[`${name}EvidenceAtError`] = await evaluate(browser,page,`window.__sharedYardV0Evidence?.()`); } catch {}
    if (browser) result[`${name}Stderr`] = Buffer.concat(browser.stderr || []).toString("utf8").slice(-4000);
  }
  writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
  throw error;
} finally {
  await stopWorker();
  await stopBrowser(bBrowser); await stopBrowser(aBrowser);
}
