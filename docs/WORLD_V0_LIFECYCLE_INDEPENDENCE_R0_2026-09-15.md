# World V0 lifecycle independence R0

Status: **RESEARCH PLAN / NOT IMPLEMENTED / NOT PRODUCT QUALIFIED**  
Date: 2026-09-15  
Branch: `research/world-v0-lifecycle-independence-r0`  
Base: `main@031c092d38430c73ecf033c5244f62545db204e2`

## Purpose

This branch exists to test one product-facing proposition only:

> A player can enter an empty Yard alone, immediately inhabit and physically change that Yard, remain in the same running world, and later have a second fresh player join that same ongoing world without resetting the first player or the world.

This is the first bounded executable test of the project-level distinction:

`world lifetime != roster lifetime != ActorSession lifetime != transport lifetime`.

It is deliberately **not** a migration of the full Multiplayer Foundation research branch and is not permission to generalize World V0 to arbitrary rosters, 3+ players, persistence or MMO architecture.

## Live starting truth

`main` is still the qualified fixed-2P World V0. Its useful guarantees must remain controls, not collateral damage.

Today:

- the authority creates a world when the first actor joins, but canonical scheduled simulation does not start until exactly two actors are connected and ready;
- fresh actors are rejected after `protocolStartTick` / the physics loop is active;
- the browser is structurally pair-shaped (`remoteSessionId`, `remoteNetEntityId`, one remote mesh and one remote input timeline);
- the state guard requires the static `WORLD_V0_NET_ENTITY_ORDER`, including both actor bodies;
- a disconnected peer gets a protected resume reservation and later a soft reservation;
- current soft-reservation preemption rotates `WorldEpoch` because fixed-2P World V0 cannot safely replace a live actor in place;
- same-ActorSession browser authority rebase is already qualified in real Chromium and preserves `WorldEpoch`, ActorSession and NetEntity identity across a long transport outage.

The immediate defect is therefore not “missing recovery”. It is **static roster/topology semantics inside one otherwise-live world**.

## Evidence already available and how R0 may use it

### Keep: existing World V0 product/runtime guarantees

Existing qualified behavior remains authoritative control evidence for:

- exact authority/browser state guard convergence;
- scheduled canonical input and bounded prediction/replay;
- jump delivery persistence;
- ActorSession vs transport separation;
- same-ActorSession resume/rebind;
- authority rebase after a client falls outside retained history;
- protected then soft reservation classification;
- bounded all-transport-loss grace;
- desktop/mobile product entry paths.

R0 must not silently weaken these merely to make solo start easier.

### Donor: Foundation client replica semantics

`research/multiplayer-foundation-v1-2026-09-13` proved a small client-side model with:

- one `self` plus `0..N` remotes;
- stable ActorSession / ActorId projection;
- topology revision/digest checks;
- add/remove/update diffs;
- fail-closed stale/duplicate/epoch handling.

The valuable donor is the **semantics**, especially replacing singleton `remote*` state with topology-keyed projection. R0 should not import the full Foundation bootstrap/input/checkpoint stack.

### Donor: Foundation topology-aware Recording rebootstrap

Foundation browser research proved that a client can:

1. hydrate a Box3D runtime from a current authority Recording seed;
2. observe a changed actor topology;
3. destroy/recreate the local Box3D replay runtime from a new authority seed;
4. preserve exact physical state and continue exactly afterward.

This is acceptable as the initial R0 topology-change mechanism. It is **not** evidence that the rehydrate is perceptually invisible in the product. Product shell continuity and visual jank must be measured separately.

### Keep: current Chromium authority-rebase shell continuity

`world-v0-integration-i4b-chromium-rebase-audit.mjs` already proves a browser can receive a full authority Recording rebase after a long outage while preserving:

- `WorldEpoch`;
- ActorSession;
- self NetEntityId;
- product/browser session shell;
- exact continuation after rebase.

R0 should reuse that conceptual seam rather than inventing a second recovery system for topology change.

### Historical non-donors

`solo-inspection` is not lifecycle independence. It inserts a neutral `AUTO_*` companion into the fixed-2P world and explicitly marks itself non-qualification-eligible.

`prestart-vacant-capacity` concerns an entirely vacant, not-yet-running room.

Current soft-preemption is a useful fallback/control but is not the target semantics: it rotates the epoch rather than admitting a fresh actor into the ongoing world.

## R0 semantic contract

The first executable R0 PASS must prove all of the following in one bounded specimen.

### Phase A — solo world is genuinely live

1. Fresh A enters an empty Yard.
2. One real ActorSession / one actor body exists. No dummy/auto second actor is permitted.
3. `WorldEpoch` is created once and remains stable.
4. Canonical scheduled simulation starts with A alone.
5. A authors non-zero input and moves under normal World V0 movement physics.
6. A physically changes at least one persistent prop before any B exists.
7. Exact authority/browser guard comparison works for the one-actor topology.
8. Room presence reports one connected actor and one genuinely open public slot.

### Phase B — first late join mutates roster in place

9. Fresh B joins the already-running Yard.
10. No `WorldEpoch` rotation occurs.
11. A retains the same ActorSession and same self NetEntityId.
12. B receives a new ActorSession and the previously empty authored actor slot (`actor:1` for this R0).
13. B gets a fresh actor body; no invisible/dummy actor existed before the join.
14. The world/prop consequence created by A before B joined survives the topology change.
15. Authority emits an explicit topology change identity (at minimum revision + deterministic actor/entity domain identity; exact representation may stay R0-local).
16. Both browsers rehydrate/reproject from the same current authority boundary and agree on the new 2-actor topology.
17. A does not return to the room picker/lobby and does not lose its stored ActorSession.
18. Camera/input/UI session shell remains alive around any local Box3D runtime rehydrate.

### Phase C — normal shared continuation resumes

19. A and B both author distinct non-zero canonical input after the join.
20. Both clients receive/resolve peer input by ActorSession identity rather than one hard-coded `remoteSessionId` singleton.
21. Shared actor/prop interaction continues for a bounded future horizon.
22. Both clients converge exactly with authority under the 2-actor topology.
23. No guard mismatch, identity drift or unexpected epoch handoff occurs.

## Explicit non-goals

R0 does **not** need to prove:

- a third actor or arbitrary capacity;
- general actor removal/replacement inside the same epoch;
- fresh C replacing a soft-reserved disconnected B in place;
- hot Box3D body insertion on the browser without a full runtime rehydrate;
- deployed Cloudflare process-loss recovery;
- Durable Object hibernation reconstruction;
- persistent worlds across process loss;
- interest management, sharding or MMO scaling;
- perfect perceptual invisibility of topology rehydrate;
- final product UX wording/visual treatment.

These must not be pulled into R0 merely because related research apparatus exists.

## Capacity / resume policy for R0

R0 changes only the **never-occupied second slot** case.

When the running world has exactly one actor because no second actor has ever joined, the second slot is public capacity and a fresh B may claim it in place.

After two actors have existed, current protected/soft reservation behavior remains the control policy for this slice:

- protected reservation: owner resume remains exclusive;
- soft reservation: existing World V0 may still use its current recoverable epoch-handoff behavior for a fresh replacement request.

This is intentionally not final product policy. It avoids conflating first late join with the separate problem of retiring one live-world actor body and replacing it with another identity.

## Architecture direction — minimal versioned change, not Foundation import

### Authority

Keep the existing `SharedYardV0` authority and Box3D world.

Change only what is required to support a running actor count of 1 or 2:

- allow protocol/physics start with one ready connected actor;
- permit a fresh actor to claim an actually empty slot while the loop is running;
- create that actor body in the existing Box3D world at the authored slot spawn;
- preserve `WorldEpoch`, tick, props and existing actor body;
- version topology identity whenever actor membership changes;
- make state-guard packing topology-aware rather than requiring the static two-actor entity domain;
- emit a current Recording/rebase seed at the topology-change boundary for clients.

Do not import Foundation checkpoint storage, SQLite, progress overlay or recovery machinery.

### Browser projection

Replace pair-only remote state with a bounded topology projection suitable for max-2 R0 but shaped correctly:

- self remains keyed by the browser's ActorSession;
- remotes are keyed by ActorSession / NetEntity identity rather than one global `remoteSessionId` variable;
- peer canonical input timelines are keyed per remote ActorSession;
- render meshes are keyed per remote identity;
- exact state-guard entity order is derived from the current authority topology.

The first implementation may remain max-2. The point is to remove the *semantic singleton*, not to generalize capacity.

### Browser physics rehydrate

For R0, a topology change may use a full authority Recording rehydrate at one exact boundary, provided:

- the page/session is not restarted;
- A keeps ActorSession, self identity, camera/control state and UI shell;
- pre-join world state is preserved exactly;
- input authored against the old topology is not silently applied across an incompatible boundary;
- post-rehydrate prediction/history starts from the authoritative topology-change boundary;
- exact guard comparison resumes immediately.

If Owner/browser evidence later shows visible or disruptive topology-rehydrate jank, hot body mutation becomes a separate R1 optimization/quality problem rather than a prerequisite for proving lifecycle semantics.

## Required topology identity

R0 must not infer topology solely from `players.length`.

At minimum, one authority-authored topology identity must bind:

- `WorldEpoch`;
- monotonic topology revision;
- ordered active actor domain (`ActorSession`, NetEntityId/slot);
- persistent prop domain or a deterministic digest binding the complete guarded entity order.

The exact wire shape should be intentionally small and may borrow the Foundation topology digest idea, but R0 must not import unrelated Foundation protocol vocabulary merely for symmetry.

A state guard is only comparable when both sides agree on the same topology identity.

## State-guard rule

The current fixed `WORLD_V0_NET_ENTITY_ORDER` cannot remain the runtime state identity for lifecycle-independent rosters.

R0 guard ordering should be deterministic and topology-bound, e.g.:

1. active actor entities ordered by authored slot/NetEntityId;
2. persistent props in existing canonical prop order.

A one-actor guard and a two-actor guard are both valid but belong to different topology revisions/domains.

Do not use missing/dummy actor zeroes to force the old packed length to remain constant.

## First implementation sequence

### R0-A — physics/topology feasibility, no product UI claim

Build the smallest authority/browser-independent proof that:

- one actor world can step normally with the existing props;
- one-actor topology guard is deterministic;
- `actor:1` can be added to the live authority world without recreating that world;
- pre-add prop state remains bit-exact across the membership transition;
- a Recording captured after add contains the correct semantic body domain and rehydrates exactly.

If live actor-body addition itself fails, stop here and diagnose before touching the product client.

### R0-B — protocol + browser topology transition

Version the smallest required World V0 protocol/contract surface and teach the browser to:

- start as self + zero remotes;
- run solo canonical input;
- receive topology change + authority rebase;
- preserve product shell/self identity;
- become self + one remote;
- route canonical peer input by ActorSession;
- resume exact prediction/convergence.

### R0-C — real Chromium product falsifier

Use two independent Chromium profiles:

1. A enters alone and becomes live.
2. Record A's epoch/session/self identity and a concrete moved-prop state.
3. Keep A running for a meaningful solo horizon.
4. B joins later through the real room entry path.
5. Assert same epoch and A identity.
6. Assert pre-join prop consequence survived.
7. Assert both clients become exact after topology rehydrate.
8. Drive both with non-zero input and shared physical interaction.
9. Require continued exact guards for a bounded post-join horizon.

Also capture lifecycle evidence describing topology transition/rebase rather than relying only on a final green verdict.

## Regression controls before any product claim

At minimum retain/re-run the relevant existing guarantees:

- ordinary CI / typecheck / Worker validation;
- current fixed-2P clean path as a control (the branch may implement it through the new topology model, but behavior must remain exact);
- I1 lifecycle/ActorSession transport continuity;
- I4B Chromium authority rebase;
- current jump delivery persistence;
- soft-reservation/preemption tests unless intentionally superseded by a later separate policy change.

If a pre-existing control turns red, do not normalize it away without determining whether the old assertion is obsolete or the new runtime actually regressed.

## Abort / rethink conditions

Stop and re-plan instead of broadening the patch if any of these becomes true:

- solo start requires a dummy second actor to preserve guard/physics assumptions;
- adding B requires rotating `WorldEpoch`;
- A must receive a new ActorSession or self NetEntityId;
- preserving pre-join prop state requires resetting/replaying the world from initial scene;
- browser topology change requires page reload or lobby re-entry;
- a topology rehydrate cannot re-establish exact guards;
- solving max-2 late join unexpectedly requires importing Foundation recovery/checkpoint infrastructure;
- the implementation starts becoming a general 3+/MMO roster system before the 1→2 falsifier exists.

## Current judgement

The evidence supports proceeding.

The expected implementation is materially smaller than replacing World V0 with the Foundation research runtime because:

- authority stepping already iterates its actor map generically;
- existing ActorSession/transport separation is strong and should be preserved;
- existing Chromium authority rebase already preserves the product shell and self identity;
- Foundation research already proved topology-aware Recording rehydrate and dynamic client projection semantics;
- the unsolved core is narrow: make actor membership/topology an explicit runtime dimension instead of a fixed pair assumption.

The next action after this grounding commit is **R0-A feasibility**, not product rewrite.