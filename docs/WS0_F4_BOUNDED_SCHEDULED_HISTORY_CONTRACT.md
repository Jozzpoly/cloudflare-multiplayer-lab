# WS0 F4 — bounded scheduled client history contract

Status: PRE-RESULT / frozen before apparatus execution.

## Provenance

F4 starts from the qualified F3.1 head `72f298e7b3730194d69a9d989620c273138b2c34`.

Qualified inputs that F4 may use without reopening them:

- F2: exact `box3d.js@0.1.1` recording/replay can seed from a live step boundary, restore complete hidden physics state, branch the restored player-owned world with ordinary Box3D calls, and rotate corrected worlds into fresh recording generations.
- F3.1: scheduled canonical target ticks + authority buffering + complete client history repair reproduce the intended coupled T5 physical history in healthy traces while authority remains forward-only.
- F3.1 measured client rewind maxima for the carried traces: `5 / 9 / 11 / 13 / 11` ticks.
- F3.1 scheduled-forward and source-time-common had identical client-side correction/history metrics; source-time added authority rollback work without reducing those client corrections.

F4 must not reinterpret those results to make the implementation easier.

## Question

Can the favored F3.1 scheduled-forward client semantics be implemented with **bounded recent Box3D recording/checkpoint history** instead of rebuild-from-global-seed, while preserving exactly the same corrected coupled physical truth and the already-measured logical rewind horizon?

A qualified YES requires a real recent-checkpoint restore/branch/resimulation path. Replaying from session start or reconstructing only public body state is a failure to answer F4.

## Scope

F4 is a research-only client-history mechanism. No production protocol, browser presentation, staging deployment, packet-loss policy, clock-drift policy, or final checkpoint cadence is claimed here.

Authority remains forward-only in the healthy scheduled cases. F4 applies to the complete predicted client world: both actors and shared matter must be repaired together.

## Canonical boundary semantics

Define `B(T)` as the complete physical state at the step boundary **immediately before canonical tick T consumes its input and executes its physics step**.

If newly learned information changes the input for tick `T`, the correction path MUST:

1. restore a retained checkpoint at or before `B(T)`;
2. reconstruct/advance exactly to `B(T)` without consuming the stale version of tick `T`;
3. install the corrected canonical input for `T`;
4. execute tick `T` and every later tick through the client's current predicted tick using the retained canonical input/event history;
5. leave the corrected world as the new live generation.

Seeking to a state after the stale tick `T` and then overwriting only body state is explicitly invalid.

## Recording-generation rule

After a correction beginning at `B(T)`, the corrected replay interval itself must become recordable history. A later correction may target a tick inside the interval that was just rebuilt.

Therefore F4 must not simply resimulate to `now` and begin the next recording only at `now`. It must establish a new recording generation at the corrected boundary early enough that subsequent overlapping corrections can restore into the corrected history.

Generation ownership must follow the exact F2 lifetime rule: a RecPlayer owns its replay world; the host must retain the owning player for as long as that world is live and hand ownership forward explicitly when rotating generations.

## Entity identity contract

Raw Box3D `BodyId` is generation-local and MUST NOT be treated as network/application identity.

`userData` is not a replay identity seam: the pinned Box3D snapshot intentionally clears host pointer/userData fields.

Primary host identity for this gate:

`NetEntityId -> creationOrdinal -> current-generation BodyId`

The host registry owns stable `NetEntityId` values and the corresponding Box3D creation ordinals. After every restore/generation handoff, the current `BodyId` is resolved through `b3RecPlayer_GetBodyId(player, creationOrdinal)` and validated with `b3Body_IsValid`.

Body names may be used only as an additional semantic tripwire. They are not the primary identity key.

F4c must include create/destroy/create behavior so holes and ordinal lifetime are tested rather than assumed away.

## Candidate retention geometry

F3.1's worst carried client rewind is 13 ticks. A provisional segment length of 8 ticks is permitted as an experimental candidate, not a production choice.

For an 8-tick segment:

- checkpoint-to-target prefix can be up to 7 ticks;
- target-to-current correction can require up to 13 ticks;
- bounded corrected replay is therefore expected to stay on the order of <=20 historical steps from a retained seed, with exact counts measured by the apparatus;
- retaining current + two previous 8-tick segments gives a 24-tick window and should cover the carried F3.1 horizon with margin.

These are pre-result bounds to test. The apparatus must report actual restored checkpoint age, replayed physics steps, retained recording bytes, and generation rotations.

## F4 apparatus

### F4a — bounded replacement of the F3.1 oracle

Use the coupled T5 scene and the healthy F3.1 scheduled traces.

Replace the rebuild-from-global-seed client correction implementation with bounded recent recording/checkpoint restore + finite canonical input history.

Required evidence per trace:

- final client A <-> client B residual;
- final client <-> authority residual;
- actor/relay correction metrics compared with F3.1;
- max logical rewind ticks;
- max checkpoint age in ticks;
- max actual physics steps replayed for one correction;
- retained recording bytes;
- recording/player generation rotations;
- entity remap validation failures (must be zero).

PASS requires the bounded implementation to reproduce F3.1 corrected physical truth to the declared numerical tolerance and not exceed the frozen logical rewind horizon for semantic reasons.

### F4b — overlapping late corrections

Construct a deterministic case where correction `C2` targets a canonical tick inside the interval rebuilt by earlier correction `C1`.

PASS requires `C2` to restore from corrected history, not from stale pre-C1 history, and converge to the equivalent clean canonical oracle.

This test exists specifically to falsify a naive `restore -> resim -> start recording only at now` implementation.

### F4c — identity lifecycle

Exercise at least one application entity through creation, destruction, and a later distinct creation while recordings/generations rotate.

PASS requires:

- stable host `NetEntityId` semantics;
- correct creation-ordinal holes;
- destroyed ordinals resolve as invalid/null when appropriate;
- new entities are not mistaken for recycled Box3D handles;
- body-name tripwires, where used, agree with the host registry.

## Controls / failure conditions

F4 is NOT qualified if any of the following is required to make it pass:

- replay from session/global seed for normal correction;
- manual reconstruction of hidden contact/solver state;
- treating Box3D BodyId or userData as stable application identity;
- dropping shared matter from the repaired world;
- silently discarding overlapping corrections;
- changing the F3.1 canonical timing semantics after seeing F4 results;
- selecting a checkpoint cadence by tuning to one favorable trace and presenting it as general.

## Natural stopping boundary

F4 ends when bounded recent history has either:

1. reproduced the F3.1 coupled scheduled-forward truth, survived overlapping corrections, and demonstrated a sound entity remap seam; or
2. exposed a concrete blocker in the exact F2 recording substrate that prevents one of those requirements.

If F4 qualifies, the next gate should move quickly toward browser/runtime integration and human-visible reconciliation of the already-observed RTT-scale correction, rather than reopening another abstract temporal-family ladder.
