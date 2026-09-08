import {
  WORLD_V0_CLIENT_SIM_REVISION,
  WORLD_V0_PROTOCOL_REVISION,
  WORLD_V0_SIM_BUILD_ID,
  WORLD_V0_TIMING,
} from "./world-v0-contract.ts";

export { WORLD_V0_PROTOCOL_REVISION };
export const WORLD_V0_INPUT_BATCH_SIZE = WORLD_V0_TIMING.inputBatchSize;
export const WORLD_V0_PREDICTION_LEAD_TICKS = WORLD_V0_TIMING.predictionLeadTicks;
export const WORLD_V0_MAX_FUTURE_TICKS = WORLD_V0_TIMING.maxFutureTicks;
export const WORLD_V0_INPUT_LEASE_MISSING_TICKS = WORLD_V0_TIMING.inputLeaseMissingTicks;

export type WorldV0Identity = {
  worldId: string;
  worldEpoch: string;
  simBuildId: string;
  clientSimRevision: string;
};

export type WorldV0InputValue = { x: number; z: number; jump?: boolean };
export type WorldV0InputRecord = WorldV0InputValue & { targetTick: number };
export type WorldV0InputBatch = WorldV0Identity & {
  type: "world_v0_input_batch";
  batchSeq: number;
  records: WorldV0InputRecord[];
};
export type WorldV0Ping = { type: "world_v0_ping"; id: string };
export type WorldV0Ready = WorldV0Identity & { type: "world_v0_ready" };
export type WorldV0ClientMessage = WorldV0InputBatch | WorldV0Ping | WorldV0Ready;

export type WorldV0RecordStatus =
  | "accepted"
  | "duplicate_same"
  | "late"
  | "before_start"
  | "too_future"
  | "superseded";

export type WorldV0RecordAcceptance = {
  targetTick: number;
  x: number;
  z: number;
  jump: boolean;
  status: WorldV0RecordStatus;
};

export type WorldV0BatchAcceptance = {
  batchSeq: number;
  batchStatus: "accepted_batch" | "stale_batch";
  records: WorldV0RecordAcceptance[];
};

export type WorldV0ConsumedInput = WorldV0InputValue & {
  targetTick: number;
  fresh: boolean;
  source: "fresh" | "held" | "lease_expired";
  missingStreak: number;
};

export type WorldV0InputBufferStats = {
  lastBatchSeq: number;
  pendingRecords: number;
  acceptedRecords: number;
  duplicateSameRecords: number;
  lateRecords: number;
  beforeStartRecords: number;
  tooFutureRecords: number;
  supersededRecords: number;
  staleBatches: number;
  consumedFresh: number;
  consumedMissing: number;
  leaseExpirations: number;
  currentMissingStreak: number;
};

const INPUT_EPS = 1e-9;
const ID_PATTERN = /^[A-Za-z0-9._|:=+-]{1,512}$/;

function isFiniteInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && Number.isInteger(value);
}

function isIdentityString(value: unknown): value is string {
  return typeof value === "string" && ID_PATTERN.test(value);
}

function parseIdentity(value: Record<string, unknown>): WorldV0Identity | null {
  if (!isIdentityString(value.worldId)) return null;
  if (!isIdentityString(value.worldEpoch)) return null;
  if (!isIdentityString(value.simBuildId)) return null;
  if (!isIdentityString(value.clientSimRevision)) return null;
  return {
    worldId: value.worldId,
    worldEpoch: value.worldEpoch,
    simBuildId: value.simBuildId,
    clientSimRevision: value.clientSimRevision,
  };
}

export function expectedWorldV0Identity(worldId: string, worldEpoch: string): WorldV0Identity {
  return {
    worldId,
    worldEpoch,
    simBuildId: WORLD_V0_SIM_BUILD_ID,
    clientSimRevision: WORLD_V0_CLIENT_SIM_REVISION,
  };
}

export function sameWorldV0Identity(a: WorldV0Identity, b: WorldV0Identity): boolean {
  return a.worldId === b.worldId &&
    a.worldEpoch === b.worldEpoch &&
    a.simBuildId === b.simBuildId &&
    a.clientSimRevision === b.clientSimRevision;
}

export function normalizeWorldV0Input(x: number, z: number, jump = false): WorldV0InputValue {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return { x: 0, z: 0, jump: Boolean(jump) };
  const length = Math.hypot(x, z);
  if (length <= 1) return { x, z, jump: Boolean(jump) };
  return { x: x / length, z: z / length, jump: Boolean(jump) };
}

export function sameWorldV0Input(a: WorldV0InputValue, b: WorldV0InputValue): boolean {
  return Math.abs(a.x - b.x) <= INPUT_EPS &&
    Math.abs(a.z - b.z) <= INPUT_EPS &&
    Boolean(a.jump) === Boolean(b.jump);
}

export function parseWorldV0ClientMessage(raw: string): WorldV0ClientMessage | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null || !("type" in value)) return null;
  const record = value as Record<string, unknown>;

  if (record.type === "world_v0_ping") {
    if (!("id" in record) || typeof record.id !== "string" || record.id.length === 0 || record.id.length > 80) return null;
    return { type: "world_v0_ping", id: record.id };
  }

  if (record.type === "world_v0_ready") {
    const identity = parseIdentity(record);
    return identity ? { type: "world_v0_ready", ...identity } : null;
  }

  if (record.type !== "world_v0_input_batch") return null;
  const identity = parseIdentity(record);
  if (!identity) return null;
  if (!isFiniteInteger(record.batchSeq) || record.batchSeq <= 0) return null;
  if (!Array.isArray(record.records)) return null;
  if (record.records.length < 1 || record.records.length > WORLD_V0_INPUT_BATCH_SIZE) return null;

  const records: WorldV0InputRecord[] = [];
  for (const rawRecord of record.records) {
    if (typeof rawRecord !== "object" || rawRecord === null) return null;
    const inputRecord = rawRecord as Record<string, unknown>;
    if (!isFiniteInteger(inputRecord.targetTick) || inputRecord.targetTick < 0) return null;
    if (typeof inputRecord.x !== "number" || typeof inputRecord.z !== "number") return null;
    if ("jump" in inputRecord && typeof inputRecord.jump !== "boolean") return null;
    const input = normalizeWorldV0Input(inputRecord.x, inputRecord.z, inputRecord.jump === true);
    records.push({ targetTick: inputRecord.targetTick, x: input.x, z: input.z, jump: Boolean(input.jump) });
  }

  for (let index = 1; index < records.length; index += 1) {
    if (records[index].targetTick !== records[index - 1].targetTick + 1) return null;
  }

  return { type: "world_v0_input_batch", ...identity, batchSeq: record.batchSeq, records };
}

export class WorldV0ScheduledInputBuffer {
  private readonly pending = new Map<number, WorldV0InputValue>();
  private consumed: WorldV0InputValue = { x: 0, z: 0, jump: false };
  private lastBatchSeq = 0;
  private acceptedRecords = 0;
  private duplicateSameRecords = 0;
  private lateRecords = 0;
  private beforeStartRecords = 0;
  private tooFutureRecords = 0;
  private supersededRecords = 0;
  private staleBatches = 0;
  private consumedFresh = 0;
  private consumedMissing = 0;
  private leaseExpirations = 0;
  private missingStreak = 0;

  acceptBatch(
    batch: WorldV0InputBatch,
    currentBoundaryTick: number,
    protocolStartTick: number,
    maxFutureTicks = WORLD_V0_MAX_FUTURE_TICKS,
  ): WorldV0BatchAcceptance {
    if (batch.batchSeq <= this.lastBatchSeq) {
      this.staleBatches += 1;
      return { batchSeq: batch.batchSeq, batchStatus: "stale_batch", records: [] };
    }
    this.lastBatchSeq = batch.batchSeq;

    const result: WorldV0RecordAcceptance[] = [];
    for (const record of batch.records) {
      let status: WorldV0RecordStatus;
      if (record.targetTick < protocolStartTick) {
        status = "before_start";
        this.beforeStartRecords += 1;
      } else if (record.targetTick < currentBoundaryTick) {
        status = "late";
        this.lateRecords += 1;
      } else if (record.targetTick > currentBoundaryTick + maxFutureTicks) {
        status = "too_future";
        this.tooFutureRecords += 1;
      } else {
        const existing = this.pending.get(record.targetTick);
        if (existing) {
          if (sameWorldV0Input(existing, { x: record.x, z: record.z, jump: Boolean(record.jump) })) {
            status = "duplicate_same";
            this.duplicateSameRecords += 1;
          } else {
            // I2: higher batchSeq is later authority for an unconsumed future tick.
            // Consumed history remains immutable because late is checked above.
            this.pending.set(record.targetTick, { x: record.x, z: record.z, jump: Boolean(record.jump) });
            status = "superseded";
            this.supersededRecords += 1;
          }
        } else {
          this.pending.set(record.targetTick, { x: record.x, z: record.z, jump: Boolean(record.jump) });
          status = "accepted";
          this.acceptedRecords += 1;
        }
      }
      result.push({ ...record, jump: Boolean(record.jump), status });
    }

    return { batchSeq: batch.batchSeq, batchStatus: "accepted_batch", records: result };
  }

  consume(
    targetTick: number,
    inputLeaseMissingTicks = WORLD_V0_INPUT_LEASE_MISSING_TICKS,
  ): WorldV0ConsumedInput {
    const pending = this.pending.get(targetTick);
    if (pending) {
      this.pending.delete(targetTick);
      this.consumed = { x: pending.x, z: pending.z, jump: false };
      this.missingStreak = 0;
      this.consumedFresh += 1;
      return { targetTick, x: pending.x, z: pending.z, jump: Boolean(pending.jump), fresh: true, source: "fresh", missingStreak: 0 };
    }

    this.consumedMissing += 1;
    this.missingStreak += 1;
    if (this.missingStreak >= inputLeaseMissingTicks) {
      if (this.missingStreak === inputLeaseMissingTicks) this.leaseExpirations += 1;
      this.consumed = { x: 0, z: 0, jump: false };
      return {
        targetTick,
        x: 0,
        z: 0,
        jump: false,
        fresh: false,
        source: "lease_expired",
        missingStreak: this.missingStreak,
      };
    }

    return {
      targetTick,
      x: this.consumed.x,
      z: this.consumed.z,
      jump: false,
      fresh: false,
      source: "held",
      missingStreak: this.missingStreak,
    };
  }

  stats(): WorldV0InputBufferStats {
    return {
      lastBatchSeq: this.lastBatchSeq,
      pendingRecords: this.pending.size,
      acceptedRecords: this.acceptedRecords,
      duplicateSameRecords: this.duplicateSameRecords,
      lateRecords: this.lateRecords,
      beforeStartRecords: this.beforeStartRecords,
      tooFutureRecords: this.tooFutureRecords,
      supersededRecords: this.supersededRecords,
      staleBatches: this.staleBatches,
      consumedFresh: this.consumedFresh,
      consumedMissing: this.consumedMissing,
      leaseExpirations: this.leaseExpirations,
      currentMissingStreak: this.missingStreak,
    };
  }
}
