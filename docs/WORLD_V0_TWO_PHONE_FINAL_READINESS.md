# World V0 — Two-Phone Final Readiness

Date: **2026-09-05**
Status: **bounded release-preparation stage before the first Owner + brother phone session**

This stage exists because the next real session is now known to use **two physical phones**. It does not reopen the product roadmap. Its purpose is narrower: remove or bound mobile-specific session blockers before the human gate while preserving the current remotely-qualified Friend-Ready control.

## 1. Objective

Reach a release state where all known machine-addressable two-phone risks are either:

- directly falsified and green;
- fixed by the smallest bounded mobile-only change and requalified; or
- explicitly deferred because only the two real phones can answer them.

The stage must end before it turns into general mobile polishing.

`perfect` cannot mean "proven on two phones without using two phones". The target is instead:

> exact public release + no known machine-reproducible mobile blocker + minimal remaining uncertainty isolated to the real devices.

The immediate human gate after this stage remains natural friend-play.

## 2. Grounded baseline

Frozen foundation:

`world-v0-shared-yard@b27de8b04c27777250c47e7e936674e0f147fdfa`

Current Friend-Ready source:

`world-v0-friend-ready-v1@5dd28a899c4f60c9227f1eb93026f571ced733e3`

Current public delivery:

`world-v0-staging-delivery@35902816a9bebe38b19d675267f8303ec32e6210`

Public staging:

`https://cloudflare-multiplayer-lab-staging.jozzpoly.workers.dev/world-v0/`

Current remote qualification:

- `33970892543` — PASS, including exact promoted bytes, public provenance, remote authority, presentation, portrait shell, Inspect solo and exact-state attempt 1;
- `33970892558` — PASS, independent provenance-bound Friend Entry.

Current source differs from the previous Friend-Ready specimen only by the bounded mobile release change:

- joystick releases on `lostpointercapture`;
- coarse-pointer camera gimbal releases on `lostpointercapture`;
- interaction evidence checks released gimbal state.

Isolated witness/materialization:

`world-v0-mobile-input-release-probe@ffce519dd8813fed3cac276f08e3a3783688652f`

with current preserved PASS evidence referenced in the Operating Map/post-R1 review.

Frozen simulation identity remains:

`shared-yard-v0-sim-579c7aa172198390`

## 3. Hard scope boundary

Allowed before the phone session:

- mobile pointer/input release correctness;
- touch camera/joystick/gimbal interruption handling;
- portrait/landscape viewport and orientation behavior;
- friend invite/join friction that is specifically worse on phones;
- browser-shell/safe-area/readability blockers;
- dedicated mobile-readiness falsifiers;
- exact requalification and staging provenance after any runtime change.

Forbidden unless a discovered blocker truly requires reopening them:

- jump;
- RCP0 promotion;
- Shared Consequence / Stress × Play;
- new world content;
- 3-player support;
- persistence / join-in-progress / hibernation architecture;
- authority/protocol/SimBuild changes;
- generic telemetry/recorder work;
- cosmetic redesign not tied to a session blocker.

Default protected paths for this stage remain:

- `src/**`;
- `wrangler.jsonc`;
- package/dependency graph;
- frozen authority/protocol/simulation code.

Any exception requires a newly demonstrated blocker and a fresh causal plan.

## 4. TPR0 — Freeze and provenance preflight

Before changing anything:

1. verify live Friend-Ready source and staging delivery heads;
2. verify staging product-source points to the exact source SHA;
3. verify latest canonical remote run and independent Friend Entry run are green;
4. preserve rollback targets;
5. compare any readiness candidate against the exact public source, not against stale docs.

Natural stop: one exact current public specimen is named and reproducible.

## 5. TPR1 — Mobile input interruption audit

This is the highest-priority machine-only risk class because real phones produce pointer lifecycle events that desktop mouse use does not.

### Already covered

- joystick `pointerup` / `pointercancel`;
- gimbal `pointerup` / `pointercancel`;
- joystick `lostpointercapture`;
- gimbal `lostpointercapture`;
- ordinary touch camera drag/pinch;
- portrait touch/controller smoke.

### Remaining questions to falsify

#### A. Canvas camera capture loss

The renderer canvas currently tracks touch pointers/pinch state and handles `pointerup`/`pointercancel`, but it does not have an explicit `lostpointercapture` release path equivalent to joystick/gimbal.

Falsifier:

- begin one-finger camera drag;
- force capture loss without relying on a normal pointer-up path;
- assert no stale `cameraTouchPointers`, `cameraOrbit.pointerId` or pinch state remains;
- repeat for a two-touch pinch transition.

If the browser lifecycle already guarantees a clean state under the tested path, do not patch. If a sticky state is reproduced, add the smallest renderer-canvas release handler and requalify.

#### B. Foreground interruption / visibility loss

Current `visibilitychange` records evidence but does not intentionally neutralize every active touch control.

Falsifier:

- hold movement or gimbal input;
- simulate blur / hidden visibility / interrupted pointer lifecycle;
- when execution resumes, verify movement and camera input are neutral rather than latched.

Do **not** turn this into reconnect/background-resume architecture. The requirement is only safe input release. If the socket/session itself ends after backgrounding, that remains a visible session/lifecycle outcome for later evidence.

Natural stop: no machine-reproducible sticky movement/camera state remains after normal release, cancel, capture loss or foreground interruption.

## 6. TPR2 — Phone viewport/orientation shell

The product already uses safe-area insets, coarse-pointer controls, a portrait camera preset and a `resize` handler. Current machine evidence includes portrait shell, but the real session may rotate phones.

Add one bounded responsive falsifier that exercises the same candidate through:

1. portrait mobile viewport;
2. live resize/rotation into landscape;
3. landscape control use;
4. rotation back to portrait;
5. joystick + gimbal/camera after each transition.

Required observations:

- renderer size/aspect update;
- no unusable overlap between session actions, joystick, gimbal, notice and diagnostics summary;
- controls remain within viewport;
- camera remains finite and within its existing orbit/clip contract;
- no stale touch state across rotation;
- no change to world/simulation identity.

This stage does not need every phone resolution. Use representative narrow portrait and wide landscape geometries and keep real-device geometry as the final human check.

Natural stop: orientation/viewport changes do not produce a blocker in the bounded browser falsifier.

## 7. TPR3 — Phone-to-phone invite UX decision

Current Friend Entry solved the raw `Run` problem, but `Invite friend` currently uses clipboard copy as its primary behavior.

For two phones, evaluate one narrow enhancement:

**prefer `navigator.share()` when Web Share is available and the call is inside the user's button gesture; otherwise retain the existing clipboard fallback.**

Why this is allowed in this stage:

- it directly reduces phone-to-phone onboarding friction;
- no authority/protocol/simulation change;
- Android Chrome supports the native share-sheet model relevant to the planned session;
- fallback preserves the already-qualified flow.

This is a candidate, not a mandatory patch.

Implement only if a bounded browser/unit falsifier can prove:

- supported path calls native share with the exact invite URL;
- cancellation/failure does not destroy the session;
- unsupported path still copies the exact invite URL;
- host/invitee room identity is unchanged.

Do not add QR infrastructure, account/contact systems or a lobby browser before the session.

Natural stop: either current copy flow is consciously retained or one minimal native-share enhancement is qualified.

## 8. TPR4 — Exact release qualification after any change

If TPR1–TPR3 produce **zero runtime changes**, do not create a fake new release merely for ceremony. Reuse the exact current public specimen and keep its existing PASS evidence.

If any runtime/presentation byte changes:

1. branch from exact current Friend-Ready source;
2. forbid authority/protocol/SimBuild/dependency drift;
3. run core/presentation/mobile/Inspect-solo/exact-state on fresh runners;
4. require the mobile-specific new falsifier to be a required gate;
5. promote one exact SHA into staging;
6. require public provenance;
7. require remote authority/presentation/exact-state;
8. require provenance-bound Friend Entry;
9. preserve the previous public specimen as rollback target.

No weakened thresholds and no "looks harmless" promotion.

Natural stop: one exact public SHA is the phone-session release candidate and every relevant machine gate is green.

## 9. TPR5 — Two-real-phone preflight immediately before natural play

This is deliberately tiny. It is not the friend-play itself and the brother should not become a QA operator.

Use the exact public release candidate.

Recommended initial environment:

- current stable Chrome/Chromium browser on both Android phones when practical;
- normal foreground use;
- same ordinary Wi-Fi is fine for the first session; network diversity is a later question;
- no screen recording required for the first minute because recording can change mobile frame behavior.

### 60–120 second technical check

1. Owner opens the canonical public page and enters normally.
2. Owner uses the actual `Invite friend` action.
3. Brother opens the received link, enters a name and joins.
4. Both confirm movement responds and releases normally.
5. Both confirm camera control responds and releases normally.
6. Briefly use the orientation in which the session will actually be played; if either person naturally rotates, confirm the layout remains usable.
7. If both see each other and shared props react, **stop testing and start playing**.

Do not open Diagnostics unless a concrete problem appears.

Do not intentionally background/reconnect/drop the session during the first natural play unless that behavior happens on its own.

If a blocker occurs, preserve the affected phone's latest evidence before starting repeated experiments where practical.

## 10. Session configuration recommendation

The final readiness target should support both portrait and landscape, but the session must not require a prescribed orientation.

If choosing one initial posture for the first two-phone play, landscape is a reasonable default because it gives the 3D world and dual bottom-corner controls more horizontal room. This is a convenience recommendation, not a qualified product requirement.

The actual preferred orientation should come from hands-on use.

## 11. Human acceptance boundary

Machine green is not `two-phone PASS`.

The first real-device preflight can close the readiness stage only if:

- both phones enter the exact same world without manual room-key explanation;
- both players can move and release movement reliably;
- both can control/release camera reliably;
- UI is usable in the orientation they naturally choose;
- no runtime failure or obviously broken frame behavior blocks play;
- peer and shared props are visibly live;
- the Owner is comfortable switching from "technical check" to actual play.

A small one-time startup hitch already observed on previous Owner hardware remains DEFER unless it becomes materially worse or repeated during this two-phone gate.

## 12. Failure classification

If the preflight fails, do not broaden scope immediately.

Classify first:

- **INPUT STICKY / TOUCH LIFECYCLE** — joystick/camera/gimbal does not release;
- **VIEWPORT / ORIENTATION** — controls or world become unusable after resize/rotation;
- **ENTRY / SHARE** — friend cannot receive/open/join naturally;
- **NETWORK / AUTHORITY** — world does not start, disconnects, identity/runtime failure;
- **PERFORMANCE** — sustained device-visible hitching after startup;
- **DEVICE-SPECIFIC** — only one phone/browser reproduces the fault;
- **PRODUCT, NOT READINESS** — world is boring, jump missing, continuity desired, etc.; carry to post-session synthesis instead of fixing during readiness.

Fix only the smallest demonstrated blocker, then rerun the minimum causal gate plus full exact/public qualification required by its blast radius.

## 13. Explicit stopping rule

Two-Phone Final Readiness ends when:

- no known machine-reproducible phone-session blocker remains;
- one exact public release is remotely qualified;
- the two real phones pass the tiny technical preflight.

Then **freeze the runtime and play**.

Do not spend the available brother/Owner attention on further apparatus, tuning or scripted validation once the session is viable.

The natural two-human session remains the evidence that chooses the next product problem.