# Multi_World / Cloudflare Multiplayer Lab

Evidence-driven R&D laboratory for a small shared physical browser world.

The repository began as a sequence of Cloudflare multiplayer gates, but the active work has moved well beyond the old Gate 4A boundary. The current research specimen is **World V0 / Shared Yard**: a two-player server-authoritative Box3D world used to study responsive embodiment, shared physical truth, scheduled input, exact state recovery and real browser lifecycle failures.

The project is **not** trying to build a generic multiplayer framework up front. Architecture is earned through bounded falsifiers and real runtime evidence.

## Canonical project state

Start here:

1. [`docs/MULTI_WORLD_PROJECT_SOUL.md`](docs/MULTI_WORLD_PROJECT_SOUL.md) — durable product/research purpose;
2. [`docs/MULTI_WORLD_CURRENT_STATE.md`](docs/MULTI_WORLD_CURRENT_STATE.md) — current qualified technical truth, non-claims and repository state;
3. [`docs/MULTI_WORLD_TAKEOVER_INDEX.md`](docs/MULTI_WORLD_TAKEOVER_INDEX.md) — minimal operational takeover path;
4. GitHub issue #8 — detailed evidence ledger and checkpoints.

Older grounding, takeover and experiment-specific documents are retained as provenance. They are not current authority when newer live evidence disagrees.

## Canonical repository / qualified runtime split

Canonical repository branch:

`main`

Closure/main consolidation merge checkpoint:

`66f40bb86a066658b15bbd45c7baea86d1bb2a44`

Qualified clean runtime/evidence checkpoint:

`world-v0-closure-stabilization@1a759f0bd7aefd70027b2ed1d85e5cc7987bc01b`

Runtime identity at that checkpoint:

- authority: `shared-yard-v0-authority-v9-prestart-live-start-gate`;
- simulation: `shared-yard-v0-sim-69ad9c7d0430a929`.

Final retained closure validation:

- workflow run `34176613974`;
- result `completed / success`;
- artifact `10037571475`;
- artifact SHA-256 `3de29b79003fe747f0af2602357c446bf633f95fd26c7d33a922547787565c23`.

Repository consolidation was separately validated through PR #38:

- PR CI `34177475444` — SUCCESS;
- F5 preflight `34177475333` — SUCCESS;
- post-merge `main` push CI `34177544920` — SUCCESS on exact merge head `66f40bb...`.

Later documentation-only `main` commits do not become new runtime qualification automatically.

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

The reliability closure and repository consolidation are complete enough to stop treating consolidation as the active project frontier.

The next step is **product-frontier re-grounding**: recover the latest relevant Owner play/product evidence, challenge old candidate priorities, and choose the smallest product-facing experiment that answers the most important current question.

Do not automatically jump into persistence, lobby/membership architecture, 3-player work, content expansion, broad refactors or another old roadmap item simply because the repository is now cleanly consolidated.

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
