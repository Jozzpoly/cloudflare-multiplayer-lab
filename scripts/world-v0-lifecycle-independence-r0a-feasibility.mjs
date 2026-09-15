import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import {
  WORLD_V0_ARENA,
  WORLD_V0_MOVEMENT,
  WORLD_V0_NET_ENTITY_ORDER,
  WORLD_V0_PLAYER_PHYSICS,
  WORLD_V0_PLAYER_STARTS,
  WORLD_V0_PROP_LAYOUT,
  WORLD_V0_PROP_PHYSICS,
  WORLD_V0_STATE_COMPONENTS,
  WORLD_V0_TIMING,
} from "../src/world-v0-contract.ts";

const modulePath = resolve("public/world-v0/box3d-i4/box3d.inline.mjs");
const { default: Box3D } = await import(`${pathToFileURL(modulePath).href}?r0a=${Date.now()}`);
const b3 = await Box3D();

for (const name of [
  "b3Recording_CopyData",
  "b3RecPlayer_CreateFromBytes",
  "b3RecPlayer_GetBodyCount",
  "b3RecPlayer_GetBodyId",
  "b3Bytes_Fnv1a32",
]) {
  assert.equal(typeof b3[name], "function", `R0-A custom Box3D binding missing ${name}`);
}

const ACTOR_0 = "actor:0";
const ACTOR_1 = "actor:1";
const SOLO_ENTITY_ORDER = WORLD_V0_NET_ENTITY_ORDER.filter((id) => id !== ACTOR_1);
const TWO_ACTOR_ENTITY_ORDER = [...WORLD_V0_NET_ENTITY_ORDER];
const PROP_IDS = WORLD_V0_PROP_LAYOUT.map((prop) => prop.id);

assert(SOLO_ENTITY_ORDER.includes(ACTOR_0), "R0-A solo domain missing actor:0");
assert(!SOLO_ENTITY_ORDER.includes(ACTOR_1), "R0-A solo domain unexpectedly contains actor:1");
assert(TWO_ACTOR_ENTITY_ORDER.includes(ACTOR_0) && TWO_ACTOR_ENTITY_ORDER.includes(ACTOR_1), "R0-A two-actor domain drift");
for (const propId of PROP_IDS) {
  assert(SOLO_ENTITY_ORDER.includes(propId), `R0-A solo domain missing ${propId}`);
  assert(TWO_ACTOR_ENTITY_ORDER.includes(propId), `R0-A two-actor domain missing ${propId}`);
}

const FLOAT32_VIEW = new DataView(new ArrayBuffer(4));
function f32hex(value) {
  FLOAT32_VIEW.setFloat32(0, value, true);
  return FLOAT32_VIEW.getUint32(0, true).toString(16).padStart(8, "0");
}
function u32hex(value) {
  return (Number(value) >>> 0).toString(16).padStart(8, "0");
}
function vec3(body, getter) {
  const out = [0, 0, 0];
  getter(out, body);
  return out;
}
function quat(body) {
  const out = [0, 0, 0, 1];
  b3.b3Body_GetRotation(out, body);
  return out;
}
function bodyState(body) {
  return [
    ...vec3(body, b3.b3Body_GetPosition),
    ...quat(body),
    ...vec3(body, b3.b3Body_GetLinearVelocity),
    ...vec3(body, b3.b3Body_GetAngularVelocity),
  ];
}
function bodyPosition(body) {
  return vec3(body, b3.b3Body_GetPosition);
}
function assertFiniteBody(body, label) {
  assert(bodyState(body).every(Number.isFinite), `${label} produced non-finite state`);
}
function packBodies(bodyByEntity, order) {
  let packed = "";
  for (const id of order) {
    const body = bodyByEntity.get(id);
    assert(body && b3.b3Body_IsValid(body), `R0-A live body map missing ${id}`);
    const values = bodyState(body);
    assert.equal(values.length, WORLD_V0_STATE_COMPONENTS.length, `R0-A state width drift for ${id}`);
    for (const value of values) packed += f32hex(value);
  }
  return packed;
}
function recordingBodyMap(player) {
  const byEntity = new Map();
  const count = b3.b3RecPlayer_GetBodyCount(player);
  for (let ordinal = 0; ordinal < count; ordinal += 1) {
    const body = b3.b3RecPlayer_GetBodyId(player, ordinal);
    if (!b3.b3Body_IsValid(body)) continue;
    const locator = b3.b3Body_GetName(body);
    if (!locator) continue;
    const id = locator.startsWith("prop:") ? locator.slice(5) : locator;
    if (TWO_ACTOR_ENTITY_ORDER.includes(id)) {
      assert(!byEntity.has(id), `R0-A Recording contains duplicate semantic body ${id}`);
      byEntity.set(id, body);
    }
  }
  return byEntity;
}
function captureRecording(world, order, requiredAbsent = []) {
  const recording = b3.b3CreateRecording(0);
  try {
    b3.b3World_StartRecording(world, recording);
    b3.b3World_StopRecording(world);
    const byteLength = b3.b3Recording_GetSize(recording);
    const bytes = b3.b3Recording_CopyData(recording);
    assert(bytes instanceof Uint8Array, "R0-A Recording copy did not return Uint8Array");
    assert.equal(bytes.byteLength, byteLength, "R0-A Recording byte length mismatch");
    assert(byteLength > 1024, `R0-A Recording unexpectedly small: ${byteLength}`);
    const fnv1a32 = u32hex(b3.b3Bytes_Fnv1a32(bytes));
    const player = b3.b3RecPlayer_CreateFromBytes(bytes, 1);
    assert(player, "R0-A Recording rehydrate failed");
    try {
      const recorded = recordingBodyMap(player);
      for (const id of order) assert(recorded.has(id), `R0-A rehydrated Recording missing ${id}`);
      for (const id of requiredAbsent) assert(!recorded.has(id), `R0-A rehydrated Recording unexpectedly contains ${id}`);
      return {
        byteLength,
        fnv1a32,
        packed: packBodies(recorded, order),
        semanticBodies: [...recorded.keys()].sort(),
      };
    } finally {
      b3.b3RecPlayer_Destroy(player);
    }
  } finally {
    b3.b3DestroyRecording(recording);
  }
}
function moveToward2(cx, cz, tx, tz, maxDelta) {
  const dx = tx - cx;
  const dz = tz - cz;
  const distance = Math.hypot(dx, dz);
  if (distance <= maxDelta || distance < 1e-9) return [tx, tz];
  const scale = maxDelta / distance;
  return [cx + dx * scale, cz + dz * scale];
}
function applyPlanarIntent(body, x, z) {
  const velocity = vec3(body, b3.b3Body_GetLinearVelocity);
  const hasInput = Math.hypot(x, z) > 0.01;
  const [nextX, nextZ] = moveToward2(
    velocity[0],
    velocity[2],
    x * WORLD_V0_MOVEMENT.playerSpeed,
    z * WORLD_V0_MOVEMENT.playerSpeed,
    (hasInput ? WORLD_V0_MOVEMENT.playerAcceleration : WORLD_V0_MOVEMENT.playerDeceleration)
      / WORLD_V0_TIMING.simulationHz,
  );
  b3.b3Body_SetLinearVelocity(body, [nextX, velocity[1], nextZ]);
}
function createActor(world, start, locator) {
  const bodyDef = b3.b3DefaultBodyDef();
  bodyDef.type = b3.b3BodyType.b3_dynamicBody;
  bodyDef.position = [...start];
  bodyDef.linearDamping = WORLD_V0_PLAYER_PHYSICS.linearDamping;
  bodyDef.angularDamping = WORLD_V0_PLAYER_PHYSICS.angularDamping;
  const body = b3.b3CreateBody(world, bodyDef);
  b3.b3Body_SetName(body, locator);
  const shapeDef = b3.b3DefaultShapeDef();
  shapeDef.density = WORLD_V0_PLAYER_PHYSICS.density;
  shapeDef.baseMaterial.friction = WORLD_V0_PLAYER_PHYSICS.friction;
  shapeDef.baseMaterial.restitution = WORLD_V0_PLAYER_PHYSICS.restitution;
  b3.b3CreateCapsuleShape(body, shapeDef, {
    center1: [...WORLD_V0_PLAYER_PHYSICS.capsuleCenter1],
    center2: [...WORLD_V0_PLAYER_PHYSICS.capsuleCenter2],
    radius: WORLD_V0_PLAYER_PHYSICS.capsuleRadius,
  });
  b3.b3Body_SetMotionLocks(body, {
    linearX: false,
    linearY: false,
    linearZ: false,
    angularX: WORLD_V0_PLAYER_PHYSICS.angularLocks[0],
    angularY: WORLD_V0_PLAYER_PHYSICS.angularLocks[1],
    angularZ: WORLD_V0_PLAYER_PHYSICS.angularLocks[2],
  });
  return body;
}
function createWorld() {
  const def = b3.b3DefaultWorldDef();
  def.gravity = [...WORLD_V0_ARENA.gravity];
  const world = b3.b3CreateWorld(def);
  const bodyByEntity = new Map();

  for (const box of WORLD_V0_ARENA.staticBoxes) {
    const bodyDef = b3.b3DefaultBodyDef();
    bodyDef.position = [...box.position];
    const body = b3.b3CreateBody(world, bodyDef);
    b3.b3CreateBoxShape(
      body,
      b3.b3DefaultShapeDef(),
      box.halfExtents[0],
      box.halfExtents[1],
      box.halfExtents[2],
    );
  }

  for (const authored of WORLD_V0_PROP_LAYOUT) {
    const bodyDef = b3.b3DefaultBodyDef();
    bodyDef.type = b3.b3BodyType.b3_dynamicBody;
    bodyDef.position = [...authored.position];
    bodyDef.linearDamping = WORLD_V0_PROP_PHYSICS.linearDamping;
    bodyDef.angularDamping = WORLD_V0_PROP_PHYSICS.angularDamping;
    const body = b3.b3CreateBody(world, bodyDef);
    b3.b3Body_SetName(body, `prop:${authored.id}`);
    const shapeDef = b3.b3DefaultShapeDef();
    shapeDef.density = WORLD_V0_PROP_PHYSICS.density;
    shapeDef.baseMaterial.friction = WORLD_V0_PROP_PHYSICS.friction;
    shapeDef.baseMaterial.restitution = WORLD_V0_PROP_PHYSICS.restitution;
    b3.b3CreateBoxShape(
      body,
      shapeDef,
      WORLD_V0_PROP_PHYSICS.halfExtents[0],
      WORLD_V0_PROP_PHYSICS.halfExtents[1],
      WORLD_V0_PROP_PHYSICS.halfExtents[2],
    );
    bodyByEntity.set(authored.id, body);
  }

  const actor0 = createActor(world, WORLD_V0_PLAYER_STARTS[0], ACTOR_0);
  bodyByEntity.set(ACTOR_0, actor0);
  return { world, bodyByEntity, actor0 };
}
function stepWorld(world, actors, ticks) {
  for (let tick = 0; tick < ticks; tick += 1) {
    for (const [body, input] of actors) applyPlanarIntent(body, input.x, input.z);
    b3.b3World_Step(world, 1 / WORLD_V0_TIMING.simulationHz, WORLD_V0_TIMING.substeps);
  }
}

const { world, bodyByEntity, actor0 } = createWorld();
try {
  const actor0Start = bodyPosition(actor0);
  stepWorld(world, [[actor0, { x: 0.8, z: 0.6 }]], 120);
  const actor0Solo = bodyPosition(actor0);
  const soloHorizontalDisplacement = Math.hypot(
    actor0Solo[0] - actor0Start[0],
    actor0Solo[2] - actor0Start[2],
  );
  assert(soloHorizontalDisplacement > 0.5, `R0-A solo actor did not materially move: ${soloHorizontalDisplacement}`);
  for (const id of SOLO_ENTITY_ORDER) assertFiniteBody(bodyByEntity.get(id), `R0-A solo ${id}`);

  const soloGuardA = packBodies(bodyByEntity, SOLO_ENTITY_ORDER);
  const soloGuardB = packBodies(bodyByEntity, SOLO_ENTITY_ORDER);
  assert.equal(soloGuardB, soloGuardA, "R0-A one-actor guard is not deterministic at one boundary");
  const soloRecording = captureRecording(world, SOLO_ENTITY_ORDER, [ACTOR_1]);
  assert.equal(soloRecording.packed, soloGuardA, "R0-A one-actor Recording did not rehydrate exact semantic state");

  const oldDomainBeforeAdd = packBodies(bodyByEntity, SOLO_ENTITY_ORDER);
  const actor1 = createActor(world, WORLD_V0_PLAYER_STARTS[1], ACTOR_1);
  bodyByEntity.set(ACTOR_1, actor1);
  assert(b3.b3Body_IsValid(actor1), "R0-A live actor:1 body is invalid after add");
  assert.equal(b3.b3Body_GetName(actor1), ACTOR_1, "R0-A live actor:1 locator drift");
  const oldDomainAfterAdd = packBodies(bodyByEntity, SOLO_ENTITY_ORDER);
  assert.equal(
    oldDomainAfterAdd,
    oldDomainBeforeAdd,
    "R0-A adding actor:1 mutated pre-existing actor:0/prop state before the next physics step",
  );

  stepWorld(world, [
    [actor0, { x: 0.8, z: 0.6 }],
    [actor1, { x: -0.8, z: 0.6 }],
  ], 60);
  for (const id of TWO_ACTOR_ENTITY_ORDER) assertFiniteBody(bodyByEntity.get(id), `R0-A two-actor ${id}`);

  const twoActorGuard = packBodies(bodyByEntity, TWO_ACTOR_ENTITY_ORDER);
  const twoActorRecording = captureRecording(world, TWO_ACTOR_ENTITY_ORDER);
  assert.equal(twoActorRecording.packed, twoActorGuard, "R0-A two-actor Recording did not rehydrate exact semantic state");
  assert(twoActorRecording.semanticBodies.includes(ACTOR_0), "R0-A final Recording missing actor:0");
  assert(twoActorRecording.semanticBodies.includes(ACTOR_1), "R0-A final Recording missing actor:1");

  console.log("WORLD_V0_LIFECYCLE_INDEPENDENCE_R0A_PASS", JSON.stringify({
    revision: "world-v0-lifecycle-independence-r0a-v1",
    soloTicks: 120,
    soloHorizontalDisplacement,
    soloTopology: {
      entityCount: SOLO_ENTITY_ORDER.length,
      actorIds: [ACTOR_0],
      guardHexLength: soloGuardA.length,
      recordingBytes: soloRecording.byteLength,
      recordingFnv1a32: soloRecording.fnv1a32,
      recordingSemanticBodies: soloRecording.semanticBodies,
    },
    liveAdd: {
      addedActorId: ACTOR_1,
      existingDomainBitExactBeforeFirstPostAddStep: oldDomainAfterAdd === oldDomainBeforeAdd,
    },
    twoActorTicksAfterAdd: 60,
    twoActorTopology: {
      entityCount: TWO_ACTOR_ENTITY_ORDER.length,
      actorIds: [ACTOR_0, ACTOR_1],
      guardHexLength: twoActorGuard.length,
      recordingBytes: twoActorRecording.byteLength,
      recordingFnv1a32: twoActorRecording.fnv1a32,
      recordingSemanticBodies: twoActorRecording.semanticBodies,
    },
  }));
} finally {
  b3.b3DestroyWorld(world);
}
