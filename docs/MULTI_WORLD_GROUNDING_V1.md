# Multi_World — Grounding v1

Status: **CANONICAL TAKEOVER GROUNDING / VERIFY LIVE BEFORE USE**  
Grounded: **2026-09-02**

This is the current compact evidence/orientation layer for a fresh Multi_World takeover. It is **not** an implementation plan and never outranks newer live evidence.

---

## 1. Project identity

Multi_World is working toward a **small shared physical living world**: a cooperative 3D place where a few real people inhabit the same space, affect the same matter and experience consequences as shared reality rather than as loosely synchronized client-side illusions.

Current product pressure:

- **2–3 genuinely supported players** are the near-term human target;
- roughly **5–6** is an early later target, not a current scale gate;
- **desktop and mobile are both real play surfaces**;
- mobile must share the same physical/networking truth model rather than becoming a separate simplified simulation;
- camera, touch movement/touchpads, mobile interaction/HUD/performance are real future product requirements;
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

Use this order:

1. **live repository state / exact SHA / deployed runtime / current CI evidence**;
2. **repo-native research checkpoints**, especially GitHub issue #8 and its newest comments;
3. **qualified donor repositories**;
4. this grounding layer / Project Soul / takeover mandate;
5. old README text, historical plans/branches and conversation history.

The current `cloudflare-multiplayer-lab` README is historically useful but stale relative to WS0 A1/A2/A2R.

---

## 3. Exact controls and donor anchors

Re-verify all of these live before using them.

### Multi_World infrastructure control

Repository: `Jozzpoly/cloudflare-multiplayer-lab`  
Branch: `main`  
Expected SHA: `d5758bf18b5ebd5fb7ce5a705d525c80d3bca5de`

Meaning: frozen Gate 4A fixed-authoritative simulation substrate.

### Preserved failed A2 baseline

Branch: `world-slice-0-embodied-3d-place`  
Expected SHA: `ef26fce6f5f21e219a4d8f57943449f4d2a2abca`

Meaning: server/protocol passed, but original owner/contact presentation failed human usability.

Verdict: **BASELINE FAIL / SUBSTRATE NOT FAILED**.

### A2R human-reference specimen

Branch: `world-slice-0-a2r-timeline-rebuild`  
Expected SHA: `2c9116267a0c8bba93061f759cefdb709e966e43`  
Client revision: `ws0-a2r-local-box3d-v2`

Meaning: first positive Owner-tested local-physics reference.

Preserve this as a control. Do not mutate it into the next multiplayer experiment.

### Character Controller donor authority

Repository: `Jozzpoly/Box3d-Character-Controler`

At the latest handoff audit:

- live `main`: `5891fbf0b2a2a0f2cf5c41578d95b1aa72ac68ad`;
- that commit is a documentation/current-state grounding change, not a mechanics promotion;
- its canonical `docs/PROJECT_STATE.md` records implementation/behavior baseline `f4877a46618a347c3be32edf7ddb39ab66a091bd`;
- current donor remains **Donor v1 / A‴**;
- exact Owner-qualified mechanics specimen remains `bc06ca98e94314af0ba888b74e1c4029429422e5`;
- donor API remains `0.2.0`.

Keep these facts separate:

> **live donor-repo head != current behavior baseline != exact Owner-qualified mechanics specimen.**

Character Controller is qualified donor/reference authority, not an automatic Multi_World dependency.

---

## 4. Evidence classification

### PROVEN — server / protocol / deployment substrate

Direct repo/runtime evidence supports:

- public Worker/static deployment and routing;
- real WebSocket round-trip and reconnect plumbing;
- shared Durable Object world coordination in earlier multiplayer gates;
- exact `box3d.js@0.1.1` running continuously in a real Durable Object;
- WS0 server Box3D at `60 Hz / 4 substeps` in the qualified specimen;
- dynamic rigid-body player/actor -> prop contact;
- sequenced input + ACK path;
- ~10 Hz authoritative snapshots in current WS0;
- bounded scheduler behavior in validated runs with healthy finite-state checks;
- isolated staging for the final A2R candidate;
- real browser -> Internet -> staging Worker -> Durable Object -> WebSocket execution;
- automated cloud player -> shared-prop contact.

Representative A1 public soak:

- ~62 s continuous run;
- tick ratio `0.999608`;
- dropped ticks `0`;
- catch-up steps `0`;
- pump p50/p95/max `16/16/16 ms`;
- finite world;
- real actor -> prop displacement.

### PROVEN — original A2 presentation failed

The original A2 browser deliberately had no local prop collision. It locally predicted owner movement while delayed authority/presentation dominated physical contact.

Human evidence showed visible/perceptual contact instability while the server substrate remained healthy.

Preserve the negative control:

> **A2 BASELINE FAIL / SUBSTRATE NOT FAILED.**

### PROVEN — A2R mechanical/browser/cloud path

A2R replaced the original owner predictor/authoritative-prop presentation with a local full Box3D copy of the tiny **fresh** world:

- local dynamic owner capsule;
- local dynamic 12 props;
- same relevant static scene/body/material parameters;
- fixed local `60 Hz / 4 substeps` independent of render FPS;
- immediate local owner input;
- immediate input-transition send plus periodic heartbeat;
- no normal continuous authoritative positional correction;
- snapshots used primarily as divergence/evidence rather than a continuous steering target;
- second interactive player intentionally rejected.

The exact reference passed layered automated evidence including exact Box3D labs, real browser, isolated staging, cloud WS/ACK/contact and real browser-over-Internet smoke.

### OWNER-OBSERVED — A2R feel

Owner reports the **functioning single-player A2R path feels very smooth** in hands-on use.

Evidence qualifier:

- the uploaded gameplay video could not be independently recovered/mounted in the final browser-GPT session;
- therefore this is Owner judgement, not independent frame-by-frame validation;
- the separately observed `~212/235 ms RTT` came from a later second-client/mobile attempt that hit the intentional single-player guard and had `0 local physics steps`;
- do **not** claim the smooth run itself was proven at exactly 212/235 ms RTT.

### STRONGLY SUPPORTED — temporal interpretation

Exact-Box3D temporal experiments suggest much of single-owner A2R divergence is prediction lead rather than fundamentally different contact dynamics.

At modeled ~63 ms one-way latency:

- local prediction lead relative to server-now was typically ~`+3…+5` ticks;
- aligned player residual was commonly ~`0.00–0.01`;
- aligned prop/contact residual was commonly ~`0.00–0.04`;
- settled/final residual was commonly ~`0.00–0.03`.

At modeled 100 ms one-way, lead rose to roughly `+5…+6` ticks while tested aligned contact residual remained small.

Treat this as strong bounded model evidence, not proof of arbitrary two-client contention.

### PROVEN BOUNDED RECOVERY DEBT — stall + input transition

A2R fixed-step work established:

- silently discarding local fixed ticks loses local simulation time in an uncorrected local-copy model;
- retaining backlog fixes lost simulation time but does not reconstruct historical input assignment;
- an input transition during a main-thread stall can therefore leave player/prop divergence;
- ideal history-aware catch-up converged in the six tested 100/250 ms press/release/reversal cases, while current-input catch-up could leave residual error;
- browser evidence did not establish DOM event timestamps as a safe cross-device history contract.

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

The server-side limit of six players is not evidence of useful six-player prediction/scaling.

---

## 6. Current unknowns / non-claims

A2R does **not** establish:

- a final multiplayer architecture;
- coherent two-client influence on the same prop;
- a correct remote-player local representation;
- a faithful live-world join/reconnect/reseed contract;
- sufficient shared-prop state for reconciliation — current prop snapshots lack linear/angular velocity;
- final snapshot cadence, transport or backend;
- arbitrary stall recovery;
- final character representation;
- meaningful 5–6 player headroom;
- persistence/world streaming/combat/AI/economy/product architecture.

These are stored unknowns, not automatic tasks.

---

## 7. Current-best research frontier

The provisional highest-value problem is **remote causality / shared physical truth under multiple independent actors**.

Single-owner A2R knows local intent immediately. With two independent players, each client learns the other's newest causal input only after delay while both may influence the same physical body.

Current-best question:

> **Can multiple independent actors share physical consequences while preserving the smooth local embodiment demonstrated by A2R and still converge on one server-authoritative physical truth?**

This is a research framing, **not a selected architecture**.

Adjacent unresolved questions remain visible:

- remote-player local representation;
- shared-prop state/correction requirements;
- live-world/reconnect seed contract;
- rare recovery/reseed policy;
- practical 2–3 player quality;
- 5–6 player headroom later.

Do not interpret future failure as automatic evidence for Forecast, rollback, object ownership, interaction islands, higher cadence or a new transport.

A useful provisional decomposition is:

1. **A acts -> B observes** a shared consequence;
2. **B acts -> A observes**;
3. **A + B both influence the same body**;
4. after automated structural sanity: real human-human play.

A fresh orchestrator should actively search for a cheaper/more discriminating falsifier before implementing this exact sequence.

---

## 8. Human/device validation capability

Desktop and mobile are both intended real clients.

Preferred direction:

> **device-specific controls -> shared gameplay intent -> shared physical semantics**

Do not fork core physics/network semantics by device.

Camera/touch controls are real future work. Add them when bad controls/camera would contaminate human judgement, not because every falsifier needs product-grade UI.

Camera is part of perceptual correctness: earlier A2 evidence showed that coupling camera focus directly to corrected player state can amplify network corrections into whole-scene discontinuities.

Real human multiplayer testing is unusually practical:

- **2 people** — baseline human multiplayer crucible after automated gates;
- **3 people** — realistic early stress test after two-player behavior is coherent enough to learn something new;
- **4 people** — sometimes available as opportunistic stronger stress, **not** a current scale/acceptance milestone.

Before asking for human play, automate obvious connection/protocol/contact/finite-state/scheduler/divergence failures where practical.

Human judgement should answer questions machines cannot answer well:

- does another person feel physically present?;
- does shared matter feel like one world?;
- does local control stay immediate during contention?;
- are remote consequences legible?;
- does free play create interesting emergent cooperation/conflict?;
- has mobile UI/camera become the actual bottleneck?

---

## 9. Character Controller donor boundary

Current Donor v1 exists so downstream projects can inherit known embodiment behavior without inheriting the research apparatus.

Qualified donor envelope remains approximately:

- Donor v1 / A‴;
- API `0.2.0`;
- `box3d.js@0.1.1`;
- fixed `1/60 s` step;
- `4` substeps;
- lifecycle `preStep -> b3World_Step -> postStep`;
- device-independent intent boundary.

But ownership differs fundamentally:

- A2R owner = **solver-owned dynamic rigid body**;
- Donor v1 = **controller-owned embodiment** with virtual mass/manual reciprocity/support transport.

Therefore importing Donor v1 into the next multiplayer crucible is a major confounder, not a harmless movement upgrade.

Default rule:

> **treat Character Controller as qualified embodiment donor/reference; integrate only when a concrete Multi_World need makes that integration itself the question.**

If adopted later, preserve exact donor revision/provenance and add an equivalent conformance gate.

Knowledge from JV/JV-Web/ANVIL/JES/Coopege and smaller experiments may also transfer as research/donor knowledge, but does not imply one universal runtime architecture.

---

## 10. Explicitly deferred by current evidence

Do not automatically:

- mutate the A2R human-reference into multiplayer;
- import Character Controller Donor v1;
- build generic rollback/resimulation;
- build a generic Forecast framework;
- build prediction/interaction islands;
- build an object-ownership framework;
- replace transport merely because WebSocket is imperfect;
- increase snapshot/simulation rate to hide unexplained failure;
- create a mobile-specific simulation fork;
- build accounts/matchmaking/persistence/combat/AI/economy/content systems;
- create a new product repository;
- build a universal engine/network abstraction.

The next implementation must be earned by a fresh falsifier or by newer evidence identifying a better frontier.

---

## 11. Working method

Default loop:

> **real friction / desired capability -> identify actual unknown -> cheapest meaningful falsifier -> smallest justified implementation -> validation matched to causal blast radius -> faithful runtime/device evidence -> Owner judgement only where human perception/play is indispensable -> next iteration**

Operational consequences:

- perform as much research/modeling/automation as practical before Owner PLAY;
- minimize Owner attention cost;
- machine PASS is not feel PASS;
- Owner excitement/fun is valuable evidence but not automatically a mechanical proof;
- separate facts, interpretations, hypotheses and plans;
- preserve negative evidence;
- treat plans as candidates, not commitments;
- protect controls/reference specimens;
- stop at natural stage boundaries;
- do not build infrastructure/frameworks to avoid answering a concrete gameplay question.

### Division of responsibility

**Owner:** product intent/priorities, qualitative feel, human free play and judgement of emergent value.

**Browser GPT / orchestrator:** live grounding, critical synthesis, broad research, bounded experiment design, automated validation, provenance/evidence boundaries, technical explanation and deciding when human play is worth requesting.

**Repo-native executor / Codex when useful:** implementation/refactoring/exact donor recovery/validation when repo-native access is advantageous. Its output is evidence to inspect, not authority over product intent. The project must remain operable if a specific executor/tool is unavailable.

---

## 12. Fresh-project startup requirement

A fresh Multi_World project must **not begin by implementing A3**.

First:

1. re-verify all live anchors;
2. verify current CI and production/staging deployment state;
3. read issue #8 and its newest checkpoints;
4. verify Character Controller current state only as far as needed for donor context;
5. challenge this grounding document;
6. classify current truth as `PROVEN / OWNER-OBSERVED / STRONGLY SUPPORTED / PROVISIONAL / UNKNOWN / REJECTED`;
7. identify the highest-value unknown after current live evidence;
8. propose the smallest discriminating next move;
9. **stop before implementation** until that grounding is consciously accepted or corrected.

### Handoff freshness note

During the final preparation audit in this browser session:

- `cloudflare-multiplayer-lab/main`, the preserved A2 branch and the A2R human-reference branch still matched their expected exact SHAs;
- Character Controller `main` had advanced documentation-only to `5891fbf0...`, while its behavior baseline and exact Donor v1 mechanics specimen remained unchanged as described above;
- direct public `workers.dev` HTTP re-probing was not possible from this execution environment because the host could not be resolved, so **deployment state must be re-verified live by the fresh project instead of being inherited as current fact**.
