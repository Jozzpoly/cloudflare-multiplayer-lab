# Multi_World — Current State

Status: **CANONICAL LIVE-STATE SUMMARY**  
Grounded: **2026-09-08**  
Canonical repository branch: `main`  
Consolidation merge checkpoint: `66f40bb86a066658b15bbd45c7baea86d1bb2a44`  
Qualified runtime/evidence checkpoint: `1a759f0bd7aefd70027b2ed1d85e5cc7987bc01b`

This document answers **what is true now**. It does not replace [`MULTI_WORLD_PROJECT_SOUL.md`](MULTI_WORLD_PROJECT_SOUL.md), which answers **what the project is trying to become**.

When this document conflicts with newer live repository/runtime evidence or a later GitHub issue #8 checkpoint, the newer live evidence wins.

---

## 1. Project identity

Multi_World is working toward a **small shared physical living world** in which a few real people inhabit the same place, affect the same matter and experience consequences as shared reality rather than loosely synchronized client illusions.

The current Cloudflare / Durable Object / WebSocket / Box3D / Three.js stack is a research substrate, not the identity of the project.

The durable product pressure remains:

> **PLAYER INTENT ↔ PHYSICAL CONSEQUENCE ↔ SHARED TRUTH**

See [`MULTI_WORLD_PROJECT_SOUL.md`](MULTI_WORLD_PROJECT_SOUL.md) for the durable product/research direction.

---

## 2. Hierarchy of truth

Use this order when taking over the project:

1. live `main`, exact SHAs and current CI/runtime evidence;
2. GitHub issue #8, especially its newest checkpoints;
3. this current-state document;
4. Project Soul for durable product intent;
5. older grounding/takeover documents as historical reasoning/provenance;
6. old README text, old branch names and conversation lore.

Historical handoffs are not merge authorities.

---

## 3. Canonical repository state vs qualified runtime state

These are intentionally distinguished.

### Canonical repository lineage

The repository is now consolidated on:

`main`

The closure/main ancestry reconciliation was merged through PR #38 at:

`66f40bb86a066658b15bbd45c7baea86d1bb2a44`

The merge preserved the qualified closure lineage and the useful dated 2026-09-05 documentation from the independent `main` side, while intentionally not restoring the stale `WORLD_V0_OPERATING_MAP.md` as a live authority document.

The integration was **docs-only relative to the qualified technical checkpoint**.

### Qualified runtime/evidence checkpoint

The exact runtime specimen remains:

`world-v0-closure-stabilization@1a759f0bd7aefd70027b2ed1d85e5cc7987bc01b`

Runtime identity:

- contract: `shared-yard-v0-contract-v12-prestart-live-start-gate`;
- authority: `shared-yard-v0-authority-v9-prestart-live-start-gate`;
- browser UI: `shared-yard-v0-browser-ui-v15-prestart-live-start-gate`;
- simulation build: `shared-yard-v0-sim-69ad9c7d0430a929`.

Later repository/documentation commits must not be described as new runtime qualification unless runtime bytes actually change and are revalidated.

### Human-qualified playability ancestor

The closure line descends from:

`world-v0-playability-lead2-owner-feel@2250e45c53aaf2f9107ac718e2ac5dba6ab02d2e`

Owner judgement on that specimen: local play felt substantially smoother / probably acceptable. The later closure campaign did not open a new feel/content front; it focused on reliability, lifecycle boundaries, handshake ambiguity and evidence integrity.

### Earlier reliability anchors

Preserved provenance controls:

- `world-v0-multiplayer-foundation-integration@a2e821afbbc88371b033af311cc6882d46aa6916`;
- `world-v0-r0d-reliability-retest@7da9ddd4ad37221f63a3cd418a140824783480ec`;
- R0d workflow `34060903778` = `completed / success`.

These are controls, not current working branches.

---

## 4. What World V0 has earned

Within the qualified two-player envelope, the project has strongly established:

- one server-authoritative Box3D world;
- fixed `60 Hz / 4 substeps` simulation;
- two embodied dynamic player actors and shared dynamic props;
- canonical scheduled input rather than arrival-time mutation;
- exact simulation/build identity carried through the protocol;
- local browser Box3D simulation for responsive embodiment;
- exact f32 state guards for authority/client comparison;
- authority recording seeds for exact browser state bootstrap/rebase;
- bounded same-WorldEpoch / same-ActorSession transport recovery;
- a real two-player browser entry path rather than only synthetic protocol probes.

This is substantially beyond the repository's historical Gate 4A description.

It does **not** imply persistence, lobby architecture, arbitrary room membership or large-player-count multiplayer.

---

## 5. Current lifecycle / reliability contract

### Actor input lease

Canonical actor input fails neutral after a **36-tick** missing-input lease.

Lease expiry is actor-local containment. It does not automatically mean the global WorldEpoch must die.

### Active WorldEpoch all-transport grace

When an active two-player world loses all transports, authority keeps the neutralized in-memory WorldEpoch alive for:

`20 * 60` authority ticks, approximately 20 seconds.

Final raw local close/rebind cartography showed:

- `0.5 s` — preserved;
- `1.5 s` — preserved;
- `5 s` — preserved;
- `11 s` — preserved;
- `14.5 s` — preserved;
- `19 s` — preserved;
- `21 s` — retired.

This is an **authority-observed lifecycle window**, not a promise that every browser outage below 20 seconds must recover end-to-end.

### Browser ActorSession retry horizon

Client ActorSession recovery uses **12 bounded attempts**. This was increased from 8 after a real Chromium 14 s targeted outage exhausted the old retry budget while a healthy peer kept the WorldEpoch alive.

### One-player waiting room

A pure one-player pre-start waiting room remains **fail-closed** on transport loss:

- no ActorSession recovery is armed;
- old pre-start WorldEpoch/ActorSession retires;
- a later fresh entrant receives a new epoch/session.

### Fully assembled two-player pre-start ambiguity

Once two ActorSessions are assembled, authority grants a bounded ~20 s pre-start ambiguity grace. This exists because a browser cannot know whether its final WebSocket `ready` frame was actually received by authority before transport failure.

Inside that grace the same pre-start ActorSession/WorldEpoch may resume. If abandoned, authority retires it with:

`peer_disconnected_before_start_grace_expired`

Final retained evidence observed expiry at approximately `20.007 s`.

### Start eligibility

Protocol start requires all of the following:

- exactly two ActorSessions;
- both are ready;
- **both transports are currently live**.

The live-transport requirement was added after a causal falsifier proved that sticky ready state could otherwise start the two-player protocol when only one peer had resumed.

### Committed-start handshake recovery

If authority has committed the run but an admitted browser loses the `world_v0_start` frame and then loses transport before constructing local state, that browser can automatically rebind the same ActorSession and bootstrap exact active-world state from an authority recording seed.

The recovery path validates WorldEpoch, ActorSession, NetEntity, protocol start and exact state guard.

---

## 6. Final technical closure evidence

Canonical retained validator:

`.github/workflows/world-v0-closure-current-validation.yml`

Final clean-head run:

- workflow run: `34176613974`;
- job: `101907169173`;
- exact head: `1a759f0bd7aefd70027b2ed1d85e5cc7987bc01b`;
- result: **completed / success**;
- artifact: `10037571475`;
- artifact SHA-256: `3de29b79003fe747f0af2602357c446bf633f95fd26c7d33a922547787565c23`.

The retained validator simultaneously covers:

- full repository checks and build-provenance consistency;
- absence of consumed one-shot closure materializers/workflows;
- I1 ActorSession/WorldEpoch lifecycle semantics;
- one-player waiting-room fail-closed behavior;
- lost-final-ready ambiguity recovery;
- partial pre-start resume live-peer start gate;
- bounded pre-start expiry;
- committed-start-window automatic exact recovery;
- raw all-transport grace cartography;
- real Chromium 14 s single-target exact recovery;
- two-real-Chromium 14.5 s bidirectional hard TCP drop/recovery;
- human-entry and truthful fresh-reopen behavior.

Strong end-to-end local browser evidence includes:

- **14 s single-target real Chromium outage:** same ActorSession + NetEntity, 1020-tick gap, one exact authority rebase, zero state-guard mismatches;
- **14.5 s dual-browser hard TCP loss:** both upstream/browser transports severed and reconnects blocked, then both ActorSessions recovered in the same WorldEpoch with 904 / 1020 tick rebase gaps and zero guard mismatches.

Canonical technical closure ledger checkpoint: GitHub issue #8 comment `5577741764`.

---

## 7. Closure campaign findings

The stabilization campaign found four real defects rather than merely polishing tests:

1. client retry horizon shorter than the authority recovery window;
2. admitted browser stranded across the authority-committed start window;
3. unrepresented ambiguity between browser `ready` send intent and authority receipt;
4. protocol could start after partial pre-start resume with only one live peer.

Each defect was causally reproduced or isolated, narrowly repaired, requalified against neighboring boundaries and retained as a regression where useful.

Fresh one-shot repair/falsifier workflows and materializers were then removed. Historical pre-I1 smokes remain only as explicitly opt-in provenance apparatus and are not current gates.

---

## 8. Repository consolidation evidence

The independent pre-merge `main` side was audited from merge base:

`d5758bf18b5ebd5fb7ce5a705d525c80d3bca5de`

Its net effect was documentation-only. No competing runtime implementation existed there.

A controlled ancestry integration commit was built as:

`a5481efc8644140d3bd87d37b29144c1eedb75a4`

with parents:

- closure/docs lineage `8ce4770a1e70b05ef71fcf654d6c8d65fb4d5420`;
- pre-integration `main@401be09ccd09decf493e4fcf4bea784e841e6163`.

PR #38 validated and merged that integration.

Pre-merge PR evidence:

- standard CI `34177475444` — **SUCCESS**;
- F5 preflight `34177475333` — **SUCCESS**;
- exact integration diff from qualified technical checkpoint contained only documentation files.

Merge commit:

`66f40bb86a066658b15bbd45c7baea86d1bb2a44`

Post-merge `main` push CI:

- run `34177544920`;
- event `push`;
- exact head `66f40bb86a066658b15bbd45c7baea86d1bb2a44`;
- result **completed / success**.

Therefore the former `main`/closure divergence is no longer an open project-management problem.

---

## 9. Explicit non-claims and known debt

Do **not** silently upgrade the following into capabilities:

### No cross-tab ActorSession continuity

Closing a page and opening a new tab does not preserve ActorSession identity. The private resume token is currently page-memory-only.

Fresh reopen is intentionally truthful rather than pretending to resume.

### No Durable Object process-loss reconstruction

The current Box3D world is in-memory. If the Durable Object process/world is lost, there is no contract that reconstructs the same physical WorldEpoch from persistence.

### No persistent/open-room architecture

The bounded lifecycle grace is not persistence and is not a lobby, membership service or continuously open room.

### No mobile-radio qualification from local closure tests

Local Chromium/Workerd hard-drop evidence does not prove real mobile OS suspension, radio handover or production network behavior.

### No remote-placement claim from the final closure validator

The final closure validator is local Workerd/Chromium evidence. Earlier project stages contain real Cloudflare/staging and Owner-device evidence, but the v9 closure head itself has not been remotely re-promoted merely by this local PASS.

### Dormant browser `roomRecovery` compatibility path

The browser still contains an older `roomRecovery` compatibility path for pre-I1 reasons that current authority no longer emits. It is classified as dormant compatibility debt. Removing it would create large cosmetic churn in a high-value runtime file and is not justified without evidence of harm.

### Old handoff branch remains non-authoritative

`multi-world-r0d-reliability-handoff` contains stale independent documentation/provenance commits. Do not merge it wholesale into the canonical line.

---

## 10. Current stage decision

The technical closure **and** repository consolidation are complete enough to close the temporary consolidation freeze.

That does **not** mean the next old roadmap item should automatically begin.

The immediate project state is:

> **World V0's two-player physical foundation is technically closed and canonically consolidated on `main`; the next task is to re-ground the product-facing frontier from current Owner evidence and Project Soul, then choose the smallest discriminating next move.**

Do not continue inventing arbitrary outage variants. Do not reopen persistence, lobby/membership, 3-player scale, content expansion or broad refactors by momentum.

Before the next substantial implementation:

1. re-read the latest relevant Owner product/play evidence;
2. identify the highest-value current friction or desired capability;
3. challenge old candidate priorities rather than inheriting them;
4. design the smallest falsifier / product slice that can answer that question;
5. separately re-qualify remote/staging behavior if the chosen next step requires public/device evidence.

---

## 11. Takeover reading order

For a fresh continuation, read:

1. [`MULTI_WORLD_PROJECT_SOUL.md`](MULTI_WORLD_PROJECT_SOUL.md) — durable purpose and research posture;
2. **this file** — current technical/project truth;
3. [`MULTI_WORLD_TAKEOVER_INDEX.md`](MULTI_WORLD_TAKEOVER_INDEX.md) — operational entrypoint and provenance map;
4. newest GitHub issue #8 checkpoint(s) when deeper evidence is needed.

Older grounding, fresh-takeover and experiment-specific documents remain historical material, not live authority.
