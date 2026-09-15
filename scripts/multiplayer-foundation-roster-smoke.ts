import assert from "node:assert/strict";
import {
  FoundationRosterMachine,
  type FoundationRosterMutation,
} from "../src/multiplayer-foundation/roster-machine.ts";

const WORLD_EPOCH = "foundation-epoch-001";
const CAPACITY = 6;

function join(mutationId: string, effectiveTick: number, actorSessionId: string): FoundationRosterMutation {
  return { kind: "join", mutationId, effectiveTick, actorSessionId };
}

function retire(mutationId: string, effectiveTick: number, actorId: `actor:${number}`): FoundationRosterMutation {
  return { kind: "retire", mutationId, effectiveTick, actorId };
}

function queueAll(machine: FoundationRosterMachine, mutations: FoundationRosterMutation[]): void {
  for (const mutation of mutations) {
    assert.equal(machine.queue(mutation), "queued");
  }
}

const machine = new FoundationRosterMachine({ worldEpoch: WORLD_EPOCH, capacity: CAPACITY });

const firstWave: FoundationRosterMutation[] = [
  join("join-a", 1, "session-a"),
  join("join-b", 5, "session-b"),
  join("join-c", 10, "session-c"),
  join("join-d", 10, "session-d"),
  join("join-e", 15, "session-e"),
  join("join-f", 20, "session-f"),
];
queueAll(machine, firstWave);

assert.deepEqual(machine.advanceTo(1).map((outcome) => outcome.status), ["joined"]);
assert.deepEqual(machine.snapshot().actors.map((actor) => actor.actorId), ["actor:0"]);
assert.equal(machine.snapshot().worldEpoch, WORLD_EPOCH, "the world epoch must not reset when the first actor starts play");

machine.advanceTo(5);
assert.deepEqual(machine.snapshot().actors.map((actor) => actor.actorId), ["actor:0", "actor:1"]);
assert.equal(machine.snapshot().worldEpoch, WORLD_EPOCH, "late join must preserve the world epoch");

machine.advanceTo(10);
assert.deepEqual(
  machine.snapshot().actors.map((actor) => [actor.actorId, actor.actorSessionId]),
  [
    ["actor:0", "session-a"],
    ["actor:1", "session-b"],
    ["actor:2", "session-c"],
    ["actor:3", "session-d"],
  ],
  "same-tick joins must receive deterministic ordinals from canonical mutation ordering",
);

machine.advanceTo(20);
const fullSnapshot = machine.snapshot();
assert.equal(fullSnapshot.actors.length, 6);
assert.equal(fullSnapshot.topologyRevision, 6);
assert.equal(fullSnapshot.nextActorOrdinal, 6);
assert.equal(fullSnapshot.topologyKey, "actor:0,actor:1,actor:2,actor:3,actor:4,actor:5");

const rejectedAtCapacity = join("join-g-capacity", 21, "session-g");
assert.equal(machine.queue(rejectedAtCapacity), "queued");
const capacityOutcome = machine.advanceTo(21);
assert.equal(capacityOutcome[0]?.status, "rejected_capacity");
assert.equal(machine.queue({ ...rejectedAtCapacity }), "idempotent", "an exact retry stays idempotent after execution");
assert.equal(machine.snapshot().topologyRevision, 6, "capacity rejection must not mutate topology");
assert.equal(machine.snapshot().nextActorOrdinal, 6, "a rejected join must not consume an actor ordinal");

const revisionBeforeTransportLoss = machine.topologyRevision;
const topologyBeforeTransportLoss = machine.snapshot().topologyKey;
assert.equal(machine.setTransportConnected("session-c", false), true);
assert.equal(machine.snapshot().actors.find((actor) => actor.actorId === "actor:2")?.transportConnected, false);
assert.equal(machine.topologyRevision, revisionBeforeTransportLoss, "transport loss is not roster retirement");
assert.equal(machine.snapshot().topologyKey, topologyBeforeTransportLoss);
assert.equal(machine.setTransportConnected("session-c", true), true);
assert.equal(machine.snapshot().actors.find((actor) => actor.actorId === "actor:2")?.transportConnected, true);
assert.equal(machine.topologyRevision, revisionBeforeTransportLoss, "transport rebind must not create a new actor");

const replacementMutations: FoundationRosterMutation[] = [
  // Intentionally lexically later than the join. Phase ordering must still retire first.
  retire("z-retire-c", 30, "actor:2"),
  join("a-join-g", 30, "session-g"),
];
queueAll(machine, replacementMutations);
const replacementOutcomes = machine.advanceTo(30);
assert.deepEqual(replacementOutcomes.map((outcome) => outcome.status), ["retired", "joined"]);
assert.deepEqual(
  machine.snapshot().actors.map((actor) => actor.actorId),
  ["actor:0", "actor:1", "actor:3", "actor:4", "actor:5", "actor:6"],
  "retired actor ordinals must never be reused",
);
assert.equal(machine.snapshot().nextActorOrdinal, 7);
assert.equal(machine.snapshot().topologyRevision, 8);
assert.equal(machine.actorHistory().find((actor) => actor.actorId === "actor:2")?.retiredAtTick, 30);

const reusedRetiredSession = join("reuse-retired-session", 31, "session-c");
assert.equal(machine.queue(reusedRetiredSession), "queued");
assert.equal(
  machine.advanceTo(31)[0]?.status,
  "rejected_duplicate_session",
  "retirement is terminal for one ActorSession identity inside the WorldEpoch",
);
assert.equal(machine.snapshot().topologyRevision, 8, "reusing a retired ActorSession must not mutate topology");
assert.equal(machine.snapshot().nextActorOrdinal, 7, "reusing a retired ActorSession must not consume actor identity");

const duplicate = join("join-idempotent", 40, "session-h");
assert.equal(machine.queue(duplicate), "queued");
assert.equal(machine.queue({ ...duplicate }), "idempotent", "an exact retry must not enqueue twice");
assert.throws(
  () => machine.queue(join("join-idempotent", 41, "session-other")),
  /reused with different payload/,
  "mutation ids are idempotency keys and cannot alias a different mutation",
);

// The room is still full, so the idempotent mutation is deterministically rejected.
assert.equal(machine.advanceTo(40)[0]?.status, "rejected_capacity");
assert.equal(machine.queue({ ...duplicate }), "idempotent", "execution must not destroy retry idempotency");
assert.throws(
  () => machine.queue(join("past", 40, "session-past")),
  /future canonical tick/,
  "new membership mutations cannot rewrite canonical history",
);
assert.throws(() => machine.advanceTo(39), /cannot move backwards/);

// Replay the same canonical membership log into a clean machine. Transport bindings are
// deliberately excluded: they are ephemeral bindings, not world topology.
const replay = new FoundationRosterMachine({ worldEpoch: WORLD_EPOCH, capacity: CAPACITY });
queueAll(replay, firstWave);
replay.advanceTo(20);
replay.queue(rejectedAtCapacity);
replay.advanceTo(21);
queueAll(replay, replacementMutations);
replay.advanceTo(30);
replay.queue(reusedRetiredSession);
replay.advanceTo(31);
replay.queue(duplicate);
replay.advanceTo(40);
assert.deepEqual(
  replay.canonicalStateForReplay(),
  machine.canonicalStateForReplay(),
  "identical canonical membership logs must reproduce identical roster state and outcomes",
);

// Explicitly prove deterministic same-tick competition when fewer slots exist than joins.
const competition = new FoundationRosterMachine({ worldEpoch: "competition", capacity: 2 });
queueAll(competition, [
  join("join-z", 1, "session-z"),
  join("join-a", 1, "session-a"),
  join("join-m", 1, "session-m"),
]);
const competitionOutcomes = competition.advanceTo(1);
assert.deepEqual(
  competitionOutcomes.map((outcome) => outcome.status),
  ["joined", "joined", "rejected_capacity"],
);
assert.deepEqual(
  competition.snapshot().actors.map((actor) => actor.actorSessionId),
  ["session-a", "session-m"],
  "same-tick capacity competition must have a canonical winner order",
);

console.log(
  "MULTIPLAYER FOUNDATION ROSTER SMOKE PASS · dynamic 1→6 late join + terminal ActorSession identity + capacity + transport rebind + monotonic actor ids + churn + deterministic replay",
);
