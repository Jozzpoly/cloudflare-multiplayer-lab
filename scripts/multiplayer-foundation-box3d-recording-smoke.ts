import assert from "node:assert/strict";
import Box3D from "box3d.js";

const b3 = await Box3D();

for (const api of [
  "b3CreateRecording",
  "b3DestroyRecording",
  "b3Recording_GetData",
  "b3Recording_GetSize",
  "b3World_StartRecording",
  "b3World_StopRecording",
  "b3ValidateReplay",
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

const recording = b3.b3CreateRecording(0);
assert(recording, "recording allocation failed");
b3.b3World_StartRecording(world, recording);

for (let i = 0; i < 120; i += 1) {
  if (i === 10) b3.b3Body_SetLinearVelocity(body, [2.5, 1.5, -0.75]);
  if (i === 50) b3.b3Body_SetAngularVelocity(body, [0.25, 1.0, -0.5]);
  b3.b3World_Step(world, dt, 4);
}

b3.b3World_StopRecording(world);
const byteLength = b3.b3Recording_GetSize(recording);
const data = b3.b3Recording_GetData(recording);
assert(byteLength > 0, "recording must contain bytes");
assert(data, "recording data pointer must be non-null");

// The recording buffer is explicitly documented to outlive its source world.
b3.b3DestroyWorld(world);

const replayValid = b3.b3ValidateReplay(data, byteLength, 1);
assert.equal(replayValid, true, "Box3D recording replay must reproduce the recorded run exactly");

b3.b3DestroyRecording(recording);

console.log(
  `MULTIPLAYER FOUNDATION BOX3D RECORDING SMOKE PASS · box3d.js exposes mid-session seed snapshot + exact replay validator · recordingBytes=${byteLength}`,
);
