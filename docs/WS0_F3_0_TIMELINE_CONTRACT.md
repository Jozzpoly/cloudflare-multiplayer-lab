# WS0 F3.0 — canonical timeline / buffered-input contract

Status: **PRE-EXECUTION CONTRACT / NO RESULT**  
Date: 2026-09-02

This file freezes the F3.0 model before the apparatus is implemented. Changing a definition after seeing results requires an explicit contract revision and a reason.

F3.0 is a timing/topology discriminator only. It deliberately contains no Box3D and no F2 recording/checkpoint machinery.

## 1. Research question

> Can normal local commands be scheduled onto one canonical authoritative tick timeline early enough for a normally forward-only server to consume them on time, while honestly quantifying how late independently controlled remote intent becomes known to another predicting client?

The purpose is to separate two questions that were previously conflated:

1. **authority lateness** — does the server need to roll back merely to place normal local input on its intended tick?
2. **peer uncertainty** — even if authority is forward-only and correct, how far past the relevant tick has another predicting client already simulated before it can know the remote human input / authoritative result?

F3.0 does not decide presentation quality or coupled-physics correctness. Those belong to F3.1.

## 2. Fixed simulation definitions

- simulation rate: `60 Hz`;
- tick duration: `DT = 1000 / 60 ms`;
- canonical tick `T` names one authoritative fixed simulation step;
- authority consumes all commands for tick `T` immediately before stepping tick `T`;
- no wall-clock timestamp is allowed to define causal identity once a command has a target tick;
- F3.0 assumes ideal tick-clock synchronization. Clock estimation/drift is deliberately deferred: success under perfect synchronization is necessary but not sufficient; failure under perfect synchronization is already disqualifying.

### Server timeline

At a wall-clock instant where the authority is about to consume tick `S`, call `S` the **server current tick**.

### Client predicted timeline

A client with prediction lead `L` simulates canonical tick identity approximately `S + L` when authority is at `S`.

`L` is a protocol/timing parameter, not extra local input latency. The local player applies newly sampled input immediately to its currently predicted tick.

### Confirmed tick

The newest authoritative tick whose result/ack has arrived and been accepted by a client.

This is distinct from both the server's current tick and the client's predicted tick.

## 3. Logical input model

Each client produces one logical input record per predicted simulation tick:

`{ player, targetTick, seq, x, z }`

`targetTick` is the canonical tick identity that the local prediction is currently simulating.

Transport may batch multiple consecutive logical records. Therefore **logical input cadence and network send cadence are separate variables**.

For F3.0 timing measurements, every logical tick record counts even if its values equal the previous record. This prevents hold-last semantics from hiding a timing miss.

## 4. Authority input buffer

Authority keeps a per-player ordered tick buffer.

For canonical tick `T`:

- if record `T` is already buffered: consume it;
- if it is absent: record a `missing-at-consume` event and use the previously known input only for the purpose of continuing the forward timing model;
- a record arriving after tick `T` was consumed is `late` and is **not** retroactively applied in F3.0.

F3.0 measures how often this happens. It does not add authority rollback to rescue the scheduled family.

## 5. Transport ordering model

Current runtime transport is WebSocket/TCP. Therefore F3.0 must not pretend packets can be independently reordered or dropped without retransmission.

For each logical direction/connection:

- raw network delay may vary according to the deterministic jitter pattern;
- delivered messages remain in send order;
- a delayed earlier message may hold later messages behind it, approximating reliable-stream head-of-line behavior;
- packet loss is not an initial F3.0 axis. Explicit loss/reconnect belongs to later transport/chaos work.

## 6. Batch model

Initial batch sizes:

- `1 tick`;
- `2 ticks`;
- `4 ticks`.

A batch is sent only after its newest included logical record exists, so batching contributes a bounded send wait to older records.

Each batch carries all consecutive logical records since the previous send; it does not discard intermediate tick identities.

This tests whether lower network message cadence can coexist with a full logical input timeline.

## 7. Network envelope

Base symmetric one-way delays:

- `35 ms`;
- `65 ms`;
- `85 ms`;
- `120 ms` stress case.

Initial jitter amplitudes:

- `0 ms`;
- `10 ms`;
- `30 ms`.

Use deterministic patterns, not RNG, so every cell is exactly reproducible.

At minimum include:

1. a smooth alternating phase pattern around base delay;
2. a burst/HOL pattern where one message receives the positive jitter excursion and following ordered messages may queue behind it.

Do not tune the pattern after viewing policy results.

## 8. Prediction lead sweep

Initial `L` sweep:

`2 / 4 / 6 / 8 / 10 / 12 ticks`

This spans roughly `33–200 ms` of predicted lead at 60 Hz and deliberately covers insufficient as well as generous lead.

F3.0 does not declare a human-feel threshold for `L`; it produces the Pareto relationship. Human desirability belongs to later real-client evidence.

## 9. Server-to-client information paths

Model two distinct return paths because they answer different questions.

### Immediate validated relay

Once authority receives a syntactically/temporally valid remote command batch, it may relay those ticked remote commands immediately, before their target ticks are consumed.

This is the **best-case remote-intent visibility** path and is closest to the current research side channel.

### Authoritative confirmation

After authority consumes/steps ticks, snapshots/acks identify the authoritative tick they represent.

Use snapshot intervals:

- `6 ticks` (`10 Hz`, current control cadence);
- `3 ticks` (`20 Hz`, candidate diagnostic cadence).

F3.0 measures confirmation age; it does not choose a final snapshot cadence.

## 10. Predeclared analytic invariants

The apparatus must print and verify these relationships rather than discovering them accidentally.

### A. Authority on-time budget

Ignoring tick-phase rounding, a local command for target tick `T` can reach authority before consumption when approximately:

`predictionLeadTime >= batchWait + uplinkDelay`

The simulator should expose the exact discrete-tick/phase version as `authorityMarginTicks`.

Increasing prediction lead should therefore reduce **authority** lateness.

### B. Remote human uncertainty does not disappear merely by increasing equal prediction lead

Assume two clients run with the same lead `L` and A generates input for target tick `T` while locally simulating `T`.

Even under immediate server relay, B cannot know that input until roughly:

`A uplink + B downlink + transport phase/HOL`

after A generated it.

During that wall-clock interval B continues advancing its own predicted timeline. To first order, increasing the same `L` on both clients shifts both predicted timelines together and **does not erase the peer information delay**.

Therefore the apparatus should report remote command arrival as ticks late relative to the receiver's predicted tick. This quantity is expected to remain approximately RTT-sized under symmetric delay even when authority on-time rate becomes perfect.

If the implementation instead shows peer lateness collapsing simply because `L` increased equally for both clients, audit the model before trusting the result.

### C. Authoritative confirmation is later than immediate relay

A snapshot cannot confirm tick `T` before authority has consumed/stepped `T`, and then still pays downlink plus snapshot phase/cadence. Therefore snapshot-based correction horizons should be at least as old as the best-case immediate-relay knowledge path for the same cause.

These invariants are hypotheses about the correctly modeled topology. F3.0 should validate the exact discrete behavior and expose edge cases from batching, tick phase and reliable-stream ordering.

## 11. Metrics

For every cell record at minimum:

### Authority

- total logical input records;
- on-time count/rate;
- late count/rate;
- `missing-at-consume` count;
- authority margin in ticks: min / p05 / median / p95;
- future input-buffer depth at each consume tick: min / p05 / median / p95 / max.

### Peer immediate-relay visibility

- remote command arrival lateness relative to receiver predicted tick: min / median / p95 / max;
- rollback/history ticks that would be required to insert that command at its target tick;
- effect of batching and HOL bursts.

### Authoritative confirmation

- predicted-tick minus confirmed-tick distance: median / p95 / max;
- snapshot/ack age in ticks;
- implied reconciliation history horizon.

### Timing cost

- prediction lead in ticks/ms;
- batch wait in ticks/ms;
- authority wall-clock realization lag relative to the local player's immediate predicted action.

## 12. Discriminator / stop rules

F3.0 is not a beauty contest and does not pick the final architecture.

The scheduled-tick family **earns F3.1** if the exact model shows that within the project's measured `65/85 ms` one-way regime there exists a bounded lead/batching region that:

- makes normal authority input overwhelmingly or completely on time across the declared deterministic phases/jitter patterns;
- does not require replay-from-session-start or authority rollback merely to place ordinary local input;
- yields a finite, explicitly measured peer/client history horizon rather than an undefined causal mismatch.

The `120 ms + 30 ms` cells are stress evidence, not an automatic product rejection threshold.

The family is **rejected or redesigned before Box3D** if even generous declared lead cannot make authority timing coherent, if required buffer behavior is internally contradictory, or if a hidden assumption is needed that cannot be represented in the real protocol.

Regardless of the authority result, a substantial best-case remote peer-lateness horizon is expected. That is not an F3.0 failure; it is the input to F3.1's client reconciliation problem.

## 13. F3.1 handoff contract if earned

F3.1 must use exact representative timing traces from F3.0 rather than inventing new delays after seeing physics results.

At minimum carry forward:

- one low-latency healthy cell;
- `65 ms` and `85 ms` representative cells;
- one jitter/HOL stress cell;
- the smallest robust lead/batch candidate from the F3.0 Pareto set;
- a deliberately insufficient-lead negative control.

Then drive the existing T5 actor-contact → shared-prop causal-relay scene and compare temporal families on physical truth and correction cost.

## 14. Explicit non-claims

F3.0 does not prove:

- that real clock synchronization is solved;
- that remote players can be perfectly predicted;
- that client rollback will look acceptable;
- that authority rollback is never needed;
- that 10/20 Hz snapshots are final;
- that 60 Hz input must become 60 network messages/sec;
- that WebSocket is final transport;
- that a chosen lead is acceptable to humans;
- that F2 recording internals are production-cheap;
- that selective prediction/causal islands are needed.

The apparatus implementation must remain smaller than the question it answers.
