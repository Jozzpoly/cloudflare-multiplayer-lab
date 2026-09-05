import assert from "node:assert/strict";
import {
  WORLD_V0_MOVEMENT,
  WORLD_V0_NET_ENTITY_ORDER,
  WORLD_V0_PROP_LAYOUT,
  WORLD_V0_PROP_PHYSICS,
  WORLD_V0_SIM_BUILD_ID,
  WORLD_V0_STATE_COMPONENTS,
  WORLD_V0_TIMING,
} from "../src/world-v0-contract.ts";
import {
  WORLD_V0_INPUT_LEASE_MISSING_TICKS,
  WORLD_V0_MAX_FUTURE_TICKS,
  WorldV0ScheduledInputBuffer,
  expectedWorldV0Identity,
  parseWorldV0ClientMessage,
  sameWorldV0Identity,
} from "../src/world-v0-protocol.ts";

assert.equal(WORLD_V0_PROP_LAYOUT.length, 12, "Shared Yard V0 must keep the F5 12-prop body count");
assert.equal(new Set(WORLD_V0_PROP_LAYOUT.map((prop) => prop.id)).size, 12, "prop NetEntityIds must be unique");
assert.deepEqual(WORLD_V0_NET_ENTITY_ORDER.slice(0, 2), ["actor:0", "actor:1"]);
assert.equal(WORLD_V0_NET_ENTITY_ORDER.length, 14);
assert.equal(WORLD_V0_STATE_COMPONENTS.length, 13);
assert.match(WORLD_V0_SIM_BUILD_ID, /^shared-yard-v0-sim-[0-9a-f]{16}$/);
assert.equal(WORLD_V0_INPUT_LEASE_MISSING_TICKS, 36);
assert.equal(WORLD_V0_TIMING.simulationHz, 60);
assert.equal(WORLD_V0_MOVEMENT.jumpSpeed, 7.2);
assert.equal(WORLD_V0_MOVEMENT.jumpSupportNormalMinY, 0.55);
assert.equal(WORLD_V0_MOVEMENT.jumpSupportImpulseEpsilon, 0.0001);
assert.equal(WORLD_V0_MOVEMENT.jumpMaxUpwardSpeed, 0.75);

// No authored prop pair may begin volumetrically overlapping. Touching (the tower)
// is allowed; the neutral pre-start runtime soak must later prove the actual solver settle.
const half = WORLD_V0_PROP_PHYSICS.halfExtents;
for (let a = 0; a < WORLD_V0_PROP_LAYOUT.length; a += 1) {
  for (let b = a + 1; b < WORLD_V0_PROP_LAYOUT.length; b += 1) {
    const pa = WORLD_V0_PROP_LAYOUT[a].position;
    const pb = WORLD_V0_PROP_LAYOUT[b].position;
    const eps = 1e-9;
    const separated = Math.abs(pa[0] - pb[0]) + eps >= half[0] * 2 ||
      Math.abs(pa[1] - pb[1]) + eps >= half[1] * 2 ||
      Math.abs(pa[2] - pb[2]) + eps >= half[2] * 2;
    assert(separated, `${WORLD_V0_PROP_LAYOUT[a].id} overlaps ${WORLD_V0_PROP_LAYOUT[b].id}`);
  }
}

const worldId = "shared-yard-v0-test";
const epoch = "epoch_01";
const identity = expectedWorldV0Identity(worldId, epoch);
assert(sameWorldV0Identity(identity, { ...identity }));
assert(!sameWorldV0Identity(identity, { ...identity, worldEpoch: "epoch_02" }));

const parsed = parseWorldV0ClientMessage(JSON.stringify({
  type: "world_v0_input_batch",
  ...identity,
  batchSeq: 1,
  records: [
    // Legacy x/z-only records remain valid and become jump:false.
    { targetTick: 20, x: 2, z: 0 },
    { targetTick: 21, x: 0, z: 1, jump: true },
  ],
}));
assert(parsed && parsed.type === "world_v0_input_batch");
assert.equal(parsed.records[0].x, 1, "input must be normalized at protocol boundary");
assert.equal(parsed.records[0].jump, false, "legacy x/z record must not synthesize a jump");
assert.equal(parsed.records[1].jump, true, "explicit jump pulse must survive protocol parsing");
assert.equal(parseWorldV0ClientMessage(JSON.stringify({
  type: "world_v0_input_batch",
  ...identity,
  batchSeq: 99,
  records: [{ targetTick: 20, x: 0, z: 0, jump: 1 }],
})), null, "jump must be a boolean when supplied");
assert.equal(parseWorldV0ClientMessage(JSON.stringify({
  type: "world_v0_ready",
  worldId,
  worldEpoch: epoch,
  simBuildId: identity.simBuildId,
  // missing clientSimRevision on purpose
})), null, "simulation messages must carry the complete epoch/build identity");

const input = new WorldV0ScheduledInputBuffer();
const startTick = 20;
const first = input.acceptBatch(parsed, 10, startTick);
assert.deepEqual(first.records.map((record) => record.status), ["accepted", "accepted"]);
assert.deepEqual(input.consume(20), {
  targetTick: 20, x: 1, z: 0, jump: false, fresh: true, source: "fresh", missingStreak: 0,
});
assert.deepEqual(input.consume(21), {
  targetTick: 21, x: 0, z: 1, jump: true, fresh: true, source: "fresh", missingStreak: 0,
});

// A missing canonical record may hold locomotion, but jump is an event pulse and
// must never be repeated by hold-last semantics.
let lastHeld = null;
for (let tick = 22; tick < 22 + WORLD_V0_INPUT_LEASE_MISSING_TICKS - 1; tick += 1) {
  lastHeld = input.consume(tick);
  assert.equal(lastHeld.source, "held");
  assert.deepEqual([lastHeld.x, lastHeld.z], [0, 1], "lease must hold the last consumed locomotion before expiry");
  assert.equal(lastHeld.jump, false, `held input repeated jump pulse at tick ${tick}`);
}
assert(lastHeld);
assert.equal(lastHeld.missingStreak, WORLD_V0_INPUT_LEASE_MISSING_TICKS - 1);
const expiredTick = 21 + WORLD_V0_INPUT_LEASE_MISSING_TICKS;
const expired = input.consume(expiredTick);
assert.deepEqual(expired, {
  targetTick: expiredTick,
  x: 0,
  z: 0,
  jump: false,
  fresh: false,
  source: "lease_expired",
  missingStreak: WORLD_V0_INPUT_LEASE_MISSING_TICKS,
});
assert.equal(input.stats().leaseExpirations, 1);

const freshAfterExpiry = input.acceptBatch({
  type: "world_v0_input_batch",
  ...identity,
  batchSeq: 2,
  records: [{ targetTick: expiredTick + 1, x: -1, z: 0, jump: true }],
}, expiredTick + 1, startTick);
assert.equal(freshAfterExpiry.records[0].status, "accepted");
const freshPulse = input.consume(expiredTick + 1);
assert.equal(freshPulse.source, "fresh", "fresh canonical input resets the missing streak");
assert.equal(freshPulse.jump, true, "fresh post-expiry jump pulse was lost");
assert.equal(input.stats().currentMissingStreak, 0);
const postPulseHold = input.consume(expiredTick + 2);
assert.equal(postPulseHold.jump, false, "post-expiry hold repeated jump pulse");
assert.deepEqual([postPulseHold.x, postPulseHold.z], [-1, 0], "post-expiry hold must retain locomotion only");

const tooFutureTick = expiredTick + 3 + WORLD_V0_MAX_FUTURE_TICKS + 1;
const tooFuture = input.acceptBatch({
  type: "world_v0_input_batch",
  ...identity,
  batchSeq: 3,
  records: [{ targetTick: tooFutureTick, x: 0, z: 0, jump: false }],
}, expiredTick + 3, startTick);
assert.equal(tooFuture.records[0].status, "too_future");

console.log(`WORLD V0 PROTOCOL SMOKE PASS · sim=${WORLD_V0_SIM_BUILD_ID} · jump pulse + hold-last locomotion + ${WORLD_V0_INPUT_LEASE_MISSING_TICKS}-tick fail-closed input lease`);
