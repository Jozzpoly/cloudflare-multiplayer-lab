export const WORLD_V0_SOLO_INSPECTION_REVISION = "shared-yard-v0-solo-inspection-v1";

const PLAYER_ID_PATTERN = /^[A-Za-z0-9_-]{1,24}$/;

function requireInteger(name, value, minimum = 0) {
  if (!Number.isInteger(value) || value < minimum) throw new Error(`${name} must be an integer >= ${minimum}`);
  return value;
}

export function worldV0InspectionCompanionPlayerId(humanPlayerId) {
  const raw = String(humanPlayerId || "").replace(/[^A-Za-z0-9_-]/g, "_");
  const suffix = raw.slice(0, 19) || "player";
  const id = `AUTO_${suffix}`.slice(0, 24);
  if (!PLAYER_ID_PATTERN.test(id)) throw new Error(`invalid inspection companion id ${id}`);
  return id;
}

export function sameWorldV0InspectionIdentity(a, b) {
  return Boolean(a && b) &&
    a.worldId === b.worldId &&
    a.worldEpoch === b.worldEpoch &&
    a.simBuildId === b.simBuildId &&
    a.clientSimRevision === b.clientSimRevision;
}

export function planWorldV0InspectionZeroInput({
  boundaryTick,
  protocolStartTick,
  nextTargetTick,
  maxFutureTicks,
  inputBatchSize,
}) {
  const boundary = requireInteger("boundaryTick", boundaryTick);
  const start = requireInteger("protocolStartTick", protocolStartTick);
  const maxFuture = requireInteger("maxFutureTicks", maxFutureTicks, 2);
  const batchSize = requireInteger("inputBatchSize", inputBatchSize, 1);
  let next = requireInteger("nextTargetTick", nextTargetTick ?? start);

  let skippedBehindTicks = 0;
  if (next < boundary) {
    skippedBehindTicks = boundary - next;
    next = boundary;
  }
  if (next < start) next = start;

  // Stay two ticks inside the authority's max-future boundary so a slightly
  // stale snapshot cannot turn a valid top-up into a too-future rejection.
  const safeHorizon = boundary + Math.max(1, maxFuture - 2);
  const batches = [];
  while (next <= safeHorizon) {
    const records = [];
    while (records.length < batchSize && next <= safeHorizon) {
      records.push({ targetTick: next, x: 0, z: 0 });
      next += 1;
    }
    if (records.length) batches.push(records);
  }

  return {
    batches,
    nextTargetTick: next,
    safeHorizon,
    skippedBehindTicks,
  };
}
