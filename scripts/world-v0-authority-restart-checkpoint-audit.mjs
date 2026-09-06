import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  WORLD_V0_ARENA,
  WORLD_V0_CLIENT_SIM_REVISION,
  WORLD_V0_MOVEMENT,
  WORLD_V0_NET_ENTITY_ORDER,
  WORLD_V0_PLAYER_PHYSICS,
  WORLD_V0_PLAYER_STARTS,
  WORLD_V0_PROP_LAYOUT,
  WORLD_V0_PROP_PHYSICS,
  WORLD_V0_SIM_BUILD_ID,
  WORLD_V0_TIMING,
} from "../src/world-v0-contract.ts";

const REVISION = "world-v0-authority-restart-checkpoint-audit-v1";
const CHECKPOINT_SCHEMA = "world-v0-authority-restart-checkpoint-v1";
const CHECKPOINT_TICK = 240;
const CONTINUATION_TICKS = 180;
const WORLD_ID = "shared-yard-v0-restart-audit";
const BOX3D_FINGERPRINT = {
  package: "box3d.js@0.1.1",
  wrapperCommit: "5d5a3af049cccd9948b2b55bac4342414af0ef64",
  box3dCommit: "8441b4a06d6d09dcfb0b0f704df4d847d1437b92",
};

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const index = arg.indexOf("=");
    return index === -1 ? [arg, ""] : [arg.slice(0, index), arg.slice(index + 1)];
  }),
);
const modulePath = resolve(args.get("--module") ?? "");
const mode = args.get("--mode") || "parent";
const checkpointPath = args.get("--checkpoint") ? resolve(args.get("--checkpoint")) : null;
const oraclePath = args.get("--oracle") ? resolve(args.get("--oracle")) : null;

if (!modulePath) {
  throw new Error("usage: node world-v0-authority-restart-checkpoint-audit.mjs --module=<patched box3d module>");
}

function fnv1a32(bytes) {
  let hash = 0x811c9dc5;
  for (const value of bytes) {
    hash ^= value;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}
function hashHex(value) { return (value >>> 0).toString(16).padStart(8, "0"); }
function assert(condition, message) { if (!condition) throw new Error(message); }

async function loadBox3D() {
  const { default: Box3D } = await import(pathToFileURL(modulePath).href);
  const b3 = await Box3D();
  for (const name of ["b3Recording_CopyData", "b3RecPlayer_CreateFromBytes", "b3Bytes_Fnv1a32"]) {
    if (typeof b3[name] !== "function") throw new Error(`patched binding missing ${name}`);
  }
  return b3;
}

function makePhysicsHelpers(b3) {
  const dv = new DataView(new ArrayBuffer(4));
  const f32bits = (value) => {
    dv.setFloat32(0, value, true);
    return dv.getUint32(0, true).toString(16).padStart(8, "0");
  };
  const vec3 = (body, getter) => {
    const out = [0, 0, 0];
    getter(out, body);
    return out;
  };
  const rotation = (body) => {
    const out = [0, 0, 0, 1];
    b3.b3Body_GetRotation(out, body);
    return out;
  };
  const linearVelocity = (body) => vec3(body, b3.b3Body_GetLinearVelocity);
  const packedBody = (body) => [
    ...vec3(body, b3.b3Body_GetPosition),
    ...rotation(body),
    ...linearVelocity(body),
    ...vec3(body, b3.b3Body_GetAngularVelocity),
  ].map(f32bits).join("");
  const stateGuard = (bodies) => WORLD_V0_NET_ENTITY_ORDER
    .map((id) => {
      const body = bodies.get(id);
      assert(body, `state guard missing ${id}`);
      return `${id}:${packedBody(body)}`;
    })
    .join("|");

  function createWorld() {
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
      const id = `actor:${slot}`;
      b3.b3Body_SetName(body, id);
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
      bodies.set(id, body);
    }
    return { world, bodies };
  }

  function remapPlayer(player) {
    const world = b3.b3RecPlayer_GetWorldId(player);
    const bodies = new Map();
    const count = b3.b3RecPlayer_GetBodyCount(player);
    for (let i = 0; i < count; i += 1) {
      const body = b3.b3RecPlayer_GetBodyId(player, i);
      if (!b3.b3Body_IsValid(body)) continue;
      const name = b3.b3Body_GetName(body);
      if (name && WORLD_V0_NET_ENTITY_ORDER.includes(name)) bodies.set(name, body);
    }
    for (const id of WORLD_V0_NET_ENTITY_ORDER) assert(bodies.has(id), `restart remap missing ${id}`);
    return { world, bodies };
  }

  function moveToward2(vx, vz, tx, tz, delta) {
    const dx = tx - vx;
    const dz = tz - vz;
    const length = Math.hypot(dx, dz);
    if (length <= delta || length === 0) return [tx, tz];
    const scale = delta / length;
    return [vx + dx * scale, vz + dz * scale];
  }
  function inputsForTick(tick) {
    return [
      tick < 120 ? { x: 1, z: 0 } : tick < 300 ? { x: 0, z: 1 } : { x: -1, z: 0 },
      tick < 160 ? { x: -1, z: 0 } : tick < 340 ? { x: 0, z: -1 } : { x: 1, z: 0 },
    ];
  }
  function applyIntent(body, input) {
    const velocity = linearVelocity(body);
    const hasInput = Math.hypot(input.x, input.z) > 0.01;
    const accel = hasInput ? WORLD_V0_MOVEMENT.playerAcceleration : WORLD_V0_MOVEMENT.playerDeceleration;
    const [x, z] = moveToward2(
      velocity[0], velocity[2],
      input.x * WORLD_V0_MOVEMENT.playerSpeed,
      input.z * WORLD_V0_MOVEMENT.playerSpeed,
      accel / WORLD_V0_TIMING.simulationHz,
    );
    b3.b3Body_SetLinearVelocity(body, [x, velocity[1], z]);
  }
  function step(sim, tick) {
    const inputs = inputsForTick(tick);
    applyIntent(sim.bodies.get("actor:0"), inputs[0]);
    applyIntent(sim.bodies.get("actor:1"), inputs[1]);
    b3.b3World_Step(sim.world, 1 / WORLD_V0_TIMING.simulationHz, WORLD_V0_TIMING.substeps);
  }

  return { createWorld, remapPlayer, stateGuard, step };
}

async function runCheckpointProducer() {
  assert(checkpointPath, "checkpoint mode requires --checkpoint");
  const b3 = await loadBox3D();
  const physics = makePhysicsHelpers(b3);
  const sim = physics.createWorld();
  for (let tick = 0; tick < CHECKPOINT_TICK; tick += 1) physics.step(sim, tick);

  const sourceWorldEpoch = crypto.randomUUID();
  const guardAtCheckpoint = physics.stateGuard(sim.bodies);
  const recording = b3.b3CreateRecording(0);
  b3.b3World_StartRecording(sim.world, recording);
  b3.b3World_StopRecording(sim.world);
  const bytes = b3.b3Recording_CopyData(recording);
  assert(bytes instanceof Uint8Array, "checkpoint copy is not Uint8Array");
  const byteLength = b3.b3Recording_GetSize(recording);
  assert(bytes.byteLength === byteLength, `checkpoint size mismatch ${bytes.byteLength} != ${byteLength}`);
  const hashU32 = fnv1a32(bytes);
  const nativeHashU32 = Number(b3.b3Bytes_Fnv1a32(bytes)) >>> 0;
  assert(nativeHashU32 === hashU32, "checkpoint native ingress hash mismatch");

  const envelope = {
    schema: CHECKPOINT_SCHEMA,
    revision: REVISION,
    worldId: WORLD_ID,
    sourceWorldEpoch,
    checkpointTick: CHECKPOINT_TICK,
    simBuildId: WORLD_V0_SIM_BUILD_ID,
    clientSimRevision: WORLD_V0_CLIENT_SIM_REVISION,
    box3d: BOX3D_FINGERPRINT,
    dynamicEntityOrder: [...WORLD_V0_NET_ENTITY_ORDER],
    schedulerBoundary: {
      kind: "no-persisted-future-intent-audit-boundary",
      note: "Future-input scheduler state is intentionally excluded and remains a separate audit frontier.",
    },
    payload: {
      encoding: "base64",
      byteLength,
      fnv1a32: hashHex(hashU32),
      data: Buffer.from(bytes).toString("base64"),
    },
  };
  writeFileSync(checkpointPath, JSON.stringify(envelope));
  console.log("WORLD_V0_RESTART_CHECKPOINT_PRODUCED", JSON.stringify({
    pid: process.pid,
    sourceWorldEpoch,
    checkpointTick: CHECKPOINT_TICK,
    guardAtCheckpoint,
    byteLength,
    fnv1a32: envelope.payload.fnv1a32,
  }));

  b3.b3DestroyRecording(recording);
  b3.b3DestroyWorld(sim.world);
}

async function runOracle() {
  assert(oraclePath, "oracle mode requires --oracle");
  const b3 = await loadBox3D();
  const physics = makePhysicsHelpers(b3);
  const sim = physics.createWorld();
  for (let tick = 0; tick < CHECKPOINT_TICK; tick += 1) physics.step(sim, tick);
  const guardAtCheckpoint = physics.stateGuard(sim.bodies);
  const continuationGuards = [];
  for (let tick = CHECKPOINT_TICK; tick < CHECKPOINT_TICK + CONTINUATION_TICKS; tick += 1) {
    physics.step(sim, tick);
    continuationGuards.push(physics.stateGuard(sim.bodies));
  }
  writeFileSync(oraclePath, JSON.stringify({
    revision: REVISION,
    checkpointTick: CHECKPOINT_TICK,
    continuationTicks: CONTINUATION_TICKS,
    guardAtCheckpoint,
    continuationGuards,
  }));
  console.log("WORLD_V0_RESTART_ORACLE_PRODUCED", JSON.stringify({
    pid: process.pid,
    checkpointTick: CHECKPOINT_TICK,
    continuationTicks: CONTINUATION_TICKS,
    guardAtCheckpoint,
    finalGuard: continuationGuards.at(-1),
  }));
  b3.b3DestroyWorld(sim.world);
}

function validateEnvelope(envelope) {
  if (envelope?.schema !== CHECKPOINT_SCHEMA) throw new Error("checkpoint_schema_mismatch");
  if (envelope?.worldId !== WORLD_ID) throw new Error("checkpoint_world_id_mismatch");
  if (envelope?.checkpointTick !== CHECKPOINT_TICK) throw new Error("checkpoint_tick_mismatch");
  if (envelope?.simBuildId !== WORLD_V0_SIM_BUILD_ID) throw new Error("checkpoint_sim_build_mismatch");
  if (envelope?.clientSimRevision !== WORLD_V0_CLIENT_SIM_REVISION) throw new Error("checkpoint_client_sim_revision_mismatch");
  if (JSON.stringify(envelope?.box3d) !== JSON.stringify(BOX3D_FINGERPRINT)) throw new Error("checkpoint_box3d_fingerprint_mismatch");
  if (JSON.stringify(envelope?.dynamicEntityOrder) !== JSON.stringify(WORLD_V0_NET_ENTITY_ORDER)) throw new Error("checkpoint_entity_order_mismatch");
  if (!envelope?.sourceWorldEpoch || typeof envelope.sourceWorldEpoch !== "string") throw new Error("checkpoint_source_epoch_missing");
  if (envelope?.payload?.encoding !== "base64") throw new Error("checkpoint_payload_encoding_mismatch");
}

async function runResume() {
  assert(checkpointPath && oraclePath, "resume mode requires --checkpoint and --oracle");
  const envelope = JSON.parse(readFileSync(checkpointPath, "utf8"));
  validateEnvelope(envelope);
  const oracle = JSON.parse(readFileSync(oraclePath, "utf8"));
  assert(oracle?.revision === REVISION, "oracle_revision_mismatch");
  assert(oracle?.checkpointTick === CHECKPOINT_TICK, "oracle_checkpoint_tick_mismatch");
  assert(oracle?.continuationTicks === CONTINUATION_TICKS, "oracle_continuation_ticks_mismatch");
  assert(Array.isArray(oracle?.continuationGuards) && oracle.continuationGuards.length === CONTINUATION_TICKS, "oracle_guard_count_mismatch");

  const bytes = new Uint8Array(Buffer.from(envelope.payload.data, "base64"));
  assert(bytes.byteLength === envelope.payload.byteLength, "checkpoint_payload_size_mismatch");
  const hashU32 = fnv1a32(bytes);
  assert(hashHex(hashU32) === envelope.payload.fnv1a32, "checkpoint_payload_hash_mismatch");

  const b3 = await loadBox3D();
  const nativeHashU32 = Number(b3.b3Bytes_Fnv1a32(bytes)) >>> 0;
  assert(nativeHashU32 === hashU32, "checkpoint_native_ingress_hash_mismatch");
  const player = b3.b3RecPlayer_CreateFromBytes(bytes, 1);
  assert(player, "checkpoint_native_reconstruction_failed");
  const sim = makePhysicsHelpers(b3);
  const restored = sim.remapPlayer(player);
  const restoredGuard = sim.stateGuard(restored.bodies);
  assert(restoredGuard === oracle.guardAtCheckpoint, "checkpoint_restore_guard_mismatch");

  const resumedWorldEpoch = crypto.randomUUID();
  assert(resumedWorldEpoch !== envelope.sourceWorldEpoch, "restart_epoch_failed_to_rotate");
  let exactContinuationTicks = 0;
  for (let index = 0; index < CONTINUATION_TICKS; index += 1) {
    const tick = CHECKPOINT_TICK + index;
    sim.step(restored, tick);
    const guard = sim.stateGuard(restored.bodies);
    if (guard !== oracle.continuationGuards[index]) {
      throw new Error(`checkpoint_continuation_diverged_at_tick_${tick}`);
    }
    exactContinuationTicks += 1;
  }

  console.log("WORLD_V0_RESTART_RESUMED", JSON.stringify({
    pid: process.pid,
    sourceWorldEpoch: envelope.sourceWorldEpoch,
    resumedWorldEpoch,
    epochRotated: true,
    checkpointTick: CHECKPOINT_TICK,
    restoredGuardExact: true,
    exactContinuationTicks,
    finalGuard: oracle.continuationGuards.at(-1),
  }));
  b3.b3RecPlayer_Destroy(player);
}

function runChild(childMode, extraArgs) {
  const scriptPath = fileURLToPath(import.meta.url);
  const result = spawnSync(process.execPath, [
    scriptPath,
    `--module=${modulePath}`,
    `--mode=${childMode}`,
    ...extraArgs,
  ], { encoding: "utf8" });
  return result;
}

function requireChildSuccess(result, label) {
  if (result.status !== 0) {
    throw new Error(`${label} failed status=${result.status}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  }
}

function parseMarker(stdout, marker) {
  const line = stdout.split(/\r?\n/).find((value) => value.startsWith(`${marker} `));
  if (!line) throw new Error(`missing ${marker} marker in child output`);
  return JSON.parse(line.slice(marker.length + 1));
}

async function runParent() {
  const work = mkdtempSync(resolve(tmpdir(), "world-v0-restart-audit-"));
  const checkpoint = resolve(work, "checkpoint.json");
  const oracle = resolve(work, "oracle.json");
  const incompatible = resolve(work, "checkpoint-incompatible.json");
  try {
    const produced = runChild("checkpoint", [`--checkpoint=${checkpoint}`]);
    requireChildSuccess(produced, "checkpoint producer");
    const checkpointResult = parseMarker(produced.stdout, "WORLD_V0_RESTART_CHECKPOINT_PRODUCED");

    const oracleRun = runChild("oracle", [`--oracle=${oracle}`]);
    requireChildSuccess(oracleRun, "oracle producer");
    const oracleResult = parseMarker(oracleRun.stdout, "WORLD_V0_RESTART_ORACLE_PRODUCED");
    assert(checkpointResult.guardAtCheckpoint === oracleResult.guardAtCheckpoint, "independent checkpoint/oracle boundary mismatch");

    const mutated = JSON.parse(readFileSync(checkpoint, "utf8"));
    mutated.simBuildId = `${WORLD_V0_SIM_BUILD_ID}-intentional-mismatch`;
    writeFileSync(incompatible, JSON.stringify(mutated));
    const rejected = runChild("resume", [`--checkpoint=${incompatible}`, `--oracle=${oracle}`]);
    const rejectionText = `${rejected.stdout}\n${rejected.stderr}`;
    assert(rejected.status !== 0 && rejectionText.includes("checkpoint_sim_build_mismatch"), "incompatible checkpoint did not fail closed before native restore");

    const resumed = runChild("resume", [`--checkpoint=${checkpoint}`, `--oracle=${oracle}`]);
    requireChildSuccess(resumed, "restart consumer");
    const resumeResult = parseMarker(resumed.stdout, "WORLD_V0_RESTART_RESUMED");
    assert(resumeResult.sourceWorldEpoch === checkpointResult.sourceWorldEpoch, "restart consumed wrong source epoch");
    assert(resumeResult.epochRotated, "restart did not rotate epoch");
    assert(resumeResult.exactContinuationTicks === CONTINUATION_TICKS, "restart continuation horizon incomplete");

    const envelope = JSON.parse(readFileSync(checkpoint, "utf8"));
    const result = {
      revision: REVISION,
      processBoundary: {
        checkpointProducerPid: checkpointResult.pid,
        oraclePid: oracleResult.pid,
        restartConsumerPid: resumeResult.pid,
        producerExitedBeforeConsumer: true,
        checkpointMedium: "JSON file containing finalized Box3D bytes as base64 plus explicit compatibility metadata",
      },
      checkpoint: {
        schema: envelope.schema,
        worldId: envelope.worldId,
        sourceWorldEpoch: envelope.sourceWorldEpoch,
        checkpointTick: envelope.checkpointTick,
        simBuildId: envelope.simBuildId,
        box3d: envelope.box3d,
        byteLength: envelope.payload.byteLength,
        fnv1a32: envelope.payload.fnv1a32,
        independentOracleBoundaryExact: checkpointResult.guardAtCheckpoint === oracleResult.guardAtCheckpoint,
      },
      restart: {
        resumedWorldEpoch: resumeResult.resumedWorldEpoch,
        epochRotated: resumeResult.epochRotated,
        restoredGuardExact: resumeResult.restoredGuardExact,
        exactContinuationTicks: resumeResult.exactContinuationTicks,
        incompatibleSimBuildRejectedBeforeRestore: true,
      },
      verdict: "WORLD_V0_AUTHORITY_PROCESS_LOSS_CHECKPOINT_RECONSTRUCTION_PASS",
      nonClaim: "This is a bounded same-build process-loss falsifier, not a production persistence architecture. It proves finalized checkpoint bytes plus explicit compatibility metadata can cross a process-independent durable file boundary, reconstruct exact shared physics into a new WorldEpoch, and continue exactly under the same post-checkpoint stimuli. It does not qualify Durable Object storage integration, crash-atomic checkpoint writes, cross-build migration, connection/ActorSession continuity, future-input scheduler persistence, long-term saves, authentication, or remote Cloudflare lifecycle behavior.",
    };
    console.log("WORLD_V0_AUTHORITY_RESTART_CHECKPOINT", JSON.stringify(result, null, 2));
    console.log(result.verdict);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

if (mode === "checkpoint") await runCheckpointProducer();
else if (mode === "oracle") await runOracle();
else if (mode === "resume") await runResume();
else if (mode === "parent") await runParent();
else throw new Error(`unknown mode ${mode}`);
