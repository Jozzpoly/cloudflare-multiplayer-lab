import type { FoundationClientReplicaSnapshot } from "./client-replica-model.ts";

export const FOUNDATION_CLIENT_INPUT_LEDGER_REVISION = "multiplayer-foundation-client-input-ledger-v1";

export interface FoundationClientInputValue {
  x: number;
  z: number;
  jump: boolean;
}

export interface FoundationClientInputRecord extends FoundationClientInputValue {
  netEntityId: string;
  actorSessionId: string;
  targetTick: number;
}

export interface FoundationClientInputBaseline extends FoundationClientInputValue {
  netEntityId: string;
  actorSessionId: string;
}

export type FoundationClientPredictedInputSource = "local" | "peer";

export type FoundationClientInputRecordStatus =
  | "accepted"
  | "superseded"
  | "rejected_unknown_actor"
  | "rejected_identity_mismatch"
  | "rejected_wrong_source_role"
  | "rejected_late";

export interface FoundationClientInputRecordResult {
  status: FoundationClientInputRecordStatus;
  replayFromTick: number | null;
}

export interface FoundationResolvedActorInput extends FoundationClientInputValue {
  netEntityId: string;
  actorSessionId: string;
  actorOrdinal: number;
  role: "self" | "remote";
  source: "authority" | "predicted" | "hold" | "neutral";
  jumpTrigger: boolean;
}

export interface FoundationResolvedInputFrame {
  worldEpoch: string;
  topologyRevision: number;
  targetTick: number;
  actors: FoundationResolvedActorInput[];
}

type InputChannel = {
  netEntityId: string;
  actorSessionId: string;
  actorOrdinal: number;
  role: "self" | "remote";
  predictedByTick: Map<number, { value: FoundationClientInputValue; source: FoundationClientPredictedInputSource }>;
  authoritativeByTick: Map<number, FoundationClientInputValue>;
};

function assertTick(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} must be a non-negative safe integer`);
}

function assertNonEmpty(value: string, label: string): void {
  if (value.length === 0) throw new Error(`${label} must be non-empty`);
}

function normalizeInput(record: FoundationClientInputValue): FoundationClientInputValue {
  if (!Number.isFinite(record.x) || !Number.isFinite(record.z)) throw new Error("client input must be finite");
  const length = Math.hypot(record.x, record.z);
  const x = length > 1 && length >= 1e-12 ? record.x / length : record.x;
  const z = length > 1 && length >= 1e-12 ? record.z / length : record.z;
  return { x, z, jump: Boolean(record.jump) };
}

function sameInput(a: FoundationClientInputValue, b: FoundationClientInputValue): boolean {
  return Object.is(a.x, b.x) && Object.is(a.z, b.z) && a.jump === b.jump;
}

function sameResolvedFrame(a: FoundationResolvedInputFrame, b: FoundationResolvedInputFrame): boolean {
  if (a.worldEpoch !== b.worldEpoch || a.topologyRevision !== b.topologyRevision || a.targetTick !== b.targetTick) return false;
  if (a.actors.length !== b.actors.length) return false;
  for (let index = 0; index < a.actors.length; index += 1) {
    const left = a.actors[index];
    const right = b.actors[index];
    if (
      left.netEntityId !== right.netEntityId
      || left.actorSessionId !== right.actorSessionId
      || left.actorOrdinal !== right.actorOrdinal
      || left.role !== right.role
      || !Object.is(left.x, right.x)
      || !Object.is(left.z, right.z)
      || left.jump !== right.jump
      || left.jumpTrigger !== right.jumpTrigger
    ) return false;
  }
  return true;
}

function cloneFrame(frame: FoundationResolvedInputFrame): FoundationResolvedInputFrame {
  return { ...frame, actors: frame.actors.map((actor) => ({ ...actor })) };
}

function effectiveExactRecord(channel: InputChannel, tick: number): { value: FoundationClientInputValue; source: "authority" | "predicted" } | null {
  const authoritative = channel.authoritativeByTick.get(tick);
  if (authoritative) return { value: authoritative, source: "authority" };
  const predicted = channel.predictedByTick.get(tick);
  if (predicted) return { value: predicted.value, source: "predicted" };
  return null;
}

function latestMotionRecord(channel: InputChannel, tick: number): { value: FoundationClientInputValue; tick: number; source: "authority" | "predicted" } | null {
  let bestTick = -1;
  let best: { value: FoundationClientInputValue; tick: number; source: "authority" | "predicted" } | null = null;
  for (const [candidateTick, value] of channel.authoritativeByTick) {
    if (candidateTick <= tick && candidateTick >= bestTick) {
      bestTick = candidateTick;
      best = { value, tick: candidateTick, source: "authority" };
    }
  }
  for (const [candidateTick, predicted] of channel.predictedByTick) {
    if (candidateTick > tick || candidateTick < bestTick) continue;
    if (candidateTick === bestTick && best?.source === "authority") continue;
    bestTick = candidateTick;
    best = { value: predicted.value, tick: candidateTick, source: "predicted" };
  }
  return best;
}

export class FoundationClientInputLedger {
  readonly selfActorSessionId: string;
  private worldEpoch: string | null = null;
  private topologyRevision = 0;
  private canonicalBoundaryTick = 0;
  private readonly channelsBySession = new Map<string, InputChannel>();
  private readonly resolvedByTick = new Map<number, FoundationResolvedInputFrame>();

  constructor(selfActorSessionId: string) {
    assertNonEmpty(selfActorSessionId, "selfActorSessionId");
    this.selfActorSessionId = selfActorSessionId;
  }

  bootstrapProjection(snapshot: FoundationClientReplicaSnapshot, baselines: readonly FoundationClientInputBaseline[]): void {
    if (this.worldEpoch !== null) throw new Error("client input ledger is already bootstrapped");
    this.installFreshProjection(snapshot, baselines);
  }

  resyncProjection(snapshot: FoundationClientReplicaSnapshot, baselines: readonly FoundationClientInputBaseline[]): void {
    if (this.worldEpoch === null) throw new Error("client input ledger must bootstrap before resync");
    if (snapshot.worldEpoch !== this.worldEpoch) {
      throw new Error("client input ledger cannot resync across WorldEpoch without reconstruction");
    }
    const currentSelf = this.channelsBySession.get(this.selfActorSessionId);
    if (currentSelf && (snapshot.self.netEntityId !== currentSelf.netEntityId || snapshot.self.actorOrdinal !== currentSelf.actorOrdinal)) {
      throw new Error("client input ledger self identity drift during resync");
    }
    if (snapshot.canonicalTick < this.canonicalBoundaryTick) {
      throw new Error("client input ledger resync boundary cannot move backwards");
    }
    this.installFreshProjection(snapshot, baselines);
  }

  syncProjection(snapshot: FoundationClientReplicaSnapshot): void {
    if (this.worldEpoch === null) throw new Error("client input ledger must bootstrap before continuity sync");
    this.assertProjectionIdentity(snapshot);
    if (snapshot.topologyRevision < this.topologyRevision) {
      throw new Error("client input ledger topology revision cannot move backwards");
    }
    if (snapshot.canonicalTick < this.canonicalBoundaryTick) {
      throw new Error("client input ledger canonical boundary cannot move backwards");
    }

    const actors = [snapshot.self, ...snapshot.remotes];
    const activeSessions = new Set(actors.map((actor) => actor.actorSessionId));
    for (const sessionId of this.channelsBySession.keys()) {
      if (!activeSessions.has(sessionId)) this.channelsBySession.delete(sessionId);
    }

    for (const actor of actors) {
      const existing = this.channelsBySession.get(actor.actorSessionId);
      if (existing) {
        if (existing.netEntityId !== actor.netEntityId || existing.actorOrdinal !== actor.actorOrdinal || existing.role !== actor.role) {
          throw new Error(`client input ownership drift for ActorSession ${actor.actorSessionId}`);
        }
        continue;
      }
      const channel: InputChannel = {
        netEntityId: actor.netEntityId,
        actorSessionId: actor.actorSessionId,
        actorOrdinal: actor.actorOrdinal,
        role: actor.role,
        predictedByTick: new Map(),
        authoritativeByTick: new Map(),
      };
      channel.authoritativeByTick.set(snapshot.canonicalTick, { x: 0, z: 0, jump: false });
      this.channelsBySession.set(actor.actorSessionId, channel);
    }

    this.topologyRevision = snapshot.topologyRevision;
    this.canonicalBoundaryTick = snapshot.canonicalTick;
    this.resolvedByTick.clear();
  }

  recordPredicted(
    record: FoundationClientInputRecord,
    source: FoundationClientPredictedInputSource,
  ): FoundationClientInputRecordResult {
    return this.record(record, source, false);
  }

  recordAuthoritative(record: FoundationClientInputRecord): FoundationClientInputRecordResult {
    return this.record(record, "authority", true);
  }

  resolveTick(targetTick: number): FoundationResolvedInputFrame {
    assertTick(targetTick, "targetTick");
    if (this.worldEpoch === null) throw new Error("client input ledger has no topology projection");
    const cached = this.resolvedByTick.get(targetTick);
    if (cached) return cloneFrame(cached);

    const actors = [...this.channelsBySession.values()]
      .sort((a, b) => a.actorOrdinal - b.actorOrdinal)
      .map((channel): FoundationResolvedActorInput => {
        const exact = effectiveExactRecord(channel, targetTick);
        const motion = latestMotionRecord(channel, targetTick);
        const previousExact = targetTick > 0 ? effectiveExactRecord(channel, targetTick - 1) : null;
        const jump = exact?.value.jump ?? false;
        const jumpTrigger = jump && !(previousExact?.value.jump ?? false);
        const value = motion?.value ?? { x: 0, z: 0, jump: false };
        const source: FoundationResolvedActorInput["source"] = exact?.source ?? (motion ? "hold" : "neutral");
        return {
          netEntityId: channel.netEntityId,
          actorSessionId: channel.actorSessionId,
          actorOrdinal: channel.actorOrdinal,
          role: channel.role,
          x: value.x,
          z: value.z,
          jump,
          jumpTrigger,
          source,
        };
      });

    const frame: FoundationResolvedInputFrame = {
      worldEpoch: this.worldEpoch,
      topologyRevision: this.topologyRevision,
      targetTick,
      actors,
    };
    this.resolvedByTick.set(targetTick, frame);
    return cloneFrame(frame);
  }

  activeOwners(): Array<{ netEntityId: string; actorSessionId: string; actorOrdinal: number; role: "self" | "remote" }> {
    return [...this.channelsBySession.values()]
      .sort((a, b) => a.actorOrdinal - b.actorOrdinal)
      .map(({ netEntityId, actorSessionId, actorOrdinal, role }) => ({ netEntityId, actorSessionId, actorOrdinal, role }));
  }

  private assertProjectionIdentity(snapshot: FoundationClientReplicaSnapshot): void {
    if (snapshot.self.actorSessionId !== this.selfActorSessionId) {
      throw new Error("client input ledger projection self ActorSession mismatch");
    }
    if (this.worldEpoch !== null && snapshot.worldEpoch !== this.worldEpoch) {
      throw new Error("client input ledger cannot cross WorldEpoch without reconstruction");
    }
  }

  private installFreshProjection(snapshot: FoundationClientReplicaSnapshot, baselines: readonly FoundationClientInputBaseline[]): void {
    this.assertProjectionIdentity(snapshot);
    const actors = [snapshot.self, ...snapshot.remotes];
    if (baselines.length !== actors.length) {
      throw new Error("client input baseline must cover every active actor exactly once");
    }
    const baselineBySession = new Map<string, FoundationClientInputBaseline>();
    for (const baseline of baselines) {
      assertNonEmpty(baseline.netEntityId, "baseline NetEntityId");
      assertNonEmpty(baseline.actorSessionId, "baseline ActorSessionId");
      if (baselineBySession.has(baseline.actorSessionId)) {
        throw new Error(`duplicate client input baseline for ${baseline.actorSessionId}`);
      }
      baselineBySession.set(baseline.actorSessionId, baseline);
    }

    const channels = new Map<string, InputChannel>();
    for (const actor of actors) {
      const baseline = baselineBySession.get(actor.actorSessionId);
      if (!baseline) throw new Error(`missing client input baseline for ${actor.actorSessionId}`);
      if (baseline.netEntityId !== actor.netEntityId) {
        throw new Error(`client input baseline identity mismatch for ${actor.actorSessionId}`);
      }
      const channel: InputChannel = {
        netEntityId: actor.netEntityId,
        actorSessionId: actor.actorSessionId,
        actorOrdinal: actor.actorOrdinal,
        role: actor.role,
        predictedByTick: new Map(),
        authoritativeByTick: new Map(),
      };
      channel.authoritativeByTick.set(snapshot.canonicalTick, normalizeInput(baseline));
      channels.set(actor.actorSessionId, channel);
    }
    if (baselineBySession.size !== channels.size) {
      throw new Error("client input baseline contains an inactive ActorSession");
    }

    this.channelsBySession.clear();
    for (const [sessionId, channel] of channels) this.channelsBySession.set(sessionId, channel);
    this.worldEpoch = snapshot.worldEpoch;
    this.topologyRevision = snapshot.topologyRevision;
    this.canonicalBoundaryTick = snapshot.canonicalTick;
    this.resolvedByTick.clear();
  }

  private record(
    record: FoundationClientInputRecord,
    source: FoundationClientPredictedInputSource | "authority",
    authoritative: boolean,
  ): FoundationClientInputRecordResult {
    assertNonEmpty(record.netEntityId, "input NetEntityId");
    assertNonEmpty(record.actorSessionId, "input ActorSessionId");
    assertTick(record.targetTick, "input targetTick");
    const channel = this.channelsBySession.get(record.actorSessionId);
    if (!channel) return { status: "rejected_unknown_actor", replayFromTick: null };
    if (channel.netEntityId !== record.netEntityId) {
      return { status: "rejected_identity_mismatch", replayFromTick: null };
    }
    if (record.targetTick < this.canonicalBoundaryTick || (!authoritative && record.targetTick === this.canonicalBoundaryTick)) {
      return { status: "rejected_late", replayFromTick: null };
    }
    if (!authoritative) {
      if (source === "local" && channel.role !== "self") return { status: "rejected_wrong_source_role", replayFromTick: null };
      if (source === "peer" && channel.role !== "remote") return { status: "rejected_wrong_source_role", replayFromTick: null };
    }

    const normalized = normalizeInput(record);
    const previous = authoritative
      ? channel.authoritativeByTick.get(record.targetTick)
      : channel.predictedByTick.get(record.targetTick)?.value;
    const status: FoundationClientInputRecordStatus = previous ? "superseded" : "accepted";
    if (previous && sameInput(previous, normalized)) return { status: "superseded", replayFromTick: null };

    const cachedTicks = [...this.resolvedByTick.keys()].filter((tick) => tick >= record.targetTick).sort((a, b) => a - b);
    const before = new Map(cachedTicks.map((tick) => [tick, cloneFrame(this.resolvedByTick.get(tick)!)]));

    if (authoritative) channel.authoritativeByTick.set(record.targetTick, normalized);
    else channel.predictedByTick.set(record.targetTick, { value: normalized, source: source as FoundationClientPredictedInputSource });

    for (const tick of cachedTicks) this.resolvedByTick.delete(tick);
    let replayFromTick: number | null = null;
    for (const tick of cachedTicks) {
      const next = this.resolveTick(tick);
      const prior = before.get(tick)!;
      if (replayFromTick === null && !sameResolvedFrame(prior, next)) replayFromTick = tick;
    }
    return { status, replayFromTick };
  }
}
