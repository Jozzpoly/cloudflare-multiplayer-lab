import assert from "node:assert/strict";
import { WORLD_V0_PROP_LAYOUT } from "../src/world-v0-contract.ts";
import { FoundationEntityTopology, sameFoundationTopologyIdentity } from "../src/multiplayer-foundation/entity-topology.ts";
import { FoundationRosterMachine, type FoundationRosterMutation } from "../src/multiplayer-foundation/roster-machine.ts";

const worldEpoch = "topology-epoch-001";
const worldEntityIds = WORLD_V0_PROP_LAYOUT.map((prop) => prop.id);
const roster = new FoundationRosterMachine({ worldEpoch, capacity: 6 });
const topology = new FoundationEntityTopology(worldEpoch, worldEntityIds);

const emptyTopology = topology.syncRoster(roster.snapshot());
assert.deepEqual(emptyTopology.entityOrder, worldEntityIds, "a world may exist before an actor joins");
assert.equal(emptyTopology.topologyRevision, 0);

const joins: FoundationRosterMutation[] = [
  { kind: "join", mutationId: "join-a", effectiveTick: 1, actorSessionId: "session-a" },
  { kind: "join", mutationId: "join-b", effectiveTick: 4, actorSessionId: "session-b" },
  { kind: "join", mutationId: "join-c", effectiveTick: 8, actorSessionId: "session-c" },
  { kind: "join", mutationId: "join-d", effectiveTick: 8, actorSessionId: "session-d" },
  { kind: "join", mutationId: "join-e", effectiveTick: 12, actorSessionId: "session-e" },
  { kind: "join", mutationId: "join-f", effectiveTick: 16, actorSessionId: "session-f" },
];
for (const mutation of joins) roster.queue(mutation);

roster.advanceTo(1);
const oneActor = topology.syncRoster(roster.snapshot());
assert.deepEqual(oneActor.entityOrder.slice(0, 3), ["actor:0", "prop-0", "prop-1"]);
assert.equal(oneActor.entityOrder.length, 13);
assert.notEqual(oneActor.topologyDigest, emptyTopology.topologyDigest);

const identityBeforeTransportLoss = {
  worldEpoch: oneActor.worldEpoch,
  topologyRevision: oneActor.topologyRevision,
  topologyDigest: oneActor.topologyDigest,
};
assert.equal(roster.setTransportConnected("session-a", false), true);
const transportLost = topology.syncRoster(roster.snapshot());
assert(
  sameFoundationTopologyIdentity(identityBeforeTransportLoss, transportLost),
  "transport loss must not change topology identity",
);
assert.equal(roster.setTransportConnected("session-a", true), true);
assert(sameFoundationTopologyIdentity(transportLost, topology.syncRoster(roster.snapshot())));

roster.advanceTo(16);
const sixActorRoster = roster.snapshot();
const sixActorTopology = topology.syncRoster(sixActorRoster);
assert.deepEqual(
  sixActorTopology.entityOrder.slice(0, 6),
  ["actor:0", "actor:1", "actor:2", "actor:3", "actor:4", "actor:5"],
  "actor order must be ordinal-canonical rather than transport or Map insertion order",
);
assert.deepEqual(sixActorTopology.entityOrder.slice(6), worldEntityIds);
assert.equal(sixActorTopology.entityOrder.length, 18);
assert.equal(sixActorTopology.topologyRevision, 6);

assert.deepEqual(topology.validateEntityCoverage(sixActorTopology.entityOrder), {
  exact: true,
  missing: [],
  unexpected: [],
});
const incompleteCoverage = topology.validateEntityCoverage([
  ...sixActorTopology.entityOrder.filter((id) => id !== "actor:4"),
  "ghost:99",
]);
assert.equal(incompleteCoverage.exact, false);
assert.deepEqual(incompleteCoverage.missing, ["actor:4"]);
assert.deepEqual(incompleteCoverage.unexpected, ["ghost:99"]);

roster.queue({ kind: "retire", mutationId: "z-retire-c", effectiveTick: 20, actorId: "actor:2" });
roster.queue({ kind: "join", mutationId: "a-replacement", effectiveTick: 20, actorSessionId: "session-g" });
roster.advanceTo(20);
const replacementTopology = topology.syncRoster(roster.snapshot());
assert.deepEqual(
  replacementTopology.entityOrder.slice(0, 6),
  ["actor:0", "actor:1", "actor:3", "actor:4", "actor:5", "actor:6"],
);
assert.equal(replacementTopology.topologyRevision, 8);
assert.notEqual(replacementTopology.topologyDigest, sixActorTopology.topologyDigest);

assert.throws(
  () => topology.syncRoster(sixActorRoster),
  /cannot move backwards/,
  "a stale roster snapshot cannot roll topology identity backwards",
);

const forgedSameRevision = roster.snapshot();
forgedSameRevision.actors = forgedSameRevision.actors.slice(0, -1);
assert.throws(
  () => topology.syncRoster(forgedSameRevision),
  /changed without a roster topology revision/,
  "entity membership cannot change invisibly underneath one topology revision",
);

const wrongEpoch = new FoundationRosterMachine({ worldEpoch: "wrong-epoch", capacity: 6 });
assert.throws(() => topology.syncRoster(wrongEpoch.snapshot()), /does not match topology WorldEpoch/);
assert.throws(
  () => new FoundationEntityTopology(worldEpoch, ["actor:shadow"]),
  /reserved actor namespace/,
);
assert.throws(
  () => new FoundationEntityTopology(worldEpoch, ["prop-a", "prop-a"]),
  /duplicate persistent world NetEntityId/,
);

console.log(
  `MULTIPLAYER FOUNDATION TOPOLOGY SMOKE PASS · 0→6 actors + ${worldEntityIds.length} persistent world entities + topology revision/digest + exact coverage`,
);
