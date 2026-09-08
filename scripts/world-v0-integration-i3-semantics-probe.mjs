import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  WORLD_V0_CLIENT_SIM_REVISION,
  WORLD_V0_CONTRACT_REVISION,
  WORLD_V0_PROTOCOL_REVISION,
  WORLD_V0_SERVER_REVISION,
  WORLD_V0_TIMING,
  WORLD_V0_SIM_BUILD_ID,
} from "../src/world-v0-contract.ts";

// I3 is a semantic capability, not an exact later-stage revision string. Keep
// provenance visible, but allow I4+ contracts to carry the qualified scheduler
// forward as long as the protocol/timing and structural invariants remain intact.
assert.match(WORLD_V0_CONTRACT_REVISION, /^shared-yard-v0-contract-v\d+/);
assert.match(WORLD_V0_CLIENT_SIM_REVISION, /^shared-yard-v0-browser-sim-v\d+/);
assert.match(WORLD_V0_SERVER_REVISION, /^shared-yard-v0-authority-v\d+/);
assert.equal(WORLD_V0_PROTOCOL_REVISION, "shared-yard-v0-scheduled-input-v3-supersession");
assert.equal(WORLD_V0_TIMING.simulationHz, 60);
assert.equal(WORLD_V0_TIMING.predictionLeadTicks, 8);
assert.equal(WORLD_V0_TIMING.inputBatchSize, 2);
assert.equal(WORLD_V0_TIMING.maxFutureTicks, 32);
assert.equal(WORLD_V0_TIMING.inputLeaseMissingTicks, 36);
assert.match(WORLD_V0_SIM_BUILD_ID, /^shared-yard-v0-sim-[0-9a-f]{16}$/);
assert.notEqual(WORLD_V0_SIM_BUILD_ID, "shared-yard-v0-sim-a52f77bb01f0e067");

class SchedulerModel {
  constructor() {
    this.intended = new Map();
    this.pending = [];
    this.sent = [];
    this.batchSeq = 0;
    this.jumpQueued = false;
  }

  same(a, b) {
    return a.x === b.x && a.z === b.z && Boolean(a.jump) === Boolean(b.jump);
  }

  send(records, kind) {
    this.batchSeq += 1;
    this.sent.push({ batchSeq: this.batchSeq, kind, records: records.map((record) => ({ ...record })) });
  }

  queue(targetTick, input) {
    this.pending.push({ targetTick, ...input });
    if (this.pending.length < 2) return;
    this.send(this.pending.splice(0, 2), "authored");
  }

  sendRevisions(records) {
    let cursor = 0;
    while (cursor < records.length) {
      const chunk = [records[cursor++]];
      while (cursor < records.length && chunk.length < 2 && records[cursor].targetTick === chunk.at(-1).targetTick + 1) {
        chunk.push(records[cursor++]);
      }
      this.send(chunk, "revision");
    }
  }

  pump(estimate, movement) {
    const startTick = Math.max(100, Math.floor(estimate));
    const authoredThrough = Math.floor(estimate + 8) - 1;
    if (authoredThrough < startTick) return;
    const jumpTarget = this.jumpQueued ? startTick : null;
    if (jumpTarget !== null) this.jumpQueued = false;
    const revisions = [];
    for (let tick = startTick; tick <= authoredThrough; tick += 1) {
      const existing = this.intended.get(tick);
      if (!existing) {
        const next = { x: movement.x, z: movement.z, jump: tick === jumpTarget };
        this.intended.set(tick, next);
        this.queue(tick, next);
        continue;
      }
      const next = { x: movement.x, z: movement.z, jump: Boolean(existing.jump || tick === jumpTarget) };
      if (this.same(existing, next)) continue;
      this.intended.set(tick, next);
      const unsent = this.pending.find((record) => record.targetTick === tick);
      if (unsent) Object.assign(unsent, next);
      else revisions.push({ targetTick: tick, ...next });
    }
    this.sendRevisions(revisions);
  }
}

const model = new SchedulerModel();
model.pump(100, { x: 1, z: 0 });
assert.equal(model.sent.length, 4, "initial eight-tick horizon should be four 2-record batches");
assert.equal(model.pending.length, 0);

model.pump(101, { x: 1, z: 0 });
assert.deepEqual(model.pending.map((record) => record.targetTick), [108], "one newly exposed horizon tick should remain as half-batch");
const seqBeforeTurn = model.batchSeq;
model.pump(101.2, { x: 0, z: 1 });
assert(model.batchSeq > seqBeforeTurn, "movement transition did not emit supersession batches");
assert.deepEqual(model.intended.get(108), { x: 0, z: 1, jump: false }, "unsent half-batch did not adopt newest intent");
assert.deepEqual(model.pending[0], { targetTick: 108, x: 0, z: 1, jump: false }, "pending half-batch retained stale intent");

const revisionMaxSeq = model.batchSeq;
model.pump(102, { x: 0, z: 1 });
assert.equal(model.pending.length, 0, "next horizon tick should flush the updated half-batch");
const flushed = model.sent.at(-1);
assert(flushed.batchSeq > revisionMaxSeq, "half-batch flush must occur after transition revisions");
assert.deepEqual(flushed.records, [
  { targetTick: 108, x: 0, z: 1, jump: false },
  { targetTick: 109, x: 0, z: 1, jump: false },
], "higher-seq half-batch flush would rewind supersession");

model.jumpQueued = true;
model.pump(102.2, { x: 0, z: 1 });
assert.equal(model.intended.get(102).jump, true, "jump edge was not injected into nearest future tick");
const jumpSeq = model.batchSeq;
model.pump(102.4, { x: -1, z: 0 });
assert.equal(model.intended.get(102).jump, true, "movement revision erased an authored one-shot jump");
assert(model.batchSeq > jumpSeq, "movement revision after jump produced no supersession");
model.pump(102.6, { x: -1, z: 0 });
assert.equal(model.intended.get(103).jump, false, "jump edge leaked into subsequent tick");

const browser = readFileSync("public/world-v0/app.js", "utf8");
assert(browser.includes("I3 logical input authorship scheduler"));
assert(browser.includes("logicalInputTimer = setInterval"), "logical scheduler is not independently clocked");
assert(browser.includes("pumpLogicalInputScheduler();\n      advancePrediction();"), "rAF safety path does not share scheduler ownership");
assert(browser.includes("Authorship belongs exclusively to pumpLogicalInputScheduler()"), "prediction authorship removal marker missing");
assert(!browser.includes("intendedSelf.set(tick, { ...intended });\n    queueInputRecord(tick, intended);"), "rAF prediction still owns canonical authorship");
assert(browser.includes("pendingBatch.find((record) => record.targetTick === tick)"), "half-batch supersession guard missing");
assert(browser.includes("jump: Boolean(existing.jump || tick === jumpTarget)"), "movement revisions can erase jump edge");

const evidence = {
  revision: "world-v0-integration-i3-semantics-v2-carry-forward",
  simBuildId: WORLD_V0_SIM_BUILD_ID,
  runtimeRevisions: {
    contract: WORLD_V0_CONTRACT_REVISION,
    clientSim: WORLD_V0_CLIENT_SIM_REVISION,
    server: WORLD_V0_SERVER_REVISION,
    protocol: WORLD_V0_PROTOCOL_REVISION,
  },
  preserved: {
    protocolRevision: WORLD_V0_PROTOCOL_REVISION,
    simulationHz: WORLD_V0_TIMING.simulationHz,
    predictionLeadTicks: WORLD_V0_TIMING.predictionLeadTicks,
    inputBatchSize: WORLD_V0_TIMING.inputBatchSize,
    maxFutureTicks: WORLD_V0_TIMING.maxFutureTicks,
    inputLeaseMissingTicks: WORLD_V0_TIMING.inputLeaseMissingTicks,
  },
  qualifiedStructure: [
    "single-logical-authority-for-intendedSelf",
    "fixed-main-thread-clock-independent-of-rAF",
    "rAF-consumer-not-author",
    "transition-supersedes-authored-unconsumed-window",
    "unsent-half-batch-updated-before-later-higher-seq-flush",
    "jump-edge-preserved-across-movement-revision",
  ],
  verdict: "WORLD_V0_INTEGRATION_I3_SEMANTICS_PASS",
  nonClaim: "This is a structural/pure semantic carry-forward gate. Real Chromium rAF-decoupling evidence remains required for current runtime qualification.",
};
console.log("WORLD_V0_INTEGRATION_I3_SEMANTICS", JSON.stringify(evidence, null, 2));
console.log(evidence.verdict);
