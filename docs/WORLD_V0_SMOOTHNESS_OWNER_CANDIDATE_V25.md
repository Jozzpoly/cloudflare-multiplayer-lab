# World V0 Smoothness Owner Candidate V25

Status: **OWNER-TEST CANDIDATE — not canonical / not promoted**.

This branch exists to materialize and evaluate the qualified smoothness/reliability work without changing the frozen product/canonical runtime.

## Source lineage

- campaign branch: `world-v0-smoothness-reliability-campaign`
- qualified rehearsal source head: `4cb7ea08e9a7fbac74b4ef44ab27247f8978ed99`
- integrated implementation: `scripts/world-v0-smoothness-materialize-integrated-v25.mjs`
- remote confirmed-presentation delay: `12` simulation ticks (nominally ~200 ms)

## Qualified semantics

V25 combines only the mechanisms defended by the campaign:

1. retained-history pressure is a prediction-safety boundary, not automatic ActorSession loss;
2. exact correction transactions are coalesced behind exactness/render barriers without weakening state-guard equality;
3. remote **position** presentation is read from immutable authority-confirmed anchors;
4. self and prop simulation/presentation remain exact; remote rotation also remains exact;
5. hidden → visible is a lifecycle discontinuity: exact simulation catches up quickly while historical replay frames may be withheld by a bounded render barrier;
6. the re-entry barrier fails open after 1500 ms rather than freezing presentation indefinitely.

## Qualification evidence

- clean integrated structural/full-repository gate: workflow run `35100210931` — PASS;
- broad isolated product/lifecycle/recovery qualification: workflow run `35100476053` — PASS across all 16 jobs;
- displayed-motion Owner rehearsal: workflow run `35104706025` — PASS 4/4 (`V20 ×2`, `V25 ×2`).

Representative displayed-motion comparison under the same mutable-future peer pressure and 90 ms artificial latency:

- V20 mean p95 displayed remote step: ~7.94 cm;
- V25 mean p95 displayed remote step: ~4.26 cm;
- V20 mean p99: ~35.8 cm;
- V25 mean p99: ~7.7 cm;
- V20 mean max step: ~60.6 cm;
- V25 mean max step: ~12.2 cm.

The rehearsal is mechanism-transfer evidence, **not an Owner perceptual SLO**.

Production hidden-lifecycle specimens recovered 229- and 313-tick stale clients in ~272 ms and ~347 ms respectively, with `guardMismatches=0`, no false authority-silence resume, and bounded re-entry holds of ~210 ms and ~263 ms released by `ready` rather than timeout.

Two 14 s traffic-silence specimens preserved WorldEpoch / ActorSession / NetEntity, had zero rebases and zero guard mismatches, and resumed guard matching after traffic returned.

## Owner-test focus

The next evidence is intentionally human rather than another synthetic parameter sweep. Evaluate:

- whether remote movement actually feels materially smoother;
- whether the ~12-tick remote presentation delay is perceptible or objectionable;
- whether returning to a backgrounded tab feels truthful and stable rather than replaying a burst of history;
- whether the previous mini-lags / red runtime errors reappear;
- whether any new rotation-only jitter becomes visible now that translation is smoother.

Do **not** promote this branch merely because CI is green. Owner feel is the remaining gate for delay tuning and product acceptance.
