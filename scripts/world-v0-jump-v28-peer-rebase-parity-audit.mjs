import { writeFileSync } from "node:fs";

const BASE = (process.env.MW_WORLD_V0_V28_PARITY_BASE || "http://127.0.0.1:8796").replace(/\/$/, "");
const OUTPUT = process.env.MW_WORLD_V0_V28_PARITY_OUTPUT || "world-v0-jump-v28-peer-rebase-parity.json";
const TIMEOUT_MS = 30000;
const SEQUENCE = 41;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function assert(value, message) { if (!value) throw new Error(message); }

function socketUrl(player, run, resumeToken = null) {
  const url = new URL(BASE.replace(/^http/, "ws") + "/world-v0/ws");
  url.searchParams.set("player", player);
  url.searchParams.set("run", run);
  if (resumeToken) url.searchParams.set("resume", resumeToken);
  return url.toString();
}

class Client {
  constructor(player, run, resumeToken = null) {
    this.player = player;
    this.run = run;
    this.requestedResumeToken = resumeToken;
    this.ws = null;
    this.identity = null;
    this.welcome = null;
    this.sessionId = null;
    this.netEntityId = null;
    this.resumeToken = null;
    this.batchSeq = 0;
    this.protocolStartTick = null;
    this.boundaryTick = 0;
    this.acks = [];
    this.consumed = [];
    this.peerRecords = [];
  }

  async connect() {
    this.ws = new WebSocket(socketUrl(this.player, this.run, this.requestedResumeToken));
    this.ws.addEventListener("message", async (event) => {
      const raw = typeof event.data === "string" ? event.data : await event.data.text();
      const message = JSON.parse(raw);
      if (Number.isInteger(message.boundaryTick)) this.boundaryTick = Math.max(this.boundaryTick, message.boundaryTick);
      if (Number.isInteger(message.relayBoundaryTick)) this.boundaryTick = Math.max(this.boundaryTick, message.relayBoundaryTick);
      if (message.type === "world_v0_welcome") {
        this.welcome = message;
        this.identity = {
          worldId: message.worldId,
          worldEpoch: message.worldEpoch,
          simBuildId: message.simBuildId,
          clientSimRevision: message.clientSimRevision,
        };
        this.sessionId = message.selfSessionId;
        this.netEntityId = message.selfNetEntityId;
        this.resumeToken = message.resumeToken;
        this.batchSeq = message.resumeLastBatchSeq || 0;
        this.protocolStartTick = message.protocolStartTick ?? null;
        const boundary = message.state?.boundaryTick ?? message.rebaseSeed?.boundaryTick;
        if (Number.isInteger(boundary)) this.boundaryTick = Math.max(this.boundaryTick, boundary);
        this.send({ type: "world_v0_ready", ...this.identity });
      } else if (message.type === "world_v0_start") {
        this.protocolStartTick = message.protocolStartTick;
      } else if (message.type === "world_v0_batch_ack") {
        this.acks.push(message);
      } else if (message.type === "world_v0_consumed") {
        this.consumed.push(message);
        if (this.consumed.length > 1200) this.consumed.shift();
      } else if (message.type === "world_v0_peer_records") {
        this.peerRecords.push(message);
        if (this.peerRecords.length > 500) this.peerRecords.shift();
      }
    });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(this.player + " websocket open timeout")), TIMEOUT_MS);
      this.ws.addEventListener("open", () => { clearTimeout(timer); resolve(); }, { once: true });
      this.ws.addEventListener("error", () => { clearTimeout(timer); reject(new Error(this.player + " websocket error")); }, { once: true });
    });
  }

  send(payload) {
    assert(this.ws?.readyState === WebSocket.OPEN, this.player + " socket not open");
    this.ws.send(JSON.stringify(payload));
  }

  sendBatch(records) {
    this.batchSeq += 1;
    const batchSeq = this.batchSeq;
    this.send({ type: "world_v0_input_batch", ...this.identity, batchSeq, records });
    return batchSeq;
  }

  close(reason = "v28_peer_rebase_probe") {
    try { this.ws?.close(1000, reason); } catch {}
  }
}

async function waitFor(predicate, label, timeout = TIMEOUT_MS) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = predicate();
    if (value) return value;
    await sleep(10);
  }
  throw new Error(label + " timeout");
}

function findAck(client, batchSeq) {
  return client.acks.find((value) => value.batchSeq === batchSeq) || null;
}

function consumedPlayer(client, targetTick, sessionId) {
  for (let i = client.consumed.length - 1; i >= 0; i -= 1) {
    const message = client.consumed[i];
    if (message.targetTick !== targetTick) continue;
    const player = (message.players || []).find((value) => value.sessionId === sessionId);
    if (player) return { ...player, boundaryTick: message.boundaryTick };
  }
  return null;
}

function peerRecord(client, targetTick, senderSessionId) {
  for (let i = client.peerRecords.length - 1; i >= 0; i -= 1) {
    const message = client.peerRecords[i];
    if (message.senderSessionId !== senderSessionId) continue;
    const record = (message.records || []).find((value) => value.targetTick === targetTick);
    if (record) return { ...record, relayBoundaryTick: message.relayBoundaryTick };
  }
  return null;
}

const suffix = Date.now().toString(36).slice(-8);
const run = "v28par-" + suffix;
const playerA = ("ParityA-" + suffix).slice(0, 24);
const playerB = ("ParityB-" + suffix).slice(0, 24);
let first = new Client(playerA, run);
const peer = new Client(playerB, run);
let resumed = null;
const result = {
  revision: "world-v0-jump-v28-peer-rebase-parity-audit-v1",
  generatedAt: new Date().toISOString(),
  verdict: "WORLD_V0_JUMP_V28_PEER_REBASE_PARITY_FAIL",
};

try {
  await first.connect();
  await peer.connect();
  await waitFor(
    () => first.welcome && peer.welcome && Number.isInteger(first.protocolStartTick) && Number.isInteger(peer.protocolStartTick),
    "protocol start",
  );
  await waitFor(() => first.boundaryTick >= first.protocolStartTick + 24, "active authority");

  const original = {
    worldEpoch: first.identity.worldEpoch,
    sessionId: first.sessionId,
    netEntityId: first.netEntityId,
    resumeToken: first.resumeToken,
  };
  assert(original.resumeToken, "initial welcome missing resume token");

  const targetTick = first.boundaryTick + 8;
  const batchSeq = first.sendBatch([
    { targetTick, x: 0, z: 0, jump: true, jumpSequence: SEQUENCE },
  ]);
  const acceptance = await waitFor(() => findAck(first, batchSeq), "jump acceptance");
  assert(acceptance.batchStatus === "accepted_batch", "batch rejected " + JSON.stringify(acceptance));
  assert(
    acceptance.records?.length === 1 &&
    (acceptance.records[0].status === "accepted" || acceptance.records[0].status === "superseded"),
    "jump record not accepted " + JSON.stringify(acceptance.records),
  );

  const relayed = await waitFor(
    () => peerRecord(peer, targetTick, original.sessionId),
    "peer causal relay",
  );
  assert(relayed.jump === true, "peer relay lost jump intent " + JSON.stringify(relayed));
  assert(relayed.jumpSequence === SEQUENCE, "peer relay lost causal sequence " + JSON.stringify(relayed));

  const canonical = await waitFor(
    () => consumedPlayer(first, targetTick, original.sessionId) || consumedPlayer(peer, targetTick, original.sessionId),
    "canonical causal consumption",
    15000,
  );
  assert(canonical.jump === true, "canonical jump intent missing " + JSON.stringify(canonical));
  assert(canonical.jumpSequence === SEQUENCE, "canonical sequence drift " + JSON.stringify(canonical));

  first.close();
  await sleep(30);

  resumed = new Client(playerA, run, original.resumeToken);
  await resumed.connect();
  const welcome = await waitFor(() => resumed.welcome, "resumed welcome");
  assert(welcome.resumed === true, "resume not accepted " + JSON.stringify({ resumed: welcome.resumed }));
  assert(resumed.sessionId === original.sessionId, "ActorSession drift");
  assert(resumed.netEntityId === original.netEntityId, "NetEntity drift");
  assert(resumed.identity.worldEpoch === original.worldEpoch, "WorldEpoch drift");

  const seed = welcome.rebaseSeed;
  assert(seed && Number.isInteger(seed.boundaryTick), "resume rebase seed missing " + JSON.stringify(seed));
  assert(Array.isArray(seed.jumpCausalHighWater), "jump causal rebase watermark missing " + JSON.stringify(seed));
  const selfWatermark = seed.jumpCausalHighWater.find((entry) => entry.sessionId === original.sessionId);
  assert(selfWatermark, "self jump causal watermark missing " + JSON.stringify(seed.jumpCausalHighWater));
  assert(
    Number.isInteger(selfWatermark.lastConsumedJumpSequence) &&
    selfWatermark.lastConsumedJumpSequence >= SEQUENCE,
    "rebase seed lost consumed causal watermark " + JSON.stringify(selfWatermark),
  );

  Object.assign(result, {
    verdict: "WORLD_V0_JUMP_V28_PEER_REBASE_PARITY_PASS",
    original,
    targetTick,
    sequence: SEQUENCE,
    relayed: {
      targetTick: relayed.targetTick,
      jump: relayed.jump,
      jumpSequence: relayed.jumpSequence,
      relayBoundaryTick: relayed.relayBoundaryTick,
    },
    canonical: {
      boundaryTick: canonical.boundaryTick,
      jump: canonical.jump,
      jumpSequence: canonical.jumpSequence,
      jumpApplied: canonical.jumpApplied,
      source: canonical.source,
      fresh: canonical.fresh,
    },
    resumed: {
      boundaryTick: seed.boundaryTick,
      resumeLastJumpSequence: welcome.resumeLastJumpSequence,
      rebaseRevision: seed.revision,
      jumpCausalHighWater: seed.jumpCausalHighWater,
      selfLastConsumedJumpSequence: selfWatermark.lastConsumedJumpSequence,
    },
  });
  console.log(JSON.stringify(result, null, 2));
  console.log(result.verdict);
} catch (error) {
  result.error = error instanceof Error ? error.stack || error.message : String(error);
  console.error(result.error);
  process.exitCode = 1;
} finally {
  writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
  try { first.close(); } catch {}
  try { resumed?.close(); } catch {}
  try { peer.close(); } catch {}
}
