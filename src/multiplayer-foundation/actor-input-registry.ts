import type {
  FoundationActorId,
  FoundationRosterSnapshot,
} from "./roster-machine.ts";

export interface FoundationActorIntent {
  actorId: FoundationActorId;
  actorSessionId: string;
  targetTick: number;
  x: number;
  z: number;
}

export type FoundationInputAcceptance =
  | { status: "accepted" | "superseded"; actorId: FoundationActorId; targetTick: number }
  | { status: "rejected_unknown_actor"; actorId: FoundationActorId; targetTick: number }
  | { status: "rejected_owner_mismatch"; actorId: FoundationActorId; targetTick: number }
  | { status: "rejected_late" | "rejected_too_future"; actorId: FoundationActorId; targetTick: number };

export interface FoundationConsumedIntent {
  actorId: FoundationActorId;
  actorSessionId: string;
  targetTick: number;
  x: number;
  z: number;
  source: "scheduled" | "neutral";
}

type ActorInputChannel = {
  actorId: FoundationActorId;
  actorSessionId: string;
  pendingByTick: Map<number, { x: number; z: number }>;
};

function assertTick(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer`);
  }
}

function normalizeIntent(x: number, z: number): [number, number] {
  if (!Number.isFinite(x) || !Number.isFinite(z)) {
    throw new Error("actor input must be finite");
  }
  const length = Math.hypot(x, z);
  if (length <= 1 || length < 1e-12) return [x, z];
  return [x / length, z / length];
}

function sameOwnership(
  channels: Map<FoundationActorId, ActorInputChannel>,
  roster: FoundationRosterSnapshot,
): boolean {
  if (channels.size !== roster.actors.length) return false;
  for (const actor of roster.actors) {
    const channel = channels.get(actor.actorId);
    if (!channel || channel.actorSessionId !== actor.actorSessionId) return false;
  }
  return true;
}

export class FoundationActorInputRegistry {
  readonly worldEpoch: string;
  readonly maxFutureTicks: number;

  private rosterRevision = 0;
  private readonly channels = new Map<FoundationActorId, ActorInputChannel>();

  constructor(worldEpoch: string, maxFutureTicks: number) {
    if (worldEpoch.length === 0) throw new Error("worldEpoch must be non-empty");
    if (!Number.isSafeInteger(maxFutureTicks) || maxFutureTicks < 1) {
      throw new Error("maxFutureTicks must be a positive safe integer");
    }
    this.worldEpoch = worldEpoch;
    this.maxFutureTicks = maxFutureTicks;
  }

  syncRoster(roster: FoundationRosterSnapshot): void {
    if (roster.worldEpoch !== this.worldEpoch) {
      throw new Error(`roster WorldEpoch ${roster.worldEpoch} does not match input registry WorldEpoch ${this.worldEpoch}`);
    }
    if (roster.topologyRevision < this.rosterRevision) {
      throw new Error("input ownership roster revision cannot move backwards");
    }
    if (roster.topologyRevision === this.rosterRevision && !sameOwnership(this.channels, roster)) {
      throw new Error("input ownership changed without a roster topology revision");
    }

    const nextActorIds = new Set(roster.actors.map((actor) => actor.actorId));
    for (const actorId of this.channels.keys()) {
      if (!nextActorIds.has(actorId)) this.channels.delete(actorId);
    }

    for (const actor of roster.actors) {
      const existing = this.channels.get(actor.actorId);
      if (existing) {
        if (existing.actorSessionId !== actor.actorSessionId) {
          throw new Error(`actor ${actor.actorId} changed ActorSession ownership`);
        }
        continue;
      }
      this.channels.set(actor.actorId, {
        actorId: actor.actorId,
        actorSessionId: actor.actorSessionId,
        pendingByTick: new Map(),
      });
    }

    this.rosterRevision = roster.topologyRevision;
  }

  schedule(intent: FoundationActorIntent, boundaryTick: number): FoundationInputAcceptance {
    assertTick(intent.targetTick, "targetTick");
    assertTick(boundaryTick, "boundaryTick");
    const [x, z] = normalizeIntent(intent.x, intent.z);
    const channel = this.channels.get(intent.actorId);
    if (!channel) {
      return { status: "rejected_unknown_actor", actorId: intent.actorId, targetTick: intent.targetTick };
    }
    if (channel.actorSessionId !== intent.actorSessionId) {
      return { status: "rejected_owner_mismatch", actorId: intent.actorId, targetTick: intent.targetTick };
    }
    if (intent.targetTick < boundaryTick) {
      return { status: "rejected_late", actorId: intent.actorId, targetTick: intent.targetTick };
    }
    if (intent.targetTick > boundaryTick + this.maxFutureTicks) {
      return { status: "rejected_too_future", actorId: intent.actorId, targetTick: intent.targetTick };
    }

    const status = channel.pendingByTick.has(intent.targetTick) ? "superseded" : "accepted";
    channel.pendingByTick.set(intent.targetTick, { x, z });
    return { status, actorId: intent.actorId, targetTick: intent.targetTick };
  }

  consume(actorId: FoundationActorId, targetTick: number): FoundationConsumedIntent {
    assertTick(targetTick, "targetTick");
    const channel = this.channels.get(actorId);
    if (!channel) throw new Error(`cannot consume input for inactive actor ${actorId}`);
    const scheduled = channel.pendingByTick.get(targetTick);
    channel.pendingByTick.delete(targetTick);

    // Anything older than the tick being consumed is now irrecoverably late and
    // cannot be allowed to accumulate across a long-lived world.
    for (const pendingTick of channel.pendingByTick.keys()) {
      if (pendingTick < targetTick) channel.pendingByTick.delete(pendingTick);
    }

    return {
      actorId,
      actorSessionId: channel.actorSessionId,
      targetTick,
      x: scheduled?.x ?? 0,
      z: scheduled?.z ?? 0,
      source: scheduled ? "scheduled" : "neutral",
    };
  }

  activeOwnership(): Array<{ actorId: FoundationActorId; actorSessionId: string }> {
    return [...this.channels.values()]
      .sort((a, b) => Number(a.actorId.slice("actor:".length)) - Number(b.actorId.slice("actor:".length)))
      .map(({ actorId, actorSessionId }) => ({ actorId, actorSessionId }));
  }
}
