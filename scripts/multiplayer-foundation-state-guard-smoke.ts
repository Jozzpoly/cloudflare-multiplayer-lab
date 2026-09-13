import assert from "node:assert/strict";
import { WORLD_V0_PROP_LAYOUT, WORLD_V0_STATE_COMPONENTS } from "../src/world-v0-contract.ts";
import { FoundationEntityTopology } from "../src/multiplayer-foundation/entity-topology.ts";
import { FoundationRosterMachine } from "../src/multiplayer-foundation/roster-machine.ts";
import {
  firstFoundationStateGuardDifference,
  packFoundationStateGuard,
} from "../src/multiplayer-foundation/state-guard.ts";

const worldEpoch = "guard-epoch-001";
const roster = new FoundationRosterMachine({ worldEpoch, capacity: 6 });
const topology = new FoundationEntityTopology(worldEpoch, WORLD_V0_PROP_LAYOUT.map((prop) => prop.id));

for (let index = 0; index < 6; index += 1) {
  roster.queue({
    kind: "join",
    mutationId: `join-${index}`,
    effectiveTick: index + 1,
    actorSessionId: `session-${index}`,
  });
}
roster.advanceTo(6);
const sixActorTopology = topology.syncRoster(roster.snapshot());
assert.equal(sixActorTopology.entityOrder.length, 18);

function makeStateValues(mutate?: { entityId: string; componentIndex: number; delta: number }): Map<string, number[]> {
  const result = new Map<string, number[]>();
  sixActorTopology.entityOrder.forEach((entityId, entityIndex) => {
    const values = WORLD_V0_STATE_COMPONENTS.map((_, componentIndex) => entityIndex * 100 + componentIndex + 0.25);
    if (mutate?.entityId === entityId) values[mutate.componentIndex] += mutate.delta;
    result.set(entityId, values);
  });
  return result;
}

const referenceValues = makeStateValues();
const reference = packFoundationStateGuard(
  sixActorTopology,
  WORLD_V0_STATE_COMPONENTS,
  (entityId) => referenceValues.get(entityId) ?? [],
);
const identical = packFoundationStateGuard(
  sixActorTopology,
  WORLD_V0_STATE_COMPONENTS,
  (entityId) => referenceValues.get(entityId) ?? [],
);
assert.equal(reference.entityCount, 18);
assert.equal(reference.componentCount, 13);
assert.equal(reference.packed.length, 18 * 13 * 8, "guard width must derive from dynamic topology rather than fixed 14 entities");
assert.equal(
  firstFoundationStateGuardDifference(reference, identical, sixActorTopology, WORLD_V0_STATE_COMPONENTS),
  null,
);

const changedValues = makeStateValues({ entityId: "actor:3", componentIndex: 2, delta: 0.5 });
const changed = packFoundationStateGuard(
  sixActorTopology,
  WORLD_V0_STATE_COMPONENTS,
  (entityId) => changedValues.get(entityId) ?? [],
);
const stateDifference = firstFoundationStateGuardDifference(
  reference,
  changed,
  sixActorTopology,
  WORLD_V0_STATE_COMPONENTS,
);
assert(stateDifference && stateDifference.field === "state-scalar");
assert.equal(stateDifference.netEntityId, "actor:3");
assert.equal(stateDifference.component, "position.z");

const identityBeforeTransportLoss = {
  worldEpoch: sixActorTopology.worldEpoch,
  topologyRevision: sixActorTopology.topologyRevision,
  topologyDigest: sixActorTopology.topologyDigest,
};
assert.equal(roster.setTransportConnected("session-3", false), true);
const afterTransportLoss = topology.syncRoster(roster.snapshot());
assert.deepEqual(
  {
    worldEpoch: afterTransportLoss.worldEpoch,
    topologyRevision: afterTransportLoss.topologyRevision,
    topologyDigest: afterTransportLoss.topologyDigest,
  },
  identityBeforeTransportLoss,
  "transport loss must not invalidate physics guard topology",
);

roster.queue({ kind: "retire", mutationId: "retire-3", effectiveTick: 10, actorId: "actor:3" });
roster.queue({ kind: "join", mutationId: "replacement", effectiveTick: 10, actorSessionId: "session-6" });
roster.advanceTo(10);
const replacementTopology = topology.syncRoster(roster.snapshot());
assert.equal(replacementTopology.topologyRevision, 8);
assert.notEqual(replacementTopology.topologyDigest, sixActorTopology.topologyDigest);

const replacementValues = new Map<string, number[]>();
replacementTopology.entityOrder.forEach((entityId, entityIndex) => {
  replacementValues.set(entityId, WORLD_V0_STATE_COMPONENTS.map((_, componentIndex) => entityIndex * 10 + componentIndex));
});
const replacementGuard = packFoundationStateGuard(
  replacementTopology,
  WORLD_V0_STATE_COMPONENTS,
  (entityId) => replacementValues.get(entityId) ?? [],
);
const topologyDifference = firstFoundationStateGuardDifference(
  reference,
  replacementGuard,
  sixActorTopology,
  WORLD_V0_STATE_COMPONENTS,
);
assert(topologyDifference);
assert.equal(topologyDifference.field, "topologyRevision", "topology mismatch must be diagnosed before packed-state width/value comparison");

assert.throws(
  () => packFoundationStateGuard(sixActorTopology, WORLD_V0_STATE_COMPONENTS, (entityId) =>
    entityId === "actor:0" ? [1, 2] : referenceValues.get(entityId) ?? []
  ),
  /values missing for actor:0/,
);
assert.throws(
  () => packFoundationStateGuard(sixActorTopology, WORLD_V0_STATE_COMPONENTS, (entityId) => {
    const values = [...(referenceValues.get(entityId) ?? [])];
    if (entityId === "actor:0") values[0] = Number.NaN;
    return values;
  }),
  /non-finite value for actor:0/,
);

console.log(
  "MULTIPLAYER FOUNDATION STATE GUARD SMOKE PASS · dynamic 18-entity packing + topology-bound comparison + actor/component diagnostics",
);
