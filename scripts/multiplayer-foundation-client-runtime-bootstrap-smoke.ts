import assert from "node:assert/strict";
import {
  createFoundationClientBootstrap,
  type FoundationClientBootstrapEnvelope,
  type FoundationClientExecutionProfile,
} from "../src/multiplayer-foundation/client-bootstrap.ts";
import {
  FOUNDATION_BOX3D_RECORDING_SEED_FORMAT,
  createFoundationClientRuntimeBootstrap,
  hydrateFoundationClientRuntimeBootstrap,
  type FoundationClientExecutionSeed,
  type FoundationClientRuntimeBootstrapEnvelope,
} from "../src/multiplayer-foundation/client-runtime-bootstrap.ts";
import { FoundationEntityTopology } from "../src/multiplayer-foundation/entity-topology.ts";
import { FoundationRosterMachine } from "../src/multiplayer-foundation/roster-machine.ts";
import {
  WORLD_V0_PROP_LAYOUT,
  WORLD_V0_SIM_BUILD_ID,
  WORLD_V0_STATE_COMPONENTS,
} from "../src/world-v0-contract.ts";

const WORLD_EPOCH = "client-runtime-bootstrap-smoke-epoch-1";
const PROFILE: FoundationClientExecutionProfile = {
  profileId: "shared-yard-foundation-client-v1",
  buildId: WORLD_V0_SIM_BUILD_ID,
  stateSchemaId: "shared-yard-rigidbody-f32-13-v1",
};
const BOUNDARY_TICK = 240;

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

function cloneRuntimeEnvelope(
  value: FoundationClientRuntimeBootstrapEnvelope,
): FoundationClientRuntimeBootstrapEnvelope {
  return JSON.parse(JSON.stringify(value)) as FoundationClientRuntimeBootstrapEnvelope;
}

const roster = new FoundationRosterMachine({ worldEpoch: WORLD_EPOCH, capacity: 6 });
for (const [index, actorSessionId] of [
  "session-self",
  "session-a",
  "session-b",
  "session-c",
  "session-d",
  "session-e",
].entries()) {
  roster.queue({
    kind: "join",
    mutationId: `join-${index}`,
    effectiveTick: 10 + index,
    actorSessionId,
  });
}
roster.advanceTo(BOUNDARY_TICK);
const topologyModel = new FoundationEntityTopology(
  WORLD_EPOCH,
  WORLD_V0_PROP_LAYOUT.map((prop) => prop.id),
);
const topology = topologyModel.syncRoster(roster.snapshot());

const semanticBootstrap: FoundationClientBootstrapEnvelope = createFoundationClientBootstrap({
  worldEpoch: WORLD_EPOCH,
  canonicalTick: BOUNDARY_TICK,
  selfActorSessionId: "session-self",
  executionProfile: PROFILE,
  topology,
  stateComponents: WORLD_V0_STATE_COMPONENTS,
  entityStates: topology.entityOrder.map((netEntityId, entityIndex) => ({
    netEntityId,
    values: WORLD_V0_STATE_COMPONENTS.map((_, componentIndex) => (
      Math.fround(0.125 + entityIndex * 0.25 + componentIndex * 0.015625)
    )),
  })),
  inputBaselines: topology.entities
    .filter((entity) => entity.kind === "actor")
    .map((entity, index) => ({
      netEntityId: entity.netEntityId,
      actorSessionId: entity.actorSessionId!,
      x: index % 2 === 0 ? 0.25 : 0,
      z: index % 2 === 1 ? -0.25 : 0,
      jump: index === 3,
    })),
});

const seedBytes = Uint8Array.from([
  0x42, 0x33, 0x44, 0x00, 0x01, 0x7f, 0x10, 0x20,
  0x30, 0x40, 0x50, 0x60, 0xaa, 0xbb, 0xcc, 0xdd,
]);
const executionSeed: FoundationClientExecutionSeed = {
  formatId: FOUNDATION_BOX3D_RECORDING_SEED_FORMAT,
  worldEpoch: WORLD_EPOCH,
  canonicalTick: BOUNDARY_TICK,
  topologyRevision: topology.topologyRevision,
  topologyDigest: topology.topologyDigest,
  bodyNames: [
    "arena:static:0",
    "arena:static:1",
    "arena:static:2",
    "arena:static:3",
    "arena:static:4",
    ...topology.entityOrder,
  ],
  byteLength: seedBytes.byteLength,
  fnv1a32: fnv1a32(seedBytes),
  bytesBase64: encodeBase64(seedBytes),
};

const runtimeEnvelope = createFoundationClientRuntimeBootstrap({
  bootstrap: semanticBootstrap,
  executionSeed,
});
const hydrated = hydrateFoundationClientRuntimeBootstrap(
  JSON.parse(JSON.stringify(runtimeEnvelope)) as FoundationClientRuntimeBootstrapEnvelope,
  PROFILE,
  FOUNDATION_BOX3D_RECORDING_SEED_FORMAT,
);
assert.equal(hydrated.envelope.envelopeDigest, semanticBootstrap.envelopeDigest);
assert.equal(hydrated.executionSeedBytes.byteLength, seedBytes.byteLength);
assert.deepEqual([...hydrated.executionSeedBytes], [...seedBytes]);
assert.deepEqual(hydrated.projection.self, {
  netEntityId: "actor:0",
  actorSessionId: "session-self",
  actorOrdinal: 0,
  role: "self",
});
assert.equal(hydrated.projection.remotes.length, 5);
assert.equal(hydrated.stateByNetEntityId.size, 18);
assert.equal(hydrated.inputLedger.activeOwners().length, 6);
assert(topology.entityOrder.every((netEntityId) => hydrated.executionSeedBodyNames.includes(netEntityId)));

assert.throws(
  () => hydrateFoundationClientRuntimeBootstrap(
    runtimeEnvelope,
    PROFILE,
    "different-seed-format",
  ),
  /execution seed format mismatch/,
);

const wrongBoundary = cloneRuntimeEnvelope(runtimeEnvelope);
wrongBoundary.executionSeed.canonicalTick += 1;
assert.throws(
  () => hydrateFoundationClientRuntimeBootstrap(
    wrongBoundary,
    PROFILE,
    FOUNDATION_BOX3D_RECORDING_SEED_FORMAT,
  ),
  /canonical boundary does not match/,
);

const wrongTopology = cloneRuntimeEnvelope(runtimeEnvelope);
wrongTopology.executionSeed.topologyDigest = "0000000000000000";
assert.throws(
  () => hydrateFoundationClientRuntimeBootstrap(
    wrongTopology,
    PROFILE,
    FOUNDATION_BOX3D_RECORDING_SEED_FORMAT,
  ),
  /topology digest does not match/,
);

const missingDynamicBody = cloneRuntimeEnvelope(runtimeEnvelope);
missingDynamicBody.executionSeed.bodyNames = missingDynamicBody.executionSeed.bodyNames
  .filter((name) => name !== "actor:4");
assert.throws(
  () => hydrateFoundationClientRuntimeBootstrap(
    missingDynamicBody,
    PROFILE,
    FOUNDATION_BOX3D_RECORDING_SEED_FORMAT,
  ),
  /body manifest missing topology entity actor:4/,
);

const duplicateBody = cloneRuntimeEnvelope(runtimeEnvelope);
duplicateBody.executionSeed.bodyNames.push(duplicateBody.executionSeed.bodyNames[0]);
assert.throws(
  () => hydrateFoundationClientRuntimeBootstrap(
    duplicateBody,
    PROFILE,
    FOUNDATION_BOX3D_RECORDING_SEED_FORMAT,
  ),
  /duplicate execution seed body name/,
);

const wrongLength = cloneRuntimeEnvelope(runtimeEnvelope);
wrongLength.executionSeed.byteLength += 1;
assert.throws(
  () => hydrateFoundationClientRuntimeBootstrap(
    wrongLength,
    PROFILE,
    FOUNDATION_BOX3D_RECORDING_SEED_FORMAT,
  ),
  /byte length mismatch/,
);

const wrongChecksum = cloneRuntimeEnvelope(runtimeEnvelope);
wrongChecksum.executionSeed.fnv1a32 = "00000000";
assert.throws(
  () => hydrateFoundationClientRuntimeBootstrap(
    wrongChecksum,
    PROFILE,
    FOUNDATION_BOX3D_RECORDING_SEED_FORMAT,
  ),
  /checksum mismatch/,
);

const mutatedBytes = cloneRuntimeEnvelope(runtimeEnvelope);
const mutatedPayload = Uint8Array.from(seedBytes);
mutatedPayload[3] ^= 0xff;
mutatedBytes.executionSeed.bytesBase64 = encodeBase64(mutatedPayload);
assert.throws(
  () => hydrateFoundationClientRuntimeBootstrap(
    mutatedBytes,
    PROFILE,
    FOUNDATION_BOX3D_RECORDING_SEED_FORMAT,
  ),
  /checksum mismatch/,
);

const staleOuterDigest = cloneRuntimeEnvelope(runtimeEnvelope);
staleOuterDigest.executionSeed.bodyNames.push("arena:static:extra");
assert.throws(
  () => hydrateFoundationClientRuntimeBootstrap(
    staleOuterDigest,
    PROFILE,
    FOUNDATION_BOX3D_RECORDING_SEED_FORMAT,
  ),
  /runtime bootstrap envelope digest mismatch/,
);

const staleSemanticBootstrap = cloneRuntimeEnvelope(runtimeEnvelope);
staleSemanticBootstrap.bootstrap.canonicalTick += 1;
assert.throws(
  () => hydrateFoundationClientRuntimeBootstrap(
    staleSemanticBootstrap,
    PROFILE,
    FOUNDATION_BOX3D_RECORDING_SEED_FORMAT,
  ),
  /client bootstrap envelope digest mismatch|canonical boundary does not match/,
);

console.log("MULTIPLAYER_FOUNDATION_CLIENT_RUNTIME_BOOTSTRAP_PASS", JSON.stringify({
  worldEpoch: WORLD_EPOCH,
  boundaryTick: BOUNDARY_TICK,
  topologyRevision: topology.topologyRevision,
  dynamicEntities: topology.entityOrder.length,
  activeActors: hydrated.inputLedger.activeOwners().length,
  seedBodyCount: hydrated.executionSeedBodyNames.length,
  seedBytes: hydrated.executionSeedBytes.byteLength,
  semanticDigest: hydrated.envelope.envelopeDigest,
  runtimeDigest: hydrated.runtimeEnvelope.envelopeDigest,
}));
