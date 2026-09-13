import assert from "node:assert/strict";
import {
  publishFoundationCheckpoint,
  recoverFoundationCheckpoint,
  type FoundationCheckpointStorage,
} from "../src/multiplayer-foundation/checkpoint-store.ts";

class SimulatedCrash extends Error {
  operation: number;

  constructor(operation: number) {
    super(`simulated crash before persistent mutation ${operation}`);
    this.operation = operation;
  }
}

function bytesEqual(left: Uint8Array | null, right: Uint8Array | null): boolean {
  if (left === null || right === null) return left === right;
  if (left.byteLength !== right.byteLength) return false;
  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function cloneBytes(bytes: Uint8Array | null): Uint8Array | null {
  return bytes ? bytes.slice() : null;
}

class MemoryCheckpointStorage implements FoundationCheckpointStorage {
  private immutable = new Map<string, Uint8Array>();
  private head: Uint8Array | null = null;
  private failBefore: number | null = null;
  persistentMutationCount = 0;

  clone(): MemoryCheckpointStorage {
    const next = new MemoryCheckpointStorage();
    next.immutable = new Map([...this.immutable.entries()].map(([key, bytes]) => [key, bytes.slice()]));
    next.head = cloneBytes(this.head);
    return next;
  }

  failBeforePersistentMutation(operation: number): void {
    assert(Number.isSafeInteger(operation) && operation > 0);
    this.failBefore = operation;
    this.persistentMutationCount = 0;
  }

  clearFailureInjection(): void {
    this.failBefore = null;
    this.persistentMutationCount = 0;
  }

  immutableEntryCount(): number {
    return this.immutable.size;
  }

  deleteImmutable(key: string): void {
    this.immutable.delete(key);
  }

  corruptImmutable(key: string): void {
    const current = this.immutable.get(key);
    assert(current && current.byteLength > 0);
    const damaged = current.slice();
    damaged[Math.floor(damaged.byteLength / 2)] ^= 0x5a;
    this.immutable.set(key, damaged);
  }

  corruptHeadJson(): void {
    assert(this.head && this.head.byteLength > 0);
    const damaged = this.head.slice();
    damaged[0] = 0x00;
    this.head = damaged;
  }

  rewriteHead(mutator: (value: Record<string, unknown>) => void): void {
    assert(this.head);
    const parsed = JSON.parse(new TextDecoder().decode(this.head)) as Record<string, unknown>;
    mutator(parsed);
    this.head = new TextEncoder().encode(JSON.stringify(parsed));
  }

  private beforePersistentMutation(): void {
    this.persistentMutationCount += 1;
    if (this.failBefore === this.persistentMutationCount) {
      throw new SimulatedCrash(this.persistentMutationCount);
    }
  }

  async readImmutable(key: string): Promise<Uint8Array | null> {
    return cloneBytes(this.immutable.get(key) ?? null);
  }

  async writeImmutable(key: string, bytes: Uint8Array): Promise<void> {
    this.beforePersistentMutation();
    const existing = this.immutable.get(key);
    if (existing) {
      if (!bytesEqual(existing, bytes)) throw new Error(`immutable overwrite mismatch for ${key}`);
      return;
    }
    this.immutable.set(key, bytes.slice());
  }

  async readHead(): Promise<Uint8Array | null> {
    return cloneBytes(this.head);
  }

  async compareAndSetHead(expected: Uint8Array | null, next: Uint8Array): Promise<boolean> {
    this.beforePersistentMutation();
    if (!bytesEqual(this.head, expected)) return false;
    this.head = next.slice();
    return true;
  }
}

function deterministicPayload(seed: number, byteLength: number): Uint8Array {
  assert(Number.isSafeInteger(seed));
  assert(Number.isSafeInteger(byteLength) && byteLength > 0);
  let state = seed >>> 0;
  const bytes = new Uint8Array(byteLength);
  for (let index = 0; index < byteLength; index += 1) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    bytes[index] = state & 0xff;
  }
  return bytes;
}

function assertPayloadEqual(actual: Uint8Array, expected: Uint8Array, label: string): void {
  assert.equal(actual.byteLength, expected.byteLength, `${label}: byte length`);
  assert(bytesEqual(actual, expected), `${label}: bytes`);
}

const CHUNK_BYTES = 32 * 1024;
const WORLD_EPOCH = "gate-4c-transactional-store-epoch";
const payload1 = deterministicPayload(0x11111111, 173_241);
const payload2 = deterministicPayload(0x22222222, 279_068);

const emptyStore = new MemoryCheckpointStorage();
assert.equal(await recoverFoundationCheckpoint(emptyStore), null);

await publishFoundationCheckpoint(emptyStore, {
  generation: 1,
  worldEpoch: WORLD_EPOCH,
  canonicalTick: 260,
  payload: payload1,
  chunkBytes: CHUNK_BYTES,
});
const generation1Store = emptyStore.clone();
const recovered1 = await recoverFoundationCheckpoint(generation1Store);
assert(recovered1);
assert.equal(recovered1.head.generation, 1);
assert.equal(recovered1.head.canonicalTick, 260);
assertPayloadEqual(recovered1.payload, payload1, "generation 1 recovery");

const successfulProbe = generation1Store.clone();
successfulProbe.clearFailureInjection();
await publishFoundationCheckpoint(successfulProbe, {
  generation: 2,
  worldEpoch: WORLD_EPOCH,
  canonicalTick: 300,
  payload: payload2,
  chunkBytes: CHUNK_BYTES,
});
const generation2PersistentMutations = successfulProbe.persistentMutationCount;
assert(generation2PersistentMutations > 2, "publication must exercise chunks + manifest + HEAD");
const successfulGeneration2 = successfulProbe.clone();
const recovered2 = await recoverFoundationCheckpoint(successfulGeneration2);
assert(recovered2);
assert.equal(recovered2.head.generation, 2);
assert.equal(recovered2.head.canonicalTick, 300);
assertPayloadEqual(recovered2.payload, payload2, "generation 2 recovery");

for (let failBefore = 1; failBefore <= generation2PersistentMutations; failBefore += 1) {
  const trial = generation1Store.clone();
  trial.failBeforePersistentMutation(failBefore);
  await assert.rejects(
    () => publishFoundationCheckpoint(trial, {
      generation: 2,
      worldEpoch: WORLD_EPOCH,
      canonicalTick: 300,
      payload: payload2,
      chunkBytes: CHUNK_BYTES,
    }),
    (error: unknown) => error instanceof SimulatedCrash && error.operation === failBefore,
    `publication must crash at injected mutation ${failBefore}`,
  );
  trial.clearFailureInjection();
  const recovered = await recoverFoundationCheckpoint(trial);
  assert(recovered, `generation 1 must remain recoverable after crash ${failBefore}`);
  assert.equal(recovered.head.generation, 1, `HEAD must remain generation 1 after crash ${failBefore}`);
  assertPayloadEqual(recovered.payload, payload1, `crash ${failBefore} recovery`);
}

const freshRuntimeStore = successfulGeneration2.clone();
const freshRuntimeRecovered = await recoverFoundationCheckpoint(freshRuntimeStore);
assert(freshRuntimeRecovered);
assert.equal(freshRuntimeRecovered.head.generation, 2);
assertPayloadEqual(freshRuntimeRecovered.payload, payload2, "fresh runtime generation 2");

const missingChunkStore = successfulGeneration2.clone();
const currentForMissing = await recoverFoundationCheckpoint(missingChunkStore);
assert(currentForMissing);
missingChunkStore.deleteImmutable(currentForMissing.manifest.chunks[1].key);
await assert.rejects(
  () => recoverFoundationCheckpoint(missingChunkStore),
  /published checkpoint chunk 1 is missing/,
);

const corruptChunkStore = successfulGeneration2.clone();
const currentForCorruption = await recoverFoundationCheckpoint(corruptChunkStore);
assert(currentForCorruption);
corruptChunkStore.corruptImmutable(currentForCorruption.manifest.chunks[2].key);
await assert.rejects(
  () => recoverFoundationCheckpoint(corruptChunkStore),
  /published checkpoint chunk 2 hash mismatch/,
);

const corruptManifestStore = successfulGeneration2.clone();
const currentForManifest = await recoverFoundationCheckpoint(corruptManifestStore);
assert(currentForManifest);
corruptManifestStore.corruptImmutable(currentForManifest.head.manifestKey);
await assert.rejects(
  () => recoverFoundationCheckpoint(corruptManifestStore),
  /published checkpoint manifest hash mismatch/,
);

const corruptHeadStore = successfulGeneration2.clone();
corruptHeadStore.corruptHeadJson();
await assert.rejects(
  () => recoverFoundationCheckpoint(corruptHeadStore),
  /checkpoint head is not valid JSON/,
);

const boundaryDriftStore = successfulGeneration2.clone();
boundaryDriftStore.rewriteHead((head) => {
  head.canonicalTick = 301;
});
await assert.rejects(
  () => recoverFoundationCheckpoint(boundaryDriftStore),
  /checkpoint HEAD and manifest boundary mismatch/,
);

await assert.rejects(
  () => publishFoundationCheckpoint(successfulGeneration2.clone(), {
    generation: 2,
    worldEpoch: WORLD_EPOCH,
    canonicalTick: 301,
    payload: payload2,
    chunkBytes: CHUNK_BYTES,
  }),
  /is not newer than 2/,
);
await assert.rejects(
  () => publishFoundationCheckpoint(successfulGeneration2.clone(), {
    generation: 1,
    worldEpoch: WORLD_EPOCH,
    canonicalTick: 200,
    payload: payload1,
    chunkBytes: CHUNK_BYTES,
  }),
  /is not newer than 2/,
);

const generation3Store = successfulGeneration2.clone();
const immutableBeforeGeneration3 = generation3Store.immutableEntryCount();
generation3Store.clearFailureInjection();
await publishFoundationCheckpoint(generation3Store, {
  generation: 3,
  worldEpoch: WORLD_EPOCH,
  canonicalTick: 340,
  payload: payload2,
  chunkBytes: CHUNK_BYTES,
});
assert.equal(generation3Store.persistentMutationCount, 2, "identical payload must reuse all content-addressed chunks");
assert.equal(generation3Store.immutableEntryCount(), immutableBeforeGeneration3 + 1, "only the new manifest should be added");
const recovered3 = await recoverFoundationCheckpoint(generation3Store);
assert(recovered3);
assert.equal(recovered3.head.generation, 3);
assert.equal(recovered3.head.canonicalTick, 340);
assertPayloadEqual(recovered3.payload, payload2, "generation 3 recovery");

const generation4Payload = deterministicPayload(0x44444444, 350_123);
const interruptedGeneration4 = generation3Store.clone();
interruptedGeneration4.failBeforePersistentMutation(4);
await assert.rejects(
  () => publishFoundationCheckpoint(interruptedGeneration4, {
    generation: 4,
    worldEpoch: WORLD_EPOCH,
    canonicalTick: 380,
    payload: generation4Payload,
    chunkBytes: CHUNK_BYTES,
  }),
  SimulatedCrash,
);
interruptedGeneration4.clearFailureInjection();
const afterGeneration4Crash = await recoverFoundationCheckpoint(interruptedGeneration4);
assert(afterGeneration4Crash);
assert.equal(afterGeneration4Crash.head.generation, 3);
assertPayloadEqual(afterGeneration4Crash.payload, payload2, "generation 3 after interrupted generation 4");

console.log(
  `MULTIPLAYER FOUNDATION CHECKPOINT STORE PASS · generation2PersistentMutations=${generation2PersistentMutations} · crash-faulted every pre-HEAD mutation · immutable chunk/manifest integrity fail-closed · stale generations rejected · identical chunks reused · interrupted N+1 preserved N`,
);
