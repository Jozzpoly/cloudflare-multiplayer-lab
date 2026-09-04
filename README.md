# Multi_World · Cloudflare Multiplayer Lab

Evidence-driven browser multiplayer R&D laboratory.

The repository has moved well beyond the original Gate 4A README. The current World V0 foundation is qualified, the active browser product has a remote-qualified **real-authority `Inspect solo`** path, explicit isolated staging delivery is operational, and Stress × Play / capacity research runs on a separate experimental lane.

For current work, start with:

**[`docs/WORLD_V0_OPERATING_MAP.md`](docs/WORLD_V0_OPERATING_MAP.md)**

It records the active lanes, source-of-truth hierarchy, current qualification workflow, `Inspect solo` semantics, staging delivery contract and historical-evidence policy.

## Current active spine

| Role | Branch | Verified 2026-09-04 snapshot |
| --- | --- | --- |
| Frozen foundation control | `world-v0-shared-yard` | `b27de8b04c27777250c47e7e936674e0f147fdfa` |
| Product / playable frontier | `world-v0-playable-frontier` | `34f4e9dac3cc749fc8ab15c2e234bbff33921a7c` |
| Explicit isolated staging delivery | `world-v0-staging-delivery` | `d110dee36aa5cff9f55da7ecff62257c96153d35` |
| Stress / capacity research | `world-v0-capacity-cartography` | `bd90f238684961fcd1485d493b0c3bbe9aeb72ec` |

Verify live branch heads before acting; these SHAs are a grounded snapshot, not permanent aliases.

## Current World V0 product state

- browser UI: `shared-yard-v0-browser-ui-v7-solo-inspection`;
- frozen SimBuild: `shared-yard-v0-sim-579c7aa172198390`;
- public isolated staging: `https://cloudflare-multiplayer-lab-staging.jozzpoly.workers.dev/world-v0/`;
- staging delivery run `33901496389`: full PASS, including explicit deploy, authority/production isolation, presentation/lifecycle, remote `Inspect solo`, and two-Chromium exact-state on attempt 1.

`Inspect solo` uses the real two-peer authority/session machinery with a lightweight neutral AUTO peer. Its evidence is marked `qualificationEligible=false`; it is an Owner inspection convenience, **not** a substitute for real two-human/two-device qualification when that is the question.

## Important boundaries

- `world-v0-shared-yard` is the frozen qualified control specimen. Do not casually move it.
- PR #32 remains **DRAFT / DO NOT MERGE**.
- Product work belongs on `world-v0-playable-frontier` and is promoted explicitly through `world-v0-staging-delivery`.
- Stress/capacity work belongs on the isolated research lane and does not silently redefine the foundation.
- `main` is currently the repository landing/navigation branch, not the live product runtime branch.

## Historical docs and branches

The older `gate-*`, `ws0-*`, `rc*`, `world-slice-*`, previous staging experiments and takeover generations are valuable evidence/provenance, but they are **not automatically the current execution plan**.

Do not delete historical evidence simply because it is old. Do not treat every preserved branch as active either. See the operating map for the `ACTIVE / HISTORICAL EVIDENCE / CLEANUP CANDIDATE` policy.

## Basic repository validation

```bash
npm install
npm run check
```

The exact validation required for World V0 depends on the causal blast radius; the active product and staging workflows encode the stronger browser/authority/exact-state gates.
