import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";

const OUTPUT = process.env.MW_WORLD_V0_JUMP_PROVENANCE_OUTPUT || "world-v0-smoothness-jump-provenance.json";
const protocol = readFileSync(new URL("../src/world-v0-protocol.ts", import.meta.url), "utf8");

// Ground this audit in the current wire contract: V25 carries jump value, not press identity.
assert(protocol.includes("export type WorldV0InputValue = { x: number; z: number; jump?: boolean }"));
assert(!protocol.includes("jumpSequence"), "current protocol unexpectedly already carries jump provenance");

function physicsSame(a, b) {
  return a.x === b.x && a.z === b.z && Boolean(a.jump) === Boolean(b.jump);
}

function scheduledSame(a, b) {
  return physicsSame(a, b) && (a.jumpSequence ?? null) === (b.jumpSequence ?? null);
}

function freshJump() {
  return {
    edgeArmed: true,
    pressSequence: 0,
    pending: false,
    pendingSequence: null,
    deliveredSequence: 0,
    deliveredTick: null,
    rearmedTick: null,
  };
}

function queuePress(s) {
  if (s.pending || !s.edgeArmed) return false;
  s.pressSequence += 1;
  s.pending = true;
  s.edgeArmed = false;
  s.pendingSequence = s.pressSequence;
  return true;
}

function consumeWithProvenance(s, record, jumpApplied = false) {
  if (s.pending && record.jump && record.jumpSequence === s.pendingSequence) {
    s.pending = false;
    s.deliveredSequence = s.pendingSequence;
    s.pendingSequence = null;
    s.deliveredTick = record.targetTick;
    s.lastDeliveredApplied = Boolean(jumpApplied);
  }
  if (!s.pending && !record.jump && !s.edgeArmed) {
    s.edgeArmed = true;
    s.rearmedTick = record.targetTick;
  }
}

// A physics-identical true from a newer press must still supersede transport provenance.
const seq29 = { targetTick: 2884, x: 0, z: 1, jump: true, jumpSequence: 29 };
const seq30 = { targetTick: 2884, x: 0, z: 1, jump: true, jumpSequence: 30 };
assert.equal(physicsSame(seq29, seq30), true, "control: provenance changed physics");
assert.equal(scheduledSame(seq29, seq30), false, "provenance-aware scheduling failed to supersede same-physics press identity");

// Owner-shaped stale true: historical seq29 arrives while seq30 is pending.
const owner = freshJump();
owner.pressSequence = 29;
assert(queuePress(owner));
assert.equal(owner.pendingSequence, 30);
consumeWithProvenance(owner, { targetTick: 2875, x: 0, z: 1, jump: true, jumpSequence: 29 }, false);
assert.equal(owner.pending, true, "stale seq29 falsely confirmed pending seq30");
assert.equal(owner.deliveredSequence, 0);

// Harder overlap that defeated firstAuthoredTick/lower-bound heuristics.
consumeWithProvenance(owner, seq29, false);
assert.equal(owner.pending, true, "overlapping stale seq29 falsely confirmed pending seq30");
consumeWithProvenance(owner, seq30, false);
assert.equal(owner.pending, false, "consumed seq30 failed to confirm pending seq30");
assert.equal(owner.deliveredSequence, 30);
assert.equal(owner.deliveredTick, 2884);
assert.equal(owner.lastDeliveredApplied, false, "airborne/non-applied delivery semantics were lost");

// Preserve prompt re-arm semantics: no drain to the end of the prior authored true window.
consumeWithProvenance(owner, { targetTick: 2885, x: 0, z: 1, jump: false, jumpSequence: null }, false);
assert.equal(owner.edgeArmed, true, "canonical false failed to rearm promptly after correctly identified delivery");
assert.equal(owner.rearmedTick, 2885);
assert(queuePress(owner));
assert.equal(owner.pendingSequence, 31, "rapid next press was blocked despite causal provenance");

// A true belonging to seq31 can clear seq31 even if the physical jump impulse cannot apply.
consumeWithProvenance(owner, { targetTick: 2887, x: 0, z: 1, jump: true, jumpSequence: 31 }, false);
assert.equal(owner.pending, false);
assert.equal(owner.deliveredSequence, 31);
assert.equal(owner.lastDeliveredApplied, false);

const result = {
  revision: "world-v0-jump-explicit-provenance-audit-v1",
  currentWireCarriesJumpSequence: false,
  samePhysicsDifferentSequence: {
    physicsSame: true,
    scheduledSame: false,
    requiresAuthoritySupersession: true,
  },
  ownerStaleBeforeAuthorshipRejected: true,
  overlappingStaleTrueRejected: true,
  matchingSequenceDelivered: true,
  promptFalseRearmPreserved: true,
  rapidNextPressPreserved: true,
  airborneNonAppliedDeliveryPreserved: true,
  verdict: "EXPLICIT_JUMP_PROVENANCE_RESOLVES_STALE_TRUE_ASSOCIATION_WITHOUT_DRAIN_BARRIER",
  conclusion: "The ambiguity is caused by the wire contract carrying only jump value, not causal press identity. If jump=true records carry jumpSequence and authority preserves/echoes the winning sequence for each target tick, stale canonical true from an older press cannot confirm a newer pending press even when their authored tick ranges overlap. Provenance-only changes must supersede pending authority records despite identical physics values; physics equality itself remains unchanged. This preserves immediate re-arm and airborne/non-applied delivery semantics without a drain barrier.",
  nonClaim: "This is a semantic contract audit. It does not yet qualify a changed wire protocol, parser, server buffer, peer relay, browser scheduler, or Owner-visible correction improvement.",
};

writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
console.log(result.verdict);
