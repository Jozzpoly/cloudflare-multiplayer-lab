import assert from "node:assert/strict";
import {
  F5_MAX_FUTURE_TICKS,
  F5ScheduledInputBuffer,
  parseF5ClientMessage,
} from "../src/ws0-f5-protocol.ts";

const parsed = parseF5ClientMessage(JSON.stringify({
  type: "f5_input_batch",
  batchSeq: 1,
  records: [
    { targetTick: 20, x: 2, z: 0 },
    { targetTick: 21, x: 0, z: 1 },
  ],
}));
assert(parsed && parsed.type === "f5_input_batch");
assert.equal(parsed.records[0].x, 1, "input must be normalized at protocol boundary");
assert.equal(parsed.records[0].z, 0);
assert.equal(parseF5ClientMessage(JSON.stringify({
  type: "f5_input_batch",
  batchSeq: 1,
  records: [{ targetTick: 20, x: 0, z: 0 }, { targetTick: 22, x: 0, z: 0 }],
})), null, "a batch must contain consecutive logical ticks");

const input = new F5ScheduledInputBuffer();
const startTick = 20;

const first = input.acceptBatch(parsed, 10, startTick);
assert.equal(first.batchStatus, "accepted_batch");
assert.deepEqual(first.records.map((record) => record.status), ["accepted", "accepted"]);

const duplicate = input.acceptBatch({
  type: "f5_input_batch",
  batchSeq: 2,
  records: [{ targetTick: 20, x: 1, z: 0 }],
}, 11, startTick);
assert.equal(duplicate.records[0].status, "duplicate_same");

const conflict = input.acceptBatch({
  type: "f5_input_batch",
  batchSeq: 3,
  records: [{ targetTick: 20, x: 0, z: -1 }],
}, 11, startTick);
assert.equal(conflict.records[0].status, "conflict");

const beforeStart = input.acceptBatch({
  type: "f5_input_batch",
  batchSeq: 4,
  records: [{ targetTick: 19, x: 0, z: 1 }],
}, 11, startTick);
assert.equal(beforeStart.records[0].status, "before_start");

const consumed20 = input.consume(20);
assert.deepEqual(consumed20, { targetTick: 20, x: 1, z: 0, fresh: true });
const consumed21 = input.consume(21);
assert.deepEqual(consumed21, { targetTick: 21, x: 0, z: 1, fresh: true });
const missing22 = input.consume(22);
assert.deepEqual(missing22, { targetTick: 22, x: 0, z: 1, fresh: false }, "missing tick must hold last consumed input");

const late = input.acceptBatch({
  type: "f5_input_batch",
  batchSeq: 5,
  records: [{ targetTick: 21, x: 0, z: 0 }],
}, 23, startTick);
assert.equal(late.records[0].status, "late");

const tooFutureTick = 23 + F5_MAX_FUTURE_TICKS + 1;
const tooFuture = input.acceptBatch({
  type: "f5_input_batch",
  batchSeq: 6,
  records: [{ targetTick: tooFutureTick, x: 0, z: 0 }],
}, 23, startTick);
assert.equal(tooFuture.records[0].status, "too_future");

const stale = input.acceptBatch({
  type: "f5_input_batch",
  batchSeq: 6,
  records: [{ targetTick: 24, x: 0, z: 0 }],
}, 23, startTick);
assert.equal(stale.batchStatus, "stale_batch");
assert.equal(stale.records.length, 0);

const stats = input.stats();
assert.equal(stats.acceptedRecords, 2);
assert.equal(stats.duplicateSameRecords, 1);
assert.equal(stats.conflictRecords, 1);
assert.equal(stats.beforeStartRecords, 1);
assert.equal(stats.lateRecords, 1);
assert.equal(stats.tooFutureRecords, 1);
assert.equal(stats.staleBatches, 1);
assert.equal(stats.consumedFresh, 2);
assert.equal(stats.consumedMissing, 1);
assert.equal(stats.pendingRecords, 0);

console.log("F5 PROTOCOL SMOKE PASS · on-time / hold-last / late / conflict / future-window / stale-batch semantics");
