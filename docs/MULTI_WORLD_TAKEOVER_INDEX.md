# Multi_World — Takeover package index

Status: **HANDOFF READY / R0d OWNER HUMAN RELIABILITY GATE NEXT**  
Updated: **2026-09-07**  
Handoff branch: `multi-world-r0d-reliability-handoff`

This index supersedes the old A2R-era takeover reading order for the next conversation. Older takeover/grounding documents remain preserved as provenance.

The handoff branch is documentation/reference only. Runtime authority remains the frozen integration and delivery specimens listed below.

---

## Canonical reading order now

1. **`MULTI_WORLD_CURRENT_STATE.md`**  
   Short current-state authority: exact branches/SHAs, evidence classification, closed machine work, pending human gate and scope freeze.

2. **`WORLD_V0_R0D_RELIABILITY_RETEST_HANDOFF.md`**  
   Detailed execution/evidence handoff for the exact next R0d human reliability re-test.

3. **`WORLD_V0_R0D_RELIABILITY_EVIDENCE_MANIFEST.md`**  
   Long-lived digest of the final remote workflow artifact: ZIP/file SHA-256 hashes and exact compact I1/I2/I3/I4b outputs. Read when validating provenance or after the temporary GitHub artifact expires.

4. **GitHub issue #8, comment `5558411044`**  
   Original R0d human continuity FAIL that falsified the old lifecycle model.

5. **GitHub issue #8, comment `5562283164`**  
   Final isolated remote machine gate GREEN after I1–I4.

6. **`MULTI_WORLD_FRESH_TAKEOVER_V2.md`**  
   Startup mandate for the next Browser ChatGPT conversation.

7. **`MULTI_WORLD_PROJECT_SOUL.md`**  
   Stable broader project intent when the new conversation needs to recover why the technical work matters.

This is enough to begin the next conversation if live heads match.

---

## Exact current runtime/delivery anchors

### Qualified product + reliability source

`world-v0-multiplayer-foundation-integration@a2e821afbbc88371b033af311cc6882d46aa6916`

Role: frozen R0c-product + Multiplayer Reliability Foundation I1–I4 runtime control.

### Isolated R0d delivery specimen

`world-v0-r0d-reliability-retest@7da9ddd4ad37221f63a3cd418a140824783480ec`

Role: delivery-only descendant of `a2e821...`.

Expected isolated Worker:

`cloudflare-multiplayer-lab-reliability-play`

Final remote workflow:

`34060903778` — **PASS**

Delivery diff from `a2e821...` is limited to:

- `.github/workflows/world-v0-r0d-reliability-retest.yml`;
- `wrangler.jsonc` isolated `reliability_play` environment.

No qualified World V0 product/runtime bytes differ.

### Handoff/documentation branch

`multi-world-r0d-reliability-handoff`

Its head is allowed to move only while documentation is finalized. It is not a runtime candidate.

---

## Current evidence boundary

The first real R0d two-person/mobile-facing test failed because one actor input starvation / socket loss could kill the whole WorldEpoch and force both clients through recovery/new-epoch cycles.

I1–I4 then addressed that lifecycle model and passed local/integration qualification plus isolated remote Cloudflare qualification.

Remote final machine evidence includes:

- I1 ActorSession continuity / same-actor resume — PASS;
- I2 future-intent supersession — PASS;
- I3b clean real-Chromium 1200 ms rAF freeze — PASS;
- I4b exact full-state rebase after a 1500 ms outage / 170-tick gap with healthy peer continuity and `guardMismatches=0` — PASS.

**Machine-addressable work is closed at this boundary.**

The Owner deliberately postponed the real human reliability re-test to the next conversation.

---

## Preserved artifact identity

Final GitHub Actions artifact:

- workflow run: `34060903778`;
- artifact ID: `9997448698`;
- artifact name: `world-v0-r0d-reliability-retest-1`;
- ZIP size: `54,384 bytes`;
- ZIP SHA-256: `2a2a740d9fe3e9f87602a1704814ef824f0fb716ec8e8c79d1194e441d3942b4`.

The original artifact had 14-day retention. `WORLD_V0_R0D_RELIABILITY_EVIDENCE_MANIFEST.md` preserves each contained file's size/hash and the compact exact verdict payloads so the handoff does not depend on that temporary retention window.

---

## Exact next action

The new conversation should:

1. compactly verify the frozen heads, delivery diff, final workflow and newest issue #8 checkpoint;
2. generate a brand-new human-only run ID that has never appeared in CI or an older test;
3. build a deep link on `cloudflare-multiplayer-lab-reliability-play`;
4. have the Owner enter that run first from Poland;
5. only then share the same URL with the second real device/person;
6. perform a small natural R0d reliability re-test.

Primary human question:

> Is the previous `live -> blank/recovery/waiting -> live` global continuity failure gone, with the healthy peer/world remaining continuous while the interrupted actor resumes?

Do not add I5, persistence, jump/content work, 3-player expansion or another generic synthetic campaign before that verdict unless live verification invalidates the specimen.

---

## Historical takeover material

The following remain useful for project archaeology but are no longer startup authorities:

- `MULTI_WORLD_GROUNDING_V1.md`;
- `MULTI_WORLD_HUMAN_TEST_CONTEXT.md`;
- `MULTI_WORLD_FRESH_TAKEOVER_V1.md`;
- `MULTI_WORLD_GROUNDING_LEDGER.md`;
- `MULTI_WORLD_GROUNDING_REDTEAM.md`;
- `MULTI_WORLD_FRESH_TAKEOVER.md`.

They mainly describe the A2/A2R-era frontier and earlier remote-causality questions. Do not let them overwrite the newer World V0 / Public Room R0 / reliability evidence.

---

## Non-frontier branch warning

`world-v0-friend-ready-foundation-integration@5dd28a899c4f60c9227f1eb93026f571ced733e3`

was accidentally created while checking an ancestry hypothesis. No new commit was made. The hypothesis was rejected after live verification showed the real integration already descends from the later R0c public-room lineage.

Treat it as inert historical noise, not an active candidate.
