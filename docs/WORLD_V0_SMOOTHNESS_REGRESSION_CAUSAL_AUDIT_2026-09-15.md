# World V0 — smoothness regression causal audit

Status: **DIAGNOSIS / DO NOT TUNE RUNTIME YET**  
Date: 2026-09-15  
Branch: `world-v0-smoothness-reliability-campaign`  
Baseline runtime kept deployed unchanged on `cloudflare-multiplayer-lab-staging`.

## Why this audit exists

Ongoing Yard achieved its intended lifecycle result: a player can enter alone, play immediately, and another player can later join the same running WorldEpoch. Owner play then exposed a severe regression in smoothness: visible jumping, stutter, unstable motion and recovery notices despite the candidate having passed exact-state and product-flow qualification.

This is not being treated as a single visual bug. The investigation asks two separate questions:

1. what runtime causal chain creates the visible instability;
2. why the development/validation workflow classified this candidate as ready for Owner play without detecting an obvious quality regression first.

No runtime repair should be accepted before the failure can be reproduced and measured automatically.

## Owner evidence — defended observations

Two evidence captures from the same WorldEpoch show a healthy exact simulation but unhealthy temporal/presentation behavior.

### Exact truth remains healthy

Both clients report:

- `runtimeFailed=false`;
- `guardMismatches=0`;
- thousands of exact state-guard matches;
- identical R0 topology revision/digest;
- ordinary render frame p95 near 4.3 ms.

Therefore the primary observed regression is not explained by deterministic physics divergence or ordinary render-frame saturation.

### Correction load is strongly asymmetric and material

Client actor:0:

- 54 corrections;
- max rewind 8 ticks;
- max self correction ~0.086 m;
- 727 late server records;
- 2 authority-silence resumes;
- RTT median ~176 ms, p95 ~236 ms.

Client actor:1:

- 670 corrections;
- max rewind 17 ticks;
- max remote correction reported by aggregate metrics ~0.735 m;
- max prop correction ~0.103 m;
- 2016 late server records;
- 4 authority-silence resumes;
- RTT median ~184 ms, p95 ~212 ms.

The retained correction trace on actor:1 is dominated by `peer-record`, while actor:0 is dominated by `authority-consumed`. The clients therefore experience different reconciliation pressure even while converging exactly.

### Same-tick correction multiplicity is real

The retained actor:1 correction trace repeatedly rewinds the same target tick several times. Examples include target tick 5375 corrected nine times, 5373/5376/5377 seven times, and nearby ticks repeatedly revised.

The resolved remote input vector changes incrementally across these corrections rather than merely repeating an identical packet. This is evidence of semantic input revision, not just duplicate delivery.

### Future-input supersession pressure is high

Actor:1 authored 4486 logical input records and superseded 1389 of them (~31%). Actor:0 authored 1147 and superseded 162 (~14%).

Current protocol deliberately supports future-intent supersession. Current browser handling immediately invokes reconciliation when changed peer records arrive, and independently invokes reconciliation again when authority-consumed truth later differs from prediction.

Strong working hypothesis:

> camera-relative movement plus future input authorship causes already-authored future ticks to be revised while the camera/input direction changes; the peer receives several legal revisions of the same temporal region after it has already simulated that region, and each revision can trigger a separate rewind/replay.

This hypothesis is strongly supported by the trace but is not yet considered proven. It needs a dedicated deterministic falsifier that varies camera rotation independently of network impairment.

### Presentation exposes exact corrections directly

The browser's `syncMeshes()` currently copies positions/rotations directly from the current Box3D simulation world to rendered meshes. `correctFrom()` can replace that live simulation world after rewind/replay. There is no independent presentation-state buffer or visual correction offset.

Therefore a physically correct rewind/replay delta is immediately visible as a render-space discontinuity.

This explains how `guardMismatches=0` and obvious visual jumping can coexist without contradiction.

### Authority-history safety is coupled to ActorSession recovery

Current client history retains 24 ticks. With the existing safety margin, 20 ticks of local progress without a newly observed authority boundary is enough for `advancePrediction()` to invoke `beginActorResume("authority_silence_history_guard")`.

At 60 Hz this is roughly 333 ms. Owner evidence contains multiple such resumes while RTT is already ~180 ms median and >200 ms p95. A short authority-message gap can therefore escalate from `prediction history is becoming unsafe` into `replace/reopen transport and exact ActorSession resume` even if the browser has not observed an actual WebSocket close.

This is a coupling error between:

- prediction/history safety;
- authority liveness observation;
- transport health;
- ActorSession recovery.

They are not equivalent conditions and should not share one escalation path by default.

### Browser background lifecycle is a separate discontinuity

Owner evidence contains hidden-tab intervals around 235–237 seconds. On return, clients enter `prediction backlog` with local simulation thousands of ticks behind the current authority-time target.

This matches ordinary browser lifecycle behavior: requestAnimationFrame is suspended in background tabs and browser timers may be heavily throttled.

The current browser visibility handler neutralizes transient input and resets frame timing, but does not classify a sufficiently long hidden interval as `local temporal state is stale; exact rebase required before resuming prediction/presentation`.

A multi-minute background suspension therefore incorrectly enters the ordinary catch-up path.

## Why the current gates passed

This is an oracle coverage failure, not evidence that the earlier gates were fraudulent.

The ongoing-Yard product-flow gate was built to answer the bounded lifecycle question `solo -> later friend joins same running world`. It verifies joinability, topology, WorldEpoch/session continuity, ongoing input and exact state guards.

Its post-join motion is intentionally tiny: one client holds W for ~650 ms and the other holds D for ~650 ms. It does not rotate the camera while moving, perform rapid reversals, push props for sustained periods, jump repeatedly, or measure rendered transform continuity.

It also launches Chromium with background-throttling/backgrounding disabled. That makes the test more stable for lifecycle/topology qualification, but makes it structurally incapable of reproducing normal-browser hidden-tab timing behavior.

The gate therefore proved its explicit lifecycle claim, but the project later treated that PASS too broadly as product readiness.

## Historical validation drift

An earlier A2R owner-prediction lab explicitly measured quantities closer to perceived quality:

- intent error;
- settled error;
- correction acceleration;
- correction jerk.

However, that lab did not turn those measurements into a pinned regression threshold; its hard assertion only rejected non-finite results. Later World V0 work developed much stronger machine contracts for exactness, rewind/replay correctness, state guards, recovery and lifecycle continuity.

The result is an asymmetry:

- truth/correctness acquired durable PASS/FAIL oracles;
- feel/presentation remained observable but not protected by a durable regression contract.

As multiplayer semantics became more complex, locally rational changes could preserve every hard correctness invariant while degrading an unguarded quality dimension.

This is best described as **quality-dimension drift / lost invariant**, not merely one missed test case.

## Current causal model

The current working model is:

`camera/input changes`
→ future canonical inputs are authored ahead
→ already-authored future ticks are superseded
→ peer receives several legal revisions for the same future temporal region
→ RTT/jitter means some revisions arrive after peer prediction has crossed those ticks
→ every relevant `peer-record` message can immediately rewind/replay
→ later `authority-consumed` truth can cause another rewind/replay
→ exact Box3D live world is replaced
→ rendered meshes copy corrected transforms directly
→ visible jumping despite exact eventual convergence.

Parallel escalation path:

`ordinary authority-message gap`
→ local prediction approaches short retained-history limit
→ history safety is interpreted as ActorSession recovery need
→ new socket/resume/rebase
→ visible interruption/recovery state even without proven transport death.

Browser-lifecycle path:

`tab hidden long enough`
→ rAF/timers pause or throttle
→ authority/world continues
→ local temporal estimate becomes stale by thousands of ticks
→ tab becomes visible
→ ordinary prediction catch-up attempts to chase the stale gap
→ backlog/rebase/recovery artifacts.

## Certainty levels

### Demonstrated

- exact state convergence is healthy in supplied evidence;
- ordinary foreground render frame cost is not sufficient to explain the visible regression;
- correction storms exist;
- same target tick can be corrected repeatedly;
- large remote/prop correction deltas exist;
- authority-silence-triggered ActorSession resumes occur without an observed transport-close prerequisite;
- long hidden-tab return enters a huge prediction backlog;
- render transforms currently follow corrected simulation state directly;
- current product gate does not measure smoothness and disables normal background throttling.

### Strong hypotheses requiring dedicated falsification

- camera-relative future-input supersession is the dominant source of same-tick peer correction storms;
- correction storms are the dominant cause of Owner-visible active-play jitter;
- coalescing temporal revisions before replay would drastically reduce correction count without weakening exactness;
- separating presentation from exact simulation would eliminate most residual visible pops after correction frequency is reduced.

### Still open

- active-visible `serverLate` rate after excluding hidden/resume periods;
- contribution from Cloudflare message scheduling/burstiness versus client-authorship policy;
- whether actor:1 asymmetry is primarily a role/timing accident or a systematic late-join/client-order effect;
- exact R0 contribution versus fixed-2P under the same motion/network trace;
- whether the 8-tick authorship lead is appropriate at the measured remote RTT once revision storms are removed;
- how much remaining visual instability is camera-follow amplification rather than actor mesh motion itself.

## Validation-system conclusion

World V0 needs two independent quality contracts:

**Truth / Continuity**

- exact state guards;
- deterministic replay/rebase;
- ActorSession/WorldEpoch semantics;
- topology and recovery correctness.

**Feel / Temporal Presentation**

- correction frequency and multiplicity while visible;
- correction magnitude distribution;
- supersession pressure;
- late-input rate while visible;
- false recovery/escalation count;
- rendered actor/prop/camera discontinuity and jerk;
- foreground frame pacing;
- browser visibility transition behavior.

A candidate is not `Owner-ready` when only the first contract passes.

## Required pre-repair falsifiers

Before runtime tuning, build test-only apparatus that can make the current deployed/baseline behavior fail for the same reasons the Owner rejected it:

1. **camera-orbit movement storm** — hold movement while continuously rotating the camera; record supersessions, same-tick correction multiplicity, rewind count, render discontinuity;
2. **rapid intent reversal** — W/S/A/D reversals and short taps under deterministic latency/jitter;
3. **two-active-player stress** — both players continuously change camera-relative direction, jump and push dynamic props;
4. **healthy-socket authority-gap** — deliberately delay authority messages for bounded 200–600 ms intervals while keeping WebSocket alive; full ActorSession resume must be separately observable from prediction resync;
5. **real browser lifecycle** — run Chromium without background-throttling bypass flags, hide for short/medium/long intervals, restore visibility and measure whether simulation attempts unbounded catch-up;
6. **presentation sampler** — sample rendered self/remote/prop/camera transforms at rAF and calculate discontinuity, velocity/acceleration/jerk separately from exact physics-state correctness;
7. **differential baseline** — feed an identical deterministic input/network trace to candidate and selected reference build and fail on material regression in feel metrics even when both have zero state mismatches.

Do not select final thresholds from the candidate being tested. First establish distributions across defended/Owner-accepted reference behavior and intentionally bad current behavior; then pin thresholds with explicit margin.

## Workflow invariant going forward

Any change touching input scheduling, prediction, reconciliation, network transport, topology, session lifecycle, camera-relative movement or browser lifecycle has temporal/presentation blast radius and must automatically run both contracts.

Owner play remains essential, but its role changes:

- machine tests should catch obvious jank, correction storms, false recovery and browser-lifecycle pathology first;
- Owner testing should discover higher-order feel, social presence, playability and phenomena that are difficult or undesirable to reduce to metrics.

The Owner should not be the project's first smoothness detector.

## Stop condition for this audit phase

Do not tune prediction lead, increase timeouts, add visual lerp, or alter recovery policy yet.

First create a machine reproducer that fails the current baseline with a signature matching Owner evidence. Then isolate the causes experimentally. Repair planning follows causal isolation, not precedes it.
