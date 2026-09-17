import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const BASE = (process.env.MW_WORLD_V0_ONGOING_CROSS_PAGE_BASE || "http://127.0.0.1:8787").replace(/\/$/, "");
const PAGE_URL = `${BASE}/world-v0/`;
const ROOM_ID = process.env.MW_WORLD_V0_ONGOING_CROSS_PAGE_ROOM || "yard-3";
const OUTPUT = process.env.MW_WORLD_V0_ONGOING_CROSS_PAGE_OUTPUT || "world-v0-ongoing-cross-page-resume.json";
const PORTS = [9682, 9683];
const TIMEOUT_MS = 45_000;

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
    return await new Promise((resolve, reject) => {
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

async function attachPage(client, url = PAGE_URL) {
  const { targetId } = await client.cdp.call("Target.createTarget", { url });
  const { sessionId } = await client.cdp.call("Target.attachToTarget", { targetId, flatten: true });
  await client.cdp.call("Runtime.enable", {}, sessionId);
  await client.cdp.call("Page.enable", {}, sessionId);
  client.targetId = targetId;
  client.sessionId = sessionId;
}

async function startBrowser(binary, index) {
  const profile = mkdtempSync(join(tmpdir(), `mw-ongoing-cross-page-${index}-`));
  const child = spawn(binary, [
    "--headless=new", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
    "--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding",
    `--remote-debugging-port=${PORTS[index]}`, "--remote-debugging-address=127.0.0.1", `--user-data-dir=${profile}`, "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"] });
  const cdp = new Cdp(await waitDebugger(PORTS[index]));
  await cdp.opened;
  const client = { profile, child, cdp, targetId: null, sessionId: null };
  await attachPage(client);
  return client;
}

async function stopBrowser(client) {
  if (!client) return;
  client.cdp?.close();
  if (client.child?.exitCode === null) client.child.kill("SIGKILL");
  await sleep(100);
  try { rmSync(client.profile, { recursive: true, force: true }); } catch {}
}

async function evaluate(client, expression) { return client.cdp.eval(client.sessionId, expression); }
async function evidence(client) { return evaluate(client, "window.__sharedYardV0Evidence?.() ?? null"); }

async function waitFor(client, expression, label, timeoutMs = TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    try {
      last = await evaluate(client, expression);
      if (last) return last;
    } catch (error) { last = error instanceof Error ? error.message : String(error); }
    await sleep(100);
  }
  let diagnostic = null;
  try {
    diagnostic = await evaluate(client, `(() => ({
      session: window.__sharedYardV0Session?.() ?? null,
      evidence: window.__sharedYardV0Evidence?.() ?? null,
      entry: window.__sharedYardV0PublicRoomEntry?.() ?? null,
      body: document.body?.innerText?.slice(0, 1800) ?? "",
    }))()`);
  } catch (error) {
    diagnostic = { readFailed: error instanceof Error ? error.message : String(error) };
  }
  throw new Error(`${label} timeout last=${JSON.stringify(last)} diagnostic=${JSON.stringify(diagnostic)}`);
}

async function roomDirectory() {
  const response = await fetch(`${BASE}/api/world-v0/rooms?r=${Date.now()}`, { cache: "no-store", signal: AbortSignal.timeout(5000) });
  assert(response.ok, `directory HTTP ${response.status}`);
  const value = await response.json();
  return value.rooms.find((room) => room.id === ROOM_ID);
}

async function boot(client) {
  await waitFor(client, `document.readyState === "complete" && typeof window.__sharedYardV0Evidence === "function" && typeof window.__sharedYardV0PublicRoomEntry === "function"`, "browser boot");
  await waitFor(client, `window.__sharedYardV0PublicRoomEntry().rooms.some((room) => room.id === ${JSON.stringify(ROOM_ID)})`, "room directory visible");
}

async function enterRoom(client, name) {
  const result = await evaluate(client, `(() => {
    const input = document.querySelector("#callsign");
    const button = document.querySelector('.public-room-card[data-room-id=${JSON.stringify(ROOM_ID)}]');
    if (!input || !button || button.disabled) return { ok:false, text:button?.textContent || null };
    input.value = ${JSON.stringify(name)};
    input.dispatchEvent(new Event("input", { bubbles:true }));
    button.click();
    return { ok:true, text:button.textContent || null };
  })()`);
  assert(result?.ok === true, `room entry rejected ${JSON.stringify(result)}`);
  return result;
}

const chrome = findChrome();
let owner = null;
let peer = null;
const result = {
  revision: "world-v0-ongoing-cross-page-resume-v1",
  roomId: ROOM_ID,
  generatedAt: new Date().toISOString(),
  verdict: "WORLD_V0_ONGOING_CROSS_PAGE_RESUME_FAIL",
};

try {
  owner = await startBrowser(chrome, 0);
  peer = await startBrowser(chrome, 1);
  await boot(owner);
  await boot(peer);

  result.ownerEntry = await enterRoom(owner, "Owner-A");
  await waitFor(owner, `(() => {
    const e=window.__sharedYardV0Evidence?.();
    return e && !e.runtimeFailed && e.lifecycle?.r0===true && e.lifecycle?.topology?.revision===1 &&
      e.lifecycle?.topology?.actors?.length===1 && Number.isInteger(e.protocolStartTick) &&
      e.localBoundaryTick>=e.protocolStartTick+60 && e.metrics?.guardMismatches===0 && e.session?.actorSessionId;
  })()`, "owner live solo Yard");
  const ownerSolo = await evidence(owner);

  result.peerEntry = await enterRoom(peer, "Peer-B");
  await waitFor(owner, `(() => { const e=window.__sharedYardV0Evidence?.(); return e && !e.runtimeFailed && e.lifecycle?.topology?.revision===2 && e.lifecycle?.topology?.actors?.length===2 && e.presentation?.remotePresence==='PEER' && e.metrics?.guardMismatches===0 && (e.lifecycleEvents||[]).some(x=>x.type==='r0-topology-rebase-complete'); })()`, "owner topology2 after peer join");
  await waitFor(peer, `(() => { const e=window.__sharedYardV0Evidence?.(); return e && !e.runtimeFailed && e.lifecycle?.topology?.revision===2 && e.lifecycle?.topology?.actors?.length===2 && e.presentation?.remotePresence==='PEER' && e.metrics?.guardMismatches===0 && (e.lifecycleEvents||[]).some(x=>x.type==='r0-late-join-bootstrap'); })()`, "peer late-join bootstrap");

  const ownerBefore = await evidence(owner);
  const peerBefore = await evidence(peer);
  assert(ownerBefore.identity.worldEpoch === peerBefore.identity.worldEpoch, "initial WorldEpoch mismatch");
  assert(ownerBefore.identity.worldEpoch === ownerSolo.identity.worldEpoch, "owner WorldEpoch rotated on peer join");
  assert(ownerBefore.session.actorSessionId === ownerSolo.session.actorSessionId, "owner ActorSession changed on peer join");
  const original = {
    worldEpoch: peerBefore.identity.worldEpoch,
    actorSessionId: peerBefore.session.actorSessionId,
    netEntityId: peerBefore.session.selfNetEntityId,
    boundary: peerBefore.localBoundaryTick,
  };

  await peer.cdp.call("Target.closeTarget", { targetId: peer.targetId });
  peer.targetId = null;
  peer.sessionId = null;

  const reservedStarted = Date.now();
  let reservedRoom = null;
  while (Date.now() - reservedStarted < 10_000) {
    reservedRoom = await roomDirectory();
    if (reservedRoom?.occupancy===2 && reservedRoom?.connected===1 && reservedRoom?.reserved===1 && reservedRoom?.protectedReserved===1 && reservedRoom?.state==="live-protected-reserved") break;
    await sleep(150);
  }
  assert(reservedRoom?.occupancy===2 && reservedRoom?.connected===1 && reservedRoom?.reserved===1 && reservedRoom?.protectedReserved===1 && reservedRoom?.state==="live-protected-reserved", `protected reservation mismatch ${JSON.stringify(reservedRoom)}`);

  await waitFor(owner, `(() => { const e=window.__sharedYardV0Evidence?.(); return e && !e.runtimeFailed && e.identity?.worldEpoch===${JSON.stringify(original.worldEpoch)} && e.localBoundaryTick>${ownerBefore.localBoundaryTick+20} && e.metrics?.guardMismatches===0; })()`, "owner remains exact while peer page closed");

  await attachPage(peer);
  await boot(peer);
  const resumeCard = await waitFor(peer, `(() => {
    const entry=window.__sharedYardV0PublicRoomEntry?.();
    const room=entry?.rooms?.find((r)=>r.id===${JSON.stringify(ROOM_ID)});
    const button=document.querySelector('.public-room-card[data-room-id=${JSON.stringify(ROOM_ID)}]');
    return room?.resumableHere && room?.protectedReserved===1 && button && !button.disabled && /Resume/.test(button.textContent||"") ? { room, text:button.textContent, callsign:document.querySelector('#callsign')?.value||null } : false;
  })()`, "resume card available");

  await evaluate(peer, `document.querySelector('.public-room-card[data-room-id=${JSON.stringify(ROOM_ID)}]').click()`);
  await waitFor(peer, `(() => {
    const e=window.__sharedYardV0Evidence?.();
    return e && !e.runtimeFailed && e.identity?.worldEpoch===${JSON.stringify(original.worldEpoch)} &&
      e.session?.actorSessionId===${JSON.stringify(original.actorSessionId)} &&
      e.session?.selfNetEntityId===${JSON.stringify(original.netEntityId)} &&
      Number.isInteger(e.localBoundaryTick) && e.localBoundaryTick>${original.boundary} && e.metrics?.guardMismatches===0;
  })()`, "same ActorSession resumed from reopened page");

  const peerAfter = await evidence(peer);
  const ownerAfter = await evidence(owner);
  const restoredRoom = await roomDirectory();
  assert(ownerAfter.identity.worldEpoch === original.worldEpoch, "owner WorldEpoch rotated");
  assert(ownerAfter.metrics.guardMismatches === 0, "owner exact-state regression");
  assert(peerAfter.metrics.guardMismatches === 0, "peer exact-state regression");
  assert(restoredRoom?.occupancy===2 && restoredRoom?.connected===2 && restoredRoom?.reserved===0 && restoredRoom?.state==="live", `restored directory mismatch ${JSON.stringify(restoredRoom)}`);
  assert(peerAfter.lifecycleEvents.some((event) => event.type === "cross-page-resume-intent"), "cross-page resume intent lifecycle missing");
  assert(peerAfter.lifecycleEvents.some((event) => event.type === "actor-resume-complete" && event.bootstrapFromAuthority === true), "authority bootstrap resume lifecycle missing");

  Object.assign(result, {
    verdict: "WORLD_V0_ONGOING_CROSS_PAGE_RESUME_PASS",
    ownerSolo: {
      worldEpoch: ownerSolo.identity.worldEpoch,
      actorSessionId: ownerSolo.session.actorSessionId,
      boundary: ownerSolo.localBoundaryTick,
    },
    original,
    reservedRoom,
    resumeCard,
    restoredRoom,
    peerAfter: {
      worldEpoch: peerAfter.identity.worldEpoch,
      actorSessionId: peerAfter.session.actorSessionId,
      netEntityId: peerAfter.session.selfNetEntityId,
      boundary: peerAfter.localBoundaryTick,
      guardMismatches: peerAfter.metrics.guardMismatches,
    },
    ownerAfter: {
      worldEpoch: ownerAfter.identity.worldEpoch,
      actorSessionId: ownerAfter.session.actorSessionId,
      boundary: ownerAfter.localBoundaryTick,
      guardMismatches: ownerAfter.metrics.guardMismatches,
    },
  });
  writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  console.log(result.verdict);
} catch (error) {
  result.error = error instanceof Error ? error.stack || error.message : String(error);
  result.pages = [];
  for (const client of [owner, peer]) {
    if (!client?.sessionId) continue;
    try { result.pages.push(await evidence(client)); } catch {}
  }
  writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
  console.error(result.error);
  process.exitCode = 1;
} finally {
  await stopBrowser(peer);
  await stopBrowser(owner);
}
