import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { WORLD_V0_ROOM_CONTINUITY_REVISION } from "../public/world-v0/room-continuity.js";

const BASE = (process.env.MW_WORLD_V0_CONTINUITY_BASE_URL || "http://127.0.0.1:8787").replace(/\/$/, "");
const HOST_URL = `${BASE}/world-v0/?continuity=1`;
const DEBUG_PORTS = [9580, 9581, 9582];
const TIMEOUT_MS = 45_000;
const OUTPUT = process.env.MW_WORLD_V0_CONTINUITY_OUTPUT || "world-v0-room-continuity-evidence.json";

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function assert(condition, message) { if (!condition) throw new Error(message); }

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

async function startBrowser(binary, index, url) {
  const port = DEBUG_PORTS[index];
  const profile = mkdtempSync(join(tmpdir(), `mw-room-continuity-${index}-`));
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
    const existing = await cdp.call("Target.getTargets");
    const { targetId } = await cdp.call("Target.createTarget", { url });
    await cdp.call("Target.activateTarget", { targetId });
    const { sessionId } = await cdp.call("Target.attachToTarget", { targetId, flatten: true });
    await cdp.call("Runtime.enable", {}, sessionId);
    await cdp.call("Page.enable", {}, sessionId);
    await cdp.call("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true,
      screenWidth: 390,
      screenHeight: 844,
      screenOrientation: { type: "portraitPrimary", angle: 0 },
    }, sessionId);
    for (const target of existing.targetInfos || []) {
      if (target.type !== "page" || target.targetId === targetId) continue;
      try { await cdp.call("Target.closeTarget", { targetId: target.targetId }); } catch { /* cleanup */ }
    }
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
  if (client.child?.exitCode === null) {
    const closed = new Promise((resolve) => client.child.once("close", resolve));
    client.child.kill("SIGKILL");
    await Promise.race([closed, sleep(2500)]);
  }
  try { rmSync(client.profile, { recursive: true, force: true }); } catch { /* cleanup */ }
}

async function waitFor(client, expression, label, timeoutMs = TIMEOUT_MS) {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < timeoutMs) {
    try {
      last = await client.cdp.evaluate(client.sessionId, expression);
      if (last) return last;
    } catch (error) { last = error instanceof Error ? error.message : String(error); }
    await sleep(120);
  }
  throw new Error(`${label} timeout · last=${JSON.stringify(last)}`);
}

async function evaluate(client, expression) {
  return await client.cdp.evaluate(client.sessionId, expression);
}

async function diagnostic(client) {
  if (!client) return null;
  try {
    return await evaluate(client, `({
      href: location.href,
      visibility: document.visibilityState,
      online: navigator.onLine,
      status: document.querySelector("#boot-status")?.textContent || null,
      session: window.__sharedYardV0Session?.() || null,
      evidence: window.__sharedYardV0Evidence?.() || null,
      continuity: window.__sharedYardV0RoomContinuity?.() || null,
    })`);
  } catch (error) {
    return { diagnosticError: error instanceof Error ? error.message : String(error) };
  }
}

async function bootAndEnter(client, name, expectedMode) {
  await waitFor(client, `document.readyState === "complete" && document.querySelector("#enter")?.disabled === false && typeof window.__sharedYardV0FriendEntry === "function"`, `${name} boot`);
  const boot = await evaluate(client, `({
    entry: window.__sharedYardV0FriendEntry(),
    continuity: window.__sharedYardV0RoomContinuity?.() || null,
    run: document.querySelector("#run")?.value || "",
  })`);
  assert(boot.entry?.mode === expectedMode, `${name} entry mode ${boot.entry?.mode} != ${expectedMode}`);
  await evaluate(client, `(() => {
    document.querySelector("#callsign").value = ${JSON.stringify(name)};
    document.querySelector("#enter").click();
    return true;
  })()`);
  return boot;
}

const chrome = findChrome();
let host = null;
let friend1 = null;
let friend2 = null;
const result = {
  verdict: "WORLD_V0_ROOM_CONTINUITY_FAIL",
  generatedAt: new Date().toISOString(),
  page: HOST_URL,
};

try {
  const suffix = Date.now().toString(36).slice(-6);
  host = await startBrowser(chrome, 0, HOST_URL);
  const hostBoot = await bootAndEnter(host, `host-${suffix}`, "host");
  assert(hostBoot.continuity?.revision === WORLD_V0_ROOM_CONTINUITY_REVISION, `continuity revision ${hostBoot.continuity?.revision}`);
  assert(hostBoot.continuity?.requested === true, "host continuity probe was not requested");

  await waitFor(host, `(() => {
    const s = window.__sharedYardV0Session?.();
    return s?.networkState === "waiting for peer" && !document.querySelector("#copy-invite")?.classList.contains("hidden");
  })()`, "host E1 waiting");

  const e1Waiting = await evaluate(host, `({ session: window.__sharedYardV0Session(), evidence: window.__sharedYardV0Evidence() })`);
  const runKey = e1Waiting.session.runKey;
  const originalInvite = e1Waiting.session.inviteUrl;
  const firstEpoch = e1Waiting.evidence.identity?.worldEpoch;
  assert(runKey && firstEpoch, "host E1 missing run/epoch");
  assert(e1Waiting.evidence.roomContinuity?.requested === true, "continuity evidence missing on host");

  friend1 = await startBrowser(chrome, 1, originalInvite);
  const friend1Boot = await bootAndEnter(friend1, `peer-a-${suffix}`, "invite");
  assert(friend1Boot.continuity?.requested === false, "invite browser unexpectedly inherited host continuity probe");

  const livePredicate = `(() => {
    const e = window.__sharedYardV0Evidence?.();
    return e?.runtimeFailed === false && e?.identity?.worldEpoch &&
      Number.isInteger(e.localBoundaryTick) && e.localBoundaryTick >= 24 &&
      e.presentation?.selfPresence === "YOU" && e.presentation?.remotePresence === "PEER" &&
      e.metrics?.guardMismatches === 0 && e.metrics?.guardMatches >= 1;
  })()`;
  await waitFor(host, livePredicate, "host E1 live");
  await waitFor(friend1, livePredicate, "friend E1 live");
  const e1HostLive = await evaluate(host, `window.__sharedYardV0Evidence()`);
  const e1FriendLive = await evaluate(friend1, `window.__sharedYardV0Evidence()`);
  assert(e1HostLive.identity.worldEpoch === firstEpoch, "host E1 epoch drift");
  assert(e1FriendLive.identity.worldEpoch === firstEpoch, "friend E1 epoch mismatch");

  // Simulate the peer connection disappearing. The authority currently labels every
  // WebSocket close as peer_left_restart_required, so the probe records this as an
  // ambiguous connection close rather than claiming a voluntary social leave.
  await stopBrowser(friend1);
  friend1 = null;

  await waitFor(host, `(() => {
    const e = window.__sharedYardV0Evidence?.();
    const c = e?.roomContinuity;
    const s = window.__sharedYardV0Session?.();
    return c?.state === "waiting-new-epoch" && c?.attempts === 1 &&
      c?.fromEpoch === ${JSON.stringify(firstEpoch)} && c?.toEpoch && c.toEpoch !== c.fromEpoch &&
      s?.networkState === "waiting for peer";
  })()`, "host automatic E2 rearm");

  const e2Waiting = await evaluate(host, `({ session: window.__sharedYardV0Session(), evidence: window.__sharedYardV0Evidence() })`);
  const secondEpoch = e2Waiting.evidence.identity?.worldEpoch;
  assert(secondEpoch && secondEpoch !== firstEpoch, `E2 did not get fresh epoch ${secondEpoch}`);
  assert(e2Waiting.session.runKey === runKey, `room identity changed ${e2Waiting.session.runKey} != ${runKey}`);
  assert(e2Waiting.session.inviteUrl === originalInvite, `invite changed across epochs ${e2Waiting.session.inviteUrl} != ${originalInvite}`);
  assert(e2Waiting.evidence.protocolStartTick === null, `E2 waiting unexpectedly active ${e2Waiting.evidence.protocolStartTick}`);
  assert(e2Waiting.evidence.roomContinuity?.attempts === 1, "continuity attempted more than once for E1");
  assert(e2Waiting.evidence.roomContinuity?.authorityCloseSemantic === "generic-websocket-close-not-proven-voluntary-leave", "close ambiguity was lost");
  assert(e2Waiting.evidence.roomContinuity?.triggerPlan?.action === "auto-rearm", `missing auto-rearm trigger plan ${JSON.stringify(e2Waiting.evidence.roomContinuity?.triggerPlan)}`);
  assert(e2Waiting.evidence.roomContinuity?.triggerPlan?.reason === "eligible-connection-close", `unexpected trigger reason ${JSON.stringify(e2Waiting.evidence.roomContinuity?.triggerPlan)}`);
  assert(e2Waiting.evidence.roomContinuity?.lastPlan?.action === "hold" && e2Waiting.evidence.roomContinuity?.lastPlan?.reason === "not-clean-epoch-end", `E2 policy should settle to hold ${JSON.stringify(e2Waiting.evidence.roomContinuity?.lastPlan)}`);

  // Re-open the exact invite captured in E1. A new friend browser must join E2;
  // the invite itself is not regenerated or rewritten between epochs.
  friend2 = await startBrowser(chrome, 2, originalInvite);
  const friend2Boot = await bootAndEnter(friend2, `peer-b-${suffix}`, "invite");
  assert(friend2Boot.run === runKey, `returning friend invite room ${friend2Boot.run} != ${runKey}`);
  assert(friend2Boot.continuity?.requested === false, "returning friend unexpectedly entered host continuity mode");

  await waitFor(host, livePredicate, "host E2 live after same invite returns");
  await waitFor(friend2, livePredicate, "returning friend E2 live");
  const e2HostLive = await evaluate(host, `window.__sharedYardV0Evidence()`);
  const e2FriendLive = await evaluate(friend2, `window.__sharedYardV0Evidence()`);
  assert(e2HostLive.identity.worldEpoch === secondEpoch, "host left E2 unexpectedly");
  assert(e2FriendLive.identity.worldEpoch === secondEpoch, "same invite did not join E2");
  assert(e2HostLive.identity.worldId === e2FriendLive.identity.worldId, "returning friend joined different logical room");
  assert(e2HostLive.metrics.guardMismatches === 0 && e2FriendLive.metrics.guardMismatches === 0, "state mismatch after continuity rejoin");

  Object.assign(result, {
    verdict: "WORLD_V0_ROOM_CONTINUITY_PASS",
    revision: WORLD_V0_ROOM_CONTINUITY_REVISION,
    runKey,
    originalInvite,
    firstEpoch,
    secondEpoch,
    continuity: e2HostLive.roomContinuity,
    e1: {
      hostBoundary: e1HostLive.localBoundaryTick,
      friendBoundary: e1FriendLive.localBoundaryTick,
      hostGuards: e1HostLive.metrics.guardMatches,
      friendGuards: e1FriendLive.metrics.guardMatches,
    },
    e2: {
      hostBoundary: e2HostLive.localBoundaryTick,
      friendBoundary: e2FriendLive.localBoundaryTick,
      hostGuards: e2HostLive.metrics.guardMatches,
      friendGuards: e2FriendLive.metrics.guardMatches,
    },
  });
  writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
  console.log("WORLD_V0_ROOM_CONTINUITY_PASS", JSON.stringify({ runKey, firstEpoch, secondEpoch }));
} catch (error) {
  result.error = error instanceof Error ? error.stack || error.message : String(error);
  result.host = await diagnostic(host);
  result.friend1 = await diagnostic(friend1);
  result.friend2 = await diagnostic(friend2);
  result.chromeStderr = {
    host: host ? Buffer.concat(host.stderr).toString("utf8").slice(-6000) : null,
    friend1: friend1 ? Buffer.concat(friend1.stderr).toString("utf8").slice(-6000) : null,
    friend2: friend2 ? Buffer.concat(friend2.stderr).toString("utf8").slice(-6000) : null,
  };
  writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
  throw error;
} finally {
  await stopBrowser(friend2);
  await stopBrowser(friend1);
  await stopBrowser(host);
}
