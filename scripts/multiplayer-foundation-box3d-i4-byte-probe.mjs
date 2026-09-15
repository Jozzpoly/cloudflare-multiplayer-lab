import assert from "node:assert/strict";
import Box3D from "../public/world-v0/box3d-i4/box3d.inline.mjs";

const b3 = await Box3D();

for (const name of [
  "b3Recording_CopyData",
  "b3Bytes_Fnv1a32",
  "b3RecPlayer_CreateFromBytes",
]) {
  assert.equal(typeof b3[name], "function", `pinned i4 runtime missing ${name}`);
}

const worldDef = b3.b3DefaultWorldDef();
worldDef.gravity = [0, -10, 0];
const world = b3.b3CreateWorld(worldDef);

const groundDef = b3.b3DefaultBodyDef();
groundDef.position = [0, -0.5, 0];
const ground = b3.b3CreateBody(world, groundDef);
b3.b3Body_SetName(ground, "ground");
b3.b3CreateBoxShape(ground, b3.b3DefaultShapeDef(), 4, 0.5, 4);

const bodyDef = b3.b3DefaultBodyDef();
bodyDef.type = b3.b3BodyType.b3_dynamicBody;
bodyDef.position = [0.35, 1.2, -0.2];
const body = b3.b3CreateBody(world, bodyDef);
b3.b3Body_SetName(body, "actor:0");
const shapeDef = b3.b3DefaultShapeDef();
shapeDef.density = 1;
shapeDef.baseMaterial.friction = 0.7;
b3.b3CreateBoxShape(body, shapeDef, 0.35, 0.35, 0.35);

for (let tick = 0; tick < 45; tick += 1) {
  b3.b3World_Step(world, 1 / 60, 4);
}

function bodyState(target) {
  const p = [0, 0, 0];
  const q = [0, 0, 0, 1];
  const lv = [0, 0, 0];
  const av = [0, 0, 0];
  b3.b3Body_GetPosition(p, target);
  b3.b3Body_GetRotation(q, target);
  b3.b3Body_GetLinearVelocity(lv, target);
  b3.b3Body_GetAngularVelocity(av, target);
  return [...p, ...q, ...lv, ...av].map(Math.fround);
}

const sourceState = bodyState(body);
const recording = b3.b3CreateRecording(0);
b3.b3World_StartRecording(world, recording);
b3.b3World_StopRecording(world);
const reportedSize = b3.b3Recording_GetSize(recording);
assert(Number.isInteger(reportedSize) && reportedSize > 0, "pinned i4 recording must be non-empty");

const bytes = b3.b3Recording_CopyData(recording);
assert(bytes instanceof Uint8Array, "pinned i4 CopyData must return Uint8Array");
assert.equal(bytes.byteLength, reportedSize, "pinned i4 copied byte length mismatch");
const checksum = b3.b3Bytes_Fnv1a32(bytes) >>> 0;

const replay = b3.b3RecPlayer_CreateFromBytes(bytes, 1);
assert(replay, "pinned i4 CreateFromBytes returned no replay player");
const replayWorld = b3.b3RecPlayer_GetWorldId(replay);
assert(b3.b3World_IsValid(replayWorld), "pinned i4 replay world is invalid");
assert.equal(b3.b3RecPlayer_GetBodyCount(replay), 2, "pinned i4 replay body count mismatch");

let replayActor = null;
const recoveredNames = [];
for (let ordinal = 0; ordinal < b3.b3RecPlayer_GetBodyCount(replay); ordinal += 1) {
  const recovered = b3.b3RecPlayer_GetBodyId(replay, ordinal);
  assert(b3.b3Body_IsValid(recovered));
  const name = b3.b3Body_GetName(recovered);
  recoveredNames.push(name);
  if (name === "actor:0") replayActor = recovered;
}
assert(replayActor, "pinned i4 replay lost actor semantic body name");
assert.deepEqual(bodyState(replayActor), sourceState, "pinned i4 byte replay state mismatch at seed boundary");

// A single flipped byte must not be accepted as the same payload checksum.
const corrupted = Uint8Array.from(bytes);
corrupted[Math.floor(corrupted.length / 2)] ^= 0x01;
assert.notEqual(b3.b3Bytes_Fnv1a32(corrupted) >>> 0, checksum, "pinned i4 checksum failed to detect byte mutation");

b3.b3RecPlayer_Destroy(replay);
b3.b3DestroyRecording(recording);
b3.b3DestroyWorld(world);

console.log("MULTIPLAYER_FOUNDATION_BOX3D_I4_BYTE_PROBE_PASS", JSON.stringify({
  build: "i4-raw-seed-bindings-box3djs-5d5a3af-emsdk-6.0.2",
  byteLength: bytes.byteLength,
  fnv1a32: checksum.toString(16).padStart(8, "0"),
  recoveredNames: recoveredNames.sort(),
  sourceStateScalars: sourceState.length,
}));
