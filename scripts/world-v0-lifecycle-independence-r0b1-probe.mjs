import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { WORLD_V0_STATE_COMPONENTS, WORLD_V0_TIMING } from "../src/world-v0-contract.ts";

const BASE = process.env.MW_WORLD_V0_R0B1_BASE ?? "http://127.0.0.1:8787";
const WS_BASE = BASE.replace(/^http/, "ws");
const RUN = process.env.MW_WORLD_V0_R0B1_RUN ?? `r0b1-${Date.now().toString(36)}`;
const TIMEOUT_MS = 20_000;
const MODE_REVISION = "world-v0-lifecycle-r0-authority-v1";

const modulePath = resolve("public/world-v0/box3d-i4/box3d.inline.mjs");
const { default: Box3D } = await import(`${pathToFileURL(modulePath).href}?r0b1=${Date.now()}`);
const b3 = await Box3D();

function sleep(ms) { return new Promise((resolvePromise) => setTimeout(resolvePromise, ms)); }
async function waitFor(fn, label, timeoutMs = TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    try {
      const value = await fn();
      if (value) return value;
      last = value;
    } catch (error) { last = error; }
    await sleep(20);
  }
  throw new Error(`${label} timeout; last=${last instanceof Error ? last.message : JSON.stringify(last)}`);
}

await waitFor(async () => {
  try { return (await fetch(`${BASE}/api/ping`, { cache: "no-store" })).ok; }
  catch { return false; }
}, "local worker readiness");

function identityFrom(message) {
  return {
    worldId: message.worldId,
    worldEpoch: message.worldEpoch,
    simBuildId: message.simBuildId,
    clientSimRevision: message.clientSimRevision,
  };
}
function topologyInput(topology) {
  return { topologyRevision: topology.revision, topologyDigest: topology.digest };
}
function makeClient(playerId) {
  const params = new URLSearchParams({ run: RUN, player: playerId, lifecycle: "r0" });
  const ws = new WebSocket(`${WS_BASE}/world-v0/ws?${params}`);
  const messages = [];
  const state = { boundaryTick: 0, closed: false };
  ws.addEventListener("message", (event) => {
    try {
      const message = JSON.parse(String(event.data));
      messages.push(message);
      for (const candidate of [message.boundaryTick, message.state?.boundaryTick]) {
        if (Number.isFinite(candidate)) state.boundaryTick = Math.max(state.boundaryTick, candidate);
      }
    } catch { /* evidence stream only */ }
  });
  ws.addEventListener("close", () => { state.closed = true; });
  const opened = new Promise((resolvePromise, reject) => {
    ws.addEventListener("open", resolvePromise, { once: true });
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
function sendReady(client, welcomeMessage, topology = welcomeMessage.topology) {
  client.ws.send(JSON.stringify({
    type: "world_v0_ready",
    ...identityFrom(welcomeMessage),
    ...topologyInput(topology),
  }));
}
function sendBatch(client, welcomeMessage, topology, batchSeq, targetTick, x, z) {
  client.ws.send(JSON.stringify({
    type: "world_v0_input_batch",
    ...identityFrom(welcomeMessage),
    ...topologyInput(topology),
    batchSeq,
    records: [
      { targetTick, x, z, jump: false },
      { targetTick: targetTick + 1, x, z, jump: false },
    ],
  }));
}
function startFeed(client, welcomeMessage, topology, { x, z, nextBatchSeq = 1, nextTarget }) {
  let batchSeq = nextBatchSeq;
  let target = nextTarget;
  let active = true;
  const timer = setInterval(() => {
    if (!active || client.ws.readyState !== WebSocket.OPEN) return;
    const maxTarget = client.state.boundaryTick + WORLD_V0_TIMING.predictionLeadTicks;
    while (target + 1 <= maxTarget) {
      sendBatch(client, welcomeMessage, topology, batchSeq, target, x, z);
      batchSeq += 1;
      target += 2;
    }
  }, 8);
  return {
    stop() { active = false; clearInterval(timer); },
    get nextBatchSeq() { return batchSeq; },
    get nextTarget() { return target; },
  };
}

const FLOAT32_VIEW = new DataView(new ArrayBuffer(4));
function f32hex(value) {
  FLOAT32_VIEW.setFloat32(0, value, true);
  return FLOAT32_VIEW.getUint32(0, true).toString(16).padStart(8, "0");
}
function bodyVec3(body, getter) { const out = [0, 0, 0]; getter(out, body); return out; }
function bodyQuat(body) { const out = [0, 0, 0, 1]; b3.b3Body_GetRotation(out, body); return out; }
function bodyState(body) {
  return [
    ...bodyVec3(body, b3.b3Body_GetPosition),
    ...bodyQuat(body),
    ...bodyVec3(body, b3.b3Body_GetLinearVelocity),
    ...bodyVec3(body, b3.b3Body_GetAngularVelocity),
  ];
}
function decodeBase64(text) { return Uint8Array.from(Buffer.from(text, "base64")); }
function recordingPacked(seed) {
  const bytes = decodeBase64(seed.bytesBase64);
  assert.equal(bytes.byteLength, seed.byteLength, "R0-B1 rebase byte length mismatch");
  const player = b3.b3RecPlayer_CreateFromBytes(bytes, 1);
  assert(player, "R0-B1 Recording rehydrate failed");
  try {
    const byEntity = new Map();
    const count = b3.b3RecPlayer_GetBodyCount(player);
    for (let ordinal = 0; ordinal < count; ordinal += 1) {
      const body = b3.b3RecPlayer_GetBodyId(player, ordinal);
      if (!b3.b3Body_IsValid(body)) continue;
      const locator = b3.b3Body_GetName(body);
      if (!locator) continue;
      const id = locator.startsWith("prop:") ? locator.slice(5) : locator;
      if (seed.topology.entityOrder.includes(id)) byEntity.set(id, body);
    }
    let packed = "";
    for (const id of seed.topology.entityOrder) {
      const body = byEntity.get(id);
      assert(body, `R0-B1 Recording missing ${id}`);
      const values = bodyState(body);
      assert.equal(values.length, WORLD_V0_STATE_COMPONENTS.length, `R0-B1 state width drift ${id}`);
      for (const value of values) packed += f32hex(value);
    }
    return packed;
  } finally {
    b3.b3RecPlayer_Destroy(player);
  }
}

const a = makeClient("r0a");
const aw = await welcome(a);
assert.equal(aw.topology?.modeRevision, MODE_REVISION, "A missing R0 topology mode");
assert.equal(aw.topology.revision, 1, "A initial topology revision is not 1");
assert.deepEqual(aw.topology.actors.map((actor) => actor.netEntityId), ["actor:0"], "A initial actor domain is not solo");
assert.equal(aw.state?.stateGuard?.topologyRevision, 1, "A solo state guard is not topology-bound");
assert.equal(aw.waitingForPeer, false, "R0 solo welcome still claims peer wait");
assert.equal(aw.acceptingLateJoin, true, "R0 solo welcome does not advertise late-join capacity");

sendReady(a, aw);
const startA = await waitMessage(a, (m) => m?.type === "world_v0_start", "A solo start");
assert.equal(startA.topology?.revision, 1, "A solo start topology drift");
aw.protocolStartTick = startA.protocolStartTick;
a.state.boundaryTick = Math.max(a.state.boundaryTick, startA.boundaryTick ?? 0);

const feedA1 = startFeed(a, aw, aw.topology, {
  x: 1,
  z: 0.2,
  nextBatchSeq: 1,
  nextTarget: startA.protocolStartTick,
});
const soloFresh = await waitMessage(a, (m) =>
  m?.type === "world_v0_consumed" &&
  m.topology?.revision === 1 &&
  m.players?.some((entry) => entry.sessionId === aw.selfSessionId && entry.source === "fresh") &&
  m.boundaryTick >= startA.protocolStartTick + 70,
"A sustained solo canonical movement", 20_000);
feedA1.stop();

const oldTopology = aw.topology;
const oldPendingTarget = Math.max(a.state.boundaryTick, soloFresh.boundaryTick) + 28;
const pendingSeq = feedA1.nextBatchSeq;
sendBatch(a, aw, oldTopology, pendingSeq, oldPendingTarget, -1, 0);
const pendingAck = await waitMessage(a, (m) =>
  m?.type === "world_v0_batch_ack" && m.batchSeq === pendingSeq &&
  m.records?.every((record) => record.status === "accepted"),
"topology-1 pending input accepted");
assert.equal(pendingAck.topology?.revision, 1, "pending input ack topology drift");

const b = makeClient("r0b");
const bw = await welcome(b);
assert.equal(bw.worldEpoch, aw.worldEpoch, "late B rotated WorldEpoch");
assert.notEqual(bw.selfSessionId, aw.selfSessionId, "late B reused A ActorSession");
assert.equal(bw.selfNetEntityId, "actor:1", "late B did not claim actor:1");
assert.equal(bw.topology?.revision, 2, "late B did not advance topology revision");
assert.deepEqual(bw.topology.actors.map((actor) => actor.netEntityId), ["actor:0", "actor:1"], "late B topology actor order drift");
assert(bw.rebaseSeed, "late B missing topology-bound authority rebase seed");
assert.equal(bw.rebaseSeed.boundaryTick, bw.state?.boundaryTick, "late B seed/state boundary mismatch");
assert.equal(bw.rebaseSeed.topology?.revision, 2, "late B seed topology revision mismatch");
assert.equal(bw.rebaseSeed.stateGuard?.topologyDigest, bw.topology.digest, "late B guard topology digest mismatch");
assert.equal(recordingPacked(bw.rebaseSeed), bw.rebaseSeed.stateGuard.packed, "late B Recording is not exact topology-2 state");

const topologyChangedA = await waitMessage(a, (m) =>
  m?.type === "world_v0_topology_changed" && m.topology?.revision === 2,
"A topology-change event");
assert.equal(topologyChangedA.worldEpoch, aw.worldEpoch, "A topology change rotated WorldEpoch");
assert.equal(topologyChangedA.rebaseSeed?.stateGuard?.packed, bw.rebaseSeed.stateGuard.packed, "A/B topology seed mismatch");
const projectedA = topologyChangedA.topology.actors.find((actor) => actor.netEntityId === aw.selfNetEntityId);
assert.equal(projectedA?.sessionId, aw.selfSessionId, "A ActorSession changed across late join");
assert(topologyChangedA.boundaryTick < oldPendingTarget, "apparatus failed to join before old pending target");

const flushed = await waitMessage(a, (m) =>
  m?.type === "world_v0_consumed" && m.targetTick === oldPendingTarget,
"old topology pending target consumption");
const flushedA = flushed.players.find((entry) => entry.sessionId === aw.selfSessionId);
assert(flushedA, "old pending target missing A");
assert.notEqual(flushedA.x, -1, "topology-1 pending input leaked into topology 2");
assert.equal(flushedA.fresh, false, "topology-1 pending input survived topology reset");

const staleTopologySeq = pendingSeq + 1;
const staleTopologyTarget = a.state.boundaryTick + WORLD_V0_TIMING.predictionLeadTicks;
sendBatch(a, aw, oldTopology, staleTopologySeq, staleTopologyTarget, -0.5, 0);
const mismatch = await waitMessage(a, (m) =>
  m?.type === "world_v0_error" && m.error === "topology_identity_mismatch" &&
  m.receivedTopology?.revision === 1 && m.expectedTopology?.revision === 2,
"stale topology input rejection");
assert.equal(a.state.closed, false, "topology mismatch incorrectly killed A transport");

sendReady(b, bw, bw.topology);
await waitMessage(b, (m) => m?.type === "world_v0_ready_ack" && m.topology?.revision === 2, "B ready ack");

const currentTopology = bw.topology;
const postJoinStart = Math.max(a.state.boundaryTick, b.state.boundaryTick) + WORLD_V0_TIMING.predictionLeadTicks;
const feedA2 = startFeed(a, aw, currentTopology, {
  x: 0.8,
  z: 0.6,
  nextBatchSeq: staleTopologySeq + 1,
  nextTarget: postJoinStart,
});
const feedB2 = startFeed(b, bw, currentTopology, {
  x: -0.8,
  z: 0.6,
  nextBatchSeq: 1,
  nextTarget: postJoinStart,
});
const bothFresh = await waitMessage(a, (m) =>
  m?.type === "world_v0_consumed" && m.topology?.revision === 2 &&
  m.players?.length === 2 && m.players.every((entry) => entry.source === "fresh") &&
  m.boundaryTick >= topologyChangedA.boundaryTick + 40,
"two-player fresh continuation", 20_000);
feedA2.stop();
feedB2.stop();

assert(!a.messages.some((m) => m?.type === "world_v0_epoch_ended"), "A observed epoch end during 1->2 join");
assert(!b.messages.some((m) => m?.type === "world_v0_epoch_ended"), "B observed epoch end during 1->2 join");

try { a.ws.close(1000, "r0b1_done"); } catch {}
try { b.ws.close(1000, "r0b1_done"); } catch {}

console.log("WORLD_V0_LIFECYCLE_INDEPENDENCE_R0B1_PASS", JSON.stringify({
  revision: "world-v0-lifecycle-independence-r0b1-v1",
  run: RUN,
  worldEpoch: aw.worldEpoch,
  solo: {
    actorSessionId: aw.selfSessionId,
    topologyRevision: oldTopology.revision,
    topologyDigest: oldTopology.digest,
    sustainedFreshBoundary: soloFresh.boundaryTick,
  },
  transition: {
    boundaryTick: topologyChangedA.boundaryTick,
    topologyRevision: currentTopology.revision,
    topologyDigest: currentTopology.digest,
    aActorSessionPreserved: projectedA?.sessionId === aw.selfSessionId,
    oldPendingTarget,
    oldPendingFlushed: flushedA.fresh === false && flushedA.x !== -1,
    staleTopologyRejected: mismatch.error === "topology_identity_mismatch",
    rebaseRecordingExact: recordingPacked(bw.rebaseSeed) === bw.rebaseSeed.stateGuard.packed,
  },
  twoPlayer: {
    aSessionId: aw.selfSessionId,
    bSessionId: bw.selfSessionId,
    bNetEntityId: bw.selfNetEntityId,
    freshContinuationBoundary: bothFresh.boundaryTick,
    sameWorldEpoch: bw.worldEpoch === aw.worldEpoch,
  },
  nonClaim: "This is a local Workerd raw-WebSocket authority/protocol gate for opt-in R0 lifecycle semantics. It does not yet prove browser topology rehydrate, product UI continuity, remote Cloudflare placement, or actor replacement after a disconnect.",
}));
