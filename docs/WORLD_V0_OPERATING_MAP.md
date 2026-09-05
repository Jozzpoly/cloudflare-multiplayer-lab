# World V0 Operating Map

Verified snapshot: **2026-09-05**

This file is the short operational entry point for current World V0 work. It is not a replacement for historical evidence, qualification records or research notes.

## Source-of-truth rule

For current work, verify the live head of the relevant active branch before acting. The exact SHAs below are the verified snapshot at the time this map was written; branch heads may advance later.

Priority:

1. **Owner hands-on judgement** for feel, usability, fun and product direction;
2. **live active branch head + its passing evidence** for implementation truth;
3. **qualified frozen specimens** for regression/control truth;
4. current operating docs such as this map;
5. older Gate / WS0 / RC / takeover documents as historical evidence and provenance.

Do not infer the current execution plan from an old branch name or an old handoff document alone.

`main` is currently the navigation / repository-entry branch. It is **not** the live product runtime branch and should not be used as a shortcut for merging the active lanes together.

## Active spine

| Role | Branch | Verified head | Meaning |
| --- | --- | --- | --- |
| Frozen foundation control | `world-v0-shared-yard` | `b27de8b04c27777250c47e7e936674e0f147fdfa` | Qualified Shared Yard V0 control specimen. Keep untouched unless new evidence explicitly reopens the foundation. |
| Product / playable frontier | `world-v0-playable-frontier` | `1699fb71b3abef425aea6e21cdb81cb7d11250d5` | Current browser product surface. UI v7 includes real-authority `Inspect solo`; dependency graph is committed and browser qualification is isolated by evidence class. |
| Explicit isolated staging delivery | `world-v0-staging-delivery` | `d6e9d47d72aeac34bc6341a76ebdf7e53ff6522f` | Explicit promotion/deploy lane for the qualified playable candidate, with exact product provenance. |
| Stress / capacity research | `world-v0-capacity-cartography` | `d086f51792795d1ab73ba43f9e3b4dbf97441bb7` | Isolated Stress × Play / capacity research lane. Does not redefine the qualified foundation. |

### Frozen simulation identity

Current playable UI revision:

`shared-yard-v0-browser-ui-v7-solo-inspection`

Current qualified/frozen SimBuild:

`shared-yard-v0-sim-579c7aa172198390`

UI/presentation, delivery and CI-apparatus work must not silently mutate the frozen simulation identity. A future deliberate simulation change requires its own causal validation.

## Current qualification checkpoints

### Playable frontier

Qualified playable head:

`world-v0-playable-frontier@1699fb71b3abef425aea6e21cdb81cb7d11250d5`

Qualification run:

**`33957370821` — PASS**

The passing run separates evidence classes onto fresh hosted runners:

- core contract / repository regression / authority;
- presentation + lifecycle + desktop/portrait shell;
- real-authority `Inspect solo`;
- two-Chromium exact-state when causal scope requires it.

This split is evidence-driven. Two earlier exact-state attempts on a monolithic browser-heavy job timed out with no state mismatch, no pending guards, no remap failure and no runtime failure, while frame timing showed severe hosted SwiftShader starvation. A bounded A/B control then showed both the old no-lock specimen and the new locked specimen PASS when exact-state ran on a fresh minimal runner. A later monolithic run also starved at `Inspect solo`, confirming cumulative browser-runner pressure rather than a dependency-semantic regression.

Do not recombine the heavy Chromium/SwiftShader qualification classes into one long hosted job merely for cosmetic simplicity. New evidence may justify changing this later.

### Dependency graph

The playable product now carries a committed `package-lock.json` generated from the exact package manifest and independently replayed from a fresh checkout.

The active playable workflow installs the qualified dependency graph with:

`npm ci`

The lockfile itself is part of the causal runtime path, so changes to it require the appropriate qualification envelope.

## Public staging

Current isolated staging surface:

`https://cloudflare-multiplayer-lab-staging.jozzpoly.workers.dev/world-v0/`

Current delivery head:

`world-v0-staging-delivery@d6e9d47d72aeac34bc6341a76ebdf7e53ff6522f`

The delivery lane pins its product source explicitly:

`world-v0-playable-frontier@1699fb71b3abef425aea6e21cdb81cb7d11250d5`

The source pointer is stored in:

`.github/world-v0-product-source.json`

Before deployment, the workflow mechanically proves that protected product/runtime paths match the pinned playable SHA. It then generates and deploys:

`/world-v0/deploy-provenance.json`

The public provenance records product source branch/SHA, delivery branch/SHA, workflow run identity and the frozen UI/client/server/protocol/state-guard/SimBuild identities. The workflow requires that exact provenance to become publicly visible before remote qualification continues.

Current staging delivery run:

**`33957492089` — PASS on attempt 1**

It proved:

1. exact delivery source identity;
2. exact promoted-product protected bytes;
3. staging target cannot alias production;
4. staging deployment credential/authentication;
5. explicit `wrangler deploy --env staging`;
6. exact public product provenance + UI + SimBuild;
7. remote authority and production isolation;
8. remote camera/controller interaction, lifecycle and desktop/portrait shell;
9. remote real-authority `Inspect solo`;
10. remote two-Chromium exact-state on attempt 1, with no starvation retry required.

The staging delivery lane does not rely on a vague Connected Build assumption.

## Inspect solo

`Inspect solo` exists to reduce Owner friction when a second physical device is unnecessary for the question being asked.

It is **not** an offline sandbox and it is **not** a special single-player authority mode.

Flow:

- the normal human browser client joins the real Shared Yard as slot 0;
- only after the normal authority reports `waitingForPeer=true`, a lightweight AUTO WebSocket companion claims slot 1;
- the AUTO peer uses the existing public ready/input protocol;
- it maintains deterministic scheduled `{x:0,z:0}` input from authority boundary ticks;
- the same real Durable Object, epoch, simulation, state guards and rollback/prediction machinery remain active.

Inspection evidence is explicitly marked:

- `mode = inspection`
- `qualificationEligible = false`

Therefore `Inspect solo` is excellent for ordinary Owner inspection, camera/control work, scene experimentation and many gameplay tests, but it must **never** be presented as two-human / two-device multiplayer qualification evidence.

## Workflow spine

### Product frontier

Workflow:

`.github/workflows/world-v0-playable-a1.yml`

Purpose:

- committed dependency graph via `npm ci`;
- frozen authority/simulation contract guard;
- control-math falsifiers;
- `Inspect solo` planner falsifier;
- exact-failure classifier falsifier;
- full repository regression suite;
- local Workerd authority check;
- fresh-runner presentation/lifecycle/shell qualification;
- fresh-runner `Inspect solo` browser qualification;
- fresh-runner causal-scope-aware exact-state qualification.

Exact-state is required when a causal runtime path changes, including the World V0 public runtime, authority/protocol path, core Box3D runtime/dependencies or the exact-state apparatus itself. Documentation/process-only changes may intentionally reuse the last qualified exact-state envelope.

An explicit `[runtime-qualify]` commit marker forces exact-state qualification.

### Staging delivery

Workflow:

`.github/workflows/world-v0-playable-staging-remote.yml`

Purpose:

- exact product-source pointer;
- mechanical protected-byte promotion guard;
- explicit staging-only deploy;
- public machine-readable deployment provenance;
- authority + production isolation;
- presentation, lifecycle and shell;
- remote `Inspect solo`;
- remote two-Chromium exact-state.

Hosted SwiftShader starvation is not silently treated as a correctness failure or success. A versioned classifier permits at most one same-SHA retry only when the failed exact-state attempt is a qualification timeout with clean evidence on both clients: no runtime failure, state mismatch, pending guard, remap failure or rejected input. Any correctness signal fails closed immediately. Thresholds are not weakened for CI convenience.

### Stress / capacity lane

The active research program lives on `world-v0-capacity-cartography`.

Primary program document on that branch:

`docs/WORLD_V0_STRESS_PLAY_PROGRAM.md`

Coordination/evidence issue: **#33 — World V0 Stress × Play**.

The program deliberately connects laboratory stress with play:

`instrumented phenomenon → measured boundary → playable translation → Owner chaos → anomaly/fun extraction → deterministic reproduction → stronger instrumented phenomenon`

Stress results do not automatically become product or foundation claims.

## Qualification classes

Keep these evidence classes separate:

- **foundation qualification** — proves the frozen Shared Yard control envelope;
- **playable-frontier qualification** — proves current product/browser changes preserve the relevant contract;
- **remote staging qualification** — proves the exact promoted candidate is actually deployed and behaves correctly on the isolated public Worker;
- **Owner inspection / feel judgement** — answers subjective product questions and may use `Inspect solo`;
- **real two-human / two-device testing** — required when social presence, physical-device behavior, human timing or true peer interaction is the question;
- **Stress × Play research** — probes boundaries and generates new phenomena/evidence without redefining the control specimen by itself.

A PASS in one class must not be silently upgraded into another class.

## PR #32

PR #32 remains **DRAFT / DO NOT MERGE**.

Its head remains the qualified foundation control branch. Product, delivery and stress lanes deliberately live outside it. Do not merge it merely because newer product work is healthy.

## Historical evidence policy

Branches/documents with names such as:

- `gate-*`
- `ws0-*`
- `rc*`
- `world-slice-*`
- old `world-v0-staging-*` experiments
- old takeover / grounding generations

are primarily **historical evidence and provenance**, unless a current operating document explicitly reactivates one.

Do not delete history simply because it is old. Conversely, do not treat every preserved branch as an active frontier.

### Branch hygiene categories

Use three categories during cleanup:

- **ACTIVE** — one of the current execution lanes or a deliberately active bounded experiment;
- **HISTORICAL EVIDENCE** — useful provenance/closed experiment; preserve unless deliberately archived elsewhere;
- **CLEANUP CANDIDATE** — accidental/test/helper branch or a fully superseded duplicate whose unique commits/evidence have been checked for reachability first.

Technical A/B/probe branches created while diagnosing CI or dependency behavior are cleanup candidates only after their result has been preserved elsewhere and their unique evidence has been checked. Do **not** delete them merely because the active lane is healthy.

## Default working loop

For product/runtime work:

1. verify `world-v0-playable-frontier` live head;
2. identify the actual uncertainty / causal blast radius;
3. make the smallest justified change on an isolated branch when appropriate;
4. validate with the frontier gate;
5. preserve Owner judgement where the question is subjective;
6. promote the exact qualified candidate into `world-v0-staging-delivery` through its explicit product-source pointer;
7. require explicit staging deploy + public provenance + remote gates before calling it remotely qualified.

For foundation questions, start from the frozen control instead of the playable frontier.

For capacity/chaos questions, work on the isolated Stress × Play lane instead of adding hidden stress modes to the qualified Shared Yard.

## Fast takeover

A fresh Browser GPT / Codex session should normally be able to start with:

1. read this file;
2. verify the four active branch heads live;
3. check the latest relevant workflow/evidence result;
4. preserve `world-v0-shared-yard@b27de8b...` as the control unless new evidence contradicts it;
5. continue on the lane appropriate to the actual question.

Do not repeat the full historical grounding unless live evidence conflicts with this operating map or the task genuinely depends on older provenance.

## Current next work

The execution substrate is now good enough that **more CI/tooling work is not the default frontier**.

Highest-value next work should return to the world/product:

- use the remotely qualified Yard in hands-on play;
- run real two-human / two-device friend-play when the question depends on genuine peer timing, social presence or physical interaction;
- use `Inspect solo` for cheap iteration when a second human is not materially part of the question;
- let hands-on friction/fun determine whether the next product move is Yard refinement, greater physical richness, a Stress × Play translation, or a new bounded experiment;
- only reopen execution infrastructure when concrete friction or evidence justifies it.

Branch/workflow/document cleanup may continue opportunistically, but it must reduce ambiguity without destroying historical evidence and must not displace higher-value product learning.
