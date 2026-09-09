# World V0 — Session Presence / Capacity Stabilization Contract

Status: **IMPLEMENTED BASELINE / OWNER REFINEMENT ACTIVE**  
Recorded: **2026-09-09**  
Parent direction: `docs/WORLD_V0_FOUNDATION_STABILIZATION_DIRECTION.md`

## Purpose

This contract closes the remaining public-room/session-lifecycle debt without redesigning the fixed deterministic 2-player simulation. It separates three concepts that must not be treated as the same thing:

1. **active presence** — a currently connected player;
2. **private resume authority** — possession of the valid ActorSession resume token for the current WorldEpoch;
3. **public capacity rights** — whether an absent ActorSession is allowed to prevent a different player from entering the Yard.

Private resume authority is not itself a public capacity reservation.

## Fixed constraints

This stabilization does **not** introduce dynamic roster mutation, 3+ players, live actor hot-swap, persistence, account identity, or a new physics/protocol topology.

World V0 remains a fixed two-actor deterministic WorldEpoch with `actor:0` and `actor:1`. If a new human must replace an absent actor, the safe boundary is a new WorldEpoch rather than mutating the running fixed topology.

## Presence states

### Active

The ActorSession owns an open WebSocket and consumes one public player place.

### Protected reconnect grace

An ActorSession has disconnected while at least one peer remains connected. During the existing R1 reconnect horizon its identity/state remains resumable and its public place is protected from unrelated replacement.

This protects a still-live shared session from being rotated because one peer briefly refreshed, lost transport, or changed tabs.

### Soft reservation

With at least one peer still connected, a disconnected ActorSession becomes soft after the existing protection horizon. The private owner may still resume it if no replacement request has won, but an unrelated authority-valid fresh join may rotate the fixed WorldEpoch through the existing demand-driven handoff.

### Fully vacant resumable epoch

If an already-started WorldEpoch has **zero connected players**, its ActorSessions and exact state may remain alive for the existing bounded R1 resume window, but they no longer own scarce public capacity.

The room is publicly joinable immediately even when the preserved ActorSessions are still technically inside their private protected-resume horizon.

This is the critical Owner refinement: **zero humans online must not mean a publicly blocked Yard.**

## First valid request wins

A fully vacant resumable epoch is retained lazily until somebody actually asks for it.

- If a valid private Resume request arrives first, the old WorldEpoch remains and that ActorSession resumes exactly.
- If an unrelated valid fresh-entry request arrives first, the old fully vacant WorldEpoch is retired and a new waiting WorldEpoch is created in the same logical Yard.
- Resume tokens belonging to the retired epoch then fail closed.

This preserves close-tab -> reopen -> exact Resume when nobody else needed the Yard, without allowing abandoned sessions to monopolize public capacity.

## One-connected-peer invariant

The Owner refinement does **not** remove R1 protection when another human is still connected.

For `connected > 0`:

`active -> protected reconnect grace -> soft reservation -> demand-driven epoch handoff`

A newly disconnected peer remains non-preemptible during the protected horizon. After the horizon, soft-only missing capacity may be replaced through epoch rotation. A connected player is never silently hot-swapped out of the fixed epoch.

## Multi-tab / local-history semantics

The browser may deliberately retain one private ActorSession record per Yard. Multiple stored Yard records are not themselves a defect.

The room list must distinguish:

- **active elsewhere** — the stored session matches the current WorldEpoch, but its slot is not present in the room's `reservedSlots`; the ActorSession is already connected, usually in another tab;
- **resumable here** — the stored session matches the current WorldEpoch and its slot is in `reservedSlots`; the ActorSession is disconnected and may be resumed while that epoch still exists.

A same-owner live takeover remains legal: presenting an active session in another tab must not remove the private-token rebound behavior. A foreign browser without the token must remain unable to steal it.

## Required public-directory truth

The public directory must expose enough state to distinguish:

- connected players;
- disconnected/reserved ActorSessions;
- protected vs soft disconnected slots;
- a fully vacant but resumable epoch that is nevertheless public-capacity replaceable.

`occupancy` remains ActorSessions retained in the current WorldEpoch; it must not be interpreted as the number of humans currently online. `connected` is the live-presence count.

## Required causal cases

Before this refinement is accepted, evidence must prove all of the following:

1. two connected players -> third fresh join rejected;
2. one connected + one newly disconnected protected peer -> third fresh join rejected;
3. one connected + one soft peer -> fresh replacement can rotate the epoch;
4. both disconnected -> public room is immediately joinable, without waiting for the 20 s private resume horizon;
5. both disconnected -> valid private Resume arriving first preserves the same WorldEpoch and ActorSession;
6. both disconnected -> fresh entrant arriving first creates a new WorldEpoch and invalidates both old tokens;
7. no fresh competitor -> ordinary close-tab/reopen still resumes exact state inside the existing R1 window;
8. local room-list presentation distinguishes an active stored session from a disconnected resumable one;
9. same-owner live rebound still works;
10. foreign-profile token theft still fails closed;
11. exact-state guards and existing R1/R2 historical regressions remain green.

## Explicit non-claims

This contract does not claim long-term persistence after the bounded WorldEpoch grace expires. It does not define what a future MMO account or character should persist. It does not solve generalized `self + N peers`. Those remain later frontiers after the 2-player baseline is frozen and the repository reaches its deliberate safe stop.
