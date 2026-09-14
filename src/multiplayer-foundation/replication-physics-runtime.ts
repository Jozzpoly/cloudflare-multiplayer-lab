import { b3, BOX3D_RUNTIME } from "../box3d-runtime.ts";
import {
  WORLD_V0_ARENA,
  WORLD_V0_BOX3D_RUNTIME,
  WORLD_V0_MOVEMENT,
  WORLD_V0_PLAYER_PHYSICS,
  WORLD_V0_PROP_LAYOUT,
  WORLD_V0_PROP_PHYSICS,
  WORLD_V0_STATE_COMPONENTS,
  WORLD_V0_TIMING,
} from "../world-v0-contract.ts";
import { FOUNDATION_BOX3D_RECORDING_SEED_FORMAT } from "./client-runtime-bootstrap.ts";
import type { FoundationTopologySnapshot } from "./entity-topology.ts";
import { packFoundationStateGuard, type FoundationStateGuard } from "./state-guard.ts";

if (
  BOX3D_RUNTIME.package !== WORLD_V0_BOX3D_RUNTIME.package
  || BOX3D_RUNTIME.build !== WORLD_V0_BOX3D_RUNTIME.build
) {
  throw new Error("foundation replication physics Box3D runtime drift");
}

const DT = 1 / WORLD_V0_TIMING.simulationHz;
const ACTOR_STARTS = [
  [-1.8, 0.82, -1.35],
  [1.8, 0.82, -1.35],
  [0, 0.82, 1.55],
] as const;

export type FoundationReplicationPhysicsSeed = {
  formatId: typeof FOUNDATION_BOX3D_RECORDING_SEED_FORMAT;
  worldEpoch: string;
  canonicalTick: number;
  topologyRevision: number;
  topologyDigest: string;
  bodyNames: string[];
  byteLength: number;
  fnv1a32: string;
  bytesBase64: string;
};

export type FoundationReplicationPhysicsInput = {
  actorId: `actor:${number}`;
  x: number;
  z: number;
};

type ActorPhysical = {
  body: any;
  actorSessionId: string;
};

function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x4000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(bytes.length, offset + chunkSize)));
  }
  return btoa(binary);
}

function u32Hex(value: number): string {
  return (value >>> 0).toString(16).padStart(8, "0");
}

function moveToward2(cx: number, cz: number, tx: number, tz: number, maxDelta: number): [number, number] {
  const dx = tx - cx;
  const dz = tz - cz;
  const distance = Math.hypot(dx, dz);
  if (distance <= maxDelta || distance < 1e-9) return [tx, tz];
  const scale = maxDelta / distance;
  return [cx + dx * scale, cz + dz * scale];
}

function bodyValues(body: any): number[] {
  const position = [0, 0, 0];
  const rotation = [0, 0, 0, 1];
  const linearVelocity = [0, 0, 0];
  const angularVelocity = [0, 0, 0];
  b3.b3Body_GetPosition(position, body);
  b3.b3Body_GetRotation(rotation, body);
  b3.b3Body_GetLinearVelocity(linearVelocity, body);
  b3.b3Body_GetAngularVelocity(angularVelocity, body);
  const values = [...position, ...rotation, ...linearVelocity, ...angularVelocity];
  if (!values.every(Number.isFinite)) throw new Error("physics replication body state is non-finite");
  return values;
}

export class FoundationReplicationPhysicsRuntime {
  readonly buildId = BOX3D_RUNTIME.build;
  readonly stateComponents = [...WORLD_V0_STATE_COMPONENTS];

  private readonly world: any;
  private readonly staticNames: string[] = [];
  private readonly actors = new Map<`actor:${number}`, ActorPhysical>();
  private readonly props = new Map<string, any>();

  constructor() {
    const worldDef = b3.b3DefaultWorldDef();
    worldDef.gravity = [...WORLD_V0_ARENA.gravity];
    this.world = b3.b3CreateWorld(worldDef);

    WORLD_V0_ARENA.staticBoxes.forEach((box, index) => {
      const name = `arena:static:${index}`;
      const def = b3.b3DefaultBodyDef();
      def.position = [...box.position];
      const body = b3.b3CreateBody(this.world, def);
      b3.b3Body_SetName(body, name);
      b3.b3CreateBoxShape(body, b3.b3DefaultShapeDef(), box.halfExtents[0], box.halfExtents[1], box.halfExtents[2]);
      this.staticNames.push(name);
    });

    for (const prop of WORLD_V0_PROP_LAYOUT) {
      const def = b3.b3DefaultBodyDef();
      def.type = b3.b3BodyType.b3_dynamicBody;
      def.position = [...prop.position];
      def.linearDamping = WORLD_V0_PROP_PHYSICS.linearDamping;
      def.angularDamping = WORLD_V0_PROP_PHYSICS.angularDamping;
      const body = b3.b3CreateBody(this.world, def);
      b3.b3Body_SetName(body, prop.id);
      const shape = b3.b3DefaultShapeDef();
      shape.density = WORLD_V0_PROP_PHYSICS.density;
      shape.baseMaterial.friction = WORLD_V0_PROP_PHYSICS.friction;
      shape.baseMaterial.restitution = WORLD_V0_PROP_PHYSICS.restitution;
      b3.b3CreateBoxShape(
        body,
        shape,
        WORLD_V0_PROP_PHYSICS.halfExtents[0],
        WORLD_V0_PROP_PHYSICS.halfExtents[1],
        WORLD_V0_PROP_PHYSICS.halfExtents[2],
      );
      this.props.set(prop.id, body);
    }
  }

  addActor(actorId: `actor:${number}`, actorSessionId: string): void {
    if (this.actors.has(actorId)) throw new Error(`physics replication actor ${actorId} already exists`);
    const ordinal = Number(actorId.slice("actor:".length));
    const start = ACTOR_STARTS[ordinal];
    if (!start) throw new Error(`missing physics replication actor start ${actorId}`);

    const def = b3.b3DefaultBodyDef();
    def.type = b3.b3BodyType.b3_dynamicBody;
    def.position = [...start];
    def.linearDamping = WORLD_V0_PLAYER_PHYSICS.linearDamping;
    def.angularDamping = WORLD_V0_PLAYER_PHYSICS.angularDamping;
    const body = b3.b3CreateBody(this.world, def);
    b3.b3Body_SetName(body, actorId);
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
    this.actors.set(actorId, { body, actorSessionId });
  }

  step(inputs: readonly FoundationReplicationPhysicsInput[]): void {
    const inputByActor = new Map(inputs.map((input) => [input.actorId, input]));
    if (inputByActor.size !== this.actors.size) throw new Error("physics replication input coverage mismatch");
    for (const [actorId, actor] of this.actors) {
      const input = inputByActor.get(actorId);
      if (!input) throw new Error(`physics replication input missing ${actorId}`);
      const velocity = [0, 0, 0];
      b3.b3Body_GetLinearVelocity(velocity, actor.body);
      const hasInput = Math.hypot(input.x, input.z) > 0.01;
      const [nextX, nextZ] = moveToward2(
        velocity[0],
        velocity[2],
        input.x * WORLD_V0_MOVEMENT.playerSpeed,
        input.z * WORLD_V0_MOVEMENT.playerSpeed,
        (hasInput ? WORLD_V0_MOVEMENT.playerAcceleration : WORLD_V0_MOVEMENT.playerDeceleration) * DT,
      );
      b3.b3Body_SetLinearVelocity(actor.body, [nextX, velocity[1], nextZ]);
    }
    b3.b3World_Step(this.world, DT, WORLD_V0_TIMING.substeps);
  }

  entityState(netEntityId: string): number[] {
    const actor = this.actors.get(netEntityId as `actor:${number}`);
    const body = actor?.body ?? this.props.get(netEntityId);
    if (!body) throw new Error(`physics replication state body missing ${netEntityId}`);
    return bodyValues(body);
  }

  captureGuard(topology: FoundationTopologySnapshot): FoundationStateGuard {
    return packFoundationStateGuard(topology, WORLD_V0_STATE_COMPONENTS, (netEntityId) => this.entityState(netEntityId));
  }

  captureSeed(worldEpoch: string, canonicalTick: number, topology: FoundationTopologySnapshot): FoundationReplicationPhysicsSeed {
    const recording = b3.b3CreateRecording(0);
    try {
      b3.b3World_StartRecording(this.world, recording);
      b3.b3World_StopRecording(this.world);
      const byteLength = b3.b3Recording_GetSize(recording);
      const bytes = b3.b3Recording_CopyData(recording);
      if (!(bytes instanceof Uint8Array) || bytes.byteLength !== byteLength || byteLength <= 0) {
        throw new Error("physics replication recording byte capture failed");
      }
      return {
        formatId: FOUNDATION_BOX3D_RECORDING_SEED_FORMAT,
        worldEpoch,
        canonicalTick,
        topologyRevision: topology.topologyRevision,
        topologyDigest: topology.topologyDigest,
        bodyNames: [...this.staticNames, ...topology.entityOrder],
        byteLength,
        fnv1a32: u32Hex(b3.b3Bytes_Fnv1a32(bytes)),
        bytesBase64: encodeBase64(bytes),
      };
    } finally {
      b3.b3DestroyRecording(recording);
    }
  }
}
