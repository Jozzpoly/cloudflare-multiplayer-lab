# World V0 — Stabilization Polish Ledger

Status: **POLISH CLOSED / OWNER CORE PASS / FINAL UI SANITY PENDING**  
Date: **2026-09-10**  
Pre-Owner product: `fef4a2a4b6007c3e42cbd3b430cb9943343cc970`  
Final UI-repaired product: `7755a668d7488f04ecbf42a00fbc96fcb978d544`  
Polish branch: `world-v0-foundation-polish-closure`

## Purpose

This ledger records the bounded challenge / polish / repair / cleanup pass performed before safe stop. It is intentionally not a new feature plan and does not rewrite Project Soul.

The governing rule was:

> improve trust, maintainability and takeover truth without changing the stabilized gameplay/runtime unless a concrete falsifier from automated or Owner evidence requires it.

That rule produced exactly one late product exception: the Owner's final broad recording exposed a reproducible local UI/input bug, which was repaired narrowly and requalified without changing simulation/authority physics.

## 1. Starting product preservation

The polish branch began from exact stabilized product `fef4a2a4...`.

Before the final Owner run, repeated compare checks confirmed the initial polish work changed no gameplay/runtime source in `public/world-v0/**` or `src/**`; changes were validation, documentation and workflow cleanup only.

The final Owner run then supplied new evidence requiring one bounded presentation/input repair. That exception is recorded in section 8 below.

`src/**`, server authority physics, deterministic topology, protocol and SimBuild remain unchanged throughout the final UI repair.

## 2. Broad adversarial input to polish

Polish began only after the product-challenging phase reached its automated stop condition.

Primary campaign:

- branch `world-v0-foundation-adversarial-verification`;
- run `34428181101` — **SUCCESS / 8 of 8 jobs**;
- product under test `fef4a2a4...`;
- no product drift.

Additional authority race:

- run `34428538218` — **SUCCESS**;
- seven near-simultaneous private Resume versus unrelated fresh-admission races;
- both legal winner orders observed;
- no split-brain or double authoritative WorldEpoch.

Further resumed-stayer work reproduced the suspicious lifecycle sequence successfully locally, on fresh remote Durable Objects and under repeated churn. Controlled authority-process loss reproduced the earlier fatal dual-`1006` signature and led to the already-promoted bounded authority-epoch-loss recovery in `fef4a2a4...`.

## 3. Validation coverage repair

The promoted product had added:

- `public/world-v0/authority-epoch-loss.js`;
- `public/world-v0/join-failure-clarity.js`;

but ordinary `npm run check` did not execute their contract smokes.

`package.json` `check:client` was repaired so standard repository validation includes syntax and smoke coverage for both modules.

`.github/workflows/world-v0-current-validation.yml` was also repaired to:

- run on the polish branch;
- trigger on current stabilization modules/smokes;
- assert current authority-loss and join-failure markers;
- require their smoke PASS signals in ordinary repository checks.

After the final UI repair it also runs the focus/visibility checks through canonical `npm run check`.

## 4. Dependency and toolchain audit

### Production graph

`npm audit --omit=dev`:

- info `0`;
- low `0`;
- moderate `0`;
- high `0`;
- critical `0`.

### Development graph

Full `npm audit` reports three high findings under development-only:

`wrangler -> miniflare -> sharp`

Frozen graph:

- Wrangler `4.127.1`;
- Miniflare `5.20260828.0-alpha`;
- sharp `0.35.2`.

An isolated Wrangler `4.130.0` candidate:

- passed complete repository validation;
- kept production vulnerabilities at zero;
- retained the same three dev-only findings and sharp `0.35.2`.

Decision: **do not churn the frozen toolchain merely to move a version number**. This remains bounded upstream dev-dependency debt until a candidate graph actually removes the advisory path.

Evidence:

- run `34429140500` — **SUCCESS**;
- artifact `10133798229`;
- digest `sha256:7238ed80d4e2c4ba426b7c87510a1bc80c2ff6a792bd644f2c41521bfcdde22a`.

## 5. Canonical documentation reconciliation

Materially stale documents were refreshed:

- `MULTI_WORLD_CURRENT_STATE.md`;
- `MULTI_WORLD_TAKEOVER_INDEX.md`;
- `WORLD_V0_FOUNDATION_STABILIZATION_DIRECTION.md`;
- `WORLD_V0_QUALIFIED_BASELINE_GATE.md`;
- `WORLD_V0_AUTHORITY_EPOCH_LOSS_RESILIENCE.md`;
- this ledger.

`MULTI_WORLD_PROJECT_SOUL.md` remains intentionally unchanged. Project-role/Soul review is a post-freeze, post-cleanup decision.

## 6. Consumed workflow retirement

The polish pass removed active one-shot workflow files whose purposes had already been completed and whose evidence remains preserved in Git history, Actions artifacts and issue #8.

Retired categories included:

- authority-loss candidate/regression/promotion machinery;
- controlled pre-repair authority-reset baselines;
- direct-Resume outage/repair machinery;
- join-failure clarity repair workflow;
- vacant-capacity repair/refinement workflows;
- peer-departure isolation workflow;
- qualified deployment forensics;
- pre-Owner adversarial one-shot workflow;
- resumed-stayer local/remote/repetition/churn forensics;
- superseded old qualified-baseline delivery workflow;
- polish-only toolchain audit workflow after evidence preservation.

These deletions remove active automation surface, not history/evidence.

No broad R0/R1/R2 workflow or branch purge was performed. Larger classification belongs to the post-freeze archaeology campaign.

## 7. Owner broad human qualification

The Owner performed a natural desktop/mobile run on the qualified-play candidate and reported:

> gameplay stable and smooth.

The recordings did not expose a new broad multiplayer/netcode failure. They did expose one reproducible local UI/input defect:

- clicking Diagnostics could leave focus on its `<summary>`;
- the v1 focus guard treated interactive controls like editables and swallowed subsequent WASD;
- movement returned after clicking another gameplay/touch surface;
- desktop also unnecessarily displayed touch joystick controls.

The mobile recording additionally gave useful lifecycle/background-return evidence, but it is not overclaimed as exhaustive mobile-radio reliability proof.

The Owner also identified an important architectural concern: current soft-reservation replacement rotates the WorldEpoch and loses prior shared physical history. That is recorded as a next-era persistent-world/dynamic-roster question, not repaired inside this closure.

## 8. Bounded final UI repair

Exact final product:

`7755a668d7488f04ecbf42a00fbc96fcb978d544`

Presentation/input changes only:

- keyboard focus guard -> `world-v0-keyboard-focus-guard-v2-semantic-ownership`;
- editables continue owning all keyboard input;
- buttons / links / `<summary>` own activation keys (`Space` / `Enter`) but no longer swallow unrelated gameplay WASD merely because they retain focus;
- keydown/keyup ownership is symmetric;
- touch joystick, gimbal and JUMP are hidden for primary fine-pointer desktop and shown for coarse-pointer/mobile;
- browser UI revision -> `shared-yard-v0-browser-ui-v20-owner-ui-focus`.

Unchanged:

- `src/**` runtime authority implementation;
- authority revision `shared-yard-v0-authority-v11-jump-delivery-persistence`;
- browser simulation `shared-yard-v0-browser-sim-v10-jump-delivery-persistence`;
- protocol `shared-yard-v0-scheduled-input-v3-supersession`;
- state guard `shared-yard-v0-f32-state-v1`;
- SimBuild `shared-yard-v0-sim-cd8edc169f791a64`.

### Focused causal evidence

Run `34474057233` — **SUCCESS**.

- artifact `10150740652`;
- digest `sha256:62bb4b39cb70e46f280df7bfcae061a51bb5b72744a30817d456dc2c688df38d`.

Real Chromium proved:

- Diagnostics `<summary>` stayed focused while physical `W` reached gameplay (`raw z = -1`);
- `Space` remained owned by Diagnostics and did not enter gameplay;
- `w` in callsign remained text and did not enter gameplay;
- fine-pointer desktop controls were absent;
- coarse-pointer/mobile controls were present.

### Full regression evidence

Current Validation on exact `7755a668...`:

- run `34474343862` — **SUCCESS**;
- artifact `10151068683`;
- digest `sha256:728f0f5c7dfa68a6fb5f11ab04a1fd7e8b6c55f8d63b6d123255fb54ffa4827d`.

Every historical lifecycle/prestart/cross-page/all-drop/exact-rebase/dual-browser/human-entry step passed.

## 9. Final delivery

Final delivery branch:

`world-v0-foundation-final-delivery`

Delivery head:

`fa5e45594f0c39ba4e96c13b4ef783bbaae1ba65`

It is a direct child of exact product `7755a668...` and adds delivery apparatus only.

Delivery:

- run `34475199474` / job `102864191837` — **SUCCESS**;
- Cloudflare Version ID `1cc9a0fd-2fac-4d23-a75d-c66669ddee01`;
- artifact `10151181384`;
- digest `sha256:4d0cdc5eb04bf3dcafdbad4ccd469b2db24f7d372f1549212d7e0321e3f49553`;
- protected runtime bytes matched exact product `7755a668...`;
- static convergence passed;
- human public Yard Durable Objects were not accessed by the delivery verifier;
- final marker: `HUMAN_DURABLE_OBJECTS_UNTOUCHED_BY_WORKFLOW`.

## 10. Retained reusable gates

Important retained validation includes:

- `.github/workflows/ci.yml`;
- `.github/workflows/world-v0-current-validation.yml`;
- `.github/workflows/world-v0-foundation-stabilization-causal-gate.yml`;
- `.github/workflows/world-v0-foundation-stabilization-delivery.yml`;
- `.github/workflows/world-v0-owner-ui-regression.yml`;
- `.github/workflows/world-v0-session-continuity-r1-qualification.yml`.

Classification of older remaining workflows should happen together with branch archaeology after freeze.

## 11. Accepted next-era architecture question

The fixed two-player stabilization model deliberately uses fresh-epoch handoff instead of live actor replacement. It therefore cannot preserve old shared-world state across that membership replacement.

Future persistent co-op / mini-MMO work must reconsider the separation:

`world lifetime != roster lifetime != ActorSession lifetime != transport/device lifetime`

Related future questions include 3+ membership, durable world identity/state, human identity spanning devices and actor succession. They are intentionally deferred until after safe stop and repository cleanup.

## 12. Remaining gate and stop condition

Broad product qualification is complete enough to stop expanding tests by momentum.

Only a short real-device sanity check remains:

1. desktop Diagnostics open/close -> WASD must continue immediately;
2. desktop fine-pointer -> no joystick/gimbal/JUMP;
3. mobile/coarse-pointer -> joystick/gimbal/JUMP remain present and usable.

If PASS:

- freeze exact product `7755a668...`;
- freeze qualified delivery Version `1cc9a0fd...`;
- record final Owner verdict;
- enter deliberate safe stop;
- inventory/classify branches/workflows before deletion;
- preserve provenance;
- then clean/consolidate repository;
- only afterward review Project Soul and next architecture direction.

If FAIL, repair only the reproduced UI regression unless evidence actually contradicts the broader core PASS.
