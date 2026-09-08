# Multi_World — Current State

Status: **CANONICAL LIVE-STATE SUMMARY — VERIFY LIVE**  
Grounded: **2026-09-08**  
Canonical repository branch: `main`  
Qualified runtime/evidence anchor: `main@72f971cff84f991f994df1b821f656941c0cd8eb`

This document answers **what is true now**. It does not replace [`MULTI_WORLD_PROJECT_SOUL.md`](MULTI_WORLD_PROJECT_SOUL.md), which answers **what the project is trying to become**.

If this file conflicts with newer live repository/runtime evidence or a later GitHub issue #8 checkpoint, the newer live evidence wins. Documentation-only commits after the qualified anchor do **not** become new runtime qualification automatically.

---

## 1. Fast state

Multi_World is an evidence-driven R&D project toward a **small shared physical living world** in which a few real people inhabit the same place, affect the same matter and experience consequences as shared reality rather than loosely synchronized client illusions.

The current World V0 / Shared Yard specimen is a qualified **two-player server-authoritative Box3D world** with responsive local browser simulation, scheduled input, exact state guards, bounded lifecycle recovery and a real browser entry path.

The latest completed front is **R1 Session Continuity**:

> Within a still-recoverable live WorldEpoch, closing a tab and reopening from the **same browser profile** can recover the same ActorSession / NetEntity from either the room list or the exact public Yard link.

That statement is deliberately narrower than persistence. It is browser-profile-local recovery of an in-memory live world, not an account, cloud save, lobby or permanent room.

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

R1 was qualified before integration at:

`world-v0-session-continuity-r1-exec@c5b071fa15dff403ba82891e21f36fd36c4ac791`

PR #39 merged that exact qualified head into `main` using a normal merge commit:

`72f971cff84f991f994df1b821f656941c0cd8eb`

The merge tree is:

`c57ab4a7c90aebd5101ae09e973481fb80e8243b`

which is the **same tree as the qualified R1 head**. The merge changed ancestry/provenance, not product contents.

### Runtime identity

Current relevant identity:

- contract: `shared-yard-v0-contract-v12-prestart-live-start-gate`;
- authority: `shared-yard-v0-authority-v9-prestart-live-start-gate`;
- browser UI: `shared-yard-v0-browser-ui-v17-slot-bound-session-continuity`;
- simulation build: `shared-yard-v0-sim-69ad9c7d0430a929`;
- session-continuity contract: `world-v0-session-continuity-r2-slot-bound`;
- public-room directory: `world-v0-public-room-directory-r2-slot-presence`.

R1 changed browser/session continuity and truthful public presence metadata. It did **not** redesign the Box3D simulation, scheduled-input protocol, movement contract or lifecycle timing.

### Human-qualified playability ancestor

Relevant Owner-feel ancestor remains:

`world-v0-playability-lead2-owner-feel@2250e45c53aaf2f9107ac718e2ac5dba6ab02d2e`

Owner judgement on that specimen: local play felt substantially smoother / probably acceptable. Later closure/R1 work focused on reliability and session continuity rather than reopening feel/content tuning.

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
- **same-browser-profile close-tab/new-tab ActorSession continuity** while the authoritative seat remains recoverable;
- both room-list reopen and exact `?run=yard-N` direct-link reopen;
- protection against silently taking over an ActorSession that is still connected;
- protection against treating **another player's** reserved seat as authorization to resume your own session;
- truthful rejection of a fresh/foreign browser profile that does not possess the reconnect authority.

This is not a claim of persistence, arbitrary membership, cross-device identity or larger-player-count multiplayer.

---

## 5. Current lifecycle and session-continuity contract

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

Protocol start requires:

- exactly two ActorSessions;
- both ready;
- **both transports currently live**.

### Committed-start recovery

If authority has committed the run but an admitted browser loses the start frame/transport before constructing local simulation state, it can rebind the same ActorSession and bootstrap exact active-world state from an authority recording seed.

### Cross-page / direct-link continuity

R1 persists private reconnect authority in the same browser profile. A stored session is presented as resumable only when public authority-backed room state proves:

- the same `worldEpoch`; and
- the browser's stored actor `slot` is specifically present in `reservedSlots`.

`reservedSlots` exposes only anonymous simulation topology (`0` / `1`). The public directory does **not** expose player IDs, ActorSession UUIDs or resume tokens.

Important distinction:

- **my slot reserved** -> same profile may be offered `Resume`;
- **my slot still connected** -> a second tab must not steal it;
- **only the other player's slot reserved** -> my second tab must not be offered Resume;
- **foreign/new profile** -> no private reconnect authority, therefore no resume.

If one healthy peer remains connected, the current frozen two-player membership semantics can keep the other seat reserved while the same WorldEpoch remains active. If every transport disappears, the 20 s all-disconnected authority grace becomes the relevant lifetime bound.

---

## 6. Current retained evidence

### Exact R1 pre-merge qualification

Session Continuity Validation:

- run `34262280219` — **SUCCESS**;
- exact head `c5b071fa15dff403ba82891e21f36fd36c4ac791`;
- artifact `10070400275`;
- SHA-256 `fd3a637717eb5f3a426d142221d0727ff2d992ad504fc2a5ce5b3693c2065459`.

Global World V0 Current Validation:

- run `34262280168` — **SUCCESS**;
- exact same head;
- artifact `10070576187`;
- SHA-256 `3c49f42c3636419e029b6f4e50514f3586f90d8c8329f2e3bfa0e6634a79a095`.

### Exact post-merge `main` qualification

All required gates ran on exact:

`main@72f971cff84f991f994df1b821f656941c0cd8eb`

and passed:

- normal CI `34264320221` — **SUCCESS**;
- World V0 Session Continuity Validation `34264320224` — **SUCCESS**;
  - artifact `10071208496`;
  - SHA-256 `218cc61c43d6b6eb34ddbc71824651cde975a91b090c881dfc963bb388b1032b`;
- World V0 Current Validation `34264320312` — **SUCCESS**;
  - artifact `10071385727`;
  - SHA-256 `014c4467103a4baf71756d2bcd2d8c086ba4ad032faa638d258d9c02873cbf28`.

The global retained validator re-passed:

- repository/build-provenance checks;
- I1 ActorSession lifecycle;
- one-player waiting-room fail-closed;
- uncommitted-ready ambiguity recovery;
- partial pre-start live-start recovery;
- bounded two-player pre-start grace;
- committed-start recovery;
- cross-page continuity / truthful presence;
- all-transport-loss boundary map;
- 14 s automatic exact-rebase recovery;
- the prior-failing 14.5 s dual-browser hard-TCP-drop edge;
- real Chromium human-entry / foreign-profile reopen truth.

Canonical reusable gates are now:

- `.github/workflows/world-v0-session-continuity-r1-qualification.yml`;
- `.github/workflows/world-v0-current-validation.yml`.

Issue #8 final R1 integration checkpoint:

`5590133257`

The earlier closure checkpoint `5577741764` remains useful provenance but is no longer the latest technical state.

---

## 7. Defects actually found by the reliability / R1 campaigns

The project did not get here by merely adding green tests. Causal work found real defects, including:

1. client retry horizon shorter than the authority recovery window;
2. admitted browser stranded across the authority-committed start window;
3. ambiguity between browser `ready` send intent and authority receipt;
4. protocol could start after partial pre-start resume with only one live peer;
5. R1 resume presentation initially treated `reserved > 0` as proof that the reserved seat belonged to the current browser, allowing a potential same-profile takeover of an active slot when only the **other** player's slot was reserved.

Each was narrowed, reproduced or causally isolated, repaired and retained as a regression where useful.

One-shot materializers and temporary falsifier workflows used to produce these repairs were removed before final qualification.

---

## 8. Explicit nonclaims and known debt

Do **not** silently upgrade these boundaries into capabilities.

### Browser-profile local, not account/cloud identity

Cross-page continuity now exists, but reconnect authority is stored locally for the same browser profile/origin. It is **not** synchronized across devices, browsers or accounts.

### No Durable Object process-loss reconstruction

The Box3D WorldEpoch is in memory. Durable Object process/world loss does not reconstruct the same physical WorldEpoch from persistence.

### No persistent/open-room architecture

The 20 s all-disconnected grace and reserved ActorSession semantics are not persistence, a lobby, a membership service or a continuously open room.

### No guarantee for every outage below 20 s

Authority lifetime and browser automatic retry lifetime are different contracts. A raw manual rebind boundary is not equivalent to guaranteed browser recovery under every real outage pattern.

### No mobile-radio qualification from local evidence

Local Chromium/Workerd hard-drop tests do not prove mobile OS suspension, radio handover or production-network behavior.

### No new remote-placement qualification

The current R1 qualification is local Workerd/Chromium evidence. Earlier project stages contain real Cloudflare/staging and Owner-device evidence, but `72f971c...` has not been promoted into a new remote-placement claim merely by local PASS.

### No arbitrary membership / larger-player-count claim

Current room/session semantics remain deliberately two-player and fixed-seat. R1 does not introduce player churn, lobby architecture or 3+ player scalability.

### Dormant `roomRecovery` compatibility debt

The browser still contains an older compatibility path that current authority no longer emits. It remains known dormant debt; removing it without evidence of harm would create unnecessary runtime churn.

### Old handoff branches remain non-authoritative

In particular, `multi-world-r0d-reliability-handoff` remains stale independent provenance. Do not merge it wholesale.

---

## 9. Current stage decision

R1 Session Continuity is **integrated and post-merge qualified**. The previous cross-tab/new-tab nonclaim is closed **within the bounded same-browser-profile live-WorldEpoch contract above**.

Issue #8 remains open as the broader closure/audit ledger. R1 completion is not permission to reopen infrastructure work by momentum.

The immediate project posture is:

> **World V0's two-player physical/reliability foundation is technically strong and canonically integrated. Re-ground the next product-facing frontier from current Owner evidence and Project Soul, then choose the smallest discriminating next move.**

Do not automatically start persistence, lobby/membership, 3-player scale, broad refactors or arbitrary content work.

Jump/content behavior was **not** part of R1. Any jump-related issue remains a separate causal/product question and should not be inherited as the next priority without re-grounding.

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
4. newest GitHub issue #8 checkpoint(s), especially `5590133257`, when exact evidence matters.

Older grounding, fresh-takeover and experiment-specific documents remain historical material unless a specific question requires them.
