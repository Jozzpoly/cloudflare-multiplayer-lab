# Cloudflare Multiplayer Lab

Small, evidence-driven laboratory for learning and validating a Cloudflare-first workflow for browser realtime/multiplayer projects.

The goal is **not** to build a game framework up front. The goal is to prove the important infrastructure boundaries one at a time while keeping the codebase clean enough to reuse the validated patterns later.

## Experiment gates

1. **Deployment sanity** — PASS. Static frontend + Cloudflare Worker + `/api/ping` work from one public deployment.
2. **Realtime transport** — PASS. Direct WebSocket connection, bidirectional round-trip and bounded reconnect/recovery work through a public Cloudflare preview.
3. **Stateful room** — pending. One Durable Object coordinates multiple clients in an isolated room.
4. **Two-player falsifier** — pending. Two real clients see each other's movement over the public Internet.

Later gates should be added only after the previous boundary is demonstrated.

## Gate 1

Gate 1 is closed as PASS. Evidence is recorded in [`docs/gates/gate-1-deployment-sanity.md`](docs/gates/gate-1-deployment-sanity.md).

Public production deployment:

`https://cloudflare-multiplayer-lab.jozzpoly.workers.dev`

## Gate 2

Gate 2 is closed as PASS. It deliberately tested transport without Durable Objects or multiplayer state. Evidence is recorded in [`docs/gates/gate-2-websocket-transport.md`](docs/gates/gate-2-websocket-transport.md).

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

Gate 2 has passed source validation, GitHub CI, Cloudflare branch-preview deployment and real external-browser runtime validation. PR #1 is the promotion boundary to `main`; after merge, production deploy and a minimal production smoke test should confirm that the validated result survives promotion.

Durable Objects, rooms and multiplayer state remain deliberately outside the completed Gate 2 evidence. Their introduction is a separate next-stage decision.
