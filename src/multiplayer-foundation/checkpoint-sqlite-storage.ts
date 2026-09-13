import type { FoundationCheckpointStorage } from "./checkpoint-store";

const IMMUTABLE_TABLE = "foundation_checkpoint_immutable";
const HEAD_TABLE = "foundation_checkpoint_head";

function copyBytes(value: ArrayBuffer | Uint8Array): Uint8Array {
  if (value instanceof Uint8Array) return value.slice();
  return new Uint8Array(value.slice(0));
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = bytes.slice();
  return copy.buffer as ArrayBuffer;
}

function bytesEqual(left: Uint8Array | null, right: Uint8Array | null): boolean {
  if (left === null || right === null) return left === right;
  if (left.byteLength !== right.byteLength) return false;
  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

export class FoundationCheckpointSqliteStorage implements FoundationCheckpointStorage {
  private readonly storage: DurableObjectStorage;
  private readonly sql: SqlStorage;

  constructor(storage: DurableObjectStorage) {
    this.storage = storage;
    this.sql = storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS ${IMMUTABLE_TABLE} (
        key TEXT PRIMARY KEY,
        bytes BLOB NOT NULL
      ) WITHOUT ROWID
    `);
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS ${HEAD_TABLE} (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        bytes BLOB NOT NULL
      )
    `);
  }

  private readImmutableSync(key: string): Uint8Array | null {
    const row = this.sql.exec<{ bytes: ArrayBuffer }>(
      `SELECT bytes FROM ${IMMUTABLE_TABLE} WHERE key = ?`,
      key,
    ).toArray()[0];
    return row ? copyBytes(row.bytes) : null;
  }

  private readHeadSync(): Uint8Array | null {
    const row = this.sql.exec<{ bytes: ArrayBuffer }>(
      `SELECT bytes FROM ${HEAD_TABLE} WHERE singleton = 1`,
    ).toArray()[0];
    return row ? copyBytes(row.bytes) : null;
  }

  async readImmutable(key: string): Promise<Uint8Array | null> {
    return this.readImmutableSync(key);
  }

  async writeImmutable(key: string, bytes: Uint8Array): Promise<void> {
    const current = this.readImmutableSync(key);
    if (current) {
      if (!bytesEqual(current, bytes)) {
        throw new Error(`immutable SQLite checkpoint key ${key} already contains different bytes`);
      }
      return;
    }

    this.sql.exec(
      `INSERT INTO ${IMMUTABLE_TABLE} (key, bytes) VALUES (?, ?)`,
      key,
      toArrayBuffer(bytes),
    );

    const persisted = this.readImmutableSync(key);
    if (!persisted || !bytesEqual(persisted, bytes)) {
      throw new Error(`immutable SQLite checkpoint key ${key} failed read-after-write verification`);
    }
  }

  async readHead(): Promise<Uint8Array | null> {
    return this.readHeadSync();
  }

  async compareAndSetHead(expected: Uint8Array | null, next: Uint8Array): Promise<boolean> {
    return this.storage.transactionSync(() => {
      const current = this.readHeadSync();
      if (!bytesEqual(current, expected)) return false;

      if (current === null) {
        this.sql.exec(
          `INSERT INTO ${HEAD_TABLE} (singleton, bytes) VALUES (1, ?)`,
          toArrayBuffer(next),
        );
      } else {
        this.sql.exec(
          `UPDATE ${HEAD_TABLE} SET bytes = ? WHERE singleton = 1`,
          toArrayBuffer(next),
        );
      }

      const persisted = this.readHeadSync();
      if (!persisted || !bytesEqual(persisted, next)) {
        throw new Error("SQLite checkpoint HEAD failed transactional read-after-write verification");
      }
      return true;
    });
  }

  stats(): { immutableRows: number; headRows: number; databaseSize: number } {
    const immutableRows = this.sql.exec<{ count: number }>(
      `SELECT COUNT(*) AS count FROM ${IMMUTABLE_TABLE}`,
    ).one().count;
    const headRows = this.sql.exec<{ count: number }>(
      `SELECT COUNT(*) AS count FROM ${HEAD_TABLE}`,
    ).one().count;
    return { immutableRows, headRows, databaseSize: this.sql.databaseSize };
  }
}
