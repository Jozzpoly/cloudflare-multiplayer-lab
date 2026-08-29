# Gate 2 — WebSocket transport

**Status:** PASS  
**Validated:** 2026-08-29  
**Branch:** `gate-2-websocket-transport`  
**PR:** #1

## Question

Can a real public browser establish a direct WebSocket connection to the deployed Worker, complete a bidirectional message round-trip, then deliberately close and establish a fresh connection that can complete another round-trip?

## Why this boundary

Gate 1 proved browser → HTTPS → Worker. The next unknown was realtime transport itself. Coordinating multiple clients is a separate problem, so Durable Objects, rooms and game state were deliberately excluded.

Cloudflare's current Workers WebSocket API uses `WebSocketPair` for this single-connection case. Durable Objects become relevant when multiple WebSocket connections need a single coordination point.

## Success criteria

A real external browser had to demonstrate all of the following on a deployed build:

1. `/ws` upgrades from HTTP to WebSocket and reaches `OPEN`.
2. The Worker sends a unique connection ID to the browser.
3. A browser `ping` message returns as a matching `pong`, with client-measured RTT.
4. A controlled browser close completes and is observed as a clean lifecycle event.
5. Exactly one reconnect attempt establishes a fresh connection ID.
6. The recovered connection automatically completes another matching `ping` → `pong` round-trip.

All criteria passed.

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
- latency quality targets,
- uncontrolled network loss / Wi-Fi↔cellular handoff,
- background/suspend behavior,
- multi-client load.

A PASS here means only that the basic realtime transport and bounded recovery path work through the actual deployed Cloudflare path.

## Evidence

### Local / source validation

- Browser script passed a local `node --check` syntax validation before commit.
- Worker TypeScript shape was checked locally before relying on the real generated runtime types.

### GitHub CI

Draft PR #1 triggered the existing CI workflow. The Gate 2 implementation and subsequent evidence commit both passed CI.

The workflow completed:

- dependency installation,
- `wrangler types`,
- strict TypeScript typecheck,
- `wrangler deploy --dry-run`.

### Cloudflare non-production deployment

Cloudflare's GitHub integration reported **Deployment successful** and created both commit and branch preview URLs.

Stable branch preview:

`https://gate-2-websocket-transport-cloudflare-multiplayer-lab.jozzpoly.workers.dev`

This validates the intended non-production workflow: branch → preview deployment without replacing the validated production deployment on `main`.

### External runtime validation

The owner executed the Gate 2 lifecycle in a real Android browser against the public branch preview and supplied a screen recording. The recording was manually reviewed.

Observed evidence includes:

- initial state reached `open`,
- initial server connection ID `f7aeb89e-6397-4adf-904b-c6c50c7882ff`,
- successful manual ping/pong round-trips (for example `16.7 ms`),
- controlled close reported `code=4000`, `clean=true`, `reason=gate-2-reconnect-test`,
- reconnect created a different server connection identity,
- recovered state was reached,
- additional recovered connection IDs were observed, including `0e0f3bbf-a993-4630-ad4d-805c8769e0de` and later `1b7f29bc-9454-40b8-bc07-c46724988384`, showing repeated bounded reconnect cycles rather than a single accidental success,
- the recovered connection completed its automatic recovery round-trip and remained usable for subsequent manual ping/pong traffic.

Observed RTT values varied from roughly the mid-teens to tens of milliseconds, with some higher samples. These values are **not** treated as a latency benchmark: the test ran on a phone while screen recording and was designed to validate transport correctness, not performance quality.

## Verdict

**PASS.** Gate 2 demonstrated the required direct WebSocket transport and bounded recovery lifecycle through the real public Cloudflare path.

This result does not justify treating the current Worker as a multiplayer room server. The next unknown is coordination of multiple clients and shared state, which should be tested separately rather than inferred from this result.
