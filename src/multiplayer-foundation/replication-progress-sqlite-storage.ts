import {
  decodeFoundationReplicationProgressOverlay,
  encodeFoundationReplicationProgressOverlay,
  validateFoundationReplicationProgressOverlay,
  type FoundationReplicationProgressOverlay,
} from "./replication-progress-overlay.ts";

const PROGRESS_TABLE = "foundation_replication_progress_overlay";

function copyBytes(value: ArrayBuffer | Uint8Array): Uint8Array {
  if (value instanceof Uint8Array) return value.slice();
  return new Uint8Array(value.slice(0));
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.slice().buffer as ArrayBuffer;
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

export type FoundationReplicationProgressWriteResult = {
  status: "stored" | "idempotent";
  baseCheckpointGeneration: number;
  progressSequence: number;
  byteLength: number;
};

export class FoundationReplicationProgressSqliteStorage {
  private readonly storage: DurableObjectStorage;
  private readonly sql: SqlStorage;

  constructor(storage: DurableObjectStorage) {
    this.storage = storage;
    this.sql = storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS ${PROGRESS_TABLE} (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        base_generation INTEGER NOT NULL,
        progress_sequence INTEGER NOT NULL,
        bytes BLOB NOT NULL
      )
    `);
  }

  private readRowSync(): { baseGeneration: number; progressSequence: number; bytes: Uint8Array } | null {
    const row = this.sql.exec<{
      base_generation: number;
      progress_sequence: number;
      bytes: ArrayBuffer;
    }>(
      `SELECT base_generation, progress_sequence, bytes FROM ${PROGRESS_TABLE} WHERE singleton = 1`,
    ).toArray()[0];
    if (!row) return null;
    if (!Number.isSafeInteger(row.base_generation) || row.base_generation < 1) {
      throw new Error("progress SQLite base generation is invalid");
    }
    if (!Number.isSafeInteger(row.progress_sequence) || row.progress_sequence < 1) {
      throw new Error("progress SQLite sequence is invalid");
    }
    return {
      baseGeneration: row.base_generation,
      progressSequence: row.progress_sequence,
      bytes: copyBytes(row.bytes),
    };
  }

  read(): FoundationReplicationProgressOverlay | null {
    const row = this.readRowSync();
    if (!row) return null;
    const overlay = decodeFoundationReplicationProgressOverlay(row.bytes);
    if (
      overlay.baseCheckpointGeneration !== row.baseGeneration
      || overlay.progressSequence !== row.progressSequence
    ) {
      throw new Error("progress SQLite metadata does not match overlay payload");
    }
    return overlay;
  }

  readForBase(baseCheckpointGeneration: number): FoundationReplicationProgressOverlay | null {
    if (!Number.isSafeInteger(baseCheckpointGeneration) || baseCheckpointGeneration < 1) {
      throw new Error("progress SQLite requested base generation must be a positive safe integer");
    }
    const overlay = this.read();
    if (!overlay) return null;
    if (overlay.baseCheckpointGeneration < baseCheckpointGeneration) return null;
    if (overlay.baseCheckpointGeneration > baseCheckpointGeneration) {
      throw new Error("progress SQLite overlay is newer than recovered base checkpoint");
    }
    return overlay;
  }

  write(overlay: FoundationReplicationProgressOverlay): FoundationReplicationProgressWriteResult {
    validateFoundationReplicationProgressOverlay(overlay);
    const nextBytes = encodeFoundationReplicationProgressOverlay(overlay);

    return this.storage.transactionSync(() => {
      const current = this.readRowSync();
      if (current) {
        const currentOverlay = decodeFoundationReplicationProgressOverlay(current.bytes);
        if (
          currentOverlay.baseCheckpointGeneration !== current.baseGeneration
          || currentOverlay.progressSequence !== current.progressSequence
        ) throw new Error("progress SQLite current metadata does not match payload");

        if (overlay.baseCheckpointGeneration < current.baseGeneration) {
          throw new Error("progress SQLite base generation cannot move backwards");
        }
        if (overlay.baseCheckpointGeneration === current.baseGeneration) {
          if (overlay.progressSequence === current.progressSequence) {
            if (!bytesEqual(current.bytes, nextBytes)) {
              throw new Error("progress SQLite conflicting retry for existing sequence");
            }
            return {
              status: "idempotent",
              baseCheckpointGeneration: current.baseGeneration,
              progressSequence: current.progressSequence,
              byteLength: current.bytes.byteLength,
            };
          }
          if (overlay.progressSequence !== current.progressSequence + 1) {
            throw new Error("progress SQLite sequence must advance exactly by one");
          }
        } else if (overlay.progressSequence !== 1) {
          throw new Error("progress SQLite new base generation must begin at sequence one");
        }

        this.sql.exec(
          `UPDATE ${PROGRESS_TABLE} SET base_generation = ?, progress_sequence = ?, bytes = ? WHERE singleton = 1`,
          overlay.baseCheckpointGeneration,
          overlay.progressSequence,
          toArrayBuffer(nextBytes),
        );
      } else {
        if (overlay.progressSequence !== 1) {
          throw new Error("progress SQLite first overlay must begin at sequence one");
        }
        this.sql.exec(
          `INSERT INTO ${PROGRESS_TABLE} (singleton, base_generation, progress_sequence, bytes) VALUES (1, ?, ?, ?)`,
          overlay.baseCheckpointGeneration,
          overlay.progressSequence,
          toArrayBuffer(nextBytes),
        );
      }

      const persisted = this.readRowSync();
      if (!persisted) throw new Error("progress SQLite write disappeared before verification");
      if (
        persisted.baseGeneration !== overlay.baseCheckpointGeneration
        || persisted.progressSequence !== overlay.progressSequence
        || !bytesEqual(persisted.bytes, nextBytes)
      ) throw new Error("progress SQLite read-after-write verification failed");
      decodeFoundationReplicationProgressOverlay(persisted.bytes);
      return {
        status: "stored",
        baseCheckpointGeneration: persisted.baseGeneration,
        progressSequence: persisted.progressSequence,
        byteLength: persisted.bytes.byteLength,
      };
    });
  }

  stats(): { rows: number; byteLength: number; databaseSize: number } {
    const row = this.readRowSync();
    return {
      rows: row ? 1 : 0,
      byteLength: row?.bytes.byteLength ?? 0,
      databaseSize: this.sql.databaseSize,
    };
  }
}
