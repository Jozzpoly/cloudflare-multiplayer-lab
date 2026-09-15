# World V0 — smoothness diagnosis experiment 01

Status: **APPARATUS FINDING / OWNER SIGNATURE NOT YET REPRODUCED**  
Date: 2026-09-15  
Branch: `world-v0-smoothness-reliability-campaign`

## Question

Can controlled browser-side latency plus camera-relative movement reproduce the Owner's real-edge correction-storm signature on the unchanged ongoing-Yard runtime?

The intended causal chain under test was:

`continuous camera orbit while holding movement`
→ world-relative desired movement continuously changes
→ future authored input records are superseded
→ observer receives revisions after prediction crossed those target ticks
→ repeated rewind/replay of the same temporal region
→ large render-visible corrections while exact guards remain healthy.

## Apparatus

Source-only diagnostic additions:

- `scripts/world-v0-smoothness-active-storm-probe.mjs`
- `.github/workflows/world-v0-smoothness-diagnosis.yml`

No production runtime source was modified.

The experiment used two real headless Chromium clients against local Workerd. CDP `Network.emulateNetworkConditions` requested 90 ms latency. Both clients joined the same R0 Yard. Actor A held W while synthetic mouse drag continuously changed camera yaw. The probe measured authored/superseded input, corrections, same-tick correction multiplicity, correction magnitude, server-late records, exact guards, RTT and frame pacing.

Run:

- workflow run `34983864197`
- job `104430823051`
- source head `d1ee86d2946c9a18a3d12df860fcf2b2a821b761`
- artifact `10402189424`
- artifact digest `sha256:f47340f8ba68258f5c840692f1eed8908737370ec4e87fbdafad0f727572a2e4`

## Result

The workflow conclusion is **FAIL**, because the predeclared Owner-signature predicate was not satisfied. That is an apparatus/causal-result failure, not a product regression result.

The predicate required observer B to have at least 12 corrections plus either at least 3 corrections of the same target tick or a correction delta >= 0.1 m. B produced substantial correction activity but did not cross those particular thresholds.

### Actor A — camera-moving author

During the bounded probe window:

- authored inputs: `558`
- superseded inputs: `360` (~64.5%)
- corrections: `128`
- server-late records: `315`
- exact guard mismatches: `0`
- same-target multiplicity: max `1`
- max self correction delta: ~`0.0396 m`
- authority-silence resumes: `0`
- RTT median: ~`89.6 ms`
- RTT p95: ~`239.4 ms`
- frame p95: ~`116.6 ms`
- frame max: ~`666.6 ms`
- long frames: `149`
- max correction execution duration: ~`10.1 ms`

Camera instrumentation confirmed `cameraUserAdjusted=true`.

### Observer B

During the same window:

- authored inputs: `545`
- superseded inputs: `0`
- corrections: `66`
- server-late records: `240`
- exact guard mismatches: `0`
- repeated target ticks: `1`
- max same-target multiplicity: `2`
- max remote correction delta: ~`0.0421 m`
- authority-silence resumes: `0`
- RTT median: ~`147.6 ms`
- RTT p95: ~`1236.9 ms`
- frame p95: ~`150 ms`
- frame max: ~`1216.6 ms`
- long frames: `99`
- max correction execution duration: ~`11.3 ms`

## What this experiment proves

It does **not** prove that the exact Owner-visible real-edge failure has been reproduced.

It does prove several narrower facts:

1. camera-relative movement under the stressed transport condition can drive very high future-input supersession pressure while exact state remains correct;
2. high correction pressure can coexist with `guardMismatches=0`;
3. the current rewind/replay implementation can become expensive enough, when corrections are frequent, to materially collapse browser frame pacing;
4. correction windows and long frames overlap in the trace;
5. a test that treats all smoothness failure as one scalar would hide a second failure mode.

## New failure-mode split

The evidence now supports at least two distinct regimes.

### Regime A — Owner real-edge presentation discontinuity

Owner captures:

- foreground frame p95 ~4.3 ms;
- correction CPU duration only a few ms;
- large remote/prop correction deltas and heavy correction counts;
- visible jumps/stutter despite healthy render cadence;
- exact guards remain healthy.

Primary signature: **state/presentation discontinuity without main-thread saturation**.

### Regime B — reconciliation work amplification

Experiment 01:

- correction count high;
- future-input supersession extremely high on camera-moving author;
- long-frame count explodes;
- correction execution cost reaches ~10–11 ms and corrections occur frequently enough to starve frame production;
- RTT measurements become contaminated by the client event-loop collapse itself.

Primary signature: **correction processing becomes part of the performance problem**.

The final architecture and regression suite must guard both independently.

## Why the first apparatus is not a clean network model

CDP network emulation did not produce a stable symmetric end-to-end RTT. The two clients observed materially different RTT distributions, and observer p95 exceeded one second while its frame loop was also severely starved.

Therefore this apparatus mixes at least three effects:

- browser/CDP transport shaping;
- application correction/replay work;
- main-thread scheduling feedback.

It is useful as a stress test but not sufficient for isolating packet-delay causality.

Do not tune runtime parameters from these RTT numbers.

## Updated causal research plan

Before changing production runtime, split the causal graph into independently testable edges:

`camera/orientation evolution`
→ `future input revision pressure`
→ `revision delivery after prediction frontier`
→ `reconciliation scheduling/multiplicity`
→ `exact simulation correction magnitude`
→ `presentation discontinuity`

Separately:

`authority observation gap`
→ `history safety response`
→ `transport/session recovery escalation`

And separately:

`browser hidden lifecycle`
→ `local temporal staleness`
→ `visibility restore policy`.

Each edge should have a smaller deterministic probe. The tests should not require all downstream effects to appear simultaneously.

## Next apparatus requirements

The next diagnostic iteration should avoid using browser network throttling as the sole causal control. Prefer deterministic message scheduling at a test seam or extracted protocol/reconciliation model with a seeded delay/jitter/burst schedule.

Required next probes:

- **input-revision probe:** camera orbit versus fixed camera, with no transport impairment, measuring revisions per target tick and supersession ratio;
- **reconciliation scheduler probe:** feed known peer revisions/authority-consumed records in controlled batches and measure how many full rewinds occur per logical temporal update;
- **presentation discontinuity probe:** independently sample exact body transforms and rendered transforms around correction events;
- **authority-gap probe:** hold authority observation while keeping transport/session logically alive and verify the escalation classification;
- **browser lifecycle probe:** normal Chromium background semantics, without anti-throttling flags.

The failure of experiment 01 is retained as evidence. Do not rewrite its predicate merely to make the run green.
