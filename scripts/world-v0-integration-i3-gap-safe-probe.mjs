import { readFileSync } from "node:fs";
import {
  parseWorldV0ClientMessage,
  expectedWorldV0Identity,
} from "../src/world-v0-protocol.ts";

const browser = readFileSync(new URL("../public/world-v0/app.js", import.meta.url), "utf8");
const marker = "I3 gap-safe pending-batch flush";
if (!browser.includes(marker)) throw new Error("I3 gap-safe runtime marker missing");
if (!browser.includes("targetTick !== previousPending.targetTick + 1")) throw new Error("I3 gap-safe discontinuity guard missing");
if (!browser.includes("flushPendingInputBatch()")) throw new Error("I3 gap-safe flush helper missing");

class PendingBatchModel {
  constructor(size = 2) {
    this.size = size;
    this.pending = [];
    this.sent = [];
    this.seq = 0;
  }
  flush() {
    if (!this.pending.length) return;
    this.seq += 1;
    this.sent.push({ batchSeq: this.seq, records: this.pending.splice(0, this.size) });
  }
  queue(targetTick) {
    const previous = this.pending[this.pending.length - 1];
    if (previous && targetTick !== previous.targetTick + 1) this.flush();
    this.pending.push({ targetTick, x: 0.5, z: -0.25, jump: false });
    if (this.pending.length >= this.size) this.flush();
  }
}

const model = new PendingBatchModel(2);
model.queue(92); // half-batch survives one pump
model.queue(95); // cadence gap must flush [92] instead of producing invalid [92,95]
model.queue(96); // next consecutive record closes [95,96]
model.flush();

const targets = model.sent.map((batch) => batch.records.map((record) => record.targetTick));
if (JSON.stringify(targets) !== JSON.stringify([[92], [95, 96]])) {
  throw new Error(`gap-safe batch model drift: ${JSON.stringify(targets)}`);
}

const identity = expectedWorldV0Identity("shared-yard-v0-gap-probe", "gap-epoch");
for (const batch of model.sent) {
  const parsed = parseWorldV0ClientMessage(JSON.stringify({
    type: "world_v0_input_batch",
    ...identity,
    batchSeq: batch.batchSeq,
    records: batch.records,
  }));
  if (!parsed || parsed.type !== "world_v0_input_batch") {
    throw new Error(`gap-safe batch rejected by real parser: ${JSON.stringify(batch)}`);
  }
}

const unsafe = parseWorldV0ClientMessage(JSON.stringify({
  type: "world_v0_input_batch",
  ...identity,
  batchSeq: 99,
  records: [
    { targetTick: 92, x: 0.5, z: -0.25, jump: false },
    { targetTick: 95, x: 0.5, z: -0.25, jump: false },
  ],
}));
if (unsafe !== null) throw new Error("real parser unexpectedly accepted non-consecutive [92,95] control");

const evidence = {
  revision: "world-v0-integration-i3-gap-safe-v1",
  reproducedFailure: "old half-batch tick 92 + resumed tick 95 => parser-invalid [92,95]",
  repairedWireBatches: targets,
  realParserAcceptedRepair: true,
  realParserRejectedUnsafeControl: true,
  temporalPolicy: "do-not-fabricate-skipped-93-94; authority hold-last/lease remains canonical",
  verdict: "WORLD_V0_INTEGRATION_I3_GAP_SAFE_PASS",
};
console.log("WORLD_V0_INTEGRATION_I3_GAP_SAFE", JSON.stringify(evidence, null, 2));
console.log(evidence.verdict);
