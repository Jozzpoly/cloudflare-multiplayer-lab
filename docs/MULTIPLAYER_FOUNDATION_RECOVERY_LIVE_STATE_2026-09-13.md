# Multiplayer Foundation — Recovery Live State

Date: 2026-09-13

Status: **Gate 4A PASS / Gate 4B ACTIVE / not product-qualified**

This document is the current recovery/persistence source of truth for the `research/multiplayer-foundation-v1-2026-09-13` branch. It narrows claims to executed evidence and intentionally does not redefine the long-horizon architecture.

## Current gate split

### Gate 4A — in-process exact authority recovery

**PASS / scoped headless specimen.**

Executed evidence now demonstrates that a full headless authority runtime can be checkpointed, its source Box3D world destroyed, and then reconstructed from:

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

### Gate 4B — durable byte/process/storage recovery

**ACTIVE / not yet PASS.**

The official `box3d.js@0.1.1` runtime has no direct supported path for durable Recording bytes. Executed capability probe:

- full CI run `34783020413` — `completed / success`
- result: `NO_DIRECT_BYTE_PATH`
- exposed: `b3Recording_GetSize`, `b3RecPlayer_CreateFromRecording`
- not exposed: Recording data copy, create-player-from-bytes, raw `_b3...` exports, `HEAPU8`, `ccall`, `cwrap`.

Therefore durable persistence must not rely on hidden Emscripten internals.

## Exact Box3D build provenance under test

Current foundation dependency is still the official `box3d.js@0.1.1`. No production dependency replacement has been made.

For isolated byte-bridge feasibility work the exact pinned source is:

- `box3d.js` source commit: `5d5a3af049cccd9948b2b55bac4342414af0ef64`
- Box3D submodule commit: `8441b4a06d6d09dcfb0b0f704df4d847d1437b92`
- Emscripten: `6.0.2`

Any future raw physical checkpoint envelope must carry enough engine/build provenance to reject incompatible snapshots before passing bytes to Box3D.

## Recovery findings that are now defended

### Visible rigid-body state is not an exact contact-world save state

Saving/restoring position, rotation, linear velocity, angular velocity and awake state can reproduce a free-flight body exactly, but is insufficient once active contacts/solver state matter.

The missing physical continuity includes engine-internal state such as contact/warm-start information, sleep/island partitioning, broadphase state and ID pools. A durable semantic save must therefore not pretend that a flat body-state table is an exact Box3D continuation primitive.

### Box3D seed snapshots can continue as live worlds

A Recording can be started and stopped immediately at a step boundary, producing a seed-only snapshot with zero future frames. A replay world reconstructed from that seed can then accept new mutations and continue simulation. This has been demonstrated both on a contact fixture and on the full authority specimen.

This is an engine-specific runtime checkpoint candidate, not a portable world format.

### Historical source creation ordinals are not durable semantic identity

A pre-checkpoint destroyed body is compacted out of the reconstructed seed domain. Therefore a source world's historical body creation ordinal cannot be treated as a stable cross-recovery entity key.

Current scoped rebind contract:

- active physical bodies carry unique semantic Box3D body names,
- restored active bodies are enumerated through the RecPlayer,
- semantic names are used for a one-time fail-closed rebind,
- retired pre-checkpoint names must remain absent.

This contract survived pre-checkpoint churn and later post-restore topology mutation.

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

## Byte bridge feasibility already demonstrated

An isolated push-only workflow rebuilds the exact pinned `box3d.js` source with only two experimental binding additions:

- copy `b3Recording` into an owned `Uint8Array`,
- create a `b3RecPlayer` from a supplied `Uint8Array`.

The first valid build probe passed:

- workflow run `34783226902` — `completed / success`
- simple active-contact seed snapshot: `8451` physics bytes,
- source Recording and source world destroyed before import,
- imported bytes remained exact through 120 new future ticks,
- tiny/truncated/half-truncated/corrupted-header recordings were rejected.

This establishes **byte-bridge feasibility**, not yet process-boundary authority recovery or production packaging.

## Current active experiment

A stronger isolated workflow is now exercising a full authority checkpoint across an actual process boundary:

1. producer creates the six-actor / twelve-prop authority specimen,
2. producer performs pre-checkpoint churn,
3. producer creates portable roster/input checkpoints and copies Box3D seed bytes,
4. producer records build fingerprint, semantic body manifest, byte length and SHA-256 in a probe envelope,
5. producer continues a baseline future and destroys its source runtime,
6. a fresh Node process with a fresh WASM instance reads the serialized envelope,
7. consumer validates revision, engine fingerprint, canonical boundary and physics SHA-256 before restore,
8. consumer reconstructs portable semantics + Box3D physics + semantic body bindings,
9. consumer must reproduce the baseline exactly through a post-restore retire/replacement churn,
10. separate fresh-process negatives must reject wrong engine fingerprint, wrong physics checksum and wrong canonical boundary.

Current workflow run at the time of this checkpoint: `34783461543`.

Until that run completes successfully, **fresh-process authority recovery remains unproven**.

## Durable-storage boundary after process recovery

Only after fresh-process byte recovery is demonstrated should Gate 4B move to storage integration.

The intended next sequence is:

1. define a deliberately narrow checkpoint envelope contract from executed probe evidence,
2. make physical bytes chunkable rather than assuming a single database BLOB,
3. store immutable checkpoint chunks + manifest/provenance,
4. publish a new current/head checkpoint atomically,
5. validate missing/corrupt/incompatible chunks fail closed,
6. restore through a fresh Durable Object constructor/runtime rather than through a client-only reconnect,
7. test crash/interruption boundaries around checkpoint publication,
8. only then classify durable authority recovery.

The semantic durable world/save format remains conceptually distinct from any Box3D-internal snapshot. Engine snapshots are candidates for exact runtime recovery acceleration and may be replaceable/version-specific.

## Explicit non-claims

The following are **not** established by Gate 4A or the current byte bridge:

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

The immediate frontier is **Gate 4B fresh-process exact authority recovery**. Do not advance to SQLite/Durable Object storage until the current cross-process envelope experiment is green and its failure modes are understood.
