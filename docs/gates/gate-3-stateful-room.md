# Gate 3 — Stateful room

**Status:** IMPLEMENTED / AWAITING STAGING DEPLOY + MULTI-CLIENT RUNTIME EVIDENCE  
**Branch:** `gate-3-stateful-room`

## Question

Can Cloudflare Durable Objects provide the smallest useful multiplayer coordination primitive: one named room with multiple WebSocket clients that share presence and server-routed events, while different room IDs remain isolated?

## Why this boundary

Gate 2 proved direct browser ↔ Worker WebSocket transport and one bounded reconnect cycle. It did not prove that multiple clients can share one authoritative coordination point. Gate 3 introduces exactly that missing primitive and no game simulation.

## Architecture under test

- `/room/<ROOM_ID>/ws?player=<PLAYER_ID>` is routed by the Worker.
- `ROOMS.idFromName("room:<ROOM_ID>")` deterministically maps one room ID to one Durable Object.
- `Room` uses the Durable Objects WebSocket Hibernation API.
- Each server-side WebSocket stores `roomId`, `playerId`, `sessionId` and `joinedAt` in a serialized attachment so the metadata survives hibernation.
- Presence is reconstructed from `ctx.getWebSockets()` rather than trusted to process-local memory.
- Gate 3 does not persist gameplay data in SQLite; SQLite is only the required/recommended backing for the new Durable Object namespace.

## Staging isolation

Gate 3 deliberately defines the Durable Object only under `env.staging`:

- staging Worker: `cloudflare-multiplayer-lab-staging`
- deployment command: `npx wrangler deploy --env staging`
- public staging route: Workers.dev (`workers_dev: true`)

The production/default Worker does not receive the Durable Object binding during the experimental branch. This prevents Gate 3 from silently turning a branch experiment into production stateful infrastructure.

Cloudflare Workers Builds must therefore use a real staging deployment for this branch. The ordinary non-production default (`wrangler versions upload`) is insufficient for Gate 3 runtime validation because Workers implementing Durable Objects do not receive Preview URLs.

## Success criteria

A real public staging deployment must demonstrate:

1. Client A joins room `TEST` and sees itself as one participant.
2. Client B joins `TEST`; both clients converge to `count = 2` with both player IDs.
3. A signal sent by A is received by B with the correct room and sender identity.
4. A signal sent by B is received by A.
5. One client disconnects; the remaining client converges back to `count = 1`.
6. The disconnected client rejoins and receives a fresh session ID; presence returns to two.
7. Room isolation: move one client to `OTHER`; `TEST` and `OTHER` each report only their own participant(s), and a signal emitted in `OTHER` never appears in `TEST`.

## Explicit exclusions

This gate does **not** establish:

- player movement or game state,
- authoritative tick/simulation loops,
- broadcast cadence for high-frequency state,
- prediction/reconciliation/interpolation,
- matchmaking,
- authentication or accounts,
- durable gameplay persistence,
- latency/performance targets,
- load/scaling limits,
- uncontrolled network-loss recovery.

## Validation layers

1. Browser JS syntax check (`node --check`).
2. Wrangler-generated staging runtime/binding types + strict TypeScript.
3. `wrangler deploy --dry-run --env staging`.
4. Real Cloudflare staging deployment.
5. Real two-client browser evidence, including separate-room isolation.

Only layer 5 can close Gate 3 as PASS.

## Known non-blocking debt

The repository still lacks a committed package lock. A local attempt to generate one was blocked because the assistant execution environment has no DNS access to GitHub/npm. The file will not be fabricated manually. Cloudflare and GitHub currently resolve the pinned direct dependencies independently; deterministic transitive dependency resolution remains a hardening item before treating this lab as a reusable production template.
