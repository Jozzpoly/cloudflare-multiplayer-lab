import net from "node:net";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { WORLD_V0_EXPECTED_SIM_BUILD_ID } from "../public/world-v0/build-contract.js";
import { WORLD_V0_TIMING } from "../src/world-v0-contract.ts";

const BASE = (process.env.MW_WORLD_V0_JUMP_REPAIR_BASE || "http://127.0.0.1:8787").replace(/\/$/, "");
const TARGET = new URL(BASE);
const PROXY_PORT = Number(process.env.MW_WORLD_V0_JUMP_REPAIR_PROXY_PORT || 8794);
const DELAY_MS = Number(process.env.MW_WORLD_V0_JUMP_REPAIR_DELAY_MS || 45);
const OUTPUT = process.env.MW_WORLD_V0_JUMP_REPAIR_OUTPUT || "world-v0-jump-window-repair.json";
const PORTS = [9792, 9793];
const TIMEOUT_MS = 45_000;
const TARGET_PAGE = `http://127.0.0.1:${PROXY_PORT}/world-v0/`;
const PEER_PAGE = `${BASE}/world-v0/`;

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function assert(value, message) { if (!value) throw new Error(message); }

function hardClose(socket) {
  if (!socket || socket.destroyed) return;
  try { socket.destroy(); } catch {}
}

function createDelayProxy() {
  let delayMs = 0;
  let accepted = 0;
  let delayedChunks = 0;
  let delayedBytes = 0;
  const pairs = new Set();
  const timers = new Set();

  const server = net.createServer((client) => {
    accepted += 1;
    client.setNoDelay(true);
    const upstream = net.connect({
      host: TARGET.hostname,
      port: Number(TARGET.port || (TARGET.protocol === "https:" ? 443 : 80)),
    });
    upstream.setNoDelay(true);
    const pair = { client, upstream };
    pairs.add(pair);
    const retire = () => {
      pairs.delete(pair);
      hardClose(client);
      hardClose(upstream);
    };
    client.on("error", retire);
    upstream.on("error", retire);
    client.on("close", () => { pairs.delete(pair); hardClose(upstream); });
    upstream.on("close", () => { pairs.delete(pair); hardClose(client); });

    client.on("data", (chunk) => {
      const payload = Buffer.from(chunk);
      const activeDelay = delayMs;
      if (activeDelay <= 0) {
        if (!upstream.destroyed) upstream.write(payload);
        return;
      }
      delayedChunks += 1;
      delayedBytes += payload.byteLength;
      const timer = setTimeout(() => {
        timers.delete(timer);
        if (!upstream.destroyed) upstream.write(payload);
      }, activeDelay);
      timers.add(timer);
    });
    upstream.on("data", (chunk) => {
      if (!client.destroyed) client.write(chunk);
    });
  });

  return {
    async listen() {
      await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(PROXY_PORT, "127.0.0.1", resolve);
      });
    },
    setDelay(value) { delayMs = Math.max(0, Number(value) || 0); },
    snapshot() { return { delayMs, accepted, activePairs: pairs.size, delayedChunks, delayedBytes }; },
    async close() {
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
      for (const pair of [...pairs]) {
        hardClose(pair.client);
        hardClose(pair.upstream);
      }
      pairs.clear();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

function findChrome() {
  const override = process.env.CHROME_BIN?.trim();
  if (override) return override;
  const probe = spawnSync("bash", ["-lc", "command -v google-chrome || command -v google-chrome-stable || command -v chromium || command -v chromium-browser"], { encoding: "utf8" });
  const binary = probe.stdout.trim().split("\n")[0];
  if (!binary) throw new Error(`Chrome/Chromium binary not found: ${probe.stderr || "no candidate"}`);
  return binary;
}

function chromeVersion(binary) {
  const result = spawnSync(binary, ["--version"], { encoding: "utf8" });
  return (result.stdout || result.stderr || "unknown").trim();
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
    const response = await this.call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, userGesture: true }, sessionId);
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.text || "browser evaluate failed");
    return response.result?.value;
  }
  close() { try { this.ws.close(); } catch {} }
}

async function waitDebugger(port) {
  const deadline = Date.now() + 20_000;
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

const INSTRUMENTATION = String.raw`(() => {
  const NativeWebSocket = window.WebSocket;
  const audit = { revision: "world-v0-jump-window-wire-v1", sent: [], received: [], keys: [] };
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const now = () => performance.now();
  const compactPlayers = (players) => (players || []).map((player) => ({
    sessionId: player.sessionId || null,
    netEntityId: player.netEntityId || null,
    jump: Boolean(player.jump),
    jumpApplied: Boolean(player.jumpApplied),
    fresh: Boolean(player.fresh),
    source: player.source || null,
    missingStreak: player.missingStreak ?? null,
    position: Array.isArray(player.position) ? [...player.position] : null,
    linearVelocity: Array.isArray(player.linearVelocity) ? [...player.linearVelocity] : null,
  }));

  class AuditWebSocket extends NativeWebSocket {
    constructor(url, protocols) {
      if (protocols === undefined) super(url); else super(url, protocols);
      this.addEventListener("message", (event) => {
        if (typeof event.data !== "string") return;
        let message;
        try { message = JSON.parse(event.data); } catch { return; }
        if (message.type === "world_v0_batch_ack") {
          audit.received.push({ at: now(), type: message.type, batchSeq: message.batchSeq, boundaryTick: message.boundaryTick ?? null, records: clone(message.records || []) });
        } else if (message.type === "world_v0_consumed") {
          audit.received.push({ at: now(), type: message.type, targetTick: message.targetTick, boundaryTick: message.boundaryTick, players: compactPlayers(message.players) });
        } else if (message.type === "world_v0_snapshot") {
          audit.received.push({ at: now(), type: message.type, boundaryTick: message.boundaryTick, players: compactPlayers(message.players) });
        }
        if (audit.received.length > 2200) audit.received.splice(0, audit.received.length - 2200);
      });
    }
    send(data) {
      if (typeof data === "string") {
        try {
          const message = JSON.parse(data);
          if (message.type === "world_v0_input_batch") {
            audit.sent.push({ at: now(), batchSeq: message.batchSeq, records: clone(message.records || []) });
            if (audit.sent.length > 1200) audit.sent.splice(0, audit.sent.length - 1200);
          }
        } catch {}
      }
      return super.send(data);
    }
  }

  window.WebSocket = AuditWebSocket;
  window.addEventListener("keydown", (event) => {
    if (event.code !== "Space" || event.repeat) return;
    let evidence = null;
    try { evidence = window.__sharedYardV0Evidence?.() || null; } catch {}
    audit.keys.push({
      at: now(),
      localBoundaryTick: evidence?.localBoundaryTick ?? null,
      latestAuthorityBoundary: evidence?.metrics?.latestAuthorityBoundary ?? null,
      serverLate: evidence?.metrics?.serverLate ?? null,
    });
  }, true);
  window.__worldV0JumpWindowAudit = () => clone(audit);
})();`;

async function startBrowser(binary, index, url, instrument = false) {
  const profile = mkdtempSync(join(tmpdir(), `mw-jump-window-${index}-`));
  const stderr = [];
  const child = spawn(binary, [
    "--headless=new", "--no-sandbox", "--disable-dev-shm-usage",
    "--disable-background-networking", "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding",
    "--use-gl=angle", "--use-angle=swiftshader-webgl", "--enable-unsafe-swiftshader",
    `--remote-debugging-port=${PORTS[index]}`, "--remote-debugging-address=127.0.0.1",
    `--user-data-dir=${profile}`, "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"] });
  child.stderr.on("data", (chunk) => stderr.push(chunk));
  const info = await waitDebugger(PORTS[index]);
  const cdp = new Cdp(info.webSocketDebuggerUrl);
  await cdp.opened;
  const { targetId } = await cdp.call("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await cdp.call("Target.attachToTarget", { targetId, flatten: true });
  await cdp.call("Runtime.enable", {}, sessionId);
  await cdp.call("Page.enable", {}, sessionId);
  if (instrument) await cdp.call("Page.addScriptToEvaluateOnNewDocument", { source: INSTRUMENTATION }, sessionId);
  await cdp.call("Page.navigate", { url }, sessionId);
  return { child, profile, stderr, cdp, sessionId };
}

async function stopBrowser(browser) {
  if (!browser) return;
  browser.cdp?.close();
  if (browser.child?.exitCode === null) browser.child.kill("SIGKILL");
  await sleep(100);
  try { rmSync(browser.profile, { recursive: true, force: true }); } catch {}
}

async function evaluate(browser, expression) { return browser.cdp.evaluate(browser.sessionId, expression); }
async function evidence(browser) { return evaluate(browser, "window.__sharedYardV0Evidence?.() || null"); }
async function wire(browser) { return evaluate(browser, "window.__worldV0JumpWindowAudit?.() || null"); }

async function waitFor(browser, expression, label, timeout = TIMEOUT_MS) {
  const deadline = Date.now() + timeout;
  let last = null;
  while (Date.now() < deadline) {
    try {
      last = await evaluate(browser, expression);
      if (last) return last;
    } catch (error) { last = error instanceof Error ? error.message : String(error); }
    await sleep(100);
  }
  throw new Error(`${label} timeout: ${JSON.stringify(last)}`);
}

async function triggerJump(browser) {
  await evaluate(browser, `(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space", key: " ", bubbles: true, cancelable: true }));
    setTimeout(() => window.dispatchEvent(new KeyboardEvent("keyup", { code: "Space", key: " ", bubbles: true, cancelable: true })), 20);
    return true;
  })()`);
}

function player(entry, sessionId) {
  return (entry?.players || []).find((candidate) => candidate.sessionId === sessionId) || null;
}

function latestSnapshot(log, sessionId) {
  const snapshots = (log?.received || []).filter((entry) => entry.type === "world_v0_snapshot");
  for (let index = snapshots.length - 1; index >= 0; index -= 1) {
    const found = player(snapshots[index], sessionId);
    if (found?.position) return { boundaryTick: snapshots[index].boundaryTick, player: found };
  }
  return null;
}

async function waitGrounded(browser, sessionId, timeout = 7000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const log = await wire(browser);
    const latest = latestSnapshot(log, sessionId);
    const y = latest?.player?.position?.[1];
    const vy = latest?.player?.linearVelocity?.[1];
    if (Number.isFinite(y) && y < 0.96 && (!Number.isFinite(vy) || Math.abs(vy) < 0.4)) return latest;
    await sleep(100);
  }
  throw new Error("actor did not reach grounded baseline");
}

function ackRecord(log, batchSeq, targetTick) {
  const ack = (log.received || []).find((entry) => entry.type === "world_v0_batch_ack" && entry.batchSeq === batchSeq);
  const record = (ack?.records || []).find((candidate) => candidate.targetTick === targetTick) || null;
  return ack && record ? { ack, record } : null;
}

const chrome = findChrome();
const proxy = createDelayProxy();
let target = null;
let peer = null;
const result = {
  revision: "world-v0-jump-window-repair-audit-v1",
  verdict: "WORLD_V0_JUMP_WINDOW_REPAIR_FAIL",
  delayMs: DELAY_MS,
  jumpIntentWindowTicks: WORLD_V0_TIMING.jumpIntentWindowTicks,
  chromeVersion: chromeVersion(chrome),
  generatedAt: new Date().toISOString(),
};

try {
  assert(WORLD_V0_TIMING.jumpIntentWindowTicks === 6, `unexpected jump intent window ${WORLD_V0_TIMING.jumpIntentWindowTicks}`);
  await proxy.listen();
  proxy.setDelay(0);
  const suffix = Date.now().toString(36).slice(-7);
  const runKey = `jumpfix-${suffix}`;
  target = await startBrowser(chrome, 0, `${TARGET_PAGE}?player=JumpFixA-${suffix}&run=${runKey}`, true);
  peer = await startBrowser(chrome, 1, `${PEER_PAGE}?player=JumpFixB-${suffix}&run=${runKey}`, false);

  await Promise.all([target, peer].map((browser, index) => waitFor(browser,
    'document.readyState === "complete" && typeof window.__sharedYardV0Evidence === "function" && !document.querySelector("#enter")?.disabled',
    `client ${index} boot`)));
  assert(await evaluate(target, 'typeof window.__worldV0JumpWindowAudit === "function"'), "wire instrumentation missing");
  await evaluate(target, 'document.querySelector("#enter").click(); true');
  await evaluate(peer, 'document.querySelector("#enter").click(); true');
  await Promise.all([target, peer].map((browser, index) => waitFor(browser,
    '(() => { const e=window.__sharedYardV0Evidence?.(); return e?.identity?.worldEpoch && Number.isInteger(e?.protocolStartTick) && e.localBoundaryTick >= e.protocolStartTick + 90 && e.metrics?.guardMismatches === 0; })()',
    `client ${index} live baseline`)));

  const baseline = await evidence(target);
  assert(baseline.identity?.simBuildId === WORLD_V0_EXPECTED_SIM_BUILD_ID, `SimBuild drift ${baseline.identity?.simBuildId}`);
  assert(baseline.session?.actorSessionId, "ActorSession missing");
  const sessionId = baseline.session.actorSessionId;
  const grounded = await waitGrounded(target, sessionId);
  const baselineY = grounded.player.position[1];

  const beforeLog = await wire(target);
  const sentStart = beforeLog.sent.length;
  const keyStart = beforeLog.keys.length;
  const beforeProxy = proxy.snapshot();
  proxy.setDelay(DELAY_MS);
  await sleep(250);
  await triggerJump(target);

  let log = null;
  let trueRecords = [];
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    log = await wire(target);
    trueRecords = (log.sent || []).slice(sentStart).flatMap((send) =>
      (send.records || []).filter((record) => record.jump === true).map((record) => ({
        batchSeq: send.batchSeq,
        sentAt: send.at,
        targetTick: record.targetTick,
      })));
    const uniqueTicks = [...new Set(trueRecords.map((record) => record.targetTick))].sort((a, b) => a - b);
    if (uniqueTicks.length >= WORLD_V0_TIMING.jumpIntentWindowTicks) {
      const lastTick = uniqueTicks.at(-1);
      const consumedThrough = (log.received || []).some((entry) => entry.type === "world_v0_consumed" && entry.targetTick >= lastTick + 6);
      const snapshotThrough = (log.received || []).some((entry) => entry.type === "world_v0_snapshot" && entry.boundaryTick >= lastTick + 30);
      if (consumedThrough && snapshotThrough) break;
    }
    await sleep(75);
  }

  assert(log, "wire log missing");
  const key = log.keys[keyStart] || null;
  assert(key && Number.isInteger(key.latestAuthorityBoundary), "Space key authority boundary missing");
  const uniqueTicks = [...new Set(trueRecords.map((record) => record.targetTick))].sort((a, b) => a - b);
  assert(uniqueTicks.length === WORLD_V0_TIMING.jumpIntentWindowTicks,
    `jump window width ${uniqueTicks.length} != ${WORLD_V0_TIMING.jumpIntentWindowTicks}: ${JSON.stringify(uniqueTicks)}`);
  for (let index = 1; index < uniqueTicks.length; index += 1) {
    assert(uniqueTicks[index] === uniqueTicks[index - 1] + 1, `jump window is not contiguous: ${JSON.stringify(uniqueTicks)}`);
  }

  const sentByTick = new Map();
  for (const record of trueRecords) if (!sentByTick.has(record.targetTick)) sentByTick.set(record.targetTick, record);
  const statuses = uniqueTicks.map((targetTick) => {
    const sent = sentByTick.get(targetTick);
    const acked = ackRecord(log, sent.batchSeq, targetTick);
    return {
      targetTick,
      batchSeq: sent.batchSeq,
      sentAt: sent.sentAt,
      ackBoundaryTick: acked?.ack?.boundaryTick ?? null,
      status: acked?.record?.status ?? null,
    };
  });
  const late = statuses.filter((item) => item.status === "late");
  const accepted = statuses.filter((item) => ["accepted", "superseded", "duplicate_same"].includes(item.status));
  assert(late.length >= 1, `delay did not exercise former late-jump failure: ${JSON.stringify(statuses)}`);
  assert(accepted.length >= 1, `no jump-window tick survived transport delay: ${JSON.stringify(statuses)}`);

  const canonical = uniqueTicks.map((targetTick) => {
    const consumed = (log.received || []).find((entry) => entry.type === "world_v0_consumed" && entry.targetTick === targetTick);
    const actor = player(consumed, sessionId);
    assert(actor, `canonical actor missing at ${targetTick}`);
    return {
      targetTick,
      boundaryTick: consumed.boundaryTick,
      jump: Boolean(actor.jump),
      jumpApplied: Boolean(actor.jumpApplied),
      fresh: Boolean(actor.fresh),
      source: actor.source,
      missingStreak: actor.missingStreak,
    };
  });
  const firstTrueIndex = canonical.findIndex((item) => item.jump === true);
  assert(firstTrueIndex > 0, `test did not lose an early window tick before recovery: ${JSON.stringify(canonical)}`);
  assert(canonical.slice(0, firstTrueIndex).some((item) => item.jump === false), "no canonical false before recovered jump intent");
  const applied = canonical.filter((item) => item.jumpApplied);
  assert(applied.length === 1, `expected exactly one authority jump impulse, got ${applied.length}: ${JSON.stringify(canonical)}`);
  assert(applied[0].jump === true, "authority reported jumpApplied outside canonical true intent");
  assert(applied[0].targetTick === canonical[firstTrueIndex].targetTick,
    `jump impulse did not occur on first recovered rising edge: firstTrue=${canonical[firstTrueIndex].targetTick} applied=${applied[0].targetTick}`);
  assert(canonical.slice(firstTrueIndex + 1).filter((item) => item.jump).every((item) => item.jumpApplied === false),
    `later true window ticks repeated the physical jump: ${JSON.stringify(canonical)}`);

  const snapshots = (log.received || []).filter((entry) => entry.type === "world_v0_snapshot" && entry.boundaryTick >= uniqueTicks[0] && entry.boundaryTick <= uniqueTicks.at(-1) + 30);
  const heights = snapshots.map((entry) => player(entry, sessionId)?.position?.[1]).filter(Number.isFinite);
  assert(heights.length >= 3, "insufficient authority height samples");
  const maxY = Math.max(...heights);
  assert(maxY > baselineY + 0.35, `authority actor did not jump: baseline=${baselineY} max=${maxY}`);

  const finalEvidence = await evidence(target);
  const afterProxy = proxy.snapshot();
  assert(finalEvidence.runtimeFailed === false, `browser runtime failed: ${finalEvidence.runtimeFailureReason}`);
  assert(finalEvidence.metrics.guardMismatches === 0 && finalEvidence.metrics.firstStateMismatch === null,
    `exact-state guard failed: ${JSON.stringify(finalEvidence.metrics.firstStateMismatch)}`);
  assert(afterProxy.delayedChunks > beforeProxy.delayedChunks && afterProxy.delayedBytes > beforeProxy.delayedBytes,
    `proxy did not exercise outbound delay: ${JSON.stringify({ beforeProxy, afterProxy })}`);

  Object.assign(result, {
    verdict: "WORLD_V0_JUMP_WINDOW_REPAIR_PASS",
    runKey,
    simBuildId: baseline.identity.simBuildId,
    worldEpoch: baseline.identity.worldEpoch,
    actorSessionId: sessionId,
    baselineY,
    keyAuthorityBoundary: key.latestAuthorityBoundary,
    windowTicks: uniqueTicks,
    statuses,
    canonical,
    lateCount: late.length,
    survivingCount: accepted.length,
    appliedCount: applied.length,
    authorityMaxY: maxY,
    serverLateBefore: key.serverLate,
    serverLateAfter: finalEvidence.metrics.serverLate,
    guardMismatches: finalEvidence.metrics.guardMismatches,
    proxy: { before: beforeProxy, after: afterProxy },
    finding: "A six-tick jump-intent window survives the same near-frontier transport-loss class that previously erased a one-tick jump. Early intent ticks are demonstrably late/canonically false, a later tick becomes the recovered canonical rising edge, authority applies exactly one jump impulse, later true ticks do not re-boost, and exact client/authority state remains matched.",
    nonClaim: "This closes the demonstrated temporal transport-loss mechanism. It does not add or prove coyote time, landing input buffering, or broader support-contact forgiveness; an accepted rising edge without valid support remains a separate question.",
  });
  writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
  console.log(result.verdict, JSON.stringify(result));
} catch (error) {
  result.error = error instanceof Error ? error.stack || error.message : String(error);
  result.proxy = proxy.snapshot();
  try { result.targetEvidence = target ? await evidence(target) : null; } catch {}
  try { result.targetWire = target ? await wire(target) : null; } catch {}
  writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
  console.error(result.verdict, result.error);
  process.exitCode = 1;
} finally {
  await stopBrowser(target);
  await stopBrowser(peer);
  await proxy.close();
}
