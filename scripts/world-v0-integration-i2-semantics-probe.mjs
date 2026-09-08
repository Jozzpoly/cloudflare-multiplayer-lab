import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import {
  WORLD_V0_CLIENT_SIM_REVISION,
  WORLD_V0_PROTOCOL_REVISION,
  WORLD_V0_SERVER_REVISION,
  WORLD_V0_SIM_BUILD_ID,
} from "../src/world-v0-contract.ts";
import {
  WORLD_V0_MAX_FUTURE_TICKS,
  WorldV0ScheduledInputBuffer,
  expectedWorldV0Identity,
} from "../src/world-v0-protocol.ts";

const identity = expectedWorldV0Identity("shared-yard-v0-i2-semantics", "epoch-i2");
const protocolStartTick = 100;
function batch(batchSeq, records) {
  return { type: "world_v0_input_batch", ...identity, batchSeq, records };
}

assert.equal(WORLD_V0_PROTOCOL_REVISION, "shared-yard-v0-scheduled-input-v3-supersession");
assert.equal(WORLD_V0_SERVER_REVISION, "shared-yard-v0-authority-v3-supersession");
assert.equal(WORLD_V0_CLIENT_SIM_REVISION, "shared-yard-v0-browser-sim-v3-supersession");
assert.match(WORLD_V0_SIM_BUILD_ID, /^shared-yard-v0-sim-[0-9a-f]{16}$/);
assert.notEqual(WORLD_V0_SIM_BUILD_ID, "shared-yard-v0-sim-517b4300b0a5f40f");

const buffer = new WorldV0ScheduledInputBuffer();
let result = buffer.acceptBatch(batch(1, [
  { targetTick: 110, x: 1, z: 0, jump: false },
  { targetTick: 111, x: 1, z: 0, jump: false },
]), 105, protocolStartTick);
assert.deepEqual(result.records.map((record) => record.status), ["accepted", "accepted"]);

result = buffer.acceptBatch(batch(2, [
  { targetTick: 110, x: 0, z: 1, jump: true },
  { targetTick: 111, x: 0, z: 1, jump: false },
]), 105, protocolStartTick);
assert.deepEqual(result.records.map((record) => record.status), ["superseded", "superseded"]);

result = buffer.acceptBatch(batch(3, [
  { targetTick: 110, x: 0, z: 1, jump: true },
  { targetTick: 111, x: 0, z: 1, jump: false },
]), 105, protocolStartTick);
assert.deepEqual(result.records.map((record) => record.status), ["duplicate_same", "duplicate_same"]);

result = buffer.acceptBatch(batch(2, [{ targetTick: 110, x: -1, z: 0, jump: false }]), 105, protocolStartTick);
assert.equal(result.batchStatus, "stale_batch");
assert.deepEqual(result.records, []);

const at110 = buffer.consume(110);
assert.deepEqual([at110.x, at110.z, at110.jump, at110.source], [0, 1, true, "fresh"]);
const at111 = buffer.consume(111);
assert.deepEqual([at111.x, at111.z, at111.jump, at111.source], [0, 1, false, "fresh"]);
const held = buffer.consume(112);
assert.equal(held.jump, false, "one-shot jump must not be held");

result = buffer.acceptBatch(batch(4, [{ targetTick: 110, x: -1, z: 0, jump: false }]), 112, protocolStartTick);
assert.equal(result.records[0].status, "late", "consumed history must remain immutable");

const bounded = new WorldV0ScheduledInputBuffer();
result = bounded.acceptBatch(batch(1, [{
  targetTick: 200 + WORLD_V0_MAX_FUTURE_TICKS + 1,
  x: 1,
  z: 0,
  jump: false,
}]), 200, protocolStartTick);
assert.equal(result.records[0].status, "too_future");

const stats = buffer.stats();
assert.equal(stats.supersededRecords, 2);
assert.equal(stats.duplicateSameRecords, 2);
assert.equal(stats.staleBatches, 1);
assert.equal(stats.lateRecords, 1);

const browser = readFileSync("public/world-v0/app.js", "utf8");
assert(browser.includes("I2 future-intent supersession"), "browser supersession marker missing");
assert(!browser.includes("conflicting relayed remote record"), "browser still crashes on revised future relay");
assert(browser.includes("if (!existing || !sameInput(existing, next))"), "browser does not replace changed future peer input");

const server = readFileSync("src/world-v0-shared-yard.ts", "utf8");
assert(server.includes('record.status === "accepted" || record.status === "superseded"'), "authority does not relay superseded records");

console.log("WORLD_V0_INTEGRATION_I2_SEMANTICS", JSON.stringify({
  revision: "world-v0-integration-i2-semantics-v1",
  simBuildId: WORLD_V0_SIM_BUILD_ID,
  protocolRevision: WORLD_V0_PROTOCOL_REVISION,
  preservedBounds: { maxFutureTicks: WORLD_V0_MAX_FUTURE_TICKS },
  proved: [
    "higher-batchseq-replaces-unconsumed-future",
    "duplicate-same-idempotent",
    "stale-batch-no-rewind",
    "consumed-history-immutable",
    "one-shot-jump-no-hold",
    "future-window-unchanged",
    "browser-peer-timeline-replace-capable",
    "authority-relays-superseded",
  ],
  verdict: "WORLD_V0_INTEGRATION_I2_SEMANTICS_PASS",
}, null, 2));
console.log("WORLD_V0_INTEGRATION_I2_SEMANTICS_PASS");
