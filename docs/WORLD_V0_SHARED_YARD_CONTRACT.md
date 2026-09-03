# Multi_World — Inhabitable World V0 / Shared Yard V0 implementation contract

Status: **BOUNDED IMPLEMENTATION CONTRACT**  
Base evidence: `ws0-f5-browser-scheduled-history@dcba3f5f3d49eb05f3932c0a9db57cea15e635da`  
Foundation evidence donor: `foundation-v0-q1-determinism-envelope@681b5be20a776d9c437a89cdfda0244acbdbb493`

## Decision

Foundation v0 is treated as **QUALIFIED WITH AN EXPLICIT ENVELOPE**. The next product/research surface is a real two-player Shared Yard V0. The world itself must falsify the current Foundation before Owner PLAY rather than relying on another detached Q1/Q2 laboratory.

F5 remains frozen evidence. World V0 is a sibling runtime/protocol lineage branching from the archived F5 evidence tree; Q1 contributes exact-state methodology, not runtime ancestry.

## V0 envelope

Supported initially:

- exactly two players;
- one authority and one fresh `WorldEpoch`;
- common clean start before active simulation input;
- 60 Hz Box3D, four substeps, current scheduled-forward input family and bounded client rollback/history;
- 2 upright dynamic player capsules + 12 pre-authored dynamic box props;
- desktop Chromium plus one representative Android Chromium before the first qualified Owner PLAY;
- one active shared session only.

Explicitly outside this envelope:

- mid-session join/bootstrap;
- seamless reconnect or browser background/resume continuity;
- authority restart continuity;
- persistence/dormancy/reactivation;
- runtime spawn/despawn and irreversible rollback-sensitive gameplay effects;
- more than two players, Firefox/WebKit, matchmaking/auth/anti-cheat, transport replacement, selective rollback or interest management.

A disconnect, input-lease failure, stale epoch/build identity, history failure or deterministic-state divergence ends the epoch. V0 must not reconstruct an active contact world from transforms and pretend the old epoch continued.

## Shared Yard authored workload

Keep the F5 body count and physical parameters. Change only the pre-authored arrangement of the 12 props:

- `prop-0..5`: compact 3×2 central barricade for simultaneous/cooperative/conflicting pushing;
- `prop-6..8`: three-cube tower for collapse and multi-contact propagation;
- `prop-9..11`: near-touching train for impulse transfer.

The exact positions live in `src/world-v0-contract.ts` and are part of `SimBuildId`. No runtime entity lifecycle is introduced.

The existing 90 neutral pre-start ticks are also a falsifier: the authored seed must remain finite and usable without an initial-overlap explosion or uncommanded catastrophic collapse.

## Identity and fail-closed lifecycle

Simulation-relevant traffic is bound to:

`WorldId + WorldEpoch + SimBuildId + client simulation revision + CanonicalTick`.

`NetEntityId` is application-owned and stable inside the V0 epoch:

- `actor:0`, `actor:1`;
- `prop-0 .. prop-11`.

A new physical history receives a new random `WorldEpoch`. Stale or mismatched epoch/build traffic is rejected; it is never applied optimistically.

The V0 input lease is currently `36` consecutive missing canonical input records (~600 ms at 60 Hz). Before expiry the authority may hold the last consumed input exactly as F5 did. At expiry it consumes neutral input for that boundary, records `lease_expired`, then ends the epoch. `36` is a V0 parameter, not a permanent architecture constant.

## Exact same-boundary state guard

The authority exposes a diagnostic exact float32 state fingerprint at existing 10 Hz snapshot boundaries. Canonical entity order is:

`actor:0 → actor:1 → prop-0 .. prop-11`.

For every entity the packed state contains:

- position xyz;
- rotation xyzw;
- linear velocity xyz;
- angular velocity xyz.

The browser must compare authority `B(T)` against its corrected local diagnostic `B(T)` after ordered consumption/correction processing. The state snapshot is a **guard, not a repair source**. First mismatch must identify the boundary/entity/component and fail the Foundation acceptance for that build.

The guard does not claim private solver-cache identity. It detects the first point at which any hidden divergence becomes application-visible.

## Bounded causal correction evidence

World V0 will retain only a bounded recent ring of real corrections. Each event should expose enough provenance to explain F5-style asymmetry without building a telemetry framework:

- correction reason (`peer-record`, `authority-consumed`, later explicit lifecycle reason where applicable);
- target tick and pre-correction boundary;
- selected checkpoint / rewind depth / replay steps;
- correction CPU duration and cold-first marker;
- changed used input where available;
- self / remote / prop replacement deltas.

Existing summary/frame/history metrics remain useful. Do not create a generic observability product.

## Implementation dependency order

1. preserve frozen F5 files and controls;
2. introduce sibling World V0 contract/protocol/runtime;
3. earn `WorldEpoch`, simulation identity and canonical-tick dead-man behavior with machine tests;
4. route an isolated staging-only Shared Yard Durable Object;
5. implement the real browser client from the F5 temporal lineage using the authority contract;
6. compare exact same-boundary state in the real world code;
7. add bounded causal correction evidence;
8. run local/CI and isolated cloud/real-Chromium falsifiers;
9. only then spend Owner attention on desktop + Android free PLAY.

## Abort conditions

Stop world expansion and return to the specific Foundation failure if any of these is reproducible:

- exact same-ledger application-state divergence on supported runtimes;
- `history_window_miss`, replay divergence, entity remap failure or non-finite physics;
- stale epoch/build traffic accepted;
- disconnect/restart/background can silently continue the old epoch;
- held input survives the dead-man boundary;
- replay/correction regularly exceeds retained history or causes repeated correction-linked mobile long frames;
- authority cannot sustain this 14-body world without persistent backlog/dropped ticks.

Do not interpret a high correction count, one cold CPU spike or the current `L=8` tuning by themselves as architectural failure.

## Natural boundary

This contract earns Owner PLAY only after the actual Shared Yard Worker + actual browser client pass machine validation. If the real-world exact-state guard fails, the next task is the single first-divergent-tick problem exposed by that failure — not broader World V0 development.
