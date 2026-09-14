import Box3D from "/box3d/box3d.inline.mjs";
import { createFoundationClientBootstrap } from "/runtime/multiplayer-foundation/client-bootstrap.js";
import {
  destroyFoundationBox3DClientRuntime,
  hydrateFoundationBox3DClientRuntimeFromSeedBytes,
  stepFoundationBox3DClientRuntime,
} from "/runtime/multiplayer-foundation/client-box3d-runtime.js";
import {
  FOUNDATION_BOX3D_RECORDING_SEED_FORMAT,
  createFoundationClientRuntimeBootstrap,
  hydrateFoundationClientRuntimeBootstrap,
} from "/runtime/multiplayer-foundation/client-runtime-bootstrap.js";
import { FoundationEntityTopology } from "/runtime/multiplayer-foundation/entity-topology.js";
import { FoundationRosterMachine } from "/runtime/multiplayer-foundation/roster-machine.js";
import { packFoundationStateGuard } from "/runtime/multiplayer-foundation/state-guard.js";
import {
  WORLD_V0_ARENA,
  WORLD_V0_MOVEMENT,
  WORLD_V0_PLAYER_PHYSICS,
  WORLD_V0_PROP_LAYOUT,
  WORLD_V0_PROP_PHYSICS,
  WORLD_V0_SIM_BUILD_ID,
  WORLD_V0_STATE_COMPONENTS,
  WORLD_V0_TIMING,
} from "/runtime/world-v0-contract.js";

const WORLD_EPOCH = "browser-late-join-perspective-smoke-epoch-1";
const CAPACITY = 6;
const MAX_CHECKPOINT_SEARCH_TICK = 240;
const CONTINUATION_TICKS = 30;
const PRIMARY_SESSION = "session-self";
const LATE_SESSION = "session-d";
const DT = 1 / WORLD_V0_TIMING.simulationHz;
const PROFILE = {
  profileId: "shared-yard-foundation-client-v1",
  buildId: WORLD_V0_SIM_BUILD_ID,
  stateSchemaId: "shared-yard-rigidbody-f32-13-v1",
};
const ACTOR_STARTS = [
  [-1.80, 0.82, -0.48],
  [1.80, 0.82, -0.48],
  [-1.80, 0.82, 0.48],
  [1.80, 0.82, 0.48],
  [0, 0.82, -1.32],
  [0, 0.82, 1.32],
];

function assert(condition, message) {
  if (!condition) throw new Error(message || "assertion failed");
}
function equal(actual, expected, message) {
  if (!Object.is(actual, expected)) {
    throw new Error(`${message || "values differ"}: ${String(actual)} != ${String(expected)}`);
  }
}
function encodeBase64(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
function u32Hex(value) {
  return (Number(value) >>> 0).toString(16).padStart(8, "0");
}
function actorOrdinal(actorId) {
  const ordinal = Number(actorId.slice("actor:".length));
  assert(Number.isSafeInteger(ordinal) && ordinal >= 0, `invalid actor id ${actorId}`);
  return ordinal;
}
function moveToward2(cx, cz, tx, tz, maxDelta) {
  const dx = tx - cx;
  const dz = tz - cz;
  const distance = Math.hypot(dx, dz);
  if (distance <= maxDelta || distance < 1e-9) return [tx, tz];
  const scale = maxDelta / distance;
  return [cx + dx * scale, cz + dz * scale];
}
function intendedInput(actorId, targetTick) {
  const ordinal = actorOrdinal(actorId);
  const start = ACTOR_STARTS[ordinal];
  assert(start, `missing actor start ${ordinal}`);
  if (targetTick < 12) return { x: 0, z: 0, jump: false };
  const length = Math.hypot(start[0], start[2]);
  if (targetTick <= MAX_CHECKPOINT_SEARCH_TICK) {
    return { x: -start[0] / length, z: -start[2] / length, jump: false };
  }
  const angle = ordinal * 1.0471975512 + (targetTick - MAX_CHECKPOINT_SEARCH_TICK) * 0.035;
  return { x: Math.cos(angle), z: Math.sin(angle), jump: false };
}

async function run() {
  const b3 = await Box3D();
  const contactsBuffer = b3.createContactsBuffer();
  const contact = b3.createContact();
  const manifold = b3.createManifold();

  function createStaticBox(world, name, position, halfExtents) {
    const def = b3.b3DefaultBodyDef();
    def.position = [...position];
    const body = b3.b3CreateBody(world, def);
    b3.b3Body_SetName(body, name);
    b3.b3CreateBoxShape(body, b3.b3DefaultShapeDef(), halfExtents[0], halfExtents[1], halfExtents[2]);
    return body;
  }
  function createPlayerBody(world, name, position) {
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
  function createPropBody(world, name, position) {
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
  function bodyValues(body) {
    const position = [0, 0, 0];
    const rotation = [0, 0, 0, 1];
    const linearVelocity = [0, 0, 0];
    const angularVelocity = [0, 0, 0];
    b3.b3Body_GetPosition(position, body);
    b3.b3Body_GetRotation(rotation, body);
    b3.b3Body_GetLinearVelocity(linearVelocity, body);
    b3.b3Body_GetAngularVelocity(angularVelocity, body);
    return [...position, ...rotation, ...linearVelocity, ...angularVelocity];
  }
  function sameBodyId(a, candidate) {
    return a.index1 === candidate.index1 && a.world0 === candidate.world0 && a.generation === candidate.generation;
  }
  function activeActorPropContacts(runtime) {
    const evidence = [];
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
  function applyIntent(body, x, z) {
    const velocity = [0, 0, 0];
    b3.b3Body_GetLinearVelocity(velocity, body);
    const hasInput = Math.hypot(x, z) > 0.01;
    const targetX = x * WORLD_V0_MOVEMENT.playerSpeed;
    const targetZ = z * WORLD_V0_MOVEMENT.playerSpeed;
    const acceleration = hasInput ? WORLD_V0_MOVEMENT.playerAcceleration : WORLD_V0_MOVEMENT.playerDeceleration;
    const [nextX, nextZ] = moveToward2(velocity[0], velocity[2], targetX, targetZ, acceleration * DT);
    b3.b3Body_SetLinearVelocity(body, [nextX, velocity[1], nextZ]);
  }
  function createRuntime() {
    const worldDef = b3.b3DefaultWorldDef();
    worldDef.gravity = [...WORLD_V0_ARENA.gravity];
    const world = b3.b3CreateWorld(worldDef);
    const staticNames = [];
    WORLD_V0_ARENA.staticBoxes.forEach((box, index) => {
      const name = `arena:static:${index}`;
      staticNames.push(name);
      createStaticBox(world, name, box.position, box.halfExtents);
    });
    const props = new Map();
    for (const prop of WORLD_V0_PROP_LAYOUT) props.set(prop.id, createPropBody(world, prop.id, prop.position));
    const roster = new FoundationRosterMachine({ worldEpoch: WORLD_EPOCH, capacity: CAPACITY });
    for (const [index, actorSessionId] of [PRIMARY_SESSION, "session-a", "session-b", "session-c", LATE_SESSION, "session-e"].entries()) {
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
  function applyRosterOutcome(runtime, outcome) {
    if (outcome.status !== "joined") return;
    const ordinal = actorOrdinal(outcome.actorId);
    runtime.actorsById.set(outcome.actorId, {
      body: createPlayerBody(runtime.world, outcome.actorId, ACTOR_STARTS[ordinal]),
      actorSessionId: outcome.actorSessionId,
    });
  }
  function advanceSource(runtime, targetTick) {
    const outcomes = runtime.roster.advanceTo(targetTick);
    outcomes.forEach((outcome) => applyRosterOutcome(runtime, outcome));
    const rosterSnapshot = runtime.roster.snapshot();
    const topology = runtime.topology.syncRoster(rosterSnapshot);
    for (const actor of rosterSnapshot.actors) {
      const physical = runtime.actorsById.get(actor.actorId);
      assert(physical, `missing source actor ${actor.actorId}`);
      equal(physical.actorSessionId, actor.actorSessionId, `source ActorSession ${actor.actorId}`);
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
  function buildSemanticBootstrap(runtime, canonicalTick, expectedGuard, selfActorSessionId) {
    const topology = runtime.topology.snapshot();
    const roster = runtime.roster.snapshot();
    const stateById = new Map();
    for (const netEntityId of topology.entityOrder) {
      const body = runtime.actorsById.get(netEntityId)?.body ?? runtime.props.get(netEntityId);
      assert(body, `bootstrap body missing ${netEntityId}`);
      stateById.set(netEntityId, bodyValues(body).map((value) => Math.fround(value)));
    }
    const bootstrap = createFoundationClientBootstrap({
      worldEpoch: WORLD_EPOCH,
      canonicalTick,
      selfActorSessionId,
      executionProfile: PROFILE,
      topology,
      stateComponents: WORLD_V0_STATE_COMPONENTS,
      entityStates: topology.entityOrder.map((netEntityId) => ({ netEntityId, values: stateById.get(netEntityId) })),
      inputBaselines: roster.actors.map((actor) => ({
        netEntityId: actor.actorId,
        actorSessionId: actor.actorSessionId,
        ...intendedInput(actor.actorId, canonicalTick),
      })),
    });
    equal(bootstrap.stateGuard.packed, expectedGuard.packed, `semantic guard ${selfActorSessionId}`);
    return bootstrap;
  }
  function hydratePerspective(bootstrap, executionSeed, selfActorSessionId) {
    const runtimeEnvelope = createFoundationClientRuntimeBootstrap({ bootstrap, executionSeed });
    const transported = JSON.parse(JSON.stringify(runtimeEnvelope));
    const hydrated = hydrateFoundationClientRuntimeBootstrap(transported, PROFILE, FOUNDATION_BOX3D_RECORDING_SEED_FORMAT);
    const runtime = hydrateFoundationBox3DClientRuntimeFromSeedBytes(b3, hydrated, bodyValues);
    equal(hydrated.projection.self.actorSessionId, selfActorSessionId, `self session ${selfActorSessionId}`);
    return { hydrated, runtime, runtimeDigest: runtimeEnvelope.envelopeDigest };
  }
  function advanceClient(client, targetTick) {
    for (const owner of client.hydrated.inputLedger.activeOwners()) {
      const input = intendedInput(owner.netEntityId, targetTick);
      const result = client.hydrated.inputLedger.recordPredicted({
        netEntityId: owner.netEntityId,
        actorSessionId: owner.actorSessionId,
        targetTick,
        ...input,
      }, owner.role === "self" ? "local" : "peer");
      equal(result.status, "accepted", `predicted input ${owner.actorSessionId} @ ${targetTick}`);
    }
    const frame = client.hydrated.inputLedger.resolveTick(targetTick);
    return stepFoundationBox3DClientRuntime(client.runtime, frame, {
      dt: DT,
      substeps: WORLD_V0_TIMING.substeps,
      applyActorInput(body, input) {
        equal(input.jumpTrigger, false, `unexpected jump ${input.actorSessionId}`);
        applyIntent(body, input.x, input.z);
      },
      readBodyState: bodyValues,
    });
  }

  const source = createRuntime();
  let checkpointTick = null;
  let checkpointGuard = null;
  let checkpointContacts = [];
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
  assert(checkpointTick !== null && checkpointGuard, "late-join fixture failed to reach contact-rich 6-actor boundary");

  const topology = source.topology.snapshot();
  const bodyNames = [
    ...source.staticNames,
    ...WORLD_V0_PROP_LAYOUT.map((prop) => prop.id),
    ...topology.entities.filter((entity) => entity.kind === "actor").map((entity) => entity.netEntityId),
  ];
  const recording = b3.b3CreateRecording(0);
  b3.b3World_StartRecording(source.world, recording);
  b3.b3World_StopRecording(source.world);
  const byteLength = b3.b3Recording_GetSize(recording);
  const seedBytes = b3.b3Recording_CopyData(recording);
  assert(seedBytes instanceof Uint8Array && seedBytes.byteLength === byteLength && byteLength > 0, "shared seed bytes invalid");
  const seedFnv1a32 = u32Hex(b3.b3Bytes_Fnv1a32(seedBytes));
  const executionSeed = {
    formatId: FOUNDATION_BOX3D_RECORDING_SEED_FORMAT,
    worldEpoch: WORLD_EPOCH,
    canonicalTick: checkpointTick,
    topologyRevision: topology.topologyRevision,
    topologyDigest: topology.topologyDigest,
    bodyNames,
    byteLength,
    fnv1a32: seedFnv1a32,
    bytesBase64: encodeBase64(seedBytes),
  };

  const primaryBootstrap = buildSemanticBootstrap(source, checkpointTick, checkpointGuard, PRIMARY_SESSION);
  const lateBootstrap = buildSemanticBootstrap(source, checkpointTick, checkpointGuard, LATE_SESSION);
  const primary = hydratePerspective(primaryBootstrap, executionSeed, PRIMARY_SESSION);
  const lateJoin = hydratePerspective(lateBootstrap, executionSeed, LATE_SESSION);

  equal(primary.hydrated.projection.self.netEntityId, "actor:0", "primary self actor");
  equal(lateJoin.hydrated.projection.self.netEntityId, "actor:4", "late self actor");
  equal(primary.hydrated.projection.remotes.length, 5, "primary remote count");
  equal(lateJoin.hydrated.projection.remotes.length, 5, "late remote count");
  equal(primary.runtime.actorBodiesBySession.size, 6, "primary actor body count");
  equal(lateJoin.runtime.actorBodiesBySession.size, 6, "late actor body count");
  assert(lateJoin.hydrated.projection.remotes.some((actor) => actor.netEntityId === "actor:0"), "late perspective must see actor:0 as remote");
  assert(!lateJoin.hydrated.projection.remotes.some((actor) => actor.netEntityId === "actor:4"), "late perspective must not see self as remote");
  assert(primary.hydrated.projection.projectionDigest !== lateJoin.hydrated.projection.projectionDigest, "projection digests must differ by self perspective");
  assert(primary.runtimeDigest !== lateJoin.runtimeDigest, "runtime envelope digests must differ by semantic self perspective");

  const endTick = checkpointTick + CONTINUATION_TICKS;
  for (let tick = checkpointTick + 1; tick <= endTick; tick += 1) {
    const sourceGuard = advanceSource(source, tick);
    const primaryGuard = advanceClient(primary, tick);
    const lateGuard = advanceClient(lateJoin, tick);
    equal(primaryGuard.packed, sourceGuard.packed, `primary exact guard B(${tick})`);
    equal(lateGuard.packed, sourceGuard.packed, `late exact guard B(${tick})`);
    equal(primaryGuard.packed, lateGuard.packed, `perspective physical equivalence B(${tick})`);
  }

  destroyFoundationBox3DClientRuntime(primary.runtime);
  destroyFoundationBox3DClientRuntime(lateJoin.runtime);
  b3.b3DestroyWorld(source.world);
  b3.b3DestroyRecording(recording);

  return {
    status: "MULTIPLAYER_FOUNDATION_BROWSER_LATE_JOIN_PERSPECTIVE_PASS",
    environment: "chromium",
    userAgent: navigator.userAgent,
    build: "i4-raw-seed-bindings-box3djs-5d5a3af-emsdk-6.0.2",
    worldEpoch: WORLD_EPOCH,
    checkpointTick,
    endTick,
    exactSharedTicks: CONTINUATION_TICKS,
    activeActors: 6,
    contacts: checkpointContacts.length,
    topologyRevision: topology.topologyRevision,
    topologyDigest: topology.topologyDigest,
    seedBytes: byteLength,
    seedFnv1a32,
    primary: {
      selfSessionId: PRIMARY_SESSION,
      selfActorId: primary.hydrated.projection.self.netEntityId,
      remoteActors: primary.hydrated.projection.remotes.length,
      projectionDigest: primary.hydrated.projection.projectionDigest,
      runtimeDigest: primary.runtimeDigest,
    },
    lateJoin: {
      selfSessionId: LATE_SESSION,
      selfActorId: lateJoin.hydrated.projection.self.netEntityId,
      remoteActors: lateJoin.hydrated.projection.remotes.length,
      projectionDigest: lateJoin.hydrated.projection.projectionDigest,
      runtimeDigest: lateJoin.runtimeDigest,
    },
  };
}

window.__multiplayerFoundationLateJoinPerspectiveEvidence = { status: "RUNNING" };
try {
  window.__multiplayerFoundationLateJoinPerspectiveEvidence = await run();
  console.log(
    "MULTIPLAYER_FOUNDATION_BROWSER_LATE_JOIN_PERSPECTIVE_PASS",
    JSON.stringify(window.__multiplayerFoundationLateJoinPerspectiveEvidence),
  );
} catch (error) {
  window.__multiplayerFoundationLateJoinPerspectiveEvidence = {
    status: "MULTIPLAYER_FOUNDATION_BROWSER_LATE_JOIN_PERSPECTIVE_FAIL",
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : null,
  };
  console.error(
    "MULTIPLAYER_FOUNDATION_BROWSER_LATE_JOIN_PERSPECTIVE_FAIL",
    window.__multiplayerFoundationLateJoinPerspectiveEvidence,
  );
}
