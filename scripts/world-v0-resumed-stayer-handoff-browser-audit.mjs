import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const BASE = (process.env.MW_WORLD_V0_RSH_BASE || "http://127.0.0.1:8787").replace(/\/$/, "");
const PAGE_URL = `${BASE}/world-v0/`;
const ROOM_ID = process.env.MW_WORLD_V0_RSH_ROOM || "yard-2";
const DIRECT_URL = `${PAGE_URL}?run=${encodeURIComponent(ROOM_ID)}`;
const OUTPUT = process.env.MW_WORLD_V0_RSH_OUTPUT || "world-v0-resumed-stayer-handoff.json";
const PORTS = [9941, 9942, 9943];
const TIMEOUT_MS = 45_000;
const SOFT_TIMEOUT_MS = 35_000;
const POST_START_OBSERVE_MS = Number(process.env.MW_WORLD_V0_RSH_OBSERVE_MS || 10_000);

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
  const profile = mkdtempSync(join(tmpdir(), `mw-rsh-${index}-`));
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
    try { last = await room(); if (predicate(last)) return last; }
    catch (error) { last = error; }
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
let aBrowser, bBrowser, cBrowser, aPage, bPage, cPage;
const result = { verdict: "WORLD_V0_RESUMED_STAYER_HANDOFF_FAIL", roomId: ROOM_ID, generatedAt: new Date().toISOString() };
try {
  aBrowser = await startBrowser(chrome, 0);
  bBrowser = await startBrowser(chrome, 1);
  cBrowser = await startBrowser(chrome, 2);
  aPage = await attachPage(aBrowser, PAGE_URL);
  bPage = await attachPage(bBrowser, PAGE_URL);
  await bootDirectory(aBrowser, aPage);
  await bootDirectory(bBrowser, bPage);

  await enterRoom(aBrowser, aPage, "RSH-A");
  await waitFor(aBrowser, aPage, `window.__sharedYardV0Session?.().networkState === "waiting for peer"`, "A waiting");
  await enterRoom(bBrowser, bPage, "RSH-B");
  await waitFor(aBrowser, aPage, livePredicate, "A initial live");
  await waitFor(bBrowser, bPage, livePredicate, "B initial live");
  const aInitial = await evaluate(aBrowser, aPage, `window.__sharedYardV0Evidence()`);
  const bInitial = await evaluate(bBrowser, bPage, `window.__sharedYardV0Evidence()`);
  assert(aInitial.identity.worldEpoch === bInitial.identity.worldEpoch, "initial epoch mismatch");
  const oldEpoch = aInitial.identity.worldEpoch;
  const oldASession = aInitial.session.actorSessionId;

  // B leaves first and matures into a soft reservation while A keeps the old epoch alive.
  await closePage(bBrowser, bPage); bPage = null;
  await waitRoom((r) => r.worldEpoch === oldEpoch && r.connected === 1 && r.softReserved === 1 && r.joinable === true, "B soft while A live", SOFT_TIMEOUT_MS);

  // A then leaves too. The fully vacant epoch must remain resumable but capacity-free.
  await closePage(aBrowser, aPage); aPage = null;
  const vacant = await waitRoom((r) => r.worldEpoch === oldEpoch && r.connected === 0 && r.replacementCapable === true && r.joinable === true, "fully vacant resumable old epoch");

  // A returns first through private ActorSession Resume, reproducing the Owner sequence.
  aPage = await attachPage(aBrowser, DIRECT_URL);
  await bootDirect(aBrowser, aPage);
  await waitFor(aBrowser, aPage, `window.__sharedYardV0FriendEntry().directLinkResumable === true && document.querySelector("#enter")?.textContent === "Resume world"`, "A offered Resume");
  await evaluate(aBrowser, aPage, `document.querySelector("#enter").click()`);
  const resumedA = await waitFor(aBrowser, aPage, `(() => {
    const e = window.__sharedYardV0Evidence?.();
    return e && !e.runtimeFailed && e.identity?.worldEpoch === ${JSON.stringify(oldEpoch)} && e.session?.actorSessionId === ${JSON.stringify(oldASession)} && e.lifecycleEvents?.some((x) => x.type === "actor-resume-complete");
  })()`, "A exact active resume", 30_000);
  void resumedA;
  const afterResumeRoom = await waitRoom((r) => r.worldEpoch === oldEpoch && r.connected === 1 && r.softReserved === 1 && r.joinable === true, "resumed A plus soft B");

  // Fresh C claims B's soft slot. This retires old epoch; resumed A must room-recover fresh.
  cPage = await attachPage(cBrowser, PAGE_URL);
  await bootDirectory(cBrowser, cPage);
  await waitFor(cBrowser, cPage, `(() => window.__sharedYardV0PublicRoomEntry().rooms.find((r) => r.id === ${JSON.stringify(ROOM_ID)})?.joinable === true)()`, "C sees open soft seat");
  await enterRoom(cBrowser, cPage, "RSH-C");
  await waitFor(cBrowser, cPage, `(() => {
    const e = window.__sharedYardV0Evidence?.();
    return e && e.identity?.worldEpoch && e.identity.worldEpoch !== ${JSON.stringify(oldEpoch)};
  })()`, "C new epoch");
  const cNew = await evaluate(cBrowser, cPage, `window.__sharedYardV0Evidence()`);
  const newEpoch = cNew.identity.worldEpoch;

  await waitFor(aBrowser, aPage, `(() => {
    const e = window.__sharedYardV0Evidence?.();
    return e && !e.runtimeFailed && e.identity?.worldEpoch === ${JSON.stringify(newEpoch)} && e.session?.actorSessionId !== ${JSON.stringify(oldASession)} && e.lifecycleEvents?.some((x) => x.type === "room-recovered");
  })()`, "resumed A room-recovered fresh", 30_000);
  await waitFor(aBrowser, aPage, livePredicate, "A replacement live", 30_000);
  await waitFor(cBrowser, cPage, livePredicate, "C replacement live", 30_000);

  const aStart = await evaluate(aBrowser, aPage, `window.__sharedYardV0Evidence()`);
  const cStart = await evaluate(cBrowser, cPage, `window.__sharedYardV0Evidence()`);
  const aStartBoundary = aStart.localBoundaryTick;
  const cStartBoundary = cStart.localBoundaryTick;
  const observeStartedAt = Date.now();
  await sleep(POST_START_OBSERVE_MS);
  const aAfter = await evaluate(aBrowser, aPage, `window.__sharedYardV0Evidence()`);
  const cAfter = await evaluate(cBrowser, cPage, `window.__sharedYardV0Evidence()`);

  for (const [label, evidence, startBoundary] of [["A", aAfter, aStartBoundary], ["C", cAfter, cStartBoundary]]) {
    assert(evidence.runtimeFailed === false, `${label} runtime failed after handoff: ${JSON.stringify(evidence.session?.end)}`);
    assert(evidence.identity?.worldEpoch === newEpoch, `${label} epoch drift after handoff`);
    assert(Number.isInteger(evidence.localBoundaryTick) && evidence.localBoundaryTick > startBoundary + 120, `${label} authority/prediction did not progress for observation window`);
    assert(evidence.metrics?.guardMismatches === 0, `${label} guard mismatch after handoff`);
    const postStartBad = (evidence.lifecycleEvents || []).filter((event) => ["socket-error", "actor-resume-pending", "runtime-failure"].includes(event.type) && new Date(event.at).getTime() >= observeStartedAt - 1000);
    assert(postStartBad.length === 0, `${label} transport recovery event after handoff: ${JSON.stringify(postStartBad)}`);
  }

  Object.assign(result, {
    verdict: "WORLD_V0_RESUMED_STAYER_HANDOFF_PASS",
    oldEpoch,
    newEpoch,
    oldASession,
    newASession: aAfter.session.actorSessionId,
    vacantState: vacant.state,
    afterResumeState: afterResumeRoom.state,
    observeMs: POST_START_OBSERVE_MS,
    aBoundaryDelta: aAfter.localBoundaryTick - aStartBoundary,
    cBoundaryDelta: cAfter.localBoundaryTick - cStartBoundary,
    aGuardMismatches: aAfter.metrics.guardMismatches,
    cGuardMismatches: cAfter.metrics.guardMismatches,
    aLifecycleTail: aAfter.lifecycleEvents.slice(-12),
    cLifecycleTail: cAfter.lifecycleEvents.slice(-12),
  });
  writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
  console.log(result.verdict, JSON.stringify(result));
} catch (error) {
  result.error = error instanceof Error ? error.stack || error.message : String(error);
  for (const [name, browser, page] of [["a", aBrowser, aPage], ["b", bBrowser, bPage], ["c", cBrowser, cPage]]) {
    try { if (browser && page?.sessionId) result[`${name}Evidence`] = await evaluate(browser, page, `window.__sharedYardV0Evidence?.()`); } catch {}
    if (browser) result[`${name}Stderr`] = Buffer.concat(browser.stderr || []).toString("utf8").slice(-5000);
  }
  writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
  throw error;
} finally {
  try { await closePage(cBrowser, cPage); } catch {}
  try { await closePage(bBrowser, bPage); } catch {}
  try { await closePage(aBrowser, aPage); } catch {}
  await stopBrowser(cBrowser); await stopBrowser(bBrowser); await stopBrowser(aBrowser);
}
