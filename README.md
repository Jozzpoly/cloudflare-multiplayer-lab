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

Canonical branch: `main`.

Qualified integrated **runtime/evidence** anchor:

`main@692ac8524c0bd056458658408f7d78d82237aab9`

Clean qualified R2 source:

`world-v0-jump-reliability-r2@1afe2428518c7c97fb96fef46f8a010eaaba3999`

Both have the same qualified product tree:

`b5f1608d2c090c984545be027cbe05a3dd8de69f`

Relevant runtime identity:

- contract: `shared-yard-v0-contract-v14-jump-delivery-persistence`;
- authority: `shared-yard-v0-authority-v11-jump-delivery-persistence`;
- browser sim: `shared-yard-v0-browser-sim-v10-jump-delivery-persistence`;
- browser UI: `shared-yard-v0-browser-ui-v19-jump-delivery-persistence`;
- simulation build: `shared-yard-v0-sim-cd8edc169f791a64`;
- session continuity: `world-v0-session-continuity-r2-slot-bound`.

Exact post-integration qualification on `main@692ac852...`:

- CI `34280426970` — **SUCCESS**;
- Session Continuity `34280426973` — **SUCCESS**, artifact `10077414930`, SHA-256 `eeea5b5a39f162372a6b61437a44465351ea8756a807dca9267e5f7794d190b2`;
- World V0 Current Validation `34280427073` — **SUCCESS**, artifact `10077571450`, SHA-256 `7d1389b9f391be5d02ac9a94853399e41568c6473c44638cb80d9c1b97e85463`.

Later documentation-only `main` commits do not become new runtime qualification automatically.

## What World V0 currently demonstrates

Within the qualified two-player envelope:

- server-authoritative Box3D physical state at fixed `60 Hz / 4 substeps`;
- scheduled canonical input and a 36-tick actor-local input lease;
- responsive local browser simulation with exact f32 state guards;
- authority recording seeds for exact ActorSession bootstrap/rebase;
- bounded same-WorldEpoch / same-ActorSession transport recovery;
- a 20 s authority grace when every active transport disappears;
- bounded two-player pre-start ambiguity recovery while pure one-player waiting-room loss stays fail-closed;
- protocol start only when both ready ActorSessions also have live transports;
- real-Chromium 14 s single-target and 14.5 s dual hard-TCP-drop recovery with zero state-guard mismatches;
- same-browser-profile close-tab/new-tab ActorSession continuity from both room list and exact Yard links;
- truthful connected/reserved room presence and slot-bound Resume authority;
- foreign/new browser profiles remain truthfully unable to resume;
- **acknowledgement-driven discrete jump delivery**: a press remains pending until authority canonically consumes `jump=true`, rather than depending on a fixed future-tick window.

The R2 causal falsifier forced ordered outbound transport degradation from `180 ms` to `45 ms`. The first press was first authored at tick `196` and not canonically delivered until tick `239` — a **43-tick span**, far beyond the retired six-tick R1 window — yet produced exactly one grounded jump. A second airborne press was canonically delivered with `jumpApplied=false` and did not become a delayed landing impulse. Exact state-guard mismatches remained `0`.

Latest technical checkpoint in issue #8: `5592166219`.

## What is not claimed

Current evidence does **not** establish:

- account/cloud or cross-device session persistence;
- Durable Object process-loss reconstruction of the same WorldEpoch;
- persistent/continuously open rooms or lobby/membership architecture;
- arbitrary player churn or large-player-count multiplayer;
- production/mobile radio handover behavior;
- new remote Cloudflare qualification for the R2 head;
- guaranteed jump delivery through arbitrary permanent network failure;
- coyote time, landing input buffering or broader support/contact forgiveness.

A 20 s authority grace is not a promise that every browser outage shorter than 20 seconds recovers end-to-end.

## Current work boundary

**R2 Jump Reliability is integrated and post-merge qualified.** The demonstrated temporal transport-loss mechanism that could erase a jump press is closed without widening gameplay support semantics.

The reliability campaign should now stop unless new evidence falsifies the integrated contract. The next substantial move should begin with **product-frontier re-grounding**: recover current Owner play/product evidence, challenge inherited priorities, then choose the smallest product-facing experiment that answers the most important current question.

Do not automatically jump into persistence, lobby/membership architecture, 3-player work, arbitrary content or broad refactors.

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

Retained R2 causal regression:

- `scripts/world-v0-jump-delivery-persistence-audit.mjs`.

## Historical record

Earlier deployment, WebSocket, shared-world game, Gate 4A, closure, R1 and grounding work remains valuable provenance. Read older `WORLD_V0_*`, `WS0_*`, gate documents and historical branches only when a specific question needs them; they are not the default current-state narrative.

Multi_World's durable objective remains:

> Build toward a small shared physical living world where another person's actions feel like consequences in the same place, not merely synchronized coordinates.
