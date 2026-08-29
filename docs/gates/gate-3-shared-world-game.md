# Gate 3 — Single shared world game

**Status:** PASS  
**Validated:** 2026-08-29  
**Branch:** `gate-3-shared-world-game`  
**Draft PR:** #3 before promotion

## Question

Can one Cloudflare Durable Object act as a useful realtime shared-world coordinator for at least two independent real mobile browser clients, with enough gameplay to exercise movement, repeated state updates, shared mutable world state and scoring?

The implementation was deliberately shaped for a small personal/friends session. It is designed with 1–5 clients in mind, but Gate 3 does **not** claim that 3–5 real concurrent devices were pressure-tested.

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

The game is intentionally more than a moving-square demo, but it remains a bounded network experiment rather than a reusable game framework.

## Network model

The Durable Object is the coordination authority. Each client sends normalized input at a bounded rate. The server advances that player's state, validates dash timing and world bounds, detects pickup collection, mutates shared pickup state and broadcasts player updates/events.

The browser predicts its own motion at render rate and reconciles toward the server state. Other players interpolate toward received authoritative positions.

This is **not** a fixed-rate authoritative physics server. Event-driven integration is the deliberate boundary of Gate 3.

## Automated evidence

The final Gate 3 source passed the repository validation path:

- browser script syntax check,
- Wrangler-generated staging binding/runtime types,
- strict TypeScript typecheck,
- `wrangler deploy --dry-run --env staging`,
- Cloudflare Connected Build deployment.

The final pre-runtime evidence head `9593e455f95edb8a1a1e748ab543a15e73c28b2a` had both GitHub CI and Cloudflare Workers Build green. Cloudflare Version ID: `1b64d9a8-db70-4d0f-833f-599d395a8975`.

## Real runtime evidence

Owner validation on 2026-08-29 closed the actual Gate 3 question:

- two real phones from different manufacturers connected concurrently to the public Worker;
- both entered the same single shared world without rooms or matchmaking;
- multiplayer movement/state was observed concurrently;
- shared salvage/pickup state and scoreboard behavior were observed across the session;
- touch controls were usable on the primary phone;
- mobile portrait and landscape operation were exercised without the game becoming unusable;
- recordings from the primary handset were reviewed as supporting evidence.

This is sufficient to prove the intended Gate 3 boundary: Cloudflare Worker + one Durable Object can host a small real mobile shared-world game across independent clients.

## Criteria disposition

1. **Mobile touch playability — PASS.** Real mobile play, movement, dash/collection loop and orientation handling were exercised.
2. **Second independent real client in the same world — PASS.** Validated with a second phone of a different manufacturer.
3. **Shared world state — PASS.** Shared players/pickups and server-owned scoring were observed.
4. **Scoreboard convergence — PASS.** The concurrent session displayed shared scoreboard state.
5. **Server-controlled gameplay rules — PASS for Gate 3 scope.** Dash cooldown/scoring authority remains server-side in the validated implementation.
6. **Reconnect — not a new Gate 3 claim.** Transport reconnect/recovery was already proven in Gate 2; Gate 3 does not elevate this into a hostile-network recovery claim.
7. **3–5 real client pressure — deferred.** This becomes a Gate 4 pressure/falsification question rather than a blocker for the already resolved two-client shared-world hypothesis.

## Explicit non-claims

A PASS does not establish:

- competitive anti-cheat,
- fixed/high-frequency authoritative physics,
- 3–5 real-device pressure behavior,
- large-scale concurrency,
- production matchmaking/auth,
- persistent player accounts,
- robust hostile-network recovery,
- final latency/performance quality,
- suitability as the physics server for a future vehicle simulation.

## Why Gate 3 stops here

The most valuable remaining unknown is no longer whether multiplayer coordination works. It is whether the Durable Object can sustain a **continuous authoritative shared simulation** whose world evolves independently of incoming client messages and remains usable under prediction/reconciliation and network stress.

That is a separate Gate 4 question and must not be smuggled into Gate 3 after the fact.

## Known hardening debt

The repository still has no committed package lock. Do not fabricate one manually; normalize dependency locking before treating this lab as a reusable production template.
