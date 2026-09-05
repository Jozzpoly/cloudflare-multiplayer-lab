# Multi_World · Cloudflare Multiplayer Lab

Evidence-driven browser multiplayer R&D laboratory.

The repository has moved well beyond the original Gate 4A README. The current World V0 foundation is qualified, the active browser product has a remote-qualified **real-authority `Inspect solo`** path, explicit isolated staging delivery is operational, and Stress × Play / capacity research runs on a separate experimental lane.

For current work, start with:

**[`docs/WORLD_V0_OPERATING_MAP.md`](docs/WORLD_V0_OPERATING_MAP.md)**

It records the active lanes, source-of-truth hierarchy, current qualification workflow, `Inspect solo` semantics, staging delivery contract and historical-evidence policy.

## Current active spine

| Role | Branch | Verified 2026-09-05 snapshot |
| --- | --- | --- |
| Frozen foundation control | `world-v0-shared-yard` | `b27de8b04c27777250c47e7e936674e0f147fdfa` |
| Product / playable frontier | `world-v0-playable-frontier` | `1699fb71b3abef425aea6e21cdb81cb7d11250d5` |
| Explicit isolated staging delivery | `world-v0-staging-delivery` | `d6e9d47d72aeac34bc6341a76ebdf7e53ff6522f` |
| Stress / capacity research | `world-v0-capacity-cartography` | `d086f51792795d1ab73ba43f9e3b4dbf97441bb7` |

Verify live branch heads before acting; these SHAs are a grounded snapshot, not permanent aliases.

## Current World V0 product state

- browser UI: `shared-yard-v0-browser-ui-v7-solo-inspection`;
- frozen SimBuild: `shared-yard-v0-sim-579c7aa172198390`;
- committed npm dependency lock is part of the playable product specimen; active playable qualification uses `npm ci`;
- public isolated staging: `https://cloudflare-multiplayer-lab-staging.jozzpoly.workers.dev/world-v0/`;
- playable qualification run `33957370821`: full PASS across isolated core, presentation/lifecycle, `Inspect solo`, and two-Chromium exact-state jobs;
- staging delivery run `33957492089`: full PASS on first attempt, including exact promoted-product provenance, explicit staging deploy, authority/production isolation, presentation/lifecycle, remote `Inspect solo`, and remote two-Chromium exact-state.

The staging lane now carries an explicit `.github/world-v0-product-source.json` promotion pointer and publishes `world-v0/deploy-provenance.json`. The delivery gate proves protected product/runtime bytes match the pinned playable SHA before deployment and then proves that exact provenance is public.

`Inspect solo` uses the real two-peer authority/session machinery with a lightweight neutral AUTO peer. Its evidence is marked `qualificationEligible=false`; it is an Owner inspection convenience, **not** a substitute for real two-human/two-device qualification when that is the question.

## Important boundaries

- `world-v0-shared-yard` is the frozen qualified control specimen. Do not casually move it.
- PR #32 remains **DRAFT / DO NOT MERGE**.
- Product work belongs on `world-v0-playable-frontier` and is promoted explicitly through `world-v0-staging-delivery`.
- Stress/capacity work belongs on the isolated research lane and does not silently redefine the foundation.
- `main` is currently the repository landing/navigation branch, not the live product runtime branch.
- Heavy Chromium/SwiftShader qualification classes are deliberately isolated onto fresh hosted runners; do not recombine them into one long browser-heavy job without new evidence.

## Historical docs and branches

The older `gate-*`, `ws0-*`, `rc*`, `world-slice-*`, previous staging experiments and takeover generations are valuable evidence/provenance, but they are **not automatically the current execution plan**.

Do not delete historical evidence simply because it is old. Do not treat every preserved branch as active either. See the operating map for the `ACTIVE / HISTORICAL EVIDENCE / CLEANUP CANDIDATE` policy.

## Basic repository validation

`main` is a navigation/documentation branch and does not currently carry the playable dependency lock. On `main`:

```bash
npm install
npm run check
```

On the active playable/staging product specimens, where `package-lock.json` is committed, use the locked graph (`npm ci`).

The exact validation required for World V0 depends on the causal blast radius; the active product and staging workflows encode the stronger browser/authority/exact-state gates.
