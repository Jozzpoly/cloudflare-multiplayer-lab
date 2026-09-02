# Multi_World — Fresh Project Takeover v2

Status: **CURRENT STARTUP MANDATE / F5 PRE-DEPLOY + FOUNDATION STRATEGY**  
Prepared: **2026-09-03**

Use this mandate when continuing Multi_World in a fresh Browser ChatGPT conversation.

---

## Mission

Take over **Multi_World** as the browser-based second brain / technical co-orchestrator of an active R&D project.

Do not restart the old A2/A3 grounding exercise and do not mechanically continue an old numbered roadmap.

The project is trying to build toward:

> **a small shared physical living world in which a few real people genuinely inhabit the same place, affect the same matter and experience consequences as shared reality rather than loosely synchronized client illusions.**

The durable product tension is:

> **PLAYER INTENT ↔ PHYSICAL CONSEQUENCE ↔ SHARED TRUTH**

The current technical objective is not generic multiplayer infrastructure. It is to turn the already-qualified synchronization research into a credible multiplayer foundation without allowing foundation work to delay the first world worth inhabiting.

---

## Canonical reading order

Repository:

`Jozzpoly/cloudflare-multiplayer-lab`

Canonical documentation branch:

`multi-world-takeover-grounding`

Read in this order:

1. `docs/MULTI_WORLD_PROJECT_SOUL.md`
2. `docs/MULTI_WORLD_CURRENT_STATE.md`
3. `docs/MULTI_WORLD_FOUNDATION_STRATEGY.md`
4. this mandate
5. when preparing/executing F5: `docs/WS0_F5_BROWSER_SCHEDULED_HISTORY_CONTRACT.md` on the active F5 branch

`MULTI_WORLD_SYNC_RESEARCH_PROGRAM.md` remains synchronization provenance and background. Its old post-F5 `F6/F7/F8` ladder is **not an automatic execution sequence** after the new foundation strategy.

Older Grounding v1, Human Test Context, Fresh Takeover v1, ledgers and archived research branches are provenance. Read them only to resolve a disputed claim or inspect exact evidence.

---

## Hierarchy of truth

1. live repo / exact SHA / current CI / deployed runtime;
2. qualified issue #8 checkpoints and archived research artifacts;
3. `MULTI_WORLD_CURRENT_STATE.md`;
4. `MULTI_WORLD_FOUNDATION_STRATEGY.md` + Project Soul;
5. old plans/conversations.

Do not let a handoff override live evidence.

---

## Current evidence boundary

Treat the following as qualified unless fresh evidence materially contradicts them:

- the frozen desktop+phone zero-reconciliation control shows immediate full-local embodiment can feel clean but coupled remote causality can fork shared physical truth;
- F1: coupled shared physics requires a common canonical event history;
- F2: pinned `box3d.js@0.1.1` recording/replay can provide branchable bounded complete-physics history;
- F3.0: scheduled target ticks + prediction lead + authority input buffering are mechanically feasible within the declared timing sweep, while remote human information still creates RTT-scale client uncertainty;
- F3.1: for the carried coupled scenario, healthy scheduled-forward authority reproduced shared physical truth without normal authority rollback;
- F4: bounded recent complete-physics client history reproduced the F3.1 result exactly, survived overlapping corrections and proved that replay creation ordinals are generation-local.

Important interpretation limit:

F3.1 did **not** prove scheduled-forward and source-time authority rollback realize a human action at the same wall-clock/canonical moment. F5 is the first real human discriminator of scheduled wall-time→canonical-time feel.

Do not reopen F1–F4 merely because a fresh conversation started.

---

## Current F5 frontier

Active branch:

`ws0-f5-browser-scheduled-history`

Runtime implementation candidate before docs-only contract amendment:

`ca8fc10ee93fe91684ba2de2302e2650eeba0a21`

Current expected branch head after pre-live contract amendment:

`0278add0f15f3c76f5b4d62912b207a359def181`

Re-verify live.

F5 currently has:

- isolated `WorldSliceF5` / `WORLD_SLICE_F5` staging-only authority;
- scheduled ticked input protocol and authority future-input buffers;
- validated peer future-record relay;
- authoritative per-tick consumption feedback;
- isolated `/world0-f5/` browser surface;
- full local Box3D prediction for both players + props;
- F4-style bounded 8/24 replay history;
- corrected-history generation handoff and entity remap;
- same-canonical-tick diagnostics;
- raw correction rendering;
- desktop controls and minimal phone touch joystick.

Preflight on implementation head `ca8fc10…` passed run `33694085298`, including protocol smoke, browser syntax, TypeScript, staging Wrangler dry-run and frozen World0 diff guard.

There is **no qualified F5 staging/runtime/Owner result yet**.

---

## Immediate F5 work

Do not redesign the project before the F5 live gate.

Before staging deployment, perform only small evidence-hardening work that does not change F5 temporal semantics:

1. verify/retain canonical server-slot actor creation/application order where relevant to deterministic behavior;
2. expose a simple experimental simulation/build fingerprint (`SimBuildId`-like value) in handshake/telemetry;
3. add correction/resimulation wall-time and useful client frame-time/long-frame diagnostics, especially for phone;
4. rerun repo/preflight checks;
5. verify root production remains traffic-contained and isolated `cloudflare-multiplayer-lab-staging` is explicitly targeting the current F5 branch before lifecycle deployment.

Then:

- deploy to isolated staging;
- automatically smoke real F5 HTTP/WebSocket/DO behavior as far as practical;
- verify exact deployed revisions/fingerprint;
- only then ask the Owner for one desktop + phone raw-correction run.

Owner run progression:

`remote idle`
→ `both move without contact`
→ `player/player contact`
→ `shared prop interaction`.

Stop after the first faithful Owner judgement + matching telemetry.

Do not add smoothing, causal islands, binary protocol, reconnect architecture or transport replacement before that judgement.

---

## Strategic direction after F5

If F5 survives, do **not** automatically execute the old `F6 → F7 → F8` sequence.

Use the F5 evidence to design a bounded:

# **Multi_World Multiplayer Foundation v0 Qualification**

Its purpose is not to become production middleware. Its purpose is to decide whether core multiplayer semantics are solid enough to begin building a real small world without likely architectural reconstruction.

High-value qualification areas are:

- explicit simulation identity such as `WorldId + WorldEpoch + CanonicalTick + SimBuildId + NetEntityId`;
- application-level determinism envelope across authority / desktop / phone and first-divergent-tick diagnostics;
- real prediction-lead/clock/network/hitch envelope;
- join-in-progress/bootstrap into an active physical world;
- reconnect and authority restart/new epoch semantics;
- rollback-safe gameplay side effects and dynamic entity lifecycle;
- mobile/client/authority rollback + physics performance envelope;
- one causal trace vocabulary for input→authority→peer→correction diagnosis;
- authority/transport portability as a constraint, not an immediate generic framework.

Foundation v0 must have an explicit exit rule. It may be **QUALIFIED WITH LIMITS** (for example 2–3 players, bounded RTT/contact density, known reconnect limitations) when building **Inhabitable World V0** is more informative than continued substrate research.

Do not require binary protocol, causal prediction islands, final persistence, matchmaking or transport replacement before World V0 unless measured evidence proves they are blockers.

---

## Long-term conceptual boundaries to preserve

Do not collapse these identities:

- logical `WorldId` ≠ one immortal Durable Object instance;
- `NetEntityId` ≠ Box3D `BodyId` ≠ replay creation ordinal;
- persistent logical world state ≠ active authority physics state ≠ short rollback recording history;
- corrected physics truth ≠ smoothed presentation;
- input authority ≠ state authority;
- replayable simulation effects ≠ irreversible committed/persistent effects.

Cloudflare Durable Objects, WebSockets, Box3D and Three.js remain current substrates, not project identity.

Box3D recording is currently a strong ephemeral rollback mechanism. Do not silently promote it to persistent save/network bootstrap format without separate evidence.

---

## World-facing obligation

If Foundation v0 qualifies, deliberately end the long laboratory period and build **Inhabitable World V0**:

- 2–3 people;
- one small physical place;
- matter that can be moved together, used to obstruct, disturbed/rearranged and exploited in unscripted ways;
- enough shared physical continuity that another person's location/body/actions matter.

It does not need RPG systems, combat, economy, AI or progression.

After that, let actual free play and measured constraints select optimizations:

- CPU problem → prediction scope/causal closure;
- bandwidth/serialization problem → compact/binary/delta protocol;
- measured TCP HOL problem → channel/transport experiment;
- authority placement/compute problem → topology/substrate experiment;
- world worth returning to → persistence/dormancy/continuity.

Do not implement mature-multiplayer checklist items merely because mature engines contain them.

---

## How to lead the project

The Owner should not need to repeatedly invent the next technical prompt.

Browser GPT / orchestrator responsibilities:

- maintain live evidence vs hypothesis vs architecture-commitment boundaries;
- identify unknowns that are expensive to discover late;
- perform targeted donor/substrate research when it can alter a decision;
- design and execute the cheapest meaningful automated falsifier before using Owner attention;
- red-team its own apparatus and result;
- preserve controls/provenance and keep canonical docs current;
- return to Owner primarily for product/perceptual judgement machines cannot provide;
- after each meaningful result, consciously re-select the next move rather than obeying stale stage labels.

Decision filters:

1. product relevance;
2. cost/irreversibility of being wrong;
3. information gain;
4. Owner attention cost;
5. prototype gravity / accidental architecture commitment.

The Owner determines what world is worth building. The orchestrator is responsible for making the technical path toward that world increasingly credible.

---

## Startup behavior in a fresh conversation

Do a **compact live verification**, not a multi-hour regrounding:

1. verify current heads for documentation branch, F5 branch, main/frozen control;
2. verify latest F5 CI/check state and deployment containment relevant to the next write;
3. read current state + foundation strategy + active F5 contract;
4. explicitly note any contradiction with this mandate.

If there is no material contradiction, proceed autonomously into the small F5 pre-deploy evidence hardening. Do not stop merely to ask the Owner whether the already-agreed direction should continue.

If live evidence materially invalidates the plan, stop implementation, explain the contradiction and re-select the next move.

Keep the Owner-facing response layered: quickly state where the project is, what changed, what is being done and what evidence would change direction; provide deeper technical reasoning below when useful.
