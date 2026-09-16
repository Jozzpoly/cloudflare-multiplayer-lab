import { readFileSync, writeFileSync } from "node:fs";

const path = new URL("../public/world-v0/app.js", import.meta.url);
let source = readFileSync(path, "utf8");

const start = source.indexOf("function noteCanonicalJumpDelivery(");
const end = source.indexOf("// I3 logical input authorship scheduler.", start);
if (start < 0 || end <= start) throw new Error("jump delivery source seam missing");
const current = source.slice(start, end);
if (!current.includes("if (jumpDelivery.pending && jump)")) throw new Error("unexpected current jump delivery semantics");
if (current.includes("WORLD_V0_JUMP_REARM_DRAIN_V26")) throw new Error("V26 jump drain already installed");

const replacement = `function noteCanonicalJumpDelivery(targetTick, jump, jumpApplied) {
  // WORLD_V0_JUMP_REARM_DRAIN_V26
  // A press may only be confirmed by canonical true from a tick that this exact
  // pending press actually authored. More importantly, the next press is not armed
  // until authority has traversed the complete true-window authored by the previous
  // press, so a late retraction cannot leave an old true able to confirm a new edge.
  if (jumpApplied && jumpDelivery.lastAppliedTick !== targetTick) {
    jumpDelivery.appliedCount += 1;
    jumpDelivery.lastAppliedTick = targetTick;
  }

  const pendingPressOwnsTick = jumpDelivery.pending
    && jump
    && Number.isInteger(jumpDelivery.firstAuthoredTick)
    && Number.isInteger(jumpDelivery.lastAuthoredTick)
    && targetTick >= jumpDelivery.firstAuthoredTick
    && targetTick <= jumpDelivery.lastAuthoredTick;

  if (jumpDelivery.pending && jump && !pendingPressOwnsTick) {
    recordLifecycle("jump-delivery-stale-ignored", {
      sequence: jumpDelivery.pendingSequence,
      targetTick,
      firstAuthoredTick: jumpDelivery.firstAuthoredTick,
      lastAuthoredTick: jumpDelivery.lastAuthoredTick,
      revision: "WORLD_V0_JUMP_REARM_DRAIN_V26",
    });
  }

  if (pendingPressOwnsTick) {
    jumpDelivery.pending = false;
    jumpDelivery.deliveredSequence = jumpDelivery.pendingSequence;
    jumpDelivery.pendingSequence = null;
    jumpDelivery.deliveredTick = targetTick;
    jumpDelivery.lastDeliveredApplied = Boolean(jumpApplied);
    recordLifecycle("jump-delivery-canonical", {
      sequence: jumpDelivery.deliveredSequence,
      targetTick,
      jumpApplied: Boolean(jumpApplied),
    });
  }

  const priorTrueWindowDrained = Number.isInteger(jumpDelivery.lastAuthoredTick)
    && targetTick >= jumpDelivery.lastAuthoredTick;
  if (!jumpDelivery.pending && !jump && !jumpDelivery.edgeArmed) {
    if (priorTrueWindowDrained) {
      jumpDelivery.edgeArmed = true;
      jumpDelivery.rearmedTick = targetTick;
      recordLifecycle("jump-delivery-rearmed", { targetTick });
    } else {
      recordLifecycle("jump-delivery-rearm-deferred", {
        targetTick,
        lastAuthoredTick: jumpDelivery.lastAuthoredTick,
        revision: "WORLD_V0_JUMP_REARM_DRAIN_V26",
      });
    }
  }
}

`;

source = source.slice(0, start) + replacement + source.slice(end);
writeFileSync(path, source);
console.log("WORLD_V0_JUMP_REARM_DRAIN_V26_INSTALLED");
