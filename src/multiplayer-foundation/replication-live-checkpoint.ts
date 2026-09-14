import type { FoundationActorInputCheckpoint } from "./actor-input-registry.ts";
import type { FoundationReplicationPhysicsSeed } from "./replication-physics-runtime.ts";
import { FOUNDATION_REPLICATION_PROTOCOL_REVISION } from "./replication-protocol.ts";
import type { FoundationRosterCheckpoint } from "./roster-machine.ts";

export const FOUNDATION_REPLICATION_LIVE_CHECKPOINT_REVISION = "multiplayer-foundation-live-authority-checkpoint-v1";

export type FoundationReplicationLiveMode = "neutral" | "interactive" | "reconnect";

export type FoundationReplicationLiveWorkerState = {
  syncSequence: number;
  syncsSent: number;
  correctionSyncs: number;
  resumeSyncs: number;
  inputCommitsSent: number;
  committedInputRecords: number;
  acceptedInputRecords: number;
  invalidMessages: number;
  staleReady: number;
  completedContinuationTicks: number;
  finalGuardPacked: string | null;
  finalSeedBytes: number;
  finalSeedFnv1a32: string | null;
  maxPropHorizontalDisplacement: number;
  propStartXZ: Array<{ entityId: string; x: number; z: number }>;
  resumedSessions: string[];
};

export type FoundationReplicationLiveCheckpoint = {
  revision: typeof FOUNDATION_REPLICATION_LIVE_CHECKPOINT_REVISION;
  protocolRevision: typeof FOUNDATION_REPLICATION_PROTOCOL_REVISION;
  worldId: string;
  worldEpoch: string;
  canonicalTick: number;
  topologyRevision: number;
  topologyDigest: string;
  mode: FoundationReplicationLiveMode;
  rosterCheckpoint: FoundationRosterCheckpoint;
  inputCheckpoint: FoundationActorInputCheckpoint;
  physicsSeed: FoundationReplicationPhysicsSeed;
  workerState: FoundationReplicationLiveWorkerState;
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const MODES = new Set<FoundationReplicationLiveMode>(["neutral", "interactive", "reconnect"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertNonNegativeInteger(value: unknown, label: string): asserts value is number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer`);
  }
}

function assertFiniteNumber(value: unknown, label: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${label} must be finite`);
}

function assertNonEmptyString(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} must be non-empty`);
}

function validateWorkerState(value: unknown): asserts value is FoundationReplicationLiveWorkerState {
  if (!isRecord(value)) throw new Error("live checkpoint workerState must be an object");
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
    "completedContinuationTicks",
    "finalSeedBytes",
  ] as const) {
    assertNonNegativeInteger(value[field], `live checkpoint workerState.${field}`);
  }
  if (value.finalGuardPacked !== null) assertNonEmptyString(value.finalGuardPacked, "live checkpoint finalGuardPacked");
  if (value.finalSeedFnv1a32 !== null) {
    assertNonEmptyString(value.finalSeedFnv1a32, "live checkpoint finalSeedFnv1a32");
    if (!/^[0-9a-f]{8}$/.test(value.finalSeedFnv1a32)) throw new Error("live checkpoint finalSeedFnv1a32 is invalid");
  }
  assertFiniteNumber(value.maxPropHorizontalDisplacement, "live checkpoint maxPropHorizontalDisplacement");
  if (value.maxPropHorizontalDisplacement < 0) throw new Error("live checkpoint maxPropHorizontalDisplacement must be non-negative");
  if (!Array.isArray(value.propStartXZ)) throw new Error("live checkpoint propStartXZ must be an array");
  const propIds = new Set<string>();
  for (const entry of value.propStartXZ) {
    if (!isRecord(entry)) throw new Error("live checkpoint propStartXZ entry must be an object");
    assertNonEmptyString(entry.entityId, "live checkpoint propStartXZ entityId");
    assertFiniteNumber(entry.x, "live checkpoint propStartXZ x");
    assertFiniteNumber(entry.z, "live checkpoint propStartXZ z");
    if (propIds.has(entry.entityId)) throw new Error(`live checkpoint propStartXZ duplicates ${entry.entityId}`);
    propIds.add(entry.entityId);
  }
  if (!Array.isArray(value.resumedSessions)) throw new Error("live checkpoint resumedSessions must be an array");
  const resumed = new Set<string>();
  for (const session of value.resumedSessions) {
    assertNonEmptyString(session, "live checkpoint resumed session");
    if (resumed.has(session)) throw new Error(`live checkpoint resumed session ${session} is duplicated`);
    resumed.add(session);
  }
}

export function validateFoundationReplicationLiveCheckpoint(
  value: unknown,
): asserts value is FoundationReplicationLiveCheckpoint {
  if (!isRecord(value)) throw new Error("live checkpoint must be an object");
  if (value.revision !== FOUNDATION_REPLICATION_LIVE_CHECKPOINT_REVISION) {
    throw new Error("live checkpoint revision mismatch");
  }
  if (value.protocolRevision !== FOUNDATION_REPLICATION_PROTOCOL_REVISION) {
    throw new Error("live checkpoint protocol revision mismatch");
  }
  assertNonEmptyString(value.worldId, "live checkpoint worldId");
  assertNonEmptyString(value.worldEpoch, "live checkpoint worldEpoch");
  assertNonNegativeInteger(value.canonicalTick, "live checkpoint canonicalTick");
  assertNonNegativeInteger(value.topologyRevision, "live checkpoint topologyRevision");
  assertNonEmptyString(value.topologyDigest, "live checkpoint topologyDigest");
  if (typeof value.mode !== "string" || !MODES.has(value.mode as FoundationReplicationLiveMode)) {
    throw new Error("live checkpoint mode is invalid");
  }
  if (!isRecord(value.rosterCheckpoint)) throw new Error("live checkpoint rosterCheckpoint must be an object");
  if (!isRecord(value.inputCheckpoint)) throw new Error("live checkpoint inputCheckpoint must be an object");
  if (!isRecord(value.physicsSeed)) throw new Error("live checkpoint physicsSeed must be an object");
  validateWorkerState(value.workerState);
}

export function encodeFoundationReplicationLiveCheckpoint(
  checkpoint: FoundationReplicationLiveCheckpoint,
): Uint8Array {
  validateFoundationReplicationLiveCheckpoint(checkpoint);
  return encoder.encode(JSON.stringify(checkpoint));
}

export function decodeFoundationReplicationLiveCheckpoint(
  payload: Uint8Array,
): FoundationReplicationLiveCheckpoint {
  let value: unknown;
  try {
    value = JSON.parse(decoder.decode(payload));
  } catch (error) {
    throw new Error("live checkpoint payload is not valid JSON", { cause: error });
  }
  validateFoundationReplicationLiveCheckpoint(value);
  return value;
}
