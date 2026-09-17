import { writeFileSync } from "node:fs";

const BASE = (process.env.MW_WORLD_V0_PENDING_RESUME_BASE || "http://127.0.0.1:8787").replace(/\/$/, "");
const OUTPUT = process.env.MW_WORLD_V0_PENDING_RESUME_OUTPUT || "world-v0-jump-pending-resume-highwater-v28.json";
const TIMEOUT_MS = 30_000;
const FUTURE_TICKS = 30;
const SEQUENCE = 7;

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
  }

  async connect() {
    this.ws = new WebSocket(socketUrl(this.player, this.run, this.requestedResumeToken));
    this.ws.addEventListener("message", async (event) => {
      const raw = typeof event.data === "string" ? event.data : await event.data.text();
      const message = JSON.parse(raw);
      if (Number.isInteger(message.boundaryTick)) this.boundaryTick = Math.max(this.boundaryTick, message.boundaryTick);
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
        const welcomeBoundary = message.state?.boundaryTick ?? message.rebaseSeed?.boundaryTick;
        if (Number.isInteger(welcomeBoundary)) this.boundaryTick = Math.max(this.boundaryTick, welcomeBoundary);
        this.send({ type: "world_v0_ready", ...this.identity });
      } else if (message.type === "world_v0_start") {
        this.protocolStartTick = message.protocolStartTick;
      } else if (message.type === "world_v0_batch_ack") {
        this.acks.push(message);
      } else if (message.type === "world_v0_consumed") {
        this.consumed.push(message);
        if (this.consumed.length > 1000) this.consumed.shift();
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

  close() {
    try { this.ws?.close(1000, "pending_highwater_probe"); } catch {}
  }
}

async function waitFor(predicate, label, timeout = TIMEOUT_MS) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = predicate();
    if (value) return value;
    await sleep(10);
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

const suffix = Date.now().toString(36).slice(-8);
const run = `pending-${suffix}`;
const playerA = `PendingA-${suffix}`.slice(0, 24);
const playerB = `PendingB-${suffix}`.slice(0, 24);
let first = new Client(playerA, run);
const peer = new Client(playerB, run);
let resumed = null;
const result = {
  revision: "world-v0-jump-pending-resume-highwater-v28-audit-v1",
  generatedAt: new Date().toISOString(),
  verdict: "WORLD_V0_JUMP_PENDING_RESUME_HIGHWATER_V28_FAIL",
};

try {
  await first.connect();
  await peer.connect();
  await waitFor(() => first.welcome && peer.welcome && Number.isInteger(first.protocolStartTick) && Number.isInteger(peer.protocolStartTick), "protocol start");
  await waitFor(() => first.boundaryTick >= first.protocolStartTick + 20, "active authority");

  const original = {
    worldEpoch: first.identity.worldEpoch,
    sessionId: first.sessionId,
    netEntityId: first.netEntityId,
    resumeToken: first.resumeToken,
  };
  assert(original.resumeToken, "initial welcome missing resume token");

  const targetTick = first.boundaryTick + FUTURE_TICKS;
  const batchSeq = first.sendBatch([
    { targetTick, x: 0, z: 0, jump: true, jumpSequence: SEQUENCE },
  ]);
  const acceptance = await waitFor(() => ack(first, batchSeq), "future jump acceptance");
  assert(acceptance.batchStatus === "accepted_batch", `future batch rejected ${JSON.stringify(acceptance)}`);
  assert(acceptance.records?.length === 1 && acceptance.records[0].status === "accepted",
    `future jump not accepted ${JSON.stringify(acceptance.records)}`);
  assert(first.boundaryTick < targetTick,
    `future event already reached target before disconnect boundary=${first.boundaryTick} target=${targetTick}`);

  const acceptedAtBoundary = acceptance.boundaryTick ?? first.boundaryTick;
  first.close();
  await sleep(20);

  resumed = new Client(playerA, run, original.resumeToken);
  await resumed.connect();
  const welcome = await waitFor(() => resumed.welcome, "resumed welcome");
  assert(welcome.resumed === true, `resume not accepted ${JSON.stringify({resumed:welcome.resumed})}`);
  assert(resumed.sessionId === original.sessionId, `ActorSession drift ${original.sessionId} -> ${resumed.sessionId}`);
  assert(resumed.netEntityId === original.netEntityId, `NetEntity drift ${original.netEntityId} -> ${resumed.netEntityId}`);
  assert(resumed.identity.worldEpoch === original.worldEpoch, `WorldEpoch drift ${original.worldEpoch} -> ${resumed.identity.worldEpoch}`);
  assert(Number.isInteger(welcome.resumeLastJumpSequence), `resume jump high-water missing ${JSON.stringify(welcome.resumeLastJumpSequence)}`);
  assert(welcome.resumeLastJumpSequence >= SEQUENCE,
    `accepted pending causal identity not reserved across resume: ${welcome.resumeLastJumpSequence} < ${SEQUENCE}`);

  const resumeBoundary = welcome.state?.boundaryTick ?? welcome.rebaseSeed?.boundaryTick ?? resumed.boundaryTick;
  assert(Number.isInteger(resumeBoundary) && resumeBoundary < targetTick,
    `probe did not resume before pending target boundary=${resumeBoundary} target=${targetTick}`);

  const canonical = await waitFor(() => consumed(resumed, targetTick), "pending event canonical consumption", 15_000);
  assert(canonical.jump === true, `pending event lost jump intent ${JSON.stringify(canonical)}`);
  assert(canonical.jumpSequence === SEQUENCE, `pending event provenance drift ${JSON.stringify(canonical)}`);

  Object.assign(result, {
    verdict: "WORLD_V0_JUMP_PENDING_RESUME_HIGHWATER_V28_PASS",
    original,
    targetTick,
    acceptedAtBoundary,
    resumeBoundary,
    resumeLastJumpSequence: welcome.resumeLastJumpSequence,
    resumeLastBatchSeq: welcome.resumeLastBatchSeq,
    canonical: {
      boundaryTick: canonical.boundaryTick,
      jump: canonical.jump,
      jumpSequence: canonical.jumpSequence,
      jumpApplied: canonical.jumpApplied,
      source: canonical.source,
      fresh: canonical.fresh,
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
