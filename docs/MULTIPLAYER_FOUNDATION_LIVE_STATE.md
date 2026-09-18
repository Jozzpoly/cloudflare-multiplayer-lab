# Multiplayer Foundation — Live State

Status: ACTIVE FRONTIER / VOLATILE / VERIFY LIVE
Updated: 2026-09-18 after Run 48

This file is the compact execution pointer for the active Multiplayer Foundation campaign. Reverify exact refs before mutation or qualification claims.

## Active mission

Parent program: Multiplayer Foundation
Early target: 1–6 dynamic actors with shared active physics and later real 3–6-human qualification.
Current capability path: F1 dynamic composition + F4 timing/impairment/agency.

## Active execution identity

Repository: Jozzpoly/cloudflare-multiplayer-lab
Branch: research/multiplayer-foundation-v2-v28-dynamic-composition
Current experiment head before this documentation checkpoint:
969bfb731578377fe86dce6dae9bbaba43a0fa7b

Main remains the qualified two-actor regression baseline. The active branch remains research and must not be promoted merely because some Foundation gates are green.

## Defended background on the active line

Repeated current-workflow evidence supports, within the existing machine crucible:
- dynamic authority topology up to 6 actors;
- real Chromium browser self + N;
- five concurrently active remote ActorSessions driving shared physics;
- exact V28 state guards through active N-peer composition;
- same-epoch churn/replacement behavior in bounded MF6 mode;
- 8-second hard browser transport outage while the other five actors continue;
- same ActorSession / NetEntity / WorldEpoch recovery after that outage;
- moderate shaped latency/jitter with exactness and browser agency;
- repository regression remaining green.

Runs 43–48 repeatedly preserved those gates while the hostile timing discriminator changed outcome. The active frontier is therefore timing/agency, not topology, shared physics, exactness or recovery.

## Material finding — future-horizon exhaustion

The hostile shaped-TCP profile is declared as 100 ms latency + 25 ms jitter in both directions. Actual measured RTT varies materially between fresh specimens.

The key evidence now separates four layers:
1. authority timeline estimation;
2. ACK arrival margin;
3. survival of revised future command records;
4. canonical realization of player command transitions.

### Run 45 — L8 can still survive a lower realized specimen

Run 45:
35359826659
Head:
0a599a3a4f359a0a5b09d2212de53112cbab2e27

L8:
- median RTT about 243 ms;
- 8/8 sustained direction changes canonically realized;
- exactness preserved.

This proves L8 failure is not deterministic from the declared proxy profile alone.

### Run 46 — paired L8 RED / L12 PASS

Run 46:
35360810792
Head:
80ca86393a84cd93506884362834a3549a784241

L8:
- median RTT about 288 ms;
- 5/8 command windows delivered;
- mean ACK arrival margin about -4.08 ticks;
- 98.8% of traced records late;
- exactness preserved.

L12:
- median RTT about 284 ms;
- 8/8 command windows delivered;
- mean ACK arrival margin about -1.49 ticks;
- exactness preserved.

Authority-estimator error remained around zero rather than showing a large systematic lag.

### Run 47 — onset measurement

Run 47:
35363733953
Head:
4a93e39314a6553d22e011bd777a3fea722696d0

L8:
- median RTT about 304 ms;
- 1/8 command windows delivered;
- the only delivered command had first canonical onset at 41 ticks;
- exactness preserved.

L12:
- median RTT about 285 ms;
- 8/8 command windows delivered;
- first canonical onset 11–21 ticks, mean about 14.9 ticks;
- exactness preserved.

The old witness lookup had returned the latest matching canonical record, not onset. Run 47 corrected that apparatus error by recording first and last canonical witnesses separately.

### Run 48 — direct surviving-future-horizon evidence

Run 48:
35364660875
Head:
969bfb731578377fe86dce6dae9bbaba43a0fa7b

All non-timing gates passed.

L8 control:
- median RTT about 291 ms;
- 0/8 direction changes canonically realized;
- all 8 command windows had zero viable matching future records;
- each window produced about 50–60 matching records, all late;
- best arrival margin per command was still negative: -1 to -3 ticks;
- no surviving future span;
- guard mismatches 0;
- authority and local simulation continued progressing.

L12 treatment:
- median RTT about 309 ms, worse than L8 in this paired specimen;
- 8/8 direction changes canonically realized;
- 15–36 viable matching future records per command;
- best arrival margin +2 to +8 ticks;
- first canonical onset 12–16 ticks, mean 13.875 ticks;
- exactness preserved;
- clientSimulationLeadTicks remained 2.

This is direct mechanism evidence: under this realized hostile specimen, L8's revised command horizon is exhausted before authority can accept any matching future record, while L12 leaves a positive surviving tail and preserves command agency.

## Current interpretation

### H1 — fixed L8 authorship horizon is insufficient for the high-delay part of the tested envelope
Status: STRONGLY SUPPORTED / MECHANISM OBSERVED

The failure is no longer inferred only from RTT or aggregate lateness. Run 48 directly observed zero viable revised future records for every L8 command window and positive surviving future records for every L12 window.

### H2 — browser authority phase estimation is the primary cause
Status: CONTRADICTED AS PRIMARY EXPLANATION

Independent raw-authority comparison places browser authorityTickEstimate near the actual authority timeline. There is ordinary error, but not the large systematic lag required to explain the L8 failures by itself.

### H3 — canonical witness / apparatus error explains the failure
Status: SUBSTANTIALLY CONTRADICTED

The apparatus now independently agrees across:
- batch ACK status;
- arrival margin;
- surviving future records;
- raw-peer world_v0_consumed witnesses;
- physical consequence;
- exact-state guards.

A remaining apparatus bug is always falsifiable, but it is no longer the leading explanation.

### H4 — higher authorship lead is therefore the production answer
Status: NOT EARNED

L12 is currently only a diagnostic treatment. We have not established:
- the minimum sufficient fixed horizon;
- the useful network envelope;
- whether a fixed or adaptive policy is preferable;
- human feel under the added canonical future horizon;
- deployed-edge behavior;
- a production SLO.

## Nearest discriminating experiment

Do not promote L12.

Add an intermediate diagnostic treatment L10 while preserving:
- L8 control;
- L12 treatment;
- clientSimulationLeadTicks = 2 for every variant;
- maxFutureTicks = 32;
- the same 8-command sustained agency train;
- ACK future-horizon trace;
- first canonical onset;
- exact-state guards;
- the same declared hostile shaping.

Why L10:
Historical F3.0 timing work identified L10/B2 as a Pareto candidate with approximately zero modeled safety margin in the high-delay stress cell. The new live evidence now justifies testing whether that intermediate horizon:
- still exhausts like L8;
- survives only marginally / intermittently;
- or behaves like L12.

This is a causal boundary probe, not a search for the smallest number that turns CI green.

## Decision rule after L10

- L8 RED / L10 RED or marginal / L12 PASS:
  authorship reserve has a real threshold in this envelope; next map the network boundary before designing policy.

- L8 RED / L10 PASS / L12 PASS:
  L10 may be sufficient for this specimen, but do not promote it. Repeat across controlled impairment points and compare onset / surviving margin.

- L8 PASS / L10 PASS / L12 PASS:
  realized transport fell below the discriminating boundary; retain the run as envelope evidence rather than calling the mechanism disproven.

- Any exact-state failure:
  immediately reclassify the frontier; exactness takes priority over lead-policy work.

## Explicit exclusions

Do not yet:
- change the canonical WORLD_V0_TIMING.predictionLeadTicks;
- change clientSimulationLeadTicks;
- change presentation delay/smoothing;
- weaken exact guards;
- raise maxFutureTicks;
- add rollback, ownership or gameplay/content;
- merge the research branch to main;
- ask the Owner to manually test this synthetic timing question.

## Owner boundary

None at the immediate step.

The L10 discriminator and subsequent machine envelope mapping remain autonomous technical work. Owner judgement becomes material when technically viable policies differ in experienced responsiveness or when a machine-qualified 1–6 candidate is ready for representative human play.

## On “continue”

First reverify branch HEAD and latest workflow state.

If unchanged, run the bounded L8/L10/L12 authorship-horizon discriminator. Classify the result using command delivery, first canonical onset, future-horizon survival, ACK arrival margins, actual RTT and exactness. Re-plan from evidence rather than promoting whichever treatment is green.


## Run 49 — intermediate L10 result and order confound

Run:
35365616443

Head:
9cedb8be7bdfd0adaa0b0124d0cbbbf635b066ed

All non-timing Foundation gates remained GREEN.

Sequential hostile discriminator:
- L8: 5/8 agency, median RTT about 291.8 ms, mean best per-command arrival margin about -0.125 ticks;
- L10: 8/8 agency, median RTT about 276.8 ms, mean best per-command arrival margin about +1.25 ticks;
- L12: 8/8 agency, median RTT about 267.1 ms, mean best per-command arrival margin about +3.875 ticks;
- exactness preserved for all three;
- clientSimulationLeadTicks remained 2.

Classification:
L8_RED_L10_PASS_L12_PASS

The result is material but does not yet locate a clean lead boundary because realized RTT decreased monotonically with treatment order. Lead and transport conditions are partially confounded.

L10 also appears marginal rather than comfortably buffered: its per-command best arrival margins were 0 to +3 ticks.

### Current next discriminator

Before mapping more impairment points or designing policy, remove the order confound.

Run two deterministic counterbalanced fresh-world triplets:
- sequence A: L8 -> L10 -> L12;
- sequence B: L12 -> L10 -> L8.

Use the same sustained 8-command train, ACK future-horizon trace, first canonical onset, actual RTT and exact guards.

Interpretation:
- L8 RED in both positions + L10/L12 PASS in both positions strengthens a real horizon effect independent of first/last run order;
- mixed results at the same lead mean the tested envelope remains transport-sensitive and should be mapped by actual RTT/margin rather than nominal profile alone.

This counterbalanced campaign intentionally uses a dedicated focused workflow. Re-running the already-stable full dynamic-composition suite for every timing-only probe is no longer the best information/cost trade.
