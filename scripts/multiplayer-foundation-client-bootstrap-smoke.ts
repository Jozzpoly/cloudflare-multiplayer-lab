import assert from "node:assert/strict";
import {
  createFoundationClientBootstrap,
  hydrateFoundationClientBootstrap,
  type FoundationClientBootstrapEnvelope,
  type FoundationClientExecutionProfile,
} from "../src/multiplayer-foundation/client-bootstrap.ts";
import { FoundationEntityTopology } from "../src/multiplayer-foundation/entity-topology.ts";
import { FoundationRosterMachine } from "../src/multiplayer-foundation/roster-machine.ts";

const WORLD_EPOCH = "client-bootstrap-smoke-epoch-1";
const PROFILE: FoundationClientExecutionProfile = {
  profileId: "realtime-rigidbody-foundation-v1",
  buildId: "client-bootstrap-smoke-build-1",
  stateSchemaId: "rigidbody-f32-6-v1",
};
const COMPONENTS = ["position.x", "position.y", "position.z", "velocity.x", "velocity.y", "velocity.z"];
const roster = new FoundationRosterMachine({ worldEpoch: WORLD_EPOCH, capacity: 6 });
const topology = new FoundationEntityTopology(WORLD_EPOCH, ["prop:0", "prop:1"]);

for (const [index, session] of ["session-self", "session-a", "session-b", "session-c", "session-d", "session-e"].entries()) {
  roster.queue({ kind: "join", mutationId: `join-${index}`, effectiveTick: 10 + index, actorSessionId: session });
}
roster.advanceTo(30);
const topology30 = topology.syncRoster(roster.snapshot());

function entityStatesFor(entityOrder: readonly string[], seed: number) {
  return entityOrder.map((netEntityId, index) => ({
    netEntityId,
    values: COMPONENTS.map((_, component) => Math.fround(seed + index * 0.25 + component * 0.03125)),
  }));
}

function baselinesFor(topologySnapshot: typeof topology30, seed: number) {
  return topologySnapshot.entities
    .filter((entity) => entity.kind === "actor")
    .map((entity, index) => ({
      netEntityId: entity.netEntityId,
      actorSessionId: entity.actorSessionId!,
      x: index % 2 === 0 ? seed : 0,
      z: index % 2 === 1 ? -seed : 0,
      jump: index === 2,
    }));
}

function cloneEnvelope(value: FoundationClientBootstrapEnvelope): FoundationClientBootstrapEnvelope {
  return JSON.parse(JSON.stringify(value)) as FoundationClientBootstrapEnvelope;
}

const envelope30 = createFoundationClientBootstrap({
  worldEpoch: WORLD_EPOCH,
  canonicalTick: 30,
  selfActorSessionId: "session-d",
  executionProfile: PROFILE,
  topology: topology30,
  stateComponents: COMPONENTS,
  entityStates: entityStatesFor(topology30.entityOrder, 1),
  inputBaselines: baselinesFor(topology30, 0.2),
});

const roundTripped = JSON.parse(JSON.stringify(envelope30)) as FoundationClientBootstrapEnvelope;
const hydrated30 = hydrateFoundationClientBootstrap(roundTripped, PROFILE);
assert.equal(hydrated30.projection.self.netEntityId, "actor:4");
assert.equal(hydrated30.projection.remotes.length, 5);
assert.equal(hydrated30.stateByNetEntityId.size, 8);
assert.deepEqual([...hydrated30.stateByNetEntityId.keys()], topology30.entityOrder);
assert.equal(hydrated30.inputLedger.activeOwners().length, 6);
const tick31 = hydrated30.inputLedger.resolveTick(31);
assert.equal(tick31.actors.length, 6);
assert.equal(tick31.actors.find((actor) => actor.actorSessionId === "session-d")?.z, -0.2);
assert.equal(tick31.actors.find((actor) => actor.actorSessionId === "session-b")?.jumpTrigger, false, "boundary jump baseline must not retrigger after bootstrap");

assert.throws(
  () => hydrateFoundationClientBootstrap(roundTripped, { ...PROFILE, buildId: "wrong-build" }),
  /execution profile mismatch/,
);

const mutatedState = cloneEnvelope(envelope30);
mutatedState.entityStates[0].values[0] = Math.fround(mutatedState.entityStates[0].values[0] + 0.5);
assert.throws(
  () => hydrateFoundationClientBootstrap(mutatedState, PROFILE),
  /state guard mismatch/,
);

const reorderedState = cloneEnvelope(envelope30);
[reorderedState.entityStates[0], reorderedState.entityStates[1]] = [reorderedState.entityStates[1], reorderedState.entityStates[0]];
assert.throws(
  () => hydrateFoundationClientBootstrap(reorderedState, PROFILE),
  /entity state order mismatch/,
);

const missingBaseline = cloneEnvelope(envelope30);
missingBaseline.inputBaselines.pop();
assert.throws(
  () => hydrateFoundationClientBootstrap(missingBaseline, PROFILE),
  /baselines must cover active actors exactly/,
);

const wrongBaselineIdentity = cloneEnvelope(envelope30);
wrongBaselineIdentity.inputBaselines[0].netEntityId = "actor:999";
assert.throws(
  () => hydrateFoundationClientBootstrap(wrongBaselineIdentity, PROFILE),
  /baseline identity mismatch/,
);

const wrongSelf = cloneEnvelope(envelope30);
wrongSelf.selfActorSessionId = "session-not-active";
wrongSelf.envelopeDigest = "intentionally-stale";
assert.throws(
  () => hydrateFoundationClientBootstrap(wrongSelf, PROFILE),
  /envelope digest mismatch|must bind to exactly one active actor/,
);

const wrongTopologyEpoch = cloneEnvelope(envelope30);
wrongTopologyEpoch.topology.worldEpoch = "different-epoch";
assert.throws(
  () => hydrateFoundationClientBootstrap(wrongTopologyEpoch, PROFILE),
  /topology WorldEpoch mismatch/,
);

const staleDigest = cloneEnvelope(envelope30);
staleDigest.inputBaselines[0].x = 0.35;
assert.throws(
  () => hydrateFoundationClientBootstrap(staleDigest, PROFILE),
  /envelope digest mismatch/,
);

assert.throws(
  () => createFoundationClientBootstrap({
    worldEpoch: WORLD_EPOCH,
    canonicalTick: 30,
    selfActorSessionId: "session-d",
    executionProfile: PROFILE,
    topology: topology30,
    stateComponents: COMPONENTS,
    entityStates: topology30.entityOrder.map((netEntityId, index) => ({
      netEntityId,
      values: COMPONENTS.map((_, component) => index === 0 && component === 0 ? 0.1 : Math.fround(index + component)),
    })),
    inputBaselines: baselinesFor(topology30, 0.2),
  }),
  /not canonical float32/,
);

const badNormalizedBaselines = baselinesFor(topology30, 0.2);
badNormalizedBaselines[0] = { ...badNormalizedBaselines[0], x: 1, z: 1 };
assert.throws(
  () => createFoundationClientBootstrap({
    worldEpoch: WORLD_EPOCH,
    canonicalTick: 30,
    selfActorSessionId: "session-d",
    executionProfile: PROFILE,
    topology: topology30,
    stateComponents: COMPONENTS,
    entityStates: entityStatesFor(topology30.entityOrder, 2),
    inputBaselines: badNormalizedBaselines,
  }),
  /must already be normalized/,
);

roster.queue({ kind: "retire", mutationId: "a-retire-actor-2", effectiveTick: 40, actorId: "actor:2" });
roster.queue({ kind: "join", mutationId: "b-join-replacement", effectiveTick: 40, actorSessionId: "session-replacement" });
roster.advanceTo(40);
const topology40 = topology.syncRoster(roster.snapshot());
const envelope40 = createFoundationClientBootstrap({
  worldEpoch: WORLD_EPOCH,
  canonicalTick: 40,
  selfActorSessionId: "session-d",
  executionProfile: PROFILE,
  topology: topology40,
  stateComponents: COMPONENTS,
  entityStates: entityStatesFor(topology40.entityOrder, 4),
  inputBaselines: baselinesFor(topology40, 0.3),
});
const hydrated40 = hydrateFoundationClientBootstrap(envelope40, PROFILE);
assert.equal(hydrated40.projection.self.netEntityId, "actor:4");
assert.deepEqual(hydrated40.projection.remotes.map((actor) => actor.netEntityId), ["actor:0", "actor:1", "actor:3", "actor:5", "actor:6"]);
assert.equal(hydrated40.inputLedger.activeOwners().some((actor) => actor.actorSessionId === "session-b"), false);
assert.equal(hydrated40.inputLedger.activeOwners().some((actor) => actor.actorSessionId === "session-replacement"), true);
assert.notEqual(envelope40.envelopeDigest, envelope30.envelopeDigest);

const continuityProjection = hydrated30.replicaModel.applyFullProjection({ canonicalTick: 40, topology: topology40 });
assert.equal(continuityProjection.status, "applied");
assert(continuityProjection.snapshot);
hydrated30.inputLedger.resyncProjection(continuityProjection.snapshot, envelope40.inputBaselines);
assert.deepEqual(hydrated30.inputLedger.activeOwners().map((actor) => actor.netEntityId), ["actor:0", "actor:1", "actor:3", "actor:4", "actor:5", "actor:6"]);
assert.equal(hydrated30.inputLedger.resolveTick(41).actors.length, 6);

console.log("MULTIPLAYER_FOUNDATION_CLIENT_BOOTSTRAP_PASS", JSON.stringify({
  worldEpoch: WORLD_EPOCH,
  initialBoundary: envelope30.canonicalTick,
  resyncBoundary: envelope40.canonicalTick,
  initialEnvelopeDigest: envelope30.envelopeDigest,
  resyncEnvelopeDigest: envelope40.envelopeDigest,
  self: hydrated40.projection.self.netEntityId,
  remoteCount: hydrated40.projection.remotes.length,
  stateEntities: hydrated40.stateByNetEntityId.size,
}));
