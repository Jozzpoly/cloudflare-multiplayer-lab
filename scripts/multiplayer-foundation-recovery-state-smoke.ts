import assert from "node:assert/strict";
import {
  FoundationActorInputRegistry,
  type FoundationActorInputCheckpoint,
} from "../src/multiplayer-foundation/actor-input-registry.ts";
import {
  FoundationRosterMachine,
  type FoundationRosterCheckpoint,
  type FoundationRosterMutation,
} from "../src/multiplayer-foundation/roster-machine.ts";

const WORLD_EPOCH = "portable-recovery-state-epoch";
const CAPACITY = 3;
const MAX_FUTURE_TICKS = 4;
const CHECKPOINT_TICK = 5;

function jsonRoundTrip<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

const initialMutations: FoundationRosterMutation[] = [
  { kind: "join", mutationId: "join-a", effectiveTick: 1, actorSessionId: "session-a" },
  { kind: "join", mutationId: "join-b", effectiveTick: 2, actorSessionId: "session-b" },
  { kind: "join", mutationId: "join-c", effectiveTick: 3, actorSessionId: "session-c" },
  { kind: "join", mutationId: "reject-capacity", effectiveTick: 4, actorSessionId: "session-over" },
  { kind: "retire", mutationId: "retire-b", effectiveTick: 8, actorId: "actor:1" },
  { kind: "join", mutationId: "join-d", effectiveTick: 8, actorSessionId: "session-d" },
  { kind: "join", mutationId: "reject-reused-session", effectiveTick: 9, actorSessionId: "session-b" },
  { kind: "retire", mutationId: "reject-unknown", effectiveTick: 10, actorId: "actor:99" },
];

const roster = new FoundationRosterMachine({ worldEpoch: WORLD_EPOCH, capacity: CAPACITY });
for (const mutation of initialMutations) assert.equal(roster.queue(mutation), "queued");
const preCheckpointOutcomes = roster.advanceTo(CHECKPOINT_TICK);
assert.deepEqual(
  preCheckpointOutcomes.map((outcome) => outcome.status),
  ["joined", "joined", "joined", "rejected_capacity"],
);
assert.equal(roster.setTransportConnected("session-b", false), true);

const inputs = new FoundationActorInputRegistry(WORLD_EPOCH, MAX_FUTURE_TICKS);
inputs.syncRoster(roster.snapshot());
for (const actor of roster.snapshot().actors) {
  const ordinal = actor.actorOrdinal + 1;
  assert.equal(
    inputs.schedule({
      actorId: actor.actorId,
      actorSessionId: actor.actorSessionId,
      targetTick: 6,
      x: 0.1 * ordinal,
      z: -0.05 * ordinal,
    }, CHECKPOINT_TICK).status,
    "accepted",
  );
  assert.equal(
    inputs.schedule({
      actorId: actor.actorId,
      actorSessionId: actor.actorSessionId,
      targetTick: 7,
      x: -0.05 * ordinal,
      z: 0.1 * ordinal,
    }, CHECKPOINT_TICK).status,
    "accepted",
  );
}
assert.equal(
  inputs.schedule({
    actorId: "actor:0",
    actorSessionId: "session-a",
    targetTick: 6,
    x: 0.75,
    z: 0.25,
  }, CHECKPOINT_TICK).status,
  "superseded",
  "checkpoint must preserve the final superseding pending input",
);

const rosterCheckpoint = jsonRoundTrip(roster.checkpoint());
const inputCheckpoint = jsonRoundTrip(inputs.checkpoint(roster.snapshot()));

const restoredRoster = FoundationRosterMachine.fromCheckpoint(rosterCheckpoint);
const restoredInputs = FoundationActorInputRegistry.fromCheckpoint(inputCheckpoint, restoredRoster.snapshot());

assert.deepEqual(restoredRoster.snapshot(), roster.snapshot(), "restored roster snapshot drift at checkpoint boundary");
assert.deepEqual(
  restoredRoster.canonicalStateForReplay(),
  roster.canonicalStateForReplay(),
  "restored roster canonical state drift at checkpoint boundary",
);
assert.deepEqual(restoredRoster.checkpoint(), roster.checkpoint(), "restored roster checkpoint must round-trip exactly");
assert.deepEqual(
  restoredInputs.checkpoint(restoredRoster.snapshot()),
  inputs.checkpoint(roster.snapshot()),
  "restored pending input checkpoint must round-trip exactly",
);

const oldJoin = initialMutations[0];
assert.equal(roster.queue(oldJoin), "idempotent");
assert.equal(restoredRoster.queue(oldJoin), "idempotent", "restored roster must preserve mutation idempotency history");
assert.throws(
  () => restoredRoster.queue({ ...oldJoin, effectiveTick: 12 }),
  /reused with different payload/,
  "restored roster must reject mutation-id payload conflicts",
);

const badRosterDigest = jsonRoundTrip(rosterCheckpoint) as FoundationRosterCheckpoint;
badRosterDigest.stateDigest = "0000000000000000";
assert.throws(
  () => FoundationRosterMachine.fromCheckpoint(badRosterDigest),
  /checkpoint digest mismatch/,
  "corrupted roster checkpoint must fail closed",
);

const badInputBoundary = jsonRoundTrip(inputCheckpoint) as FoundationActorInputCheckpoint;
badInputBoundary.boundaryTick += 1;
assert.throws(
  () => FoundationActorInputRegistry.fromCheckpoint(badInputBoundary, restoredRoster.snapshot()),
  /boundary tick does not match/,
  "input checkpoint from another canonical boundary must fail closed",
);

const badInputOwner = jsonRoundTrip(inputCheckpoint) as FoundationActorInputCheckpoint;
badInputOwner.channels[0].actorSessionId = "wrong-session";
assert.throws(
  () => FoundationActorInputRegistry.fromCheckpoint(badInputOwner, restoredRoster.snapshot()),
  /owner mismatch/,
  "input checkpoint with ownership drift must fail closed",
);

function deterministicFutureIntent(actorOrdinal: number, tick: number): [number, number] {
  const sign = tick % 2 === 0 ? 1 : -1;
  const x = sign * (0.15 + actorOrdinal * 0.03);
  const z = -sign * (0.08 + actorOrdinal * 0.02);
  return [x, z];
}

for (let tick = 6; tick <= 12; tick += 1) {
  const originalOutcomes = roster.advanceTo(tick);
  const recoveredOutcomes = restoredRoster.advanceTo(tick);
  assert.deepEqual(recoveredOutcomes, originalOutcomes, `roster outcome drift after recovery at tick ${tick}`);
  assert.deepEqual(restoredRoster.snapshot(), roster.snapshot(), `roster snapshot drift after recovery at tick ${tick}`);

  const originalSnapshot = roster.snapshot();
  const recoveredSnapshot = restoredRoster.snapshot();
  inputs.syncRoster(originalSnapshot);
  restoredInputs.syncRoster(recoveredSnapshot);

  for (const actor of originalSnapshot.actors) {
    const consumedOriginal = inputs.consume(actor.actorId, tick);
    const consumedRecovered = restoredInputs.consume(actor.actorId, tick);
    assert.deepEqual(consumedRecovered, consumedOriginal, `consumed input drift for ${actor.actorId} at tick ${tick}`);

    const [x, z] = deterministicFutureIntent(actor.actorOrdinal, tick + 1);
    const scheduledOriginal = inputs.schedule({
      actorId: actor.actorId,
      actorSessionId: actor.actorSessionId,
      targetTick: tick + 1,
      x,
      z,
    }, tick);
    const scheduledRecovered = restoredInputs.schedule({
      actorId: actor.actorId,
      actorSessionId: actor.actorSessionId,
      targetTick: tick + 1,
      x,
      z,
    }, tick);
    assert.deepEqual(scheduledRecovered, scheduledOriginal, `input acceptance drift for ${actor.actorId} at tick ${tick}`);
  }

  assert.deepEqual(restoredRoster.checkpoint(), roster.checkpoint(), `roster checkpoint drift after tick ${tick}`);
  assert.deepEqual(
    restoredInputs.checkpoint(restoredRoster.snapshot()),
    inputs.checkpoint(roster.snapshot()),
    `input checkpoint drift after tick ${tick}`,
  );
}

assert.equal(roster.outcomeFor("retire-b")?.status, "retired");
assert.equal(restoredRoster.outcomeFor("retire-b")?.status, "retired");
assert.equal(roster.outcomeFor("join-d")?.status, "joined");
assert.equal(restoredRoster.outcomeFor("join-d")?.status, "joined");
assert.equal(roster.outcomeFor("reject-reused-session")?.status, "rejected_duplicate_session");
assert.equal(restoredRoster.outcomeFor("reject-reused-session")?.status, "rejected_duplicate_session");
assert.equal(roster.outcomeFor("reject-unknown")?.status, "rejected_unknown_actor");
assert.equal(restoredRoster.outcomeFor("reject-unknown")?.status, "rejected_unknown_actor");

const postRecoveryMutations: FoundationRosterMutation[] = [
  { kind: "retire", mutationId: "post-recovery-retire-a", effectiveTick: 13, actorId: "actor:0" },
  { kind: "join", mutationId: "post-recovery-join-e", effectiveTick: 13, actorSessionId: "session-e" },
];
for (const mutation of postRecoveryMutations) {
  assert.equal(roster.queue(mutation), "queued");
  assert.equal(restoredRoster.queue(mutation), "queued");
}
const finalOriginalOutcomes = roster.advanceTo(13);
const finalRecoveredOutcomes = restoredRoster.advanceTo(13);
assert.deepEqual(finalRecoveredOutcomes, finalOriginalOutcomes, "post-recovery topology mutation outcome drift");
inputs.syncRoster(roster.snapshot());
restoredInputs.syncRoster(restoredRoster.snapshot());

assert.deepEqual(
  roster.snapshot().actors.map((actor) => actor.actorId),
  ["actor:2", "actor:3", "actor:4"],
  "post-recovery replacement must keep actor ordinals monotonic and never reuse retired ids",
);
assert.deepEqual(restoredRoster.snapshot(), roster.snapshot());
assert.deepEqual(restoredRoster.actorHistory(), roster.actorHistory());
assert.deepEqual(restoredRoster.checkpoint(), roster.checkpoint());
assert.deepEqual(
  restoredInputs.checkpoint(restoredRoster.snapshot()),
  inputs.checkpoint(roster.snapshot()),
);

console.log(
  "MULTIPLAYER FOUNDATION RECOVERY STATE SMOKE PASS · JSON roster event-log checkpoint + transport state + pending input channels round-tripped exactly · pending mutations, rejected outcomes, mutation idempotency, owner guards and post-restore churn stayed canonical",
);
