import type {
  FoundationHydratedClientBootstrap,
} from "./client-bootstrap.ts";
import type {
  FoundationHydratedClientRuntimeBootstrap,
} from "./client-runtime-bootstrap.ts";
import type {
  FoundationResolvedActorInput,
  FoundationResolvedInputFrame,
} from "./client-input-ledger.ts";
import {
  firstFoundationStateGuardDifference,
  packFoundationStateGuard,
  type FoundationStateGuard,
} from "./state-guard.ts";

export interface FoundationBox3DClientRuntime {
  readonly b3: any;
  readonly ownerPlayer: any;
  readonly world: any;
  readonly worldEpoch: string;
  readonly topologyRevision: number;
  readonly topologyDigest: string;
  readonly stateComponents: string[];
  readonly bodyNames: string[];
  readonly bodiesByNetEntityId: Map<string, any>;
  readonly actorBodiesBySession: Map<string, any>;
  readonly hydratedBootstrap: FoundationHydratedClientBootstrap;
  boundaryTick: number;
}

export interface FoundationBox3DRuntimeHydrationOptions {
  b3: any;
  hydratedBootstrap: FoundationHydratedClientBootstrap;
  expectedBodyNames: readonly string[];
  createReplayPlayer: () => any;
  readBodyState: (body: any) => readonly number[];
}

export interface FoundationBox3DStepOptions {
  dt: number;
  substeps: number;
  applyActorInput: (body: any, input: FoundationResolvedActorInput) => void;
  readBodyState: (body: any) => readonly number[];
}

function assertPositiveFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} must be positive and finite`);
}

function assertPositiveSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${label} must be a positive safe integer`);
}

function canonicalBodyManifest(expectedBodyNames: readonly string[]): Set<string> {
  if (expectedBodyNames.length === 0) throw new Error("Box3D client runtime body manifest must be non-empty");
  const expected = new Set<string>();
  for (const name of expectedBodyNames) {
    if (typeof name !== "string" || name.length === 0) throw new Error("Box3D client runtime body name must be non-empty");
    if (expected.has(name)) throw new Error(`duplicate Box3D client runtime body name ${name}`);
    expected.add(name);
  }
  return expected;
}

function captureGuardInternal(
  runtime: Pick<FoundationBox3DClientRuntime, "hydratedBootstrap" | "bodiesByNetEntityId">,
  readBodyState: (body: any) => readonly number[],
): FoundationStateGuard {
  const topology = runtime.hydratedBootstrap.envelope.topology;
  const components = runtime.hydratedBootstrap.envelope.stateComponents;
  return packFoundationStateGuard(
    topology,
    components,
    (netEntityId) => {
      const body = runtime.bodiesByNetEntityId.get(netEntityId);
      if (!body) throw new Error(`Box3D client runtime state body missing ${netEntityId}`);
      return readBodyState(body);
    },
  );
}

export function hydrateFoundationBox3DClientRuntime(
  options: FoundationBox3DRuntimeHydrationOptions,
): FoundationBox3DClientRuntime {
  const { b3, hydratedBootstrap, createReplayPlayer, readBodyState } = options;
  if (!b3 || typeof b3 !== "object") throw new Error("Box3D client runtime API is unavailable");
  const expectedBodyNames = canonicalBodyManifest(options.expectedBodyNames);

  const player = createReplayPlayer();
  if (!player) throw new Error("Box3D client runtime replay player creation failed");

  let keepPlayer = false;
  try {
    const world = b3.b3RecPlayer_GetWorldId(player);
    if (!world || !b3.b3World_IsValid(world)) throw new Error("Box3D client runtime replay world is invalid");

    const actualByName = new Map<string, any>();
    const bodyCount = b3.b3RecPlayer_GetBodyCount(player);
    if (bodyCount !== expectedBodyNames.size) {
      throw new Error(`Box3D client runtime body count mismatch ${bodyCount} != ${expectedBodyNames.size}`);
    }
    for (let ordinal = 0; ordinal < bodyCount; ordinal += 1) {
      const body = b3.b3RecPlayer_GetBodyId(player, ordinal);
      if (!b3.b3Body_IsValid(body)) throw new Error(`Box3D client runtime body ordinal ${ordinal} is invalid`);
      const name = b3.b3Body_GetName(body);
      if (typeof name !== "string" || name.length === 0) {
        throw new Error(`Box3D client runtime body ordinal ${ordinal} is missing semantic name`);
      }
      if (actualByName.has(name)) throw new Error(`duplicate Box3D client runtime recovered body name ${name}`);
      actualByName.set(name, body);
    }
    const actualNames = [...actualByName.keys()].sort();
    const expectedNames = [...expectedBodyNames].sort();
    if (JSON.stringify(actualNames) !== JSON.stringify(expectedNames)) {
      throw new Error("Box3D client runtime recovered body manifest drift");
    }

    const bodiesByNetEntityId = new Map<string, any>();
    for (const netEntityId of hydratedBootstrap.envelope.topology.entityOrder) {
      const body = actualByName.get(netEntityId);
      if (!body) throw new Error(`Box3D client runtime topology body missing ${netEntityId}`);
      bodiesByNetEntityId.set(netEntityId, body);
    }

    const actorBodiesBySession = new Map<string, any>();
    for (const actor of [hydratedBootstrap.projection.self, ...hydratedBootstrap.projection.remotes]) {
      if (actorBodiesBySession.has(actor.actorSessionId)) {
        throw new Error(`duplicate Box3D client runtime ActorSession ${actor.actorSessionId}`);
      }
      const body = bodiesByNetEntityId.get(actor.netEntityId);
      if (!body) throw new Error(`Box3D client runtime actor body missing ${actor.netEntityId}`);
      actorBodiesBySession.set(actor.actorSessionId, body);
    }

    const runtime: FoundationBox3DClientRuntime = {
      b3,
      ownerPlayer: player,
      world,
      worldEpoch: hydratedBootstrap.envelope.worldEpoch,
      topologyRevision: hydratedBootstrap.envelope.topology.topologyRevision,
      topologyDigest: hydratedBootstrap.envelope.topology.topologyDigest,
      stateComponents: [...hydratedBootstrap.envelope.stateComponents],
      bodyNames: [...expectedBodyNames],
      bodiesByNetEntityId,
      actorBodiesBySession,
      hydratedBootstrap,
      boundaryTick: hydratedBootstrap.envelope.canonicalTick,
    };

    const guard = captureGuardInternal(runtime, readBodyState);
    const difference = firstFoundationStateGuardDifference(
      hydratedBootstrap.envelope.stateGuard,
      guard,
      hydratedBootstrap.envelope.topology,
      hydratedBootstrap.envelope.stateComponents,
    );
    if (difference) {
      throw new Error(`Box3D client runtime bootstrap state mismatch: ${difference.field}`);
    }

    keepPlayer = true;
    return runtime;
  } finally {
    if (!keepPlayer) {
      try { b3.b3RecPlayer_Destroy(player); } catch { /* hydration failure teardown */ }
    }
  }
}

export function hydrateFoundationBox3DClientRuntimeFromSeedBytes(
  b3: any,
  hydratedRuntimeBootstrap: FoundationHydratedClientRuntimeBootstrap,
  readBodyState: (body: any) => readonly number[],
): FoundationBox3DClientRuntime {
  if (typeof b3?.b3RecPlayer_CreateFromBytes !== "function") {
    throw new Error("Box3D client runtime byte seed path is unavailable");
  }
  return hydrateFoundationBox3DClientRuntime({
    b3,
    hydratedBootstrap: hydratedRuntimeBootstrap,
    expectedBodyNames: hydratedRuntimeBootstrap.executionSeedBodyNames,
    createReplayPlayer: () => b3.b3RecPlayer_CreateFromBytes(hydratedRuntimeBootstrap.executionSeedBytes, 1),
    readBodyState,
  });
}

export function captureFoundationBox3DClientGuard(
  runtime: FoundationBox3DClientRuntime,
  readBodyState: (body: any) => readonly number[],
): FoundationStateGuard {
  return captureGuardInternal(runtime, readBodyState);
}

export function stepFoundationBox3DClientRuntime(
  runtime: FoundationBox3DClientRuntime,
  frame: FoundationResolvedInputFrame,
  options: FoundationBox3DStepOptions,
): FoundationStateGuard {
  assertPositiveFinite(options.dt, "Box3D client runtime dt");
  assertPositiveSafeInteger(options.substeps, "Box3D client runtime substeps");
  if (frame.worldEpoch !== runtime.worldEpoch) throw new Error("Box3D client runtime input WorldEpoch mismatch");
  if (frame.topologyRevision !== runtime.topologyRevision) throw new Error("Box3D client runtime input topology revision mismatch");
  if (frame.targetTick !== runtime.boundaryTick + 1) {
    throw new Error(`Box3D client runtime input tick discontinuity ${frame.targetTick} after ${runtime.boundaryTick}`);
  }
  if (frame.actors.length !== runtime.actorBodiesBySession.size) {
    throw new Error("Box3D client runtime input actor coverage mismatch");
  }

  const seenSessions = new Set<string>();
  for (const input of frame.actors) {
    if (seenSessions.has(input.actorSessionId)) {
      throw new Error(`duplicate Box3D client runtime input ActorSession ${input.actorSessionId}`);
    }
    seenSessions.add(input.actorSessionId);
    const body = runtime.actorBodiesBySession.get(input.actorSessionId);
    if (!body) throw new Error(`Box3D client runtime input references inactive ActorSession ${input.actorSessionId}`);
    const expectedBody = runtime.bodiesByNetEntityId.get(input.netEntityId);
    if (!expectedBody || expectedBody !== body) {
      throw new Error(`Box3D client runtime input identity mismatch for ${input.actorSessionId}`);
    }
    options.applyActorInput(body, input);
  }
  if (seenSessions.size !== runtime.actorBodiesBySession.size) {
    throw new Error("Box3D client runtime input session coverage mismatch");
  }

  runtime.b3.b3World_Step(runtime.world, options.dt, options.substeps);
  runtime.boundaryTick = frame.targetTick;
  return captureGuardInternal(runtime, options.readBodyState);
}

export function destroyFoundationBox3DClientRuntime(runtime: FoundationBox3DClientRuntime): void {
  try { runtime.b3.b3RecPlayer_Destroy(runtime.ownerPlayer); } finally {
    runtime.bodiesByNetEntityId.clear();
    runtime.actorBodiesBySession.clear();
  }
}
