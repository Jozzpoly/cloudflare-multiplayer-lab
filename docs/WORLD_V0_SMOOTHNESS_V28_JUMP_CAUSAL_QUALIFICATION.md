# World V0 Smoothness V28 Jump-Causal Qualification

Date: 2026-09-17

Status: **QUALIFIED FOR MATERIALIZATION — NOT YET OWNER-PROMOTED**

## Scope

V28 closes the jump causal-identity failure family discovered after the V25 Owner test without weakening server authority or exact deterministic state.

The qualified stack is:

1. V27 explicit jump provenance (`jumpSequence`),
2. V28 authority causal dedupe,
3. V28 ActorSession resume high-water,
4. V28 browser/client causal replay parity, including remote peer provenance and authority-rebase causal watermark.

The frozen V25 Owner candidate remains untouched at:

`world-v0-smoothness-owner-candidate-v25`
`704c4bcb4479882caf8c7e8d3f6b4ac9db25d460`

## Live qualification evidence

### Persistence / exactness

Workflow run `35276019067`: PASS.

- 13 qualified forced-late airborne specimens,
- 3 measured precondition misses,
- 0 delayed-landing semantic failures,
- 0 exact-state / guard failures,
- no reproduced `position.y` client-authority divergence after browser causal replay parity.

### Full repository gate

Workflow run `35276751915`: PASS.

The complete V28 stack passed the repository `npm run check` gate and restored the canonical checkout cleanly.

### Fixed-attempt responsiveness

The original one-direction A/B apparatus exposed strong order/cold-state confounding, so it was not used as the final responsiveness claim.

Warmup-balanced crossover workflow run `35278097690`: PASS 4/4.

Across the four qualified ABBA / BAAB runner specimens:

- V27: 292 attempts, 147 accepted, 143 causal deliveries,
- V28: 293 attempts, 153 accepted, 149 causal deliveries,
- pooled acceptance-rate ratio V28/V27: ~1.037,
- pooled delivery-rate ratio V28/V27: ~1.038,
- median per-specimen ratio:
  - p50 delivery latency: ~1.048,
  - p95 delivery latency: ~0.905,
  - corrections/attempt: ~0.977,
  - server-late/attempt: ~1.012.

Interpretation: no material throughput or tail-latency regression was demonstrated. A small central-latency cost remains plausible and should not be described as an improvement. The earlier apparent large V28 advantage was correctly rejected as order/environment confounding.

### Peer provenance + authority rebase parity

Workflow run `35280353165`: PASS.

Protocol-level falsifier:

- sent causal sequence: 41,
- peer relay preserved `jumpSequence=41`,
- canonical consumption preserved sequence 41,
- resume authority-rebase seed carried
  `lastConsumedJumpSequence=41` for the same ActorSession.

Real Chromium I4b on the same complete V28 runtime:

- targeted A-only transport cut through deterministic external TCP proxy,
- healthy peer remained live,
- same ActorSession / NetEntity / WorldEpoch recovery,
- authority rebase gap: 209 ticks,
- gap exceeded retained history and actor input lease,
- exact continuation after rebase,
- guard mismatches: 0.

The earlier I4b attempts that relied on Chrome `Network.emulateNetworkConditions` were apparatus failures before the rebase boundary: traffic was frozen but the browser WebSocket did not emit the lifecycle close required to enter `actorResume.pending`. They are not product failures and are not used as V28 evidence.

## Known boundaries

This qualification does **not** prove that V28 removes the broader remaining V25 feel/jerk problem. The generic mutable-future movement/camera-relative race, exact local embodiment/camera presentation, prop presentation, and possible compositor/recorder stalls remain separate investigation areas.

The qualification also does not claim remote Cloudflare placement behavior, process-loss reconstruction, cross-build replay, or mobile-browser behavior beyond the gates already covered elsewhere.

## Decision

**V28 jump-causal tranche: PASS for materialization.**

Next gate:

1. materialize the complete V28 runtime onto a new candidate branch,
2. run validation against the materialized files without relying on the V28 runtime installers,
3. only after that consider the branch an Owner-test candidate.

Do not overwrite or mutate the frozen V25 Owner candidate.
