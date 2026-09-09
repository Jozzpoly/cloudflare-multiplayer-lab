import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const BASE = (process.env.MW_WORLD_V0_SOFT_BROWSER_BASE || "http://127.0.0.1:8787").replace(/\/$/, "");
const PAGE_URL = `${BASE}/world-v0/`;
const ROOM_ID = process.env.MW_WORLD_V0_SOFT_BROWSER_ROOM || "yard-3";
const DIRECT_URL = `${PAGE_URL}?run=${encodeURIComponent(ROOM_ID)}`;
const OUTPUT = process.env.MW_WORLD_V0_SOFT_BROWSER_OUTPUT || "world-v0-soft-preemption-browser.json";
const PORTS = [9901, 9902, 9903];
const TIMEOUT_MS = 45_000;
const SOFT_TIMEOUT_MS = 32_000;

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function assert(value, message) { if (!value) throw new Error(message); }

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
  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
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
  const profile = mkdtempSync(join(tmpdir(), `mw-soft-browser-${index}-`));
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

async function attachPage(browser, url) {
  const created = await browser.cdp.call("Target.createTarget", { url });
  const attached = await browser.cdp.call("Target.attachToTarget", { targetId: created.targetId, flatten: true });
  await browser.cdp.call("Runtime.enable", {}, attached.sessionId);
  await browser.cdp.call("Page.enable", {}, attached.sessionId);
  return { targetId: created.targetId, sessionId: attached.sessionId };
}

async function closePage(browser, page) {
  if (!page?.targetId) return;
  try { await browser.cdp.call("Target.closeTarget", { targetId: page.targetId }); } catch {}
  page.targetId = null;
  page.sessionId = null;
}

async function evaluate(browser, page, expression) {
  return await browser.cdp.evaluate(page.sessionId, expression);
}

async function waitFor(browser, page, expression, label, timeout = TIMEOUT_MS) {
  const deadline = Date.now() + timeout;
  let last = null;
  while (Date.now() < deadline) {
    try {
      last = await evaluate(browser, page, expression);
      if (last) return last;
    } catch (error) { last = error instanceof Error ? error.message : String(error); }
    await sleep(120);
  }
  throw new Error(`${label} timeout · last=${JSON.stringify(last)}`);
}

async function room() {
  const response = await fetch(`${BASE}/api/world-v0/rooms?r=${Date.now()}`, { cache: "no-store" });
  assert(response.ok, `directory HTTP ${response.status}`);
  const payload = await response.json();
  const value = payload.rooms?.find((candidate) => candidate.id === ROOM_ID);
  assert(value, `room ${ROOM_ID} missing`);
  return value;
}

async function waitRoom(predicate, label, timeout = TIMEOUT_MS) {
  const deadline = Date.now() + timeout;
  let last = null;
  while (Date.now() < deadline) {
    try {
      last = await room();
      if (predicate(last)) return last;
    } catch (error) { last = error; }
    await sleep(100);
  }
  throw new Error(`${label} timeout · last=${last instanceof Error ? last.message : JSON.stringify(last)}`);
}

async function bootDirectory(browser, page) {
  await waitFor(browser, page, `document.readyState === "complete" && document.querySelector("#enter")?.disabled === false && typeof window.__sharedYardV0PublicRoomEntry === "function"`, "directory boot");
  await waitFor(browser, page, `window.__sharedYardV0PublicRoomEntry().rooms.some((r) => r.id === ${JSON.stringify(ROOM_ID)})`, "room visible");
}

async function bootDirect(browser, page) {
  await waitFor(browser, page, `document.readyState === "complete" && document.querySelector("#enter")?.disabled === false && typeof window.__sharedYardV0FriendEntry === "function"`, "direct boot");
}

async function enterRoom(browser, page, name) {
  const result = await evaluate(browser, page, `(() => {
    const input = document.querySelector("#callsign");
    input.value = ${JSON.stringify(name)};
    input.dispatchEvent(new Event("input", { bubbles: true }));
    const button = document.querySelector('.public-room-card[data-room-id=${JSON.stringify(ROOM_ID)}]');
    if (!button || button.disabled) return { ok: false, text: button?.textContent || null };
    button.click();
    return { ok: true };
  })()`);
  assert(result?.ok, `room entry unavailable ${JSON.stringify(result)}`);
}

const livePredicate = `(() => {
  const e = window.__sharedYardV0Evidence?.();
  return e && !e.runtimeFailed && e.identity?.worldEpoch && Number.isInteger(e.localBoundaryTick) && e.localBoundaryTick >= 36 && e.metrics?.guardMismatches === 0;
})()`;

const chrome = findChrome();
let stayBrowser = null;
let dropBrowser = null;
let newcomerBrowser = null;
let stayPage = null;
let dropPage = null;
let newcomerPage = null;
let stalePage = null;
const result = { verdict: "WORLD_V0_SOFT_PREEMPTION_BROWSER_FAIL", roomId: ROOM_ID, generatedAt: new Date().toISOString() };

try {
  stayBrowser = await startBrowser(chrome, 0);
  dropBrowser = await startBrowser(chrome, 1);
  newcomerBrowser = await startBrowser(chrome, 2);
  stayPage = await attachPage(stayBrowser, PAGE_URL);
  dropPage = await attachPage(dropBrowser, PAGE_URL);
  await bootDirectory(stayBrowser, stayPage);
  await bootDirectory(dropBrowser, dropPage);

  await enterRoom(stayBrowser, stayPage, "Soft-Stay");
  await waitFor(stayBrowser, stayPage, `window.__sharedYardV0Session?.().networkState === "waiting for peer"`, "stayer waiting");
  await enterRoom(dropBrowser, dropPage, "Soft-Drop");
  await waitFor(stayBrowser, stayPage, livePredicate, "stayer live");
  await waitFor(dropBrowser, dropPage, livePredicate, "dropper live");

  const stayBefore = await evaluate(stayBrowser, stayPage, `window.__sharedYardV0Evidence()`);
  const dropBefore = await evaluate(dropBrowser, dropPage, `window.__sharedYardV0Evidence()`);
  assert(stayBefore.identity.worldEpoch === dropBefore.identity.worldEpoch, "initial epoch mismatch");
  const oldEpoch = stayBefore.identity.worldEpoch;
  const oldStaySession = stayBefore.session.actorSessionId;

  await closePage(dropBrowser, dropPage);
  dropPage = null;
  const protectedRoom = await waitRoom((r) => r.worldEpoch === oldEpoch && r.connected === 1 && r.protectedReserved === 1, "protected room");
  assert(protectedRoom.joinable === false, "protected seat unexpectedly joinable");
  const softRoom = await waitRoom((r) => r.worldEpoch === oldEpoch && r.connected === 1 && r.softReserved === 1 && r.joinable === true, "soft room", SOFT_TIMEOUT_MS);

  newcomerPage = await attachPage(newcomerBrowser, PAGE_URL);
  await bootDirectory(newcomerBrowser, newcomerPage);
  await waitFor(newcomerBrowser, newcomerPage, `(() => {
    const r = window.__sharedYardV0PublicRoomEntry().rooms.find((x) => x.id === ${JSON.stringify(ROOM_ID)});
    return r?.joinable === true;
  })()`, "newcomer sees soft room");
  await enterRoom(newcomerBrowser, newcomerPage, "Soft-New");

  await waitFor(newcomerBrowser, newcomerPage, `(() => {
    const e = window.__sharedYardV0Evidence?.();
    return e && e.identity?.worldEpoch && e.identity.worldEpoch !== ${JSON.stringify(oldEpoch)};
  })()`, "newcomer replacement epoch");
  const newcomerWaiting = await evaluate(newcomerBrowser, newcomerPage, `window.__sharedYardV0Evidence()`);
  const newEpoch = newcomerWaiting.identity.worldEpoch;

  await waitFor(stayBrowser, stayPage, `(() => {
    const e = window.__sharedYardV0Evidence?.();
    return e && !e.runtimeFailed && e.identity?.worldEpoch === ${JSON.stringify(newEpoch)} && e.session?.actorSessionId !== ${JSON.stringify(oldStaySession)};
  })()`, "stayer automatic room recovery", 30_000);
  await waitFor(stayBrowser, stayPage, livePredicate, "stayer replacement live", 30_000);
  await waitFor(newcomerBrowser, newcomerPage, livePredicate, "newcomer replacement live", 30_000);

  const stayAfter = await evaluate(stayBrowser, stayPage, `window.__sharedYardV0Evidence()`);
  const newcomerAfter = await evaluate(newcomerBrowser, newcomerPage, `window.__sharedYardV0Evidence()`);
  assert(stayAfter.identity.worldEpoch === newEpoch && newcomerAfter.identity.worldEpoch === newEpoch, "replacement epoch mismatch");
  assert(stayAfter.metrics.guardMismatches === 0 && newcomerAfter.metrics.guardMismatches === 0, "replacement exact guard mismatch");
  assert(stayAfter.session.actorSessionId !== oldStaySession, "stayer reused retired ActorSession");

  stalePage = await attachPage(dropBrowser, DIRECT_URL);
  await bootDirect(dropBrowser, stalePage);
  const stale = await evaluate(dropBrowser, stalePage, `({
    entry: window.__sharedYardV0FriendEntry(),
    store: localStorage.getItem("shared-yard-v0-actor-sessions-v1"),
    status: document.querySelector("#boot-status")?.textContent || null,
  })`);
  assert(stale.entry?.directLinkResumable === false, `retired browser still offered Resume ${JSON.stringify(stale)}`);
  const parsed = stale.store ? JSON.parse(stale.store) : null;
  assert(!parsed?.sessions?.[ROOM_ID] || parsed.sessions[ROOM_ID].worldEpoch !== oldEpoch, "retired local ActorSession was not cleared");

  Object.assign(result, {
    verdict: "WORLD_V0_SOFT_PREEMPTION_BROWSER_PASS",
    oldEpoch,
    newEpoch,
    protectedState: protectedRoom.state,
    softState: softRoom.state,
    automaticRecovery: true,
    oldStaySession,
    newStaySession: stayAfter.session.actorSessionId,
    stayerGuardMismatches: stayAfter.metrics.guardMismatches,
    newcomerGuardMismatches: newcomerAfter.metrics.guardMismatches,
    retiredOfflineProfileResumeOffered: false,
  });
  writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
  console.log(result.verdict, JSON.stringify(result));
} catch (error) {
  result.error = error instanceof Error ? error.stack || error.message : String(error);
  result.stayStderr = stayBrowser ? Buffer.concat(stayBrowser.stderr).toString("utf8").slice(-4000) : null;
  result.dropStderr = dropBrowser ? Buffer.concat(dropBrowser.stderr).toString("utf8").slice(-4000) : null;
  result.newcomerStderr = newcomerBrowser ? Buffer.concat(newcomerBrowser.stderr).toString("utf8").slice(-4000) : null;
  writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
  throw error;
} finally {
  await closePage(dropBrowser, stalePage);
  await closePage(newcomerBrowser, newcomerPage);
  await closePage(dropBrowser, dropPage);
  await closePage(stayBrowser, stayPage);
  await stopBrowser(newcomerBrowser);
  await stopBrowser(dropBrowser);
  await stopBrowser(stayBrowser);
}
