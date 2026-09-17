# World V0 — Post-Owner V28 hardening closure

Status: **QUALIFIED RUNTIME / CLOSEOUT IN PROGRESS**  
Date: 2026-09-18

## 1. Exact product/evidence anchor

Qualified post-Owner runtime:

`2bb295ba583e1852337e88e89f8cb790e104f70d`

Source branch at qualification:

`world-v0-post-owner-v28-hardening`

Frozen predecessor checkpoints remain untouched:

- V28 Owner candidate: `1e42dfd6bed9ea1df0451ae5e651e63be1615bf5`
- V25 Owner candidate: `704c4bcb4479882caf8c7e8d3f6b4ac9db25d460`

Full pre-closeout campaign history is preserved at:

`archive/world-v0-v28-campaign-2026-09-18`

## 2. Owner evidence that opened this tranche

The Owner judged foreground smoothness broadly acceptable: remaining visual impurities were below a level he could objectively identify by eye.

Two concrete regressions remained:

1. refreshing/re-entering a private Yard created a new player while the old player remained as an empty shell;
2. clicking Diagnostics left keyboard focus on the disclosure control, so Space toggled Diagnostics instead of jumping.

The supplied session evidence was a healthy local/solo specimen, not a complete two-human smoothness proof: exact guards were clean, RTT was low and foreground frame cost was small, but there was no remote peer in that specimen.

## 3. RED-before-GREEN reproduction

Post-Owner regression run `35283967452` reproduced both Owner reports on the frozen V28-derived runtime:

- private refresh: **FAIL** — `refresh created a new ActorSession`;
- Diagnostics: **FAIL** — `Space toggled Diagnostics instead of remaining gameplay-owned`.

Both jobs had already passed ordinary `npm run check`. This proved a validation-routing gap in addition to two product defects.

## 4. Repairs

### Refresh / private ActorSession continuity

The browser already persisted private ActorSession resume authority in local storage, while `enterWorld()` already knew how to consume a one-shot session resume intent. The missing seam was page exit.

The repair arms the existing resume intent during `pagehide` before saving diagnostic evidence. A same-page reload therefore reuses the same WorldEpoch / ActorSession / NetEntity instead of performing a fresh admission.

Private direct-link same-profile rebound was also hardened with a read-only authority preflight:

- POST `/api/world-v0/resume-check`;
- private resume token + player ID + expected WorldEpoch remain the authority;
- a conclusive stale verdict clears stale local authority;
- transport/directory uncertainty does **not** silently downgrade Resume into a fresh join;
- the actual WebSocket resume remains the final authority boundary.

### Gameplay keyboard ownership

The defect was not Space itself but stale pointer focus on action controls.

Keyboard focus guard revision:

`world-v0-keyboard-focus-guard-v3-pointer-focus-release`

Pointer-clicked buttons/links/`summary` controls perform their UI action and then release stale focus back to gameplay. Keyboard-origin activation retains normal native accessibility. This fixes Diagnostics without globally stealing Space from keyboard-focused UI.

Browser UI revision:

`shared-yard-v0-browser-ui-v22-post-owner-hardening`

### R0 room-recovery bookkeeping

A broader falsifier found a separate lifecycle bug: an actor could recover correctly into a new R0 epoch while `roomRecovery.pending` remained true forever.

Recovery completion is now shared by ordinary recovery and R0 late-join bootstrap. The client records `room-recovered`, clears pending recovery state and retains the recovered epoch explicitly.

## 5. Broader falsification

### Post-Owner regressions

Run `35286273960`: **SUCCESS**

- private refresh continuity: PASS;
- private same-profile rebound: PASS;
- Diagnostics / gameplay Space ownership: PASS;
- repository check in each job: PASS.

### Breadth / lifecycle / mobile

Run `35285691778`: **SUCCESS 4/4**

This includes:

- current two-player/Ongoing Yard product path;
- resumed-stayer lifecycle;
- hidden/visible lifecycle and long traffic silence;
- V28 peer/rebase parity and real Chromium exact rebase;
- desktop UI focus behavior;
- real mobile touch input.

Representative mobile touch evidence:

- physical movement: ~1.86 m;
- touch jump causal sequence: 0 -> 1, delivered 1;
- camera yaw change: ~0.398 rad;
- exact guard mismatches: 0.

### Continuity matrix

Run `35286479493`: **SUCCESS 4/4**

- Ongoing public Yard close -> reopen Resume;
- direct-link Resume;
- same-profile live rebound;
- foreign-profile ownership truth;
- directory-outage fail-closed Resume;
- soft-reservation capacity handoff.

Historical R1 tests whose bootstrap still assumed a pre-Ongoing waiting room were migrated to live-solo R0 while preserving their ownership/capacity assertions.

One earlier soft-reservation RED was an apparatus failure: the observer polled all public Durable Objects densely enough to starve the simulation ticks whose 1200-tick grace it was measuring. Poll frequency was reduced; the semantic timeout and product rules were unchanged.

### Join failure clarity

Run `35286614575`: **SUCCESS**

Real Chromium distinguished:

- full room -> `capacity-full` with a capacity-specific notice;
- joinable room with failed WebSocket -> `connection-handshake` with a connection-specific notice.

### Current-runtime remote motion

Run `35286302929`: **SUCCESS 2/2**

The current hardening runtime was measured directly with test-only presentation hooks, then restored to a clean checkout.

Representative displayed remote-position steps:

- strong-pressure specimen: p95 ~4.39 cm, p99 ~6.40 cm, max ~8.42 cm;
- lighter specimen: p95 ~0.55 cm, p99 ~5.41 cm, max ~11.30 cm;
- exact guard mismatches: 0;
- authority-silence resumes: 0.

Historical V25 reference was roughly p95 ~4.26 cm, p99 ~7.7 cm, max ~12.2 cm. No material remote-motion regression was demonstrated by the hardening runtime. This is mechanism evidence, not a replacement for two-human perceptual judgement.

## 6. Exact final-runtime qualification

Workflow run:

`35286869307` — **SUCCESS**

Exact head:

`2bb295ba583e1852337e88e89f8cb790e104f70d`

Artifact:

`world-v0-post-owner-v28-final-runtime-35286869307`
artifact ID `10524498155`

The gate proved that the runtime-sensitive delta from frozen V28 is exactly six files:

1. `public/world-v0/app.js`
2. `public/world-v0/build-contract.js`
3. `public/world-v0/friend-ready.js`
4. `public/world-v0/keyboard-focus-guard.js`
5. `src/world-slice-entry.ts`
6. `src/world-v0-shared-yard.ts`

`package.json` and `package-lock.json` are unchanged. Movement physics, scheduled-input protocol, state guard and simulation contract did not drift.

Final qualification evidence:

- full repository gate: PASS;
- forced-late persistence: **15 qualified / 1 precondition miss / 0 semantic failures / 0 infrastructure or exactness failures**;
- pending jump Resume: canonical sequence 7 / resume high-water 7;
- peer/rebase parity: causal sequence 41 / rebase causal watermark 41;
- real Chromium exact rebase: gap 128 ticks, retained history 24 ticks, input lease 36 ticks, guard mismatches 0;
- test-only apparatus restored; final tracked checkout clean.

## 7. Placement boundary

All post-Owner hardening, breadth, continuity and characterization gates used local `wrangler dev`. They did not pre-touch the staging Owner Durable Object identities.

First-touch Durable Object placement therefore remains an explicit human-test concern rather than hidden CI contamination.

## 8. Qualified claims and nonclaims

Defended:

- Ongoing public Yard solo -> later peer lifecycle remains exact;
- V28 jump causal identity, persistence and rebase semantics survive post-Owner hardening;
- same-profile private refresh/rebound preserves the actor instead of creating a shell;
- foreign profiles cannot claim private ActorSession authority;
- soft reservations eventually release capacity under the current bounded policy;
- desktop and actual mobile-touch controls are executable;
- join failures distinguish room capacity from transport/handshake failure;
- current displayed remote motion shows no demonstrated material regression from the Owner-accepted V25 envelope.

Still not claimed:

- no reconstruction of a lost physical WorldEpoch after Durable Object process loss;
- no account/cloud identity or cross-device private-session transfer;
- no 3+ product topology;
- no arbitrary MMO-style roster mutation;
- no guarantee through permanent network loss;
- no new two-human Owner perceptual test after the post-Owner hardening repairs;
- no claim that remote presentation delay or the broader temporal architecture is final forever.

## 9. Closeout policy

The qualified runtime above is frozen before repository cleanup.

Closeout must:

1. preserve the full campaign history in the archive lineage;
2. consolidate the current executable validation spine around the actual Ongoing Yard + V28 product;
3. retire consumed one-shot smoothness/jump experiment workflows and installers;
4. keep a small set of current causal and presentation falsifiers;
5. integrate to `main` as a clean squash-style product consolidation rather than replaying hundreds of experimental commits;
6. remove obsolete branch refs only after archive/provenance and post-integration validation are independently proven.

The purpose of cleanup is to make the next frontier easier to reason about, not to erase the evidence that produced the current runtime.
