import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { WORLD_V0_BROWSER_UI_REVISION } from "../public/world-v0/build-contract.js";
import { WORLD_V0_FRIEND_ENTRY_REVISION, WORLD_V0_ROOM_KEY_PATTERN } from "../public/world-v0/friend-entry.js";

const BASE = (process.env.MW_WORLD_V0_FRIEND_ENTRY_BASE_URL || "http://127.0.0.1:8787").replace(/\/$/, "");
const PAGE_URL = `${BASE}/world-v0/`;
const DEBUG_PORTS = [9562, 9563];
const TIMEOUT_MS = 40_000;
const OUTPUT = process.env.MW_WORLD_V0_FRIEND_ENTRY_OUTPUT || "world-v0-friend-entry-evidence.json";

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
  const profile = mkdtempSync(join(tmpdir(), `mw-friend-entry-${index}-`));
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
  if (client.child?.exitCode === null) client.child.kill("SIGKILL");
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
      title: document.querySelector("#boot h1")?.textContent || null,
      status: document.querySelector("#boot-status")?.textContent || null,
      entry: window.__sharedYardV0FriendEntry?.() || null,
      session: window.__sharedYardV0Session?.() || null,
      evidence: window.__sharedYardV0Evidence?.() || null,
    })`);
  } catch (error) {
    return { diagnosticError: error instanceof Error ? error.message : String(error) };
  }
}

function assertJoinedWorld(evidence, label) {
  assert(evidence && evidence.runtimeFailed === false, `${label} runtime failure ${evidence?.runtimeFailureReason}`);
  assert(evidence.identity?.worldId && evidence.identity?.worldEpoch, `${label} missing world identity`);
  assert(Number.isInteger(evidence.localBoundaryTick) && evidence.localBoundaryTick >= 24, `${label} insufficient world progression B(${evidence.localBoundaryTick})`);
  assert(evidence.presentation?.selfPresence === "YOU", `${label} self presence missing`);
  assert(evidence.presentation?.remotePresence === "PEER", `${label} peer presence missing`);
  assert(evidence.lifecycleEvents?.some((event) => event.type === "world-start"), `${label} world-start lifecycle missing`);
  assert(!String(evidence.networkState || "").startsWith("closed"), `${label} transport closed ${evidence.networkState}`);
  assert(evidence.metrics?.guardMismatches === 0, `${label} guard mismatches ${evidence.metrics?.guardMismatches}`);
  assert(evidence.metrics?.firstStateMismatch == null, `${label} first state mismatch ${JSON.stringify(evidence.metrics?.firstStateMismatch)}`);
}

const chrome = findChrome();
let host = null;
let friend = null;
let hostBoot = null;
let hostWaiting = null;
let friendBoot = null;
const result = { verdict: "WORLD_V0_FRIEND_ENTRY_FAIL", generatedAt: new Date().toISOString(), page: PAGE_URL };

try {
  host = await startBrowser(chrome, 0, PAGE_URL);
  await waitFor(host, `document.readyState === "complete" && document.querySelector("#enter")?.disabled === false && typeof window.__sharedYardV0FriendEntry === "function"`, "host Friend-Ready boot");

  hostBoot = await evaluate(host, `({
    entry: window.__sharedYardV0FriendEntry(),
    title: document.querySelector("#boot h1")?.textContent,
    status: document.querySelector("#boot-status")?.textContent,
    callsign: document.querySelector("#callsign")?.value,
    run: document.querySelector("#run")?.value,
    advancedOpen: document.querySelector("#entry-advanced")?.open,
    enterText: document.querySelector("#enter")?.textContent,
    inspectInsideAdvanced: document.querySelector("#entry-advanced")?.contains(document.querySelector("#inspect-solo")),
  })`);

  assert(hostBoot.entry.revision === WORLD_V0_FRIEND_ENTRY_REVISION, `friend-entry revision ${hostBoot.entry.revision}`);
  assert(hostBoot.entry.mode === "host", `base page entry mode ${hostBoot.entry.mode}`);
  assert(hostBoot.title === "Enter Multi_World", `host title ${hostBoot.title}`);
  assert(hostBoot.enterText === "Enter world", `host enter label ${hostBoot.enterText}`);
  assert(hostBoot.advancedOpen === false, "advanced room/inspection controls must be closed by default");
  assert(hostBoot.inspectInsideAdvanced === true, "Inspect solo must live under advanced entry surface");
  assert(WORLD_V0_ROOM_KEY_PATTERN.test(hostBoot.run), `host room key invalid ${hostBoot.run}`);
  assert(hostBoot.run.length === 19, `host Web-Crypto room key length ${hostBoot.run.length}`);
  assert(!/^yard-[a-z0-9]{6}$/.test(hostBoot.run), `legacy short random room survived Friend-Ready bootstrap ${hostBoot.run}`);

  const suffix = Date.now().toString(36).slice(-6);
  const hostName = `host-${suffix}`;
  await evaluate(host, `(() => {
    document.querySelector("#callsign").value = ${JSON.stringify(hostName)};
    document.querySelector("#enter").click();
    return true;
  })()`);

  await waitFor(host, `(() => {
    const s = window.__sharedYardV0Session?.();
    return s?.networkState === "waiting for peer" && !document.querySelector("#copy-invite")?.classList.contains("hidden");
  })()`, "host waiting with invite action");

  hostWaiting = await evaluate(host, `({
    session: window.__sharedYardV0Session(),
    evidence: window.__sharedYardV0Evidence(),
    location: location.href,
    status: document.querySelector("#boot-status")?.textContent,
    inviteText: document.querySelector("#copy-invite")?.textContent,
  })`);
  assert(hostWaiting.evidence.uiRevision === WORLD_V0_BROWSER_UI_REVISION, `UI revision ${hostWaiting.evidence.uiRevision}`);
  assert(hostWaiting.evidence.runtimeFailed === false, `host runtime failed ${hostWaiting.evidence.runtimeFailureReason}`);
  assert(hostWaiting.evidence.friendEntry?.mode === "host", "host evidence missing Friend-Ready entry classification");
  assert(hostWaiting.inviteText === "Invite friend", `invite action label ${hostWaiting.inviteText}`);
  assert(hostWaiting.status.includes("Waiting for friend"), `waiting status leaked lab wording ${hostWaiting.status}`);

  const inviteUrl = new URL(hostWaiting.session.inviteUrl);
  const roomKey = inviteUrl.searchParams.get("run");
  assert(roomKey === hostBoot.run, `invite room drift ${roomKey} != ${hostBoot.run}`);
  assert(!inviteUrl.searchParams.has("player"), `invite leaked host identity ${inviteUrl}`);
  assert(new URL(hostWaiting.location).searchParams.get("run") === roomKey, `host URL missing canonical room identity ${hostWaiting.location}`);

  friend = await startBrowser(chrome, 1, inviteUrl.toString());
  await waitFor(friend, `document.readyState === "complete" && document.querySelector("#enter")?.disabled === false && typeof window.__sharedYardV0FriendEntry === "function"`, "friend invite boot");

  friendBoot = await evaluate(friend, `({
    entry: window.__sharedYardV0FriendEntry(),
    title: document.querySelector("#boot h1")?.textContent,
    status: document.querySelector("#boot-status")?.textContent,
    callsign: document.querySelector("#callsign")?.value,
    run: document.querySelector("#run")?.value,
    advancedOpen: document.querySelector("#entry-advanced")?.open,
    enterText: document.querySelector("#enter")?.textContent,
  })`);
  assert(friendBoot.entry.mode === "invite" && friendBoot.entry.invited === true, `friend mode ${JSON.stringify(friendBoot.entry)}`);
  assert(friendBoot.title === "Join your friend", `friend title ${friendBoot.title}`);
  assert(friendBoot.enterText === "Join world", `friend join label ${friendBoot.enterText}`);
  assert(friendBoot.callsign === "", `separate friend browser inherited host callsign ${friendBoot.callsign}`);
  assert(friendBoot.run === roomKey, `friend invite room mismatch ${friendBoot.run} != ${roomKey}`);
  assert(friendBoot.advancedOpen === false, "friend should not need raw room controls");

  const friendName = `peer-${suffix}`;
  await evaluate(friend, `(() => {
    document.querySelector("#callsign").value = ${JSON.stringify(friendName)};
    document.querySelector("#enter").click();
    return true;
  })()`);

  const joinedPredicate = `(() => {
    const e = window.__sharedYardV0Evidence?.();
    if (!e) return false;
    if (e.runtimeFailed || String(e.networkState || "").startsWith("closed")) return true;
    return Boolean(e.identity?.worldId && e.identity?.worldEpoch) &&
      Number.isInteger(e.localBoundaryTick) && e.localBoundaryTick >= 24 &&
      e.presentation?.selfPresence === "YOU" && e.presentation?.remotePresence === "PEER" &&
      e.lifecycleEvents?.some((event) => event.type === "world-start");
  })()`;
  await waitFor(host, joinedPredicate, "host shared-world evidence after friend join");
  await waitFor(friend, joinedPredicate, "friend shared-world evidence after invite join");

  let hostLive = await evaluate(host, `window.__sharedYardV0Evidence()`);
  let friendLive = await evaluate(friend, `window.__sharedYardV0Evidence()`);
  assertJoinedWorld(hostLive, "host");
  assertJoinedWorld(friendLive, "friend");

  const guardPredicate = `(() => {
    const e = window.__sharedYardV0Evidence?.();
    return e?.runtimeFailed || String(e?.networkState || "").startsWith("closed") ||
      (e?.metrics?.guardMatches >= 4 && e?.metrics?.guardMismatches === 0);
  })()`;
  await waitFor(host, guardPredicate, "host exact-state runway");
  await waitFor(friend, guardPredicate, "friend exact-state runway");

  hostLive = await evaluate(host, `window.__sharedYardV0Evidence()`);
  friendLive = await evaluate(friend, `window.__sharedYardV0Evidence()`);
  assertJoinedWorld(hostLive, "host final");
  assertJoinedWorld(friendLive, "friend final");
  assert(hostLive.metrics.guardMatches >= 4, `host guard runway ${hostLive.metrics.guardMatches}`);
  assert(friendLive.metrics.guardMatches >= 4, `friend guard runway ${friendLive.metrics.guardMatches}`);
  assert(hostLive.identity.worldId === friendLive.identity.worldId, `worldId mismatch ${hostLive.identity.worldId} != ${friendLive.identity.worldId}`);
  assert(hostLive.identity.worldEpoch === friendLive.identity.worldEpoch, "host/friend joined different epochs");
  assert(hostLive.identity.worldId === `shared-yard-v0-${roomKey}`, `unexpected logical world ${hostLive.identity.worldId}`);

  const startupBacklogObserved = [hostLive, friendLive].some((evidence) => evidence.networkState === "prediction backlog");
  Object.assign(result, {
    verdict: "WORLD_V0_FRIEND_ENTRY_PASS",
    uiRevision: hostLive.uiRevision,
    friendEntryRevision: WORLD_V0_FRIEND_ENTRY_REVISION,
    roomKey,
    inviteUrl: inviteUrl.toString(),
    browsers: "two-independent-chromium-processes",
    startupBacklogObserved,
    claimBoundary: "friend-entry PASS is based on shared identity, world-start, two-sided presence and exact guards; prediction-backlog status is retained as a hosted startup diagnostic rather than treated as disconnect",
    host: {
      entryMode: hostBoot.entry.mode,
      waitingStatus: hostWaiting.status,
      inviteText: hostWaiting.inviteText,
      networkState: hostLive.networkState,
      worldId: hostLive.identity.worldId,
      worldEpoch: hostLive.identity.worldEpoch,
      boundaryTick: hostLive.localBoundaryTick,
      guardMatches: hostLive.metrics.guardMatches,
      guardMismatches: hostLive.metrics.guardMismatches,
      frameP95Ms: hostLive.frame.p95Ms,
      frameMaxMs: hostLive.frame.maxMs,
    },
    friend: {
      entryMode: friendBoot.entry.mode,
      title: friendBoot.title,
      enterText: friendBoot.enterText,
      networkState: friendLive.networkState,
      worldId: friendLive.identity.worldId,
      worldEpoch: friendLive.identity.worldEpoch,
      boundaryTick: friendLive.localBoundaryTick,
      guardMatches: friendLive.metrics.guardMatches,
      guardMismatches: friendLive.metrics.guardMismatches,
      frameP95Ms: friendLive.frame.p95Ms,
      frameMaxMs: friendLive.frame.maxMs,
    },
  });
  writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
  console.log("WORLD_V0_FRIEND_ENTRY_PASS", JSON.stringify({ roomKey, worldEpoch: hostLive.identity.worldEpoch, startupBacklogObserved }));
} catch (error) {
  result.error = error instanceof Error ? error.stack || error.message : String(error);
  result.hostDiagnostic = await diagnostic(host);
  result.friendDiagnostic = await diagnostic(friend);
  result.hostChromeStderr = host ? Buffer.concat(host.stderr).toString("utf8").slice(-5000) : null;
  result.friendChromeStderr = friend ? Buffer.concat(friend.stderr).toString("utf8").slice(-5000) : null;
  writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
  throw error;
} finally {
  await stopBrowser(friend);
  await stopBrowser(host);
}
