import assert from "node:assert/strict";
import { FoundationEntityTopology, type FoundationTopologySnapshot } from "../src/multiplayer-foundation/entity-topology.ts";
import { FoundationRosterMachine } from "../src/multiplayer-foundation/roster-machine.ts";
import {
  FoundationClientReplicaModel,
  type FoundationClientProjectionFrame,
} from "../src/multiplayer-foundation/client-replica-model.ts";

const WORLD_EPOCH = "client-replica-smoke-epoch-1";
const PERSISTENT_WORLD = ["prop:0", "prop:1", "prop:2"];

const roster = new FoundationRosterMachine({ worldEpoch: WORLD_EPOCH, capacity: 6 });
const topology = new FoundationEntityTopology(WORLD_EPOCH, PERSISTENT_WORLD);

function cloneTopology(value: FoundationTopologySnapshot): FoundationTopologySnapshot {
  return JSON.parse(JSON.stringify(value)) as FoundationTopologySnapshot;
}

function frame(canonicalTick: number): FoundationClientProjectionFrame {
  return {
    canonicalTick,
    topology: topology.syncRoster(roster.snapshot()),
  };
}

function join(actorSessionId: string, tick: number, mutationId = `join-${actorSessionId}`): void {
  roster.queue({ kind: "join", mutationId, effectiveTick: tick, actorSessionId });
}

function retire(actorId: `actor:${number}`, tick: number, mutationId = `retire-${actorId}-${tick}`): void {
  roster.queue({ kind: "retire", mutationId, effectiveTick: tick, actorId });
}

function advance(tick: number): void {
  roster.advanceTo(tick);
}

join("session-self", 10);
advance(10);
const initialFrame = frame(10);
const client = new FoundationClientReplicaModel("session-self");
const initial = client.applyFullProjection(initialFrame);
assert.equal(initial.status, "bootstrapped");
assert.equal(initial.snapshot?.self.netEntityId, "actor:0");
assert.deepEqual(initial.snapshot?.remotes, []);
assert.deepEqual(initial.snapshot?.worldEntityIds, PERSISTENT_WORLD);

join("session-peer-a", 20);
join("session-peer-b", 20);
advance(20);
const threeActorFrame = frame(20);
const threeActor = client.applyFullProjection(threeActorFrame);
assert.equal(threeActor.status, "applied");
assert.deepEqual(threeActor.addedRemoteNetEntityIds, ["actor:1", "actor:2"]);
assert.deepEqual(threeActor.removedRemoteNetEntityIds, []);
assert.deepEqual(threeActor.snapshot?.remotes.map((actor) => actor.netEntityId), ["actor:1", "actor:2"]);

join("session-peer-c", 30);
join("session-peer-d", 30);
join("session-peer-e", 30);
advance(30);
const sixActorFrame = frame(30);
const sixActor = client.applyFullProjection(sixActorFrame);
assert.equal(sixActor.status, "applied");
assert.equal(sixActor.snapshot?.remotes.length, 5);
assert.deepEqual(sixActor.addedRemoteNetEntityIds, ["actor:3", "actor:4", "actor:5"]);
assert.equal(sixActor.snapshot?.topologyRevision, 6);

const duplicate = client.applyFullProjection(sixActorFrame);
assert.equal(duplicate.status, "duplicate");
assert.deepEqual(duplicate.addedRemoteNetEntityIds, []);
assert.equal(duplicate.snapshot?.projectionDigest, sixActor.snapshot?.projectionDigest);

const refresh = client.applyFullProjection({
  canonicalTick: 35,
  topology: cloneTopology(sixActorFrame.topology),
});
assert.equal(refresh.status, "refreshed");
assert.equal(refresh.snapshot?.canonicalTick, 35);
assert.deepEqual(refresh.retainedRemoteNetEntityIds, ["actor:1", "actor:2", "actor:3", "actor:4", "actor:5"]);

const beforeStaleDigest = client.snapshot()?.projectionDigest;
const stale = client.applyFullProjection(threeActorFrame);
assert.equal(stale.status, "stale");
assert.equal(client.snapshot()?.projectionDigest, beforeStaleDigest);

const bindingConflict = cloneTopology(sixActorFrame.topology);
const peerA = bindingConflict.entities.find((entity) => entity.netEntityId === "actor:1");
assert(peerA);
peerA.actorSessionId = "session-illegal-rebind";
assert.throws(
  () => client.applyFullProjection({ canonicalTick: 36, topology: bindingConflict }),
  /binding changed without a topology revision/,
);

const digestConflict = cloneTopology(sixActorFrame.topology);
digestConflict.topologyDigest = "conflicting-topology-digest";
assert.throws(
  () => client.applyFullProjection({ canonicalTick: 36, topology: digestConflict }),
  /topology digest changed without a topology revision/,
);

retire("actor:2", 40, "a-retire-actor-2");
join("session-replacement-a", 40, "b-join-replacement-a");
advance(40);
const churnFrame = frame(40);
const churn = client.applyFullProjection(churnFrame);
assert.equal(churn.status, "applied");
assert.deepEqual(churn.removedRemoteNetEntityIds, ["actor:2"]);
assert.deepEqual(churn.addedRemoteNetEntityIds, ["actor:6"]);
assert.deepEqual(churn.retainedRemoteNetEntityIds, ["actor:1", "actor:3", "actor:4", "actor:5"]);
assert.deepEqual(churn.snapshot?.remotes.map((actor) => actor.netEntityId), ["actor:1", "actor:3", "actor:4", "actor:5", "actor:6"]);
assert.equal(churn.snapshot?.topologyRevision, 8);

const lateJoinClient = new FoundationClientReplicaModel("session-peer-d");
const lateJoin = lateJoinClient.applyFullProjection(churnFrame);
assert.equal(lateJoin.status, "bootstrapped");
assert.equal(lateJoin.snapshot?.self.netEntityId, "actor:4");
assert.equal(lateJoin.snapshot?.remotes.length, 5);
assert.deepEqual(lateJoin.snapshot?.remotes.map((actor) => actor.netEntityId), ["actor:0", "actor:1", "actor:3", "actor:5", "actor:6"]);
assert.deepEqual(lateJoin.snapshot?.entityOrder, churn.snapshot?.entityOrder);
assert.notEqual(lateJoin.snapshot?.projectionDigest, churn.snapshot?.projectionDigest);

const resumed = client.applyFullProjection({ canonicalTick: 47, topology: cloneTopology(churnFrame.topology) });
assert.equal(resumed.status, "refreshed");
assert.equal(resumed.snapshot?.self.actorSessionId, "session-self");
assert.equal(resumed.snapshot?.self.netEntityId, "actor:0");

retire("actor:3", 50, "a-retire-actor-3");
join("session-replacement-b", 50, "b-join-replacement-b");
advance(50);
const secondChurnFrame = frame(50);
const secondChurn = client.applyFullProjection(secondChurnFrame);
assert.equal(secondChurn.status, "applied");
assert.deepEqual(secondChurn.removedRemoteNetEntityIds, ["actor:3"]);
assert.deepEqual(secondChurn.addedRemoteNetEntityIds, ["actor:7"]);
assert.equal(secondChurn.snapshot?.remotes.length, 5);

const selfDriftTopology = cloneTopology(secondChurnFrame.topology);
selfDriftTopology.topologyRevision += 1;
selfDriftTopology.rosterRevision += 1;
selfDriftTopology.topologyDigest = "self-drift-topology";
const selfIndex = selfDriftTopology.entities.findIndex((entity) => entity.actorSessionId === "session-self");
assert(selfIndex >= 0);
selfDriftTopology.entities[selfIndex].netEntityId = "actor:99";
selfDriftTopology.entityOrder[selfIndex] = "actor:99";
assert.throws(
  () => client.applyFullProjection({ canonicalTick: 51, topology: selfDriftTopology }),
  /self actor identity drift/,
);

const snapshotBeforeSelfRetirement = client.snapshot();
retire("actor:0", 60, "a-retire-self");
join("session-new-self-candidate", 60, "b-join-new-self-candidate");
advance(60);
const selfRetiredFrame = frame(60);
assert.throws(
  () => client.applyFullProjection(selfRetiredFrame),
  /self ActorSession session-self must bind to exactly one active actor/,
);
assert.equal(client.snapshot()?.projectionDigest, snapshotBeforeSelfRetirement?.projectionDigest);

const epoch2Roster = new FoundationRosterMachine({ worldEpoch: "client-replica-smoke-epoch-2", capacity: 6 });
const epoch2Topology = new FoundationEntityTopology("client-replica-smoke-epoch-2", PERSISTENT_WORLD);
epoch2Roster.queue({ kind: "join", mutationId: "epoch2-self", effectiveTick: 1, actorSessionId: "session-self" });
epoch2Roster.advanceTo(1);
const epochMismatch = client.applyFullProjection({
  canonicalTick: 1,
  topology: epoch2Topology.syncRoster(epoch2Roster.snapshot()),
});
assert.equal(epochMismatch.status, "epoch_mismatch");
assert.equal(epochMismatch.observedWorldEpoch, "client-replica-smoke-epoch-2");
assert.equal(client.snapshot()?.worldEpoch, WORLD_EPOCH);

const malformedOrder = cloneTopology(secondChurnFrame.topology);
[malformedOrder.entityOrder[0], malformedOrder.entityOrder[1]] = [malformedOrder.entityOrder[1], malformedOrder.entityOrder[0]];
assert.throws(
  () => new FoundationClientReplicaModel("session-self").applyFullProjection({ canonicalTick: 50, topology: malformedOrder }),
  /entityOrder mismatch/,
);

const finalSnapshot = client.snapshot();
assert(finalSnapshot);
console.log("MULTIPLAYER_FOUNDATION_CLIENT_REPLICA_PASS", JSON.stringify({
  worldEpoch: finalSnapshot.worldEpoch,
  topologyRevision: finalSnapshot.topologyRevision,
  canonicalTick: finalSnapshot.canonicalTick,
  self: finalSnapshot.self.netEntityId,
  remotes: finalSnapshot.remotes.map((actor) => actor.netEntityId),
  projectionDigest: finalSnapshot.projectionDigest,
  lateJoinSelf: lateJoin.snapshot?.self.netEntityId,
  lateJoinRemoteCount: lateJoin.snapshot?.remotes.length,
}));
