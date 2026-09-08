import { readFileSync } from "node:fs";

const path = process.argv[2] || "world-v0-jump-one-shot-late.json";
const evidence = JSON.parse(readFileSync(path, "utf8"));

function assert(value, message) {
  if (!value) throw new Error(message);
}

if (evidence.verdict === "WORLD_V0_JUMP_ONE_SHOT_LATE_CAUSAL_PASS") {
  console.log("WORLD_V0_JUMP_ONE_SHOT_LATE_CAUSAL_PASS", JSON.stringify({
    mode: "induced-delay",
    delayMs: evidence.delayMs,
    control: evidence.control,
    delayed: evidence.delayed,
  }));
  process.exit(0);
}

const target = evidence.targetEvidence;
const wire = evidence.targetWireAudit;
assert(target && wire, "failed raw audit did not retain target evidence/wire trace");
assert(target.runtimeFailed === false, `runtime failed during reproduction: ${target.runtimeFailureReason}`);
assert(target.metrics?.guardMismatches === 0, `exact guard mismatch during reproduction: ${target.metrics?.guardMismatches}`);
assert(target.session?.actorSessionId, "ActorSession identity missing");

const sessionId = target.session.actorSessionId;
const key = [...(wire.keys || [])].reverse().find((entry) => Number.isInteger(entry.latestAuthorityBoundary));
assert(key, "Space key evidence missing");

let jump = null;
for (let sendIndex = 0; sendIndex < (wire.sent || []).length; sendIndex += 1) {
  const send = wire.sent[sendIndex];
  if (send.at < key.at) continue;
  const record = (send.records || []).find((candidate) => candidate.jump === true);
  if (record) {
    jump = { sendIndex, batchSeq: send.batchSeq, sentAt: send.at, record };
    break;
  }
}
assert(jump, "no jump:true send after Space event");

const targetTick = jump.record.targetTick;
const priorFalse = (wire.sent || []).slice(0, jump.sendIndex).flatMap((send) =>
  (send.records || []).map((record) => ({ send, record })))
  .filter(({ record }) => record.targetTick === targetTick && record.jump === false)
  .at(-1);
assert(priorFalse, `no earlier jump:false prefill for target ${targetTick}`);

const ackFor = (batchSeq) => (wire.received || []).find((entry) =>
  entry.type === "world_v0_batch_ack" && entry.batchSeq === batchSeq);
const priorAck = ackFor(priorFalse.send.batchSeq);
const jumpAck = ackFor(jump.batchSeq);
assert(priorAck, `missing ACK for earlier false prefill batch ${priorFalse.send.batchSeq}`);
assert(jumpAck, `missing ACK for jump revision batch ${jump.batchSeq}`);

const priorAckRecord = (priorAck.records || []).find((record) => record.targetTick === targetTick);
const jumpAckRecord = (jumpAck.records || []).find((record) => record.targetTick === targetTick);
assert(["accepted", "superseded", "duplicate_same"].includes(priorAckRecord?.status),
  `earlier false prefill was not established at authority: ${priorAckRecord?.status}`);
assert(jumpAckRecord?.status === "late", `jump revision was not late: ${jumpAckRecord?.status}`);

const consumed = (wire.received || []).find((entry) =>
  entry.type === "world_v0_consumed" && entry.targetTick === targetTick);
assert(consumed, `missing canonical consumed tick ${targetTick}`);
const canonical = (consumed.players || []).find((player) => player.sessionId === sessionId);
assert(canonical, `canonical ActorSession missing at tick ${targetTick}`);
assert(canonical.jump === false, `canonical jump unexpectedly true at tick ${targetTick}`);
assert(canonical.fresh === true && canonical.source === "fresh",
  `canonical false was not a fresh consumed record: ${JSON.stringify(canonical)}`);

const snapshots = (wire.received || []).filter((entry) =>
  entry.type === "world_v0_snapshot" &&
  Number.isInteger(entry.boundaryTick) &&
  entry.boundaryTick >= targetTick &&
  entry.boundaryTick <= targetTick + 30);
const heights = snapshots.map((entry) =>
  (entry.players || []).find((player) => player.sessionId === sessionId)?.position?.[1])
  .filter(Number.isFinite);
assert(heights.length >= 2, `insufficient authority position samples after tick ${targetTick}`);
const maxY = Math.max(...heights);
assert(maxY < 1.05, `authority actor jumped despite canonical false: maxY=${maxY}`);

const targetLead = targetTick - key.latestAuthorityBoundary;
assert(targetLead >= 1 && targetLead <= 4,
  `jump target was not near authority frontier: lead=${targetLead}`);
assert(target.metrics.serverLate > key.serverLate,
  `serverLate did not increase across missed jump: ${key.serverLate} -> ${target.metrics.serverLate}`);

const summary = {
  mode: "natural-zero-added-delay",
  rawVerdict: evidence.verdict,
  rawError: evidence.error,
  actorSessionId: sessionId,
  keyAuthorityBoundary: key.latestAuthorityBoundary,
  targetTick,
  targetLead,
  priorFalse: {
    batchSeq: priorFalse.send.batchSeq,
    sentAt: priorFalse.send.at,
    ackBoundaryTick: priorAck.boundaryTick,
    ackStatus: priorAckRecord.status,
  },
  jumpRevision: {
    batchSeq: jump.batchSeq,
    sentAt: jump.sentAt,
    ackBoundaryTick: jumpAck.boundaryTick,
    ackStatus: jumpAckRecord.status,
  },
  canonical: {
    boundaryTick: consumed.boundaryTick,
    jump: canonical.jump,
    fresh: canonical.fresh,
    source: canonical.source,
    missingStreak: canonical.missingStreak,
  },
  serverLate: { before: key.serverLate, after: target.metrics.serverLate },
  authorityMaxYThrough30Ticks: maxY,
  guardMismatches: target.metrics.guardMismatches,
};

console.log("WORLD_V0_JUMP_ONE_SHOT_LATE_CAUSAL_PASS", JSON.stringify(summary));
