import type { FoundationRosterSnapshot } from "./roster-machine.ts";

export type FoundationNetEntityId = string;

export interface FoundationTopologyEntity {
  netEntityId: FoundationNetEntityId;
  kind: "actor" | "world";
  actorSessionId?: string;
  actorOrdinal?: number;
}

export interface FoundationTopologyIdentity {
  worldEpoch: string;
  topologyRevision: number;
  topologyDigest: string;
}

export interface FoundationTopologySnapshot extends FoundationTopologyIdentity {
  rosterRevision: number;
  entityOrder: FoundationNetEntityId[];
  entities: FoundationTopologyEntity[];
}

export interface FoundationEntityCoverage {
  exact: boolean;
  missing: FoundationNetEntityId[];
  unexpected: FoundationNetEntityId[];
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

function assertNetEntityId(id: string): void {
  if (id.length === 0) {
    throw new Error("NetEntityId must be non-empty");
  }
}

function canonicalTopologyPayload(
  worldEpoch: string,
  topologyRevision: number,
  entities: FoundationTopologyEntity[],
): string {
  return JSON.stringify({
    worldEpoch,
    topologyRevision,
    entities: entities.map((entity) => ({
      id: entity.netEntityId,
      kind: entity.kind,
      actorOrdinal: entity.actorOrdinal ?? null,
    })),
  });
}

function sameEntityTopology(a: FoundationTopologyEntity[], b: FoundationTopologyEntity[]): boolean {
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 1) {
    const left = a[index];
    const right = b[index];
    if (
      left.netEntityId !== right.netEntityId
      || left.kind !== right.kind
      || left.actorOrdinal !== right.actorOrdinal
    ) {
      return false;
    }
  }
  return true;
}

export function sameFoundationTopologyIdentity(
  a: FoundationTopologyIdentity,
  b: FoundationTopologyIdentity,
): boolean {
  return a.worldEpoch === b.worldEpoch
    && a.topologyRevision === b.topologyRevision
    && a.topologyDigest === b.topologyDigest;
}

export class FoundationEntityTopology {
  readonly worldEpoch: string;
  private readonly worldEntities: FoundationTopologyEntity[];
  private lastRosterRevision = 0;
  private lastEntities: FoundationTopologyEntity[];
  private lastSnapshotValue: FoundationTopologySnapshot;

  constructor(worldEpoch: string, persistentWorldEntityIds: readonly string[]) {
    if (worldEpoch.length === 0) {
      throw new Error("worldEpoch must be non-empty");
    }
    this.worldEpoch = worldEpoch;

    const seen = new Set<string>();
    this.worldEntities = persistentWorldEntityIds.map((netEntityId) => {
      assertNetEntityId(netEntityId);
      if (netEntityId.startsWith("actor:")) {
        throw new Error(`persistent world entity ${netEntityId} collides with reserved actor namespace`);
      }
      if (seen.has(netEntityId)) {
        throw new Error(`duplicate persistent world NetEntityId ${netEntityId}`);
      }
      seen.add(netEntityId);
      return { netEntityId, kind: "world" as const };
    });

    this.lastEntities = [...this.worldEntities];
    this.lastSnapshotValue = this.buildSnapshot(0, this.lastEntities);
  }

  syncRoster(roster: FoundationRosterSnapshot): FoundationTopologySnapshot {
    if (roster.worldEpoch !== this.worldEpoch) {
      throw new Error(`roster WorldEpoch ${roster.worldEpoch} does not match topology WorldEpoch ${this.worldEpoch}`);
    }
    if (roster.topologyRevision < this.lastRosterRevision) {
      throw new Error("roster topology revision cannot move backwards");
    }

    const actorEntities: FoundationTopologyEntity[] = roster.actors
      .map((actor) => ({
        netEntityId: actor.actorId,
        kind: "actor" as const,
        actorSessionId: actor.actorSessionId,
        actorOrdinal: actor.actorOrdinal,
      }))
      .sort((a, b) => a.actorOrdinal - b.actorOrdinal);

    const ids = new Set<string>();
    for (const entity of [...actorEntities, ...this.worldEntities]) {
      if (ids.has(entity.netEntityId)) {
        throw new Error(`duplicate topology NetEntityId ${entity.netEntityId}`);
      }
      ids.add(entity.netEntityId);
    }

    const nextEntities = [...actorEntities, ...this.worldEntities];
    if (roster.topologyRevision === this.lastRosterRevision && !sameEntityTopology(nextEntities, this.lastEntities)) {
      throw new Error("entity topology changed without a roster topology revision");
    }

    this.lastRosterRevision = roster.topologyRevision;
    this.lastEntities = nextEntities;
    this.lastSnapshotValue = this.buildSnapshot(roster.topologyRevision, nextEntities);
    return this.snapshot();
  }

  snapshot(): FoundationTopologySnapshot {
    return {
      ...this.lastSnapshotValue,
      entityOrder: [...this.lastSnapshotValue.entityOrder],
      entities: this.lastSnapshotValue.entities.map((entity) => ({ ...entity })),
    };
  }

  validateEntityCoverage(actualEntityIds: Iterable<string>): FoundationEntityCoverage {
    const expected = new Set(this.lastSnapshotValue.entityOrder);
    const actual = new Set(actualEntityIds);
    const missing = this.lastSnapshotValue.entityOrder.filter((id) => !actual.has(id));
    const unexpected = [...actual].filter((id) => !expected.has(id)).sort();
    return {
      exact: missing.length === 0 && unexpected.length === 0 && actual.size === expected.size,
      missing,
      unexpected,
    };
  }

  private buildSnapshot(
    topologyRevision: number,
    entities: FoundationTopologyEntity[],
  ): FoundationTopologySnapshot {
    const topologyDigest = fnv1a64(canonicalTopologyPayload(this.worldEpoch, topologyRevision, entities));
    return {
      worldEpoch: this.worldEpoch,
      topologyRevision,
      topologyDigest,
      rosterRevision: topologyRevision,
      entityOrder: entities.map((entity) => entity.netEntityId),
      entities: entities.map((entity) => ({ ...entity })),
    };
  }
}
