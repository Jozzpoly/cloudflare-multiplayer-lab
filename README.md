# Cloudflare Multiplayer Lab

Evidence-driven laboratory for a Cloudflare-first browser multiplayer workflow.

The goal is not to build a generic game framework up front. Each gate should answer one useful infrastructure/gameplay question with real runtime evidence.

## Experiment gates

1. **Deployment sanity — PASS.** Static frontend + Worker + `/api/ping` work publicly.
2. **Realtime transport — PASS.** Public WebSocket round-trip plus bounded reconnect/recovery validated in a real Android browser and promoted to `main`.
3. **Single shared world game — PASS.** One Durable Object coordinated a real mobile-first multiplayer game across two independent phones.
4. **Authoritative shared simulation — NEXT.** Test whether one Durable Object can sustain a continuous physically shared world with fixed simulation cadence, measurable prediction/reconciliation and bounded network stress.

## Gate 3: Neon Salvage

Gate 3 removed rooms and matchmaking. Everyone opening the game joins one shared `WORLD` Durable Object.

The test is intentionally playable rather than a moving-square demo: inertial movement, touch joystick, dash, shared salvage pickups, rare cores, combo scoring and a live scoreboard. Mobile portrait/landscape support is a first-class criterion; desktop keyboard input remains available as a secondary path.

Gate 3 closed as PASS on 2026-08-29 after real concurrent play on two phones from different manufacturers. Both clients joined the same public world and observed shared movement/state, pickups and scoreboard behavior. Recordings from the primary handset were reviewed, including mobile portrait/landscape operation.

The implementation contract, evidence and non-claims are recorded in [`docs/gates/gate-3-shared-world-game.md`](docs/gates/gate-3-shared-world-game.md).

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

## Current validated baseline

Gate 3 / Neon Salvage is the current validated source baseline. Gate 4 should branch from this state and must not retroactively rewrite Gate 3 evidence.

Public Worker URL:

`https://cloudflare-multiplayer-lab.jozzpoly.workers.dev`

This repository is still a laboratory. Staging/deployment isolation and deterministic dependency locking remain hardening topics rather than claims established by Gate 3.
