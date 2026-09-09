# World V0 — Foundation Stabilization Direction

Status: **PRELIMINARY OWNER DIRECTION / ACTIVE STABILIZATION**  
Recorded: **2026-09-09**  
Working branch: `world-v0-foundation-stabilization-closure`  
Starting point: `world-v0-qualified-baseline-prep@3fdb87fbefc5cf8721979e43f82f8299cb3eefd9`

## Why this document exists

This is a working execution contract for the current transition. It intentionally does **not** rewrite the canonical Project Soul yet. The Owner wants the new direction kept continuously in view while the present 2-player multiplayer foundation is stabilized, then cleaned and consolidated before longer-horizon development resumes.

## Execution order

Do not skip forward:

1. **Stabilize the current 2-player multiplayer foundation.**
2. **Reach a deliberate safe stop.**
3. **Clean and consolidate repository / branch / documentation / workflow debt.**
4. **Only then formalize the longer-term Multi_World direction and plan the next fundamental multiplayer stages.**

New product features are not the current frontier.

## Current stabilization objective

Earn a solid ordinary 2-player baseline that survives hostile natural use, not just synthetic qualification.

The baseline should retain the gains already demonstrated:

- representative low-latency Owner-first Durable Object placement;
- smooth ordinary two-player foreground play;
- exact-state integrity;
- reliable enough jump delivery;
- full-tab close -> ordinary entry -> same ActorSession resume;
- protection against another browser stealing a private resumable identity.

The September 9 Owner stress test exposed additional foundation debt that must be resolved before the baseline is frozen.

## Critical stabilization debt

### 1. Reservation semantics are coupled incorrectly to room capacity

A preserved resumable identity/state should not indefinitely consume a scarce public room slot.

Working direction:

- **active player**: connected and consumes capacity;
- **short reconnect grace**: temporarily protects continuity across transient disconnect / refresh overlap;
- **dormant resumable identity/state**: may be recoverable later but does **not** block another player from using room capacity.

Returning to a dormant state should be possible only when capacity permits; returning must not evict an active player.

A browser having resumable history in several Yards is not automatically a defect. The defect is treating dormant history as live room capacity.

### 2. Refresh / same-session takeover semantics are incomplete

A page refresh or overlapping old/new runtime can collide with its own still-live ActorSession and surface as a generic join failure. A same-owner resume authority must have an explicit, bounded lifecycle policy rather than depending on the old socket disappearing first.

Do not weaken cross-browser ownership protection while solving this.

### 3. Public-room occupancy can be artificially exhausted

Stress testing demonstrated that a small number of real clients can accumulate persistent reservations across the fixed public Yards. This is a capacity leak under the current semantics and is a baseline blocker.

### 4. Gameplay keyboard routing leaks into text entry

Confirmed on current runtime: global movement handlers intercept `KeyW`, `KeyA`, `KeyS`, `KeyD` (and other gameplay keys) without excluding editable controls, causing callsign text input to lose those characters.

Required direction: gameplay input ownership must explicitly ignore editable elements (`input`, `textarea`, `select`, contenteditable or equivalent focus ownership), rather than patching individual letters.

### 5. Join / lifecycle / network errors are conflated

The current user-facing message can represent room-full, own-session overlap, or actual network/unreachability. Stabilization should make these causes distinguishable enough for both users and evidence collection.

### 6. Final representative qualification remains required

After repairs, repeat natural Owner stress testing. A final baseline should include representative desktop and mobile evidence before safe stop.

## Preliminary longer-term project direction

Keep this direction in view during stabilization, but do not prematurely redesign the current runtime around an imagined MMO.

The Owner currently sees this repository increasingly as a **long-lived multiplayer systems laboratory / reusable multiplayer core**, rather than the repository in which the eventual mini-MMO itself must be built.

Likely consequences after safe stop:

- future game repositories may consume validated multiplayer systems from this project;
- a future mini-MMO may begin in a new repository;
- map, gameplay and toy mechanics remain important here primarily because they create realistic pressure on multiplayer systems;
- this project should still stay playable enough for natural human testing instead of collapsing into synthetic infrastructure benchmarks;
- **3+ players is an early desired capability** in the next broader multiplayer era and should challenge assumptions that currently encode exactly `self + one peer`;
- identity/account systems, persistence, world transitions and larger social topology may become later multiplayer research frontiers, but are not authorized by this document.

## Safe-stop requirement after stabilization

Once the 2-player foundation is genuinely stable, stop before opening the next large architecture frontier.

The safe stop should include:

- frozen qualified baseline and reproducible evidence;
- canonical current-state / takeover documentation refresh;
- workflow and validation apparatus review;
- branch archaeology and controlled cleanup;
- explicit preservation of provenance/evidence/donor branches before deletion;
- consolidation of active branches to a small comprehensible set;
- formal review of Project Soul / project role only after evidence and cleanup are complete.

Live branch inventory on 2026-09-09: **155 branches**. Do not mass-delete them. Classify first: canonical active, evidence/archive, superseded, disposable apparatus, unknown.

## Guardrail

The current goal is **not** perfection and not endless reliability work. Stabilization ends when the 2-player foundation is solid enough that further defects are bounded debt rather than blockers to trusting the core. At that point, stop, clean the project, formalize the new direction, and only then expand the multiplayer frontier.
