# Gate 2 — WebSocket transport

**Status:** IMPLEMENTED / AWAITING RUNTIME EVIDENCE  
**Branch:** `gate-2-websocket-transport`

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

## Validation layers

- Local static JS syntax check: completed before commit.
- TypeScript / Wrangler dry-run: must pass in GitHub Actions.
- Cloudflare non-production build: must deploy successfully.
- External browser lifecycle test: required before PASS.

## Current evidence

Runtime evidence is pending. Do not mark Gate 2 as PASS from CI or deployment success alone.
