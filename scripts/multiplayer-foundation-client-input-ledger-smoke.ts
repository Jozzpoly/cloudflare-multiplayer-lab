import assert from "node:assert/strict";
import { FoundationClientInputLedger, type FoundationClientInputBaseline } from "../src/multiplayer-foundation/client-input-ledger.ts";
import { FoundationClientReplicaModel, type FoundationClientReplicaSnapshot } from "../src/multiplayer-foundation/client-replica-model.ts";
import { FoundationEntityTopology } from "../src/multiplayer-foundation/entity-topology.ts";
import { FoundationRosterMachine } from "../src/multiplayer-foundation/roster-machine.ts";

const WORLD_EPOCH = "client-input-ledger-smoke-epoch-1";
const roster = new FoundationRosterMachine({ worldEpoch: WORLD_EPOCH, capacity: 6 });
const topology = new FoundationEntityTopology(WORLD_EPOCH, ["prop:0", "prop:1"]);
const projection = new FoundationClientReplicaModel("session-self");

function join(session: string, tick: number, mutationId = `join-${session}`): void {
  roster.queue({ kind: "join", mutationId, effectiveTick: tick, actorSessionId: session });
}

function retire(actorId: `actor:${number}`, tick: number, mutationId: string): void {
  roster.queue({ kind: "retire", mutationId, effectiveTick: tick, actorId });
}

function project(tick: number): FoundationClientReplicaSnapshot {
  const topologySnapshot = topology.syncRoster(roster.snapshot());
  const result = projection.applyFullProjection({ canonicalTick: tick, topology: topologySnapshot });
  assert(result.snapshot);
  return result.snapshot;
}

function baseline(snapshot: FoundationClientReplicaSnapshot, values: Record<string, { x: number; z: number; jump: boolean }>): FoundationClientInputBaseline[] {
  return [snapshot.self, ...snapshot.remotes].map((actor) => ({
    netEntityId: actor.netEntityId,
    actorSessionId: actor.actorSessionId,
    ...(values[actor.actorSessionId] ?? { x: 0, z: 0, jump: false }),
  }));
}

for (const [index, session] of ["session-self", "session-a", "session-b", "session-c", "session-d", "session-e"].entries()) {
  join(session, 10 + index, `join-${index}`);
}
roster.advanceTo(30);
const sixActorProjection = project(30);
assert.equal(sixActorProjection.remotes.length, 5);

const ledger = new FoundationClientInputLedger("session-self");
const initialBaselines = baseline(sixActorProjection, {
  "session-self": { x: 0.1, z: 0, jump: false },
  "session-a": { x: 0, z: 0.2, jump: false },
  "session-b": { x: 0.25, z: 0, jump: true },
  "session-c": { x: 0, z: 0, jump: false },
  "session-d": { x: -0.15, z: 0, jump: false },
  "session-e": { x: 0, z: -0.1, jump: false },
});
ledger.bootstrapProjection(sixActorProjection, initialBaselines);
assert.equal(ledger.activeOwners().length, 6);
assert.deepEqual(ledger.activeOwners().map((actor) => actor.netEntityId), ["actor:0", "actor:1", "actor:2", "actor:3", "actor:4", "actor:5"]);

const held31 = ledger.resolveTick(31);
assert.equal(held31.actors.length, 6);
assert.equal(held31.actors[0].x, 0.1);
assert.equal(held31.actors[1].z, 0.2);
assert.equal(held31.actors[2].jump, false);
assert.equal(held31.actors[2].jumpTrigger, false);
assert(held31.actors.every((actor) => actor.source === "hold"));

assert.deepEqual(
  ledger.recordPredicted({ netEntityId: "actor:0", actorSessionId: "session-self", targetTick: 31, x: 1, z: 0, jump: true }, "local"),
  { status: "accepted", replayFromTick: 31 },
);
assert.deepEqual(
  ledger.recordPredicted({ netEntityId: "actor:1", actorSessionId: "session-a", targetTick: 31, x: 0, z: 1, jump: true }, "peer"),
  { status: "accepted", replayFromTick: 31 },
);
assert.deepEqual(
  ledger.recordPredicted({ netEntityId: "actor:2", actorSessionId: "session-b", targetTick: 31, x: 0.5, z: 0, jump: true }, "peer"),
  { status: "accepted", replayFromTick: 31 },
);
assert.equal(
  ledger.recordPredicted({ netEntityId: "actor:4", actorSessionId: "session-d", targetTick: 32, x: 3, z: 4, jump: false }, "peer").status,
  "accepted",
);

const predicted31 = ledger.resolveTick(31);
const self31 = predicted31.actors.find((actor) => actor.actorSessionId === "session-self")!;
const peerA31 = predicted31.actors.find((actor) => actor.actorSessionId === "session-a")!;
const peerB31 = predicted31.actors.find((actor) => actor.actorSessionId === "session-b")!;
assert.equal(self31.jumpTrigger, true);
assert.equal(peerA31.jumpTrigger, true);
assert.equal(peerB31.jump, true);
assert.equal(peerB31.jumpTrigger, false, "baseline jump=true must prevent a duplicate rising edge");

const predicted32 = ledger.resolveTick(32);
assert.equal(predicted32.actors.find((actor) => actor.actorSessionId === "session-self")?.x, 1);
assert.equal(predicted32.actors.find((actor) => actor.actorSessionId === "session-self")?.jump, false);
assert.equal(predicted32.actors.find((actor) => actor.actorSessionId === "session-a")?.z, 1);
assert.equal(predicted32.actors.find((actor) => actor.actorSessionId === "session-d")?.x, 0.6);
assert.equal(predicted32.actors.find((actor) => actor.actorSessionId === "session-d")?.z, 0.8);

const authorityCorrection = ledger.recordAuthoritative({
  netEntityId: "actor:1",
  actorSessionId: "session-a",
  targetTick: 31,
  x: -1,
  z: 0,
  jump: false,
});
assert.equal(authorityCorrection.status, "accepted");
assert.equal(authorityCorrection.replayFromTick, 31);
assert.equal(ledger.resolveTick(31).actors.find((actor) => actor.actorSessionId === "session-a")?.x, -1);
assert.equal(ledger.resolveTick(32).actors.find((actor) => actor.actorSessionId === "session-a")?.x, -1);

const matchingAuthority = ledger.recordAuthoritative({
  netEntityId: "actor:0",
  actorSessionId: "session-self",
  targetTick: 31,
  x: 1,
  z: 0,
  jump: true,
});
assert.equal(matchingAuthority.status, "accepted");
assert.equal(matchingAuthority.replayFromTick, null, "provenance-only authority confirmation must not force replay");
assert.equal(ledger.resolveTick(31).actors.find((actor) => actor.actorSessionId === "session-self")?.source, "authority");

assert.equal(
  ledger.recordPredicted({ netEntityId: "actor:1", actorSessionId: "session-a", targetTick: 33, x: 0, z: 0, jump: false }, "local").status,
  "rejected_wrong_source_role",
);
assert.equal(
  ledger.recordPredicted({ netEntityId: "actor:0", actorSessionId: "session-self", targetTick: 33, x: 0, z: 0, jump: false }, "peer").status,
  "rejected_wrong_source_role",
);
assert.equal(
  ledger.recordPredicted({ netEntityId: "actor:999", actorSessionId: "session-a", targetTick: 33, x: 0, z: 0, jump: false }, "peer").status,
  "rejected_identity_mismatch",
);
assert.equal(
  ledger.recordPredicted({ netEntityId: "actor:0", actorSessionId: "session-self", targetTick: 30, x: 0, z: 0, jump: false }, "local").status,
  "rejected_late",
);
assert.equal(
  ledger.recordAuthoritative({ netEntityId: "actor:0", actorSessionId: "session-self", targetTick: 29, x: 0, z: 0, jump: false }).status,
  "rejected_late",
);

retire("actor:2", 40, "a-retire-actor-2");
join("session-replacement", 40, "b-join-replacement");
roster.advanceTo(40);
const churnProjection = project(40);
ledger.syncProjection(churnProjection);
assert.deepEqual(ledger.activeOwners().map((actor) => actor.netEntityId), ["actor:0", "actor:1", "actor:3", "actor:4", "actor:5", "actor:6"]);
assert.equal(
  ledger.recordPredicted({ netEntityId: "actor:2", actorSessionId: "session-b", targetTick: 41, x: 1, z: 0, jump: false }, "peer").status,
  "rejected_unknown_actor",
);
assert.equal(
  ledger.recordPredicted({ netEntityId: "actor:2", actorSessionId: "session-replacement", targetTick: 41, x: 1, z: 0, jump: false }, "peer").status,
  "rejected_identity_mismatch",
);
assert.equal(
  ledger.recordPredicted({ netEntityId: "actor:6", actorSessionId: "session-replacement", targetTick: 41, x: 0, z: -1, jump: true }, "peer").status,
  "accepted",
);
const churn41 = ledger.resolveTick(41);
const replacement41 = churn41.actors.find((actor) => actor.actorSessionId === "session-replacement")!;
assert.equal(replacement41.z, -1);
assert.equal(replacement41.jumpTrigger, true);
assert.equal(churn41.actors.find((actor) => actor.actorSessionId === "session-a")?.x, -1, "retained actor must keep authoritative hold through topology churn");

const lateProjectionModel = new FoundationClientReplicaModel("session-d");
const lateProjectionResult = lateProjectionModel.applyFullProjection({
  canonicalTick: 40,
  topology: topology.snapshot(),
});
assert(lateProjectionResult.snapshot);
const lateLedger = new FoundationClientInputLedger("session-d");
assert.throws(
  () => lateLedger.bootstrapProjection(lateProjectionResult.snapshot!, []),
  /baseline must cover every active actor/,
);
const lateBaselines = baseline(lateProjectionResult.snapshot, {
  "session-self": { x: 0.4, z: 0, jump: false },
  "session-a": { x: -0.5, z: 0, jump: false },
  "session-c": { x: 0, z: 0.25, jump: false },
  "session-d": { x: 0, z: -0.75, jump: false },
  "session-e": { x: 0.1, z: 0.1, jump: false },
  "session-replacement": { x: 0, z: 0, jump: true },
});
lateLedger.bootstrapProjection(lateProjectionResult.snapshot, lateBaselines);
const late41 = lateLedger.resolveTick(41);
assert.equal(late41.actors.length, 6);
assert.equal(late41.actors.find((actor) => actor.actorSessionId === "session-d")?.z, -0.75);
assert.equal(late41.actors.find((actor) => actor.actorSessionId === "session-replacement")?.jumpTrigger, false);

assert.equal(
  lateLedger.recordPredicted({ netEntityId: "actor:4", actorSessionId: "session-d", targetTick: 46, x: 1, z: 0, jump: true }, "local").status,
  "accepted",
);
assert.equal(lateLedger.resolveTick(46).actors.find((actor) => actor.actorSessionId === "session-d")?.x, 1);
const refreshedProjection = lateProjectionModel.applyFullProjection({ canonicalTick: 45, topology: topology.snapshot() });
assert(refreshedProjection.snapshot);
const resyncBaselines = baseline(refreshedProjection.snapshot, {
  "session-self": { x: 0, z: 0.2, jump: false },
  "session-a": { x: 0, z: 0, jump: false },
  "session-c": { x: -0.25, z: 0, jump: false },
  "session-d": { x: 0, z: 0.5, jump: false },
  "session-e": { x: 0, z: 0, jump: false },
  "session-replacement": { x: 0.3, z: 0, jump: false },
});
lateLedger.resyncProjection(refreshedProjection.snapshot, resyncBaselines);
const afterResync46 = lateLedger.resolveTick(46);
assert.equal(afterResync46.actors.find((actor) => actor.actorSessionId === "session-d")?.x, 0);
assert.equal(afterResync46.actors.find((actor) => actor.actorSessionId === "session-d")?.z, 0.5, "resync must discard pre-resync local prediction and hold the new baseline");

const epoch2Roster = new FoundationRosterMachine({ worldEpoch: "client-input-ledger-smoke-epoch-2", capacity: 1 });
const epoch2Topology = new FoundationEntityTopology("client-input-ledger-smoke-epoch-2", []);
epoch2Roster.queue({ kind: "join", mutationId: "epoch2-self", effectiveTick: 1, actorSessionId: "session-d" });
epoch2Roster.advanceTo(1);
const epoch2ProjectionModel = new FoundationClientReplicaModel("session-d");
const epoch2Projection = epoch2ProjectionModel.applyFullProjection({ canonicalTick: 1, topology: epoch2Topology.syncRoster(epoch2Roster.snapshot()) });
assert(epoch2Projection.snapshot);
assert.throws(
  () => lateLedger.resyncProjection(epoch2Projection.snapshot!, baseline(epoch2Projection.snapshot!, {})),
  /cannot resync across WorldEpoch/,
);

console.log("MULTIPLAYER_FOUNDATION_CLIENT_INPUT_LEDGER_PASS", JSON.stringify({
  worldEpoch: WORLD_EPOCH,
  activeOwners: ledger.activeOwners().length,
  correctionReplayFromTick: authorityCorrection.replayFromTick,
  churnReplacement: replacement41.netEntityId,
  lateJoinSelf: lateProjectionResult.snapshot.self.netEntityId,
  lateJoinActors: late41.actors.length,
  resyncBoundary: refreshedProjection.snapshot.canonicalTick,
}));
