# Cloudflare Multiplayer Lab

Small, evidence-driven laboratory for learning and validating a Cloudflare-first workflow for browser realtime/multiplayer projects.

The goal is **not** to build a game framework up front. The goal is to prove the important infrastructure boundaries one at a time while keeping the codebase clean enough to reuse the validated patterns later.

## Experiment gates

1. **Deployment sanity** — static frontend + Cloudflare Worker + `/api/ping` work from one public deployment.
2. **Realtime transport** — a browser can establish and maintain a WebSocket connection.
3. **Stateful room** — one Durable Object coordinates a small room.
4. **Two-player falsifier** — two real clients see each other's movement over the public Internet.

Only Gate 1 belongs in the initial bootstrap. Later gates should be added only after the previous boundary is demonstrated.

## Current status

Repository initialized. Gate 1 implementation is being prepared; no Cloudflare deployment has been validated yet.
