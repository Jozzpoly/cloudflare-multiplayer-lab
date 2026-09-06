import {
  WORLD_V0_INPUT_BATCH_SIZE,
  WORLD_V0_MAX_FUTURE_TICKS,
  normalizeWorldV0Input,
  sameWorldV0Input,
} from "../src/world-v0-protocol.ts";

const REVISION = "world-v0-future-intent-supersession-audit-v1";
const PROTOCOL_START = 100;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

class SupersedableFutureInputBuffer {
  pending = new Map();
  consumed = { x: 0, z: 0, jump: false };
  lastBatchSeq = 0;
  missingStreak = 0;

  acceptBatch(batch, currentBoundaryTick, maxFutureTicks = WORLD_V0_MAX_FUTURE_TICKS) {
    if (!Number.isInteger(batch.batchSeq) || batch.batchSeq <= 0) throw new Error("invalid_batch_seq");
    if (!Array.isArray(batch.records) || batch.records.length < 1 || batch.records.length > WORLD_V0_INPUT_BATCH_SIZE) {
      throw new Error("invalid_batch_size");
    }
    if (batch.batchSeq <= this.lastBatchSeq) {
      return { batchSeq: batch.batchSeq, batchStatus: "stale_batch", records: [] };
    }
    this.lastBatchSeq = batch.batchSeq;

    const results = [];
    for (const raw of batch.records) {
      const input = normalizeWorldV0Input(raw.x, raw.z, raw.jump === true);
      const record = { targetTick: raw.targetTick, ...input, jump: Boolean(input.jump) };
      let status;
      if (record.targetTick < PROTOCOL_START) status = "before_start";
      else if (record.targetTick < currentBoundaryTick) status = "late";
      else if (record.targetTick > currentBoundaryTick + maxFutureTicks) status = "too_future";
      else {
        const existing = this.pending.get(record.targetTick);
        if (!existing) {
          this.pending.set(record.targetTick, { ...input, jump: Boolean(input.jump), sourceBatchSeq: batch.batchSeq });
          status = "accepted";
        } else if (sameWorldV0Input(existing, input)) {
          status = "duplicate_same";
        } else {
          this.pending.set(record.targetTick, { ...input, jump: Boolean(input.jump), sourceBatchSeq: batch.batchSeq });
          status = "superseded";
        }
      }
      results.push({ ...record, status });
    }
    return { batchSeq: batch.batchSeq, batchStatus: "accepted_batch", records: results };
  }

  consume(targetTick, lease = 36) {
    const pending = this.pending.get(targetTick);
    if (pending) {
      this.pending.delete(targetTick);
      this.consumed = { x: pending.x, z: pending.z, jump: false };
      this.missingStreak = 0;
      return {
        targetTick,
        x: pending.x,
        z: pending.z,
        jump: Boolean(pending.jump),
        sourceBatchSeq: pending.sourceBatchSeq,
        fresh: true,
        source: "fresh",
      };
    }
    this.missingStreak += 1;
    if (this.missingStreak >= lease) {
      this.consumed = { x: 0, z: 0, jump: false };
      return { targetTick, x: 0, z: 0, jump: false, fresh: false, source: "lease_expired" };
    }
    return {
      targetTick,
      x: this.consumed.x,
      z: this.consumed.z,
      jump: false,
      fresh: false,
      source: "held",
    };
  }
}

function batch(batchSeq, ...records) {
  return { batchSeq, records };
}
function rec(targetTick, x, z, jump = false) {
  return { targetTick, x, z, jump };
}

// 1. A changed value may replace only an unconsumed future record.
const future = new SupersedableFutureInputBuffer();
let result = future.acceptBatch(batch(1, rec(110, 1, 0), rec(111, 1, 0)), 105);
assert(result.records.every((entry) => entry.status === "accepted"), "initial future records not accepted");
result = future.acceptBatch(batch(2, rec(110, 0, 1), rec(111, 0, 1)), 105);
assert(result.records.every((entry) => entry.status === "superseded"), "changed unconsumed future intent was not superseded");
const tick110 = future.consume(110);
assert(tick110.x === 0 && tick110.z === 1 && tick110.sourceBatchSeq === 2, "latest unconsumed future value did not win");
result = future.acceptBatch(batch(3, rec(110, -1, 0)), 111);
assert(result.records[0].status === "late", "consumed history was mutable");

// 2. Duplicate retransmission is idempotent and does not create a fake revision.
const duplicate = new SupersedableFutureInputBuffer();
duplicate.acceptBatch(batch(1, rec(120, 0.25, 0.75)), 115);
result = duplicate.acceptBatch(batch(2, rec(120, 0.25, 0.75)), 115);
assert(result.records[0].status === "duplicate_same", "same future value was not idempotent");
assert(duplicate.consume(120).sourceBatchSeq === 1, "duplicate_same unexpectedly rewrote provenance");

// 3. Older batches can never rewind newer future intent.
const stale = new SupersedableFutureInputBuffer();
stale.acceptBatch(batch(10, rec(130, 1, 0)), 120);
stale.acceptBatch(batch(12, rec(130, -1, 0)), 120);
result = stale.acceptBatch(batch(11, rec(130, 0, 1)), 120);
assert(result.batchStatus === "stale_batch", "out-of-order older batch was not rejected");
const tick130 = stale.consume(130);
assert(tick130.x === -1 && tick130.z === 0 && tick130.sourceBatchSeq === 12, "stale batch rewound future intent");

// 4. A release can revise already-prefilled motion without waiting for the horizon to drain.
const release = new SupersedableFutureInputBuffer();
release.acceptBatch(batch(1, rec(140, 1, 0), rec(141, 1, 0)), 135);
release.acceptBatch(batch(2, rec(142, 1, 0), rec(143, 1, 0)), 135);
assert(release.consume(140).x === 1, "baseline motion missing");
result = release.acceptBatch(batch(3, rec(141, 0, 0), rec(142, 0, 0)), 141);
assert(result.records.every((entry) => entry.status === "superseded"), "release did not revise nearest unconsumed prefills");
result = release.acceptBatch(batch(4, rec(143, 0, 0)), 141);
assert(result.records[0].status === "superseded", "release did not revise farther unconsumed prefill");
for (const tick of [141, 142, 143]) {
  const value = release.consume(tick);
  assert(value.x === 0 && value.z === 0, `prefilled stale movement survived release at ${tick}`);
}

// 5. One-shot jump can be injected by supersession but is never held/replayed.
const jump = new SupersedableFutureInputBuffer();
jump.acceptBatch(batch(1, rec(150, 0, 0, false), rec(151, 0, 0, false)), 145);
result = jump.acceptBatch(batch(2, rec(150, 0, 0, true)), 145);
assert(result.records[0].status === "superseded", "jump could not revise a prefetched future tick");
const jumpTick = jump.consume(150);
assert(jumpTick.jump === true, "superseded jump was not consumed");
const afterJump = jump.consume(151);
assert(afterJump.jump === false, "jump repeated after one-shot consumption");
const heldAfterJump = jump.consume(152);
assert(heldAfterJump.jump === false, "held semantics replayed jump");

// 6. Authority and a peer timeline converge when both apply only accepted/superseded relays.
const authority = new SupersedableFutureInputBuffer();
const peerTimeline = new Map();
function acceptAndRelay(batchValue, boundary) {
  const accepted = authority.acceptBatch(batchValue, boundary);
  for (const record of accepted.records) {
    if (record.status === "accepted" || record.status === "superseded") {
      peerTimeline.set(record.targetTick, { x: record.x, z: record.z, jump: Boolean(record.jump), sourceBatchSeq: batchValue.batchSeq });
    }
  }
  return accepted;
}
acceptAndRelay(batch(1, rec(160, 1, 0), rec(161, 1, 0)), 155);
acceptAndRelay(batch(2, rec(162, 1, 0), rec(163, 1, 0)), 155);
acceptAndRelay(batch(3, rec(161, 0, -1), rec(162, 0, -1)), 156);
for (const tick of [160, 161, 162, 163]) {
  const canonical = authority.consume(tick);
  const peer = peerTimeline.get(tick);
  assert(peer, `peer timeline missing ${tick}`);
  assert(canonical.x === peer.x && canonical.z === peer.z && Boolean(canonical.jump) === Boolean(peer.jump), `peer/authority future timeline diverged at ${tick}`);
}

// 7. Bounds remain unchanged: supersession is not permission to extend the accepted future window.
const bounds = new SupersedableFutureInputBuffer();
result = bounds.acceptBatch(batch(1, rec(200 + WORLD_V0_MAX_FUTURE_TICKS + 1, 1, 0)), 200);
assert(result.records[0].status === "too_future", "supersession accidentally enlarged maxFutureTicks");

const evidence = {
  revision: REVISION,
  currentContractPreserved: {
    inputBatchSize: WORLD_V0_INPUT_BATCH_SIZE,
    maxFutureTicks: WORLD_V0_MAX_FUTURE_TICKS,
    noTimingConstantChanged: true,
  },
  candidateSemantics: {
    ordering: "monotonic batchSeq within one actor/session input stream",
    unconsumedFutureConflict: "higher batchSeq replaces pending value and returns superseded",
    duplicate: "same value remains duplicate_same and does not rewrite provenance",
    consumedHistory: "immutable; later record is late",
    staleBatch: "cannot rewind newer future intent",
    peerRelay: "relay accepted and superseded records; latest unconsumed value converges",
    jump: "one-shot may supersede one future tick but is never held",
    maxFutureWindow: "unchanged",
  },
  provedCases: [
    "latest-unconsumed-wins",
    "consumed-history-immutable",
    "duplicate-idempotent",
    "stale-batch-no-rewind",
    "prefill-release-correctable",
    "one-shot-jump-no-replay",
    "peer-authority-future-timeline-convergence",
    "max-future-bound-preserved",
  ],
  verdict: "WORLD_V0_FUTURE_INTENT_SUPERSESSION_SEMANTICS_PASS",
  nonClaim: "This qualifies a bounded semantic candidate only. It does not yet change production WorldV0ScheduledInputBuffer, protocol revision, client scheduler, prediction loop, timing constants, transport frequency, browser thread topology, stale-neutral integration, or Owner-visible control feel. A separate scheduler/topology experiment must show that producing and revising this future timeline outside rAF materially improves starvation resistance without adding artificial control lag.",
};

console.log("WORLD_V0_FUTURE_INTENT_SUPERSESSION", JSON.stringify(evidence, null, 2));
console.log(evidence.verdict);
