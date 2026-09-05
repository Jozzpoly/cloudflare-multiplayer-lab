# World V0 — Friend-Ready evidence override

Date: **2026-09-05**
Status: **current sequencing override after public FR-A qualification**

This document overrides the execution order in `WORLD_V0_FRIEND_READY_V1_PLAN.md` where new live evidence has made that order too speculative. The older plan remains useful as design context, pre-mortem material and a catalogue of candidate next problems. It is no longer a mandatory stage sequence.

## 1. What is now demonstrated

### FR-A Friend Entry V1 is complete as the current public control

Qualified source:

`world-v0-friend-ready-v1@f9686b6bb7e3414fbc9c2bc0bf981e14c65d09c6`

Branch qualification:

`33965919935` — PASS.

Current public delivery:

`world-v0-staging-delivery@a19eb34ed61a0cd69a7681c95b33bc67fd4e8d8d`

Canonical remote delivery run:

`33967878227` — PASS on attempt 1.

Independent provenance-bound Friend Entry run:

`33967878206` — PASS.

The public staging therefore demonstrates:

- host entry without raw `Run` knowledge on the normal path;
- one-link friend invite/join flow;
- exact public provenance back to `f9686b6...`;
- unchanged authority/protocol/SimBuild;
- remote authority + production isolation;
- camera/controller, manual fresh-epoch lifecycle, desktop/portrait shell and `Inspect solo` preservation;
- two-Chromium exact-state qualification on the first attempt.

Remote exact-state evidence reached approximately B303/B305 with **50 guard matches and 0 guard mismatches on each client**, `firstStateMismatch=null` and `runtimeFailed=false`.

Hosted Chromium still reports prediction backlog/startup starvation diagnostics. With exact guards intact this is evidence about the GitHub-hosted browser environment, not a demonstrated gameplay correctness failure. It does not qualify normal-device performance.

## 2. RCP0 result — technically viable, not yet product-validated

Probe:

`world-v0-room-continuity-probe@4890b06a519649ed4b6d96ceba5a55edd590fc2b`

Qualification run:

`33967238231` — PASS.

The bounded client-side probe demonstrated repeated fresh-epoch continuity under the same logical room identity:

`E1 live → connection closes → host re-arms E2 → same invite returns → E2 live → connection closes → host re-arms E3`

Evidence showed:

- three distinct `WorldEpoch` values;
- the same run key / logical `WorldId`;
- the same invite URL remained usable;
- exactly one auto-rearm per ended epoch;
- default Friend-Ready manual lifecycle remained intact;
- authority/protocol/SimBuild remained frozen;
- `Inspect solo` and fresh-runner exact-state still passed.

### Important correction

`peer_left_restart_required` is **not proof of a voluntary social leave**. The current authority emits that reason for generic `webSocketClose`. A transport disappearance, tab close or other ordinary socket close can therefore look the same to the server.

RCP0 must not be described as knowing why the peer left. Its evidence intentionally records the close as ambiguous.

### Scope reduction retained

The tested RCP0 does **not** include bounded standby expiry, hibernatable lobby architecture, persistence, join-in-progress or server reconstruction. Those are separate questions.

This is deliberate: adding standby/hibernation before proving that room continuity has human value would mix lifecycle, infrastructure and product hypotheses.

## 3. Sequencing decision

The old automatic sequence:

`FR-A → FR-B → J0 jump → real friend-play`

is superseded.

Current order is:

`public FR-A control → natural real friend-play → extract strongest actual friction / emergent demand → choose one bounded next hypothesis`

Do **not** promote RCP0 merely because its machine qualification is green.

Do **not** start jump merely because jump was previously named as the next missing verb.

Do **not** resume Stress × Play merely because its next numbered stage exists.

The next larger change must be earned by real use.

## 4. What the friend-play gate should answer

This is not a QA checklist. Two humans should enter through the normal public flow and play naturally.

Capture only what materially emerges:

- does entry/invite actually feel frictionless enough;
- does round ending / peer disappearance create enough friction that continuity deserves promotion;
- is lack of jump the dominant embodiment limitation;
- is the deeper problem simply that the current Yard has too little interesting physical play;
- what interaction do players spontaneously attempt that the world cannot yet support;
- does the space feel worth expanding;
- does real human timing expose artificiality, correction or device-specific problems not seen in hosted Chromium;
- does a third participant become an immediate real need rather than a roadmap assumption.

Owner judgement on fun, friction and product direction outranks machine-green speculation here.

## 5. Candidate next moves after friend-play

Choose one, not all:

- **RCP0 promotion / lifecycle refinement** if repeated room intent and drop/rejoin friction are clearly valuable;
- **jump/support experiment** if missing vertical embodiment dominates;
- **richer interaction verbs / objects / phenomena** if players mostly run out of meaningful things to do;
- **larger authored place** if exploration pressure appears;
- **third-player work** if a real 3-person session becomes the next practical use case;
- **persistence / join-in-progress / hibernatable lobby research** only if actual session behavior activates those needs;
- **Stress × Play donor work** when a concrete product question needs a physical phenomenon or scaling boundary.

A result may also be: none of the above; investigate the surprising behavior that actually mattered.

## 6. Protected truths

Keep these separate:

- frozen foundation control: `world-v0-shared-yard@b27de8b04c27777250c47e7e936674e0f147fdfa`;
- pre-FR-A playable predecessor: `world-v0-playable-frontier@1699fb71b3abef425aea6e21cdb81cb7d11250d5`;
- qualified Friend-Ready source: `world-v0-friend-ready-v1@f9686b6bb7e3414fbc9c2bc0bf981e14c65d09c6`;
- public delivery specimen: `world-v0-staging-delivery@a19eb34ed61a0cd69a7681c95b33bc67fd4e8d8d`;
- isolated RCP0 probe: `world-v0-room-continuity-probe@4890b06a519649ed4b6d96ceba5a55edd590fc2b`;
- Stress × Play research: `world-v0-capacity-cartography@d086f51792795d1ab73ba43f9e3b4dbf97441bb7`.

Frozen simulation identity remains:

`shared-yard-v0-sim-579c7aa172198390`

FR-A and RCP0 did not change authority, protocol or simulation.

## 7. Current stopping rule

The machine can continue preparing evidence and bounded probes, but the product should **not accumulate another default feature before the first natural friend-play on the now-public FR-A control**, unless a concrete blocking defect is discovered first.

That human session is now the nearest decision-producing evidence, not an optional ceremony at the end of a prewritten feature list.
