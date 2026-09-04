# World V0 Capacity Cartography

Status: experimental research lane. This document does **not** replace the qualified Shared Yard contract and does not authorize merging PR #32.

Baseline anchor: `world-v0-shared-yard@b27de8b04c27777250c47e7e936674e0f147fdfa`.

## Why this exists

Qualified Shared Yard proves a bounded two-player causal world with exact-state guards, prediction/correction, authoritative physics and real-device play. It does **not** establish the capacity envelope of that architecture. The current world contains only two player capsules and twelve identical dynamic cubes.

The next research question is therefore not “can we add more props?” but:

> Across state width, contact complexity, kinetic energy, history/rollback pressure, network adversity and rendering load, what is the last known good operating region and what subsystem fails first as pressure increases?

A single spectacular chaos room cannot answer that. Capacity Cartography treats failure as data and searches for boundaries along controlled axes before combining them.

## Rules

1. The qualified Shared Yard remains the control specimen. Capacity work lives beside it.
2. No performance result from hosted CI is a product-device performance claim.
3. Do not hide or retry past a failure boundary. Record `lastKnownGood`, `firstBroken`, failure class and environment.
4. Do not lower exact-state, lease, identity or lifecycle semantics to make a larger load pass.
5. Separate causal axes before integrated chaos. Otherwise a slowdown cannot be attributed.
6. Determinism failure is a hard failure even if the scene looks smooth.
7. A visually smooth Owner run is evidence of product feel, not proof of unbounded capacity.
8. Platform ceilings are context, not targets. We care first about the architecture's own earliest wall.

## Failure taxonomy

- `PHYSICS_STEP_BUDGET`: canonical Box3D step no longer fits the intended 60 Hz real-time budget in the measured environment.
- `NON_FINITE_STATE`: NaN/Infinity or invalid body state.
- `DETERMINISM`: identical deterministic runs produce different final F32 state hashes.
- `HISTORY_CAPACITY`: an 8-tick client recording approaches/exceeds the current 2 MiB recording capacity.
- `ROLLBACK_COST`: rewind/replay correction work becomes too expensive or exceeds retained history.
- `AUTHORITY_CATCHUP`: authority accumulates catch-up/dropped ticks under load.
- `STATE_WIDTH`: snapshot/state-guard serialization or message bandwidth becomes the limiting dimension.
- `NETWORK_ADVERSITY`: bounded latency/jitter/reorder causes late/reject/dead-man behavior outside the accepted contract.
- `CLIENT_FRAME`: browser presentation becomes the first wall while authoritative simulation remains healthy.
- `LIFECYCLE`: object/socket epoch behavior fails under sustained load or restart pressure.
- `OBSERVABILITY`: the system fails but evidence cannot identify why. This is itself a research defect.

## Stress primitives

Capacity Cartography uses deterministic physical primitives rather than only body count.

### `quiet-width`

Many heterogeneous dynamic bodies resting separately on the floor.

Primary pressure: body/state width with minimal contact entropy.

### `hetero-pile`

Mixed-size, mixed-density boxes stacked densely and allowed to collapse.

Primary pressure: persistent multi-body contact solving, mass/size heterogeneity and sleep transitions.

### `kinetic-swarm`

Mixed bodies launched through a bounded arena with high restitution and deterministic initial velocities.

Primary pressure: broadphase churn, rapidly changing contact graph, kinetic energy and wakefulness.

### `ram-chain`

One large high-density fast body impacts a dense field of smaller lighter bodies.

Primary pressure: large mass ratio, causal impulse propagation, abrupt state change across many bodies.

### `wake-churn`

A heterogeneous pile receives deterministic periodic velocity injections into subsets of bodies.

Primary pressure: repeated sleep/wake invalidation and sustained contact churn rather than one transient collapse.

## CC1 — isolated browser physics + production-like recording

Uses the same `box3d.js@0.1.1`, 60 Hz and 4 substeps as Shared Yard, but no network and no renderer.

For each scenario and adaptive body-count ladder:

- run raw physics;
- run physics while rotating Box3D recording every 8 ticks using the current 2 MiB capacity;
- measure build time, p50/p95/p99/max step duration, real-time budget overruns, recording segment sizes, optional JS heap sample and finite-state status;
- repeat deterministic cells and compare final F32 state hashes;
- identify first broken count per scenario/profile.

This is a kernel/recording capacity result only. It cannot qualify the authority, WebSocket path, rollback correction path or device rendering.

## CC2 — authority capacity ladder

Reuse the same deterministic scene generator in an isolated stress Durable Object. Add authority-side observability before scaling:

- Box3D step wall time distribution;
- snapshot serialization wall time and bytes;
- exact-state guard bytes;
- broadcast bytes/rate;
- catch-up and dropped ticks;
- active/sleeping body counts if the binding exposes them;
- non-finite/failure reason;
- current body count and scenario provenance in every evidence record.

Run counts upward until the first repeatable failure, then narrow the boundary rather than merely trying a larger number.

## CC3 — two-client exact-state integrated ladder

Attach two real Chromium clients to the isolated authority lab. Preserve the same exact-state falsifier and history semantics as Shared Yard.

Add measurements for:

- guard match/mismatch/pending;
- correction count and spatial amplitude by actor/prop;
- rewind/replay depth and correction duration;
- recording bytes and retained history memory;
- RTT, late/rejected records;
- client frame timing separately from simulation health.

The key question is not “does 256 bodies render?” but whether the **same deterministic shared world remains exact while corrections and history operate under physical turbulence**.

## CC4 — rollback amplification / network adversity

Only after CC3 has a known-good physical load. Apply controlled adversity independently:

- fixed added latency;
- jitter;
- burst delay;
- bounded reorder if the harness can model it without changing server semantics;
- rapid input-direction changes near high-contact events;
- late remote input timed immediately before/after a large causal collision.

This deliberately seeks the case where one late input changes not just a player, but a large downstream contact chain, forcing correction across many props. That is a substantially stronger falsifier than ordinary walking around boxes.

## CC5 — real-device Chaos Yard

Only after the automated boundary map exists. Build an Owner-facing stress playground from known-good-but-demanding settings rather than arbitrary maximum settings.

Desired ingredients:

- heterogeneous small/medium/large bodies;
- dense stacks and loose debris;
- large movable masses;
- high-energy interaction areas;
- mechanisms that repeatedly re-energize the scene;
- two real players able to provoke the same pile from different sides;
- camera/control quality sufficient that Owner judgement is not dominated by bad UX.

The Owner question becomes:

> Does the system remain perceptually coherent and fun near the measured engineering envelope, and do observed corrections/failures match what the automated map predicted?

## Adaptive search policy

Do not hard-code “256 is success”. Start with a geometric ladder (for example 16, 32, 64, 128, 256, 512...) until a boundary is observed. Then bisect or add intermediate counts around the transition.

For each axis report at minimum:

- environment/provenance;
- `lastKnownGood`;
- `firstBroken`;
- failure class;
- body count and scenario;
- raw vs recording-enabled;
- deterministic repeat status;
- p95/p99 step time;
- recording capacity ratio where applicable.

## Current immediate boundary

Implement and run CC1 first. Do **not** modify the qualified Shared Yard simulation to obtain the result. CC1 is complete when it produces a reproducible capacity map for all five stress primitives and reveals whether raw physics, deterministic repeatability or production-like Box3D recording is the first local wall.
