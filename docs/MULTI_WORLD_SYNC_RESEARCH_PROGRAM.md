# Multi_World — Synchronization research program

Status: **CANONICAL RESEARCH MAP / NOT FINAL ARCHITECTURE**  
Date: 2026-09-02

This document records the current synchronization decision tree after the F1/F2 evidence and the subsequent architecture red-team. It is intentionally more durable than one experiment, but it must not be mistaken for an implementation mandate. Product truth remains in `MULTI_WORLD_PROJECT_SOUL.md`; live repo/evidence remains higher technical authority.

## 1. Problem we are actually solving

Multi_World needs to preserve three things at once:

1. **immediate local embodiment** — local control cannot feel like WAN round-trip input delay;
2. **physical consequence** — dynamic contact and shared matter must remain real physics rather than cosmetic transform playback;
3. **shared truth** — delayed independently controlled players must not create permanently different causal worlds on different machines.

The current research problem is not generic multiplayer replication. It is the collision of those three requirements in a small 2–3 player shared physical world.

## 2. Evidence already earned

The qualified ladder up through F2 establishes:

- the zero-reconciliation full-local two-client control feels good locally but can fork shared physical consequence;
- direct player contact is a causal amplifier and the fork can later propagate into shared dynamic matter;
- naïve fresh/stale transform or velocity treatments do not solve the coupled-history problem;
- history-aware repair can collapse the deterministic causal fork in the T4/T5 oracle;
- F1 showed that mixed time histories are structurally insufficient: a common canonical event history is required for the coupled world;
- F1 also showed that both an authority-apply-time common history and a source-time common history can be mechanically coherent, but place WAN-delay cost differently;
- F2 showed that exact `box3d.js@0.1.1` has a viable bounded full-physics history substrate: deep recording seeds, backward seek, branchable restored worlds, active-contact fidelity and generational handoff.

F2 is therefore a **mechanism capability**, not a mandate that normal authority operation must roll back.

## 3. Red-team correction after F2

The previously selected F3 — immediately combining source-time late input with bounded authority rollback — is **superseded before execution**.

The missing discriminator is a third timing family that F1 did not model faithfully enough:

> **canonical scheduled simulation ticks + client prediction lead + authority input buffering**

Professional donor systems repeatedly separate input authority from state authority and attach input to simulation ticks. Clients predict ahead; the server consumes commands for their scheduled authoritative tick; client history/reconciliation repairs prediction errors. This makes server rollback an exceptional/advanced tool rather than automatically the normal input clock.

Relevant donor directions include:

- Unreal Networked Physics / Mover Network Prediction: shared simulation timeline, clients predict ahead, inputs target a simulation timeframe, server buffers them until that time, client correction uses rollback/resimulation;
- Photon Fusion: input history synchronized with state authority, per-tick input consumption, client prediction sufficiently ahead for input to reach authority before the corresponding server tick;
- Unity Netcode for Entities: predicted vs interpolated timelines, prediction switching, rollback/replay cost management, and documented failure modes when interacting physics objects occupy different rollback timelines;
- Rocket League networking work: physics-frame input identity, server input buffering, full client-side prediction and correction against authoritative physics history.

These are donors and falsifiers, not architectures to copy.

## 4. Architectural layers that must remain separate

Do not let one mechanism silently answer several independent questions.

### A. Simulation time contract

Define canonical simulation tick identity and how clients estimate/track the authority timeline.

Questions:
- what tick does a command belong to?
- how far ahead does a predicting client run?
- how is clock/tick drift corrected?
- what is a legal past/future input window?

### B. Input transport and authority consumption

Define per-player input history/ring buffering, missing-input policy, sequencing and acknowledgements.

Questions:
- how early/late do commands reach authority?
- how many logical input ticks may be batched into one transport message?
- when is hold-last safe, when must neutral input be used, and when is a command rejected?

### C. Authoritative physical truth

The server owns canonical state. Normal operation should be tested as forward-only before authority rollback becomes a baseline requirement.

### D. Client prediction history and reconciliation

Clients need enough state/input history to compare an authoritative tick with the predicted history and replay to their current predicted tick when necessary.

F2 may be useful here as a full-physics checkpoint substrate.

### E. Prediction scope

Early World0 should prefer a complete predicted local physics world because it gives the cleanest causal experiment.

Only later, if cost requires it, test prediction LOD / causal physics islands. A subset must be selected by causal/contact closure, not merely distance, because partial rollback can create impossible mixed-time collisions.

### F. Presentation

Physics correction and rendering correction are distinct. Physical truth may change immediately while a render proxy hides a bounded visual discontinuity. Presentation smoothing must never become a hidden physics force.

### G. Replication and wire format

Snapshot cadence, delta compression, binary encoding, stable network entity IDs and interest management are productionization questions after temporal semantics qualify. Current JSON remains a useful research format.

### H. Transport and deployment topology

WebSocket + Durable Object remain current substrates, not project identity. Transport head-of-line behavior, placement, session creation and regional authority should be measured later rather than assumed away or prematurely replaced.

### I. Observability / chaos

A professional synchronization system must expose its timing and correction behavior directly. It should eventually measure tick lead, buffer occupancy, late/missing input, snapshot age, corrections, resim horizon, checkpoint cost, causal consequence mismatch and simulation cost under controlled latency/jitter/hitches.

## 5. Revised research ladder

The labels below identify questions, not implementation commitments. Re-select after every qualified result.

### F3.0 — canonical timeline / buffered-input feasibility

**Purpose:** determine whether the scheduled-tick family deserves to enter the physical comparison at all.

Build a deterministic timing-domain simulator without Box3D.

Model at minimum:

- server simulation: 60 Hz fixed tick;
- client predicted tick lead;
- per-player tick-indexed commands;
- authority input buffer;
- server relay/ack/snapshot timing;
- client knowledge of remote commands/state;
- batching as a parameter rather than assuming one network packet per physics tick.

Sweep a bounded network envelope:

- one-way latency: `35 / 65 / 85 / 120 ms`;
- jitter: `0 / 10 / 30 ms` initially;
- prediction/input lead: several tick depths chosen by the apparatus;
- at least a smooth and a bursty delivery phase.

Primary metrics:

- authority command on-time percentage;
- command lead/deficit at authority in ticks;
- input-buffer depth distribution;
- missing/hold-last events;
- peer knowledge arrival relative to that peer's predicted tick;
- implied client rollback horizon for remote causes;
- added authoritative timeline latency vs immediate local predicted response.

**Critical expected insight:** even if prediction lead makes local commands arrive before authority needs them, independently controlled remote intent may still reach another predicting client after that client has simulated the target tick. F3.0 must quantify that unavoidable uncertainty rather than pretending scheduled input eliminates client reconciliation.

**Natural stop:** one timing model is either clearly feasible within the target envelope, clearly requires unreasonable lead/buffering, or the model is underdetermined and needs one additional timing variable. Do not add Box3D before this is known.

### F3.1 — coupled-physics timing discriminator

Only if F3.0 earns it, drive the existing T5 actor-contact → shared-prop causal-relay scenario from exact F3.0 timing traces.

Compare at least conceptually distinct families:

1. receipt-live historical control;
2. common authority-apply-time repair / forward authority family;
3. **scheduled canonical tick + forward authority + client prediction/reconciliation**;
4. source-time common-history repair with authority rollback.

Use the same physical scene and causal-relay measurements so differences come from temporal policy rather than scene redesign.

Measure:

- client↔client and client↔authority physical residuals;
- actor and shared-prop causal consequence disagreement;
- local-self physical correction magnitude;
- client resim count/horizon;
- authority rollback count/horizon;
- full-history/checkpoint cost where actually used.

**Decision:** select the least expensive temporal family that preserves immediate local embodiment and one shared physical consequence. Do not select by elegance or donor prestige.

### F4 — bounded real reconciliation substrate

If F3.1 favors forward authority, use F2 primarily to prove **client-side** bounded full-physics reconciliation first. If F3.1 proves authority rollback materially necessary, use the same substrate on authority as well.

Before runtime integration, qualify:

- stable `NetEntityId -> current BodyId` remapping across restored generations;
- bounded history retention and rotation;
- checkpoint/replay cost across larger and more contact-heavy scenes;
- correction event ordering and one-shot gameplay side effects during replay;
- exact authoritative snapshot/ack tick semantics.

### F5 — real two-client browser vertical slice

Replace the research timing side channel with the smallest real ticked protocol that embodies the qualified F3/F4 model.

Requirements should include:

- desktop + mobile;
- immediate local control;
- two independently controlled predicted bodies;
- shared dynamic props;
- authoritative tick identity and acknowledgements;
- measurable reconciliation;
- preserved PR #15 as the untouched human control.

This is the first point where Owner free play becomes highly valuable again.

### F6 — Network Chaos + observability gate

Turn latency from hidden environment noise into an explicit test dimension.

Automate at least:

- latency and asymmetric latency;
- jitter/bursts;
- client/server hitches;
- reconnect/recovery where relevant;
- transport backlog signals.

Measure at least:

- RTT/jitter;
- predicted lead and confirmed tick;
- input buffer occupancy;
- late/missing input;
- snapshot age;
- correction rate/magnitude;
- replay ticks and burst cost;
- shared physical consequence disagreement;
- bytes/sec and simulation cost.

Add packet loss/reordering only where the actual transport semantics make the model meaningful; WebSocket/TCP already orders/retransmits and can instead expose head-of-line stalls.

### F7 — prediction scope / causal-island optimization, only if earned

Do not optimize a 2–3 player World0 before cost evidence requires it.

If complete-world client prediction becomes too expensive, test a dynamic causal prediction island:

`locally controlled body -> active contacts/constraints -> objects capable of influencing those contacts during the history horizon`

Keep membership sticky over a short history horizon. Compare against complete-world prediction. Reject simple nearest-N/radius rollback if it violates causal closure.

### F8 — protocol productionization, only after the model survives play

Candidates:

- versioned binary hot-path protocol;
- compact/quantized ticked input batches;
- stable network entity IDs;
- snapshot base ticks and delta compression;
- relevance/interest management;
- explicit anti-cheat timing windows and input sanitization;
- transport abstraction.

Do not spend product time here while temporal/physical semantics are still moving.

### Later topology / world-continuity work

Only after the shared-physics vertical slice is good enough to inhabit:

- session/match placement and authority region selection;
- Durable Object suitability vs alternate authoritative substrate;
- reconnect and long-lived-world continuity;
- persistence boundaries;
- larger spaces or player counts.

These remain downstream of the small shared-place experience.

## 6. Candidate architecture — hypothesis, not commitment

The current strongest candidate is:

`canonical server tick`

→ `per-player ticked input buffers`

→ `normally forward-only authoritative Box3D`

→ `tick-tagged authoritative snapshots/acks`

→ `client predicted full-physics world + bounded history`

→ `rollback/resimulation on prediction error`

→ `render presentation separated from corrected physics truth`

with F2-style authority rollback retained as an exceptional mechanism unless F3 proves it is required for normal shared physical consequence.

This candidate must be falsified by Multi_World evidence; it is not promoted merely because professional donor systems use related ideas.

## 7. Guardrails

Do not silently assume:

- that client prediction lead eliminates uncertainty about remote human input;
- that authority rollback is either mandatory or unnecessary before F3.1;
- that perfect deterministic cross-machine replay is free;
- that higher snapshot rate fixes causal history;
- that selective rollback by proximity is physically valid;
- that every networked object must be predicted;
- that current `box3d.js` recording internals are a stable long-term public API;
- that JSON/WebSocket/Durable Objects are final;
- that production binary protocol, matchmaking or persistence are prerequisites for the next physical truth experiment.

## 8. Immediate execution contract

Current active branch should be a fresh branch from exact qualified F2 head, not the obsolete pre-result bounded-authority-resim branch.

Start with **F3.0 only**.

Before implementation:

1. write down exact tick definitions and event ordering;
2. distinguish local predicted tick, canonical server tick, confirmed tick and interpolated/render time;
3. specify how prediction lead is chosen in the apparatus;
4. specify command generation, batching, uplink arrival, authority consumption, relay/snapshot and client receipt ordering;
5. define pass/fail/discriminator metrics before seeing results;
6. ensure no Box3D or F2 checkpoint machinery is required to answer F3.0.

Only after that contract survives audit should the F3.0 apparatus and dedicated workflow be written.
