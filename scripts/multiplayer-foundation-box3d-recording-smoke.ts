import assert from "node:assert/strict";
import Box3D from "box3d.js";

const b3 = await Box3D();

for (const api of [
  "b3CreateRecording",
  "b3DestroyRecording",
  "b3World_StartRecording",
  "b3World_StopRecording",
  "b3RecPlayer_CreateFromRecording",
  "b3RecPlayer_GetFrameCount",
  "b3RecPlayer_StepFrame",
  "b3RecPlayer_IsAtEnd",
  "b3RecPlayer_HasDiverged",
  "b3RecPlayer_GetDivergeFrame",
  "b3RecPlayer_Destroy",
]) {
  assert.equal(typeof (b3 as Record<string, unknown>)[api], "function", `box3d.js@0.1.1 must expose ${api}`);
}

const worldDef = b3.b3DefaultWorldDef();
worldDef.gravity = [0, -10, 0];
const world = b3.b3CreateWorld(worldDef);

const groundDef = b3.b3DefaultBodyDef();
groundDef.position = [0, -0.5, 0];
const ground = b3.b3CreateBody(world, groundDef);
b3.b3CreateBoxShape(ground, b3.b3DefaultShapeDef(), 8, 0.5, 8);

const bodyDef = b3.b3DefaultBodyDef();
bodyDef.type = b3.b3BodyType.b3_dynamicBody;
bodyDef.position = [0, 3, 0];
const body = b3.b3CreateBody(world, bodyDef);
const shapeDef = b3.b3DefaultShapeDef();
shapeDef.density = 1;
shapeDef.baseMaterial.friction = 0.7;
b3.b3CreateBoxShape(body, shapeDef, 0.5, 0.5, 0.5);

const dt = 1 / 60;
for (let i = 0; i < 45; i += 1) {
  b3.b3World_Step(world, dt, 4);
}

const recording = b3.b3CreateRecording(8 * 1024 * 1024);
assert(recording, "recording allocation failed");
b3.b3World_StartRecording(world, recording);

const recordedFrames = 120;
for (let i = 0; i < recordedFrames; i += 1) {
  if (i === 10) b3.b3Body_SetLinearVelocity(body, [2.5, 1.5, -0.75]);
  if (i === 50) b3.b3Body_SetAngularVelocity(body, [0.25, 1.0, -0.5]);
  b3.b3World_Step(world, dt, 4);
}

b3.b3World_StopRecording(world);

// The recording owns the replay seed/log and is explicitly designed to outlive
// the source world. The JS binding intentionally hides the raw recording bytes
// and exposes a player constructed directly from the recording handle.
b3.b3DestroyWorld(world);

const player = b3.b3RecPlayer_CreateFromRecording(recording, 1);
assert(player, "recording player creation failed");
assert.equal(b3.b3RecPlayer_GetFrameCount(player), recordedFrames, "recording frame count drift");

// Box3D's contract is `while (StepFrame())`: the final call returns false when
// it consumes the end-of-recording boundary. `IsAtEnd` is therefore verified
// after the loop rather than used as a precondition for every successful step.
let replayedFrames = 0;
while (b3.b3RecPlayer_StepFrame(player)) {
  replayedFrames += 1;
}

assert.equal(replayedFrames, recordedFrames, "replay did not execute every recorded frame");
assert.equal(b3.b3RecPlayer_IsAtEnd(player), true, "replay must finish at end-of-recording");
assert.equal(b3.b3RecPlayer_HasDiverged(player), false, "Box3D recording replay diverged from its embedded state hashes");
assert.equal(b3.b3RecPlayer_GetDivergeFrame(player), -1, "non-diverged replay must not report a diverge frame");

b3.b3RecPlayer_Destroy(player);
b3.b3DestroyRecording(recording);

console.log(
  `MULTIPLAYER FOUNDATION BOX3D RECORDING SMOKE PASS · mid-session seed snapshot + ${recordedFrames}-frame exact replay through box3d.js binding`,
);
