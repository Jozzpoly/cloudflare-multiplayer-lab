# Multiplayer Foundation — Recovery Live State

Date: 2026-09-13

Status: **Gate 4A PASS / Gate 4B PASS / Gate 4C local stack L1–L4b PASS / not product-qualified**

This document is the current recovery/persistence source of truth for the `research/multiplayer-foundation-v1-2026-09-13` branch. It narrows claims to executed evidence and intentionally does not redefine the long-horizon architecture.

## Current gate split

### Gate 4A — in-process exact authority recovery

**PASS / scoped headless specimen.**

A full six-actor / twelve-prop authority runtime can be checkpointed, its source Box3D world destroyed, and then reconstructed from a seed-only Box3D Recording plus versioned roster/input state and semantic body-name rebinding. The restored runtime remained exact from canonical tick 280 through 359, including two topology churns after restore.

Primary evidence:

- run `34782916504` — `completed / success`
- `MULTIPLAYER FOUNDATION AUTHORITY RECOVERY SMOKE PASS`

Supporting evidence includes `34776263334`, `34776410333`, `34776592833`, and `34782697280`.

### Gate 4B — exact recovery across a fresh process boundary

**PASS / scoped isolated-build specimen.**

The official `box3d.js@0.1.1` package does not expose a supported Recording byte export/import path. Capability probe `34783020413` returned `NO_DIRECT_BYTE_PATH`; no hidden `HEAPU8`, `ccall`, or `cwrap` path is used.

An isolated exact-source build adds only two experimental bindings:

- copy `b3Recording` into an owned `Uint8Array`,
- create a `b3RecPlayer` from supplied `Uint8Array` bytes.

Pinned build provenance:

- `box3d.js`: `5d5a3af049cccd9948b2b55bac4342414af0ef64`
- Box3D submodule: `8441b4a06d6d09dcfb0b0f704df4d847d1437b92`
- Emscripten: `6.0.2`

Byte-bridge evidence:

- run `34783226902` — simple active-contact seed snapshot `8451` bytes, source world/Recording destroyed before import, exact 120-tick future, malformed/truncated inputs rejected.

Fresh-process authority evidence:

- run `34783461543` — `completed / success`
- full authority envelope: `279068` bytes
- embedded Box3D physics payload: `41829` bytes
- producer destroyed source world/Recording
- fresh Node process + fresh WASM restored only from serialized envelope
- exact continuation through canonical tick `329`, including post-restore retire→replacement churn
- wrong engine fingerprint, physics SHA-256, and canonical boundary rejected before restore
- `MULTIPLAYER FOUNDATION AUTHORITY BYTE PROCESS SMOKE PASS`

Gate 4B establishes process-boundary recovery for this scoped specimen. It does not make the Box3D snapshot a portable long-term save format.

### Gate 4C — durable storage / authority constructor restart

**PASS through L4b for the scoped local Wrangler/workerd stack. Real deployed Cloudflare edge eviction remains unproven.**

#### Gate 4C-L1 — transactional checkpoint-store model

**PASS / scoped deterministic fault campaign.**

The publication contract is:

`immutable content-addressed chunks → immutable content-addressed manifest → atomic HEAD publication`

HEAD is the only mutable pointer. Incomplete future generations may leak unreachable immutable material, but may not alter current recoverable truth.

Run `34784584096` completed successfully. The campaign crashed before every durable mutation of a tested generation-2 publication while requiring generation 1 to remain exactly recoverable, rejected corrupt/missing current-generation material and stale generations, and demonstrated content-addressed reuse.

Result: `MULTIPLAYER FOUNDATION CHECKPOINT STORE PASS`.

#### Gate 4C-L2 — real SQLite-backed Durable Object storage restart

**PASS / scoped local Workers runtime specimen.**

Run `34784856828` used a real SQLite-backed Durable Object in local Wrangler/workerd, raced two generation-2 publications with exactly one winner, killed the complete process, restarted against the same persisted storage, verified a new constructor nonce, recovered the winning generation exactly, rejected a duplicate generation, and successfully published generation 3 after restart.

Observed database size: `1097728` bytes.

Result: `MULTIPLAYER FOUNDATION SQLITE RESTART PASS`.

This is local durability evidence, not actual Cloudflare edge-eviction evidence.

#### Gate 4C-L3 — full authority envelope through durable SQLite restart

**PASS / scoped composition specimen.**

Run `34785027968` composed Gate 4B with the SQLite store without teaching the store about physics or roster semantics.

Executed path:

`live authority → 279068-byte authority envelope → chunked SQLite DO → full workerd death → fresh DO constructor → byte-exact envelope recovery → fresh Node/WASM authority consumer → exact future through tick 329`

Evidence:

- envelope SHA-256 after durable round-trip: `0069f1d40cd6faeb08ec29e2d8e92e1e3d4a2efdbcdcc3277559984f7058ae74`,
- embedded physics payload: `41829` bytes,
- constructor nonce changed after the full process restart,
- recovered envelope bytes matched exactly,
- fresh Node/WASM continuation remained exact through post-restore churn.

Results: `MULTIPLAYER FOUNDATION SQLITE PAYLOAD RESTART PASS` and `MULTIPLAYER FOUNDATION AUTHORITY BYTE PROCESS CONSUMER PASS`.

#### Gate 4C-L4a — byte-capable Box3D inside workerd

**PASS / scoped Workers-runtime capability specimen.**

Run `34786781239` rebuilt the same pinned Box3D/box3d.js source and established the minimum workerd-compatible packaging profile.

Required constraints:

- statically imported precompiled `.wasm` rather than runtime Wasm generation,
- `_scriptName`-safe generated loader path,
- Emscripten `6.0.2` with `-sDYNAMIC_EXECUTION=0`,
- CSP-safe non-JIT replacement for the facade `makeOutParamReader`,
- unique bounded engine rebind tokens because pinned Box3D has `B3_BODY_NAME_LENGTH = 18`.

The specimen copied `8451` Recording bytes, destroyed the source Recording/world, reconstructed a RecPlayer inside workerd, and remained exact through 90 active-contact ticks.

Result: `MULTIPLAYER FOUNDATION BOX3D WORKERD RUNTIME PASS`.

This qualifies the pinned research runtime path, not a production distribution/package.

#### Gate 4C-L4b — full authority reconstruction in a fresh Durable Object constructor

**PASS / scoped local Wrangler/workerd specimen.**

Primary PASS: run `34788380888`.

Executed path:

`live authority → serialized authority envelope → chunked SQLite publication in DO #1 → full Wrangler/workerd death → DO #2 fresh constructor → blockConcurrencyWhile recovery → envelope validation → roster/input/topology reconstruction → Box3D RecPlayer reconstruction → semantic rebind → request handling → exact continuation through tick 329`

The harness required the first constructor to remain `empty` after publication, killed the full process, required a changed nonce plus `restoreState = restored` from the second constructor **before** `/resume`, and then required exact post-restore future including retire/replacement churn.

Primary-run evidence:

- envelope: `279033` bytes,
- physics: `41829` bytes,
- independent fresh Node/WASM Gate 4B check: PASS before constructor recovery,
- fresh DO constructor recovery: PASS,
- exact authority future: through tick `329`.

Result: `MULTIPLAYER FOUNDATION AUTHORITY CONSTRUCTOR RESTART PASS`.

A second full qualification run was triggered after hardening assertions around the deterministic cross-runtime driver. Until that completes, `34788380888` remains sufficient primary L4b evidence; the gate claim does not depend on the repeat.

##### Diagnostic boundary before the PASS

The first constructor specimen restored successfully but diverged at tick `268`. Instrumentation showed that **only `inputCheckpointDigest` differed**; `guardPacked`, roster, topology, outcomes and their digests were exact. The difference appeared after the physical step when the synthetic test driver generated its next input with `Math.cos/Math.sin` in Node versus workerd.

The final qualification did not weaken equality or add tolerances. It replaced that synthetic transcendental branch in both test runtimes with exact cardinal inputs selected from integer state, re-ran Gate 4B first, and then passed L4b end-to-end.

Supported claim: **the recovered authority state and pinned physics runtime continue exactly across the tested Node→workerd boundary when the cross-runtime stimulus itself is exactly representable.** Arbitrary bit identity of host-JS transcendental math across runtimes is neither qualified nor required by the recovery contract.

## Defended recovery findings

### Visible rigid-body state is not exact contact-world save state

Position, rotation, linear/angular velocity and awake state can reproduce free flight but diverge once hidden contact/solver continuity matters. Exact runtime recovery therefore needs engine-internal state or an equivalent exact engine checkpoint.

### Box3D seed snapshots can continue as live worlds

A Recording started and stopped immediately at a step boundary can produce a seed-only snapshot with zero recorded future frames. Its restored world accepts new mutations and continues simulation. This has now survived in-process, fresh-process, durable-storage composition, direct workerd, and fresh-DO-constructor specimens.

### Historical source creation ordinals are not durable semantic identity

Pre-checkpoint destroyed bodies are compacted out of the restored seed domain. Historical source creation ordinal therefore cannot be a durable entity key. The scoped rebind uses unique bounded engine tokens and fail-closed restored-domain validation; the pinned Box3D body-name carrier is limited to 18 bytes.

### Portable authority state has its own checkpoint contract

Exact physics alone is insufficient. Versioned portable checkpoints cover roster/event-log state, mutation idempotency through deterministic replay, ActorSession transport state, topology revision, monotonic actor identity, pending input channels, canonical boundary tick, ownership checks, and state digests.

### Runtime checkpoint and durable semantic truth remain distinct

Current evidence supports a layered model:

1. durable semantic/authority state with explicit versioned contracts,
2. engine-specific exact runtime state for solver continuity,
3. provenance-checked envelope binding both to one canonical boundary,
4. transactional durable publication treating the envelope as opaque bytes,
5. platform-specific adapters reconstructing that authority after process/memory loss.

Raw Box3D Recording bytes are build-specific recovery material, not the universal world/save format.

### Exact cross-runtime tests need deterministic host-side stimuli

The L4b diagnostic showed that exact validation can be confounded by host-runtime differences in synthetic JS math even while restored physics and semantic state remain exact. Cross-runtime qualification should therefore use explicitly deterministic stimuli or separately qualify the numeric function/runtime pair. This is a testing boundary, not a reason to weaken equality.

## Storage model boundaries

The current store chunks payloads instead of assuming a single arbitrarily large SQLite BLOB. Correctness currently takes precedence over garbage collection; unreachable immutable material from interrupted future generations is tolerated until GC has its own qualification. The store intentionally fails closed on corruption of the published generation rather than silently falling back.

## Explicit non-claims

Still unproven:

- survival/correct recovery after a real deployed Cloudflare edge eviction or platform restart,
- production packaging/distribution and upgrade policy for the custom Box3D byte bridge / CSP-safe Workers build,
- runtime-checkpoint compatibility across Box3D/box3d.js builds,
- arbitrary cross-runtime bit identity for host-JS transcendental math,
- large-world checkpoint size/cadence and GC policy,
- rollback networking,
- active authority migration between regions/hosts,
- large-world partitioned persistence,
- browser `self + N` bootstrap/recovery,
- real human 3–6 player qualification,
- general donor qualification for every future game.

## Current next move

The local L1–L4b recovery stack is defended for this scoped research specimen. The next qualitative durability boundary is **deployed Cloudflare qualification**: keep the same fail-closed envelope/store/constructor contracts and test real platform lifecycle behavior rather than inventing another local persistence abstraction.

Separately, production use would require an explicit packaging/versioning/fingerprint/upgrade policy for the custom Workers-compatible Box3D adapter. Local constructor recovery is strong architecture evidence; it is not a real-edge or product-readiness claim.