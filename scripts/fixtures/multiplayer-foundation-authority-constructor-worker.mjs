import { DurableObject } from "cloudflare:workers";
import Box3D from "./box3d-byte-probe.generated.mjs";
import box3dWasmModule from "./box3d-byte-probe.generated.wasm";
import {
  WORLD_V0_ARENA,
  WORLD_V0_MOVEMENT,
  WORLD_V0_PLAYER_PHYSICS,
  WORLD_V0_PROP_LAYOUT,
  WORLD_V0_PROP_PHYSICS,
  WORLD_V0_STATE_COMPONENTS,
  WORLD_V0_TIMING,
} from "../../src/world-v0-contract.ts";
import { FoundationActorInputRegistry } from "../../src/multiplayer-foundation/actor-input-registry.ts";
import { FoundationCheckpointSqliteStorage } from "../../src/multiplayer-foundation/checkpoint-sqlite-storage.ts";
import { publishFoundationCheckpoint, recoverFoundationCheckpoint } from "../../src/multiplayer-foundation/checkpoint-store.ts";
import { FoundationEntityTopology } from "../../src/multiplayer-foundation/entity-topology.ts";
import { assertFoundationEngineRebindTokens } from "../../src/multiplayer-foundation/engine-rebind-token.ts";
import { FoundationRosterMachine } from "../../src/multiplayer-foundation/roster-machine.ts";
import { chooseFoundationSpawn } from "../../src/multiplayer-foundation/spawn-policy.ts";
import { packFoundationStateGuard } from "../../src/multiplayer-foundation/state-guard.ts";

const ENVELOPE_REVISION = "multiplayer-foundation-authority-byte-envelope-probe-v1";
const ENGINE_FINGERPRINT = {
  adapterRevision: "box3d-js-recording-byte-bridge-probe-v1",
  box3dJsCommit: "5d5a3af049cccd9948b2b55bac4342414af0ef64",
  box3dCommit: "8441b4a06d6d09dcfb0b0f704df4d847d1437b92",
  emscriptenVersion: "6.0.2",
};
const WORLD_EPOCH = "authority-byte-process-epoch";
const CHECKPOINT_TICK = 260;
const POST_CHECKPOINT_CHURN_TICK = 300;
const MOVE_START_TICK = 70;
const SPAWN_CLEARANCE = 1.5;
const DT = 1 / WORLD_V0_TIMING.simulationHz;
const DEFAULT_CHUNK_BYTES = 32 * 1024;
const MAX_ENVELOPE_BYTES = 1024 * 1024;

const SPAWN_CANDIDATES = [
  { spawnId: "yard-west", position: [-6.5, 0.82, -1.4] },
  { spawnId: "yard-east", position: [6.5, 0.82, 0] },
  { spawnId: "yard-north-west", position: [-6.5, 0.82, -6.0] },
  { spawnId: "yard-north", position: [0, 0.82, -6.5] },
  { spawnId: "yard-south-east", position: [6.5, 0.82, 6.0] },
  { spawnId: "yard-south", position: [0, 0.82, 6.5] },
];

const decoder = new TextDecoder();

function json(payload, status = 200) {
  return Response.json(payload, { status, headers: { "cache-control": "no-store" } });
}

function jsonRoundTrip(value) {
  return JSON.parse(JSON.stringify(value));
}

async function sha256(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function decodeBase64(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function createBox3D() {
  return Box3D({
    instantiateWasm(imports, successCallback) {
      const instance = new WebAssembly.Instance(box3dWasmModule, imports);
      successCallback(instance, box3dWasmModule);
      return instance.exports;
    },
  });
}

function bodyPosition(b3, body) {
  const value = [0, 0, 0];
  b3.b3Body_GetPosition(value, body);
  return [...value];
}

function bodyValues(b3, body) {
  const position = [0, 0, 0];
  const rotation = [0, 0, 0, 1];
  const linearVelocity = [0, 0, 0];
  const angularVelocity = [0, 0, 0];
  b3.b3Body_GetPosition(position, body);
  b3.b3Body_GetRotation(rotation, body);
  b3.b3Body_GetLinearVelocity(linearVelocity, body);
  b3.b3Body_GetAngularVelocity(angularVelocity, body);
  const values = [...position, ...rotation, ...linearVelocity, ...angularVelocity];
  requireCondition(values.every(Number.isFinite), "non-finite authority body state");
  return values;
}

function moveToward2(cx, cz, tx, tz, maxDelta) {
  const dx = tx - cx;
  const dz = tz - cz;
  const distance = Math.hypot(dx, dz);
  if (distance <= maxDelta || distance < 1e-9) return [tx, tz];
  const scale = maxDelta / distance;
  return [cx + dx * scale, cz + dz * scale];
}

function applyIntent(b3, body, x, z) {
  const velocity = [0, 0, 0];
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

function desiredIntent(b3, actorId, body, targetTick) {
  if (targetTick < MOVE_START_TICK) return [0, 0];
  const position = bodyPosition(b3, body);
  const distance = Math.hypot(position[0], position[2]);
  if (distance > 1.5) return [-position[0] / distance, -position[2] / distance];
  const ordinal = Number(actorId.slice("actor:".length));
  const angle = ordinal * 1.618 + targetTick * 0.031;
  return [Math.cos(angle), Math.sin(angle)];
}

function createPlayerBody(b3, world, semanticId, position) {
  assertFoundationEngineRebindTokens([semanticId]);
  const def = b3.b3DefaultBodyDef();
  def.type = b3.b3BodyType.b3_dynamicBody;
  def.position = [...position];
  def.linearDamping = WORLD_V0_PLAYER_PHYSICS.linearDamping;
  def.angularDamping = WORLD_V0_PLAYER_PHYSICS.angularDamping;
  const body = b3.b3CreateBody(world, def);
  b3.b3Body_SetName(body, semanticId);
  requireCondition(b3.b3Body_GetName(body) === semanticId, `engine rebind token ${semanticId} did not round-trip`);
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

function applyRosterOutcome(b3, runtime, outcome) {
  if (outcome.status === "retired") {
    const actor = runtime.actors.get(outcome.actorId);
    requireCondition(actor, `retired actor body ${outcome.actorId} missing`);
    b3.b3DestroyBody(actor.body);
    runtime.actors.delete(outcome.actorId);
    return;
  }
  if (outcome.status !== "joined") return;
  const blockers = [
    ...[...runtime.props.entries()].map(([entityId, value]) => ({ entityId, position: bodyPosition(b3, value.body) })),
    ...[...runtime.actors.entries()].map(([entityId, value]) => ({ entityId, position: bodyPosition(b3, value.body) })),
  ];
  const spawn = chooseFoundationSpawn(SPAWN_CANDIDATES, blockers, SPAWN_CLEARANCE);
  requireCondition(spawn, "no spawn candidate available for restored authority join");
  runtime.actors.set(outcome.actorId, {
    body: createPlayerBody(b3, runtime.world, outcome.actorId, [...spawn.position]),
    actorSessionId: outcome.actorSessionId,
  });
}

function tick(b3, runtime, canonicalTick) {
  const outcomes = runtime.roster.advanceTo(canonicalTick);
  outcomes.forEach((outcome) => applyRosterOutcome(b3, runtime, outcome));
  if (canonicalTick === 285) requireCondition(runtime.roster.setTransportConnected("session-e", true), "session-e reconnect failed");

  const roster = runtime.roster.snapshot();
  const topology = runtime.topology.syncRoster(roster);
  runtime.inputs.syncRoster(roster);
  const coverage = runtime.topology.validateEntityCoverage([...runtime.actors.keys(), ...runtime.props.keys()]);
  requireCondition(coverage.exact && coverage.missing.length === 0 && coverage.unexpected.length === 0, "restored topology coverage mismatch");

  for (const actor of roster.actors) {
    const physical = runtime.actors.get(actor.actorId);
    requireCondition(physical, `actor body ${actor.actorId} missing during restored tick`);
    const intent = runtime.inputs.consume(actor.actorId, canonicalTick);
    applyIntent(b3, physical.body, intent.x, intent.z);
  }
  b3.b3World_Step(runtime.world, DT, WORLD_V0_TIMING.substeps);
  for (const actor of roster.actors) {
    const physical = runtime.actors.get(actor.actorId);
    requireCondition(physical, `actor body ${actor.actorId} missing after restored step`);
    const [x, z] = desiredIntent(b3, actor.actorId, physical.body, canonicalTick + 1);
    const scheduled = runtime.inputs.schedule({
      actorId: actor.actorId,
      actorSessionId: actor.actorSessionId,
      targetTick: canonicalTick + 1,
      x,
      z,
    }, canonicalTick);
    requireCondition(scheduled.status === "accepted", `restored input scheduling failed for ${actor.actorId}`);
  }
  const guard = packFoundationStateGuard(topology, WORLD_V0_STATE_COMPONENTS, (entityId) => {
    const actor = runtime.actors.get(entityId);
    if (actor) return bodyValues(b3, actor.body);
    const prop = runtime.props.get(entityId);
    if (prop) return bodyValues(b3, prop.body);
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

async function parseAndValidateEnvelope(payload) {
  let envelope;
  try {
    envelope = JSON.parse(decoder.decode(payload));
  } catch (error) {
    throw new Error("authority checkpoint envelope is not valid JSON", { cause: error });
  }
  requireCondition(envelope.revision === ENVELOPE_REVISION, "authority checkpoint envelope revision mismatch");
  requireCondition(sameJson(envelope.engine, ENGINE_FINGERPRINT), "authority checkpoint engine fingerprint mismatch");
  requireCondition(envelope.worldEpoch === WORLD_EPOCH, "authority checkpoint WorldEpoch mismatch");
  requireCondition(envelope.canonicalTick === CHECKPOINT_TICK, "authority checkpoint canonical tick mismatch");
  requireCondition(envelope.physics?.encoding === "base64", "authority checkpoint physics encoding mismatch");
  requireCondition(Array.isArray(envelope.semanticBodyNames), "authority checkpoint semantic body domain missing");
  assertFoundationEngineRebindTokens(envelope.semanticBodyNames);
  const physicsBytes = decodeBase64(envelope.physics.bytes);
  requireCondition(physicsBytes.byteLength === envelope.physics.byteLength, "authority checkpoint physics byte length mismatch");
  requireCondition(await sha256(physicsBytes) === envelope.physics.sha256, "authority checkpoint physics SHA-256 mismatch");
  requireCondition(Array.isArray(envelope.expectedFrames) && envelope.expectedFrames.length > 0, "authority checkpoint expected future missing");
  return { envelope, physicsBytes };
}

function rebind(b3, player, names, roster) {
  assertFoundationEngineRebindTokens(names);
  const found = new Map();
  requireCondition(b3.b3RecPlayer_GetBodyCount(player) === names.length, "restored body count mismatch");
  for (let index = 0; index < names.length; index += 1) {
    const body = b3.b3RecPlayer_GetBodyId(player, index);
    requireCondition(b3.b3Body_IsValid(body), `restored body ${index} is invalid`);
    const name = b3.b3Body_GetName(body);
    requireCondition(name.length > 0, `restored body ${index} has empty rebind token`);
    requireCondition(!found.has(name), `duplicate restored engine rebind token ${name}`);
    found.set(name, body);
  }
  requireCondition(sameJson([...found.keys()].sort(), [...names].sort()), "restored semantic body domain mismatch");

  const props = new Map();
  for (const authored of WORLD_V0_PROP_LAYOUT) {
    const body = found.get(authored.id);
    requireCondition(body, `restored prop body ${authored.id} missing`);
    props.set(authored.id, { body });
  }
  const actors = new Map();
  for (const actor of roster.snapshot().actors) {
    const body = found.get(actor.actorId);
    requireCondition(body, `restored actor body ${actor.actorId} missing`);
    actors.set(actor.actorId, { body, actorSessionId: actor.actorSessionId });
  }
  requireCondition(!found.has("actor:2"), "pre-checkpoint retired actor reappeared");
  return { props, actors };
}

export class FoundationAuthorityConstructorTest extends DurableObject {
  checkpointStorage;
  instanceNonce = crypto.randomUUID();
  restoreState = "pending";
  restoreError = null;
  restoredBoundary = null;
  b3 = null;
  player = null;
  runtime = null;
  envelope = null;
  resumed = false;

  constructor(ctx, env) {
    super(ctx, env);
    this.checkpointStorage = new FoundationCheckpointSqliteStorage(ctx.storage);
    ctx.blockConcurrencyWhile(async () => {
      try {
        const recovered = await recoverFoundationCheckpoint(this.checkpointStorage);
        if (!recovered) {
          this.restoreState = "empty";
          return;
        }
        const { envelope, physicsBytes } = await parseAndValidateEnvelope(recovered.payload);
        requireCondition(recovered.head.worldEpoch === envelope.worldEpoch, "durable HEAD/envelope WorldEpoch mismatch");
        requireCondition(recovered.head.canonicalTick === envelope.canonicalTick, "durable HEAD/envelope canonical tick mismatch");

        const roster = FoundationRosterMachine.fromCheckpoint(jsonRoundTrip(envelope.rosterCheckpoint));
        const inputs = FoundationActorInputRegistry.fromCheckpoint(jsonRoundTrip(envelope.inputCheckpoint), roster.snapshot());
        const topology = new FoundationEntityTopology(WORLD_EPOCH, WORLD_V0_PROP_LAYOUT.map((prop) => prop.id));
        const boundaryTopology = topology.syncRoster(roster.snapshot());
        requireCondition(boundaryTopology.topologyRevision === envelope.topologyRevision, "restored topology revision mismatch");
        requireCondition(boundaryTopology.topologyDigest === envelope.topologyDigest, "restored topology digest mismatch");

        const b3 = await createBox3D();
        requireCondition(typeof b3.b3RecPlayer_CreateFromBytes === "function", "byte-capable Box3D bridge missing in constructor");
        const player = b3.b3RecPlayer_CreateFromBytes(physicsBytes, 1);
        requireCondition(player, "constructor checkpoint bytes failed to create RecPlayer");
        requireCondition(b3.b3RecPlayer_GetFrameCount(player) === 0, "constructor checkpoint unexpectedly contains future frames");
        requireCondition(b3.b3RecPlayer_StepFrame(player) === false, "constructor seed-only RecPlayer unexpectedly stepped a recorded frame");
        const world = b3.b3RecPlayer_GetWorldId(player);
        const rebound = rebind(b3, player, envelope.semanticBodyNames, roster);

        this.b3 = b3;
        this.player = player;
        this.runtime = { world, roster, topology, inputs, props: rebound.props, actors: rebound.actors };
        this.envelope = envelope;
        this.restoredBoundary = {
          generation: recovered.head.generation,
          canonicalTick: recovered.head.canonicalTick,
          payloadSha256: recovered.manifest.payloadSha256,
          physicsByteLength: physicsBytes.byteLength,
          expectedFrameCount: envelope.expectedFrames.length,
        };
        this.restoreState = "restored";
      } catch (error) {
        this.restoreState = "failed";
        this.restoreError = error instanceof Error ? error.stack ?? error.message : String(error);
      }
    });
  }

  async fetch(request) {
    const url = new URL(request.url);
    try {
      if (url.pathname === "/publish-envelope") {
        if (request.method !== "POST") return json({ ok: false, error: "post_required" }, 405);
        requireCondition(this.restoreState === "empty", "publish requires an empty constructor state");
        const payload = new Uint8Array(await request.arrayBuffer());
        requireCondition(payload.byteLength > 0 && payload.byteLength <= MAX_ENVELOPE_BYTES, "invalid authority envelope byte length");
        const { envelope } = await parseAndValidateEnvelope(payload);
        const head = await publishFoundationCheckpoint(this.checkpointStorage, {
          generation: 1,
          worldEpoch: envelope.worldEpoch,
          canonicalTick: envelope.canonicalTick,
          payload,
          chunkBytes: DEFAULT_CHUNK_BYTES,
        });
        const recovered = await recoverFoundationCheckpoint(this.checkpointStorage);
        requireCondition(recovered, "authority checkpoint missing immediately after publication");
        return json({
          ok: true,
          instanceNonce: this.instanceNonce,
          head,
          payloadByteLength: recovered.payload.byteLength,
          payloadSha256: recovered.manifest.payloadSha256,
          chunkCount: recovered.manifest.chunks.length,
          stats: this.checkpointStorage.stats(),
        });
      }

      if (url.pathname === "/resume") {
        requireCondition(this.restoreState === "restored", `authority constructor is not restored: ${this.restoreState}`);
        requireCondition(!this.resumed, "authority constructor future already consumed");
        requireCondition(this.b3 && this.runtime && this.envelope, "restored authority runtime is incomplete");
        let lastActual = null;
        for (const expected of this.envelope.expectedFrames) {
          const actual = tick(this.b3, this.runtime, expected.tick);
          requireCondition(sameJson(actual, expected), `fresh-constructor authority divergence at tick ${expected.tick}`);
          lastActual = actual;
        }
        this.resumed = true;
        const roster = this.runtime.roster.snapshot();
        const actorIds = roster.actors.map((actor) => actor.actorId);
        requireCondition(actorIds.includes("actor:7"), "post-restore replacement actor missing after constructor continuation");
        requireCondition(!actorIds.includes("actor:4"), "post-restore retired actor survived constructor continuation");
        return json({
          ok: true,
          instanceNonce: this.instanceNonce,
          restoredBoundary: this.restoredBoundary,
          resumedThrough: lastActual?.tick ?? null,
          exactFrameCount: this.envelope.expectedFrames.length,
          finalActorIds: actorIds,
          postCheckpointChurnTick: POST_CHECKPOINT_CHURN_TICK,
        });
      }

      if (url.pathname === "/health") {
        return json({
          ok: true,
          instanceNonce: this.instanceNonce,
          restoreState: this.restoreState,
          restoreError: this.restoreError,
          restoredBoundary: this.restoredBoundary,
          resumed: this.resumed,
          stats: this.checkpointStorage.stats(),
        });
      }

      return json({ ok: false, error: "not_found" }, 404);
    } catch (error) {
      return json({
        ok: false,
        error: error instanceof Error ? error.stack ?? error.message : String(error),
        instanceNonce: this.instanceNonce,
        restoreState: this.restoreState,
      }, 409);
    }
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const objectName = url.searchParams.get("object") ?? "authority-constructor-probe";
    const namespace = env.FOUNDATION_AUTHORITY_CONSTRUCTOR_TEST;
    const stub = namespace.get(namespace.idFromName(objectName));
    return stub.fetch(request);
  },
};
