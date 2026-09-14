# Multiplayer Foundation — Recovery Live State

Date: 2026-09-14

Status: **Gate 4A PASS / Gate 4B PASS / Gate 4C local stack L1–L4b PASS / Gate 4C-R1 apparatus READY but remote recovery UNEXECUTED / not product-qualified**

This document is the recovery/persistence source of truth for `research/multiplayer-foundation-v1-2026-09-13`. Claims are limited to executed evidence.

## Defended local recovery stack

### Gate 4A — in-process exact authority recovery

**PASS / scoped headless specimen.** Run `34782916504` reconstructed a six-actor / twelve-prop authority after destroying the source Box3D world and remained exact through post-restore topology churn.

### Gate 4B — fresh-process exact authority recovery

**PASS / scoped isolated-build specimen.** The official `box3d.js@0.1.1` package does not expose the Recording byte import/export path needed by this recovery experiment. The research build therefore adds only owned Recording-byte export and RecPlayer creation from owned bytes.

Pinned provenance:

- box3d.js `5d5a3af049cccd9948b2b55bac4342414af0ef64`
- Box3D `8441b4a06d6d09dcfb0b0f704df4d847d1437b92`
- Emscripten `6.0.2`

Evidence:

- `34783226902` — active-contact byte bridge PASS.
- `34783461543` — `279068`-byte authority envelope containing `41829` physics bytes restored in a fresh Node process/fresh WASM and remained exact through tick `329`; incompatible engine/hash/boundary rejected before restore.

### Gate 4C-L1 — transactional checkpoint store

**PASS / scoped fault campaign.** Run `34784584096` defended:

`immutable content-addressed chunks → immutable manifest → atomic HEAD`

Interrupted future generations could leave unreachable immutable material but could not corrupt the published generation before HEAD. Corrupt/missing published material and stale generations failed closed.

### Gate 4C-L2 — SQLite Durable Object restart

**PASS / scoped local workerd specimen.** Run `34784856828` exercised real `ctx.storage.sql`, concurrent publication, full Wrangler/workerd process death, persisted restart with a changed constructor nonce, exact recovery, duplicate-generation rejection and post-restart publication.

### Gate 4C-L3 — authority envelope through durable restart

**PASS / scoped composition specimen.** Run `34785027968` executed:

`live authority → envelope → chunked SQLite DO → full workerd death → fresh constructor → envelope recovery → fresh Node/WASM consumer → exact future through tick 329`

Durable envelope SHA-256: `0069f1d40cd6faeb08ec29e2d8e92e1e3d4a2efdbcdcc3277559984f7058ae74`. Physics payload remained `41829` bytes.

### Gate 4C-L4a — Box3D inside workerd

**PASS / scoped Workers-runtime capability specimen.** Run `34786781239` established the required Workers-compatible runtime path:

- statically imported precompiled `.wasm`,
- loader tolerant of absent `_scriptName`,
- Emscripten `-sDYNAMIC_EXECUTION=0`,
- CSP-safe non-JIT replacement for facade `makeOutParamReader`,
- bounded unique engine rebind tokens because pinned Box3D has `B3_BODY_NAME_LENGTH = 18`.

The specimen copied `8451` Recording bytes, destroyed the source Recording/world, reconstructed inside workerd and continued an active-contact future exactly for 90 ticks.

### Gate 4C-L4b — fresh Durable Object constructor recovery

**PASS / scoped local Wrangler/workerd specimen.** Primary run `34788380888`; confirming run `34788569624`.

Executed path:

`live authority → serialized envelope → SQLite publication in DO #1 → full Wrangler/workerd death → DO #2 fresh constructor → blockConcurrencyWhile recovery → envelope validation → roster/input/topology reconstruction → Box3D reconstruction → semantic rebind → request handling → exact future through tick 329`

Qualification required first constructor state `empty`, full process death, changed constructor nonce, second constructor `restored` before `/resume`, generation `1` at tick `260`, `41829` physics bytes and exact continuation through tick `329` including retire/replacement churn.

The first diagnostic constructor specimen restored correctly but diverged at tick `268`. Instrumentation showed only `inputCheckpointDigest` differed; physics `guardPacked`, roster, topology, outcomes and their digests remained exact. The synthetic future-input driver used `Math.cos/Math.sin` across Node and workerd. Qualification replaced only that synthetic branch with exact cardinal inputs selected from integer state. No tolerance was introduced and equality was not weakened.

Supported claim: **recovered authority state and pinned physics continue exactly across the tested Node→workerd boundary when the cross-runtime stimulus is exactly representable.** Arbitrary bit identity of host-JS transcendental functions is not qualified.

## Gate 4C-R1 — deployed Cloudflare deployment-restart recovery

**APPARATUS READY / REMOTE RECOVERY UNEXECUTED.** No remote recovery PASS is claimed yet.

Dedicated target:

- deployment branch: `research/multiplayer-foundation-recovery-remote`
- currently deployed-branch ref before corrected setup: `d9a28a4cf162cbd9dff267308b014b68832aa948`
- Worker: `cloudflare-multiplayer-lab-foundation-recovery`
- canonical recovery Wrangler config: `workers/foundation-recovery-remote/wrangler.jsonc`
- Durable Object binding: `FOUNDATION_AUTHORITY_CONSTRUCTOR_TEST`
- storage: SQLite
- workers.dev only; no custom route
- trigger remains `idle / unarmed`

Intended qualification:

`deploy A → fresh constructor empty → independently generated exact envelope → generation-1 SQLite publication → deploy B → changed constructor nonce → constructor restores generation 1 before /resume → exact continuation through tick 329`

### Fail-closed repository contract

`scripts/deploy-foundation-recovery-remote.sh` refuses deployment unless all of the following hold:

- `WORKERS_CI=1`,
- `WRANGLER_CI_OVERRIDE_NAME = cloudflare-multiplayer-lab-foundation-recovery`,
- `WORKERS_CI_BRANCH = research/multiplayer-foundation-recovery-remote`,
- `WORKERS_CI_COMMIT_SHA` is a valid commit SHA,
- checked-out Git HEAD equals that exact SHA,
- the dedicated recovery Wrangler config exists.

The wrapper then installs the repository dependency graph, builds the pinned byte-capable/CSP-safe Box3D adapter and explicitly deploys only `workers/foundation-recovery-remote/wrangler.jsonc`. It does not rely on the root production/staging Wrangler config.

`foundation-recovery-remote-trigger.json` is fail-closed across `idle`, `seed` and `resume`. Both active audit phases wait until `/build` reports the exact expected Git SHA before accepting evidence. `seed` independently rebuilds producer material before checkpoint publication. `resume` requires a changed constructor nonce, `restoreState = restored` before `/resume`, generation `1` at tick `260`, `41829` physics bytes and exact continuation through tick `329`.

### Apparatus evidence

- `34789275755` — first complete remote bundle dry-run PASS.
- `34789277298` — ordinary CI PASS.
- `34792201941` — dedicated deployment branch `idle` classification PASS; `seed` and `resume` correctly skipped.
- `34792311322` — guarded Workers Builds deploy command + pinned Box3D rebuild + dedicated-config dry-run PASS.
- `34792313249` — ordinary CI PASS.
- `34792795657` — dry-run from the initially proposed isolated Worker root PASS in GitHub Actions.
- `34792812095` — ordinary CI PASS after removal of the superseded root-level recovery config.
- `34792941078` — CI PASS after source-of-truth consolidation.

### First real Workers Builds attempt — CONFIGURATION FAIL, no deployment evidence

The first account-side Workers Builds run on 2026-09-14 failed before Wrangler execution:

`bash ../../scripts/deploy-foundation-recovery-remote.sh: No such file or directory`

Observed cause: Cloudflare's configured `Root directory` behaves as the isolated project root for build/deploy commands. The initial assumption that a command launched from `/workers/foundation-recovery-remote/` could reach repository parents with `../../` was therefore false in the real Workers Builds environment. This failure happened before the deployment wrapper or Wrangler executed, so it is **not** a Worker runtime failure, Durable Object failure, or recovery test.

The corrected contract uses the full repository as the Workers Builds project root. This preserves access to shared research/build scripts while the guarded wrapper still explicitly selects the dedicated recovery Wrangler config.

Corrected repository-root evidence:

- head `f89bfe258256baf75efc90bc65e9fde936ce4c9f`
- CI `34793438765` — PASS.
- apparatus `34793436822` — **PASS** for the exact repository-root deploy command, including dependency install, pinned Box3D build, generated remote metadata and dedicated Worker `wrangler deploy --dry-run`.
- repository-root `.node-version` pins Node `22`; Cloudflare Workers Builds supports `.node-version` in the configured project root.

### Correct Workers Builds configuration

Before the deployment branch is advanced to the corrected validated head, Cloudflare must be configured as follows:

- production branch: `research/multiplayer-foundation-recovery-remote`
- **root directory: `/`**
- build command: empty
- **deploy command: `bash scripts/deploy-foundation-recovery-remote.sh`**
- non-production branch builds: disabled

The deployment branch must remain untouched until those account-side settings are corrected; moving the ref earlier would only trigger another build using the known-bad old Root directory configuration.

After the settings are corrected, advance the dedicated deployment branch to the validated corrected head, verify the resulting `idle` deployment identifies the exact Worker/branch/SHA, and only then arm the controlled `seed → resume` campaign.

A successful R1 qualifies an **intentional real Cloudflare code-deployment restart boundary only**. It must not be relabeled as spontaneous edge eviction, hibernation, failover or migration evidence.

## Defended architectural findings

- Visible rigid-body fields are not an exact contact-world save state; hidden engine state matters.
- Seed-only Box3D Recordings can reconstruct worlds that accept new mutations and continue live simulation.
- Historical creation ordinals are not durable semantic identity after churn; recovery uses bounded semantic rebind tokens with fail-closed restored-domain validation.
- Portable roster/event/input/topology state requires its own versioned checkpoint contract; exact physics alone is insufficient.
- Raw Box3D Recording bytes are build-specific recovery material, not a universal durable save format.
- Durable semantic truth, engine runtime checkpoint, transactional publication and platform-specific reconstruction remain separate layers.
- Exact cross-runtime qualification needs deterministic host-side stimuli unless the numeric runtime pair is separately qualified.

## Explicit non-claims

Still unproven:

- recovery across a successful real Cloudflare code deployment,
- spontaneous deployed Cloudflare eviction/hibernation/platform failover or migration survival,
- production packaging/distribution/upgrades for the custom Box3D byte bridge / CSP-safe Workers build,
- runtime-checkpoint compatibility across Box3D/box3d.js builds,
- arbitrary cross-runtime bit identity for host-JS transcendental math,
- large-world checkpoint sizing/cadence and GC policy,
- rollback networking,
- active authority migration between regions/hosts,
- large-world partitioned persistence,
- browser `self + N` bootstrap/recovery,
- real human 3–6 player qualification,
- universal donor qualification.

## Current next move

The local recovery stack is defended through a fresh Durable Object constructor. The remote apparatus is validated, and the first real Workers Builds attempt falsified the isolated-subdirectory setup before any Worker deployment occurred.

The next move is narrow: correct the Workers Builds Root directory to `/` and deploy command to `bash scripts/deploy-foundation-recovery-remote.sh`; then advance the dedicated deployment branch to the validated corrected head and verify an exact `idle` deployment before arming `seed → resume`.
