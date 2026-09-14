import assert from "node:assert/strict";
// @ts-ignore generated pinned Emscripten module has no TypeScript declaration
import Box3D from "../public/world-v0/box3d-i4/box3d.inline.mjs";
import {
  createFoundationClientBootstrap,
  type FoundationClientExecutionProfile,
} from "../src/multiplayer-foundation/client-bootstrap.ts";
import {
  destroyFoundationBox3DClientRuntime,
  hydrateFoundationBox3DClientRuntimeFromSeedBytes,
  stepFoundationBox3DClientRuntime,
  type FoundationBox3DClientRuntime,
} from "../src/multiplayer-foundation/client-box3d-runtime.ts";
import {
  FOUNDATION_BOX3D_RECORDING_SEED_FORMAT,
  createFoundationClientRuntimeBootstrap,
  hydrateFoundationClientRuntimeBootstrap,
  type FoundationHydratedClientRuntimeBootstrap,
} from "../src/multiplayer-foundation/client-runtime-bootstrap.ts";
import { FoundationEntityTopology } from "../src/multiplayer-foundation/entity-topology.ts";
import { FoundationRosterMachine, type FoundationMutationOutcome } from "../src/multiplayer-foundation/roster-machine.ts";
import { packFoundationStateGuard, type FoundationStateGuard } from "../src/multiplayer-foundation/state-guard.ts";
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
const WORLD_EPOCH = "client-topology-rebootstrap-smoke-epoch-1";
const CAPACITY = 6;
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
  [-2.25, 0.82, 0],
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
type ContactEvidence = { actorId: string; propId: string; maxNormalImpulse: number };
type ClientState = {
  runtime: FoundationBox3DClientRuntime;
  hydrated: FoundationHydratedClientRuntimeBootstrap;
};
type BootstrapEvidence = {
  tick: number;
  activeActors: number;
  remoteActors: number;
  topologyRevision: number;
  topologyDigest: string;
  projectionDigest: string;
  seedBytes: number;
  seedFnv1a32: string;
  runtimeDigest: string;
  contacts: number;
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
  return a.index1 === candidate.index1 && a.world0 === candidate.world0 && a.generation === candidate.generation;
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
      if (maxNormalImpulse > 1e-6) evidence.push({ actorId, propId: otherName, maxNormalImpulse });
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
  assert(Number.isSafeInteger(ordinal) && ordinal >= 0);
  return ordinal;
}

function intendedInput(actorId: string, targetTick: number): { x: number; z: number; jump: false } {
  const ordinal = actorOrdinal(actorId);
  const start = ACTOR_STARTS[ordinal];
  assert(start, `missing actor start ${ordinal}`);
  if (targetTick < 12) return { x: 0, z: 0, jump: false };
  const length = Math.hypot(start[0], start[2]);
  if (targetTick < 80) return { x: -start[0] / length, z: -start[2] / length, jump: false };
  const angle = ordinal * 1.0471975512 + (targetTick - 80) * 0.035;
  return { x: Math.cos(angle), z: Math.sin(angle), jump: false };
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function u32Hex(value: number): string {
  return (value >>> 0).toString(16).padStart(8, "0");
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
  return {
    world,
    roster: new FoundationRosterMachine({ worldEpoch: WORLD_EPOCH, capacity: CAPACITY }),
    topology: new FoundationEntityTopology(WORLD_EPOCH, WORLD_V0_PROP_LAYOUT.map((prop) => prop.id)),
    staticNames,
    props,
    actorsById: new Map(),
  };
}

function applyRosterOutcome(runtime: RuntimeState, outcome: FoundationMutationOutcome): void {
  if (outcome.status === "joined") {
    const ordinal = actorOrdinal(outcome.actorId);
    const start = ACTOR_STARTS[ordinal];
    assert(start, `missing actor start ${ordinal}`);
    runtime.actorsById.set(outcome.actorId, {
      body: createPlayerBody(runtime.world, outcome.actorId, start),
      actorSessionId: outcome.actorSessionId,
    });
    return;
  }
  if (outcome.status === "retired") {
    const physical = runtime.actorsById.get(outcome.actorId);
    assert(physical, `retired physical actor missing ${outcome.actorId}`);
    assert.equal(physical.actorSessionId, outcome.actorSessionId);
    b3.b3DestroyBody(physical.body);
    runtime.actorsById.delete(outcome.actorId);
  }
}

function advanceSource(runtime: RuntimeState, targetTick: number): FoundationStateGuard {
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

function captureSourceGuard(runtime: RuntimeState): FoundationStateGuard {
  const topology = runtime.topology.snapshot();
  return packFoundationStateGuard(topology, WORLD_V0_STATE_COMPONENTS, (netEntityId) => {
    const actor = runtime.actorsById.get(netEntityId);
    if (actor) return bodyValues(actor.body);
    const prop = runtime.props.get(netEntityId);
    if (prop) return bodyValues(prop);
    return [];
  });
}

function buildClientState(runtime: RuntimeState, canonicalTick: number, expectedGuard: FoundationStateGuard): { client: ClientState; evidence: BootstrapEvidence } {
  const topology = runtime.topology.snapshot();
  const roster = runtime.roster.snapshot();
  const stateById = new Map<string, number[]>();
  for (const netEntityId of topology.entityOrder) {
    const body = runtime.actorsById.get(netEntityId)?.body ?? runtime.props.get(netEntityId);
    assert(body, `bootstrap body missing ${netEntityId}`);
    stateById.set(netEntityId, bodyValues(body).map((value) => Math.fround(value)));
  }
  const bootstrap = createFoundationClientBootstrap({
    worldEpoch: WORLD_EPOCH,
    canonicalTick,
    selfActorSessionId: "session-self",
    executionProfile: PROFILE,
    topology,
    stateComponents: WORLD_V0_STATE_COMPONENTS,
    entityStates: topology.entityOrder.map((netEntityId) => ({ netEntityId, values: stateById.get(netEntityId)! })),
    inputBaselines: roster.actors.map((actor) => ({
      netEntityId: actor.actorId,
      actorSessionId: actor.actorSessionId,
      ...intendedInput(actor.actorId, canonicalTick),
    })),
  });
  assert.equal(bootstrap.stateGuard.packed, expectedGuard.packed, `semantic guard mismatch at B(${canonicalTick})`);

  const bodyNames = [
    ...runtime.staticNames,
    ...WORLD_V0_PROP_LAYOUT.map((prop) => prop.id),
    ...topology.entities.filter((entity) => entity.kind === "actor").map((entity) => entity.netEntityId),
  ];
  const recording = b3.b3CreateRecording(0);
  b3.b3World_StartRecording(runtime.world, recording);
  b3.b3World_StopRecording(runtime.world);
  const byteLength = b3.b3Recording_GetSize(recording);
  assert(Number.isSafeInteger(byteLength) && byteLength > 0);
  const bytes = b3.b3Recording_CopyData(recording);
  assert(bytes instanceof Uint8Array);
  assert.equal(bytes.byteLength, byteLength);
  const checksum = u32Hex(b3.b3Bytes_Fnv1a32(bytes));
  const runtimeEnvelope = createFoundationClientRuntimeBootstrap({
    bootstrap,
    executionSeed: {
      formatId: FOUNDATION_BOX3D_RECORDING_SEED_FORMAT,
      worldEpoch: WORLD_EPOCH,
      canonicalTick,
      topologyRevision: topology.topologyRevision,
      topologyDigest: topology.topologyDigest,
      bodyNames,
      byteLength,
      fnv1a32: checksum,
      bytesBase64: encodeBase64(bytes),
    },
  });
  b3.b3DestroyRecording(recording);

  const transported = JSON.parse(JSON.stringify(runtimeEnvelope));
  const hydrated = hydrateFoundationClientRuntimeBootstrap(
    transported,
    PROFILE,
    FOUNDATION_BOX3D_RECORDING_SEED_FORMAT,
  );
  const clientRuntime = hydrateFoundationBox3DClientRuntimeFromSeedBytes(b3, hydrated, bodyValues);
  assert.equal(clientRuntime.boundaryTick, canonicalTick);
  assert.equal(clientRuntime.actorBodiesBySession.size, roster.actors.length);
  assert.equal(hydrated.projection.remotes.length, roster.actors.length - 1);
  assert.equal(captureSourceGuard(runtime).packed, expectedGuard.packed);

  return {
    client: { runtime: clientRuntime, hydrated },
    evidence: {
      tick: canonicalTick,
      activeActors: roster.actors.length,
      remoteActors: hydrated.projection.remotes.length,
      topologyRevision: topology.topologyRevision,
      topologyDigest: topology.topologyDigest,
      projectionDigest: hydrated.projection.projectionDigest,
      seedBytes: byteLength,
      seedFnv1a32: checksum,
      runtimeDigest: runtimeEnvelope.envelopeDigest,
      contacts: activeActorPropContacts(runtime).length,
    },
  };
}

function advanceClient(client: ClientState, targetTick: number): FoundationStateGuard {
  for (const owner of client.hydrated.inputLedger.activeOwners()) {
    const input = intendedInput(owner.netEntityId, targetTick);
    const result = client.hydrated.inputLedger.recordPredicted({
      netEntityId: owner.netEntityId,
      actorSessionId: owner.actorSessionId,
      targetTick,
      ...input,
    }, owner.role === "self" ? "local" : "peer");
    assert.equal(result.status, "accepted", `client predicted input rejected ${owner.actorSessionId} @ ${targetTick}`);
  }
  const frame = client.hydrated.inputLedger.resolveTick(targetTick);
  return stepFoundationBox3DClientRuntime(client.runtime, frame, {
    dt: DT,
    substeps: WORLD_V0_TIMING.substeps,
    applyActorInput(body, input) {
      assert.equal(input.jumpTrigger, false);
      applyIntent(body, input.x, input.z);
    },
    readBodyState: bodyValues,
  });
}

function assertExactSegment(runtime: RuntimeState, client: ClientState, startTick: number, endTick: number): void {
  for (let tick = startTick; tick <= endTick; tick += 1) {
    const sourceGuard = advanceSource(runtime, tick);
    const clientGuard = advanceClient(client, tick);
    assert.equal(clientGuard.packed, sourceGuard.packed, `client/source divergence at B(${tick})`);
  }
}

const source = createRuntime();
source.roster.queue({ kind: "join", mutationId: "join-self", effectiveTick: 1, actorSessionId: "session-self" });
source.roster.queue({ kind: "join", mutationId: "join-peer-a", effectiveTick: 2, actorSessionId: "session-peer-a" });

let initialTick: number | null = null;
let initialGuard: FoundationStateGuard | null = null;
for (let tick = 0; tick <= 60; tick += 1) {
  const guard = advanceSource(source, tick);
  if (source.actorsById.size !== 2) continue;
  if (activeActorPropContacts(source).length === 0) continue;
  initialTick = tick;
  initialGuard = guard;
  break;
}
assert(initialTick !== null && initialGuard, "initial 2-actor fixture failed to reach contact-rich boundary");
const initial = buildClientState(source, initialTick, initialGuard);
assert.equal(initial.evidence.activeActors, 2);
assert.equal(initial.evidence.remoteActors, 1);

const preJoinEnd = initialTick + 8;
assertExactSegment(source, initial.client, initialTick + 1, preJoinEnd);

const joinTick = preJoinEnd + 1;
for (const [index, sessionId] of ["session-peer-b", "session-peer-c", "session-peer-d", "session-peer-e"].entries()) {
  source.roster.queue({ kind: "join", mutationId: `late-join-${index}`, effectiveTick: joinTick, actorSessionId: sessionId });
}
const joinGuard = advanceSource(source, joinTick);
assert.equal(source.roster.snapshot().actors.length, 6);
assert.equal(source.topology.snapshot().topologyRevision, 6);
destroyFoundationBox3DClientRuntime(initial.client.runtime);
const joined = buildClientState(source, joinTick, joinGuard);
assert.equal(joined.evidence.activeActors, 6);
assert.equal(joined.evidence.remoteActors, 5);
assert.notEqual(joined.evidence.projectionDigest, initial.evidence.projectionDigest);

const preChurnEnd = joinTick + 12;
assertExactSegment(source, joined.client, joinTick + 1, preChurnEnd);

const churnTick = preChurnEnd + 1;
source.roster.queue({ kind: "retire", mutationId: "a-retire-actor-2", effectiveTick: churnTick, actorId: "actor:2" });
source.roster.queue({ kind: "join", mutationId: "b-join-replacement", effectiveTick: churnTick, actorSessionId: "session-replacement" });
const churnGuard = advanceSource(source, churnTick);
assert.equal(source.roster.snapshot().actors.length, 6);
assert.equal(source.topology.snapshot().topologyRevision, 8);
assert(!source.actorsById.has("actor:2"));
assert(source.actorsById.has("actor:6"));
destroyFoundationBox3DClientRuntime(joined.client.runtime);
const churned = buildClientState(source, churnTick, churnGuard);
assert.equal(churned.evidence.activeActors, 6);
assert.equal(churned.evidence.remoteActors, 5);
assert(churned.hydrated.projection.remotes.some((actor) => actor.netEntityId === "actor:6"));
assert(!churned.hydrated.projection.remotes.some((actor) => actor.netEntityId === "actor:2"));
assert.notEqual(churned.evidence.projectionDigest, joined.evidence.projectionDigest);

const finalTick = churnTick + 30;
assertExactSegment(source, churned.client, churnTick + 1, finalTick);
assert.equal(churned.client.runtime.boundaryTick, finalTick);

destroyFoundationBox3DClientRuntime(churned.client.runtime);
b3.b3DestroyWorld(source.world);

console.log("MULTIPLAYER_FOUNDATION_CLIENT_TOPOLOGY_REBOOTSTRAP_PASS", JSON.stringify({
  worldEpoch: WORLD_EPOCH,
  initial: initial.evidence,
  lateJoin: joined.evidence,
  churn: churned.evidence,
  lateJoinAddedActors: ["actor:2", "actor:3", "actor:4", "actor:5"],
  churnRemovedActor: "actor:2",
  churnReplacementActor: "actor:6",
  exactPreJoinTicks: preJoinEnd - initialTick,
  exactPostJoinTicks: preChurnEnd - joinTick,
  exactPostChurnTicks: finalTick - churnTick,
  finalTick,
}));
