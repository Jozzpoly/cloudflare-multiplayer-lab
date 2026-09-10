# World V0 — Qualified Baseline Gate

Status: **OWNER CORE QUALIFICATION PASS / FINAL UI SANITY PENDING**  
Updated: **2026-09-10**  
Current product source: `7755a668d7488f04ecbf42a00fbc96fcb978d544`  
Qualified-play environment: `cloudflare-multiplayer-lab-qualified-play`

## Purpose

This is the final human gate for the current fixed two-player Shared Yard foundation before safe stop.

The broad Owner qualification has already happened. It judged ordinary gameplay **stable and smooth** and did not reveal a new broad multiplayer/reliability failure. It did reveal one bounded local UI/input defect: clicking Diagnostics left focus on its `<summary>` and prevented WASD movement until another gameplay surface was clicked. Desktop also unnecessarily exposed the touch control surfaces.

That exact defect has now been repaired, causally verified, fully regression-tested and delivered. The remaining gate is therefore intentionally tiny: verify the repaired UI behavior on the Owner's real desktop/mobile devices. Do not repeat the entire adversarial campaign by momentum.

## Current delivered specimen

Owner URL:

`https://cloudflare-multiplayer-lab-qualified-play.jozzpoly.workers.dev/world-v0/`

Exact product commit:

`7755a668d7488f04ecbf42a00fbc96fcb978d544`

Final delivery:

- branch `world-v0-foundation-final-delivery`;
- delivery head `fa5e45594f0c39ba4e96c13b4ef783bbaae1ba65`;
- run `34475199474` / job `102864191837` — **SUCCESS**;
- Cloudflare Version ID `1cc9a0fd-2fac-4d23-a75d-c66669ddee01`;
- artifact `10151181384`;
- digest `sha256:4d0cdc5eb04bf3dcafdbad4ccd469b2db24f7d372f1549212d7e0321e3f49553`;
- protected product bytes matched exact `7755a668...`;
- static convergence passed;
- delivery ended with `HUMAN_DURABLE_OBJECTS_UNTOUCHED_BY_WORKFLOW`.

## Final UI repair identity

Physics/simulation identity remains unchanged:

- contract `shared-yard-v0-contract-v14-jump-delivery-persistence`;
- authority `shared-yard-v0-authority-v11-jump-delivery-persistence`;
- browser sim `shared-yard-v0-browser-sim-v10-jump-delivery-persistence`;
- protocol `shared-yard-v0-scheduled-input-v3-supersession`;
- state guard `shared-yard-v0-f32-state-v1`;
- SimBuild `shared-yard-v0-sim-cd8edc169f791a64`.

Presentation/input identity is now:

- browser UI `shared-yard-v0-browser-ui-v20-owner-ui-focus`;
- keyboard focus guard `world-v0-keyboard-focus-guard-v2-semantic-ownership`;
- desktop touch controls `hidden-for-primary-fine-pointer-v1`.

Admission/lifecycle shell remains:

- session continuity `world-v0-session-continuity-r3-live-rebind`;
- public room entry `world-v0-public-room-entry-r3-presence-capacity`;
- public room directory `world-v0-public-room-directory-r4-vacant-capacity`;
- join failure clarity `world-v0-join-failure-clarity-v1`;
- authority epoch-loss recovery `world-v0-authority-epoch-loss-v1`.

## Evidence already earned

Before the latest Owner run, the product had already passed:

- focused authority-loss/ordinary-outage requalification `34426373914`;
- full historical Current Validation `34426331772`;
- broad adversarial verification `34428181101` — **8/8 jobs success**;
- Resume-vs-fresh authority race `34428538218` — **SUCCESS**.

The broad campaign included repeated authority loss, background-hidden recovery, retained history across Yard 1/2/3, fresh remote Durable Objects, same-owner live rebound, soft/vacant capacity handoff, direct-link Resume and directory-outage fail-closed behavior.

After the Owner UI defect was isolated, the exact repair passed:

### Focused real-browser UI gate

- run `34474057233` — **SUCCESS**;
- artifact `10150740652`;
- digest `sha256:62bb4b39cb70e46f280df7bfcae061a51bb5b72744a30817d456dc2c688df38d`.

It proved in real Chromium:

- Diagnostics `<summary>` could retain focus while physical `W` still reached gameplay;
- `Space` remained owned by Diagnostics and did not leak to gameplay;
- physical `w` in the callsign remained text and did not reach gameplay;
- fine-pointer desktop hid joystick/gimbal/JUMP;
- coarse-pointer/mobile exposed them.

### Full regression after UI repair

- exact source `7755a668...`;
- Current Validation run `34474343862` — **SUCCESS**;
- artifact `10151068683`;
- digest `sha256:728f0f5c7dfa68a6fb5f11ab04a1fd7e8b6c55f8d63b6d123255fb54ffa4827d`.

All historical lifecycle, pre-start, cross-page, all-transport-loss, exact-rebase, dual-browser hard-drop and human-entry steps passed.

## Owner broad human verdict already earned

The 2026-09-10 Owner desktop/mobile recordings establish, within their scope:

- ordinary two-player foreground play was stable and smooth;
- no recurring recovery churn dominated normal play;
- no broad exact-state/network foundation failure was observed;
- mobile app/background switching remained usable in the observed run;
- the main reproducible defect was local Diagnostics keyboard-focus ownership.

This is enough to stop broad human retesting by default. The UI repair changed only the presentation/input shell, not simulation, protocol, authority physics or room lifecycle semantics.

## Remaining tiny sanity check

Use the same Owner URL and verify only:

1. **desktop:** open and close Diagnostics several times; immediately press WASD each time. Movement must continue without clicking a touch control and without refresh;
2. **desktop:** joystick, camera gimbal and JUMP must not be visible on a normal fine-pointer desktop;
3. **mobile:** joystick, camera gimbal and JUMP must still appear and remain usable.

If those pass, the current two-player stabilization baseline is ready to freeze.

## Accepted architectural boundary — not a current blocker

The current fixed-2P implementation deliberately rotates to a fresh WorldEpoch when a soft-reserved actor is replaced by a new player. That avoids unsafe in-epoch roster mutation, but it also loses the old epoch's shared physical history.

This is acceptable for the current stabilization baseline but **not** the intended long-term semantics for a persistent co-op sandbox or mini-MMO.

The next architecture era must revisit the separation:

`world lifetime != roster lifetime != ActorSession lifetime != transport/device lifetime`

Do not pull that redesign into this final sanity gate.

## PASS / FAIL

### PASS

If the three UI sanity observations above succeed, freeze exact product `7755a668...` and delivery Version `1cc9a0fd...`, then enter deliberate safe stop.

### FAIL

Only reopen repair work if the final delivered UI v20 still reproducibly:

- loses WASD after Diagnostics interaction;
- shows touch controls on a normal fine-pointer desktop;
- hides/breaks required controls on mobile/coarse pointer;
- or exposes a new foundation failure that contradicts the already-earned broad Owner PASS.

## What PASS earns

PASS earns safe stop, not immediate feature expansion:

1. freeze exact product and evidence anchors;
2. preserve final Owner verdict and issue #8 provenance;
3. inventory/classify branches and workflows before deleting anything;
4. reconcile the stabilized baseline with the long-lived canonical repository branch;
5. review Project Soul / repository role only after cleanup;
6. only then open the next multiplayer frontier, with 3+ players an early desired capability.
