# World V0 Operating Map

Verified snapshot: **2026-09-05**

This is the short operational entry point for current Multi_World / World V0 work. It is intentionally smaller than the historical evidence base.

## Source-of-truth rule

For current work:

1. **Owner hands-on judgement** — feel, usability, fun, product direction;
2. **live branch head + its passing evidence** — implementation truth;
3. **qualified frozen specimens** — regression/control truth;
4. **this map + current phase plan** — execution sequencing;
5. older Gate / WS0 / RC / takeover documents — historical evidence/provenance.

Verify live branch heads before acting. Stored SHAs are grounded snapshots, not permanent aliases.

`main` is a navigation/documentation branch, not the live product runtime branch.

## Active spine

| Role | Branch | Verified head | Meaning |
| --- | --- | --- | --- |
| Frozen foundation control | `world-v0-shared-yard` | `b27de8b04c27777250c47e7e936674e0f147fdfa` | Qualified Shared Yard foundation control. Do not casually move. |
| Qualified product control | `world-v0-playable-frontier` | `1699fb71b3abef425aea6e21cdb81cb7d11250d5` | Current machine-qualified v7 Yard, retained as control while Friend-Ready work proceeds. |
| Remote delivery control | `world-v0-staging-delivery` | `d6e9d47d72aeac34bc6341a76ebdf7e53ff6522f` | Exact remotely-qualified delivery of `1699fb71...`. |
| **Active product candidate** | `world-v0-friend-ready-v1` | starts at `1699fb71b3abef425aea6e21cdb81cb7d11250d5` | Friend entry + bounded room-continuity work only; frozen SimBuild/authority/protocol. |
| Stress / capacity research | `world-v0-capacity-cartography` | `d086f51792795d1ab73ba43f9e3b4dbf97441bb7` | Isolated Stress × Play research lane. Not current product frontier. |

Parked hypothesis:

`world-v0-playable-impact-lab-v0@33ddd527051bd71e4bde236948cb1c96b9a34a6b`

Do not continue or promote Impact Lab by momentum.

## Current phase: Friend-Ready World V1

Canonical plan:

`docs/WORLD_V0_FRIEND_READY_V1_PLAN.md`

The post-Owner audit that led here remains important context:

`docs/WORLD_V0_POST_OWNER_REVIEW_2026-09-05.md`

### Owner R1 closure

Fresh Owner hands-on on the exact qualified v7 Yard established:

- startup has a short ~1 s hitch, then behaves normally; not currently a blocker;
- camera zoom range and vertical orbit direction are accepted for this stage;
- the existing tower / barricade / impulse-lane interactions work but have been exercised enough and are now boring;
- do **not** ask the Owner to keep repeating the same 12-prop Yard tests;
- explicit missing capability: **jump**;
- explicit missing product quality: **better multiplayer**;
- explicit friction: **simpler friend entry**;
- after this bridge, prepare toward a more serious small cooperative mini-MMO / living-world direction.

Therefore Shared Yard V0 is complete as the first world/product falsifier. It stays useful as qualified control, but it is no longer the thing to polish indefinitely.

## Friend-Ready sequencing

### FR-A — Friend Entry V1

On `world-v0-friend-ready-v1`:

- hide raw `Run` from normal onboarding;
- host enters normally and gets one clear `Invite friend` action;
- invite URL carries room identity automatically;
- invitee sees a simple join flow, not a lab run form;
- retain advanced/debug room information only if useful;
- replace short `Math.random()` default run generation with compact Web Crypto randomness that still fits the existing server run-key contract;
- keep `Inspect solo` as an Owner/dev path, not normal friend onboarding.

This stage must not change authority/protocol/SimBuild.

### FR-B — bounded Room Continuity Probe RCP0

Use current semantics before inventing a new room backend:

`same run / logical WorldId → fresh epoch → clean end → same run → fresh new epoch`

Target clean lifecycle:

`peer leaves normally → survivor automatically returns to waiting on same run → old invite remains useful → friend returns → new WorldEpoch starts`

Boundary:

- no physical persistence;
- no join-in-progress;
- no server storage/reconstruction claim;
- no auto-rejoin after correctness/identity/authority failures;
- bounded retries/backoff;
- bounded standby rather than an indefinitely pinned one-player Box3D epoch.

Why bounded: current authority pins a live epoch with `setInterval` and has no hibernation reconstruction contract. Long-idle always-open room semantics are a later architecture question, not an excuse to build them now.

### J0 — jump, separate causal candidate

Do **not** weaken the Friend-Ready frozen guard to add jump.

Jump changes simulation and input/replay semantics. It gets a separate branch/new SimBuild candidate after FR-A/FR-B stabilize.

First preflight actual support detection in the `box3d.js@0.1.1` binding. Prefer real contact/support or bounded downward cast semantics over a `position.y` ground hack.

Minimum requirement:

- grounded-only jump;
- deterministic edge/intent representation;
- authority and browser apply identical semantics;
- replay/correction cannot duplicate the jump;
- landing/prop-contact exact-state remains coherent;
- desktop and mobile input surfaces both exist.

### FR-D — real friend-play

Only after friend entry, bounded continuity and jump are coherently qualified.

This is natural play, not a QA checklist. The result chooses the first mini-MMO preparation problem.

## Mini-MMO bridge after Friend-Ready

`mini-MMO` is a product direction, not permission to build generic MMO infrastructure.

After real friend-play, select exactly one earned larger capability. Likely candidate classes:

- third-player support;
- logical-world persistence if players create something worth preserving;
- richer interaction verbs/items if players repeatedly try to pick up/use/carry things;
- larger authored place if exploration pressure appears;
- hibernatable room/lobby architecture if long-idle continuity proves valuable;
- join-in-progress if entering an already active world becomes an actual need;
- social identity/accounts only when repeated human use needs continuity beyond a shared link.

Do not choose one from genre convention before friend-play evidence.

## Frozen simulation identity

Qualified UI revision:

`shared-yard-v0-browser-ui-v7-solo-inspection`

Qualified/frozen SimBuild:

`shared-yard-v0-sim-579c7aa172198390`

Friend-Ready FR-A/FR-B must keep:

- server revision `shared-yard-v0-authority-v1`;
- protocol revision `shared-yard-v0-scheduled-input-v1`;
- state guard `shared-yard-v0-f32-state-v1`;
- client simulation `shared-yard-v0-browser-sim-v1`;
- frozen SimBuild above.

A future jump candidate deliberately changes simulation identity and needs its own qualification contract.

## Current qualification controls

Qualified playable:

`world-v0-playable-frontier@1699fb71b3abef425aea6e21cdb81cb7d11250d5`

Run **`33957370821` — PASS** across fresh-runner evidence classes:

- core/authority;
- presentation + lifecycle + shell;
- real-authority `Inspect solo`;
- two-Chromium exact-state.

Remote delivery:

`world-v0-staging-delivery@d6e9d47d72aeac34bc6341a76ebdf7e53ff6522f`

Run **`33957492089` — PASS on attempt 1** including:

- exact promoted-product bytes;
- explicit staging deploy and public provenance;
- authority + production isolation;
- presentation/lifecycle/shell;
- remote `Inspect solo`;
- remote two-Chromium exact-state.

Public staging control:

`https://cloudflare-multiplayer-lab-staging.jozzpoly.workers.dev/world-v0/`

Staging source pointer remains:

`.github/world-v0-product-source.json`

Do not repoint staging to a Friend-Ready candidate before that candidate passes its branch qualification.

## `Inspect solo`

`Inspect solo` is a cheap Owner/dev inspection path using the real authority and a neutral AUTO peer.

It remains explicitly:

- `mode = inspection`;
- `qualificationEligible = false`.

It is useful for camera/control/UI/session iteration but never substitutes for real two-human evidence when social presence or peer timing is the question.

## Workflow policy

### Qualified playable workflow

`.github/workflows/world-v0-playable-a1.yml`

Keep the current fresh-runner split. Do not recombine heavy Chromium/SwiftShader jobs.

### Friend-Ready workflow

`world-v0-friend-ready-v1` gets its own branch-specific qualification workflow.

Its purpose is to:

- prove the branch still has the exact qualified dependency graph;
- fail if authority/simulation/protocol/Worker config drifts from `1699fb71...`;
- run repository regression and authority smoke;
- run friend-entry/session/presentation/shell falsifiers;
- run `Inspect solo` on a fresh runner;
- run two-Chromium exact-state on a fresh runner.

Do not turn this into a generic new validation framework. Add only Friend-Ready-specific falsifiers required by FR-A/FR-B semantics.

### Jump workflow

Not yet created. It must be separate because the Friend-Ready workflow intentionally prohibits simulation drift.

### Staging delivery workflow

`.github/workflows/world-v0-playable-staging-remote.yml`

Retain exact source SHA, protected-byte guard, explicit staging deploy and public provenance. A Friend-Ready candidate becomes remote-qualified only after exact promotion through this mechanism.

## Stress × Play status

Issue #33 remains the research coordination ledger.

Important review correction:

- SP1 rollback/history boundary search remains incomplete;
- SP1B allocation/preallocation evidence remains useful but does not justify a product policy change;
- `world-v0-capacity-sp1c-ram-shock@306e4cbe...` is exploratory causal-amplifier / SP5-preflight evidence, not completion of SP1;
- Stress × Play resumes when product evidence asks a concrete question, not by stage momentum.

## PR #32

PR #32 remains **DRAFT / DO NOT MERGE** and represents the frozen foundation-control line, not the current product frontier.

## Branch hygiene

Use:

- **ACTIVE** — current execution lane or deliberately active bounded experiment;
- **HISTORICAL EVIDENCE** — preserved closed evidence;
- **CLEANUP CANDIDATE** — helper/probe branch whose unique evidence has already been preserved and checked.

Do not perform broad branch deletion during Friend-Ready product work.

## Fast takeover

A fresh Browser GPT / Codex session should normally:

1. read this file;
2. read `docs/WORLD_V0_FRIEND_READY_V1_PLAN.md`;
3. read `docs/WORLD_V0_POST_OWNER_REVIEW_2026-09-05.md` only when the reasoning behind the phase boundary is needed;
4. verify live heads for foundation, playable control, staging, Friend-Ready and Stress lane;
5. inspect latest relevant workflow/evidence;
6. continue the smallest current Friend-Ready stage without reopening completed Yard testing.

Do not repeat full historical grounding unless live evidence conflicts with this map.

## Immediate next work

1. establish and baseline-pass the branch-specific Friend-Ready qualification workflow on untouched `1699fb71...`;
2. implement **FR-A Friend Entry V1**;
3. qualify it;
4. implement **FR-B bounded RCP0**;
5. qualify locally and remotely;
6. prepare **J0 jump** on a separate simulation branch;
7. integrate only qualified candidates;
8. run real two-human/two-device friend-play;
9. use that evidence to select the first serious mini-MMO preparation problem.

The plan may change when new evidence gives a better causal ordering. Do not continue a stage merely because it is listed here.
