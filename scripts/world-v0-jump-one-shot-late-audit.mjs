import net from "node:net";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { WORLD_V0_EXPECTED_SIM_BUILD_ID } from "../public/world-v0/build-contract.js";

const BASE = (process.env.MW_WORLD_V0_JUMP_AUDIT_BASE || "http://127.0.0.1:8787").replace(/\/$/, "");
const TARGET = new URL(BASE);
const PROXY_PORT = Number(process.env.MW_WORLD_V0_JUMP_AUDIT_PROXY_PORT || 8793);
const DELAY_MS = Number(process.env.MW_WORLD_V0_JUMP_AUDIT_DELAY_MS || 45);
const OUTPUT = process.env.MW_WORLD_V0_JUMP_AUDIT_OUTPUT || "world-v0-jump-one-shot-late.json";
const PORTS = [9782, 9783];
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
    setDelay(next) { delayMs = Math.max(0, Number(next) || 0); },
    snapshot() { return { delayMs, accepted, activePairs: pairs.size, delayedChunks, delayedBytes }; },
    async close() {
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
      for (const pair of [...pairs]) {
        hardClose(pair.client);
        hardClose(pair.upstream);
      }
      pairs.clear();
      await new Promise((resolve) => server.close(() => resolve()));
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
  while (Date.now() - started < 20_000) {
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
  const audit = { revision: "world-v0-jump-wire-audit-v1", sent: [], received: [], keys: [] };
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const now = () => performance.now();
  const compactPlayers = (players) => (players || []).map((player) => ({
    sessionId: player.sessionId || null,
    netEntityId: player.netEntityId || null,
    jump: Boolean(player.jump),
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
          audit.received.push({
            at: now(), type: message.type, batchSeq: message.batchSeq,
            boundaryTick: message.boundaryTick ?? null,
            records: clone(message.records || []),
          });
        } else if (message.type === "world_v0_consumed") {
          audit.received.push({
            at: now(), type: message.type, targetTick: message.targetTick,
            boundaryTick: message.boundaryTick,
            players: compactPlayers(message.players),
          });
        } else if (message.type === "world_v0_snapshot") {
          audit.received.push({
            at: now(), type: message.type, boundaryTick: message.boundaryTick,
            players: compactPlayers(message.players),
          });
        }
        if (audit.received.length > 1800) audit.received.splice(0, audit.received.length - 1800);
      });
    }

    send(data) {
      if (typeof data === "string") {
        try {
          const message = JSON.parse(data);
          if (message.type === "world_v0_input_batch") {
            audit.sent.push({
              at: now(), batchSeq: message.batchSeq,
              records: clone(message.records || []),
            });
            if (audit.sent.length > 1000) audit.sent.splice(0, audit.sent.length - 1000);
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
  window.__worldV0JumpWireAudit = () => clone(audit);
})();`;

async function startBrowser(binary, index, url, instrument = false) {
  const profile = mkdtempSync(join(tmpdir(), `mw-jump-audit-${index}-`));
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
  const { targetId } = await cdp.call("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await cdp.call("Target.attachToTarget", { targetId, flatten: true });
  await cdp.call("Runtime.enable", {}, sessionId);
  await cdp.call("Page.enable", {}, sessionId);
  if (instrument) await cdp.call("Page.addScriptToEvaluateOnNewDocument", { source: INSTRUMENTATION }, sessionId);
  await cdp.call("Page.navigate", { url }, sessionId);
  return { child, profile, stderr, cdp, targetId, sessionId, url };
}

async function stopBrowser(browser) {
  if (!browser) return;
  browser.cdp?.close();
  if (browser.child?.exitCode === null) browser.child.kill("SIGKILL");
  await sleep(100);
  try { rmSync(browser.profile, { recursive: true, force: true }); } catch {}
}

async function evaluate(browser, expression) {
  return browser.cdp.evaluate(browser.sessionId, expression);
}

async function waitFor(browser, expression, label, timeout = TIMEOUT_MS) {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < timeout) {
    try {
      last = await evaluate(browser, expression);
      if (last) return last;
    } catch (error) { last = error instanceof Error ? error.message : String(error); }
    await sleep(100);
  }
  throw new Error(`${label} timeout: ${JSON.stringify(last)}`);
}

async function evidence(browser) {
  return evaluate(browser, "window.__sharedYardV0Evidence?.() || null");
}

async function wireAudit(browser) {
  return evaluate(browser, "window.__worldV0JumpWireAudit?.() || null");
}

async function triggerJump(browser) {
  return evaluate(browser, `(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space", key: " ", bubbles: true, cancelable: true }));
    setTimeout(() => window.dispatchEvent(new KeyboardEvent("keyup", { code: "Space", key: " ", bubbles: true, cancelable: true })), 20);
    return true;
  })()`);
}

function sentJumpSince(log, sentIndex) {
  for (let index = sentIndex; index < (log?.sent || []).length; index += 1) {
    const send = log.sent[index];
    for (const record of send.records || []) {
      if (record.jump === true) return { sendIndex: index, batchSeq: send.batchSeq, sentAt: send.at, record };
    }
  }
  return null;
}

function ackFor(log, jump) {
  return (log?.received || []).find((entry) =>
    entry.type === "world_v0_batch_ack" &&
    entry.batchSeq === jump.batchSeq &&
    (entry.records || []).some((record) => record.targetTick === jump.record.targetTick));
}

function consumedFor(log, targetTick) {
  return (log?.received || []).find((entry) => entry.type === "world_v0_consumed" && entry.targetTick === targetTick);
}

function playerFrom(entry, sessionId) {
  return (entry?.players || []).find((player) => player.sessionId === sessionId) || null;
}

function priorFalsePrefill(log, jump) {
  for (let index = 0; index < jump.sendIndex; index += 1) {
    const send = log.sent[index];
    if ((send.records || []).some((record) => record.targetTick === jump.record.targetTick && record.jump === false)) return true;
  }
  return false;
}

function maxAuthorityY(log, sessionId, fromTick, throughTick) {
  let max = -Infinity;
  let samples = 0;
  for (const entry of log?.received || []) {
    if (entry.type !== "world_v0_snapshot") continue;
    if (!Number.isInteger(entry.boundaryTick) || entry.boundaryTick < fromTick || entry.boundaryTick > throughTick) continue;
    const player = playerFrom(entry, sessionId);
    const y = player?.position?.[1];
    if (!Number.isFinite(y)) continue;
    max = Math.max(max, y);
    samples += 1;
  }
  return { maxY: Number.isFinite(max) ? max : null, samples };
}

function latestAuthorityPlayer(log, sessionId) {
  const snapshots = (log?.received || []).filter((entry) => entry.type === "world_v0_snapshot");
  for (let index = snapshots.length - 1; index >= 0; index -= 1) {
    const player = playerFrom(snapshots[index], sessionId);
    if (player?.position) return { boundaryTick: snapshots[index].boundaryTick, player };
  }
  return null;
}

async function waitGrounded(browser, sessionId, timeout = 6000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const log = await wireAudit(browser);
    const latest = latestAuthorityPlayer(log, sessionId);
    const y = latest?.player?.position?.[1];
    const vy = latest?.player?.linearVelocity?.[1];
    if (Number.isFinite(y) && y < 0.96 && (!Number.isFinite(vy) || Math.abs(vy) < 0.4)) return latest;
    await sleep(100);
  }
  throw new Error("actor did not return to grounded baseline");
}

async function performJump(browser, sessionId, label) {
  const beforeLog = await wireAudit(browser);
  const sentIndex = beforeLog.sent.length;
  const keyIndex = beforeLog.keys.length;
  const beforeEvidence = await evidence(browser);
  await triggerJump(browser);

  let log = null;
  let jump = null;
  let ack = null;
  let consumed = null;
  const started = Date.now();
  while (Date.now() - started < 6000) {
    log = await wireAudit(browser);
    jump = sentJumpSince(log, sentIndex);
    if (jump) {
      ack = ackFor(log, jump);
      consumed = consumedFor(log, jump.record.targetTick);
      const latest = (log.received || []).filter((entry) => entry.type === "world_v0_snapshot").at(-1);
      if (ack && consumed && latest?.boundaryTick >= jump.record.targetTick + 30) break;
    }
    await sleep(50);
  }
  assert(jump, `${label}: no jump:true input batch observed`);
  assert(ack, `${label}: no ACK for jump batch ${jump.batchSeq}`);
  assert(consumed, `${label}: no canonical consumed record for target ${jump.record.targetTick}`);

  const key = log.keys[keyIndex] || null;
  const ackRecord = (ack.records || []).find((record) => record.targetTick === jump.record.targetTick) || null;
  const canonicalPlayer = playerFrom(consumed, sessionId);
  assert(canonicalPlayer, `${label}: canonical player missing for ${sessionId}`);
  const vertical = maxAuthorityY(log, sessionId, jump.record.targetTick, jump.record.targetTick + 30);
  const afterEvidence = await evidence(browser);

  return {
    label,
    beforeBoundary: beforeEvidence?.localBoundaryTick ?? null,
    key,
    targetTick: jump.record.targetTick,
    batchSeq: jump.batchSeq,
    priorFalsePrefill: priorFalsePrefill(log, jump),
    targetLeadFromObservedAuthority: Number.isInteger(key?.latestAuthorityBoundary)
      ? jump.record.targetTick - key.latestAuthorityBoundary
      : null,
    ackStatus: ackRecord?.status || null,
    ackBoundaryTick: ack.boundaryTick ?? null,
    canonical: {
      jump: Boolean(canonicalPlayer.jump),
      fresh: Boolean(canonicalPlayer.fresh),
      source: canonicalPlayer.source,
      missingStreak: canonicalPlayer.missingStreak,
    },
    authorityVertical: vertical,
    serverLateBefore: beforeEvidence?.metrics?.serverLate ?? null,
    serverLateAfter: afterEvidence?.metrics?.serverLate ?? null,
    guardMismatches: afterEvidence?.metrics?.guardMismatches ?? null,
    runtimeFailed: Boolean(afterEvidence?.runtimeFailed),
  };
}

const chrome = findChrome();
const proxy = createDelayProxy();
let target = null;
let peer = null;
const result = {
  verdict: "WORLD_V0_JUMP_ONE_SHOT_LATE_FAIL",
  revision: "world-v0-jump-one-shot-late-audit-v1",
  generatedAt: new Date().toISOString(),
  delayMs: DELAY_MS,
  chromeVersion: chromeVersion(chrome),
};

try {
  await proxy.listen();
  proxy.setDelay(0);
  const suffix = Date.now().toString(36).slice(-7);
  const runKey = `jump-${suffix}`;
  target = await startBrowser(chrome, 0, `${TARGET_PAGE}?player=JumpA-${suffix}&run=${runKey}`, true);
  peer = await startBrowser(chrome, 1, `${PEER_PAGE}?player=JumpB-${suffix}&run=${runKey}`, false);

  await Promise.all([target, peer].map((browser, index) => waitFor(browser,
    'document.readyState === "complete" && typeof window.__sharedYardV0Evidence === "function" && !document.querySelector("#enter")?.disabled',
    `client ${index} boot`)));
  assert(await evaluate(target, 'typeof window.__worldV0JumpWireAudit === "function"'), "jump wire instrumentation missing");

  await evaluate(target, 'document.querySelector("#enter").click(); true');
  await evaluate(peer, 'document.querySelector("#enter").click(); true');
  await Promise.all([target, peer].map((browser, index) => waitFor(browser,
    '(() => { const e=window.__sharedYardV0Evidence?.(); return e?.identity?.worldEpoch && Number.isInteger(e?.protocolStartTick) && e.localBoundaryTick >= e.protocolStartTick + 90 && e.metrics?.guardMismatches === 0; })()',
    `client ${index} live baseline`)));

  const baseline = await evidence(target);
  assert(baseline.identity?.simBuildId === WORLD_V0_EXPECTED_SIM_BUILD_ID, `SimBuild drift ${baseline.identity?.simBuildId}`);
  assert(baseline.session?.actorSessionId, "target ActorSession missing");
  const sessionId = baseline.session.actorSessionId;
  await waitGrounded(target, sessionId);

  const control = await performJump(target, sessionId, "control-0ms");
  assert(["accepted", "superseded"].includes(control.ackStatus), `control ACK ${control.ackStatus}`);
  assert(control.canonical.jump === true && control.canonical.fresh === true, `control canonical jump lost ${JSON.stringify(control.canonical)}`);
  assert(control.authorityVertical.samples >= 2 && control.authorityVertical.maxY > 1.15, `control vertical response missing ${JSON.stringify(control.authorityVertical)}`);
  assert(control.guardMismatches === 0 && control.runtimeFailed === false, "control exactness/runtime failure");

  await waitGrounded(target, sessionId);
  const beforeDelay = proxy.snapshot();
  proxy.setDelay(DELAY_MS);
  await sleep(500);
  const delayed = await performJump(target, sessionId, `delayed-${DELAY_MS}ms`);
  const afterDelay = proxy.snapshot();

  assert(delayed.priorFalsePrefill === true, `delayed target was not previously prefilled false ${JSON.stringify(delayed)}`);
  assert(delayed.targetLeadFromObservedAuthority !== null && delayed.targetLeadFromObservedAuthority >= 1 && delayed.targetLeadFromObservedAuthority <= 3,
    `delayed jump not targeted at near authority frontier ${delayed.targetLeadFromObservedAuthority}`);
  assert(delayed.ackStatus === "late", `delayed jump was not rejected late: ${delayed.ackStatus}`);
  assert(delayed.canonical.jump === false, `late jump unexpectedly canonical true ${JSON.stringify(delayed.canonical)}`);
  assert(delayed.serverLateAfter > delayed.serverLateBefore, `serverLate did not increase ${delayed.serverLateBefore} -> ${delayed.serverLateAfter}`);
  assert(delayed.authorityVertical.samples >= 2 && delayed.authorityVertical.maxY < 1.05,
    `authority applied vertical jump despite canonical false ${JSON.stringify(delayed.authorityVertical)}`);
  assert(delayed.guardMismatches === 0 && delayed.runtimeFailed === false, "delayed case exactness/runtime failure");
  assert(afterDelay.delayedChunks > beforeDelay.delayedChunks && afterDelay.delayedBytes > beforeDelay.delayedBytes,
    `proxy did not delay browser->Workerd traffic ${JSON.stringify({ beforeDelay, afterDelay })}`);

  Object.assign(result, {
    verdict: "WORLD_V0_JUMP_ONE_SHOT_LATE_CAUSAL_PASS",
    runKey,
    simBuildId: baseline.identity.simBuildId,
    worldEpoch: baseline.identity.worldEpoch,
    actorSessionId: sessionId,
    proxy: { beforeDelay, afterDelay },
    control,
    delayed,
    causalFinding: "A fresh jump is authored as a one-shot revision at the near authority frontier. With controlled one-way browser->Workerd delay, that revision is ACKed late, the authority consumes the already-prefilled jump:false record for the target tick, and no authoritative vertical jump occurs. Ordinary exact-state guards remain clean. This isolates transport/timing loss before the support-contact gate; it does not yet classify support/coyote feel after a jump is canonically accepted.",
    nonClaim: "This local Workerd/Chromium falsifier proves one causal missed-jump mechanism under bounded induced outbound delay. It does not establish the optimal repair, does not prove every Owner-observed missed jump had this cause, and does not classify the separate exact-support/coyote-window question.",
  });
  writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
  console.log(result.verdict, JSON.stringify(result));
} catch (error) {
  result.error = error instanceof Error ? error.stack || error.message : String(error);
  result.proxy = proxy.snapshot();
  try { result.targetEvidence = target ? await evidence(target) : null; } catch {}
  try { result.targetWireAudit = target ? await wireAudit(target) : null; } catch {}
  writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
  console.error(result.verdict, result.error);
  process.exitCode = 1;
} finally {
  await stopBrowser(target);
  await stopBrowser(peer);
  await proxy.close();
}
