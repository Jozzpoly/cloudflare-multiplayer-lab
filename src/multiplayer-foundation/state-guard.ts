import type {
  FoundationTopologyIdentity,
  FoundationTopologySnapshot,
} from "./entity-topology.ts";

export const FOUNDATION_STATE_GUARD_REVISION = "multiplayer-foundation-f32-state-v1";

export interface FoundationStateGuard extends FoundationTopologyIdentity {
  revision: typeof FOUNDATION_STATE_GUARD_REVISION;
  componentCount: number;
  entityCount: number;
  packed: string;
}

export type FoundationStateGuardDifference =
  | {
      field: "guard-revision" | "worldEpoch" | "topologyRevision" | "topologyDigest" | "component-count" | "entity-count" | "packed-length";
      reference: string | number;
      candidate: string | number;
      expected?: number;
    }
  | {
      field: "state-scalar";
      scalar: number;
      netEntityId: string;
      component: string;
      referenceBits: string;
      candidateBits: string;
      referenceValue: number;
      candidateValue: number;
    };

const FLOAT32_VIEW = new DataView(new ArrayBuffer(4));

function encodeFloat32Bits(value: number): string {
  FLOAT32_VIEW.setFloat32(0, value, true);
  return FLOAT32_VIEW.getUint32(0, true).toString(16).padStart(8, "0");
}

function decodeFloat32Bits(bits: string): number {
  FLOAT32_VIEW.setUint32(0, Number.parseInt(bits, 16), true);
  return FLOAT32_VIEW.getFloat32(0, true);
}

export function packFoundationStateGuard(
  topology: FoundationTopologySnapshot,
  components: readonly string[],
  resolveValues: (netEntityId: string) => readonly number[],
): FoundationStateGuard {
  if (components.length === 0 || components.some((component) => component.length === 0)) {
    throw new Error("state guard components must be non-empty");
  }

  let packed = "";
  for (const netEntityId of topology.entityOrder) {
    const values = resolveValues(netEntityId);
    if (values.length !== components.length) {
      throw new Error(`state guard values missing for ${netEntityId}`);
    }
    for (const value of values) {
      if (!Number.isFinite(value)) {
        throw new Error(`state guard non-finite value for ${netEntityId}`);
      }
      packed += encodeFloat32Bits(value);
    }
  }

  return {
    revision: FOUNDATION_STATE_GUARD_REVISION,
    worldEpoch: topology.worldEpoch,
    topologyRevision: topology.topologyRevision,
    topologyDigest: topology.topologyDigest,
    componentCount: components.length,
    entityCount: topology.entityOrder.length,
    packed,
  };
}

export function firstFoundationStateGuardDifference(
  reference: FoundationStateGuard,
  candidate: FoundationStateGuard,
  topology: FoundationTopologySnapshot,
  components: readonly string[],
): FoundationStateGuardDifference | null {
  if (reference.revision !== candidate.revision) {
    return { field: "guard-revision", reference: reference.revision, candidate: candidate.revision };
  }
  if (reference.worldEpoch !== candidate.worldEpoch) {
    return { field: "worldEpoch", reference: reference.worldEpoch, candidate: candidate.worldEpoch };
  }
  if (reference.topologyRevision !== candidate.topologyRevision) {
    return { field: "topologyRevision", reference: reference.topologyRevision, candidate: candidate.topologyRevision };
  }
  if (reference.topologyDigest !== candidate.topologyDigest) {
    return { field: "topologyDigest", reference: reference.topologyDigest, candidate: candidate.topologyDigest };
  }
  if (
    reference.worldEpoch !== topology.worldEpoch
    || reference.topologyRevision !== topology.topologyRevision
    || reference.topologyDigest !== topology.topologyDigest
  ) {
    throw new Error("diagnostic topology does not match the guard topology identity");
  }
  if (reference.componentCount !== candidate.componentCount || reference.componentCount !== components.length) {
    return {
      field: "component-count",
      reference: reference.componentCount,
      candidate: candidate.componentCount,
      expected: components.length,
    };
  }
  if (reference.entityCount !== candidate.entityCount || reference.entityCount !== topology.entityOrder.length) {
    return {
      field: "entity-count",
      reference: reference.entityCount,
      candidate: candidate.entityCount,
      expected: topology.entityOrder.length,
    };
  }

  const scalarWidth = 8;
  const expectedScalars = topology.entityOrder.length * components.length;
  const expectedLength = expectedScalars * scalarWidth;
  if (reference.packed.length !== expectedLength || candidate.packed.length !== expectedLength) {
    return {
      field: "packed-length",
      reference: reference.packed.length,
      candidate: candidate.packed.length,
      expected: expectedLength,
    };
  }

  for (let scalar = 0; scalar < expectedScalars; scalar += 1) {
    const offset = scalar * scalarWidth;
    const referenceBits = reference.packed.slice(offset, offset + scalarWidth);
    const candidateBits = candidate.packed.slice(offset, offset + scalarWidth);
    if (referenceBits === candidateBits) continue;
    const entityIndex = Math.floor(scalar / components.length);
    const componentIndex = scalar % components.length;
    return {
      field: "state-scalar",
      scalar,
      netEntityId: topology.entityOrder[entityIndex],
      component: components[componentIndex],
      referenceBits,
      candidateBits,
      referenceValue: decodeFloat32Bits(referenceBits),
      candidateValue: decodeFloat32Bits(candidateBits),
    };
  }

  return null;
}
