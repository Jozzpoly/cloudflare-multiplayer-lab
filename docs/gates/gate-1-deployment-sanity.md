# Gate 1 — Deployment sanity

**Status:** PASS  
**Validated:** 2026-08-29

## Question

Can one repository deploy a static browser client and a Cloudflare Worker together, with the browser successfully reaching a Worker API endpoint over the public Internet?

## Success criteria

- GitHub CI accepts the source and Wrangler configuration.
- Cloudflare Workers Builds clones the repository, installs dependencies, typechecks, and deploys successfully.
- Static assets are served from the public Worker deployment.
- A real external browser executes the client and receives a successful response from `GET /api/ping`.

## Evidence

### Repository / CI

GitHub Actions passed:

- dependency installation,
- `tsc --noEmit`,
- `wrangler deploy --dry-run`.

### Cloudflare deployment

Workers Builds completed successfully and deployed:

- Worker: `cloudflare-multiplayer-lab`
- Public URL: `https://cloudflare-multiplayer-lab.jozzpoly.workers.dev`
- Cloudflare Version ID: `748a3b67-b77a-4fe5-b81d-522a0893c231`
- Static assets uploaded: `/index.html`, `/app.js`, `/styles.css`
- Asset binding: `env.ASSETS`
- Reported Worker startup time: `3 ms`

### External runtime validation

A real Android browser loaded the public page and `Ping Worker` successfully completed the full browser → HTTPS → Worker route → response path.

Observed response:

```json
{
  "ok": true,
  "service": "cloudflare-multiplayer-lab",
  "stage": "gate-1-deployment-sanity",
  "timestamp": "2026-08-29T15:10:06.573Z"
}
```

This is sufficient evidence for Gate 1. It does **not** validate WebSockets, Durable Objects, multiplayer state, latency, reconnection, or multi-client behavior.

## Observed debt / non-blockers

- The repository currently has no dependency lockfile. Cloudflare selected `bun install` while GitHub CI uses npm. Exact top-level dependency versions are pinned, so this did not invalidate Gate 1, but dependency installation should be made deterministic before treating this repository as a reusable production template.
- `workers_dev` and `preview_urls` are currently enabled implicitly by Wrangler defaults. This is intentional enough for the lab, but should become explicit when deployment policy matters.
- Runtime validation is currently manual. Automated end-to-end/browser validation is not yet justified for this gate.

## Next boundary

Gate 2 should test only the next unknown: whether a real browser can establish, exchange messages over, and cleanly recover a WebSocket connection through the deployed Worker. Durable Objects are intentionally deferred until transport itself is demonstrated.
