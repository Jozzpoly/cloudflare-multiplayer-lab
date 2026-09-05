# Multi_World · Cloudflare Multiplayer Lab

Evidence-driven browser multiplayer R&D laboratory evolving into a small shared physical living world.

For current work, start with:

**[`docs/WORLD_V0_OPERATING_MAP.md`](docs/WORLD_V0_OPERATING_MAP.md)**

Current product-phase plan:

**[`docs/WORLD_V0_FRIEND_READY_V1_PLAN.md`](docs/WORLD_V0_FRIEND_READY_V1_PLAN.md)**

The post-Owner audit that established this phase is preserved at:

**[`docs/WORLD_V0_POST_OWNER_REVIEW_2026-09-05.md`](docs/WORLD_V0_POST_OWNER_REVIEW_2026-09-05.md)**

## Current active spine

| Role | Branch | Verified 2026-09-05 snapshot |
| --- | --- | --- |
| Frozen foundation control | `world-v0-shared-yard` | `b27de8b04c27777250c47e7e936674e0f147fdfa` |
| Qualified product control | `world-v0-playable-frontier` | `1699fb71b3abef425aea6e21cdb81cb7d11250d5` |
| Remote delivery control | `world-v0-staging-delivery` | `d6e9d47d72aeac34bc6341a76ebdf7e53ff6522f` |
| **Active product candidate** | `world-v0-friend-ready-v1` | starts at `1699fb71b3abef425aea6e21cdb81cb7d11250d5` |
| Stress / capacity research | `world-v0-capacity-cartography` | `d086f51792795d1ab73ba43f9e3b4dbf97441bb7` |

Verify live heads before acting; these are grounded snapshots, not permanent aliases.

## Current phase

Shared Yard V0 has completed its role as the first world/product falsifier. Fresh Owner hands-on accepted the current camera state, noted only a short non-blocking startup hitch, and judged the existing 12-prop interactions exhausted/boring after repeated testing.

The next phase is **Friend-Ready World V1**:

1. simplify friend entry to a normal invite-link flow instead of exposing raw `Run` lab state;
2. add bounded room continuity for clean peer leave/rejoin while preserving fresh physical epochs;
3. keep authority/protocol/SimBuild frozen during those UX/session stages;
4. build **jump** later as a separate simulation candidate with its own SimBuild/causal qualification;
5. then run genuine two-human/two-device friend-play;
6. use that evidence to choose the first serious mini-MMO/living-world preparation problem.

Do not interpret `mini-MMO` as permission to build generic MMO infrastructure now.

## Qualified control state

- UI revision: `shared-yard-v0-browser-ui-v7-solo-inspection`;
- frozen SimBuild: `shared-yard-v0-sim-579c7aa172198390`;
- qualified playable run `33957370821`: PASS across fresh-runner core, presentation/lifecycle, `Inspect solo`, and two-Chromium exact-state;
- remote staging run `33957492089`: PASS on first attempt with exact product provenance, staging isolation, presentation/lifecycle, remote `Inspect solo`, and remote exact-state;
- public staging control: `https://cloudflare-multiplayer-lab-staging.jozzpoly.workers.dev/world-v0/`.

The delivery lane uses `.github/world-v0-product-source.json` and publishes `world-v0/deploy-provenance.json` so the exact promoted product SHA is mechanically checkable.

`Inspect solo` uses the real two-peer authority/session machinery with a neutral AUTO peer. Its evidence remains `qualificationEligible=false`: it is an Owner/dev convenience, not two-human qualification.

## Important boundaries

- `world-v0-shared-yard` remains the frozen foundation control.
- `world-v0-playable-frontier@1699fb71...` remains the current qualified product control until a replacement candidate is deliberately qualified/promoted.
- `world-v0-friend-ready-v1` is for friend-entry/session continuity only; it must not silently absorb jump/simulation changes.
- jump gets a separate causal candidate/new SimBuild.
- `world-v0-playable-impact-lab-v0@33ddd527...` remains parked/unqualified.
- Stress × Play is a research reserve, not the product roadmap.
- PR #32 remains **DRAFT / DO NOT MERGE** and represents the frozen foundation-control line.
- `main` is navigation/documentation, not live runtime.
- heavy Chromium/SwiftShader qualification classes remain isolated on fresh hosted runners.

## Basic repository validation

`main` is documentation/navigation and does not currently carry the playable dependency lock:

```bash
npm install
npm run check
```

On active playable/candidate/staging product specimens with committed `package-lock.json`, use:

```bash
npm ci
```

Exact validation depends on causal blast radius; use the active lane workflow rather than inventing ad-hoc thresholds.
