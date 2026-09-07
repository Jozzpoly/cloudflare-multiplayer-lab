# Multi_World — Current State

Status: **CANONICAL CURRENT STATE / OWNER HUMAN GATE PENDING**  
Grounded: **2026-09-07**  
Handoff branch: `multi-world-r0d-reliability-handoff`

This document is the shortest current-state authority for continuing Multi_World after the Multiplayer Reliability Foundation I1–I4 integration and isolated remote requalification.

It does not replace the project soul or GitHub issue #8. It exists so a fresh conversation does not have to reconstruct the last several days from older A2R-era takeover material before it can understand the present frontier.

---

## 1. Executive state

Multi_World currently has a small, playable World V0 product lineage with public-room UX and a server-authoritative shared Box3D world.

The first real R0d human two-person / phone-facing test on 2026-09-06 **failed** because short client-local input starvation or a peer socket loss could kill the entire WorldEpoch. The visible product repeatedly cycled through `live -> blank/recovery/waiting -> live` during ordinary use.

That human failure caused a deliberate freeze on new content/features and a bounded Multiplayer Reliability Foundation campaign.

The reliability campaign produced and machine-qualified four integrated changes:

- **I1** — ActorSession lifetime separated from transport lifetime; peer loss / one actor input starvation no longer kills the shared world; same-actor resume exists.
- **I2** — future unconsumed intent can be superseded by newer authority without mutating consumed history.
- **I3/I3b** — canonical input transport is no longer dependent on `requestAnimationFrame()` continuity; a real-Chromium rAF freeze has a clean qualified path.
- **I4/I4b** — exact authoritative full-state seed/rebase can recover a resumed actor after a gap beyond both local history retention and the input lease while a healthy peer continues.

The exact integrated product + reliability source is frozen at:

`world-v0-multiplayer-foundation-integration@a2e821afbbc88371b033af311cc6882d46aa6916`

It was then deployed without changing product/runtime bytes to an isolated Worker through:

`world-v0-r0d-reliability-retest@7da9ddd4ad37221f63a3cd418a140824783480ec`

Worker:

`https://cloudflare-multiplayer-lab-reliability-play.jozzpoly.workers.dev`

Final isolated remote workflow:

`34060903778` — **PASS**

Remote I1, I2, I3b and I4b all passed on the real Cloudflare Worker/DO/WebSocket/browser path.

**The machine-addressable reliability re-test is therefore GREEN. The remaining frontier is intentionally human evidence.**

The Owner has explicitly deferred that real test to the next conversation.

---

## 2. Truth hierarchy for the next conversation

For this stage use:

1. live GitHub branch heads + current deployed Worker provenance;
2. latest GitHub issue #8 checkpoints, especially the original R0d human FAIL and the final reliability re-test checkpoint;
3. this document and `WORLD_V0_R0D_RELIABILITY_RETEST_HANDOFF.md`;
4. stable project intent in `MULTI_WORLD_PROJECT_SOUL.md`;
5. older grounding/takeover material only for history.

Older `MULTI_WORLD_FRESH_TAKEOVER*`, Grounding v1 and Human Test Context documents remain useful provenance, but their claimed frontier is mostly A2R / remote-causality-era history and must not override this state.

---

## 3. Exact branch roles

### Qualified product + reliability source — FROZEN CONTROL

Branch:

`world-v0-multiplayer-foundation-integration`

Head:

`a2e821afbbc88371b033af311cc6882d46aa6916`

Role:

- current integrated runtime truth for the R0d reliability candidate;
- includes the R0c product lineage plus I1–I4 reliability work;
- standard repo CI and integrated regression gates passed;
- do not add handoff documentation or convenience changes to this branch before the human gate.

### R0d isolated delivery — FROZEN DELIVERY SPECIMEN

Branch:

`world-v0-r0d-reliability-retest`

Head:

`7da9ddd4ad37221f63a3cd418a140824783480ec`

Role:

- deployment-only descendant of `a2e821...`;
- adds only `.github/workflows/world-v0-r0d-reliability-retest.yml` and an isolated `reliability_play` environment in `wrangler.jsonc`;
- no `public/world-v0`, simulation, protocol, server or package bytes differ from `a2e821...`;
- workflow `34060903778` deployed and remotely qualified this exact specimen;
- keep frozen until the human test is classified.

### Handoff/documentation branch — ACTIVE ONLY FOR HANDOFF

Branch:

`multi-world-r0d-reliability-handoff`

Base:

`7da9ddd4ad37221f63a3cd418a140824783480ec`

Role:

- documentation / takeover preparation only;
- must not become a new runtime candidate;
- its head may move while handoff docs are finalized, but runtime authority remains `a2e821...` and delivery authority remains `7da9ddd...`.

### Public Room R0 historical product control

Branch:

`world-v0-public-room-r0`

Head:

`0f2a6060c629996889fb2809c6ef148f3d4fa43b`

Role:

- closed R0a/R0b/R0c product evidence before reliability integration;
- useful for provenance, not the next test specimen.

### Accidental/inert branch created during grounding

Branch:

`world-v0-friend-ready-foundation-integration`

Head:

`5dd28a899c4f60c9227f1eb93026f571ced733e3`

This branch was created while checking whether reliability work needed to be re-ported onto Friend-Ready. The live ancestry audit then showed that `a2e821...` already descends from the later R0c public-room product lineage, so that direction was abandoned before any commit was made.

Treat this branch as **inert / non-frontier**. It contains no work beyond its existing Friend-Ready base and must not be mistaken for the integration candidate.

---

## 4. Evidence classification

### PROVEN — bounded machine evidence

- R0a/R0b/R0c machine-addressable public-room product work was closed before the first human R0d test.
- The first human R0d run exposed a real product-blocking lifecycle failure; this is preserved evidence, not superseded history.
- `a2e821...` integrates I1–I4 on the R0c product lineage.
- `7da9ddd...` changes only delivery apparatus relative to `a2e821...`.
- Isolated Worker delivery did not overwrite root production or the existing public staging Worker.
- Remote I1 on real Cloudflare passed ActorSession continuity and same-actor resume while a healthy peer survived a peer transport drop.
- Remote I2 passed future-intent supersession semantics.
- Remote I3b obtained a clean real-Chromium run with a `1200 ms` rAF freeze and no recovery contamination.
- Remote I4b passed exact seed/rebase after a controlled outage beyond both history retention and input lease; healthy peer continuity and exact guard agreement remained intact.
- Final isolated workflow `34060903778` is green.

### OWNER-OBSERVED / FAILED BASELINE

The original R0d human continuity gate on 2026-09-06 failed visibly during ordinary two-person/mobile-facing use:

- repeated live -> recovery/waiting -> live cycles;
- retained evidence showed `input_lease_expired` causing a fresh WorldEpoch;
- code audit confirmed the old lifecycle model globally killed the world on one actor lease expiry / peer socket loss.

This baseline is the reason the current re-test exists.

### OWNER-PENDING

Whether the new reliability candidate actually removes the disruptive lifecycle behavior during natural real-device play.

No machine gate may claim this perceptual/product question is already closed.

### STRONGLY SUPPORTED BUT NOT DIRECTLY PROVEN

The prior ~173 ms Poland RTT was likely affected by room placement contamination because CI queried fixed `yard-1/2/3` Durable Objects from a US GitHub runner before the Owner used them. This is a strong causal hypothesis, not direct proof of exact datacenter placement.

The next human test therefore uses a fresh unique deep-link run that CI has never touched, with the Owner entering first from Poland.

### REJECTED

- treating a 600 ms actor input starvation as a reason to destroy the global shared WorldEpoch;
- treating any peer socket loss as global world death;
- using room-recovery UX as a substitute for real continuity;
- extending the old `world-v0-authority-runtime-smoke.mjs` pre-I1 success criterion into the current reliability gate. That historical smoke expected lease expiry -> epoch death -> socket close and therefore became logically stale after I1.

### UNKNOWN / deliberately deferred

- final human verdict on continuity and resume feel;
- actual geographic placement/RTT of a fresh Owner-first run;
- what the next product/research frontier should be after human evidence;
- any need for I5, more reconciliation, persistence, 3-player expansion, new content or jump work.

These are not authorized to expand before the human gate unless new live evidence invalidates the specimen itself.

---

## 5. Final remote reliability evidence

### I1 — ActorSession continuity

Remote verdict:

`WORLD_V0_INTEGRATION_I1_SERVER_SESSION_PASS`

Bounded findings:

- single transport drop did not kill the shared world;
- healthy peer survived;
- `worldEpoch` remained unchanged across the single drop;
- `sessionId` and `netEntityId` remained stable across rebinds;
- same ActorSession resumed canonical input;
- bounded cleanup occurred only after all connections were gone and lease conditions were crossed.

### I2 — future intent supersession

Remote verdict:

`WORLD_V0_INTEGRATION_I2_REAL_DO_WEBSOCKET_PASS`

Bounded findings:

- newest unconsumed future intent won;
- stale batch could not rewind authority;
- consumed history stayed immutable;
- duplicate/stale/late data did not relay as fresh authority.

### I3b — render-frame independence

Remote verdict:

`WORLD_V0_I3B_CLEAN_CAMPAIGN_PASS`

- clean result obtained on first remote attempt;
- `1200 ms` rAF freeze;
- freeze contract proven;
- no recovery contamination or post-freeze drain invalidation.

### I4b — exact full-state rebase

Remote authority probe:

- same ActorSession across rebind;
- drop at `B91`;
- input lease crossed at `B136`;
- exact seed/rebase at `B141` after a `50` tick gap;
- fresh continuation at `B150`.

Remote real-Chromium targeted outage:

- controlled offline interval `1500 ms`;
- ActorSession and net entity preserved;
- source boundary `B219`;
- healthy peer reached `B318` during the gap;
- exact browser rebase at `B389`;
- `170` tick rebase gap versus client history retain `24` and input lease `36`;
- `guardMismatches=0` and `firstStateMismatch=null`;
- healthy peer remained live and exact through `B428`.

Verdict:

`WORLD_V0_INTEGRATION_I4B_REAL_CHROMIUM_EXACT_REBASE_PASS`

---

## 6. Historical stale-apparatus finding

The first isolated delivery workflow run `34060727507` went red at `world-v0-authority-runtime-smoke.mjs`.

That was not a runtime regression.

The smoke still encoded the old lifecycle success condition: after input lease expiry it required `world_v0_epoch_ended` and both sockets to close.

The new runtime correctly refused to do that. Before timeout it had already recorded for both peers:

- `120/120` accepted;
- `0` late;
- `0` rejected;
- `120` relayed;
- `120` fresh-self + `120` fresh-remote consumptions;
- 245 shared exact authority guard samples;
- meaningful physical prop displacement;
- repeated lease-expired consumption while epoch and sockets remained alive.

Classification: **apparatus contract mismatch**.

The final workflow intentionally removed this stale criterion and gated the current lifecycle through I1–I4.

Do not "fix" the new runtime to satisfy the historical smoke.

---

## 7. Exact next human gate

The next conversation should perform one small natural **R0d human reliability re-test**.

### Specimen

Worker base:

`https://cloudflare-multiplayer-lab-reliability-play.jozzpoly.workers.dev`

At test time generate a **new unique run ID** that has never appeared in CI or prior human testing.

Use a direct deep link:

`/world-v0/?run=<fresh-run-id>`

Do **not** use the normal base-page `yard-1/2/3` directory for this reliability/locality test.

### Ordering

1. Owner opens the fresh exact deep link first from Poland and enters the world.
2. Only after the Owner is in the run, share the exact same link with the second real device/person.
3. Play normally for a few minutes before deliberately stressing anything.

This ordering is intended to avoid CI creating/placing the human Durable Object first.

### Human question

Primary question:

> Is the previous product-blocking `live -> blank/recovery/waiting -> live` continuity failure gone during ordinary two-person use, including a normal transport interruption / leave-rejoin / phone background-foreground event, while the other peer and world remain continuous?

Secondary observations:

- responsiveness / visible discontinuity;
- RTT on the fresh Owner-first run;
- whether resumed actor identity and world state appear continuous enough in practice;
- any new friction that is stronger than the original continuity problem.

This is play evidence, not a QA ritual. Do not repeat merely to recover a missing evidence blob.

### Important freshness rule

A run ID previously written in an old conversation should not be treated as canonical. Generate a new one at test time so the handoff cannot accidentally cause an earlier machine or human touch.

---

## 8. What must not happen before that human verdict

Do not start by adding:

- I5;
- new reconciliation machinery;
- jump/content work;
- persistence;
- 3-player expansion;
- matchmaking/lobby redesign;
- another generic synthetic reliability matrix;
- broad cleanup/refactor of the qualified runtime.

Do not merge the handoff docs into the qualified source merely for neatness.

If compact live verification finds no contradiction, the human gate is already the highest-value next evidence.

---

## 9. What happens after the Owner test

The next conversation should first classify the human result.

If the original continuity failure is gone, close the R0d reliability re-test with exact Owner evidence and then deliberately choose the next frontier from the strongest observed friction or emergent demand. Do not automatically resume an old roadmap item.

If continuity still fails, use the exact observed failure sequence to identify the smallest missing reliability contract. Do not broaden directly into a generic networking rewrite.

If the run is invalid because of deployment/specimen mismatch, repair only the specimen/delivery boundary and rerun the smallest necessary gate.

---

## 10. Repo-native checkpoints to read when deeper context is needed

GitHub issue #8 is the detailed research ledger.

Most important current checkpoints:

- original R0d human continuity FAIL: issue comment `5558411044`;
- final R0d isolated remote machine gate GREEN: issue comment `5562283164`.

Earlier R0a/R0b/R0c and Multiplayer Reliability Foundation checkpoints remain in issue #8 and should be read only as needed.

For the fresh conversation the full historical issue does not need to be re-summarized before the Owner test if the exact heads and final checkpoints still match live state.
