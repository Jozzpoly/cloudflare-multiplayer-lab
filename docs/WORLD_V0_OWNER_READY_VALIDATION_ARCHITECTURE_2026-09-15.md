# World V0 — Owner-ready validation architecture

Status: **DESIGN BASELINE / PRE-RUNTIME-REPAIR**  
Date: 2026-09-15  
Depends on: `WORLD_V0_SMOOTHNESS_CAUSAL_AUDIT_CLOSURE_2026-09-15.md`

## Purpose

The Owner should not be the first detector of an obvious multiplayer smoothness regression.

The project already has strong exactness, lifecycle and recovery evidence. What it lacks is a durable validation topology that protects **composed human-visible behavior** whenever input timing, prediction, reconciliation, transport, presentation or browser lifecycle changes.

This design does not attempt to replace Owner play with metrics. It changes Owner play from a first-line regression detector into a higher-order judgement gate.

## Core rule: two independent PASS families

A candidate is not Owner-ready unless both families are defended.

### 1. Truth / Continuity PASS

Protects the real shared world:

- state-guard exactness / no unexplained divergence;
- canonical input semantics;
- replay/rebase determinism;
- WorldEpoch / ActorSession / topology identity;
- reconnect/recovery correctness;
- shared-prop / actor canonical convergence;
- finite state and bounded retained history.

### 2. Feel / Temporal PASS

Protects what the human experiences:

- no pathological continuous-input revision churn;
- no avoidable same-temporal-region replay burst amplification;
- bounded render-space discontinuity;
- no false full-session recovery on healthy transport;
- sane hidden/visible lifecycle behavior;
- bounded foreground frame/correction CPU cost;
- no uncontrolled temporal debt catch-up;
- no severe self/remote/prop presentation instability during normal two-player interaction.

A green Truth gate must never be treated as an implicit Feel gate.

## What must NOT be used as a single scalar oracle

### Raw correction count

Historical Owner-positive F5 (`aaf791bc...`) retained a very high correction count yet was judged smooth in a two-minute desktop+phone session. Correction count is useful causal telemetry, not a direct perceptual verdict.

### RTT alone

Owner-positive A2R remained smooth at high measured RTT because its local presentation path did not continuously consume authority correction. Current regressions can also reproduce under controlled local-browser conditions without unusually high requested CDP latency.

### Frame p95 alone

The rejected Ongoing Yard session had foreground frame p95 around 4.3 ms while visibly jumping. A renderer can produce frames quickly while drawing discontinuous corrected state.

### Exact guard PASS alone

The entire rejected session remained exact. Exactness answers a different question.

## Required event provenance

Future runtime diagnostics should allow every material correction to answer:

- correction ID;
- reason (`peer-record`, `authority-consumed`, topology/rebase, other);
- target tick and rewind span;
- client local boundary before correction;
- latest observed authority boundary;
- human/input intent generation or revision ordinal involved;
- whether the source record was initial, superseded, late, held or lease-expired;
- batch/message identity where applicable;
- correction before/after self, remote and prop displacement;
- correction CPU duration;
- render frame immediately before/after correction when available;
- document visibility state;
- socket/session state;
- whether multiple messages/corrections belong to one logical temporal update.

Aggregates remain useful, but unexplained aggregates must not be the only evidence. The current campaign showed how `670 corrections` can hide several different causal paths.

## Presentation metric: measure what reached a rendered frame

The primary smoothness oracle should not be raw correction magnitude alone.

A correction can occur between render frames and be replaced/coalesced before the human sees it. Historical F5 is evidence that many correction events can coexist with acceptable visual behavior.

The validation apparatus should therefore sample at requestAnimationFrame boundaries and measure at least:

- rendered self horizontal displacement per frame;
- rendered remote displacement per frame;
- selected prop displacement per frame;
- camera focus/position displacement per frame;
- frame delta;
- corresponding correction count/reasons since prior rendered sample.

Derived metrics should include:

- apparent render velocity;
- discontinuity residual / teleport-like displacement;
- acceleration and jerk at rendered cadence;
- number of correction bursts that actually cross a render boundary;
- max and percentile screen-visible displacement associated with a correction burst.

Where a test scenario deliberately avoids collisions, a rendered actor displacement far above the physically permitted movement envelope can become a physically grounded hard failure rather than an arbitrary aesthetic threshold.

## Temporal metrics: separate forecast activity from harmful churn

Record separately:

- newly authored target ticks;
- superseded target ticks;
- supersession ordinal per target tick;
- remaining lead at initial authorship;
- remaining lead at each revision;
- revisions arriving late at authority;
- peer revisions arriving after peer prediction crossed the target;
- logical revision episodes versus transport message count;
- correction passes per logical revision episode.

This makes metric displacement visible. A future fix must not merely turn `superseded` to zero by silently exporting 100+ ms of canonical input staleness.

## Recovery quality requires sensitivity AND specificity

Every recovery detector must have paired tests.

### Positive trigger

The intended failure occurs and the system recovers correctly.

Examples:

- transport really closes;
- client exceeds a declared exact local-history recovery boundary;
- same-build full rebase is required.

### Negative control

Nearby healthy behavior must **not** trigger the heavy recovery.

Examples:

- socket remains open while authority messages pause/burst for 200–600 ms;
- ordinary RTT/jitter variation;
- a long render frame that does not destroy the session;
- rAF starvation while the input scheduler/event loop is still alive.

Target invariant for healthy-transport scenarios: full ActorSession resume count = zero.

## Browser lifecycle is its own contract

Run at least one real Chromium configuration without:

- `--disable-background-timer-throttling`;
- `--disable-backgrounding-occluded-windows`;
- `--disable-renderer-backgrounding`.

Qualify separately:

- short hidden period;
- medium hidden period;
- long hidden period;
- visibility return.

The candidate must declare what happens to local prediction while hidden. It must not accidentally convert minutes of browser suspension into thousands of ordinary foreground catch-up steps.

The gate should measure:

- local tick progress while hidden;
- authority progress while hidden;
- temporal debt at return;
- rebase/catch-up policy selected;
- time before active input is accepted again;
- visible discontinuity at re-entry;
- ActorSession continuity.

## Continuous-input composition scenarios

At minimum, a candidate touching temporal/network input semantics must run:

1. fixed-camera constant digital input;
2. rapid W/A/S/D reversals and short taps;
3. continuous camera-relative movement while holding a key;
4. fixed-camera continuously changing analog-style movement vector;
5. both players active simultaneously;
6. shared-prop contact/pushing;
7. jump while moving and changing direction;
8. a stable transport control and one deterministic delay/jitter/burst condition.

The camera and analog scenarios are intentionally separate. The causal audit proves the problem is continuous-valued intent, not camera code specifically.

## Negative and positive controls

### Pinned negative control

The current Ongoing Yard regression specimen remains a negative control until superseded by a better reproducible bad specimen.

A new Feel gate must demonstrate that it detects the current bad behavior for a defensible reason before being trusted to qualify a repair.

### Human-quality anchors

Two historical anchors should remain documented:

- A2R `2c911626...`: Owner-positive smooth local-physics reference;
- F5 `aaf791bc...`: Owner-positive two-client raw-correction reference with immutable per-target intent.

They are not drop-in architecture baselines and should not be forced through metrics they never exposed. Their purpose is to falsify bad assumptions about what is necessary for good feel.

### Future golden control

After a repaired multiplayer candidate passes machine gates **and** earns explicit Owner approval, freeze its exact SHA/tree plus a deterministic input/network scenario and its metric distributions as the new differential golden control.

Future relevant changes should be compared against that golden control, not only against hardcoded absolute thresholds.

## Gate topology

### Tier A — fast semantic gate

Runs on every relevant PR/change and should complete cheaply.

Includes:

- protocol/input buffer semantics;
- continuous-input mutable-future pressure model;
- revision deadline model;
- correction scheduling/coalescing model;
- recovery specificity semantics;
- temporal-policy invariants chosen by the eventual architecture;
- workflow fail-closed/pipeline audit.

Purpose: catch architectural regressions before launching browsers.

### Tier B — local real-browser composition gate

Triggered automatically by changes to:

- browser input/control;
- prediction/simulation timing;
- reconciliation/history;
- protocol/transport message handling;
- camera/presentation;
- topology/session lifecycle.

Runs two real Chromium clients against local Workerd and covers continuous input, remote/self correction provenance, rendered-frame sampling and exact guards.

Purpose: detect composed deterministic problems independently from Internet variability.

### Tier C — browser lifecycle gate

Uses normal browser background behavior, not anti-throttling flags.

Purpose: protect visibility/suspension semantics.

### Tier D — remote staging gate

Runs against the intended Cloudflare staging Worker before Owner delivery when transport/runtime behavior changed.

Purpose: validate real edge/WebSocket conditions and deployment identity after deterministic local gates already passed.

### Tier E — Owner-ready rehearsal

A bounded automated/free-play-like browser sequence before giving the link to Owner:

- solo entry;
- later second join;
- both move continuously;
- camera/analog direction changes;
- prop contact;
- jump;
- short visibility transition;
- bounded healthy authority gap if apparatus supports it;
- exact guard and Feel report.

The result is a concise `OWNER_READY_PASS` or a machine rejection with causal telemetry.

### Tier F — Owner judgement

Owner tests higher-order qualities:

- immediacy and weight;
- spatial/social presence;
- whether remote motion feels believable;
- whether collisions feel shared;
- unpleasant but technically sub-threshold artifacts;
- gameplay/product regressions that the metric suite did not anticipate.

A new Owner-discovered obvious regression must be converted into a regression test before the next candidate is delivered whenever technically feasible.

## Blast-radius routing

The suite should be selected by **what a changed file can affect**, not by whether the test author remembered to dispatch a workflow.

At minimum these surfaces imply Feel/Temporal blast radius:

- `public/world-v0/app.js`;
- playable control/camera code;
- `src/world-v0-contract.ts` timing/history values;
- protocol/input buffer semantics;
- shared-yard authority input consumption/relay;
- reconnect/session lifecycle;
- rebase/history code;
- browser visibility handling.

A future implementation can encode this in one reusable workflow or a small manifest that maps paths/capabilities to required gates. Avoid dozens of independent manual workflows that silently stop protecting the product.

## Acceptance semantics

Every result should be classified as one of:

- **PASS** — explicit contract met;
- **FAIL** — contract violated;
- **APPARATUS INVALID** — test could not answer the question;
- **UNPROVEN** — test ran but evidence is insufficient for the claim.

Never reinterpret APPARATUS INVALID as product PASS.

## Threshold policy

Do not derive final thresholds from the current bad candidate.

Use three sources:

1. physical/semantic hard bounds where available;
2. distributions from repeated deterministic negative-control and candidate runs;
3. distributions from the first repaired Owner-approved golden specimen.

Prefer differential/regression budgets to universal magic numbers.

Examples of hard semantics that need no aesthetic threshold:

- guard mismatches must remain zero in exact scenarios;
- healthy-socket ActorSession resume must remain zero;
- a stale multi-second hidden timeline must not execute unbounded ordinary catch-up;
- workflow test-process failure must propagate a failing exit code;
- a candidate must not silently trade supersession churn for unreported canonical input staleness.

Presentation thresholds should be set only after rendered-frame measurements exist.

## Validation of the validation system

The validation infrastructure itself needs periodic checks:

- shell pipelines fail closed;
- workflow path triggers include the intended blast radius;
- required behavioral scripts are executed, not merely syntax-checked;
- manual-only gates are explicitly marked as such;
- artifacts contain the claimed measurements;
- a known negative control actually causes the intended gate to fail.

A gate that cannot reject a known bad specimen is not a gate.

## Immediate implementation order

Before runtime repair:

1. build rendered-frame presentation sampler on the unchanged bad baseline;
2. establish repeatability of the negative-control signature;
3. add a machine-readable Owner-ready report format separating Truth and Feel;
4. add/reuse a healthy-authority-gap negative control for recovery specificity;
5. preserve the real browser lifecycle negative control;
6. only then compare candidate temporal architectures.

Do not yet freeze universal smoothness thresholds. The next evidence task is to measure the rendered discontinuity that the current correction storm actually exposes.
