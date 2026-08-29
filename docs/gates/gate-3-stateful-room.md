# Gate 3 — Stateful room

**Status:** SOURCE/CI VALIDATED / AWAITING TRUE STAGING DEPLOY + MULTI-CLIENT RUNTIME EVIDENCE  
**Branch:** `gate-3-stateful-room`  
**Draft PR:** #2

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

Cloudflare Workers Builds must therefore use a real staging deployment for this branch. The ordinary non-production default (`wrangler versions upload`) is not the Gate 3 runtime target.

An important observed nuance: because the Durable Object exists only in `env.staging`, Cloudflare can still create a normal preview URL for the **default environment** branch version. That preview does not contain the `ROOMS` binding and must not be used as Gate 3 runtime evidence. A valid test must run against the separately deployed `cloudflare-multiplayer-lab-staging` Worker.

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

## Evidence so far

### First implementation attempt

Commit `5a5fbefe4882ca277dec1c1ce73211d5bf5cda42` failed CI during staging type generation/typecheck because `ASSETS` was absent from the generated staging `Env`. The Durable Object binding `ROOMS` itself was generated correctly.

This falsified the assumption that the top-level asset binding was sufficient for the named staging environment in the actual Wrangler toolchain. The staging `assets` configuration was then declared explicitly.

### Corrected implementation

Commit `e0725108c09d71ca5767bbf1db2c8d177a88534c` passed GitHub CI.

Validated on the real toolchain:

- `node --check public/app.js`,
- `wrangler types --env staging`,
- strict TypeScript typecheck,
- `wrangler deploy --dry-run --env staging`.

Wrangler generated both required staging bindings:

- `ROOMS: DurableObjectNamespace<Room>`
- `ASSETS: Fetcher`

Cloudflare's ordinary non-production build also succeeded for the corrected commit, but it produced a preview for the default environment. That is useful as build evidence only and is **not** staging runtime evidence for the Durable Object.

## Remaining runtime boundary

Before browser testing, Workers Builds must execute a full staging deployment for the non-production branch:

`npx wrangler deploy --env staging`

Expected staging URL after deployment:

`https://cloudflare-multiplayer-lab-staging.jozzpoly.workers.dev`

Only after that URL exists should the two-client success criteria be executed.

## Known non-blocking debt

The repository still lacks a committed package lock. A local attempt to generate one was blocked because the assistant execution environment has no DNS access to GitHub/npm. The file will not be fabricated manually. Cloudflare and GitHub currently resolve the pinned direct dependencies independently; deterministic transitive dependency resolution remains a hardening item before treating this lab as a reusable production template.
