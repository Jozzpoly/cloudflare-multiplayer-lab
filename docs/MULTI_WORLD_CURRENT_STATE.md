# Multi_World — Current State

Status: **CANONICAL LIVE-STATE SUMMARY — VERIFY LIVE**  
Grounded: **2026-09-08**  
Canonical repository branch: `main`  
Qualified runtime/evidence anchor: `main@692ac8524c0bd056458658408f7d78d82237aab9`

This document answers **what is true now**. It does not replace [`MULTI_WORLD_PROJECT_SOUL.md`](MULTI_WORLD_PROJECT_SOUL.md), which answers **what the project is trying to become**.

If this file conflicts with newer live repository/runtime evidence or a later GitHub issue #8 checkpoint, newer live evidence wins. Documentation-only commits after the qualified anchor do **not** become new runtime qualification automatically.

---

## 1. Fast state

Multi_World is an evidence-driven R&D project toward a **small shared physical living world** in which a few real people inhabit the same place, affect the same matter and experience consequences as shared reality rather than loosely synchronized client illusions.

The current World V0 / Shared Yard specimen is a qualified **two-player server-authoritative Box3D world** with responsive local browser simulation, scheduled canonical input, exact state guards, bounded lifecycle recovery, same-profile ActorSession continuity and a real browser entry path.

The latest completed technical front is **R2 Jump Reliability**:

> A discrete jump press is no longer represented by a fixed future-tick window. The browser keeps the press pending while the canonical input horizon advances until `world_v0_consumed` proves that authority actually consumed `jump=true`.

The authority still applies jump physics only on a grounded canonical rising edge. Canonical delivery clears the pending press even when support rejects the impulse, so R2 does **not** introduce coyote time or landing buffering.

R1 Session Continuity remains fully earned underneath R2: within a still-recoverable live WorldEpoch, closing a tab and reopening from the same browser profile can recover the same ActorSession / NetEntity from either the room list or the exact public Yard link.

---

## 2. Hierarchy of truth

Use this order for takeover and technical decisions:

1. live `main`, exact SHAs and current CI/runtime evidence;
2. newest GitHub issue #8 checkpoints;
3. this file;
4. [`MULTI_WORLD_PROJECT_SOUL.md`](MULTI_WORLD_PROJECT_SOUL.md) for durable product intent;
5. [`MULTI_WORLD_TAKEOVER_INDEX.md`](MULTI_WORLD_TAKEOVER_INDEX.md) for the minimal operational map;
6. older grounding/takeover/experiment documents as provenance only.

Historical handoffs and old branches are not merge authorities.

---

## 3. Current exact anchors

### Qualified integrated product tree

Clean qualified R2 source:

`world-v0-jump-reliability-r2@1afe2428518c7c97fb96fef46f8a010eaaba3999`

Integrated runtime/evidence anchor:

`main@692ac8524c0bd056458658408f7d78d82237aab9`

Qualified product tree:

`b5f1608d2c090c984545be027cbe05a3dd8de69f`

The integration commit has the **same tree** as the clean R2 source. Integration changed ancestry/provenance, not product contents.

Previous R1 integrated runtime anchor `72f971cff84f991f994df1b821f656941c0cd8eb` remains useful provenance but is no longer the latest runtime state.

### Runtime identity

Current relevant identity:

- contract: `shared-yard-v0-contract-v14-jump-delivery-persistence`;
- authority: `shared-yard-v0-authority-v11-jump-delivery-persistence`;
- browser sim: `shared-yard-v0-browser-sim-v10-jump-delivery-persistence`;
- browser UI: `shared-yard-v0-browser-ui-v19-jump-delivery-persistence`;
- simulation build: `shared-yard-v0-sim-cd8edc169f791a64`;
- protocol: `shared-yard-v0-scheduled-input-v3-supersession`;
- session continuity: `world-v0-session-continuity-r2-slot-bound`;
- public-room directory: `world-v0-public-room-directory-r2-slot-presence`.

R2 changed discrete jump delivery persistence and authority jump-edge bookkeeping/revision identity. It did **not** change the 60 Hz simulation rate, movement constants, 36-tick input lease, lifecycle grace timing, session-continuity contract or scheduled-input protocol revision.

### Human-qualified playability ancestor

Relevant Owner-feel ancestor remains:

`world-v0-playability-lead2-owner-feel@2250e45c53aaf2f9107ac718e2ac5dba6ab02d2e`

Owner judgement on that specimen: local play felt substantially smoother / probably acceptable. Later closure/R1/R2 work focused on reliability and input delivery rather than reopening broad feel/content tuning.

---

## 4. What World V0 has earned

Within the qualified two-player envelope, evidence supports:

- one server-authoritative Box3D physical world;
- fixed `60 Hz / 4 substeps` simulation;
- two embodied dynamic player actors plus shared dynamic props;
- canonical scheduled input rather than arrival-time state mutation;
- a **36-tick** actor-local missing-input lease;
- responsive local browser Box3D simulation;
- exact f32 state guards for authority/client comparison;
- authority recording seeds for exact browser bootstrap/rebase;
- bounded same-WorldEpoch / same-ActorSession transport recovery;
- bounded recovery across pre-start and committed-start ambiguity windows;
- a real two-player browser/public-room entry path;
- truthful connected vs reserved room presence;
- same-browser-profile close-tab/new-tab ActorSession continuity while the authoritative seat remains recoverable;
- both room-list reopen and exact `?run=yard-N` direct-link reopen;
- protection against silently taking over an ActorSession that is still connected;
- protection against treating another player's reserved seat as authorization to resume your own session;
- truthful rejection of a fresh/foreign browser profile that does not possess reconnect authority;
- **acknowledgement-driven discrete jump delivery** that survives the demonstrated temporal transport-loss class without relying on a fixed six-tick intent window.

This is not a claim of persistence, arbitrary membership, cross-device identity, larger-player-count multiplayer or arbitrary permanent-network-loss delivery.

---

## 5. Current lifecycle, session and discrete-input contract

### Actor input lease

Canonical actor input fails neutral after **36 missing ticks**. Lease expiry is actor-local containment and does not automatically destroy the WorldEpoch.

### Active WorldEpoch all-transport grace

When an active two-player world loses **all** transports, authority keeps the neutralized in-memory WorldEpoch alive for:

`20 * 60` authority ticks, approximately 20 seconds.

Retained cartography establishes:

- `0.5 s` — preserved;
- `1.5 s` — preserved;
- `5 s` — preserved;
- `11 s` — preserved;
- `14.5 s` — preserved;
- `19 s` — preserved;
- `21 s` — retired.

This is an authority lifecycle boundary, not a promise that every browser outage shorter than 20 seconds automatically recovers.

### Browser automatic retry horizon

Automatic transport recovery uses **12 bounded attempts**, with an approximately `18.25 s` nominal attempt-start horizon. The authority grace intentionally outlives that retry schedule with bounded margin.

### One-player waiting room

A pure one-player pre-start waiting room remains **fail-closed** on transport loss. The old pre-start ActorSession/WorldEpoch retires and a later fresh entrant receives a new one.

### Fully assembled two-player pre-start ambiguity

Once two ActorSessions are assembled, authority grants a bounded ~20 s ambiguity grace so a browser can recover when it cannot know whether its final `ready` frame reached authority before transport loss.

Protocol start requires exactly two ActorSessions, both ready, and both transports currently live.

### Committed-start recovery

If authority has committed the run but an admitted browser loses the start frame/transport before constructing local simulation state, it can rebind the same ActorSession and bootstrap exact active-world state from an authority recording seed.

### Cross-page / direct-link continuity

Private reconnect authority is persisted in the same browser profile. A stored session is presented as resumable only when public authority-backed room state proves the same `worldEpoch` and the browser's stored actor `slot` is specifically present in `reservedSlots`.

`reservedSlots` exposes only anonymous simulation topology (`0` / `1`). The public directory does **not** expose player IDs, ActorSession UUIDs or resume tokens.

Important distinction:

- **my slot reserved** -> same profile may be offered `Resume`;
- **my slot still connected** -> a second tab must not steal it;
- **only the other player's slot reserved** -> my second tab must not be offered Resume;
- **foreign/new profile** -> no private reconnect authority, therefore no resume.

### Discrete jump delivery

The old R1 six-tick jump-intent window is retired.

Current browser semantics:

1. a press creates a pending discrete delivery intent;
2. while pending, future canonical input records continue to carry `jump=true` as the authored horizon moves forward;
3. late/rejected early records do not erase the intent;
4. `world_v0_consumed` with canonical `jump=true` proves delivery and clears pending;
5. authority applies physical jump only on the canonical rising edge when support is valid;
6. if canonical `jump=true` is consumed while airborne/unsupported, `jumpApplied=false` still clears pending;
7. a later canonical false re-arms the authority edge.

Consequently R2 repairs transport delivery without changing the gameplay support rule. It does not queue an airborne press until landing.

---

## 6. R2 causal evidence and retained qualification

### Causal delivery falsifier

Materialize/qualification run `34275754549` — **SUCCESS**.

Real Chromium behind an ordered outbound-delay proxy exercised `180 ms -> 45 ms` transport degradation:

- first press sequence `1`;
- first authored tick `196`;
- first canonical delivered tick `239`;
- delivery span **43 ticks**;
- exactly one authority jump impulse applied;
- authority edge re-armed on canonical false at tick `240`;
- second airborne press canonically delivered at tick `274` with `jumpApplied=false`;
- final applied impulse count remained `1` after landing;
- server late count increased `2 -> 75`;
- exact state-guard mismatches `0`.

Artifact `10075638146`, SHA-256 `835a56d80c27b47eab055acaf8c620dc60627cf142a97c9261dcbe776ec540ff`.

The 43-tick delivery span is intentionally the important causal fact: the press survived far beyond the complete former six-tick R1 window.

### Pre-integration retained qualification

On exact `b5e86fc84fb1f58b20fb63c2dee8e17e08dd2c18`:

- Session Continuity `34276411922` — **SUCCESS**;
  - artifact `10075905937`;
  - SHA-256 `82369c720a3712758b76e24dcd1e99be768586a7869813f811fc148b8105f58e`;
- Current Validation `34276411920` — **SUCCESS**;
  - artifact `10076077942`;
  - SHA-256 `8245101c7372b1bfcf371635631669c139574b712b963aa403dd4fe02a7b6253`.

### Exact clean-head qualification

External qualifier checked out clean R2 head `1afe2428518c7c97fb96fef46f8a010eaaba3999` directly, proved the expected five-file product/evidence delta, zero runtime drift from the qualified R2 runtime, ran full `npm run check`, and re-ran the real-Chromium causal falsifier:

- run `34277207692` — **SUCCESS**;
- artifact `10076188735`;
- SHA-256 `b2c4d94a80c8ca786e603c4a6fd3a76afbd6146186dab21b19c23f0fffbf6c05`.

### Exact post-integration `main` qualification

All required gates ran on exact:

`main@692ac8524c0bd056458658408f7d78d82237aab9`

and passed:

- normal CI `34280426970` — **SUCCESS**;
- Session Continuity `34280426973` — **SUCCESS**;
  - artifact `10077414930`;
  - SHA-256 `eeea5b5a39f162372a6b61437a44465351ea8756a807dca9267e5f7794d190b2`;
- World V0 Current Validation `34280427073` — **SUCCESS**;
  - artifact `10077571450`;
  - SHA-256 `7d1389b9f391be5d02ac9a94853399e41568c6473c44638cb80d9c1b97e85463`.

The global validator re-passed repository/build provenance, I1 lifecycle, waiting-room fail-closed, uncommitted-ready recovery, partial pre-start recovery, pre-start grace, committed-start recovery, cross-page continuity, the 19/21 s all-transport boundary, 14 s exact ActorSession rebase, the prior-failing 14.5 s dual-browser hard-TCP-drop edge, and human-entry/foreign-profile truth.

Retained reusable gates:

- `.github/workflows/world-v0-session-continuity-r1-qualification.yml`;
- `.github/workflows/world-v0-current-validation.yml`.

Retained causal R2 specimen:

- `scripts/world-v0-jump-delivery-persistence-audit.mjs`.

Latest issue #8 technical checkpoint:

`5592166219`

---

## 7. Defects actually found by the closure / R1 / R2 campaigns

The project did not reach this state by merely accumulating green tests. Causal work found real defects, including:

1. client retry horizon shorter than the authority recovery window;
2. admitted browser stranded across the authority-committed start window;
3. ambiguity between browser `ready` send intent and authority receipt;
4. protocol could start after partial pre-start resume with only one live peer;
5. R1 resume presentation initially treated `reserved > 0` as proof that the reserved seat belonged to the current browser, allowing a potential same-profile takeover when only the other player's slot was reserved;
6. the first jump reliability repair encoded successful delivery as a **fixed six-tick temporal window**, so sufficiently bad but recoverable transport could still erase the press even though later canonical future ticks were available.

Each was narrowed, reproduced or causally isolated, repaired and retained as regression evidence where useful. One-shot materializers and temporary falsifier workflows were removed before final qualification.

---

## 8. Explicit nonclaims and known debt

Do **not** silently upgrade these boundaries into capabilities.

### Browser-profile local, not account/cloud identity

Cross-page continuity exists, but reconnect authority is stored locally for the same browser profile/origin. It is not synchronized across devices, browsers or accounts.

### No Durable Object process-loss reconstruction

The Box3D WorldEpoch is in memory. Durable Object process/world loss does not reconstruct the same physical WorldEpoch from persistence.

### No persistent/open-room architecture

The 20 s all-disconnected grace and reserved ActorSession semantics are not persistence, a lobby, a membership service or a continuously open room.

### No guarantee for every outage below 20 s

Authority lifetime and browser automatic retry lifetime are different contracts. A raw manual rebind boundary is not equivalent to guaranteed browser recovery under every real outage pattern.

### No arbitrary permanent-network-loss jump guarantee

R2 proves the exercised ordered transport degradation and closes the demonstrated temporal-window defect. It is not a claim that a press survives arbitrary permanent transport loss or session termination.

### No coyote time or landing buffer

An airborne/unsupported canonical jump press is consumed with `jumpApplied=false` and cleared. It is not replayed at landing. Broader support/contact forgiveness remains unimplemented and unproven.

### No mobile-radio qualification from local evidence

Local Chromium/Workerd hard-drop tests do not prove mobile OS suspension, radio handover or production-network behavior.

### No new remote-placement qualification

The current R2 qualification is local Workerd/Chromium evidence. Earlier project stages contain real Cloudflare/staging and Owner-device evidence, but `692ac852...` has not been promoted into a new remote-placement claim merely by local PASS.

### No arbitrary membership / larger-player-count claim

Current room/session semantics remain deliberately two-player and fixed-seat. R2 does not introduce player churn, lobby architecture or 3+ player scalability.

### Dormant `roomRecovery` compatibility debt

The browser still contains an older compatibility path that current authority no longer emits. It remains known dormant debt; removing it without evidence of harm would create unnecessary runtime churn.

### Old handoff branches remain non-authoritative

In particular, `multi-world-r0d-reliability-handoff` remains stale independent provenance. Do not merge it wholesale.

---

## 9. Current stage decision

**R2 Jump Reliability is integrated and post-merge qualified.** The demonstrated temporal transport-loss mechanism that could erase a jump press is closed without widening support semantics.

R1 Session Continuity remains integrated and qualified underneath it. Issue #8 remains the broader audit/evidence ledger, with checkpoint `5592166219` as the newest technical summary at this grounding.

The reliability campaign should now **stop unless new evidence falsifies the integrated contract**. Adding more outage variants or another qualification loop merely by momentum would be closure creep.

The immediate project posture is:

> **World V0's two-player physical/reliability foundation is technically strong and canonically integrated. Re-ground the next product-facing frontier from current Owner evidence and Project Soul, then choose the smallest discriminating next move.**

Do not automatically start persistence, lobby/membership, 3-player scale, broad refactors or arbitrary content work.

Before substantial implementation:

1. verify live `main` and distinguish docs-only movement from runtime movement;
2. recover the latest relevant Owner play/product evidence;
3. identify the highest-value current friction or desired capability;
4. challenge old candidate priorities;
5. design the smallest falsifier or product slice that can answer the chosen question;
6. use remote/device evidence when the selected question actually requires it.

---

## 10. Fresh takeover reading order

1. [`MULTI_WORLD_PROJECT_SOUL.md`](MULTI_WORLD_PROJECT_SOUL.md) — durable purpose and research posture;
2. **this file** — current technical/project truth;
3. [`MULTI_WORLD_TAKEOVER_INDEX.md`](MULTI_WORLD_TAKEOVER_INDEX.md) — compact operational map;
4. newest GitHub issue #8 checkpoint, currently `5592166219`, when exact evidence matters.

Older grounding, fresh-takeover and experiment-specific documents remain historical material unless a specific question requires them.
