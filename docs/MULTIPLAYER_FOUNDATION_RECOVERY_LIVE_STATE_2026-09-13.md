# Multiplayer Foundation — Recovery Live State

Date: 2026-09-13

Status: **Gate 4A PASS / Gate 4B PASS / Gate 4C ACTIVE / not product-qualified**

This document is the current recovery/persistence source of truth for the `research/multiplayer-foundation-v1-2026-09-13` branch. It narrows claims to executed evidence and intentionally does not redefine the long-horizon architecture.

## Current gate split

### Gate 4A — in-process exact authority recovery

**PASS / scoped headless specimen.**

Executed evidence demonstrates that a full headless authority runtime can be checkpointed, its source Box3D world destroyed, and then reconstructed from:

- a Box3D seed-only recording containing zero recorded future frames,
- a versioned JSON roster/event-log checkpoint,
- a versioned JSON pending-input checkpoint,
- a fresh topology object,
- semantic body-name rebinding of restored Box3D bodies.

The restored runtime remained exact from canonical tick 280 through tick 359 while comparing every tick:

- roster mutation outcomes,
- roster snapshot,
- topology revision and digest,
- exact float32 physics guard,
- roster checkpoint digest,
- input checkpoint digest.

The specimen includes:

- six simultaneous actors,
- twelve persistent dynamic props,
- arena static bodies,
- pre-checkpoint retire/replacement churn,
- an active ActorSession with disconnected transport at checkpoint time,
- reconnect after restore,
- two additional retire/replacement churns after restore,
- monotonic actor identity without retired-ID reuse.

Primary CI evidence:

- full CI run `34782916504` — `completed / success`
- `MULTIPLAYER FOUNDATION AUTHORITY RECOVERY SMOKE PASS`

Earlier supporting recovery evidence:

- run `34776263334` — Box3D Recording exact replay PASS; naive visible-body reconstruction diverged on the first future tick,
- run `34776410333` — free-flight visible-body reconstruction exact for 120 ticks, active-contact reconstruction diverged at +1; replay world accepted post-recording mutation and manual stepping,
- run `34776592833` — Box3D seed-only active-contact snapshot remained exact through 120 new future ticks with post-restore mutations,
- run `34782697280` — semantic recovery rebind + portable roster/input checkpoint recovery PASS.

### Gate 4B — exact recovery across a fresh process boundary

**PASS / scoped isolated build specimen.**

The official `box3d.js@0.1.1` package does not expose a direct supported Recording byte export/import path. Executed capability probe:

- run `34783020413` — `completed / success`
- result: `NO_DIRECT_BYTE_PATH`
- exposed: `b3Recording_GetSize`, `b3RecPlayer_CreateFromRecording`
- not exposed: Recording data copy, create-player-from-bytes, raw `_b3...` exports, `HEAPU8`, `ccall`, `cwrap`.

Therefore durable persistence must not rely on hidden Emscripten internals.

An isolated exact-source build added only two experimental bindings:

- copy `b3Recording` into an owned `Uint8Array`,
- create a `b3RecPlayer` from a supplied `Uint8Array`.

Byte-bridge feasibility evidence:

- workflow run `34783226902` — `completed / success`
- simple active-contact seed snapshot: `8451` physics bytes,
- source Recording and source world destroyed before import,
- imported bytes remained exact through 120 new future ticks,
- tiny/truncated/half-truncated/corrupted-header recordings were rejected.

Fresh-process authority evidence:

- workflow run `34783461543` — `completed / success`
- full authority producer used six actors + twelve props + statics + pre-checkpoint churn,
- producer serialized host checkpoints + semantic body manifest + engine provenance + SHA-256 + copied Box3D seed bytes,
- producer continued a baseline future and destroyed its source world/Recording,
- a fresh Node process with a fresh WASM instance restored exclusively from the serialized envelope,
- full-world physics payload: `41829` bytes,
- probe envelope: `279068` bytes,
- consumer remained exact through canonical tick `329`, including post-restore retire→replacement churn,
- wrong engine fingerprint, wrong physics SHA-256 and wrong canonical boundary were rejected before Box3D restore,
- log result: `MULTIPLAYER FOUNDATION AUTHORITY BYTE PROCESS SMOKE PASS`.

This establishes exact process-boundary recovery for the scoped headless specimen. It does **not** yet establish durable database publication, Cloudflare eviction survival, or production packaging of the Box3D bridge.

### Gate 4C — durable storage / authority constructor restart

**ACTIVE / unproven.**

The next frontier is to cross the durable-storage boundary without weakening the already-defended process recovery contract.

Target properties:

- immutable checkpoint generations,
- chunkable physical payload rather than a single assumed-large database value,
- manifest containing version/provenance, semantic state, content hashes and chunk inventory,
- atomic publication of the current checkpoint only after all immutable material exists,
- previous complete generation remains recoverable if publication of the next generation is interrupted,
- missing/corrupt/incompatible chunks fail closed,
- restore occurs through a fresh authority/Durable Object constructor runtime rather than through client-only reconnect,
- crash/interruption points around persistence publication are explicitly falsified.

Gate 4C must be proven in layers: deterministic transactional-store model first, SQLite-backed Durable Object apparatus second, then actual constructor/eviction-style recovery evidence.

## Exact Box3D build provenance under test

Current foundation dependency is still the official `box3d.js@0.1.1`. No production dependency replacement has been made.

For isolated byte-bridge work the exact pinned source is:

- `box3d.js` source commit: `5d5a3af049cccd9948b2b55bac4342414af0ef64`
- Box3D submodule commit: `8441b4a06d6d09dcfb0b0f704df4d847d1437b92`
- Emscripten: `6.0.2`

Any raw physical checkpoint envelope must carry enough engine/build provenance to reject incompatible snapshots before passing bytes to Box3D.

## Recovery findings that are now defended

### Visible rigid-body state is not an exact contact-world save state

Saving/restoring position, rotation, linear velocity, angular velocity and awake state can reproduce a free-flight body exactly, but is insufficient once active contacts/solver state matter.

The missing physical continuity includes engine-internal state such as contact/warm-start information, sleep/island partitioning, broadphase state and ID pools. A durable semantic save must therefore not pretend that a flat body-state table is an exact Box3D continuation primitive.

### Box3D seed snapshots can continue as live worlds

A Recording can be started and stopped immediately at a step boundary, producing a seed-only snapshot with zero future frames. A replay world reconstructed from that seed can then accept new mutations and continue simulation. This has been demonstrated on a contact fixture, on the full authority specimen in-process, and across a fresh Node/WASM process boundary after byte serialization.

This is an engine-specific runtime checkpoint candidate, not a portable world format.

### Historical source creation ordinals are not durable semantic identity

A pre-checkpoint destroyed body is compacted out of the reconstructed seed domain. Therefore a source world's historical body creation ordinal cannot be treated as a stable cross-recovery entity key.

Current scoped rebind contract:

- active physical bodies carry unique semantic Box3D body names,
- restored active bodies are enumerated through the RecPlayer,
- semantic names are used for a one-time fail-closed rebind,
- retired pre-checkpoint names must remain absent.

This contract survived pre-checkpoint churn, fresh-process reconstruction and later post-restore topology mutation.

### Portable authority state needs its own checkpoint contract

Exact physics recovery alone is insufficient. The portable layer now has explicit versioned checkpoints for:

- roster/event-log state, including applied and future mutations,
- mutation idempotency history through deterministic event replay,
- ActorSession transport-connected state,
- monotonic next actor ordinal and topology revision,
- pending per-actor input channels,
- exact canonical boundary tick,
- ownership checks and deterministic state digests.

Restore is fail-closed for wrong revisions, ownership drift, boundary drift and digest mismatch.

### Runtime checkpoint and durable semantic truth remain distinct

The current evidence supports a layered model:

1. durable semantic/authority state with explicit versioned contracts,
2. an engine-specific exact runtime snapshot for solver continuity,
3. a provenance-checked envelope that binds them to the same canonical boundary.

The raw Box3D snapshot must not become the universal save-game or long-term world format. It is version/build-specific recovery material and may remain replaceable.

## Gate 4C storage constraints and intended model

Cloudflare SQLite-backed Durable Objects impose a bounded per-value/BLOB size even though total per-object storage is much larger. Therefore the persistence design must not assume that an arbitrarily large future physics/world checkpoint fits safely in one database value.

Current candidate publication model:

`immutable chunks → immutable manifest → atomic HEAD publication`

The model must prove at least these interruption boundaries:

1. failure before any chunks are written,
2. failure after only a prefix of chunks,
3. all chunks written but manifest absent,
4. manifest written but HEAD not advanced,
5. HEAD advanced only to a fully valid generation,
6. corrupt/missing chunk after publication,
7. stale/incompatible generation at restore,
8. interrupted publication of generation N+1 while generation N remains recoverable.

Garbage collection of unreachable old chunks/generations is deliberately secondary to correctness. It must not be coupled to the transaction that publishes a new current checkpoint.

## Explicit non-claims

The following are **not** established by Gate 4A/4B:

- production-safe Durable Object persistence,
- survival of an actual Cloudflare eviction/restart,
- stable replay compatibility across Box3D/box3d.js builds,
- acceptable checkpoint size for large complex worlds,
- rollback networking,
- migration of an active authority instance between regions/hosts,
- large-world partitioned persistence,
- browser `self + N` bootstrap/recovery,
- real human 3–6 player qualification,
- general donor qualification for every future game.

## Current next move

The immediate frontier is **Gate 4C transactional durable storage**.

Do not jump directly to a production persistence implementation. First build a bounded deterministic store model around the already-proven serialized authority envelope and use it to falsify publication ordering, generation selection, missing/corrupt chunks and interrupted writes. Only after that model is green should the same contract be carried into SQLite-backed Durable Object storage and fresh-constructor recovery.