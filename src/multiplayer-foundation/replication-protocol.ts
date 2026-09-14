import type { FoundationInputAcceptance } from "./actor-input-registry.ts";
import type { FoundationActorId } from "./roster-machine.ts";
import {
  hydrateFoundationClientRuntimeBootstrap,
  type FoundationClientRuntimeBootstrapEnvelope,
  type FoundationHydratedClientRuntimeBootstrap,
} from "./client-runtime-bootstrap.ts";
import type {
  FoundationClientBootstrapExpectation,
  FoundationClientExecutionProfile,
} from "./client-bootstrap.ts";

export const FOUNDATION_REPLICATION_PROTOCOL_REVISION = "multiplayer-foundation-replication-v1";
export const FOUNDATION_REPLICATION_MAX_INPUT_RECORDS = 16;
export const FOUNDATION_REPLICATION_MAX_CLIENT_MESSAGE_BYTES = 64 * 1024;
export const FOUNDATION_REPLICATION_MAX_SERVER_MESSAGE_BYTES = 2 * 1024 * 1024;

export type FoundationRuntimeSyncReason = "join" | "topology_change" | "resume" | "correction";

export interface FoundationReplicationJoin {
  type: "foundation_join";
  revision: typeof FOUNDATION_REPLICATION_PROTOCOL_REVISION;
  requestId: string;
  worldId: string;
  actorSessionId: string;
  executionProfile: FoundationClientExecutionProfile;
}

export interface FoundationReplicationRuntimeReady {
  type: "foundation_runtime_ready";
  revision: typeof FOUNDATION_REPLICATION_PROTOCOL_REVISION;
  worldId: string;
  worldEpoch: string;
  actorSessionId: string;
  syncId: string;
  runtimeDigest: string;
}

export interface FoundationReplicationInputRecord {
  targetTick: number;
  x: number;
  z: number;
}

export interface FoundationReplicationInputBatch {
  type: "foundation_input_batch";
  revision: typeof FOUNDATION_REPLICATION_PROTOCOL_REVISION;
  worldId: string;
  worldEpoch: string;
  actorSessionId: string;
  actorId: FoundationActorId;
  topologyRevision: number;
  batchSeq: number;
  records: FoundationReplicationInputRecord[];
}

export type FoundationReplicationClientMessage =
  | FoundationReplicationJoin
  | FoundationReplicationRuntimeReady
  | FoundationReplicationInputBatch;

export interface FoundationReplicationRuntimeSync {
  type: "foundation_runtime_sync";
  revision: typeof FOUNDATION_REPLICATION_PROTOCOL_REVISION;
  syncId: string;
  reason: FoundationRuntimeSyncReason;
  worldId: string;
  worldEpoch: string;
  actorSessionId: string;
  previousTopologyRevision: number | null;
  runtimeBootstrap: FoundationClientRuntimeBootstrapEnvelope;
}

export interface FoundationReplicationInputResultRecord {
  actorId: FoundationActorId;
  targetTick: number;
  status: FoundationInputAcceptance["status"];
}

export interface FoundationReplicationInputResult {
  type: "foundation_input_result";
  revision: typeof FOUNDATION_REPLICATION_PROTOCOL_REVISION;
  worldId: string;
  worldEpoch: string;
  actorSessionId: string;
  actorId: FoundationActorId;
  batchSeq: number;
  records: FoundationReplicationInputResultRecord[];
}

export type FoundationReplicationServerMessage =
  | FoundationReplicationRuntimeSync
  | FoundationReplicationInputResult;

export interface FoundationReplicationServerExpectation {
  worldId: string;
  actorSessionId: string;
  executionProfile: FoundationClientBootstrapExpectation;
  seedFormatId: string;
  worldEpoch?: string;
}

export type FoundationParsedServerMessage =
  | {
      message: FoundationReplicationRuntimeSync;
      hydratedRuntimeBootstrap: FoundationHydratedClientRuntimeBootstrap;
    }
  | {
      message: FoundationReplicationInputResult;
      hydratedRuntimeBootstrap?: undefined;
    };

const ID_PATTERN = /^[A-Za-z0-9._|:=+-]{1,512}$/;
const ACTOR_ID_PATTERN = /^actor:\d+$/;
const INPUT_STATUSES = new Set<FoundationInputAcceptance["status"]>([
  "accepted",
  "superseded",
  "rejected_unknown_actor",
  "rejected_owner_mismatch",
  "rejected_late",
  "rejected_too_future",
]);
const SYNC_REASONS = new Set<FoundationRuntimeSyncReason>([
  "join",
  "topology_change",
  "resume",
  "correction",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIdentityString(value: unknown): value is string {
  return typeof value === "string" && ID_PATTERN.test(value);
}

function isActorId(value: unknown): value is FoundationActorId {
  if (typeof value !== "string" || !ACTOR_ID_PATTERN.test(value)) return false;
  const ordinal = Number(value.slice("actor:".length));
  return Number.isSafeInteger(ordinal) && ordinal >= 0;
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1;
}

function parseJsonObject(raw: string, maxBytes: number): Record<string, unknown> | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > maxBytes) return null;
  try {
    const value: unknown = JSON.parse(raw);
    return isRecord(value) ? value : null;
  } catch {
    return null;
  }
}

function parseExecutionProfile(value: unknown): FoundationClientExecutionProfile | null {
  if (!isRecord(value)) return null;
  if (!isIdentityString(value.profileId)) return null;
  if (!isIdentityString(value.buildId)) return null;
  if (!isIdentityString(value.stateSchemaId)) return null;
  return {
    profileId: value.profileId,
    buildId: value.buildId,
    stateSchemaId: value.stateSchemaId,
  };
}

export function sameFoundationExecutionProfile(
  observed: FoundationClientExecutionProfile,
  expected: FoundationClientBootstrapExpectation,
): boolean {
  return observed.profileId === expected.profileId
    && observed.buildId === expected.buildId
    && observed.stateSchemaId === expected.stateSchemaId;
}

function parseInputRecords(value: unknown): FoundationReplicationInputRecord[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > FOUNDATION_REPLICATION_MAX_INPUT_RECORDS) {
    return null;
  }
  const records: FoundationReplicationInputRecord[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) return null;
    if (!isNonNegativeSafeInteger(entry.targetTick)) return null;
    if (typeof entry.x !== "number" || !Number.isFinite(entry.x)) return null;
    if (typeof entry.z !== "number" || !Number.isFinite(entry.z)) return null;
    if (Math.hypot(entry.x, entry.z) > 1 + 1e-12) return null;
    records.push({ targetTick: entry.targetTick, x: entry.x, z: entry.z });
  }
  for (let index = 1; index < records.length; index += 1) {
    if (records[index].targetTick !== records[index - 1].targetTick + 1) return null;
  }
  return records;
}

function parseJoin(record: Record<string, unknown>): FoundationReplicationJoin | null {
  if (!isIdentityString(record.requestId)) return null;
  if (!isIdentityString(record.worldId)) return null;
  if (!isIdentityString(record.actorSessionId)) return null;
  const executionProfile = parseExecutionProfile(record.executionProfile);
  if (!executionProfile) return null;
  return {
    type: "foundation_join",
    revision: FOUNDATION_REPLICATION_PROTOCOL_REVISION,
    requestId: record.requestId,
    worldId: record.worldId,
    actorSessionId: record.actorSessionId,
    executionProfile,
  };
}

function parseRuntimeReady(record: Record<string, unknown>): FoundationReplicationRuntimeReady | null {
  if (!isIdentityString(record.worldId)) return null;
  if (!isIdentityString(record.worldEpoch)) return null;
  if (!isIdentityString(record.actorSessionId)) return null;
  if (!isIdentityString(record.syncId)) return null;
  if (!isIdentityString(record.runtimeDigest)) return null;
  return {
    type: "foundation_runtime_ready",
    revision: FOUNDATION_REPLICATION_PROTOCOL_REVISION,
    worldId: record.worldId,
    worldEpoch: record.worldEpoch,
    actorSessionId: record.actorSessionId,
    syncId: record.syncId,
    runtimeDigest: record.runtimeDigest,
  };
}

function parseInputBatch(record: Record<string, unknown>): FoundationReplicationInputBatch | null {
  if (!isIdentityString(record.worldId)) return null;
  if (!isIdentityString(record.worldEpoch)) return null;
  if (!isIdentityString(record.actorSessionId)) return null;
  if (!isActorId(record.actorId)) return null;
  if (!isNonNegativeSafeInteger(record.topologyRevision)) return null;
  if (!isPositiveSafeInteger(record.batchSeq)) return null;
  const records = parseInputRecords(record.records);
  if (!records) return null;
  return {
    type: "foundation_input_batch",
    revision: FOUNDATION_REPLICATION_PROTOCOL_REVISION,
    worldId: record.worldId,
    worldEpoch: record.worldEpoch,
    actorSessionId: record.actorSessionId,
    actorId: record.actorId,
    topologyRevision: record.topologyRevision,
    batchSeq: record.batchSeq,
    records,
  };
}

export function parseFoundationReplicationClientMessage(raw: string): FoundationReplicationClientMessage | null {
  const record = parseJsonObject(raw, FOUNDATION_REPLICATION_MAX_CLIENT_MESSAGE_BYTES);
  if (!record || record.revision !== FOUNDATION_REPLICATION_PROTOCOL_REVISION || typeof record.type !== "string") {
    return null;
  }
  if (record.type === "foundation_join") return parseJoin(record);
  if (record.type === "foundation_runtime_ready") return parseRuntimeReady(record);
  if (record.type === "foundation_input_batch") return parseInputBatch(record);
  return null;
}

function parseInputResult(record: Record<string, unknown>): FoundationReplicationInputResult | null {
  if (!isIdentityString(record.worldId)) return null;
  if (!isIdentityString(record.worldEpoch)) return null;
  if (!isIdentityString(record.actorSessionId)) return null;
  if (!isActorId(record.actorId)) return null;
  if (!isPositiveSafeInteger(record.batchSeq)) return null;
  if (!Array.isArray(record.records) || record.records.length < 1 || record.records.length > FOUNDATION_REPLICATION_MAX_INPUT_RECORDS) {
    return null;
  }
  const records: FoundationReplicationInputResultRecord[] = [];
  for (const entry of record.records) {
    if (!isRecord(entry)) return null;
    if (!isActorId(entry.actorId)) return null;
    if (!isNonNegativeSafeInteger(entry.targetTick)) return null;
    if (typeof entry.status !== "string" || !INPUT_STATUSES.has(entry.status as FoundationInputAcceptance["status"])) {
      return null;
    }
    records.push({
      actorId: entry.actorId,
      targetTick: entry.targetTick,
      status: entry.status as FoundationInputAcceptance["status"],
    });
  }
  return {
    type: "foundation_input_result",
    revision: FOUNDATION_REPLICATION_PROTOCOL_REVISION,
    worldId: record.worldId,
    worldEpoch: record.worldEpoch,
    actorSessionId: record.actorSessionId,
    actorId: record.actorId,
    batchSeq: record.batchSeq,
    records,
  };
}

function parseRuntimeSync(
  record: Record<string, unknown>,
  expectation: FoundationReplicationServerExpectation,
): FoundationParsedServerMessage | null {
  if (!isIdentityString(record.syncId)) return null;
  if (typeof record.reason !== "string" || !SYNC_REASONS.has(record.reason as FoundationRuntimeSyncReason)) return null;
  if (!isIdentityString(record.worldId) || record.worldId !== expectation.worldId) return null;
  if (!isIdentityString(record.worldEpoch)) return null;
  if (expectation.worldEpoch !== undefined && record.worldEpoch !== expectation.worldEpoch) return null;
  if (!isIdentityString(record.actorSessionId) || record.actorSessionId !== expectation.actorSessionId) return null;
  if (record.previousTopologyRevision !== null && !isNonNegativeSafeInteger(record.previousTopologyRevision)) return null;
  if (record.reason === "join" && record.previousTopologyRevision !== null) return null;
  if (!isRecord(record.runtimeBootstrap)) return null;

  let hydratedRuntimeBootstrap: FoundationHydratedClientRuntimeBootstrap;
  try {
    hydratedRuntimeBootstrap = hydrateFoundationClientRuntimeBootstrap(
      record.runtimeBootstrap as unknown as FoundationClientRuntimeBootstrapEnvelope,
      expectation.executionProfile,
      expectation.seedFormatId,
    );
  } catch {
    return null;
  }
  if (hydratedRuntimeBootstrap.envelope.worldEpoch !== record.worldEpoch) return null;
  if (hydratedRuntimeBootstrap.envelope.selfActorSessionId !== record.actorSessionId) return null;
  const currentTopologyRevision = hydratedRuntimeBootstrap.envelope.topology.topologyRevision;
  if (
    record.previousTopologyRevision !== null
    && record.previousTopologyRevision >= currentTopologyRevision
    && record.reason === "topology_change"
  ) {
    return null;
  }

  const message: FoundationReplicationRuntimeSync = {
    type: "foundation_runtime_sync",
    revision: FOUNDATION_REPLICATION_PROTOCOL_REVISION,
    syncId: record.syncId,
    reason: record.reason as FoundationRuntimeSyncReason,
    worldId: record.worldId,
    worldEpoch: record.worldEpoch,
    actorSessionId: record.actorSessionId,
    previousTopologyRevision: record.previousTopologyRevision as number | null,
    runtimeBootstrap: record.runtimeBootstrap as unknown as FoundationClientRuntimeBootstrapEnvelope,
  };
  return { message, hydratedRuntimeBootstrap };
}

export function parseFoundationReplicationServerMessage(
  raw: string,
  expectation: FoundationReplicationServerExpectation,
): FoundationParsedServerMessage | null {
  const record = parseJsonObject(raw, FOUNDATION_REPLICATION_MAX_SERVER_MESSAGE_BYTES);
  if (!record || record.revision !== FOUNDATION_REPLICATION_PROTOCOL_REVISION || typeof record.type !== "string") {
    return null;
  }
  if (record.type === "foundation_runtime_sync") return parseRuntimeSync(record, expectation);
  if (record.type !== "foundation_input_result") return null;
  const message = parseInputResult(record);
  if (!message) return null;
  if (message.worldId !== expectation.worldId || message.actorSessionId !== expectation.actorSessionId) return null;
  if (expectation.worldEpoch !== undefined && message.worldEpoch !== expectation.worldEpoch) return null;
  return { message };
}

export function foundationReplicationRuntimeSync(
  input: Omit<FoundationReplicationRuntimeSync, "type" | "revision">,
): FoundationReplicationRuntimeSync {
  return {
    type: "foundation_runtime_sync",
    revision: FOUNDATION_REPLICATION_PROTOCOL_REVISION,
    ...input,
  };
}

export function foundationReplicationInputResult(
  input: Omit<FoundationReplicationInputResult, "type" | "revision">,
): FoundationReplicationInputResult {
  return {
    type: "foundation_input_result",
    revision: FOUNDATION_REPLICATION_PROTOCOL_REVISION,
    ...input,
  };
}
