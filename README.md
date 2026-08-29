# Cloudflare Multiplayer Lab

Small, evidence-driven laboratory for learning and validating a Cloudflare-first workflow for browser realtime/multiplayer projects.

The goal is **not** to build a game framework up front. The goal is to prove the important infrastructure boundaries one at a time while keeping the codebase clean enough to reuse the validated patterns later.

## Experiment gates

1. **Deployment sanity** — PASS. Static frontend + Cloudflare Worker + `/api/ping` work from one public deployment.
2. **Realtime transport** — PASS. Direct WebSocket connection, bidirectional round-trip and bounded reconnect/recovery work through the public Cloudflare path.
3. **Stateful room** — IN PROGRESS on `gate-3-stateful-room`. One staging Durable Object coordinates multiple clients in an isolated named room.
4. **Two-player falsifier** — pending. Two real clients see each other's movement over the public Internet.

Later gates should be added only after the previous boundary is demonstrated.

## Completed evidence

- Gate 1: [`docs/gates/gate-1-deployment-sanity.md`](docs/gates/gate-1-deployment-sanity.md)
- Gate 2: [`docs/gates/gate-2-websocket-transport.md`](docs/gates/gate-2-websocket-transport.md)

Production deployment after Gate 2:

`https://cloudflare-multiplayer-lab.jozzpoly.workers.dev`

## Gate 3

The Gate 3 contract and current evidence state are in [`docs/gates/gate-3-stateful-room.md`](docs/gates/gate-3-stateful-room.md).

Gate 3 is intentionally staged rather than deployed into the production/default Worker. Its runtime target is:

`cloudflare-multiplayer-lab-staging`

Repository validation:

```bash
npm install
npm run check
```

Local staging development:

```bash
npm install
npm run dev
```

## Current status

The Gate 3 implementation uses a SQLite-backed Durable Object declared with Cloudflare's current declarative `exports` configuration and the recommended WebSocket Hibernation API. The branch must pass CI and a true staging deployment before any multi-client runtime result is accepted.

Game movement, authoritative simulation and high-frequency state synchronization remain deliberately outside Gate 3.
