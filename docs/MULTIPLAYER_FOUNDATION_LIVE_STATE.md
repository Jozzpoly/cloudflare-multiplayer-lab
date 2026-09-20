# Multiplayer Foundation — Live State

Status: ACTIVE FRONTIER / F4 ORDERED-TCP ENVELOPE BOUNDED / F5 BROWSER-LIFECYCLE NEXT  
Updated: 2026-09-20 after F4 outer-envelope run 35480750755

This is the compact execution pointer for the active Multiplayer Foundation campaign. Reverify exact refs before mutation or qualification claims.

## Active mission

Parent program: Multiplayer Foundation.

Early target: a professional reusable real-time physical multiplayer substrate for 1–6 dynamic actors, later qualified with real 3–6-human play.

The Shared Yard remains a multiplayer crucible, not a gameplay/content roadmap.

## Active execution identity

Repository: `Jozzpoly/cloudflare-multiplayer-lab`

Branch: `research/multiplayer-foundation-v2-v28-dynamic-composition`

Research head before this documentation checkpoint:

`6673899f9ee5ccc4b10a35ad11bce3d8f305c2dd`

The branch remains research. `main` remains the qualified two-actor regression/control baseline.

## Defended machine substrate

Current research evidence supports, within the existing local Workerd/Chromium crucible:

- dynamic authority topology up to 6 actors;
- real Chromium browser self + N;
- five concurrently active remote ActorSessions driving shared physics;
- exact V28 state guards through active N-peer composition;
- same-epoch churn/replacement;
- bounded hard browser transport outage with continued world activity and same-identity recovery;
- bounded ordered-TCP latency/jitter operation with authority-realized browser agency;
- repository regression remaining green.

Do not reinterpret these claims as deployed-edge, arbitrary-scale, datagram-loss/reorder or human-play qualification.

## F4 timing contract candidate

The current research contract separates local simulation speculation from network authorship reserve:

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

The scheduler still begins authorship near the earliest safe future edge, approximately `floor(authorityEstimate)+1`. L14 extends the revisable future tail; it does not move local simulation fourteen ticks ahead.

Fresh contract-driven qualification run `35471466056` classified the candidate `DEFAULT_AUTHORSHIP_CANDIDATE_SUPPORTED`:

- all four specimens were contract-driven rather than query-probe overrides;
- exactness 4/4;
- authority-realized command delivery 8/8 in all four;
- server rejection 0;
- `too_future` 0;
- hostile RTT medians approximately 290–341 ms;
- three clean F4 specimens plus one retained F6/stall specimen.

Adaptive L8→L14 policy experiments remain rejected for current pressure. They escalated prematurely and addressed no demonstrated cost that justifies controller complexity.

## F4 outer ordered-TCP envelope

The outer delay/jitter campaign is now sufficiently bounded for this stage. Do not continue increasing synthetic latency merely to discover a larger number.

### Defended core

The historical `100 ms + 25 ms jitter` shaped-TCP cell is strongly defended by repeated fresh-runner evidence with exact state and complete authority-realized agency.

### Transition evidence at 120+30

The first `120+30` campaign produced two clean exact agency misses and two complete passes while several other heavy workflows were also running. The negative specimens were nevertheless real F4 evidence rather than scheduler stalls:

- normal authority windows, roughly 55–63 ticks;
- exact state preserved;
- no `too_future` or server rejection;
- one command in each negative specimen had every matching record arrive late;
- `viableRecords = 0`, maximum arrival margin `-1`;
- later commands recovered normally.

A subsequent isolated run `35472426015` produced four clean 8/8 specimens at the same declared profile.

Therefore `120+30` is not a universal PASS boundary. It is evidence that stochastic tail exhaustion can begin in this region.

### 140+35

Run `35480634574`:

- classification `F4_STRESS_SUPPORTED`;
- four clean specimens;
- exactness 4/4;
- agency 8/8 in all four;
- RTT medians approximately 350–386 ms;
- zero server rejection and zero `too_future`;
- minimum authority windows 46–57 ticks.

This result was clean but thin. Multiple commands survived with only `+1` tick maximum arrival margin, and large fractions of authored records were already late.

### 160+40 — useful mixed boundary

Run `35480750755`:

- classification `F4_STRESS_MIXED_AGENCY_BOUNDARY`;
- all specimens exact and contract-driven;
- zero server rejection and zero `too_future`;
- one specimen was F6 stall-contaminated and excluded from clean F4 interpretation;
- clean specimens delivered 8/8, 7/8 and 8/8;
- clean RTT medians approximately 396, 437 and 403 ms;
- clean minimum authority windows 53, 52 and 55 ticks.

The clean 7/8 specimen is the important negative witness:

- authority progression remained normal;
- the missed command had `viableRecords = 0`;
- all 50 matching records were late;
- maximum arrival margin was `-2`;
- later commands recovered;
- exact shared state remained intact.

This is direct evidence of canonical authorship-tail exhaustion, not desynchronization.

### Current interpretation

The present shaped ordered-TCP apparatus supports a well-defended lower envelope around the earlier 100+25 cell and exposes a stochastic transition band as transport delay/jitter rises into the later stress cells. The samples are not a statistical production SLO and are not monotonic enough to justify a single magic RTT threshold.

Outside the comfortable envelope, the observed failure is currently graceful at the simulation-integrity level: an individual player command can fail to reach authority while exact shared state remains intact and subsequent commands can recover. Player agency and exactness must therefore remain separate qualification dimensions.

Do not increase `inputAuthorshipLeadTicks`, `clientSimulationLeadTicks` or `maxFutureTicks` merely to make these synthetic outer cells green.

## F6 scheduler-stall attribution

Authority pump semantics cap catch-up and count/discard excess elapsed canonical steps as `droppedTicks`. A runner/event-loop pause can therefore compress a wall-clock command hold into a much smaller canonical window.

Direct attribution run `35471974719` classified:

`F6_NO_STRONG_ATTRIBUTION_SEPARATION`

Evidence:

- authority-only mean wall-clock progress ratio ~0.973;
- authority-only mean dropped ratio ~0.0099;
- browser-hostile mean progress ratio ~0.994;
- browser-hostile mean dropped ratio ~0.0043;
- browser-hostile exactness 2/2;
- browser-hostile agency 8/8 in both specimens.

Earlier authority-only outliers demonstrated severe GitHub-runner scheduling variance even without Chromium or hostile shaping. Chromium + shaped TCP was not shown to be necessary for those stalls or to inherently worsen the authority scheduler.

Retain `droppedTicks/catchupSteps` as diagnostics. Do not tune production catch-up policy from contaminated local-CI specimens.

## Validation and workflow hygiene

Historical L8/L10/L12, L14, ceiling, F6-attribution and outer-stress campaigns remain evidence in Git history and workflow runs. They are not permanent push-triggered qualification surfaces.

The live research tree should retain one normal Multiplayer Foundation regression/composition workflow rather than automatically launching every historical experiment whenever a shared harness changes. One-shot research workflows are removed after their evidence is consolidated to prevent the validation apparatus from creating its own CPU/scheduling contamination.

## F5 result — hidden tab throttling is real and recoverable

Fresh-runner workflow:

`35481135961`

Classification:

`F5_BACKGROUND_THROTTLED_RECOVERY_SUPPORTED`

The apparatus removed the previous anti-background-throttling Chrome flags, placed a second real Chromium tab in front, and independently verified the game tab changed from `visible` to `hidden`.

Two fresh specimens reproduced strong browser timer pressure during a 15 second hidden dwell:

- logical input scheduler pumps: 19 and 18 versus ~900 nominal;
- scheduler pump ratio: ~2.1% and ~2.0%;
- browser local simulation advanced only 10 and 18 ticks;
- authority advanced 816 and 905 ticks;
- five remote actors continued driving the world;
- ActorSession, NetEntity and WorldEpoch remained identical;
- guard mismatches remained 0;
- foreground return produced an exact rebase;
- a fresh post-return command was canonically consumed by authority in both specimens.

This is evidence that ordinary hidden-tab throttling can create an enormous browser/authority time separation without requiring transport loss. The current runtime recovered same-identity exactness and fresh player agency in these bounded specimens.

Do not interpret this as mobile/OS background closure. Headless Chromium is only a browser-level machine proxy.

## F5 result — bounded frozen page recovery

Fresh-runner workflow:

`35481297548`

Classification:

`F5_FROZEN_LIFECYCLE_RECOVERY_SUPPORTED`

Two fresh specimens first reproduced real hidden-tab state, then applied an eight-second `Page.setWebLifecycleState(frozen)` interval while five remote actors continued driving authority.

Observed in both specimens:

- no browser scheduler pumps, authored inputs, local simulation ticks or exact-guard progress occurred while frozen;
- authority advanced exactly 481 ticks during the frozen interval;
- the browser transport remained represented as connected, but slot 5 became `leaseExpiredConnected`;
- after thaw, the client recognized the stale input lease and entered `resuming actor · attempt 1`;
- WorldEpoch, ActorSession and NetEntity identity were preserved;
- exact recovery completed with guard mismatches 0 and no first mismatch;
- a fresh foreground command was canonically consumed by authority;
- final topology returned to six connected actors.

This demonstrates that the current separation between authority time and browser execution survives a bounded full page suspension, including input-lease expiry, without fabricating a new actor or diverging state.

This is controlled CDP lifecycle evidence, not mobile OS eviction or process death.

## Current frontier — browser process death and same-profile restart

The next F5 unknown changes failure class:

**Can MF6 recover the same authoritative actor after the entire Chromium process dies and a new Chromium process opens the same direct Yard from the same persisted browser profile?**

Nearest work should:

1. establish six active actors and exact state;
2. prove the browser profile contains the ActorSession resume record;
3. SIGKILL Chromium while five remote actors keep driving authority;
4. observe protected reservation / authority progression independently;
5. restart a new Chromium process on the same `user-data-dir`;
6. reject accidental Chrome tab auto-restore as ambiguous apparatus;
7. require an authority-backed direct Resume offer;
8. recover the exact same WorldEpoch / ActorSession / NetEntity and six-actor topology;
9. require a fresh canonical player command after restart.

Do not treat same-profile process restart as cross-device identity or mobile app lifecycle closure.

## Explicit nonclaims / exclusions

Do not yet:

- promote the research branch to `main`;
- call the F4 stress samples a deployed or statistical network SLO;
- increase authorship lead beyond 14 merely to chase synthetic delay;
- increase local simulation lead;
- raise `maxFutureTicks`;
- revive adaptive lead without new causal pressure;
- weaken exact-state guards;
- tune authority catch-up from GitHub-runner stalls;
- claim packet-loss/reorder qualification from the ordered TCP shaper;
- claim mobile/OS lifecycle closure from headless Chromium lifecycle evidence;
- claim cross-device identity transfer;
- substitute machine evidence for eventual real 3–6-human play.

## Owner boundary

None at the immediate step.

Browser process restart is autonomous machine falsification. Owner judgement becomes material when representative device/browser lifecycle behavior or human return-to-play quality must be assessed.

## On “continue”

Reverify branch HEAD and current runs.

If no contradiction appears, execute the bounded same-profile browser-process restart discriminator. Preserve the F4 timing contract and exact guards. Re-plan from authority reservation, persisted resume authority, exact recovery and post-restart canonical agency evidence.
