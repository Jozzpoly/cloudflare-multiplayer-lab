# Multi_World — Current state

Status: **HANDOFF READY / F5 CANDIDATE PREPARED · PRE-DEPLOY · NO LIVE F5 RESULT**  
Date: **2026-09-03**

This file is the short operational entry point. Live repo/branch/CI/deployment evidence and the newest qualified issue #8 checkpoint outrank this summary.

## 1. Authority order

1. live repo / exact branch / exact SHA / current CI or deployment evidence;
2. newest qualified issue #8 checkpoint and corresponding archived research PR/artifact;
3. this file + `MULTI_WORLD_FOUNDATION_STRATEGY.md` + `MULTI_WORLD_PROJECT_SOUL.md`;
4. `MULTI_WORLD_SYNC_RESEARCH_PROGRAM.md` for synchronization history/decision provenance;
5. older plans and conversation history.

Plans are candidates, not commitments.

## 2. Live anchors

Re-verify before writes, but the current handoff anchors are:

- infrastructure control: `main@d5758bf18b5ebd5fb7ce5a705d525c80d3bca5de`;
- frozen human control: PR #15 / `ws0-human-two-player-mobile-baseline@f6d6b2f275a0c097ab9ce1e26d86a9fa912391b1`;
- T5 coupled causal relay: archived PR #23 / `a4263565a1b39de35f93f85c5ada01d8ef9147e3`;
- F1 causal-time topology: archived PR #24 / `2872e7b3b5f369bbe9f7bfad7fcd555c9d16f710`, issue comment `5516192962`;
- F2 full-physics checkpoint substrate: archived PR #25 / `1c6807f1562d832753a7514cd6d2c1ea0100c0a3`, issue comment `5516336021`;
- F3.0 canonical timeline/buffer feasibility: archived research lineage on `ws0-sync-timeline-f3-buffered-input`;
- F3.1 coupled temporal discriminator: archived PR #28 / `72f298e7b3730194d69a9d989620c273138b2c34`;
- F4 bounded scheduled client history: archived PR #29 / `ws0-sync-f4-bounded-scheduled-history@d33294e9052e37cf716d809e7dca551d1065df44`, issue comment `5517282802`;
- active F5 branch: `ws0-f5-browser-scheduled-history@ca8fc10ee93fe91684ba2de2302e2650eeba0a21`.

The active F5 head contains the isolated F5 server/protocol **and** bounded-history browser candidate. It is not merely a contract branch anymore.

## 3. Product truth

The project purpose remains:

> **PLAYER INTENT ↔ PHYSICAL CONSEQUENCE ↔ SHARED TRUTH**

for a small shared physical living world, initially 2–3 genuinely supported people, with mobile as a first-class early client.

The preserved desktop+phone human control proved that immediate full-local embodiment can feel clean, but delayed remote intent with zero reconciliation can fork shared physical consequence. The project is not trying to synchronize transforms cosmetically; it is trying to make another person physically present in one consequential place.

`MULTI_WORLD_PROJECT_SOUL.md` remains the authority on product direction.

## 4. Qualified synchronization evidence

### F1
A common canonical event history is required for coupled shared physics. Mixed/remote-only history repair is structurally insufficient.

### F2
Pinned `box3d.js@0.1.1` recording/replay can provide bounded, branchable complete-physics history with active-contact fidelity and generational handoff. This is mechanism capability, not a mandate for authority rollback or a persistent save format.

### F3.0
Canonical scheduled target ticks + prediction lead + authority future-input buffering are mechanically feasible over the declared deterministic timing sweep. Remote human information still reaches another predicting client roughly on an RTT-scale horizon and therefore still requires client reconciliation.

### F3.1
For the carried coupled T5 scenario, healthy scheduled-forward traces reproduced the intended shared physical truth with **zero authority rollback**. Source-time authority rollback did not reduce the measured client repair cost for the compared canonical histories.

Important interpretation correction: this does **not** prove scheduled-forward and source-time realize a newly sampled human action at the same wall-clock/canonical tick. F5 is the first live human discriminator of whether the scheduled mapping feels acceptable.

Representative carried corrections:

- 65 ms: max self ~`0.131 m`, relay ~`0.193 m`, client rewind `9` ticks;
- 85 ms: max self ~`0.185 m`, relay ~`0.277 m`, client rewind `11` ticks;
- 85 ms + burst/HOL: client rewind `13` ticks.

The near-boundary negative proved that client↔client agreement does not imply client↔authority agreement when target-tick records miss authority consumption. Authoritative consumption feedback is therefore part of the current candidate family.

### F4
F4 replaced session-seed oracle rebuilds with bounded recent complete-physics client history.

With the experimental 8-tick segment / 24-tick retained geometry:

- 65 ms: exact F3.1 match, max replay `16` physics steps;
- 85 ms: exact match, max replay `18`;
- 85+HOL: exact match, max replay `20`;
- frozen pre-result bound: `21`;
- max retained recording bytes in the small lab: `186485 B`;
- overlapping correction C2 restored from history already corrected by C1 and ended at canonical residual `0`.

F4 also proved creation ordinals are **recording-generation-local**. Stable identity is host `NetEntityId`; each replay generation must explicitly rebind to current runtime/BodyId. Body names are only the current experimental locator seam.

## 5. Current candidate family — supported, not final

Current strongest normal-flow hypothesis:

`canonical target ticks`
→ `future authority input buffers`
→ `normally forward-only authoritative Box3D`
→ `authoritative consumption feedback`
→ `complete predicted client Box3D world`
→ `bounded recent full-physics history`
→ `client rollback/resimulation`
→ `presentation separated from corrected physics truth`.

Authority rollback remains an exceptional/future mechanism unless new evidence proves it materially necessary.

This is a candidate architecture, not a permanent project commitment.

## 6. F5 live candidate

Active head:

`ws0-f5-browser-scheduled-history@ca8fc10ee93fe91684ba2de2302e2650eeba0a21`

Status:

**IMPLEMENTATION/PREFLIGHT PREPARED · NO STAGING RUNTIME RESULT · NO OWNER RESULT**.

Prepared evidence:

- isolated `WorldSliceF5` and F5 ticked-input protocol;
- staging-only `WORLD_SLICE_F5` binding/export/worker-first route;
- forward authority scheduled-input buffer with late/missing/conflict handling;
- immediate validated peer future-record relay;
- authoritative per-tick consumption feedback;
- isolated `/world0-f5/` browser surface;
- complete local Box3D prediction for both players and shared props;
- F4-style 8/24 bounded in-browser recording history;
- restore to `B(T)`, corrected resimulation and new corrected recording generation;
- explicit replay-generation entity remap;
- same-canonical-tick diagnostics;
- raw correction presentation;
- desktop keyboard + minimal touch joystick for phone testing.

Exact F5 preflight run `33694085298` passed full repo checks, protocol smoke, browser syntax check, staging type generation/dry-run and frozen-World0 diff guard.

The root Cloudflare connected build for F5 research pushes uses `npx wrangler versions upload`; successful build/version upload is not by itself evidence of production traffic promotion.

### F5 corrections before live deployment

Before staging deployment, keep scope small but improve evidence quality:

1. align the written F5 contract with the implementation's canonical server-slot actor creation ordering; the old contract text still allowed self-first browser order;
2. expose an explicit simulation/build fingerprint (`SimBuildId`-like experimental value) in handshake/telemetry;
3. measure correction/resimulation CPU duration and useful browser frame-time burst metrics, especially for the phone;
4. preserve raw correction presentation for the first Owner judgement;
5. verify the isolated staging Worker is pointed at the current F5 branch before the explicit staging lifecycle deploy.

Do not turn this hardening into a new framework/refactor.

### F5 natural stop

One faithful fresh run:

`remote idle`
→ `both moving without contact`
→ `player/player contact`
→ `shared-prop interaction`

on desktop + phone, with telemetry captured alongside Owner judgement.

Then stop and interpret. Do not automatically tune smoothing or start the next laboratory stage.

## 7. Strategic roadmap correction

The old synchronization ladder remains useful provenance, but the project should no longer mechanically execute `F5 → F6 → F7 → F8`.

Canonical strategic direction now lives in:

`docs/MULTI_WORLD_FOUNDATION_STRATEGY.md`.

If F5 survives its live human gate, the next broad step is a bounded **Multiplayer Foundation v0 Qualification** focused on future-expensive semantic risks:

- simulation identity / `WorldId + WorldEpoch + Tick + SimBuildId + NetEntityId`;
- application-level determinism envelope across authority/desktop/mobile;
- real time/lead/network/hitch envelope;
- join-in-progress, reconnect and authority restart/new epoch;
- rollback-safe gameplay effects and dynamic entity lifecycle;
- client/mobile/authority performance envelope;
- one causal trace vocabulary for diagnosis;
- authority/transport portability as a design constraint, not an immediate framework refactor.

Foundation v0 has an explicit exit rule: once these invariants are strong enough within a declared envelope, build **Inhabitable World V0** rather than extending substrate research indefinitely.

## 8. Long-term boundary that must survive

Keep three kinds of state conceptually separate:

1. persistent logical world state;
2. active authority physics/runtime state for one `WorldEpoch`;
3. short-lived rollback/prediction recording history.

Do not make Box3D recording the persistent save format by default. Do not make logical `WorldId` equal to one immortal Durable Object instance.

Cloudflare Durable Objects and WebSockets remain current valid substrates until measured evidence rejects them; they are not project identity.

## 9. Immediate next action after fresh takeover

Do **not** reopen F1–F4 or redesign Foundation v0 immediately.

1. verify the live F5 head and its latest CI/checks;
2. read `MULTI_WORLD_FOUNDATION_STRATEGY.md` and the active F5 contract;
3. audit/implement only the small pre-deploy F5 evidence hardening above;
4. verify staging isolation/deployment target;
5. deploy F5 to isolated staging and run automated live smoke;
6. only then ask the Owner for the one desktop+phone raw-correction play session;
7. use that result to design the concrete Foundation v0 qualification sequence or reject/revise the current temporal family.

The project should enter a new conversation from this frontier, not re-ground from A2/A3 history unless live evidence contradicts the canonical state.
