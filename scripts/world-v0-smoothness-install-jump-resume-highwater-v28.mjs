import { readFileSync, writeFileSync } from "node:fs";

const TARGET = "public/world-v0/app.js";
let source = readFileSync(TARGET, "utf8");

function replaceExact(before, after, label) {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly one match, found ${count}`);
  source = source.replace(before, after);
}

replaceExact(
`      if (!Number.isInteger(message.resumeLastBatchSeq) || message.resumeLastBatchSeq < 0) throw new Error("resumed batch sequence invalid");
`,
`      if (!Number.isInteger(message.resumeLastBatchSeq) || message.resumeLastBatchSeq < 0) throw new Error("resumed batch sequence invalid");
      if (!Number.isInteger(message.resumeLastJumpSequence) || message.resumeLastJumpSequence < 0) throw new Error("resumed jump sequence invalid");
`,
"resume jump high-water validation",
);

replaceExact(
`      batchSeq = Math.max(batchSeq, message.resumeLastBatchSeq);
`,
`      batchSeq = Math.max(batchSeq, message.resumeLastBatchSeq);
      // Causal event identity belongs to the ActorSession, not this JS page. Authority
      // returns the highest identity it has already seen in an accepted batch, including
      // still-pending future inputs, so a fresh page cannot collide with in-flight truth.
      jumpDelivery.pressSequence = Math.max(jumpDelivery.pressSequence, message.resumeLastJumpSequence);
`,
"resume jump high-water adoption",
);

writeFileSync(TARGET, source);
console.log("WORLD_V0_JUMP_RESUME_HIGHWATER_V28_INSTALLED");
