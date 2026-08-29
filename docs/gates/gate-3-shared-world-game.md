# Gate 3 — Single shared world game

**Status:** SOURCE/CI/DEPLOY VALIDATED / AWAITING REAL MOBILE + MULTI-CLIENT RUNTIME EVIDENCE  
**Branch:** `gate-3-shared-world-game`  
**Draft PR:** #3

## Question

Can one Cloudflare Durable Object act as a useful realtime shared-world coordinator for 1–5 real browser clients, with enough gameplay to exercise movement, repeated state updates, shared mutable world state, scoring and reconnects on both mobile and desktop?

## Product constraint

Mobile is first-class from this gate onward. The test must remain playable in portrait and landscape with touch input; keyboard controls are an additional desktop path, not the primary assumption.

## Game under test — Neon Salvage

- One permanent shared world: `WORLD.idFromName("main")`.
- Responsive Canvas 2D arena, 1600×1000 world coordinates.
- Mobile virtual joystick plus dedicated dash button.
- Desktop WASD/arrows plus Space.
- Inertial movement with client-side prediction and lightweight server reconciliation.
- 22 shared salvage pickups; rare cores are worth more.
- Server-owned pickup replacement, score and short combo chain up to ×5.
- Dash with a server-enforced cooldown.
- Live shared scoreboard and collection feed.

The game is intentionally more than a moving-square demo, but it is still a bounded network experiment rather than a reusable game framework.

## Network model

The Durable Object is the coordination authority. Each client sends normalized input at a bounded rate. The server advances that player's state, validates dash timing and world bounds, detects pickup collection, mutates shared pickup state, and broadcasts player updates/events.

The browser predicts its own motion at render rate for responsive feel and reconciles toward the server state. Other players interpolate toward received authoritative positions.

This is **not** yet a fixed-rate authoritative physics server. Event-driven integration is a deliberate bounded choice for a 1–5 player experiment.

## Automated evidence

Head `1e3ebd81f37c6e2c136889dba8f8e18940ee9088` passed GitHub CI on the real toolchain:

- browser script syntax check,
- `wrangler types --env staging`,
- strict TypeScript typecheck,
- `wrangler deploy --dry-run --env staging`.

Cloudflare Connected Builds also deployed the same head successfully after retiring the disposable experimental `Room` Durable Object namespace with an explicit declarative `deleted` tombstone and provisioning `World`.

Cloudflare deployment evidence:

- status: **success**
- Version ID: `5cc664c1-b05d-4e19-acce-b619e67b41df`
- public lab Worker: `https://cloudflare-multiplayer-lab.jozzpoly.workers.dev`

The assistant execution environment cannot resolve `workers.dev`, so none of this is treated as browser/gameplay runtime evidence.

## Success criteria

1. One mobile client can enter, steer with touch, dash and collect salvage without page scrolling/gesture interference.
2. A desktop client can join the same URL/world and both clients see each other moving.
3. Pickups are shared: one player's collection disappears/repositions for everyone and updates server-owned score.
4. The scoreboard converges on both clients.
5. Dash cooldown is enforced by the server and remains usable on touch and keyboard.
6. Disconnecting one client removes it from the other; reconnecting creates a fresh session and remains playable.
7. A short 3–5 client session does not reveal obvious message-order, presence or catastrophic jitter failures.

## Explicit non-claims

A PASS does not establish competitive anti-cheat, high-frequency authoritative physics, large-scale concurrency, production matchmaking/auth, persistent player accounts, robust hostile-network recovery, or final latency/performance quality.

## Known hardening debt

The repository still has no committed package lock. Do not fabricate one manually; normalize dependency locking before treating this lab as a reusable production template.
