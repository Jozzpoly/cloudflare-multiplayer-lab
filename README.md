# Cloudflare Multiplayer Lab

Small, evidence-driven laboratory for learning and validating a Cloudflare-first workflow for browser realtime/multiplayer projects.

The goal is **not** to build a game framework up front. The goal is to prove the important infrastructure boundaries one at a time while keeping the codebase clean enough to reuse the validated patterns later.

## Experiment gates

1. **Deployment sanity** — PASS. Static frontend + Cloudflare Worker + `/api/ping` work from one public deployment.
2. **Realtime transport** — IN PROGRESS on `gate-2-websocket-transport`. Direct WebSocket connection, round-trip and one bounded recovery cycle.
3. **Stateful room** — pending. One Durable Object coordinates a small room.
4. **Two-player falsifier** — pending. Two real clients see each other's movement over the public Internet.

Later gates should be added only after the previous boundary is demonstrated.

## Gate 1

Gate 1 is closed as PASS. Evidence is recorded in [`docs/gates/gate-1-deployment-sanity.md`](docs/gates/gate-1-deployment-sanity.md).

Public production deployment:

`https://cloudflare-multiplayer-lab.jozzpoly.workers.dev`

## Gate 2

Gate 2 deliberately tests transport without Durable Objects or multiplayer state. The implementation contract and current evidence status are in [`docs/gates/gate-2-websocket-transport.md`](docs/gates/gate-2-websocket-transport.md).

Repository validation:

```bash
npm install
npm run check
```

Local development:

```bash
npm install
npm run dev
```

## Current status

`main` remains the Gate 1 validated baseline. Gate 2 is isolated on a non-production branch until CI, Cloudflare deployment and a real external browser test provide enough evidence to merge it.
