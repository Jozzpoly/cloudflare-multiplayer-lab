# Multi_World — Grounding v1

Status: **CANONICAL TAKEOVER GROUNDING DRAFT / VERIFY LIVE BEFORE USE**  
Date boundary: **2026-09-02**

This document consolidates the broad v0 ledger, its red-team and the human/device test context into one current handoff layer.

It is intentionally **not** an implementation plan.

---

## 1. Project identity

Multi_World is working toward a **small shared physical living world**: a cooperative 3D place where a few real people inhabit the same space, affect the same matter and experience consequences as shared reality rather than as loosely synchronized client-side illusions.

Current product pressure:

- **2–3 genuinely supported players** are the near-term human target;
- roughly **5–6** is an early later target, not a current scale gate;
- **desktop and mobile are both real play surfaces**;
- mobile must not become a separate simplified physics/networking world;
- camera, touch movement/touchpads, touch interaction and mobile HUD/performance are real future product requirements;
- physical/social/spatial presence and emergent interaction matter more than content quantity;
- long-term direction is a small persistent cooperative living-world / RPG-like experience, but persistence/combat/economy/AI/progression are not current substrate requirements.

Current technologies are substrates, not identity:

- Cloudflare Durable Objects — current authority substrate;
- WebSockets — current transport substrate;
- Box3D — current physical-world substrate;
- Three.js — current laboratory presentation layer.

None is declared final.

---

## 2. Hierarchy of truth

Use this order when grounding:

1. **live repository state / exact SHA / deployed runtime / current CI evidence**;
2. **repo-native research checkpoints**, especially GitHub issue #8 and its newest comments;
3. **qualified donor repositories**, especially `Jozzpoly/Box3d-Character-Controler`;
4. this document and the takeover package;
5. old README text, historical plans/branches and conversation history.

The current `cloudflare-multiplayer-lab` README is historically useful but stale relative to WS0 A1/A2/A2R.

---

## 3. Exact anchors at handoff preparation

Re-verify all of these live before relying on them.

### Multi_World infrastructure control

Repository: `Jozzpoly/cloudflare-multiplayer-lab`  
Branch: `main`  
Expected SHA: `d5758bf18b5ebd5fb7ce5a705d525c80d3bca5de`

Meaning: frozen Gate 4A fixed-authoritative simulation substrate.

### Preserved A2 baseline

Branch: `world-slice-0-embodied-3d-place`  
Expected SHA: `ef26fce6f5f21e219a4d8f57943449f4d2a2abca`

Meaning: server/protocol passes, but original owner/contact presentation failed human usability.

Verdict: **BASELINE FAIL / SUBSTRATE NOT FAILED**.

### A2R human-reference specimen

Branch: `world-slice-0-a2r-timeline-rebuild`  
Expected SHA: `2c9116267a0c8bba93061f759cefdb709e966e43`  
Client revision: `ws0-a2r-local-box3d-v2`

Meaning: first positive Owner-tested local-physics reference.

Preserve this as a control. Do not mutate it into the next multiplayer experiment.

### Character Controller donor authority

Repository: `Jozzpoly/Box3d-Character-Controler`  
Expected `main`: `f4877a46618a347c3be32edf7ddb39ab66a091bd`  
Current donor: **Donor v1 / A‴**  
Exact Owner-qualified mechanics specimen: `bc06ca98e94314af0ba888b74e1c4029429422e5`  
Donor API: `0.2.0`.

This is a qualified donor/reference authority, not an automatic Multi_World dependency.

---

## 4. Current evidence classification

### PROVEN — substrate / server / protocol

Direct evidence supports:

- public Worker/static deployment and routing;
- real WebSocket round-trip and reconnect plumbing;
- shared Durable Object world coordination in earlier multiplayer gates;
- exact `box3d.js@0.1.1` running continuously in a real Durable Object;
- WS0 server Box3D at `60 Hz / 4 substeps` in the qualified specimen;
- dynamic rigid-body player/actor -> prop contact;
- server input sequence / ACK path;
- ~10 Hz authoritative snapshots in current WS0;
- bounded scheduler behavior in validated runs with healthy finite-state checks;
- isolated staging for the final A2R candidate;
- real browser -> Internet -> staging Worker -> Durable Object -> WebSocket execution;
- automated cloud player -> shared-prop contact.

Important A1 public soak evidence recorded in issue #8:

- ~62 s continuous run;
- tick ratio `0.999608`;
- dropped ticks `0`;
- catch-up steps `0`;
- pump p50/p95/max `16/16/16 ms`;
- finite world;
- real actor -> prop displacement.

### PROVEN — original A2 client baseline failed perceptually

The original A2 browser intentionally had no local prop collision. It locally predicted owner movement while delayed authority/presentation dominated physical contact.

Human evidence showed visible/perceptual contact instability. The server substrate remained healthy.

This negative result must remain a control:

> **A2 BASELINE FAIL / SUBSTRATE NOT FAILED.**

Do not reduce it to “A2 felt rough.”

### PROVEN — A2R mechanical/browser/cloud path exists

A2R replaced the original owner predictor/authoritative-prop presentation with a local full Box3D copy of the tiny fresh world:

- local dynamic owner capsule;
- local dynamic 12 props;
- same relevant static scene/body/material parameters;
- fixed local `60 Hz / 4 substeps` independent of render FPS;
- immediate local owner input;
- immediate input-transition send plus periodic heartbeat;
- no normal continuous authoritative positional correction;
- snapshots primarily used as divergence/evidence rather than a continuous steering target;
- second interactive player intentionally rejected.

The exact A2R candidate passed layered automated evidence:

- exact Box3D labs;
- browser Box3D/WASM loading;
- fixed-step cadence tests;
- real Chromium with local Worker/DO/WS;
- real browser contact path;
- isolated Cloudflare staging;
- cloud WS/ACK/contact smoke;
- real Chromium over the Internet against staging;
- production-isolation checks.

### OWNER-OBSERVED — A2R feel

Owner reports the **functioning single-player A2R path feels very smooth** in hands-on use.

Important qualifier:

- the uploaded gameplay video could not be independently recovered/mounted in the final browser-GPT session;
- therefore this is Owner judgement, not independent frame-by-frame validation;
- the separately observed `~212/235 ms RTT` came from a later second-client/mobile attempt that hit the intentional single-player guard and had `0 local physics steps`;
- do **not** claim the smooth A2R run itself was proven at exactly 212/235 ms RTT.

### STRONGLY SUPPORTED — temporal interpretation

Exact-Box3D temporal experiments suggest much of single-owner A2R divergence is prediction lead rather than fundamentally different contact dynamics.

At the modeled ~63 ms one-way condition:

- welcome/start lag ~4 ticks;
- best history alignment ~7–9 ticks depending on trace/jitter;
- prediction lead relative to **server-now** ~+3…+5 ticks;
- aligned player residual commonly ~0.00–0.01;
- aligned prop/contact residual commonly ~0.00–0.04;
- settled/final residual commonly ~0.00–0.03.

At modeled 100 ms one-way:

- prediction lead ~+5…+6 ticks;
- aligned tested contact residual remains small.

A 1.5 s idle-after-welcome variant did not remove the lead, weakening startup lag as the primary explanation.

Treat this as strong bounded model evidence, not proof of arbitrary two-client contention.

### PROVEN BOUNDED RECOVERY DEBT — stall + input transition

A2R fixed-step work established:

- silently discarding local fixed ticks permanently loses local simulation time in an uncorrected local-copy model;
- retaining backlog fixes lost simulation time but does not reconstruct historical input assignment;
- when input changes during a main-thread stall, repaid ticks can receive the wrong current input;
- exact A/B showed ideal history-aware catch-up reached the same final state in all six tested 100/250 ms press/release/reversal cases, while current-input catch-up could leave persistent player/prop divergence.

Browser/WebDriver evidence did not establish DOM event timestamps as a safe cross-device history contract.

Current classification:

> real bounded recovery debt, not demonstrated normal-path blocker.

Do not build rollback/input-history infrastructure preemptively unless later evidence earns it.

---

## 5. Current A2R mechanical envelope relevant to multiplayer

Server `WorldSlice0` at the human-reference SHA:

- Box3D `60 Hz`;
- `4` substeps;
- snapshots `10 Hz`;
- input lease `600 ms`;
- implementation cap `MAX_INTERACTIVE_PLAYERS = 6`;
- provisional player speed `5.2`;
- accel/decel `28 / 36`;
- dynamic upright capsule: radius `0.35`, density `80`, linear damping `0.3`, angular damping `8`, angular axes locked;
- 12 dynamic box props: side `0.92`, density `22`, friction `0.72`, restitution `0.04`, linear damping `0.08`, angular damping `0.12`;
- authoritative player state includes transform + linear velocity + ACK;
- prop snapshots currently include **position + rotation only**;
- server scheduler uses bounded catch-up and may drop excess accumulated ticks.

A2R client:

- seeds a **fresh** local Box3D world from welcome state;
- creates same local owner/props/static scene;
- uses its own fixed-step clock;
- retains fixed-step backlog rather than discarding it;
- applies owner intent immediately;
- renders local Box3D state;
- measures delayed authoritative divergence;
- performs no normal continuous positional reconciliation;
- intentionally errors if another interactive player is present.

The **fresh-world + single-player assumption is part of the qualified A2R envelope**.

The server-side limit of 6 players is not evidence of useful six-player prediction/scaling.

---

## 6. What A2R does not prove

A2R does **not** prove:

- full-local Box3D is the final multiplayer architecture;
- two clients can coherently affect the same prop;
- a remote player can be inserted into another client's local physics without contradiction;
- current snapshots contain enough state for faithful live-world join/reconnect/reseed;
- 10 Hz is final or optimal;
- WebSockets are final transport;
- Durable Objects are final backend;
- arbitrary stall recovery;
- current dynamic capsule is a final character controller;
- meaningful 5–6 player headroom;
- persistence/world streaming/combat/AI/economy/product architecture.

---

## 7. Current-best research frontier

The highest-value provisional next problem is **remote causality / shared physical truth under multiple independent actors**.

Single-owner A2R has a privileged fact:

- the local client knows its own newest intent immediately;
- authority receives that intent later;
- local prediction can therefore lead authority while remaining physically similar after time alignment.

With two independent players:

- A does not know B's newest intent immediately;
- B does not know A's newest intent immediately;
- both may affect the same body;
- local physical worlds therefore receive causally important information at different times.

Current-best question:

> **Can multiple independent actors share physical consequences while preserving the smooth local embodiment demonstrated by A2R and still converge on one server-authoritative physical truth?**

This is a research framing, not a selected architecture.

Adjacent unresolved questions must remain visible:

- remote-player local representation;
- shared-prop state/correction requirements;
- prop linear/angular velocity and live-world join/reconnect seed contract;
- rare recovery/reseed policy;
- practical 2–3 player quality;
- 5–6 player headroom later.

Do not interpret every future failure as automatic evidence for Forecast, rollback, ownership or higher cadence.

---

## 8. Provisional first multi-client crucible

Before implementation, challenge whether there is an even cheaper discriminating experiment.

Current useful decomposition:

1. **A acts -> B observes** a shared prop consequence;
2. **B acts -> A observes**;
3. **A + B both influence the same prop**;
4. only after automated structural sanity: real human-human play.

Measure separately:

- local owner responsiveness;
- remote actor presentation/error;
- shared-prop client A <-> client B divergence;
- local <-> authority divergence with explicit time semantics;
- settled convergence;
- correction magnitude/frequency if introduced;
- server scheduler health;
- whether remote-causality correction visibly fights locally valid contact.

Do not compress these into one score.

A candidate family may eventually use:

- immediate local owner simulation;
- locally represented projected/predicted remote actor;
- local dynamic shared props plus authoritative information importing remote causality;
- bounded physical reconciliation where evidence shows it is needed.

This remains a hypothesis to attack.

---

## 9. Human/device validation capability

### Desktop + mobile

Desktop and mobile are both intended real clients.

Preferred principle:

> **device-specific controls -> shared gameplay intent -> shared physical semantics**

Do not fork core physics/network semantics by device.

Camera/touch controls are real future work. Use the smallest control/presentation surface needed for a falsifier, then improve mobile UX when bad controls/camera would contaminate human judgement.

Camera is part of perceptual correctness, not mere decoration: earlier A2 work already showed camera coupling can amplify network corrections into whole-scene discontinuities.

### Real human testing availability

The Owner can often recruit another real person on a phone, making human multiplayer tests practical.

Current useful validation ladder:

- **2 people** — baseline human multiplayer crucible after automated gates;
- **3 people** — realistic early stress test after two-player behavior is coherent enough to learn something new;
- **4 people** — sometimes available and valuable as opportunistic stronger stress, but **not** a current scale/acceptance milestone.

Do not waste this capability on repeated low-information manual experiments.

Before requesting human play, automate connection/protocol/contact/finite-state/scheduler and obvious divergence failures where practical.

The human question should remain qualitative/gameplay-facing:

- does another person feel physically present?;
- does shared matter feel like one world?;
- does local control stay immediate during contention?;
- are remote consequences legible?;
- does the situation create interesting emergent cooperation/conflict?;
- is mobile UI/camera now the bottleneck rather than networking?

---

## 10. Character Controller donor boundary

Current Donor v1 exists specifically so downstream projects can inherit known embodiment behavior without inheriting the research apparatus.

Qualified donor envelope:

- Donor v1 / A‴;
- API `0.2.0`;
- `box3d.js@0.1.1`;
- fixed `1/60 s` step;
- `4` substeps;
- lifecycle `preStep -> b3World_Step -> postStep`;
- device-independent intent boundary;
- no DOM/Three/network/replay/input-device dependency at import time.

However:

- A2R owner is a **solver-owned dynamic rigid body**;
- Donor v1 is **controller-owned**, with virtual mass/manual reciprocity/support transport and different state-ownership semantics.

Therefore importing Donor v1 into the next multiplayer crucible is a major confounder, not a harmless movement upgrade.

Default rule:

> **treat Character Controller as qualified embodiment donor/reference; integrate only when a concrete Multi_World need makes that integration itself the question.**

If adopted later, preserve exact donor revision/provenance and add an equivalent conformance gate.

---

## 11. Other project knowledge

JV/JV-Web/ANVIL/JES/Coopege and smaller experiments may contribute useful:

- Box3D/contact knowledge;
- browser/runtime patterns;
- evidence/falsification methods;
- future world-interaction ideas.

Do not infer a common runtime architecture or universal framework.

Reuse lessons critically and re-prove integration assumptions locally.

---

## 12. Explicitly rejected / deferred by current evidence

Do not automatically:

- mutate the A2R human-reference into multiplayer;
- import Character Controller Donor v1;
- build generic rollback/resimulation;
- build a generic Forecast framework;
- build prediction/interaction islands;
- build an object-ownership framework;
- replace transport merely because WebSocket is imperfect;
- increase snapshot/simulation rate to hide unexplained failure;
- create a dedicated mobile simulation fork;
- build accounts/matchmaking/persistence/combat/AI/economy/content systems;
- create a new product repository;
- build a universal engine/network abstraction.

The next implementation must be earned by a fresh falsifier of shared physical truth / remote causality or by newer evidence that identifies a better frontier.

---

## 13. Working method to preserve

Default loop:

> **real friction / desired capability -> identify actual unknown -> cheapest meaningful falsifier -> smallest justified implementation -> validation matched to causal blast radius -> faithful runtime/device evidence -> Owner judgement only where human perception/play is indispensable -> next iteration**

Operational consequences:

- perform as much research/modeling/automation as practical before asking for Owner PLAY;
- minimize Owner attention cost;
- machine PASS is not feel PASS;
- Owner excitement/fun is valuable evidence but not automatically a mechanical proof;
- separate facts, interpretations, hypotheses and plans;
- preserve negative evidence;
- treat plans as candidates, not commitments;
- protect controls/reference specimens;
- stop at natural stage boundaries;
- do not build a framework to avoid answering a concrete gameplay question.

---

## 14. Division of responsibility

### Owner

Primary authority for:

- product intent/priorities;
- what feels good or worth pursuing;
- human free-play judgement;
- recognizing emergent value not predicted by the experiment.

### Browser GPT / orchestrator

Responsible for:

- live grounding and critical truth reconstruction;
- broad research and synthesis;
- bounded experiment design;
- automated validation where practical;
- evidence/provenance boundaries;
- technical explanation;
- deciding when human play is worth requesting;
- preventing drift into infrastructure/framework work.

### Repo-native executor / Codex when useful

May perform implementation/exact donor recovery/refactors/validation where repo-native access is advantageous.

Its output is evidence to inspect, not authority over product intent.

The project must remain operable when a specific executor/tool is unavailable.

---

## 15. Required fresh-project startup behavior

A fresh Multi_World project must **not begin by implementing A3**.

First:

1. re-verify all live anchors;
2. inspect current staging/production deployment state;
3. read issue #8 and newest checkpoints;
4. verify Character Controller current donor only as far as needed for donor context;
5. challenge this grounding document;
6. classify current truth as `PROVEN / OWNER-OBSERVED / STRONGLY SUPPORTED / PROVISIONAL / UNKNOWN / REJECTED`;
7. identify the highest-value unknown after current live evidence;
8. propose the smallest discriminating next move;
9. **do not implement until that grounding has been consciously accepted or corrected.**

The fresh project must be free to reject the remote-causality framing if newer evidence reveals a better problem.
