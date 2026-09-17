import { writeFileSync } from "node:fs";

const BASE = (process.env.MW_WORLD_V0_REJECTED_HIGHWATER_BASE || "http://127.0.0.1:8787").replace(/\/$/, "");
const OUTPUT = process.env.MW_WORLD_V0_REJECTED_HIGHWATER_OUTPUT || "world-v0-jump-rejected-highwater-v28.json";
const TIMEOUT_MS = 30_000;
const ACCEPTED_SEQUENCE = 1;
const REJECTED_SEQUENCE = 999;

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
        const seedTick = message.state?.boundaryTick ?? message.rebaseSeed?.boundaryTick;
        if (Number.isInteger(seedTick)) this.boundaryTick = Math.max(this.boundaryTick, seedTick);
        this.send({ type: "world_v0_ready", ...this.identity });
      } else if (message.type === "world_v0_start") {
        this.protocolStartTick = message.protocolStartTick;
      } else if (message.type === "world_v0_batch_ack") {
        this.acks.push(message);
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
  close() { try { this.ws?.close(1000, "rejected_highwater_probe"); } catch {} }
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

const suffix = Date.now().toString(36).slice(-8);
const run = `reject-hw-${suffix}`;
const playerA = `RejectA-${suffix}`.slice(0, 24);
const playerB = `RejectB-${suffix}`.slice(0, 24);
let first = new Client(playerA, run);
const peer = new Client(playerB, run);
let resumed = null;
const result = {
  revision: "world-v0-jump-resume-highwater-rejected-record-v28-audit-v1",
  generatedAt: new Date().toISOString(),
  verdict: "WORLD_V0_JUMP_REJECTED_HIGHWATER_V28_FAIL",
};

try {
  await first.connect();
  await peer.connect();
  await waitFor(() => first.welcome && peer.welcome && Number.isInteger(first.protocolStartTick), "protocol start");
  await waitFor(() => first.boundaryTick >= first.protocolStartTick + 20, "active authority");

  const original = {
    worldEpoch: first.identity.worldEpoch,
    sessionId: first.sessionId,
    netEntityId: first.netEntityId,
    resumeToken: first.resumeToken,
  };
  const acceptedTick = first.boundaryTick + 32;
  const rejectedTick = acceptedTick + 1;
  const batchSeq = first.sendBatch([
    { targetTick: acceptedTick, x: 0, z: 0, jump: true, jumpSequence: ACCEPTED_SEQUENCE },
    { targetTick: rejectedTick, x: 0, z: 0, jump: true, jumpSequence: REJECTED_SEQUENCE },
  ]);
  const acceptance = await waitFor(() => ack(first, batchSeq), "mixed acceptance ack");
  assert(acceptance.batchStatus === "accepted_batch", `batch rejected ${JSON.stringify(acceptance)}`);
  assert(acceptance.records?.length === 2, `unexpected acceptance ${JSON.stringify(acceptance)}`);
  assert(acceptance.records[0].status === "accepted" && acceptance.records[0].jumpSequence === ACCEPTED_SEQUENCE,
    `first record not accepted ${JSON.stringify(acceptance.records[0])}`);
  assert(acceptance.records[1].status === "too_future" && acceptance.records[1].jumpSequence === REJECTED_SEQUENCE,
    `second record did not prove too_future rejection ${JSON.stringify(acceptance.records[1])}`);
  assert(first.boundaryTick < acceptedTick, "accepted record consumed before resume probe");

  first.close();
  await sleep(20);
  resumed = new Client(playerA, run, original.resumeToken);
  await resumed.connect();
  const welcome = await waitFor(() => resumed.welcome, "resumed welcome");
  assert(welcome.resumed === true, `resume failed ${JSON.stringify({resumed:welcome.resumed})}`);
  assert(resumed.sessionId === original.sessionId, `ActorSession drift ${original.sessionId} -> ${resumed.sessionId}`);
  assert(Number.isInteger(welcome.resumeLastJumpSequence), `resume high-water missing ${welcome.resumeLastJumpSequence}`);
  assert(welcome.resumeLastJumpSequence === ACCEPTED_SEQUENCE,
    `rejected causal record poisoned resume high-water: expected ${ACCEPTED_SEQUENCE}, got ${welcome.resumeLastJumpSequence}`);

  Object.assign(result, {
    verdict: "WORLD_V0_JUMP_REJECTED_HIGHWATER_V28_PASS",
    original,
    acceptedTick,
    rejectedTick,
    acceptance,
    resumeLastJumpSequence: welcome.resumeLastJumpSequence,
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
