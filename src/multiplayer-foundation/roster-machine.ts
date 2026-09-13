export type FoundationActorId = `actor:${number}`;

export interface FoundationRosterConfig {
  worldEpoch: string;
  capacity: number;
}

export interface FoundationActorMembership {
  actorId: FoundationActorId;
  actorOrdinal: number;
  actorSessionId: string;
  joinedAtTick: number;
  retiredAtTick: number | null;
}

export interface FoundationRosterActorView extends FoundationActorMembership {
  transportConnected: boolean;
}

export type FoundationRosterMutation =
  | {
      kind: "join";
      mutationId: string;
      effectiveTick: number;
      actorSessionId: string;
    }
  | {
      kind: "retire";
      mutationId: string;
      effectiveTick: number;
      actorId: FoundationActorId;
    };

export type FoundationMutationOutcome =
  | {
      status: "joined";
      mutationId: string;
      effectiveTick: number;
      actorId: FoundationActorId;
      actorSessionId: string;
    }
  | {
      status: "retired";
      mutationId: string;
      effectiveTick: number;
      actorId: FoundationActorId;
      actorSessionId: string;
    }
  | {
      status: "rejected_capacity" | "rejected_duplicate_session";
      mutationId: string;
      effectiveTick: number;
      actorSessionId: string;
    }
  | {
      status: "rejected_unknown_actor" | "rejected_already_retired";
      mutationId: string;
      effectiveTick: number;
      actorId: FoundationActorId;
    };

export interface FoundationRosterSnapshot {
  worldEpoch: string;
  currentTick: number;
  capacity: number;
  topologyRevision: number;
  topologyKey: string;
  nextActorOrdinal: number;
  actors: FoundationRosterActorView[];
}

function assertNonEmpty(value: string, label: string): void {
  if (value.length === 0) {
    throw new Error(`${label} must be non-empty`);
  }
}

function assertTick(tick: number, label: string): void {
  if (!Number.isSafeInteger(tick) || tick < 0) {
    throw new Error(`${label} must be a non-negative safe integer`);
  }
}

function actorIdForOrdinal(ordinal: number): FoundationActorId {
  return `actor:${ordinal}`;
}

function mutationSignature(mutation: FoundationRosterMutation): string {
  return JSON.stringify(mutation);
}

function mutationPhase(mutation: FoundationRosterMutation): number {
  // A retirement and a replacement join may share a canonical tick. Retirements
  // deterministically release capacity before joins compete for the freed slot.
  return mutation.kind === "retire" ? 0 : 1;
}

function compareMutations(a: FoundationRosterMutation, b: FoundationRosterMutation): number {
  return a.effectiveTick - b.effectiveTick
    || mutationPhase(a) - mutationPhase(b)
    || a.mutationId.localeCompare(b.mutationId);
}

export class FoundationRosterMachine {
  readonly worldEpoch: string;
  readonly capacity: number;

  private currentTickValue = 0;
  private topologyRevisionValue = 0;
  private nextActorOrdinalValue = 0;
  private readonly historyByActorId = new Map<FoundationActorId, FoundationActorMembership>();
  private readonly activeActorIds = new Set<FoundationActorId>();
  private readonly activeActorIdBySession = new Map<string, FoundationActorId>();
  private readonly transportConnectedBySession = new Map<string, boolean>();
  private readonly pendingByMutationId = new Map<string, FoundationRosterMutation>();
  private readonly knownMutationSignatureById = new Map<string, string>();
  private readonly outcomeByMutationId = new Map<string, FoundationMutationOutcome>();

  constructor(config: FoundationRosterConfig) {
    assertNonEmpty(config.worldEpoch, "worldEpoch");
    if (!Number.isSafeInteger(config.capacity) || config.capacity < 1) {
      throw new Error("capacity must be a positive safe integer");
    }
    this.worldEpoch = config.worldEpoch;
    this.capacity = config.capacity;
  }

  get currentTick(): number {
    return this.currentTickValue;
  }

  get topologyRevision(): number {
    return this.topologyRevisionValue;
  }

  get nextActorOrdinal(): number {
    return this.nextActorOrdinalValue;
  }

  queue(mutation: FoundationRosterMutation): "queued" | "idempotent" {
    assertNonEmpty(mutation.mutationId, "mutationId");
    assertTick(mutation.effectiveTick, "effectiveTick");
    if (mutation.effectiveTick <= this.currentTickValue) {
      throw new Error(`mutation ${mutation.mutationId} must target a future canonical tick`);
    }
    if (mutation.kind === "join") {
      assertNonEmpty(mutation.actorSessionId, "actorSessionId");
    }

    const signature = mutationSignature(mutation);
    const knownSignature = this.knownMutationSignatureById.get(mutation.mutationId);
    if (knownSignature !== undefined) {
      if (knownSignature !== signature) {
        throw new Error(`mutationId ${mutation.mutationId} was reused with different payload`);
      }
      return "idempotent";
    }

    this.knownMutationSignatureById.set(mutation.mutationId, signature);
    this.pendingByMutationId.set(mutation.mutationId, mutation);
    return "queued";
  }

  advanceTo(targetTick: number): FoundationMutationOutcome[] {
    assertTick(targetTick, "targetTick");
    if (targetTick < this.currentTickValue) {
      throw new Error("canonical time cannot move backwards");
    }

    const due = [...this.pendingByMutationId.values()]
      .filter((mutation) => mutation.effectiveTick <= targetTick)
      .sort(compareMutations);
    const outcomes: FoundationMutationOutcome[] = [];

    for (const mutation of due) {
      this.currentTickValue = mutation.effectiveTick;
      const outcome = this.applyMutation(mutation);
      this.pendingByMutationId.delete(mutation.mutationId);
      this.outcomeByMutationId.set(mutation.mutationId, outcome);
      outcomes.push(outcome);
    }

    this.currentTickValue = targetTick;
    return outcomes;
  }

  setTransportConnected(actorSessionId: string, connected: boolean): boolean {
    const actorId = this.activeActorIdBySession.get(actorSessionId);
    if (actorId === undefined || !this.activeActorIds.has(actorId)) {
      return false;
    }
    this.transportConnectedBySession.set(actorSessionId, connected);
    return true;
  }

  outcomeFor(mutationId: string): FoundationMutationOutcome | null {
    return this.outcomeByMutationId.get(mutationId) ?? null;
  }

  actorHistory(): FoundationActorMembership[] {
    return [...this.historyByActorId.values()]
      .sort((a, b) => a.actorOrdinal - b.actorOrdinal)
      .map((actor) => ({ ...actor }));
  }

  snapshot(): FoundationRosterSnapshot {
    const actors = [...this.activeActorIds]
      .map((actorId) => this.historyByActorId.get(actorId))
      .filter((actor): actor is FoundationActorMembership => actor !== undefined)
      .sort((a, b) => a.actorOrdinal - b.actorOrdinal)
      .map((actor) => ({
        ...actor,
        transportConnected: this.transportConnectedBySession.get(actor.actorSessionId) ?? false,
      }));

    return {
      worldEpoch: this.worldEpoch,
      currentTick: this.currentTickValue,
      capacity: this.capacity,
      topologyRevision: this.topologyRevisionValue,
      topologyKey: actors.map((actor) => actor.actorId).join(","),
      nextActorOrdinal: this.nextActorOrdinalValue,
      actors,
    };
  }

  canonicalStateForReplay(): object {
    return {
      worldEpoch: this.worldEpoch,
      currentTick: this.currentTickValue,
      capacity: this.capacity,
      topologyRevision: this.topologyRevisionValue,
      nextActorOrdinal: this.nextActorOrdinalValue,
      activeActorIds: this.snapshot().actors.map((actor) => actor.actorId),
      actorHistory: this.actorHistory(),
      outcomes: [...this.outcomeByMutationId.entries()]
        .sort(([a], [b]) => a.localeCompare(b)),
    };
  }

  private applyMutation(mutation: FoundationRosterMutation): FoundationMutationOutcome {
    if (mutation.kind === "join") {
      if (this.activeActorIdBySession.has(mutation.actorSessionId)) {
        return {
          status: "rejected_duplicate_session",
          mutationId: mutation.mutationId,
          effectiveTick: mutation.effectiveTick,
          actorSessionId: mutation.actorSessionId,
        };
      }
      if (this.activeActorIds.size >= this.capacity) {
        return {
          status: "rejected_capacity",
          mutationId: mutation.mutationId,
          effectiveTick: mutation.effectiveTick,
          actorSessionId: mutation.actorSessionId,
        };
      }

      const actorOrdinal = this.nextActorOrdinalValue;
      this.nextActorOrdinalValue += 1;
      const actorId = actorIdForOrdinal(actorOrdinal);
      const membership: FoundationActorMembership = {
        actorId,
        actorOrdinal,
        actorSessionId: mutation.actorSessionId,
        joinedAtTick: mutation.effectiveTick,
        retiredAtTick: null,
      };
      this.historyByActorId.set(actorId, membership);
      this.activeActorIds.add(actorId);
      this.activeActorIdBySession.set(mutation.actorSessionId, actorId);
      this.transportConnectedBySession.set(mutation.actorSessionId, true);
      this.topologyRevisionValue += 1;
      return {
        status: "joined",
        mutationId: mutation.mutationId,
        effectiveTick: mutation.effectiveTick,
        actorId,
        actorSessionId: mutation.actorSessionId,
      };
    }

    const membership = this.historyByActorId.get(mutation.actorId);
    if (membership === undefined) {
      return {
        status: "rejected_unknown_actor",
        mutationId: mutation.mutationId,
        effectiveTick: mutation.effectiveTick,
        actorId: mutation.actorId,
      };
    }
    if (!this.activeActorIds.has(mutation.actorId) || membership.retiredAtTick !== null) {
      return {
        status: "rejected_already_retired",
        mutationId: mutation.mutationId,
        effectiveTick: mutation.effectiveTick,
        actorId: mutation.actorId,
      };
    }

    const retiredMembership: FoundationActorMembership = {
      ...membership,
      retiredAtTick: mutation.effectiveTick,
    };
    this.historyByActorId.set(mutation.actorId, retiredMembership);
    this.activeActorIds.delete(mutation.actorId);
    this.activeActorIdBySession.delete(membership.actorSessionId);
    this.transportConnectedBySession.delete(membership.actorSessionId);
    this.topologyRevisionValue += 1;
    return {
      status: "retired",
      mutationId: mutation.mutationId,
      effectiveTick: mutation.effectiveTick,
      actorId: mutation.actorId,
      actorSessionId: membership.actorSessionId,
    };
  }
}
