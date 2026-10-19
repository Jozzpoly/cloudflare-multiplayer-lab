# Multiplayer Foundation — Live State

Status: ACTIVE FRONTIER / F4 ENVELOPE BOUNDED / F5 RECOVERY RESEARCH SCOPED / MF6 VISUAL PRESENCE UNDER QUALIFICATION  
Updated: 2026-10-19 after native strict-IDB F5 and MF6 scene-presence research

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

## MF6 scene presence — session-identity keyed visual roster (2026-10-19)

**Why:** existing `app.js` simulated all six actors and handled their distinct inputs, but the renderer maintained only `selfMesh` + one `remoteMesh`. Four peers were physically real but had no visible representation. The legacy single remote model also was not removed when its actor disappeared, allowing a stale model to remain. This was an **independent multiplayer legibility gap**, not a simulation-integrity failure.

**Research-only implementation** on `research/multiplayer-foundation-v2-v28-dynamic-composition`:
- `public/world-v0/visible-actor-roster.js`: pure bounded identity reconciliation, requiring each desired remote ActorSession to occur both in validated topology and live simulation body map. It returns distinct create/remove sets and rejects malformed/duplicate/out-of-envelope actors.
- `public/world-v0/app.js`: MF6 creates, updates and disposes per-ActorSession models and ground rings, removes stale session-owned models after same-epoch churn, and exposes non-secret visual evidence (IDs, mounted status, label, positions, count). Legacy fixed-2P still uses the original single-peer presentation path; missing 2P remote bodies now cause cleanup instead of a ghost.
- `scripts/world-v0-visible-actor-roster-smoke.mjs` + `package.json`: pure reconciliation checks for six actors, solo, missing body, replacement and invalid/duplicate topology. The check was added after the initial dynamic-composition workflow SHA, so its **independent verification must not be inferred** from that earlier run.
- `scripts/multiplayer-foundation-v2-v28-browser-active-churn-composition.mjs`: real Chromium test now requires six mounted models corresponding one-for-one to authoritative session/net IDs, and verifies that retired sessions leave the rendered roster and replacements appear with the correct identities during real five-peer movement and exact-state rebase.

**Validated:** [dynamic-composition run 39318923780](https://github.com/Jozzpoly/cloudflare-multiplayer-lab/actions/runs/39318923780) completed **success** on the research branch, including repository regression, authority 1–6 composition, Chromium self+N, active N-inputs, exact same-epoch churn-with-visual-roster and active hard-outage recovery. In the visual-churn specimen, before replacement: `sixVisibleBodies=true`, five unique mounted remote actors, guard mismatches 0; after replacement: `visibleCount=6`, `retiredGone=true`, `replacementMounted=true`, 285 exact guard matches / 0 mismatches, fresh replacement jump consumed. These are scene/identity-machine proofs, **not 3–6-human play or all actors simultaneously on-screen**.

**Do not read workflow green as every hostile F4 latency cell green.** Its contained existing ordered-TCP authorship-horizon discriminator reported `L8_RED_L10_RED_L12_PASS` (with exactness preserved; command agency was deficient in L8 and L10). The workflow is green because recording the measured envelope is the gate; it is **not** permission to increase the authority/lead contract to chase outer-cell PASS, and does not attribute that variability to the new visual code.

The pure visual roster function was separately executed against the fetched GitHub blob `9c5e7e811096c18c8ba8cfe3397c1efb804f8ec3` in an isolated JS check: full six visible actor identities, solo cleanup of five remotes, and exact remove-old/add-new replacement mapping passed. The new repository-native `npm run check` smoke wiring in `package.json` was added **after the CI run's checked-out SHA**; do not misstate that run as having executed the new script. Full package-level smoke validation remains a next checkpoint.

The research implementation does **not** require or modify a deployment and is not a change to qualified `main`.

**Important fidelity boundary:** the V25 confirmed-position presentation smoothing remains tied to the *first* remote peer; the other four MF6 remotes are shown from their **actual locally predicted physics bodies**. This avoids presenting one peer using another's temporal anchors, but does not qualify comparative visual smoothness, occlusion/frustum/on-screen visibility, label readability, or human perception. Mounted in the WebGL scene does not mean simultaneously visible within camera framing. Human 3–6 play, mobile UI and deployed-edge representativeness remain open.

**Next:** run full package-level smoke from current research HEAD (without unnecessarily rerunning the entire expensive F4 matrix), then consider bounded 1–5 incremental appearance/disappearance, client-visible pixel/on-screen comparison and per-peer motion presentation under jitter. Only then schedule real 3–6-human play, while retaining F5 storage-denial and multi-tab races as separate unresolved unknowns. Do not generalize visual interpolation without per-peer evidence.

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

**Harness restoration / final regression:** after the bounded marker experiment, the previous 8-second F5 script was restored byte-for-byte (source blob `77e9a727613b6a128da856ef4357d4c9bab0e29c`) at [commit 1612b2d](https://github.com/Jozzpoly/cloudflare-multiplayer-lab/commit/1612b2d3b1f0a8cba13fd9fb64fe10b03af9f544). [Run 39228857469](https://github.com/Jozzpoly/cloudflare-multiplayer-lab/actions/runs/39228857469) was `completed/success`: regression, both independent full-recovery specimens and aggregate passed, classification `F5_BROWSER_PROCESS_RESTART_RECOVERY_SUPPORTED_AFTER_8S_DWELL`. The branch is thus not left with the intentionally RED short-dwell probe as its normal gate.

Design options worth falsifying before product changes:
- Persist the **actual** ActorSession record in strict-IDB as an additional store, and only count it committed after `complete`; test same-profile immediate SIGKILL, full app replay and authoritative agency.
- Define migration and read precedence carefully to avoid competing localStorage and IDB identities; retain the server token as sole authority and never log it.
- Distinguish failure **before a durable commit** from failure after commit; no browser storage API can guarantee recovery of a token that was never durably committed.
- Measure overhead on actual mobile devices, hosted HTTPS and Jaskinia framing before deciding to replace a shipping path.

### Full private ActorSession strict-IDB recovery discriminator (2026-10-19)

The previous strict-IDB test stored only a harmless marker. This successor tested **the real private ActorSession record** without changing `app.js`, `friend-ready.js`, the shipping session stores or server-side token authority.

- [Run 39268838797](https://github.com/Jozzpoly/cloudflare-multiplayer-lab/actions/runs/39268838797) / [commit 9d994a8](https://github.com/Jozzpoly/cloudflare-multiplayer-lab/commit/9d994a8fbd54b8a5d012e44eba6f8b8c9309cd34): two specimens proved exact physics/identity/recovered agency after a 1,500 ms delay after the acknowledged strict-IDB commit. **Its original aggregate emitted `APPARATUS_RED` even though the two specimens and CI jobs succeeded**, because the legacy aggregate required localStorage to have survived. This contradicted the deliberate experimental setup; do not cite the run's green workflow status alone as scientific qualification.
- [Run 39269524514](https://github.com/Jozzpoly/cloudflare-multiplayer-lab/actions/runs/39269524514) / [commit e0c4970](https://github.com/Jozzpoly/cloudflare-multiplayer-lab/commit/e0c4970e211e08d2532fc8aedadedb14238e360c): classifier corrected with **separate evidence modes** `native-localstorage` and `strict-idb-assisted-probe`. Aggregate now exits nonzero when its own evidence cannot support PASS. Four jobs PASS, classification `F5_STRICT_IDB_ACTOR_SESSION_BRIDGED_RECOVERY_SUPPORTED_AT_RECORDED_DWELL`, 2/2 supported.
- [Run 39269925579](https://github.com/Jozzpoly/cloudflare-multiplayer-lab/actions/runs/39269925579) / [commit 3c8a49f](https://github.com/Jozzpoly/cloudflare-multiplayer-lab/commit/3c8a49f126092f0a787327f7656fa80c0058ef5a): remove the *intentional* post-commit 1,500 ms delay; measure actual interval until `SIGKILL` request. Specimens recorded **55 ms and 30 ms**, respectively. Four jobs PASS with the same conditional `strict-idb-assisted-probe` classification, 2/2 supported.

The apparatus retained five active remote actors, authority progression, real Chromium process termination and new-process same-profile reopen. After restart a **script-free same-origin page** confirmed the original localStorage ActorSession and independent marker were **both absent**. IndexedDB, which had previously delivered `tx.oncomplete` with `tx.durability==="strict"`, still held the original private token. A test-only CDP bridge read this token **from the post-crash browser's persisted IndexedDB** (never from a pre-crash Node snapshot), validated the non-secret expected identity, wrote the stored record to the ordinary legacy localStorage entry, and launched the unchanged application. Both runs restored identical WorldEpoch / ActorSession / NetEntity, all six actors, exact guard mismatches 0, authority rebase and **fresh authority-consumed player command**.

**Distinguish the claims:**
- **Strongly supported in bounded headless Chromium:** the *real token* persisted in a strict-IDB transaction could be read within 30–55 ms of its acknowledged completion after deliberate process SIGKILL, even though localStorage lost its copy; when injected into the existing boot path, the application then recovered same-identity exact state and player agency.
- **Not yet supported:** automatically durable app login/Resume on an ordinary page open. The test harness performs an essential pre-boot bridge; do not describe the current product as strict-IDB-enabled.
- **Not covered:** crashing during/before `oncomplete`; real mobile eviction, quota/permission denial, storage partitioning, cookie policy, clearing site data, Firefox/Safari behavior, entire-machine power loss, authority-host death or loss of WorldEpoch. The `strict` hint and `complete` event cannot create a token that has not been durably committed.
- **Security/ownership:** a client-readable resume token is a bearer capability. Moving it between same-origin stores improves tested durability, not confidentiality; never expose it to telemetry, Jaskinia messaging, URL, artifact or logs.

**Cleanup and validation:** [commit 5c1277b](https://github.com/Jozzpoly/cloudflare-multiplayer-lab/commit/5c1277b23e2b67bb0776ad54c219ce8a146ee5c4) restored the original proven native 8-second F5 script **byte for byte** (blob `77e9a727613b6a128da856ef4357d4c9bab0e29c`). The aggregate now preserves the separate diagnostic evidence modes and enforces semantic PASS in CI. The qualified product `main` was never modified. [Final restored native-harness run 39270279868](https://github.com/Jozzpoly/cloudflare-multiplayer-lab/actions/runs/39270279868) verified 4/4 jobs PASS, `evidenceMode=native-localstorage`, `apparatusAll/identityAll/exactAll/agencyAll/restoredAll=true`, and `F5_BROWSER_PROCESS_RESTART_RECOVERY_SUPPORTED_AFTER_8S_DWELL` for both 8,000 ms specimens. This separately proves the broadened aggregate still honors the original qualification.

**Next bounded implementation question:** can the **real app** implement a well-defined ordering of `welcome → write strict-IDB ActorSession → await completed commit → surface recoverable-status` and on fresh boot `read strict-IDB → validate source/run/epoch identity → normal authority Resume`, while clearing/invalidating both stores consistently, preserving fail-closed ownership, and not hanging on storage errors? Defer any promotion until automated positive **and negative** cases show no stale-token resurrection, no identity theft, and no unexplained degradation in 2P or MF6. Measure mobile/embedded behavior separately.

### Native MF6 strict-IDB ActorSession probe, with stale-token rejection (2026-10-19)

The strict-IDB *test-controlled bridge* from earlier F5 work has now been separated from a **native, browser-executed research-only integration**. The new code resides only on `research/multiplayer-foundation-v2-v28-dynamic-composition`; qualified `main` and deployed Workers were not touched.

**Research opt-in:** `?run=<private>&lifecycle=mf6&mf6DurableResumeProbe=1`. The following paths are inert when the explicit MF6 flag is absent:
- `public/world-v0/mf6-durable-resume-probe.js` creates a separate per-run IndexedDB record under a `readwrite` transaction explicitly asking for `durability: "strict"`, awaiting the `complete` event. It reuses the existing Session Continuity normalization and slots 0–5.
- `public/world-v0/app.js` initiates that strict capture upon a real `world_v0_welcome` and keeps ordinary simulation/event handling nonblocking. A non-secret test-only status exposes `pending/complete/failed`; **the game does not yet display a durable-save guarantee to a human**.
- `public/world-v0/entry.js` rehydrates a missing local run record from committed IDB **before** importing the Friend-Ready shell and playable runtime. The ordinary app and normal server Resume path then process that token; CDP does not inject it.
- `public/world-v0/friend-ready.js` and the client epoch-loss paths also tombstone the matching durable record when the authority disproves that WorldEpoch. Incompatible local-vs-IDB records are never silently overwritten.
- Crucial separate bug found: **entering MF6 rewrote its real browser URL as `lifecycle=r0`**. Before this fix the older F5 harness reopened its original fixture URL and would miss ordinary refresh/navigation failure. [Commit 9ace089](https://github.com/Jozzpoly/cloudflare-multiplayer-lab/commit/9ace08955c29796a044b63e015f61dd14fcb5935) preserves the real MF6 mode; the F5 harness now explicitly checks and reopens the **actual post-Enter address**, not the fixture URL.

**Positive native result:** [run 39314906264](https://github.com/Jozzpoly/cloudflare-multiplayer-lab/actions/runs/39314906264) = 4/4 jobs PASS, classification `F5_APP_NATIVE_STRICT_IDB_RESUME_SUPPORTED_AT_RECORDED_DWELL`, 2/2 specimens. With no intentional post-write sleep, the original `localStorage` ActorSession and independent marker were absent on a script-free same-origin page after Chrome SIGKILL. The normal browser app itself reported `bootMode=hydrated`, offered authority-backed Resume, recovered the *same* WorldEpoch / ActorSession / NetEntity, restored six physical actors, passed exact-state guards with zero mismatches and authored a fresh authority-consumed player command.

**Negative native result:** [run 39316524529](https://github.com/Jozzpoly/cloudflare-multiplayer-lab/actions/runs/39316524529) = 4/4 jobs PASS, classification `F5_APP_NATIVE_STRICT_IDB_RESUME_AND_STALE_TOMBSTONE_SUPPORTED_AT_RECORDED_DWELL`, 2/2 specimens. After proving positive recovery, the harness deliberately wrote a **well-formed but obsolete WorldEpoch** into strict IDB, removed the run's local record and opened a second page at the *actual* address. Both specimens showed: `appRehydratedCandidate=true`, `authorityRejectedResume=true`, `localCleared=true`, `durableTombstoned=true`. The server rejected the obsolete token; the UI did not offer Resume and the stale per-run record could not reappear from either store.

**Return-to-baseline regression:** [commit 698b920](https://github.com/Jozzpoly/cloudflare-multiplayer-lab/commit/698b920894d62ce88b1b94b937484c668a550c31) restored the ordinary **8-second native-localStorage F5** harness, keeping only the new check that the game leaves a true `lifecycle=mf6` URL and that the restart uses that *actual* address. [Run 39316916833](https://github.com/Jozzpoly/cloudflare-multiplayer-lab/actions/runs/39316916833) completed 4/4 jobs PASS, classification `F5_BROWSER_PROCESS_RESTART_RECOVERY_SUPPORTED_AFTER_8S_DWELL`, `apparatusAll/identityAll/exactAll/agencyAll/restoredAll=true` in both specimens. This separately confirms ordinary F5 behavior after the one-shot research probe and ensures the research branch is not left with a special-case test as its default gate.

**False negatives / apparatus lessons:** An intermediate run checked whether the *whole* `localStorage` envelope key existed rather than the actual per-run ActorSession; clearing the last session intentionally leaves an empty envelope, so this check was wrong. It was corrected to use the canonical `readWorldV0StoredSession(run)`. Other attempts failed before gameplay due to a Chrome CDP debugger startup timeout; those are apparatus failures, not evidence about token invalidation. Preserve the distinctions rather than rewriting historical statuses.

**Independently** [run 39314856041](https://github.com/Jozzpoly/cloudflare-multiplayer-lab/actions/runs/39314856041) completed the normal dynamic-composition regression on research with success, including six-actor authority/client composition and the existing latency/impairment work. This is still not a real 3–6-human gameplay qualification.

**Remaining boundaries, not yet qualified:** crash before strict-IDB commit, unavailable/blocked IDB, read timeout and quota/permission failure, multi-tab write/clear races, competing persisted identities, browser storage partitions and Jaskinia iframe/top-level differences, actual mobile OS eviction, authority-process death / WorldEpoch replacement, real hosting and real-player usability. Strict-IDB `oncomplete` signals an observed browser storage commit, **not permanent shared-world survival**. The durable token is still a bearer secret and must never be emitted through URL, telemetry, postMessage or CI artifact.

No changes to qualified `main` or deployment are authorized by these research PASS results. The nearest continuation should discriminate **storage failure and multi-tab races** with an explicit failure model, and separately prioritize the existing 3–6 actor *visual presence* gap instead of refining F5 indefinitely.

### Qualification boundary and next discriminators

- **Supported:** post-persistence same-machine/same-profile process restart, exact reconstruction and fresh agency under this isolated six-actor apparatus.
- **Negative:** early (<5-second-class) abrupt browser death can lose the local private resume token while server authority still exists. Do not classify this as supported.
- **Not tested:** cross-device credentials, OS/mobile eviction, unbounded absence, browser storage partitioning when launched inside Jaskinia, or distributed/cloud authority recreation.
- F5 research-only native path now has positive original-token recovery **and** obsolete-epoch rejection evidence (two Chromium specimens each). It is not a deployed/default feature. Nearest F5 unknowns are blocked/unavailable storage, pre-commit crash semantics and multi-tab identity races; consider their information value against 3–6 actor visibility and eventual human qualification.
- MF6 visual representation now has a research implementation and Chromium churn test for **six mounted models**, but not yet perceptual/per-player smoothness, all on-screen in camera, staged deploy, incremental 1–5 qualification or real 3–6-human play. Do not confuse scene membership with finished UX.
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

F5 remains a bounded layered evidence stack: native localStorage 1.5 s RED / 8 s GREEN; test-bridge strict-IDB early-crash GREEN; research-flag app-native strict-IDB positive recovery plus stale-epoch tombstone GREEN, but storage denial and multi-tab races unqualified. MF6 now has session-identity keyed scene-presence code with a six-actor/churn browser test; reverify final CI and smoke before any qualification statement. Then re-rank incremental 1–5 scenes, per-peer presentation feel and real human tests against open F5 risks. Re-rank by impact and evidence; do not imply the product implements the bridge. Preserve the F4 timing contract, existing guards, qualified 2P main and the unmerged research donor.
