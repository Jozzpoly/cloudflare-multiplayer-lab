import {
  foundationCheckpointDigest,
} from "./checkpoint-digest.ts";
import {
  hydrateFoundationClientBootstrap,
  type FoundationClientBootstrapEnvelope,
  type FoundationClientBootstrapExpectation,
  type FoundationHydratedClientBootstrap,
} from "./client-bootstrap.ts";

export const FOUNDATION_CLIENT_RUNTIME_BOOTSTRAP_REVISION = "multiplayer-foundation-client-runtime-bootstrap-v1";
export const FOUNDATION_BOX3D_RECORDING_SEED_FORMAT = "box3d-recording-bytes-v1";

export interface FoundationClientExecutionSeed {
  formatId: string;
  worldEpoch: string;
  canonicalTick: number;
  topologyRevision: number;
  topologyDigest: string;
  bodyNames: string[];
  byteLength: number;
  fnv1a32: string;
  bytesBase64: string;
}

export interface FoundationClientRuntimeBootstrapEnvelope {
  revision: typeof FOUNDATION_CLIENT_RUNTIME_BOOTSTRAP_REVISION;
  bootstrap: FoundationClientBootstrapEnvelope;
  executionSeed: FoundationClientExecutionSeed;
  envelopeDigest: string;
}

export interface FoundationClientRuntimeBootstrapInput {
  bootstrap: FoundationClientBootstrapEnvelope;
  executionSeed: FoundationClientExecutionSeed;
}

export interface FoundationHydratedClientRuntimeBootstrap extends FoundationHydratedClientBootstrap {
  runtimeEnvelope: FoundationClientRuntimeBootstrapEnvelope;
  executionSeedBytes: Uint8Array;
  executionSeedBodyNames: string[];
}

function assertNonEmpty(value: string, label: string): void {
  if (value.length === 0) throw new Error(`${label} must be non-empty`);
}

function assertTick(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer`);
  }
}

function assertU32Hex(value: string, label: string): void {
  if (!/^[0-9a-f]{8}$/.test(value)) throw new Error(`${label} must be canonical lowercase u32 hex`);
}

function decodeBase64Canonical(text: string): Uint8Array {
  assertNonEmpty(text, "execution seed bytesBase64");
  let binary: string;
  try {
    binary = atob(text);
  } catch {
    throw new Error("execution seed bytesBase64 is invalid base64");
  }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);

  let canonical = "";
  for (let index = 0; index < bytes.length; index += 1) canonical += String.fromCharCode(bytes[index]);
  if (btoa(canonical) !== text) throw new Error("execution seed bytesBase64 is not canonical base64");
  return bytes;
}

function fnv1a32(bytes: Uint8Array): string {
  let hash = 0x811c9dc5 >>> 0;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function cloneSeed(seed: FoundationClientExecutionSeed): FoundationClientExecutionSeed {
  return {
    ...seed,
    bodyNames: [...seed.bodyNames],
  };
}

function cloneRuntimeEnvelope(
  envelope: FoundationClientRuntimeBootstrapEnvelope,
): FoundationClientRuntimeBootstrapEnvelope {
  return JSON.parse(JSON.stringify(envelope)) as FoundationClientRuntimeBootstrapEnvelope;
}

function runtimeEnvelopeDigestBase(
  envelope: Omit<FoundationClientRuntimeBootstrapEnvelope, "envelopeDigest">,
): object {
  return {
    revision: envelope.revision,
    bootstrap: envelope.bootstrap,
    executionSeed: envelope.executionSeed,
  };
}

function validateExecutionSeedBinding(
  bootstrap: FoundationClientBootstrapEnvelope,
  seed: FoundationClientExecutionSeed,
): Uint8Array {
  assertNonEmpty(seed.formatId, "execution seed formatId");
  assertNonEmpty(seed.worldEpoch, "execution seed worldEpoch");
  assertTick(seed.canonicalTick, "execution seed canonicalTick");
  assertTick(seed.topologyRevision, "execution seed topologyRevision");
  assertNonEmpty(seed.topologyDigest, "execution seed topologyDigest");
  if (!Number.isSafeInteger(seed.byteLength) || seed.byteLength <= 0) {
    throw new Error("execution seed byteLength must be a positive safe integer");
  }
  assertU32Hex(seed.fnv1a32, "execution seed fnv1a32");

  if (seed.worldEpoch !== bootstrap.worldEpoch) {
    throw new Error("execution seed WorldEpoch does not match semantic bootstrap");
  }
  if (seed.canonicalTick !== bootstrap.canonicalTick) {
    throw new Error("execution seed canonical boundary does not match semantic bootstrap");
  }
  if (seed.topologyRevision !== bootstrap.topology.topologyRevision) {
    throw new Error("execution seed topology revision does not match semantic bootstrap");
  }
  if (seed.topologyDigest !== bootstrap.topology.topologyDigest) {
    throw new Error("execution seed topology digest does not match semantic bootstrap");
  }

  if (!Array.isArray(seed.bodyNames) || seed.bodyNames.length === 0) {
    throw new Error("execution seed body manifest must be non-empty");
  }
  const bodyNames = new Set<string>();
  for (const bodyName of seed.bodyNames) {
    assertNonEmpty(bodyName, "execution seed body name");
    if (bodyNames.has(bodyName)) throw new Error(`duplicate execution seed body name ${bodyName}`);
    bodyNames.add(bodyName);
  }
  for (const netEntityId of bootstrap.topology.entityOrder) {
    if (!bodyNames.has(netEntityId)) {
      throw new Error(`execution seed body manifest missing topology entity ${netEntityId}`);
    }
  }

  const bytes = decodeBase64Canonical(seed.bytesBase64);
  if (bytes.byteLength !== seed.byteLength) {
    throw new Error("execution seed byte length mismatch");
  }
  const checksum = fnv1a32(bytes);
  if (checksum !== seed.fnv1a32) {
    throw new Error(`execution seed checksum mismatch ${checksum} != ${seed.fnv1a32}`);
  }
  return bytes;
}

export function createFoundationClientRuntimeBootstrap(
  input: FoundationClientRuntimeBootstrapInput,
): FoundationClientRuntimeBootstrapEnvelope {
  const bootstrap = JSON.parse(JSON.stringify(input.bootstrap)) as FoundationClientBootstrapEnvelope;
  const executionSeed = cloneSeed(input.executionSeed);
  validateExecutionSeedBinding(bootstrap, executionSeed);

  const base: Omit<FoundationClientRuntimeBootstrapEnvelope, "envelopeDigest"> = {
    revision: FOUNDATION_CLIENT_RUNTIME_BOOTSTRAP_REVISION,
    bootstrap,
    executionSeed,
  };
  return {
    ...base,
    envelopeDigest: foundationCheckpointDigest(runtimeEnvelopeDigestBase(base)),
  };
}

export function hydrateFoundationClientRuntimeBootstrap(
  envelopeInput: FoundationClientRuntimeBootstrapEnvelope,
  expectedProfile: FoundationClientBootstrapExpectation,
  expectedSeedFormatId: string,
): FoundationHydratedClientRuntimeBootstrap {
  const runtimeEnvelope = cloneRuntimeEnvelope(envelopeInput);
  if (runtimeEnvelope.revision !== FOUNDATION_CLIENT_RUNTIME_BOOTSTRAP_REVISION) {
    throw new Error(`unsupported client runtime bootstrap revision ${String(runtimeEnvelope.revision)}`);
  }
  assertNonEmpty(expectedSeedFormatId, "expected execution seed formatId");
  if (runtimeEnvelope.executionSeed.formatId !== expectedSeedFormatId) {
    throw new Error("client runtime execution seed format mismatch");
  }

  const hydrated = hydrateFoundationClientBootstrap(runtimeEnvelope.bootstrap, expectedProfile);
  const executionSeedBytes = validateExecutionSeedBinding(
    hydrated.envelope,
    runtimeEnvelope.executionSeed,
  );

  const expectedDigest = foundationCheckpointDigest(runtimeEnvelopeDigestBase({
    revision: runtimeEnvelope.revision,
    bootstrap: runtimeEnvelope.bootstrap,
    executionSeed: runtimeEnvelope.executionSeed,
  }));
  if (expectedDigest !== runtimeEnvelope.envelopeDigest) {
    throw new Error("client runtime bootstrap envelope digest mismatch");
  }

  return {
    ...hydrated,
    runtimeEnvelope,
    executionSeedBytes,
    executionSeedBodyNames: [...runtimeEnvelope.executionSeed.bodyNames],
  };
}
