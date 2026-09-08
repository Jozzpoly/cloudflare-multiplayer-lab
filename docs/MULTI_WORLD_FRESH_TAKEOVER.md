# Multi_World — Fresh Project Takeover Mandate

Status: **DRAFT FOR A NEW CHATGPT PROJECT**  
Date boundary: **2026-09-02**

This document is intended to be used as the startup mandate for a fresh browser ChatGPT project taking over Multi_World.

It is not authorization to implement the next networking architecture immediately.

---

# START MANDATE

Take over **Multi_World** as the browser-based second brain / technical co-orchestrator of an ongoing R&D project.

This is a continuation of active work, but you must not behave as if the previous orchestrator's final plan is automatically correct.

Your first responsibility is to **reconstruct and challenge the current truth from live evidence**.

## 1. Project purpose

Multi_World is working toward a **small shared physical living world**: a cooperative 3D place where a few real people inhabit the same space, affect the same matter and experience consequences as genuinely shared reality rather than as loosely synchronized client-side illusions.

The current target pressure is:

- 2–3 genuinely supported players;
- roughly 5–6 as an early later target, not an immediate scaling requirement;
- mobile remains a first-class early client;
- physical/social/spatial presence matters more than content quantity;
- emergent physical interaction is more important than building a large feature catalog early.

Do not reinterpret this as an MMO project or as a mandate to build generic networking infrastructure.

Read `docs/MULTI_WORLD_PROJECT_SOUL.md` for the product/research intent, but treat live evidence as higher authority.

---

## 2. Hierarchy of truth

Use this hierarchy:

1. **live repository state, exact SHAs, deployed runtime and current CI evidence**;
2. **repo-native research checkpoints**, especially GitHub issue #8 and its latest comments;
3. **qualified donor repositories**;
4. `docs/MULTI_WORLD_GROUNDING_LEDGER.md`, its red-team document and this mandate;
5. old README text, old plans, historical branches and conversation lore.

Do not trust the current `cloudflare-multiplayer-lab` README as a complete current-state authority. It is historically useful but stale relative to WS0 A1/A2/A2R.

If newer live evidence contradicts this handoff, follow the live evidence and explicitly update your mental model.

---

## 3. Exact known anchors to re-verify immediately

### Multi_World infrastructure control

Repository: `Jozzpoly/cloudflare-multiplayer-lab`  
Branch: `main`  
Expected SHA at handoff: `d5758bf18b5ebd5fb7ce5a705d525c80d3bca5de`

Meaning: frozen Gate 4A fixed-authoritative simulation substrate.

### Preserved failed A2 baseline

Branch: `world-slice-0-embodied-3d-place`  
Expected SHA: `ef26fce6f5f21e219a4d8f57943449f4d2a2abca`

Meaning: server/protocol passes, but the original one-client prediction/presentation baseline failed the human physical-contact usability falsifier.

### A2R human-reference specimen

Branch: `world-slice-0-a2r-timeline-rebuild`  
Expected SHA: `2c9116267a0c8bba93061f759cefdb709e966e43`  
Client revision: `ws0-a2r-local-box3d-v2`

Meaning: first positive Owner-tested local-physics reference. Preserve it as a control; do not mutate this branch into the next multiplayer experiment.

### Character Controller donor authority

Repository: `Jozzpoly/Box3d-Character-Controler`  
Expected `main`: `f4877a46618a347c3be32edf7ddb39ab66a091bd`  
Current donor: Donor v1 / A‴  
Exact Owner-qualified mechanics specimen: `bc06ca98e94314af0ba888b74e1c4029429422e5`

This is a qualified donor, not an automatic dependency.

Re-verify all four anchors before using them.

---

## 4. Repo-native research authority to recover

Start with GitHub issue #8:

**`World Slice 0: embodied shared 3D place`**

Its original body still contains the useful integrated research question:

> Can two real clients inhabit one small 3D place with server-authoritative Box3D physical state, remain locally responsive enough to feel embodied, and coherently interact with the same dynamic props without contradiction or reconciliation dominating the experience?

But the issue body's status text is old. Read the newest comments.

Important historical/current checkpoints include:

- `5485306107` — A1 PASS: isolated Box3D server foundation;
- `5485371524` — A2 server/protocol automated PASS;
- `5485750129` — A2 browser candidate ready for human evidence;
- `5486105319` — **A2 human BASELINE FAIL / SUBSTRATE NOT FAILED**;
- `5501919456` — A2R Owner PLAY candidate; staging/browser/cloud gates PASS;
- `5502192824` — preliminary A2R human checkpoint: Owner reports very smooth single-player feel.

Read later comments too if they exist. Do not assume this list remains complete.

---

## 5. Current demonstrated substrate — provisional summary to verify

At handoff, the following are believed to be strongly established:

- exact `box3d.js@0.1.1` can run continuously in a real Cloudflare Durable Object;
- WS0 server physics operates at `60 Hz / 4 substeps` in the qualified specimen;
- server snapshots are currently `10 Hz`;
- client input baseline is approximately `15 Hz` heartbeat plus immediate transitions in A2R;
- dynamic server-side player capsule can physically move dynamic props;
- server/protocol/ACK/WebSocket path is functional;
- original delayed-authority/no-local-prop-contact A2 presentation was perceptually poor during contact;
- A2R runs a full local Box3D copy of the tiny fresh world for the owner + props;
- A2R does not continuously drag the owner/props toward delayed snapshots during normal play;
- A2R has passed real browser, real cloud staging and real browser-over-Internet gates;
- Owner reports the functioning A2R single-player path feels very smooth.

Do not claim the Owner smooth run was proven at exactly `212/235 ms RTT`. That RTT was observed on a second-client/mobile attempt that hit the intentional single-player guard.

---

## 6. Current A2R envelope you must understand before designing multiplayer

At the handoff specimen, server `WorldSlice0` approximately has:

- Box3D: `60 Hz`, `4 substeps`;
- snapshots: `10 Hz`;
- input lease: `600 ms`;
- implementation cap `MAX_INTERACTIVE_PLAYERS = 6`;
- provisional speed `5.2`, accel/decel `28/36`;
- dynamic upright player capsule, angular axes locked;
- 12 dynamic `0.92 m` box props;
- authoritative player snapshots include transform + linear velocity + ACK;
- prop snapshots include position + rotation only.

A2R browser client:

- imports exact inline `box3d.js@0.1.1`;
- seeds a fresh local world from welcome state;
- simulates local owner + all 12 props at fixed `60 Hz / 4 substeps`;
- immediately applies local owner intent;
- retains local simulation backlog rather than discarding fixed ticks;
- uses snapshots primarily for evidence/divergence measurement;
- performs no normal continuous positional reconciliation;
- intentionally refuses a second interactive player.

Fresh-world/single-player is part of the qualified envelope.

The server's ability to create up to six players is **not evidence that the A2R prediction model supports six players**.

---

## 7. Important negative evidence to preserve

### Original A2 baseline

Do not return to the assumption that server-authoritative contact can simply be presented by locally free-running the owner while delayed authoritative props/corrections dominate contact.

That baseline failed human usability.

### Continuous owner correction

Internal labs found that blindly correcting the local owner toward authority that has not yet processed the same current intent can materially damage responsiveness.

Do not reintroduce continuous owner correction merely because it is a conventional networking pattern.

### Local dropped simulation ticks

A real browser gate exposed that discarding local fixed ticks permanently loses simulation time in the local-copy model.

The A2R clock was changed to retain backlog and repay it.

### Stall + input transition

Retaining ticks does not reconstruct historical input assignment automatically.

Exact A/B evidence showed that current-input catch-up can diverge after a stall overlapping release/reversal, while ideal history-aware catch-up converges exactly in the tested scenarios.

This is known recovery debt. Do not build a rollback system preemptively unless new evidence says it matters.

---

## 8. Important temporal evidence

Do not interpret raw delayed-snapshot delta as same-time simulation error.

Issue #8 records exact-Box3D temporal experiments in which:

- at ~63 ms modeled one-way latency, local prediction lead relative to server-now is typically about `+3…+5` ticks;
- after better history/time alignment, player/contact residuals in tested traces are much smaller than raw wall-time difference;
- at 100 ms one-way, lead rises to roughly `+5…+6` ticks while aligned tested contact residual remains small;
- delaying input start 1.5 s after welcome does not remove this lead.

Current-best interpretation:

> much of single-owner A2R divergence is ordinary prediction lead caused by local immediate intent versus delayed authority input, not fundamentally different contact dynamics.

This is strong model evidence, not proof about arbitrary two-client contention.

---

## 9. Current research frontier — challenge it before accepting it

The provisional next fundamental problem is **remote causality**.

For one owner, local client knows its own newest intent immediately.

For two independent players:

- client A does not know client B's newest intent immediately;
- client B does not know client A's newest intent immediately;
- both may influence the same prop;
- therefore their local physical worlds receive causally relevant information at different times.

Current-best research question:

> **Can multiple independent actors share physical consequences while preserving the smooth local embodiment demonstrated by A2R and still converge on one server-authoritative physical truth?**

Do not assume that this requires Forecast, rollback, ownership, interaction islands or higher snapshot rate. Those are candidate mechanisms only.

Also keep adjacent unknowns visible:

- remote-player local representation;
- live-world/reconnect seed state (prop velocity is not currently in snapshots);
- rare recovery/reseed contract;
- shared-prop reconciliation semantics;
- practical 2–3 player quality;
- 5–6 player headroom.

---

## 10. Provisional first two-client falsifier — do not implement before grounding

A useful candidate decomposition is:

1. **A acts -> B observes** a shared prop consequence;
2. **B acts -> A observes**;
3. **A + B simultaneously influence the same prop**;
4. only after automated structural sanity: real human-human desktop + phone stress play.

Measure separately:

- local owner responsiveness;
- remote actor error/presentation;
- shared-prop A <-> B divergence;
- local <-> authority divergence with explicit time semantics;
- settled convergence;
- any correction magnitude/frequency;
- server scheduler health;
- whether remote-causality correction fights locally valid contact.

Do not compress this into one score.

This shape is provisional. A fresh orchestrator should actively try to find a cheaper or more discriminating falsifier before implementation.

---

## 11. Character Controller donor rule

Read the live donor contract before adoption:

`Jozzpoly/Box3d-Character-Controler/docs/DONOR_CONTRACT.md`

At handoff Donor v1 is qualified around:

- `box3d.js@0.1.1`;
- `1/60 s` fixed step;
- `4` substeps;
- device-independent intent boundary;
- explicit `preStep -> world step -> postStep` lifecycle.

However the donor is **controller-owned**, with virtual mass/manual reciprocity/support transport semantics. A2R's current player is a solver-owned dynamic rigid body.

Therefore importing Donor v1 into the next multiplayer crucible would change more than movement feel. It changes state ownership and contact semantics and is a major confounder.

Default rule:

> **use Character Controller as knowledge/donor authority; do not integrate it until a concrete downstream need makes that integration itself the question.**

---

## 12. Relationship to other Owner projects

JV/JV-Web/ANVIL/JES/Coopege and smaller experiments may contain useful donors:

- Box3D/contact lessons;
- browser/public-runtime patterns;
- falsification/evidence methods;
- future world-interaction ideas.

Do not merge project architectures merely because concepts overlap.

No universal framework is authorized.

---

## 13. Working method

Preserve this loop:

> **real friction / desired capability -> identify actual unknown -> cheapest meaningful falsifier -> smallest justified implementation -> validation matched to causal blast radius -> faithful runtime/device evidence -> Owner judgement only where human perception/play is indispensable -> next iteration**

Behavioral expectations for the orchestrator:

- perform as much research, modeling and automated validation as practical before requesting Owner play;
- give concise progress checkpoints during long technical work;
- protect controls/reference specimens;
- separate fact / interpretation / hypothesis / implementation plan;
- preserve negative evidence;
- do not treat a previous plan as a commitment;
- stop at natural research boundaries;
- reduce Owner attention cost.

The Owner defines vision, priorities and qualitative judgement. The browser orchestrator should take responsibility for technical research/orchestration. Repo-native executors such as Codex may be used when useful, but the project must not depend on one tool always being available.

---

## 14. Repository / branching safety at takeover

Do not modify:

- frozen `main` merely to “bring it up to date”;
- `world-slice-0-embodied-3d-place` control;
- `world-slice-0-a2r-timeline-rebuild` human-reference specimen.

Do not create a new product repository yet.

After live grounding and explicit selection of the next bounded experiment, create a **new research branch** from the exact chosen specimen rather than mutating a control.

Deployment must remain isolated from root production. Re-verify live staging/production configuration before the first write because earlier work discovered real deployment drift caused by Cloudflare build configuration.

Do not carry the entire historical deployment incident into product architecture; carry only the safety invariant: exact deployed specimen and production isolation must be verified before human evidence.

---

## 15. First required output from the fresh project

Before implementation, produce a concise grounding report containing:

### A. Live anchors

Exact current SHAs and deployment state.

### B. Evidence classification

`PROVEN / OWNER-OBSERVED / STRONGLY SUPPORTED / PROVISIONAL / UNKNOWN / REJECTED`.

### C. Challenge to this handoff

Identify at least the strongest ways this handoff could be wrong or stale.

### D. Highest-value unknown

State the actual next unknown after live evidence, not merely “A3.”

### E. Smallest discriminating next move

Propose the smallest experiment that can separate the strongest competing explanations/architectures.

**Do not implement yet.**

Only after that grounding is reviewed should the fresh project move into implementation.

---

## 16. Materials on the takeover branch

Read:

- `docs/MULTI_WORLD_PROJECT_SOUL.md`
- `docs/MULTI_WORLD_GROUNDING_LEDGER.md`
- `docs/MULTI_WORLD_GROUNDING_REDTEAM.md`
- this mandate

Then verify them against live state.

# END MANDATE
