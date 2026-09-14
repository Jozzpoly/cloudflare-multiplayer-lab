# Multiplayer Foundation — Recovery Live State

Date: 2026-09-14

Status: **Gate 4A PASS / Gate 4B PASS / Gate 4C local stack L1–L4b PASS / remote deployment-restart gate READY but UNEXECUTED / not product-qualified**

This document is the recovery/persistence source of truth for the `research/multiplayer-foundation-v1-2026-09-13` branch. Claims are limited to executed evidence.

## Gate status

### Gate 4A — in-process exact authority recovery

**PASS / scoped headless specimen.** Run `34782916504` reconstructed a six-actor / twelve-prop authority after destroying the source Box3D world and remained exact through post-restore topology churn.

### Gate 4B — fresh-process exact authority recovery

**PASS / scoped isolated-build specimen.** The official `box3d.js@0.1.1` package exposes no supported Recording byte export/import path, so the research build adds only owned Recording-byte export and RecPlayer creation from owned bytes.

Pinned provenance:

- box3d.js `5d5a3af049cccd9948b2b55bac4342414af0ef64`
- Box3D `8441b4a06d6d09dcfb0b0f704df4d847d1437b92`
- Emscripten `6.0.2`

Evidence:

- `34783226902` — byte bridge active-contact specimen PASS.
- `34783461543` — full `279068`-byte authority envelope with `41829`-byte physics payload restored in a fresh Node process/fresh WASM and remained exact through tick `329`; wrong engine/hash/boundary rejected before restore.

### Gate 4C-L1 — transactional checkpoint store

**PASS / scoped fault campaign.** Run `34784584096` defended:

`immutable content-addressed chunks → immutable content-addressed manifest → atomic HEAD`

Crashes before future-generation durable mutations did not damage current recoverable truth; corrupt/missing published material and stale generations failed closed.

### Gate 4C-L2 — SQLite-backed Durable Object restart

**PASS / scoped local workerd specimen.** Run `34784856828` exercised real `ctx.storage.sql`, concurrent publication, full Wrangler/workerd process death, persisted restart with a changed constructor nonce, exact recovery, duplicate-generation rejection and post-restart publication.

This is local durability evidence, not real Cloudflare edge-eviction evidence.

### Gate 4C-L3 — full authority envelope through durable restart

**PASS / scoped composition specimen.** Run `34785027968` executed:

`live authority → 279068-byte envelope → chunked SQLite DO → full workerd death → fresh constructor → exact envelope recovery → fresh Node/WASM consumer → exact future through tick 329`

Durable envelope SHA-256: `0069f1d40cd6faeb08ec29e2d8e92e1e3d4a2efdbcdcc3277559984f7058ae74`. Physics remained `41829` bytes.

### Gate 4C-L4a — Box3D inside workerd

**PASS / scoped Workers-runtime capability specimen.** Run `34786781239` established:

- statically imported precompiled `.wasm`,
- loader path tolerant of undefined `_scriptName`,
- Emscripten `-sDYNAMIC_EXECUTION=0`,
- CSP-safe non-JIT replacement for facade `makeOutParamReader`,
- unique bounded engine rebind tokens because pinned Box3D has `B3_BODY_NAME_LENGTH = 18`.

The specimen copied `8451` Recording bytes, destroyed the source Recording/world, reconstructed inside workerd and continued an active-contact future exactly for 90 ticks.

### Gate 4C-L4b — fresh Durable Object constructor recovery

**PASS / scoped local Wrangler/workerd specimen.** Primary evidence: run `34788380888`.

Executed path:

`live authority → serialized envelope → SQLite publication in DO #1 → full Wrangler/workerd death → DO #2 fresh constructor → blockConcurrencyWhile recovery → envelope validation → roster/input/topology reconstruction → Box3D reconstruction → semantic rebind → request handling → exact future through tick 329`

The harness required first constructor state `empty`, full process kill, a changed constructor nonce, second constructor state `restored` before `/resume`, restored generation `1` at tick `260`, physics payload `41829` bytes, and exact post-restore continuation through tick `329` including retire/replacement churn.

Final deterministic cross-runtime envelope: `279033` bytes. Gate 4B was re-run first with the same driver and passed before L4b.

Result: `MULTIPLAYER FOUNDATION AUTHORITY CONSTRUCTOR RESTART PASS`.

Confirming evidence: run `34788569624` repeated the entire hardened qualification pipeline successfully, including deterministic-driver assertions, independent fresh Node/WASM Gate 4B verification and fresh-constructor L4b recovery. Both full post-confounder qualification runs are green.

### Gate 4C-R1 — deployed Cloudflare deployment-restart recovery

**READY / UNEXECUTED.** This is the next gate; no remote PASS is claimed yet.

The apparatus is isolated from `staging`, `reliability_play`, `qualified_play` and the production/root Worker. Its dedicated target is:

- deployment branch: `research/multiplayer-foundation-recovery-remote`
- Worker: `cloudflare-multiplayer-lab-foundation-recovery`
- Durable Object binding: `FOUNDATION_AUTHORITY_CONSTRUCTOR_TEST`
- storage: SQLite
- workers.dev only; no custom route

The intended executed path is deliberately two deployments of the same Worker/DO namespace:

`deploy A → fresh constructor empty → independently generated exact envelope → generation-1 SQLite publication → deploy B → fresh constructor nonce → constructor restores generation 1 before /resume → exact continuation through tick 329`

Repository safeguards:

- `scripts/deploy-foundation-recovery-remote.sh` refuses execution unless it is running under Workers Builds, the Cloudflare Worker override name is exactly the dedicated recovery Worker, the Workers Builds commit SHA is valid, and the checked-out HEAD is that exact SHA.
- The deployment wrapper builds the pinned byte-capable/CSP-safe Box3D adapter itself and invokes Wrangler with only `wrangler.foundation-authority-constructor-remote.jsonc`; it cannot fall through to the root `wrangler.jsonc` deployment path.
- `foundation-recovery-remote-trigger.json` is fail-closed across `idle`, `seed`, and `resume`; the dedicated branch currently remains `idle / unarmed`.
- Both remote audit phases wait until `/build` reports the exact expected Git commit before accepting evidence.
- `seed` independently rebuilds Gate 4B producer/consumer material before publishing the remote checkpoint.
- `resume` requires a changed constructor nonce, `restoreState = restored` before `/resume`, restored generation `1` at tick `260`, `41829` physics bytes, and exact continuation through tick `329` including post-checkpoint churn.

Executed apparatus evidence:

- run `34789275755` — first full remote bundle dry-run PASS.
- run `34789277298` — ordinary CI on the same head PASS.
- run `34792201941` — dedicated remote branch classification PASS in `idle`; `seed` and `resume` correctly skipped.
- run `34792311322` — exact fail-closed Workers Builds deploy command, including pinned Box3D rebuild and `wrangler deploy --dry-run` against the dedicated config, PASS.
- run `34792313249` — ordinary CI on the hardened deploy-command head PASS.
- dedicated deployment branch is synchronized to validated head `e6592462f35eeaec73099b1362167191baf92e72` and remains unarmed.

External prerequisite still pending: create/connect the dedicated Cloudflare Worker to that deployment branch with Workers Builds and set its deploy command to `bash scripts/deploy-foundation-recovery-remote.sh`. Until that account-side setup exists and both `seed` and `resume` execute remotely, Gate 4C-R1 remains UNEXECUTED.

This gate qualifies a **real Cloudflare code-deployment restart boundary**. It must not be relabeled as spontaneous edge eviction, hibernation, failover, or migration evidence.

## L4b diagnostic boundary

The first constructor specimen restored successfully but diverged at tick `268`. Instrumentation showed that **only `inputCheckpointDigest` differed**; physics `guardPacked`, roster, topology, outcomes and their digests remained exact. The mismatch appeared after the physical step when a synthetic future-input branch used `Math.cos/Math.sin` in Node versus workerd.

The qualification did not add tolerances or weaken equality. That synthetic branch was replaced in both test runtimes with exact cardinal inputs selected from integer state. Gate 4B then passed with the same deterministic driver and L4b passed end-to-end.

Supported claim: **recovered authority state and pinned physics continue exactly across the tested Node→workerd boundary when the cross-runtime stimulus is exactly representable.** Arbitrary bit identity of host-JS transcendental functions across runtimes is not qualified and is not part of the recovery contract.

## Defended recovery findings

- Visible rigid-body fields are not an exact contact-world save state; hidden engine state matters.
- Seed-only Box3D Recordings can reconstruct worlds that accept new mutations and continue live simulation.
- Historical creation ordinals are not durable semantic identity after churn; scoped recovery uses bounded unique engine rebind tokens with fail-closed restored-domain validation.
- Portable roster/event/input/topology state has its own versioned checkpoint contract; exact physics alone is insufficient.
- Raw Box3D Recording bytes are build-specific recovery material, not a universal durable save format.
- Durable semantic truth, engine runtime checkpoint, transactional publication and platform-specific reconstruction remain separate layers.
- Exact cross-runtime qualification needs deterministic host-side stimuli unless the numeric runtime pair is separately qualified.

## Storage boundaries

The store chunks payloads rather than assuming one arbitrarily large SQLite BLOB. Correctness currently precedes garbage collection; unreachable immutable material from interrupted future generations is tolerated until GC has separate qualification. Corruption of the published generation fails closed rather than silently falling back.

## Explicit non-claims

Still unproven:

- recovery across a real Cloudflare code deployment (Gate 4C-R1 apparatus is ready but not yet executed),
- recovery after spontaneous real deployed Cloudflare eviction, hibernation, platform restart/failover or migration,
- production packaging/distribution and upgrade policy for the custom Workers-compatible Box3D build,
- runtime-checkpoint compatibility across Box3D/box3d.js builds,
- arbitrary cross-runtime bit identity for host-JS transcendental math,
- large-world checkpoint sizing/cadence and garbage collection,
- rollback networking,
- active authority migration between regions/hosts,
- large-world partitioned persistence,
- browser `self + N` bootstrap/recovery,
- real human 3–6 player qualification,
- universal donor qualification.

## Current next move

The scoped **local recovery stack is defended through a fresh Durable Object constructor**, and the isolated remote deployment-restart apparatus is validated but unexecuted. The next qualitative durability boundary is to connect the dedicated Worker to `research/multiplayer-foundation-recovery-remote`, leave it unarmed until the exact Worker/branch/deploy-command configuration is verified, then execute the controlled two-deployment `seed → resume` campaign.

A successful R1 would establish recovery across an intentional real Cloudflare code-deployment restart only. Natural eviction/hibernation/failover remains a separate later question and must be evidenced independently.

Separately, production use requires an explicit packaging/versioning/fingerprint/upgrade policy for the custom Workers-compatible Box3D adapter. Local constructor recovery is strong architecture evidence; it is not a real-edge or product-readiness claim.
