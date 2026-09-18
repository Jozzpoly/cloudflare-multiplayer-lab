# Multi_World — Project Soul

Status: **CANONICAL MULTIPLAYER-TECHNOLOGY MISSION / DONOR DIRECTION, NOT FINAL ARCHITECTURE**  
Grounded: **2026-09-18**

---

## One-sentence purpose

> **Develop and qualify reusable multiplayer/shared-world technology for small real-time physical worlds, using the Shared Yard as a falsification crucible so future projects can inherit proven shared truth, dynamic presence, recovery and lifecycle behavior.**

---

## Repository role

**Multiplayer systems are the primary product of this repository.**

Multi_World is a long-lived multiplayer core / systems laboratory and donor source. The current Yard is deliberately small because it exposes multiplayer truth cheaply. It is not a mandate to evolve this repository into the future mini-MMO or to add gameplay features for their own sake.

Gameplay, map, interaction and presentation may be expanded only when they create a necessary or materially better test surface for a concrete multiplayer question. A future game may live in another repository and consume/donate proven systems from this lab.

The already accepted early technical envelope is **1–6 dynamic actors**, with real 3–6-human qualification as an important milestone. This is an R&D target, not an MMO-scale commitment.

---

## What matters most

### Shared physical truth

The world should feel like **one place**.

If one player moves, blocks, pushes, drops or disturbs something important, another player should participate in the consequence rather than merely receive a cosmetic update later.

Perfect frame identity is not the goal. Coherent shared consequence is.

### Embodied presence

Players should feel physically present in the world rather than represented by disconnected cursors or transform packets.

Control must remain responsive enough to preserve agency, while the world retains enough physical authority that consequences are meaningful.

This creates the core tension:

> **PLAYER INTENT ↔ PHYSICAL CONSEQUENCE ↔ SHARED TRUTH**

### Small-group intimacy before scale

The current qualified regression baseline is still two-actor, but the accepted early **technology target is 1–6 dynamic actors**, with 3–6 real humans used to qualify roster/lifecycle/shared-physics behavior. This is not permission to drift toward large-scale multiplayer infrastructure.

The point of the small player count is not merely technical convenience. A small shared place can make another person's presence, location and physical actions legible and meaningful.

### Emergent interaction before content quantity

A small number of well-coupled physical rules and affordances are more valuable than a large content catalog if those rules create surprising cooperative or conflicting play.

The world should increasingly support situations that were not individually scripted.

### A world worth inhabiting

A future recipient may be a small persistent cooperative living-world / RPG-like experience, but **this repository is not currently building its RPG systems, combat, economy, AI, progression or content**.

They should be added only when the shared-world foundation makes them meaningful rather than as scaffolding built in advance.

### Shared continuity beyond one session

The long-term world should not be conceptualized merely as a disposable match arena. Places, arrangements and consequences should be able to matter beyond one short session or one particular player's presence.

This is a **directional product pressure**, not authorization to build persistence/storage architecture now. The immediate shared-physics work should stay small, but it should avoid assumptions that would make a persistent shared place fundamentally impossible later.

---

## Experience pressures

The following pressures should guide decisions without becoming premature implementation requirements:

- another player should be spatially and physically legible;
- interacting with matter should feel immediate locally and coherent remotely;
- physical consequences should create opportunities for cooperation, obstruction, improvisation and emergent roles;
- mobile should remain a first-class early client rather than a later compatibility afterthought;
- desktop-first development/authoring is acceptable;
- hand-authored small places are acceptable and often preferable while the core interaction is being understood;
- the project should be playable enough that human free play can reveal questions the scripted tests did not anticipate.

---

## What Multi_World is not

Multi_World is not inherently:

- a Cloudflare project;
- a Durable Object project;
- a WebSocket project;
- a Box3D project;
- a Three.js project;
- a generic networking framework;
- an MMO backend;
- a universal engine shared by all of the Owner's projects.

Those are current substrates, donors or implementation candidates.

The project survives if any of them are replaced while the shared-world purpose remains.

---

## Relationship to other projects

### Box3D Character Controller

The Character Controller project studies a neighboring question:

> **How can player intent inhabit a physical body without physics destroying agency or agency erasing physical consequence?**

Its current Donor v1 / A‴ is a qualified source of embodiment knowledge.

Multi_World should treat it as a **donor**, not as an automatic dependency. A networking crucible should not import it merely because its feel is better. Adoption should occur only when a concrete shared-world integration need earns the additional state-ownership/contact semantics.

### JV / JV-Web / ANVIL / JES / Coopege and smaller experiments

These projects can contribute:

- proven Box3D/contact knowledge;
- browser/runtime patterns;
- falsification methodology;
- evidence discipline;
- product and world-interaction ideas.

They do not imply a common runtime architecture or a mandatory shared framework.

Reuse lessons critically. Re-prove integration assumptions locally.

---

## Research posture

The project should not choose architecture by prestige, convention or prior plan.

Default loop:

> **real friction / desired capability -> identify the actual unknown -> cheapest meaningful falsifier -> smallest justified implementation -> validation proportional to causal blast radius -> faithful runtime/device evidence -> Owner judgement where perception/play is indispensable -> next iteration**

Important consequences:

- machine PASS is not feel PASS;
- a fun Owner moment is valuable evidence but not automatically a causal/mechanical proof;
- negative evidence is retained;
- provisional plans can be rejected without embarrassment;
- implementation should stop at natural boundaries;
- do not ask the Owner to perform many experiments that can be automated first;
- do not build architecture to avoid answering a concrete multiplayer question.

---

## Division of responsibility

### Owner

The Owner is the primary authority for:

- multiplayer-technology intent and priorities;
- what feels good, interesting or worth pursuing;
- human free-play judgement;
- deciding whether an experiment revealed something desirable even when it was not the scripted target.

The workflow should minimize Owner attention cost and reserve human testing for questions that genuinely require a human.

### Browser GPT / project orchestrator

The browser orchestrator should act as the persistent second brain of the project:

- reconstruct and challenge current truth;
- perform broad research and critical synthesis;
- design bounded falsifiers;
- automate as much validation as practical;
- maintain evidence/provenance boundaries;
- explain technical consequences accessibly;
- decide when human play is actually worth asking for;
- prevent accidental drift from multiplayer R&D into gameplay/content feature-building or unjustified infrastructure.

### Repo-native executor / Codex when used

A repo-native executor may perform implementation, exact donor recovery, refactors and validation where it has better repository access.

Its output is evidence to inspect, not an authority that replaces project intent or human judgement.

The project must remain operable even when a particular executor/tool is temporarily unavailable.

---

## Current stage boundary

World V0 has produced a strong qualified **two-actor multiplayer regression baseline**:

1. authoritative shared physical truth with responsive local embodiment;
2. scheduled canonical input and exact state guards;
3. bounded ActorSession / transport recovery;
4. Ongoing Yard separation far enough for solo-first -> later peer in the same running world;
5. V25 -> V28 temporal/smoothness hardening and causal jump identity through replay/resume/rebase;
6. real desktop/mobile execution and extensive lifecycle/failure evidence.

This baseline is valuable because future multiplayer architecture can be attacked without losing a known working two-human crucible. It is **not** the final target and not an invitation to add gameplay.

The repository closeout is complete. The immediate stage returns to the broader **Multiplayer Foundation** program whose accepted early scope is real-time physical multiplayer for **1–6 dynamic actors**.

The next continuation must first recover and reconcile the archived pre-closeout Multiplayer Foundation v1 research with the current Ongoing Yard/V28 baseline. Historical evidence indicates that research already reached dynamic-actor authority and durable recovery experiments; exact claims must be verified from archive provenance before reuse.

The pressure map for the next technical era is:

- dynamic join/leave and roster mutation rather than a fixed two-slot topology;
- real runtime/process authority recovery rather than only surviving transport loss;
- shared active physics across dynamic actors;
- network impairment and latency regimes;
- browser/mobile/platform lifecycle;
- browser self+N execution;
- fault/load scaling and interest-management questions only when evidence creates the need;
- real 3–6-human qualification after machine falsification.

The governing question is:

> **What multiplayer-foundation capability or failure boundary remains unresolved, and what is the cheapest faithful falsifier that advances the 1–6 shared-physics substrate?**

No gameplay-feature frontier is authorized by this stage boundary.

---

## Anti-gravity / guardrails

Do not let the project drift automatically toward:

- 20+ player scale because multiplayer exists;
- rollback architecture because another engine uses it;
- object ownership because it is a common networking pattern;
- higher snapshot rates to hide an unexplained failure;
- a universal prediction/reconciliation framework;
- premature persistence/economy/accounts/combat;
- automatic Character Controller integration;
- a new product repository before the shared physical substrate earns the transition;
- gameplay/content feature work that does not directly serve a concrete multiplayer falsifier;
- treating the current two-actor Yard as the product roadmap rather than a qualified test crucible.

---

## What success should eventually mean

A successful Multi_World should leave us with multiplayer technology that can be donated into future worlds with evidence behind its guarantees.

The practical human symptom remains important: another real person should feel **there**, in the same authoritative physical place, despite dynamic roster changes, transport failures, latency, browser/mobile lifecycle and runtime disruption.

The technical success is not matching coordinates. It is preserving coherent shared consequence and recoverable identity under the failure modes that real recipient projects will inherit.
