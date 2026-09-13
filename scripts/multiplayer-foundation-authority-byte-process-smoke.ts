import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
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
const byteB3 = b3 as typeof b3 & {
  b3Recording_CopyBytes(recording: unknown): Uint8Array;
  b3RecPlayer_CreateFromBytes(bytes: Uint8Array, workerCount: number): unknown;
};

const ENVELOPE_REVISION = "multiplayer-foundation-authority-byte-envelope-probe-v1";
const ENGINE_FINGERPRINT = {
  adapterRevision: "box3d-js-recording-byte-bridge-probe-v1",
  box3dJsCommit: "5d5a3af049cccd9948b2b55bac4342414af0ef64",
  box3dCommit: "8441b4a06d6d09dcfb0b0f704df4d847d1437b92",
  emscriptenVersion: "6.0.2",
} as const;
const WORLD_EPOCH = "authority-byte-process-epoch";
const CAPACITY = 6;
const CHECKPOINT_TICK = 260;
const END_TICK = 330;
const PRE_CHECKPOINT_CHURN_TICK = 240;
const POST_CHECKPOINT_CHURN_TICK = 300;
const MOVE_START_TICK = 70;
const SPAWN_CLEARANCE = 1.5;
const DT = 1 / WORLD_V0_TIMING.simulationHz;

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
type AuthorityRuntime = {
  world: WorldId;
  roster: FoundationRosterMachine;
  topology: FoundationEntityTopology;
  inputs: FoundationActorInputRegistry;
  props: Map<string, DynamicRecord>;
  actors: Map<string, ActorRecord>;
};
type FrameEvidence = {
  tick: number;
  outcomes: FoundationMutationOutcome[];
  rosterJson: string;
  topologyRevision: number;
  topologyDigest: string;
  guardPacked: string;
  rosterCheckpointDigest: string;
  inputCheckpointDigest: string;
};
type AuthorityEnvelope = {
  revision: typeof ENVELOPE_REVISION;
  engine: typeof ENGINE_FINGERPRINT;
  worldEpoch: string;
  canonicalTick: number;
  topologyRevision: number;
  topologyDigest: string;
  semanticBodyNames: string[];
  rosterCheckpoint: FoundationRosterCheckpoint;
  inputCheckpoint: FoundationActorInputCheckpoint;
  physics: {
    encoding: "base64";
    byteLength: number;
    sha256: string;
    bytes: string;
  };
  expectedFrames: FrameEvidence[];
};

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function jsonRoundTrip<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function createWorld(): WorldId {
  const def = b3.b3DefaultWorldDef();
  def.gravity = [...WORLD_V0_ARENA.gravity];
  return b3.b3CreateWorld(def);
}

function createStaticBox(world: WorldId, name: string, position: readonly number[], halfExtents: readonly number[]): BodyId {
  const def = b3.b3DefaultBodyDef();
  def.position = [...position];
  const body = b3.b3CreateBody(world, def);
  b3.b3Body_SetName(body, name);
  b3.b3CreateBoxShape(body, b3.b3DefaultShapeDef(), halfExtents[0], halfExtents[1], halfExtents[2]);
  return body;
}

function createPlayerBody(world: WorldId, semanticId: string, position: Vec3): BodyId {
  const def = b3.b3DefaultBodyDef();
  def.type = b3.b3BodyType.b3_dynamicBody;
  def.position = [...position];
  def.linearDamping = WORLD_V0_PLAYER_PHYSICS.linearDamping;
  def.angularDamping = WORLD_V0_PLAYER_PHYSICS.angularDamping;
  const body = b3.b3CreateBody(world, def);
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
  const def = b3.b3DefaultBodyDef();
  def.type = b3.b3BodyType.b3_dynamicBody;
  def.position = [...position];
  def.linearDamping = WORLD_V0_PROP_PHYSICS.linearDamping;
  def.angularDamping = WORLD_V0_PROP_PHYSICS.angularDamping;
  const body = b3.b3CreateBody(world, def);
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
  const value: Vec3 = [0, 0, 0];
  b3.b3Body_GetPosition(value, body);
  return [...value];
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
  assert(values.every(Number.isFinite));
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
  const [nextX, nextZ] = moveToward2(
    velocity[0],
    velocity[2],
    x * WORLD_V0_MOVEMENT.playerSpeed,
    z * WORLD_V0_MOVEMENT.playerSpeed,
    (hasInput ? WORLD_V0_MOVEMENT.playerAcceleration : WORLD_V0_MOVEMENT.playerDeceleration) * DT,
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

function makeSource(): { runtime: AuthorityRuntime; staticNames: string[] } {
  const world = createWorld();
  const staticNames: string[] = [];
  WORLD_V0_ARENA.staticBoxes.forEach((box, index) => {
    const name = `arena:static:${index}`;
    staticNames.push(name);
    createStaticBox(world, name, box.position, box.halfExtents);
  });
  const props = new Map<string, DynamicRecord>();
  for (const authored of WORLD_V0_PROP_LAYOUT) {
    props.set(authored.id, { body: createPropBody(world, authored.id, [...authored.position]) });
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
  roster.queue({ kind: "retire", mutationId: "post-retire-e", effectiveTick: POST_CHECKPOINT_CHURN_TICK, actorId: "actor:4" });
  roster.queue({ kind: "join", mutationId: "post-join-h", effectiveTick: POST_CHECKPOINT_CHURN_TICK, actorSessionId: "session-h" });
  return { runtime: { world, roster, topology, inputs, props, actors }, staticNames };
}

function applyRosterOutcome(runtime: AuthorityRuntime, outcome: FoundationMutationOutcome): void {
  if (outcome.status === "retired") {
    const actor = runtime.actors.get(outcome.actorId);
    assert(actor);
    b3.b3DestroyBody(actor.body);
    runtime.actors.delete(outcome.actorId);
    return;
  }
  if (outcome.status !== "joined") return;
  const blockers = [
    ...[...runtime.props.entries()].map(([entityId, value]) => ({ entityId, position: bodyPosition(value.body) })),
    ...[...runtime.actors.entries()].map(([entityId, value]) => ({ entityId, position: bodyPosition(value.body) })),
  ];
  const spawn = chooseFoundationSpawn(SPAWN_CANDIDATES, blockers, SPAWN_CLEARANCE);
  assert(spawn);
  runtime.actors.set(outcome.actorId, {
    body: createPlayerBody(runtime.world, outcome.actorId, [...spawn.position]),
    actorSessionId: outcome.actorSessionId,
  });
}

function tick(runtime: AuthorityRuntime, canonicalTick: number): FrameEvidence {
  const outcomes = runtime.roster.advanceTo(canonicalTick);
  outcomes.forEach((outcome) => applyRosterOutcome(runtime, outcome));
  if (canonicalTick === 220) assert.equal(runtime.roster.setTransportConnected("session-e", false), true);
  if (canonicalTick === 285) assert.equal(runtime.roster.setTransportConnected("session-e", true), true);

  const roster = runtime.roster.snapshot();
  const topology = runtime.topology.syncRoster(roster);
  runtime.inputs.syncRoster(roster);
  assert.deepEqual(runtime.topology.validateEntityCoverage([...runtime.actors.keys(), ...runtime.props.keys()]), {
    exact: true,
    missing: [],
    unexpected: [],
  });

  for (const actor of roster.actors) {
    const physical = runtime.actors.get(actor.actorId);
    assert(physical);
    const intent = runtime.inputs.consume(actor.actorId, canonicalTick);
    applyIntent(physical.body, intent.x, intent.z);
  }
  b3.b3World_Step(runtime.world, DT, WORLD_V0_TIMING.substeps);
  for (const actor of roster.actors) {
    const physical = runtime.actors.get(actor.actorId);
    assert(physical);
    const [x, z] = desiredIntent(actor.actorId, physical.body, canonicalTick + 1);
    assert.equal(runtime.inputs.schedule({
      actorId: actor.actorId,
      actorSessionId: actor.actorSessionId,
      targetTick: canonicalTick + 1,
      x,
      z,
    }, canonicalTick).status, "accepted");
  }
  const guard = packFoundationStateGuard(topology, WORLD_V0_STATE_COMPONENTS, (entityId) => {
    const actor = runtime.actors.get(entityId);
    if (actor) return bodyValues(actor.body);
    const prop = runtime.props.get(entityId);
    if (prop) return bodyValues(prop.body);
    return [];
  });
  return {
    tick: canonicalTick,
    outcomes: outcomes.map((outcome) => ({ ...outcome })),
    rosterJson: JSON.stringify(roster),
    topologyRevision: topology.topologyRevision,
    topologyDigest: topology.topologyDigest,
    guardPacked: guard.packed,
    rosterCheckpointDigest: runtime.roster.checkpoint().stateDigest,
    inputCheckpointDigest: runtime.inputs.checkpoint(roster).stateDigest,
  };
}

function validateEnvelopeHeader(envelope: AuthorityEnvelope): Uint8Array {
  assert.equal(envelope.revision, ENVELOPE_REVISION, "checkpoint envelope revision mismatch");
  assert.deepEqual(envelope.engine, ENGINE_FINGERPRINT, "checkpoint engine fingerprint mismatch");
  assert.equal(envelope.worldEpoch, WORLD_EPOCH, "checkpoint WorldEpoch mismatch");
  assert.equal(envelope.canonicalTick, CHECKPOINT_TICK, "checkpoint canonical tick mismatch");
  assert.equal(envelope.physics.encoding, "base64");
  const bytes = Uint8Array.from(Buffer.from(envelope.physics.bytes, "base64"));
  assert.equal(bytes.byteLength, envelope.physics.byteLength, "checkpoint physics byte length mismatch");
  assert.equal(sha256(bytes), envelope.physics.sha256, "checkpoint physics SHA-256 mismatch");
  return bytes;
}

function rebind(player: unknown, names: readonly string[], roster: FoundationRosterMachine): {
  props: Map<string, DynamicRecord>;
  actors: Map<string, ActorRecord>;
} {
  const found = new Map<string, BodyId>();
  assert.equal(b3.b3RecPlayer_GetBodyCount(player), names.length, "restored body count mismatch");
  for (let index = 0; index < names.length; index += 1) {
    const body = b3.b3RecPlayer_GetBodyId(player, index);
    assert.equal(b3.b3Body_IsValid(body), true);
    const name = b3.b3Body_GetName(body);
    assert(name.length > 0);
    assert.equal(found.has(name), false, `duplicate semantic body name ${name}`);
    found.set(name, body);
  }
  assert.deepEqual([...found.keys()].sort(), [...names].sort(), "restored semantic body domain mismatch");
  const props = new Map<string, DynamicRecord>();
  for (const authored of WORLD_V0_PROP_LAYOUT) {
    const body = found.get(authored.id);
    assert(body);
    props.set(authored.id, { body });
  }
  const actors = new Map<string, ActorRecord>();
  for (const actor of roster.snapshot().actors) {
    const body = found.get(actor.actorId);
    assert(body);
    actors.set(actor.actorId, { body, actorSessionId: actor.actorSessionId });
  }
  assert.equal(found.has("actor:2"), false, "pre-checkpoint retired actor reappeared");
  return { props, actors };
}

function consumeEnvelope(path: string): void {
  const envelope = JSON.parse(readFileSync(path, "utf8")) as AuthorityEnvelope;
  const bytes = validateEnvelopeHeader(envelope);
  const roster = FoundationRosterMachine.fromCheckpoint(jsonRoundTrip(envelope.rosterCheckpoint));
  const inputs = FoundationActorInputRegistry.fromCheckpoint(jsonRoundTrip(envelope.inputCheckpoint), roster.snapshot());
  const topology = new FoundationEntityTopology(WORLD_EPOCH, WORLD_V0_PROP_LAYOUT.map((prop) => prop.id));
  const boundaryTopology = topology.syncRoster(roster.snapshot());
  assert.equal(boundaryTopology.topologyRevision, envelope.topologyRevision);
  assert.equal(boundaryTopology.topologyDigest, envelope.topologyDigest);

  const player = byteB3.b3RecPlayer_CreateFromBytes(bytes, 1);
  assert(player, "checkpoint bytes failed to create a fresh-process RecPlayer");
  assert.equal(b3.b3RecPlayer_GetFrameCount(player), 0);
  assert.equal(b3.b3RecPlayer_StepFrame(player), false);
  const world = b3.b3RecPlayer_GetWorldId(player);
  const rebound = rebind(player, envelope.semanticBodyNames, roster);
  const runtime: AuthorityRuntime = { world, roster, topology, inputs, props: rebound.props, actors: rebound.actors };

  for (const expected of envelope.expectedFrames) {
    const actual = tick(runtime, expected.tick);
    assert.deepEqual(actual, expected, `fresh-process authority divergence at tick ${expected.tick}`);
  }
  assert.deepEqual(runtime.roster.snapshot().actors.map((actor) => actor.actorId), [
    "actor:0", "actor:1", "actor:3", "actor:5", "actor:6", "actor:7",
  ]);
  assert.equal(runtime.roster.topologyRevision, 10);
  b3.b3RecPlayer_Destroy(player);
  console.log(
    `MULTIPLAYER FOUNDATION AUTHORITY BYTE PROCESS CONSUMER PASS · fresh Node/WASM process restored ${bytes.byteLength} physics bytes + portable host checkpoints and remained exact through tick ${END_TICK - 1}`,
  );
}

function expectConsumerFailure(envelope: AuthorityEnvelope, path: string, label: string): void {
  writeFileSync(path, JSON.stringify(envelope));
  const result = spawnSync(process.execPath, ["--experimental-strip-types", process.argv[1], "--consume", path], {
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0, `${label} must fail closed in a fresh process`);
}

function produceAndVerify(path: string): void {
  assert.equal(typeof byteB3.b3Recording_CopyBytes, "function");
  assert.equal(typeof byteB3.b3RecPlayer_CreateFromBytes, "function");
  const { runtime, staticNames } = makeSource();
  let rosterCheckpoint: FoundationRosterCheckpoint | null = null;
  let inputCheckpoint: FoundationActorInputCheckpoint | null = null;
  let topologyRevision = 0;
  let topologyDigest = "";
  let semanticBodyNames: string[] = [];
  let physicsBytes: Uint8Array | null = null;

  for (let canonicalTick = 0; canonicalTick <= CHECKPOINT_TICK; canonicalTick += 1) {
    const frame = tick(runtime, canonicalTick);
    if (canonicalTick === CHECKPOINT_TICK) {
      rosterCheckpoint = jsonRoundTrip(runtime.roster.checkpoint());
      inputCheckpoint = jsonRoundTrip(runtime.inputs.checkpoint(runtime.roster.snapshot()));
      topologyRevision = frame.topologyRevision;
      topologyDigest = frame.topologyDigest;
      semanticBodyNames = [...staticNames, ...runtime.props.keys(), ...runtime.actors.keys()].sort();
      const recording = b3.b3CreateRecording(0);
      b3.b3World_StartRecording(runtime.world, recording);
      b3.b3World_StopRecording(runtime.world);
      physicsBytes = Uint8Array.from(byteB3.b3Recording_CopyBytes(recording));
      assert(physicsBytes.byteLength > 0);
      b3.b3DestroyRecording(recording);
    }
  }
  assert(rosterCheckpoint && inputCheckpoint && physicsBytes);

  const expectedFrames: FrameEvidence[] = [];
  for (let canonicalTick = CHECKPOINT_TICK + 1; canonicalTick < END_TICK; canonicalTick += 1) {
    expectedFrames.push(tick(runtime, canonicalTick));
  }
  b3.b3DestroyWorld(runtime.world);

  const envelope: AuthorityEnvelope = {
    revision: ENVELOPE_REVISION,
    engine: { ...ENGINE_FINGERPRINT },
    worldEpoch: WORLD_EPOCH,
    canonicalTick: CHECKPOINT_TICK,
    topologyRevision,
    topologyDigest,
    semanticBodyNames,
    rosterCheckpoint,
    inputCheckpoint,
    physics: {
      encoding: "base64",
      byteLength: physicsBytes.byteLength,
      sha256: sha256(physicsBytes),
      bytes: Buffer.from(physicsBytes).toString("base64"),
    },
    expectedFrames,
  };
  writeFileSync(path, JSON.stringify(envelope));

  const result = spawnSync(process.execPath, ["--experimental-strip-types", process.argv[1], "--consume", path], {
    encoding: "utf8",
  });
  assert.equal(result.status, 0, `fresh-process consumer failed:\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  assert.match(result.stdout, /AUTHORITY BYTE PROCESS CONSUMER PASS/);

  const wrongEngine = jsonRoundTrip(envelope);
  wrongEngine.engine.box3dCommit = "0000000000000000000000000000000000000000" as typeof ENGINE_FINGERPRINT.box3dCommit;
  expectConsumerFailure(wrongEngine, `${path}.wrong-engine`, "wrong engine fingerprint");

  const wrongHash = jsonRoundTrip(envelope);
  wrongHash.physics.sha256 = "0".repeat(64);
  expectConsumerFailure(wrongHash, `${path}.wrong-hash`, "wrong physics checksum");

  const wrongBoundary = jsonRoundTrip(envelope);
  wrongBoundary.canonicalTick += 1;
  expectConsumerFailure(wrongBoundary, `${path}.wrong-boundary`, "wrong canonical boundary");

  console.log(
    `MULTIPLAYER FOUNDATION AUTHORITY BYTE PROCESS SMOKE PASS · producer destroyed source Recording/world · envelopeBytes=${Buffer.byteLength(JSON.stringify(envelope))} · physicsBytes=${physicsBytes.byteLength} · fresh Node/WASM consumer restored exact authority through ${END_TICK - 1} with post-restore churn · wrong engine/hash/boundary rejected before restore`,
  );
}

if (process.argv[2] === "--consume") {
  assert(process.argv[3], "consumer checkpoint path required");
  consumeEnvelope(process.argv[3]);
} else {
  assert(process.argv[2], "producer checkpoint path required");
  produceAndVerify(process.argv[2]);
}
