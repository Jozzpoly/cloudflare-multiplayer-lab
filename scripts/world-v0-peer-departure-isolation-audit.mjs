import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const BASE = (process.env.MW_WORLD_V0_PEER_ISO_BASE || "http://127.0.0.1:8787").replace(/\/$/, "");
const OUTPUT = process.env.MW_WORLD_V0_PEER_ISO_OUTPUT || "world-v0-peer-departure-isolation.json";
const ITERATIONS = Number(process.env.MW_WORLD_V0_PEER_ISO_ITERATIONS || 5);
const PORTS = [9912, 9913];
const TIMEOUT_MS = 45_000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const assert = (value, message) => { if (!value) throw new Error(message); };

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
      if (message.error) waiter.reject(new Error(`${waiter.method}: ${message.error.message}`));
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
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || "browser evaluation failed");
    return result.result?.value;
  }
  close() { try { this.ws.close(); } catch {} }
}

async function waitDebugger(port) {
  const start = Date.now();
  while (Date.now() - start < TIMEOUT_MS) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(1200) });
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
  const profile = mkdtempSync(join(tmpdir(), `mw-peer-iso-${index}-`));
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
  return { child, profile, stderr, cdp };
}

async function stopBrowser(browser) {
  if (!browser) return;
  browser.cdp?.close();
  if (browser.child?.exitCode === null) browser.child.kill("SIGKILL");
  try { rmSync(browser.profile, { recursive: true, force: true }); } catch {}
}

async function attachPage(browser, url) {
  const { targetId } = await browser.cdp.call("Target.createTarget", { url });
  const { sessionId } = await browser.cdp.call("Target.attachToTarget", { targetId, flatten: true });
  await browser.cdp.call("Runtime.enable", {}, sessionId);
  await browser.cdp.call("Page.enable", {}, sessionId);
  return { targetId, sessionId };
}

const evaluate = (browser, page, expression) => browser.cdp.evaluate(page.sessionId, expression);

async function waitFor(browser, page, expression, label, timeout = TIMEOUT_MS) {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < timeout) {
    try {
      last = await evaluate(browser, page, expression);
      if (last) return last;
    } catch (error) { last = error instanceof Error ? error.message : String(error); }
    await sleep(120);
  }
  throw new Error(`${label} timeout: ${JSON.stringify(last)}`);
}

async function navigate(browser, page, url) {
  await browser.cdp.call("Page.navigate", { url }, page.sessionId);
  await waitFor(browser, page, `document.readyState === "complete" && document.querySelector("#enter")?.disabled === false`, "page navigation");
}

async function enterDirect(browser, page, player) {
  const result = await evaluate(browser, page, `(() => {
    const input = document.querySelector("#callsign");
    input.value = ${JSON.stringify(player)};
    input.dispatchEvent(new Event("input", { bubbles: true }));
    const button = document.querySelector("#enter");
    if (!button || button.disabled) return false;
    button.click();
    return true;
  })()`);
  assert(result, "direct enter unavailable");
}

function liveExpression(minBoundary = 48) {
  return `(() => {
    const e = window.__sharedYardV0Evidence?.();
    return e && !e.runtimeFailed && e.networkState?.startsWith("live") &&
      Number.isInteger(e.localBoundaryTick) && e.localBoundaryTick >= ${minBoundary} &&
      e.metrics?.guardMismatches === 0 ? e : false;
  })()`;
}

const result = {
  verdict: "WORLD_V0_PEER_DEPARTURE_ISOLATION_FAIL",
  generatedAt: new Date().toISOString(),
  iterations: [],
};

const chrome = findChrome();
let aBrowser = null;
let bBrowser = null;
let aPage = null;
let bPage = null;

try {
  aBrowser = await startBrowser(chrome, 0);
  bBrowser = await startBrowser(chrome, 1);
  aPage = await attachPage(aBrowser, "about:blank");
  bPage = await attachPage(bBrowser, "about:blank");

  for (let index = 0; index < ITERATIONS; index += 1) {
    const run = `peeriso-${Date.now().toString(36)}-${index}`;
    const url = `${BASE}/world-v0/?run=${encodeURIComponent(run)}`;
    await navigate(aBrowser, aPage, url);
    await navigate(bBrowser, bPage, url);
    await enterDirect(aBrowser, aPage, `A-${index}`);
    await waitFor(aBrowser, aPage, `window.__sharedYardV0Session?.().networkState === "waiting for peer"`, `A waiting ${index}`);
    await enterDirect(bBrowser, bPage, `B-${index}`);
    const aBefore = await waitFor(aBrowser, aPage, liveExpression(), `A live ${index}`);
    const bBefore = await waitFor(bBrowser, bPage, liveExpression(), `B live ${index}`);
    assert(aBefore.identity.worldEpoch === bBefore.identity.worldEpoch, `epoch mismatch ${index}`);

    const baselineBoundary = aBefore.localBoundaryTick;
    const baselineEvents = aBefore.lifecycleEvents.length;
    const oldEpoch = aBefore.identity.worldEpoch;

    // Match the recording: peer B navigates away to the same direct URL and stops
    // on the Resume-world entry screen. B does not click Resume again.
    await navigate(bBrowser, bPage, url);
    await waitFor(bBrowser, bPage, `document.querySelector("#enter")?.textContent?.includes("Resume")`, `B resume screen ${index}`, 10_000);

    await sleep(8_000);
    const aAfter = await evaluate(aBrowser, aPage, `window.__sharedYardV0Evidence()`);
    assert(!aAfter.runtimeFailed, `A runtime failed after B departure ${index}`);
    assert(aAfter.identity?.worldEpoch === oldEpoch, `A epoch changed after B departure ${index}`);
    assert(aAfter.networkState?.startsWith("live"), `A not live after B departure ${index}: ${aAfter.networkState}`);
    assert(aAfter.session?.actorResume?.pending === false, `A actor resume pending after B departure ${index}`);
    assert(aAfter.metrics?.authoritySilenceResumes === aBefore.metrics?.authoritySilenceResumes, `A authority-silence resume after B departure ${index}`);
    assert(aAfter.localBoundaryTick > baselineBoundary + 300, `A authority did not advance after B departure ${index}`);
    assert(aAfter.metrics?.guardMismatches === 0, `A guard mismatch after B departure ${index}`);
    const newEvents = (aAfter.lifecycleEvents || []).slice(baselineEvents);
    assert(!newEvents.some((event) => event.type === "actor-resume-pending" || event.type === "socket-close" || event.type === "epoch-ended"),
      `A lifecycle interruption after B departure ${index}: ${JSON.stringify(newEvents)}`);

    result.iterations.push({
      index,
      run,
      worldEpoch: oldEpoch,
      boundaryBefore: baselineBoundary,
      boundaryAfter: aAfter.localBoundaryTick,
      authoritySilenceResumes: aAfter.metrics.authoritySilenceResumes,
      guardMismatches: aAfter.metrics.guardMismatches,
      newLifecycleEvents: newEvents,
    });
  }

  result.verdict = "WORLD_V0_PEER_DEPARTURE_ISOLATION_PASS";
  result.nonClaim = "Local causal falsifier only: proves peer navigation/departure does not itself interrupt the surviving client under controlled conditions. It does not explain the Owner-recorded remote 1006 or prove network reliability.";
  writeFileSync(OUTPUT, `${JSON.stringify(result, null, 2)}\n`);
  console.log(result.verdict, JSON.stringify({ iterations: result.iterations.length }));
} catch (error) {
  result.error = error instanceof Error ? error.stack || error.message : String(error);
  try { writeFileSync(OUTPUT, `${JSON.stringify(result, null, 2)}\n`); } catch {}
  console.error(result.error);
  process.exitCode = 1;
} finally {
  await stopBrowser(aBrowser);
  await stopBrowser(bBrowser);
}
