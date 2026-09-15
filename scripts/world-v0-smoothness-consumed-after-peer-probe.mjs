import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import {
  WorldV0ScheduledInputBuffer,
  sameWorldV0Input,
} from "../src/world-v0-protocol.ts";

const OUTPUT = process.env.MW_WORLD_V0_CONSUMED_AFTER_PEER_OUTPUT ?? "world-v0-smoothness-consumed-after-peer.json";
const TARGET = 205;
const p0 = { x: 0, z: -1, jump: false };
const p1 = { x: 1, z: 0, jump: false };
const p2 = { x: 0, z: 1, jump: false };
const identity = {
  worldId: "shared-yard-v0-diagnostic",
  worldEpoch: "epoch-diagnostic",
  simBuildId: "diagnostic",
  clientSimRevision: "diagnostic",
};

function batch(batchSeq, input) {
  return {
    type: "world_v0_input_batch",
    ...identity,
    batchSeq,
    records: [{ targetTick: TARGET, ...input }],
  };
}

class RemoteClientModel {
  constructor(initial) {
    this.peer = new Map([[TARGET, { ...initial }]]);
    this.used = new Map([[TARGET, { ...initial }]]);
    this.consumed = new Map();
    this.corrections = [];
  }
  resolved() {
    return this.consumed.get(TARGET) || this.peer.get(TARGET);
  }
  maybeCorrect(reason) {
    const resolved = this.resolved();
    const used = this.used.get(TARGET);
    if (!resolved || !used || sameWorldV0Input(resolved, used)) return false;
    this.used.set(TARGET, { ...resolved });
    this.corrections.push(reason);
    return true;
  }
  peerRelay(input) {
    this.peer.set(TARGET, { ...input });
    return this.maybeCorrect("peer-record");
  }
  authorityConsumed(input) {
    this.consumed.set(TARGET, { ...input });
    return this.maybeCorrect("authority-consumed");
  }
}

const authority = new WorldV0ScheduledInputBuffer();
const first = authority.acceptBatch(batch(1, p0), 200, 200, 16);
assert.equal(first.records[0].status, "accepted", "initial future input not accepted");

const revision = authority.acceptBatch(batch(2, p1), 202, 200, 16);
assert.equal(revision.records[0].status, "superseded", "future revision not superseded");
const latestRelayed = { x: revision.records[0].x, z: revision.records[0].z, jump: revision.records[0].jump };

const client = new RemoteClientModel(p0);
assert.equal(client.peerRelay(latestRelayed), true, "peer revision did not require the expected correction");
assert.deepEqual(client.corrections, ["peer-record"]);

const consumed = authority.consume(TARGET);
assert.equal(consumed.source, "fresh", "authority did not consume the pending future revision");
assert.equal(consumed.fresh, true, "authority consumption unexpectedly non-fresh");
assert(sameWorldV0Input(consumed, latestRelayed), "authority-consumed truth contradicts latest accepted/relayed revision");
assert.equal(client.authorityConsumed(consumed), false, "matching authority-consumed truth caused a second correction");
assert.deepEqual(client.corrections, ["peer-record"], "healthy accepted relay path double-corrected");

const late = authority.acceptBatch(batch(3, p2), TARGET + 1, 200, 16);
assert.equal(late.records[0].status, "late", "post-consumption revision was not rejected as late");
const lateWouldRelay = late.records.some((record) => record.status === "accepted" || record.status === "superseded");
assert.equal(lateWouldRelay, false, "late post-consumption value would incorrectly enter peer relay path");

const result = {
  revision: "world-v0-smoothness-consumed-after-peer-v1",
  targetTick: TARGET,
  authoritySequence: {
    initialStatus: first.records[0].status,
    revisionStatus: revision.records[0].status,
    consumed: { x: consumed.x, z: consumed.z, jump: Boolean(consumed.jump), source: consumed.source, fresh: consumed.fresh },
    postConsumptionRevisionStatus: late.records[0].status,
  },
  clientSequence: {
    corrections: client.corrections,
    peerCorrectionCount: client.corrections.filter((reason) => reason === "peer-record").length,
    authorityConsumedCorrectionCount: client.corrections.filter((reason) => reason === "authority-consumed").length,
  },
  verdict: "HEALTHY_REMOTE_RELAY_DOES_NOT_GENERICALLY_DOUBLE_CORRECT_ON_CONSUMED",
  conclusion: "For one unconsumed remote tick, an accepted/superseded revision is the same value the authority later consumes. A revision arriving after consumption is classified late and is not relayed. Therefore peer-record -> authority-consumed is not a generic second correction multiplier for the same healthy remote revision.",
  nonClaim: "This does not rule out authority-consumed corrections caused by the local player's own intended timeline, missing/held/lease semantics, topology/rebase events, or other ticks. Those must be attributed separately from peer-record amplification.",
};
writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
console.log(result.verdict);
