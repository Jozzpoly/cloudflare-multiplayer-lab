export interface FoundationSpawnCandidate {
  spawnId: string;
  position: readonly [number, number, number];
}

export interface FoundationSpawnBlocker {
  entityId: string;
  position: readonly [number, number, number];
}

export interface FoundationSpawnChoice {
  spawnId: string;
  position: [number, number, number];
  nearestBlockerDistance: number | null;
}

function assertFinitePosition(position: readonly [number, number, number], label: string): void {
  if (!position.every(Number.isFinite)) {
    throw new Error(`${label} position must contain only finite numbers`);
  }
}

function horizontalDistance(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
): number {
  return Math.hypot(a[0] - b[0], a[2] - b[2]);
}

export function chooseFoundationSpawn(
  candidates: readonly FoundationSpawnCandidate[],
  blockers: readonly FoundationSpawnBlocker[],
  minHorizontalClearance: number,
): FoundationSpawnChoice | null {
  if (!Number.isFinite(minHorizontalClearance) || minHorizontalClearance < 0) {
    throw new Error("minHorizontalClearance must be a finite non-negative number");
  }

  const candidateIds = new Set<string>();
  for (const candidate of candidates) {
    if (candidate.spawnId.length === 0) {
      throw new Error("spawnId must be non-empty");
    }
    if (candidateIds.has(candidate.spawnId)) {
      throw new Error(`duplicate spawnId ${candidate.spawnId}`);
    }
    candidateIds.add(candidate.spawnId);
    assertFinitePosition(candidate.position, `spawn ${candidate.spawnId}`);
  }

  const blockerIds = new Set<string>();
  for (const blocker of blockers) {
    if (blocker.entityId.length === 0) {
      throw new Error("blocker entityId must be non-empty");
    }
    if (blockerIds.has(blocker.entityId)) {
      throw new Error(`duplicate blocker entityId ${blocker.entityId}`);
    }
    blockerIds.add(blocker.entityId);
    assertFinitePosition(blocker.position, `blocker ${blocker.entityId}`);
  }

  for (const candidate of candidates) {
    let nearest = Number.POSITIVE_INFINITY;
    for (const blocker of blockers) {
      nearest = Math.min(nearest, horizontalDistance(candidate.position, blocker.position));
    }
    if (nearest >= minHorizontalClearance) {
      return {
        spawnId: candidate.spawnId,
        position: [...candidate.position],
        nearestBlockerDistance: blockers.length === 0 ? null : nearest,
      };
    }
  }

  return null;
}
