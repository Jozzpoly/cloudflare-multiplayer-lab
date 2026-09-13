# Multiplayer Foundation — Recovery Live State

Date: 2026-09-13

Status: **Gate 4A PASS / Gate 4B PASS / Gate 4C ACTIVE with L1–L3 PASS / not product-qualified**

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

**ACTIVE. Three lower layers are now PASS; actual authority-constructor recovery remains open.**

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

#### Gate 4C-L4 — authority reconstruction inside a fresh Durable Object constructor

**ACTIVE / unproven.**

The remaining qualitative boundary is not another byte-copy test. The authority runtime itself must recover inside the Workers/Durable Object execution environment from durable storage after memory loss.

This requires two things that are not yet established:

1. the exact byte-capable Box3D build must be loadable and operational inside the Workers runtime rather than only in Node,
2. the authority recovery logic must have a Worker-compatible runtime path instead of living only in the Node probe script.

Gate 4C must not be declared complete until a fresh authority constructor reconstructs semantic state + physics from SQLite and resumes canonical execution. Actual Cloudflare edge eviction remains a later independent qualification even after a local constructor specimen passes.

## Defended recovery findings

### Visible rigid-body state is not exact contact-world save state

Position, rotation, linear/angular velocity and awake state can reproduce free flight but diverge once hidden contact/solver continuity matters. Exact runtime recovery therefore needs engine-internal state or an equivalent exact engine checkpoint.

### Box3D seed snapshots can continue as live worlds

A Recording started and stopped immediately at a step boundary can produce a seed-only snapshot with zero recorded future frames. Its restored world accepts new mutations and continues simulation. This has now survived in-process, fresh-process, and durable-storage composition specimens.

### Historical source creation ordinals are not durable semantic identity

Pre-checkpoint destroyed bodies are compacted out of the restored seed domain. Historical source creation ordinal therefore cannot be a durable entity key. The current scoped rebind uses unique persisted semantic Box3D body names and fail-closed restored-domain validation.

### Portable authority state has its own checkpoint contract

Exact physics alone is insufficient. Versioned portable checkpoints cover roster/event-log state, mutation idempotency through deterministic replay, ActorSession transport state, topology revision, monotonic actor identity, pending input channels, canonical boundary tick, ownership checks, and state digests.

### Runtime checkpoint and durable semantic truth remain distinct

Current evidence supports a layered model:

1. durable semantic/authority state with explicit versioned contracts,
2. engine-specific exact runtime state for solver continuity,
3. provenance-checked envelope binding both to the same canonical boundary,
4. transactional durable publication that treats the envelope as opaque bytes.

Raw Box3D Recording bytes are build-specific recovery material, not the universal world/save format.

## Storage model boundaries

Cloudflare SQLite-backed Durable Objects have a bounded per-value/BLOB size while total per-object storage is much larger. The current store therefore chunks payloads rather than assuming one arbitrarily large BLOB.

Correctness currently takes precedence over garbage collection. Unreachable chunks/manifests from interrupted generations are allowed until a separately qualified GC policy exists; GC must not participate in the transaction that publishes HEAD.

The store intentionally does not silently fall back to an older generation when the current published generation is corrupt. Current-generation corruption is a fail-closed condition and must be surfaced explicitly.

## Explicit non-claims

The following remain unproven:

- actual authority reconstruction inside a fresh Durable Object constructor,
- survival of a real Cloudflare edge eviction/restart,
- production packaging/distribution of the custom Box3D byte bridge,
- stable runtime-checkpoint compatibility across Box3D/box3d.js builds,
- acceptable checkpoint size/cadence for large complex worlds,
- checkpoint garbage-collection policy under long-running production churn,
- rollback networking,
- migration of an active authority between regions/hosts,
- large-world partitioned persistence,
- browser `self + N` bootstrap/recovery,
- real human 3–6 player qualification,
- general donor qualification for every future game.

## Current next move

The immediate frontier is **Gate 4C-L4: Worker/Durable Object authority-constructor recovery**.

Do not add another persistence abstraction. Reuse the now-defended chunk/manifest/HEAD store. First qualify that the byte-capable Box3D build itself can execute in a Workers runtime; then move only the minimum recovery core needed to restore the existing authority envelope inside a fresh Durable Object constructor. Keep the custom engine adapter isolated until that evidence justifies a packaging decision.