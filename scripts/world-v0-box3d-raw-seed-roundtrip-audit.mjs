import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import {
  WORLD_V0_ARENA,
  WORLD_V0_MOVEMENT,
  WORLD_V0_PLAYER_PHYSICS,
  WORLD_V0_PLAYER_STARTS,
  WORLD_V0_PROP_LAYOUT,
  WORLD_V0_PROP_PHYSICS,
  WORLD_V0_TIMING,
} from "../src/world-v0-contract.ts";

const modulePath = resolve(process.argv[2] ?? "");
if (!modulePath) throw new Error("usage: node world-v0-box3d-raw-seed-roundtrip-audit.mjs <patched box3d module>");
const { default: Box3D } = await import(pathToFileURL(modulePath).href);
const b3 = await Box3D();

for (const name of ["b3Recording_CopyData", "b3RecPlayer_CreateFromBytes", "b3Bytes_Fnv1a32"]) {
  if (typeof b3[name] !== "function") throw new Error(`patched binding missing ${name}`);
}

const DT = 1 / WORLD_V0_TIMING.simulationHz;
const SUBSTEPS = WORLD_V0_TIMING.substeps;
const SEED_TICK = 240;
const CONTINUE_TICKS = 180;

function vec3(body, getter) {
  const out = [0, 0, 0];
  getter(out, body);
  return out;
}
function position(body) { return vec3(body, b3.b3Body_GetPosition); }
function linearVelocity(body) { return vec3(body, b3.b3Body_GetLinearVelocity); }
function rotation(body) {
  const out = [0, 0, 0, 1];
  b3.b3Body_GetRotation(out, body);
  return out;
}
function angularVelocity(body) { return vec3(body, b3.b3Body_GetAngularVelocity); }
function flat(body) { return [...position(body), ...rotation(body), ...linearVelocity(body), ...angularVelocity(body)]; }
const dv = new DataView(new ArrayBuffer(4));
function f32bits(value) { dv.setFloat32(0, value, true); return dv.getUint32(0, true); }
function exactBody(a, c) {
  const x = flat(a), y = flat(c);
  return x.length === y.length && x.every((value, index) => f32bits(value) === f32bits(y[index]));
}
function hashBytesU32(bytes) {
  let hash = 0x811c9dc5;
  for (const value of bytes) {
    hash ^= value;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}
function hashHex(value) { return (value >>> 0).toString(16).padStart(8, "0"); }
function moveToward2(vx, vz, tx, tz, delta) {
  const dx = tx - vx, dz = tz - vz;
  const length = Math.hypot(dx, dz);
  if (length <= delta || length === 0) return [tx, tz];
  const scale = delta / length;
  return [vx + dx * scale, vz + dz * scale];
}

function makeWorld() {
  const wd = b3.b3DefaultWorldDef();
  wd.gravity = [...WORLD_V0_ARENA.gravity];
  const world = b3.b3CreateWorld(wd);
  for (const box of WORLD_V0_ARENA.staticBoxes) {
    const def = b3.b3DefaultBodyDef();
    def.position = [...box.position];
    const body = b3.b3CreateBody(world, def);
    b3.b3CreateBoxShape(body, b3.b3DefaultShapeDef(), ...box.halfExtents);
  }
  const bodies = new Map();
  for (const prop of WORLD_V0_PROP_LAYOUT) {
    const def = b3.b3DefaultBodyDef();
    def.type = b3.b3BodyType.b3_dynamicBody;
    def.position = [...prop.position];
    def.linearDamping = WORLD_V0_PROP_PHYSICS.linearDamping;
    def.angularDamping = WORLD_V0_PROP_PHYSICS.angularDamping;
    const body = b3.b3CreateBody(world, def);
    b3.b3Body_SetName(body, prop.id);
    const shape = b3.b3DefaultShapeDef();
    shape.density = WORLD_V0_PROP_PHYSICS.density;
    shape.baseMaterial.friction = WORLD_V0_PROP_PHYSICS.friction;
    shape.baseMaterial.restitution = WORLD_V0_PROP_PHYSICS.restitution;
    b3.b3CreateBoxShape(body, shape, ...WORLD_V0_PROP_PHYSICS.halfExtents);
    bodies.set(prop.id, body);
  }
  for (let slot = 0; slot < 2; slot += 1) {
    const def = b3.b3DefaultBodyDef();
    def.type = b3.b3BodyType.b3_dynamicBody;
    def.position = [...WORLD_V0_PLAYER_STARTS[slot]];
    def.linearDamping = WORLD_V0_PLAYER_PHYSICS.linearDamping;
    def.angularDamping = WORLD_V0_PLAYER_PHYSICS.angularDamping;
    const body = b3.b3CreateBody(world, def);
    b3.b3Body_SetName(body, `actor:${slot}`);
    const shape = b3.b3DefaultShapeDef();
    shape.density = WORLD_V0_PLAYER_PHYSICS.density;
    shape.baseMaterial.friction = WORLD_V0_PLAYER_PHYSICS.friction;
    shape.baseMaterial.restitution = WORLD_V0_PLAYER_PHYSICS.restitution;
    b3.b3CreateCapsuleShape(body, shape, {
      center1: [...WORLD_V0_PLAYER_PHYSICS.capsuleCenter1],
      center2: [...WORLD_V0_PLAYER_PHYSICS.capsuleCenter2],
      radius: WORLD_V0_PLAYER_PHYSICS.capsuleRadius,
    });
    b3.b3Body_SetMotionLocks(body, {
      linearX:false, linearY:false, linearZ:false,
      angularX:true, angularY:true, angularZ:true,
    });
    bodies.set(`actor:${slot}`, body);
  }
  return { world, bodies };
}

function remapFromPlayer(player) {
  const world = b3.b3RecPlayer_GetWorldId(player);
  const bodies = new Map();
  const count = b3.b3RecPlayer_GetBodyCount(player);
  for (let i = 0; i < count; i += 1) {
    const body = b3.b3RecPlayer_GetBodyId(player, i);
    if (!b3.b3Body_IsValid(body)) continue;
    const name = b3.b3Body_GetName(body);
    if (name) bodies.set(name, body);
  }
  for (const id of ["actor:0", "actor:1", ...WORLD_V0_PROP_LAYOUT.map((prop) => prop.id)]) {
    if (!bodies.has(id)) throw new Error(`raw-seed remap missing ${id}`);
  }
  return { world, bodies, player };
}

function exactWorld(a, c) {
  for (const [id, body] of a.bodies) {
    const other = c.bodies.get(id);
    if (!other || !exactBody(body, other)) return { exact:false, id };
  }
  return { exact:true, id:null };
}

function applyHorizontalIntent(body, input) {
  const velocity = linearVelocity(body);
  const hasInput = Math.hypot(input.x, input.z) > 0.01;
  const accel = hasInput ? WORLD_V0_MOVEMENT.playerAcceleration : WORLD_V0_MOVEMENT.playerDeceleration;
  const [x, z] = moveToward2(
    velocity[0], velocity[2],
    input.x * WORLD_V0_MOVEMENT.playerSpeed,
    input.z * WORLD_V0_MOVEMENT.playerSpeed,
    accel * DT,
  );
  b3.b3Body_SetLinearVelocity(body, [x, velocity[1], z]);
}

function inputsForTick(tick) {
  return [
    tick < 120 ? { x:1, z:0 } : tick < 300 ? { x:0, z:1 } : { x:-1, z:0 },
    tick < 160 ? { x:-1, z:0 } : tick < 340 ? { x:0, z:-1 } : { x:1, z:0 },
  ];
}

function step(sim, tick) {
  const inputs = inputsForTick(tick);
  applyHorizontalIntent(sim.bodies.get("actor:0"), inputs[0]);
  applyHorizontalIntent(sim.bodies.get("actor:1"), inputs[1]);
  b3.b3World_Step(sim.world, DT, SUBSTEPS);
}

const authority = makeWorld();
for (let tick = 0; tick < SEED_TICK; tick += 1) step(authority, tick);

const recording = b3.b3CreateRecording(0);
b3.b3World_StartRecording(authority.world, recording);

// Negative specimen: while recording is still active, the buffer is not yet the finalized
// replay payload. Pinned Box3D StopRecording writes the trailing geometry registry and
// backpatches the header. Preserve the active-buffer facts so the prior failure remains
// attributable rather than silently overwritten by the corrected experiment.
const activeSize = b3.b3Recording_GetSize(recording);
const activeBytes = b3.b3Recording_CopyData(recording);
if (!(activeBytes instanceof Uint8Array)) throw new Error(`active copy binding returned ${activeBytes?.constructor?.name}`);
if (activeBytes.byteLength !== activeSize) throw new Error(`active byte size mismatch ${activeBytes.byteLength} != ${activeSize}`);
const activeHashU32 = hashBytesU32(activeBytes);
const activeHash = hashHex(activeHashU32);
const cppHashActive = Number(b3.b3Bytes_Fnv1a32(activeBytes)) >>> 0;
if (cppHashActive !== activeHashU32) {
  throw new Error(`JS->C++ ingress checksum mismatch on active recording copy js=${activeHash} cpp=${hashHex(cppHashActive)}`);
}

// Finalize first. This is the exact semantic boundary the earlier probe crossed in the wrong order.
b3.b3World_StopRecording(authority.world);

const nativeSize = b3.b3Recording_GetSize(recording);
const copiedBytes = b3.b3Recording_CopyData(recording);
if (!(copiedBytes instanceof Uint8Array)) throw new Error(`copy binding returned ${copiedBytes?.constructor?.name}`);
if (copiedBytes.byteLength !== nativeSize) throw new Error(`raw byte size mismatch ${copiedBytes.byteLength} != ${nativeSize}`);
if (copiedBytes.byteLength < 1024) throw new Error(`raw seed unexpectedly small ${copiedBytes.byteLength}`);
const copiedHashU32 = hashBytesU32(copiedBytes);
const copiedHash = hashHex(copiedHashU32);
const cppHashCopied = Number(b3.b3Bytes_Fnv1a32(copiedBytes)) >>> 0;
if (cppHashCopied !== copiedHashU32) {
  throw new Error(`JS->C++ ingress checksum mismatch on finalized source copy js=${copiedHash} cpp=${hashHex(cppHashCopied)}`);
}

const finalizedDiffersFromActive = nativeSize !== activeSize || copiedHashU32 !== activeHashU32;

const directPlayer = b3.b3RecPlayer_CreateFromRecording(recording, 1);
if (!directPlayer) throw new Error("control CreateFromRecording failed");
const direct = remapFromPlayer(directPlayer);
const directSeedExact = exactWorld(authority, direct);
if (!directSeedExact.exact) throw new Error(`control recording seed mismatch ${directSeedExact.id}`);
b3.b3RecPlayer_Destroy(directPlayer);

const wireBytes = new Uint8Array(copiedBytes);
const wireHashBeforeDestroyU32 = hashBytesU32(wireBytes);
if (wireHashBeforeDestroyU32 !== copiedHashU32) throw new Error("wire copy differs before native Recording destruction");
const cppHashWireBeforeDestroy = Number(b3.b3Bytes_Fnv1a32(wireBytes)) >>> 0;
if (cppHashWireBeforeDestroy !== copiedHashU32) {
  throw new Error(`JS->C++ ingress checksum mismatch on wire copy js=${copiedHash} cpp=${hashHex(cppHashWireBeforeDestroy)}`);
}
b3.b3DestroyRecording(recording);
const wireHashAfterRecordingDestroyU32 = hashBytesU32(wireBytes);
if (wireHashAfterRecordingDestroyU32 !== copiedHashU32) throw new Error("wire bytes changed when native Recording was destroyed");
copiedBytes.fill(0);
const wireHashAfterSourceZeroU32 = hashBytesU32(wireBytes);
if (wireHashAfterSourceZeroU32 !== copiedHashU32) throw new Error("wire bytes alias source JS copy");
const cppHashWireFinal = Number(b3.b3Bytes_Fnv1a32(wireBytes)) >>> 0;
if (cppHashWireFinal !== copiedHashU32) {
  throw new Error(`final JS->C++ ingress checksum mismatch js=${copiedHash} cpp=${hashHex(cppHashWireFinal)}`);
}

const rawPlayer = b3.b3RecPlayer_CreateFromBytes(wireBytes, 1);
if (!rawPlayer) throw new Error("CreateFromBytes failed after finalized byte-faithful ingress verification");
const raw = remapFromPlayer(rawPlayer);
const rawSeedExact = exactWorld(authority, raw);
if (!rawSeedExact.exact) throw new Error(`raw wire seed mismatch ${rawSeedExact.id}`);

wireBytes.fill(0);
let continuationExactTicks = 0;
for (let tick = SEED_TICK; tick < SEED_TICK + CONTINUE_TICKS; tick += 1) {
  step(authority, tick);
  step(raw, tick);
  const exact = exactWorld(authority, raw);
  if (!exact.exact) throw new Error(`raw post-wire continuation diverged at tick ${tick} entity ${exact.id}`);
  continuationExactTicks += 1;
}

const result = {
  revision: "world-v0-box3d-raw-seed-roundtrip-audit-v4-finalized-recording-bytes",
  upstream: {
    package: "box3d.js@0.1.1",
    commit: "5d5a3af049cccd9948b2b55bac4342414af0ef64",
    box3dCommit: "8441b4a06d6d09dcfb0b0f704df4d847d1437b92",
  },
  recordingFinalization: {
    activeBytes: activeSize,
    activeHash,
    finalizedBytes: nativeSize,
    finalizedHash: copiedHash,
    finalizedDiffersFromActive,
    causalBoundary: "b3World_StopRecording writes trailing geometry registry and backpatches header before bytes are copied for replay",
  },
  seed: {
    nativeBytes: nativeSize,
    copiedBytes: nativeSize,
    copiedHash,
    copiedAfterStopRecording: true,
    copiedAsJsOwnedUint8Array: true,
    cppIngressHashMatchesJs: cppHashWireFinal === copiedHashU32,
    directControlDestroyedBeforeRawReplay: true,
    nativeRecordingDestroyedBeforeRawPlayerCreate: true,
    wireHashStableAfterRecordingDestroy: wireHashAfterRecordingDestroyU32 === copiedHashU32,
    wireHashStableAfterSourceCopyZero: wireHashAfterSourceZeroU32 === copiedHashU32,
    wireBufferZeroedAfterRawPlayerCreate: true,
    ingressMethod: "audit bytewise JS Uint8Array -> C++ std::vector<uint8_t>",
  },
  exactness: {
    directSeedExact: directSeedExact.exact,
    rawSeedExact: rawSeedExact.exact,
    continuationExactTicks,
  },
  verdict: "WORLD_V0_BOX3D_FINALIZED_RAW_SEED_WIRE_ROUNDTRIP_PASS",
  nonClaim: "This qualifies finalized same-build ephemeral recording bytes as a wire/rebase substrate for the pinned wrapper. The earlier pre-StopRecording copy remains negative apparatus evidence, not a contradiction. The bytewise ingress is an audit proof, not a production-performance choice. This does not make Box3D recording a durable save format, cross-version migration format, authenticated protocol payload, or compression decision.",
};
console.log("WORLD_V0_BOX3D_RAW_SEED_ROUNDTRIP", JSON.stringify(result, null, 2));
console.log(result.verdict);

b3.b3RecPlayer_Destroy(rawPlayer);
b3.b3DestroyWorld(authority.world);
