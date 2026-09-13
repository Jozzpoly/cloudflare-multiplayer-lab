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

The current publication contract is:

`immutable content-addressed chunks → immutable content-addressed manifest → atomic HEAD publication`

HEAD is the only mutable pointer. Incomplete future generations may leak unreachable immutable material, but may not alter current recoverable truth.

Run `34784584096` completed successfully. The campaign:

- observed 11 durable mutations for the tested generation-2 publication,
- injected a simulated crash before every one of those mutations,
- required generation 1 to remain exactly recoverable after every pre-HEAD crash,
- rejected missing/corrupt chunks,
- rejected corrupt manifests and malformed/drifting HEAD state,
- rejected stale/duplicate generations,
- demonstrated content-addressed chunk reuse,
- demonstrated interrupted generation N+1 does not damage published N.

Result:

`MULTIPLAYER FOUNDATION CHECKPOINT STORE PASS`

#### Gate 4C-L2 — real SQLite-backed Durable Object storage restart

**PASS / scoped local Workers runtime specimen.**

The same store contract is implemented through `ctx.storage.sql` with immutable rows and a transactional compare-and-set HEAD inside `transactionSync()`.

Run `34784856828` completed successfully. The specimen:

- used a real SQLite-backed Durable Object in local Wrangler/workerd,
- published generation 1,
- raced two different generation-2 publications and observed exactly one winner,
- killed the entire Wrangler/workerd process,
- restarted a new process against the same persisted DO storage,
- verified the DO constructor nonce changed,
- recovered generation 2 with the same payload hash and length,
- rejected a duplicate generation 2 after restart,
- published and recovered generation 3 after restart.

Observed database size after the specimen: `1097728` bytes.

Result:

`MULTIPLAYER FOUNDATION SQLITE RESTART PASS`

This is strong local durability evidence, but not evidence of an actual Cloudflare edge eviction.

#### Gate 4C-L3 — full authority envelope through durable SQLite restart

**PASS / scoped composition specimen.**

Run `34785027968` rebuilt the exact pinned byte-capable Box3D adapter from source, regenerated the full authority envelope, then composed Gate 4B and Gate 4C storage without teaching the store anything about physics or roster semantics.

Executed path:

`live authority → 279068-byte authority envelope → chunked SQLite-backed DO → full workerd process death → fresh DO constructor → byte-exact envelope recovery → fresh Node/WASM authority consumer → exact future`

Evidence from the log:

- authority envelope: `279068` bytes,
- envelope SHA-256 after durable round-trip: `0069f1d40cd6faeb08ec29e2d8e92e1e3d4a2efdbcdcc3277559984f7058ae74`,
- full workerd restart changed the constructor nonce,
- recovered envelope bytes matched exactly,
- embedded Box3D physics payload remained `41829` bytes,
- fresh Node/WASM consumer reconstructed portable host state + Box3D physics and remained exact through tick `329` with post-restore churn.

Results:

- `MULTIPLAYER FOUNDATION SQLITE PAYLOAD RESTART PASS`
- `MULTIPLAYER FOUNDATION AUTHORITY BYTE PROCESS CONSUMER PASS`

This proves that the current durable storage transport and restart path preserve the already-qualified authority checkpoint exactly.

#### Gate 4C-L4a — byte-capable Box3D inside workerd

**PASS / scoped Workers-runtime capability specimen.**

Run `34786781239` rebuilt the same pinned Box3D/box3d.js source and established the minimum workerd-compatible packaging profile.

Observed platform constraints:

- runtime Wasm generation / inline-Wasm assumptions are not suitable for workerd; the working path uses a statically imported precompiled `.wasm` module,
- the generated Emscripten loader required its `_scriptName.startsWith(...)` environment check to tolerate an undefined script name in this runtime,
- pinned Emscripten `6.0.2` required `-sDYNAMIC_EXECUTION=0` so Embind did not use runtime `new Function`,
- the `box3d.js` facade independently used runtime code generation in `makeOutParamReader`; the isolated Workers build replaces that optimization with a CSP-safe closure/loop implementation while still reading the live heap after the raw call,
- pinned Box3D bounds body names at `B3_BODY_NAME_LENGTH = 18`; recovery identity therefore needs bounded unique engine rebind tokens rather than unconstrained semantic IDs.

Executed result:

- Recording bytes copied: `8451`,
- source Recording/world destroyed before reconstruction,
- RecPlayer restored from bytes inside workerd,
- active-contact future remained exact for 90 ticks.

Result:

`MULTIPLAYER FOUNDATION BOX3D WORKERD RUNTIME PASS`

This qualifies the runtime capability for the pinned research build. It does not yet qualify a production distribution/package for the custom adapter.

#### Gate 4C-L4b — full authority reconstruction in a fresh Durable Object constructor

**PASS / scoped local Wrangler/workerd specimen.**

Run `34788380888` composed the already-defended SQLite store, the L4a Workers-compatible Box3D build, and the Gate 4B authority envelope into an actual fresh-constructor recovery path.

Executed path:

`live authority → serialized authority envelope → chunked SQLite publication in DO #1 → full Wrangler/workerd process death → DO #2 fresh constructor → blockConcurrencyWhile durable recovery → envelope validation → roster/input/topology reconstruction → Box3D RecPlayer reconstruction → semantic rebind → request handling enabled → exact canonical continuation through tick 329`

The restart harness required all of the following:

- the first constructor had `restoreState = empty`,
- publishing the envelope did not mutate that in-memory constructor into a fake restored state,
- the entire Wrangler/workerd process was killed,
- the second constructor nonce differed from the first,
- the second constructor reported `restoreState = restored` and the recovered boundary before `/resume` was allowed to exercise future ticks,
- the restored boundary was generation `1`, canonical tick `260`, with physics payload `41829` bytes,
- post-restore future remained exact through tick `329`, including the retire/replacement churn.

Final deterministic cross-runtime specimen:

- envelope bytes: `279033`,
- physics bytes: `41829`,
- fresh Node/WASM Gate 4B verification: PASS before the constructor test,
- fresh DO constructor recovery: PASS,
- exact future through tick `329`.

Result:

`MULTIPLAYER FOUNDATION AUTHORITY CONSTRUCTOR RESTART PASS`

##### Diagnostic boundary discovered before the final PASS

The first constructor specimen restored successfully but diverged at tick `268`. Instrumentation then showed that the **only** differing top-level field was `inputCheckpointDigest`; `guardPacked`, roster, topology, outcomes, and their digests remained exact. The divergence appeared after the physical step while the test generated the next synthetic input with `Math.cos/Math.sin` in Node versus workerd.

The qualification rerun therefore did **not** weaken exact comparisons or add numerical tolerance. Instead, the cross-runtime test driver replaced that synthetic transcendental-input branch with exact cardinal inputs chosen from integer state in both producer and constructor consumer. Gate 4B was re-run first with the same deterministic driver and passed, then L4b passed end-to-end.

The supported claim is therefore: **the recovered authority state and pinned physics runtime can continue exactly across the tested Node→workerd boundary when the cross-runtime test stimulus itself is exactly representable.** Bit-identical results of arbitrary host-JS transcendental math (`Math.sin`, `Math.cos`, etc.) across different runtimes are not qualified and are not part of the recovery contract.

## Defended recovery findings

### Visible rigid-body state is not exact contact-world save state

Position, rotation, linear/angular velocity and awake state can reproduce free flight but diverge once hidden contact/solver continuity matters. Exact runtime recovery therefore needs engine-internal state or an equivalent exact engine checkpoint.

### Box3D seed snapshots can continue as live worlds

A Recording started and stopped immediately at a step boundary can produce a seed-only snapshot with zero recorded future frames. Its restored world accepts new mutations and continues simulation. This has now survived in-process, fresh-process, durable-storage composition, direct workerd, and fresh-DO-constructor specimens.

### Historical source creation ordinals are not durable semantic identity

Pre-checkpoint destroyed bodies are compacted out of the restored seed domain. Historical source creation ordinal therefore cannot be a durable entity key. The current scoped rebind uses unique bounded engine tokens from the semantic domain and fail-closed restored-domain validation. The pinned Box3D body-name carrier is limited to 18 bytes.

### Portable authority state has its own checkpoint contract

Exact physics alone is insufficient. Versioned portable checkpoints cover roster/event-log state, mutation idempotency through deterministic replay, ActorSession transport state, topology revision, monotonic actor identity, pending input channels, canonical boundary tick, ownership checks, and state digests.

### Runtime checkpoint and durable semantic truth remain distinct

Current evidence supports a layered model:

1. durable semantic/authority state with explicit versioned contracts,
2. engine-specific exact runtime state for solver continuity,
3. provenance-checked envelope binding both to the same canonical boundary,
4. transactional durable publication that treats the envelope as opaque bytes,
5. platform-specific runtime adapters that reconstruct the same authority contract after process/memory loss.

Raw Box3D Recording bytes are build-specific recovery material, not the universal world/save format.

### Exact cross-runtime tests need deterministic host-side stimuli

The L4b diagnostic demonstrated that exact authority validation can be confounded by host-runtime differences in synthetic JS math even when the restored physics/semantic state itself is still exact. Cross-runtime qualification should therefore use stimuli with an explicitly deterministic representation or separately qualify the numeric function/runtime pair being compared. This is a testing boundary, not a reason to weaken state equality.

## Storage model boundaries

Cloudflare SQLite-backed Durable Objects have a bounded per-value/BLOB size while total per-object storage is much larger. The current store therefore chunks payloads rather than assuming one arbitrarily large BLOB.

Correctness currently takes precedence over garbage collection. Unreachable chunks/manifests from interrupted generations are allowed until a separately qualified GC policy exists; GC must not participate in the transaction that publishes HEAD.

The store intentionally does not silently fall back to an older generation when the current published generation is corrupt. Current-generation corruption is a fail-closed condition and must be surfaced explicitly.

## Explicit non-claims

The following remain unproven:

- survival and correct recovery after a real Cloudflare edge eviction/restart rather than a local Wrangler/workerd process restart,
- production packaging/distribution and upgrade policy for the custom Box3D byte bridge / CSP-safe Workers build,
- stable runtime-checkpoint compatibility across Box3D/box3d.js builds,
- arbitrary cross-runtime bit identity for host-JS transcendental math,
- acceptable checkpoint size/cadence for large complex worlds,
- checkpoint garbage-collection policy under long-running production churn,
- rollback networking,
- migration of an active authority between regions/hosts,
- large-world partitioned persistence,
- browser `self + N` bootstrap/recovery,
- real human 3–6 player qualification,
- general donor qualification for every future game.

## Current next move

The local L1–L4b recovery stack is now defended for this scoped research specimen. The next qualitative durability boundary is **deployed Cloudflare qualification**: preserve the same fail-closed envelope/store/constructor contracts while testing real platform lifecycle behavior rather than adding another local persistence abstraction.

Before treating that as product capability, separately decide how the custom Workers-compatible Box3D build is packaged, versioned, fingerprinted and upgraded. A successful local constructor restart is strong architecture evidence, but it is not permission to silently promote the research adapter or claim real edge-eviction survival.