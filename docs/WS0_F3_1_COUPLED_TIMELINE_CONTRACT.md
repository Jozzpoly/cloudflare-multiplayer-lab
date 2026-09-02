# WS0 F3.1 — coupled-physics temporal-family discriminator

Status: **PRE-EXECUTION CONTRACT / NO RESULT**  
Date: 2026-09-02

This contract freezes F3.1 before the Box3D apparatus is implemented. F3.1 chooses among temporal semantics; it does **not** yet choose the production history/checkpoint mechanism.

## 1. Research question

> When the exact T5 player-contact -> shared-prop causal-relay scene is driven through timing traces earned by F3.0, which temporal family preserves one shared physical causal history, and where does each family place the unavoidable WAN cost?

F3.1 must separate:
1. authority lateness / rollback;
2. peer remote-human uncertainty;
3. local prediction correction;
4. final shared physical truth.

## 2. Fixed physical substrate

Reuse the qualified T5 scene and exact `box3d.js@0.1.1` movement/contact constants:
- 60 Hz fixed simulation;
- 4 Box3D substeps;
- same actor capsule construction, masses/materials and motion locks;
- same 12 central props plus the later relay prop;
- same T5 input-transition sequence;
- same self-first actor ordering difference between client A and client B;
- same actor-contact then later shared-prop relay structure.

Do not tune geometry, movement, contact timing or relay placement after viewing policy results.

## 3. Canonical scenario semantics

T5 input transitions are converted once to canonical target ticks. That canonical sequence is the **intended physical history**.

F3.1 compares how different temporal families realize or fail to realize those same intended command changes under network delay.

The scheduled family may generate a command for canonical tick `T` earlier in wall time because the client predicts ahead. That does not change the canonical physical target tick. F3.0 already measured the wall-time lead cost; F3.1 measures coupled physics at canonical tick identity.

## 4. F3.0 traces carried forward unchanged

Primary scheduled candidate: `L=8`, batch `2` (`133.3 ms` predicted lead, `30 sends/s`).

Carry at minimum:
- low healthy: `35 ms`, `10 ms` jitter, smooth pattern, `L8/B2`;
- measured: `65 ms`, `10 ms`, smooth, `L8/B2`;
- measured: `85 ms`, `10 ms`, smooth, `L8/B2`;
- jitter/HOL stress: `85 ms`, `30 ms`, burst/HOL, `L8/B2`;
- near-boundary negative: `85 ms`, `10 ms`, smooth, `L6/B2`.

The negative is deliberately the nearest informative sub-threshold F3.0 cell, not the artifact helper's trivial L4 cell.

No new delay/jitter combination may be invented after observing Box3D results unless clearly labeled as a later sensitivity probe.

## 5. Network trace model

Reuse F3.0 deterministic reliable ordered-stream semantics exactly:
- logical input exists every canonical tick;
- transport batch size is 2 for the scheduled traces above;
- smooth and burst/HOL coefficient patterns remain unchanged;
- equal fixed tick clocks / ideal clock synchronization remain assumed;
- no packet-loss axis yet.

For Box3D correction work, unchanged consecutive input records do not by themselves require a resimulation. A correction is causally triggered when newly known history changes the input value that had been assumed for an already simulated tick.

## 6. Temporal families

### P0 — `receipt-live` control

Represents the current failure family:
- local self intent is applied immediately in local prediction;
- authority changes input only after network receipt;
- peer changes remote input only when delayed information arrives;
- no historical repair.

Expected to preserve responsiveness but permit mixed histories and causal fork. This is a control, not a straw-man tuned to fail.

### P1 — `scheduled-forward-reconcile`

F3.0 candidate family:
- every input record has canonical `targetTick`;
- authority remains forward-only;
- if record `T` was buffered before consume of `T`, authority uses it for `T`;
- healthy F3.0 cells therefore realize the intended canonical input history with zero authority rollback;
- local self prediction applies its own intended input at `targetTick`;
- another client initially predicts unknown remote future by hold-last intent;
- when delayed ticked remote history reveals a value transition for a past predicted tick, restore/rebuild the **complete client physical world** to that causal tick and resimulate through the client's current predicted tick.

F3.1 may rebuild from the deterministic global seed as an oracle. Actual replay-from-seed work is **not** counted as production cost. Record the logical rewind horizon that a bounded history implementation would require.

For the L6 negative trace, late records are not retroactively applied by authority. The negative is allowed to diverge from the intended oracle. F3.1 must not silently repair authority with rollback and call it scheduled-forward.

### P2 — `authority-time-common`

Forward-only authority family from F1:
- input transition is applied by authority at its actual authoritative receipt/apply tick;
- clients initially act locally immediately;
- once authoritative apply-tick metadata is known, clients rebuild a common history in which **both self and remote causal input changes** are placed at their authority apply ticks;
- complete-world history repair is required on clients, but authority does not roll back.

Measure local self replacement explicitly. Do not hide it with smoothing.

### P3 — `source-time-common`

Source-history family from F1/T4/T5:
- input transition's canonical target/source tick is the intended tick;
- authority receives it late, restores/rebuilds complete history to that source tick, and resimulates to current authority time;
- clients likewise insert delayed remote input at its source tick and rebuild complete local predicted history;
- final canonical authority history should match the intended source oracle.

F3.1 may use rebuild-from-seed as an oracle implementation, but must report authority and client logical rewind horizons separately.

## 7. Oracle and comparison state

Build one deterministic **intended source oracle** that applies the canonical T5 transitions on their intended target ticks.

For each policy, also construct/track the policy's eventual authoritative canonical trajectory.

Because scheduled clients run `L` ticks ahead of live authority wall time, never compare client tick `C` against authority tick `C-L`. For transient prediction-error diagnostics, compare a client state at canonical predicted tick `C` against that policy's eventual authoritative state at the **same canonical tick `C`**.

This is an offline truth diagnostic, not information the live client possesses.

## 8. Drain boundary

After the final T5 input transition:
- continue long enough for all declared network messages / apply-tick metadata to arrive;
- continue simulation long enough for all clients and authority trajectories to be compared on the same final canonical tick;
- no unresolved in-flight causal transition may remain when final residuals are measured.

## 9. Required metrics

For every trace/policy:

### Shared truth
- client A vs client B actor-state split over time: p95 / max / final;
- client A vs client B relay-prop position, velocity and rotation split: p95 / max / final;
- final client A/B residual vs that policy's authoritative canonical state at same tick;
- final authority residual vs intended source oracle;
- whether the early actor fork propagates into a later materially different relay-prop consequence.

### Prediction/correction
For each client correction:
- self actor position replacement;
- remote actor position replacement;
- relay prop position replacement;
- relay prop velocity replacement;
- relay prop rotation replacement;
- correction count;
- logical rewind horizon in ticks: median / p95 / max.

### Authority history cost
- authority rollback/resim count;
- logical rewind horizon: median / p95 / max;
- scheduled missing-at-consume count / accepted target-tick rate;
- no production CPU claim from rebuild-from-seed work.

### Timing provenance
- exact F3.0 trace parameters;
- prediction lead and batch size;
- deterministic network-pattern identity.

## 10. Predeclared invariants / apparatus audits

The apparatus must fail its own run if any of these structural expectations are violated without explanation:

1. In healthy scheduled cells where F3.0 reports 100% target-tick delivery, the scheduled authority canonical trajectory must match the intended source oracle to numerical tolerance.
2. `source-time-common` authority must match the intended source oracle after drain.
3. After full metadata/history drain, `authority-time-common` clients must converge to their authority-time canonical trajectory.
4. After full remote-history drain, healthy `scheduled-forward-reconcile` clients must converge to the scheduled authoritative trajectory.
5. The L6 scheduled negative must retain its F3.0 late/missing authority events; the apparatus may not repair them by changing policy.
6. A policy may not compare states from different canonical ticks and call the difference network error.

If an invariant fails, audit apparatus ordering before interpreting physical results.

## 11. Discriminator

`scheduled-forward-reconcile` earns the next implementation gate if, in the healthy 65/85 ms traces:
- authority remains forward-only and realizes the intended canonical history;
- after delayed remote-history repair, clients converge to the same authoritative physical consequence through both actor contact and later relay-prop interaction;
- required client history horizon is finite and consistent with F3.0 timing bounds;
- no new mixed-time physical inconsistency appears that requires authority rollback merely for normal input.

This does **not** require scheduled prediction corrections to be human-invisible. If physical truth qualifies but correction magnitude is perceptually concerning, the next gate can become presentation/reconciliation placement rather than rejection of the timing family.

`source-time-common` remains a valid competitor. If it materially reduces client correction while requiring bounded authority rollback, preserve that trade-off rather than declaring one family universally superior.

`authority-time-common` remains viable if it converges mechanically; large self correction is a cost, not an automatic logical failure.

If the scheduled healthy cells fail shared causal truth despite correct target-tick authority and complete client history repair, scheduled timing is rejected/redesigned before F2 productionization.

## 12. Natural stopping boundary

F3.1 ends with a temporal-family verdict and exact representative correction/history budgets.

Do **not** in F3.1:
- integrate F2 recording/checkpoint machinery into browser/server runtime;
- build entity-ID remapping;
- add smoothing;
- change live WebSocket protocol;
- deploy treatment to PR #15;
- optimize causal subsets / prediction islands;
- select final snapshot cadence or transport.

If F3.1 qualifies a family requiring history repair, the next gate may then replace global-seed oracle rebuilds with the already-qualified F2 bounded full-physics checkpoint substrate.