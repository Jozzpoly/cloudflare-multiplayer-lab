# Multi_World — Current State

Status: **WORLD V0 ONGOING YARD + V28 HARDENING QUALIFIED / TERMINAL REPOSITORY CLOSEOUT COMPLETE**  
Grounded: **2026-09-18**

This is the compact technical truth for continuation. Verify live GitHub state when exact refs, deployment state or destructive cleanup matter. `MULTI_WORLD_PROJECT_SOUL.md` remains the durable product-intent document; the detailed evidence record for this campaign is `WORLD_V0_POST_OWNER_V28_HARDENING_2026-09-18.md`.

## 1. Current product authority

The current qualified World V0 runtime is:

`2bb295ba583e1852337e88e89f8cb790e104f70d`

Qualification workflow:

`35286869307` — **SUCCESS**

This is no longer the old fixed-two-player waiting-room product. The current product supports an **Ongoing Yard** lifecycle inside the present two-actor envelope:

- the first player can enter alone and immediately inhabit/play in the physical Yard;
- a second player can later join the same ongoing physical world;
- ActorSession lifetime is no longer treated as identical to one browser transport;
- protected and soft reservation states provide bounded reconnect authority while eventually returning capacity;
- room recovery can retire an old epoch and re-enter a fresh one without leaving false recovery state behind.

Server authority, deterministic exact-state guards and the bounded two-actor product envelope remain intact.

## 2. Final isolated staging delivery

The exact qualified runtime above was delivered to the isolated staging Worker without opening any Yard/WebSocket.

Delivery workflow:

`35288291564` — **SUCCESS**

Cloudflare staging Worker:

`cloudflare-multiplayer-lab-staging`

Cloudflare Version:

`3aeb983f-e876-404c-b0bd-245f84c5acfb`

Public asset byte identity was proven for:

- `world-v0/app.js` — SHA-256 `82a748b1444c484f81a8180acb92fec429837589f9a5585707c70640d59d4f55`;
- `world-v0/entry.js` — SHA-256 `6f6018b7eb85d0d67d64c76c8de3e7b19106a390439463f3115632b81ca9de9e`;
- `world-v0/build-contract.js` — SHA-256 `5cb8a5f9439a1fa29fd8dde564f25fb2e6753daaa649fb74b6b5097bb250634c`.

`/api/ping` returned HTTP 200. CI did not pre-touch Owner Yard identities.

## 3. Owner perceptual evidence

The Owner judged current foreground smoothness broadly acceptable: remaining visual impurities were below a level he could objectively identify by eye.

That judgement opened the post-Owner hardening tranche rather than ending work immediately. Two concrete regressions were then reproduced and repaired:

1. private refresh/re-entry could create a new actor while the prior ActorSession remained as an empty shell;
2. pointer focus on Diagnostics could capture Space and toggle the panel instead of jumping.

These were reproduced RED before repair. Ordinary `npm run check` had passed, exposing a validation-routing gap as well as two product defects.

There has **not** been a new two-human perceptual test after the post-Owner hardening repairs. Do not upgrade the Owner judgement into a universal visual-smoothness guarantee.

## 4. Post-Owner hardening now defended

Evidence supports:

- private page refresh preserving the same ActorSession / NetEntity / WorldEpoch when authority still exists;
- private same-profile direct-link rebound through authority-checked resume;
- foreign profiles not acquiring private ActorSession authority;
- pointer-clicked action controls returning keyboard ownership to gameplay while keyboard-origin UI activation remains accessible;
- R0 room-recovery bookkeeping closing correctly after late-join bootstrap;
- public close/reopen Resume;
- direct-link Resume;
- directory uncertainty remaining fail-closed rather than silently converting Resume into fresh admission;
- protected -> soft reservation -> capacity handoff;
- resumed-stayer recovery through epoch replacement;
- actual mobile touch joystick, jump and camera-gimbal control;
- capacity-full errors being distinct from connection/handshake failures.

## 5. V28 causal/exactness evidence after hardening

Exact final-runtime run `35286869307` requalified the causal jump/rebase substrate on the hardening runtime:

- forced-late persistence: **15 qualified / 1 precondition miss / 0 semantic failures / 0 infrastructure or exactness failures**;
- pending jump Resume: sequence 7 / high-water 7;
- peer/rebase parity: sequence 41 / causal watermark 41;
- real Chromium exact rebase: 128-tick gap / guard mismatches 0;
- full repository gate: PASS;
- test apparatus restored and tracked checkout clean.

The runtime-sensitive hardening delta from frozen V28 is exactly six files:

1. `public/world-v0/app.js`
2. `public/world-v0/build-contract.js`
3. `public/world-v0/friend-ready.js`
4. `public/world-v0/keyboard-focus-guard.js`
5. `src/world-slice-entry.ts`
6. `src/world-v0-shared-yard.ts`

Movement physics, scheduled-input protocol, state guard and simulation contract did not drift in that tranche.

## 6. Current remote-presentation evidence

Current-runtime remote-motion characterization run `35286302929` passed 2/2 under mutable-future pressure with exact guard mismatches 0 and authority-silence resumes 0.

Representative displayed remote-position steps were approximately:

- strong-pressure specimen: p95 4.39 cm, p99 6.40 cm, max 8.42 cm;
- lighter specimen: p95 0.55 cm, p99 5.41 cm, max 11.30 cm.

No material remote-motion regression from the Owner-accepted V25 envelope was demonstrated. This is mechanism evidence, not a final perceptual SLO or proof that the temporal/presentation architecture is permanent.

## 7. Repository closeout state

The Ongoing Yard + V28 hardening campaign is now integrated and the experimental branch forest has been retired.

Qualified product runtime remains:

`2bb295ba583e1852337e88e89f8cb790e104f70d`

Product consolidation entered `main` at:

`c4020813a22b4e53121baba25852c5ddf955fd18` — `Integrate qualified World V0 Ongoing Yard and V28 hardening`

A subsequent test-only commit:

`dd688446afd24f57a35c7248a4db4a9e8d308b7c` — `Make mobile movement gate scheduler-independent`

removed a scheduler-dependent sleep from the retained real-mobile audit. Exact `main@dd688...` passed:

- CI `35289345255` — SUCCESS;
- World V0 Current Validation `35289345252` — SUCCESS.

Before destructive ref cleanup, the aggregate recovery branch was extended through both the final V28 closeout and exact integrated `main`:

`archive/multi-world-history-2026-09-18`

pre-prune recovery head:

`144babc38817593ce38f4977f90c9118fbda8605`

Every one of the 16 obsolete live branch tips had `behind_by=0` relative to that aggregate archive. A guarded one-shot runner then required the exact expected 18-branch namespace, the exact archive SHA and an explicit 16-name deletion allowlist before issuing any DELETE.

Terminal prune:

- workflow run `35294379269` — SUCCESS;
- job `105443786784` — SUCCESS;
- final marker `TERMINAL_BRANCH_PRUNE_PASS`.

Independent GitHub API postflight then showed exactly two branch refs:

- `main`;
- `archive/multi-world-history-2026-09-18`.

The one-shot prune workflow was removed from the live tree immediately afterward. Its removal descendant passed:

- Workflow pipeline false-green audit `35294473650` — SUCCESS;
- CI `35294473644` — SUCCESS.

The aggregate archive may advance again after canonical closeout documentation so that the final documentation descendant is also archive-reachable. Fresh continuations should verify its live head rather than treating the pre-prune SHA above as permanently terminal.

The retained live workflow spine is again four workflows:

- `ci.yml`;
- `workflow-pipeline-safety-audit.yml`;
- `world-v0-current-validation.yml`;
- `world-v0-staging-delivery.yml`.

Historical research, delivery, staging and cleanup refs remain recoverable through the aggregate archive DAG rather than through a live branch forest.

## 8. Qualified claims and explicit nonclaims

Qualified within the current two-actor envelope:

- one authoritative shared physical Yard;
- responsive browser-side prediction with exact authoritative correction;
- solo-first Ongoing Yard -> later second actor;
- ActorSession continuity across bounded transport/page disruption;
- causal jump identity across replay/resume/rebase;
- bounded protected/soft reservation lifecycle;
- executable desktop and mobile controls;
- current failure messages distinguishing capacity from transport/handshake failure.

Still **not** claimed:

- durable reconstruction of a lost physical WorldEpoch after process/state loss;
- account/cloud identity or cross-device private-session transfer;
- a persistent continuously-open world;
- arbitrary 3+ actor topology;
- MMO-style roster mutation;
- correctness through permanent network loss;
- that present remote-presentation delay/policy is final forever;
- that current Owner perceptual evidence substitutes for future multi-human play testing.

## 9. Current stage boundary

The repository-closeout campaign is finished. Do not reopen V25/V28 smoothness, lifecycle-independence or multiplayer-foundation research merely because their historical apparatus exists in the archive.

The next substantial step is deliberately product-facing:

> **Choose the next shared-world experience that would teach us the most or make the Yard materially more worth inhabiting, then earn only the architecture that experience actually requires.**

Plausible pressures include a third actor, richer shared physical affordances, stronger continuity of the place beyond short sessions, or another Owner-visible need discovered through play. None is pre-authorized by this document.

Before implementation resumes, re-ground in `MULTI_WORLD_PROJECT_SOUL.md`, inspect the current playable Yard, and formulate the next bounded product question. Machine reliability work should follow concrete product pressure rather than create its own roadmap.
