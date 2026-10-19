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

## F5 process restart — scoped contrasting evidence (2026-10-19)

The browser-process restart discriminator was executed twice with different pre-crash foreground dwell windows. **Both windows must remain in the evidence model; a later PASS does not erase the earlier FAIL.**

### 1.5-second crash: persisted client authority missing (FAIL)

- Source: [run 39180909446](https://github.com/Jozzpoly/cloudflare-multiplayer-lab/actions/runs/39180909446), two independent specimens, both FAIL.
- Same machine, same `--user-data-dir`, real Chrome process `SIGKILL`, five other active actors and live authority.
- Server-side `/api/world-v0/resume-check` returned HTTP 200, `valid=true`, identical WorldEpoch / ActorSession / NetEntity / slot.
- A neutral same-origin page, **before loading any Shared Yard app scripts**, found neither the stored ActorSession nor an independent non-secret localStorage control marker.
- The app therefore did not offer Resume; this is **not** evidence that the application erased the record or that authority rejected recovery.
- Narrowest supported explanation: the profile failed to provide recent localStorage writes after abrupt process death. This may reflect deferred browser disk commits; the exact mechanism has not been instrumented at the Chromium storage layer.

### 8-second crash: exact same-session recovery (PASS, conditional)

- Source: [run 39181218610](https://github.com/Jozzpoly/cloudflare-multiplayer-lab/actions/runs/39181218610), code [7b8e3e6](https://github.com/Jozzpoly/cloudflare-multiplayer-lab/commit/7b8e3e66a1518d38e283c9083f8a2bcbff681d71).
- Both independent fresh-runner specimens: full F5 recovery PASS with an **8-second** dwell between observing the saved record and force-killing Chrome.
- Both persisted ActorSession and non-secret control marker were present on a neutral same-origin page after restart, before app startup; authority recognized the private token.
- Both preserved exact WorldEpoch, ActorSession and NetEntity identity with six connected physical actors; exactly one authority rebase; zero guard mismatches.
- A fresh resumed-player command was consumed authoritatively in both trials.
- Authority advanced independently by 157 and 156 ticks while the browser was dead; both observed `protected-disconnect`.
- Chromium [LocalStorageImpl](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/components/services/storage/dom_storage/local_storage_impl.cc) configures a default five-second delayed write batch. This is consistent with 1.5s red / 8s green, **but correlation does not yet isolate every storage/profile factor**.

### Short-window IndexedDB strict sidecar discriminator (2026-10-19)

**Run [39228476293](https://github.com/Jozzpoly/cloudflare-multiplayer-lab/actions/runs/39228476293), commit [96d0de3](https://github.com/Jozzpoly/cloudflare-multiplayer-lab/commit/96d0de34ceaeff7f839cc9e9a3456ed05cc4801f): two fresh independent specimens.** Regression gate PASS; both specimens intentionally RED at the existing app Resume assertion; aggregate SKIPPED. The negative overall workflow status is **expected** and must not be rewritten as a green recovery gate.

Both specimens performed the exact six-actor authority scenario, but inserted a **non-secret, independent IndexedDB marker** in a `readwrite` transaction with `{ durability: "strict" }`. They waited for `oncomplete`, then the shortened (1.5-second) foreground dwell and `SIGKILL`. A neutral same-origin page read both storage mechanisms **before any game script**.

| Observation | Specimen a | Specimen b |
| --- | --- | --- |
| Wall time since localStorage control write (including strict-IDB commit) | 2170 ms | 1859 ms |
| strict-IDB transaction completed | yes / strict / 587 ms | yes / strict / 335 ms |
| same authoritative ActorSession token still valid | yes | yes |
| ActorSession record in localStorage after Chrome restart | **absent** | **absent** |
| independent localStorage control marker after restart | **absent** | **absent** |
| strict IndexedDB control marker after restart | **present** | **present** |
| client Resume offer | absent / expected RED | absent / expected RED |

**Supported causal discriminator:** two durable-completed IDB writes survived real process death in a profile whose concurrent localStorage writes did not survive. This supports strict IndexedDB as a candidate for **persisting private resume capability** before declaring actor admission recoverable.

**Important boundaries:** the IndexedDB record was deliberately **only a harmless marker**, never the private token. The test does not show that the actual app can read IDB and Resume, that strict transactions are available on every mobile browser, that storage survives clearing/partitioning, or that the transaction can always complete before an arbitrarily early crash. Writing the sidecar can perturb browser I/O timing, so do not claim an exact threshold or a universal advantage. The client still fails Resume on this specimen; only the independent sidecar survived.

Design options worth falsifying before product changes:
- Persist the **actual** ActorSession record in strict-IDB as an additional store, and only count it committed after `complete`; test same-profile immediate SIGKILL, full app replay and authoritative agency.
- Define migration and read precedence carefully to avoid competing localStorage and IDB identities; retain the server token as sole authority and never log it.
- Distinguish failure **before a durable commit** from failure after commit; no browser storage API can guarantee recovery of a token that was never durably committed.
- Measure overhead on actual mobile devices, hosted HTTPS and Jaskinia framing before deciding to replace a shipping path.

### Qualification boundary and next discriminators

- **Supported:** post-persistence same-machine/same-profile process restart, exact reconstruction and fresh agency under this isolated six-actor apparatus.
- **Negative:** early (<5-second-class) abrupt browser death can lose the local private resume token while server authority still exists. Do not classify this as supported.
- **Not tested:** cross-device credentials, OS/mobile eviction, unbounded absence, browser storage partitioning when launched inside Jaskinia, or distributed/cloud authority recreation.
- Nearest unresolved F5 question: whether persisting the **actual private ActorSession record** through an acknowledged strict-IDB transaction permits an *end-to-end* immediate-crash recovery with exact identity and fresh canonical agency. The non-secret sidecar discriminator above is favorable evidence, **not** this qualification.
- Parallel foundation gap: `app.js` physics tracks up to six actors, while `syncMeshes()` still renders only self plus one remote mesh. Machine six-actor exactness does not qualify human-readable 3–6 presence. Separate this from F5.
- Do not promote this research tree to `main` or describe the generic browser lifecycle as qualified.

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

Treat F5 as a conditional A/B result: 1.5 s RED, 8 s exact recovery GREEN. Select the next bounded falsifier from early-crash durable token capture, 3–6 actor visual presence, and eventual human qualification; use fresh evidence and Owner priorities to re-rank, not a mechanical checklist. Preserve the F4 timing contract, existing guards, qualified 2P main and the unmerged research donor.
