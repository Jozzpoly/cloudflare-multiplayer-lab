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

Final regression confirmation on the R0c qualification head:

- workflow: `World V0 Public Room R0 Check`;
- run: `33995089486`;
- head: `0c1aa4da68049b72b1c1f632a5a343d22675b27b`;
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

Original durable closure gate:

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

R0c qualification reran all three durable R0b falsifiers on the exact R0c head and all remained PASS in run `33995089524`.

### R0b cleanup

One-shot product/apparatus patch workflows used during causal investigation were removed after closure. Durable R0a/R0b falsifiers remain in the branch.

Do not reopen R0b merely to accumulate more synthetic lifecycle matrices unless new evidence contradicts the closed result.

### R0c — CLOSED / PASS

Qualified head:

`0c1aa4da68049b72b1c1f632a5a343d22675b27b`

Public entry revision:

`world-v0-public-room-entry-r0c-v1`

R0c deliberately reuses the existing playable runtime rather than creating a second networking path. Normal base-URL entry now reads the bounded shared-room directory, renders `Yard 1 / Yard 2 / Yard 3`, writes the selected canonical `yard-*` ID into the existing runtime input and invokes the already-qualified Enter path.

The raw Room ID and Inspect controls remain available under Advanced. Existing exact-room deep links and the previously qualified cryptographic generated-room invite path remain compatible, but they are no longer the normal base-URL ceremony.

Dedicated qualification:

- workflow: `World V0 Public Room R0c Check`;
- run: `33995089524`;
- head: `0c1aa4da68049b72b1c1f632a5a343d22675b27b`;
- overall result: **PASS**;
- full repository check: PASS.

The real Workerd + Chromium falsifier proved:

- plain `/world-v0/` exposes exactly `yard-1`, `yard-2`, `yard-3` without adding a generated room ID to the URL;
- `yard-2` occupied by one external peer is reflected as `1/2 · Waiting` and remains joinable;
- `yard-3` occupied by two peers is reflected as `2/2` and cannot be selected;
- a browser supplies only its name and clicks Yard 2;
- the existing runtime enters canonical `yard-2` and reaches LIVE;
- the browser URL becomes the canonical deep link `?run=yard-2`;
- exact-state `guardMismatches` remain `0`;
- Advanced raw Room ID / Inspect fallback remains present.

The same run also preserved the old generated-room Friend Entry journey end-to-end:

- `WORLD_V0_FRIEND_ENTRY_CORE_PASS`;
- `WORLD_V0_FRIEND_ENTRY_PASS`.

A second job on the same exact head reran the complete closed R0b lifecycle suite:

- peer-departure same-room recovery: PASS;
- real-freeze lease boundary: PASS;
- visibility-gated lease recovery: PASS.

The independent R0a/global-directory workflow also passed on the exact same head in run `33995089486`.

Machine evidence is therefore sufficient to close R0c. Do not expand R0c into more synthetic lobby or lifecycle matrices unless staging or real-device evidence contradicts it.

## Current frontier

**R0 staging qualification -> R0d Owner/friend hardware evidence.**

The local machine-qualified R0 stack now establishes:

- stable visible Yard identities and shared occupancy;
- Room lifetime separated from strict simulation Epoch lifetime;
- normal one-click Yard entry without generated-room ceremony;
- exact-room/invite/debug compatibility retained as secondary paths.

The next step is not another local product feature. Prepare an exact, provenance-preserving staging promotion of the qualified R0 product while keeping production/root untouched. Require remote staging qualification before asking the Owner to test it.

After remote staging is green, R0d is intentionally human/hardware evidence: two independent real devices, preferably Owner + another human, open the same staging URL, see the same Yard directory, choose the same Yard without exchanging a newly generated link, play, background/foreground and leave/rejoin naturally.

R0d decides whether the access/lifecycle ceremony is actually gone in real use. Complete real-phone background -> foreground recovery remains specifically reserved for this gate.
