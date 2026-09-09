import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { WORLD_V0_FRIEND_ENTRY_REVISION } from "../public/world-v0/friend-entry.js";
import { WORLD_V0_HUMAN_ENTRY_REVISION } from "../public/world-v0/human-entry-core.js";

const BASE = (process.env.MW_WORLD_V0_HUMAN_ENTRY_BASE_URL || "http://127.0.0.1:8787").replace(/\/$/, "");
const PAGE_URL = `${BASE}/world-v0/`;
const DEBUG_PORTS = [9572, 9573, 9574];
const TIMEOUT_MS = 45_000;
const OUTPUT = process.env.MW_WORLD_V0_HUMAN_ENTRY_OUTPUT || "world-v0-human-entry-evidence.json";

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
  const profile = mkdtempSync(join(tmpdir(), `mw-human-entry-${index}-`));
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
    return { profile, stderr, child, cdp, sessionId };
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
  if (client.child?.exitCode === null) client.child.kill("SIGKILL");
  try { rmSync(client.profile, { recursive: true, force: true }); } catch { /* cleanup */ }
}

async function evaluate(client, expression) {
  return await client.cdp.evaluate(client.sessionId, expression);
}

async function waitFor(client, expression, label, timeoutMs = TIMEOUT_MS) {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < timeoutMs) {
    try {
      last = await evaluate(client, expression);
      if (last) return last;
    } catch (error) { last = error instanceof Error ? error.message : String(error); }
    await sleep(120);
  }
  throw new Error(`${label} timeout · last=${JSON.stringify(last)}`);
}

async function diagnostic(client) {
  if (!client) return null;
  try {
    return await evaluate(client, `({
      href: location.href,
      title: document.querySelector("#boot h1")?.textContent || null,
      status: document.querySelector("#boot-status")?.textContent || null,
      callsign: document.querySelector("#callsign")?.value || null,
      callsignHelp: document.querySelector("#callsign-help")?.textContent || null,
      entry: window.__sharedYardV0FriendEntry?.() || null,
      session: window.__sharedYardV0Session?.() || null,
      evidence: window.__sharedYardV0Evidence?.() || null,
    })`);
  } catch (error) {
    return { diagnosticError: error instanceof Error ? error.message : String(error) };
  }
}

function assertJoined(evidence, label) {
  assert(evidence?.runtimeFailed === false, `${label} runtime failed ${evidence?.runtimeFailureReason}`);
  assert(evidence.identity?.worldId && evidence.identity?.worldEpoch, `${label} missing world identity`);
  assert(Number.isInteger(evidence.localBoundaryTick) && evidence.localBoundaryTick >= 24, `${label} insufficient progression B(${evidence.localBoundaryTick})`);
  assert(evidence.presentation?.selfPresence === "YOU", `${label} self presence missing`);
  assert(evidence.presentation?.remotePresence === "PEER", `${label} peer presence missing`);
  assert(evidence.metrics?.guardMismatches === 0, `${label} guard mismatches ${evidence.metrics?.guardMismatches}`);
  assert(evidence.metrics?.firstStateMismatch == null, `${label} state mismatch ${JSON.stringify(evidence.metrics?.firstStateMismatch)}`);
}

const roomKey = `yard-${randomBytes(10).toString("base64url")}`;
assert(roomKey.length === 19, `human test room key length ${roomKey.length}`);
const directUrl = `${PAGE_URL}?run=${encodeURIComponent(roomKey)}`;
const chrome = findChrome();
let owner = null;
let peer = null;
let reopenedPeer = null;
const result = {
  verdict: "WORLD_V0_HUMAN_ENTRY_FAIL",
  generatedAt: new Date().toISOString(),
  roomKey,
  directUrl,
};

try {
  owner = await startBrowser(chrome, 0, directUrl);
  await waitFor(owner, `document.readyState === "complete" && document.querySelector("#enter")?.disabled === false && typeof window.__sharedYardV0FriendEntry === "function"`, "owner cold direct-link boot");

  const ownerBoot = await evaluate(owner, `({
    entry: window.__sharedYardV0FriendEntry(),
    title: document.querySelector("#boot h1")?.textContent,
    status: document.querySelector("#boot-status")?.textContent,
    enterText: document.querySelector("#enter")?.textContent,
    run: document.querySelector("#run")?.value,
    roomListHidden: document.querySelector("#public-room-entry")?.classList.contains("hidden"),
  })`);
  assert(ownerBoot.entry.revision === WORLD_V0_FRIEND_ENTRY_REVISION, `friend entry revision ${ownerBoot.entry.revision}`);
  assert(ownerBoot.entry.humanEntryRevision === WORLD_V0_HUMAN_ENTRY_REVISION, `human entry revision ${ownerBoot.entry.humanEntryRevision}`);
  assert(ownerBoot.entry.mode === "invite", `direct-link mode ${ownerBoot.entry.mode}`);
  assert(ownerBoot.title === "Enter shared world", `owner-first title ${ownerBoot.title}`);
  assert(ownerBoot.enterText === "Enter world", `owner-first enter label ${ownerBoot.enterText}`);
  assert(ownerBoot.run === roomKey, `owner direct room mismatch ${ownerBoot.run}`);
  assert(ownerBoot.roomListHidden === true, "direct link must not pollute entry with public room list");

  await evaluate(owner, `(() => {
    const input = document.querySelector("#callsign");
    input.value = "😀";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    document.querySelector("#enter").click();
    return true;
  })()`);
  const rejected = await evaluate(owner, `({
    compact: document.querySelector("#boot")?.classList.contains("compact"),
    invalid: document.querySelector("#callsign")?.getAttribute("aria-invalid"),
    help: document.querySelector("#callsign-help")?.textContent,
    networkState: window.__sharedYardV0Session?.().networkState,
  })`);
  assert(rejected.compact === false, "invalid human name unexpectedly entered world");
  assert(rejected.invalid === "true", `invalid human name aria state ${rejected.invalid}`);
  assert(rejected.help.includes("at least one letter or number"), `invalid human name guidance ${rejected.help}`);
  assert(rejected.networkState === "idle", `invalid human name touched network ${rejected.networkState}`);

  await evaluate(owner, `(() => {
    const input = document.querySelector("#callsign");
    input.value = "Józz :D";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    return true;
  })()`);
  await waitFor(owner, `window.__sharedYardV0Session?.().networkState === "waiting for peer"`, "owner-first waiting");
  const ownerWaiting = await evaluate(owner, `({
    callsign: document.querySelector("#callsign")?.value,
    storedCallsign: localStorage.getItem("shared-yard-v0-callsign"),
    href: location.href,
    session: window.__sharedYardV0Session(),
    evidence: window.__sharedYardV0Evidence(),
  })`);
  assert(ownerWaiting.callsign === "Jozz-D", `owner normalized callsign ${ownerWaiting.callsign}`);
  assert(ownerWaiting.storedCallsign === "Jozz-D", `owner stored callsign ${ownerWaiting.storedCallsign}`);
  assert(new URL(ownerWaiting.href).searchParams.get("run") === roomKey, `owner run drift ${ownerWaiting.href}`);
  assert(ownerWaiting.evidence.runtimeFailed === false, `owner waiting runtime failed ${ownerWaiting.evidence.runtimeFailureReason}`);

  peer = await startBrowser(chrome, 1, directUrl);
  await waitFor(peer, `document.readyState === "complete" && document.querySelector("#enter")?.disabled === false && typeof window.__sharedYardV0FriendEntry === "function"`, "peer direct-link boot");
  const peerBoot = await evaluate(peer, `({
    title: document.querySelector("#boot h1")?.textContent,
    enterText: document.querySelector("#enter")?.textContent,
    entry: window.__sharedYardV0FriendEntry(),
  })`);
  assert(peerBoot.title === "Enter shared world", `peer title ${peerBoot.title}`);
  assert(peerBoot.enterText === "Enter world", `peer enter label ${peerBoot.enterText}`);
  assert(peerBoot.entry.mode === "invite", `peer entry mode ${peerBoot.entry.mode}`);

  await evaluate(peer, `(() => {
    const input = document.querySelector("#callsign");
    input.value = "Ktoś testowy";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    document.querySelector("#enter").click();
    return true;
  })()`);

  const joinedPredicate = `(() => {
    const e = window.__sharedYardV0Evidence?.();
    if (!e) return false;
    if (e.runtimeFailed || String(e.networkState || "").startsWith("closed")) return true;
    return Boolean(e.identity?.worldId && e.identity?.worldEpoch) &&
      Number.isInteger(e.localBoundaryTick) && e.localBoundaryTick >= 24 &&
      e.presentation?.selfPresence === "YOU" && e.presentation?.remotePresence === "PEER";
  })()`;
  await waitFor(owner, joinedPredicate, "owner joined after peer");
  await waitFor(peer, joinedPredicate, "peer joined owner-first world");

  const guardPredicate = `(() => {
    const e = window.__sharedYardV0Evidence?.();
    return e?.runtimeFailed || String(e?.networkState || "").startsWith("closed") ||
      (e?.metrics?.guardMatches >= 4 && e?.metrics?.guardMismatches === 0);
  })()`;
  await waitFor(owner, guardPredicate, "owner exact guards");
  await waitFor(peer, guardPredicate, "peer exact guards");

  const ownerLive = await evaluate(owner, `window.__sharedYardV0Evidence()`);
  const peerLive = await evaluate(peer, `window.__sharedYardV0Evidence()`);
  const peerName = await evaluate(peer, `({ value: document.querySelector("#callsign")?.value, stored: localStorage.getItem("shared-yard-v0-callsign") })`);
  assertJoined(ownerLive, "owner");
  assertJoined(peerLive, "peer");
  assert(peerName.value === "Ktos-testowy", `peer normalized callsign ${peerName.value}`);
  assert(peerName.stored === "Ktos-testowy", `peer stored callsign ${peerName.stored}`);
  assert(ownerLive.identity.worldId === `shared-yard-v0-${roomKey}`, `owner logical world ${ownerLive.identity.worldId}`);
  assert(ownerLive.identity.worldId === peerLive.identity.worldId, "owner/peer worldId mismatch");
  assert(ownerLive.identity.worldEpoch === peerLive.identity.worldEpoch, "owner/peer WorldEpoch mismatch");

  const ownerEpochBeforePeerClose = ownerLive.identity.worldEpoch;
  const ownerBoundaryBeforePeerClose = ownerLive.localBoundaryTick;
  await stopBrowser(peer);
  peer = null;

  await waitFor(owner, `(() => {
    const e = window.__sharedYardV0Evidence?.();
    return e && !e.runtimeFailed &&
      e.identity?.worldEpoch === ${JSON.stringify(ownerEpochBeforePeerClose)} &&
      Number.isInteger(e.localBoundaryTick) && e.localBoundaryTick >= ${ownerBoundaryBeforePeerClose + 12} &&
      !String(e.networkState || "").startsWith("closed");
  })()`, "owner remains live after peer tab close");

  reopenedPeer = await startBrowser(chrome, 2, directUrl);
  await waitFor(reopenedPeer, `document.readyState === "complete" && document.querySelector("#enter")?.disabled === false && typeof window.__sharedYardV0FriendEntry === "function"`, "fresh reopen boot");
  await evaluate(reopenedPeer, `(() => {
    const input = document.querySelector("#callsign");
    input.value = "Ktoś wraca";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    document.querySelector("#enter").click();
    return true;
  })()`);
  await waitFor(reopenedPeer, `String(window.__sharedYardV0Session?.().networkState || "").startsWith("join failed")`, "fresh reopen rejected truthfully");

  const reopen = await evaluate(reopenedPeer, `({
    session: window.__sharedYardV0Session?.(),
    evidence: window.__sharedYardV0Evidence?.(),
    notice: document.querySelector("#notice")?.textContent || "",
  })`);
  assert(reopen.session?.restartAvailable === false, "fresh reopen incorrectly offers Restart");
  assert(reopen.evidence?.identity == null, "fresh reopen unexpectedly acquired world identity");
  assert(reopen.evidence?.session?.end?.kind === "join-failed", `fresh reopen end kind ${reopen.evidence?.session?.end?.kind}`);
  assert(reopen.evidence?.session?.end?.classification === "room-unknown", `fresh reopen classification ${reopen.evidence?.session?.end?.classification}`);
  assert(reopen.evidence?.session?.end?.directoryReachable === true, "fresh reopen directory unexpectedly unreachable");
  assert(reopen.notice.includes("join failed"), `fresh reopen notice ${reopen.notice}`);
  assert(!reopen.notice.includes("full right now"), `fresh reopen guessed public capacity ${reopen.notice}`);
  assert(!reopen.notice.includes("connection or handshake problem"), `fresh reopen guessed transport failure ${reopen.notice}`);

  const ownerAfterReopen = await evaluate(owner, `window.__sharedYardV0Evidence()`);
  assert(ownerAfterReopen.runtimeFailed === false, `owner failed after peer reopen ${ownerAfterReopen.runtimeFailureReason}`);
  assert(ownerAfterReopen.identity?.worldEpoch === ownerEpochBeforePeerClose, "healthy owner WorldEpoch rotated during peer close/reopen");
  assert(ownerAfterReopen.localBoundaryTick > ownerBoundaryBeforePeerClose, "healthy owner stopped progressing during peer close/reopen");
  assert(!String(ownerAfterReopen.networkState || "").startsWith("closed"), `healthy owner closed during peer reopen ${ownerAfterReopen.networkState}`);

  Object.assign(result, {
    verdict: "WORLD_V0_HUMAN_ENTRY_PASS",
    friendEntryRevision: WORLD_V0_FRIEND_ENTRY_REVISION,
    humanEntryRevision: WORLD_V0_HUMAN_ENTRY_REVISION,
    invalidInputBlockedBeforeNetwork: true,
    ownerInput: "Józz :D",
    ownerWireName: "Jozz-D",
    peerInput: "Ktoś testowy",
    peerWireName: "Ktos-testowy",
    ownerEntryMethod: "cold direct-link first entrant + Enter key",
    peerEntryMethod: "same cold direct link + button click",
    worldId: ownerLive.identity.worldId,
    worldEpoch: ownerLive.identity.worldEpoch,
    ownerGuardMatches: ownerLive.metrics.guardMatches,
    peerGuardMatches: peerLive.metrics.guardMatches,
    peerTabCloseFreshReopenRejectedTruthfully: true,
    healthyOwnerWorldEpochPreservedAcrossPeerReopen: true,
    ownerBoundaryBeforePeerClose,
    ownerBoundaryAfterPeerReopen: ownerAfterReopen.localBoundaryTick,
  });
  writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
  console.log("WORLD_V0_HUMAN_ENTRY_PASS", JSON.stringify({ roomKey, worldEpoch: ownerLive.identity.worldEpoch }));
} catch (error) {
  result.error = error instanceof Error ? error.stack || error.message : String(error);
  result.ownerDiagnostic = await diagnostic(owner);
  result.peerDiagnostic = await diagnostic(peer);
  result.reopenedPeerDiagnostic = await diagnostic(reopenedPeer);
  result.ownerChromeStderr = owner ? Buffer.concat(owner.stderr).toString("utf8").slice(-5000) : null;
  result.peerChromeStderr = peer ? Buffer.concat(peer.stderr).toString("utf8").slice(-5000) : null;
  result.reopenedPeerChromeStderr = reopenedPeer ? Buffer.concat(reopenedPeer.stderr).toString("utf8").slice(-5000) : null;
  writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
  throw error;
} finally {
  await stopBrowser(reopenedPeer);
  await stopBrowser(peer);
  await stopBrowser(owner);
}
