const FLOAT32_VIEW = new DataView(new ArrayBuffer(4));

export function encodeFloat32Bits(value) {
  FLOAT32_VIEW.setFloat32(0, value, true);
  return FLOAT32_VIEW.getUint32(0, true).toString(16).padStart(8, "0");
}

export function decodeFloat32Bits(bits) {
  FLOAT32_VIEW.setUint32(0, Number.parseInt(bits, 16), true);
  return FLOAT32_VIEW.getFloat32(0, true);
}

export function packWorldV0State(netEntityOrder, components, resolveValues) {
  let packed = "";
  for (const netEntityId of netEntityOrder) {
    const values = resolveValues(netEntityId);
    if (!Array.isArray(values) || values.length !== components.length) {
      throw new Error(`state guard values missing for ${netEntityId}`);
    }
    for (const value of values) {
      if (!Number.isFinite(value)) throw new Error(`state guard non-finite value for ${netEntityId}`);
      packed += encodeFloat32Bits(value);
    }
  }
  return packed;
}

export function firstWorldV0StateDifference(referencePacked, candidatePacked, netEntityOrder, components) {
  const scalarWidth = 8;
  const expectedScalars = netEntityOrder.length * components.length;
  const expectedLength = expectedScalars * scalarWidth;
  if (referencePacked.length !== expectedLength || candidatePacked.length !== expectedLength) {
    return {
      field: "packed-length",
      referenceLength: referencePacked.length,
      candidateLength: candidatePacked.length,
      expectedLength,
    };
  }

  for (let scalar = 0; scalar < expectedScalars; scalar += 1) {
    const offset = scalar * scalarWidth;
    const referenceBits = referencePacked.slice(offset, offset + scalarWidth);
    const candidateBits = candidatePacked.slice(offset, offset + scalarWidth);
    if (referenceBits === candidateBits) continue;
    const entityIndex = Math.floor(scalar / components.length);
    const componentIndex = scalar % components.length;
    return {
      scalar,
      netEntityId: netEntityOrder[entityIndex],
      component: components[componentIndex],
      referenceBits,
      candidateBits,
      referenceValue: decodeFloat32Bits(referenceBits),
      candidateValue: decodeFloat32Bits(candidateBits),
    };
  }
  return null;
}
