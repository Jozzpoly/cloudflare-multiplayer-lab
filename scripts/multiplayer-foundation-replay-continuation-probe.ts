import assert from "node:assert/strict";
import Box3D from "box3d.js";

const b3 = await Box3D();
const DT = 1 / 60;
const SUBSTEPS = 4;
type Vec3 = [number, number, number];

for (const api of [
  "b3RecPlayer_CreateFromRecording",
  "b3RecPlayer_GetWorldId",
  "b3RecPlayer_GetBodyCount",
  "b3RecPlayer_GetBodyId",
  "b3RecPlayer_StepFrame",
  "b3RecPlayer_IsAtEnd",
]) {
  assert.equal(typeof (b3 as Record<string, unknown>)[api], "function", `box3d.js@0.1.1 must expose ${api}`);
}

const worldDef = b3.b3DefaultWorldDef();
worldDef.gravity = [0, 0, 0];
const sourceWorld = b3.b3CreateWorld(worldDef);
const bodyDef = b3.b3DefaultBodyDef();
bodyDef.type = b3.b3BodyType.b3_dynamicBody;
bodyDef.position = [1, 2, 3];
const sourceBody = b3.b3CreateBody(sourceWorld, bodyDef);
b3.b3CreateBoxShape(sourceBody, b3.b3DefaultShapeDef(), 0.5, 0.5, 0.5);
b3.b3Body_SetLinearVelocity(sourceBody, [0.5, 0, 0]);

const recording = b3.b3CreateRecording(0);
b3.b3World_StartRecording(sourceWorld, recording);
for (let frame = 0; frame < 30; frame += 1) {
  b3.b3World_Step(sourceWorld, DT, SUBSTEPS);
}
b3.b3World_StopRecording(sourceWorld);
b3.b3DestroyWorld(sourceWorld);

const player = b3.b3RecPlayer_CreateFromRecording(recording, 1);
assert(player, "replay player creation failed");
let replayedFrames = 0;
while (b3.b3RecPlayer_StepFrame(player)) replayedFrames += 1;
assert.equal(replayedFrames, 30);
assert.equal(b3.b3RecPlayer_IsAtEnd(player), true);
assert.equal(b3.b3RecPlayer_HasDiverged(player), false, "oracle replay must remain exact before continuation probe");

const replayWorld = b3.b3RecPlayer_GetWorldId(player);
assert.equal(b3.b3World_IsValid(replayWorld), true, "replay-owned world must remain valid at end-of-recording");
assert.equal(b3.b3RecPlayer_GetBodyCount(player), 1, "probe recording must expose exactly one body");
const replayBody = b3.b3RecPlayer_GetBodyId(player, 0);
assert.equal(b3.b3Body_IsValid(replayBody), true, "replay body must be valid after replay completes");
assert.equal(b3.b3Body_GetType(replayBody), b3.b3BodyType.b3_dynamicBody);

const before: Vec3 = [0, 0, 0];
b3.b3Body_GetPosition(before, replayBody);

// This is an empirical seam probe, not yet a supported persistence contract:
// mutate and manually step the replay-owned world after the recorded log ends.
b3.b3Body_SetLinearVelocity(replayBody, [-3, 0.5, 1.25]);
for (let frame = 0; frame < 30; frame += 1) {
  b3.b3World_Step(replayWorld, DT, SUBSTEPS);
}
const after: Vec3 = [0, 0, 0];
b3.b3Body_GetPosition(after, replayBody);
assert(after.every(Number.isFinite));
assert(Math.hypot(after[0] - before[0], after[1] - before[1], after[2] - before[2]) > 1.0, "replay-owned world did not accept post-replay mutation/stepping");

b3.b3RecPlayer_Destroy(player);
b3.b3DestroyRecording(recording);

console.log(
  `MULTIPLAYER FOUNDATION REPLAY CONTINUATION PROBE PASS · replayWorld accepted post-recording mutation + 30 manual steps · displacement=${Math.hypot(after[0] - before[0], after[1] - before[1], after[2] - before[2]).toFixed(6)}`,
);
