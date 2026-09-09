import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const BASE = (process.env.MW_WORLD_V0_PEER_MATRIX_BASE || "http://127.0.0.1:8787").replace(/\/$/, "");
const PAGE_URL = `${BASE}/world-v0/`;
const OUTPUT = process.env.MW_WORLD_V0_PEER_MATRIX_OUTPUT || "world-v0-peer-departure-control-matrix.json";
const ARMS = [
  { room: "yard-1", mode: "control-live" },
  { room: "yard-2", mode: "peer-about-blank" },
  { room: "yard-3", mode: "peer-direct-resume-page" },
];
const PORTS = [9922, 9923];
const TIMEOUT_MS = 50_000;
const OBSERVE_MS = 8_000;
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
  const profile = mkdtempSync(join(tmpdir(), `mw-peer-matrix-${index}-`));
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

async function navigate(browser, page, url, expectWorldShell = true) {
  await browser.cdp.call("Page.navigate", { url }, page.sessionId);
  if (expectWorldShell) {
    await waitFor(browser, page, `document.readyState === "complete" && document.querySelector("#enter")?.disabled === false`, "world page navigation");
  } else {
    await waitFor(browser, page, `document.readyState === "complete"`, "minimal navigation");
  }
}

async function bootDirectory(browser, page, room) {
  await waitFor(browser, page,
    `typeof window.__sharedYardV0PublicRoomEntry === "function" && window.__sharedYardV0PublicRoomEntry().rooms.some((r) => r.id === ${JSON.stringify(room)})`,
    `directory ${room}`);
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

function summarize(evidence) {
  return {
    worldEpoch: evidence?.identity?.worldEpoch ?? null,
    networkState: evidence?.networkState ?? null,
    runtimeFailed: Boolean(evidence?.runtimeFailed),
    localBoundaryTick: evidence?.localBoundaryTick ?? null,
    latestAuthorityBoundary: evidence?.metrics?.latestAuthorityBoundary ?? null,
    maxAuthoritySilenceTicks: evidence?.metrics?.maxAuthoritySilenceTicks ?? null,
    authoritySilenceResumes: evidence?.metrics?.authoritySilenceResumes ?? null,
    rebases: evidence?.metrics?.rebases ?? null,
    guardMismatches: evidence?.metrics?.guardMismatches ?? null,
    actorResume: evidence?.session?.actorResume ?? null,
    roomRecovery: evidence?.session?.roomRecovery ?? null,
    lifecycleEvents: evidence?.lifecycleEvents ?? [],
  };
}

const result = {
  verdict: "WORLD_V0_PEER_DEPARTURE_CONTROL_MATRIX_INCOMPLETE",
  generatedAt: new Date().toISOString(),
  observeMs: OBSERVE_MS,
  arms: [],
};

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

  for (let index = 0; index < ARMS.length; index += 1) {
    const arm = ARMS[index];
    await navigate(aBrowser, aPage, PAGE_URL);
    await navigate(bBrowser, bPage, PAGE_URL);
    await bootDirectory(aBrowser, aPage, arm.room);
    await bootDirectory(bBrowser, bPage, arm.room);
    await enterRoom(aBrowser, aPage, arm.room, `OwnerA${index}`);
    await waitFor(aBrowser, aPage, `window.__sharedYardV0Session?.().networkState === "waiting for peer"`, `A waiting ${arm.room}`);
    await enterRoom(bBrowser, bPage, arm.room, `PeerB${index}`);
    const aBeforeFull = await waitFor(aBrowser, aPage, liveExpression(), `A live ${arm.room}`);
    const bBeforeFull = await waitFor(bBrowser, bPage, liveExpression(), `B live ${arm.room}`);
    assert(aBeforeFull.identity.worldEpoch === bBeforeFull.identity.worldEpoch, `epoch mismatch ${arm.room}`);
    const aBefore = summarize(aBeforeFull);

    if (arm.mode === "peer-about-blank") {
      await navigate(bBrowser, bPage, "about:blank", false);
    } else if (arm.mode === "peer-direct-resume-page") {
      const direct = `${PAGE_URL}?run=${encodeURIComponent(arm.room)}`;
      await navigate(bBrowser, bPage, direct);
      await waitFor(bBrowser, bPage, `document.querySelector("#enter")?.textContent?.includes("Resume")`, `B resume screen ${arm.room}`, 10_000);
    }

    await sleep(OBSERVE_MS);
    const aAfter = summarize(await evaluate(aBrowser, aPage, `window.__sharedYardV0Evidence()`));
    const lifecycleDelta = aAfter.lifecycleEvents.slice(aBefore.lifecycleEvents.length);
    result.arms.push({
      room: arm.room,
      mode: arm.mode,
      before: { ...aBefore, lifecycleEvents: undefined },
      after: { ...aAfter, lifecycleEvents: undefined },
      deltas: {
        localBoundaryTicks: (aAfter.localBoundaryTick ?? 0) - (aBefore.localBoundaryTick ?? 0),
        latestAuthorityBoundaryTicks: (aAfter.latestAuthorityBoundary ?? 0) - (aBefore.latestAuthorityBoundary ?? 0),
        authoritySilenceResumes: (aAfter.authoritySilenceResumes ?? 0) - (aBefore.authoritySilenceResumes ?? 0),
        rebases: (aAfter.rebases ?? 0) - (aBefore.rebases ?? 0),
      },
      lifecycleDelta,
    });
  }

  const [control, minimal, direct] = result.arms;
  result.classification = {
    controlSilence: control?.deltas?.authoritySilenceResumes ?? null,
    minimalDepartureSilence: minimal?.deltas?.authoritySilenceResumes ?? null,
    directReloadSilence: direct?.deltas?.authoritySilenceResumes ?? null,
    controlHealthy: Boolean(control && !control.after.runtimeFailed && control.after.guardMismatches === 0 && control.deltas.localBoundaryTicks > 300),
    minimalDepartureHealthy: Boolean(minimal && !minimal.after.runtimeFailed && minimal.after.guardMismatches === 0 && minimal.deltas.localBoundaryTicks > 300),
    directReloadHealthy: Boolean(direct && !direct.after.runtimeFailed && direct.after.guardMismatches === 0 && direct.deltas.localBoundaryTicks > 300),
  };
  result.verdict = "WORLD_V0_PEER_DEPARTURE_CONTROL_MATRIX_COMPLETE";
  result.nonClaim = "Local same-host control matrix. It distinguishes baseline CI/client starvation, minimal peer departure, and heavy direct-page reload effects; it does not by itself explain the Owner-recorded remote WebSocket 1006.";
  writeFileSync(OUTPUT, `${JSON.stringify(result, null, 2)}\n`);
  console.log(result.verdict, JSON.stringify(result.classification));
} catch (error) {
  result.error = error instanceof Error ? error.stack || error.message : String(error);
  try { writeFileSync(OUTPUT, `${JSON.stringify(result, null, 2)}\n`); } catch {}
  console.error(result.error);
  process.exitCode = 1;
} finally {
  await stopBrowser(aBrowser);
  await stopBrowser(bBrowser);
}
