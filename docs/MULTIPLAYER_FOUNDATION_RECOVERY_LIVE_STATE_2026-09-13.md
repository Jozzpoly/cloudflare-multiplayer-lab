# Multiplayer Foundation — Recovery Live State

Date: 2026-09-13

Status: **Gate 4A PASS / Gate 4B PASS / Gate 4C local stack L1–L4b PASS / not product-qualified**

This document is the current recovery/persistence source of truth for the `research/multiplayer-foundation-v1-2026-09-13` branch. Claims below are limited to executed evidence.

## Gate status

### Gate 4A — in-process exact authority recovery

**PASS / scoped headless specimen.**

A six-actor / twelve-prop authority runtime was checkpointed, its source Box3D world destroyed, and reconstructed from a seed-only Box3D Recording plus versioned roster/input state and semantic rebinding. The restored runtime remained exact through two post-restore topology churns.

Primary evidence: run `34782916504` — `MULTIPLAYER FOUNDATION AUTHORITY RECOVERY SMOKE PASS`.

### Gate 4B — fresh-process exact authority recovery

**PASS / scoped isolated-build specimen.**

The official `box3d.js@0.1.1` package exposes no supported Recording byte export/import path. The isolated exact-source build adds two research bindings: owned Recording-byte copy and RecPlayer creation from owned bytes.

Pinned provenance:

- box3d.js `5d5a3af049cccd9948b2b55bac4342414af0ef64`
- Box3D `8441b4a06d6d09dcfb0b0f704df4d847d1437b92`
- Emscripten `6.0.2`

Primary evidence:

- `34783226902` — byte bridge active-contact specimen PASS,
- `34783461543` — full authority envelope restored in a fresh Node process/fresh WASM and exact through tick `329` with post-restore churn; wrong engine/hash/boundary rejected before restore.

Original full authority envelope: `279068` bytes; physics payload: `41829` bytes.

### Gate 4C-L1 — transactional checkpoint-store model

**PASS / scoped fault campaign.**

Publication contract:

`immutable content-addressed chunks → immutable content-addressed manifest → atomic HEAD`

Run `34784584096` crashed before every durable mutation in a tested future generation while requiring the current generation to remain recoverable, rejected corrupt/missing published material and stale generations, and demonstrated content-addressed reuse.

### Gate 4C-L2 — SQLite-backed Durable Object restart

**PASS / scoped local workerd specimen.**

Run `34784856828` used real `ctx.storage.sql`, observed exactly one winner in a concurrent publication race, killed the entire Wrangler/workerd process, restarted against persisted storage, verified a changed constructor nonce, recovered the winning generation exactly, rejected duplicate generation publication, and continued publishing after restart.

This is local durability evidence, not real Cloudflare edge-eviction evidence.

### Gate 4C-L3 — authority envelope through durable restart

**PASS / scoped composition specimen.**

Run `34785027968` executed:

`live authority → 279068-byte envelope → chunked SQLite DO → full workerd death → fresh constructor → byte-exact envelope recovery → fresh Node/WASM authority consumer → exact future through tick 329`

Durable round-trip envelope SHA-256: `0069f1d40cd6faeb08ec29e2d8e92e1e3d4a2efdbcdcc3277559984f7058ae74`. Physics payload remained `41829` bytes.

### Gate 4C-L4a — Box3D inside workerd

**PASS / scoped Workers-runtime capability specimen.**

Run `34786781239` established the working pinned-runtime profile:

- statically imported precompiled `.wasm`,
- loader path tolerant of undefined `_scriptName`,
- Emscripten `-sDYNAMIC_EXECUTION=0`,
- CSP-safe non-JIT replacement for `box3d.js` facade `makeOutParamReader`,
- bounded unique engine rebind tokens because pinned Box3D has `B3_BODY_NAME_LENGTH = 18`.

The specimen copied `8451` Recording bytes, destroyed the source Recording/world, reconstructed inside workerd and continued an active-contact future exactly for 90 ticks.

### Gate 4C-L4b — authority reconstruction in a fresh Durable Object constructor

**PASS / scoped local Wrangler/workerd specimen.**

Primary evidence: run `34788380888`.

Executed path:

`live authority → serialized envelope → SQLite publication in DO #1 → full Wrangler/workerd death → DO #2 fresh constructor → blockConcurrencyWhile recovery → envelope validation → roster/input/topology reconstruction → Box3D reconstruction → semantic rebind → request handling → exact future through tick 329`

The harness required:

- first constructor state `empty`,
- publication not masquerading as in-memory recovery,
- full process kill,
- changed constructor nonce after restart,
- second constructor state `restored` **before** `/resume`,
- restored generation `1` at canonical tick `260`,
- physics payload `41829` bytes,
- exact continuation through tick `329`, including retire/replacement churn.

Final deterministic cross-runtime envelope: `279033` bytes. Gate 4B was re-run first with the same deterministic driver and passed before L4b.

Result: `MULTIPLAYER FOUNDATION AUTHORITY CONSTRUCTOR RESTART PASS`.

A second full qualification run was triggered after hardening deterministic-driver assertions; `34788380888` remains sufficient primary evidence independently of that repeat.

## L4b diagnostic boundary

The first constructor specimen restored successfully but diverged at tick `268`. Diagnostic instrumentation showed that **only `inputCheckpointDigest` differed**. `guardPacked`, roster, topology, outcomes and their digests remained exact. The mismatch arose after the physical step when the synthetic future-input driver used `Math.cos/Math.sin` in Node versus workerd.

The qualification did not weaken exact comparison or add tolerances. The synthetic transcendental branch was replaced in both test runtimes with exact cardinal inputs selected from integer state. Gate 4B then passed with that driver and L4b passed end-to-end.

Supported claim: **the recovered authority state and pinned physics runtime continue exactly across the tested Node→workerd boundary when the cross-runtime stimulus is itself exactly representable.** Arbitrary bit identity of host-JS transcendental functions across runtimes is not qualified and is not part of the recovery contract.

## Defended recovery findings

- Visible rigid-body fields are not an exact contact-world save state; hidden engine state matters.
- Seed-only Box3D Recordings can reconstruct worlds that accept new mutations and continue live simulation.
- Historical creation ordinals are not durable semantic identity after churn; the current scoped bridge uses bounded unique engine rebind tokens with fail-closed restored-domain validation.
- Portable roster/event/input/topology state has its own versioned checkpoint contract; exact physics alone is insufficient.
- Raw Box3D Recording bytes are build-specific recovery material, not a universal durable save format.
- Durable semantic truth, engine runtime checkpoint, transactional publication, and platform-specific reconstruction remain separate layers.
- Exact cross-runtime qualification needs deterministic host-side stimuli unless the numeric runtime pair itself is separately qualified.

## Storage boundaries

The store chunks payloads rather than assuming one arbitrarily large SQLite BLOB. Correctness currently precedes garbage collection; unreachable immutable material from interrupted future generations is tolerated until GC has its own qualification. Corruption of the published generation fails closed rather than silently falling back.

## Explicit non-claims

Still unproven:

- recovery after a real deployed Cloudflare edge eviction/platform lifecycle event,
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

The scoped **local recovery stack is now defended through a fresh Durable Object constructor**. The next qualitative durability boundary is deployed Cloudflare qualification: preserve the same fail-closed envelope/store/constructor contracts and test real platform lifecycle behavior rather than adding another local persistence abstraction.

Separately, production use requires an explicit packaging/versioning/fingerprint/upgrade policy for the custom Workers-compatible Box3D adapter. Local constructor recovery is strong architecture evidence; it is not a real-edge or product-readiness claim.