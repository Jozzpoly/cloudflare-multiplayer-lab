# World V0 Stress × Play — SP1B design after SP1A

Status: design contract only. SP1B must not run until the cheap Stress Foundation gate for the current research head has completed and its result has been interpreted.

Control specimen remains `world-v0-shared-yard@b27de8b04c27777250c47e7e936674e0f147fdfa`.

## What SP1A actually established

SP1A did **not** find a rollback capacity wall.

It established that:

- `b3CreateRecording(byteCapacity)` uses an initial/preallocated capacity and grows on demand;
- crossing the current 2 MiB initial allocation is not a recording failure;
- 640-body hetero-pile and wake-churn recordings grew beyond 2 MiB and still replayed with zero observed replay failures in the SP1A calibration;
- deterministic completed repeats matched at the tested 640-body cells;
- the previous 20-minute harness delay was caused by an uncleared timeout timer, and the corrected smoke exits promptly;
- the current qualified contract intentionally asks every client recording to start with a 2 MiB allocation.

Upstream Box3D source additionally shows that the initial capacity is allocated immediately, not lazily. A recording created with `2 * 1024 * 1024` therefore requests that full buffer before any recording bytes have been written.

SP1B is consequently a **history-memory / steady-state-policy experiment**, not a continuation of the false `2 MiB capacity` search.

## Pre-mortem: ways SP1B could lie

Before implementation, assume the result is wrong and ask how.

### Confound A — WASM high-water memory

Emscripten is built with `ALLOW_MEMORY_GROWTH`. Linear memory can grow and later frees need not shrink the `WebAssembly.Memory` buffer. Running multiple policies sequentially in one Box3D instance can make later policies inherit earlier high-water state.

**Rule:** each memory/preallocation policy runs in a fresh page + fresh Box3D/WASM instance.

### Confound B — logical bytes are not allocated capacity

`b3Recording_GetSize()` reports logical recording bytes, not current backing-buffer capacity. The buffer growth algorithm may reserve more than the logical size.

**Rule:** report logical bytes and observable WASM-memory high-water separately. Never relabel `GetSize()` as allocated memory.

### Confound C — JS heap is not WASM heap

`performance.memory.usedJSHeapSize` does not establish Box3D/WASM allocation.

**Rule:** JS heap is secondary context only. Probe `b3.HEAPU8?.buffer.byteLength` / equivalent runtime exposure. If unavailable, report an observability gap rather than manufacture a Box3D-memory number.

### Confound D — the verifier creates the slowdown

Creating a RecPlayer and hashing/remapping hundreds of bodies every eight ticks can perturb GC/cache and is not the production steady-state path.

**Rule:** no RecPlayer/full-world hash inside the measured SP1B steady-state loop. Exactness verification is a separate profile outside the performance timing path.

### Confound E — mixing two policy changes

Changing initial capacity and retention semantics together could reduce memory without showing which mechanism caused it.

**Rule:** preallocation A/B and retention A/B are separate substages.

### Confound F — hosted timing becomes a product claim

GitHub-hosted Chromium timing is noisy and not representative of the Owner's desktop/phone.

**Rule:** hosted timing is comparative laboratory evidence only. Device claims require later real-device evidence.

### Confound G — synthetic stress silently diverges from future gameplay

If the lab builds one pile while the Chaos Playground later builds a different pile, a capacity result cannot meaningfully calibrate gameplay intensity.

**Rule:** SP1B stress cells consume the pure versioned Chaos DNA manifest. No duplicate scene generator for stress phenomena.

## SP1B0 — allocator / observability microprobe

### Question

What can the exact `box3d.js@0.1.1` runtime expose about recording allocation, and how strongly does the initial-capacity argument affect WASM linear-memory high-water before physics is involved?

### Profiles

Run in fresh Box3D instances:

- `initial-64k`: call `b3CreateRecording(0)` (upstream default 64 KiB);
- `initial-2m`: call `b3CreateRecording(2 * 1024 * 1024)`.

Create recordings in a small ladder, for example `1, 4, 8, 16`, without starting a world recording. Sample before/after creation and after destruction.

### Evidence

- whether `HEAPU8` or equivalent WASM buffer is exposed;
- `HEAPU8.buffer.byteLength` before/after if available;
- whether `_b3GetByteCount` or public `b3GetByteCount` is exposed; do not assume it is;
- number and requested initial capacity of live recordings;
- fresh-instance provenance.

### Stop

This microprobe is complete once it either:

1. gives a trustworthy observable difference between 64 KiB and 2 MiB initial allocation, or
2. proves the current binding lacks sufficient allocation observability, in which case SP1B1 must rely on performance + logical bytes + WASM high-water only and record the gap.

No binding fork merely to get prettier telemetry unless later evidence makes that worth the cost.

## SP1B1 — initial-preallocation A/B

### Question

With retention semantics held constant, does the current 2 MiB initial allocation buy meaningful steady-state stability compared with the upstream 64 KiB default, and what memory/high-water cost does it impose?

### Controlled variables

- same `box3d.js@0.1.1`;
- same 60 Hz / 4 substeps;
- same 8-tick segment / 24-tick inclusive retention;
- same Chaos DNA per compared cell;
- same deterministic event stream;
- fresh Box3D instance per profile;
- no network, renderer or RecPlayer verification in measured loop.

### Initial profiles

- `current-2m`: initial capacity = 2 MiB;
- `default-64k`: initial capacity = 0, relying on upstream 64 KiB default.

Do **not** add an adaptive policy yet. First learn whether a problem exists.

### Load set

Use a deliberately small set rather than another broad count ladder:

- small-width control where segment size remains below 64 KiB;
- one medium high-contact Chaos DNA;
- one high-contact cell whose segment is known to grow beyond 2 MiB.

The purpose is to expose allocation regimes, not rediscover the body-count curve.

### Measured steady-state path

- Box3D physics step p50/p95/p99;
- history-managed tick p50/p95/p99;
- recording rotation (`StopRecording -> GetSize -> trim -> StartRecording`) cost;
- logical segment bytes;
- retained finalized logical bytes;
- retained finalized segment count;
- active recording state/provenance;
- WASM linear-memory buffer high-water if exposed;
- JS heap only as context;
- awake-body count and `awakeContactCount`, sampled outside the measured tick timer at a bounded cadence;
- final F32 state hash after the run.

### Verification profile

After the performance profile, separately run a small number of exact replay checks for both allocation policies. The verification cost is reported separately and must not contaminate the steady-state timings.

### Interpretation

Possible outcomes:

- `64k` uses materially less memory/high-water with no repeatable rotation/timing penalty -> strong candidate for later product qualification;
- `64k` causes repeatable rotation/reallocation spikes while 2 MiB is stable -> justify an adaptive policy experiment rather than choosing an extreme;
- no observable difference in relevant memory/timing -> do not optimize the contract merely because 2 MiB looks large on paper;
- exactness differs by initial allocation -> hard recording/replay issue; stop and investigate before SP1C.

## SP1B2 — retention-policy A/B

Only after B1, and with initial-allocation policy frozen for the comparison.

Compare:

- current inclusive trim `validEndTick >= cutoff`;
- candidate strict trim `validEndTick > cutoff`.

The existing model falsifier must remain green. Runtime lab must additionally observe:

- retained finalized segment count;
- logical retained bytes;
- correction-target coverage probes at and around exact cutoff boundaries;
- no change to simulation outcome/determinism.

The model currently predicts a normal-boundary reduction from four finalized segments to three, but this is **not** a product claim until runtime correction coverage is exercised.

## SP1B3 — adaptive initial allocation (conditional)

Build this only if B1 proves both of the following:

1. 2 MiB over-reserves meaningfully for low-load scenes; and
2. 64 KiB creates a measurable reallocation/timing penalty at larger scenes.

Candidate rule should remain simple and reproducible, e.g. use previous-segment logical bytes plus bounded headroom, quantized to a coarse bucket. Avoid a feedback controller that makes memory policy sensitive to incidental timing.

Adaptive policy must be a third A/B candidate, not silently substituted into the product.

## SP1C handoff criterion

SP1B is complete when we know enough about steady-state history policy that a later correction-shock result will not be dominated by an avoidable recording-allocation artifact.

Then SP1C measures the actual production-shaped correction:

`checkpoint select -> RecPlayer create -> seek -> remap -> invalidate -> replay forward -> exact-state -> backlog`

and varies rollback depth, state width, causal footprint and correction frequency independently.

## Play conversion

SP1B is infrastructure-heavy, but it still feeds gameplay:

- lower/understood history memory cost raises the practical complexity budget of Chaos Playground;
- awake-body/contact telemetry becomes the hidden `chaos heartbeat` used to calibrate CALM/BUSY/REDLINE presets;
- Chaos DNA becomes the exact bridge between lab and play;
- retention/allocation findings determine how aggressively BEYOND mode can accumulate history before memory pressure becomes the dominant experiment.

SP1B itself should not become a visible benchmark UI for the Owner. Its output is safer/more interpretable room for later physical toys.
