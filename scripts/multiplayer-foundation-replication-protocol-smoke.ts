import assert from "node:assert/strict";
import {
  FOUNDATION_BOX3D_RECORDING_SEED_FORMAT,
  createFoundationClientRuntimeBootstrap,
} from "../src/multiplayer-foundation/client-runtime-bootstrap.ts";
import {
  createFoundationClientBootstrap,
  type FoundationClientExecutionProfile,
} from "../src/multiplayer-foundation/client-bootstrap.ts";
import { FoundationEntityTopology } from "../src/multiplayer-foundation/entity-topology.ts";
import { FoundationRosterMachine } from "../src/multiplayer-foundation/roster-machine.ts";
import {
  FOUNDATION_REPLICATION_PROTOCOL_REVISION,
  foundationReplicationInputCommit,
  foundationReplicationInputResult,
  foundationReplicationRuntimeSync,
  parseFoundationReplicationClientMessage,
  parseFoundationReplicationServerMessage,
  sameFoundationExecutionProfile,
} from "../src/multiplayer-foundation/replication-protocol.ts";

const WORLD_ID = "foundation-wire-world-1";
const WORLD_EPOCH = "foundation-wire-epoch-1";
const SELF_SESSION = "session-self";
const PROFILE: FoundationClientExecutionProfile = {
  profileId: "shared-yard-foundation-client-v1",
  buildId: "foundation-wire-build-1",
  stateSchemaId: "foundation-wire-f32-state-1",
};

function fnv1a32(bytes: Uint8Array): string {
  let hash = 0x811c9dc5 >>> 0;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

const roster = new FoundationRosterMachine({ worldEpoch: WORLD_EPOCH, capacity: 6 });
roster.queue({ kind: "join", mutationId: "join-self", effectiveTick: 1, actorSessionId: SELF_SESSION });
roster.queue({ kind: "join", mutationId: "join-peer", effectiveTick: 2, actorSessionId: "session-peer" });
roster.advanceTo(2);
const rosterSnapshot = roster.snapshot();
const topologyMachine = new FoundationEntityTopology(WORLD_EPOCH, ["prop:0"]);
const topology = topologyMachine.syncRoster(rosterSnapshot);
const stateComponents = ["position.x"];
const entityStates = topology.entityOrder.map((netEntityId, index) => ({
  netEntityId,
  values: [Math.fround(index / 8)],
}));
const bootstrap = createFoundationClientBootstrap({
  worldEpoch: WORLD_EPOCH,
  canonicalTick: 2,
  selfActorSessionId: SELF_SESSION,
  executionProfile: PROFILE,
  topology,
  stateComponents,
  entityStates,
  inputBaselines: rosterSnapshot.actors.map((actor) => ({
    netEntityId: actor.actorId,
    actorSessionId: actor.actorSessionId,
    x: 0,
    z: 0,
    jump: false,
  })),
});
const seedBytes = Uint8Array.from([11, 22, 33, 44, 55, 66, 77, 88]);
const runtimeBootstrap = createFoundationClientRuntimeBootstrap({
  bootstrap,
  executionSeed: {
    formatId: FOUNDATION_BOX3D_RECORDING_SEED_FORMAT,
    worldEpoch: WORLD_EPOCH,
    canonicalTick: 2,
    topologyRevision: topology.topologyRevision,
    topologyDigest: topology.topologyDigest,
    bodyNames: ["arena:static:0", ...topology.entityOrder],
    byteLength: seedBytes.byteLength,
    fnv1a32: fnv1a32(seedBytes),
    bytesBase64: encodeBase64(seedBytes),
  },
});

const join = {
  type: "foundation_join",
  revision: FOUNDATION_REPLICATION_PROTOCOL_REVISION,
  requestId: "join-request-1",
  worldId: WORLD_ID,
  actorSessionId: SELF_SESSION,
  executionProfile: PROFILE,
};
const parsedJoin = parseFoundationReplicationClientMessage(JSON.stringify(join));
assert(parsedJoin?.type === "foundation_join");
assert.equal(parsedJoin.worldId, WORLD_ID);
assert.equal(parsedJoin.actorSessionId, SELF_SESSION);
assert(sameFoundationExecutionProfile(parsedJoin.executionProfile, PROFILE));
assert(!sameFoundationExecutionProfile(parsedJoin.executionProfile, { ...PROFILE, buildId: "wrong-build" }));

const ready = {
  type: "foundation_runtime_ready",
  revision: FOUNDATION_REPLICATION_PROTOCOL_REVISION,
  worldId: WORLD_ID,
  worldEpoch: WORLD_EPOCH,
  actorSessionId: SELF_SESSION,
  syncId: "sync-join-1",
  runtimeDigest: runtimeBootstrap.envelopeDigest,
};
const parsedReady = parseFoundationReplicationClientMessage(JSON.stringify(ready));
assert(parsedReady?.type === "foundation_runtime_ready");
assert.equal(parsedReady.runtimeDigest, runtimeBootstrap.envelopeDigest);

const inputBatch = {
  type: "foundation_input_batch",
  revision: FOUNDATION_REPLICATION_PROTOCOL_REVISION,
  worldId: WORLD_ID,
  worldEpoch: WORLD_EPOCH,
  actorSessionId: SELF_SESSION,
  actorId: "actor:0",
  topologyRevision: topology.topologyRevision,
  batchSeq: 1,
  records: [
    { targetTick: 3, x: 0.5, z: -0.25 },
    { targetTick: 4, x: 0, z: 1 },
  ],
};
const parsedInput = parseFoundationReplicationClientMessage(JSON.stringify(inputBatch));
assert(parsedInput?.type === "foundation_input_batch");
assert.equal(parsedInput.records.length, 2);
assert.equal(parsedInput.records[1].targetTick, 4);

const runtimeSync = foundationReplicationRuntimeSync({
  syncId: "sync-join-1",
  reason: "join",
  worldId: WORLD_ID,
  worldEpoch: WORLD_EPOCH,
  actorSessionId: SELF_SESSION,
  previousTopologyRevision: null,
  runtimeBootstrap,
});
const expectation = {
  worldId: WORLD_ID,
  worldEpoch: WORLD_EPOCH,
  actorSessionId: SELF_SESSION,
  executionProfile: PROFILE,
  seedFormatId: FOUNDATION_BOX3D_RECORDING_SEED_FORMAT,
};
const parsedSync = parseFoundationReplicationServerMessage(JSON.stringify(runtimeSync), expectation);
assert(parsedSync?.message.type === "foundation_runtime_sync");
assert(parsedSync.hydratedRuntimeBootstrap);
assert.equal(parsedSync.hydratedRuntimeBootstrap.projection.self.netEntityId, "actor:0");
assert.equal(parsedSync.hydratedRuntimeBootstrap.projection.remotes.length, 1);
assert.deepEqual([...parsedSync.hydratedRuntimeBootstrap.executionSeedBytes], [...seedBytes]);

const topologySync = foundationReplicationRuntimeSync({
  ...runtimeSync,
  syncId: "sync-topology-2",
  reason: "topology_change",
  previousTopologyRevision: topology.topologyRevision - 1,
});
assert(parseFoundationReplicationServerMessage(JSON.stringify(topologySync), expectation));

const inputResult = foundationReplicationInputResult({
  worldId: WORLD_ID,
  worldEpoch: WORLD_EPOCH,
  actorSessionId: SELF_SESSION,
  actorId: "actor:0",
  batchSeq: 1,
  records: [
    { actorId: "actor:0", targetTick: 3, status: "accepted" },
    { actorId: "actor:0", targetTick: 4, status: "superseded" },
  ],
});
const parsedResult = parseFoundationReplicationServerMessage(JSON.stringify(inputResult), expectation);
assert(parsedResult?.message.type === "foundation_input_result");
assert.equal(parsedResult.message.records[0].status, "accepted");

const inputCommit = foundationReplicationInputCommit({
  worldId: WORLD_ID,
  worldEpoch: WORLD_EPOCH,
  recipientActorSessionId: SELF_SESSION,
  sourceActorSessionId: "session-peer",
  actorId: "actor:1",
  topologyRevision: topology.topologyRevision,
  batchSeq: 7,
  authorityBoundaryTick: 2,
  records: [
    { targetTick: 3, x: -0.5, z: 0.25 },
    { targetTick: 4, x: 0, z: -1 },
  ],
});
const parsedCommit = parseFoundationReplicationServerMessage(JSON.stringify(inputCommit), expectation);
assert(parsedCommit?.message.type === "foundation_input_commit");
assert.equal(parsedCommit.message.recipientActorSessionId, SELF_SESSION);
assert.equal(parsedCommit.message.sourceActorSessionId, "session-peer");
assert.equal(parsedCommit.message.actorId, "actor:1");
assert.equal(parsedCommit.message.records.length, 2);

const wrongRevision = { ...join, revision: "wrong-revision" };
assert.equal(parseFoundationReplicationClientMessage(JSON.stringify(wrongRevision)), null);
assert.equal(parseFoundationReplicationClientMessage("not-json"), null);
assert.equal(parseFoundationReplicationClientMessage(JSON.stringify({ ...join, actorSessionId: "bad session with spaces" })), null);
assert.equal(parseFoundationReplicationClientMessage(JSON.stringify({ ...inputBatch, actorId: "player-0" })), null);
assert.equal(parseFoundationReplicationClientMessage(JSON.stringify({ ...inputBatch, records: [{ targetTick: 3, x: 2, z: 0 }] })), null);
assert.equal(parseFoundationReplicationClientMessage(JSON.stringify({
  ...inputBatch,
  records: [
    { targetTick: 3, x: 0, z: 0 },
    { targetTick: 5, x: 0, z: 0 },
  ],
})), null);

assert.equal(
  parseFoundationReplicationServerMessage(JSON.stringify(runtimeSync), { ...expectation, actorSessionId: "session-peer" }),
  null,
);
assert.equal(
  parseFoundationReplicationServerMessage(JSON.stringify(runtimeSync), {
    ...expectation,
    executionProfile: { ...PROFILE, buildId: "wrong-build" },
  }),
  null,
);
assert.equal(
  parseFoundationReplicationServerMessage(JSON.stringify({ ...runtimeSync, worldEpoch: "wrong-epoch" }), expectation),
  null,
);
assert.equal(
  parseFoundationReplicationServerMessage(JSON.stringify({
    ...topologySync,
    previousTopologyRevision: topology.topologyRevision,
  }), expectation),
  null,
);

const corruptedRuntimeSync = JSON.parse(JSON.stringify(runtimeSync));
corruptedRuntimeSync.runtimeBootstrap.executionSeed.bytesBase64 = encodeBase64(Uint8Array.from([11, 22, 33, 44, 55, 66, 77, 89]));
assert.equal(parseFoundationReplicationServerMessage(JSON.stringify(corruptedRuntimeSync), expectation), null);

const wrongResultStatus = JSON.parse(JSON.stringify(inputResult));
wrongResultStatus.records[0].status = "silently_accepted";
assert.equal(parseFoundationReplicationServerMessage(JSON.stringify(wrongResultStatus), expectation), null);

assert.equal(
  parseFoundationReplicationServerMessage(JSON.stringify({
    ...inputCommit,
    recipientActorSessionId: "session-peer",
  }), expectation),
  null,
);
assert.equal(
  parseFoundationReplicationServerMessage(JSON.stringify({
    ...inputCommit,
    authorityBoundaryTick: 4,
    records: [{ targetTick: 3, x: 0, z: 0 }],
  }), expectation),
  null,
);
assert.equal(
  parseFoundationReplicationServerMessage(JSON.stringify({
    ...inputCommit,
    sourceActorSessionId: "bad source session",
  }), expectation),
  null,
);

console.log("MULTIPLAYER_FOUNDATION_REPLICATION_PROTOCOL_PASS", JSON.stringify({
  revision: FOUNDATION_REPLICATION_PROTOCOL_REVISION,
  worldId: WORLD_ID,
  worldEpoch: WORLD_EPOCH,
  topologyRevision: topology.topologyRevision,
  topologyDigest: topology.topologyDigest,
  runtimeDigest: runtimeBootstrap.envelopeDigest,
  seedBytes: seedBytes.byteLength,
  actors: rosterSnapshot.actors.length,
  clientMessages: ["join", "runtime_ready", "input_batch"],
  serverMessages: ["runtime_sync", "input_result", "input_commit"],
  malformedCases: 14,
}));