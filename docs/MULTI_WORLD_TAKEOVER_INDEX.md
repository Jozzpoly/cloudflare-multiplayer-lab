# Multi_World — Takeover Index

Status: **CURRENT OPERATIONAL ENTRYPOINT — FINAL UI SANITY PENDING**  
Updated: **2026-09-10**

This index is intentionally short. A fresh continuation should not reconstruct the whole project from historical branches unless a concrete conflicting fact requires it.

---

## Canonical reading order for the current closure

1. [`MULTI_WORLD_PROJECT_SOUL.md`](MULTI_WORLD_PROJECT_SOUL.md) — durable intent; intentionally not yet rewritten.
2. [`MULTI_WORLD_CURRENT_STATE.md`](MULTI_WORLD_CURRENT_STATE.md) — current factual state and exact final candidate.
3. [`WORLD_V0_STABILIZATION_POLISH_LEDGER.md`](WORLD_V0_STABILIZATION_POLISH_LEDGER.md) — what the broad challenge/polish phase changed and preserved.
4. [`WORLD_V0_FOUNDATION_STABILIZATION_DIRECTION.md`](WORLD_V0_FOUNDATION_STABILIZATION_DIRECTION.md) — current closure order.
5. [`WORLD_V0_QUALIFIED_BASELINE_GATE.md`](WORLD_V0_QUALIFIED_BASELINE_GATE.md) — Owner gate and tiny remaining sanity check.
6. GitHub issue #8 — detailed evidence/provenance checkpoints.

Important issue checkpoints before the final UI repair:

- authority-epoch-loss stabilization `5611456843`;
- broad adversarial verification `5611643968`;
- polish checkpoint `5617342390`.

Older R0/R1/R2/takeover documents are provenance, not startup requirements.

---

## Current exact product

`7755a668d7488f04ecbf42a00fbc96fcb978d544`

Message:

`Rev World V0 browser UI for final owner focus repair`

This is the exact final stabilization candidate. It differs from pre-Owner product `fef4a2a4...` only through the bounded UI/input repair forced by the 2026-09-10 Owner recording plus validation coverage already present in the polish branch. Server physics, deterministic simulation, protocol and SimBuild did not change.

### Current qualified-play Owner candidate

`https://cloudflare-multiplayer-lab-qualified-play.jozzpoly.workers.dev/world-v0/`

Final delivery:

- delivery branch `world-v0-foundation-final-delivery`;
- delivery head `fa5e45594f0c39ba4e96c13b4ef783bbaae1ba65`;
- run `34475199474` / job `102864191837` — **SUCCESS**;
- Cloudflare Version ID `1cc9a0fd-2fac-4d23-a75d-c66669ddee01`;
- artifact `10151181384`;
- digest `sha256:4d0cdc5eb04bf3dcafdbad4ccd469b2db24f7d372f1549212d7e0321e3f49553`;
- protected runtime bytes matched `7755a668...`;
- human public Yard Durable Objects were not touched by the delivery workflow.

---

## Current identities

Simulation/physics:

- contract `shared-yard-v0-contract-v14-jump-delivery-persistence`;
- authority `shared-yard-v0-authority-v11-jump-delivery-persistence`;
- browser sim `shared-yard-v0-browser-sim-v10-jump-delivery-persistence`;
- protocol `shared-yard-v0-scheduled-input-v3-supersession`;
- state guard `shared-yard-v0-f32-state-v1`;
- SimBuild `shared-yard-v0-sim-cd8edc169f791a64`.

Presentation/input/lifecycle shell:

- browser UI `shared-yard-v0-browser-ui-v20-owner-ui-focus`;
- keyboard focus guard `world-v0-keyboard-focus-guard-v2-semantic-ownership`;
- session continuity `world-v0-session-continuity-r3-live-rebind`;
- public room entry `world-v0-public-room-entry-r3-presence-capacity`;
- public room directory `world-v0-public-room-directory-r4-vacant-capacity`;
- join failure clarity `world-v0-join-failure-clarity-v1`;
- authority epoch-loss recovery `world-v0-authority-epoch-loss-v1`;
- desktop touch controls hidden for primary fine pointer, retained for coarse/mobile.

---

## Latest evidence to trust

### Core/adversarial product evidence

- post-promotion authority-loss focused gate `34426373914` — **SUCCESS**;
- full Current Validation `34426331772` — **SUCCESS**;
- broad adversarial campaign `34428181101` — **SUCCESS / 8 of 8 jobs**;
- Resume-vs-fresh authority race `34428538218` — **SUCCESS**, both legal winner orders, no split-brain.

### Owner broad human run

Owner verdict on the delivered pre-UI candidate:

> gameplay stable and smooth.

The recording did not justify reopening broad netcode/reliability. It isolated one local UI defect: Diagnostics focus swallowed desktop WASD; visible desktop touch controls accidentally provided a way to restore focus.

### Final UI repair evidence

Focused real Chromium:

- run `34474057233` — **SUCCESS**;
- artifact `10150740652`;
- digest `sha256:62bb4b39cb70e46f280df7bfcae061a51bb5b72744a30817d456dc2c688df38d`.

Full Current Validation on exact `7755a668...`:

- run `34474343862` — **SUCCESS**;
- artifact `10151068683`;
- digest `sha256:728f0f5c7dfa68a6fb5f11ab04a1fd7e8b6c55f8d63b6d123255fb54ffa4827d`.

---

## What is now closed

The current foundation has causally/humanly closed the present-scope problems around:

- ordinary two-player smoothness and exact shared simulation;
- same-owner live F5/new-tab ActorSession rebound;
- protected/soft/vacant capacity semantics;
- cross-Yard dormant-history capacity exhaustion;
- stale-token rejection and Resume-vs-fresh authority races;
- bounded authority-epoch-loss recovery;
- text-entry W/A/S/D ownership;
- join failure clarity;
- Diagnostics focus no longer owning unrelated gameplay WASD;
- desktop/mobile control-surface separation at automated causal level.

---

## Important accepted boundary

Current fixed-2P replacement still rotates the WorldEpoch. The old shared physical state is not preserved when a soft-reserved actor is replaced by a fresh player.

That is accepted for this stabilization baseline but is explicitly **not** the target model for a persistent co-op sandbox or mini-MMO.

Future architecture must revisit:

`world lifetime != roster lifetime != ActorSession lifetime != transport/device lifetime`

Do not implement that before safe stop and repository cleanup.

---

## Immediate continuation state

**Do not open another broad test or feature frontier.**

Only this tiny Owner sanity check remains on the currently delivered URL:

1. desktop: repeatedly open/close Diagnostics and immediately use WASD — movement must keep working;
2. desktop: joystick/gimbal/JUMP must be absent on a normal fine-pointer desktop;
3. mobile: joystick/gimbal/JUMP must remain present and usable.

If PASS:

1. freeze exact runtime/product `7755a668...` and Cloudflare Version `1cc9a0fd...`;
2. record final Owner verdict/evidence;
3. enter deliberate safe stop;
4. inventory and classify workflows/branches before deletion;
5. preserve canonical/evidence/archive/donor provenance;
6. reconcile the stabilization baseline with the long-lived canonical branch;
7. only after cleanup review Project Soul / repository role;
8. only then choose the next architecture frontier, with 3+ players an early desired capability.

---

## Minimal fresh takeover procedure

A fresh browser orchestrator should:

1. verify live polish branch; commits after `7755a668...` should be docs-only unless evidence says otherwise;
2. verify final delivery branch `fa5e4559...` and Version `1cc9a0fd...`;
3. read Project Soul, then Current State, Polish Ledger, stabilization direction and baseline gate;
4. recover newest issue #8 checkpoint when exact evidence is needed;
5. continue only the final UI sanity or, if already passed, safe-stop/branch-cleanup preparation.

Do not restart historical reliability exploration unless genuinely conflicting evidence appears.
