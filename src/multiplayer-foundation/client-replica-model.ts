import type {
  FoundationTopologyEntity,
  FoundationTopologySnapshot,
} from "./entity-topology.ts";

export const FOUNDATION_CLIENT_REPLICA_MODEL_REVISION = "multiplayer-foundation-client-replica-v1";

export interface FoundationClientProjectionFrame {
  canonicalTick: number;
  topology: FoundationTopologySnapshot;
}

export interface FoundationClientActorReplica {
  netEntityId: string;
  actorSessionId: string;
  actorOrdinal: number;
  role: "self" | "remote";
}

export interface FoundationClientReplicaSnapshot {
  revision: typeof FOUNDATION_CLIENT_REPLICA_MODEL_REVISION;
  worldEpoch: string;
  canonicalTick: number;
  topologyRevision: number;
  topologyDigest: string;
  self: FoundationClientActorReplica;
  remotes: FoundationClientActorReplica[];
  worldEntityIds: string[];
  entityOrder: string[];
  projectionDigest: string;
}

export type FoundationClientProjectionStatus =
  | "bootstrapped"
  | "applied"
  | "refreshed"
  | "duplicate"
  | "stale"
  | "epoch_mismatch";

export interface FoundationClientProjectionResult {
  status: FoundationClientProjectionStatus;
  addedRemoteNetEntityIds: string[];
  removedRemoteNetEntityIds: string[];
  retainedRemoteNetEntityIds: string[];
  snapshot: FoundationClientReplicaSnapshot | null;
  observedWorldEpoch?: string;
}

interface ValidatedProjection {
  worldEpoch: string;
  canonicalTick: number;
  topologyRevision: number;
  topologyDigest: string;
  self: FoundationClientActorReplica;
  remotes: FoundationClientActorReplica[];
  worldEntityIds: string[];
  entityOrder: string[];
  bindingSignature: string;
}

function assertNonEmpty(value: string, label: string): void {
  if (value.length === 0) throw new Error(`${label} must be non-empty`);
}

function assertNonNegativeSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer`);
  }
}

function compareCanonicalStrings(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function fnv1a64(text: string): string {
  let hash = 0xcbf29ce484222325n;
  const mask = 0xffffffffffffffffn;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= BigInt(text.charCodeAt(index));
    hash = (hash * 0x100000001b3n) & mask;
  }
  return hash.toString(16).padStart(16, "0");
}

function actorBinding(entity: FoundationTopologyEntity): FoundationClientActorReplica {
  if (entity.kind !== "actor") throw new Error("actorBinding requires an actor entity");
  assertNonEmpty(entity.netEntityId, "actor NetEntityId");
  if (typeof entity.actorSessionId !== "string") {
    throw new Error(`actor ${entity.netEntityId} is missing ActorSession identity`);
  }
  assertNonEmpty(entity.actorSessionId, `actor ${entity.netEntityId} ActorSessionId`);
  if (entity.actorOrdinal === undefined) {
    throw new Error(`actor ${entity.netEntityId} is missing actor ordinal`);
  }
  assertNonNegativeSafeInteger(entity.actorOrdinal, `actor ${entity.netEntityId} ordinal`);
  return {
    netEntityId: entity.netEntityId,
    actorSessionId: entity.actorSessionId,
    actorOrdinal: entity.actorOrdinal,
    role: "remote",
  };
}

function bindingSignature(topology: FoundationTopologySnapshot): string {
  return JSON.stringify(topology.entities.map((entity) => ({
    netEntityId: entity.netEntityId,
    kind: entity.kind,
    actorSessionId: entity.actorSessionId ?? null,
    actorOrdinal: entity.actorOrdinal ?? null,
  })));
}

function validateProjectionFrame(
  frame: FoundationClientProjectionFrame,
  selfActorSessionId: string,
): ValidatedProjection {
  assertNonNegativeSafeInteger(frame.canonicalTick, "canonicalTick");
  const topology = frame.topology;
  assertNonEmpty(topology.worldEpoch, "topology worldEpoch");
  assertNonNegativeSafeInteger(topology.topologyRevision, "topologyRevision");
  assertNonNegativeSafeInteger(topology.rosterRevision, "rosterRevision");
  if (topology.rosterRevision !== topology.topologyRevision) {
    throw new Error("client projection requires rosterRevision to match topologyRevision");
  }
  assertNonEmpty(topology.topologyDigest, "topologyDigest");
  if (topology.entityOrder.length !== topology.entities.length) {
    throw new Error("topology entityOrder length does not match entities");
  }

  const netEntityIds = new Set<string>();
  const actorSessionIds = new Set<string>();
  const actorOrdinals = new Set<number>();
  const actors: FoundationClientActorReplica[] = [];
  const worldEntityIds: string[] = [];

  topology.entities.forEach((entity, index) => {
    assertNonEmpty(entity.netEntityId, `topology entity ${index} NetEntityId`);
    if (topology.entityOrder[index] !== entity.netEntityId) {
      throw new Error(`topology entityOrder mismatch at index ${index}`);
    }
    if (netEntityIds.has(entity.netEntityId)) {
      throw new Error(`duplicate topology NetEntityId ${entity.netEntityId}`);
    }
    netEntityIds.add(entity.netEntityId);

    if (entity.kind === "world") {
      if (entity.actorSessionId !== undefined || entity.actorOrdinal !== undefined) {
        throw new Error(`world entity ${entity.netEntityId} contains actor identity`);
      }
      worldEntityIds.push(entity.netEntityId);
      return;
    }
    if (entity.kind !== "actor") {
      throw new Error(`unsupported topology entity kind ${String(entity.kind)}`);
    }

    const actor = actorBinding(entity);
    if (actorSessionIds.has(actor.actorSessionId)) {
      throw new Error(`duplicate ActorSessionId ${actor.actorSessionId}`);
    }
    if (actorOrdinals.has(actor.actorOrdinal)) {
      throw new Error(`duplicate actor ordinal ${actor.actorOrdinal}`);
    }
    actorSessionIds.add(actor.actorSessionId);
    actorOrdinals.add(actor.actorOrdinal);
    actors.push(actor);
  });

  const selfMatches = actors.filter((actor) => actor.actorSessionId === selfActorSessionId);
  if (selfMatches.length !== 1) {
    throw new Error(`self ActorSession ${selfActorSessionId} must bind to exactly one active actor`);
  }
  const self: FoundationClientActorReplica = { ...selfMatches[0], role: "self" };
  const remotes = actors
    .filter((actor) => actor.actorSessionId !== selfActorSessionId)
    .map((actor) => ({ ...actor, role: "remote" as const }))
    .sort((a, b) => a.actorOrdinal - b.actorOrdinal || compareCanonicalStrings(a.netEntityId, b.netEntityId));

  return {
    worldEpoch: topology.worldEpoch,
    canonicalTick: frame.canonicalTick,
    topologyRevision: topology.topologyRevision,
    topologyDigest: topology.topologyDigest,
    self,
    remotes,
    worldEntityIds: [...worldEntityIds],
    entityOrder: [...topology.entityOrder],
    bindingSignature: bindingSignature(topology),
  };
}

function projectionDigest(value: Omit<FoundationClientReplicaSnapshot, "projectionDigest">): string {
  return fnv1a64(JSON.stringify({
    revision: value.revision,
    worldEpoch: value.worldEpoch,
    canonicalTick: value.canonicalTick,
    topologyRevision: value.topologyRevision,
    topologyDigest: value.topologyDigest,
    self: value.self,
    remotes: value.remotes,
    worldEntityIds: value.worldEntityIds,
    entityOrder: value.entityOrder,
  }));
}

function cloneReplica(actor: FoundationClientActorReplica): FoundationClientActorReplica {
  return { ...actor };
}

function remoteDiff(
  before: readonly FoundationClientActorReplica[],
  after: readonly FoundationClientActorReplica[],
): Pick<FoundationClientProjectionResult, "addedRemoteNetEntityIds" | "removedRemoteNetEntityIds" | "retainedRemoteNetEntityIds"> {
  const previous = new Set(before.map((actor) => actor.netEntityId));
  const next = new Set(after.map((actor) => actor.netEntityId));
  return {
    addedRemoteNetEntityIds: [...next].filter((id) => !previous.has(id)).sort(compareCanonicalStrings),
    removedRemoteNetEntityIds: [...previous].filter((id) => !next.has(id)).sort(compareCanonicalStrings),
    retainedRemoteNetEntityIds: [...next].filter((id) => previous.has(id)).sort(compareCanonicalStrings),
  };
}

export class FoundationClientReplicaModel {
  readonly selfActorSessionId: string;
  private current: FoundationClientReplicaSnapshot | null = null;
  private currentBindingSignature: string | null = null;

  constructor(selfActorSessionId: string) {
    assertNonEmpty(selfActorSessionId, "selfActorSessionId");
    this.selfActorSessionId = selfActorSessionId;
  }

  snapshot(): FoundationClientReplicaSnapshot | null {
    if (!this.current) return null;
    return {
      ...this.current,
      self: cloneReplica(this.current.self),
      remotes: this.current.remotes.map(cloneReplica),
      worldEntityIds: [...this.current.worldEntityIds],
      entityOrder: [...this.current.entityOrder],
    };
  }

  applyFullProjection(frame: FoundationClientProjectionFrame): FoundationClientProjectionResult {
    const validated = validateProjectionFrame(frame, this.selfActorSessionId);
    const before = this.current;

    if (!before) {
      this.install(validated);
      const snapshot = this.snapshot();
      return {
        status: "bootstrapped",
        addedRemoteNetEntityIds: validated.remotes.map((actor) => actor.netEntityId).sort(compareCanonicalStrings),
        removedRemoteNetEntityIds: [],
        retainedRemoteNetEntityIds: [],
        snapshot,
      };
    }

    if (validated.worldEpoch !== before.worldEpoch) {
      return {
        status: "epoch_mismatch",
        addedRemoteNetEntityIds: [],
        removedRemoteNetEntityIds: [],
        retainedRemoteNetEntityIds: before.remotes.map((actor) => actor.netEntityId).sort(compareCanonicalStrings),
        snapshot: this.snapshot(),
        observedWorldEpoch: validated.worldEpoch,
      };
    }

    if (validated.self.netEntityId !== before.self.netEntityId || validated.self.actorOrdinal !== before.self.actorOrdinal) {
      throw new Error("self actor identity drift inside one WorldEpoch");
    }

    if (validated.topologyRevision < before.topologyRevision) {
      return {
        status: "stale",
        addedRemoteNetEntityIds: [],
        removedRemoteNetEntityIds: [],
        retainedRemoteNetEntityIds: before.remotes.map((actor) => actor.netEntityId).sort(compareCanonicalStrings),
        snapshot: this.snapshot(),
      };
    }

    if (validated.topologyRevision === before.topologyRevision) {
      if (validated.topologyDigest !== before.topologyDigest) {
        throw new Error("topology digest changed without a topology revision");
      }
      if (validated.bindingSignature !== this.currentBindingSignature) {
        throw new Error("topology binding changed without a topology revision");
      }
      if (validated.canonicalTick < before.canonicalTick) {
        return {
          status: "stale",
          addedRemoteNetEntityIds: [],
          removedRemoteNetEntityIds: [],
          retainedRemoteNetEntityIds: before.remotes.map((actor) => actor.netEntityId).sort(compareCanonicalStrings),
          snapshot: this.snapshot(),
        };
      }
      if (validated.canonicalTick === before.canonicalTick) {
        return {
          status: "duplicate",
          addedRemoteNetEntityIds: [],
          removedRemoteNetEntityIds: [],
          retainedRemoteNetEntityIds: before.remotes.map((actor) => actor.netEntityId).sort(compareCanonicalStrings),
          snapshot: this.snapshot(),
        };
      }
      this.install(validated);
      return {
        status: "refreshed",
        addedRemoteNetEntityIds: [],
        removedRemoteNetEntityIds: [],
        retainedRemoteNetEntityIds: validated.remotes.map((actor) => actor.netEntityId).sort(compareCanonicalStrings),
        snapshot: this.snapshot(),
      };
    }

    if (validated.canonicalTick < before.canonicalTick) {
      throw new Error("newer topology revision cannot move the canonical boundary backwards");
    }

    const diff = remoteDiff(before.remotes, validated.remotes);
    this.install(validated);
    return {
      status: "applied",
      ...diff,
      snapshot: this.snapshot(),
    };
  }

  private install(validated: ValidatedProjection): void {
    const base: Omit<FoundationClientReplicaSnapshot, "projectionDigest"> = {
      revision: FOUNDATION_CLIENT_REPLICA_MODEL_REVISION,
      worldEpoch: validated.worldEpoch,
      canonicalTick: validated.canonicalTick,
      topologyRevision: validated.topologyRevision,
      topologyDigest: validated.topologyDigest,
      self: cloneReplica(validated.self),
      remotes: validated.remotes.map(cloneReplica),
      worldEntityIds: [...validated.worldEntityIds],
      entityOrder: [...validated.entityOrder],
    };
    this.current = {
      ...base,
      projectionDigest: projectionDigest(base),
    };
    this.currentBindingSignature = validated.bindingSignature;
  }
}
