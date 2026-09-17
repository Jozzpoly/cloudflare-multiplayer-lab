import { readFileSync, writeFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";

const SOURCE = "scripts/world-v0-jump-provenance-v27-resume-collision-audit.mjs";
const GENERATED = "scripts/.world-v0-jump-resume-highwater-v28-generated.mjs";
const OUTPUT = process.env.MW_WORLD_V0_JUMP_RESUME_HIGHWATER_OUTPUT || "world-v0-jump-resume-highwater-v28.json";

let source = readFileSync(SOURCE, "utf8");

function replaceExact(before, after, label) {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly one match, found ${count}`);
  source = source.replace(before, after);
}

replaceExact(
`const result = {
  revision: "world-v0-jump-provenance-v27-resume-collision-audit-v1",
  generatedAt: new Date().toISOString(),
  roomId: ROOM_ID,
  verdict: "WORLD_V0_JUMP_PROVENANCE_RESUME_COLLISION_NOT_PROVEN",
};`,
`const result = {
  revision: "world-v0-jump-resume-highwater-v28-audit-v1",
  generatedAt: new Date().toISOString(),
  roomId: ROOM_ID,
  verdict: "WORLD_V0_JUMP_RESUME_HIGHWATER_V28_FAIL",
};`,
"result identity",
);

replaceExact(
`  assert(resetJump.pressSequence === 0,
    \`fresh page unexpectedly restored jump sequence high-water: \${JSON.stringify(resetJump)}\`);`,
`  assert(resetJump.pressSequence === 1,
    \`fresh page did not restore jump sequence high-water: \${JSON.stringify(resetJump)}\`);`,
"resume high-water expectation",
);

replaceExact(
`    \`(() => { const j=window.__sharedYardV0Evidence?.()?.inputScheduler?.jumpDelivery; return j?.pressSequence===1 && j?.deliveredSequence===1 && j?.pending===false && Number.isInteger(j?.deliveredTick); })()\`,
    "post-resume press causal delivery");`,
`    \`(() => { const j=window.__sharedYardV0Evidence?.()?.inputScheduler?.jumpDelivery; return j?.pressSequence===2 && j?.deliveredSequence===2 && j?.pending===false && Number.isInteger(j?.deliveredTick); })()\`,
    "post-resume press causal delivery");`,
"post-resume next sequence expectation",
);

replaceExact(
`  // This is the falsifier: two distinct user press events, separated by a fresh-page
  // bootstrap, occupied one continuous ActorSession but were both labelled sequence=1.
  // Therefore naked jumpSequence is process/page-local provenance, not an
  // ActorSession-wide event identity and cannot safely serve as a durable dedupe key.
  assert(firstJump.pressSequence === secondJump.pressSequence,
    \`expected sequence reuse was not reproduced: \${firstJump.pressSequence} vs \${secondJump.pressSequence}\`);
  assert(firstJump.deliveredSequence === secondJump.deliveredSequence,
    \`canonical delivered sequence reuse was not reproduced: \${firstJump.deliveredSequence} vs \${secondJump.deliveredSequence}\`);
  assert(firstDelivered.session.actorSessionId === secondDelivered.session.actorSessionId,
    "collision did not occur inside one ActorSession");`,
`  // Desired V28 contract: one ActorSession owns one monotonic causal event sequence.
  // A fresh JS page must resume the server-owned high-water and allocate the next
  // identity rather than restarting at 1.
  assert(firstJump.pressSequence === 1 && secondJump.pressSequence === 2,
    \`ActorSession jump sequence did not advance across fresh-page resume: \${firstJump.pressSequence} -> \${secondJump.pressSequence}\`);
  assert(firstJump.deliveredSequence === 1 && secondJump.deliveredSequence === 2,
    \`canonical delivered sequence did not advance across resume: \${firstJump.deliveredSequence} -> \${secondJump.deliveredSequence}\`);
  assert(firstDelivered.session.actorSessionId === secondDelivered.session.actorSessionId,
    "ActorSession changed across high-water resume proof");`,
"final causal identity assertions",
);

replaceExact(
`    verdict: "WORLD_V0_JUMP_PROVENANCE_RESUME_COLLISION_REPRODUCED",`,
`    verdict: "WORLD_V0_JUMP_RESUME_HIGHWATER_V28_PASS",`,
"pass verdict",
);

replaceExact(
`    duplicatedJumpSequence: secondJump.pressSequence,`,
`    resumedJumpHighWater: resetJump.pressSequence,
    nextJumpSequence: secondJump.pressSequence,`,
"result sequence evidence",
);

replaceExact(
`    finding: "Two distinct jump presses in one ActorSession reused jumpSequence=1 across fresh-page resume; raw jumpSequence is not ActorSession-wide unique.",`,
`    finding: "Fresh-page resume restored ActorSession jump high-water and the next distinct press advanced to the next causal identity.",`,
"result finding",
);

writeFileSync(GENERATED, source);
try {
  const run = spawnSync(process.execPath, [GENERATED], {
    env: { ...process.env, MW_WORLD_V0_JUMP_RESUME_OUTPUT: OUTPUT },
    encoding: "utf8",
    timeout: 180_000,
    maxBuffer: 32 * 1024 * 1024,
  });
  if (run.stdout) process.stdout.write(run.stdout);
  if (run.stderr) process.stderr.write(run.stderr);
  process.exitCode = run.status ?? 1;
} finally {
  try { rmSync(GENERATED, { force: true }); } catch {}
}
