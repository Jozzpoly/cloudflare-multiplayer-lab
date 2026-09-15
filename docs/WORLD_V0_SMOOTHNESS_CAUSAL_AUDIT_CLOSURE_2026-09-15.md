# World V0 — smoothness causal audit closure

Status: **CAUSAL MODEL DEFENDED / RUNTIME REPAIR NOT STARTED**  
Date: 2026-09-15  
Branch: `world-v0-smoothness-reliability-campaign`

This document supersedes the hypothesis state in `WORLD_V0_SMOOTHNESS_REGRESSION_CAUSAL_AUDIT_2026-09-15.md`. The older document remains useful provenance for how the investigation evolved; this closure records what survived falsification.

## Executive conclusion

The current Ongoing Yard regression is not primarily a slow renderer, a bad camera, a Cloudflare-only latency problem, or a deterministic-physics divergence.

The dominant foreground failure is a temporal-contract interaction:

> **continuous-valued human input is written into a fully mutable future canonical-intent horizon; later human samples repeatedly revise already-authored target ticks until very close to their authority deadline. Those revisions create two legitimate reconciliation streams — self `authority-consumed` corrections when a revision misses authority, and remote `peer-record` corrections when the revision reaches the peer after prediction crossed that tick. Message batching can amplify remote reconciliation work. Corrected exact simulation is then presented directly.**

Independent failures exist beside it:

- prediction/history safety can escalate to ActorSession recovery without proven transport failure;
- normal browser backgrounding can leave the local simulation hundreds or thousands of ticks stale and current code tries ordinary catch-up;
- CI/test topology historically protected exactness much more strongly than perceptual/temporal quality.

The current architecture can therefore be exactly correct and visibly bad.

## Owner evidence that started the campaign

The rejected Ongoing Yard session retained all of the important correctness properties:

- `runtimeFailed=false`;
- `guardMismatches=0` on both clients;
- ordinary foreground frame p95 around 4.3 ms;
- shared topology/identity remained coherent.

At the same time it exposed:

- correction counts around 54 versus 670;
- remote correction magnitude up to roughly 0.735 m on one client;
- prop correction magnitude around 0.103 m;
- `serverLate` in the hundreds/thousands;
- ActorSession resumes caused by authority-silence history guard;
- multi-minute hidden-tab intervals followed by huge prediction backlog.

This is the central empirical lesson: **truth convergence is necessary but not sufficient for playability.**

## Defended causal graph

### A. Continuous input -> mutable-future revision pressure

Current timing contract:

- simulation 60 Hz;
- nominal authorship/prediction lead: 8 ticks;
- local simulation lead: 2 ticks;
- input batch size: 2.

Current browser authorship starts at `floor(estimatedAuthority)+1` and writes through `floor(estimatedAuthority+8)-1`, so one pump can author at most seven future target ticks.

The deterministic pure-input probe established:

- fixed W + fixed camera: zero supersessions;
- a single 90° camera change: six revisions;
- continuous camera-relative direction, one pump/tick: 1434 modeled supersessions in four seconds;
- two pump opportunities/tick: 3114;
- the same continuously rotating movement vector with a fixed camera produces exactly the same pressure.

Therefore the root is **continuous-valued input × fully mutable future**, not camera code specifically.

Canonical run: `34991559802` for the corrected authority-floor model; generalized continuous-input run: `35003757378`.

These numbers are semantic upper-pressure models, not claimed network packet counts.

### B. The nominal eight-tick lead does not protect revisions

The first version of a target tick is authored with useful lead, but that same target remains mutable as the estimated authority boundary advances.

The revision-deadline probe established at 60 Hz:

- one pump/tick: final legal revision can occur ~16.67 ms before target;
- two pump opportunities/tick: ~8.33 ms;
- four pump opportunities/tick: ~4.17 ms.

Canonical run: `35003546849`.

Therefore increasing the nominal future horizon alone does not solve revision lateness. Without an explicit commit/freeze policy, a larger horizon can still have an almost-zero **revision** safety margin.

### C. Late self revision -> authority-consumed correction

The focused authority/buffer probe proved the self path:

1. older future self intent is accepted by authority;
2. human input changes and browser rewrites local `intendedSelf` for that target;
3. local prediction already uses the revised value;
4. authority reaches the target before the revision arrives;
5. authority consumes the older accepted value;
6. later revision is correctly classified `late`;
7. `world_v0_consumed` publishes older canonical truth;
8. client must rewind from revised prediction to canonical consumed input.

On-time control: the revision is `superseded`, authority consumes the revised input and this particular correction is unnecessary.

Canonical run: `35003239710`.

This establishes a genuine `authority-consumed` correction source created by mutable future intent; it is not a transport bug.

### D. Remote revision stream -> peer-record correction

When a superseding revision is accepted before consumption, authority relays it to the peer. If the peer already predicted the affected target, `peer-record` reconciliation is legitimate.

The healthy remote path does **not** generically receive a second correction for the same value from `authority-consumed`: accepted/superseded pending value is what authority later consumes. A later revision after consumption is `late` and not relayed.

Canonical falsifier: `34991738126`.

This corrected an earlier over-broad hypothesis. `peer-record` and `authority-consumed` should be attributed separately.

### E. Message boundaries amplify remote reconciliation

With seven mutable authored records and batch size two, a full-window revision is transported as `[2,2,2,1]`: four `peer-record` messages.

Current receiver may invoke `maybeCorrect()` once per relevant message. The pure reconciliation model therefore shows a structural upper amplification of four correction passes for one logical full-window revision versus one pass if the temporal update were coalesced.

Canonical corrected run: `34991599635`.

Non-claim: not every production message causes a correction. The result proves scheduling amplification when changed records are already part of predicted history.

### F. Foreground browser experiment reproduces both streams

A counterbalanced real-Chromium stress test swapped actor:0/actor:1 order between rounds. Both players performed the same continuous movement/camera stress under the same transport shaping.

Corrections:

- actor:0: 321 then 326;
- actor:1: 354 then 299;
- means: 323.5 versus 326.5.

Thus the Owner session's 54-versus-670 asymmetry is not a stable actor-slot or late-join property.

The experiment nevertheless produced 1300 corrections across eight client-seconds while all state guards remained exact and no recovery occurred. Retained events contained both `authority-consumed` and `peer-record` causes.

Run: `34991946644`.

### G. Camera/latency matrix isolates the interaction

A four-condition Chromium matrix compared fixed versus continuous camera-relative input, with zero requested CDP latency versus 90 ms requested CDP latency.

Representative author results over 2.5-second phases:

- fixed / 0 ms requested: 3 corrections, 9 supersessions;
- orbit / 0 ms requested: 149 corrections, 443 supersessions, 302 late records;
- fixed / 90 ms requested: 1 correction, 9 supersessions;
- orbit / 90 ms requested: 134 corrections, 480 supersessions, 224 late records.

Observers independently showed tens of `peer-record` corrections in orbit phases. Guards remained exact.

Run: `35003406619`.

Important qualification: CDP zero is not zero end-to-end network latency; real observed RTT remained nonzero. The experiment is differential, not a calibrated Cloudflare model.

The key conclusion is still strong: **continuous input is sufficient to expose the revision/correction storm in ordinary browser execution; added latency changes severity but is not the sole cause.**

### H. Exact correction is presentation correction today

Source/probe audit established that correction replaces the live Box3D simulation generation, and rendered self/remote/prop transforms are copied directly from that live exact simulation. Camera follows self directly.

There is no independent presentation state that can absorb a physically correct rewind without displaying it.

Therefore a correction delta can become a visible discontinuity even while frame production remains fast.

### I. Correction count alone is not a valid feel oracle

Two historical Owner-positive controls prevent an incorrect conclusion.

#### A2R human smooth control

`world-slice-0-a2r-timeline-rebuild@2c9116267a0c8bba93061f759cefdb709e966e43`

Owner reported the single-player local-physics path as very smooth. A2R did not continuously force authority correction into the local Box3D presentation path. It is a human-quality anchor, not a two-player architecture solution.

#### F5 two-player raw-correction control

Owner-tested F5 commit:

`aaf791bc8e1cce02a22ff6514abae0f7982c78e0`

A roughly two-minute desktop+phone raw-correction session was judged smooth. Post-run evidence retained a desktop remote correction maximum around 0.242 m and an extreme correction-count asymmetry (~2269 versus ~230), yet inspected correction windows did not show a corresponding macroscopic screen-space snap.

Therefore future validation must not fail a candidate simply because `corrections/s` is high.

More important historical difference: positive F5 authored each target tick once when predicted simulation reached it. `intendedSelf` was created only if that tick did not already exist. Its experiment contract treated accepted future records as immutable. It did not continuously rewrite a fully preauthored future horizon.

Later I2 explicitly added future-intent supersession. Later I3 separated logical canonical authorship from rAF. Their combination with continuous input creates the current revision churn.

### J. Split lead creates a real temporal trade-off

Current World V0 has approximately:

- authorship lead: 8 ticks;
- simulation lead: 2 ticks.

The executable policy model (`35004415834`) makes the consequence explicit.

When authorship lead exceeds simulation lead, far-future target ticks contain a **forecast of human intent**, not known future human decisions.

Possible policies spend cost differently:

- keep forecast immutable: local input can react immediately, but local predicted intent and already-committed canonical forecast differ for roughly six ticks (~100 ms in the simple model);
- keep forecast mutable: preserve recent human intent in target ticks, but revisions can approach the authority deadline and create the demonstrated correction race;
- delay local input until committed timeline catches up: avoid the intent split by spending ~133 ms responsiveness in the simple eight-tick example;
- historical F5 coupled simulation lead to authorship lead: sampled new human intent once at the client's current predicted tick with no revision race, but the complete shared simulation lived ~8 ticks ahead, increasing speculative/replay depth.

This is not an impossibility theorem for all networking architectures. It is a constraint on this particular representation: **forecast is currently being treated as mutable canonical intent without an explicit commit policy.**

The repair architecture must choose deliberately where temporal uncertainty lives instead of moving cost accidentally between `late`, `lease`, corrections and perceived input latency.

## Independent lifecycle failures

### History safety != ActorSession failure

Current local history retain is 24 ticks with a four-tick safety margin. Roughly 20 ticks (~333 ms) of no newly observed authority boundary can trigger `authority_silence_history_guard` and full ActorSession resume even if the socket remains open.

Focused probe proved the detector does not require transport failure.

Prediction/history safety, authority observation, transport liveness and ActorSession identity are separate semantics and require separate escalation policies.

### Hidden browser != ordinary prediction backlog

A normal Chrome lifecycle experiment, without anti-background-throttling flags, hid one real tab for about five seconds.

Observed:

- hidden client local boundary: no progress;
- authority: about +300 ticks;
- resulting debt: roughly 313 ticks;
- on visibility return: ordinary prediction backlog/catch-up for roughly 650–680 ms;
- exact guard mismatches: zero.

Longer Owner hidden periods produced far larger debts. A stale browser timeline needs an explicit lifecycle policy; unbounded ordinary catch-up is not a reasonable default.

## Why rigorous gates still let this through

The problem is not lack of tests. It is **validation topology and metric displacement**.

### Bounded-test scope expanded silently

Examples:

- camera-relative movement proved control-space math, not interaction with mutable future scheduling;
- I2 proved legal ordered supersession, not its steady-state rate under continuous input;
- I3 proved scheduler activity during isolated rAF-only starvation and drove `serverLate/leaseExpired` to zero in that experiment, but explicitly did not prove Owner-visible feel or real background suspension;
- I4b proved true-positive exact recovery after deliberate offline transport, but did not pair it with a healthy-socket jitter negative control;
- Ongoing Yard product gate proved solo -> later friend joins same WorldEpoch and exact guards, not continuous movement feel.

### Metric displacement

I3 solved the measured rAF-starvation failure by preauthoring canonical input independently of rAF. Combined with I2, later human decisions can rewrite that future. The previous measured failures (`late`/lease during the synthetic starvation scenario) became green while a new downstream cost (`supersession -> reconciliation -> presentation`) was not protected.

A subsystem can therefore improve its local metric while exporting cost to an unguarded quality dimension.

### A test existing is not the same as an invariant being protected

The audit found tests that are:

- manual-only;
- syntax-checked but not behaviorally executed by ordinary CI;
- triggered by path filters that do not cover the full runtime blast radius;
- intentionally run with browser flags that remove normal background lifecycle behavior.

The project needs explicit blast-radius routing, not a growing archive of disconnected tests.

### Oracle infrastructure can also lie

A newly added diagnostic initially used `node ... | tee ...` without `pipefail`, which allowed a Node failure to appear green. This was caught during the campaign, all new workflows were hardened fail-closed and a pipeline audit was added. Canonical causal probes were rerun after the repair.

The lesson is general: **validate the validators.**

## What is now falsified or corrected

Do not carry these earlier simplifications forward:

- **"camera is the root cause" — false.** Equivalent continuously changing analog movement creates the same future revision pressure.
- **"actor:1 / late join inherently gets the storm" — unsupported.** Counterbalanced means are effectively equal.
- **"peer-record is generically corrected again by authority-consumed" — false as a general rule.** Healthy accepted/superseded remote input is what authority later consumes.
- **"8-tick lead gives revisions ~8 ticks of safety" — false.** It protects first authorship, not the last mutable revision.
- **"correction count should simply be minimized or thresholded" — false as a feel oracle.** Owner-positive F5 had a very high correction count.
- **"the latest Ongoing Yard change introduced the whole problem" — false.** The tension predates Ongoing Yard; later reliability work made the shared deterministic architecture stronger without automatically proving playability.

## Current defended problem statement

World V0 currently represents far-future human input as preauthored canonical intent and allows it to remain mutable nearly until consumption. Continuous input therefore produces revision churn. Depending on whether a revision reaches authority/peer in time, the churn appears as `authority-consumed` self correction or `peer-record` remote correction. Message boundaries can multiply replay work. Exact correction is directly visible in presentation.

Separately, temporal safety and browser lifecycle have overly heavy or inappropriate recovery behavior.

The validation system did not protect these composed quality dimensions, so correctness improvements could accumulate while playability regressed.

## Exit from diagnosis

The campaign has enough evidence to leave open-ended causal discovery and enter **architecture option evaluation + validation-system design**.

This is not permission to immediately tune constants or add lerp.

Before changing runtime:

1. define the Owner-ready validation contract that the current bad baseline must fail for the right reasons;
2. preserve the A2R and positive F5 references as human-quality anchors without pretending they are architecturally identical;
3. compare replacement temporal architectures against the explicit trade-off above;
4. choose a bounded first repair hypothesis with rollback/falsification criteria;
5. keep presentation smoothing as an independent layer, not a substitute for fixing pathological correction causality.
