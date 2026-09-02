# Multi_World — Current state

Status: **HANDOFF READY / ACTIVE FRONTIER = F5 ISOLATED BROWSER SCHEDULED HISTORY, PRE-EXECUTION**  
Date: 2026-09-03

This file is the short operational entry point. Live repo/branch/CI and newest qualified issue #8 evidence outrank this summary.

## 1. Authority order

1. live repo / exact branch / exact SHA / current CI or deployment evidence;
2. newest qualified issue #8 checkpoint and corresponding archived research PR/artifact;
3. this file + `MULTI_WORLD_SYNC_RESEARCH_PROGRAM.md` + `MULTI_WORLD_PROJECT_SOUL.md`;
4. older plans and conversation history.

Plans are candidates, not commitments.

## 2. Live anchors

- infrastructure control: `main@d5758bf18b5ebd5fb7ce5a705d525c80d3bca5de`;
- frozen human control: PR #15 / `ws0-human-two-player-mobile-baseline@f6d6b2f275a0c097ab9ce1e26d86a9fa912391b1`;
- T5 coupled causal relay: archived PR #23 / `a4263565a1b39de35f93f85c5ada01d8ef9147e3`;
- F1 causal-time topology: archived PR #24 / `2872e7b3b5f369bbe9f7bfad7fcd555c9d16f710`, issue comment `5516192962`;
- F2 bounded full-physics checkpoint substrate: archived PR #25 / `1c6807f1562d832753a7514cd6d2c1ea0100c0a3`, issue comment `5516336021`;
- F3.0 canonical timeline/buffer feasibility: archived research lineage on `ws0-sync-timeline-f3-buffered-input`, qualified before F3.1;
- F3.1 coupled temporal discriminator: archived PR #28 / `72f298e7b3730194d69a9d989620c273138b2c34`, qualified scheduled-forward semantics;
- F4 bounded scheduled client history: archived PR #29 / `ws0-sync-f4-bounded-scheduled-history@d33294e9052e37cf716d809e7dca551d1065df44`, issue comment `5517282802`;
- active frontier: `ws0-f5-browser-scheduled-history@5530b4002dc3318a094845f482f4494acca987ad`, contract only, **no browser result yet**.

Always verify live before writes.

## 3. Product truth

The real simultaneous desktop+phone control proved:

- immediate full-local embodiment can feel clean;
- delayed remote intent with zero reconciliation does not preserve one shared physical truth under coupled interaction.

The project objective remains **PLAYER INTENT ↔ PHYSICAL CONSEQUENCE ↔ SHARED TRUTH** for a small shared physical world. PR #15 remains untouched control evidence.

## 4. Qualified synchronization ladder

### F1
A common canonical event history is required. Remote-only repair leaves mixed histories. Authority-time and source-time common histories can both be mechanically coherent but place WAN-delay cost differently.

### F2
Exact `box3d.js@0.1.1` recording/replay supplies bounded branchable full-physics history: live-contact snapshot seeds, backward seek, ordinary branching and generation handoff qualified.

### F3.0
Canonical scheduled ticks + client prediction lead + authority input buffering are mechanically feasible over the declared deterministic latency/jitter sweep. The experiment also established the RTT-scale remote-information horizon that clients must reconcile. A fixed `L=8/B2` point was useful for the gate but is not a production tuning decision.

### F3.1
In the coupled T5 actor→shared-prop scenario, healthy scheduled-forward traces reproduced the intended source canonical physical history with **zero authority rollback**. Scheduled-forward and source-time-common produced identical measured client correction/history costs under the same real A→authority→B information path; source-time added authority rollback without reducing client correction.

Representative carried corrections:

- 65 ms: max self ~`0.131 m`, relay ~`0.193 m`, max client rewind `9` ticks;
- 85 ms: max self ~`0.185 m`, relay ~`0.277 m`, max client rewind `11` ticks;
- 85 ms + burst/HOL: max client rewind `13` ticks.

The near-boundary scheduled negative also proved that client↔client agreement does not imply client↔authority agreement when target-tick records miss authority consumption. Consumption/acceptance feedback is therefore required.

### F4
F4 replaced F3.1 rebuild-from-session-seed with bounded recent complete-physics client history and qualified all three intended probes.

With the frozen experimental geometry `8`-tick segments / `24` retained ticks:

- 65 ms: bounded history exactly matched F3.1; max replay `16` physics steps;
- 85 ms: exact match; max replay `18`;
- 85+HOL: exact match; max replay `20`;
- strict pre-result bound was `21` steps;
- max retained recording bytes in the small T5 lab: `186485 B`;
- overlapping correction C2 restored from history already corrected by C1 and ended at canonical oracle residual `0`.

F4c corrected an important identity assumption: RecPlayer creation ordinals are **recording-generation-local**, not globally stable. Stable host identity is `NetEntityId`; each replay generation explicitly rebinds `NetEntityId -> generation-local creationOrdinal -> current BodyId`. Snapshot-preserved body names are only the current experimental locator seam.

Current strongest supported normal-flow hypothesis is therefore:

`canonical scheduled target ticks`
→ `authority future-input buffer + consumption feedback`
→ `normally forward-only authoritative Box3D`
→ `complete predicted client Box3D world`
→ `bounded recent full-physics client history`
→ `client rollback/resimulation`
→ `presentation separated from corrected physics truth`.

Authority rollback remains available as an exceptional/future mechanism, not the current normal-flow default.

## 5. Deployment containment

Cloudflare root build configuration was changed so the deploy command is `npx wrangler versions upload`. Research pushes may still create inactive Worker Versions/checks, but this command uploads a version rather than automatically routing production traffic to it. The production branch shown in Cloudflare remains the frozen human baseline. Continue to avoid treating a `Workers Builds` check alone as proof of production traffic change.

## 6. Active frontier — F5 isolated browser scheduled history

Active branch: `ws0-f5-browser-scheduled-history@5530b4002dc3318a094845f482f4494acca987ad`.

Frozen contract: `docs/WS0_F5_BROWSER_SCHEDULED_HISTORY_CONTRACT.md`.

Status: **PRE-EXECUTION / NO BROWSER RESULT**.

F5 is not another offline timing-family comparison. It moves the qualified F3/F4 semantics into an isolated real two-browser runtime while preserving the old `/world0/ws` and PR #15 controls.

Contract highlights:

- new isolated `WorldSliceF5`, binding `WORLD_SLICE_F5`, route `/world0-f5/ws`, surface `/world0-f5/`;
- canonical authority boundary tick semantics;
- client predicted timeline target `L=8` for this bounded gate;
- one logical target-tick input per predicted tick, transport batching by 2;
- authority validates/buffers future records, relays them, consumes exact tick records or hold-last, and emits authoritative consumption feedback;
- bounded browser history initially retains the F4 8/24 geometry unchanged;
- complete predicted client world includes both actors and shared props;
- replay generation handoff performs explicit entity rebind;
- same-canonical-tick diagnostics must not compare current predicted client state against an older authority snapshot;
- first presentation is raw physical correction: no smoothing before Owner judgement;
- first human gate is desktop + phone on one fresh isolated F5 run with direct player contact and shared-prop interaction.

## 7. What F5 must not claim

F5 does not yet earn:

- final prediction lead;
- production clock synchronization/drift algorithm;
- final checkpoint cadence or memory/CPU budget;
- packet-loss/reconnect architecture;
- final NetEntityId wire representation;
- production presentation smoothing;
- binary protocol / interest management / causal-island optimization;
- changes to the frozen normal `/world0/ws` path.

## 8. Natural next action

1. verify F4 PR #29 / issue comment `5517282802` and active F5 head live;
2. audit the frozen F5 contract against current Worker/DO/browser code before modifying runtime;
3. implement the smallest isolated F5 server+browser vertical slice;
4. run automated protocol/CI/dry-run validation;
5. stop at the first faithful two-device raw-correction Owner gate or a concrete deployment/runtime blocker.

Do not reopen F1–F4 unless new evidence falsifies their qualified conclusions.