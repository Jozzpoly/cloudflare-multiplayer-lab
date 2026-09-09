import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const BASE = (process.env.MW_WORLD_V0_PEER_ISO_BASE || "http://127.0.0.1:8787").replace(/\/$/, "");
const PAGE_URL = `${BASE}/world-v0/`;
const OUTPUT = process.env.MW_WORLD_V0_PEER_ISO_OUTPUT || "world-v0-peer-departure-isolation.json";
const ROOMS = ["yard-1", "yard-2", "yard-3"];
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
  const started = Date.now();
  while (Date.now() - started < TIMEOUT_MS) {
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
  const profile = mkdtempSync(join(tmpdir(), `mw-peer-iso-public-${index}-`));
  const child = spawn(binary, [
    "--headless=new", "--no-sandbox", "--disable-dev-shm-usage",
    "--disable-background-networking", "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding",
    "--use-gl=angle", "--use-angle=swiftshader-webgl", "--enable-unsafe-swiftshader",
    `--remote-debugging-port=${PORTS[index]}`, "--remote-debugging-address=127.0.0.1",
    `--user-data-dir=${profile}`, "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"] });
  const info = await waitDebugger(PORTS[index]);
  const cdp = new Cdp(info.webSocketDebuggerUrl);
  await cdp.opened;
  return { child, profile, cdp };
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

async function bootDirectory(browser, page, room) {
  await waitFor(browser, page, `typeof window.__sharedYardV0PublicRoomEntry === "function" && window.__sharedYardV0PublicRoomEntry().rooms.some((r) => r.id === ${JSON.stringify(room)})`, `directory ${room}`);
}

async function enterRoom(browser, page, room, name) {
  const value = await evaluate(browser, page, `(() => {
    const input = document.querySelector("#callsign");
    input.value = ${JSON.stringify(name)};
    input.dispatchEvent(new Event("input", { bubbles: true }));
    const button = document.querySelector('.public-room-card[data-room-id=${JSON.stringify(room)}]');
    if (!button || button.disabled) return { ok: false, text: button?.textContent || null };
    button.click();
    return { ok: true };
  })()`);
  assert(value?.ok, `room entry unavailable ${room}: ${JSON.stringify(value)}`);
}

function liveExpression(minBoundary = 48) {
  return `(() => {
    const e = window.__sharedYardV0Evidence?.();
    return e && !e.runtimeFailed && e.networkState?.startsWith("live") && Number.isInteger(e.localBoundaryTick) && e.localBoundaryTick >= ${minBoundary} && e.metrics?.guardMismatches === 0 ? e : false;
  })()`;
}

const result = { verdict: "WORLD_V0_PEER_DEPARTURE_ISOLATION_FAIL", generatedAt: new Date().toISOString(), iterations: [] };
const chrome = findChrome();
let aBrowser = null;
let bBrowser = null;
let aPage = null;
let bPage = null;

try {
  aBrowser = await startBrowser(chrome, 0);
  bBrowser = await startBrowser(chrome, 1);
  aPage = await attachPage(aBrowser, PAGE_URL);
  bPage = await attachPage(bBrowser, PAGE_URL);

  for (let index = 0; index < ROOMS.length; index += 1) {
    const room = ROOMS[index];
    await navigate(aBrowser, aPage, PAGE_URL);
    await navigate(bBrowser, bPage, PAGE_URL);
    await bootDirectory(aBrowser, aPage, room);
    await bootDirectory(bBrowser, bPage, room);
    await enterRoom(aBrowser, aPage, room, `OwnerA${index}`);
    await waitFor(aBrowser, aPage, `window.__sharedYardV0Session?.().networkState === "waiting for peer"`, `A waiting ${room}`);
    await enterRoom(bBrowser, bPage, room, `PeerB${index}`);
    const aBefore = await waitFor(aBrowser, aPage, liveExpression(), `A live ${room}`);
    const bBefore = await waitFor(bBrowser, bPage, liveExpression(), `B live ${room}`);
    assert(aBefore.identity.worldEpoch === bBefore.identity.worldEpoch, `epoch mismatch ${room}`);

    const baselineEvents = aBefore.lifecycleEvents.length;
    const baselineBoundary = aBefore.localBoundaryTick;
    const oldEpoch = aBefore.identity.worldEpoch;
    const resumeCount = aBefore.metrics.authoritySilenceResumes;

    const direct = `${PAGE_URL}?run=${encodeURIComponent(room)}`;
    await navigate(bBrowser, bPage, direct);
    await waitFor(bBrowser, bPage, `document.querySelector("#enter")?.textContent?.includes("Resume")`, `B resume screen ${room}`, 10_000);
    await sleep(8_000);

    const aAfter = await evaluate(aBrowser, aPage, `window.__sharedYardV0Evidence()`);
    const newEvents = (aAfter.lifecycleEvents || []).slice(baselineEvents);
    assert(!aAfter.runtimeFailed, `A runtime failed ${room}`);
    assert(aAfter.identity?.worldEpoch === oldEpoch, `A epoch changed ${room}`);
    assert(aAfter.networkState?.startsWith("live"), `A not live ${room}: ${aAfter.networkState}`);
    assert(aAfter.session?.actorResume?.pending === false, `A actor resume pending ${room}`);
    assert(aAfter.metrics?.authoritySilenceResumes === resumeCount, `A authority-silence resume ${room}`);
    assert(aAfter.localBoundaryTick > baselineBoundary + 300, `A authority did not advance ${room}`);
    assert(aAfter.metrics?.guardMismatches === 0, `A guard mismatch ${room}`);
    assert(!newEvents.some((event) => ["actor-resume-pending", "socket-close", "epoch-ended"].includes(event.type)), `A lifecycle interruption ${room}: ${JSON.stringify(newEvents)}`);

    result.iterations.push({ room, worldEpoch: oldEpoch, boundaryBefore: baselineBoundary, boundaryAfter: aAfter.localBoundaryTick, newLifecycleEvents: newEvents });
  }

  result.verdict = "WORLD_V0_PEER_DEPARTURE_ISOLATION_PASS";
  result.nonClaim = "Three independent local public-room repetitions. This proves peer navigation/departure does not itself interrupt the surviving client under controlled conditions; it does not explain a remote Owner-recorded 1006.";
  writeFileSync(OUTPUT, `${JSON.stringify(result, null, 2)}\n`);
  console.log(result.verdict, JSON.stringify({ rooms: result.iterations.map((item) => item.room) }));
} catch (error) {
  result.error = error instanceof Error ? error.stack || error.message : String(error);
  try { writeFileSync(OUTPUT, `${JSON.stringify(result, null, 2)}\n`); } catch {}
  console.error(result.error);
  process.exitCode = 1;
} finally {
  await stopBrowser(aBrowser);
  await stopBrowser(bBrowser);
}
