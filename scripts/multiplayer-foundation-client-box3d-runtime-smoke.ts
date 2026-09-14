import assert from "node:assert/strict";
import Box3D from "box3d.js";
import {
  createFoundationClientBootstrap,
  hydrateFoundationClientBootstrap,
  type FoundationClientExecutionProfile,
} from "../src/multiplayer-foundation/client-bootstrap.ts";
import {
  captureFoundationBox3DClientGuard,
  destroyFoundationBox3DClientRuntime,
  hydrateFoundationBox3DClientRuntime,
  stepFoundationBox3DClientRuntime,
} from "../src/multiplayer-foundation/client-box3d-runtime.ts";
import { FoundationEntityTopology } from "../src/multiplayer-foundation/entity-topology.ts";
import { FoundationRosterMachine, type FoundationMutationOutcome } from "../src/multiplayer-foundation/roster-machine.ts";
import { packFoundationStateGuard } from "../src/multiplayer-foundation/state-guard.ts";
import {
  WORLD_V0_ARENA,
  WORLD_V0_MOVEMENT,
  WORLD_V0_PLAYER_PHYSICS,
  WORLD_V0_PROP_LAYOUT,
  WORLD_V0_PROP_PHYSICS,
  WORLD_V0_SIM_BUILD_ID,
  WORLD_V0_STATE_COMPONENTS,
  WORLD_V0_TIMING,
} from "../src/world-v0-contract.ts";

const b3 = await Box3D();
const WORLD_EPOCH = "client-box3d-runtime-smoke-epoch-1";
const CAPACITY = 6;
const MAX_CHECKPOINT_SEARCH_TICK = 240;
const CONTINUATION_TICKS = 80;
const DT = 1 / WORLD_V0_TIMING.simulationHz;
const PROFILE: FoundationClientExecutionProfile = {
  profileId: "shared-yard-foundation-client-v1",
  buildId: WORLD_V0_SIM_BUILD_ID,
  stateSchemaId: "shared-yard-rigidbody-f32-13-v1",
};

const ACTOR_STARTS: ReadonlyArray<readonly [number, number, number]> = [
  [-1.80, 0.82, -0.48],
  [1.80, 0.82, -0.48],
  [-1.80, 0.82, 0.48],
  [1.80, 0.82, 0.48],
  [0, 0.82, -1.32],
  [0, 0.82, 1.32],
];

type WorldId = ReturnType<typeof b3.b3CreateWorld>;
type BodyId = ReturnType<typeof b3.b3CreateBody>;
type Vec3 = [number, number, number];
type RuntimeState = {
  world: WorldId;
  roster: FoundationRosterMachine;
  topology: FoundationEntityTopology;
  staticNames: string[];
  props: Map<string, BodyId>;
  actorsById: Map<string, { body: BodyId; actorSessionId: string }>;
};

type ContactEvidence = {
  actorId: string;
  propId: string;
  maxNormalImpulse: number;
};

const contactsBuffer = b3.createContactsBuffer();
const contact = b3.createContact();
const manifold = b3.createManifold();

function createStaticBox(world: WorldId, name: string, position: readonly number[], halfExtents: readonly number[]): BodyId {
  const def = b3.b3DefaultBodyDef();
  def.position = [...position];
  const body = b3.b3CreateBody(world, def);
  b3.b3Body_SetName(body, name);
  b3.b3CreateBoxShape(body, b3.b3DefaultShapeDef(), halfExtents[0], halfExtents[1], halfExtents[2]);
  return body;
}

function createPlayerBody(world: WorldId, name: string, position: readonly number[]): BodyId {
  const def = b3.b3DefaultBodyDef();
  def.type = b3.b3BodyType.b3_dynamicBody;
  def.position = [...position];
  def.linearDamping = WORLD_V0_PLAYER_PHYSICS.linearDamping;
  def.angularDamping = WORLD_V0_PLAYER_PHYSICS.angularDamping;
  const body = b3.b3CreateBody(world, def);
  b3.b3Body_SetName(body, name);
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
    linearX: false,
    linearY: false,
    linearZ: false,
    angularX: WORLD_V0_PLAYER_PHYSICS.angularLocks[0],
    angularY: WORLD_V0_PLAYER_PHYSICS.angularLocks[1],
    angularZ: WORLD_V0_PLAYER_PHYSICS.angularLocks[2],
  });
  return body;
}

function createPropBody(world: WorldId, name: string, position: readonly number[]): BodyId {
  const def = b3.b3DefaultBodyDef();
  def.type = b3.b3BodyType.b3_dynamicBody;
  def.position = [...position];
  def.linearDamping = WORLD_V0_PROP_PHYSICS.linearDamping;
  def.angularDamping = WORLD_V0_PROP_PHYSICS.angularDamping;
  const body = b3.b3CreateBody(world, def);
  b3.b3Body_SetName(body, name);
  const shape = b3.b3DefaultShapeDef();
  shape.density = WORLD_V0_PROP_PHYSICS.density;
  shape.baseMaterial.friction = WORLD_V0_PROP_PHYSICS.friction;
  shape.baseMaterial.restitution = WORLD_V0_PROP_PHYSICS.restitution;
  b3.b3CreateBoxShape(body, shape, WORLD_V0_PROP_PHYSICS.halfExtents[0], WORLD_V0_PROP_PHYSICS.halfExtents[1], WORLD_V0_PROP_PHYSICS.halfExtents[2]);
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
  return [...position, ...rotation, ...linearVelocity, ...angularVelocity];
}

function sameBodyId(a: BodyId, candidate: BodyId): boolean {
  return a.index1 === candidate.index1
    && a.world0 === candidate.world0
    && a.generation === candidate.generation;
}

function activeActorPropContacts(runtime: RuntimeState): ContactEvidence[] {
  const evidence: ContactEvidence[] = [];
  for (const [actorId, actor] of runtime.actorsById) {
    b3.getBodyContactData(contactsBuffer, actor.body);
    const count = b3.getNumContacts(contactsBuffer);
    for (let contactIndex = 0; contactIndex < count; contactIndex += 1) {
      b3.getContactAt(contact, contactsBuffer, contactIndex);
      const bodyA = b3.b3Shape_GetBody(contact.shapeIdA);
      const bodyB = b3.b3Shape_GetBody(contact.shapeIdB);
      const actorIsA = sameBodyId(bodyA, actor.body);
      const actorIsB = sameBodyId(bodyB, actor.body);
      if (!actorIsA && !actorIsB) continue;
      const otherBody = actorIsA ? bodyB : bodyA;
      const otherName = b3.b3Body_GetName(otherBody);
      if (!runtime.props.has(otherName)) continue;

      let maxNormalImpulse = 0;
      for (let manifoldIndex = 0; manifoldIndex < contact.manifoldCount; manifoldIndex += 1) {
        b3.getManifoldAt(manifold, contact, manifoldIndex);
        for (let pointIndex = 0; pointIndex < manifold.pointCount; pointIndex += 1) {
          maxNormalImpulse = Math.max(maxNormalImpulse, manifold.points[pointIndex].totalNormalImpulse);
        }
      }
      if (maxNormalImpulse > 1e-6) {
        evidence.push({ actorId, propId: otherName, maxNormalImpulse });
      }
    }
  }
  return evidence;
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
  const [nextX, nextZ] = moveToward2(velocity[0], velocity[2], targetX, targetZ, acceleration * DT);
  b3.b3Body_SetLinearVelocity(body, [nextX, velocity[1], nextZ]);
}

function actorOrdinal(actorId: string): number {
  const ordinal = Number(actorId.slice("actor:".length));
  assert(Number.isSafeInteger(ordinal));
  return ordinal;
}

function intendedInput(actorId: string, targetTick: number): { x: number; z: number; jump: false } {
  const ordinal = actorOrdinal(actorId);
  if (targetTick < 12) return { x: 0, z: 0, jump: false };
  const start = ACTOR_STARTS[ordinal];
  const length = Math.hypot(start[0], start[2]);
  if (targetTick <= MAX_CHECKPOINT_SEARCH_TICK) {
    return { x: -start[0] / length, z: -start[2] / length, jump: false };
  }
  const angle = ordinal * 1.0471975512 + (targetTick - MAX_CHECKPOINT_SEARCH_TICK) * 0.035;
  return { x: Math.cos(angle), z: Math.sin(angle), jump: false };
}

function createRuntime(): RuntimeState {
  const worldDef = b3.b3DefaultWorldDef();
  worldDef.gravity = [...WORLD_V0_ARENA.gravity];
  const world = b3.b3CreateWorld(worldDef);
  const staticNames: string[] = [];
  WORLD_V0_ARENA.staticBoxes.forEach((box, index) => {
    const name = `arena:static:${index}`;
    staticNames.push(name);
    createStaticBox(world, name, box.position, box.halfExtents);
  });

  const props = new Map<string, BodyId>();
  for (const prop of WORLD_V0_PROP_LAYOUT) props.set(prop.id, createPropBody(world, prop.id, prop.position));

  const roster = new FoundationRosterMachine({ worldEpoch: WORLD_EPOCH, capacity: CAPACITY });
  for (const [index, actorSessionId] of ["session-self", "session-a", "session-b", "session-c", "session-d", "session-e"].entries()) {
    roster.queue({ kind: "join", mutationId: `join-${index}`, effectiveTick: index + 1, actorSessionId });
  }
  return {
    world,
    roster,
    topology: new FoundationEntityTopology(WORLD_EPOCH, WORLD_V0_PROP_LAYOUT.map((prop) => prop.id)),
    staticNames,
    props,
    actorsById: new Map(),
  };
}

function applyRosterOutcome(runtime: RuntimeState, outcome: FoundationMutationOutcome): void {
  if (outcome.status !== "joined") return;
  const ordinal = actorOrdinal(outcome.actorId);
  const start = ACTOR_STARTS[ordinal];
  assert(start, `missing actor start ${ordinal}`);
  runtime.actorsById.set(outcome.actorId, {
    body: createPlayerBody(runtime.world, outcome.actorId, start),
    actorSessionId: outcome.actorSessionId,
  });
}

function advanceSource(runtime: RuntimeState, targetTick: number): ReturnType<typeof packFoundationStateGuard> {
  const outcomes = runtime.roster.advanceTo(targetTick);
  outcomes.forEach((outcome) => applyRosterOutcome(runtime, outcome));
  const rosterSnapshot = runtime.roster.snapshot();
  const topology = runtime.topology.syncRoster(rosterSnapshot);

  for (const actor of rosterSnapshot.actors) {
    const physical = runtime.actorsById.get(actor.actorId);
    assert(physical, `missing source actor ${actor.actorId}`);
    assert.equal(physical.actorSessionId, actor.actorSessionId);
    const input = intendedInput(actor.actorId, targetTick);
    applyIntent(physical.body, input.x, input.z);
  }
  b3.b3World_Step(runtime.world, DT, WORLD_V0_TIMING.substeps);

  return packFoundationStateGuard(topology, WORLD_V0_STATE_COMPONENTS, (netEntityId) => {
    const actor = runtime.actorsById.get(netEntityId);
    if (actor) return bodyValues(actor.body);
    const prop = runtime.props.get(netEntityId);
    if (prop) return bodyValues(prop);
    return [];
  });
}

const source = createRuntime();
let checkpointTick: number | null = null;
let checkpointGuard: ReturnType<typeof packFoundationStateGuard> | null = null;
let checkpointContacts: ContactEvidence[] = [];
for (let tick = 0; tick <= MAX_CHECKPOINT_SEARCH_TICK; tick += 1) {
  const guard = advanceSource(source, tick);
  if (source.actorsById.size !== CAPACITY) continue;
  const contacts = activeActorPropContacts(source);
  if (contacts.length === 0) continue;
  checkpointTick = tick;
  checkpointGuard = guard;
  checkpointContacts = contacts;
  break;
}
assert(checkpointTick !== null, `fixture failed to produce active actor↔prop contact through tick ${MAX_CHECKPOINT_SEARCH_TICK}`);
assert(checkpointGuard);
assert(checkpointContacts.some((entry) => entry.maxNormalImpulse > 1e-6));
assert.equal(source.actorsById.size, 6);

const topologyAtCheckpoint = source.topology.snapshot();
const rosterAtCheckpoint = source.roster.snapshot();
const maxPropDisplacement = Math.max(...WORLD_V0_PROP_LAYOUT.map((prop) => {
  const body = source.props.get(prop.id);
  assert(body);
  const position = bodyPosition(body);
  return Math.hypot(position[0] - prop.position[0], position[2] - prop.position[2]);
}));

const stateById = new Map<string, number[]>();
for (const netEntityId of topologyAtCheckpoint.entityOrder) {
  const body = source.actorsById.get(netEntityId)?.body ?? source.props.get(netEntityId);
  assert(body, `checkpoint body missing ${netEntityId}`);
  stateById.set(netEntityId, bodyValues(body).map((value) => Math.fround(value)));
}

const bootstrapEnvelope = createFoundationClientBootstrap({
  worldEpoch: WORLD_EPOCH,
  canonicalTick: checkpointTick,
  selfActorSessionId: "session-self",
  executionProfile: PROFILE,
  topology: topologyAtCheckpoint,
  stateComponents: WORLD_V0_STATE_COMPONENTS,
  entityStates: topologyAtCheckpoint.entityOrder.map((netEntityId) => ({ netEntityId, values: stateById.get(netEntityId)! })),
  inputBaselines: rosterAtCheckpoint.actors.map((actor) => ({
    netEntityId: actor.actorId,
    actorSessionId: actor.actorSessionId,
    ...intendedInput(actor.actorId, checkpointTick!),
  })),
});
assert.equal(bootstrapEnvelope.stateGuard.packed, checkpointGuard.packed, "semantic bootstrap must match exact checkpoint guard");

const recording = b3.b3CreateRecording(0);
b3.b3World_StartRecording(source.world, recording);
b3.b3World_StopRecording(source.world);
assert(b3.b3Recording_GetSize(recording) > 0, "seed-only client recording must contain internal Box3D state");

const endTick = checkpointTick + CONTINUATION_TICKS;
const baselineByTick = new Map<number, string>();
for (let tick = checkpointTick + 1; tick <= endTick; tick += 1) {
  baselineByTick.set(tick, advanceSource(source, tick).packed);
}
b3.b3DestroyWorld(source.world);

const hydrated = hydrateFoundationClientBootstrap(bootstrapEnvelope, PROFILE);
const expectedBodyNames = [
  ...source.staticNames,
  ...WORLD_V0_PROP_LAYOUT.map((prop) => prop.id),
  ...topologyAtCheckpoint.entities.filter((entity) => entity.kind === "actor").map((entity) => entity.netEntityId),
];

assert.throws(() => hydrateFoundationBox3DClientRuntime({
  b3,
  hydratedBootstrap: hydrated,
  expectedBodyNames: expectedBodyNames.filter((name) => name !== "actor:5"),
  createReplayPlayer: () => b3.b3RecPlayer_CreateFromRecording(recording, 1),
  readBodyState: bodyValues,
}), /body count mismatch|manifest drift/, "runtime hydration must fail closed on incomplete body manifest");

const client = hydrateFoundationBox3DClientRuntime({
  b3,
  hydratedBootstrap: hydrated,
  expectedBodyNames,
  createReplayPlayer: () => b3.b3RecPlayer_CreateFromRecording(recording, 1),
  readBodyState: bodyValues,
});
assert.equal(client.boundaryTick, checkpointTick);
assert.equal(client.actorBodiesBySession.size, 6);
assert.equal(client.bodiesByNetEntityId.size, topologyAtCheckpoint.entityOrder.length);
assert.equal(captureFoundationBox3DClientGuard(client, bodyValues).packed, checkpointGuard.packed, "hydrated client runtime must be exact at checkpoint boundary");

let firstDifference: { tick: number; expected: string; actual: string } | null = null;
for (let tick = checkpointTick + 1; tick <= endTick; tick += 1) {
  for (const owner of hydrated.inputLedger.activeOwners()) {
    const input = intendedInput(owner.netEntityId, tick);
    const result = hydrated.inputLedger.recordPredicted({
      netEntityId: owner.netEntityId,
      actorSessionId: owner.actorSessionId,
      targetTick: tick,
      ...input,
    }, owner.role === "self" ? "local" : "peer");
    assert.equal(result.status, "accepted", `predicted input rejected for ${owner.actorSessionId} at tick ${tick}`);
  }

  const frame = hydrated.inputLedger.resolveTick(tick);
  const guard = stepFoundationBox3DClientRuntime(client, frame, {
    dt: DT,
    substeps: WORLD_V0_TIMING.substeps,
    applyActorInput(body, input) {
      assert.equal(input.jumpTrigger, false);
      applyIntent(body, input.x, input.z);
    },
    readBodyState: bodyValues,
  });
  const expected = baselineByTick.get(tick);
  assert(expected);
  if (firstDifference === null && guard.packed !== expected) firstDifference = { tick, expected, actual: guard.packed };
}

assert.equal(firstDifference, null, `client Box3D runtime diverged from uninterrupted authority: ${JSON.stringify(firstDifference)}`);
assert.equal(client.boundaryTick, endTick);

destroyFoundationBox3DClientRuntime(client);
b3.b3DestroyRecording(recording);

console.log("MULTIPLAYER_FOUNDATION_CLIENT_BOX3D_RUNTIME_PASS", JSON.stringify({
  worldEpoch: WORLD_EPOCH,
  checkpointTick,
  endTick,
  exactContinuationTicks: CONTINUATION_TICKS,
  activeActors: 6,
  dynamicEntities: topologyAtCheckpoint.entityOrder.length,
  seedBodyCount: expectedBodyNames.length,
  activeActorPropContacts: checkpointContacts.length,
  maxContactImpulse: Number(Math.max(...checkpointContacts.map((entry) => entry.maxNormalImpulse)).toFixed(6)),
  maxPropDisplacementAtCheckpoint: Number(maxPropDisplacement.toFixed(6)),
  topologyRevision: topologyAtCheckpoint.topologyRevision,
  topologyDigest: topologyAtCheckpoint.topologyDigest,
}));
