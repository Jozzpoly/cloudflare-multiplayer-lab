import { foundationCheckpointDigest } from "./checkpoint-digest.ts";

export type FoundationActorId = `actor:${number}`;

export const FOUNDATION_ROSTER_CHECKPOINT_REVISION = "multiplayer-foundation-roster-checkpoint-v1";

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

export interface FoundationRosterCheckpoint {
  revision: typeof FOUNDATION_ROSTER_CHECKPOINT_REVISION;
  worldEpoch: string;
  currentTick: number;
  capacity: number;
  topologyRevision: number;
  nextActorOrdinal: number;
  knownMutations: FoundationRosterMutation[];
  transportConnectedBySession: Array<{
    actorSessionId: string;
    connected: boolean;
  }>;
  stateDigest: string;
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

function assertActorId(actorId: string, label: string): asserts actorId is FoundationActorId {
  if (!/^actor:\d+$/.test(actorId)) {
    throw new Error(`${label} must be a canonical actor:<ordinal> id`);
  }
  const ordinal = Number(actorId.slice("actor:".length));
  if (!Number.isSafeInteger(ordinal) || ordinal < 0) {
    throw new Error(`${label} contains an invalid actor ordinal`);
  }
}

function actorIdForOrdinal(ordinal: number): FoundationActorId {
  return `actor:${ordinal}`;
}

function cloneMutation(mutation: FoundationRosterMutation): FoundationRosterMutation {
  return { ...mutation };
}

function mutationSignature(mutation: FoundationRosterMutation): string {
  return JSON.stringify(mutation);
}

function compareCanonicalStrings(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function mutationPhase(mutation: FoundationRosterMutation): number {
  // A retirement and a replacement join may share a canonical tick. Retirements
  // deterministically release capacity before joins compete for the freed slot.
  return mutation.kind === "retire" ? 0 : 1;
}

function compareMutations(a: FoundationRosterMutation, b: FoundationRosterMutation): number {
  return a.effectiveTick - b.effectiveTick
    || mutationPhase(a) - mutationPhase(b)
    || compareCanonicalStrings(a.mutationId, b.mutationId);
}

function assertMutationShape(mutation: FoundationRosterMutation): void {
  assertNonEmpty(mutation.mutationId, "mutationId");
  assertTick(mutation.effectiveTick, "effectiveTick");
  if (mutation.kind === "join") {
    assertNonEmpty(mutation.actorSessionId, "actorSessionId");
    return;
  }
  if (mutation.kind === "retire") {
    assertActorId(mutation.actorId, "actorId");
    return;
  }
  throw new Error("roster mutation kind is invalid");
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
  private readonly actorIdByEverUsedSession = new Map<string, FoundationActorId>();
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

  static fromCheckpoint(checkpoint: FoundationRosterCheckpoint): FoundationRosterMachine {
    if (checkpoint.revision !== FOUNDATION_ROSTER_CHECKPOINT_REVISION) {
      throw new Error(`unsupported roster checkpoint revision ${String(checkpoint.revision)}`);
    }
    assertNonEmpty(checkpoint.worldEpoch, "checkpoint worldEpoch");
    assertTick(checkpoint.currentTick, "checkpoint currentTick");
    assertTick(checkpoint.topologyRevision, "checkpoint topologyRevision");
    assertTick(checkpoint.nextActorOrdinal, "checkpoint nextActorOrdinal");
    if (!Number.isSafeInteger(checkpoint.capacity) || checkpoint.capacity < 1) {
      throw new Error("checkpoint capacity must be a positive safe integer");
    }
    if (!Array.isArray(checkpoint.knownMutations)) {
      throw new Error("checkpoint knownMutations must be an array");
    }
    if (!Array.isArray(checkpoint.transportConnectedBySession)) {
      throw new Error("checkpoint transportConnectedBySession must be an array");
    }
    assertNonEmpty(checkpoint.stateDigest, "checkpoint stateDigest");

    const restored = new FoundationRosterMachine({
      worldEpoch: checkpoint.worldEpoch,
      capacity: checkpoint.capacity,
    });

    for (const mutation of checkpoint.knownMutations) {
      assertMutationShape(mutation);
      restored.queue(cloneMutation(mutation));
    }
    restored.advanceTo(checkpoint.currentTick);

    const expectedSessions = new Map(
      restored.snapshot().actors.map((actor) => [actor.actorSessionId, actor] as const),
    );
    const seenTransportSessions = new Set<string>();
    for (const entry of checkpoint.transportConnectedBySession) {
      assertNonEmpty(entry.actorSessionId, "checkpoint transport actorSessionId");
      if (typeof entry.connected !== "boolean") {
        throw new Error("checkpoint transport connected must be boolean");
      }
      if (seenTransportSessions.has(entry.actorSessionId)) {
        throw new Error(`checkpoint transport session ${entry.actorSessionId} is duplicated`);
      }
      seenTransportSessions.add(entry.actorSessionId);
      if (!expectedSessions.has(entry.actorSessionId)) {
        throw new Error(`checkpoint transport session ${entry.actorSessionId} is not an active actor`);
      }
      const applied = restored.setTransportConnected(entry.actorSessionId, entry.connected);
      if (!applied) {
        throw new Error(`checkpoint transport session ${entry.actorSessionId} failed to restore`);
      }
    }
    if (seenTransportSessions.size !== expectedSessions.size) {
      throw new Error("checkpoint transport state does not cover every active ActorSession");
    }

    if (restored.topologyRevision !== checkpoint.topologyRevision) {
      throw new Error(
        `roster checkpoint topology revision mismatch: restored ${restored.topologyRevision}, expected ${checkpoint.topologyRevision}`,
      );
    }
    if (restored.nextActorOrdinal !== checkpoint.nextActorOrdinal) {
      throw new Error(
        `roster checkpoint next actor ordinal mismatch: restored ${restored.nextActorOrdinal}, expected ${checkpoint.nextActorOrdinal}`,
      );
    }

    const rebuilt = restored.checkpoint();
    if (rebuilt.stateDigest !== checkpoint.stateDigest) {
      throw new Error(
        `roster checkpoint digest mismatch: restored ${rebuilt.stateDigest}, expected ${checkpoint.stateDigest}`,
      );
    }
    return restored;
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
    assertMutationShape(mutation);

    const signature = mutationSignature(mutation);
    const knownSignature = this.knownMutationSignatureById.get(mutation.mutationId);
    if (knownSignature !== undefined) {
      if (knownSignature !== signature) {
        throw new Error(`mutationId ${mutation.mutationId} was reused with different payload`);
      }
      return "idempotent";
    }

    if (mutation.effectiveTick <= this.currentTickValue) {
      throw new Error(`mutation ${mutation.mutationId} must target a future canonical tick`);
    }

    this.knownMutationSignatureById.set(mutation.mutationId, signature);
    this.pendingByMutationId.set(mutation.mutationId, cloneMutation(mutation));
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

  checkpoint(): FoundationRosterCheckpoint {
    const knownMutations = [...this.knownMutationSignatureById.values()]
      .map((signature) => JSON.parse(signature) as FoundationRosterMutation)
      .sort(compareMutations)
      .map(cloneMutation);
    const transportConnectedBySession = this.snapshot().actors.map((actor) => ({
      actorSessionId: actor.actorSessionId,
      connected: actor.transportConnected,
    }));
    const checkpointBase = {
      revision: FOUNDATION_ROSTER_CHECKPOINT_REVISION,
      worldEpoch: this.worldEpoch,
      currentTick: this.currentTickValue,
      capacity: this.capacity,
      topologyRevision: this.topologyRevisionValue,
      nextActorOrdinal: this.nextActorOrdinalValue,
      knownMutations,
      transportConnectedBySession,
    } as const;

    return {
      ...checkpointBase,
      stateDigest: foundationCheckpointDigest({
        ...checkpointBase,
        canonicalState: this.canonicalStateForReplay(),
      }),
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
        .sort(([a], [b]) => compareCanonicalStrings(a, b)),
    };
  }

  private applyMutation(mutation: FoundationRosterMutation): FoundationMutationOutcome {
    if (mutation.kind === "join") {
      // ActorSession is the continuity identity of one logical actor inside a
      // WorldEpoch. Once that session has owned an actor, retirement is terminal:
      // a later fresh actor must receive a fresh ActorSession rather than silently
      // reincarnating the old continuity identity under a new actor ordinal.
      if (this.actorIdByEverUsedSession.has(mutation.actorSessionId)) {
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
      this.actorIdByEverUsedSession.set(mutation.actorSessionId, actorId);
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
