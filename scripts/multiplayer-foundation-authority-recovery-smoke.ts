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
import {
  FoundationActorInputRegistry,
  type FoundationActorInputCheckpoint,
} from "../src/multiplayer-foundation/actor-input-registry.ts";
import { FoundationEntityTopology } from "../src/multiplayer-foundation/entity-topology.ts";
import {
  FoundationRosterMachine,
  type FoundationMutationOutcome,
  type FoundationRosterCheckpoint,
} from "../src/multiplayer-foundation/roster-machine.ts";
import { chooseFoundationSpawn, type FoundationSpawnCandidate } from "../src/multiplayer-foundation/spawn-policy.ts";
import { packFoundationStateGuard } from "../src/multiplayer-foundation/state-guard.ts";

const b3 = await Box3D();
const DT = 1 / WORLD_V0_TIMING.simulationHz;
const WORLD_EPOCH = "authority-recovery-epoch";
const CAPACITY = 6;
const CHECKPOINT_TICK = 280;
const END_TICK = 360;
const PRE_CHECKPOINT_CHURN_TICK = 260;
const POST_CHECKPOINT_CHURN_A_TICK = 310;
const POST_CHECKPOINT_CHURN_B_TICK = 340;
const MOVE_START_TICK = 80;
const SPAWN_CLEARANCE = 1.5;

const SPAWN_CANDIDATES: FoundationSpawnCandidate[] = [
  { spawnId: "yard-west", position: [-6.5, 0.82, -1.4] },
  { spawnId: "yard-east", position: [6.5, 0.82, 0] },
  { spawnId: "yard-north-west", position: [-6.5, 0.82, -6.0] },
  { spawnId: "yard-north", position: [0, 0.82, -6.5] },
  { spawnId: "yard-south-east", position: [6.5, 0.82, 6.0] },
  { spawnId: "yard-south", position: [0, 0.82, 6.5] },
];

type WorldId = ReturnType<typeof b3.b3CreateWorld>;
type BodyId = ReturnType<typeof b3.b3CreateBody>;
type Vec3 = [number, number, number];
type DynamicRecord = { body: BodyId };
type ActorRecord = DynamicRecord & { actorSessionId: string };
type AuthorityFrame = {
  tick: number;
  outcomes: FoundationMutationOutcome[];
  rosterSnapshot: ReturnType<FoundationRosterMachine["snapshot"]>;
  topologyRevision: number;
  topologyDigest: string;
  guardPacked: string;
  rosterCheckpointDigest: string;
  inputCheckpointDigest: string;
};
type AuthorityRuntime = {
  world: WorldId;
  roster: FoundationRosterMachine;
  topology: FoundationEntityTopology;
  inputs: FoundationActorInputRegistry;
  props: Map<string, DynamicRecord>;
  actors: Map<string, ActorRecord>;
};

function jsonRoundTrip<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function createWorld(): WorldId {
  const worldDef = b3.b3DefaultWorldDef();
  worldDef.gravity = [...WORLD_V0_ARENA.gravity];
  return b3.b3CreateWorld(worldDef);
}

function createStaticBox(
  world: WorldId,
  name: string,
  position: readonly number[],
  halfExtents: readonly number[],
): BodyId {
  const bodyDef = b3.b3DefaultBodyDef();
  bodyDef.position = [...position];
  const body = b3.b3CreateBody(world, bodyDef);
  b3.b3Body_SetName(body, name);
  b3.b3CreateBoxShape(body, b3.b3DefaultShapeDef(), halfExtents[0], halfExtents[1], halfExtents[2]);
  return body;
}

function createPlayerBody(world: WorldId, semanticId: string, start: Vec3): BodyId {
  const bodyDef = b3.b3DefaultBodyDef();
  bodyDef.type = b3.b3BodyType.b3_dynamicBody;
  bodyDef.position = [...start];
  bodyDef.linearDamping = WORLD_V0_PLAYER_PHYSICS.linearDamping;
  bodyDef.angularDamping = WORLD_V0_PLAYER_PHYSICS.angularDamping;
  const body = b3.b3CreateBody(world, bodyDef);
  b3.b3Body_SetName(body, semanticId);
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

function createPropBody(world: WorldId, semanticId: string, position: Vec3): BodyId {
  const bodyDef = b3.b3DefaultBodyDef();
  bodyDef.type = b3.b3BodyType.b3_dynamicBody;
  bodyDef.position = [...position];
  bodyDef.linearDamping = WORLD_V0_PROP_PHYSICS.linearDamping;
  bodyDef.angularDamping = WORLD_V0_PROP_PHYSICS.angularDamping;
  const body = b3.b3CreateBody(world, bodyDef);
  b3.b3Body_SetName(body, semanticId);
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

function bodyPosition(body: BodyId): Vec3 {
  const out: Vec3 = [0, 0, 0];
  b3.b3Body_GetPosition(out, body);
  return [...out];
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
  assert(values.every(Number.isFinite), "authority recovery state must remain finite");
  return values;
}

function moveToward2(cx: number, cz: number, tx: number, tz: number, maxDelta: number): [number, number] {
  const dx = tx - cx;
  const dz = tz - cz;
  const distance = Math.hypot(dx, dz);
  if (distance <= maxDelta || distance < 1e-9) return [tx, tz];
  const scale = maxDelta / distance;
  return [cx + dx * scale, cz + dz * scale];
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

function desiredIntent(actorId: string, body: BodyId, targetTick: number): [number, number] {
  if (targetTick < MOVE_START_TICK) return [0, 0];
  const position = bodyPosition(body);
  const distance = Math.hypot(position[0], position[2]);
  if (distance > 1.5) return [-position[0] / distance, -position[2] / distance];
  const ordinal = Number(actorId.slice("actor:".length));
  const angle = ordinal * 1.618 + targetTick * 0.031;
  return [Math.cos(angle), Math.sin(angle)];
}

function createSourceRuntime(): { runtime: AuthorityRuntime; staticNames: string[] } {
  const world = createWorld();
  const staticNames: string[] = [];
  WORLD_V0_ARENA.staticBoxes.forEach((box, index) => {
    const name = `arena:static:${index}`;
    staticNames.push(name);
    createStaticBox(world, name, box.position, box.halfExtents);
  });

  const props = new Map<string, DynamicRecord>();
  for (const authored of WORLD_V0_PROP_LAYOUT) {
    props.set(authored.id, {
      body: createPropBody(world, authored.id, [...authored.position]),
    });
  }

  const roster = new FoundationRosterMachine({ worldEpoch: WORLD_EPOCH, capacity: CAPACITY });
  const topology = new FoundationEntityTopology(WORLD_EPOCH, WORLD_V0_PROP_LAYOUT.map((prop) => prop.id));
  const inputs = new FoundationActorInputRegistry(WORLD_EPOCH, WORLD_V0_TIMING.maxFutureTicks);
  const actors = new Map<string, ActorRecord>();

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
  roster.queue({ kind: "retire", mutationId: "pre-retire-c", effectiveTick: PRE_CHECKPOINT_CHURN_TICK, actorId: "actor:2" });
  roster.queue({ kind: "join", mutationId: "pre-join-g", effectiveTick: PRE_CHECKPOINT_CHURN_TICK, actorSessionId: "session-g" });
  roster.queue({ kind: "retire", mutationId: "post-retire-e", effectiveTick: POST_CHECKPOINT_CHURN_A_TICK, actorId: "actor:4" });
  roster.queue({ kind: "join", mutationId: "post-join-h", effectiveTick: POST_CHECKPOINT_CHURN_A_TICK, actorSessionId: "session-h" });
  roster.queue({ kind: "retire", mutationId: "post-retire-a", effectiveTick: POST_CHECKPOINT_CHURN_B_TICK, actorId: "actor:0" });
  roster.queue({ kind: "join", mutationId: "post-join-i", effectiveTick: POST_CHECKPOINT_CHURN_B_TICK, actorSessionId: "session-i" });

  return {
    runtime: { world, roster, topology, inputs, props, actors },
    staticNames,
  };
}

function applyRosterOutcome(runtime: AuthorityRuntime, outcome: FoundationMutationOutcome): void {
  if (outcome.status === "retired") {
    const existing = runtime.actors.get(outcome.actorId);
    assert(existing, `missing physical body for retired ${outcome.actorId}`);
    const retiredBody = existing.body;
    b3.b3DestroyBody(retiredBody);
    assert.equal(b3.b3Body_IsValid(retiredBody), false, `retired body ${outcome.actorId} must be invalidated`);
    runtime.actors.delete(outcome.actorId);
    return;
  }
  if (outcome.status !== "joined") return;

  const blockers = [
    ...[...runtime.props.entries()].map(([entityId, record]) => ({ entityId, position: bodyPosition(record.body) })),
    ...[...runtime.actors.entries()].map(([entityId, record]) => ({ entityId, position: bodyPosition(record.body) })),
  ];
  const spawn = chooseFoundationSpawn(SPAWN_CANDIDATES, blockers, SPAWN_CLEARANCE);
  assert(spawn, `no safe spawn candidate for ${outcome.actorId}`);
  const body = createPlayerBody(runtime.world, outcome.actorId, [...spawn.position]);
  runtime.actors.set(outcome.actorId, { body, actorSessionId: outcome.actorSessionId });
}

function applyTransportStimulus(runtime: AuthorityRuntime, tick: number): void {
  if (tick === 235) {
    assert.equal(runtime.roster.setTransportConnected("session-e", false), true, "pre-checkpoint disconnect failed");
  }
  if (tick === 300) {
    assert.equal(runtime.roster.setTransportConnected("session-e", true), true, "post-recovery reconnect failed");
  }
}

function advanceAuthorityTick(runtime: AuthorityRuntime, tick: number): AuthorityFrame {
  const outcomes = runtime.roster.advanceTo(tick);
  outcomes.forEach((outcome) => applyRosterOutcome(runtime, outcome));
  applyTransportStimulus(runtime, tick);

  const rosterSnapshot = runtime.roster.snapshot();
  const topologySnapshot = runtime.topology.syncRoster(rosterSnapshot);
  runtime.inputs.syncRoster(rosterSnapshot);

  assert.equal(runtime.actors.size, rosterSnapshot.actors.length, `physical actor membership drift at tick ${tick}`);
  const coverage = runtime.topology.validateEntityCoverage([...runtime.actors.keys(), ...runtime.props.keys()]);
  assert.deepEqual(coverage, { exact: true, missing: [], unexpected: [] }, `entity coverage drift at tick ${tick}`);

  for (const actor of rosterSnapshot.actors) {
    const physical = runtime.actors.get(actor.actorId);
    assert(physical, `missing physical actor ${actor.actorId} at tick ${tick}`);
    assert.equal(physical.actorSessionId, actor.actorSessionId, `actor ownership drift for ${actor.actorId} at tick ${tick}`);
    const intent = runtime.inputs.consume(actor.actorId, tick);
    assert.equal(intent.actorSessionId, actor.actorSessionId);
    applyIntent(physical.body, intent.x, intent.z);
  }

  b3.b3World_Step(runtime.world, DT, WORLD_V0_TIMING.substeps);

  for (const actor of rosterSnapshot.actors) {
    const physical = runtime.actors.get(actor.actorId);
    assert(physical);
    const [x, z] = desiredIntent(actor.actorId, physical.body, tick + 1);
    const accepted = runtime.inputs.schedule({
      actorId: actor.actorId,
      actorSessionId: actor.actorSessionId,
      targetTick: tick + 1,
      x,
      z,
    }, tick);
    assert.equal(accepted.status, "accepted", `input schedule failed for ${actor.actorId} at tick ${tick}`);
  }

  const guard = packFoundationStateGuard(
    topologySnapshot,
    WORLD_V0_STATE_COMPONENTS,
    (entityId) => {
      const actor = runtime.actors.get(entityId);
      if (actor) return bodyValues(actor.body);
      const prop = runtime.props.get(entityId);
      if (prop) return bodyValues(prop.body);
      return [];
    },
  );
  assert.equal(guard.entityCount, runtime.actors.size + runtime.props.size);

  return {
    tick,
    outcomes: outcomes.map((outcome) => ({ ...outcome })),
    rosterSnapshot,
    topologyRevision: topologySnapshot.topologyRevision,
    topologyDigest: topologySnapshot.topologyDigest,
    guardPacked: guard.packed,
    rosterCheckpointDigest: runtime.roster.checkpoint().stateDigest,
    inputCheckpointDigest: runtime.inputs.checkpoint(rosterSnapshot).stateDigest,
  };
}

function expectedCheckpointNames(staticNames: string[], runtime: AuthorityRuntime): string[] {
  return [
    ...staticNames,
    ...runtime.props.keys(),
    ...runtime.actors.keys(),
  ].sort();
}

function rebindRecoveredBodies(
  player: unknown,
  expectedNames: readonly string[],
  restoredRoster: FoundationRosterMachine,
): { props: Map<string, DynamicRecord>; actors: Map<string, ActorRecord> } {
  const rebound = new Map<string, BodyId>();
  const count = b3.b3RecPlayer_GetBodyCount(player);
  assert.equal(count, expectedNames.length, "recovered Box3D body count must match checkpoint manifest");
  for (let ordinal = 0; ordinal < count; ordinal += 1) {
    const body = b3.b3RecPlayer_GetBodyId(player, ordinal);
    assert.equal(b3.b3Body_IsValid(body), true, `recovered body ordinal ${ordinal} must be valid`);
    const name = b3.b3Body_GetName(body);
    assert(name.length > 0, `recovered body ordinal ${ordinal} is missing its semantic name`);
    assert.equal(rebound.has(name), false, `duplicate recovered body name ${name}`);
    rebound.set(name, body);
  }
  assert.deepEqual([...rebound.keys()].sort(), [...expectedNames].sort(), "recovered semantic body domain drift");

  const props = new Map<string, DynamicRecord>();
  for (const authored of WORLD_V0_PROP_LAYOUT) {
    const body = rebound.get(authored.id);
    assert(body, `recovered prop ${authored.id} failed to rebind`);
    props.set(authored.id, { body });
  }

  const actors = new Map<string, ActorRecord>();
  for (const actor of restoredRoster.snapshot().actors) {
    const body = rebound.get(actor.actorId);
    assert(body, `recovered actor ${actor.actorId} failed to rebind`);
    actors.set(actor.actorId, { body, actorSessionId: actor.actorSessionId });
  }
  assert.equal(rebound.has("actor:2"), false, "pre-checkpoint retired actor must not reappear in recovered physics world");
  return { props, actors };
}

const { runtime: source, staticNames } = createSourceRuntime();
let checkpointFrame: AuthorityFrame | null = null;
let rosterCheckpoint: FoundationRosterCheckpoint | null = null;
let inputCheckpoint: FoundationActorInputCheckpoint | null = null;
let recording: ReturnType<typeof b3.b3CreateRecording> | null = null;
let checkpointNames: string[] = [];

for (let tick = 0; tick <= CHECKPOINT_TICK; tick += 1) {
  const frame = advanceAuthorityTick(source, tick);
  if (tick === CHECKPOINT_TICK) {
    checkpointFrame = frame;
    rosterCheckpoint = jsonRoundTrip(source.roster.checkpoint());
    inputCheckpoint = jsonRoundTrip(source.inputs.checkpoint(source.roster.snapshot()));
    checkpointNames = expectedCheckpointNames(staticNames, source);
    recording = b3.b3CreateRecording(0);
    assert(recording, "Box3D recovery recording allocation failed");
    b3.b3World_StartRecording(source.world, recording);
    b3.b3World_StopRecording(source.world);
  }
}

assert(checkpointFrame && rosterCheckpoint && inputCheckpoint && recording);
assert.equal(checkpointFrame.topologyRevision, 8, "checkpoint must include six joins plus pre-checkpoint retire/replacement churn");
assert.deepEqual(
  checkpointFrame.rosterSnapshot.actors.map((actor) => actor.actorId),
  ["actor:0", "actor:1", "actor:3", "actor:4", "actor:5", "actor:6"],
);
assert.equal(
  checkpointFrame.rosterSnapshot.actors.find((actor) => actor.actorSessionId === "session-e")?.transportConnected,
  false,
  "checkpoint must preserve a disconnected active transport independently of actor authority",
);

const baselineFrames = new Map<number, AuthorityFrame>();
for (let tick = CHECKPOINT_TICK + 1; tick < END_TICK; tick += 1) {
  baselineFrames.set(tick, advanceAuthorityTick(source, tick));
}
const baselineFinalRoster = source.roster.snapshot();
const baselineFinalHistory = source.roster.actorHistory();
const baselineFinalRosterCheckpoint = source.roster.checkpoint();
const baselineFinalInputCheckpoint = source.inputs.checkpoint(source.roster.snapshot());
b3.b3DestroyWorld(source.world);

// Occupy a normal world slot so recovered body identity cannot accidentally rely
// on stale source handles or immediate world-slot reuse.
const spoilerWorld = createWorld();
createStaticBox(spoilerWorld, "spoiler:body", [50, 50, 50], [0.5, 0.5, 0.5]);

const player = b3.b3RecPlayer_CreateFromRecording(recording, 1);
assert(player, "seed-only authority recording failed to create replay player");
assert.equal(b3.b3RecPlayer_GetFrameCount(player), 0, "authority recovery recording must contain zero future frames");
assert.equal(b3.b3RecPlayer_StepFrame(player), false, "seed-only authority replay must have no recorded future step");

const restoredRoster = FoundationRosterMachine.fromCheckpoint(jsonRoundTrip(rosterCheckpoint));
const restoredInputs = FoundationActorInputRegistry.fromCheckpoint(
  jsonRoundTrip(inputCheckpoint),
  restoredRoster.snapshot(),
);
const restoredTopology = new FoundationEntityTopology(WORLD_EPOCH, WORLD_V0_PROP_LAYOUT.map((prop) => prop.id));
const restoredTopologyAtBoundary = restoredTopology.syncRoster(restoredRoster.snapshot());
assert.equal(restoredTopologyAtBoundary.topologyRevision, checkpointFrame.topologyRevision);
assert.equal(restoredTopologyAtBoundary.topologyDigest, checkpointFrame.topologyDigest);

const restoredWorld = b3.b3RecPlayer_GetWorldId(player);
assert.equal(b3.b3World_IsValid(restoredWorld), true, "recovered authority world must be valid");
const rebound = rebindRecoveredBodies(player, checkpointNames, restoredRoster);
const restored: AuthorityRuntime = {
  world: restoredWorld,
  roster: restoredRoster,
  topology: restoredTopology,
  inputs: restoredInputs,
  props: rebound.props,
  actors: rebound.actors,
};

const restoredBoundaryGuard = packFoundationStateGuard(
  restoredTopologyAtBoundary,
  WORLD_V0_STATE_COMPONENTS,
  (entityId) => {
    const actor = restored.actors.get(entityId);
    if (actor) return bodyValues(actor.body);
    const prop = restored.props.get(entityId);
    if (prop) return bodyValues(prop.body);
    return [];
  },
);
assert.equal(restoredBoundaryGuard.packed, checkpointFrame.guardPacked, "recovered physics guard drift at checkpoint boundary");
assert.equal(restored.roster.checkpoint().stateDigest, checkpointFrame.rosterCheckpointDigest, "recovered roster digest drift at checkpoint boundary");
assert.equal(
  restored.inputs.checkpoint(restored.roster.snapshot()).stateDigest,
  checkpointFrame.inputCheckpointDigest,
  "recovered input digest drift at checkpoint boundary",
);

for (let tick = CHECKPOINT_TICK + 1; tick < END_TICK; tick += 1) {
  const expected = baselineFrames.get(tick);
  assert(expected, `missing baseline authority frame ${tick}`);
  const actual = advanceAuthorityTick(restored, tick);
  assert.deepEqual(actual.outcomes, expected.outcomes, `recovered roster outcomes drift at tick ${tick}`);
  assert.deepEqual(actual.rosterSnapshot, expected.rosterSnapshot, `recovered roster snapshot drift at tick ${tick}`);
  assert.equal(actual.topologyRevision, expected.topologyRevision, `recovered topology revision drift at tick ${tick}`);
  assert.equal(actual.topologyDigest, expected.topologyDigest, `recovered topology digest drift at tick ${tick}`);
  assert.equal(actual.guardPacked, expected.guardPacked, `recovered exact float32 physics guard drift at tick ${tick}`);
  assert.equal(
    actual.rosterCheckpointDigest,
    expected.rosterCheckpointDigest,
    `recovered roster checkpoint digest drift at tick ${tick}`,
  );
  assert.equal(
    actual.inputCheckpointDigest,
    expected.inputCheckpointDigest,
    `recovered input checkpoint digest drift at tick ${tick}`,
  );
}

assert.deepEqual(restored.roster.snapshot(), baselineFinalRoster, "final recovered roster drift");
assert.deepEqual(restored.roster.actorHistory(), baselineFinalHistory, "final recovered actor history drift");
assert.deepEqual(restored.roster.checkpoint(), baselineFinalRosterCheckpoint, "final recovered roster checkpoint drift");
assert.deepEqual(
  restored.inputs.checkpoint(restored.roster.snapshot()),
  baselineFinalInputCheckpoint,
  "final recovered input checkpoint drift",
);
assert.equal(restored.roster.topologyRevision, 12, "three retire/replacement churn events must yield topology revision 12");
assert.deepEqual(
  restored.roster.snapshot().actors.map((actor) => actor.actorId),
  ["actor:1", "actor:3", "actor:5", "actor:6", "actor:7", "actor:8"],
  "post-recovery churn must preserve monotonic actor identity without reuse",
);
assert.equal(restored.actors.size, 6);
assert.equal(restored.props.size, WORLD_V0_PROP_LAYOUT.length);
assert.equal(restored.actors.has("actor:0"), false);
assert.equal(restored.actors.has("actor:2"), false);
assert.equal(restored.actors.has("actor:4"), false);
assert.equal(restored.actors.has("actor:7"), true);
assert.equal(restored.actors.has("actor:8"), true);

b3.b3RecPlayer_Destroy(player);
b3.b3DestroyRecording(recording);
b3.b3DestroyWorld(spoilerWorld);

console.log(
  `MULTIPLAYER FOUNDATION AUTHORITY RECOVERY SMOKE PASS · full seed-only Box3D world + JSON portable roster/input checkpoints resumed exactly from tick ${CHECKPOINT_TICK} through ${END_TICK - 1} · semantic body-name rebind + pre-checkpoint churn + two post-recovery retire/replacement churns · exact physics/topology/roster/input guards every tick`,
);
