# Multi_World — Current State

Status: **CANONICAL LIVE-STATE SUMMARY**  
Grounded: **2026-09-08**  
Canonical technical branch at this checkpoint: `world-v0-closure-stabilization`  
Qualified clean head: `1a759f0bd7aefd70027b2ed1d85e5cc7987bc01b`

This document answers **what is true now**. It does not replace [`MULTI_WORLD_PROJECT_SOUL.md`](MULTI_WORLD_PROJECT_SOUL.md), which answers **what the project is trying to become**.

When this document conflicts with newer live repository/runtime evidence or a later GitHub issue #8 checkpoint, the newer live evidence wins.

---

## 1. Project identity

Multi_World is working toward a **small shared physical living world** in which a few real people inhabit the same place, affect the same matter and experience consequences as shared reality rather than loosely synchronized client illusions.

The current Cloudflare / Durable Object / WebSocket / Box3D / Three.js stack is a research substrate, not the identity of the project.

The product pressure remains:

> **PLAYER INTENT ↔ PHYSICAL CONSEQUENCE ↔ SHARED TRUTH**

See [`MULTI_WORLD_PROJECT_SOUL.md`](MULTI_WORLD_PROJECT_SOUL.md) for the durable product/research direction.

---

## 2. Hierarchy of truth

Use this order when taking over the project:

1. live repository state, exact SHAs and current CI/runtime evidence;
2. GitHub issue #8, especially its newest checkpoints;
3. this current-state document;
4. Project Soul for durable product intent;
5. older grounding/takeover documents as historical reasoning/provenance;
6. old README text, old branch names and conversation lore.

Historical handoffs are not merge authorities.

---

## 3. Current qualified specimen

### Technical closure head

Branch:

`world-v0-closure-stabilization`

Qualified clean head:

`1a759f0bd7aefd70027b2ed1d85e5cc7987bc01b`

Current runtime identity:

- contract: `shared-yard-v0-contract-v12-prestart-live-start-gate`;
- authority: `shared-yard-v0-authority-v9-prestart-live-start-gate`;
- browser UI: `shared-yard-v0-browser-ui-v15-prestart-live-start-gate`;
- simulation build: `shared-yard-v0-sim-69ad9c7d0430a929`.

The current user-facing research specimen is **World V0 / Shared Yard**: a deliberately small two-player shared Box3D world with scheduled input, local client simulation, exact state guards and authority rebase/recovery machinery.

### Human-qualified playability ancestor

The closure line descends from the Owner-qualified playability specimen:

`world-v0-playability-lead2-owner-feel@2250e45c53aaf2f9107ac718e2ac5dba6ab02d2e`

Owner judgement on that specimen: local play felt substantially smoother / probably acceptable. The later closure campaign did not open a new feel or content front; it focused on reliability, lifecycle boundaries, handshake ambiguity and evidence integrity.

### Frozen reliability ancestry

Important earlier preserved anchors remain:

- qualified product/reliability source: `world-v0-multiplayer-foundation-integration@a2e821afbbc88371b033af311cc6882d46aa6916`;
- isolated R0d retest: `world-v0-r0d-reliability-retest@7da9ddd4ad37221f63a3cd418a140824783480ec`;
- R0d final workflow `34060903778` = `completed / success`.

These are provenance anchors, not instructions to reset current work back to those branches.

---

## 4. What the current substrate has earned

### Shared physical simulation

Strongly established in the qualified World V0 envelope:

- one server-authoritative Box3D world;
- fixed `60 Hz` simulation with `4` substeps;
- two embodied dynamic player actors and shared dynamic props;
- canonical scheduled input rather than arrival-time mutation;
- exact simulation/build identity carried through the protocol;
- local browser Box3D simulation for responsive embodiment;
- exact f32 state guards for authority/client comparison;
- authority recording seed capable of exact browser state bootstrap/rebase;
- same ActorSession/NetEntity can survive bounded transport loss without rotating the WorldEpoch.

This is substantially beyond the repository's old Gate 4A README description. The old statement that Gate 4B had not started is obsolete.

### Human entry / two-player product shell

The project has a real two-player browser entry path rather than only a synthetic protocol probe. Current retained evidence covers human-entry behavior and truthful fresh-reopen failure semantics.

This does **not** mean persistence, lobby architecture or arbitrary room membership has been built.

---

## 5. Current lifecycle / reliability contract

These boundaries are intentional and separately modeled.

### Actor input lease

Canonical actor input fails neutral after a **36-tick** missing-input lease.

Lease expiry is actor-local containment. It does not automatically mean the global WorldEpoch must die.

### Active WorldEpoch transport-loss grace

When an active two-player world loses all transports, authority keeps the neutralized in-memory WorldEpoch alive for:

`20 * 60` authority ticks, approximately 20 seconds.

Final raw local close/rebind cartography on the clean head showed:

- `0.5 s` — preserved;
- `1.5 s` — preserved;
- `5 s` — preserved;
- `11 s` — preserved;
- `14.5 s` — preserved;
- `19 s` — preserved;
- `21 s` — retired.

This is an **authority-observed lifecycle window**, not a promise that every browser outage below 20 seconds must recover end-to-end.

### Browser ActorSession retry horizon

Client ActorSession recovery uses 12 bounded attempts. This was increased from 8 after a real Chromium 14 s targeted outage exhausted the old retry budget while a healthy peer kept the WorldEpoch alive.

### One-player waiting room

A pure one-player pre-start waiting room remains **fail-closed** on transport loss:

- no ActorSession recovery is armed;
- retry budget remains unused;
- old pre-start WorldEpoch/ActorSession retires;
- a later fresh entrant receives a new epoch/session.

### Fully assembled two-player pre-start ambiguity

Once two ActorSessions are assembled, authority grants a bounded ~20 s pre-start ambiguity grace. This exists because a browser cannot know whether its final WebSocket `ready` frame was actually received by authority before transport failure.

Inside that grace the same pre-start ActorSession/WorldEpoch may resume.

If abandoned, authority retires it with:

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

## 6. Final closure evidence

Canonical final current-head validator:

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
- explicit absence of consumed one-shot closure materializers/workflows;
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

### Strong end-to-end browser evidence

Final clean-head local evidence includes:

- **14 s single-target real Chromium outage:** same ActorSession + NetEntity, 1020-tick gap, one exact authority rebase, zero state-guard mismatches;
- **14.5 s dual-browser hard TCP loss:** both upstream/browser transports severed and reconnects blocked, then both ActorSessions recovered in the same WorldEpoch with 904 / 1020 tick rebase gaps and zero guard mismatches.

These are stronger claims than simple CDP offline simulation because the dual-browser apparatus severs the proxy's upstream Worker TCP transports as well.

---

## 7. Closure campaign findings

The stabilization campaign found four real defects rather than merely polishing tests:

1. client retry horizon shorter than the authority recovery window;
2. admitted browser stranded across the authority-committed start window;
3. unrepresented ambiguity between browser `ready` send intent and authority receipt;
4. protocol could start after partial pre-start resume with only one live peer.

Each defect was:

- causally reproduced or isolated;
- repaired narrowly;
- requalified against neighboring boundaries;
- retained as a current regression where useful.

Fresh one-shot repair/falsifier workflows and materializers were then removed. Historical pre-I1 smokes remain only as explicitly opt-in provenance apparatus and are not current gates.

Canonical ledger checkpoint: GitHub issue #8 comment `5577741764`.

---

## 8. Explicit non-claims and known debt

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

The final closure validator is local Workerd/Chromium evidence. Earlier project stages contain real Cloudflare/staging and Owner-device evidence, but the v9 closure head itself has not been promoted merely by this local PASS.

### Dormant browser `roomRecovery` compatibility path

The browser still contains an older `roomRecovery` compatibility path for pre-I1 reasons that current authority no longer emits. It is classified as dormant compatibility debt. Removing it would create large cosmetic churn in a high-value runtime file and is not justified without evidence of harm.

---

## 9. Branch / deployment truth

### Closure branch is the current technical authority

Use:

`world-v0-closure-stabilization@1a759f0bd7aefd70027b2ed1d85e5cc7987bc01b`

for the current qualified technical state.

### `main` is not yet that authority

Live `main` at this grounding:

`401be09ccd09decf493e4fcf4bea784e841e6163`

`main` and the closure branch **diverged** from merge base:

`d5758bf18b5ebd5fb7ce5a705d525c80d3bca5de`

At the 2026-09-08 audit, closure was 493 commits ahead of the merge base while `main` contained 20 commits on its own side.

Therefore do not fast-forward mentally, do not force-push and do not blindly merge closure into `main`. The 20 main-side commits must be classified before consolidation.

### Old handoff branch is not merge authority

`multi-world-r0d-reliability-handoff` contains stale independent documentation/provenance commits. Do not merge it wholesale into the closure line.

---

## 10. Current stage decision

The closure campaign is technically complete enough to stop inventing arbitrary additional outage variants.

That does **not** mean Multi_World itself is finished.

The immediate project state is:

> **World V0's current two-player foundation has a strong locally qualified lifecycle/recovery closure; the next work is repository/canonical-state consolidation, not a new gameplay/network feature front.**

Before ordinary feature development resumes:

1. consolidate the canonical docs around this state;
2. audit `main`'s independent 20-commit side of the divergence;
3. decide and validate the safest branch/main consolidation path;
4. verify any remote/staging promotion separately if promotion is desired.

Only after that should the project select its next product-facing unknown from current evidence and Project Soul.

---

## 11. Takeover reading order

For a fresh continuation, read:

1. [`MULTI_WORLD_PROJECT_SOUL.md`](MULTI_WORLD_PROJECT_SOUL.md) — durable purpose and research posture;
2. **this file** — current technical/project truth;
3. [`MULTI_WORLD_TAKEOVER_INDEX.md`](MULTI_WORLD_TAKEOVER_INDEX.md) — operational entrypoint and provenance map;
4. newest GitHub issue #8 checkpoint(s) when deeper evidence is needed.

Older grounding, fresh-takeover and experiment-specific documents remain historical material, not live authority.
