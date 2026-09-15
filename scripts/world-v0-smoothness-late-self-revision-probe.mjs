import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { WorldV0ScheduledInputBuffer } from "../src/world-v0-protocol.ts";

const OUTPUT = process.env.MW_WORLD_V0_LATE_SELF_OUTPUT ?? "world-v0-smoothness-late-self-revision.json";

const protocolStartTick = 100;
const targetTick = 205;
const identity = {
  worldId: "probe-world",
  worldEpoch: "probe-epoch",
  simBuildId: "probe-build",
  clientSimRevision: "probe-client",
};

const authority = new WorldV0ScheduledInputBuffer();
const initial = { x: 0, z: -1, jump: false };
const revised = { x: 1, z: 0, jump: false };

const intendedSelf = new Map();
const usedByTick = new Map();
const consumedByTick = new Map();
const corrections = [];

function batch(batchSeq, records) {
  return { type: "world_v0_input_batch", batchSeq, ...identity, records };
}

function sameInput(a, b) {
  return Boolean(a && b) && Math.abs(a.x - b.x) <= 1e-9 && Math.abs(a.z - b.z) <= 1e-9 && Boolean(a.jump) === Boolean(b.jump);
}

function resolveSelf(tick, previous) {
  const canonical = consumedByTick.get(tick) ?? null;
  const intended = intendedSelf.get(tick) ?? null;
  const chosen = canonical || intended || previous;
  return { x: chosen.x, z: chosen.z, jump: Boolean(chosen.jump) };
}

// 1. An initial future intent reaches authority while the target tick is still future.
intendedSelf.set(targetTick, { ...initial });
const initialAcceptance = authority.acceptBatch(
  batch(1, [{ targetTick, ...initial }]),
  targetTick - 4,
  protocolStartTick,
  32,
);
assert.equal(initialAcceptance.records[0]?.status, "accepted");

// 2. Camera/input changes locally before targetTick. The browser immediately revises
// intendedSelf, and local prediction is allowed to use that newer intention.
intendedSelf.set(targetTick, { ...revised });
const predicted = resolveSelf(targetTick, initial);
usedByTick.set(targetTick, { ...predicted });
assert(sameInput(predicted, revised), "local prediction did not adopt revised future intention");

// 3. Transport delay means authority reaches targetTick before the revision arrives.
// It consumes the older accepted future record.
const canonicalConsumed = authority.consume(targetTick);
assert.equal(canonicalConsumed.source, "fresh");
assert(sameInput(canonicalConsumed, initial), "authority did not consume the older accepted future intent");

// 4. The newer revision now arrives after consumption and is correctly classified late.
const lateAcceptance = authority.acceptBatch(
  batch(2, [{ targetTick, ...revised }]),
  targetTick + 1,
  protocolStartTick,
  32,
);
assert.equal(lateAcceptance.records[0]?.status, "late");

// 5. world_v0_consumed publishes the older canonical value. Current browser semantics
// prefer canonical consumed input over intendedSelf, so the input actually used during
// prediction differs and a correction is required.
consumedByTick.set(targetTick, {
  x: canonicalConsumed.x,
  z: canonicalConsumed.z,
  jump: Boolean(canonicalConsumed.jump),
});
const canonicalResolved = resolveSelf(targetTick, initial);
const used = usedByTick.get(targetTick);
if (!sameInput(used, canonicalResolved)) {
  corrections.push({
    targetTick,
    reason: "authority-consumed",
    used,
    canonical: canonicalResolved,
  });
}

assert.equal(corrections.length, 1, "late local revision did not require one authority-consumed correction");
assert(sameInput(corrections[0].used, revised));
assert(sameInput(corrections[0].canonical, initial));

// Control: when the revision reaches authority before targetTick, authority consumes
// the revised value and no authority-consumed correction is needed for that reason.
const authorityControl = new WorldV0ScheduledInputBuffer();
authorityControl.acceptBatch(batch(1, [{ targetTick, ...initial }]), targetTick - 4, protocolStartTick, 32);
const controlRevision = authorityControl.acceptBatch(batch(2, [{ targetTick, ...revised }]), targetTick - 2, protocolStartTick, 32);
assert.equal(controlRevision.records[0]?.status, "superseded");
const controlConsumed = authorityControl.consume(targetTick);
assert(sameInput(controlConsumed, revised));
assert(sameInput(predicted, controlConsumed), "on-time revision control unexpectedly diverged from predicted revised intent");

const result = {
  revision: "world-v0-smoothness-late-self-revision-v1",
  targetTick,
  latePath: {
    initialAcceptance: initialAcceptance.records[0].status,
    localPredictedIntent: predicted,
    authorityConsumed: {
      x: canonicalConsumed.x,
      z: canonicalConsumed.z,
      jump: Boolean(canonicalConsumed.jump),
      source: canonicalConsumed.source,
    },
    lateRevisionStatus: lateAcceptance.records[0].status,
    correctionReason: corrections[0].reason,
  },
  onTimeControl: {
    revisionStatus: controlRevision.records[0].status,
    authorityConsumed: {
      x: controlConsumed.x,
      z: controlConsumed.z,
      jump: Boolean(controlConsumed.jump),
      source: controlConsumed.source,
    },
    correctionRequiredForRevisionRace: false,
  },
  verdict: "LATE_SELF_REVISION_CAUSES_AUTHORITY_CONSUMED_CORRECTION",
  conclusion: "A future local intent revision can already be used by client prediction while transport delay makes that same revision late at authority. Authority then consumes the older accepted intent, and world_v0_consumed legitimately forces the client to rewind from revised prediction to older canonical truth.",
  nonClaim: "This proves the semantic race and correction requirement. It does not quantify what fraction of production authority-consumed corrections are caused by this path.",
};

writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
console.log(result.verdict);
