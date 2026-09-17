# World V0 Smoothness V28 Jump-Causal Qualification

Date: 2026-09-17

Status: **MATERIALIZED OWNER-TEST CANDIDATE QUALIFIED — NOT YET OWNER-APPROVED**

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

## Materialized candidate qualification

Branch:

`world-v0-smoothness-owner-candidate-v28`

Exact validated head:

`1e42dfd6bed9ea1df0451ae5e651e63be1615bf5`

Materialized-candidate workflow run `35280794973`: PASS.

This run used the committed V28 runtime directly; it did not install V27/V28 product patches at runtime.

- full repository gate: PASS,
- forced-late persistence: 16/16 qualified, 0 precondition misses, 0 delayed landing, 0 exactness/infrastructure failures,
- pending-resume causal identity: sequence 7 / resume high-water 7,
- peer causal relay + authority rebase watermark: sequence 41 / watermark 41,
- real Chromium authority rebase: 177-tick gap / 0 guard mismatches,
- persistence test-only apparatus restored to a clean candidate checkout.

The exact head above is now frozen for Owner testing. Do not commit further changes to that branch unless the qualification is intentionally invalidated and repeated.

## Decision

**V28 jump-causal tranche: PASS.**

**V28 materialized Owner-test candidate: QUALIFIED, not yet Owner-approved.**

The next work must not silently mutate the candidate. Owner preview/deployment, if used, should consume exact `1e42dfd6bed9ea1df0451ae5e651e63be1615bf5`.

The broader V25 feel/jerk investigation remains open after V28; qualification of jump semantics is not a claim that the overall movement/presentation problem is solved.

Do not overwrite or mutate the frozen V25 Owner candidate.


## Exact isolated staging delivery

Owner-test staging delivery completed successfully after candidate qualification.

Delivery branch:
`world-v0-smoothness-owner-delivery-v28`

Delivery workflow run:
`35281437865`

Exact candidate consumed:
`1e42dfd6bed9ea1df0451ae5e651e63be1615bf5`

Cloudflare target:
`cloudflare-multiplayer-lab-staging`

Cloudflare Version ID:
`4eade3fa-8478-4de7-8c8a-db809f1c89d3`

Remote verification:
- `world-v0/app.js`: byte-identical, SHA-256 `0ffffdea3cd3ff74d5b3962d543e36d5dd80745c557b119735598d4d158c5f01`,
- `world-v0/entry.js`: byte-identical, SHA-256 `6f6018b7eb85d0d67d64c76c8de3e7b19106a390439463f3115632b81ca9de9e`,
- `world-v0/build-contract.js`: byte-identical, SHA-256 `95958127dc91d107a12152d8e943adbb1562793c0d0865f19c4e8e1980d0b32a`,
- public health endpoint: HTTP 200.

The delivery workflow deliberately did **not** open `/world-v0/ws` or enter any Yard. Therefore it did not pre-touch the private Owner run identity intended for the next Owner-first test.

Staging delivery status: **PASS — READY FOR OWNER-FIRST TEST**.
