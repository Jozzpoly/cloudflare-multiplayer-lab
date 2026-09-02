# Multi_World — Foundation strategy

Status: **CANONICAL STRATEGIC DIRECTION / NOT FINAL ARCHITECTURE**  
Date: **2026-09-03**

This document connects the product intent in `MULTI_WORLD_PROJECT_SOUL.md` with the next technical stages after the F1–F4 synchronization research. It is intentionally narrower than a product roadmap and broader than one experiment.

Live repo state, exact SHAs, deployed runtime evidence and qualified issue #8 checkpoints outrank this document on technical facts.

---

## 1. The project is not trying to build netcode for its own sake

Multi_World is trying to create a small shared physical living world in which a few real people experience one place, one consequential material world and immediate enough local agency.

The technical program exists to protect the product tension:

> **PLAYER INTENT ↔ PHYSICAL CONSEQUENCE ↔ SHARED TRUTH**

A technically elegant synchronization system that prevents the project from becoming an inhabitable world is a failure.

A fun prototype whose multiplayer semantics cannot survive ordinary recovery, active contact or later world continuity is also a failure.

The project must therefore advance three coupled axes:

- **Experience** — does another person feel physically present in the same place?
- **Foundation** — are the temporal, physical and lifecycle semantics strong enough that later product work will not require rebuilding multiplayer from first principles?
- **World** — is there increasingly something worth doing, changing and returning to together?

These axes do not advance equally at every step. Product evidence remains the reason for foundation work, not its reward at the end.

---

## 2. What the synchronization research has actually earned

Qualified F1–F4 evidence supports, but does not yet permanently select, the following normal-flow family:

`canonical target ticks`
→ `per-player future input buffers`
→ `normally forward-only state authority`
→ `authoritative consumption feedback`
→ `complete client-side predicted physics`
→ `bounded recent full-physics history`
→ `client rollback/resimulation`
→ `presentation separated from corrected physics truth`.

Important qualification:

- F3.1 established equivalent client correction/history cost for the compared canonical histories, **not** identical human wall-clock realization between scheduled-forward and source-time authority rollback.
- F5 is the first real human test of whether the scheduled wall-time→canonical-time mapping is acceptable in play.
- F2/F4 prove a useful `box3d.js@0.1.1` recording/replay capability. They do not prove that upstream recording internals should become Multi_World's persistent world format or permanent public API dependency.

Professional donor systems use related separations of input authority, state authority, prediction history and resimulation. This supports the family as credible engineering, but does not replace Multi_World evidence.

---

## 3. Strategic transition after F5

Do not continue mechanically as `F5 → F6 → F7 → F8`.

The intended strategic progression is:

### Stage A — F5 Live Truth Gate

Get the already-prepared scheduled-history candidate into an isolated real staging runtime and measure it on desktop + phone.

Before live deployment, only small evidence-hardening changes are justified:

- explicit simulation/build fingerprint in handshake/telemetry;
- canonical host application ordering where order can influence determinism;
- correction CPU duration and client frame-time / burst diagnostics, especially on mobile;
- contract/documentation alignment with the actual implementation.

Then stop at a faithful raw-correction Owner test.

F5 succeeds only if the temporal model is mechanically coherent **and** sufficiently promising in human use to justify foundation investment. Compile/CI success is not F5 success.

### Stage B — Multiplayer Foundation v0 Qualification

If F5 survives, qualify the small set of properties whose late failure would force expensive architectural reconstruction.

The purpose is:

> **Decide whether the multiplayer model is solid enough to begin building a real small world on top of it.**

This is a bounded qualification program, not an invitation to build production middleware before the product.

### Stage C — Inhabitable World V0

Once the foundation is qualified within an explicit envelope, leave the laboratory and build a small place for 2–3 people with enough meaningful shared matter to generate unscripted cooperative/conflicting play.

Do not require causal islands, binary protocol, final persistence, matchmaking or transport replacement before World V0 unless evidence proves they block it.

### Stage D — Earned optimization and world continuity

Use real-world play and measured constraints to choose later work:

- full-world prediction too expensive → prediction scope / causal closure experiment;
- serialization/bandwidth actually expensive → compact/binary/delta protocol;
- measured TCP HOL prevents the required experience → transport/channel experiment;
- authority compute/placement actually fails the target → authority substrate/topology experiment;
- the world becomes worth returning to → persistence/dormancy/continuity work.

No optimization receives priority merely because mature multiplayer stacks commonly contain it.

---

## 4. Multiplayer Foundation v0 — properties to qualify

Foundation v0 does **not** mean production-complete. It means the most dangerous semantic assumptions have survived relevant evidence.

### 4.1 Simulation identity

Move toward explicit logical identity:

`WorldId + WorldEpoch + CanonicalTick + SimBuildId + NetEntityId`.

Intended meanings:

- `WorldId` — the logical shared place;
- `WorldEpoch` — one authoritative history/generation of that world;
- `CanonicalTick` — simulation address inside the epoch;
- `SimBuildId` — exact simulation contract/build/config relevant to deterministic behavior;
- `NetEntityId` — stable application identity independent of Box3D handles and replay generations.

These are strategic semantics to qualify, not permission to design a large schema now.

### 4.2 Application-level determinism envelope

Box3D is designed for cross-platform determinism, but the application can break it through creation order, host ordering, math/build differences or nondeterministic gameplay code.

Qualification should therefore replay the same canonical command/event ledger on authority, desktop, mobile and an offline reference where practical, and identify the **first divergent tick** using deterministic state fingerprints.

Do not assume "Box3D deterministic" means "Multi_World deterministic".

### 4.3 Time / prediction / network envelope

Replace the experimental fixed `L=8` assumption with measured behavior under:

- real RTT and asymmetric paths;
- jitter/bursts and WebSocket/TCP head-of-line stalls;
- authority/client hitches;
- clock/phase drift;
- browser background/suspend/resume where relevant.

Qualify the control problem for prediction lead rather than prematurely selecting one tuning algorithm.

### 4.4 Bootstrap, reconnect and authority generation

F5 begins both clients from one clean start boundary. A real world will not.

Foundation qualification must test at least:

- join-in-progress into an already active physical world;
- reconnect after temporary disconnection;
- stale packet/history rejection across an authority restart/new epoch;
- reconstruction/catch-up while contacts or dynamic matter are active.

A logical `WorldId` must not be identical to one immortal Durable Object instance or one in-memory Box3D world.

### 4.5 Rollback-safe gameplay lifecycle

Rollback may execute a historical simulation tick multiple times.

Before significant gameplay systems accumulate, qualify a minimal distinction between:

- replayable simulation effects/state;
- committed/irreversible external or persistent effects.

A small crucible should include spawn/despawn or another entity lifecycle mutation and at least one effect that must not duplicate or disappear during rollback.

Do not design a universal event framework unless the experiment earns it.

### 4.6 Identity and dynamic entity lifecycle

F4 proved that Box3D `BodyId` and recording creation ordinals are not persistent identity across replay generations.

Foundation work should qualify dynamic create/destroy/recreate semantics with stable `NetEntityId` and explicit generation-local runtime remapping.

### 4.7 Performance envelope

Measure, do not infer, the usable envelope for:

- desktop client;
- representative phone client;
- authority runtime;
- increasing active-body/contact density;
- rollback/resimulation bursts.

Critical measurements include correction duration, frame spikes, replay steps, history memory and authority physics time.

Complete-world prediction remains the clean default until evidence makes its cost unacceptable.

### 4.8 Observability / causal trace

The foundation should be able to reconstruct why a correction happened.

Converge toward one trace vocabulary containing events such as:

`input sampled`
→ `target tick generated`
→ `batch sent/accepted`
→ `authority consumed`
→ `peer learned`
→ `snapshot/confirmation received`
→ `correction began at B(T)`
→ `N steps replayed`
→ `corrected state/presentation applied`.

The first deliverable is a common trace contract, not a large dashboard product.

### 4.9 Authority and transport portability — constraint, not immediate refactor

Cloudflare Durable Objects and WebSockets remain valid current substrates unless measured evidence rejects them.

However, simulation/protocol semantics should not intentionally depend on properties unique to one hosting/transport implementation where a clean boundary is cheap.

Do **not** refactor the project into a generic portable engine before F5/qualification. Preserve portability by avoiding accidental semantic coupling; extract adapters only when concrete implementation pressure earns them.

---

## 5. Persistence boundary

The project should preserve a conceptual separation between:

1. **persistent logical world state** — durable facts that should matter across sessions;
2. **active authority runtime state** — state needed to run the current physics epoch;
3. **ephemeral rollback/prediction history** — short-lived state used for reconciliation.

Do not automatically use Box3D recording buffers as the persistent world/save format. Their strongest current evidence is as bounded ephemeral replay state.

Long-term direction may look like:

`persistent WorldId`
→ `activate authority epoch`
→ `live shared physics`
→ `durable checkpoint`
→ `dormant world`
→ later `new epoch`.

This is a directional constraint, not current implementation scope.

---

## 6. Inhabitable World V0

Foundation work earns value only by enabling a real shared place.

World V0 should deliberately remain small but should include several physically meaningful opportunities such as:

- matter two people can move together;
- something one player can use to obstruct another;
- arrangements that can be disturbed or improvised with;
- spatial situations where another person's body/location matters;
- enough persistence during the active session that local actions create shared history.

It does not need RPG systems, economy, combat, AI or progression.

The goal is to make free play generate the next research questions more effectively than synthetic laboratories.

---

## 7. Foundation v0 exit rule

Avoid an endless qualification program.

Foundation v0 may be declared **QUALIFIED WITH AN EXPLICIT ENVELOPE** once evidence is strong enough that building World V0 is more informative than continuing substrate research.

The envelope may explicitly constrain, for example:

- 2–3 players;
- one authority region/session placement model;
- a bounded network/RTT envelope;
- a bounded active-body/contact density;
- current browser/device requirements;
- temporary limitations on reconnect or world activation.

Not every production concern must be solved before World V0.

Reject or redesign the foundation before World V0 only when evidence exposes a problem whose correction would require rebuilding core temporal/identity/lifecycle semantics later.

---

## 8. Working responsibility of the browser orchestrator

The browser orchestrator should actively lead this transition rather than wait for the Owner to repeatedly ask "what next?".

Default responsibilities:

- maintain the current evidence/hypothesis/commitment boundary;
- identify future-expensive unknowns early;
- research donor systems and substrate constraints when they can change a decision;
- design and execute the cheapest discriminating automated work before requesting human attention;
- red-team its own results;
- preserve exact controls and provenance;
- keep canonical state/handoff documents current;
- return to the Owner primarily for perceptual/product judgement that machines cannot supply;
- after every meaningful result, re-select the next move rather than mechanically following old stage labels.

Decision filters:

1. product relevance;
2. future irreversibility/cost of being wrong;
3. information gain;
4. Owner attention cost;
5. prototype gravity / accidental architecture commitment.

The Owner remains authority over what world is worth building. The orchestrator is responsible for making the technical path toward that world increasingly credible.

---

## 9. Immediate next boundary

The current live F5 candidate must still earn a real runtime/human result.

Before staging deployment:

1. align the F5 contract with the actual canonical actor ordering already implemented;
2. add/plan only the small evidence hardening justified above: simulation fingerprint and client correction/frame-time timing;
3. preserve root production containment and isolated staging lifecycle;
4. run automated live protocol/runtime smoke before Owner involvement;
5. conduct one desktop + phone raw-correction Owner session;
6. stop and interpret the result before designing the concrete Foundation v0 qualification sequence.

Do not pre-build the whole Foundation v0 program before F5 tells us whether the currently favored temporal family deserves to survive.
