# Multi_World Recovery Semantic Index

Purpose: make retired research/history discoverable by meaning without weakening exact Git recovery identity. This supplements `recovery-manifest.json`; it does not replace it.

## Evidence binding

- history-aware audit run `34523544614`: SUCCESS; artifact `10170613068`, digest `sha256:d30174b224800eb2ef3b9b59e17869614bbc3bb4a194448f6d781a92c67e4fee`;
- history-wide external-payload audit run `34523320913`: SUCCESS; artifact `10170528863`, digest `sha256:eec4532878af99dbc3423267e4ff42743ad4e391bc886211400d76d9cae3153d`;
- frozen canonical: `7974e3d1eb8ed3a7236db11b0b772bc73ff3cea6`;
- exact recovery manifest SHA-256: `a779e80273b434f5d1844aca5f4ce13e0a9d33dd4fc9b8779c1abbc0e9d68ee0`.

## What the retrospective found

- **167** retired ref names / **144** distinct tips;
- **443** unique commits in the retired-history union relative to frozen canonical;
- **867** distinct blobs scanned by the external-payload retrospective;
- **0** historical Git LFS pointers and **0** gitlinks/submodules;
- **20/167** refs contain transient-only paths hidden by final net diff;
- **59/167** refs contain branch-only commits beyond the five recent commits shown by Cleanup Kit v3;
- **3** refs have `changedFileCount = 0` despite real historical work;
- **167** distinct transient-only paths are absent from the v3 tip-centric semantic summary.

## Important semantic witnesses

### `refs/heads/archive/box3d-do-feasibility`

- exact tip: `3ef3322d0ec52d85eb18e97b270642b73eb210e8`;
- branch-only commits: **11**;
- history-touched paths: **8**;
- v3 final changed-file count: **0**;
- historical top-level areas: `.github, package.json, src, wrangler.jsonc`;
- inspect full history with exact range `7974e3d1eb8ed3a7236db11b0b772bc73ff3cea6..3ef3322d0ec52d85eb18e97b270642b73eb210e8` or the machine index.

### `refs/heads/archive/world-v0-research-closure-2026-09-10`

- exact tip: `8cd9fed0b77ede237e76e15f10e7061d097b6b95`;
- branch-only commits: **193**;
- history-touched paths: **158**;
- v3 final changed-file count: **0**;
- historical top-level areas: `.github, DO_NOT_EXIST, docs, package-lock.json, package.json, public, scripts, src, wrangler.jsonc`;
- inspect full history with exact range `7974e3d1eb8ed3a7236db11b0b772bc73ff3cea6..8cd9fed0b77ede237e76e15f10e7061d097b6b95` or the machine index.

### `refs/heads/probe/box3d-do-feasibility`

- exact tip: `3ef3322d0ec52d85eb18e97b270642b73eb210e8`;
- branch-only commits: **11**;
- history-touched paths: **8**;
- v3 final changed-file count: **0**;
- historical top-level areas: `.github, package.json, src, wrangler.jsonc`;
- inspect full history with exact range `7974e3d1eb8ed3a7236db11b0b772bc73ff3cea6..3ef3322d0ec52d85eb18e97b270642b73eb210e8` or the machine index.

## Largest historical lines by branch-only commit count

| Retired ref | Tip | Commits | History paths | v3 net files | Transient-only |
|---|---|---:|---:|---:|---:|
| `refs/heads/archive/world-v0-research-closure-2026-09-10` | `8cd9fed0b77e…` | 193 | 158 | 0 | 158 |
| `refs/heads/world-v0-multiplayer-foundation-audit` | `ad8a14156c96…` | 63 | 50 | 44 | 6 |
| `refs/heads/world-v0-continuity-architecture-proofs` | `701fe2a1164c…` | 54 | 45 | 39 | 6 |
| `refs/heads/archive/world-v0-capacity-cartography` | `306e4cbee5ff…` | 37 | 27 | 27 | 0 |
| `refs/heads/world-v0-capacity-sp1c-ram-shock` | `306e4cbee5ff…` | 37 | 27 | 27 | 0 |
| `refs/heads/world-v0-shared-consequence-v1-phenomenon` | `d74a564cbbdc…` | 36 | 36 | 36 | 0 |
| `refs/heads/world-v0-jump-support-v0` | `63570c542577…` | 35 | 39 | 38 | 1 |
| `refs/heads/world-v0-shared-consequence-v1` | `6fbf2b1e5fc1…` | 35 | 35 | 35 | 0 |
| `refs/heads/world-v0-shared-consequence-geometry-lab` | `90f40f760932…` | 34 | 36 | 36 | 0 |
| `refs/heads/world-v0-capacity-sp1b1-preallocation` | `4de0be423f03…` | 33 | 24 | 24 | 0 |
| `refs/heads/world-v0-jump-support-probe` | `062e98e8f5ec…` | 32 | 42 | 41 | 1 |
| `refs/heads/world-v0-capacity-sp1b0-allocation` | `633a153f8674…` | 31 | 22 | 22 | 0 |

## Largest transient-history gaps

| Retired ref | Transient-only paths | Omitted commits vs v3 recent-five |
|---|---:|---:|
| `refs/heads/archive/world-v0-research-closure-2026-09-10` | 158 | 188 |
| `refs/heads/archive/box3d-do-feasibility` | 8 | 6 |
| `refs/heads/probe/box3d-do-feasibility` | 8 | 6 |
| `refs/heads/archive/world-v0-staging-delivery-pre-r2-owner-gate` | 6 | 15 |
| `refs/heads/world-v0-continuity-architecture-proofs` | 6 | 49 |
| `refs/heads/world-v0-multiplayer-foundation-audit` | 6 | 58 |
| `refs/heads/world-v0-staging-exact-drain-apparatus` | 6 | 15 |
| `refs/heads/gate-4b-shared-reactor-dynamics` | 4 | 3 |
| `refs/heads/world-v0-staging-r0-presentation-apparatus` | 4 | 10 |
| `refs/heads/archive/ws0-human-zero-reconciliation-control` | 2 | 6 |
| `refs/heads/ws0-human-two-player-mobile-baseline` | 2 | 6 |
| `refs/heads/gate-3-shared-world-game` | 1 | 0 |

## Recovery workflow

1. Resolve a retired branch name to its exact historical tip with `CATALOG.md` / `recovery-manifest.json`.
2. Use `MULTI_WORLD_RECOVERY_SEMANTIC_INDEX.json` to inspect all history-touched paths and branch-only commit subjects, including work later reverted before tip.
3. Inspect/recover by exact SHA from the aggregate archive lineage. Semantic metadata is navigation; exact object reachability remains recovery truth.
4. Same-repository archive reachability is not off-site disaster recovery; preserve the qualified bundle/evidence separately.

## Design lesson retained

A final tree diff answers “what differs at the end”; it does not answer “what happened on this research line.” Future cleanup tooling should model those as separate questions.
