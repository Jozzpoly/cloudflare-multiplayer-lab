export const F5_PROTOCOL_REVISION = "ws0-f5-scheduled-input-v1";
export const F5_INPUT_BATCH_SIZE = 2;
export const F5_PREDICTION_LEAD_TICKS = 8;
export const F5_MAX_FUTURE_TICKS = 32;

export type F5InputValue = { x: number; z: number };
export type F5InputRecord = F5InputValue & { targetTick: number };
export type F5InputBatch = {
  type: "f5_input_batch";
  batchSeq: number;
  records: F5InputRecord[];
};
export type F5Ping = { type: "f5_ping"; id: string };
export type F5Ready = { type: "f5_ready" };
export type F5ClientMessage = F5InputBatch | F5Ping | F5Ready;

export type F5RecordStatus =
  | "accepted"
  | "duplicate_same"
  | "late"
  | "before_start"
  | "too_future"
  | "conflict";

export type F5RecordAcceptance = {
  targetTick: number;
  x: number;
  z: number;
  status: F5RecordStatus;
};

export type F5BatchAcceptance = {
  batchSeq: number;
  batchStatus: "accepted_batch" | "stale_batch";
  records: F5RecordAcceptance[];
};

export type F5ConsumedInput = F5InputValue & {
  targetTick: number;
  fresh: boolean;
};

export type F5InputBufferStats = {
  lastBatchSeq: number;
  pendingRecords: number;
  acceptedRecords: number;
  duplicateSameRecords: number;
  lateRecords: number;
  beforeStartRecords: number;
  tooFutureRecords: number;
  conflictRecords: number;
  staleBatches: number;
  consumedFresh: number;
  consumedMissing: number;
};

const INPUT_EPS = 1e-9;

function isFiniteInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && Number.isInteger(value);
}

export function normalizeF5Input(x: number, z: number): F5InputValue {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return { x: 0, z: 0 };
  const length = Math.hypot(x, z);
  if (length <= 1) return { x, z };
  return { x: x / length, z: z / length };
}

export function sameF5Input(a: F5InputValue, b: F5InputValue): boolean {
  return Math.abs(a.x - b.x) <= INPUT_EPS && Math.abs(a.z - b.z) <= INPUT_EPS;
}

export function parseF5ClientMessage(raw: string): F5ClientMessage | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null || !("type" in value)) return null;

  if (value.type === "f5_ready") return { type: "f5_ready" };

  if (value.type === "f5_ping") {
    if (!("id" in value) || typeof value.id !== "string" || value.id.length === 0 || value.id.length > 80) return null;
    return { type: "f5_ping", id: value.id };
  }

  if (value.type !== "f5_input_batch") return null;
  if (!("batchSeq" in value) || !isFiniteInteger(value.batchSeq) || value.batchSeq <= 0) return null;
  if (!("records" in value) || !Array.isArray(value.records)) return null;
  if (value.records.length < 1 || value.records.length > F5_INPUT_BATCH_SIZE) return null;

  const records: F5InputRecord[] = [];
  for (const rawRecord of value.records) {
    if (typeof rawRecord !== "object" || rawRecord === null) return null;
    if (!("targetTick" in rawRecord) || !isFiniteInteger(rawRecord.targetTick) || rawRecord.targetTick < 0) return null;
    if (!("x" in rawRecord) || typeof rawRecord.x !== "number") return null;
    if (!("z" in rawRecord) || typeof rawRecord.z !== "number") return null;
    const input = normalizeF5Input(rawRecord.x, rawRecord.z);
    records.push({ targetTick: rawRecord.targetTick, x: input.x, z: input.z });
  }

  for (let index = 1; index < records.length; index += 1) {
    if (records[index].targetTick !== records[index - 1].targetTick + 1) return null;
  }

  return { type: "f5_input_batch", batchSeq: value.batchSeq, records };
}

export class F5ScheduledInputBuffer {
  private readonly pending = new Map<number, F5InputValue>();
  private consumed: F5InputValue = { x: 0, z: 0 };
  private lastBatchSeq = 0;
  private acceptedRecords = 0;
  private duplicateSameRecords = 0;
  private lateRecords = 0;
  private beforeStartRecords = 0;
  private tooFutureRecords = 0;
  private conflictRecords = 0;
  private staleBatches = 0;
  private consumedFresh = 0;
  private consumedMissing = 0;

  acceptBatch(
    batch: F5InputBatch,
    currentBoundaryTick: number,
    protocolStartTick: number,
    maxFutureTicks = F5_MAX_FUTURE_TICKS,
  ): F5BatchAcceptance {
    if (batch.batchSeq <= this.lastBatchSeq) {
      this.staleBatches += 1;
      return { batchSeq: batch.batchSeq, batchStatus: "stale_batch", records: [] };
    }
    this.lastBatchSeq = batch.batchSeq;

    const result: F5RecordAcceptance[] = [];
    for (const record of batch.records) {
      let status: F5RecordStatus;
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
          if (sameF5Input(existing, record)) {
            status = "duplicate_same";
            this.duplicateSameRecords += 1;
          } else {
            status = "conflict";
            this.conflictRecords += 1;
          }
        } else {
          this.pending.set(record.targetTick, { x: record.x, z: record.z });
          status = "accepted";
          this.acceptedRecords += 1;
        }
      }
      result.push({ ...record, status });
    }

    return { batchSeq: batch.batchSeq, batchStatus: "accepted_batch", records: result };
  }

  consume(targetTick: number): F5ConsumedInput {
    const pending = this.pending.get(targetTick);
    if (pending) {
      this.pending.delete(targetTick);
      this.consumed = pending;
      this.consumedFresh += 1;
      return { targetTick, x: pending.x, z: pending.z, fresh: true };
    }
    this.consumedMissing += 1;
    return { targetTick, x: this.consumed.x, z: this.consumed.z, fresh: false };
  }

  currentConsumed(): F5InputValue {
    return { ...this.consumed };
  }

  stats(): F5InputBufferStats {
    return {
      lastBatchSeq: this.lastBatchSeq,
      pendingRecords: this.pending.size,
      acceptedRecords: this.acceptedRecords,
      duplicateSameRecords: this.duplicateSameRecords,
      lateRecords: this.lateRecords,
      beforeStartRecords: this.beforeStartRecords,
      tooFutureRecords: this.tooFutureRecords,
      conflictRecords: this.conflictRecords,
      staleBatches: this.staleBatches,
      consumedFresh: this.consumedFresh,
      consumedMissing: this.consumedMissing,
    };
  }
}
