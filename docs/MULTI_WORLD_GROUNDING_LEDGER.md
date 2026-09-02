# Multi_World — Grounding Ledger v0

Status: **TAKEOVER PREPARATION / NOT AN IMPLEMENTATION PLAN**  
Date boundary: **2026-09-02**  
Purpose: compress the live evidence, current project intent, donor boundaries and unresolved questions before a fresh ChatGPT project takes over Multi_World.

This document is deliberately not a new roadmap and not a replacement for live repository state. It exists to prevent a fresh orchestrator from inheriting accidental assumptions from conversation history.

---

## 1. Hierarchy of truth

When this document conflicts with newer evidence, use this order:

1. **live repository state / exact SHA / current deployment / current CI evidence**;
2. **repo-native research checkpoints**, especially GitHub issue #8 (`World Slice 0: embodied shared 3D place`) and its latest comments;
3. **qualified donor repositories**, currently especially `Jozzpoly/Box3d-Character-Controler`;
4. this grounding ledger and later takeover material;
5. old README text, historical branches, old plans and conversation history.

Important current example: the repository README is historically useful but operationally stale. It still says Gate 4B has not started, while live research has already progressed through WS0 A1, A2, A2 human failure and A2R.

---

## 2. Project identity / north-star draft

Multi_World is **not** fundamentally a Cloudflare demo, a Box3D demo or a networking framework.

The intended direction is a **small shared physical living world**: a cooperative 3D place where a few real people inhabit the same space, influence the same matter and experience consequences as genuinely shared rather than as unrelated client-side illusions.

Current product-direction constraints inherited from WS0:

- small persistent cooperative 3D living-world / RPG direction;
- **2–3 players must genuinely work**; 5–6 is an early target, not a current gate;
- desktop-first authoring/play is acceptable;
- mobile remains a first-class early client and must not require a fundamentally different simulation/network model;
- physical presence, spatial/social legibility and emergent interaction matter more than content quantity;
- do not build MMO infrastructure, a universal game framework or a content treadmill before a playable falsifier earns them.

Current infrastructure choices are substrates, not identity:

- Cloudflare Durable Objects are the currently proven authority substrate;
- WebSockets are the currently proven transport substrate;
- Box3D is the currently proven physical-world substrate;
- Three.js is the current laboratory presentation layer.

None is declared final by this ledger.

---

## 3. Exact live anchors

### 3.1 Frozen infrastructure control

Repository: `Jozzpoly/cloudflare-multiplayer-lab`  
Branch: `main`  
SHA: `d5758bf18b5ebd5fb7ce5a705d525c80d3bca5de`  
Meaning: **Gate 4A fixed authoritative simulation substrate / frozen control**.

Do not silently move this reference when reasoning about historical infrastructure evidence.

### 3.2 A2 preserved baseline

Branch: `world-slice-0-embodied-3d-place`  
SHA: `ef26fce6f5f21e219a4d8f57943449f4d2a2abca`  
Meaning: **A2 server/protocol + original browser prediction/reconciliation baseline before A2R**.

Human result: **BASELINE FAIL / SUBSTRATE NOT FAILED**.

### 3.3 A2R human-reference specimen

Branch: `world-slice-0-a2r-timeline-rebuild`  
SHA: `2c9116267a0c8bba93061f759cefdb709e966e43`  
Client revision: `ws0-a2r-local-box3d-v2`  
Meaning: **first Owner-tested smooth local-physics specimen**.

This SHA is now a research control. Do not mutate it into A3. New multiplayer work should branch from an exact known specimen after fresh live verification.

### 3.4 Current Character Controller donor authority

Repository: `Jozzpoly/Box3d-Character-Controler`  
`main`: `f4877a46618a347c3be32edf7ddb39ab66a091bd`  
Current donor: **Donor v1 / A‴**  
Exact Owner-qualified mechanics specimen: `bc06ca98e94314af0ba888b74e1c4029429422e5`  
Donor API: `0.2.0`.

This is a donor/reference authority for embodied-player mechanics, **not an automatic Multi_World dependency or architecture decision**.

---

## 4. Evidence ledger

### 4.1 PROVEN — infrastructure / server substrate

The following have direct runtime evidence:

- public static deployment and Worker routing;
- real WebSocket round-trip and reconnect plumbing;
- a shared Durable Object world coordinating multiple real clients in earlier gates;
- exact `box3d.js@0.1.1` running continuously inside a real Durable Object;
- WS0 Box3D server at `60 Hz / 4 substeps` with a small deterministic 3D scene;
- ordinary rigid-body contact between dynamic player/actor bodies and dynamic props;
- bounded server scheduler behavior in validated runs without chronic backlog;
- public staging isolation from root production for the A2R candidate;
- real browser -> Internet -> staging Worker -> Durable Object -> WebSocket execution;
- automated cloud player -> shared-prop contact.

Key A1 repo-native checkpoint: issue #8 comment `5485306107`.

A1 public soak recorded approximately:

- ~62 s continuous run;
- tick ratio `0.999608`;
- dropped ticks `0`;
- catch-up steps `0`;
- pump p50/p95/max `16/16/16 ms`;
- finite world;
- real actor -> prop displacement.

### 4.2 PROVEN — A2 server/protocol

A2 established a real interactive network player before renderer judgement:

- server-owned dynamic Box3D capsule;
- client sends sequenced input;
- server ACKs input sequence;
- ~10 Hz authoritative snapshots;
- ~15 Hz baseline input transport;
- physical player -> prop contact occurs in authority;
- upright A2 isolated network/contact feel from capsule tumbling by locking all angular axes while preserving dynamic translation/contact.

Key checkpoints: issue #8 comments `5485371524` and `5485750129`.

The server source at A2R human-reference still supports up to `6` interactive server-side players. That does **not** mean the A2R browser prediction model supports multiplayer.

### 4.3 PROVEN — original A2 perceptual baseline failed

The original client deliberately did **not** simulate local prop collision. It predicted the owner horizontally and reconciled against delayed authority while props followed authoritative state.

Human play demonstrated a dominant perceptual failure during physical contact. Evidence recorded in issue #8 classified the failure as client timeline/contact-model inadequacy rather than Box3D/DO substrate collapse.

Observed diagnostic pattern included contact-era corrections becoming large enough to create visible whole-scene discontinuities and a component aligned with the ~10 Hz snapshot cadence.

Verdict:

> **A2 BASELINE FAIL / SUBSTRATE NOT FAILED.**

This negative result is an important control. Do not erase it by saying merely that “A2 was rough.”

### 4.4 PROVEN / STRONGLY SUPPORTED — A2R local physical prediction

A2R replaces the free horizontal predictor + authoritative prop chasing with a full local Box3D world for the tiny WS0 slice:

- same static scene;
- local dynamic owner capsule;
- local dynamic 12 props;
- same relevant body/material/damping parameters as server;
- fixed local `60 Hz / 4 substeps` independent of render FPS;
- immediate local input application;
- input transition send + periodic heartbeat;
- **no continuous authoritative position correction** as the normal path;
- server snapshots are used primarily as divergence evidence, not as a continuous steering target;
- client deliberately rejects a second player: the specimen is a single-player prediction falsifier.

The exact browser build uses `box3d.js@0.1.1/dist/box3d.inline.mjs`. CI verified default package build vs browser inline build parity on a bounded contact trace.

### 4.5 PROVEN — A2R automated browser/cloud path

Before Owner PLAY, the exact A2R candidate passed layered evidence including:

- exact Box3D Node labs;
- browser dependency/WASM load;
- fixed-step cadence tests;
- real local Chromium + Wrangler + DO/WebSocket;
- real browser contact path;
- isolated Cloudflare staging;
- cloud WS/ACK/contact smoke;
- real Chromium over the Internet against staging;
- production isolation checks.

Key readiness checkpoint: issue #8 comment `5501919456`.

The staged browser smoke on the final candidate recorded local physics progressing without discarded ticks, full ACK progression and measurable shared-prop divergence/contact evidence while server scheduler telemetry remained healthy.

### 4.6 OWNER-OBSERVED — A2R feel

Key human checkpoint: issue #8 comment `5502192824`.

Owner reports the A2R single-player local-physics path feels **very smooth** in hands-on use, including under an observed high-latency situation around ~212/235 ms RTT during the second-client/mobile attempt.

Evidence qualifier:

- the gameplay video could not be independently recovered/mounted by the browser GPT in that session;
- therefore the smoothness verdict is **Owner judgement**, not independent frame-by-frame video proof.

This is still high-value evidence because the original A2 failure itself was perceptual/human-facing.

### 4.7 STRONGLY SUPPORTED — temporal interpretation of A2R divergence

A2R temporal labs separated local responsiveness from raw delayed-snapshot difference.

Current best interpretation:

- while the local owner is actively driving, local prediction naturally runs ahead of **server-now** by roughly the one-way input latency;
- much of the large raw client-vs-delayed-snapshot delta is therefore timeline separation, not a different physical solution;
- when authority/client histories are compared at a better-aligned physical time, measured player/prop contact residuals in the tested scenarios become small;
- after input release, authority often naturally catches up close to the local result without continuous correction.

This supports local solver-owned contact as a useful normal-path model for the owner. It does **not** prove two-client shared-body coherence.

### 4.8 PROVEN RECOVERY DEBT — stall + input transition

A2R fixed-step work found two separate problems:

1. discarding local fixed ticks is incompatible with an uncorrected local-copy model; local time must not silently disappear;
2. retaining backlog alone is insufficient if an input transition occurs during a main-thread stall, because catch-up ticks can receive the wrong current input.

An exact Box3D A/B showed that an idealized history-aware catch-up can return to the same final state, while current-input catch-up can leave player/prop residual divergence.

Browser/WebDriver evidence was not strong enough to establish `KeyboardEvent.timeStamp` as a reliable cross-device historical input contract.

Current classification:

> **known recovery debt, not demonstrated normal-path blocker.**

Do not preemptively build rollback/input-history infrastructure unless real play or later multiplayer evidence earns it.

---

## 5. Current A2R mechanical contract relevant to future multiplayer

Server (`WorldSlice0`) at the human-reference SHA:

- Box3D server physics: `60 Hz`, `4 substeps`;
- snapshots: `10 Hz`;
- input lease: `600 ms`;
- max interactive server players: `6`;
- player speed baseline: `5.2`;
- accel/decel baseline: `28 / 36`;
- dynamic upright player capsule: radius `0.35`, density `80`, linear damping `0.3`, angular damping `8`, all angular axes locked;
- 12 dynamic box props: `0.92 m` side, density `22`, friction `0.72`, restitution `0.04`, linear damping `0.08`, angular damping `0.12`;
- server scheduler uses bounded catch-up and may count/drop excess accumulated ticks;
- server authoritative snapshot player records include transform + linear velocity + ACK;
- prop snapshot records currently include **position + rotation only**, not linear/angular velocity.

A2R client:

- seeds a fresh local Box3D world from `welcome`;
- creates the same local player/props/static scene;
- uses its own fixed-step clock with bounded per-frame catch-up while retaining simulation debt rather than discarding it;
- applies local owner intent immediately;
- renders local Box3D state;
- measures delayed authoritative divergence;
- applies no normal continuous reconciliation;
- intentionally errors if another interactive player is present.

The fresh-world/single-player assumption is therefore part of the qualified A2R envelope.

---

## 6. What A2R does NOT prove

A2R must not be promoted into claims it did not test.

It does **not** prove:

- that full-local Box3D is the final multiplayer architecture;
- that two clients can coherently affect the same prop;
- that a remote player can be inserted into another client's local physics without contradiction;
- that current snapshots contain enough state for live-world join/reconnect/resync;
- that 10 Hz is final or optimal;
- that WebSockets are final transport;
- that Durable Objects are final product backend;
- that local prediction can survive arbitrary stalls without recovery;
- that current provisional dynamic capsule is a final character controller;
- that the system scales from 2–3 players to 20+;
- persistence, combat, AI, economy, world streaming or final product architecture.

---

## 7. Current central research problem

The next fundamental unknown is **remote causality**.

Single-player A2R has one privileged fact: the local client knows its own current intent immediately. Authority sees that intent after network delay, so local prediction can lead the server while remaining physically similar after temporal alignment.

With a second independent actor, client A does **not** know client B's newest intent immediately. If A and B can both influence the same dynamic body, the two local physical worlds receive causally relevant information at different times.

The next research question is therefore not merely:

> “Can two clients connect?”

It is:

> **Can multiple independent actors share physical consequences while preserving the smooth local embodiment demonstrated by A2R and converging on one server-authoritative physical truth?**

This is the research meaning of the old WS0 A3 label. The implementation shape remains open.

---

## 8. Provisional next crucible — NOT YET A COMMITMENT

A useful first decomposition is asymmetric before symmetric contention:

1. **A acts -> B observes** the same prop consequence;
2. **B acts -> A observes**;
3. **A and B both act on the same prop**;
4. only after automated structural falsification: human-human stress play on desktop + phone.

Useful dimensions to measure separately:

- owner responsiveness/local feel;
- remote-player temporal/presentation error;
- shared-prop client A <-> client B divergence;
- local <-> authority divergence after appropriate temporal alignment;
- correction magnitude/frequency if correction is introduced;
- settled convergence after contention;
- server scheduler health;
- whether one client's local valid contact is visibly fought by reconciliation caused by remote causality.

Do not collapse these into one score.

A plausible candidate family is:

- local owner remains immediate local physical prediction;
- remote actor obtains a locally represented projected/predicted physical state;
- shared props remain local dynamic bodies but receive authoritative information needed to import remote causality;
- bounded physical reconciliation may be introduced only where evidence shows it is necessary.

This is a hypothesis to attack, not the selected architecture.

---

## 9. Donor map

### 9.1 Box3D Character Controller — qualified embodiment donor

Current donor contract explicitly exists so downstream projects can inherit known embodied-player behavior **without inheriting the research apparatus**.

Qualified envelope:

- Donor v1 / A‴;
- API `0.2.0`;
- `box3d.js@0.1.1`;
- fixed `1/60 s` physics step;
- `4` substeps;
- lifecycle `preStep(dt, intent) -> b3World_Step(...) -> postStep(dt)`;
- small device-independent intent boundary (`moveForward`, `moveRight`, world basis, jump/jumpHeld, sprint);
- no DOM, Three.js, networking, replay or input-device dependency in the donor module.

Important donor debts remain deliberate: virtual mass/manual reciprocity/support transport and controller-owned representation are not declared final architecture.

Current integration rule for Multi_World:

> **treat Donor v1 as a qualified source of embodiment mechanics and contract ideas; do not import it into the next multiplayer experiment until a concrete integration need earns the confounder.**

A future Multi_World integration should preserve exact donor revision/provenance and add an equivalence gate if/when it is actually adopted.

### 9.2 Other project knowledge

Knowledge from JV/JV-Web/ANVIL/JES/Coopege may be reused critically when a real Multi_World problem matches it.

Do not assume shared architecture/library merely because the same Owner or Box3D concepts appear across projects.

In particular:

- take falsification and Owner-feel methodology where useful;
- take proven physics/browser patterns where useful;
- do not import vehicle architecture, JES foundation, large evidence platforms, authoring schemas or a universal framework unless a concrete Multi_World problem independently earns them.

---

## 10. Explicitly rejected / deferred directions

Current evidence does **not** justify automatically doing any of the following next:

- mutate A2R human-reference into multiplayer;
- import Character Controller Donor v1 immediately;
- full rollback/resimulation infrastructure;
- generic Forecast framework;
- interaction-island system;
- ownership framework;
- custom unreliable transport;
- higher snapshot/simulation rates merely to hide a failure;
- KCC replacement merely because it exists;
- accounts/auth/matchmaking;
- persistence/economy/combat/AI/content systems;
- a new product repository;
- a universal engine/networking abstraction.

The next implementation should be earned by a fresh falsifier of remote causality/shared physical truth.

---

## 11. Working method to preserve

The most valuable transferable result of the recent work is methodological:

> **real friction -> determine what is actually unknown -> cheapest meaningful research/falsifier -> smallest justified change -> validation proportional to causal blast radius -> faithful runtime/device evidence -> Owner judgement only where human perception is indispensable -> next iteration.**

Practical implications:

- browser GPT should do as much research, modeling, automated testing and falsification as possible before asking the Owner to PLAY;
- do not present a long ladder of Owner experiments when one well-prepared human run can decide the question;
- machine PASS is not human-feel PASS;
- Owner excitement/fun is valuable evidence but should not silently become a mechanical claim;
- preserve negative evidence and rejected approaches;
- treat plans as candidates, not commitments;
- stop at natural stage boundaries rather than automatically expanding scope.

---

## 12. Fresh-project takeover mandate — draft boundary

A fresh ChatGPT project should **not begin by implementing A3**.

Its first job should be to:

1. re-verify the exact live anchors above;
2. read issue #8 and its newest checkpoints as repo-native authority;
3. verify the current staging/production boundary;
4. verify Character Controller current donor state only to the extent needed as a donor reference;
5. challenge this ledger's interpretation of A2R and remote causality;
6. identify the smallest two-client experiment with the highest information gain;
7. only then authorize implementation.

The handoff should make the new orchestrator capable of rejecting this ledger if newer evidence contradicts it.

---

## 13. Open items before final takeover package

This ledger is intentionally v0. Before writing the final fresh-project prompt, still perform:

- red-team the exact `PROVEN / OWNER-OBSERVED / STRONGLY SUPPORTED / UNKNOWN` classifications;
- verify whether any repo-native checkpoint newer than the current human A2R comment changes the boundary;
- decide what small amount of deployment/staging detail the new project actually needs versus what is historical noise;
- distill the north-star into a short Project Soul without turning speculative product features into requirements;
- produce a compact donor map rather than a cross-project dependency graph;
- write the final takeover mandate so that it begins with live grounding, not automatic continuation.

Only after those checks should this branch contain a final takeover package.
