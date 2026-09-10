# Multi_World — Current State

Status: **FINAL STABILIZATION CANDIDATE / OWNER CORE PASS / UI SANITY PENDING**  
Grounded: **2026-09-10**  
Current product anchor: `7755a668d7488f04ecbf42a00fbc96fcb978d544`  
Polish branch: `world-v0-foundation-polish-closure`

This document answers **what is true now**. It does not replace [`MULTI_WORLD_PROJECT_SOUL.md`](MULTI_WORLD_PROJECT_SOUL.md), which remains unchanged until the deliberate safe-stop review.

---

## 1. Fast state

Multi_World now has a heavily challenged **two-player Shared Yard multiplayer foundation** with:

- server-authoritative Box3D world;
- browser prediction/replay and exact f32 state guards;
- scheduled canonical input and acknowledgement-driven jump delivery;
- ActorSession continuity independent of WebSocket lifetime;
- same-owner live F5/new-tab rebound;
- connected / protected / soft / vacant public-capacity semantics;
- demand-driven fresh-epoch handoff when dormant capacity is needed;
- bounded fresh recovery when reachable authority proves an in-memory WorldEpoch is gone;
- clearer join/lifecycle/transport failure classification;
- mobile/coarse-pointer controls and desktop keyboard controls.

The broad Owner desktop/mobile run on 2026-09-10 judged the game **stable and smooth** and did not reproduce a broad multiplayer/reliability failure. It exposed one local UI blocker: clicking Diagnostics left focus on the `<summary>` control and prevented WASD movement until another gameplay surface was clicked. Desktop also unnecessarily showed touch controls.

That UI issue has now been repaired, causally validated in real Chromium, fully regression-tested and delivered. Only a short Owner sanity check of that exact repair remains before freezing the baseline and entering safe stop.

---

## 2. Exact current candidate

### Product source

`7755a668d7488f04ecbf42a00fbc96fcb978d544`

Message:

`Rev World V0 browser UI for final owner focus repair`

This is the exact product source currently delivered for the final sanity check.

### Current qualified-play delivery

URL:

`https://cloudflare-multiplayer-lab-qualified-play.jozzpoly.workers.dev/world-v0/`

Final delivery:

- delivery branch `world-v0-foundation-final-delivery`;
- delivery head `fa5e45594f0c39ba4e96c13b4ef783bbaae1ba65`;
- run `34475199474` / job `102864191837` — **SUCCESS**;
- Cloudflare Version ID `1cc9a0fd-2fac-4d23-a75d-c66669ddee01`;
- artifact `10151181384`;
- digest `sha256:4d0cdc5eb04bf3dcafdbad4ccd469b2db24f7d372f1549212d7e0321e3f49553`;
- protected product bytes matched `7755a668...`;
- static convergence passed;
- `HUMAN_DURABLE_OBJECTS_UNTOUCHED_BY_WORKFLOW`.

### Runtime identity

Physics/simulation identity remains unchanged:

- contract `shared-yard-v0-contract-v14-jump-delivery-persistence`;
- authority `shared-yard-v0-authority-v11-jump-delivery-persistence`;
- browser sim `shared-yard-v0-browser-sim-v10-jump-delivery-persistence`;
- protocol `shared-yard-v0-scheduled-input-v3-supersession`;
- state guard `shared-yard-v0-f32-state-v1`;
- SimBuild `shared-yard-v0-sim-cd8edc169f791a64`.

Presentation/input identity now distinguishes the final repair:

- browser UI `shared-yard-v0-browser-ui-v20-owner-ui-focus`;
- keyboard focus guard `world-v0-keyboard-focus-guard-v2-semantic-ownership`;
- desktop touch controls `hidden-for-primary-fine-pointer-v1`.

Admission/lifecycle shell remains:

- session continuity `world-v0-session-continuity-r3-live-rebind`;
- public room entry `world-v0-public-room-entry-r3-presence-capacity`;
- public room directory `world-v0-public-room-directory-r4-vacant-capacity`;
- join failure clarity `world-v0-join-failure-clarity-v1`;
- authority epoch-loss recovery `world-v0-authority-epoch-loss-v1`.

---

## 3. Final Owner UI repair

The Owner recording isolated a local input-focus defect, not a network/simulation failure.

Repair semantics:

- editable controls (`input`, `textarea`, `select`, contenteditable) still own keyboard input and protect text entry from gameplay;
- interactive controls such as `summary`, buttons and links own their activation keys (`Space` / `Enter`) but no longer swallow unrelated gameplay WASD merely because they retain focus;
- keydown/keyup ownership is symmetric;
- touch joystick, camera gimbal and JUMP are hidden for primary fine-pointer desktop and shown for coarse-pointer/mobile surfaces.

Focused real-Chromium gate:

- run `34474057233` — **SUCCESS**;
- artifact `10150740652`;
- digest `sha256:62bb4b39cb70e46f280df7bfcae061a51bb5b72744a30817d456dc2c688df38d`;
- with Diagnostics `<summary>` still focused, physical `W` reached gameplay (`raw z = -1`);
- `Space` remained owned by Diagnostics and did not leak to gameplay;
- physical `w` in callsign remained text and did not reach gameplay;
- desktop controls were hidden; coarse-pointer/mobile controls were visible.

Full Current Validation on exact `7755a668...`:

- run `34474343862` — **SUCCESS**;
- artifact `10151068683`;
- digest `sha256:728f0f5c7dfa68a6fb5f11ab04a1fd7e8b6c55f8d63b6d123255fb54ffa4827d`;
- all historical lifecycle, prestart, cross-page, all-drop, exact-rebase, dual-browser and human-entry steps passed.

---

## 4. What the two-player foundation has earned

Within the fixed-2P envelope, evidence supports:

- deterministic shared physics and exact-state integrity;
- responsive ordinary foreground play;
- same-WorldEpoch / same-ActorSession recovery when authority still exists;
- bounded pre-start and committed-start recovery;
- same-owner live takeover without weakening foreign-profile protection;
- no permanent public-capacity ownership by dormant history;
- protected -> soft -> demand-driven handoff semantics;
- safe Resume-vs-fresh races with one authority-valid winner;
- stale old-epoch token rejection;
- bounded recovery from positively confirmed authority-epoch loss;
- fail-closed behavior when authority state is uncertain;
- keyboard text ownership and final semantic UI/gameplay keyboard ownership;
- desktop/mobile control-surface separation.

The 2026-09-10 Owner recording is human evidence that ordinary desktop play was stable and smooth and that the remaining visible defect was local UI/input ownership rather than broad multiplayer instability.

---

## 5. Important architectural boundary retained deliberately

The current implementation still uses a fixed deterministic two-actor topology. Therefore when one actor becomes replaceable and a new player needs the seat, the safe stabilization behavior is to rotate to a **fresh WorldEpoch** rather than mutate the roster inside the old epoch.

This means shared physical history in the old epoch is lost on that replacement handoff.

That is an accepted limitation of the current baseline, **not the intended long-term semantics** for a persistent co-op sandbox or mini-MMO. The future architecture must separate at least:

`world lifetime != roster lifetime != ActorSession lifetime != transport/device lifetime`

Do not implement that redesign during the current closure. Preserve it as a next-era architecture question after safe stop and repository cleanup.

---

## 6. Explicit nonclaims

The current foundation does not establish:

- durable reconstruction of a lost Box3D WorldEpoch;
- a world that persists unchanged for hours with nobody online;
- account/human identity spanning devices;
- arbitrary dynamic membership inside one deterministic epoch;
- 3+ player scalability;
- seamless MMO-style actor succession;
- guaranteed recovery through every mobile OS/radio suspension pattern;
- a final character controller or perfect jump feel.

The client still assumes exactly `self + one remote`.

---

## 7. Current decision and next move

Broad synthetic reliability expansion is stopped.

The remaining current-stage action is a **small Owner sanity check** of the newly delivered UI v20 candidate:

1. on desktop, open and close Diagnostics several times and confirm WASD keeps working immediately without clicking a touch control or refreshing;
2. confirm desktop no longer shows joystick/gimbal/JUMP;
3. on mobile, confirm joystick/gimbal/JUMP still appear and work.

If those three observations pass, freeze `7755a668...` / Cloudflare Version `1cc9a0fd...` as the two-player stabilization baseline and enter deliberate safe stop.

After that:

1. preserve exact evidence/provenance anchors;
2. prepare and execute controlled branch/workflow archaeology and cleanup — no mass deletion;
3. reconcile the stabilized baseline with the long-lived canonical repository branch;
4. review Project Soul / repository role only after cleanup;
5. only then open the next multiplayer architecture frontier, with 3+ players an early desired capability.

---

## 8. Fresh takeover order

1. `MULTI_WORLD_PROJECT_SOUL.md` — durable intent, intentionally not yet rewritten;
2. **this file** — current factual state;
3. `WORLD_V0_STABILIZATION_POLISH_LEDGER.md` — what was challenged/cleaned and preserved;
4. `WORLD_V0_FOUNDATION_STABILIZATION_DIRECTION.md` — closure order;
5. `WORLD_V0_QUALIFIED_BASELINE_GATE.md` — final human gate history;
6. newest issue #8 checkpoint for exact provenance;
7. older R0/R1/R2 docs only for a concrete historical question.
