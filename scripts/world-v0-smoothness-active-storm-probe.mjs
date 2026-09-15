import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const BASE = process.env.MW_WORLD_V0_SMOOTH_BASE ?? "http://127.0.0.1:8787";
const OUTPUT = process.env.MW_WORLD_V0_SMOOTH_OUTPUT ?? "world-v0-smoothness-active-storm.json";
const LATENCY_MS = Number(process.env.MW_WORLD_V0_SMOOTH_LATENCY_MS ?? 90);
const PORTS = [9262, 9263];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function assert(value, message) { if (!value) throw new Error(message); }

function findChrome() {
  const override = process.env.CHROME_BIN?.trim();
  if (override) return override;
  const probe = spawnSync("bash", ["-lc", "command -v google-chrome || command -v google-chrome-stable || command -v chromium || command -v chromium-browser"], { encoding: "utf8" });
  const binary = probe.stdout.trim().split("\n")[0];
  if (!binary) throw new Error("Chrome binary not found");
  return binary;
}

async function waitDebugger(port) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) {
        const body = await response.json();
        if (body.webSocketDebuggerUrl) return body.webSocketDebuggerUrl;
      }
    } catch {}
    await sleep(100);
  }
  throw new Error(`CDP unavailable on ${port}`);
}

class Cdp {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.id = 1;
    this.pending = new Map();
    this.opened = new Promise((resolve, reject) => {
      this.ws.addEventListener("open", resolve, { once: true });
      this.ws.addEventListener("error", () => reject(new Error("CDP open failed")), { once: true });
    });
    this.ws.addEventListener("message", async (event) => {
      const raw = typeof event.data === "string" ? event.data : await event.data.text();
      const msg = JSON.parse(raw);
      if (!msg.id) return;
      const waiter = this.pending.get(msg.id);
      if (!waiter) return;
      this.pending.delete(msg.id);
      if (msg.error) waiter.reject(new Error(`${waiter.method}: ${msg.error.message}`));
      else waiter.resolve(msg.result || {});
    });
  }
  async call(method, params = {}, sessionId) {
    await this.opened;
    const id = this.id++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, method });
      const payload = { id, method, params };
      if (sessionId) payload.sessionId = sessionId;
      this.ws.send(JSON.stringify(payload));
    });
  }
  async eval(sessionId, expression) {
    const result = await this.call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, userGesture: true }, sessionId);
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || "browser evaluation failed");
    return result.result?.value;
  }
  close() { try { this.ws.close(); } catch {} }
}

async function startClient(binary, index) {
  const profile = mkdtempSync(join(tmpdir(), `mw-smooth-${index}-`));
  const port = PORTS[index];
  const child = spawn(binary, [
    "--headless=new", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
    "--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding",
    `--remote-debugging-port=${port}`, "--remote-debugging-address=127.0.0.1", `--user-data-dir=${profile}`, "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"] });
  const cdp = new Cdp(await waitDebugger(port));
  await cdp.opened;
  const { targetId } = await cdp.call("Target.createTarget", { url: `${BASE}/world-v0/` });
  const { sessionId } = await cdp.call("Target.attachToTarget", { targetId, flatten: true });
  await cdp.call("Runtime.enable", {}, sessionId);
  await cdp.call("Page.enable", {}, sessionId);
  await cdp.call("Network.enable", {}, sessionId);
  await cdp.call("Network.emulateNetworkConditions", {
    offline: false,
    latency: LATENCY_MS,
    downloadThroughput: -1,
    uploadThroughput: -1,
  }, sessionId);
  return { profile, child, cdp, sessionId };
}

async function stopClient(client) {
  if (!client) return;
  client.cdp?.close();
  if (client.child?.exitCode === null) client.child.kill("SIGKILL");
  await sleep(100);
  try { rmSync(client.profile, { recursive: true, force: true }); } catch {}
}

async function waitFor(client, expression, label, timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    try {
      last = await client.cdp.eval(client.sessionId, expression);
      if (last) return last;
    } catch (error) { last = error instanceof Error ? error.message : String(error); }
    await sleep(100);
  }
  throw new Error(`${label} timeout last=${JSON.stringify(last)}`);
}

async function enter(client, callsign, room = "yard-2") {
  await waitFor(client, `(() => { const b=document.querySelector('[data-room-id="${room}"]'); return b && !b.disabled && typeof window.__sharedYardV0Evidence === 'function'; })()`, `${callsign} room ready`);
  await client.cdp.eval(client.sessionId, `(() => { const i=document.querySelector('#callsign'); i.value=${JSON.stringify(callsign)}; i.dispatchEvent(new Event('input',{bubbles:true})); document.querySelector('[data-room-id="${room}"]').click(); return true; })()`);
}

async function evidence(client) {
  return client.cdp.eval(client.sessionId, "window.__sharedYardV0Evidence?.() ?? null");
}

async function key(client, code, down) {
  await client.cdp.eval(client.sessionId, `window.dispatchEvent(new KeyboardEvent(${JSON.stringify(down ? "keydown" : "keyup")}, { code:${JSON.stringify(code)}, bubbles:true })); true`);
}

async function rotateCameraWhileMoving(client, durationMs = 3200) {
  const rect = await client.cdp.eval(client.sessionId, `(() => { const c=document.querySelector('canvas'); const r=c.getBoundingClientRect(); return {x:r.left,y:r.top,w:r.width,h:r.height}; })()`);
  assert(rect?.w > 100 && rect?.h > 100, "canvas rect unavailable");
  const y = rect.y + rect.h * 0.45;
  const startX = rect.x + rect.w * 0.35;
  await key(client, "KeyW", true);
  await client.cdp.call("Input.dispatchMouseEvent", { type: "mousePressed", x: startX, y, button: "left", buttons: 1, clickCount: 1 }, client.sessionId);
  const steps = 80;
  for (let i = 1; i <= steps; i += 1) {
    const phase = i / steps;
    const x = startX + Math.sin(phase * Math.PI * 4) * rect.w * 0.22;
    const yy = y + Math.sin(phase * Math.PI * 2) * rect.h * 0.04;
    await client.cdp.call("Input.dispatchMouseEvent", { type: "mouseMoved", x, y: yy, button: "left", buttons: 1 }, client.sessionId);
    await sleep(durationMs / steps);
  }
  await client.cdp.call("Input.dispatchMouseEvent", { type: "mouseReleased", x: startX, y, button: "left", buttons: 0, clickCount: 1 }, client.sessionId);
  await key(client, "KeyW", false);
}

function summarize(before, after) {
  const events = after.corrections || [];
  const multiplicity = new Map();
  for (const event of events) multiplicity.set(event.targetTick, (multiplicity.get(event.targetTick) || 0) + 1);
  const repeated = [...multiplicity.entries()].filter(([, count]) => count > 1).sort((a, b) => b[1] - a[1]);
  const deltas = events.map((event) => Math.max(event.delta?.self || 0, event.delta?.remote || 0, event.delta?.prop || 0));
  return {
    corrections: after.metrics.corrections - before.metrics.corrections,
    authored: after.inputScheduler.authored - before.inputScheduler.authored,
    superseded: after.inputScheduler.superseded - before.inputScheduler.superseded,
    serverLate: after.metrics.serverLate - before.metrics.serverLate,
    authoritySilenceResumes: after.metrics.authoritySilenceResumes - before.metrics.authoritySilenceResumes,
    guardMismatches: after.metrics.guardMismatches - before.metrics.guardMismatches,
    retainedCorrectionEvents: events.length,
    repeatedTargetTicks: repeated.length,
    maxSameTickCorrections: repeated[0]?.[1] || 1,
    topRepeatedTicks: repeated.slice(0, 8),
    maxRetainedCorrectionDelta: deltas.length ? Math.max(...deltas) : 0,
    aggregateMaxCorrection: { ...after.metrics.maxCorrection },
    rtt: { ...after.rtt },
    frame: { ...after.frame },
    cameraUserAdjusted: after.presentation?.cameraOrbit?.userAdjusted === true,
  };
}

const chrome = findChrome();
const clients = [];
try {
  clients[0] = await startClient(chrome, 0);
  clients[1] = await startClient(chrome, 1);
  await enter(clients[0], "StormA");
  await waitFor(clients[0], `(() => { const e=window.__sharedYardV0Evidence?.(); return e?.lifecycle?.topology?.revision===1 && Number.isInteger(e.protocolStartTick) && e.metrics.guardMismatches===0; })()`, "A solo start");
  await enter(clients[1], "StormB");
  for (const [index, client] of clients.entries()) {
    await waitFor(client, `(() => { const e=window.__sharedYardV0Evidence?.(); return e?.lifecycle?.topology?.revision===2 && e.presentation?.remotePresence==='PEER' && e.metrics.guardMismatches===0 && e.rtt?.samples>=3; })()`, `client ${index} joined`);
  }

  const beforeA = await evidence(clients[0]);
  const beforeB = await evidence(clients[1]);
  await rotateCameraWhileMoving(clients[0], 3600);
  await sleep(2200);
  const afterA = await evidence(clients[0]);
  const afterB = await evidence(clients[1]);

  const a = summarize(beforeA, afterA);
  const b = summarize(beforeB, afterB);
  assert(a.guardMismatches === 0 && b.guardMismatches === 0, "exact simulation diverged during storm probe");
  assert(a.cameraUserAdjusted, "camera drag did not affect camera state");

  const reproduced = b.corrections >= 12 && (b.maxSameTickCorrections >= 3 || b.aggregateMaxCorrection.remote >= 0.1 || b.aggregateMaxCorrection.prop >= 0.05);
  const result = {
    revision: "world-v0-smoothness-active-storm-probe-v1",
    latencyMsPerDirection: LATENCY_MS,
    actorA: a,
    observerB: b,
    reproduced,
    verdict: reproduced ? "OWNER_CORRECTION_STORM_REPRODUCED" : "OWNER_CORRECTION_STORM_NOT_REPRODUCED",
  };
  writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  if (!reproduced) throw new Error("controlled camera-relative movement did not reproduce the owner correction-storm signature");
} catch (error) {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
} finally {
  await Promise.all(clients.map(stopClient));
}
