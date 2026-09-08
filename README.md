# Multi_World / Cloudflare Multiplayer Lab

Evidence-driven R&D laboratory for a small shared physical browser world.

The repository began as a sequence of Cloudflare multiplayer gates, but the active work has moved well beyond the old Gate 4A README boundary. The current research specimen is **World V0 / Shared Yard**: a two-player server-authoritative Box3D world used to study responsive embodiment, shared physical truth, scheduled input, exact state recovery and real browser lifecycle failures.

The project is **not** trying to build a generic multiplayer framework up front. Architecture is earned through bounded falsifiers and real runtime evidence.

## Canonical project state

Start here:

1. [`docs/MULTI_WORLD_PROJECT_SOUL.md`](docs/MULTI_WORLD_PROJECT_SOUL.md) — durable product/research purpose;
2. [`docs/MULTI_WORLD_CURRENT_STATE.md`](docs/MULTI_WORLD_CURRENT_STATE.md) — current qualified technical truth, non-claims and branch state;
3. [`docs/MULTI_WORLD_TAKEOVER_INDEX.md`](docs/MULTI_WORLD_TAKEOVER_INDEX.md) — minimal operational takeover path;
4. GitHub issue #8 — detailed evidence ledger and checkpoints.

Older grounding, takeover and experiment-specific documents are retained as provenance. They are not current authority when newer live evidence disagrees.

## Current qualified technical checkpoint

Branch:

`world-v0-closure-stabilization`

Qualified clean technical head:

`1a759f0bd7aefd70027b2ed1d85e5cc7987bc01b`

Runtime identity at that checkpoint:

- authority: `shared-yard-v0-authority-v9-prestart-live-start-gate`;
- simulation: `shared-yard-v0-sim-69ad9c7d0430a929`.

Final retained current-head validation:

- workflow run `34176613974`;
- result `completed / success`;
- artifact `10037571475`;
- artifact SHA-256 `3de29b79003fe747f0af2602357c446bf633f95fd26c7d33a922547787565c23`.

The live closure branch may be ahead of this SHA by documentation-only consolidation commits. Verify the diff before treating a later head as a new runtime qualification.

## What World V0 currently demonstrates

Within the qualified two-player envelope, the project has established:

- server-authoritative Box3D physical state;
- fixed `60 Hz / 4 substeps` simulation;
- scheduled canonical input and a 36-tick actor input lease;
- responsive local browser simulation with exact state guards;
- authority recording seeds for exact ActorSession state bootstrap/rebase;
- bounded same-WorldEpoch / same-ActorSession transport recovery;
- a 20 s authority lifecycle grace when every active transport disappears;
- a separate bounded two-player pre-start ambiguity grace;
- fail-closed pure one-player waiting-room loss;
- protocol start only when both ready ActorSessions also have live transports;
- retained real-Chromium recovery evidence, including 14 s single-target and 14.5 s dual hard-TCP-drop cases with zero exact-state guard mismatches.

The closure campaign found and repaired four real lifecycle/handshake defects. Exact evidence and non-claims are in `MULTI_WORLD_CURRENT_STATE.md` and issue #8 checkpoint `5577741764`.

## What is not claimed

Current evidence does **not** establish:

- cross-tab/new-tab ActorSession continuity;
- Durable Object process-loss reconstruction;
- persistent/open-room semantics;
- production/mobile radio handover behavior;
- remote Cloudflare qualification for the final v9 closure head;
- large-player-count multiplayer.

A 20 s authority grace is not a promise that every browser outage shorter than 20 s recovers end-to-end.

## Current work boundary

Ordinary feature development is temporarily frozen while repository state is consolidated.

`main` and the qualified closure branch have diverged since `d5758bf18b5ebd5fb7ce5a705d525c80d3bca5de`; live `main` at the 2026-09-08 audit was `401be09ccd09decf493e4fcf4bea784e841e6163` and contained its own 20 commits after the merge base.

Therefore the next step is **not** a blind merge and not a new gameplay feature. The independent `main` side must be classified before choosing a safe consolidation path.

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

The reusable World V0 closure validator is:

`.github/workflows/world-v0-closure-current-validation.yml`

## Historical gate record

The earlier deployment, WebSocket, shared-world game and Gate 4A experiments remain valuable controls and provenance. Their records under `docs/gates/`, older `WORLD_V0_*` / `WS0_*` documents and historical branches should be read when a specific question requires them, not as the default current-state narrative.

Multi_World's durable objective remains simple to state even as the implementation changes:

> Build toward a small shared physical living world where another person's actions feel like consequences in the same place, not merely synchronized coordinates.
