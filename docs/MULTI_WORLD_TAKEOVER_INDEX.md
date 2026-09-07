# Multi_World — Takeover package index

Status: **HUMAN ENTRY REPAIR QUALIFIED + PUBLICLY DEPLOYED / R0d OWNER HUMAN RELIABILITY RETEST NEXT**  
Updated: **2026-09-07**  
Handoff branch: `multi-world-r0d-reliability-handoff`

This branch is documentation/reference only. Runtime authority remains the explicitly qualified/deployed specimens below.

---

## Canonical reading order now

1. **`WORLD_V0_R0D_HUMAN_ENTRY_REPAIR_2026-09-07.md`**  
   Current frontier. Records the failed first Owner entry attempt, the hidden callsign-contract defect, the bounded repair, the new cold-direct-link real-human browser gate, qualification evidence, public isolated deployment and exact provenance.

2. **`MULTI_WORLD_CURRENT_STATE.md`**  
   Baseline machine-qualification state. Preserve its I1–I4/runtime conclusions, but apply the later audit and human-entry layers below.

3. **`WORLD_V0_R0D_PRE_OWNER_FALSIFICATION_AUDIT_PASS2_2026-09-07.md`**  
   Final broad pre-human reliability falsification layer: live-socket input starvation, full renderer-main-thread stall and apparatus corrections.

4. **`WORLD_V0_R0D_PRE_OWNER_FALSIFICATION_AUDIT_2026-09-07.md`**  
   First pre-Owner red-team layer: run-ID correction, mobile/process lifecycle boundaries and other nonclaims.

5. **`MULTI_WORLD_FRESH_TAKEOVER_V4.md`**  
   Pre-human-entry-repair takeover mandate. Still authoritative for I1–I4 and the two-phase human reliability contract, but **superseded on current deployment/entry readiness by item 1 and newest issue #8 checkpoint**.

6. **`WORLD_V0_R0D_RELIABILITY_RETEST_HANDOFF.md`** and **`WORLD_V0_R0D_RELIABILITY_EVIDENCE_MANIFEST.md`**  
   Detailed original R0d machine evidence/provenance.

7. **GitHub issue #8**  
   - original human continuity FAIL: comment `5558411044`;
   - Pass-2 checkpoint: comment `5568444757`;
   - **current human-entry repair/deployment checkpoint: comment `5573318721`**.

8. **`MULTI_WORLD_PROJECT_SOUL.md`**  
   Stable project intent when broader grounding is needed.

Older V3/V2/V1 and A2R-era takeover material are provenance, not current startup authority.

---

## Current exact runtime and delivery anchors

### Frozen qualified multiplayer runtime

`world-v0-multiplayer-foundation-integration@a2e821afbbc88371b033af311cc6882d46aa6916`

This remains the I1–I4 authority/runtime source.

### Previous R0d delivery baseline

`world-v0-r0d-reliability-retest@7da9ddd4ad37221f63a3cd418a140824783480ec`

Original remote qualification workflow `34060903778`: **PASS**.

### Qualified human-entry repair

`world-v0-r0d-human-entry-readiness@3e03e8228f665bef32a4ba97058d69c2e27a9e48`

Readiness workflow `34142054891`: **PASS**.

Artifact `10026264308`, SHA-256:

`457ff8b75e25c4096440d186bad04eb38a53abe9aea78e2676dcb3a46bf52f0b`

### Current isolated public R0d delivery

`world-v0-r0d-human-entry-delivery@6f4abd4dd17c59078ab99530e64ef6cf752ab5ce`

Delivery workflow `34142273602`: **PASS**.

Worker:

`https://cloudflare-multiplayer-lab-reliability-play.jozzpoly.workers.dev`

Public artifact `10026356500`, SHA-256:

`86ec8ac5c6451b404c8945eda2228e5fcc0b2cadf32e55d00c9d6084443886fa`

Exact deployed provenance:

- runtime: `a2e821afbbc88371b033af311cc6882d46aa6916`;
- prior R0d delivery: `7da9ddd4ad37221f63a3cd418a140824783480ec`;
- human-entry qualification: `3e03e8228f665bef32a4ba97058d69c2e27a9e48`;
- deployed delivery: `6f4abd4dd17c59078ab99530e64ef6cf752ab5ce`;
- sim build: `shared-yard-v0-sim-888e471bc211091e`.

The repair does **not** change `src/`, `public/world-v0/app.js`, `public/world-v0/build-contract.js`, `public/world-v0/state-guard.js` or `package-lock.json` relative to `7da9ddd...`.

---

## What the human-entry repair proved

The first attempted Owner retest was blocked before network play because the UI hid a strict callsign wire regex. That invalidated the prior UX-readiness claim, not the multiplayer reliability evidence.

The repaired human boundary now:

- explains/adapts ordinary names instead of bouncing them after Enter;
- handles spaces and Polish diacritics (`Józz :D -> Jozz-D`, `Ktoś testowy -> Ktos-testowy`);
- blocks unusable names before any network touch;
- supports Enter-key submission;
- uses neutral deep-link copy because the first entrant may open a fresh externally generated run;
- is covered by standard checks plus a dedicated two-browser cold `?run=` first-entrant gate.

Public gate result:

`WORLD_V0_HUMAN_ENTRY_PASS`

with same `WorldId`/`WorldEpoch`, exact guard matches `12 / 12`, mismatches `0`.

Public I1 control:

`WORLD_V0_INTEGRATION_I1_SERVER_SESSION_PASS`

with healthy-peer survival and preserved WorldEpoch across one actor transport drop.

An initial repair workflow failure caused by the historical pre-I1 `world-v0-session-friction-smoke.mjs` was classified as an obsolete test-contract failure; the product was not regressed to satisfy it.

---

## Current human gate

Do **not** reuse any old human run ID or old test link.

At actual test time:

1. generate a fresh high-entropy run ID matching `^[A-Za-z0-9_-]{1,20}$`;
2. do not pre-touch that exact run;
3. Owner opens the isolated Worker direct link first;
4. type an ordinary name and Enter;
5. wait for `Waiting for friend`;
6. only then send the exact same URL to the second real person/device;
7. wait until both are live.

### Phase A — primary old-failure falsifier

Both devices remain foreground and play naturally for several minutes. Primary question: does ordinary visible play still produce the old global `live -> blank/recovery/waiting -> live` collapse, or does the healthy peer/shared WorldEpoch remain alive?

### Phase B — secondary mobile lifecycle falsifier

Only after stable Phase A, one second device performs a normal background -> foreground cycle while Owner remains foreground. Do not deliberately kill/reload the tab.

A stable Phase A closes the old global-coupling question even if Phase B later exposes a smaller returning-actor/mobile lifecycle gap.

Human reliability remains **unproven** until this real session is observed.

---

## Scope freeze

Do not add I5, persistence, broader reconciliation, 3-player expansion, lobby redesign or generic reliability matrices before the Owner verdict merely for reassurance.

The correct next frontier is the fresh real-human R0d retest.