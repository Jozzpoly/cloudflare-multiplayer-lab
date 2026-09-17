import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const BASE = (process.env.MW_WORLD_V0_JUMP_RESUME_BASE || "http://127.0.0.1:8787").replace(/\/$/, "");
const PAGE_URL = `${BASE}/world-v0/`;
const ROOM_ID = process.env.MW_WORLD_V0_JUMP_RESUME_ROOM || "yard-3";
const OUTPUT = process.env.MW_WORLD_V0_JUMP_RESUME_OUTPUT || "world-v0-jump-provenance-v27-resume-collision.json";
const PORTS = [9692, 9693];
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
    const response = await this.call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, userGesture: true }, sessionId);
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.text || "browser evaluation failed");
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
  const profile = mkdtempSync(join(tmpdir(), `mw-jump-resume-${index}-`));
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
  const cdp = new Cdp(await waitDebugger(PORTS[index]));
  await cdp.opened;
  const client = { profile, child, stderr, cdp, targetId: null, sessionId: null };
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
    await sleep(75);
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
  await waitFor(client,
    `document.readyState === "complete" && typeof window.__sharedYardV0Evidence === "function" && typeof window.__sharedYardV0PublicRoomEntry === "function"`,
    "browser boot");
  await waitFor(client,
    `window.__sharedYardV0PublicRoomEntry().rooms.some((room) => room.id === ${JSON.stringify(ROOM_ID)})`,
    "room directory visible");
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
}

async function triggerJump(client) {
  return evaluate(client, `(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { code:"Space", key:" ", bubbles:true, cancelable:true }));
    setTimeout(() => window.dispatchEvent(new KeyboardEvent("keyup", { code:"Space", key:" ", bubbles:true, cancelable:true })), 20);
    return window.__sharedYardV0Evidence?.() ?? null;
  })()`);
}

function jumpSnapshot(evidenceValue) {
  const j = evidenceValue?.inputScheduler?.jumpDelivery ?? null;
  return j ? {
    revision: j.revision,
    pending: j.pending,
    edgeArmed: j.edgeArmed,
    pressSequence: j.pressSequence,
    pendingSequence: j.pendingSequence,
    deliveredSequence: j.deliveredSequence,
    deliveredTick: j.deliveredTick,
    lastDeliveredApplied: j.lastDeliveredApplied,
    rearmedTick: j.rearmedTick,
    appliedCount: j.appliedCount,
  } : null;
}

const chrome = findChrome();
let owner = null;
let peer = null;
const result = {
  revision: "world-v0-jump-provenance-v27-resume-collision-audit-v1",
  generatedAt: new Date().toISOString(),
  roomId: ROOM_ID,
  verdict: "WORLD_V0_JUMP_PROVENANCE_RESUME_COLLISION_NOT_PROVEN",
};

try {
  owner = await startBrowser(chrome, 0);
  peer = await startBrowser(chrome, 1);
  await boot(owner);
  await boot(peer);

  await enterRoom(owner, "JumpOwnerA");
  await waitFor(owner, `(() => { const e=window.__sharedYardV0Evidence?.(); return e && !e.runtimeFailed && Number.isInteger(e.protocolStartTick) && e.localBoundaryTick>=e.protocolStartTick+60 && e.session?.actorSessionId && e.metrics?.guardMismatches===0; })()`, "owner live solo");
  await enterRoom(peer, "JumpPeerB");
  await waitFor(peer, `(() => { const e=window.__sharedYardV0Evidence?.(); return e && !e.runtimeFailed && e.lifecycle?.topology?.actors?.length===2 && e.session?.actorSessionId && e.inputScheduler?.jumpDelivery?.revision==='world-v0-jump-delivery-persistence-v1' && e.metrics?.guardMismatches===0; })()`, "peer live before first press");
  await waitFor(owner, `(() => { const e=window.__sharedYardV0Evidence?.(); return e && !e.runtimeFailed && e.lifecycle?.topology?.actors?.length===2 && e.metrics?.guardMismatches===0; })()`, "owner sees peer");

  const beforeFirst = await evidence(peer);
  const session = {
    worldEpoch: beforeFirst.identity.worldEpoch,
    actorSessionId: beforeFirst.session.actorSessionId,
    netEntityId: beforeFirst.session.selfNetEntityId,
  };
  assert(beforeFirst.inputScheduler.jumpDelivery.pressSequence === 0, `unexpected initial press sequence ${beforeFirst.inputScheduler.jumpDelivery.pressSequence}`);
  assert(beforeFirst.inputScheduler.jumpDelivery.edgeArmed === true, "initial jump edge not armed");

  await triggerJump(peer);
  await waitFor(peer,
    `(() => { const j=window.__sharedYardV0Evidence?.()?.inputScheduler?.jumpDelivery; return j?.pressSequence===1 && j?.deliveredSequence===1 && j?.pending===false && Number.isInteger(j?.deliveredTick); })()`,
    "first press causal delivery");
  await waitFor(peer,
    `(() => { const j=window.__sharedYardV0Evidence?.()?.inputScheduler?.jumpDelivery; return j?.edgeArmed===true && Number.isInteger(j?.rearmedTick) && j.rearmedTick>j.deliveredTick; })()`,
    "first press canonical false rearm");
  const firstDelivered = await evidence(peer);
  const firstJump = jumpSnapshot(firstDelivered);
  assert(firstJump.pressSequence === 1 && firstJump.deliveredSequence === 1, `first press identity mismatch ${JSON.stringify(firstJump)}`);

  await peer.cdp.call("Target.closeTarget", { targetId: peer.targetId });
  peer.targetId = null;
  peer.sessionId = null;

  const reservedStarted = Date.now();
  let reservedRoom = null;
  while (Date.now() - reservedStarted < 10_000) {
    reservedRoom = await roomDirectory();
    if (reservedRoom?.connected===1 && reservedRoom?.reserved===1 && reservedRoom?.protectedReserved===1) break;
    await sleep(150);
  }
  assert(reservedRoom?.connected===1 && reservedRoom?.reserved===1 && reservedRoom?.protectedReserved===1,
    `ActorSession was not protected for resume ${JSON.stringify(reservedRoom)}`);

  await attachPage(peer);
  await boot(peer);
  await waitFor(peer, `(() => {
    const entry=window.__sharedYardV0PublicRoomEntry?.();
    const room=entry?.rooms?.find((r)=>r.id===${JSON.stringify(ROOM_ID)});
    const button=document.querySelector('.public-room-card[data-room-id=${JSON.stringify(ROOM_ID)}]');
    return room?.resumableHere && button && !button.disabled && /Resume/.test(button.textContent||"");
  })()`, "resume card available");
  await evaluate(peer, `document.querySelector('.public-room-card[data-room-id=${JSON.stringify(ROOM_ID)}]').click()`);
  await waitFor(peer, `(() => { const e=window.__sharedYardV0Evidence?.(); return e && !e.runtimeFailed && e.identity?.worldEpoch===${JSON.stringify(session.worldEpoch)} && e.session?.actorSessionId===${JSON.stringify(session.actorSessionId)} && e.session?.selfNetEntityId===${JSON.stringify(session.netEntityId)} && e.metrics?.guardMismatches===0 && (e.lifecycleEvents||[]).some(x=>x.type==='actor-resume-complete' && x.bootstrapFromAuthority===true); })()`, "same ActorSession resumed in fresh page");

  const afterResume = await evidence(peer);
  const resetJump = jumpSnapshot(afterResume);
  assert(afterResume.session.actorSessionId === session.actorSessionId, "ActorSession changed across page resume");
  assert(afterResume.session.selfNetEntityId === session.netEntityId, "NetEntity changed across page resume");
  assert(resetJump.pressSequence === 0,
    `fresh page unexpectedly restored jump sequence high-water: ${JSON.stringify(resetJump)}`);
  assert(resetJump.edgeArmed === true && resetJump.pending === false,
    `fresh page jump state not ready for collision probe: ${JSON.stringify(resetJump)}`);

  await triggerJump(peer);
  await waitFor(peer,
    `(() => { const j=window.__sharedYardV0Evidence?.()?.inputScheduler?.jumpDelivery; return j?.pressSequence===1 && j?.deliveredSequence===1 && j?.pending===false && Number.isInteger(j?.deliveredTick); })()`,
    "post-resume press causal delivery");
  const secondDelivered = await evidence(peer);
  const secondJump = jumpSnapshot(secondDelivered);

  // This is the falsifier: two distinct user press events, separated by a fresh-page
  // bootstrap, occupied one continuous ActorSession but were both labelled sequence=1.
  // Therefore naked jumpSequence is process/page-local provenance, not an
  // ActorSession-wide event identity and cannot safely serve as a durable dedupe key.
  assert(firstJump.pressSequence === secondJump.pressSequence,
    `expected sequence reuse was not reproduced: ${firstJump.pressSequence} vs ${secondJump.pressSequence}`);
  assert(firstJump.deliveredSequence === secondJump.deliveredSequence,
    `canonical delivered sequence reuse was not reproduced: ${firstJump.deliveredSequence} vs ${secondJump.deliveredSequence}`);
  assert(firstDelivered.session.actorSessionId === secondDelivered.session.actorSessionId,
    "collision did not occur inside one ActorSession");

  const ownerAfter = await evidence(owner);
  assert(ownerAfter.metrics.guardMismatches === 0 && secondDelivered.metrics.guardMismatches === 0,
    "state guard mismatch during collision reproduction");

  Object.assign(result, {
    verdict: "WORLD_V0_JUMP_PROVENANCE_RESUME_COLLISION_REPRODUCED",
    session,
    firstPress: firstJump,
    afterResume: resetJump,
    secondPress: secondJump,
    sameActorSession: true,
    duplicatedJumpSequence: secondJump.pressSequence,
    reservedRoom,
    guardMismatches: {
      owner: ownerAfter.metrics.guardMismatches,
      resumedPeer: secondDelivered.metrics.guardMismatches,
    },
    finding: "Two distinct jump presses in one ActorSession reused jumpSequence=1 across fresh-page resume; raw jumpSequence is not ActorSession-wide unique.",
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
