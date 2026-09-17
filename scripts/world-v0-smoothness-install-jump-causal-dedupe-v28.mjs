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
  // Highest explicit jump event identity accepted as future authority truth. This is
  // the resume allocation high-water, so an accepted future event reserves its identity
  // before a fresh page can reconnect and allocate another press. Rejected records do
  // not reserve identity because they never entered the authority input timeline.
  lastSeenJumpSequence: number;
  // Highest explicit jump event identity canonically consumed in this ActorSession.
  // Advancing on canonical consumption (not on physical application) prevents a rejected
  // airborne press from becoming a delayed landing impulse when stale truth is replayed.
  lastConsumedJumpSequence: number;
`,
"SharedYardPlayer causal high-waters",
);

replaceExact(
`        resumeCount: 0,
        previousJumpIntent: false,
`,
`        resumeCount: 0,
        previousJumpIntent: false,
        lastSeenJumpSequence: 0,
        lastConsumedJumpSequence: 0,
`,
"new ActorSession causal high-water initialization",
);

replaceExact(
`    const acceptance = player.input.acceptBatch(
      message,
      this.tick,
      this.protocolStartTick,
      WORLD_V0_MAX_FUTURE_TICKS,
    );
`,
`    const acceptance = player.input.acceptBatch(
      message,
      this.tick,
      this.protocolStartTick,
      WORLD_V0_MAX_FUTURE_TICKS,
    );
    if (acceptance.batchStatus === "accepted_batch") {
      for (const record of acceptance.records) {
        const reservesAuthorityTruth = record.status === "accepted" || record.status === "superseded";
        if (
          reservesAuthorityTruth &&
          record.jump === true &&
          typeof record.jumpSequence === "number" &&
          Number.isInteger(record.jumpSequence)
        ) {
          player.lastSeenJumpSequence = Math.max(player.lastSeenJumpSequence, record.jumpSequence);
        }
      }
    }
`,
"accepted causal jump high-water",
);

replaceExact(
`      resumeCount: player.resumeCount,
      resumeLastBatchSeq: player.input.stats().lastBatchSeq,
`,
`      resumeCount: player.resumeCount,
      resumeLastBatchSeq: player.input.stats().lastBatchSeq,
      resumeLastJumpSequence: player.lastSeenJumpSequence,
`,
"resume jump allocation high-water",
);

replaceExact(
`      const jumpIntent = Boolean(input.jump);
      const jumpTrigger = active && jumpIntent && !player.previousJumpIntent;
      player.previousJumpIntent = active ? jumpIntent : false;
      const jumpApplied = this.applyIntent(player.body, input.x, input.z, jumpTrigger);
`,
`      const jumpIntent = Boolean(input.jump);
      const jumpSequence = typeof input.jumpSequence === "number" && Number.isInteger(input.jumpSequence)
        ? input.jumpSequence
        : null;
      let jumpTrigger = false;
      if (active && jumpIntent) {
        if (jumpSequence !== null) {
          if (jumpSequence > player.lastConsumedJumpSequence) {
            player.lastConsumedJumpSequence = jumpSequence;
            player.lastSeenJumpSequence = Math.max(player.lastSeenJumpSequence, jumpSequence);
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
