# World V0 — Soft Reservation Stabilization Contract

Status: **DESIGNED FOR STABILIZATION / NOT YET IMPLEMENTED**  
Date: **2026-09-09**  
Parent direction: `docs/WORLD_V0_FOUNDATION_STABILIZATION_DIRECTION.md`

## Problem recovered from Owner stress testing

R1 correctly separated ActorSession identity from WebSocket transport, but the public-room model currently counts every disconnected ActorSession as occupied capacity for as long as the same two-player WorldEpoch remains alive.

That creates an unintended capacity leak: a small number of browser profiles can accumulate disconnected ActorSessions across Yard 1/2/3 and prevent unrelated players from using the public rooms.

The Owner explicitly wants the opposite product property: a player may retain a useful right to return, but that dormant right must not indefinitely prevent other people from playing.

## Constraint discovered by architecture audit

The current World V0 run is deliberately a fixed two-actor deterministic simulation:

- `actor:0` and `actor:1` are part of the fixed NetEntity order;
- browser prediction/history maps actor bodies through ActorSession IDs;
- authority consumed-input records are ActorSession keyed;
- a running client assumes exactly `self + one remote` actor;
- state guards cover the fixed two-actor body topology.

Replacing one ActorSession in-place inside a live epoch would therefore be a new dynamic-roster architecture, not a stabilization patch. It is deferred to the later 3+ / generalized multiplayer frontier.

## Stabilization model

Use **protected reconnect grace -> soft reservation -> demand-driven epoch handoff**.

### Active

A connected ActorSession occupies room capacity normally.

### Protected reconnect grace

When an ActorSession transport disappears, keep its exact resume authority protected for the existing bounded R1 recovery horizon.

During this window:

- the private resume token can reclaim the exact ActorSession;
- another browser profile cannot steal it;
- a fresh unrelated join must not evict it yet;
- the room may temporarily advertise the seat as protected/reserved.

Reuse the existing World V0 recovery horizon rather than inventing a shorter timeout that would undermine ActorSession recovery.

### Soft reservation

After the protected reconnect horizon expires, do **not** immediately destroy the ActorSession merely because nobody has requested the capacity.

Instead:

- the dormant session may still be resumed if it remains unclaimed;
- it no longer has the right to block an unrelated fresh join;
- the public room directory should expose the room as available through a soft reservation / replacement-capable state.

This preserves useful late Resume without creating permanent capacity ownership.

### Demand-driven preemption

If a fresh unrelated player requests a Yard containing replaceable soft reservation(s), the current fixed-2P implementation must **not** mutate one actor identity inside the running deterministic epoch.

Instead perform a controlled WorldEpoch handoff:

1. end the old epoch with an explicit recoverable reason such as `peer_left_restart_required`;
2. invalidate the old epoch's ActorSession tokens by retiring that epoch;
3. accept the new player into a fresh epoch for the same logical Yard;
4. any still-connected old peer uses the existing room-recovery path to re-enter the same logical Yard as a fresh actor;
5. the new pair starts only after normal two-player ready/start qualification.

If nobody from the old epoch remains connected, the fresh requester simply starts the new waiting room.

## Why demand-driven handoff is preferred over a fixed expiry

A fixed rule such as “reservation dies after 20 seconds” throws away useful continuity even when nobody needs the seat.

Demand-driven handoff provides the stronger product semantics:

- return later if the place is still unused;
- do not block friends/strangers indefinitely if they actually want to play;
- preserve current fixed deterministic topology until dynamic roster is deliberately designed later.

## Race policy

First authority-valid request wins.

- A valid private resume token arriving before preemption reclaims the existing ActorSession.
- A fresh join arriving after the reservation becomes replaceable may rotate the epoch and claim capacity.
- A stale resume token presented after epoch rotation must fail closed and the client should recover to ordinary entry rather than report a generic network failure.

No active connected player may be silently evicted from the logical Yard without receiving the explicit recoverable epoch-end transition.

## Public directory semantics

The directory must stop equating every disconnected ActorSession with permanently unavailable capacity.

It should be able to distinguish at least:

- connected capacity;
- protected reconnect reservation;
- replaceable/soft reservation;
- ordinary free capacity.

A fresh user:

- cannot enter a fully-connected active 2P run;
- cannot preempt a protected reservation;
- can enter when capacity is genuinely free;
- can request a handoff when the only blocker is replaceable soft reservation.

A browser holding the matching private ActorSession token may see `Resume` while that epoch/session still exists, including when its old transport is still connected (same-owner live rebound).

## Required evidence before qualification

Automated causal cases:

1. same-owner live F5/new-tab rebound keeps WorldEpoch + ActorSession + NetEntity identity;
2. unrelated profile cannot resume without token;
3. protected reservation blocks unrelated preemption during recovery grace;
4. soft reservation remains resumable while unclaimed;
5. fresh unrelated join preempts soft reservation via explicit epoch handoff;
6. connected peer automatically recovers into the same logical Yard after that handoff;
7. old token is invalid after handoff;
8. fully live 2/2 room remains non-joinable;
9. exact-state guards remain clean before handoff and in the new epoch;
10. repeated room switching cannot permanently exhaust all public Yard capacity.

Owner qualification:

- hostile Chrome/Brave room switching;
- F5 while both are live;
- close-tab -> ordinary resume;
- leave one seat dormant beyond protected grace, then let another player/browser take the Yard;
- verify old browser can no longer steal the new session;
- desktop + mobile representative play on Owner-first placement.

## Non-goal

This contract deliberately does **not** implement live dynamic roster replacement, 3+ players, accounts, durable MMO identity, persistent world-state ownership, or seamless actor succession inside one WorldEpoch. Those belong to the next multiplayer architecture era after stabilization and safe-stop cleanup.
