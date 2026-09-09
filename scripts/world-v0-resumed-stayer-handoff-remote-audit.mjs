import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const BASE = (process.env.MW_WORLD_V0_RSH_REMOTE_BASE || "https://cloudflare-multiplayer-lab-qualified-play.jozzpoly.workers.dev").replace(/\/$/, "");
const RUN = String(process.env.MW_WORLD_V0_RSH_REMOTE_RUN || `rsh-${Date.now().toString(36)}`).slice(0, 20);
const PAGE_URL = `${BASE}/world-v0/?run=${encodeURIComponent(RUN)}`;
const WS_BASE = BASE.replace(/^http/, "ws");
const OUTPUT = process.env.MW_WORLD_V0_RSH_REMOTE_OUTPUT || "world-v0-resumed-stayer-handoff-remote.json";
const PORTS = [9951, 9952, 9953];
const TIMEOUT_MS = 50_000;
const SOFT_WAIT_MS = Number(process.env.MW_WORLD_V0_RSH_REMOTE_SOFT_WAIT_MS || 22_000);
const POST_START_OBSERVE_MS = Number(process.env.MW_WORLD_V0_RSH_REMOTE_OBSERVE_MS || 12_000);

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
  const profile = mkdtempSync(join(tmpdir(), `mw-rsh-remote-${index}-`));
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
async function attachPage(browser, url = PAGE_URL) {
  const created = await browser.cdp.call("Target.createTarget", { url });
  const attached = await browser.cdp.call("Target.attachToTarget", { targetId: created.targetId, flatten: true });
  await browser.cdp.call("Runtime.enable", {}, attached.sessionId);
  await browser.cdp.call("Page.enable", {}, attached.sessionId);
  return { targetId: created.targetId, sessionId: attached.sessionId };
}
async function closePage(browser, page) {
  if (!page?.targetId) return;
  try { await browser.cdp.call("Target.closeTarget", { targetId: page.targetId }); } catch {}
  page.targetId = null; page.sessionId = null;
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
async function bootDirect(browser, page) {
  await waitFor(browser, page, `document.readyState === "complete" && document.querySelector("#enter")?.disabled === false && typeof window.__sharedYardV0Evidence === "function"`, "direct boot", 35_000);
}
async function enterFresh(browser, page, name) {
  const result = await evaluate(browser, page, `(() => {
    const input = document.querySelector("#callsign");
    input.value = ${JSON.stringify(name)};
    input.dispatchEvent(new Event("input", { bubbles: true }));
    const run = document.querySelector("#run");
    if (run) run.value = ${JSON.stringify(RUN)};
    const button = document.querySelector("#enter");
    if (!button || button.disabled) return { ok: false, label: button?.textContent || null };
    button.click(); return { ok: true };
  })()`);
  assert(result?.ok, `fresh entry unavailable ${JSON.stringify(result)}`);
}
async function storedSession(browser, page) {
  return evaluate(browser, page, `(() => {
    const raw = localStorage.getItem("shared-yard-v0-actor-sessions-v1");
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed?.sessions?.[${JSON.stringify(RUN)}] || null;
  })()`);
}
async function attachResumePage(browser, playerId) {
  const page = await attachPage(browser, "about:blank");
  const source = `(() => {
    if (location.origin !== ${JSON.stringify(new URL(BASE).origin)}) return;
    try {
      const raw = localStorage.getItem("shared-yard-v0-actor-sessions-v1");
      const parsed = raw ? JSON.parse(raw) : null;
      const session = parsed?.sessions?.[${JSON.stringify(RUN)}];
      if (session) sessionStorage.setItem("shared-yard-v0-resume-intent-v1", JSON.stringify(session));
    } catch {}
  })();`;
  await browser.cdp.call("Page.addScriptToEvaluateOnNewDocument", { source }, page.sessionId);
  await browser.cdp.call("Page.navigate", { url: PAGE_URL }, page.sessionId);
  await bootDirect(browser, page);
  await evaluate(browser, page, `(() => {
    const input = document.querySelector("#callsign"); input.value = ${JSON.stringify(playerId)}; input.dispatchEvent(new Event("input", { bubbles: true }));
    const run = document.querySelector("#run"); if (run) run.value = ${JSON.stringify(RUN)};
    document.querySelector("#enter").click();
  })()`);
  return page;
}

async function probeSocket({ player, resumeToken = null, waitMs = 3500 }) {
  const params = new URLSearchParams({ run: RUN, player });
  if (resumeToken) params.set("resume", resumeToken);
  const startedAt = Date.now();
  const ws = new WebSocket(`${WS_BASE}/world-v0/ws?${params}`);
  const result = { player, resume: Boolean(resumeToken), startedAt: new Date(startedAt).toISOString(), events: [] };
  await new Promise((resolve) => {
    let done = false;
    const finish = () => { if (done) return; done = true; result.durationMs = Date.now() - startedAt; resolve(); };
    ws.addEventListener("open", () => result.events.push({ type: "open", atMs: Date.now() - startedAt }));
    ws.addEventListener("message", async (event) => {
      const raw = typeof event.data === "string" ? event.data : await event.data.text();
      let parsed = null; try { parsed = JSON.parse(raw); } catch {}
      result.events.push({ type: "message", atMs: Date.now() - startedAt, messageType: parsed?.type || null, worldEpoch: parsed?.worldEpoch || null, resumed: parsed?.resumed ?? null, error: parsed?.error || null });
      if (parsed?.type === "world_v0_welcome") setTimeout(finish, 100);
    });
    ws.addEventListener("error", () => result.events.push({ type: "error", atMs: Date.now() - startedAt }));
    ws.addEventListener("close", (event) => { result.events.push({ type: "close", atMs: Date.now() - startedAt, code: event.code, reason: event.reason || null, clean: event.wasClean }); finish(); });
    setTimeout(finish, waitMs);
  });
  try { ws.close(1000, "probe_done"); } catch {}
  return result;
}

const livePredicate = `(() => { const e = window.__sharedYardV0Evidence?.(); return e && !e.runtimeFailed && e.identity?.worldEpoch && Number.isInteger(e.localBoundaryTick) && e.localBoundaryTick >= 36 && e.metrics?.guardMismatches === 0; })()`;
const chrome = findChrome();
let aBrowser, bBrowser, cBrowser, aPage, bPage, cPage;
const result = { verdict: "WORLD_V0_RESUMED_STAYER_HANDOFF_REMOTE_FAIL", run: RUN, base: BASE, generatedAt: new Date().toISOString(), softWaitMs: SOFT_WAIT_MS, observeMs: POST_START_OBSERVE_MS };
try {
  aBrowser = await startBrowser(chrome, 0); bBrowser = await startBrowser(chrome, 1); cBrowser = await startBrowser(chrome, 2);
  aPage = await attachPage(aBrowser); bPage = await attachPage(bBrowser);
  await bootDirect(aBrowser, aPage); await bootDirect(bBrowser, bPage);
  await enterFresh(aBrowser, aPage, "RSHA");
  await waitFor(aBrowser, aPage, `window.__sharedYardV0Session?.().networkState === "waiting for peer"`, "A waiting");
  await enterFresh(bBrowser, bPage, "RSHB");
  await waitFor(aBrowser, aPage, livePredicate, "A initial live"); await waitFor(bBrowser, bPage, livePredicate, "B initial live");
  const aInitial = await evaluate(aBrowser, aPage, `window.__sharedYardV0Evidence()`);
  const bInitial = await evaluate(bBrowser, bPage, `window.__sharedYardV0Evidence()`);
  assert(aInitial.identity.worldEpoch === bInitial.identity.worldEpoch, "initial epoch mismatch");
  const oldEpoch = aInitial.identity.worldEpoch;
  const oldASession = aInitial.session.actorSessionId;
  const aStoredBefore = await storedSession(aBrowser, aPage);
  assert(aStoredBefore?.sessionId === oldASession && aStoredBefore?.resumeToken, "A stored resume authority missing");

  await closePage(bBrowser, bPage); bPage = null;
  await sleep(SOFT_WAIT_MS);
  const aBeforeVacant = await evaluate(aBrowser, aPage, `window.__sharedYardV0Evidence()`);
  assert(!aBeforeVacant.runtimeFailed && aBeforeVacant.identity?.worldEpoch === oldEpoch, "A did not keep old epoch alive through B soft wait");
  await closePage(aBrowser, aPage); aPage = null;
  await sleep(500);

  aPage = await attachResumePage(aBrowser, "RSHA");
  await waitFor(aBrowser, aPage, `(() => { const e=window.__sharedYardV0Evidence?.(); return e && !e.runtimeFailed && e.identity?.worldEpoch === ${JSON.stringify(oldEpoch)} && e.session?.actorSessionId === ${JSON.stringify(oldASession)} && e.lifecycleEvents?.some((x)=>x.type==="actor-resume-complete"); })()`, "A exact resume old epoch", 30_000);

  cPage = await attachPage(cBrowser); await bootDirect(cBrowser, cPage); await enterFresh(cBrowser, cPage, "RSHC");
  await waitFor(cBrowser, cPage, `(() => { const e=window.__sharedYardV0Evidence?.(); return e && e.identity?.worldEpoch && e.identity.worldEpoch !== ${JSON.stringify(oldEpoch)}; })()`, "C replacement epoch", 20_000);
  const cNew = await evaluate(cBrowser, cPage, `window.__sharedYardV0Evidence()`);
  const newEpoch = cNew.identity.worldEpoch;
  await waitFor(aBrowser, aPage, `(() => { const e=window.__sharedYardV0Evidence?.(); return e && !e.runtimeFailed && e.identity?.worldEpoch === ${JSON.stringify(newEpoch)} && e.session?.actorSessionId !== ${JSON.stringify(oldASession)} && e.lifecycleEvents?.some((x)=>x.type==="room-recovered"); })()`, "A room recovery", 30_000);
  await waitFor(aBrowser, aPage, livePredicate, "A replacement live", 30_000); await waitFor(cBrowser, cPage, livePredicate, "C replacement live", 30_000);

  const aStart = await evaluate(aBrowser, aPage, `window.__sharedYardV0Evidence()`); const cStart = await evaluate(cBrowser, cPage, `window.__sharedYardV0Evidence()`);
  const observedFrom = new Date().toISOString();
  await sleep(POST_START_OBSERVE_MS);
  const aAfter = await evaluate(aBrowser, aPage, `window.__sharedYardV0Evidence()`); const cAfter = await evaluate(cBrowser, cPage, `window.__sharedYardV0Evidence()`);
  const badTypes = new Set(["socket-error", "actor-resume-pending", "runtime-failure"]);
  const badA = (aAfter.lifecycleEvents || []).filter((x) => badTypes.has(x.type) && x.at >= observedFrom);
  const badC = (cAfter.lifecycleEvents || []).filter((x) => badTypes.has(x.type) && x.at >= observedFrom);
  const healthy = !aAfter.runtimeFailed && !cAfter.runtimeFailed && aAfter.identity?.worldEpoch === newEpoch && cAfter.identity?.worldEpoch === newEpoch && aAfter.localBoundaryTick > aStart.localBoundaryTick + 120 && cAfter.localBoundaryTick > cStart.localBoundaryTick + 120 && aAfter.metrics?.guardMismatches === 0 && cAfter.metrics?.guardMismatches === 0 && badA.length === 0 && badC.length === 0;

  Object.assign(result, { oldEpoch, newEpoch, oldASession, newASession: aAfter.session?.actorSessionId, observedFrom, healthy, aStart, cStart, aAfter, cAfter, badA, badC });
  if (!healthy) {
    const aCurrentStore = await storedSession(aBrowser, aPage).catch(() => null);
    const cCurrentStore = await storedSession(cBrowser, cPage).catch(() => null);
    result.postFailureProbes = {
      aResume: aCurrentStore?.resumeToken ? await probeSocket({ player: aCurrentStore.playerId, resumeToken: aCurrentStore.resumeToken }) : null,
      cResume: cCurrentStore?.resumeToken ? await probeSocket({ player: cCurrentStore.playerId, resumeToken: cCurrentStore.resumeToken }) : null,
      freshD: await probeSocket({ player: "RSHD" }),
    };
    throw new Error(`remote resumed-stayer handoff became unhealthy: ${JSON.stringify({ badA, badC, aEnd: aAfter.session?.end, cEnd: cAfter.session?.end, probes: result.postFailureProbes })}`);
  }

  result.verdict = "WORLD_V0_RESUMED_STAYER_HANDOFF_REMOTE_PASS";
  writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
  console.log(result.verdict, JSON.stringify({ run: RUN, oldEpoch, newEpoch, aBoundaryDelta: aAfter.localBoundaryTick-aStart.localBoundaryTick, cBoundaryDelta: cAfter.localBoundaryTick-cStart.localBoundaryTick, aGuardMismatches: aAfter.metrics.guardMismatches, cGuardMismatches: cAfter.metrics.guardMismatches }));
} catch (error) {
  result.error = error instanceof Error ? error.stack || error.message : String(error);
  for (const [name, browser, page] of [["a",aBrowser,aPage],["b",bBrowser,bPage],["c",cBrowser,cPage]]) {
    try { if (browser && page?.sessionId) result[`${name}EvidenceAtFailure`] = await evaluate(browser,page,`window.__sharedYardV0Evidence?.()`); } catch {}
    if (browser) result[`${name}Stderr`] = Buffer.concat(browser.stderr || []).toString("utf8").slice(-5000);
  }
  writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
  throw error;
} finally {
  try { await closePage(cBrowser,cPage); } catch {} try { await closePage(bBrowser,bPage); } catch {} try { await closePage(aBrowser,aPage); } catch {}
  await stopBrowser(cBrowser); await stopBrowser(bBrowser); await stopBrowser(aBrowser);
}
