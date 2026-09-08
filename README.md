# Multi_World / Cloudflare Multiplayer Lab

Evidence-driven R&D laboratory for a small shared physical browser world.

The current research specimen is **World V0 / Shared Yard**: a two-player server-authoritative Box3D world used to study responsive embodiment, shared physical truth, scheduled input, exact recovery and real browser lifecycle failures.

The project is **not** trying to build a generic multiplayer framework up front. Architecture is earned through bounded falsifiers, causal repairs and real runtime evidence.

## Canonical project state

Start here:

1. [`docs/MULTI_WORLD_PROJECT_SOUL.md`](docs/MULTI_WORLD_PROJECT_SOUL.md) — durable product/research purpose;
2. [`docs/MULTI_WORLD_CURRENT_STATE.md`](docs/MULTI_WORLD_CURRENT_STATE.md) — current qualified technical truth and nonclaims;
3. [`docs/MULTI_WORLD_TAKEOVER_INDEX.md`](docs/MULTI_WORLD_TAKEOVER_INDEX.md) — minimal operational takeover path;
4. GitHub issue #8 — detailed evidence ledger and checkpoints.

Older grounding, takeover and experiment-specific documents are provenance. Newer live evidence wins.

## Current qualified anchor

Canonical branch:

`main`

Qualified integrated product/evidence anchor:

`main@72f971cff84f991f994df1b821f656941c0cd8eb`

R1 qualified parent:

`world-v0-session-continuity-r1-exec@c5b071fa15dff403ba82891e21f36fd36c4ac791`

PR #39 merged the exact qualified tree into `main`. The merge tree `c57ab4a7c90aebd5101ae09e973481fb80e8243b` is identical to the pre-merge qualified R1 tree.

Relevant runtime identity:

- authority: `shared-yard-v0-authority-v9-prestart-live-start-gate`;
- browser UI: `shared-yard-v0-browser-ui-v17-slot-bound-session-continuity`;
- simulation: `shared-yard-v0-sim-69ad9c7d0430a929`;
- session continuity: `world-v0-session-continuity-r2-slot-bound`.

Post-merge exact-main validation:

- CI `34264320221` — **SUCCESS**;
- Session Continuity Validation `34264320224` — **SUCCESS**, artifact `10071208496`, SHA-256 `218cc61c43d6b6eb34ddbc71824651cde975a91b090c881dfc963bb388b1032b`;
- World V0 Current Validation `34264320312` — **SUCCESS**, artifact `10071385727`, SHA-256 `014c4467103a4baf71756d2bcd2d8c086ba4ad032faa638d258d9c02873cbf28`.

Later documentation-only `main` commits do not become new runtime qualification automatically.

## What World V0 currently demonstrates

Within the qualified two-player envelope:

- server-authoritative Box3D physical state;
- fixed `60 Hz / 4 substeps` simulation;
- scheduled canonical input and a 36-tick actor-local input lease;
- responsive local browser simulation with exact f32 state guards;
- authority recording seeds for exact ActorSession bootstrap/rebase;
- bounded same-WorldEpoch / same-ActorSession transport recovery;
- a 20 s authority grace when every active transport disappears;
- bounded two-player pre-start ambiguity recovery while pure one-player waiting-room loss stays fail-closed;
- protocol start only when both ready ActorSessions also have live transports;
- real-Chromium 14 s single-target and 14.5 s dual hard-TCP-drop recovery with zero state-guard mismatches;
- **same-browser-profile close-tab/new-tab ActorSession continuity** while the authoritative seat remains recoverable;
- recovery from both the room list and exact public Yard links;
- truthful connected/reserved room presence;
- slot-bound Resume: another player's reserved seat cannot authorize your own session;
- foreign/new browser profiles remain truthfully unable to resume.

R1 reconnect authority remains private browser-local state. The public directory exposes only anonymous reserved actor slots, not player IDs, ActorSession UUIDs or resume tokens.

Exact evidence is summarized in `MULTI_WORLD_CURRENT_STATE.md` and issue #8 checkpoint `5590133257`.

## What is not claimed

Current evidence does **not** establish:

- account/cloud or cross-device session persistence;
- Durable Object process-loss reconstruction of the same WorldEpoch;
- persistent/continuously open rooms or lobby/membership architecture;
- arbitrary player churn or large-player-count multiplayer;
- production/mobile radio handover behavior;
- new remote Cloudflare qualification for the R1 head.

A 20 s authority grace is not a promise that every browser outage shorter than 20 seconds recovers end-to-end.

## Current work boundary

R1 Session Continuity is integrated and post-merge qualified. The reliability foundation is strong enough that the next move should **not** be another outage variant by momentum.

The next substantial work should begin with **product-frontier re-grounding**: recover the latest relevant Owner play/product evidence, challenge old candidate priorities, then choose the smallest product-facing experiment that answers the most important current question.

Do not automatically jump into persistence, lobby/membership architecture, 3-player work, arbitrary content or broad refactors. Jump/content behavior was not part of R1 and remains a separate causal/product question rather than an inherited next phase.

## Validation

Use the exact dependency graph:

```bash
npm ci
npm run check
```

Local development:

```bash
npm ci
npm run dev
```

Reusable current gates:

- `.github/workflows/world-v0-session-continuity-r1-qualification.yml`;
- `.github/workflows/world-v0-current-validation.yml`.

## Historical record

Earlier deployment, WebSocket, shared-world game, Gate 4A, closure and grounding work remains valuable provenance. Read older `WORLD_V0_*`, `WS0_*`, gate documents and historical branches only when a specific question needs them; they are not the default current-state narrative.

Multi_World's durable objective remains:

> Build toward a small shared physical living world where another person's actions feel like consequences in the same place, not merely synchronized coordinates.
