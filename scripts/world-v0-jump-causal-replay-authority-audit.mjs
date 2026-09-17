const BASE = (process.env.MW_WORLD_V0_CAUSAL_REPLAY_BASE || "http://127.0.0.1:8787").replace(/\/$/, "");
const OUTPUT = process.env.MW_WORLD_V0_CAUSAL_REPLAY_OUTPUT || "world-v0-jump-causal-replay-authority.json";
const EXPECT_PROVENANCE = process.env.MW_WORLD_V0_CAUSAL_EXPECT_PROVENANCE === "1";
const TIMEOUT_MS = 30_000;
const INPUT_LEAD = 8;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function assert(value, message) { if (!value) throw new Error(message); }

function wsUrl(player, run) {
  const url = new URL(BASE.replace(/^http/, "ws") + "/world-v0/ws");
  url.searchParams.set("player", player);
  url.searchParams.set("run", run);
  return url.toString();
}

class Client {
  constructor(player, run) {
    this.player = player;
    this.run = run;
    this.ws = null;
    this.identity = null;
    this.sessionId = null;
    this.netEntityId = null;
    this.batchSeq = 0;
    this.protocolStartTick = null;
    this.boundaryTick = 0;
    this.messages = [];
    this.snapshots = [];
    this.consumed = [];
    this.acks = [];
  }

  async connect() {
    this.ws = new WebSocket(wsUrl(this.player, this.run));
    this.ws.addEventListener("message", async (event) => {
      const raw = typeof event.data === "string" ? event.data : await event.data.text();
      const message = JSON.parse(raw);
      this.messages.push(message);
      if (this.messages.length > 1000) this.messages.shift();
      if (Number.isInteger(message.boundaryTick)) this.boundaryTick = Math.max(this.boundaryTick, message.boundaryTick);
      if (message.type === "world_v0_welcome") {
        this.identity = {
          worldId: message.worldId,
          worldEpoch: message.worldEpoch,
          simBuildId: message.simBuildId,
          clientSimRevision: message.clientSimRevision,
        };
        this.sessionId = message.selfSessionId;
        this.netEntityId = message.selfNetEntityId;
        this.batchSeq = message.resumeLastBatchSeq || 0;
        this.protocolStartTick = message.protocolStartTick ?? null;
        this.send({ type: "world_v0_ready", ...this.identity });
      } else if (message.type === "world_v0_start") {
        this.protocolStartTick = message.protocolStartTick;
      } else if (message.type === "world_v0_snapshot") {
        this.snapshots.push(message);
        if (this.snapshots.length > 300) this.snapshots.shift();
      } else if (message.type === "world_v0_consumed") {
        this.consumed.push(message);
        if (this.consumed.length > 2000) this.consumed.shift();
      } else if (message.type === "world_v0_batch_ack") {
        this.acks.push(message);
        if (this.acks.length > 300) this.acks.shift();
      }
    });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`${this.player} websocket open timeout`)), TIMEOUT_MS);
      this.ws.addEventListener("open", () => { clearTimeout(timer); resolve(); }, { once: true });
      this.ws.addEventListener("error", () => { clearTimeout(timer); reject(new Error(`${this.player} websocket error`)); }, { once: true });
    });
  }

  send(payload) {
    assert(this.ws?.readyState === WebSocket.OPEN, `${this.player} socket not open`);
    this.ws.send(JSON.stringify(payload));
  }

  sendBatch(records) {
    this.batchSeq += 1;
    const batchSeq = this.batchSeq;
    this.send({
      type: "world_v0_input_batch",
      ...this.identity,
      batchSeq,
      records,
    });
    return batchSeq;
  }

  close() {
    try { this.ws?.close(1000, "causal_replay_complete"); } catch {}
  }
}

async function waitFor(predicate, label, timeout = TIMEOUT_MS) {
  const deadline = Date.now() + timeout;
  let value = null;
  while (Date.now() < deadline) {
    value = predicate();
    if (value) return value;
    await sleep(20);
  }
  throw new Error(`${label} timeout`);
}

function selfConsumed(client, targetTick) {
  for (let i = client.consumed.length - 1; i >= 0; i -= 1) {
    const message = client.consumed[i];
    if (message.targetTick !== targetTick) continue;
    const player = (message.players || []).find((entry) => entry.sessionId === client.sessionId);
    if (player) return { ...player, boundaryTick: message.boundaryTick };
  }
  return null;
}

function selfSnapshot(client) {
  for (let i = client.snapshots.length - 1; i >= 0; i -= 1) {
    const message = client.snapshots[i];
    const player = (message.players || []).find((entry) => entry.sessionId === client.sessionId);
    if (player) return { ...player, boundaryTick: message.boundaryTick };
  }
  return null;
}

function ackFor(client, batchSeq) {
  return client.acks.find((ack) => ack.batchSeq === batchSeq) || null;
}

function compactConsumed(value) {
  if (!value) return null;
  return {
    targetTick: value.targetTick,
    boundaryTick: value.boundaryTick,
    jump: Boolean(value.jump),
    jumpSequence: Number.isInteger(value.jumpSequence) ? value.jumpSequence : null,
    jumpApplied: Boolean(value.jumpApplied),
    fresh: Boolean(value.fresh),
    source: value.source,
  };
}

const suffix = Date.now().toString(36).slice(-8);
const run = `causal-${suffix}`;
const a = new Client(`CausalA-${suffix}`.slice(0, 24), run);
const b = new Client(`CausalB-${suffix}`.slice(0, 24), run);
const result = {
  revision: "world-v0-jump-causal-replay-authority-audit-v1",
  generatedAt: new Date().toISOString(),
  expectProvenance: EXPECT_PROVENANCE,
  run,
  verdict: "WORLD_V0_JUMP_CAUSAL_REPLAY_NOT_PROVEN",
};

try {
  await a.connect();
  await b.connect();
  await waitFor(() => a.identity && b.identity && Number.isInteger(a.protocolStartTick) && Number.isInteger(b.protocolStartTick), "protocol start");
  assert(a.identity.worldEpoch === b.identity.worldEpoch, "clients joined different WorldEpochs");
  assert(a.identity.simBuildId === b.identity.simBuildId, "clients joined different SimBuilds");

  await waitFor(() => a.boundaryTick >= a.protocolStartTick + 20, "settled active authority");
  const baselineSnapshot = await waitFor(() => selfSnapshot(a), "baseline authority snapshot");
  const baselineY = baselineSnapshot.position?.[1];
  assert(Number.isFinite(baselineY), `invalid baseline y ${baselineY}`);

  const firstTick = a.boundaryTick + INPUT_LEAD;
  const firstBatch = a.sendBatch([
    { targetTick: firstTick, x: 0, z: 0, jump: true, jumpSequence: 1 },
    { targetTick: firstTick + 1, x: 0, z: 0, jump: false },
  ]);
  const firstAck = await waitFor(() => ackFor(a, firstBatch), "first batch ack");
  assert(firstAck.batchStatus === "accepted_batch", `first batch rejected ${JSON.stringify(firstAck)}`);
  assert(firstAck.records?.length === 2 && firstAck.records.every((record) => record.status === "accepted"),
    `first batch records not accepted ${JSON.stringify(firstAck.records)}`);

  const firstTrue = await waitFor(() => selfConsumed(a, firstTick), "first causal true consumed");
  const firstFalse = await waitFor(() => selfConsumed(a, firstTick + 1), "canonical false consumed");
  assert(firstTrue.jump === true && firstTrue.jumpApplied === true,
    `first causal true did not apply grounded jump ${JSON.stringify(firstTrue)}`);
  assert(firstFalse.jump === false && firstFalse.jumpApplied === false,
    `canonical false leg invalid ${JSON.stringify(firstFalse)}`);
  if (EXPECT_PROVENANCE) {
    assert(firstTrue.jumpSequence === 1,
      `V27 did not preserve first causal sequence ${JSON.stringify(firstTrue)}`);
  } else {
    assert(!Number.isInteger(firstTrue.jumpSequence),
      `baseline unexpectedly preserved jump provenance ${JSON.stringify(firstTrue)}`);
  }

  let sawAirborne = false;
  let airbornePeakY = baselineY;
  const landed = await waitFor(() => {
    const snap = selfSnapshot(a);
    if (!snap || !Array.isArray(snap.position) || !Array.isArray(snap.linearVelocity)) return null;
    const y = snap.position[1];
    const vy = snap.linearVelocity[1];
    airbornePeakY = Math.max(airbornePeakY, y);
    if (y >= baselineY + 0.3) sawAirborne = true;
    if (!sawAirborne) return null;
    if (snap.boundaryTick <= firstTick + 20) return null;
    if (y <= baselineY + 0.08 && Math.abs(vy) <= 0.7) return snap;
    return null;
  }, "physical landing after first jump", 20_000);
  assert(sawAirborne && airbornePeakY >= baselineY + 0.3,
    `airborne phase not proven baseline=${baselineY} peak=${airbornePeakY}`);

  // Deterministic replay of stale causal truth: the same logical press identity is
  // replayed only after the actor has physically landed. A causal authority must
  // reject/dedupe it; the current boolean-edge authority is expected to misread it
  // as a fresh edge after the intervening canonical false.
  const secondTick = Math.max(a.boundaryTick, landed.boundaryTick) + INPUT_LEAD;
  const replayBatch = a.sendBatch([
    { targetTick: secondTick, x: 0, z: 0, jump: true, jumpSequence: 1 },
    { targetTick: secondTick + 1, x: 0, z: 0, jump: false },
  ]);
  const replayAck = await waitFor(() => ackFor(a, replayBatch), "replayed batch ack");
  assert(replayAck.batchStatus === "accepted_batch", `replay batch rejected ${JSON.stringify(replayAck)}`);
  assert(replayAck.records?.length === 2 && replayAck.records.every((record) => record.status === "accepted"),
    `replay records not accepted ${JSON.stringify(replayAck.records)}`);

  const replayTrue = await waitFor(() => selfConsumed(a, secondTick), "replayed causal true consumed");
  const replayFalse = await waitFor(() => selfConsumed(a, secondTick + 1), "replayed false consumed");
  if (EXPECT_PROVENANCE) {
    assert(replayTrue.jumpSequence === 1,
      `V27 did not preserve replayed causal sequence ${JSON.stringify(replayTrue)}`);
  } else {
    assert(!Number.isInteger(replayTrue.jumpSequence),
      `baseline unexpectedly preserved replay provenance ${JSON.stringify(replayTrue)}`);
  }
  assert(replayTrue.jump === true, `replay true was not canonical ${JSON.stringify(replayTrue)}`);
  assert(replayTrue.jumpApplied === true,
    `same causal replay did not reproduce delayed landing impulse ${JSON.stringify(replayTrue)}`);
  assert(replayFalse.jump === false, `replay false leg invalid ${JSON.stringify(replayFalse)}`);

  Object.assign(result, {
    verdict: EXPECT_PROVENANCE
      ? "WORLD_V0_SAME_CAUSAL_SEQUENCE_DOUBLE_APPLY_REPRODUCED"
      : "WORLD_V0_BOOLEAN_EDGE_DOUBLE_APPLY_REPRODUCED",
    identity: a.identity,
    actorSessionId: a.sessionId,
    netEntityId: a.netEntityId,
    baselineY,
    airbornePeakY,
    landed: {
      boundaryTick: landed.boundaryTick,
      positionY: landed.position[1],
      velocityY: landed.linearVelocity[1],
    },
    firstBatchAck: firstAck,
    replayBatchAck: replayAck,
    firstTrue: compactConsumed(firstTrue),
    firstFalse: compactConsumed(firstFalse),
    replayTrue: compactConsumed(replayTrue),
    replayFalse: compactConsumed(replayFalse),
    sameWireJumpSequence: 1,
    causalFinding: EXPECT_PROVENANCE
      ? "The authority applied jumpSequence=1 twice, separated by canonical false and a proven physical landing."
      : "The baseline authority applied the same synthetic boolean replay twice; it has no causal identity with which to distinguish replay from a fresh press.",
  });
  console.log(JSON.stringify(result, null, 2));
  console.log(result.verdict);
} catch (error) {
  result.error = error instanceof Error ? error.stack || error.message : String(error);
  result.lastBoundaryTick = a.boundaryTick;
  result.lastMessagesA = a.messages.slice(-20);
  result.lastMessagesB = b.messages.slice(-20);
  console.error(result.error);
  process.exitCode = 1;
} finally {
  writeFileSyncCompat(OUTPUT, JSON.stringify(result, null, 2));
  a.close();
  b.close();
}

function writeFileSyncCompat(path, text) {
  // Keep this audit dependency-free and Node 22 friendly.
  const fs = requireCompat();
  fs.writeFileSync(path, text);
}

function requireCompat() {
  // ESM-safe lazy bridge without adding repository dependencies.
  return globalThis.__mwFsCompat;
}
