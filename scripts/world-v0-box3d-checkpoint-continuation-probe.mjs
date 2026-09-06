import Box3D from "box3d.js/inline";

const b3 = await Box3D();
function assert(condition, message) { if (!condition) throw new Error(message); }
function f32bits(value) {
  const buffer = new ArrayBuffer(4);
  const view = new DataView(buffer);
  view.setFloat32(0, value, true);
  return view.getUint32(0, true).toString(16).padStart(8, "0");
}
function vec3(body, fn) {
  const out = [0, 0, 0];
  fn(out, body);
  return [...out];
}
function quat(body) {
  const out = [0, 0, 0, 1];
  b3.b3Body_GetRotation(out, body);
  return [...out];
}
function bodyPacked(body) {
  return [
    ...vec3(body, b3.b3Body_GetPosition),
    ...quat(body),
    ...vec3(body, b3.b3Body_GetLinearVelocity),
    ...vec3(body, b3.b3Body_GetAngularVelocity),
  ].map(f32bits).join("");
}
function worldPacked(bodies) {
  return [...bodies.entries()].sort(([a], [c]) => a.localeCompare(c)).map(([name, body]) => `${name}:${bodyPacked(body)}`).join("|");
}

function createGround(world) {
  const def = b3.b3DefaultBodyDef();
  def.position = [0, -0.5, 0];
  const body = b3.b3CreateBody(world, def);
  b3.b3Body_SetName(body, "ground");
  const shape = b3.b3DefaultShapeDef();
  shape.baseMaterial.friction = 0.8;
  b3.b3CreateBoxShape(body, shape, 8, 0.5, 4);
  return body;
}

function createDynamicBox(world, name, position, half = [0.5, 0.5, 0.5], density = 10) {
  const def = b3.b3DefaultBodyDef();
  def.type = b3.b3BodyType.b3_dynamicBody;
  def.position = [...position];
  def.linearDamping = 0.04;
  def.angularDamping = 0.08;
  const body = b3.b3CreateBody(world, def);
  b3.b3Body_SetName(body, name);
  const shape = b3.b3DefaultShapeDef();
  shape.density = density;
  shape.baseMaterial.friction = 0.78;
  shape.baseMaterial.restitution = 0.02;
  b3.b3CreateBoxShape(body, shape, half[0], half[1], half[2]);
  return body;
}

function makeWorld() {
  const wd = b3.b3DefaultWorldDef();
  wd.gravity = [0, -20, 0];
  const world = b3.b3CreateWorld(wd);
  createGround(world);
  const bodies = new Map();
  bodies.set("pusher", createDynamicBox(world, "pusher", [-3.2, 0.55, 0], [0.45, 0.55, 0.45], 35));
  bodies.set("box-a", createDynamicBox(world, "box-a", [-0.2, 0.5, 0], [0.5, 0.5, 0.5], 18));
  bodies.set("box-b", createDynamicBox(world, "box-b", [0.82, 0.5, 0], [0.5, 0.5, 0.5], 18));
  bodies.set("box-c", createDynamicBox(world, "box-c", [1.84, 0.5, 0], [0.5, 0.5, 0.5], 18));
  return { world, bodies };
}

function drive(bodies, tick) {
  const pusher = bodies.get("pusher");
  assert(pusher, "pusher missing");
  const speed = tick < 90 ? 3.2 : tick < 150 ? 2.1 : tick < 195 ? -1.1 : 1.6;
  const velocity = vec3(pusher, b3.b3Body_GetLinearVelocity);
  b3.b3Body_SetLinearVelocity(pusher, [speed, velocity[1], 0]);
}

function step(world, bodies, tick) {
  drive(bodies, tick);
  b3.b3World_Step(world, 1 / 60, 4);
}

function replayBodies(player) {
  const bodies = new Map();
  const count = b3.b3RecPlayer_GetBodyCount(player);
  for (let i = 0; i < count; i += 1) {
    const body = b3.b3RecPlayer_GetBodyId(player, i);
    if (!b3.b3Body_IsValid(body)) continue;
    const name = b3.b3Body_GetName(body);
    if (["pusher", "box-a", "box-b", "box-c"].includes(name)) bodies.set(name, body);
  }
  assert(bodies.size === 4, `replay body remap incomplete: ${[...bodies.keys()].join(",")}`);
  return bodies;
}

const capabilityNames = Object.keys(b3).filter((name) => /Recording|RecPlayer|ValidateReplay/.test(name)).sort();
const capabilities = {
  b3CreateRecording: typeof b3.b3CreateRecording,
  b3Recording_GetData: typeof b3.b3Recording_GetData,
  b3Recording_GetSize: typeof b3.b3Recording_GetSize,
  b3RecPlayer_Create: typeof b3.b3RecPlayer_Create,
  b3RecPlayer_CreateFromRecording: typeof b3.b3RecPlayer_CreateFromRecording,
  heapU8: Boolean(b3.HEAPU8),
  malloc: typeof b3._malloc,
  exportedRecordingSymbols: capabilityNames,
};

const original = makeWorld();
for (let tick = 0; tick < 70; tick += 1) step(original.world, original.bodies, tick);

const recording = b3.b3CreateRecording(2 * 1024 * 1024);
b3.b3World_StartRecording(original.world, recording);
const recordStartTick = 70;
const recordedFrames = 72;
for (let tick = recordStartTick; tick < recordStartTick + recordedFrames; tick += 1) step(original.world, original.bodies, tick);
b3.b3World_StopRecording(original.world);
const recordingSize = b3.b3Recording_GetSize(recording);
assert(recordingSize > 0, "recording has no bytes");

const player = b3.b3RecPlayer_CreateFromRecording(recording, 0);
assert(player, "b3RecPlayer_CreateFromRecording failed");
b3.b3RecPlayer_SeekFrame(player, recordedFrames);
assert(b3.b3RecPlayer_GetFrame(player) === recordedFrames, `replay frame mismatch ${b3.b3RecPlayer_GetFrame(player)}`);
assert(!b3.b3RecPlayer_HasDiverged(player), `recorded replay diverged at frame ${b3.b3RecPlayer_GetDivergeFrame(player)}`);
const restoredWorld = b3.b3RecPlayer_GetWorldId(player);
const restoredBodies = replayBodies(player);

const atRecordedEndOriginal = worldPacked(original.bodies);
const atRecordedEndRestored = worldPacked(restoredBodies);
assert(atRecordedEndOriginal === atRecordedEndRestored, "restored recording end is not bit-exact with original");

let continuationMismatch = null;
const continuationFrames = 180;
for (let i = 0; i < continuationFrames; i += 1) {
  const tick = recordStartTick + recordedFrames + i;
  step(original.world, original.bodies, tick);
  step(restoredWorld, restoredBodies, tick);
  const a = worldPacked(original.bodies);
  const c = worldPacked(restoredBodies);
  if (a !== c) {
    continuationMismatch = { i, tick, original: a, restored: c };
    break;
  }
}
assert(!continuationMismatch, `recording-seeded live continuation diverged at tick ${continuationMismatch?.tick}`);

let rawTransfer = { available: false, reason: "not attempted" };
try {
  if (typeof b3.b3Recording_GetData !== "function") {
    rawTransfer = { available: false, reason: "b3Recording_GetData not exported by JS binding" };
  } else {
    const ptrOrData = b3.b3Recording_GetData(recording);
    rawTransfer = {
      available: true,
      getDataType: ptrOrData?.constructor?.name || typeof ptrOrData,
      numericPointer: typeof ptrOrData === "number",
      heapU8: Boolean(b3.HEAPU8),
      directCreateExported: typeof b3.b3RecPlayer_Create === "function",
      size: recordingSize,
    };
    if (typeof ptrOrData === "number" && b3.HEAPU8) {
      const bytes = b3.HEAPU8.slice(ptrOrData, ptrOrData + recordingSize);
      rawTransfer.copiedBytes = bytes.byteLength;
      rawTransfer.first16 = [...bytes.slice(0, 16)];
    } else if (ArrayBuffer.isView(ptrOrData)) {
      rawTransfer.copiedBytes = ptrOrData.byteLength;
      rawTransfer.first16 = [...new Uint8Array(ptrOrData.buffer, ptrOrData.byteOffset, Math.min(16, ptrOrData.byteLength))];
    }
  }
} catch (error) {
  rawTransfer = { available: false, reason: error instanceof Error ? error.message : String(error) };
}

console.log("WORLD_V0_BOX3D_CHECKPOINT_CONTINUATION_PASS", JSON.stringify({
  recordingSize,
  recordStartTick,
  recordedFrames,
  continuationFrames,
  exactAtRestoreBoundary: true,
  exactContinuation: true,
  capabilities,
  rawTransfer,
}, null, 2));

b3.b3RecPlayer_Destroy(player);
b3.b3DestroyRecording(recording);
b3.b3DestroyWorld(original.world);
