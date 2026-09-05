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

## Live R0 evidence — 2026-09-05

### R0a — CLOSED / PASS

The bounded global room directory is proven on the isolated `world-v0-public-room-r0` branch.

The same `yard-1`, `yard-2`, `yard-3` catalog is exposed independently of one browser's generated run key. Occupancy/state transitions are visible without mutating room state by reading the directory.

Final regression confirmation on the R0b closure head:

- workflow: `World V0 Public Room R0 Check`;
- run: `33994635918`;
- head: `70ba4a3027aa9547914d139dcb5f51d404c27d5a`;
- result: **PASS**;
- full repository check: PASS;
- stable directory / live occupancy falsifier: PASS.

### R0b — CLOSED / PASS

Product implementation:

`f431f901fb4721cdb7a03c5e2a0e8bf1324c67d0` — `feat(world-v0): recover stable room across epoch restart`

The implementation changes browser room lifecycle only. It does not change Shared Yard authority, physics, protocol or SimBuild.

Recoverable room-lifecycle reasons are deliberately bounded to normal social/session churn:

- `peer_left_restart_required`;
- `peer_error_restart_required`;
- `input_lease_expired:*`.

Actual authority/runtime/identity corruption remains fail-closed.

Final durable closure gate:

- workflow: `World V0 Public Room R0b Check`;
- run: `33994635914`;
- head: `70ba4a3027aa9547914d139dcb5f51d404c27d5a`;
- result: **PASS**;
- full repository check: PASS.

The closure gate proves three separate boundaries:

1. **Peer departure recovery**
   - `yard-1 / epoch A` reaches LIVE;
   - peer departure ends the strict epoch;
   - the remaining browser automatically rejoins the same `yard-1` under a fresh epoch;
   - a replacement peer joins and the fresh epoch reaches LIVE;
   - exact-state guard mismatches remain `0`.

2. **Real frozen-browser lease boundary**
   - Chromium is actually frozen;
   - authority ends the epoch with `input_lease_expired:actor:0`;
   - the Yard becomes empty/joinable;
   - the frozen browser does not reconnect-loop in the background.

3. **Visibility-gated lease recovery semantics**
   - a live browser is explicitly placed into a test-only hidden visibility state while canonical input batches are suppressed;
   - authority independently produces the real `input_lease_expired:actor:0` termination;
   - browser records pending same-room recovery but does not reconnect while hidden;
   - explicit test-only `visibilitychange -> visible` releases recovery;
   - the browser rejoins the same Yard under a fresh epoch;
   - a replacement peer joins and the new epoch reaches LIVE;
   - exact-state guard mismatches remain `0`.

The visibility signal in the third falsifier is intentionally marked as an **apparatus bridge**. Headless Chromium does not faithfully model the complete mobile background -> foreground delivery semantics after a real frozen renderer. Therefore R0b does **not** claim that the complete real-phone lifecycle has been machine-proven.

That final integrated claim belongs to **R0d Owner/friend hardware evidence**.

### R0b cleanup

One-shot product/apparatus patch workflows used during causal investigation were removed after closure. Durable R0a/R0b falsifiers remain in the branch.

Do not reopen R0b merely to accumulate more synthetic lifecycle matrices unless new evidence contradicts the closed result.

## Current frontier

**R0c — one-click public entry.**

The next product problem is no longer whether a stable Room can exist across strict epochs. It can.

The next falsifier is whether a normal user can open `/world-v0/`, immediately understand the shared `Yard 1 / Yard 2 / Yard 3` state, and enter one visible Yard without handling a generated room key or invite ceremony.

R0c should preserve optional exact-room deep links and advanced research/debug controls without making them the normal path.

Public staging remains frozen until R0c is itself bounded and qualified. R0d then uses real devices and another human to judge whether the access/lifecycle ceremony is actually gone.
