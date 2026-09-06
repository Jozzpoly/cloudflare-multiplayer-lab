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

for (const name of ["b3Recording_CopyData", "b3RecPlayer_CreateFromBytes"]) {
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
function hashBytes(bytes) {
  let hash = 0x811c9dc5;
  for (const value of bytes) {
    hash ^= value;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}
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
const nativeSize = b3.b3Recording_GetSize(recording);
const copiedBytes = b3.b3Recording_CopyData(recording);
b3.b3World_StopRecording(authority.world);

if (!(copiedBytes instanceof Uint8Array)) throw new Error(`copy binding returned ${copiedBytes?.constructor?.name}`);
if (copiedBytes.byteLength !== nativeSize) throw new Error(`raw byte size mismatch ${copiedBytes.byteLength} != ${nativeSize}`);
if (copiedBytes.byteLength < 1024) throw new Error(`raw seed unexpectedly small ${copiedBytes.byteLength}`);
const copiedHash = hashBytes(copiedBytes);

// Validate the pre-existing wrapper path first, but do not leave its replay world
// alive while constructing the raw player: recording snapshots restore world identity
// and two simultaneous replay worlds from the same seed can collide in one module.
const directPlayer = b3.b3RecPlayer_CreateFromRecording(recording, 1);
if (!directPlayer) throw new Error("control CreateFromRecording failed");
const direct = remapFromPlayer(directPlayer);
const directSeedExact = exactWorld(authority, direct);
if (!directSeedExact.exact) throw new Error(`control recording seed mismatch ${directSeedExact.id}`);
b3.b3RecPlayer_Destroy(directPlayer);

// Model a real wire boundary. The transport copy must stay bit-identical after the
// native Recording has been destroyed and the first JS-owned copy has been zeroed.
const wireBytes = new Uint8Array(copiedBytes);
const wireHashBeforeDestroy = hashBytes(wireBytes);
if (wireHashBeforeDestroy !== copiedHash) throw new Error("wire copy differs before native Recording destruction");
b3.b3DestroyRecording(recording);
const wireHashAfterRecordingDestroy = hashBytes(wireBytes);
if (wireHashAfterRecordingDestroy !== copiedHash) throw new Error("wire bytes changed when native Recording was destroyed");
copiedBytes.fill(0);
const wireHashAfterSourceZero = hashBytes(wireBytes);
if (wireHashAfterSourceZero !== copiedHash) throw new Error("wire bytes alias source JS copy");

const rawPlayer = b3.b3RecPlayer_CreateFromBytes(wireBytes, 1);
if (!rawPlayer) throw new Error("CreateFromBytes failed after native Recording destruction");
const raw = remapFromPlayer(rawPlayer);
const rawSeedExact = exactWorld(authority, raw);
if (!rawSeedExact.exact) throw new Error(`raw wire seed mismatch ${rawSeedExact.id}`);

// Native RecPlayer owns its own copy. Destroy the JS transport contents and require
// exact continuation against the still-live authority world.
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
  revision: "world-v0-box3d-raw-seed-roundtrip-audit-v2-isolated-replay",
  upstream: {
    package: "box3d.js@0.1.1",
    commit: "5d5a3af049cccd9948b2b55bac4342414af0ef64",
  },
  seed: {
    nativeBytes: nativeSize,
    copiedBytes: nativeSize,
    copiedHash,
    copiedAsJsOwnedUint8Array: true,
    directControlDestroyedBeforeRawReplay: true,
    nativeRecordingDestroyedBeforeRawPlayerCreate: true,
    wireHashStableAfterRecordingDestroy: wireHashAfterRecordingDestroy === copiedHash,
    wireHashStableAfterSourceCopyZero: wireHashAfterSourceZero === copiedHash,
    wireBufferZeroedAfterRawPlayerCreate: true,
  },
  exactness: {
    directSeedExact: directSeedExact.exact,
    rawSeedExact: rawSeedExact.exact,
    continuationExactTicks,
  },
  verdict: "WORLD_V0_BOX3D_RAW_SEED_WIRE_ROUNDTRIP_PASS",
  nonClaim: "This qualifies same-build ephemeral recording bytes as a wire/rebase substrate for the pinned wrapper. It does not make Box3D recording a durable save format, cross-version migration format, authenticated protocol payload, or production compression choice.",
};
console.log("WORLD_V0_BOX3D_RAW_SEED_ROUNDTRIP", JSON.stringify(result, null, 2));
console.log(result.verdict);

b3.b3RecPlayer_Destroy(rawPlayer);
b3.b3DestroyWorld(authority.world);
