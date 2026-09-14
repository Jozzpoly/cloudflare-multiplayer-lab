import assert from "node:assert/strict";
import { foundationCheckpointDigest } from "../src/multiplayer-foundation/checkpoint-digest.ts";
import { FoundationActorInputRegistry } from "../src/multiplayer-foundation/actor-input-registry.ts";
import { FoundationEntityTopology } from "../src/multiplayer-foundation/entity-topology.ts";
import {
  assertFoundationReplicationProgressOverlayMatchesBase,
  createFoundationReplicationProgressOverlay,
  decodeFoundationReplicationProgressOverlay,
  encodeFoundationReplicationProgressOverlay,
  type FoundationReplicationProgressOverlay,
} from "../src/multiplayer-foundation/replication-progress-overlay.ts";
import {
  FOUNDATION_REPLICATION_LIVE_CHECKPOINT_REVISION,
  type FoundationReplicationLiveBindingState,
  type FoundationReplicationLiveCheckpoint,
} from "../src/multiplayer-foundation/replication-live-checkpoint.ts";
import { FOUNDATION_REPLICATION_PROTOCOL_REVISION } from "../src/multiplayer-foundation/replication-protocol.ts";
import { FoundationRosterMachine } from "../src/multiplayer-foundation/roster-machine.ts";
import { FOUNDATION_BOX3D_RECORDING_SEED_FORMAT } from "../src/multiplayer-foundation/client-runtime-bootstrap.ts";

const WORLD_EPOCH = "progress-overlay-epoch-1";
const WORLD_ID = "progress-overlay-world-1";
const BASE_TICK = 33;
const MAX_FUTURE_TICKS = 80;
const PERSISTENT_WORLD = ["prop-0"];

function expectThrow(fn: () => unknown, pattern: RegExp): void {
  assert.throws(fn, pattern);
}

function inputDigest(checkpoint: any): string {
  return foundationCheckpointDigest({
    revision: checkpoint.revision,
    worldEpoch: checkpoint.worldEpoch,
    maxFutureTicks: checkpoint.maxFutureTicks,
    rosterRevision: checkpoint.rosterRevision,
    boundaryTick: checkpoint.boundaryTick,
    channels: checkpoint.channels,
  });
}

function buildScenario(actorCount: number, pendingTicks: number, boundaryTick = BASE_TICK) {
  const roster = new FoundationRosterMachine({ worldEpoch: WORLD_EPOCH, capacity: 6 });
  for (let index = 0; index < actorCount; index += 1) {
    roster.queue({
      kind: "join",
      mutationId: `join-${index + 1}-session-${index}`,
      effectiveTick: index + 1,
      actorSessionId: `session-${index}`,
    });
  }
  roster.advanceTo(boundaryTick);
  const rosterSnapshot = roster.snapshot();
  assert.equal(rosterSnapshot.actors.length, actorCount);

  const topology = new FoundationEntityTopology(WORLD_EPOCH, PERSISTENT_WORLD);
  const topologySnapshot = topology.syncRoster(rosterSnapshot);
  const inputs = new FoundationActorInputRegistry(WORLD_EPOCH, MAX_FUTURE_TICKS);
  inputs.syncRoster(rosterSnapshot);
  const baseInputCheckpoint = inputs.checkpoint(rosterSnapshot);

  for (let actorIndex = 0; actorIndex < actorCount; actorIndex += 1) {
    const actor = rosterSnapshot.actors[actorIndex];
    for (let offset = 1; offset <= pendingTicks; offset += 1) {
      const acceptance = inputs.schedule({
        actorId: actor.actorId,
        actorSessionId: actor.actorSessionId,
        targetTick: boundaryTick + offset,
        x: actorIndex % 2 === 0 ? 0.6 : -0.6,
        z: actorIndex % 3 === 0 ? 0.4 : -0.4,
      }, boundaryTick);
      assert.equal(acceptance.status, "accepted");
    }
  }
  const progressInputCheckpoint = inputs.checkpoint(rosterSnapshot);

  const baseBindings: FoundationReplicationLiveBindingState[] = rosterSnapshot.actors.map((actor, index) => ({
    actorSessionId: actor.actorSessionId,
    actorId: actor.actorId,
    lastTopologyRevision: topologySnapshot.topologyRevision,
    expectedSyncId: `sync-base-${index}`,
    expectedRuntimeDigest: `runtime-base-${index}`,
    readyTopologyRevision: null,
    inputBatches: 2,
  }));

  const base: FoundationReplicationLiveCheckpoint = {
    revision: FOUNDATION_REPLICATION_LIVE_CHECKPOINT_REVISION,
    protocolRevision: FOUNDATION_REPLICATION_PROTOCOL_REVISION,
    worldId: WORLD_ID,
    worldEpoch: WORLD_EPOCH,
    canonicalTick: boundaryTick,
    topologyRevision: topologySnapshot.topologyRevision,
    topologyDigest: topologySnapshot.topologyDigest,
    mode: "reconnect",
    rosterCheckpoint: roster.checkpoint(),
    inputCheckpoint: baseInputCheckpoint,
    physicsSeed: {
      formatId: FOUNDATION_BOX3D_RECORDING_SEED_FORMAT,
      worldEpoch: WORLD_EPOCH,
      canonicalTick: boundaryTick,
      topologyRevision: topologySnapshot.topologyRevision,
      topologyDigest: topologySnapshot.topologyDigest,
      bodyNames: [...topologySnapshot.entityOrder],
      byteLength: 1,
      fnv1a32: "050c5d1f",
      bytesBase64: "AA==",
    },
    workerState: {
      syncSequence: 6,
      syncsSent: 9,
      correctionSyncs: 3,
      resumeSyncs: 0,
      inputCommitsSent: 18,
      committedInputRecords: 90,
      acceptedInputRecords: 90,
      invalidMessages: 0,
      staleReady: 0,
      completedContinuationTicks: 30,
      finalGuardPacked: "guard-base",
      finalSeedBytes: 1,
      finalSeedFnv1a32: "050c5d1f",
      maxPropHorizontalDisplacement: 0.05,
      propStartXZ: [{ entityId: "prop-0", x: 0, z: 0 }],
      resumedSessions: [],
      bindings: baseBindings,
    },
  };

  const progressBindings = baseBindings.map((binding, index) => ({
    ...binding,
    expectedSyncId: `sync-progress-${index}`,
    expectedRuntimeDigest: `runtime-progress-${index}`,
    readyTopologyRevision: topologySnapshot.topologyRevision,
    inputBatches: 3,
  }));

  const addedRecords = actorCount * pendingTicks;
  const overlay = createFoundationReplicationProgressOverlay({
    worldId: WORLD_ID,
    worldEpoch: WORLD_EPOCH,
    baseCheckpointGeneration: 1,
    baseCanonicalTick: boundaryTick,
    topologyRevision: topologySnapshot.topologyRevision,
    topologyDigest: topologySnapshot.topologyDigest,
    progressSequence: 1,
    inputCheckpoint: progressInputCheckpoint,
    workerState: {
      syncSequence: 9,
      syncsSent: 12,
      correctionSyncs: 3,
      resumeSyncs: 0,
      inputCommitsSent: 18 + addedRecords * actorCount,
      committedInputRecords: 90 + addedRecords,
      acceptedInputRecords: 90 + addedRecords,
      invalidMessages: 0,
      staleReady: 0,
      resumedSessions: [],
      bindings: progressBindings,
    },
  });

  return { rosterSnapshot, base, overlay, inputs };
}

const nominal = buildScenario(3, 15);
const encoded = encodeFoundationReplicationProgressOverlay(nominal.overlay);
const decoded = decodeFoundationReplicationProgressOverlay(encoded);
assert.deepEqual(decoded, nominal.overlay);
assertFoundationReplicationProgressOverlayMatchesBase(decoded, nominal.base, 1);

const restoredInputs = FoundationActorInputRegistry.fromCheckpoint(
  structuredClone(decoded.inputCheckpoint),
  nominal.rosterSnapshot,
);
assert.equal(restoredInputs.checkpoint(nominal.rosterSnapshot).stateDigest, decoded.inputCheckpoint.stateDigest);
assert.equal(
  decoded.inputCheckpoint.channels.reduce((sum, channel) => sum + channel.pending.length, 0),
  45,
);

const worst = buildScenario(6, MAX_FUTURE_TICKS);
const worstBytes = encodeFoundationReplicationProgressOverlay(worst.overlay).byteLength;
assert.equal(
  worst.overlay.inputCheckpoint.channels.reduce((sum, channel) => sum + channel.pending.length, 0),
  6 * MAX_FUTURE_TICKS,
);
assert(worstBytes < 128 * 1024, `bounded progress overlay unexpectedly large: ${worstBytes} B`);

const lateWorld = buildScenario(6, MAX_FUTURE_TICKS, 1_000_000);
const lateWorldBytes = encodeFoundationReplicationProgressOverlay(lateWorld.overlay).byteLength;
assert(
  Math.abs(lateWorldBytes - worstBytes) < 8 * 1024,
  `overlay size depends materially on world age: ${worstBytes} B vs ${lateWorldBytes} B`,
);

const badDigest = structuredClone(decoded) as FoundationReplicationProgressOverlay;
badDigest.stateDigest = badDigest.stateDigest === "0000000000000000" ? "ffffffffffffffff" : "0000000000000000";
expectThrow(() => decodeFoundationReplicationProgressOverlay(new TextEncoder().encode(JSON.stringify(badDigest))), /state digest mismatch/);

const badInputDigest = structuredClone(decoded.inputCheckpoint) as any;
badInputDigest.channels[0].pending[0].x = 0.2;
expectThrow(() => createFoundationReplicationProgressOverlay({
  ...decoded,
  inputCheckpoint: badInputDigest,
} as any), /input checkpoint digest mismatch/);

const outOfHorizonInput = structuredClone(decoded.inputCheckpoint) as any;
outOfHorizonInput.channels[0].pending[0].targetTick = BASE_TICK + MAX_FUTURE_TICKS + 1;
outOfHorizonInput.stateDigest = inputDigest(outOfHorizonInput);
expectThrow(() => createFoundationReplicationProgressOverlay({
  ...decoded,
  inputCheckpoint: outOfHorizonInput,
} as any), /exceeds bounded horizon/);

const staleInput = structuredClone(decoded.inputCheckpoint) as any;
staleInput.channels[0].pending[0].targetTick = BASE_TICK;
staleInput.stateDigest = inputDigest(staleInput);
expectThrow(() => createFoundationReplicationProgressOverlay({
  ...decoded,
  inputCheckpoint: staleInput,
} as any), /pending tick is not future/);

const wrongGeneration = createFoundationReplicationProgressOverlay({
  ...decoded,
  baseCheckpointGeneration: 2,
  progressSequence: 2,
} as any);
expectThrow(() => assertFoundationReplicationProgressOverlayMatchesBase(wrongGeneration, nominal.base, 1), /base generation mismatch/);

const backwardsCounters = createFoundationReplicationProgressOverlay({
  ...decoded,
  progressSequence: 2,
  workerState: {
    ...decoded.workerState,
    acceptedInputRecords: 89,
    committedInputRecords: 89,
  },
} as any);
expectThrow(() => assertFoundationReplicationProgressOverlayMatchesBase(backwardsCounters, nominal.base, 1), /committedInputRecords moved backwards/);

const foreign = buildScenario(3, 15);
foreign.base.worldId = "different-world";
expectThrow(() => assertFoundationReplicationProgressOverlayMatchesBase(decoded, foreign.base, 1), /base world mismatch/);

const retargetBase = structuredClone(nominal.base);
retargetBase.workerState.bindings[1].actorSessionId = "session-replaced";
expectThrow(() => assertFoundationReplicationProgressOverlayMatchesBase(decoded, retargetBase, 1), /changed binding identity/);

console.log("MULTIPLAYER_FOUNDATION_PROGRESS_OVERLAY_PASS", JSON.stringify({
  nominalBytes: encoded.byteLength,
  nominalActors: 3,
  nominalPendingRecords: 45,
  worstCaseBytes: worstBytes,
  worstCaseActors: 6,
  worstCasePendingRecords: 6 * MAX_FUTURE_TICKS,
  lateWorldBytes,
  maxFutureTicks: MAX_FUTURE_TICKS,
  negativeCases: 8,
}));
