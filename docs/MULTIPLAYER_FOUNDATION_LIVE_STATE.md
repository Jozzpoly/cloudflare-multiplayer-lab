# Multiplayer Foundation — Live State

Status: ACTIVE FRONTIER / F4 CONTRACT-DRIVEN CANDIDATE SUPPORTED / F6 CI-STALL ATTRIBUTION BOUNDED  
Updated: 2026-09-19 after default qualification run 35471466056 and F6 attribution run 35471974719

This is the compact execution pointer for the active Multiplayer Foundation campaign. Reverify exact refs before mutation or qualification claims.

## Active mission

Parent program: Multiplayer Foundation.

Early target: a professional reusable real-time physical multiplayer substrate for 1–6 dynamic actors, later qualified with real 3–6-human play.

Current path: dynamic 1–6 composition is machine-defended; the active frontier remains F4 timing/impairment/agency. F6 scheduler-stall evidence was separated from F4 rather than allowed to contaminate the timing decision.

## Active execution identity

Repository: `Jozzpoly/cloudflare-multiplayer-lab`

Branch: `research/multiplayer-foundation-v2-v28-dynamic-composition`

Research head before this documentation checkpoint:

`dbabb0564cecc0917f6529b79646b64ffefe7197`

The branch remains research. `main` remains the qualified two-actor regression baseline.

## Defended machine substrate

Current research evidence supports, within the existing crucible:

- dynamic authority topology up to 6 actors;
- real Chromium browser self + N;
- five concurrently active remote ActorSessions driving shared physics;
- exact V28 state guards through active N-peer composition;
- same-epoch churn/replacement;
- bounded hard browser transport outage with continued world activity and same-identity recovery;
- moderate and hostile ordered-TCP latency/jitter specimens with authority-realized browser agency;
- repository regression remaining green.

Do not reinterpret these as deployed-edge, arbitrary-scale or human-play qualification.

## F4 material result — separate network authorship reserve from local simulation

The earlier fixed L8 authorship horizon was directly observed exhausting its revisable future tail under higher-delay hostile specimens while exact shared state remained intact.

Subsequent L12/L14 work established that larger canonical authorship reserve can preserve command agency without increasing local simulation speculation. The important architectural distinction is now explicit:

- legacy/default `predictionLeadTicks = 8`;
- MF6 canonical `inputAuthorshipLeadTicks = 14`;
- local `clientSimulationLeadTicks = 2`;
- `maxFutureTicks = 32`;
- contract-driven `inputAuthorshipLegalWindowCeiling = true`.

Current contract revision:

`shared-yard-v0-contract-v15-input-authorship-reserve`

Current client simulation revision:

`shared-yard-v0-browser-sim-v11-input-authorship-reserve`

Current sim build:

`shared-yard-v0-sim-eb82dd52affec51d`

The scheduler still begins canonical authorship at the earliest safe future edge near `floor(authorityEstimate)+1`. Increasing the authorship reserve extends the revisable future tail; it does not move local simulation 14 ticks ahead.

## Default candidate qualification

Fresh-runner workflow:

`35471466056`

Classification:

`DEFAULT_AUTHORSHIP_CANDIDATE_SUPPORTED`

Evidence:

- four specimens were confirmed contract-driven rather than query-probe overrides;
- exactness: 4/4;
- authority-realized directional command delivery: 8/8 in all four;
- server rejection: 0 in all four;
- `too_future`: 0 in all four;
- hostile RTT medians approximately 290–341 ms;
- three specimens were clean F4 evidence;
- one specimen had compressed authority windows and is retained as F6/stall evidence rather than counted as clean F4.

This qualifies the bounded research candidate under the current shaped ordered-TCP apparatus. It does not define a production SLO or outer network boundary.

## Rejected path — adaptive authorship lead

Two ACK-margin ratchet experiments attempted to begin at L8 and raise toward L14 only when transport evidence demanded it.

Result: REJECTED FOR CURRENT PRESSURE.

Both versions reached L14 prematurely, including during moderate impairment. More importantly, code/evidence review showed that the assumed primary cost was misstated: a larger authorship reserve does not itself push the first canonical command consequence 14 ticks into the future.

Do not add adaptive lead, decay or policy complexity without a newly demonstrated cost that requires it.

## F6 material result — scheduler stalls are not clean F4 network evidence

Authority pump semantics intentionally cap catch-up and count/discard excess elapsed canonical steps as `droppedTicks`. Therefore a runner/event-loop pause can shrink a 700 ms wall-clock command window far below its nominal ~42 ticks.

Direct attribution workflow:

`35471974719`

Classification:

`F6_NO_STRONG_ATTRIBUTION_SEPARATION`

Clean attribution run:

- authority-only mean progress ratio: ~0.973;
- authority-only mean dropped ratio: ~0.0099;
- browser-hostile mean progress ratio: ~0.994;
- browser-hostile mean dropped ratio: ~0.0043;
- browser-hostile exactness: 2/2;
- browser-hostile agency: 8/8 in both specimens.

A preceding attribution attempt also produced a severe authority-only runner outlier at ~0.432 wall-clock progress and ~0.196 dropped ratio while another browser-hostile specimen on a separate runner was ~0.999 progress. That attempt also exposed and then fixed a wrapper-lifecycle artifact; the inner multiplayer specimen itself had already passed.

Interpretation:

- Chromium + hostile shaped-TCP is not necessary for the observed authority stalls;
- the current evidence does not show that it inherently worsens authority scheduling;
- GitHub runner/process scheduling variance can independently create stall contamination;
- do not tune production scheduler or authorship lead from those contaminated specimens;
- retain `droppedTicks/catchupSteps` as explicit F6 diagnostics.

This does not prove deployed Cloudflare authority has no load/scheduling limits.

## Validation semantics correction

The historical L8/L10/L12 discriminator remains valuable negative/control evidence, but L8 is no longer the current MF6 default.

It therefore no longer turns the full dynamic-composition suite red merely because the historical L8 control loses agency. Apparatus/contract assertions still fail closed, and any exactness loss remains fatal.

## Current frontier

F1 composition/lifecycle mechanics needed by the current crucible are sufficiently defended to keep F4 as the highest-value open child.

The immediate F4 unknown is now:

**What is the operating boundary of the contract-driven L14 authorship-reserve + legal-window-ceiling candidate when actual transport delay/jitter rises beyond the currently qualified hostile specimen?**

The purpose is to discover the boundary and graceful failure behavior, not to find a larger lead that makes every synthetic profile green.

Nearest work should:

1. preserve `inputAuthorshipLeadTicks=14`, `clientSimulationLeadTicks=2`, `maxFutureTicks=32` and exact guards;
2. run independent fresh-runner specimens at stronger impairment points;
3. classify by actual RTT, authority-realized command delivery, ACK margins, legal-window rejection and exactness;
4. retain scheduler-stall contaminated specimens as F6 evidence rather than using them to move the F4 boundary;
5. stop increasing impairment once a useful supported/unsupported boundary is bracketed.

## Explicit nonclaims / exclusions

Do not yet:

- promote the research branch to `main`;
- increase authorship lead beyond 14 merely to chase CI;
- increase local simulation lead;
- raise `maxFutureTicks`;
- add adaptive timing policy;
- weaken exact-state guards;
- tune authority catch-up from GitHub-runner stalls;
- claim packet-loss/reorder qualification from an ordered TCP shaper;
- claim deployed-edge SLOs;
- substitute machine evidence for eventual real 3–6-human play.

## Owner boundary

None at the immediate step.

Machine mapping of the timing envelope remains autonomous technical work. Owner judgement becomes material when viable policies differ in experienced feel/responsiveness or when the 1–6 candidate is ready for representative human play.

## On “continue”

Reverify branch HEAD and current runs.

If no new contradiction appears, continue F4 by mapping the outer impairment boundary of the contract-driven timing candidate on fresh runners. Re-plan from actual RTT/agency/exactness evidence. Do not reopen adaptive lead or scheduler tuning without new causal pressure.
