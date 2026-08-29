# Cloudflare Multiplayer Lab

Evidence-driven laboratory for a Cloudflare-first browser multiplayer workflow.

The goal is not to build a generic game framework up front. Each gate should answer one useful infrastructure/gameplay question with real runtime evidence.

## Experiment gates

1. **Deployment sanity — PASS.** Static frontend + Worker + `/api/ping` work publicly.
2. **Realtime transport — PASS.** Public WebSocket round-trip plus bounded reconnect/recovery validated in a real Android browser and promoted to `main`.
3. **Single shared world game — IN PROGRESS.** One Durable Object coordinates a small mobile-first multiplayer game for 1–5 clients.

## Gate 3: Neon Salvage

Gate 3 deliberately removes rooms and matchmaking. Everyone opening the game joins one shared `WORLD` Durable Object.

The test is intentionally playable rather than a moving-square demo: inertial movement, touch joystick, dash, shared salvage pickups, rare cores, combo scoring and a live scoreboard. Mobile portrait/landscape support is a first-class criterion; desktop keyboard input is supported in parallel.

The implementation contract and non-claims are recorded in [`docs/gates/gate-3-shared-world-game.md`](docs/gates/gate-3-shared-world-game.md).

## Validation

```bash
npm install
npm run check
```

Local development:

```bash
npm install
npm run dev
```

## Current production baseline

`main` remains the source baseline for validated Gate 2 until Gate 3 passes CI and real multi-client gameplay evidence.

Public Worker URL:

`https://cloudflare-multiplayer-lab.jozzpoly.workers.dev`

This repository is still a laboratory. Staging/deployment isolation and deterministic dependency locking are hardening topics, not blockers for the current shared-world gameplay question.
