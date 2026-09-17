import { writeFileSync } from "node:fs";

const BASE = (process.env.MW_WORLD_V0_V28_BASE || "http://127.0.0.1:8787").replace(/\/$/, "");
const OUTPUT = process.env.MW_WORLD_V0_V28_OUTPUT || "world-v0-jump-causal-dedupe-v28.json";
const TIMEOUT_MS = 30_000;
const INPUT_LEAD = 8;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function assert(value, message) { if (!value) throw new Error(message); }

function socketUrl(player, run) {
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
    this.snapshots = [];
    this.consumed = [];
    this.acks = [];
    this.messages = [];
  }
  async connect() {
    this.ws = new WebSocket(socketUrl(this.player, this.run));
    this.ws.addEventListener("message", async (event) => {
      const raw = typeof event.data === "string" ? event.data : await event.data.text();
      const message = JSON.parse(raw);
      this.messages.push(message);
      if (this.messages.length > 500) this.messages.shift();
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
    this.send({ type: "world_v0_input_batch", ...this.identity, batchSeq, records });
    return batchSeq;
  }
  close() { try { this.ws?.close(1000, "v28_audit_complete"); } catch {} }
}

async function waitFor(predicate, label, timeout = TIMEOUT_MS) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = predicate();
    if (value) return value;
    await sleep(20);
  }
  throw new Error(`${label} timeout`);
}

function ack(client, batchSeq) {
  return client.acks.find((value) => value.batchSeq === batchSeq) || null;
}

function consumed(client, targetTick) {
  for (let i = client.consumed.length - 1; i >= 0; i -= 1) {
    const message = client.consumed[i];
    if (message.targetTick !== targetTick) continue;
    const player = (message.players || []).find((value) => value.sessionId === client.sessionId);
    if (player) return { ...player, boundaryTick: message.boundaryTick };
  }
  return null;
}

function snapshot(client) {
  for (let i = client.snapshots.length - 1; i >= 0; i -= 1) {
    const message = client.snapshots[i];
    const player = (message.players || []).find((value) => value.sessionId === client.sessionId);
    if (player) return { ...player, boundaryTick: message.boundaryTick };
  }
  return null;
}

async function sendEvent(client, sequence) {
  const targetTick = client.boundaryTick + INPUT_LEAD;
  const batchSeq = client.sendBatch([
    { targetTick, x: 0, z: 0, jump: true, jumpSequence: sequence },
    { targetTick: targetTick + 1, x: 0, z: 0, jump: false },
  ]);
  const acceptance = await waitFor(() => ack(client, batchSeq), `seq=${sequence} batch ack`);
  assert(acceptance.batchStatus === "accepted_batch", `seq=${sequence} batch rejected ${JSON.stringify(acceptance)}`);
  assert(acceptance.records?.length === 2 && acceptance.records.every((record) => record.status === "accepted"),
    `seq=${sequence} records not accepted ${JSON.stringify(acceptance.records)}`);
  const trueRecord = await waitFor(() => consumed(client, targetTick), `seq=${sequence} true consumed`);
  const falseRecord = await waitFor(() => consumed(client, targetTick + 1), `seq=${sequence} false consumed`);
  assert(trueRecord.jump === true, `seq=${sequence} true not canonical ${JSON.stringify(trueRecord)}`);
  assert(trueRecord.jumpSequence === sequence,
    `seq=${sequence} provenance missing ${JSON.stringify(trueRecord)}`);
  assert(falseRecord.jump === false, `seq=${sequence} false not canonical ${JSON.stringify(falseRecord)}`);
  return { targetTick, acceptance, trueRecord, falseRecord };
}

async function waitLanding(client, baselineY, afterTick) {
  let sawAirborne = false;
  let peakY = baselineY;
  const landed = await waitFor(() => {
    const value = snapshot(client);
    if (!value || !Array.isArray(value.position) || !Array.isArray(value.linearVelocity)) return null;
    const y = value.position[1];
    const vy = value.linearVelocity[1];
    peakY = Math.max(peakY, y);
    if (y >= baselineY + 0.3) sawAirborne = true;
    if (!sawAirborne || value.boundaryTick <= afterTick + 20) return null;
    return y <= baselineY + 0.08 && Math.abs(vy) <= 0.7 ? value : null;
  }, "physical landing", 20_000);
  assert(sawAirborne && peakY >= baselineY + 0.3, `airborne phase not proven baseline=${baselineY} peak=${peakY}`);
  return { landed, peakY };
}

function compact(value) {
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
const run = `v28-${suffix}`;
const a = new Client(`V28A-${suffix}`.slice(0, 24), run);
const b = new Client(`V28B-${suffix}`.slice(0, 24), run);
const result = {
  revision: "world-v0-jump-causal-dedupe-v28-audit-v1",
  generatedAt: new Date().toISOString(),
  run,
  verdict: "WORLD_V0_JUMP_CAUSAL_DEDUPE_V28_FAIL",
};

try {
  await a.connect();
  await b.connect();
  await waitFor(() => a.identity && b.identity && Number.isInteger(a.protocolStartTick) && Number.isInteger(b.protocolStartTick), "protocol start");
  assert(a.identity.worldEpoch === b.identity.worldEpoch, "different WorldEpochs");
  await waitFor(() => a.boundaryTick >= a.protocolStartTick + 20, "settled active authority");
  const base = await waitFor(() => snapshot(a), "baseline snapshot");
  const baselineY = base.position?.[1];
  assert(Number.isFinite(baselineY), `invalid baseline y ${baselineY}`);

  const first = await sendEvent(a, 1);
  assert(first.trueRecord.jumpApplied === true,
    `first causal event did not apply ${JSON.stringify(first.trueRecord)}`);
  const firstLanding = await waitLanding(a, baselineY, first.targetTick);

  const replay = await sendEvent(a, 1);
  assert(replay.trueRecord.jumpApplied === false,
    `same causal event replay applied a second impulse ${JSON.stringify(replay.trueRecord)}`);

  await waitFor(() => a.boundaryTick >= replay.targetTick + 5, "post-replay neutral settle");
  const fresh = await sendEvent(a, 2);
  assert(fresh.trueRecord.jumpApplied === true,
    `fresh causal event was suppressed ${JSON.stringify(fresh.trueRecord)}`);

  Object.assign(result, {
    verdict: "WORLD_V0_JUMP_CAUSAL_DEDUPE_V28_PASS",
    identity: a.identity,
    actorSessionId: a.sessionId,
    baselineY,
    airbornePeakY: firstLanding.peakY,
    landedBoundaryTick: firstLanding.landed.boundaryTick,
    first: compact(first.trueRecord),
    replaySameSequence: compact(replay.trueRecord),
    freshNextSequence: compact(fresh.trueRecord),
  });
  console.log(JSON.stringify(result, null, 2));
  console.log(result.verdict);
} catch (error) {
  result.error = error instanceof Error ? error.stack || error.message : String(error);
  result.lastBoundaryTick = a.boundaryTick;
  result.lastMessagesA = a.messages.slice(-20);
  console.error(result.error);
  process.exitCode = 1;
} finally {
  writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
  a.close();
  b.close();
}
