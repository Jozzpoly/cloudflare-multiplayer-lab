import { foundationCheckpointDigest } from "./checkpoint-digest.ts";
import {
  FOUNDATION_INPUT_CHECKPOINT_REVISION,
  type FoundationActorInputCheckpoint,
} from "./actor-input-registry.ts";
import {
  FOUNDATION_REPLICATION_PROTOCOL_REVISION,
} from "./replication-protocol.ts";
import type {
  FoundationReplicationLiveBindingState,
  FoundationReplicationLiveCheckpoint,
} from "./replication-live-checkpoint.ts";

export const FOUNDATION_REPLICATION_PROGRESS_OVERLAY_REVISION =
  "multiplayer-foundation-live-progress-overlay-v1";

export type FoundationReplicationProgressWorkerState = {
  syncSequence: number;
  syncsSent: number;
  correctionSyncs: number;
  resumeSyncs: number;
  inputCommitsSent: number;
  committedInputRecords: number;
  acceptedInputRecords: number;
  invalidMessages: number;
  staleReady: number;
  resumedSessions: string[];
  bindings: FoundationReplicationLiveBindingState[];
};

export type FoundationReplicationProgressOverlay = {
  revision: typeof FOUNDATION_REPLICATION_PROGRESS_OVERLAY_REVISION;
  protocolRevision: typeof FOUNDATION_REPLICATION_PROTOCOL_REVISION;
  worldId: string;
  worldEpoch: string;
  baseCheckpointGeneration: number;
  baseCanonicalTick: number;
  topologyRevision: number;
  topologyDigest: string;
  progressSequence: number;
  inputCheckpoint: FoundationActorInputCheckpoint;
  workerState: FoundationReplicationProgressWorkerState;
  stateDigest: string;
};

export type FoundationReplicationProgressOverlayInput = Omit<
  FoundationReplicationProgressOverlay,
  "revision" | "protocolRevision" | "stateDigest"
>;

const ACTOR_ID_PATTERN = /^actor:\d+$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertNonEmptyString(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} must be non-empty`);
}

function assertNonNegativeInteger(value: unknown, label: string): asserts value is number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer`);
  }
}

function assertPositiveInteger(value: unknown, label: string): asserts value is number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${label} must be a positive safe integer`);
  }
}

function assertActorId(value: unknown, label: string): asserts value is `actor:${number}` {
  if (typeof value !== "string" || !ACTOR_ID_PATTERN.test(value)) {
    throw new Error(`${label} must be actor:<ordinal>`);
  }
  const ordinal = Number(value.slice("actor:".length));
  if (!Number.isSafeInteger(ordinal) || ordinal < 0) throw new Error(`${label} has invalid actor ordinal`);
}

function validateBinding(value: unknown): asserts value is FoundationReplicationLiveBindingState {
  if (!isRecord(value)) throw new Error("progress overlay binding must be an object");
  assertNonEmptyString(value.actorSessionId, "progress overlay binding actorSessionId");
  assertActorId(value.actorId, "progress overlay binding actorId");
  assertNonNegativeInteger(value.lastTopologyRevision, "progress overlay binding lastTopologyRevision");
  assertNonEmptyString(value.expectedSyncId, "progress overlay binding expectedSyncId");
  assertNonEmptyString(value.expectedRuntimeDigest, "progress overlay binding expectedRuntimeDigest");
  if (value.readyTopologyRevision !== null) {
    assertNonNegativeInteger(value.readyTopologyRevision, "progress overlay binding readyTopologyRevision");
  }
  assertNonNegativeInteger(value.inputBatches, "progress overlay binding inputBatches");
}

function validateWorkerState(value: unknown): asserts value is FoundationReplicationProgressWorkerState {
  if (!isRecord(value)) throw new Error("progress overlay workerState must be an object");
  for (const field of [
    "syncSequence",
    "syncsSent",
    "correctionSyncs",
    "resumeSyncs",
    "inputCommitsSent",
    "invalidMessages",
    "staleReady",
  ] as const) {
    assertNonNegativeInteger(value[field], `progress overlay workerState.${field}`);
  }
  const committedInputRecords = value.committedInputRecords;
  const acceptedInputRecords = value.acceptedInputRecords;
  assertNonNegativeInteger(committedInputRecords, "progress overlay workerState.committedInputRecords");
  assertNonNegativeInteger(acceptedInputRecords, "progress overlay workerState.acceptedInputRecords");
  if (committedInputRecords > acceptedInputRecords) {
    throw new Error("progress overlay committed inputs cannot exceed accepted inputs");
  }
  if (!Array.isArray(value.resumedSessions)) throw new Error("progress overlay resumedSessions must be an array");
  const resumed = new Set<string>();
  for (const session of value.resumedSessions) {
    assertNonEmptyString(session, "progress overlay resumed session");
    if (resumed.has(session)) throw new Error(`progress overlay resumed session ${session} is duplicated`);
    resumed.add(session);
  }
  if (!Array.isArray(value.bindings)) throw new Error("progress overlay bindings must be an array");
  const sessions = new Set<string>();
  const actors = new Set<string>();
  for (const binding of value.bindings) {
    validateBinding(binding);
    if (sessions.has(binding.actorSessionId)) {
      throw new Error(`progress overlay binding duplicates session ${binding.actorSessionId}`);
    }
    if (actors.has(binding.actorId)) {
      throw new Error(`progress overlay binding duplicates actor ${binding.actorId}`);
    }
    sessions.add(binding.actorSessionId);
    actors.add(binding.actorId);
  }
}

function validateInputCheckpointShape(value: unknown): asserts value is FoundationActorInputCheckpoint {
  if (!isRecord(value)) throw new Error("progress overlay inputCheckpoint must be an object");
  if (value.revision !== FOUNDATION_INPUT_CHECKPOINT_REVISION) {
    throw new Error("progress overlay input checkpoint revision mismatch");
  }
  assertNonEmptyString(value.worldEpoch, "progress overlay input worldEpoch");
  assertPositiveInteger(value.maxFutureTicks, "progress overlay input maxFutureTicks");
  assertNonNegativeInteger(value.rosterRevision, "progress overlay input rosterRevision");
  assertNonNegativeInteger(value.boundaryTick, "progress overlay input boundaryTick");
  assertNonEmptyString(value.stateDigest, "progress overlay input stateDigest");
  if (!Array.isArray(value.channels)) throw new Error("progress overlay input channels must be an array");

  const actors = new Set<string>();
  const sessions = new Set<string>();
  for (const channel of value.channels) {
    if (!isRecord(channel)) throw new Error("progress overlay input channel must be an object");
    assertActorId(channel.actorId, "progress overlay input actorId");
    assertNonEmptyString(channel.actorSessionId, "progress overlay input actorSessionId");
    if (actors.has(channel.actorId)) throw new Error(`progress overlay input duplicates actor ${channel.actorId}`);
    if (sessions.has(channel.actorSessionId)) throw new Error(`progress overlay input duplicates session ${channel.actorSessionId}`);
    actors.add(channel.actorId);
    sessions.add(channel.actorSessionId);
    if (!Array.isArray(channel.pending)) throw new Error("progress overlay pending input must be an array");
    const ticks = new Set<number>();
    for (const pending of channel.pending) {
      if (!isRecord(pending)) throw new Error("progress overlay pending entry must be an object");
      assertNonNegativeInteger(pending.targetTick, "progress overlay pending targetTick");
      if (typeof pending.x !== "number" || !Number.isFinite(pending.x)) throw new Error("progress overlay pending x must be finite");
      if (typeof pending.z !== "number" || !Number.isFinite(pending.z)) throw new Error("progress overlay pending z must be finite");
      if (Math.hypot(pending.x, pending.z) > 1 + 1e-12) throw new Error("progress overlay pending input must be normalized");
      if (ticks.has(pending.targetTick)) throw new Error(`progress overlay pending tick ${pending.targetTick} is duplicated`);
      ticks.add(pending.targetTick);
    }
  }

  const inputDigestBase = {
    revision: value.revision,
    worldEpoch: value.worldEpoch,
    maxFutureTicks: value.maxFutureTicks,
    rosterRevision: value.rosterRevision,
    boundaryTick: value.boundaryTick,
    channels: value.channels,
  };
  if (foundationCheckpointDigest(inputDigestBase) !== value.stateDigest) {
    throw new Error("progress overlay input checkpoint digest mismatch");
  }
}

function digestBase(overlay: Omit<FoundationReplicationProgressOverlay, "stateDigest">): object {
  return overlay;
}

function cloneOverlay(value: FoundationReplicationProgressOverlay): FoundationReplicationProgressOverlay {
  return JSON.parse(JSON.stringify(value)) as FoundationReplicationProgressOverlay;
}

export function validateFoundationReplicationProgressOverlay(
  value: unknown,
): asserts value is FoundationReplicationProgressOverlay {
  if (!isRecord(value)) throw new Error("progress overlay must be an object");
  if (value.revision !== FOUNDATION_REPLICATION_PROGRESS_OVERLAY_REVISION) {
    throw new Error("progress overlay revision mismatch");
  }
  if (value.protocolRevision !== FOUNDATION_REPLICATION_PROTOCOL_REVISION) {
    throw new Error("progress overlay protocol revision mismatch");
  }
  assertNonEmptyString(value.worldId, "progress overlay worldId");
  assertNonEmptyString(value.worldEpoch, "progress overlay worldEpoch");
  assertPositiveInteger(value.baseCheckpointGeneration, "progress overlay base checkpoint generation");
  assertNonNegativeInteger(value.baseCanonicalTick, "progress overlay base canonical tick");
  assertNonNegativeInteger(value.topologyRevision, "progress overlay topology revision");
  assertNonEmptyString(value.topologyDigest, "progress overlay topology digest");
  assertPositiveInteger(value.progressSequence, "progress overlay progressSequence");
  validateInputCheckpointShape(value.inputCheckpoint);
  validateWorkerState(value.workerState);
  assertNonEmptyString(value.stateDigest, "progress overlay stateDigest");

  if (value.inputCheckpoint.worldEpoch !== value.worldEpoch) {
    throw new Error("progress overlay input WorldEpoch mismatch");
  }
  if (value.inputCheckpoint.boundaryTick !== value.baseCanonicalTick) {
    throw new Error("progress overlay input boundary must equal base canonical tick");
  }
  if (value.inputCheckpoint.rosterRevision !== value.topologyRevision) {
    throw new Error("progress overlay input roster revision must equal topology revision");
  }

  const bindingBySession = new Map(
    value.workerState.bindings.map((binding) => [binding.actorSessionId, binding] as const),
  );
  if (bindingBySession.size !== value.inputCheckpoint.channels.length) {
    throw new Error("progress overlay binding/input channel coverage mismatch");
  }
  for (const channel of value.inputCheckpoint.channels) {
    const binding = bindingBySession.get(channel.actorSessionId);
    if (!binding || binding.actorId !== channel.actorId) {
      throw new Error(`progress overlay input ownership mismatch for ${channel.actorSessionId}`);
    }
    if (binding.lastTopologyRevision !== value.topologyRevision) {
      throw new Error(`progress overlay binding topology mismatch for ${channel.actorSessionId}`);
    }
    if (binding.readyTopologyRevision !== null && binding.readyTopologyRevision !== value.topologyRevision) {
      throw new Error(`progress overlay ready topology mismatch for ${channel.actorSessionId}`);
    }
    if (channel.pending.length > value.inputCheckpoint.maxFutureTicks) {
      throw new Error(`progress overlay pending input count exceeds bounded horizon for ${channel.actorSessionId}`);
    }
    for (const pending of channel.pending) {
      if (pending.targetTick <= value.baseCanonicalTick) {
        throw new Error(`progress overlay pending tick is not future for ${channel.actorSessionId}`);
      }
      if (pending.targetTick > value.baseCanonicalTick + value.inputCheckpoint.maxFutureTicks) {
        throw new Error(`progress overlay pending tick exceeds bounded horizon for ${channel.actorSessionId}`);
      }
    }
  }

  const base = { ...(value as FoundationReplicationProgressOverlay) };
  delete (base as Partial<FoundationReplicationProgressOverlay>).stateDigest;
  const expectedDigest = foundationCheckpointDigest(digestBase(base as Omit<FoundationReplicationProgressOverlay, "stateDigest">));
  if (expectedDigest !== value.stateDigest) throw new Error("progress overlay state digest mismatch");
}

export function createFoundationReplicationProgressOverlay(
  input: FoundationReplicationProgressOverlayInput,
): FoundationReplicationProgressOverlay {
  const canonicalInput: FoundationReplicationProgressOverlayInput = JSON.parse(JSON.stringify({
    worldId: input.worldId,
    worldEpoch: input.worldEpoch,
    baseCheckpointGeneration: input.baseCheckpointGeneration,
    baseCanonicalTick: input.baseCanonicalTick,
    topologyRevision: input.topologyRevision,
    topologyDigest: input.topologyDigest,
    progressSequence: input.progressSequence,
    inputCheckpoint: input.inputCheckpoint,
    workerState: input.workerState,
  })) as FoundationReplicationProgressOverlayInput;
  const base: Omit<FoundationReplicationProgressOverlay, "stateDigest"> = {
    revision: FOUNDATION_REPLICATION_PROGRESS_OVERLAY_REVISION,
    protocolRevision: FOUNDATION_REPLICATION_PROTOCOL_REVISION,
    ...canonicalInput,
  };
  const overlay: FoundationReplicationProgressOverlay = {
    ...base,
    stateDigest: foundationCheckpointDigest(digestBase(base)),
  };
  validateFoundationReplicationProgressOverlay(overlay);
  return overlay;
}

export function encodeFoundationReplicationProgressOverlay(
  overlay: FoundationReplicationProgressOverlay,
): Uint8Array {
  validateFoundationReplicationProgressOverlay(overlay);
  return new TextEncoder().encode(JSON.stringify(overlay));
}

export function decodeFoundationReplicationProgressOverlay(
  bytes: Uint8Array,
): FoundationReplicationProgressOverlay {
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder().decode(bytes));
  } catch (error) {
    throw new Error("progress overlay payload is not valid JSON", { cause: error });
  }
  validateFoundationReplicationProgressOverlay(value);
  return cloneOverlay(value);
}

export function assertFoundationReplicationProgressOverlayMatchesBase(
  overlay: FoundationReplicationProgressOverlay,
  base: FoundationReplicationLiveCheckpoint,
  baseGeneration: number,
): void {
  validateFoundationReplicationProgressOverlay(overlay);
  if (overlay.baseCheckpointGeneration !== baseGeneration) throw new Error("progress overlay base generation mismatch");
  if (overlay.worldId !== base.worldId) throw new Error("progress overlay base world mismatch");
  if (overlay.worldEpoch !== base.worldEpoch) throw new Error("progress overlay base WorldEpoch mismatch");
  if (overlay.baseCanonicalTick !== base.canonicalTick) throw new Error("progress overlay base canonical tick mismatch");
  if (overlay.topologyRevision !== base.topologyRevision) throw new Error("progress overlay base topology revision mismatch");
  if (overlay.topologyDigest !== base.topologyDigest) throw new Error("progress overlay base topology digest mismatch");

  const baseBindings = new Map(base.workerState.bindings.map((binding) => [binding.actorSessionId, binding] as const));
  if (baseBindings.size !== overlay.workerState.bindings.length) throw new Error("progress overlay base binding coverage mismatch");
  for (const binding of overlay.workerState.bindings) {
    const prior = baseBindings.get(binding.actorSessionId);
    if (!prior || prior.actorId !== binding.actorId) throw new Error(`progress overlay changed binding identity ${binding.actorSessionId}`);
    if (binding.inputBatches < prior.inputBatches) throw new Error(`progress overlay input batch count moved backwards for ${binding.actorSessionId}`);
  }

  for (const field of [
    "syncSequence",
    "syncsSent",
    "correctionSyncs",
    "resumeSyncs",
    "inputCommitsSent",
    "committedInputRecords",
    "acceptedInputRecords",
    "invalidMessages",
    "staleReady",
  ] as const) {
    if (overlay.workerState[field] < base.workerState[field]) {
      throw new Error(`progress overlay worker counter ${field} moved backwards`);
    }
  }
}
