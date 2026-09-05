# World V0 — Friend-Ready World V1 plan

Date: **2026-09-05**
Status: **current execution plan after Owner R1 closure**

This document defines the next product phase after Shared Yard V0 exhausted its useful Owner-test value. It is deliberately narrower than a mini-MMO architecture plan. Its job is to turn the qualified shared-world substrate into something a friend can enter and use naturally, then earn the next larger product decision from real two-human evidence.

## 1. Owner evidence that activates this phase

Current Owner judgement on the exact remotely-qualified v7 Yard:

- short startup hitch of about one second after entering, then normal smooth behavior; not currently a blocker;
- camera zoom range and vertical orbit direction are satisfactory for this stage;
- tower / barricade / impulse-line pushing and ramming have already been exercised many times and are now boring; do not keep asking the Owner to repeat the 12-prop toy;
- explicit missing capability: **jump**;
- explicit missing quality: **better multiplayer**;
- explicit friction: **simpler entry for friends**;
- after this friend-ready bridge, begin preparing a more serious small cooperative mini-MMO / living-world direction.

Therefore Shared Yard V0 is considered **complete as the first world/product falsifier**. It remains a qualified control, not a product to polish indefinitely.

## 2. Current live control and candidate

Qualified control/product source:

`world-v0-playable-frontier@1699fb71b3abef425aea6e21cdb81cb7d11250d5`

Remote delivery control:

`world-v0-staging-delivery@d6e9d47d72aeac34bc6341a76ebdf7e53ff6522f`

Frozen foundation:

`world-v0-shared-yard@b27de8b04c27777250c47e7e936674e0f147fdfa`

Friend-ready UX/session candidate:

`world-v0-friend-ready-v1`

The friend-ready candidate starts exactly from the qualified playable head and must remain non-simulation-changing until explicitly closed.

## 3. Support-research conclusions

### 3.1 The current `run` already behaves like a logical room identity

The Worker maps a sanitized `run` key to a named `SharedYardV0` Durable Object. Cloudflare's recommended Durable Object model treats a room as a natural coordination atom: one room identifier maps to one Durable Object instance.

The current authority already supports sequential fresh physical epochs under the same logical run:

`same run / same named DO → fresh WorldEpoch E1 → epoch ends → Box3D world destroyed → same run can create fresh WorldEpoch E2`

Therefore the first friend-ready step does **not** require a new room coordinator, persistence layer or new Durable Object class.

### 3.2 True always-open room semantics are still larger than this phase

Current `SharedYardV0` deliberately pins any live Box3D epoch with `setInterval` because it has no hibernation reconstruction contract. Cloudflare documents that scheduled callbacks such as `setTimeout`/`setInterval` prevent Durable Object hibernation, and an idle-but-non-hibernateable object can continue accruing duration.

Consequences:

- do not implement an indefinite always-open waiting room by simply auto-reconnecting one survivor forever;
- do not introduce hibernation reconstruction merely to remove current friend-entry friction;
- RCP0 must have a **bounded standby/retry policy**;
- a real hibernatable lobby / persistent room shell remains a later architecture question only if long-idle room continuity becomes valuable in actual use.

### 3.3 Invite identity should stop looking like testbench state

The current browser exposes both `Callsign` and raw `Run`. A new run is generated using a short `Math.random()` base36 value.

For friend invites, the room key is no longer just a visible lab selector. Generate the default key with Web Crypto (`crypto.getRandomValues`) so accidental collisions/guessability are not determined by a six-character `Math.random()` suffix. This is still **not authentication** and must not be described as a secure private room capability.

The current server run pattern allows at most 20 characters, so use a compact URL-safe key that fits the existing contract rather than changing the authority contract in FR-A.

### 3.4 Jump is a real simulation feature and must remain separate

Jump changes vertical state, inputs and prediction/replay behavior. It must not be hidden inside onboarding/session work.

Box3D exposes contact events and ray/shape casts, so grounded/support semantics can be based on actual world geometry rather than a fragile `position.y` threshold. Exact method selection must be proven in a dedicated jump preflight because the JavaScript binding surface and determinism/performance need to be verified on both authority and browser simulation paths.

## 4. Phase objective

The phase succeeds when the normal experience becomes:

1. Owner opens the world and enters without understanding a run key;
2. Owner chooses **Invite friend** and sends one link;
3. friend opens the link, supplies/uses a name and presses one obvious join action;
4. both inhabit the same Shared Yard using the already-qualified physical truth model;
5. normal peer departure does not turn the page into a dead-end ceremony;
6. the same logical invite can be used to start a fresh physical epoch again within a bounded continuity window;
7. jump exists as a separately qualified embodied capability;
8. the resulting candidate receives a genuine two-human/two-device friend-play session.

It does **not** need accounts, matchmaking, persistent world state, join-in-progress, inventory, economy, combat or MMO backend infrastructure.

## 5. Work decomposition

### FR-A — Friend Entry V1

**Question:** Can a friend enter without understanding the laboratory?

Allowed blast radius:

- `public/world-v0/**`;
- dedicated friend-entry/session tests;
- branch-specific qualification workflow.

Forbidden in this stage:

- `src/world-v0-shared-yard.ts`;
- `src/world-v0-contract.ts`;
- `src/world-v0-protocol.ts`;
- Box3D/runtime/dependency changes;
- Wrangler/DO binding changes.

Target UX:

- remove raw `Run` from the normal path; retain it only as optional advanced/debug information if still useful;
- host gets one primary `Enter world` action and then one `Invite friend` action;
- invite URL carries the room key automatically;
- invitee sees an explicit friend/join state rather than a generic laboratory run form;
- stored callsign may prefill; otherwise friend chooses a name and joins;
- no extra room-code copy/paste step;
- preserve `Inspect solo` as an Owner/dev path without presenting it as normal friend onboarding;
- replace default `Math.random()` room key generation with compact Web Crypto generation that fits `RUN_KEY_PATTERN`.

Evidence:

- DOM/interaction falsifier for host and invitee entry states;
- exact invite URL propagation;
- no raw run requirement on normal path;
- existing camera/controller/desktop/portrait shell unchanged;
- existing authority identity + exact-state still pass.

Natural stop:

A non-technical friend can plausibly enter from one link without explanation of `Run`.

### FR-B — Room Continuity Probe RCP0

**Question:** Does preserving room intent across clean epoch endings materially reduce multiplayer/session friction without requiring persistence architecture?

Implementation preference:

- client-lifecycle change first;
- same run / same logical WorldId;
- every new round still gets a fresh `WorldEpoch`;
- no physical state survives;
- no join-in-progress;
- no server persistence;
- no automatic recovery from correctness/identity/runtime failures.

Normal clean path:

`live epoch → peer leaves → world_v0_epoch_ended(peer_left...) → sockets close → survivor automatically returns to waiting on same run → friend reuses same invite → fresh epoch starts`

Fail-closed distinction:

- clean peer departure may re-arm room intent;
- authority failure, identity mismatch, non-finite failure, input lease failure or unknown terminal reason must remain terminal/visible and must **not** silently auto-rejoin;
- transport retry must be bounded with backoff and a visible terminal state;
- do not create an infinite reconnect loop.

Bounded idle policy:

- do not leave a pinned one-player Box3D epoch alive forever;
- first candidate should use a finite standby window and preserve a visible/manual `Reopen room` action after expiry;
- exact duration is a product parameter, not a platform claim; choose a modest initial window for testability and revise from friend-play evidence.

Required falsifiers:

- clean peer leave → survivor re-waits same run;
- new `WorldEpoch` is mandatory;
- friend can return through the old invite and start the fresh epoch;
- repeated cycles do not leak client history/prediction state;
- simultaneous dual re-entry is bounded and does not create two competing logical rooms;
- correctness failure does not auto-rejoin;
- bounded retry/standby expires visibly;
- `Inspect solo` does not accidentally become an infinite auto-loop;
- retained session evidence preserves the cross-epoch story.

Natural stop:

Owner can leave one page open, a friend can drop/rejoin during a short session, and the flow feels like one room intent rather than repeated manual lab rounds — without claiming persistence.

### FR-C — Remote Friend-Ready qualification

FR-A + FR-B are promoted only after branch qualification.

Remote delivery must preserve the existing explicit promotion contract:

- exact product-source SHA;
- protected-byte equality;
- explicit isolated staging deploy;
- public provenance;
- authority + production isolation;
- presentation/lifecycle/shell;
- remote `Inspect solo`;
- remote two-Chromium exact-state.

Do not point the normal staging delivery at an unqualified friend-ready branch by hand. Promote one exact candidate SHA.

### J0 — Jump preflight (separate causal branch)

Starts only after FR-A/FR-B are stable enough that session UX is not moving underneath simulation work.

Branch must start from the exact selected friend-ready product source but becomes a new SimBuild candidate.

Research questions before implementation:

- what Box3D support/contact API is actually available and stable in `box3d.js@0.1.1`;
- whether contact-data or short downward cast gives the simplest deterministic support signal on both authority and browser worlds;
- how support on dynamic props should behave;
- coyote/buffer semantics: defer unless first feel test proves necessary;
- jump impulse/velocity and gravity interaction;
- scheduled input representation (`jump` edge/intent) and duplicate/replay safety;
- exact state/prediction/rollback effects;
- mobile input surface.

Minimum first contract:

- jump only when support is valid;
- no air-jump;
- vertical velocity remains solver-owned except for the explicit jump impulse/velocity change;
- identical support decision and jump application on authority/browser simulation;
- jump input is deterministic under replay and cannot be repeated accidentally by held/batched input;
- landing on static ground is required; dynamic-prop support may be included only if the preflight proves it cleanly.

Qualification:

- new explicit SimBuildId;
- deterministic jump unit/preflight falsifiers;
- local authority/browser exact-state;
- rollback across jump edge;
- contact with props while jumping;
- desktop + portrait controls;
- remote staging only after local causal qualification.

Natural stop:

Owner can jump naturally in the same shared-world model without introducing unexplained correction/artificiality.

### FR-D — Real friend-play gate

Only after friend-entry/session continuity and jump candidates are coherently combined through an exact qualified product candidate.

This is not QA. Two humans play naturally.

Observe:

- invite friction;
- time from received link to shared play;
- reconnect/drop/rejoin behavior;
- whether jump improves embodiment or merely adds a button;
- correction/artificiality under real human timing;
- cooperation/obstruction and spatial presence;
- what interaction is spontaneously attempted next;
- whether the world now feels worth expanding.

Natural stop:

The session produces concrete social/product evidence strong enough to choose the first mini-MMO preparation problem.

## 6. Mini-MMO bridge — what comes after Friend-Ready, not before

Do not interpret `mini-MMO` as permission to build MMO infrastructure now.

After FR-D, choose **one** first larger problem from real evidence. Candidate classes:

- third-player support (strong near-term falsifier because product intent is genuinely 2–3 players);
- logical-world persistence if players create something they care about losing;
- richer interaction verbs/items if players repeatedly try to pick up/use/carry things;
- larger authored place if navigation/exploration pressure appears;
- room/lobby hibernation architecture if long-idle continuity becomes valuable;
- join-in-progress only if entering an already-active world becomes an actual need;
- social identity/accounts only when repeated human use needs continuity beyond a shared invite.

The first mini-MMO architecture decision must be earned from FR-D, not chosen from genre convention.

## 7. Branch and workflow policy

### Qualified control stays fixed

Do not move:

`world-v0-playable-frontier@1699fb71...`

merely to make Friend-Ready work convenient. It remains the current qualified product control until a replacement candidate is fully qualified and deliberately promoted.

### `world-v0-friend-ready-v1`

Purpose:

- FR-A + FR-B only;
- presentation/session UX;
- frozen authority/protocol/SimBuild.

The branch-specific workflow must fail if frozen simulation/authority/dependency/config paths drift from the qualified playable control.

### Jump branch

Create only when J0 starts. Do not weaken the Friend-Ready frozen guard to let jump through. A simulation change deserves a different workflow/qualification contract.

### Impact Lab

`world-v0-playable-impact-lab-v0@33ddd527...` remains parked and unqualified. It is not part of Friend-Ready V1.

## 8. Validation economics

Keep the fresh-runner split discovered during the execution-substrate run:

- core/authority;
- presentation + lifecycle + shell;
- `Inspect solo`;
- exact-state.

Do not recombine browser-heavy Chromium/SwiftShader jobs.

For Friend-Ready UI/session work, exact-state remains valuable because client lifecycle changes can corrupt epoch/history boundaries even when SimBuild itself is frozen.

Do not create another generic validation framework. Add only friend-entry/RCP falsifiers required by the new product semantics.

## 9. Known risks / pre-mortem

### Risk: friend-ready becomes matchmaking/account work

Countermeasure: one shared invite link; no discovery service, account DB or lobby browser.

### Risk: RCP0 silently becomes persistence

Countermeasure: fresh `WorldEpoch` every round; physical state explicitly resets; no storage/reconstruction claim.

### Risk: indefinite waiting burns duration and forces hibernation architecture early

Countermeasure: bounded standby; later hibernatable lobby only if real usage earns it.

### Risk: auto-reconnect hides correctness failures

Countermeasure: clean-reason allowlist, fail-closed terminal reasons, bounded retry count/backoff.

### Risk: jump contaminates session/UX causal analysis

Countermeasure: separate branch and SimBuild candidate.

### Risk: jump is implemented as a ground-height hack

Countermeasure: support/contact preflight against actual Box3D geometry before final semantics.

### Risk: "mini-MMO" causes architecture gravity

Countermeasure: Friend-Ready friend-play chooses the next larger capability; genre name does not.

## 10. Immediate execution order

1. establish branch-specific Friend-Ready qualification workflow on the untouched `1699fb71...` baseline;
2. prove the new workflow itself passes before product changes;
3. implement FR-A Friend Entry V1;
4. qualify FR-A;
5. implement bounded FR-B RCP0;
6. qualify FR-B locally and then remotely through exact promotion provenance;
7. perform J0 support/jump preflight on a separate branch;
8. implement and qualify the smallest jump candidate;
9. build one exact integrated friend-ready + jump candidate;
10. real two-human/two-device friend-play;
11. synthesize evidence and select the first mini-MMO preparation problem.

This order may change only when new evidence gives a better causal ordering. The project must not continue a stage merely because the stage exists on this page.
