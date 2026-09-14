import { foundationCheckpointDigest } from "./checkpoint-digest.ts";
import {
  FoundationClientInputLedger,
  type FoundationClientInputBaseline,
} from "./client-input-ledger.ts";
import {
  FoundationClientReplicaModel,
  type FoundationClientReplicaSnapshot,
} from "./client-replica-model.ts";
import type { FoundationTopologySnapshot } from "./entity-topology.ts";
import {
  firstFoundationStateGuardDifference,
  packFoundationStateGuard,
  type FoundationStateGuard,
} from "./state-guard.ts";

export const FOUNDATION_CLIENT_BOOTSTRAP_REVISION = "multiplayer-foundation-client-bootstrap-v1";

export interface FoundationClientExecutionProfile {
  profileId: string;
  buildId: string;
  stateSchemaId: string;
}

export interface FoundationClientBootstrapEntityState {
  netEntityId: string;
  values: number[];
}

export interface FoundationClientBootstrapEnvelope {
  revision: typeof FOUNDATION_CLIENT_BOOTSTRAP_REVISION;
  worldEpoch: string;
  canonicalTick: number;
  selfActorSessionId: string;
  executionProfile: FoundationClientExecutionProfile;
  topology: FoundationTopologySnapshot;
  stateComponents: string[];
  entityStates: FoundationClientBootstrapEntityState[];
  stateGuard: FoundationStateGuard;
  inputBaselines: FoundationClientInputBaseline[];
  envelopeDigest: string;
}

export interface FoundationClientBootstrapInput {
  worldEpoch: string;
  canonicalTick: number;
  selfActorSessionId: string;
  executionProfile: FoundationClientExecutionProfile;
  topology: FoundationTopologySnapshot;
  stateComponents: readonly string[];
  entityStates: readonly FoundationClientBootstrapEntityState[];
  inputBaselines: readonly FoundationClientInputBaseline[];
}

export interface FoundationClientBootstrapExpectation {
  profileId: string;
  buildId: string;
  stateSchemaId: string;
}

export interface FoundationHydratedClientBootstrap {
  envelope: FoundationClientBootstrapEnvelope;
  projection: FoundationClientReplicaSnapshot;
  replicaModel: FoundationClientReplicaModel;
  inputLedger: FoundationClientInputLedger;
  stateByNetEntityId: Map<string, number[]>;
}

function assertNonEmpty(value: string, label: string): void {
  if (value.length === 0) throw new Error(`${label} must be non-empty`);
}

function assertTick(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} must be a non-negative safe integer`);
}

function cloneTopology(topology: FoundationTopologySnapshot): FoundationTopologySnapshot {
  return {
    ...topology,
    entityOrder: [...topology.entityOrder],
    entities: topology.entities.map((entity) => ({ ...entity })),
  };
}

function cloneBaseline(value: FoundationClientInputBaseline): FoundationClientInputBaseline {
  return { ...value };
}

function cloneEnvelope(envelope: FoundationClientBootstrapEnvelope): FoundationClientBootstrapEnvelope {
  return {
    ...envelope,
    executionProfile: { ...envelope.executionProfile },
    topology: cloneTopology(envelope.topology),
    stateComponents: [...envelope.stateComponents],
    entityStates: envelope.entityStates.map((entity) => ({ netEntityId: entity.netEntityId, values: [...entity.values] })),
    stateGuard: { ...envelope.stateGuard },
    inputBaselines: envelope.inputBaselines.map(cloneBaseline),
  };
}

function assertExecutionProfile(profile: FoundationClientExecutionProfile): void {
  assertNonEmpty(profile.profileId, "execution profile id");
  assertNonEmpty(profile.buildId, "execution build id");
  assertNonEmpty(profile.stateSchemaId, "execution state schema id");
}

function assertStateComponents(components: readonly string[]): void {
  if (components.length === 0) throw new Error("bootstrap state components must be non-empty");
  const seen = new Set<string>();
  for (const component of components) {
    assertNonEmpty(component, "bootstrap state component");
    if (seen.has(component)) throw new Error(`duplicate bootstrap state component ${component}`);
    seen.add(component);
  }
}

function canonicalStateMap(
  topology: FoundationTopologySnapshot,
  components: readonly string[],
  entityStates: readonly FoundationClientBootstrapEntityState[],
): Map<string, number[]> {
  if (entityStates.length !== topology.entityOrder.length) {
    throw new Error("bootstrap entity state must cover topology exactly");
  }
  const stateByNetEntityId = new Map<string, number[]>();
  entityStates.forEach((entity, index) => {
    assertNonEmpty(entity.netEntityId, `bootstrap entity state ${index} NetEntityId`);
    if (entity.netEntityId !== topology.entityOrder[index]) {
      throw new Error(`bootstrap entity state order mismatch at index ${index}`);
    }
    if (stateByNetEntityId.has(entity.netEntityId)) {
      throw new Error(`duplicate bootstrap entity state ${entity.netEntityId}`);
    }
    if (!Array.isArray(entity.values) || entity.values.length !== components.length) {
      throw new Error(`bootstrap state component count mismatch for ${entity.netEntityId}`);
    }
    const values = entity.values.map((value, componentIndex) => {
      if (!Number.isFinite(value)) {
        throw new Error(`bootstrap non-finite state ${entity.netEntityId}.${components[componentIndex]}`);
      }
      if (!Object.is(Math.fround(value), value)) {
        throw new Error(`bootstrap state ${entity.netEntityId}.${components[componentIndex]} is not canonical float32`);
      }
      return value;
    });
    stateByNetEntityId.set(entity.netEntityId, values);
  });
  return stateByNetEntityId;
}

function assertBaselineCoverage(
  topology: FoundationTopologySnapshot,
  baselines: readonly FoundationClientInputBaseline[],
): void {
  const actors = topology.entities.filter((entity) => entity.kind === "actor");
  if (baselines.length !== actors.length) throw new Error("bootstrap input baselines must cover active actors exactly");
  const actorBySession = new Map(actors.map((actor) => [actor.actorSessionId, actor] as const));
  const seen = new Set<string>();
  for (const baseline of baselines) {
    assertNonEmpty(baseline.actorSessionId, "bootstrap baseline ActorSessionId");
    assertNonEmpty(baseline.netEntityId, "bootstrap baseline NetEntityId");
    if (seen.has(baseline.actorSessionId)) throw new Error(`duplicate bootstrap baseline ${baseline.actorSessionId}`);
    seen.add(baseline.actorSessionId);
    const actor = actorBySession.get(baseline.actorSessionId);
    if (!actor) throw new Error(`bootstrap baseline references inactive ActorSession ${baseline.actorSessionId}`);
    if (actor.netEntityId !== baseline.netEntityId) throw new Error(`bootstrap baseline identity mismatch for ${baseline.actorSessionId}`);
    if (!Number.isFinite(baseline.x) || !Number.isFinite(baseline.z)) throw new Error("bootstrap baseline input must be finite");
    if (Math.hypot(baseline.x, baseline.z) > 1 + 1e-12) throw new Error("bootstrap baseline input must already be normalized");
  }
  if (seen.size !== actors.length) throw new Error("bootstrap input baseline coverage mismatch");
}

function envelopeDigestBase(envelope: Omit<FoundationClientBootstrapEnvelope, "envelopeDigest">): object {
  return {
    revision: envelope.revision,
    worldEpoch: envelope.worldEpoch,
    canonicalTick: envelope.canonicalTick,
    selfActorSessionId: envelope.selfActorSessionId,
    executionProfile: envelope.executionProfile,
    topology: envelope.topology,
    stateComponents: envelope.stateComponents,
    entityStates: envelope.entityStates,
    stateGuard: envelope.stateGuard,
    inputBaselines: envelope.inputBaselines,
  };
}

export function createFoundationClientBootstrap(input: FoundationClientBootstrapInput): FoundationClientBootstrapEnvelope {
  assertNonEmpty(input.worldEpoch, "bootstrap worldEpoch");
  assertTick(input.canonicalTick, "bootstrap canonicalTick");
  assertNonEmpty(input.selfActorSessionId, "bootstrap selfActorSessionId");
  assertExecutionProfile(input.executionProfile);
  assertStateComponents(input.stateComponents);
  if (input.topology.worldEpoch !== input.worldEpoch) throw new Error("bootstrap topology WorldEpoch mismatch");
  const stateByNetEntityId = canonicalStateMap(input.topology, input.stateComponents, input.entityStates);
  assertBaselineCoverage(input.topology, input.inputBaselines);

  const stateGuard = packFoundationStateGuard(
    input.topology,
    input.stateComponents,
    (netEntityId) => stateByNetEntityId.get(netEntityId) ?? [],
  );
  const base: Omit<FoundationClientBootstrapEnvelope, "envelopeDigest"> = {
    revision: FOUNDATION_CLIENT_BOOTSTRAP_REVISION,
    worldEpoch: input.worldEpoch,
    canonicalTick: input.canonicalTick,
    selfActorSessionId: input.selfActorSessionId,
    executionProfile: { ...input.executionProfile },
    topology: cloneTopology(input.topology),
    stateComponents: [...input.stateComponents],
    entityStates: input.entityStates.map((entity) => ({ netEntityId: entity.netEntityId, values: [...entity.values] })),
    stateGuard,
    inputBaselines: input.inputBaselines.map(cloneBaseline),
  };
  return { ...base, envelopeDigest: foundationCheckpointDigest(envelopeDigestBase(base)) };
}

export function hydrateFoundationClientBootstrap(
  envelopeInput: FoundationClientBootstrapEnvelope,
  expectedProfile: FoundationClientBootstrapExpectation,
): FoundationHydratedClientBootstrap {
  const envelope = cloneEnvelope(envelopeInput);
  if (envelope.revision !== FOUNDATION_CLIENT_BOOTSTRAP_REVISION) {
    throw new Error(`unsupported client bootstrap revision ${String(envelope.revision)}`);
  }
  assertNonEmpty(envelope.worldEpoch, "bootstrap worldEpoch");
  assertTick(envelope.canonicalTick, "bootstrap canonicalTick");
  assertNonEmpty(envelope.selfActorSessionId, "bootstrap selfActorSessionId");
  assertExecutionProfile(envelope.executionProfile);
  if (
    envelope.executionProfile.profileId !== expectedProfile.profileId
    || envelope.executionProfile.buildId !== expectedProfile.buildId
    || envelope.executionProfile.stateSchemaId !== expectedProfile.stateSchemaId
  ) {
    throw new Error("client bootstrap execution profile mismatch");
  }
  if (envelope.topology.worldEpoch !== envelope.worldEpoch) throw new Error("bootstrap topology WorldEpoch mismatch");
  assertStateComponents(envelope.stateComponents);
  const stateByNetEntityId = canonicalStateMap(envelope.topology, envelope.stateComponents, envelope.entityStates);
  assertBaselineCoverage(envelope.topology, envelope.inputBaselines);

  const recomputedGuard = packFoundationStateGuard(
    envelope.topology,
    envelope.stateComponents,
    (netEntityId) => stateByNetEntityId.get(netEntityId) ?? [],
  );
  const guardDifference = firstFoundationStateGuardDifference(
    envelope.stateGuard,
    recomputedGuard,
    envelope.topology,
    envelope.stateComponents,
  );
  if (guardDifference) throw new Error(`client bootstrap state guard mismatch: ${guardDifference.field}`);

  const expectedDigest = foundationCheckpointDigest(envelopeDigestBase({
    revision: envelope.revision,
    worldEpoch: envelope.worldEpoch,
    canonicalTick: envelope.canonicalTick,
    selfActorSessionId: envelope.selfActorSessionId,
    executionProfile: envelope.executionProfile,
    topology: envelope.topology,
    stateComponents: envelope.stateComponents,
    entityStates: envelope.entityStates,
    stateGuard: envelope.stateGuard,
    inputBaselines: envelope.inputBaselines,
  }));
  if (expectedDigest !== envelope.envelopeDigest) throw new Error("client bootstrap envelope digest mismatch");

  const replicaModel = new FoundationClientReplicaModel(envelope.selfActorSessionId);
  const projectionResult = replicaModel.applyFullProjection({ canonicalTick: envelope.canonicalTick, topology: envelope.topology });
  if (projectionResult.status !== "bootstrapped" || !projectionResult.snapshot) {
    throw new Error("client bootstrap projection failed");
  }
  const inputLedger = new FoundationClientInputLedger(envelope.selfActorSessionId);
  inputLedger.bootstrapProjection(projectionResult.snapshot, envelope.inputBaselines);

  return {
    envelope,
    projection: projectionResult.snapshot,
    replicaModel,
    inputLedger,
    stateByNetEntityId,
  };
}
