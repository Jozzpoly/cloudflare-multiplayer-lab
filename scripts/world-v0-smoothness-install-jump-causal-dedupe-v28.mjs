import { readFileSync, writeFileSync } from "node:fs";

const TARGET = "src/world-v0-shared-yard.ts";
let source = readFileSync(TARGET, "utf8");

function replaceExact(before, after, label) {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly one match, found ${count}`);
  source = source.replace(before, after);
}

replaceExact(
`  // Raw canonical jump intent from the previous authority tick. Physical jump is
  // edge-triggered so a multi-tick transport-durable intent window yields one impulse.
  previousJumpIntent: boolean;
`,
`  // Legacy fallback for input records without explicit causal provenance.
  previousJumpIntent: boolean;
  // Highest explicit jump event identity canonically consumed in this ActorSession.
  // It survives transport reconnect because SharedYardPlayer survives resume. Advancing
  // on canonical consumption (not on physical application) prevents a rejected airborne
  // press from becoming a delayed landing impulse when stale truth is replayed later.
  lastConsumedJumpSequence: number;
`,
"SharedYardPlayer causal high-water",
);

replaceExact(
`        resumeCount: 0,
        previousJumpIntent: false,
`,
`        resumeCount: 0,
        previousJumpIntent: false,
        lastConsumedJumpSequence: 0,
`,
"new ActorSession causal high-water initialization",
);

replaceExact(
`      const jumpIntent = Boolean(input.jump);
      const jumpTrigger = active && jumpIntent && !player.previousJumpIntent;
      player.previousJumpIntent = active ? jumpIntent : false;
      const jumpApplied = this.applyIntent(player.body, input.x, input.z, jumpTrigger);
`,
`      const jumpIntent = Boolean(input.jump);
      const jumpSequence = Number.isInteger(input.jumpSequence) ? input.jumpSequence : null;
      let jumpTrigger = false;
      if (active && jumpIntent) {
        if (jumpSequence !== null) {
          if (jumpSequence > player.lastConsumedJumpSequence) {
            player.lastConsumedJumpSequence = jumpSequence;
            jumpTrigger = true;
          }
        } else {
          // Compatibility fallback only. V28 browser input is expected to carry an
          // ActorSession-wide causal sequence; unsequenced legacy traffic retains the
          // historical boolean-edge behavior rather than silently changing semantics.
          jumpTrigger = !player.previousJumpIntent;
        }
      }
      player.previousJumpIntent = active ? jumpIntent : false;
      const jumpApplied = this.applyIntent(player.body, input.x, input.z, jumpTrigger);
`,
"authority causal jump consumption",
);

writeFileSync(TARGET, source);
console.log("WORLD_V0_JUMP_CAUSAL_DEDUPE_V28_INSTALLED");
