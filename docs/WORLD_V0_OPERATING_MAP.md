# World V0 Operating Map

Verified snapshot: **2026-09-05 post-R1 critical review**

This is the short operational entry point for current Multi_World / World V0 work. It describes **current truth and sequencing**, not the full historical evidence base.

Current review:

`docs/WORLD_V0_POST_R1_REVIEW_2026-09-05.md`

## Source-of-truth rule

For current work:

1. **Owner hands-on judgement** — feel, usability, fun and product direction;
2. **live branch head + passing evidence** — implementation truth;
3. **qualified frozen specimens** — regression/control truth;
4. **this map + the current post-R1 review** — execution sequencing;
5. older phase plans / evidence overrides / Gate / WS0 / RC documents — historical design context and provenance.

Verify live heads before acting. Stored SHAs are grounded snapshots, not permanent aliases.

`main` is a navigation/documentation branch, not the live product runtime branch.

## Correct latest Owner gate

The latest preserved Owner hands-on closure before current work is issue #8 comment `5551557521` from 2026-09-05.

Owner conclusions:

- camera accepted for this stage;
- ~1 s startup hitch observed but currently non-blocking;
- repeated 12-prop Yard interactions are exhausted / becoming boring — **do not ask for more Owner solo repetition of the same toy**;
- missing capabilities felt in play: **jump, better multiplayer, much simpler friend entry/onboarding**;
- easier room/session continuity remains attractive;
- after the friend-ready/embodiment gap, desired direction is toward a more serious small cooperative living world / mini-MMO, without prebuilding MMO infrastructure.

F5 remains important foundation evidence but is not the latest Owner test.

## Active spine

| Role | Branch | Verified head | Meaning |
| --- | --- | --- | --- |
| Frozen foundation control | `world-v0-shared-yard` | `b27de8b04c27777250c47e7e936674e0f147fdfa` | Qualified Shared Yard foundation control. Preserve. |
| Pre-FR-A playable predecessor | `world-v0-playable-frontier` | `1699fb71b3abef425aea6e21cdb81cb7d11250d5` | Qualified v7 predecessor/control evidence. |
| **Current Friend-Ready source** | `world-v0-friend-ready-v1` | `5dd28a899c4f60c9227f1eb93026f571ced733e3` | Public friend-facing source. FR-A plus bounded mobile `lostpointercapture` release hardening. Frozen authority/protocol/SimBuild. |
| **Current public staging delivery** | `world-v0-staging-delivery` | `35902816a9bebe38b19d675267f8303ec32e6210` | Exact delivery of `5dd28a899...`, remotely qualified. |
| Mobile input-release witness/materialization | `world-v0-mobile-input-release-probe` | `ffce519dd8813fed3cac276f08e3a3783688652f` | Isolated evidence for current mobile release fix. |
| Bounded room-continuity probe | `world-v0-room-continuity-probe` | `4890b06a519649ed4b6d96ceba5a55edd590fc2b` | Machine-qualified opt-in RCP0. **Not default/public and not human product-validated.** |
| Stress / capacity research | `world-v0-capacity-cartography` | `d086f51792795d1ab73ba43f9e3b4dbf97441bb7` | Isolated Stress × Play research/radar lane. Not current product frontier. |
| Shared Consequence V1 correctness specimen | `world-v0-shared-consequence-v1` | `6fbf2b1e5fc11013cf0e1008e68915c3ef8dbe42` | Experimental 18-prop/20-entity correctness specimen. **Parked research, not product.** |
| Shared Consequence V1 phenomenon apparatus | `world-v0-shared-consequence-v1-phenomenon` | `d74a564cbbdc701cffe98a8eef113fdc16417b17` | One apparatus-only commit beyond V1. **Unrun and parked.** |

Parked Impact Lab remains historical/unqualified evidence and must not be promoted by momentum.

## Current public control

Source:

`world-v0-friend-ready-v1@5dd28a899c4f60c9227f1eb93026f571ced733e3`

The only runtime change from the previous `f9686b6...` Friend-Ready specimen is bounded mobile pointer-release hardening:

- joystick releases on `lostpointercapture`;
- camera gimbal releases on `lostpointercapture`;
- the interaction falsifier checks release state.

Isolated mobile-release evidence:

- `33970636391` — PASS;
- `33970636425` — PASS.

Public staging:

`https://cloudflare-multiplayer-lab-staging.jozzpoly.workers.dev/world-v0/`

Delivery:

`world-v0-staging-delivery@35902816a9bebe38b19d675267f8303ec32e6210`

Current delivery run:

**`33970892543` — PASS**

It passed:

- exact source identity / promoted-byte guard;
- isolated staging deployment and public provenance;
- remote authority + production isolation;
- remote camera/controller/lifecycle/shell;
- remote real-authority `Inspect solo`;
- remote exact-state on attempt 1, no retry needed.

Independent provenance-bound Friend Entry run:

**`33970892558` — PASS**.

Current public UI revision remains:

`shared-yard-v0-browser-ui-v8-friend-entry`

Frozen simulation identity remains:

`shared-yard-v0-sim-579c7aa172198390`

Also unchanged:

- server `shared-yard-v0-authority-v1`;
- protocol `shared-yard-v0-scheduled-input-v1`;
- state guard `shared-yard-v0-f32-state-v1`;
- client simulation `shared-yard-v0-browser-sim-v1`.

## Current sequencing

The active product sequence is:

**current public Friend-Ready control → natural real friend-play → strongest actual friction / emergent demand → one bounded next hypothesis**

This supersedes automatic feature queues such as:

`FR-A → RCP0 → jump → friend-play`

or any Stress × Play / Shared Consequence numbered progression.

Why: Friend Entry is now built and remotely qualified. The next missing evidence is whether two real people can enter naturally and whether current multiplayer/social presence produces value or exposes the next blocker.

Do not add a new default feature before that human gate unless a concrete blocker prevents the session itself.

## Friend Entry claim boundary

What is machine-qualified:

- host flow without requiring raw `Run` knowledge;
- Web-Crypto room identity on the normal host path;
- one-link invite/join path;
- existing two-player authority/protocol/SimBuild preserved;
- mobile release hardening;
- desktop + portrait shell;
- real-authority `Inspect solo`;
- public provenance and remote exact-state.

Not qualified by those tests:

- actual friend usability/friction;
- social fun or peer readability;
- Android/mobile performance generally;
- Firefox/WebKit;
- persistence;
- join-in-progress;
- reconnect/background-resume architecture;
- >2 players.

## RCP0

Probe:

`world-v0-room-continuity-probe@4890b06a519649ed4b6d96ceba5a55edd590fc2b`

Qualification:

**`33967238231` — PASS**.

It demonstrated repeated fresh epochs under one stable logical room/run identity while preserving the frozen authority/protocol/SimBuild and manual default behavior.

It did **not** demonstrate persistence, join-in-progress, hibernation/server reconstruction or recovery after correctness failures.

Critical semantic limitation: `peer_left_restart_required` comes from generic WebSocket close; it is not proof of voluntary social leave.

RCP0 remains technically viable but unearned as default product behavior. Real friend-session friction decides whether it returns.

## `Inspect solo`

`Inspect solo` remains a low-friction Owner/dev path with real authority and neutral AUTO peer.

It remains:

- `mode = inspection`;
- `qualificationEligible = false`.

Use it when a second human is irrelevant. Never upgrade it into two-human/social evidence.

## Shared Consequence — current classification

Read the full review before reopening:

`docs/WORLD_V0_POST_R1_REVIEW_2026-09-05.md`

Current classification:

- V0 real-authority phenomenon evidence is useful but weak (~2.1 cm max breakwall movement in the measured scenario);
- the calibrated geometry lab reproduced the V0 control exactly and showed strong sensitivity to train length/alignment;
- one-mediator + 4×2 split was the best distributed result in the bounded lab set, but no convincing cascade occurred;
- altered-layout ranking has not been independently reproduced in real authority;
- V1 correctness is strong locally, but product/fun/social value is unproven;
- the V1 phenomenon apparatus is unrun.

Therefore:

**preserve the lane as donor/research evidence; do not run or promote it by momentum.**

Reopen only if human play activates a physical-richness question.

## Evidence classes must stay separate

- foundation qualification — frozen two-player truth envelope;
- Friend-Ready qualification — current friend-facing source with frozen simulation/authority;
- remote staging qualification — exact public provenance + remote correctness;
- Owner hands-on judgement — product/feel evidence;
- real two-human/two-device friend-play — social presence, real human timing, device friction and product direction;
- RCP0 — lifecycle feasibility only until humans demonstrate value;
- Stress × Play / Shared Consequence — research/donor evidence until a product question activates it.

A PASS in one class must not be silently upgraded into another.

## Existing evidence capture is enough for first friend-play

Do **not** add a recorder, evidence archive UI, extra telemetry or player-facing diagnostics first.

The current runtime already stores the latest full evidence snapshot in browser `localStorage`, exposes live/last evidence helpers and keeps `Copy evidence` inside closed-by-default Diagnostics.

The single-latest-snapshot limitation is accepted for the first natural session. Owner observations and screen recording remain valid complementary evidence.

Friends should not be asked to operate Diagnostics unless a concrete problem makes that necessary.

## Immediate next work

The nearest decision-producing evidence is **natural real friend-play on the current public Friend-Ready control**.

Normal flow:

1. Owner enters the public world;
2. clicks `Invite friend`;
3. friend opens the link, enters a name and joins;
4. both play naturally.

Do not turn the friend into a QA operator.

Observe what actually emerges:

- entry/invite friction;
- whether social presence gives new value to the exhausted Yard;
- shared-object consequence and peer readability;
- artificiality/correction under real timing;
- whether lack of jump dominates;
- whether disconnect/round ceremony activates RCP0;
- what players spontaneously try that the world cannot support.

After that, classify observations as **MUST FIX / AMPLIFY / NEW PHENOMENON / RESEARCH QUESTION / DEFER**, then choose one bounded next problem.

Conditional candidates include jump, RCP0 refinement/promotion, targeted multiplayer coherence, richer physical/interactable content, a larger authored place, 3-player support or later persistence. None is automatically next.

## Workflow spine

Current Friend-Ready source:

`.github/workflows/world-v0-friend-ready-v1.yml`

Public staging:

`.github/workflows/world-v0-playable-staging-remote.yml`

Provenance-bound public Friend Entry:

`.github/workflows/world-v0-staging-fr-a-remote-entry.yml`

RCP0:

`.github/workflows/world-v0-room-continuity-probe.yml`

Stress × Play remains coordinated through issue #33. Shared Consequence workflows are research evidence, not current product sequence.

## PR #32

PR #32 remains **OPEN / DRAFT / DO NOT MERGE** and preserves the frozen foundation-control line at:

`world-v0-shared-yard@b27de8b04c27777250c47e7e936674e0f147fdfa`

## Fast takeover

A fresh session should normally:

1. read this file;
2. read `docs/WORLD_V0_POST_R1_REVIEW_2026-09-05.md`;
3. verify live heads for public source/delivery and any lane relevant to the task;
4. preserve the current public control unless new evidence contradicts it;
5. do not reopen repetitive Owner solo Yard testing, prewritten feature order or parked Shared Consequence work by default.

Full historical grounding is only needed when live evidence conflicts with this map or an older provenance question matters.
