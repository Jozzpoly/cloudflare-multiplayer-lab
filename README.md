# Cloudflare Multiplayer Lab

Small, evidence-driven laboratory for learning and validating a Cloudflare-first workflow for browser realtime/multiplayer projects.

The goal is **not** to build a game framework up front. The goal is to prove the important infrastructure boundaries one at a time while keeping the codebase clean enough to reuse the validated patterns later.

## Experiment gates

1. **Deployment sanity** — PASS. Static frontend + Cloudflare Worker + `/api/ping` work from one public deployment.
2. **Realtime transport** — next. A browser can establish and maintain a WebSocket connection.
3. **Stateful room** — pending. One Durable Object coordinates a small room.
4. **Two-player falsifier** — pending. Two real clients see each other's movement over the public Internet.

Later gates should be added only after the previous boundary is demonstrated.

## Gate 1

The initial scaffold intentionally contains only:

- `public/` — static browser client served by Workers Static Assets,
- `src/index.ts` — Worker with `/api/ping`,
- `wrangler.jsonc` — Worker + Static Assets routing,
- `.github/workflows/ci.yml` — typecheck and Wrangler dry-run on pushes/PRs.

Local development:

```bash
npm install
npm run dev
```

Repository validation:

```bash
npm run check
```

## Current status

**Gate 1 is closed as PASS.** GitHub Actions validated the source and Wrangler dry-run, Cloudflare Workers Builds deployed the Worker and static assets, and a real external Android browser loaded the public deployment and received `ok: true` from `/api/ping`.

Public lab deployment:

`https://cloudflare-multiplayer-lab.jozzpoly.workers.dev`

Detailed evidence and known non-blocking debt are recorded in [`docs/gates/gate-1-deployment-sanity.md`](docs/gates/gate-1-deployment-sanity.md).

The next experimental boundary is Gate 2: WebSocket transport only. Durable Objects and multiplayer state remain deliberately out of scope until that transport path is demonstrated.
