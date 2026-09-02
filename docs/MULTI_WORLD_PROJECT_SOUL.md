# Multi_World — Project Soul draft

Status: **TAKEOVER DRAFT / PRODUCT INTENT, NOT ARCHITECTURE**  
Date boundary: **2026-09-02**

---

## One-sentence purpose

> **Build toward a small shared physical living world in which a few real people genuinely inhabit the same space, affect the same matter and experience consequences as shared reality rather than as loosely synchronized client illusions.**

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

The project is currently aimed at **2–3 genuinely supported players**.

An early later target is roughly **5–6**, but that is not permission to build large-scale multiplayer infrastructure now.

The point of the small player count is not merely technical convenience. A small shared place can make another person's presence, location and physical actions legible and meaningful.

### Emergent interaction before content quantity

A small number of well-coupled physical rules and affordances are more valuable than a large content catalog if those rules create surprising cooperative or conflicting play.

The world should increasingly support situations that were not individually scripted.

### A world worth inhabiting

The longer-term direction is a small persistent cooperative living-world / RPG-like experience, but **persistence, RPG systems, combat, economy, AI and progression are not current substrate requirements**.

They should be added only when the shared-world foundation makes them meaningful rather than as scaffolding built in advance.

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
- do not build a framework to avoid answering a concrete gameplay question.

---

## Division of responsibility

### Owner

The Owner is the primary authority for:

- product intent and priorities;
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
- prevent accidental drift from product question into infrastructure-building.

### Repo-native executor / Codex when used

A repo-native executor may perform implementation, exact donor recovery, refactors and validation where it has better repository access.

Its output is evidence to inspect, not an authority that replaces project intent or human judgement.

The project must remain operable even when a particular executor/tool is temporarily unavailable.

---

## Current stage boundary

The project has already demonstrated:

- a working server-authoritative physical substrate;
- real shared-world networking plumbing;
- a failed naïve owner/contact presentation baseline;
- a smooth positive single-owner A2R local-physics reference.

The next conceptual level is therefore not “make movement nicer” and not “add features.”

It is:

> **preserve immediate local embodiment when another independently controlled player becomes a delayed physical cause in the same world.**

That is the present research frontier, not a predetermined implementation plan.

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
- endless laboratory work after the next meaningful product-facing vertical slice becomes more informative.

---

## What success should eventually feel like

A successful Multi_World should make a player think less about networking and more about the other person being **there**.

The interesting moment is not that two devices display matching coordinates.

It is that one person can shove something, stand in the way, disturb an arrangement, help move an object, create a physical problem or exploit an unexpected affordance — and the other person experiences that as part of the same world.
