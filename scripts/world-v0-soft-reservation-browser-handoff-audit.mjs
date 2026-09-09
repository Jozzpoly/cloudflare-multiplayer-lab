import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const BASE = (process.env.MW_WORLD_V0_SOFT_BROWSER_BASE || "http://127.0.0.1:8787").replace(/\/$/, "");
const PAGE_URL = `${BASE}/world-v0/`;
const ROOM_ID = process.env.MW_WORLD_V0_SOFT_BROWSER_ROOM || "yard-3";
const DIRECT_URL = `${PAGE_URL}?run=${encodeURIComponent(ROOM_ID)}`;
const OUTPUT = process.env.MW_WORLD_V0_SOFT_BROWSER_OUTPUT || "world-v0-soft-reservation-browser-handoff.json";
const PORTS = [9892, 9893, 9894];
const TIMEOUT_MS = 70_000;

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
    const result = await this.call("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    }, sessionId);
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
  const profile = mkdtempSync(join(tmpdir(), `mw-soft-handoff-${index}-`));
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
  const debuggerInfo = await waitDebugger(PORTS[index]);
  const cdp = new Cdp(debuggerInfo.webSocketDebuggerUrl);
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

async function roomDirectory() {
  const response = await fetch(`${BASE}/api/world-v0/rooms`, { cache: "no-store", signal: AbortSignal.timeout(2500) });
  if (!response.ok) throw new Error(`directory HTTP ${response.status}`);
  const payload = await response.json();
  return payload.rooms?.find((room) => room.id === ROOM_ID) || null;
}

async function waitRoom(predicate, label, timeout = TIMEOUT_MS) {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < timeout) {
    try {
      last = await roomDirectory();
      if (last && predicate(last)) return last;
    } catch (error) { last = { error: error instanceof Error ? error.message : String(error) }; }
    await sleep(180);
  }
  throw new Error(`${label} timeout: ${JSON.stringify(last)}`);
}

async function bootDirectory(browser, page) {
  await waitFor(browser, page,
    `document.readyState === "complete" && document.querySelector("#enter")?.disabled === false && typeof window.__sharedYardV0PublicRoomEntry === "function"`,
    "directory boot");
  await waitFor(browser, page,
    `window.__sharedYardV0PublicRoomEntry().rooms.some((room) => room.id === ${JSON.stringify(ROOM_ID)})`,
    "room directory visible");
}

async function bootDirect(browser, page) {
  await waitFor(browser, page,
    `document.readyState === "complete" && document.querySelector("#enter")?.disabled === false && typeof window.__sharedYardV0FriendEntry === "function"`,
    "direct-link boot");
}

async function enterRoom(browser, page, name) {
  const result = await evaluate(browser, page, `(() => {
    const input = document.querySelector("#callsign");
    input.value = ${JSON.stringify(name)};
    input.dispatchEvent(new Event("input", { bubbles: true }));
    const button = document.querySelector('.public-room-card[data-room-id=${JSON.stringify(ROOM_ID)}]');
    if (!button || button.disabled) return { ok: false, text: button?.textContent || null, tone: button?.dataset?.tone || null };
    button.click();
    return { ok: true };
  })()`);
  assert(result?.ok, `room entry unavailable ${JSON.stringify(result)}`);
}

function liveExpression(epoch = null, minimumBoundary = 48) {
  const epochClause = epoch ? `e.identity?.worldEpoch === ${JSON.stringify(epoch)} &&` : "e.identity?.worldEpoch &&";
  return `(() => {
    const e = window.__sharedYardV0Evidence?.();
    return e && !e.runtimeFailed && ${epochClause}
      Number.isInteger(e.localBoundaryTick) && e.localBoundaryTick >= ${minimumBoundary} &&
      e.metrics?.guardMismatches === 0;
  })()`;
}

const chrome = findChrome();
let aBrowser = null;
let bBrowser = null;
let cBrowser = null;
let aPage = null;
let bPage = null;
let cPage = null;
let bReturnPage = null;
const result = {
  verdict: "WORLD_V0_SOFT_RESERVATION_BROWSER_HANDOFF_FAIL",
  roomId: ROOM_ID,
  generatedAt: new Date().toISOString(),
};

try {
  aBrowser = await startBrowser(chrome, 0);
  bBrowser = await startBrowser(chrome, 1);
  cBrowser = await startBrowser(chrome, 2);
  aPage = await attachPage(aBrowser, PAGE_URL);
  bPage = await attachPage(bBrowser, PAGE_URL);
  cPage = await attachPage(cBrowser, PAGE_URL);
  await bootDirectory(aBrowser, aPage);
  await bootDirectory(bBrowser, bPage);
  await bootDirectory(cBrowser, cPage);

  await enterRoom(aBrowser, aPage, "Owner-A");
  await waitFor(aBrowser, aPage, `window.__sharedYardV0Session?.().networkState === "waiting for peer"`, "A waiting for peer");
  await enterRoom(bBrowser, bPage, "Peer-B");

  await waitFor(aBrowser, aPage, liveExpression(), "A initial live");
  await waitFor(bBrowser, bPage, liveExpression(), "B initial live");
  const aBefore = await evaluate(aBrowser, aPage, `window.__sharedYardV0Evidence()`);
  const bBefore = await evaluate(bBrowser, bPage, `window.__sharedYardV0Evidence()`);
  assert(aBefore.identity.worldEpoch === bBefore.identity.worldEpoch, "initial WorldEpoch mismatch");
  const oldEpoch = aBefore.identity.worldEpoch;
  const oldA = {
    actorSessionId: aBefore.session.actorSessionId,
    netEntityId: aBefore.session.selfNetEntityId,
    boundary: aBefore.localBoundaryTick,
  };
  const oldB = {
    actorSessionId: bBefore.session.actorSessionId,
    netEntityId: bBefore.session.selfNetEntityId,
    boundary: bBefore.localBoundaryTick,
  };

  const fullBefore = await waitRoom((room) => room.state === "live" && room.connected === 2 && room.reserved === 0 && room.joinable === false, "initial full room");
  const cFullUi = await evaluate(cBrowser, cPage, `(() => {
    const b = document.querySelector('.public-room-card[data-room-id=${JSON.stringify(ROOM_ID)}]');
    return b ? { disabled: b.disabled, tone: b.dataset.tone, text: b.textContent } : null;
  })()`);
  assert(cFullUi?.disabled === true, `third browser could enter full live room ${JSON.stringify(cFullUi)}`);

  // Simulate a real tab close for B while A remains live. During the protected R1
  // horizon C must stay blocked. After the same ActorSession becomes soft-reserved,
  // C may request capacity without mutating the old fixed two-actor epoch in place.
  await closePage(bBrowser, bPage);
  bPage = null;

  const protectedRoom = await waitRoom((room) =>
    room.state === "live-protected-reserved" && room.connected === 1 &&
    room.protectedReserved === 1 && room.softReserved === 0 && room.joinable === false,
  "protected reservation", 15_000);
  const protectedUi = await waitFor(cBrowser, cPage, `(() => {
    const b = document.querySelector('.public-room-card[data-room-id=${JSON.stringify(ROOM_ID)}]');
    if (!b) return false;
    return b.disabled && b.dataset.tone === "reserved" ? { disabled: b.disabled, tone: b.dataset.tone, text: b.textContent } : false;
  })()`, "protected room UI", 15_000);

  const softRoom = await waitRoom((room) =>
    room.state === "live-soft-reserved" && room.connected === 1 &&
    room.protectedReserved === 0 && room.softReserved === 1 && room.joinable === true && room.replacementCapable === true,
  "soft reservation", 32_000);
  const softUi = await waitFor(cBrowser, cPage, `(() => {
    const b = document.querySelector('.public-room-card[data-room-id=${JSON.stringify(ROOM_ID)}]');
    if (!b) return false;
    return !b.disabled && b.dataset.tone === "soft" && /Join/i.test(b.textContent || "")
      ? { disabled: b.disabled, tone: b.dataset.tone, text: b.textContent }
      : false;
  })()`, "soft room UI", 8_000);

  await enterRoom(cBrowser, cPage, "Peer-C");

  // A must receive the explicit old-epoch termination, clear its retired private
  // token, and use the existing same-room recovery path to return as a fresh actor.
  await waitFor(aBrowser, aPage, `(() => {
    const e = window.__sharedYardV0Evidence?.();
    const rr = e?.session?.roomRecovery;
    const recovered = e?.lifecycleEvents?.some((event) =>
      event.type === "room-recovered" &&
      event.sourceEpoch === ${JSON.stringify(oldEpoch)} &&
      event.recoveredEpoch === e.identity?.worldEpoch
    );
    return e && !e.runtimeFailed && e.identity?.worldEpoch && e.identity.worldEpoch !== ${JSON.stringify(oldEpoch)} &&
      rr?.pending === false && rr?.lastRecoveredEpoch === e.identity.worldEpoch && recovered &&
      e.session?.actorSessionId && e.session.actorSessionId !== ${JSON.stringify(oldA.actorSessionId)} &&
      e.metrics?.guardMismatches === 0;
  })()`, "A automatic room recovery", 25_000);

  const aRecoveredEarly = await evaluate(aBrowser, aPage, `window.__sharedYardV0Evidence()`);
  const newEpoch = aRecoveredEarly.identity.worldEpoch;
  await waitFor(aBrowser, aPage, liveExpression(newEpoch, 48), "A recovered live", 20_000);
  await waitFor(cBrowser, cPage, liveExpression(newEpoch, 48), "C replacement live", 20_000);

  const aAfter = await evaluate(aBrowser, aPage, `window.__sharedYardV0Evidence()`);
  const cAfter = await evaluate(cBrowser, cPage, `window.__sharedYardV0Evidence()`);
  assert(cAfter.identity.worldEpoch === newEpoch, "C did not share replacement WorldEpoch with recovered A");
  assert(aAfter.session.actorSessionId !== oldA.actorSessionId, "A old ActorSession survived epoch rotation");
  assert(aAfter.session.selfNetEntityId !== null, "A replacement NetEntity missing");
  assert(cAfter.session.actorSessionId !== aAfter.session.actorSessionId, "replacement peers share ActorSession identity");
  assert(aAfter.metrics.guardMismatches === 0 && cAfter.metrics.guardMismatches === 0, "replacement epoch exact-state guard mismatch");
  assert(aAfter.session.roomRecovery?.lastRecoveredEpoch === newEpoch, "A room recovery evidence missing replacement epoch");

  const replacementRoom = await waitRoom((room) => room.state === "live" && room.connected === 2 && room.reserved === 0 && room.joinable === false && room.worldEpoch === newEpoch, "replacement full room", 12_000);

  // B's browser profile still owns the old local token, but the old epoch was
  // retired by the authority. Ordinary return must therefore fail closed to a
  // normal deep link rather than stealing A/C or reviving the previous session.
  bReturnPage = await attachPage(bBrowser, DIRECT_URL);
  await bootDirect(bBrowser, bReturnPage);
  const bReturn = await waitFor(bBrowser, bReturnPage, `(() => {
    const entry = window.__sharedYardV0FriendEntry?.();
    if (!entry) return false;
    return entry.directLinkResumable === false ? {
      entry,
      status: document.querySelector("#boot-status")?.textContent || null,
      stored: (() => {
        try {
          const raw = localStorage.getItem("shared-yard-v0-actor-sessions-v1");
          const parsed = raw ? JSON.parse(raw) : null;
          return parsed?.sessions?.[${JSON.stringify(ROOM_ID)}] || null;
        } catch { return "storage_parse_error"; }
      })(),
    } : false;
  })()`, "retired B token cleared", 12_000);
  assert(bReturn.stored === null, `retired B ActorSession remained stored ${JSON.stringify(bReturn.stored)}`);

  Object.assign(result, {
    verdict: "WORLD_V0_SOFT_RESERVATION_BROWSER_HANDOFF_PASS",
    oldEpoch,
    newEpoch,
    oldA,
    oldB,
    fullBefore,
    cFullUi,
    protected: { room: protectedRoom, ui: protectedUi },
    soft: { room: softRoom, ui: softUi },
    recoveredA: {
      actorSessionId: aAfter.session.actorSessionId,
      netEntityId: aAfter.session.selfNetEntityId,
      roomRecovery: aAfter.session.roomRecovery,
      boundary: aAfter.localBoundaryTick,
      guardMismatches: aAfter.metrics.guardMismatches,
      lifecycleEvents: aAfter.lifecycleEvents.filter((event) => ["room-reconnect-attempt", "room-recovered", "socket-close"].includes(event.type)),
    },
    replacementC: {
      actorSessionId: cAfter.session.actorSessionId,
      netEntityId: cAfter.session.selfNetEntityId,
      boundary: cAfter.localBoundaryTick,
      guardMismatches: cAfter.metrics.guardMismatches,
    },
    replacementRoom,
    retiredBReturn: bReturn,
    nonClaim: "Local Workerd + real Chromium product-flow proof. It proves automatic same-logical-room recovery across a soft-reservation epoch handoff, but does not claim remote placement, mobile behavior, Owner feel, or production qualification.",
  });
  writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
  console.log("WORLD_V0_SOFT_RESERVATION_BROWSER_HANDOFF_PASS", JSON.stringify({
    roomId: ROOM_ID,
    oldEpoch,
    newEpoch,
    recoveredActorSessionId: aAfter.session.actorSessionId,
    replacementActorSessionId: cAfter.session.actorSessionId,
  }));
} catch (error) {
  result.error = error instanceof Error ? error.stack || error.message : String(error);
  result.aStderr = aBrowser ? Buffer.concat(aBrowser.stderr).toString("utf8").slice(-5000) : null;
  result.bStderr = bBrowser ? Buffer.concat(bBrowser.stderr).toString("utf8").slice(-5000) : null;
  result.cStderr = cBrowser ? Buffer.concat(cBrowser.stderr).toString("utf8").slice(-5000) : null;
  writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
  throw error;
} finally {
  await closePage(bBrowser, bReturnPage);
  await closePage(cBrowser, cPage);
  await closePage(bBrowser, bPage);
  await closePage(aBrowser, aPage);
  await stopBrowser(cBrowser);
  await stopBrowser(bBrowser);
  await stopBrowser(aBrowser);
}
