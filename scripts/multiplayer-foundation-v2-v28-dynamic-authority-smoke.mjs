const BASE = (process.env.MW_MF6_BASE || "http://127.0.0.1:8787").replace(/\/$/, "");
const WS_BASE = BASE.replace(/^http/, "ws");
const RUN = process.env.MW_MF6_RUN || `mf6-${Date.now().toString(36)}`;
const TIMEOUT_MS = 30_000;
const EXPECTED_ACTORS = 6;
const EXPECTED_PROPS = 12;
const STATE_COMPONENTS = 13;
const EXPECTED_GUARD_HEX = (EXPECTED_ACTORS + EXPECTED_PROPS) * STATE_COMPONENTS * 8;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const assert = (value, message) => { if (!value) throw new Error(message); };

async function waitFor(fn, label, timeout = TIMEOUT_MS) {
  const deadline = Date.now() + timeout;
  let last = null;
  while (Date.now() < deadline) {
    try {
      last = await fn();
      if (last) return last;
    } catch (error) {
      last = error;
    }
    await sleep(25);
  }
  throw new Error(`${label} timeout · last=${last instanceof Error ? last.message : JSON.stringify(last)}`);
}

await waitFor(async () => {
  try { return (await fetch(`${BASE}/api/ping`, { cache: "no-store" })).ok; }
  catch { return false; }
}, "worker readiness", 20_000);

function makePeer(index) {
  const playerId = `mf6-p${index}`;
  const ws = new WebSocket(`${WS_BASE}/world-v0/ws?player=${encodeURIComponent(playerId)}&run=${encodeURIComponent(RUN)}&lifecycle=mf6`);
  const peer = {
    index,
    playerId,
    ws,
    messages: [],
    welcome: null,
    identity: null,
    topology: null,
    latestBoundary: 0,
    nextBatchSeq: 1,
    closed: false,
    errors: [],
  };
  ws.addEventListener("message", (event) => {
    try {
      const message = JSON.parse(String(event.data));
      peer.messages.push(message);
      if (peer.messages.length > 2000) peer.messages.shift();
      if (Number.isInteger(message.boundaryTick)) peer.latestBoundary = Math.max(peer.latestBoundary, message.boundaryTick);
      if (Number.isInteger(message.state?.boundaryTick)) peer.latestBoundary = Math.max(peer.latestBoundary, message.state.boundaryTick);
      const topology = message.topology ?? message.state?.topology ?? null;
      if (topology && Number.isInteger(topology.revision) && typeof topology.digest === "string") {
        peer.topology = topology;
      }
      if (message.type === "world_v0_welcome") {
        peer.welcome = message;
        peer.identity = {
          worldId: message.worldId,
          worldEpoch: message.worldEpoch,
          simBuildId: message.simBuildId,
          clientSimRevision: message.clientSimRevision,
        };
      }
      if (message.type === "world_v0_error") peer.errors.push(message);
    } catch (error) {
      peer.errors.push({ type: "parse_error", error: String(error) });
    }
  });
  ws.addEventListener("close", () => { peer.closed = true; });
  return peer;
}

function topologyIdentity(peer, override = null) {
  const topology = override ?? peer.topology;
  assert(topology, `${peer.playerId}: missing topology`);
  return { topologyRevision: topology.revision, topologyDigest: topology.digest };
}

function sendReady(peer) {
  peer.ws.send(JSON.stringify({
    type: "world_v0_ready",
    ...peer.identity,
    ...topologyIdentity(peer),
  }));
}

function sendBatch(peer, targetTick, vector, topologyOverride = null, jump = false) {
  const batchSeq = peer.nextBatchSeq++;
  const jumpSequence = jump ? batchSeq : undefined;
  peer.ws.send(JSON.stringify({
    type: "world_v0_input_batch",
    ...peer.identity,
    ...topologyIdentity(peer, topologyOverride),
    batchSeq,
    records: [
      { targetTick, x: vector[0], z: vector[1], jump, ...(jump ? { jumpSequence } : {}) },
      { targetTick: targetTick + 1, x: vector[0], z: vector[1], jump: false },
    ],
  }));
  return batchSeq;
}

async function openPeer(index) {
  const peer = makePeer(index);
  await waitFor(() => peer.welcome || false, `peer ${index} welcome`);
  assert(peer.welcome.resumed === false, `peer ${index} unexpectedly resumed`);
  assert(peer.welcome.topology?.modeRevision === "multiplayer-foundation-v2-v28-dynamic-composition-r0",
    `peer ${index} mode revision ${peer.welcome.topology?.modeRevision}`);
  return peer;
}

const peers = [];
const evidence = {
  verdict: "MF6_V28_DYNAMIC_AUTHORITY_FAIL",
  run: RUN,
  generatedAt: new Date().toISOString(),
};

try {
  const first = await openPeer(0);
  peers.push(first);
  assert(first.welcome.topology.revision === 1, `first topology revision ${first.welcome.topology.revision}`);
  sendReady(first);
  await waitFor(() => first.messages.find((m) => m.type === "world_v0_ready_ack") || false, "first ready ack");
  const firstStart = await waitFor(() => first.messages.find((m) => m.type === "world_v0_start") || false, "first protocol start");
  assert(firstStart.worldEpoch === first.welcome.worldEpoch, "first start epoch drift");
  await waitFor(() => first.latestBoundary >= firstStart.protocolStartTick + 4, "first actor canonical progression");

  const epoch = first.welcome.worldEpoch;
  const topologyHistory = [first.welcome.topology];

  for (let index = 1; index < EXPECTED_ACTORS; index += 1) {
    const peer = await openPeer(index);
    peers.push(peer);
    assert(peer.welcome.worldEpoch === epoch, `peer ${index} changed WorldEpoch`);
    const expectedRevision = index + 1;
    await waitFor(
      () => peers.every((candidate) => candidate.topology?.revision === expectedRevision) || false,
      `all peers topology revision ${expectedRevision}`,
    );
    const topology = peer.topology;
    assert(topology.actors.length === expectedRevision, `rev ${expectedRevision} actor count ${topology.actors.length}`);
    assert(topology.entityOrder.length === expectedRevision + EXPECTED_PROPS,
      `rev ${expectedRevision} entity count ${topology.entityOrder.length}`);
    topologyHistory.push(topology);
    sendReady(peer);
    await waitFor(
      () => peer.messages.find((m) => m.type === "world_v0_ready_ack" && m.topology?.revision === expectedRevision) || false,
      `peer ${index} ready ack`,
    );
  }

  const finalTopology = peers[0].topology;
  assert(finalTopology.revision === EXPECTED_ACTORS, `final topology revision ${finalTopology.revision}`);
  assert(finalTopology.actors.length === EXPECTED_ACTORS, "final actor count mismatch");
  assert(finalTopology.entityOrder.length === EXPECTED_ACTORS + EXPECTED_PROPS, "final entity coverage mismatch");
  assert(new Set(finalTopology.actors.map((a) => a.netEntityId)).size === EXPECTED_ACTORS, "duplicate actor entity identity");
  assert(JSON.stringify(finalTopology.actors.map((a) => a.netEntityId)) === JSON.stringify(
    Array.from({ length: EXPECTED_ACTORS }, (_, i) => `actor:${i}`)
  ), `unexpected actor identities ${JSON.stringify(finalTopology.actors)}`);

  await waitFor(
    () => peers.every((peer) => peer.messages.some((m) =>
      m.type === "world_v0_snapshot" &&
      m.topology?.revision === EXPECTED_ACTORS &&
      m.players?.length === EXPECTED_ACTORS &&
      typeof m.stateGuard?.packed === "string" &&
      m.stateGuard.packed.length === EXPECTED_GUARD_HEX
    )) || false,
    "six-actor snapshots",
  );

  const staleTopology = topologyHistory[topologyHistory.length - 2];
  const staleTarget = Math.max(...peers.map((p) => p.latestBoundary)) + 8;
  const staleBatchSeq = sendBatch(peers[0], staleTarget, [0.2, 0], staleTopology);
  const staleError = await waitFor(
    () => peers[0].messages.find((m) =>
      m.type === "world_v0_error" &&
      m.error === "topology_identity_mismatch" &&
      m.receivedTopology?.revision === staleTopology.revision
    ) || false,
    "stale topology rejection",
  );
  assert(staleError.expectedTopology?.revision === EXPECTED_ACTORS, "stale topology expected revision mismatch");

  const vectors = [
    [0.35, 0],
    [-0.35, 0],
    [0, 0.35],
    [0, -0.35],
    [0.25, 0.25],
    [-0.25, -0.25],
  ];
  const target = Math.max(...peers.map((p) => p.latestBoundary)) + 10;
  const batches = peers.map((peer, index) => ({
    peer,
    batchSeq: sendBatch(peer, target, vectors[index], null, index === 0),
  }));

  for (const { peer, batchSeq } of batches) {
    const ack = await waitFor(
      () => peer.messages.find((m) => m.type === "world_v0_batch_ack" && m.batchSeq === batchSeq) || false,
      `${peer.playerId} batch ack`,
    );
    assert(ack.batchStatus === "accepted_batch", `${peer.playerId} batch status ${ack.batchStatus}`);
    assert(ack.records?.length === 2, `${peer.playerId} ack record count`);
    assert(ack.records.every((r) => r.status === "accepted" || r.status === "superseded"),
      `${peer.playerId} record status ${JSON.stringify(ack.records)}`);
  }

  const consumed = await waitFor(
    () => peers[0].messages.find((m) =>
      m.type === "world_v0_consumed" &&
      m.targetTick >= target &&
      m.players?.length === EXPECTED_ACTORS
    ) || false,
    "six-actor canonical consumption",
  );
  assert(new Set(consumed.players.map((p) => p.netEntityId)).size === EXPECTED_ACTORS, "consumed actor identity coverage");
  assert(consumed.players.every((p) => p.source === "fresh"), `non-fresh six-actor consumption ${JSON.stringify(consumed.players)}`);
  const firstConsumed = consumed.players.find((p) => p.netEntityId === "actor:0");
  assert(Number.isInteger(firstConsumed?.jumpSequence), "actor:0 jump causal identity missing from consumption");

  const guardByBoundary = new Map();
  const deadline = Date.now() + TIMEOUT_MS;
  let sharedGuard = null;
  while (Date.now() < deadline && !sharedGuard) {
    for (const peer of peers) {
      for (const message of peer.messages) {
        if (
          message.type !== "world_v0_snapshot" ||
          message.boundaryTick < target + 2 ||
          message.topology?.revision !== EXPECTED_ACTORS ||
          typeof message.stateGuard?.packed !== "string"
        ) continue;
        let entry = guardByBoundary.get(message.boundaryTick);
        if (!entry) {
          entry = new Map();
          guardByBoundary.set(message.boundaryTick, entry);
        }
        entry.set(peer.index, message.stateGuard.packed);
        if (entry.size === EXPECTED_ACTORS) {
          const values = [...entry.values()];
          if (new Set(values).size === 1) {
            sharedGuard = { boundaryTick: message.boundaryTick, packed: values[0] };
            break;
          }
        }
      }
      if (sharedGuard) break;
    }
    if (!sharedGuard) await sleep(25);
  }
  assert(sharedGuard, "no shared six-peer exact authority guard sample");
  assert(sharedGuard.packed.length === EXPECTED_GUARD_HEX, `shared guard length ${sharedGuard.packed.length}`);

  const seventh = new WebSocket(`${WS_BASE}/world-v0/ws?player=mf6-overflow&run=${encodeURIComponent(RUN)}&lifecycle=mf6`);
  let seventhOpened = false;
  let seventhFailed = false;
  seventh.addEventListener("open", () => { seventhOpened = true; });
  seventh.addEventListener("error", () => { seventhFailed = true; });
  seventh.addEventListener("close", () => { if (!seventhOpened) seventhFailed = true; });
  await waitFor(() => seventhFailed || seventhOpened, "seventh admission result", 8_000);
  assert(!seventhOpened, "seventh actor unexpectedly admitted");

  Object.assign(evidence, {
    verdict: "MF6_V28_DYNAMIC_AUTHORITY_PASS",
    worldEpoch: epoch,
    protocolStartTick: firstStart.protocolStartTick,
    topologyRevisions: topologyHistory.map((t) => ({
      revision: t.revision,
      digest: t.digest,
      actors: t.actors.length,
      entities: t.entityOrder.length,
    })),
    finalTopology: {
      revision: finalTopology.revision,
      digest: finalTopology.digest,
      actors: finalTopology.actors.map((a) => a.netEntityId),
      entities: finalTopology.entityOrder.length,
    },
    staleTopologyRejected: {
      sentRevision: staleTopology.revision,
      expectedRevision: staleError.expectedTopology.revision,
      staleBatchSeq,
    },
    acceptedBatches: batches.map(({ peer, batchSeq }) => ({ playerId: peer.playerId, batchSeq })),
    canonicalConsumption: {
      targetTick: consumed.targetTick,
      actorCount: consumed.players.length,
      sources: [...new Set(consumed.players.map((p) => p.source))],
      actor0JumpSequence: firstConsumed.jumpSequence,
    },
    sharedGuard: {
      boundaryTick: sharedGuard.boundaryTick,
      hexLength: sharedGuard.packed.length,
    },
    capacity: { admitted: EXPECTED_ACTORS, seventhRejected: true },
    nonClaim: "Local Workerd/WebSocket authority composition only. No browser self+N, churn/retirement, impairment, deployed-edge, performance, or human 3-6 qualification is claimed.",
  });
  console.log("MF6_V28_DYNAMIC_AUTHORITY_EVIDENCE", JSON.stringify(evidence));
  console.log(evidence.verdict);
} finally {
  for (const peer of peers) {
    try { peer.ws.close(1000, "mf6_probe_done"); } catch {}
  }
  await sleep(100);
}
