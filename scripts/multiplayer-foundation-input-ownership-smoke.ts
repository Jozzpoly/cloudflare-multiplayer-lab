import assert from "node:assert/strict";
import { FoundationActorInputRegistry } from "../src/multiplayer-foundation/actor-input-registry.ts";
import { FoundationRosterMachine } from "../src/multiplayer-foundation/roster-machine.ts";

const worldEpoch = "input-ownership-epoch";
const roster = new FoundationRosterMachine({ worldEpoch, capacity: 3 });
const inputs = new FoundationActorInputRegistry(worldEpoch, 16);

inputs.syncRoster(roster.snapshot());
assert.deepEqual(inputs.activeOwnership(), []);

roster.queue({ kind: "join", mutationId: "join-a", effectiveTick: 1, actorSessionId: "session-a" });
roster.queue({ kind: "join", mutationId: "join-b", effectiveTick: 2, actorSessionId: "session-b" });
roster.advanceTo(2);
inputs.syncRoster(roster.snapshot());
assert.deepEqual(inputs.activeOwnership(), [
  { actorId: "actor:0", actorSessionId: "session-a" },
  { actorId: "actor:1", actorSessionId: "session-b" },
]);

assert.equal(inputs.schedule({
  actorId: "actor:0",
  actorSessionId: "session-a",
  targetTick: 5,
  x: 1,
  z: 0,
}, 2).status, "accepted");
assert.equal(inputs.schedule({
  actorId: "actor:0",
  actorSessionId: "session-b",
  targetTick: 5,
  x: 0,
  z: 1,
}, 2).status, "rejected_owner_mismatch", "another active ActorSession cannot steer actor:0");
assert.equal(inputs.schedule({
  actorId: "actor:2",
  actorSessionId: "session-c",
  targetTick: 5,
  x: 0,
  z: 1,
}, 2).status, "rejected_unknown_actor");
assert.equal(inputs.schedule({
  actorId: "actor:1",
  actorSessionId: "session-b",
  targetTick: 1,
  x: 0,
  z: 1,
}, 2).status, "rejected_late");
assert.equal(inputs.schedule({
  actorId: "actor:1",
  actorSessionId: "session-b",
  targetTick: 19,
  x: 0,
  z: 1,
}, 2).status, "rejected_too_future");

assert.equal(inputs.schedule({
  actorId: "actor:0",
  actorSessionId: "session-a",
  targetTick: 5,
  x: 2,
  z: 2,
}, 2).status, "superseded");
const consumed = inputs.consume("actor:0", 5);
assert.equal(consumed.source, "scheduled");
assert(Math.abs(Math.hypot(consumed.x, consumed.z) - 1) < 1e-12, "intent vector must be normalized");
assert.deepEqual(inputs.consume("actor:0", 6), {
  actorId: "actor:0",
  actorSessionId: "session-a",
  targetTick: 6,
  x: 0,
  z: 0,
  source: "neutral",
});

// Transport state is deliberately absent from the registry. A detach/rebind changes
// no ownership channel because ActorSession continuity outlives one WebSocket.
assert.equal(roster.setTransportConnected("session-a", false), true);
inputs.syncRoster(roster.snapshot());
assert.deepEqual(inputs.activeOwnership()[0], { actorId: "actor:0", actorSessionId: "session-a" });
assert.equal(roster.setTransportConnected("session-a", true), true);
inputs.syncRoster(roster.snapshot());
assert.deepEqual(inputs.activeOwnership()[0], { actorId: "actor:0", actorSessionId: "session-a" });

roster.queue({ kind: "retire", mutationId: "retire-a", effectiveTick: 10, actorId: "actor:0" });
roster.queue({ kind: "join", mutationId: "join-c", effectiveTick: 10, actorSessionId: "session-c" });
roster.advanceTo(10);
inputs.syncRoster(roster.snapshot());
assert.deepEqual(inputs.activeOwnership(), [
  { actorId: "actor:1", actorSessionId: "session-b" },
  { actorId: "actor:2", actorSessionId: "session-c" },
]);
assert.equal(inputs.schedule({
  actorId: "actor:0",
  actorSessionId: "session-a",
  targetTick: 11,
  x: 1,
  z: 0,
}, 10).status, "rejected_unknown_actor", "retirement removes the input channel");
assert.equal(inputs.schedule({
  actorId: "actor:2",
  actorSessionId: "session-a",
  targetTick: 11,
  x: 1,
  z: 0,
}, 10).status, "rejected_owner_mismatch", "retired ActorSession authority cannot transfer to a replacement actor");
assert.equal(inputs.schedule({
  actorId: "actor:2",
  actorSessionId: "session-c",
  targetTick: 11,
  x: 1,
  z: 0,
}, 10).status, "accepted");

assert.throws(
  () => inputs.syncRoster({ ...roster.snapshot(), worldEpoch: "wrong" }),
  /does not match input registry WorldEpoch/,
);
const forged = roster.snapshot();
forged.actors = forged.actors.map((actor) => actor.actorId === "actor:2"
  ? { ...actor, actorSessionId: "session-forged" }
  : actor);
assert.throws(
  () => inputs.syncRoster(forged),
  /input ownership changed without a roster topology revision/,
);

console.log(
  "MULTIPLAYER FOUNDATION INPUT OWNERSHIP SMOKE PASS · dynamic ActorSession→ActorId channels + owner rejection + transport independence + retirement cleanup",
);
