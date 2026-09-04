# World V0 Stress × Play — SP1 revision after CC1.1 red-team

Status: current execution contract for SP1. This refines, and where necessary overrides, the earlier SP1 wording in `WORLD_V0_STRESS_PLAY_PROGRAM.md`. The qualified Shared Yard remains untouched.

Baseline control specimen: `world-v0-shared-yard@b27de8b04c27777250c47e7e936674e0f147fdfa`.

## Why SP1 changed

CC1.1 run `33866011805` completed its browser experiment successfully and produced useful high-load evidence, but red-team review found two apparatus defects:

1. `b3CreateRecording(byteCapacity)` was misread as a hard-capacity API. Upstream Box3D documents it as an **initial preallocation**; the buffer grows on demand. Therefore the previous `history-capacity` verdict at `>= 95%` or `> 100%` of 2 MiB is invalid.
2. the Node smoke used `Promise.race` with an uncleared timeout. The browser result completed in about 21 seconds, but the pending 20-minute timer kept the process alive until the timeout expired. Workflow wall time was therefore apparatus overhead, not a capacity result.

The useful CC1.1 evidence remains:

- recording segments grew beyond the 2 MiB initial preallocation without failure;
- replay verification reported zero replay failures in the tested cells;
- high-load physics and managed-step p95 remained below the 16.67 ms hosted-lab budget through the tested counts;
- finalized retained recording bytes reached roughly 9 MiB in the largest tested cell;
- research-only replay verification became expensive, but its full-world hashing/remapping is not equivalent to the production correction path.

Therefore SP1 has **not found a hard rollback wall yet**.

## SP1A — apparatus semantic repair

Goal: make the next capacity result trustworthy before increasing load.

Required changes:

- rename `recordingCapacityBytes` semantics to `recordingInitialCapacityBytes` / preallocation;
- never classify recording size crossing the initial allocation as failure;
- preserve recording-size growth as an observation;
- clear/abort harness timeout timers after successful completion;
- explicitly distinguish:
  - `steadyStateHistoryMs`,
  - `researchReplayVerifyMs`,
  - later `productionCorrectionMs`;
- do not use a single hosted-runner max-step spike as a wall;
- determinism may only be evaluated across successful completed repeats;
- preserve the old CC1/CC1.1 artifacts unchanged as provenance.

### SP1A stop condition

A short calibration run must prove:

- recording can exceed the initial allocation and still replay exactly;
- no false `history-capacity` verdict remains;
- two deterministic repeats agree;
- the Node smoke exits promptly after browser evidence is written rather than waiting for the harness timeout.

Do not start the next high-load search before this is true.

## SP1B — steady-state history growth / real-time envelope

Goal: determine the cost of maintaining rollback history while the world runs normally.

The measured steady-state loop must **not** create RecPlayers or hash an entire replay every segment. Those are research checks and can perturb GC/cache/timing.

Measure separately:

- Box3D physics-step p50/p95/p99;
- recording stop/get-size/start rotation cost;
- full managed tick excluding research-only verification;
- finalized segment bytes;
- retained finalized recording bytes;
- number of retained finalized segments;
- active recording provenance;
- WASM linear-memory size/growth if the module exposes it;
- JS heap only as secondary context, never as a proxy for WASM memory;
- awake-body count and awake-contact count where available, so load can be related to actual stress duty cycle.

Adaptive search should continue until a **real repeatable wall** is observed, such as:

- non-finite state;
- deterministic drift across equivalent completed runs;
- replay/recording API failure;
- repeatable p95 real-time failure in the measured environment;
- memory/resource exhaustion;
- an observability defect that prevents identifying the failure.

Recording bytes crossing the initial preallocation is not a wall.

### Retention audit

Current Shared Yard history trimming uses an inclusive boundary (`validEndTick >= cutoff`). At exact segment boundaries this may retain a boundary-adjacent extra finalized segment. Before optimizing it, prove whether that segment is required for correction coverage. Treat this first as a provenance/memory question, not an assumed bug.

## SP1C — correction shock / rollback real-time envelope

Goal: measure the thing SP1 actually cares about: a late causal change that forces the production-shaped correction path.

The test must deliberately create a change at historical tick `H` and measure:

1. checkpoint selection;
2. `RecPlayer` creation;
3. seek to the target frame;
4. locator/entity remap;
5. invalidation of later history;
6. replay forward to the current boundary;
7. exact-state comparison after correction;
8. wall time of the correction and any subsequent frame backlog.

Vary independently:

- body/state width;
- rollback depth;
- contact complexity;
- causal footprint size;
- correction frequency.

Do not conflate a one-off deep rollback with repeated corrections every frame.

## SP1D candidate — twin-universe causal-footprint calibration

This is optional but likely high-value before network adversity.

Run deterministic universes A and B with identical Chaos DNA except for one tiny intervention at tick `H`. Track, per later tick:

- number of bodies whose F32 state differs;
- spatial/velocity error amplitude;
- first affected body/contact region;
- time for the affected set to saturate or decay.

Use this to select causal amplifiers scientifically rather than by spectacle.

This is not a correctness gate by itself. It is a scenario-selection instrument for SP1C/SP5.

## Parallel SP2 work allowed during SP1

SP2 may continue only where independent of an unresolved SP1 boundary:

- pure Chaos DNA manifest contract;
- capability probes for exact `box3d.js@0.1.1`;
- topology replay probe;
- machine/scenario design;
- player-as-causal-hinge design;
- stress-duty-cycle metrics.

Do not yet build a product-facing multiplayer Chaos Playground around an assumed safe intensity.

## Dynamic milestone rule

Before every next milestone, explicitly ask:

1. What claim did the previous stage actually establish?
2. What assumption did it falsify?
3. Could the apparatus itself create the observed wall?
4. Is the next planned stage still the highest-value uncertainty?
5. Can the next research primitive also become a meaningful gameplay primitive later?
6. Is there a cheaper orthogonal falsifier that should run first?

The plan is allowed to change whenever evidence changes the problem. Preserving the original stage sequence is never a goal.
