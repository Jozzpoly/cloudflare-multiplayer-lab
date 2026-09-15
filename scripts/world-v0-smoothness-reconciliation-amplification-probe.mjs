import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { WORLD_V0_TIMING } from "../src/world-v0-contract.ts";

const OUTPUT = process.env.MW_WORLD_V0_RECON_OUTPUT ?? "world-v0-smoothness-reconciliation-amplification.json";
const HORIZON = WORLD_V0_TIMING.predictionLeadTicks;
const BATCH = WORLD_V0_TIMING.inputBatchSize;
assert.equal(HORIZON, 8, "probe assumptions changed: prediction lead");
assert.equal(BATCH, 2, "probe assumptions changed: input batch size");

const same = (a, b) => Math.abs(a.x - b.x) < 1e-12 && Math.abs(a.z - b.z) < 1e-12;

class ReceiverModel {
  constructor() {
    this.peerRemote = new Map();
    this.usedRemote = new Map();
    this.corrections = [];
  }
  seed(startTick, input) {
    for (let tick = startTick; tick < startTick + HORIZON; tick += 1) {
      this.peerRemote.set(tick, { ...input });
      this.usedRemote.set(tick, { ...input });
    }
  }
  usedInputsChangedAt(tick) {
    const used = this.usedRemote.get(tick);
    const resolved = this.peerRemote.get(tick);
    return Boolean(used && resolved && !same(used, resolved));
  }
  correctFrom(targetTick, reason) {
    this.corrections.push({ targetTick, reason });
    // Minimal exact semantic needed for this probe: after correction/replay, every
    // already-known peer value from target onward is now the used value.
    for (const [tick, input] of this.peerRemote) {
      if (tick >= targetTick) this.usedRemote.set(tick, { ...input });
    }
  }
  handlePeerMessage(records) {
    const candidates = [];
    for (const record of records) {
      const next = { x: record.x, z: record.z };
      const existing = this.peerRemote.get(record.targetTick);
      if (!existing || !same(existing, next)) {
        this.peerRemote.set(record.targetTick, next);
        candidates.push(record.targetTick);
      }
    }
    const target = [...new Set(candidates)].sort((a, b) => a - b).find((tick) => this.usedInputsChangedAt(tick));
    if (Number.isInteger(target)) this.correctFrom(target, "peer-record");
  }
  handleCoalescedPeerMessages(messages) {
    const candidates = [];
    for (const records of messages) {
      for (const record of records) {
        const next = { x: record.x, z: record.z };
        const existing = this.peerRemote.get(record.targetTick);
        if (!existing || !same(existing, next)) {
          this.peerRemote.set(record.targetTick, next);
          candidates.push(record.targetTick);
        }
      }
    }
    const target = [...new Set(candidates)].sort((a, b) => a - b).find((tick) => this.usedInputsChangedAt(tick));
    if (Number.isInteger(target)) this.correctFrom(target, "peer-record-coalesced");
  }
}

function revisionMessages(startTick, input) {
  const records = [];
  for (let tick = startTick; tick < startTick + HORIZON; tick += 1) records.push({ targetTick: tick, ...input });
  const messages = [];
  for (let cursor = 0; cursor < records.length; cursor += BATCH) messages.push(records.slice(cursor, cursor + BATCH));
  return messages;
}

function runCurrent(revisions) {
  const startTick = 200;
  const receiver = new ReceiverModel();
  receiver.seed(startTick, { x: 0, z: -1 });
  for (let i = 0; i < revisions; i += 1) {
    const angle = (i + 1) * 0.07;
    const messages = revisionMessages(startTick, { x: Math.sin(angle), z: -Math.cos(angle) });
    for (const message of messages) receiver.handlePeerMessage(message);
  }
  return receiver.corrections;
}

function runCoalesced(revisions) {
  const startTick = 200;
  const receiver = new ReceiverModel();
  receiver.seed(startTick, { x: 0, z: -1 });
  for (let i = 0; i < revisions; i += 1) {
    const angle = (i + 1) * 0.07;
    receiver.handleCoalescedPeerMessages(revisionMessages(startTick, { x: Math.sin(angle), z: -Math.cos(angle) }));
  }
  return receiver.corrections;
}

const samples = [1, 2, 5, 10, 30].map((revisionCount) => {
  const current = runCurrent(revisionCount);
  const coalesced = runCoalesced(revisionCount);
  return {
    revisionCount,
    peerMessagesPerRevision: HORIZON / BATCH,
    currentCorrectionPasses: current.length,
    coalescedCorrectionPasses: coalesced.length,
    amplification: coalesced.length ? current.length / coalesced.length : null,
    currentTargets: current.slice(0, 16).map((entry) => entry.targetTick),
  };
});

for (const sample of samples) {
  assert.equal(sample.currentCorrectionPasses, sample.revisionCount * (HORIZON / BATCH), "current per-message correction semantics drifted");
  assert.equal(sample.coalescedCorrectionPasses, sample.revisionCount, "coalesced reference semantics drifted");
  assert.equal(sample.amplification, HORIZON / BATCH, "unexpected reconciliation amplification factor");
}

const result = {
  revision: "world-v0-smoothness-reconciliation-amplification-v1",
  currentContract: {
    predictionLeadTicks: HORIZON,
    inputBatchSize: BATCH,
    peerMessagesPerFullHorizonRevision: HORIZON / BATCH,
    receiverPolicy: "maybeCorrect once per peer-record message",
  },
  samples,
  verdict: "PER_MESSAGE_RECONCILIATION_AMPLIFICATION_PROVEN",
  nonClaim: "This proves scheduling amplification in the current message/reconciliation semantics. It does not claim every future tick is revised or already simulated on every production pump, nor that every production peer message causes a correction.",
};
writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
console.log(result.verdict);
