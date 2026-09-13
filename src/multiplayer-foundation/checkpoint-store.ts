const STORE_REVISION = "multiplayer-foundation-checkpoint-store-v1" as const;
const MANIFEST_REVISION = "multiplayer-foundation-checkpoint-manifest-v1" as const;
const HEAD_REVISION = "multiplayer-foundation-checkpoint-head-v1" as const;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export type FoundationCheckpointStorage = {
  readImmutable(key: string): Promise<Uint8Array | null>;
  writeImmutable(key: string, bytes: Uint8Array): Promise<void>;
  readHead(): Promise<Uint8Array | null>;
  compareAndSetHead(expected: Uint8Array | null, next: Uint8Array): Promise<boolean>;
};

export type FoundationCheckpointPublishInput = {
  generation: number;
  worldEpoch: string;
  canonicalTick: number;
  payload: Uint8Array;
  chunkBytes: number;
};

export type FoundationCheckpointChunk = {
  index: number;
  key: string;
  byteLength: number;
  sha256: string;
};

export type FoundationCheckpointManifest = {
  revision: typeof MANIFEST_REVISION;
  generation: number;
  worldEpoch: string;
  canonicalTick: number;
  payloadByteLength: number;
  payloadSha256: string;
  chunkBytes: number;
  chunks: FoundationCheckpointChunk[];
};

export type FoundationCheckpointHead = {
  revision: typeof HEAD_REVISION;
  storeRevision: typeof STORE_REVISION;
  generation: number;
  worldEpoch: string;
  canonicalTick: number;
  manifestKey: string;
  manifestSha256: string;
};

export type FoundationCheckpointRecovered = {
  head: FoundationCheckpointHead;
  manifest: FoundationCheckpointManifest;
  payload: Uint8Array;
};

function assertSafeNonNegativeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer`);
  }
}

function assertBytesEqual(actual: Uint8Array, expected: Uint8Array, label: string): void {
  if (actual.byteLength !== expected.byteLength) {
    throw new Error(`${label} byte length mismatch`);
  }
  for (let index = 0; index < actual.byteLength; index += 1) {
    if (actual[index] !== expected[index]) {
      throw new Error(`${label} bytes differ at ${index}`);
    }
  }
}

function encodeJson(value: unknown): Uint8Array {
  return encoder.encode(JSON.stringify(value));
}

function parseJson<T>(bytes: Uint8Array, label: string): T {
  try {
    return JSON.parse(decoder.decode(bytes)) as T;
  } catch (error) {
    throw new Error(`${label} is not valid JSON`, { cause: error });
  }
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function chunkKey(sha: string): string {
  return `checkpoint/chunk/sha256/${sha}`;
}

function manifestKey(sha: string): string {
  return `checkpoint/manifest/sha256/${sha}`;
}

function validateHead(value: FoundationCheckpointHead): void {
  if (value.revision !== HEAD_REVISION || value.storeRevision !== STORE_REVISION) {
    throw new Error("checkpoint head revision mismatch");
  }
  assertSafeNonNegativeInteger(value.generation, "head.generation");
  assertSafeNonNegativeInteger(value.canonicalTick, "head.canonicalTick");
  if (!value.worldEpoch || !value.manifestKey || !/^[0-9a-f]{64}$/.test(value.manifestSha256)) {
    throw new Error("checkpoint head fields are invalid");
  }
}

function validateManifest(value: FoundationCheckpointManifest): void {
  if (value.revision !== MANIFEST_REVISION) {
    throw new Error("checkpoint manifest revision mismatch");
  }
  assertSafeNonNegativeInteger(value.generation, "manifest.generation");
  assertSafeNonNegativeInteger(value.canonicalTick, "manifest.canonicalTick");
  assertSafeNonNegativeInteger(value.payloadByteLength, "manifest.payloadByteLength");
  if (!Number.isSafeInteger(value.chunkBytes) || value.chunkBytes <= 0) {
    throw new Error("manifest.chunkBytes must be a positive safe integer");
  }
  if (!value.worldEpoch || !/^[0-9a-f]{64}$/.test(value.payloadSha256)) {
    throw new Error("checkpoint manifest fields are invalid");
  }
  if (!Array.isArray(value.chunks) || value.chunks.length === 0) {
    throw new Error("checkpoint manifest must contain chunks");
  }
  let total = 0;
  value.chunks.forEach((chunk, index) => {
    if (chunk.index !== index || !chunk.key || !/^[0-9a-f]{64}$/.test(chunk.sha256)) {
      throw new Error(`checkpoint chunk descriptor ${index} is invalid`);
    }
    if (!Number.isSafeInteger(chunk.byteLength) || chunk.byteLength <= 0 || chunk.byteLength > value.chunkBytes) {
      throw new Error(`checkpoint chunk descriptor ${index} has invalid byte length`);
    }
    if (chunk.key !== chunkKey(chunk.sha256)) {
      throw new Error(`checkpoint chunk descriptor ${index} key/hash mismatch`);
    }
    total += chunk.byteLength;
  });
  if (total !== value.payloadByteLength) {
    throw new Error("checkpoint manifest payload length does not match chunks");
  }
}

async function writeImmutableChecked(
  storage: FoundationCheckpointStorage,
  key: string,
  bytes: Uint8Array,
): Promise<void> {
  const existing = await storage.readImmutable(key);
  if (existing) {
    assertBytesEqual(existing, bytes, `immutable key ${key}`);
    return;
  }
  await storage.writeImmutable(key, bytes);
  const persisted = await storage.readImmutable(key);
  if (!persisted) {
    throw new Error(`immutable key ${key} missing after write`);
  }
  assertBytesEqual(persisted, bytes, `immutable key ${key}`);
}

export async function publishFoundationCheckpoint(
  storage: FoundationCheckpointStorage,
  input: FoundationCheckpointPublishInput,
): Promise<FoundationCheckpointHead> {
  assertSafeNonNegativeInteger(input.generation, "generation");
  assertSafeNonNegativeInteger(input.canonicalTick, "canonicalTick");
  if (!input.worldEpoch) throw new Error("worldEpoch must not be empty");
  if (!Number.isSafeInteger(input.chunkBytes) || input.chunkBytes <= 0) {
    throw new Error("chunkBytes must be a positive safe integer");
  }
  if (input.payload.byteLength <= 0) throw new Error("payload must not be empty");

  const expectedHeadBytes = await storage.readHead();
  if (expectedHeadBytes) {
    const currentHead = parseJson<FoundationCheckpointHead>(expectedHeadBytes, "checkpoint head");
    validateHead(currentHead);
    if (input.generation <= currentHead.generation) {
      throw new Error(`checkpoint generation ${input.generation} is not newer than ${currentHead.generation}`);
    }
  }

  const chunks: FoundationCheckpointChunk[] = [];
  for (let offset = 0, index = 0; offset < input.payload.byteLength; offset += input.chunkBytes, index += 1) {
    const bytes = input.payload.slice(offset, Math.min(offset + input.chunkBytes, input.payload.byteLength));
    const digest = await sha256(bytes);
    const key = chunkKey(digest);
    await writeImmutableChecked(storage, key, bytes);
    chunks.push({ index, key, byteLength: bytes.byteLength, sha256: digest });
  }

  const manifest: FoundationCheckpointManifest = {
    revision: MANIFEST_REVISION,
    generation: input.generation,
    worldEpoch: input.worldEpoch,
    canonicalTick: input.canonicalTick,
    payloadByteLength: input.payload.byteLength,
    payloadSha256: await sha256(input.payload),
    chunkBytes: input.chunkBytes,
    chunks,
  };
  validateManifest(manifest);

  const manifestBytes = encodeJson(manifest);
  const manifestSha256 = await sha256(manifestBytes);
  const manifestStorageKey = manifestKey(manifestSha256);
  await writeImmutableChecked(storage, manifestStorageKey, manifestBytes);

  const verifiedManifestBytes = await storage.readImmutable(manifestStorageKey);
  if (!verifiedManifestBytes || await sha256(verifiedManifestBytes) !== manifestSha256) {
    throw new Error("checkpoint manifest verification failed before HEAD publication");
  }

  const head: FoundationCheckpointHead = {
    revision: HEAD_REVISION,
    storeRevision: STORE_REVISION,
    generation: input.generation,
    worldEpoch: input.worldEpoch,
    canonicalTick: input.canonicalTick,
    manifestKey: manifestStorageKey,
    manifestSha256,
  };
  const headBytes = encodeJson(head);
  const published = await storage.compareAndSetHead(expectedHeadBytes, headBytes);
  if (!published) {
    throw new Error("checkpoint HEAD changed during publication");
  }
  return head;
}

export async function recoverFoundationCheckpoint(
  storage: FoundationCheckpointStorage,
): Promise<FoundationCheckpointRecovered | null> {
  const headBytes = await storage.readHead();
  if (!headBytes) return null;
  const head = parseJson<FoundationCheckpointHead>(headBytes, "checkpoint head");
  validateHead(head);

  const manifestBytes = await storage.readImmutable(head.manifestKey);
  if (!manifestBytes) throw new Error("published checkpoint manifest is missing");
  if (await sha256(manifestBytes) !== head.manifestSha256) {
    throw new Error("published checkpoint manifest hash mismatch");
  }
  if (head.manifestKey !== manifestKey(head.manifestSha256)) {
    throw new Error("published checkpoint manifest key/hash mismatch");
  }

  const manifest = parseJson<FoundationCheckpointManifest>(manifestBytes, "checkpoint manifest");
  validateManifest(manifest);
  if (
    manifest.generation !== head.generation
    || manifest.worldEpoch !== head.worldEpoch
    || manifest.canonicalTick !== head.canonicalTick
  ) {
    throw new Error("checkpoint HEAD and manifest boundary mismatch");
  }

  const payload = new Uint8Array(manifest.payloadByteLength);
  let offset = 0;
  for (const chunk of manifest.chunks) {
    const bytes = await storage.readImmutable(chunk.key);
    if (!bytes) throw new Error(`published checkpoint chunk ${chunk.index} is missing`);
    if (bytes.byteLength !== chunk.byteLength) {
      throw new Error(`published checkpoint chunk ${chunk.index} byte length mismatch`);
    }
    if (await sha256(bytes) !== chunk.sha256) {
      throw new Error(`published checkpoint chunk ${chunk.index} hash mismatch`);
    }
    payload.set(bytes, offset);
    offset += bytes.byteLength;
  }
  if (await sha256(payload) !== manifest.payloadSha256) {
    throw new Error("published checkpoint payload hash mismatch");
  }

  return { head, manifest, payload };
}
