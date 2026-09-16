import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";

const OUTPUT = process.env.MW_WORLD_V0_JUMP_DRAIN_OUTPUT || "world-v0-smoothness-jump-rearm-drain.json";

function fresh() {
  return {
    pending: false,
    edgeArmed: true,
    pressSequence: 0,
    pendingSequence: null,
    firstAuthoredTick: null,
    lastAuthoredTick: null,
    deliveredSequence: 0,
    deliveredTick: null,
    lastDeliveredApplied: null,
    rearmedTick: null,
  };
}

function queueJump(s) {
  if (s.pending || !s.edgeArmed) return false;
  s.pressSequence += 1;
  s.pending = true;
  s.edgeArmed = false;
  s.pendingSequence = s.pressSequence;
  s.firstAuthoredTick = null;
  s.lastAuthoredTick = null;
  s.deliveredTick = null;
  s.lastDeliveredApplied = null;
  s.rearmedTick = null;
  return true;
}

function authored(s, first, last) {
  assert(s.pending);
  s.firstAuthoredTick = first;
  s.lastAuthoredTick = last;
}

function deliverCurrent(s, targetTick, jump) {
  if (s.pending && jump) {
    s.pending = false;
    s.deliveredSequence = s.pendingSequence;
    s.pendingSequence = null;
    s.deliveredTick = targetTick;
  }
  if (!s.pending && !jump && !s.edgeArmed) {
    s.edgeArmed = true;
    s.rearmedTick = targetTick;
  }
}

function deliverLowerBoundOnly(s, targetTick, jump) {
  if (s.pending && jump && Number.isInteger(s.firstAuthoredTick) && targetTick >= s.firstAuthoredTick) {
    s.pending = false;
    s.deliveredSequence = s.pendingSequence;
    s.pendingSequence = null;
    s.deliveredTick = targetTick;
  }
  if (!s.pending && !jump && !s.edgeArmed) {
    s.edgeArmed = true;
    s.rearmedTick = targetTick;
  }
}

function deliverDrainBarrier(s, targetTick, jump) {
  if (s.pending && jump && Number.isInteger(s.firstAuthoredTick) && Number.isInteger(s.lastAuthoredTick)
      && targetTick >= s.firstAuthoredTick && targetTick <= s.lastAuthoredTick) {
    s.pending = false;
    s.deliveredSequence = s.pendingSequence;
    s.pendingSequence = null;
    s.deliveredTick = targetTick;
  }
  const priorTrueWindowDrained = Number.isInteger(s.lastAuthoredTick) && targetTick >= s.lastAuthoredTick;
  if (!s.pending && !jump && !s.edgeArmed && priorTrueWindowDrained) {
    s.edgeArmed = true;
    s.rearmedTick = targetTick;
  }
}

// Construct the dangerous ordered canonical sequence without packet reordering:
// press A authored true through 2888, is delivered earlier, a retraction makes 2876 false,
// but a later retraction misses its deadline and authority still consumes true at 2884.
// Current semantics rearm on 2876, permitting press B to overlap that unresolved tail.
const current = fresh();
assert(queueJump(current));
authored(current, 2873, 2888);
deliverCurrent(current, 2873, true);
assert.equal(current.pending, false);
deliverCurrent(current, 2876, false);
assert.equal(current.edgeArmed, true, "current semantics did not early-rearm control");
assert(queueJump(current));
authored(current, 2882, 2888);
deliverCurrent(current, 2884, true);
assert.equal(current.deliveredSequence, 2, "current overlap did not falsely confirm press B");
assert.equal(current.deliveredTick, 2884);

// A lower-bound association check fixes the Owner-run 'before first authorship' shape,
// but it still accepts this stale true because 2884 lies inside press B's new authored range.
const lowerBound = fresh();
assert(queueJump(lowerBound));
authored(lowerBound, 2873, 2888);
deliverLowerBoundOnly(lowerBound, 2873, true);
deliverLowerBoundOnly(lowerBound, 2876, false);
assert.equal(lowerBound.edgeArmed, true);
assert(queueJump(lowerBound));
authored(lowerBound, 2882, 2888);
deliverLowerBoundOnly(lowerBound, 2884, true);
assert.equal(lowerBound.deliveredSequence, 2, "lower-bound control unexpectedly rejected overlapping stale true");

// Drain-barrier semantics refuse to rearm at 2876 because press A once authored true
// through 2888. The stale 2884 true therefore cannot be associated with a press B that
// is not yet allowed to exist. Once authority reaches a false at/after the tail, rearm is safe.
const drained = fresh();
assert(queueJump(drained));
authored(drained, 2873, 2888);
deliverDrainBarrier(drained, 2873, true);
assert.equal(drained.pending, false);
deliverDrainBarrier(drained, 2876, false);
assert.equal(drained.edgeArmed, false, "drain barrier rearmed before prior true window was resolved");
assert.equal(queueJump(drained), false, "drain barrier allowed overlapping press B");
deliverDrainBarrier(drained, 2884, true);
assert.equal(drained.deliveredSequence, 1, "stale true mutated delivery sequence while no new press existed");
deliverDrainBarrier(drained, 2889, false);
assert.equal(drained.edgeArmed, true, "drain barrier failed to rearm after canonical tail drained");
assert.equal(drained.rearmedTick, 2889);
assert(queueJump(drained));
authored(drained, 2890, 2896);
deliverDrainBarrier(drained, 2891, true);
assert.equal(drained.deliveredSequence, 2, "post-drain valid press did not deliver");
assert.equal(drained.deliveredTick, 2891);

const result = {
  revision: "world-v0-jump-rearm-drain-audit-v1",
  current: {
    priorTrueTail: 2888,
    earlyFalseTick: 2876,
    overlappingPressFirstAuthored: 2882,
    staleTrueTick: 2884,
    falselyDeliveredSequence: current.deliveredSequence,
  },
  lowerBoundOnly: {
    falselyDeliveredSequence: lowerBound.deliveredSequence,
    finding: "firstAuthoredTick lower-bound alone cannot distinguish an old true whose target tick overlaps the new press range",
  },
  drainBarrier: {
    earlyRearmRejected: true,
    overlapQueueRejected: true,
    staleTrueCouldNotConfirmNewPress: true,
    safeRearmTick: drained.rearmedTick,
    laterValidSequenceDelivered: drained.deliveredSequence,
  },
  verdict: "JUMP_REARM_MUST_DRAIN_PRIOR_AUTHORED_TRUE_WINDOW",
  conclusion: "The defect is not fully solved by checking only that canonical targetTick is at or after the new press's firstAuthoredTick. Because mutable-future retractions can be late, a stale true from press A may fall inside press B's authored tick range after an early canonical false re-arms the edge. Delaying rearm until canonical time has traversed the full lastAuthoredTick of press A prevents the two semantic press windows from overlapping; an authored-range check can then serve as defense in depth.",
  nonClaim: "This is an executable semantic falsifier, not yet a browser/network qualification. It does not claim the drain barrier has zero feel cost or that protocol provenance will never be preferable long term.",
};

writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
console.log(result.verdict);
