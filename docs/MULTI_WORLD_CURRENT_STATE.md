# Multi_World — Current state

Status: **HANDOFF READY / ACTIVE FRONTIER = F3.0 CANONICAL TIMELINE + BUFFERED INPUT FEASIBILITY, PRE-EXECUTION**  
Date: 2026-09-02

This file is the short operational entry point for continuing Multi_World. It does not replace issue #8, `MULTI_WORLD_SYNC_RESEARCH_PROGRAM.md`, or the historical research PRs; it states what is current and what must be verified live before writes.

## 1. Authority order

For technical truth use, in order:

1. live repo / exact branch / exact SHA / current CI or deployment evidence;
2. newest qualified checkpoint in issue #8 and corresponding research PR/artifact;
3. this current-state file plus `MULTI_WORLD_SYNC_RESEARCH_PROGRAM.md` and `MULTI_WORLD_PROJECT_SOUL.md` on `multi-world-takeover-grounding`;
4. older plans, takeover drafts and conversation history.

Plans are candidates, not commitments. Do not continue a numbered experiment merely because it exists.

## 2. Live anchors to verify first

- infrastructure control: `main@d5758bf18b5ebd5fb7ce5a705d525c80d3bca5de`;
- frozen desktop+mobile zero-reconciliation human control: PR #15 / `ws0-human-two-player-mobile-baseline@f6d6b2f275a0c097ab9ce1e26d86a9fa912391b1`;
- T5 actor→shared-prop causal-relay checkpoint: archived PR #23 / `a4263565a1b39de35f93f85c5ada01d8ef9147e3`;
- F1 causal-time checkpoint: archived PR #24 / `2872e7b3b5f369bbe9f7bfad7fcd555c9d16f710`; issue #8 comment `5516192962`;
- F2 bounded full-physics checkpoint feasibility: archived PR #25 / `1c6807f1562d832753a7514cd6d2c1ea0100c0a3`; issue #8 comment `5516336021`;
- superseded pre-result branch: `ws0-sync-history-f3-bounded-resim@1c6807f1562d832753a7514cd6d2c1ea0100c0a3` — created before the post-F2 architecture red-team, contains no F3 result and is not the active frontier;
- active frontier branch: `ws0-sync-timeline-f3-buffered-input`, created fresh from exact qualified F2 head `1c6807f1562d832753a7514cd6d2c1ea0100c0a3`, currently pre-result.

Always verify these live. Branch existence is not evidence.

## 3. Product truth currently established

The first real simultaneous desktop+phone session proved two things at once:

- immediate full-local embodiment can feel clean and pleasant;
- full local worlds + delayed remote intent + zero reconciliation do **not** preserve one shared physical truth under natural coupled interaction.

The human failure was cumulative and product-significant: actor disagreement propagated through later contacts into materially different shared prop/world states.

The project purpose remains: preserve **PLAYER INTENT ↔ PHYSICAL CONSEQUENCE ↔ SHARED TRUTH** for a small shared world. PR #15 remains the untouched human control.

## 4. Qualified research ladder through F2

- PR #16: direct player↔player contact is a proven causal amplifier;
- T0 / PR #18: deterministic Node tick-domain lab reproduced the contact failure without wall-clock scheduler noise;
- T1 / PR #19: fresh remote position/rotation/linear velocity is mechanically strong while self remains directly uncorrected;
- T2 / PR #20: realistic snapshot age is a dominant constraint; stale hard state and naïve linear hard forecast damage active contact;
- T3 / PR #21: simple stale-target velocity convergence rejected; local-contact reconciliation suspension retained only as an ingredient;
- T4 / PR #22: history-aware late remote-input repair collapses the isolated contact fork in a favorable deterministic oracle;
- T5 / PR #23: history repair prevents the actor fork from cascading into a divergent shared dynamic prop where the no-history control produces material prop divergence;
- F1 / PR #24: a **common canonical event history** is required; remote-only repair is structurally insufficient. Authority-time and source-time common histories can both be mechanically coherent but place WAN-delay cost differently;
- F2 / PR #25: exact `box3d.js@0.1.1` exposes enough recording/replay machinery for bounded, branchable, rolling **full-physics history**, including active-contact fidelity and generational ownership handoff.

Completed research PRs remain closed/archived, unmerged, while their branches/artifacts/PR bodies remain provenance.

## 5. F1/F2 interpretation after red-team

F1 compared receipt-live, partial repair, authority-apply-time common history and source-time common history. In its isolated lab:

- receipt-live diverged strongly;
- remote-only repair left mixed histories;
- `all-authority-tick` converged with a forward-only authority but incurred large local-self retiming (~0.38 m / 0.50 m max at 65/85 ms one-way);
- `all-source` converged with authority history repair and much smaller isolated local-self replacement (~0.013 m / 0.016 m); coupled T5 remains stronger presentation-cost evidence (~0.050 m / 0.068 m).

F2 then proved that recent complete physics checkpoints are mechanically feasible in the exact Box3D stack: deep live-contact seeds, backward seek, normal branching and generation handoff all qualified in the bounded lab.

**Important correction:** these results do **not** yet justify making source-time authority rollback the normal multiplayer clock.

The missing discriminator is a third timing family that F1 did not model as a first-class protocol:

> **canonical scheduled tick + client prediction lead + authority input buffer**

In this family, normal client commands target a canonical future simulation tick and are intended to reach authority before that tick is consumed. Authority can therefore remain normally forward-only while clients use prediction history and reconciliation for uncertainty/error. Server rollback remains available as an exceptional/advanced mechanism unless evidence proves it necessary for normal shared physical consequence.

This red-team supersedes the previously selected bounded-authority-resim F3 **before execution**. No qualified evidence is being discarded.

## 6. Current architecture hypothesis — not a commitment

Current strongest candidate to falsify is:

`canonical server tick`

→ `per-player ticked input buffers`

→ `normally forward-only authoritative Box3D`

→ `tick-tagged authoritative snapshots / acknowledgements`

→ `client predicted full-physics world + bounded history`

→ `client rollback/resimulation on prediction error`

→ `render presentation separated from corrected physics truth`

with F2-style authority rollback retained as a fallback/exception unless F3 evidence requires it for normal operation.

Do not promote this candidate by donor prestige. Multi_World must falsify it against its own coupled-physics problem.

## 7. Active frontier — F3.0 canonical timeline / buffered-input feasibility

**F3.0 deliberately contains no Box3D.** It is the cheapest meaningful discriminator before another physical-history implementation.

Build a deterministic timing-domain apparatus that defines and distinguishes:

- canonical server tick;
- client predicted tick;
- confirmed authoritative tick;
- input target tick;
- per-player authority input-buffer occupancy;
- uplink arrival;
- server consumption;
- relay/snapshot/ack arrival at clients;
- remote-command knowledge relative to a client's already-predicted tick.

Initial bounded sweep:

- one-way latency `35 / 65 / 85 / 120 ms`;
- jitter `0 / 10 / 30 ms`;
- several prediction/input lead depths;
- smooth and bursty delivery phases;
- logical input at simulation tick granularity, with transport batching parameterized rather than assuming one packet per tick.

Primary outputs:

- authority on-time input rate;
- command lead/deficit at authority in ticks;
- input-buffer depth distribution;
- missing/hold-last events;
- remote input/state arrival relative to peer predicted tick;
- implied client rollback horizon;
- additional authoritative timeline delay vs immediate local predicted response.

The key question is not whether prediction eliminates latency. It is:

> **Can a forward-only authority receive normal local commands in time with a reasonable prediction/buffer policy, while the apparatus honestly quantifies the remaining remote-human uncertainty that clients must reconcile?**

Natural stop: establish whether the scheduled-tick family is feasible enough to deserve coupled Box3D comparison. Do not add checkpoint machinery to answer F3.0.

## 8. Planned next gates — provisional and re-selected after every result

### F3.1 — coupled-physics timing discriminator

If F3.0 qualifies, replay its exact timing traces through the T5 actor-contact → shared-prop causal-relay scene and compare:

1. receipt-live control;
2. authority-apply-time/forward-authority common-history family;
3. scheduled canonical tick + forward authority + client prediction/reconciliation;
4. source-time common-history repair with authority rollback.

Measure client↔client/client↔authority residuals, shared-prop causal disagreement, local correction magnitude, client resim horizon and authority rollback cost.

### F4 — bounded reconciliation substrate

Use F2 where the winning timing model actually needs history. If forward authority wins, prove client-side bounded full-physics reconciliation first. If authority rollback is required, qualify it there too.

Before runtime integration, require stable `NetEntityId -> BodyId` remapping, bounded retention/cost, replay-safe event semantics and exact snapshot/ack tick semantics.

### F5 — real two-client desktop+mobile vertical slice

Only after F3/F4: smallest real ticked protocol, two predicted physical players, shared props, measurable reconciliation, PR #15 preserved as control. Then ask for Owner free play.

### F6 — Network Chaos + observability

Make latency/jitter/hitches and correction behavior explicit metrics rather than hidden environmental noise.

### F7+ — optimize only when earned

Prediction LOD / causal physics islands, binary wire format, delta compression, interest management, transport abstraction, authority placement, persistence and larger-world topology remain downstream of a good small shared-world vertical slice.

The detailed decision tree is in `MULTI_WORLD_SYNC_RESEARCH_PROGRAM.md`.

## 9. What is not earned

Do not infer or implement by default:

- source-time authority rollback as the normal protocol;
- claim that authority rollback is unnecessary;
- browser/server production rollback framework;
- selective rollback by nearest-N/radius;
- final prediction lead or input-buffer depth;
- final snapshot/input/network cadence;
- trusted client tick semantics without validation windows;
- stable production use of internal Box3D recording behavior;
- application entity-ID remapping across restored worlds;
- custom Box3D fork;
- browser smoothing as a substitute for physical correction;
- binary protocol, matchmaking, persistence or transport rewrite;
- deployment of research treatments onto frozen PR #15.

## 10. Repository hygiene contract

- `main` remains the infrastructure control unless separately promoted;
- historical qualified research branches remain immutable provenance;
- completed research PRs remain closed/archived and unmerged unless separately promoted;
- PR #15 remains intentionally open as the frozen human control;
- abandoned/superseded pre-result branches are not evidence and should be labeled as such in current docs;
- active research should occur only on the current frontier branch with ordinary CI plus only the workflow needed by that experiment;
- issue #8 is the chronological evidence ledger; this file is the short operational map.

## 11. First action after takeover

1. Verify live anchors above and newest issue #8 checkpoint.
2. Read `MULTI_WORLD_SYNC_RESEARCH_PROGRAM.md`, F1 timing apparatus and exact T5 coupled-physics apparatus.
3. Audit the F3.0 timing contract **before writing the simulator**: tick definitions, event ordering, prediction lead, batching, uplink/authority/relay ordering and predeclared discriminator metrics.
4. If the contract remains sound, implement one bounded F3.0 apparatus + dedicated workflow/artifact.
5. Stop at the F3.0 verdict. Do not automatically begin F3.1.
