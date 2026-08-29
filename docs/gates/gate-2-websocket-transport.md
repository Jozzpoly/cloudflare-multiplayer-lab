# Gate 2 — WebSocket transport

**Status:** DEPLOYED PREVIEW / AWAITING EXTERNAL BROWSER EVIDENCE  
**Branch:** `gate-2-websocket-transport`  
**Draft PR:** #1

## Question

Can a real public browser establish a direct WebSocket connection to the deployed Worker, complete a bidirectional message round-trip, then deliberately close and establish a fresh connection that can complete another round-trip?

## Why this boundary

Gate 1 proved browser → HTTPS → Worker. The next unknown is realtime transport itself. Coordinating multiple clients is a separate problem, so Durable Objects, rooms and game state are deliberately excluded.

Cloudflare's current Workers WebSocket API uses `WebSocketPair` for this single-connection case. Durable Objects become relevant when multiple WebSocket connections need a single coordination point.

## Success criteria

A real external browser must demonstrate all of the following on a deployed build:

1. `/ws` upgrades from HTTP to WebSocket and reaches `OPEN`.
2. The Worker sends a unique connection ID to the browser.
3. A browser `ping` message returns as a matching `pong`, with client-measured RTT.
4. A controlled browser close completes and is observed as a clean lifecycle event.
5. Exactly one reconnect attempt establishes a fresh connection ID.
6. The recovered connection automatically completes another matching `ping` → `pong` round-trip.

## Implementation

- Worker route: `/ws`
- Transport: direct Worker `WebSocketPair`
- Message contract: minimal JSON `ping` / `pong` plus initial `hello`
- Browser UI: explicit connect, manual round-trip, controlled close + one reconnect attempt
- Recovery proof: new connection ID + automatic recovery round-trip
- Worker runtime types: generated from Wrangler configuration with `wrangler types`

## Explicit exclusions

This gate does **not** test or introduce:

- Durable Objects,
- rooms or matchmaking,
- shared multiplayer state,
- authoritative simulation,
- broadcast/fan-out,
- persistence,
- authentication,
- production retry/backoff policy,
- latency quality targets.

A PASS here means only that the basic realtime transport and one bounded recovery cycle work through the actual deployed Cloudflare path.

## Evidence so far

### Local / source validation

- Browser script passed a local `node --check` syntax validation before commit.
- Worker TypeScript shape was checked locally with strict TypeScript plus minimal Cloudflare API stubs before relying on the real generated runtime types.

### GitHub CI

Draft PR #1 triggered the existing CI workflow on commit `14045a425ea92f45f41747068e126a3987362e60`.

Result: **PASS**.

The workflow completed:

- dependency installation,
- `wrangler types`,
- strict TypeScript typecheck,
- `wrangler deploy --dry-run`.

### Cloudflare non-production deployment

Cloudflare's GitHub integration reported **Deployment successful** for the same commit and created both commit and branch preview URLs.

Stable branch preview:

`https://gate-2-websocket-transport-cloudflare-multiplayer-lab.jozzpoly.workers.dev`

Commit preview:

`https://1810979f-cloudflare-multiplayer-lab.jozzpoly.workers.dev`

This also validates the intended non-production workflow: branch → preview version without replacing the validated production deployment on `main`.

### External runtime evidence

Pending. The assistant execution environment could not resolve/access the public `workers.dev` preview, so it cannot honestly substitute a synthetic network result for the required real browser test.

Do **not** mark Gate 2 as PASS from CI or Cloudflare deployment success alone.

## Next action

Open the stable branch preview in a real browser and execute, in order:

1. `Connect`
2. `Round trip`
3. `Close + reconnect`

A PASS requires the UI/log to demonstrate a successful initial ping/pong, a clean close, a fresh connection ID and an automatic recovery ping/pong.
