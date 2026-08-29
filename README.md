# Cloudflare Multiplayer Lab

Small, evidence-driven laboratory for learning and validating a Cloudflare-first workflow for browser realtime/multiplayer projects.

The goal is **not** to build a game framework up front. The goal is to prove the important infrastructure boundaries one at a time while keeping the codebase clean enough to reuse the validated patterns later.

## Experiment gates

1. **Deployment sanity** — static frontend + Cloudflare Worker + `/api/ping` work from one public deployment.
2. **Realtime transport** — a browser can establish and maintain a WebSocket connection.
3. **Stateful room** — one Durable Object coordinates a small room.
4. **Two-player falsifier** — two real clients see each other's movement over the public Internet.

Only Gate 1 belongs in the initial bootstrap. Later gates should be added only after the previous boundary is demonstrated.

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

Gate 1 source and build configuration are implemented. GitHub Actions has validated dependency installation, TypeScript, and a real Wrangler deployment dry-run. Gate 1 is **not yet runtime-validated on Cloudflare**. The next evidence boundary is a Workers Builds deployment from `main`, followed by a browser test of the public page and `/api/ping`.
