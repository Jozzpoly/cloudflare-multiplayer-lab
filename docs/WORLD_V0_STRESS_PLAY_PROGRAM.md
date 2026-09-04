# World V0 Stress × Play Program

Status: active experimental program on an isolated research lane.

Canonical control specimen: `world-v0-shared-yard@b27de8b04c27777250c47e7e936674e0f147fdfa`.

This program extends `WORLD_V0_CAPACITY_CARTOGRAPHY.md`. It does not replace the qualified Shared Yard contract and does not authorize merging PR #32.

## Purpose

Capacity work should not degenerate into a sterile benchmark campaign. The same physical phenomena that expose limits can also become compelling multiplayer toys. Conversely, spontaneous Owner play can reveal causal structures and edge cases that a laboratory matrix would never propose.

The program therefore runs a deliberate two-way loop:

> instrumented phenomenon → measured boundary → playable translation → Owner chaos → anomaly / fun extraction → deterministic reproduction → stronger instrumented phenomenon

The objective is simultaneously:

1. discover where the current authoritative/predicted/rollback architecture actually fails;
2. understand which subsystem fails first and why;
3. turn useful stress phenomena into gameplay affordances rather than disposable test fixtures;
4. use play as a discovery instrument without confusing subjective fun with engineering qualification;
5. accumulate a reusable library of physical stress primitives, not one giant benchmark scene.

## Invariants

- Qualified Shared Yard remains the untouched control specimen.
- Research worlds live in isolated branches/routes/Durable Objects.
- A fun scene is not a qualification result.
- A hosted-runner timing is not a device performance claim.
- Do not lower exact-state, identity, lease, lifecycle, replay or failure criteria to obtain a larger body count.
- Failure is useful evidence. Preserve the first reproducible break instead of rerunning to green.
- Every important Owner-observed anomaly should be reduced to the smallest deterministic reproduction before architectural conclusions are drawn.
- Every laboratory primitive should be reviewed for possible playful use, but not every primitive needs to become a feature.

## Program structure

### SP0 — Measurement integrity / apparatus red-team

Question: can the stress apparatus itself be trusted before we interpret its limits?

Work:
- explicit warm-up before timed cells;
- at least two deterministic repeats for cells used in determinism claims;
- separate pure Box3D step time from full managed-tick/history work;
- retain recordings using production-like `8 tick segment / 24 tick retained history` semantics;
- exercise `Recording → RecPlayer → SeekFrame → HasDiverged` instead of measuring recording byte size only;
- compare replayed F32 body state with the corresponding live boundary state;
- distinguish cold-start/JIT outliers from repeatable step-budget failure;
- preserve exact failure reason and scenario/count provenance.

Natural stop: apparatus can intentionally detect injected replay/state/failure defects and produces trustworthy evidence.

Play conversion: none required. This stage exists to keep later fun from lying to us.

### SP1 — Rollback-substrate boundary search

Question: does production-like recording/history/replay fail before raw Box3D stepping as world width/contact complexity rises?

Primary stress primitives:
- `hetero-pile`;
- `ram-chain`;
- `wake-churn`;
- `quiet-width` only as a state-width control.

Search strategy:
- begin above the already-probed 256-body region;
- geometric/intermediate ladder around `384, 512, 640, 768, 896...`;
- stop each axis after the first reproducible break;
- narrow `lastKnownGood ↔ firstBroken` instead of continuing blindly upward.

Measure separately:
- raw physics p50/p95/p99/max;
- full managed-tick p50/p95/p99/max;
- recording rotation/finalization cost;
- segment bytes and capacity ratio;
- max retained-history bytes;
- RecPlayer creation/seek verification cost;
- replay divergence / seek mismatch;
- deterministic F32 final hash across repeats;
- raw-vs-history final-state equality where directly comparable.

Natural stop: at least one real boundary is found, or the tested range is demonstrated to be below all observed boundaries and the next range is justified by evidence.

Play conversion candidates:
- `hetero-pile` → demolition mountain / avalanche pit;
- `ram-chain` → giant battering ram / physics bowling lane;
- `wake-churn` → pulse floor / earthquake machine.

### SP2 — Phenomenon library and shape/mass capability expansion

Question: which *kinds* of physical complexity matter, rather than merely body count?

Before use, capability-probe the exact `box3d.js@0.1.1` wrapper for supported shape/runtime APIs. Do not infer JS binding support from upstream Box2D documentation alone.

Candidate dimensions:
- very small ↔ very large bodies;
- extreme but bounded mass ratios;
- boxes plus any wrapper-proven sphere/capsule/hull/compound shapes;
- tall unstable stacks;
- constrained corridors/funnels;
- dense loose debris;
- sustained kinetic swarms;
- repeated wake/sleep cycles;
- chain-reaction layouts;
- moving heavy bodies crossing fields of light bodies.

Natural stop: we have a small orthogonal library of stress phenomena where each scene pressures a known mechanism.

Play conversion: every accepted phenomenon gets a one-sentence toy hypothesis and may graduate into the Chaos Playground.

### SP3 — Authority decomposition under load

Question: once the same phenomena run inside an isolated staging Durable Object, what fails first: physics, state sampling, guard packing, serialization, broadcast, scheduler catch-up or lifecycle?

Build an isolated stress authority; do not add a hidden stress mode to qualified `SharedYardV0`.

Instrument independently:
- `b3World_Step` wall time;
- scene sampling wall time;
- exact-state guard packing wall time/bytes;
- JSON encode wall time/bytes;
- per-peer send/broadcast work;
- snapshot frequency and total bytes/sec;
- catch-up steps / dropped ticks;
- event-loop delay where observable;
- failure/lifecycle reason.

Red-team a known scaling trap: current Shared Yard serializes broadcast payloads through `JSON.stringify` in the send path per socket. Do not call a serialization wall a physics wall.

Natural stop: a repeatable authority envelope with subsystem attribution.

Play conversion: use measured authority-safe presets as named playground intensity levels rather than arbitrary body-count sliders.

### SP4 — Integrated two-client exact-state ladder

Question: how much turbulent shared physics can two real browser clients predict, record, correct and keep exact?

Use two Chromium clients against the isolated authority. Preserve exact-state guards and rollback semantics.

Measure:
- guard match/mismatch/pending;
- correction frequency and spatial amplitude;
- rewind/replay depth;
- correction wall time;
- retained history bytes;
- late/rejected input;
- RTT;
- client frame timing separately from simulation health;
- exact runtime failure reason.

Natural stop: known-good and first-broken integrated regions exist for at least one high-contact scenario.

Play conversion: choose a load somewhat below the measured integrated wall as the first multiplayer Chaos Playground baseline.

### SP5 — Causal Amplifier / adversarial time

Question: can rollback repair a *large downstream physical consequence* of one late causal input?

Build deterministic chain-reaction mechanisms where a small actor input before a critical contact can alter a large downstream contact graph.

Examples:
- domino reactor;
- unstable debris dam released by one body;
- heavy ram diverted by a small gate/actor contact;
- stacked avalanche triggered milliseconds before impact;
- two competing chains where a tiny early contact determines which one fires.

Apply adversity independently:
- fixed added delay;
- jitter;
- burst delay;
- bounded reorder if the harness can inject it without changing server semantics;
- rapid input changes around the causal hinge.

The desired falsifier is not merely a large correction distance. It is exact recovery after hundreds of causally dependent state changes.

Natural stop: we know whether the architecture can recover a deliberately amplified late-causality event, and where recovery first ceases to be exact/bounded.

Play conversion: these mechanisms are inherently game-like. Keep the best ones as interactive machines rather than deleting them after qualification.

### SP6 — Chaos Playground V0

Question: can the measured stress envelope be converted into something the Owner voluntarily wants to keep playing with?

Build a playable world from *known-good-but-demanding* presets, not the maximum passing body count.

Initial toy families:
- **Demolition Mountain** — heterogeneous pile/stack to climb into, shove and collapse;
- **Battering Ram** — large heavy movable body aimed through debris or towers;
- **Pulse Pit** — periodic re-energization of a debris field;
- **Domino Reactor** — long causal chain that players can interrupt, redirect or race;
- **Meteor / Pinball Storm** — bounded kinetic swarm with safe intensity tiers;
- **Junkyard** — wide field of differently scaled movable bodies that naturally creates improvised games.

Required product affordances before serious Owner use:
- corrected mobile joystick mapping;
- minimally viable interactive camera/view control;
- reset/reseed;
- named intensity preset;
- obvious way for two players to affect the same machinery;
- diagnostics remain available but do not dominate the screen.

Do not over-design objectives. Emergent play is the point.

Natural stop: Owner can produce several minutes of unscripted play where stress phenomena are repeatedly and voluntarily exercised.

### SP7 — Play mining / anomaly harvesting

Question: what does free play reveal that the planned stress suite did not?

During Owner play, capture lightweight markers rather than asking for QA forms:
- timestamp / short verbal cue (`tu się odjebało`, `to było fajne`, etc.);
- recording when practical;
- copied evidence at end or failure;
- intensity/scenario seed.

Classify observations into:
- **fun mechanic** — worth preserving or amplifying;
- **physics anomaly** — surprising physical behavior;
- **network/correction anomaly** — perceptual or exact-state issue;
- **UX blocker** — camera/input prevents meaningful testing;
- **capacity clue** — suggests a new stress axis;
- **pure spectacle** — fun but not yet technically informative.

For every high-value anomaly, attempt deterministic reduction into the phenomenon library.

Natural stop: the playground has generated at least one new test case or product mechanic that was not explicitly designed beforehand.

### SP8 — Envelope synthesis / architectural decision

Question: what did the whole campaign teach us about the architecture, not just one benchmark?

Produce a compact capability map:
- physics-only envelope;
- recording/history envelope;
- authority envelope;
- two-client exact-state envelope;
- adversity/rollback-amplification envelope;
- device/render/feel observations;
- first-failure taxonomy by scenario;
- known safe playground presets;
- unresolved unknowns.

Then decide whether evidence justifies:
- keeping the current architecture and continuing product work;
- optimizing one identified subsystem;
- redesigning history/state transport;
- changing snapshot/guard representation;
- adding spatial/interest management later;
- or deliberately accepting a bounded world scale because it already supports the intended fun.

## Fun ↔ science conversion table

| Lab primitive | Playful form | What play may reveal |
| --- | --- | --- |
| quiet-width | Junkyard / debris field | navigation, state-width/render scaling, improvised pushing games |
| hetero-pile | Demolition Mountain | contact cascades, unstable equilibria, climbing/shoving feel |
| kinetic-swarm | Meteor / Pinball Storm | broadphase/contact churn, perception under chaos |
| ram-chain | Battering Ram / Bowling Cannon | mass-ratio feel, impulse propagation, cooperative aiming |
| wake-churn | Pulse Pit / Earthquake Machine | sustained wakefulness, repeated cascades |
| causal amplifier | Domino Reactor | rollback after deep causal divergence, emergent sabotage/racing |

## Play-first discovery rule

A playground event does not need an immediate explanation to be valuable. Preserve it first.

When the Owner finds a surprising/fun state:

1. keep the seed/scenario/intensity if available;
2. preserve video/evidence when practical;
3. ask whether it is repeatable through natural play;
4. reduce only after the phenomenon has been captured;
5. add the smallest deterministic reproduction to the lab;
6. rerun it with instrumentation;
7. decide whether it is a bug, capacity clue, new mechanic, or all three.

This intentionally allows gameplay to discover research questions rather than forcing all questions to exist before play.

## Current execution order

Immediate:
1. SP0 harden CC1 into trustworthy CC1.1;
2. SP1 run the high-count rollback/history ladder and find/narrow the first real substrate boundary;
3. in parallel, keep Product lane moving toward corrected joystick + minimal Control/View because bad UX would poison SP6 Owner evidence.

After SP1 evidence:
4. choose SP2 phenomena based on observed scaling, not aesthetics;
5. implement SP3 authority decomposition;
6. only then build SP4/5 integrated adversarial worlds;
7. create Chaos Playground from measured near-envelope presets and start SP7 play mining.

This order is intentionally revisable after every boundary discovery.