# World V0 Public Room R0

## Why this exists

Owner play after J0 exposed a product/lifecycle mismatch rather than another Friend-Ready UI defect.

The proven Shared Yard substrate currently equates one browser-generated `run` key with one strict two-player simulation round. That was appropriate for qualification, but it is now friction in the main use case: casually opening Multi_World and joining friends.

R0 separates the human-facing **room** from the machine-facing **simulation epoch** without weakening the exact-state evidence already earned.

## Product invariant

A room is a stable social place.

A simulation epoch is a temporary technical generation of that room.

Therefore:

- `Yard 1` remains `Yard 1` across disconnects, backgrounding and simulation restarts;
- a room may be empty, waiting or live;
- a roster change may end the current strict simulation epoch and create another one;
- ending an epoch must not imply that the human-facing room ceased to exist;
- the current exact two-player simulation contract may remain strict inside each active epoch.

R0 does **not** require preserving physical prop state across an epoch restart. Persistence is a separate later question.

## Initial public room set

R0 starts with a bounded static catalog rather than a general matchmaking/registry system:

- `yard-1` — Yard 1
- `yard-2` — Yard 2
- `yard-3` — Yard 3

Everyone sees the same catalog and occupancy. Exact room URLs remain useful as optional deep links/debugging, not as the primary social workflow.

## Research-round invariants to preserve

Do not casually weaken these while productizing access:

- server-authoritative Box3D shared truth;
- frozen simulation/build identity within an epoch;
- scheduled canonical input and exact-state guard semantics;
- bounded two-player epoch until a later experiment explicitly earns a broader roster contract;
- fail-closed behavior for actual simulation/identity corruption.

## Research-round semantics that must stop leaking into normal play

The following are no longer product invariants:

- every normal session needs a newly generated room key;
- one player must manually send a fresh invite URL before friends can find the place;
- one peer leaving means the social room disappears;
- diagnostics/raw Room ID are normal entry controls;
- a simulation epoch and a human-facing room are the same lifetime.

## R0 staged falsifiers

### R0a — global room discovery

Add a read-only same-origin room directory for the three canonical Yard rooms.

PASS requires:

- stable room IDs and names;
- occupancy/capacity/status visible from one endpoint;
- directory reads do not mutate simulation state;
- no change to current Shared Yard authority, protocol or physics behavior.

### R0b — room/epoch lifecycle separation

Change roster lifecycle so a peer departure/background failure does not conceptually destroy the room.

First acceptable implementation may restart the strict simulation epoch when roster membership changes. It does **not** need late-join into an already-running exact-state epoch.

PASS requires at minimum:

- room identity remains stable;
- remaining/returning users can reach a fresh playable epoch without inventing a new room ID;
- no stale player body/input survives into the new epoch;
- exact-state guarantees remain scoped honestly to each epoch.

### R0c — one-click public entry

Normal `/world-v0/` entry shows the shared room catalog and one-click join. Raw room IDs, Inspect and research controls move behind explicit advanced/debug surfaces.

### R0d — Owner/friend play

Open Multi_World independently on two devices, choose the same visible Yard without exchanging a new generated link, play, leave/rejoin/background naturally, and judge whether access ceremony has actually disappeared.

## Explicit non-goals

Not in R0 unless evidence forces them:

- accounts/auth;
- friends list;
- dynamic user-created rooms;
- general matchmaking;
- database-backed room registry;
- physical-world persistence while empty;
- >2 simultaneous players;
- cross-room travel;
- chat/economy/progression.

## Current product baseline

R0 branches from the accepted J0 public staging delivery:

`world-v0-staging-delivery@3bb8239d8ded1834536138cbad7b20313cf480fe`

J0 jump remains accepted provisionally. Further jump tuning and mobile floating-gimbal polish are valid follow-ups, but they do not outrank the access/lifecycle mismatch exposed by Owner play.
