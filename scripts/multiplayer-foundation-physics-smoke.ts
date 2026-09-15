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
import { FoundationActorInputRegistry } from "../src/multiplayer-foundation/actor-input-registry.ts";
import { FoundationEntityTopology } from "../src/multiplayer-foundation/entity-topology.ts";
import { FoundationRosterMachine, type FoundationMutationOutcome } from "../src/multiplayer-foundation/roster-machine.ts";
import { chooseFoundationSpawn, type FoundationSpawnCandidate } from "../src/multiplayer-foundation/spawn-policy.ts";
import { packFoundationStateGuard } from "../src/multiplayer-foundation/state-guard.ts";

const b3 = await Box3D();
const DT = 1 / WORLD_V0_TIMING.simulationHz;
const WORLD_EPOCH = "physics-dynamic-roster-epoch";
const CAPACITY = 6;
const MOVE_START_TICK = 220;
const END_TICK = 360;
const CHURN_TICK = 260;
const SPAWN_CLEARANCE = 1.5;

const SPAWN_CANDIDATES: FoundationSpawnCandidate[] = [
  { spawnId: "yard-west", position: [-6.5, 0.82, -1.4] },
  { spawnId: "yard-east", position: [6.5, 0.82, 0] },
  { spawnId: "yard-north-west", position: [-6.5, 0.82, -6.0] },
  { spawnId: "yard-north", position: [0, 0.82, -6.5] },
  { spawnId: "yard-south-east", position: [6.5, 0.82, 6.0] },
  { spawnId: "yard-south", position: [0, 0.82, 6.5] },
];

type BodyId = ReturnType<typeof b3.b3CreateBody>;
type Vec3 = [number, number, number];
type DynamicRecord = {
  body: BodyId;
  initial: Vec3;
};
type ActorRecord = DynamicRecord & {
  actorSessionId: string;
  spawnId: string;
};

type ScenarioResult = {
  finalGuardPacked: string;
  finalTopologyDigest: string;
  finalTopologyRevision: number;
  finalActorIds: string[];
  checkpointGuards: Map<number, string>;
  maxActorCount: number;
  maxDisplacementByActor: Map<string, number>;
  retiredActorBodyInvalidated: boolean;
  elapsedMs: number;
};

function createStaticBox(world: ReturnType<typeof b3.b3CreateWorld>, position: readonly number[], halfExtents: readonly number[]): void {
  const bodyDef = b3.b3DefaultBodyDef();
  bodyDef.position = [...position];
  const body = b3.b3CreateBody(world, bodyDef);
  b3.b3CreateBoxShape(body, b3.b3DefaultShapeDef(), halfExtents[0], halfExtents[1], halfExtents[2]);
}

function bodyPosition(body: BodyId): Vec3 {
  const out: Vec3 = [0, 0, 0];
  b3.b3Body_GetPosition(out, body);
  return [out[0], out[1], out[2]];
}

function bodyValues(body: BodyId): number[] {
  const position: Vec3 = [0, 0, 0];
  const rotation: [number, number, number, number] = [0, 0, 0, 1];
  const linearVelocity: Vec3 = [0, 0, 0];
  const angularVelocity: Vec3 = [0, 0, 0];
  b3.b3Body_GetPosition(position, body);
  b3.b3Body_GetRotation(rotation, body);
  b3.b3Body_GetLinearVelocity(linearVelocity, body);
  b3.b3Body_GetAngularVelocity(angularVelocity, body);
  const values = [...position, ...rotation, ...linearVelocity, ...angularVelocity];
  assert(values.every(Number.isFinite), "Box3D dynamic state must remain finite");
  return values;
}

function horizontalDistance(a: readonly number[], b: readonly number[]): number {
  return Math.hypot(a[0] - b[0], a[2] - b[2]);
}

function moveToward2(cx: number, cz: number, tx: number, tz: number, maxDelta: number): [number, number] {
  const dx = tx - cx;
  const dz = tz - cz;
  const distance = Math.hypot(dx, dz);
  if (distance <= maxDelta || distance < 1e-9) return [tx, tz];
  const scale = maxDelta / distance;
  return [cx + dx * scale, cz + dz * scale];
}

function createPlayerBody(world: ReturnType<typeof b3.b3CreateWorld>, start: Vec3): BodyId {
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

function createPropBody(world: ReturnType<typeof b3.b3CreateWorld>, position: Vec3): BodyId {
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

function applyIntent(body: BodyId, x: number, z: number): void {
  const velocity: Vec3 = [0, 0, 0];
  b3.b3Body_GetLinearVelocity(velocity, body);
  const hasInput = Math.hypot(x, z) > 0.01;
  const targetX = x * WORLD_V0_MOVEMENT.playerSpeed;
  const targetZ = z * WORLD_V0_MOVEMENT.playerSpeed;
  const acceleration = hasInput ? WORLD_V0_MOVEMENT.playerAcceleration : WORLD_V0_MOVEMENT.playerDeceleration;
  const [nextX, nextZ] = moveToward2(
    velocity[0],
    velocity[2],
    targetX,
    targetZ,
    acceleration * DT,
  );
  b3.b3Body_SetLinearVelocity(body, [nextX, velocity[1], nextZ]);
}

function desiredIntent(record: ActorRecord, targetTick: number): [number, number] {
  if (targetTick < MOVE_START_TICK) return [0, 0];
  const x = Math.abs(record.initial[0]) < 1e-9 ? 0 : -Math.sign(record.initial[0]);
  const z = Math.abs(record.initial[2]) < 1e-9 ? 0 : -Math.sign(record.initial[2]);
  if (x === 0 && z === 0) return [1, 0];
  return [x, z];
}

function runScenario(): ScenarioResult {
  const startedAt = performance.now();
  const worldDef = b3.b3DefaultWorldDef();
  worldDef.gravity = [...WORLD_V0_ARENA.gravity];
  const world = b3.b3CreateWorld(worldDef);
  let worldCreateCount = 1;

  for (const box of WORLD_V0_ARENA.staticBoxes) {
    createStaticBox(world, box.position, box.halfExtents);
  }

  const props = new Map<string, DynamicRecord>();
  for (const authored of WORLD_V0_PROP_LAYOUT) {
    const initial: Vec3 = [...authored.position];
    props.set(authored.id, { body: createPropBody(world, initial), initial });
  }

  const roster = new FoundationRosterMachine({ worldEpoch: WORLD_EPOCH, capacity: CAPACITY });
  const topology = new FoundationEntityTopology(WORLD_EPOCH, WORLD_V0_PROP_LAYOUT.map((prop) => prop.id));
  const inputs = new FoundationActorInputRegistry(WORLD_EPOCH, WORLD_V0_TIMING.maxFutureTicks);
  const actors = new Map<string, ActorRecord>();
  const maxDisplacementByActor = new Map<string, number>();
  const checkpointGuards = new Map<number, string>();
  let maxActorCount = 0;
  let retiredActorBodyInvalidated = false;

  const joins = [
    ["join-a", 1, "session-a"],
    ["join-b", 40, "session-b"],
    ["join-c", 80, "session-c"],
    ["join-d", 120, "session-d"],
    ["join-e", 160, "session-e"],
    ["join-f", 200, "session-f"],
  ] as const;
  for (const [mutationId, effectiveTick, actorSessionId] of joins) {
    roster.queue({ kind: "join", mutationId, effectiveTick, actorSessionId });
  }
  roster.queue({ kind: "retire", mutationId: "z-retire-c", effectiveTick: CHURN_TICK, actorId: "actor:2" });
  roster.queue({ kind: "join", mutationId: "a-join-g", effectiveTick: CHURN_TICK, actorSessionId: "session-g" });

  const applyRosterOutcome = (outcome: FoundationMutationOutcome): void => {
    if (outcome.status === "retired") {
      const record = actors.get(outcome.actorId);
      assert(record, `physical actor body missing for retirement ${outcome.actorId}`);
      const retiredBody = record.body;
      b3.b3DestroyBody(retiredBody);
      actors.delete(outcome.actorId);
      retiredActorBodyInvalidated = !b3.b3Body_IsValid(retiredBody);
      return;
    }
    if (outcome.status !== "joined") return;

    const blockers = [
      ...[...props.entries()].map(([entityId, record]) => ({ entityId, position: bodyPosition(record.body) })),
      ...[...actors.entries()].map(([entityId, record]) => ({ entityId, position: bodyPosition(record.body) })),
    ];
    const spawn = chooseFoundationSpawn(SPAWN_CANDIDATES, blockers, SPAWN_CLEARANCE);
    assert(spawn, `no safe spawn candidate for ${outcome.actorId}`);
    const initial: Vec3 = [...spawn.position];
    const body = createPlayerBody(world, initial);
    actors.set(outcome.actorId, {
      body,
      initial,
      actorSessionId: outcome.actorSessionId,
      spawnId: spawn.spawnId,
    });
    maxDisplacementByActor.set(outcome.actorId, 0);
  };

  let finalGuard = null as ReturnType<typeof packFoundationStateGuard> | null;
  let finalTopology = null as ReturnType<typeof topology.snapshot> | null;

  try {
    for (let tick = 0; tick < END_TICK; tick += 1) {
      const outcomes = roster.advanceTo(tick);
      outcomes.forEach(applyRosterOutcome);

      const rosterSnapshot = roster.snapshot();
      const topologySnapshot = topology.syncRoster(rosterSnapshot);
      inputs.syncRoster(rosterSnapshot);
      maxActorCount = Math.max(maxActorCount, actors.size);
      assert.equal(worldCreateCount, 1, "dynamic membership must not recreate the physical world");
      assert.equal(actors.size, rosterSnapshot.actors.length, "physical actor bodies must exactly follow active roster membership");

      const coverage = topology.validateEntityCoverage([...actors.keys(), ...props.keys()]);
      assert.deepEqual(coverage, { exact: true, missing: [], unexpected: [] }, `entity coverage drift at tick ${tick}`);

      for (const actor of rosterSnapshot.actors) {
        const physical = actors.get(actor.actorId);
        assert(physical, `missing physical body for ${actor.actorId}`);
        assert.equal(physical.actorSessionId, actor.actorSessionId, `physical ownership drift for ${actor.actorId}`);
        const intent = inputs.consume(actor.actorId, tick);
        assert.equal(intent.actorSessionId, actor.actorSessionId, `consumed input ownership drift for ${actor.actorId}`);
        applyIntent(physical.body, intent.x, intent.z);
      }

      b3.b3World_Step(world, DT, WORLD_V0_TIMING.substeps);

      for (const [actorId, record] of actors) {
        const position = bodyPosition(record.body);
        assert(position.every(Number.isFinite), `non-finite actor position for ${actorId}`);
        const displacement = horizontalDistance(position, record.initial);
        maxDisplacementByActor.set(actorId, Math.max(maxDisplacementByActor.get(actorId) ?? 0, displacement));
      }

      for (const actor of rosterSnapshot.actors) {
        const physical = actors.get(actor.actorId);
        assert(physical);
        const [x, z] = desiredIntent(physical, tick + 1);
        const acceptance = inputs.schedule({
          actorId: actor.actorId,
          actorSessionId: actor.actorSessionId,
          targetTick: tick + 1,
          x,
          z,
        }, tick);
        assert.equal(acceptance.status, "accepted", `input scheduling failed for ${actor.actorId} at tick ${tick}`);
      }

      const guard = packFoundationStateGuard(
        topologySnapshot,
        WORLD_V0_STATE_COMPONENTS,
        (entityId) => {
          const actor = actors.get(entityId);
          if (actor) return bodyValues(actor.body);
          const prop = props.get(entityId);
          if (prop) return bodyValues(prop.body);
          return [];
        },
      );
      assert.equal(guard.entityCount, actors.size + props.size);
      assert.equal(guard.packed.length, guard.entityCount * WORLD_V0_STATE_COMPONENTS.length * 8);

      if ([1, 40, 80, 120, 160, 200, CHURN_TICK, END_TICK - 1].includes(tick)) {
        checkpointGuards.set(tick, `${guard.topologyRevision}:${guard.topologyDigest}:${guard.packed}`);
      }
      finalGuard = guard;
      finalTopology = topologySnapshot;
    }

    assert(finalGuard && finalTopology);
    assert.equal(maxActorCount, 6, "scenario must physically reach six concurrent actors");
    assert.equal(finalTopology.topologyRevision, 8, "six joins + retire + replacement must yield topology revision 8");
    assert.deepEqual(
      roster.snapshot().actors.map((actor) => actor.actorId),
      ["actor:0", "actor:1", "actor:3", "actor:4", "actor:5", "actor:6"],
    );
    assert.equal(actors.has("actor:2"), false);
    assert.equal(actors.has("actor:6"), true);
    assert.equal(retiredActorBodyInvalidated, true, "retired Box3D body must be destroyed rather than merely hidden from topology");
    assert.equal(finalGuard.entityCount, 18, "final physical guard must cover six active actors + twelve props");

    for (const actorId of ["actor:0", "actor:1", "actor:2", "actor:3", "actor:4", "actor:5", "actor:6"]) {
      assert(
        (maxDisplacementByActor.get(actorId) ?? 0) > 0.25,
        `${actorId} never demonstrated meaningful scheduled-input-driven physical movement`,
      );
    }

    return {
      finalGuardPacked: finalGuard.packed,
      finalTopologyDigest: finalGuard.topologyDigest,
      finalTopologyRevision: finalGuard.topologyRevision,
      finalActorIds: roster.snapshot().actors.map((actor) => actor.actorId),
      checkpointGuards,
      maxActorCount,
      maxDisplacementByActor,
      retiredActorBodyInvalidated,
      elapsedMs: performance.now() - startedAt,
    };
  } finally {
    b3.b3DestroyWorld(world);
    worldCreateCount = 0;
  }
}

const first = runScenario();
const second = runScenario();
assert.equal(first.finalTopologyRevision, 8);
assert.equal(first.finalTopologyDigest, second.finalTopologyDigest, "repeat run topology digest drift");
assert.equal(first.finalGuardPacked, second.finalGuardPacked, "repeat run final exact float32 guard drift");
assert.deepEqual([...first.checkpointGuards.entries()], [...second.checkpointGuards.entries()], "repeat run checkpoint guard drift");
assert.deepEqual(first.finalActorIds, second.finalActorIds);

console.log(
  `MULTIPLAYER FOUNDATION PHYSICS SMOKE PASS · live Box3D 0→1→2→3→4→5→6 + same-epoch churn + scheduled ownership + 18-entity guards + exact repeatability · runA=${first.elapsedMs.toFixed(1)}ms runB=${second.elapsedMs.toFixed(1)}ms`,
);
