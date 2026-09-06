const BASE = process.env.MW_WORLD_V0_I1_BASE ?? "http://127.0.0.1:8792";
const WS_BASE = BASE.replace(/^http/, "ws");
const RUN = process.env.MW_WORLD_V0_I1_RUN ?? `i1-${Date.now().toString(36)}`;
const TIMEOUT_MS = 12_000;

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function waitFor(fn, label, timeoutMs = TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    try {
      const value = await fn();
      if (value) return value;
      last = value;
    } catch (error) {
      last = error;
    }
    await sleep(25);
  }
  throw new Error(`${label} timeout · last=${last instanceof Error ? last.message : JSON.stringify(last)}`);
}

await waitFor(async () => {
  try {
    const response = await fetch(`${BASE}/world-v0/`, { cache: "no-store" });
    return response.ok;
  } catch {
    return false;
  }
}, "local worker readiness", 20_000);

function makeClient(playerId, resumeToken = null) {
  const params = new URLSearchParams({ run: RUN, player: playerId });
  if (resumeToken) params.set("resume", resumeToken);
  const ws = new WebSocket(`${WS_BASE}/world-v0/ws?${params}`);
  const messages = [];
  const state = { boundaryTick: 0, closed: false, closeCode: null, closeReason: null };
  ws.addEventListener("message", (event) => {
    try {
      const message = JSON.parse(String(event.data));
      messages.push(message);
      if (Number.isFinite(message?.boundaryTick)) state.boundaryTick = Math.max(state.boundaryTick, message.boundaryTick);
      if (Number.isFinite(message?.state?.boundaryTick)) state.boundaryTick = Math.max(state.boundaryTick, message.state.boundaryTick);
    } catch { /* diagnostic probe ignores malformed non-json */ }
  });
  ws.addEventListener("close", (event) => {
    state.closed = true;
    state.closeCode = event.code;
    state.closeReason = event.reason;
  });
  const opened = new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", () => reject(new Error(`${playerId} websocket error before open`)), { once: true });
  });
  return { playerId, ws, messages, state, opened };
}

async function waitMessage(client, predicate, label, timeoutMs = TIMEOUT_MS) {
  await client.opened;
  return waitFor(() => client.messages.find(predicate) || false, label, timeoutMs);
}

async function welcome(client) {
  return waitMessage(client, (message) => message?.type === "world_v0_welcome", `${client.playerId} welcome`);
}

function identityFrom(message) {
  return {
    worldId: message.worldId,
    worldEpoch: message.worldEpoch,
    simBuildId: message.simBuildId,
    clientSimRevision: message.clientSimRevision,
  };
}

function sendReady(client, welcomeMessage) {
  client.ws.send(JSON.stringify({ type: "world_v0_ready", ...identityFrom(welcomeMessage) }));
}

function startInputFeed(client, welcomeMessage, options = {}) {
  const identity = identityFrom(welcomeMessage);
  const protocolStartTick = Number(welcomeMessage.protocolStartTick ?? options.protocolStartTick ?? 0);
  let nextTarget = Math.max(protocolStartTick, Number(options.nextTarget ?? protocolStartTick));
  let batchSeq = Math.max(1, Number(options.nextBatchSeq ?? 1));
  const x = Number(options.x ?? 0);
  const z = Number(options.z ?? 0);
  let active = true;

  const timer = setInterval(() => {
    if (!active || client.ws.readyState !== WebSocket.OPEN) return;
    const maxAuthored = client.state.boundaryTick + 8;
    while (nextTarget + 1 <= maxAuthored) {
      client.ws.send(JSON.stringify({
        type: "world_v0_input_batch",
        ...identity,
        batchSeq,
        records: [
          { targetTick: nextTarget, x, z, jump: false },
          { targetTick: nextTarget + 1, x, z, jump: false },
        ],
      }));
      batchSeq += 1;
      nextTarget += 2;
    }
  }, 8);

  return {
    stop() { active = false; clearInterval(timer); },
    get batchSeq() { return batchSeq; },
    get nextTarget() { return nextTarget; },
  };
}

const a = makeClient("owner-a");
const aw = await welcome(a);
const b = makeClient("owner-b");
const bw = await welcome(b);

for (const [name, w] of [["A", aw], ["B", bw]]) {
  if (!w.resumeToken || typeof w.resumeToken !== "string") throw new Error(`${name} missing private resume token`);
  if (w.resumeToken === w.selfSessionId) throw new Error(`${name} resume token leaked as public session identity`);
  if (w.resumed !== false || w.resumeCount !== 0) throw new Error(`${name} fresh welcome incorrectly marked resumed`);
}
if (aw.worldEpoch !== bw.worldEpoch) throw new Error("fresh peers do not share one WorldEpoch");
if (aw.selfSessionId === bw.selfSessionId) throw new Error("fresh peers share session identity");
if (aw.selfNetEntityId === bw.selfNetEntityId) throw new Error("fresh peers share NetEntityId");

sendReady(a, aw);
sendReady(b, bw);
await waitMessage(a, (m) => m?.type === "world_v0_ready_ack", "A ready ack");
await waitMessage(b, (m) => m?.type === "world_v0_ready_ack", "B ready ack");
const startA = await waitMessage(a, (m) => m?.type === "world_v0_start", "A start");
const startB = await waitMessage(b, (m) => m?.type === "world_v0_start", "B start");
if (startA.worldEpoch !== aw.worldEpoch || startB.worldEpoch !== aw.worldEpoch) throw new Error("start rotated epoch");

// Start messages carry the scheduled protocol boundary; feeds author only a modest
// +8 tick horizon, keeping the existing lead/future constants unchanged.
aw.protocolStartTick = startA.protocolStartTick;
bw.protocolStartTick = startB.protocolStartTick;
const feedA = startInputFeed(a, aw, { x: 1, z: 0 });
const feedB = startInputFeed(b, bw, { x: -1, z: 0 });

const activeB = await waitMessage(a, (message) => message?.type === "world_v0_consumed" &&
  message.players?.some((player) => player.netEntityId === bw.selfNetEntityId && player.source === "fresh"),
"B canonical fresh input before drop", 20_000);
const dropBoundary = activeB.boundaryTick;
const oldEpoch = aw.worldEpoch;

feedB.stop();
b.ws.close(1000, "i1_drop_b");
await waitFor(() => b.state.closed, "B socket close");

const bLeaseExpired = await waitMessage(a, (message) => message?.type === "world_v0_consumed" &&
  message.boundaryTick > dropBoundary &&
  message.worldEpoch === oldEpoch &&
  message.players?.some((player) => player.netEntityId === bw.selfNetEntityId && player.source === "lease_expired"),
"B actor-local lease expiry while A remains alive", 20_000);

if (a.messages.some((message) => message?.type === "world_v0_epoch_ended")) {
  throw new Error("single-peer transport loss still killed the WorldEpoch");
}
const aAfterDrop = bLeaseExpired.players.find((player) => player.netEntityId === aw.selfNetEntityId);
if (!aAfterDrop || aAfterDrop.source === "lease_expired") throw new Error("healthy A did not remain canonically live while B was stale");

const b2 = makeClient("owner-b", bw.resumeToken);
const b2w = await welcome(b2);
if (!b2w.resumed || b2w.resumeCount !== 1) throw new Error(`first B rebind not marked resumed: ${JSON.stringify(b2w)}`);
if (b2w.worldEpoch !== oldEpoch) throw new Error("B rebind rotated WorldEpoch");
if (b2w.selfSessionId !== bw.selfSessionId || b2w.selfNetEntityId !== bw.selfNetEntityId) {
  throw new Error("B rebind did not preserve ActorSession/NetEntity identity");
}
if (b2w.resumeToken !== bw.resumeToken) throw new Error("B rebind changed private resume authority");
if (b2w.protocolStartTick !== startB.protocolStartTick) throw new Error("B rebind lost protocolStartTick");
if (!Number.isFinite(b2w.resumeLastBatchSeq)) throw new Error("B rebind missing batch-sequence recovery boundary");

const feedB2 = startInputFeed(b2, b2w, {
  x: 0,
  z: 1,
  nextBatchSeq: b2w.resumeLastBatchSeq + 1,
  nextTarget: b2w.state.boundaryTick + 8,
});
const resumedFresh = await waitMessage(a, (message) => message?.type === "world_v0_consumed" &&
  message.worldEpoch === oldEpoch &&
  message.players?.some((player) => player.netEntityId === bw.selfNetEntityId && player.source === "fresh"),
"resumed B canonical fresh input", 12_000);
if (resumedFresh.boundaryTick <= bLeaseExpired.boundaryTick) throw new Error("resume did not advance shared history");

// Rebind again while B2 is still live. Exactly one socket may own the session.
const b3 = makeClient("owner-b", bw.resumeToken);
const b3w = await welcome(b3);
if (!b3w.resumed || b3w.resumeCount !== 2) throw new Error("second B rebind did not advance resumeCount");
if (b3w.selfSessionId !== bw.selfSessionId || b3w.worldEpoch !== oldEpoch) throw new Error("second B rebind changed actor/world identity");
await waitFor(() => b2.state.closed, "superseded B2 socket close");
if (b2.state.closeReason !== "session_rebound") throw new Error(`B2 close reason drift: ${b2.state.closeReason}`);
feedB2.stop();

const feedB3 = startInputFeed(b3, b3w, {
  x: 0,
  z: -1,
  nextBatchSeq: b3w.resumeLastBatchSeq + 1,
  nextTarget: b3w.state.boundaryTick + 8,
});
await waitMessage(a, (message) => message?.type === "world_v0_consumed" &&
  message.worldEpoch === oldEpoch &&
  message.players?.some((player) => player.netEntityId === bw.selfNetEntityId && player.source === "fresh"),
"rebound B3 canonical input", 12_000);

// Once every transport is gone, the same lease remains the bounded cleanup policy:
// the integration must not turn shared continuity into a permanent 60 Hz zombie.
feedA.stop();
feedB3.stop();
a.ws.close(1000, "i1_drop_all_a");
b3.ws.close(1000, "i1_drop_all_b");
await Promise.all([
  waitFor(() => a.state.closed, "A final close"),
  waitFor(() => b3.state.closed, "B3 final close"),
]);
await sleep(1_800);

const c = makeClient("owner-c");
const cw = await welcome(c);
if (cw.resumed) throw new Error("fresh C unexpectedly resumed dead session");
if (cw.worldEpoch === oldEpoch) throw new Error("all-disconnected cleanup failed to retire old WorldEpoch");
if (cw.selfSessionId === aw.selfSessionId || cw.selfSessionId === bw.selfSessionId) throw new Error("fresh epoch reused old ActorSession identity");

const result = {
  revision: "world-v0-integration-i1-lifecycle-probe-v1",
  run: RUN,
  oldEpoch,
  replacementEpoch: cw.worldEpoch,
  dropBoundary,
  staleBoundary: bLeaseExpired.boundaryTick,
  leaseTicksObserved: bLeaseExpired.boundaryTick - dropBoundary,
  actorSession: {
    sessionId: bw.selfSessionId,
    netEntityId: bw.selfNetEntityId,
    resumeCount: b3w.resumeCount,
    sameIdentityAcrossRebinds: true,
    supersededSocketClosed: b2.state.closed,
  },
  sharedContinuity: {
    healthyPeerSurvivedSingleDrop: true,
    worldEpochPreservedAcrossSingleDrop: true,
    resumedCanonicalInputObserved: true,
  },
  boundedCleanup: {
    oldEpochRetiredAfterAllConnectionsLost: true,
    freshEpochCreatedAfterCleanup: true,
  },
  verdict: "WORLD_V0_INTEGRATION_I1_SERVER_SESSION_PASS",
  nonClaim: "This proves the candidate server/DO/WebSocket ActorSession lifecycle locally. It does not yet prove browser resume UX, exact full-state client rebase, remote Cloudflare placement, process-loss reconstruction, or staging/production behavior.",
};
console.log("WORLD_V0_INTEGRATION_I1_PROBE", JSON.stringify(result, null, 2));
console.log(result.verdict);

try { c.ws.close(1000, "i1_done"); } catch {}
await sleep(50);
process.exit(0);