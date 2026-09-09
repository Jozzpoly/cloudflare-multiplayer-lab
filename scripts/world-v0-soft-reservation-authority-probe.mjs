const BASE = (process.env.MW_WORLD_V0_SOFT_BASE || "http://127.0.0.1:8787").replace(/\/$/, "");
const WS_BASE = BASE.replace(/^http/, "ws");
const RUN = process.env.MW_WORLD_V0_SOFT_ROOM || "yard-1";
const TIMEOUT_MS = 15_000;
const SOFT_TIMEOUT_MS = 28_000;

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function assert(value, message) { if (!value) throw new Error(message); }

async function waitFor(fn, label, timeoutMs = TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    try {
      last = await fn();
      if (last) return last;
    } catch (error) { last = error; }
    await sleep(40);
  }
  throw new Error(`${label} timeout · last=${last instanceof Error ? last.message : JSON.stringify(last)}`);
}

await waitFor(async () => {
  try { return (await fetch(`${BASE}/api/ping`, { cache: "no-store" })).ok; }
  catch { return false; }
}, "local worker readiness", 20_000);

async function room() {
  const response = await fetch(`${BASE}/api/world-v0/rooms?r=${Date.now()}`, { cache: "no-store" });
  assert(response.ok, `room directory HTTP ${response.status}`);
  const payload = await response.json();
  assert(payload.revision === "world-v0-public-room-directory-r4-vacant-capacity", `directory revision ${payload.revision}`);
  const found = payload.rooms?.find((candidate) => candidate.id === RUN);
  assert(found, `room ${RUN} missing`);
  return found;
}

function makeClient(playerId, resumeToken = null) {
  const params = new URLSearchParams({ run: RUN, player: playerId });
  if (resumeToken) params.set("resume", resumeToken);
  const ws = new WebSocket(`${WS_BASE}/world-v0/ws?${params}`);
  const messages = [];
  const state = { boundaryTick: 0, opened: false, closed: false, closeCode: null, closeReason: null, error: false };
  ws.addEventListener("open", () => { state.opened = true; });
  ws.addEventListener("error", () => { state.error = true; });
  ws.addEventListener("close", (event) => {
    state.closed = true;
    state.closeCode = event.code;
    state.closeReason = event.reason;
  });
  ws.addEventListener("message", (event) => {
    try {
      const message = JSON.parse(String(event.data));
      messages.push(message);
      if (Number.isFinite(message?.boundaryTick)) state.boundaryTick = Math.max(state.boundaryTick, message.boundaryTick);
      if (Number.isFinite(message?.state?.boundaryTick)) state.boundaryTick = Math.max(state.boundaryTick, message.state.boundaryTick);
    } catch {}
  });
  return { playerId, ws, messages, state };
}

async function welcome(client, timeout = TIMEOUT_MS) {
  return waitFor(() => client.messages.find((message) => message?.type === "world_v0_welcome") || false, `${client.playerId} welcome`, timeout);
}

async function expectRejected(playerId, label) {
  const client = makeClient(playerId);
  await waitFor(() => client.state.error || (client.state.closed && !client.state.opened), label, 8_000);
  assert(!client.state.opened, `${label}: fresh websocket unexpectedly opened`);
  return { error: client.state.error, closeCode: client.state.closeCode, closeReason: client.state.closeReason };
}

function identity(message) {
  return {
    worldId: message.worldId,
    worldEpoch: message.worldEpoch,
    simBuildId: message.simBuildId,
    clientSimRevision: message.clientSimRevision,
  };
}

function ready(client, welcomeMessage) {
  client.ws.send(JSON.stringify({ type: "world_v0_ready", ...identity(welcomeMessage) }));
}

function startFeed(client, welcomeMessage, options = {}) {
  const id = identity(welcomeMessage);
  let nextTarget = Math.max(Number(welcomeMessage.protocolStartTick || 0), Number(options.nextTarget || welcomeMessage.protocolStartTick || 0));
  let batchSeq = Math.max(1, Number(options.nextBatchSeq || 1));
  let running = true;
  const timer = setInterval(() => {
    if (!running || client.ws.readyState !== WebSocket.OPEN) return;
    const maxAuthored = client.state.boundaryTick + 8;
    while (nextTarget + 1 <= maxAuthored) {
      client.ws.send(JSON.stringify({
        type: "world_v0_input_batch",
        ...id,
        batchSeq,
        records: [
          { targetTick: nextTarget, x: Number(options.x || 0), z: Number(options.z || 0), jump: false },
          { targetTick: nextTarget + 1, x: Number(options.x || 0), z: Number(options.z || 0), jump: false },
        ],
      }));
      batchSeq += 1;
      nextTarget += 2;
    }
  }, 8);
  return {
    stop() { running = false; clearInterval(timer); },
    get batchSeq() { return batchSeq; },
    get nextTarget() { return nextTarget; },
  };
}

async function startPair(aName, bName) {
  const a = makeClient(aName);
  const aw = await welcome(a);
  const b = makeClient(bName);
  const bw = await welcome(b);
  assert(aw.worldEpoch === bw.worldEpoch, "pair WorldEpoch mismatch");
  ready(a, aw);
  ready(b, bw);
  const startA = await waitFor(() => a.messages.find((m) => m?.type === "world_v0_start") || false, `${aName} start`);
  const startB = await waitFor(() => b.messages.find((m) => m?.type === "world_v0_start") || false, `${bName} start`);
  aw.protocolStartTick = startA.protocolStartTick;
  bw.protocolStartTick = startB.protocolStartTick;
  const feedA = startFeed(a, aw, { x: 0.25 });
  const feedB = startFeed(b, bw, { x: -0.25 });
  await waitFor(() => a.messages.find((m) => m?.type === "world_v0_consumed" && m.boundaryTick > startA.protocolStartTick + 8) || false, "pair canonical progression", 20_000);
  return { a, aw, feedA, b, bw, feedB, epoch: aw.worldEpoch };
}

const evidence = {
  verdict: "WORLD_V0_SOFT_RESERVATION_AUTHORITY_FAIL",
  run: RUN,
  generatedAt: new Date().toISOString(),
};

let a = null;
let b = null;
let bResume = null;
let c = null;
let a2 = null;
let feedA = null;
let feedB = null;
let feedBResume = null;
let feedC = null;
let feedA2 = null;

try {
  const pair = await startPair("soft-owner-a", "soft-owner-b");
  ({ a, b, feedA, feedB } = pair);
  const aw = pair.aw;
  const bw = pair.bw;
  const oldEpoch = pair.epoch;

  feedB.stop();
  b.ws.close(1000, "soft_probe_drop_b");

  const protectedRoom = await waitFor(async () => {
    const value = await room();
    return value.worldEpoch === oldEpoch && value.protectedReserved === 1 && value.softReserved === 0 ? value : false;
  }, "protected reservation classification");
  assert(protectedRoom.joinable === false && protectedRoom.replacementCapable === false, `protected room became joinable ${JSON.stringify(protectedRoom)}`);
  const protectedReject = await expectRejected("soft-intruder-protected", "protected reservation fresh admission rejection");

  const firstSoftRoom = await waitFor(async () => {
    const value = await room();
    return value.worldEpoch === oldEpoch && value.protectedReserved === 0 && value.softReserved === 1 ? value : false;
  }, "first soft reservation classification", SOFT_TIMEOUT_MS);
  assert(firstSoftRoom.joinable === true && firstSoftRoom.replacementCapable === true, `soft room not joinable ${JSON.stringify(firstSoftRoom)}`);

  // Unclaimed soft reservation remains exact resume authority for its owner.
  bResume = makeClient("soft-owner-b", bw.resumeToken);
  const brw = await welcome(bResume);
  assert(brw.resumed === true, "soft owner did not resume");
  assert(brw.worldEpoch === oldEpoch && brw.selfSessionId === bw.selfSessionId, "soft owner identity drift");
  feedBResume = startFeed(bResume, brw, {
    x: -0.2,
    nextBatchSeq: Number(brw.resumeLastBatchSeq || 0) + 1,
    nextTarget: Number(brw.state?.boundaryTick || 0) + 8,
  });
  await waitFor(() => a.messages.find((m) => m?.type === "world_v0_consumed" && m.worldEpoch === oldEpoch && m.players?.some((p) => p.sessionId === bw.selfSessionId && p.source === "fresh")) || false, "soft owner canonical resume");

  feedBResume.stop();
  bResume.ws.close(1000, "soft_probe_drop_b_again");

  const secondSoftRoom = await waitFor(async () => {
    const value = await room();
    return value.worldEpoch === oldEpoch && value.protectedReserved === 0 && value.softReserved === 1 ? value : false;
  }, "second soft reservation classification", SOFT_TIMEOUT_MS);
  assert(secondSoftRoom.joinable === true, "second soft reservation not joinable");

  // Demand-driven preemption rotates the fixed 2P epoch rather than replacing an actor in place.
  c = makeClient("soft-new-c");
  const cw = await welcome(c);
  assert(cw.resumed === false, "fresh C incorrectly resumed old actor");
  assert(cw.worldEpoch !== oldEpoch, "soft preemption failed to rotate WorldEpoch");
  const epochEnded = await waitFor(() => a.messages.find((m) => m?.type === "world_v0_epoch_ended" && m.reason === "peer_left_restart_required") || false, "old peer recoverable epoch end");
  assert(epochEnded.worldEpoch === oldEpoch, "epoch-ended identity drift");

  // The still-live old peer can now re-enter fresh in the same logical Yard.
  feedA.stop();
  await waitFor(() => a.state.closed, "old A socket closes after handoff");
  a2 = makeClient("soft-owner-a");
  const a2w = await welcome(a2);
  assert(a2w.worldEpoch === cw.worldEpoch, "fresh A did not join replacement epoch");
  assert(a2w.selfSessionId !== aw.selfSessionId, "replacement epoch reused old A ActorSession");
  ready(c, cw);
  ready(a2, a2w);
  const startC = await waitFor(() => c.messages.find((m) => m?.type === "world_v0_start") || false, "replacement C start");
  const startA2 = await waitFor(() => a2.messages.find((m) => m?.type === "world_v0_start") || false, "replacement A start");
  cw.protocolStartTick = startC.protocolStartTick;
  a2w.protocolStartTick = startA2.protocolStartTick;
  feedC = startFeed(c, cw, { z: 0.2 });
  feedA2 = startFeed(a2, a2w, { z: -0.2 });
  await waitFor(() => c.messages.find((m) => m?.type === "world_v0_consumed" && m.worldEpoch === cw.worldEpoch && m.boundaryTick > startC.protocolStartTick + 8) || false, "replacement pair canonical progression", 20_000);

  const replacementLive = await room();
  assert(replacementLive.worldEpoch === cw.worldEpoch, "directory did not publish replacement epoch");
  assert(replacementLive.connected === 2 && replacementLive.reserved === 0 && replacementLive.joinable === false, `replacement pair not full live ${JSON.stringify(replacementLive)}`);
  const fullReject = await expectRejected("soft-intruder-full", "full live room fresh admission rejection");

  // A stale token from the retired epoch cannot reclaim the new world.
  const staleResume = makeClient("soft-owner-b", bw.resumeToken);
  await waitFor(() => staleResume.state.error || (staleResume.state.closed && !staleResume.state.opened), "retired token rejection", 8_000);
  assert(!staleResume.state.opened, "retired ActorSession token opened replacement epoch");

  Object.assign(evidence, {
    verdict: "WORLD_V0_SOFT_RESERVATION_AUTHORITY_PASS",
    oldEpoch,
    replacementEpoch: cw.worldEpoch,
    protected: {
      state: protectedRoom.state,
      protectedReserved: protectedRoom.protectedReserved,
      softReserved: protectedRoom.softReserved,
      joinable: protectedRoom.joinable,
      freshAdmissionRejected: true,
      rejection: protectedReject,
    },
    soft: {
      firstState: firstSoftRoom.state,
      ownerResumePreservedOldEpoch: true,
      secondState: secondSoftRoom.state,
      joinable: secondSoftRoom.joinable,
    },
    handoff: {
      reason: epochEnded.reason,
      worldEpochRotated: true,
      oldPeerFreshReentryProved: true,
      retiredTokenRejected: true,
    },
    replacement: {
      connected: replacementLive.connected,
      reserved: replacementLive.reserved,
      fullFreshAdmissionRejected: true,
      rejection: fullReject,
    },
    nonClaim: "Local Workerd authority/admission proof only. It does not prove browser automatic room recovery, remote placement, Owner feel, or production behavior.",
  });
  console.log("WORLD_V0_SOFT_RESERVATION_AUTHORITY_PROBE", JSON.stringify(evidence));
  console.log(evidence.verdict);
} finally {
  for (const feed of [feedA, feedB, feedBResume, feedC, feedA2]) {
    try { feed?.stop(); } catch {}
  }
  for (const client of [a, b, bResume, c, a2]) {
    try { client?.ws?.close(1000, "soft_probe_done"); } catch {}
  }
  await sleep(80);
}
