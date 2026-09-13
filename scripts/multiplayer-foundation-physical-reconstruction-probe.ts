import assert from "node:assert/strict";
import Box3D from "box3d.js";
import {
  WORLD_V0_ARENA,
  WORLD_V0_MOVEMENT,
  WORLD_V0_PLAYER_PHYSICS,
  WORLD_V0_PROP_LAYOUT,
  WORLD_V0_PROP_PHYSICS,
  WORLD_V0_STATE_COMPONENTS,
  WORLD_V0_TIMING,
} from "../src/world-v0-contract.ts";
import { FoundationEntityTopology } from "../src/multiplayer-foundation/entity-topology.ts";
import { FoundationRosterMachine } from "../src/multiplayer-foundation/roster-machine.ts";
import {
  firstFoundationStateGuardDifference,
  packFoundationStateGuard,
  type FoundationStateGuard,
} from "../src/multiplayer-foundation/state-guard.ts";

const b3 = await Box3D();
const DT = 1 / WORLD_V0_TIMING.simulationHz;
const WORLD_EPOCH = "physical-reconstruction-probe";
const CHECKPOINT_TICK = 180;
const END_TICK = 300;

type BodyId = ReturnType<typeof b3.b3CreateBody>;
type WorldId = ReturnType<typeof b3.b3CreateWorld>;
type Vec3 = [number, number, number];
type Quat = [number, number, number, number];

type BodyRecord = {
  body: BodyId;
  initial: Vec3;
};

type BodyCheckpoint = {
  entityId: string;
  position: Vec3;
  rotation: Quat;
  linearVelocity: Vec3;
  angularVelocity: Vec3;
  awake: boolean;
};

type PhysicalCheckpoint = {
  tick: number;
  worldEpoch: string;
  topologyRevision: number;
  topologyDigest: string;
  bodies: BodyCheckpoint[];
};

const ACTOR_SPAWNS: Vec3[] = [
  [-6.5, 0.82, -1.4],
  [6.5, 0.82, 0],
  [-6.5, 0.82, -6.0],
  [0, 0.82, -6.5],
  [6.5, 0.82, 6.0],
  [0, 0.82, 6.5],
];

function createStaticBox(world: WorldId, position: readonly number[], halfExtents: readonly number[]): void {
  const bodyDef = b3.b3DefaultBodyDef();
  bodyDef.position = [...position];
  const body = b3.b3CreateBody(world, bodyDef);
  b3.b3CreateBoxShape(body, b3.b3DefaultShapeDef(), halfExtents[0], halfExtents[1], halfExtents[2]);
}

function createPlayerBody(world: WorldId, start: Vec3): BodyId {
  const bodyDef = b3.b3DefaultBodyDef();
  bodyDef.type = b3.b3BodyType.b3_dynamicBody;
  bodyDef.position = [...start];
  bodyDef.linearDamping = WORLD_V0_PLAYER_PHYSICS.linearDamping;
  bodyDef.angularDamping = WORLD_V0_PLAYER_PHYSICS.angularDamping;
  const body = b3.b3CreateBody(world, bodyDef);
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

function createPropBody(world: WorldId, position: Vec3): BodyId {
  const bodyDef = b3.b3DefaultBodyDef();
  bodyDef.type = b3.b3BodyType.b3_dynamicBody;
  bodyDef.position = [...position];
  bodyDef.linearDamping = WORLD_V0_PROP_PHYSICS.linearDamping;
  bodyDef.angularDamping = WORLD_V0_PROP_PHYSICS.angularDamping;
  const body = b3.b3CreateBody(world, bodyDef);
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
  return body;
}

function createPhysicalWorld(): { world: WorldId; bodies: Map<string, BodyRecord> } {
  const worldDef = b3.b3DefaultWorldDef();
  worldDef.gravity = [...WORLD_V0_ARENA.gravity];
  const world = b3.b3CreateWorld(worldDef);

  for (const box of WORLD_V0_ARENA.staticBoxes) {
    createStaticBox(world, box.position, box.halfExtents);
  }

  const bodies = new Map<string, BodyRecord>();
  for (const authored of WORLD_V0_PROP_LAYOUT) {
    const initial: Vec3 = [...authored.position];
    bodies.set(authored.id, { body: createPropBody(world, initial), initial });
  }
  for (let index = 0; index < ACTOR_SPAWNS.length; index += 1) {
    const initial: Vec3 = [...ACTOR_SPAWNS[index]];
    bodies.set(`actor:${index}`, { body: createPlayerBody(world, initial), initial });
  }

  return { world, bodies };
}

function buildTopology() {
  const roster = new FoundationRosterMachine({ worldEpoch: WORLD_EPOCH, capacity: 6 });
  for (let index = 0; index < 6; index += 1) {
    roster.queue({
      kind: "join",
      mutationId: `join-${index}`,
      effectiveTick: index + 1,
      actorSessionId: `session-${index}`,
    });
  }
  roster.advanceTo(6);
  const topology = new FoundationEntityTopology(WORLD_EPOCH, WORLD_V0_PROP_LAYOUT.map((prop) => prop.id));
  return topology.syncRoster(roster.snapshot());
}

const topology = buildTopology();

function readBodyCheckpoint(entityId: string, body: BodyId): BodyCheckpoint {
  const position: Vec3 = [0, 0, 0];
  const rotation: Quat = [0, 0, 0, 1];
  const linearVelocity: Vec3 = [0, 0, 0];
  const angularVelocity: Vec3 = [0, 0, 0];
  b3.b3Body_GetPosition(position, body);
  b3.b3Body_GetRotation(rotation, body);
  b3.b3Body_GetLinearVelocity(linearVelocity, body);
  b3.b3Body_GetAngularVelocity(angularVelocity, body);
  const values = [...position, ...rotation, ...linearVelocity, ...angularVelocity];
  assert(values.every(Number.isFinite), `non-finite body checkpoint for ${entityId}`);
  return {
    entityId,
    position: [...position],
    rotation: [...rotation],
    linearVelocity: [...linearVelocity],
    angularVelocity: [...angularVelocity],
    awake: b3.b3Body_IsAwake(body),
  };
}

function captureCheckpoint(tick: number, bodies: Map<string, BodyRecord>): PhysicalCheckpoint {
  return {
    tick,
    worldEpoch: topology.worldEpoch,
    topologyRevision: topology.topologyRevision,
    topologyDigest: topology.topologyDigest,
    bodies: topology.entityOrder.map((entityId) => {
      const record = bodies.get(entityId);
      assert(record, `checkpoint body missing for ${entityId}`);
      return readBodyCheckpoint(entityId, record.body);
    }),
  };
}

function bodyValues(body: BodyId): number[] {
  const checkpoint = readBodyCheckpoint("guard", body);
  return [
    ...checkpoint.position,
    ...checkpoint.rotation,
    ...checkpoint.linearVelocity,
    ...checkpoint.angularVelocity,
  ];
}

function guardFor(bodies: Map<string, BodyRecord>): FoundationStateGuard {
  return packFoundationStateGuard(topology, WORLD_V0_STATE_COMPONENTS, (entityId) => {
    const record = bodies.get(entityId);
    assert(record, `guard body missing for ${entityId}`);
    return bodyValues(record.body);
  });
}

function moveToward2(cx: number, cz: number, tx: number, tz: number, maxDelta: number): [number, number] {
  const dx = tx - cx;
  const dz = tz - cz;
  const distance = Math.hypot(dx, dz);
  if (distance <= maxDelta || distance < 1e-9) return [tx, tz];
  const scale = maxDelta / distance;
  return [cx + dx * scale, cz + dz * scale];
}

function applyActorIntent(record: BodyRecord): void {
  const velocity: Vec3 = [0, 0, 0];
  b3.b3Body_GetLinearVelocity(velocity, record.body);
  const x = Math.abs(record.initial[0]) < 1e-9 ? 0 : -Math.sign(record.initial[0]);
  const z = Math.abs(record.initial[2]) < 1e-9 ? 0 : -Math.sign(record.initial[2]);
  const length = Math.hypot(x, z);
  const nx = length > 1 ? x / length : x;
  const nz = length > 1 ? z / length : z;
  const [nextX, nextZ] = moveToward2(
    velocity[0],
    velocity[2],
    nx * WORLD_V0_MOVEMENT.playerSpeed,
    nz * WORLD_V0_MOVEMENT.playerSpeed,
    WORLD_V0_MOVEMENT.playerAcceleration * DT,
  );
  b3.b3Body_SetLinearVelocity(record.body, [nextX, velocity[1], nextZ]);
}

function stepWorld(world: WorldId, bodies: Map<string, BodyRecord>): void {
  for (const [entityId, record] of bodies) {
    if (entityId.startsWith("actor:")) applyActorIntent(record);
  }
  b3.b3World_Step(world, DT, WORLD_V0_TIMING.substeps);
}

function restoreCheckpoint(checkpoint: PhysicalCheckpoint): { world: WorldId; bodies: Map<string, BodyRecord> } {
  assert.equal(checkpoint.worldEpoch, topology.worldEpoch);
  assert.equal(checkpoint.topologyRevision, topology.topologyRevision);
  assert.equal(checkpoint.topologyDigest, topology.topologyDigest);

  const restored = createPhysicalWorld();
  const byId = new Map(checkpoint.bodies.map((body) => [body.entityId, body]));
  assert.deepEqual([...byId.keys()], topology.entityOrder, "checkpoint entity order must match topology exactly");

  for (const entityId of topology.entityOrder) {
    const target = restored.bodies.get(entityId);
    const source = byId.get(entityId);
    assert(target && source, `restore material missing for ${entityId}`);
    b3.b3Body_SetTransform(target.body, source.position, source.rotation);
    b3.b3Body_SetLinearVelocity(target.body, source.linearVelocity);
    b3.b3Body_SetAngularVelocity(target.body, source.angularVelocity);
    b3.b3Body_SetAwake(target.body, source.awake);
  }

  return restored;
}

const source = createPhysicalWorld();
const baselineSuffix = new Map<number, FoundationStateGuard>();
let checkpoint: PhysicalCheckpoint | null = null;
let checkpointGuard: FoundationStateGuard | null = null;

try {
  for (let tick = 0; tick <= END_TICK; tick += 1) {
    stepWorld(source.world, source.bodies);
    const guard = guardFor(source.bodies);
    if (tick === CHECKPOINT_TICK) {
      checkpoint = captureCheckpoint(tick, source.bodies);
      checkpointGuard = guard;
    } else if (tick > CHECKPOINT_TICK) {
      baselineSuffix.set(tick, guard);
    }
  }
} finally {
  b3.b3DestroyWorld(source.world);
}

assert(checkpoint && checkpointGuard, "checkpoint campaign did not reach the checkpoint boundary");

const checkpointJsonBytes = Buffer.byteLength(JSON.stringify(checkpoint), "utf8");
const restored = restoreCheckpoint(checkpoint);
let firstDivergence: { tick: number; difference: ReturnType<typeof firstFoundationStateGuardDifference> } | null = null;

try {
  const restoredInitialGuard = guardFor(restored.bodies);
  assert.equal(
    firstFoundationStateGuardDifference(checkpointGuard, restoredInitialGuard, topology, WORLD_V0_STATE_COMPONENTS),
    null,
    "host-level body checkpoint must at least reconstruct the exposed float32 body state exactly at the restore boundary",
  );

  for (let tick = CHECKPOINT_TICK + 1; tick <= END_TICK; tick += 1) {
    stepWorld(restored.world, restored.bodies);
    const candidate = guardFor(restored.bodies);
    const reference = baselineSuffix.get(tick);
    assert(reference, `baseline guard missing at tick ${tick}`);
    const difference = firstFoundationStateGuardDifference(reference, candidate, topology, WORLD_V0_STATE_COMPONENTS);
    if (difference && firstDivergence === null) {
      firstDivergence = { tick, difference };
    }
  }
} finally {
  b3.b3DestroyWorld(restored.world);
}

if (firstDivergence === null) {
  console.log(
    `MULTIPLAYER FOUNDATION PHYSICAL RECONSTRUCTION PROBE RESULT · EXACT_THROUGH_${END_TICK} · exposed body-state checkpoint stayed exact for ${END_TICK - CHECKPOINT_TICK} future ticks · checkpointJsonBytes=${checkpointJsonBytes}`,
  );
} else {
  const detail = JSON.stringify(firstDivergence.difference);
  console.log(
    `MULTIPLAYER FOUNDATION PHYSICAL RECONSTRUCTION PROBE RESULT · DIVERGED · firstTick=${firstDivergence.tick} · checkpointJsonBytes=${checkpointJsonBytes} · firstDifference=${detail}`,
  );
}

// The probe itself passes when its apparatus proves an exact restore boundary and produces a
// deterministic future classification. An observed future divergence is a research finding,
// not a CI harness failure; Gate 4 remains unproven until the recovery contract is chosen.
