import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";

const OUTPUT = process.env.MW_WORLD_V0_JUMP_ASSOCIATION_OUTPUT || "world-v0-smoothness-jump-sequence-association.json";
const source = readFileSync(new URL("../public/world-v0/app.js", import.meta.url), "utf8");

function sourceSlice(name, nextName) {
  const start = source.indexOf(`function ${name}(`);
  const end = source.indexOf(`function ${nextName}(`, start + 1);
  assert(start >= 0 && end > start, `source seam missing ${name}`);
  return source.slice(start, end);
}

const canonicalSource = sourceSlice("noteCanonicalJumpDelivery", "stopLogicalInputScheduler");
assert(canonicalSource.includes("if (jumpDelivery.pending && jump)"), "current jump delivery condition changed");
assert(!canonicalSource.includes("firstAuthoredTick"), "current delivery unexpectedly already checks authored association");

function freshJumpDelivery() {
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
    appliedCount: 0,
    lastAppliedTick: null,
  };
}

function queueJump(state) {
  if (state.pending || !state.edgeArmed) return false;
  state.pressSequence += 1;
  state.pending = true;
  state.edgeArmed = false;
  state.pendingSequence = state.pressSequence;
  state.firstAuthoredTick = null;
  state.lastAuthoredTick = null;
  state.deliveredTick = null;
  state.lastDeliveredApplied = null;
  state.rearmedTick = null;
  return true;
}

function noteJumpAuthoredTick(state, targetTick) {
  if (!state.pending || !Number.isInteger(targetTick)) return;
  if (!Number.isInteger(state.firstAuthoredTick)) state.firstAuthoredTick = targetTick;
  state.lastAuthoredTick = Number.isInteger(state.lastAuthoredTick)
    ? Math.max(state.lastAuthoredTick, targetTick)
    : targetTick;
}

function currentCanonicalDelivery(state, targetTick, jump, jumpApplied) {
  if (jumpApplied && state.lastAppliedTick !== targetTick) {
    state.appliedCount += 1;
    state.lastAppliedTick = targetTick;
  }
  if (state.pending && jump) {
    state.pending = false;
    state.deliveredSequence = state.pendingSequence;
    state.pendingSequence = null;
    state.deliveredTick = targetTick;
    state.lastDeliveredApplied = Boolean(jumpApplied);
  }
  if (!state.pending && !jump && !state.edgeArmed) {
    state.edgeArmed = true;
    state.rearmedTick = targetTick;
  }
}

function guardedCanonicalDelivery(state, targetTick, jump, jumpApplied) {
  if (jumpApplied && state.lastAppliedTick !== targetTick) {
    state.appliedCount += 1;
    state.lastAppliedTick = targetTick;
  }
  const belongsToPendingPress = state.pending
    && jump
    && Number.isInteger(state.firstAuthoredTick)
    && targetTick >= state.firstAuthoredTick;
  if (belongsToPendingPress) {
    state.pending = false;
    state.deliveredSequence = state.pendingSequence;
    state.pendingSequence = null;
    state.deliveredTick = targetTick;
    state.lastDeliveredApplied = Boolean(jumpApplied);
  }
  if (!state.pending && !jump && !state.edgeArmed) {
    state.edgeArmed = true;
    state.rearmedTick = targetTick;
  }
}

// Owner-run-shaped falsifier: a fresh press is pending, but an older canonical true
// arrives before the scheduler has authored any target for that new press.
const ownerCurrent = freshJumpDelivery();
ownerCurrent.pressSequence = 29;
ownerCurrent.edgeArmed = true;
assert(queueJump(ownerCurrent));
assert.equal(ownerCurrent.pendingSequence, 30);
assert.equal(ownerCurrent.firstAuthoredTick, null);
currentCanonicalDelivery(ownerCurrent, 2875, true, false);
assert.equal(ownerCurrent.pending, false, "current semantics no longer falsely clear an unauthored press");
assert.equal(ownerCurrent.deliveredSequence, 30);
assert.equal(ownerCurrent.deliveredTick, 2875);

const ownerGuarded = freshJumpDelivery();
ownerGuarded.pressSequence = 29;
ownerGuarded.edgeArmed = true;
assert(queueJump(ownerGuarded));
guardedCanonicalDelivery(ownerGuarded, 2875, true, false);
assert.equal(ownerGuarded.pending, true, "guard failed to reject stale true before first authorship");
assert.equal(ownerGuarded.deliveredSequence, 0);
assert.equal(ownerGuarded.deliveredTick, null);

// Lower-bound falsifier after the new press has actually authored a future range.
noteJumpAuthoredTick(ownerGuarded, 2882);
noteJumpAuthoredTick(ownerGuarded, 2888);
guardedCanonicalDelivery(ownerGuarded, 2881, true, false);
assert.equal(ownerGuarded.pending, true, "guard accepted canonical true older than this press's first authored tick");

// Positive control: a canonical true at a tick actually authored by the pending press
// still completes delivery normally.
guardedCanonicalDelivery(ownerGuarded, 2884, true, true);
assert.equal(ownerGuarded.pending, false, "guard rejected valid canonical delivery");
assert.equal(ownerGuarded.deliveredSequence, 30);
assert.equal(ownerGuarded.deliveredTick, 2884);
assert.equal(ownerGuarded.lastDeliveredApplied, true);

const result = {
  revision: "world-v0-jump-sequence-association-audit-v1",
  currentSourceCondition: "pending && jump",
  ownerRunShape: {
    pendingSequence: 30,
    staleCanonicalTargetTick: 2875,
    firstAuthoredTickAtArrival: null,
    currentSemanticsFalselyDeliver: true,
  },
  guardedControl: {
    staleBeforeAuthorshipRejected: true,
    staleBelowFirstAuthoredRejected: true,
    firstAuthoredTick: 2882,
    lastAuthoredTick: 2888,
    validCanonicalTargetTick: 2884,
    validDeliveryAccepted: true,
  },
  verdict: "JUMP_PENDING_SEQUENCE_CAN_BE_FALSELY_CONFIRMED_BY_STALE_CANONICAL_TRUE",
  conclusion: "The production V25 browser associates any canonical jump=true with the currently pending press, even when that press has not authored a single target tick yet. Therefore a delayed canonical true from an earlier persistent jump window can clear a newer press and cause the scheduler to retract that newer press's future jump=true records. Requiring an authored lower-bound association rejects the stale case while preserving an in-range canonical delivery in this falsifier.",
  nonClaim: "This proves the client-side sequence-association defect and the local sufficiency of a lower-bound guard for the exercised cases. It does not yet prove that a one-field guard is the final production design, nor quantify how much Owner-visible correction pressure disappears after fixing it.",
};

writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
console.log(result.verdict);
