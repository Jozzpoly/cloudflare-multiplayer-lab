# World V0 Operating Map

Verified snapshot: **2026-09-05 after public FR-A qualification**

This is the short operational entry point for current Multi_World / World V0 work. It intentionally describes **current truth and sequencing**, not the full historical evidence base.

## Source-of-truth rule

For current work:

1. **Owner hands-on judgement** — feel, usability, fun and product direction;
2. **live branch head + its passing evidence** — implementation truth;
3. **qualified frozen specimens** — regression/control truth;
4. **this map + the current evidence override** — execution sequencing;
5. older phase plans, Gate / WS0 / RC / takeover documents — historical design context and provenance.

Verify live heads before acting. Stored SHAs below are grounded snapshots, not permanent aliases.

`main` is a navigation/documentation branch, not the live product runtime branch.

## Active spine

| Role | Branch | Verified head | Meaning |
| --- | --- | --- | --- |
| Frozen foundation control | `world-v0-shared-yard` | `b27de8b04c27777250c47e7e936674e0f147fdfa` | Qualified Shared Yard foundation control. Preserve. |
| Pre-FR-A playable predecessor | `world-v0-playable-frontier` | `1699fb71b3abef425aea6e21cdb81cb7d11250d5` | Qualified v7 execution substrate retained as predecessor/control evidence. It is no longer the current friend-facing public candidate. |
| **Qualified Friend-Ready source** | `world-v0-friend-ready-v1` | `f9686b6bb7e3414fbc9c2bc0bf981e14c65d09c6` | FR-A Friend Entry V1. Frozen authority/protocol/SimBuild. Current product source for public friend-play. |
| **Public staging delivery** | `world-v0-staging-delivery` | `a19eb34ed61a0cd69a7681c95b33bc67fd4e8d8d` | Exact remotely-qualified delivery of `f9686b6...`. |
| Bounded room-continuity probe | `world-v0-room-continuity-probe` | `4890b06a519649ed4b6d96ceba5a55edd590fc2b` | Machine-qualified opt-in RCP0 experiment. **Not deployed as the default/public control and not yet product-validated.** |
| Stress / capacity research | `world-v0-capacity-cartography` | `d086f51792795d1ab73ba43f9e3b4dbf97441bb7` | Isolated Stress × Play research/radar lane. Not current product frontier. |

Parked Impact Lab remains historical/unqualified evidence and must not be promoted by momentum.

## Current sequencing override

Read:

`docs/WORLD_V0_FRIEND_READY_EVIDENCE_OVERRIDE_2026-09-05.md`

The older:

`docs/WORLD_V0_FRIEND_READY_V1_PLAN.md`

remains useful for design detail, candidate experiments and pre-mortems, but its old execution order is **not mandatory**.

New evidence superseded the automatic sequence:

`FR-A → FR-B → jump → friend-play`

Current order is:

**public FR-A control → natural real friend-play → extract the strongest actual friction / emergent demand → choose one bounded next hypothesis**

Do not continue RCP0, jump or Stress × Play merely because they exist as named stages.

## Current public control — Friend Entry V1

Qualified source:

`world-v0-friend-ready-v1@f9686b6bb7e3414fbc9c2bc0bf981e14c65d09c6`

Branch qualification:

**`33965919935` — PASS**.

Current public staging:

`https://cloudflare-multiplayer-lab-staging.jozzpoly.workers.dev/world-v0/`

Delivery specimen:

`world-v0-staging-delivery@a19eb34ed61a0cd69a7681c95b33bc67fd4e8d8d`

Canonical staging run:

**`33967878227` — PASS on attempt 1**.

Independent provenance-bound Friend Entry run:

**`33967878206` — PASS**.

The public qualification now proves:

- exact promoted-product bytes from `f9686b6...`;
- explicit isolated Cloudflare staging deploy and exact public provenance;
- host entry without requiring raw `Run` knowledge on the normal path;
- one-link invite/join path for a second independent browser;
- authority + production isolation;
- camera/controller behavior;
- manual epoch-end → fresh restart lifecycle;
- desktop + portrait shell;
- real-authority `Inspect solo` preservation;
- remote two-Chromium exact-state.

Remote exact-state passed on its **first attempt**: approximately B303/B305, 50 exact guard matches and 0 mismatches on each client, `firstStateMismatch=null`, `runtimeFailed=false`.

Hosted Chromium/SwiftShader still exhibits prediction-backlog/startup-starvation diagnostics. With exact guards intact this is retained as hosted-environment diagnostic evidence, **not** upgraded into a normal-device performance claim and not treated as a demonstrated correctness failure.

## Friend Entry V1 claim boundary

FR-A changes friend-facing presentation/onboarding only.

Current public UI revision:

`shared-yard-v0-browser-ui-v8-friend-entry`

Frozen simulation identity remains:

`shared-yard-v0-sim-579c7aa172198390`

Also unchanged:

- server revision `shared-yard-v0-authority-v1`;
- protocol revision `shared-yard-v0-scheduled-input-v1`;
- state guard `shared-yard-v0-f32-state-v1`;
- client simulation `shared-yard-v0-browser-sim-v1`.

FR-A does **not** qualify Android/mobile performance generally, Firefox/WebKit, true human social presence, persistence, join-in-progress, reconnect/background-resume architecture, runtime topology changes or >2 players.

## RCP0 — what is demonstrated and what is not

Probe:

`world-v0-room-continuity-probe@4890b06a519649ed4b6d96ceba5a55edd590fc2b`

Qualification:

**`33967238231` — PASS**.

The opt-in client-side probe demonstrated repeated fresh-epoch continuity:

`E1 live → connection closes → host re-arms E2 → same invite returns → E2 live → connection closes → host re-arms E3`

It preserved:

- same run / logical `WorldId`;
- fresh `WorldEpoch` every round;
- same invite URL across epochs;
- one auto-rearm per ended epoch;
- default manual Friend-Ready lifecycle;
- frozen authority/protocol/SimBuild;
- `Inspect solo` and exact-state qualification.

### Critical semantic correction

`peer_left_restart_required` is **not proof of a voluntary social leave**. Current authority uses it for generic `webSocketClose`. The probe therefore treats the close as ambiguous and must not claim to know why the peer disappeared.

### Explicitly not part of the tested probe

- bounded standby expiry;
- hibernatable lobby architecture;
- persistence;
- join-in-progress;
- server reconstruction;
- automatic recovery after correctness/identity/authority failures.

RCP0 is technically viable inside its tested envelope. **That does not prove it improves real friend sessions.** Do not promote it before human evidence activates that need.

## `Inspect solo`

`Inspect solo` remains a low-friction Owner/dev path using the real authority and a neutral AUTO peer.

It remains explicitly:

- `mode = inspection`;
- `qualificationEligible = false`.

Use it for camera/control/UI/scene/product inspection when a second human is irrelevant. Never present it as two-human evidence when social presence, human timing or peer behavior is the question.

## Evidence classes must stay separate

- **foundation qualification** — frozen two-player Shared Yard control envelope;
- **Friend-Ready qualification** — current friend-facing product source while preserving frozen simulation/authority;
- **remote staging qualification** — proves the exact candidate is really public and behaves correctly on isolated staging;
- **Owner inspection / feel judgement** — subjective product evidence; may use `Inspect solo` where appropriate;
- **real two-human / two-device friend-play** — required for social presence, real human timing, real device friction and product direction;
- **RCP0 experiment** — lifecycle feasibility evidence only until humans demonstrate value;
- **Stress × Play research** — boundary/phenomenon research and donor evidence, not automatic product sequencing.

A PASS in one class must not be silently upgraded into another.

## Workflow spine

### Friend-Ready source

`.github/workflows/world-v0-friend-ready-v1.yml`

Purpose:

- prohibit drift in frozen authority/simulation/protocol/dependency/config paths;
- prove Friend Entry host/invite behavior;
- preserve normal controls/session/shell behavior;
- preserve `Inspect solo`;
- require fresh-runner exact-state.

### Public staging delivery

`.github/workflows/world-v0-playable-staging-remote.yml`

Purpose:

- exact source SHA + protected-byte guard;
- staging-only deploy;
- exact public provenance;
- authority + production isolation;
- presentation/lifecycle/shell;
- remote `Inspect solo`;
- remote exact-state with strict failure classification.

Additional Friend-Ready remote gate:

`.github/workflows/world-v0-staging-fr-a-remote-entry.yml`

It has no deployment authority. It waits until public provenance matches the exact delivery SHA and `f9686b6...`, then runs the real public host→invite→friend falsifier. This prevents the Friend Entry check from racing the deploy or accidentally testing stale public bytes.

### RCP0

`.github/workflows/world-v0-room-continuity-probe.yml`

This is an isolated experiment workflow. Its success does not make RCP0 the default product.

### Stress × Play

Issue #33 remains research coordination/evidence. Resume this lane when a concrete product question needs it, not by numbered-stage momentum.

## PR #32

PR #32 remains **OPEN / DRAFT / DO NOT MERGE**.

Its head is still:

`world-v0-shared-yard@b27de8b04c27777250c47e7e936674e0f147fdfa`

It preserves the frozen foundation-control line. Current product, delivery and research lanes intentionally live outside it.

## Branch hygiene

Use:

- **ACTIVE** — current execution lane or deliberately active bounded experiment;
- **HISTORICAL EVIDENCE** — preserved closed evidence;
- **CLEANUP CANDIDATE** — helper/probe branch whose unique evidence has been checked first.

Do not perform broad branch deletion during product work. Cleanup is not the current frontier.

## Fast takeover

A fresh Browser GPT / Codex session should normally:

1. read this file;
2. read `docs/WORLD_V0_FRIEND_READY_EVIDENCE_OVERRIDE_2026-09-05.md`;
3. use `docs/WORLD_V0_FRIEND_READY_V1_PLAN.md` only as detailed design/history where useful;
4. verify live heads for foundation, playable predecessor, Friend-Ready source, staging, RCP0 and Stress lane;
5. inspect the latest evidence relevant to the actual question;
6. preserve the public FR-A control unless new evidence contradicts it;
7. do not reopen repetitive 12-prop Yard testing or prewritten stage sequencing by default.

Full historical grounding is only needed if live evidence conflicts with this map or the task depends on older provenance.

## Immediate next work

The nearest decision-producing evidence is now **natural real friend-play on the public FR-A control**.

Do not turn friends into QA operators. Use the normal flow, play naturally, then extract what actually mattered.

After that session choose the next bounded problem from evidence. Candidate classes include:

- promote/refine RCP0 if drop/rejoin/round continuity is real friction;
- jump/support work if lack of vertical embodiment dominates;
- richer objects/interactions/physical phenomena if the world simply runs out of meaningful play;
- larger authored space if exploration pressure appears;
- third-player support if a real 3-person use case becomes immediate;
- persistence/join-in-progress/hibernatable lobby only if actual use activates those needs;
- Stress × Play donor work when a concrete product question needs its phenomena or measurements.

The correct answer may be something not on this list. **Human evidence now outranks the old feature sequence.**
