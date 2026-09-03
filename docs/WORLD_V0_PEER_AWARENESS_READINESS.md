# Shared Yard V0 — peer-awareness / camera readiness dossier

**Status:** `NOT READY — OWNER/DEVICE BASELINE REQUIRED`

**Purpose:** preparation and decision contract only. This document does **not** authorize implementation of a camera change, establishing shot, off-screen PEER indicator, physics expansion, merge, or Foundation redesign.

**Prepared after:** `world-v0-shared-yard@49fbd46cd656f0c38897df64e7a6916e3edb25d9`

---

## 1. Hard boundary

The next implementation must happen in a fresh conversation only after this readiness dossier has been challenged, the required Owner/device baseline has been classified, and the first bounded candidate has been explicitly selected.

Until then:

- do not implement a PEER edge indicator;
- do not implement camera symmetry merely because it is currently the strongest technical hypothesis;
- do not add new physics props;
- do not change Foundation timing, protocol, input semantics, rollback/history, authority, state guard, lifecycle, SimBuildId, or scene contract;
- keep PR #32 draft / DO NOT MERGE.

The goal of preparation is to reduce the next implementation to one falsifiable product experiment, not to predetermine its result.

---

## 2. Truth / provenance

### Qualified runtime baseline

`9572329f1e077fb5d365c8c28c39b476a3e7b2ca`

This is the current machine-qualified Product Shell + Spatial Presence checkpoint.

Relevant unchanged simulation identity:

- `SimBuildId = shared-yard-v0-sim-579c7aa172198390`
- `WORLD_V0_CLIENT_SIM_REVISION = shared-yard-v0-browser-sim-v1`
- `WORLD_V0_SERVER_REVISION = shared-yard-v0-authority-v1`
- `WORLD_V0_PROTOCOL_REVISION = shared-yard-v0-scheduled-input-v1`
- current presentation revision at the qualified checkpoint: `shared-yard-v0-browser-ui-v3-presence`

Local exact-state L2 evidence on `9572329f...`:

- workflow run `33803727000`, attempt 2;
- Chrome `152.0.7977.64`;
- verdict `WORLD_V0_PASS_REAL_CHROMIUM_EXACT_STATE_ENVELOPE`;
- common WorldEpoch `7e9d95ad-1667-4980-8dcb-6867f00f7661`;
- client A: B308, `51` exact matches, `0` mismatch, `0` pending, `0` remap failure, `0` runtime failure;
- client B: B311, `52` exact matches, `0` mismatch, `0` pending, `0` remap failure, `0` runtime failure;
- rollback/replay was exercised on both clients;
- harsh headless timing remains a correctness stress, **not** performance qualification.

### Premature hypothesis retained only as provenance

`b5da62f20921e0372769c260941c850969b46693`

This commit added only a six-line hidden DOM scaffold for an off-screen PEER indicator. It never implemented projection, styling, distance, evidence, or behavior. It is **not** an accepted design decision.

### Preparation cleanup

`49fbd46cd656f0c38897df64e7a6916e3edb25d9`

The premature scaffold was withdrawn and `public/world-v0/index.html` restored exactly to the qualified `9572329f...` blob. This cleanup passed:

- repository CI;
- frozen-F5 preflight;
- World V0 ordinary local-regression (authority + Product Lab + real rendered shell).

L2 was intentionally not requested for this exact static restoration.

---

## 3. What the current product already proves

Current Shared Yard presentation gives both clients:

- a physical YOU and PEER capsule;
- distinct YOU / PEER world-space labels;
- ground rings;
- authored spatial cues for COLLISION YARD, TOWER, and IMPULSE LANE;
- compact product shell with diagnostics collapsed by default;
- desktop and portrait camera presets;
- the same qualified multiplayer simulation underneath.

What this does **not** prove:

- Android performance or feel;
- that PEER is sufficiently readable during natural portrait play;
- that the current camera feels correctly oriented for both spawn slots;
- that losing sight of PEER during play is actually a problem for the Owner;
- that a HUD/off-screen cue improves rather than weakens physical shared-world presence;
- that an establishing camera transition feels natural;
- that any camera candidate should become permanent product behavior.

Canonical project provenance still places **Owner/device PLAY** at the next high-information boundary.

---

## 4. Problem statement — deliberately solution-neutral

We need to determine whether Shared Yard V0 gives a player, especially on a portrait phone viewport, enough **physical awareness of the other player and of the shared yard** to support the intended two-person play.

The target is not generic navigation efficiency and not “keep PEER visible at all times”.

The desired product property is closer to:

> I understand that another physical body is present in the same space, I can establish where they are when that matters, and the camera/UI does not make the world feel like a marker-following interface.

### Non-goals

This stage is not about:

- a final third-person camera system;
- minimaps;
- multi-target navigation for >2 players;
- spectating;
- final character facing/orientation;
- camera collision/occlusion systems;
- aim cameras;
- new player abilities;
- new shared physics objects;
- changing spawn positions unless evidence later makes that the smaller causal fix.

---

## 5. Newly demonstrated confounder: slot-dependent camera bias

The last rendered L1 pair appeared to show “mobile bad, desktop good”, but the two screenshots were not slot-symmetric:

- the portrait primary client was slot 0;
- the desktop peer client was slot 1.

Current camera presets use the same positive world-space X/Z offset for either slot and always look back at self.

Current authored starts:

- slot 0: `[-6.5, 0.82, -1.4]`
- slot 1: `[+6.5, 0.82, 0.0]`

Current follow offsets:

- desktop: `[+7.4, +6.3, +8.7]`, FOV `55°`;
- portrait: `[+9.4, +8.4, +11.8]`, FOV `62°`.

Analytic projection of the other spawn body under this camera geometry gives approximately:

| View | slot 0 sees PEER | slot 1 sees PEER | Interpretation |
| --- | ---: | ---: | --- |
| desktop current | NDC `(3.665? no — desktop ≈ 2.347, -1.969)` | NDC `(-0.503, 0.355)` | slot 0 strongly off-screen; slot 1 on-screen |
| portrait current | NDC `(3.665, -0.851)` | NDC `(-1.319, 0.257)` | slot 0 far off-screen; slot 1 only slightly outside frame |

The exact values are diagnostic geometry, not a product SLO. The important result is the asymmetry.

Therefore the earlier “add an edge indicator” hypothesis is not yet causal: it may merely mask a camera hemisphere error.

### Symmetric inward-camera probe

If X and Z camera hemisphere are mirrored by slot so each camera sits outward of its spawn and looks inward toward the Yard:

- desktop becomes symmetric and places PEER around NDC `(-0.503, 0.355)` for either slot — comfortably visible at the start;
- portrait becomes symmetric around NDC `(-1.319, 0.257)` — still just outside the narrow frame.

So there are at least **two separable questions**:

1. remove slot bias / make the camera point into the relevant space;
2. decide whether portrait needs extra onboarding or active off-screen awareness after that.

Do not collapse them into one feature.

---

## 6. Portrait framing bound

With symmetric inward portrait framing at the current FOV, simply pulling the camera back can include both start bodies without changing the physics world.

Approximate camera-distance scale needed for the peer horizontal NDC magnitude:

| scale vs current portrait offset | peer |x NDC| |
| ---: | ---: |
| 1.00× | 1.319 |
| 1.25× | 1.128 |
| 1.50× | 0.985 |
| 1.75× | 0.874 |
| 1.81× | ~0.850 |
| 2.00× | 0.786 |

This makes a **temporary establishing view** during the already-neutral B(0)→B(90) window technically plausible. It does not prove such a transition feels good.

Increasing portrait FOV alone far enough to solve the same start framing would require an aggressively wide view and would shrink world/readability. Treat that as a weak candidate unless Owner evidence specifically favors it.

---

## 7. Candidate matrix — candidates, not commitments

### C0 — Qualified baseline / no change

Purpose: determine whether the apparent peer-awareness issue is significant in real play at all.

Use current `v3-presence` camera/presence exactly as qualified.

C0 wins if Owner play shows that losing PEER from portrait view is natural/non-problematic and the slot bias does not materially hurt orientation.

### C1 — Slot-symmetric inward follow

Hypothesis:

> The strongest observed defect is not absence of a HUD cue but the fact that the same world-space camera offset points the two spawn slots into different hemispheres.

Candidate behavior:

- use existing `selfSlot` only as presentation input;
- mirror camera X/Z hemisphere so either slot faces inward toward shared Yard space;
- preserve self-owned follow camera;
- do not center continuously on PEER;
- no HUD cue;
- no simulation/input/network changes.

C1 is currently the strongest **technical** hypothesis, but is not authorized until Owner baseline confirms the camera bias matters hands-on.

### C2 — Temporary pre-start establishing view

Hypothesis:

> A narrow portrait display may only need a brief shared spatial establishment, not permanent multi-target framing.

Candidate behavior:

- use the existing neutral B(0)→B(90) period;
- initially frame both actors and meaningful Yard space;
- transition to self-owned inward follow before active input begins;
- no permanent camera dependence on the remote player once play starts.

Questions to falsify:

- does the transition itself feel artificial or disorienting?
- is ~1.5 s enough to establish spatial relation?
- does it delay the feeling of immediate control even though input is not yet active by contract?
- does it improve awareness after PEER later leaves frame, or only make the opening prettier?

### C3 — Contextual off-screen PEER cue

Only justified if Owner evidence still reports meaningful loss of the other player during active play after the camera problem is separated from viewport width.

First bounded version, if earned:

- one PEER only;
- subtle screen-edge direction cue;
- optional coarse planar XZ distance, not precision telemetry;
- hidden while PEER is inside an **awareness-safe** viewport region;
- robust if PEER is behind the camera;
- must not overlap compact product status, diagnostics, joystick, notice area, or safe-area insets;
- should visually subordinate itself to world-space PEER presence;
- no minimap/Wedge/overview complexity unless later evidence specifically earns it.

External HCI literature on off-screen visualization is useful directionally but does not choose C3 for this product. Studies comparing arrows/Halo/Wedge/overview methods show task-dependent tradeoffs and often smaller differences for simple/single-target tasks. Multi_World’s target metric is physical/social presence, not generic marker acquisition speed.

### C4 — Dynamic midpoint / two-target follow

Retained as a later candidate, not current favorite.

It can keep both players visible but allows the remote player to affect the local camera and zoom. That may harm self-control/readability and deserves its own experiment if simpler mechanisms fail.

---

## 8. Required Owner/device baseline before candidate selection

This is the remaining high-information preparation gate.

Use the current isolated staging Shared Yard with **no new peer-awareness implementation**.

Perform two fresh runs so slot order is swapped:

### Run A — phone is slot 0

1. Android Chromium joins the fresh Run key first.
2. Desktop Chromium joins second.
3. Play naturally for roughly 60–90 seconds minimum; a few minutes is preferable if the run remains useful.

### Run B — phone is slot 1

1. Desktop joins a new fresh Run key first.
2. Android joins second.
3. Repeat comparable natural play.

Do not turn this into a laboratory movement script. We need perceptual/product evidence.

Record observations separately for each run:

1. At the start, can you immediately tell that the other body exists and roughly where it is?
2. Does the camera feel pointed into the Yard / toward meaningful shared space, or away from what matters?
3. While moving, when PEER leaves the frame, does that feel frustrating/confusing or simply natural?
4. Do you find yourself wanting a navigation cue? If yes, when and why?
5. Would an edge marker feel useful, or would it make the experience more HUD/game-like and less physically shared?
6. Is the portrait world/prop interaction readable at the current scale/FOV?
7. Any input immediacy, correction hitch, artificiality, or performance issue must be logged separately from camera/peer-awareness observations.

### Classification after Owner baseline

- **slot 0 clearly worse; slot 1 acceptable:** C1 has strong evidence and should be first candidate.
- **both slots start acceptably, but active PEER loss is a real recurring problem:** C3 becomes more plausible; do not force C1 solely because geometry is asymmetric.
- **both slots need stronger initial shared-space understanding but active loss is acceptable:** C1 and/or C2 deserve comparison before any HUD cue.
- **no meaningful problem:** stop. C0 wins; proceed to the next product frontier instead of “fixing” awareness.
- **Foundation/feel failure dominates:** stop product expansion and classify that issue separately.

---

## 9. Machine evidence contract for any future camera / awareness candidate

### L0 — static/repository control

Require:

- standard repository CI PASS;
- frozen-F5 preflight PASS;
- no unintended changes to authority/protocol/simulation contract;
- expected UI revision change only when presentation behavior actually changes.

### L1 — local real-runtime product evidence

Ordinary `World V0 Validation` local-regression remains the default product gate:

- real Workerd authority smoke;
- Product Lab decision surface;
- real Chromium rendered Shared Yard shell.

The runtime-shell smoke must be strengthened for camera work. Current evidence is biased because the prior screenshot pair exercised different slots on different viewports.

Required future coverage:

- desktop slot 0;
- desktop slot 1;
- portrait slot 0;
- portrait slot 1;
- fresh two-client B(0) state;
- exact B(0) guard observed;
- `runtimeFailed = false`;
- `guardMismatches = 0`;
- `YOU` and `PEER` semantic presence intact;
- record `selfSlot`;
- record camera preset / hemisphere / phase;
- record PEER projected NDC or equivalent screen coordinate in evidence;
- preserve screenshots for the same live state.

Do not use “PEER must always be on-screen” as a universal PASS criterion. Criteria depend on the candidate:

- C1 should prove slot symmetry and intentional inward framing;
- C2 should prove both bodies are inside its establishing safe frame, then prove transition to self follow;
- C3 should prove cue visibility/direction when outside safe frame and disappearance when PEER returns inside it.

### Harness hardening needed before promotion

The short rendered shell run operates near a canonical input dead-man when headless SwiftShader is slow. A prior live screenshot caught a disconnect notice after evidence had already shown a healthy state.

Future visual capture should:

- snapshot semantic evidence immediately before each screenshot;
- capture quickly enough that the screenshot and evidence describe the same live phase;
- avoid interpreting a late dead-man notice as presentation state;
- keep long exact-state testing in the separate L2 gate rather than extending L1 unnecessarily.

### L2 — exact-state causal guard

Any candidate touching `public/world-v0/app.js` must use a final commit containing `[runtime-qualify]` and pass the existing two-process `local-workerd-chromium` exact-state falsifier unchanged.

Reason: `requestAnimationFrame` in `app.js` drives not only presentation but also `advancePrediction()` / scheduled input generation. Additional per-frame presentation work can therefore affect timing even when simulation semantics are unchanged.

L2 PASS must retain:

- same SimBuildId;
- zero exact state mismatches;
- zero pending guards at verdict;
- zero remap failures;
- zero runtime failures;
- corrections/replay allowed and exercised naturally;
- no timing-quality claim from hosted runner values.

### Remote staging

Do not run `[remote-staging]` for every speculative camera variant.

Use isolated remote qualification when:

- a candidate has survived local machine falsification and is being prepared for real Owner/device play; or
- a change affects deployment/runtime behavior that local Workerd cannot represent.

Keep root production isolation intact.

---

## 10. Promotion / rejection rules

A candidate is **not** promoted because:

- its screenshot looks nicer;
- its code is small;
- machine tests are green;
- HCI literature likes a similar technique;
- the previous conversation already started coding it.

A candidate can be promoted only if:

1. it addresses a problem observed or strongly supported by Owner/device evidence;
2. a simpler causal explanation has been ruled out or separated;
3. L0/L1 pass;
4. if `app.js` changes, L2 passes;
5. the Owner judges the result better hands-on for the intended physical/shared-world experience;
6. new drawbacks do not outweigh the gain.

Reject / stop if:

- C0 is already good enough;
- a HUD cue becomes the dominant way to perceive PEER;
- camera motion becomes remote-player-controlled or disorienting without clear benefit;
- widening/pulling back damages prop/world readability;
- the change creates a reproducible Foundation-class failure;
- Android performance or responsiveness degrades materially;
- evidence becomes ambiguous because slot, viewport, epoch, or camera phase is not controlled.

---

## 11. Relationship to physics expansion

Product Lab already suggested a later **Core interaction set** is preferable to a broader cluttered set:

- heavy co-op block;
- beam;
- ball.

The broader variant adding ramp + gate was visually less convincing and should not be carried forward by default.

However, do **not** start Core physics expansion until the current camera/peer-awareness question is either:

- accepted as C0/no problem, or
- resolved through a bounded camera/awareness candidate and Owner judgement.

This keeps causal blast radius small: first make sure two people can read the existing shared yard, then ask whether it needs richer things to do.

---

## 12. Readiness state machine

### Current state

`NOT READY — OWNER/DEVICE BASELINE REQUIRED`

Machine preparation is sufficient to run the baseline, but it is not sufficient to choose the next implementation.

### Becomes `READY FOR IMPLEMENTATION CONVERSATION` only when

- Run A and Run B Owner/device observations are captured;
- slot effect versus viewport effect is classified;
- the problem is judged real enough to solve (or C0 explicitly wins);
- exactly one first candidate is selected with a falsifiable hypothesis;
- its L1 assertions and Owner success/rejection criteria are fixed before coding;
- expected blast radius is explicit;
- no unresolved Foundation issue dominates the stage.

### Fresh-conversation startup mandate after READY

The new conversation should:

1. verify the exact branch head and this dossier first;
2. verify the selected candidate still follows from the recorded Owner evidence;
3. refuse to inherit discarded solutions merely from history;
4. implement only the first bounded candidate;
5. run its predetermined L0/L1/L2 validation tier;
6. stop at Owner judgement / natural experiment boundary;
7. not automatically continue into C2/C3/Core physics expansion.

---

## 13. Current recommendation, explicitly provisional

Before Owner baseline, the evidence ranks the hypotheses as:

1. **C1 slot-symmetric inward follow** — strongest causal technical hypothesis because a concrete slot bias is demonstrated;
2. **C2 temporary establishing view** — plausible portrait-specific complement if initial shared-space understanding remains weak after C1;
3. **C3 contextual off-screen PEER cue** — conditional fallback for a demonstrated active-play awareness problem;
4. **C4 dynamic two-target follow** — later, higher-coupling alternative;
5. **C0 no change** remains a legitimate winner if hands-on evidence says there is no meaningful product problem.

This ranking is preparation evidence, **not implementation authorization**.
