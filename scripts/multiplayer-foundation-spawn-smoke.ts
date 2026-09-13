import assert from "node:assert/strict";
import {
  WORLD_V0_PLAYER_PHYSICS,
  WORLD_V0_PLAYER_STARTS,
  WORLD_V0_PROP_LAYOUT,
} from "../src/world-v0-contract.ts";
import {
  chooseFoundationSpawn,
  type FoundationSpawnBlocker,
  type FoundationSpawnCandidate,
} from "../src/multiplayer-foundation/spawn-policy.ts";

const candidates: FoundationSpawnCandidate[] = [
  { spawnId: "yard-west", position: WORLD_V0_PLAYER_STARTS[0] },
  { spawnId: "yard-east", position: WORLD_V0_PLAYER_STARTS[1] },
  { spawnId: "yard-north-west", position: [-6.5, 0.82, -6.0] },
  { spawnId: "yard-north", position: [0, 0.82, -6.5] },
  { spawnId: "yard-south-east", position: [6.5, 0.82, 6.0] },
  { spawnId: "yard-south", position: [0, 0.82, 6.5] },
];

const clearance = 1.5;
const propBlockers: FoundationSpawnBlocker[] = WORLD_V0_PROP_LAYOUT.map((prop) => ({
  entityId: prop.id,
  position: prop.position,
}));

// Research fixture safety: all six candidates must begin comfortably inside the existing yard,
// away from the authored prop seed and away from each other by more than a player diameter.
for (const candidate of candidates) {
  assert(Math.abs(candidate.position[0]) <= 8.0);
  assert(Math.abs(candidate.position[2]) <= 8.0);
  const propOnlyChoice = chooseFoundationSpawn([candidate], propBlockers, clearance);
  assert(propOnlyChoice, `${candidate.spawnId} must not begin inside the authored World V0 prop seed`);
}
for (let a = 0; a < candidates.length; a += 1) {
  for (let b = a + 1; b < candidates.length; b += 1) {
    const dx = candidates[a].position[0] - candidates[b].position[0];
    const dz = candidates[a].position[2] - candidates[b].position[2];
    assert(
      Math.hypot(dx, dz) > WORLD_V0_PLAYER_PHYSICS.capsuleRadius * 2 + 0.5,
      `${candidates[a].spawnId} and ${candidates[b].spawnId} must not overlap`,
    );
  }
}

const occupiedActors: FoundationSpawnBlocker[] = [];
for (let ordinal = 0; ordinal < 6; ordinal += 1) {
  const choice = chooseFoundationSpawn(candidates, [...propBlockers, ...occupiedActors], clearance);
  assert(choice, `actor:${ordinal} must have a safe candidate during the initial 1→6 fill`);
  assert.equal(choice.spawnId, candidates[ordinal].spawnId, "candidate choice must be deterministic by policy order");
  occupiedActors.push({ entityId: `actor:${ordinal}`, position: choice.position });
}
assert.equal(
  chooseFoundationSpawn(candidates, [...propBlockers, ...occupiedActors], clearance),
  null,
  "a full set of blocked candidate points must fail closed instead of forcing an overlapping spawn",
);

// Identity and location are deliberately separate. actor:2 retires; a later actor:6 may reuse the
// now-safe physical candidate while retaining a new monotonic actor identity.
const afterActorTwoRetires = occupiedActors.filter((actor) => actor.entityId !== "actor:2");
const replacementChoice = chooseFoundationSpawn(candidates, [...propBlockers, ...afterActorTwoRetires], clearance);
assert(replacementChoice);
assert.equal(replacementChoice.spawnId, candidates[2].spawnId);
afterActorTwoRetires.push({ entityId: "actor:6", position: replacementChoice.position });
assert.equal(afterActorTwoRetires.some((actor) => actor.entityId === "actor:2"), false);
assert.equal(afterActorTwoRetires.some((actor) => actor.entityId === "actor:6"), true);

const reversedBlockersChoice = chooseFoundationSpawn(candidates, [...propBlockers, ...occupiedActors.slice(0, 2)].reverse(), clearance);
assert(reversedBlockersChoice);
assert.equal(
  reversedBlockersChoice.spawnId,
  candidates[2].spawnId,
  "blocker iteration order must not affect deterministic first-safe candidate selection",
);

assert.throws(
  () => chooseFoundationSpawn([candidates[0], { ...candidates[0] }], [], clearance),
  /duplicate spawnId/,
);
assert.throws(
  () => chooseFoundationSpawn(candidates, [], -1),
  /finite non-negative/,
);

console.log(
  "MULTIPLAYER FOUNDATION SPAWN SMOKE PASS · six safe research candidates + deterministic first-safe allocation + fail-closed saturation + identity/slot separation",
);
