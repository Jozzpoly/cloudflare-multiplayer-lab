const BASE = process.env.MW_WORLD_V0_I2_BASE ?? "http://127.0.0.1:8792";
const WS_BASE = BASE.replace(/^http/, "ws");
const RUN = process.env.MW_WORLD_V0_I2_RUN ?? `i2-${Date.now().toString(36)}`;
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
    await sleep(20);
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

function makeClient(playerId) {
  const params = new URLSearchParams({ run: RUN, player: playerId });
  const ws = new WebSocket(`${WS_BASE}/world-v0/ws?${params}`);
  const messages = [];
  const state = { boundaryTick: 0 };
  ws.addEventListener("message", (event) => {
    try {
      const message = JSON.parse(String(event.data));
      messages.push(message);
      if (Number.isFinite(message?.boundaryTick)) state.boundaryTick = Math.max(state.boundaryTick, message.boundaryTick);
      if (Number.isFinite(message?.state?.boundaryTick)) state.boundaryTick = Math.max(state.boundaryTick, message.state.boundaryTick);
    } catch { /* diagnostic probe ignores malformed non-JSON traffic */ }
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
function sendBatch(client, welcomeMessage, batchSeq, records) {
  client.ws.send(JSON.stringify({
    type: "world_v0_input_batch",
    ...identityFrom(welcomeMessage),
    batchSeq,
    records,
  }));
}

function startInputFeed(client, welcomeMessage, protocolStartTick, input) {
  let nextTarget = protocolStartTick;
  let batchSeq = 1;
  let active = true;
  const timer = setInterval(() => {
    if (!active || client.ws.readyState !== WebSocket.OPEN) return;
    const maxAuthored = client.state.boundaryTick + 8;
    while (nextTarget + 1 <= maxAuthored) {
      sendBatch(client, welcomeMessage, batchSeq, [
        { targetTick: nextTarget, x: input.x, z: input.z, jump: false },
        { targetTick: nextTarget + 1, x: input.x, z: input.z, jump: false },
      ]);
      batchSeq += 1;
      nextTarget += 2;
    }
  }, 8);
  return {
    stop() { active = false; clearInterval(timer); },
    get nextBatchSeq() { return batchSeq; },
  };
}

const a = makeClient("i2-a");
const aw = await welcome(a);
const b = makeClient("i2-b");
const bw = await welcome(b);
if (aw.worldEpoch !== bw.worldEpoch) throw new Error("I2 peers did not share WorldEpoch");
if (aw.simBuildId !== bw.simBuildId) throw new Error("I2 peers did not share SimBuildId");
if (aw.simulation?.protocolRevision !== "shared-yard-v0-scheduled-input-v3-supersession") {
  throw new Error(`unexpected protocol revision ${aw.simulation?.protocolRevision}`);
}

sendReady(a, aw);
sendReady(b, bw);
await waitMessage(a, (m) => m?.type === "world_v0_ready_ack", "A ready ack");
await waitMessage(b, (m) => m?.type === "world_v0_ready_ack", "B ready ack");
const startA = await waitMessage(a, (m) => m?.type === "world_v0_start", "A start");
const startB = await waitMessage(b, (m) => m?.type === "world_v0_start", "B start");
if (startA.protocolStartTick !== startB.protocolStartTick) throw new Error("protocol start disagreement");

const feedA = startInputFeed(a, aw, startA.protocolStartTick, { x: 0.2, z: 0 });
const feedB = startInputFeed(b, bw, startB.protocolStartTick, { x: -0.2, z: 0 });
const active = await waitMessage(b, (message) => message?.type === "world_v0_consumed" &&
  message.targetTick >= startA.protocolStartTick &&
  message.players?.some((player) => player.netEntityId === aw.selfNetEntityId && player.source === "fresh"),
"canonical active baseline", 20_000);

feedA.stop();
const initialSeq = feedA.nextBatchSeq;
const revisedSeq = initialSeq + 1;
const duplicateSeq = initialSeq + 2;
const lateSeq = initialSeq + 3;
const targetTick = active.boundaryTick + 20;

sendBatch(a, aw, initialSeq, [
  { targetTick, x: 1, z: 0, jump: false },
  { targetTick: targetTick + 1, x: 1, z: 0, jump: false },
]);
const initialAck = await waitMessage(a, (message) => message?.type === "world_v0_batch_ack" && message.batchSeq === initialSeq,
"initial future prefill ack");
if (initialAck.records?.some((record) => record.status !== "accepted")) {
  throw new Error(`initial future prefill was not accepted: ${JSON.stringify(initialAck)}`);
}
const initialRelay = await waitMessage(b, (message) => message?.type === "world_v0_peer_records" && message.batchSeq === initialSeq,
"initial future prefill relay");
if (initialRelay.records?.length !== 2) throw new Error("initial relay did not contain both future ticks");

sendBatch(a, aw, revisedSeq, [
  { targetTick, x: 0, z: 1, jump: true },
  { targetTick: targetTick + 1, x: 0, z: 1, jump: false },
]);
const revisedAck = await waitMessage(a, (message) => message?.type === "world_v0_batch_ack" && message.batchSeq === revisedSeq,
"revised future intent ack");
if (revisedAck.records?.some((record) => record.status !== "superseded")) {
  throw new Error(`future revision was not superseded: ${JSON.stringify(revisedAck)}`);
}
const revisedRelay = await waitMessage(b, (message) => message?.type === "world_v0_peer_records" && message.batchSeq === revisedSeq,
"revised future intent relay");
if (revisedRelay.records?.some((record) => record.x !== 0 || record.z !== 1)) {
  throw new Error("revised relay did not carry latest future intent");
}

sendBatch(a, aw, duplicateSeq, [
  { targetTick, x: 0, z: 1, jump: true },
  { targetTick: targetTick + 1, x: 0, z: 1, jump: false },
]);
const duplicateAck = await waitMessage(a, (message) => message?.type === "world_v0_batch_ack" && message.batchSeq === duplicateSeq,
"duplicate future intent ack");
if (duplicateAck.records?.some((record) => record.status !== "duplicate_same")) {
  throw new Error(`identical future revision was not idempotent: ${JSON.stringify(duplicateAck)}`);
}
await sleep(120);
if (b.messages.some((message) => message?.type === "world_v0_peer_records" && message.batchSeq === duplicateSeq)) {
  throw new Error("duplicate_same was unnecessarily relayed to peer");
}

sendBatch(a, aw, revisedSeq, [{ targetTick, x: -1, z: 0, jump: false }]);
const staleAck = await waitMessage(a, (message) => message?.type === "world_v0_batch_ack" && message.batchSeq === revisedSeq && message.batchStatus === "stale_batch",
"stale rewind rejection");
if (staleAck.records?.length) throw new Error("stale batch unexpectedly produced record acceptance");
await sleep(120);
const revisedSeqRelays = b.messages.filter((message) => message?.type === "world_v0_peer_records" && message.batchSeq === revisedSeq);
if (revisedSeqRelays.length !== 1) throw new Error("stale rewind created an extra peer relay");

const consumedTarget = await waitMessage(b, (message) => message?.type === "world_v0_consumed" && message.targetTick === targetTick,
"authority consume superseded target", 12_000);
const consumedA = consumedTarget.players?.find((player) => player.netEntityId === aw.selfNetEntityId);
if (!consumedA || consumedA.source !== "fresh" || consumedA.x !== 0 || consumedA.z !== 1 || consumedA.jump !== true) {
  throw new Error(`authority did not consume latest superseded value: ${JSON.stringify(consumedA)}`);
}
const consumedNext = await waitMessage(b, (message) => message?.type === "world_v0_consumed" && message.targetTick === targetTick + 1,
"authority consume superseded follow-up", 12_000);
const consumedNextA = consumedNext.players?.find((player) => player.netEntityId === aw.selfNetEntityId);
if (!consumedNextA || consumedNextA.x !== 0 || consumedNextA.z !== 1 || consumedNextA.jump !== false) {
  throw new Error(`one-shot jump or follow-up future value drifted: ${JSON.stringify(consumedNextA)}`);
}

sendBatch(a, aw, lateSeq, [{ targetTick, x: -1, z: 0, jump: false }]);
const lateAck = await waitMessage(a, (message) => message?.type === "world_v0_batch_ack" && message.batchSeq === lateSeq,
"consumed history immutability ack");
if (lateAck.records?.[0]?.status !== "late") throw new Error(`consumed tick was mutable: ${JSON.stringify(lateAck)}`);
await sleep(100);
if (b.messages.some((message) => message?.type === "world_v0_peer_records" && message.batchSeq === lateSeq)) {
  throw new Error("late consumed-history rewrite was relayed");
}

feedB.stop();
const result = {
  revision: "world-v0-integration-i2-real-do-websocket-v1",
  run: RUN,
  worldEpoch: aw.worldEpoch,
  simBuildId: aw.simBuildId,
  protocolRevision: aw.simulation?.protocolRevision,
  targetTick,
  batches: { initialSeq, revisedSeq, duplicateSeq, lateSeq },
  authority: {
    latestUnconsumedFutureWon: true,
    staleBatchCouldNotRewind: true,
    consumedHistoryImmutable: true,
    oneShotJumpPreserved: true,
  },
  relay: {
    acceptedRelayed: true,
    supersededRelayed: true,
    duplicateNotRelayed: true,
    staleNotRelayed: true,
    lateNotRelayed: true,
  },
  verdict: "WORLD_V0_INTEGRATION_I2_REAL_DO_WEBSOCKET_PASS",
  nonClaim: "This proves v3 future-intent supersession through the local Durable Object/WebSocket authority path. It does not yet prove a scheduler outside requestAnimationFrame, starvation resistance under browser stalls, remote Cloudflare placement, or Owner-visible control feel.",
};
console.log("WORLD_V0_INTEGRATION_I2_REAL_DO_WEBSOCKET", JSON.stringify(result, null, 2));
console.log(result.verdict);

try { a.ws.close(1000, "i2_done"); } catch {}
try { b.ws.close(1000, "i2_done"); } catch {}
await sleep(50);
process.exit(0);
