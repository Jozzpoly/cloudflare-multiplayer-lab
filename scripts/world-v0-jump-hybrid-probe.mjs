import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  WORLD_V0_BROWSER_UI_REVISION,
  WORLD_V0_EXPECTED_SIM_BUILD_ID,
} from "../public/world-v0/build-contract.js";

const BASE = (process.env.MW_WORLD_V0_JUMP_BASE_URL || "http://127.0.0.1:8787").replace(/\/$/, "");
const PAGE_URL = `${BASE}/world-v0/`;
const wsBase = new URL(BASE);
wsBase.protocol = wsBase.protocol === "https:" ? "wss:" : "ws:";
const WS_URL = `${wsBase.origin}/world-v0/ws`;
const DEBUG_PORT = 9561;
const TIMEOUT_MS = 35_000;
const OUTPUT = process.env.MW_WORLD_V0_JUMP_OUTPUT || "world-v0-jump-hybrid-evidence.json";
const SAFE_FORWARD_TICKS = 24;

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

async function waitForDebugger() {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < TIMEOUT_MS) {
    try {
      const response = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`, { signal: AbortSignal.timeout(1500) });
      if (response.ok) {
        const value = await response.json();
        if (value.webSocketDebuggerUrl) return value;
      }
      last = `HTTP ${response.status}`;
    } catch (error) { last = error instanceof Error ? error.message : String(error); }
    await sleep(100);
  }
  throw new Error(`Chrome debugger unavailable: ${last}`);
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

async function waitFor(cdp, sessionId, expression, label, timeoutMs = TIMEOUT_MS) {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < timeoutMs) {
    try {
      last = await cdp.evaluate(sessionId, expression);
      if (last) return last;
    } catch (error) { last = error instanceof Error ? error.message : String(error); }
    await sleep(80);
  }
  throw new Error(`${label} timeout · last=${JSON.stringify(last)}`);
}

class ZeroPeer {
  constructor(playerId, runKey) {
    this.playerId = playerId;
    this.runKey = runKey;
    this.ws = new WebSocket(`${WS_URL}?player=${encodeURIComponent(playerId)}&run=${encodeURIComponent(runKey)}`);
    this.identity = null;
    this.protocolStartTick = null;
    this.latestBoundaryTick = 0;
    this.nextTick = null;
    this.batchSeq = 0;
    this.accepted = 0;
    this.late = 0;
    this.rejected = 0;
    this.leaseExpired = 0;
    this.epochEnded = null;
    this.error = null;
    this.started = new Promise((resolve, reject) => {
      this._resolveStarted = resolve;
      this._rejectStarted = reject;
    });
    this.ws.addEventListener("error", () => {
      const error = new Error("zero peer websocket error");
      this.error = error.message;
      this._rejectStarted(error);
    });
    this.ws.addEventListener("message", async (event) => {
      try {
        const raw = typeof event.data === "string" ? event.data : await event.data.text();
        const message = JSON.parse(raw);
        if (message.type === "world_v0_error") throw new Error(`zero peer server error ${message.error}`);
        if (message.type === "world_v0_welcome") {
          this.identity = {
            worldId: message.worldId,
            worldEpoch: message.worldEpoch,
            simBuildId: message.simBuildId,
            clientSimRevision: message.clientSimRevision,
          };
          assert(this.identity.simBuildId === WORLD_V0_EXPECTED_SIM_BUILD_ID, `zero peer SimBuild drift ${this.identity.simBuildId}`);
          this.ws.send(JSON.stringify({ type: "world_v0_ready", ...this.identity }));
          return;
        }
        if (message.worldEpoch && this.identity) {
          assert(message.worldId === this.identity.worldId && message.worldEpoch === this.identity.worldEpoch && message.simBuildId === this.identity.simBuildId, `zero peer identity drift on ${message.type}`);
        }
        if (message.type === "world_v0_start") {
          this.protocolStartTick = message.protocolStartTick;
          this.latestBoundaryTick = message.boundaryTick ?? 0;
          this.nextTick = this.protocolStartTick;
          this.feed();
          this._resolveStarted(message);
          return;
        }
        const boundary = message.boundaryTick ?? message.relayBoundaryTick;
        if (Number.isInteger(boundary)) this.latestBoundaryTick = Math.max(this.latestBoundaryTick, boundary);
        if (message.type === "world_v0_batch_ack") {
          for (const record of message.records || []) {
            if (record.status === "accepted") this.accepted += 1;
            else if (record.status === "late") this.late += 1;
            else if (record.status !== "duplicate_same") this.rejected += 1;
          }
        }
        if (message.type === "world_v0_consumed" && (message.players || []).some((player) => player.source === "lease_expired")) this.leaseExpired += 1;
        if (message.type === "world_v0_epoch_ended") this.epochEnded = { reason: message.reason, boundaryTick: message.boundaryTick };
        this.feed();
      } catch (error) {
        this.error = error instanceof Error ? error.stack || error.message : String(error);
        this._rejectStarted(error);
      }
    });
  }
  feed() {
    if (!this.identity || this.nextTick === null || this.ws.readyState !== WebSocket.OPEN) return;
    const horizon = this.latestBoundaryTick + SAFE_FORWARD_TICKS;
    while (this.nextTick + 1 <= horizon) {
      this.batchSeq += 1;
      const first = this.nextTick;
      this.ws.send(JSON.stringify({
        type: "world_v0_input_batch",
        ...this.identity,
        batchSeq: this.batchSeq,
        records: [
          { targetTick: first, x: 0, z: 0, jump: false },
          { targetTick: first + 1, x: 0, z: 0, jump: false },
        ],
      }));
      this.nextTick += 2;
    }
  }
  evidence() {
    return {
      playerId: this.playerId,
      identity: this.identity,
      protocolStartTick: this.protocolStartTick,
      latestBoundaryTick: this.latestBoundaryTick,
      nextTick: this.nextTick,
      batches: this.batchSeq,
      accepted: this.accepted,
      late: this.late,
      rejected: this.rejected,
      leaseExpired: this.leaseExpired,
      epochEnded: this.epochEnded,
      error: this.error,
    };
  }
  close() { try { this.ws.close(1000, "jump_hybrid_probe_complete"); } catch { /* cleanup */ } }
}

const chrome = findChrome();
const profile = mkdtempSync(join(tmpdir(), "mw-jump-hybrid-"));
const child = spawn(chrome, [
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
  `--remote-debugging-port=${DEBUG_PORT}`,
  "--remote-debugging-address=127.0.0.1",
  `--user-data-dir=${profile}`,
  "about:blank",
], { stdio: ["ignore", "ignore", "pipe"] });
const stderr = [];
child.stderr.on("data", (chunk) => stderr.push(chunk));

let cdp = null;
let zeroPeer = null;
const result = { verdict: "WORLD_V0_JUMP_HYBRID_FAIL", generatedAt: new Date().toISOString(), page: PAGE_URL, productSha: process.env.PRODUCT_SHA || null };
try {
  const debuggerInfo = await waitForDebugger();
  cdp = new Cdp(debuggerInfo.webSocketDebuggerUrl);
  await cdp.opened;
  const suffix = Date.now().toString(36).slice(-7);
  const runKey = `jmp-${suffix}`;
  result.runKey = runKey;
  result.chrome = debuggerInfo.Browser || null;
  const { targetId } = await cdp.call("Target.createTarget", { url: `${PAGE_URL}?player=B-${suffix}&run=${runKey}` });
  const { sessionId } = await cdp.call("Target.attachToTarget", { targetId, flatten: true });
  await cdp.call("Runtime.enable", {}, sessionId);
  await cdp.call("Page.enable", {}, sessionId);

  await waitFor(cdp, sessionId, `document.readyState === "complete" && document.querySelector("#enter")?.disabled === false && typeof window.__sharedYardV0JumpProbe === "function"`, "browser boot");
  await cdp.evaluate(sessionId, `document.querySelector("#enter").click(); true`);
  await waitFor(cdp, sessionId, `window.__sharedYardV0Evidence?.().networkState === "waiting for peer"`, "browser waiting for lightweight peer");

  zeroPeer = new ZeroPeer(`N-${suffix}`, runKey);
  await zeroPeer.started;
  await waitFor(cdp, sessionId, `(() => { const e=window.__sharedYardV0Evidence?.(); return e?.networkState?.startsWith("live") && Number.isInteger(e.protocolStartTick); })()`, "browser world start");
  const identity = await cdp.evaluate(sessionId, `window.__sharedYardV0Evidence().identity`);
  assert(identity.simBuildId === WORLD_V0_EXPECTED_SIM_BUILD_ID, `browser SimBuild drift ${identity.simBuildId}`);
  assert(identity.worldEpoch === zeroPeer.identity.worldEpoch, "browser/Node WorldEpoch disagreement");
  result.identity = identity;

  await waitFor(cdp, sessionId, `(() => { const p=window.__sharedYardV0JumpProbe?.(); const e=window.__sharedYardV0Evidence?.(); return p?.supported===true && p.position[1]>0.75 && p.position[1]<0.9 && e.localBoundaryTick>=e.protocolStartTick; })()`, "grounded browser after protocol start");
  const startA = await cdp.evaluate(sessionId, `window.__sharedYardV0JumpProbe()`);

  await cdp.evaluate(sessionId, `(() => { window.dispatchEvent(new KeyboardEvent("keydown",{code:"Space",key:" ",bubbles:true})); window.dispatchEvent(new KeyboardEvent("keyup",{code:"Space",key:" ",bubbles:true})); return true; })()`);
  await waitFor(cdp, sessionId, `(() => { const p=window.__sharedYardV0JumpProbe?.(); return p && p.position[1]>${startA.position[1] + 0.3} && p.velocity[1]>0.5; })()`, "keyboard jump ascent", 12_000);
  const ascentA = await cdp.evaluate(sessionId, `window.__sharedYardV0JumpProbe()`);
  assert(ascentA.supported === false, `keyboard jump should leave support ${JSON.stringify(ascentA)}`);

  await waitFor(cdp, sessionId, `(() => { const p=window.__sharedYardV0JumpProbe?.(); return p && p.supported===false && p.position[1]>1.05 && p.velocity[1]<-1; })()`, "descending airborne phase", 12_000);
  const descendingBefore = await cdp.evaluate(sessionId, `window.__sharedYardV0JumpProbe()`);
  await cdp.evaluate(sessionId, `(() => { window.dispatchEvent(new KeyboardEvent("keydown",{code:"Space",key:" ",bubbles:true})); window.dispatchEvent(new KeyboardEvent("keyup",{code:"Space",key:" ",bubbles:true})); return true; })()`);
  await sleep(60);
  const descendingAfter = await cdp.evaluate(sessionId, `window.__sharedYardV0JumpProbe()`);
  assert(descendingAfter.supported === false, `anti-double jump observation landed too early ${JSON.stringify(descendingAfter)}`);
  assert(descendingAfter.velocity[1] < 0, `airborne Space re-launched actor ${JSON.stringify({ descendingBefore, descendingAfter })}`);

  await waitFor(cdp, sessionId, `(() => { const p=window.__sharedYardV0JumpProbe?.(); return p?.supported===true && p.position[1]>0.75 && p.position[1]<0.9; })()`, "landing after keyboard jump", 12_000);
  const landedA = await cdp.evaluate(sessionId, `window.__sharedYardV0JumpProbe()`);

  const startB = landedA;
  const buttonDispatch = await cdp.evaluate(sessionId, `(() => { const b=document.querySelector("#jump-button"); if(!b||b.classList.contains("hidden")) return false; return b.dispatchEvent(new PointerEvent("pointerdown",{pointerId:71,pointerType:"touch",isPrimary:true,bubbles:true})); })()`);
  assert(buttonDispatch === true, "JUMP button pointerdown was not dispatched");
  await waitFor(cdp, sessionId, `(() => { const p=window.__sharedYardV0JumpProbe?.(); return p && p.position[1]>${startB.position[1] + 0.3} && p.velocity[1]>0.5; })()`, "button jump ascent", 12_000);
  const ascentB = await cdp.evaluate(sessionId, `window.__sharedYardV0JumpProbe()`);
  await waitFor(cdp, sessionId, `(() => { const p=window.__sharedYardV0JumpProbe?.(); return p?.supported===true && p.position[1]>0.75 && p.position[1]<0.9; })()`, "landing after button jump", 12_000);
  const landedB = await cdp.evaluate(sessionId, `window.__sharedYardV0JumpProbe()`);

  await waitFor(cdp, sessionId, `(() => { const e=window.__sharedYardV0Evidence?.(); return e && !e.runtimeFailed && e.metrics.guardMismatches===0 && e.metrics.guardMatches>=20 && e.metrics.guardPending===0 && e.localBoundaryTick>=e.protocolStartTick+180; })()`, "post-jump exact-state runway", 18_000);
  const finalEvidence = await cdp.evaluate(sessionId, `window.__sharedYardV0Evidence()`);
  assert(finalEvidence.uiRevision === WORLD_V0_BROWSER_UI_REVISION, `UI revision drift ${finalEvidence.uiRevision}`);
  assert(finalEvidence.runtimeFailed === false, `runtime failed ${finalEvidence.runtimeFailureReason}`);
  assert(finalEvidence.metrics.guardMismatches === 0 && finalEvidence.metrics.firstStateMismatch === null, `exact-state mismatch ${JSON.stringify(finalEvidence.metrics.firstStateMismatch)}`);
  assert(zeroPeer.epochEnded === null && zeroPeer.leaseExpired === 0, `lightweight peer failed timeline ${JSON.stringify(zeroPeer.evidence())}`);

  result.verdict = "WORLD_V0_JUMP_HYBRID_PASS";
  result.jump = {
    keyboard: { start: startA, ascent: ascentA, descendingBeforeSecondPress: descendingBefore, descendingAfterSecondPress: descendingAfter, landed: landedA },
    button: { start: startB, ascent: ascentB, landed: landedB },
  };
  result.browserEvidence = {
    localBoundaryTick: finalEvidence.localBoundaryTick,
    protocolStartTick: finalEvidence.protocolStartTick,
    guards: finalEvidence.metrics.guardMatches,
    guardMismatches: finalEvidence.metrics.guardMismatches,
    firstStateMismatch: finalEvidence.metrics.firstStateMismatch,
    corrections: finalEvidence.metrics.corrections,
    serverLate: finalEvidence.metrics.serverLate,
    frameP95Ms: finalEvidence.frame?.p95Ms,
    maxFrameMs: finalEvidence.frame?.maxMs,
  };
  result.zeroPeer = zeroPeer.evidence();
  writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
  console.log("WORLD_V0_JUMP_HYBRID_PASS", JSON.stringify({ jump: result.jump, browserEvidence: result.browserEvidence, zeroPeer: result.zeroPeer }));
} catch (error) {
  result.error = error instanceof Error ? error.stack || error.message : String(error);
  try { result.browserEvidence = cdp ? await cdp.evaluate((await cdp.call("Target.getTargets")).targetInfos?.find(t=>t.type==="page"&&t.url.includes("/world-v0/"))?.targetId || "", `window.__sharedYardV0Evidence?.()`) : null; } catch { /* diagnostic best effort */ }
  result.zeroPeer = zeroPeer?.evidence() || null;
  result.stderrTail = Buffer.concat(stderr).toString("utf8").slice(-5000);
  writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
  console.error(result.error);
  process.exitCode = 1;
} finally {
  zeroPeer?.close();
  cdp?.close();
  if (child.exitCode === null) child.kill("SIGKILL");
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* cleanup */ }
}
