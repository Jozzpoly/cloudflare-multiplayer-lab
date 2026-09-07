# World V0 — R0d Pre-Owner Falsification Audit

Status: **AUDIT COMPLETE / QUALIFIED SPECIMEN PRESERVED / OWNER TEST STILL NEXT**  
Date: **2026-09-07**  
Scope: work performed after the first R0d Owner continuity FAIL and before the next Owner reliability re-test

This document is a deliberate red-team pass over the Multiplayer Reliability Foundation I1–I4 campaign, its evidence apparatus, isolated delivery, and the planned human gate.

It was created because the reliability campaign accumulated a long sequence of implementation and machine-validation work without a new Owner test. The purpose is not to create another open-ended synthetic campaign. The purpose is to try to falsify the candidate before asking the Owner to spend attention on it, identify overclaims or procedural errors, and preserve the exact evidence boundary.

The audit found important corrections to the **human-test procedure and claim boundary**, but did **not** find evidence that justifies mutating the frozen qualified runtime before the Owner test.

---

## 1. Frozen anchors reverified

Qualified product + reliability source remains:

`world-v0-multiplayer-foundation-integration@a2e821afbbc88371b033af311cc6882d46aa6916`

Isolated delivery specimen remains:

`world-v0-r0d-reliability-retest@7da9ddd4ad37221f63a3cd418a140824783480ec`

Final isolated workflow remains:

`34060903778` — **completed / success**

Isolated Worker remains:

`cloudflare-multiplayer-lab-reliability-play`

The delivery branch remains a descendant of the qualified source and changes only:

- `.github/workflows/world-v0-r0d-reliability-retest.yml`;
- `wrangler.jsonc` with the isolated `reliability_play` target.

No `public/world-v0`, World V0 simulation/runtime, protocol, server or package bytes differ from `a2e821...`.

The documentation branch is not a runtime candidate.

---

## 2. Why the audit was justified

The first R0d Owner test failed on a real product lifecycle problem: ordinary two-person/mobile-facing use repeatedly collapsed through `live -> blank/recovery/waiting -> live` because one actor's local starvation or transport loss could end the global WorldEpoch.

The subsequent reliability response was not a trivial constant tweak. Between the closed pre-reliability product lineage and `a2e821...`, the project accumulated a large implementation sequence touching:

- server ActorSession / transport lifetime;
- scheduled-input semantics;
- browser canonical-input authorship;
- browser recovery and exact rebase;
- Box3D recording/state remapping;
- state guards;
- integration and remote evidence apparatus.

A final green workflow is therefore necessary but not sufficient evidence that every important assumption remained aligned. The audit intentionally re-read implementation paths and falsifiers rather than trusting the final labels.

---

## 3. Strong positive finding — the original causal bug was removed at its source

The old model coupled one actor/transport failure to global world death.

The qualified server no longer does that after canonical play starts.

Active-run behavior now has these properties:

- an ActorSession is independent of its current WebSocket;
- `webSocketClose` / `webSocketError` detach that transport from the ActorSession;
- one missing actor continues through `held` input and then actor-local `lease_expired` neutral input;
- the shared WorldEpoch is **not** ended because one actor crosses the input lease;
- the world is cleaned up for abandonment only when **no transports are connected** and **every ActorSession** has crossed the bounded missing-input lease;
- a private resume token can rebind a newer socket to the same ActorSession;
- a resumed active actor receives an exact authoritative full-state seed rather than reconstructing from an insufficient local history window.

The input lease is still `36` ticks at `60 Hz`; the campaign did not hide the failure by merely making the timeout longer.

This is the strongest causal reason to expect the old global continuity failure to be materially changed in the Owner re-test.

---

## 4. I2 red-team result — future supersession remains bounded correctly

The I2 probe was re-audited against the protocol implementation.

It verifies more than an acknowledgement label. It exercises:

- initial future intent acceptance;
- later authority superseding still-unconsumed future ticks;
- peer relay of the revised future intent;
- idempotent identical future data;
- stale-batch rejection without a second peer relay;
- actual authority consumption of the revised value;
- preservation of one-shot jump semantics;
- rejection of mutation after the tick has already been consumed.

Implementation ordering matches the intended invariant: consumed history becomes `late` before a pending future value can be superseded.

No pre-Owner blocker was found here.

---

## 5. I4b carry-forward red-team result — current runtime is still actually tested

The I4b workflow has a carry-forward path: historical source appliers are skipped when the exact-rebase runtime is already present.

That skip does **not** skip qualification.

On a carried-forward candidate the workflow still runs:

- the focused I4b seam falsifier;
- full repository validation;
- authority wire-seed / exact-state probe;
- real-Chromium targeted outage/rebase audit;
- I3 clean rAF regression;
- I2 regression;
- I1 active-run regression;
- I1 pre-start regression.

The carry-forward workflow therefore recognizes already-integrated source without treating marker presence as evidence by itself.

No pre-Owner blocker was found here.

---

## 6. Old authority smoke — stale verdict, still useful evidence

The historical `world-v0-authority-runtime-smoke.mjs` mixed two concerns:

1. valuable two-client authority/physics evidence;
2. a now-rejected lifecycle success condition requiring lease expiry to end the WorldEpoch and close both sockets.

After I1, item 2 became logically stale.

The first isolated delivery workflow run `34060727507` therefore ended red when that old final condition did not occur. Before timeout, however, the same deployed runtime had already produced useful evidence including:

- clean accepted/relayed/consumed scheduled traffic for both peers;
- finite authority snapshots;
- shared exact state guards;
- meaningful shared-prop physical displacement;
- repeated lease-expired consumption while the epoch and healthy connections remained alive.

The final delivery commit changed only the workflow file relative to that first isolated specimen; it did not change product/runtime bytes.

Therefore the correct classification is:

- **old smoke final verdict:** stale apparatus contract;
- **its earlier physical observations:** still useful supporting evidence on the same runtime;
- **final green R0d workflow:** correctly uses I1–I4 as the acceptance contract.

Do not resurrect global epoch death merely to make the historical smoke green.

---

## 7. Procedure defect found — human run IDs are limited to 20 characters

This audit caught a real handoff/procedure defect before the Owner used it.

The actual browser/server room-key contract is:

`^[A-Za-z0-9_-]{1,20}$`

A previously generated conversation-only candidate run ID exceeded 20 characters. It must **not** be used.

In normal browser entry, an invalid deep-link run is classified as an invalid invite / invalid Run key and Enter is unavailable or rejected by the UI. At the lower Worker/server routing layer, an invalid direct run parameter normalizes to the fallback `manual` instance.

The corrected human procedure must therefore generate a fresh high-entropy ID that is **20 characters or shorter**.

A preferred shape is the existing Friend-Ready generator contract: `yard-` plus a base64url encoding of 10 cryptographically random bytes, producing a valid high-entropy key within the limit.

The fresh human run ID must be generated at actual test time and must not be used by CI or remotely pre-opened before the Owner enters.

---

## 8. Procedure/claim defect found — "leave/rejoin" was too broad

The current ActorSession resume contract is **same-page / same-browser-runtime transport resume**, not general identity persistence across page destruction.

The browser stores the private `resumeToken` only in live JavaScript memory. It does not persist it to `localStorage`, `sessionStorage`, IndexedDB or another durable client store.

Consequences:

- a live page can recover from authority silence / transport loss and rebind the same ActorSession;
- a full page reload, tab destruction, browser process loss or reopening the link loses the private resume token;
- after canonical play has started, the server rejects a fresh actor without the matching resume token as `world_v0_run_already_active`;
- therefore deliberate full close/reload/reopen must **not** be described as equivalent to the currently qualified same-actor resume test.

The old handoff wording that listed generic `leave/rejoin` beside background/foreground was too broad and is superseded by this audit.

This is not evidence that I1/I4 failed. It is an explicit boundary of what they currently solve.

---

## 9. Mobile evidence boundary — I3b/I4b are not a substitute for real backgrounding

The machine campaign proves important browser mechanics but does not directly prove the complete mobile lifecycle.

I3b proves canonical input is not owned solely by `requestAnimationFrame()` while the JavaScript event loop remains runnable.

I4b proves exact ActorSession recovery through a controlled browser network outage beyond both local history retention and the input lease.

The real-Chromium I4b harness deliberately disables several background-throttling behaviors so its network/rebase falsifier is not contaminated by scheduler suspension. Its claim is therefore **not** "real phone backgrounding is solved".

Modern browser lifecycle behavior can include:

- hidden state;
- frozen state, where JavaScript timers and other freezable tasks stop;
- discarded/terminated state, where the page/runtime is destroyed and may later reload.

The current client handles hidden/blur by neutralizing transient controls and has same-page transport recovery, but it does not persist ActorSession authority across page discard/reload.

Therefore the next Owner test is genuinely necessary.

If natural phone backgrounding merely freezes/stalls the live page and it resumes through the same runtime, I1/I3/I4 are designed to cover that class.

If the mobile OS/browser naturally discards or destroys the page and the returning user cannot rejoin the same active ActorSession because the token was lost, that is **meaningful new product evidence**, not an apparatus-invalid result. It should be classified as a client-session persistence/lifecycle gap outside the current I1–I4 proof boundary.

---

## 10. Explicit-close edge found — browser auto-resume is narrower than server resume authority

The server can resume an ActorSession when presented with the valid private token.

The browser's explicit `close` event path automatically enters ActorSession recovery only when the close code is `1006`, unless actor recovery was already pending from the authority-silence guard.

This is intentionally narrower than "resume after every WebSocket close".

Implications:

- half-open authority silence has an independent recovery path and is strongly exercised by I4b;
- abnormal transport loss reported as `1006` has direct auto-resume;
- other close codes can end the local round without automatically attempting ActorSession resume even while the healthy peer/world may remain alive;
- a Durable Object/Worker process restart is a separate case and cannot preserve the in-memory world anyway.

No runtime change is made before the Owner test because there is not yet evidence that broadening close-code recovery improves the qualified candidate rather than mixing distinct lifecycle semantics. The human test should preserve any actual close/recovery sequence if this edge is encountered.

---

## 11. Hidden/background input behavior — bounded but worth observing

On `blur` / hidden transition the browser immediately neutralizes transient local controls.

The canonical-input scheduler normally publishes the revised neutral future intent on its logical clock. If the browser is frozen immediately after the visibility event, however, an already-authored short future tail may remain, and the authority then uses its normal hold-last semantics until the actor-local 36-tick lease neutralizes the actor.

Therefore a temporarily backgrounded actor may plausibly finish a short already-authored movement / continue briefly before stopping.

This is not the old global continuity failure. It is a bounded absent-actor presentation/authority behavior worth observing during the Owner test.

Do not require an instantly frozen avatar as the R0d lifecycle PASS criterion.

---

## 12. Pre-start is intentionally different from active-run continuity

I1's same-epoch continuity contract is earned only after canonical play starts.

Before start:

- there is no ticking active-run input lease;
- if a waiting peer disappears, the waiting epoch fails closed;
- occupied ActorSession slots are cleared;
- a later pair creates a fresh waiting epoch.

This behavior is explicitly tested by `world-v0-integration-i1-prestart-probe.mjs`.

Therefore the corrected Owner ordering is:

1. Owner opens the fresh valid deep link from Poland;
2. Owner **clicks Enter and reaches the waiting-for-peer state**;
3. Owner keeps that page active while the exact same link is shared to the second person/device;
4. second actor joins and canonical play begins;
5. only after the run is visibly live should continuity disturbances be attempted.

Simply loading the static deep-link page is not sufficient to establish the fresh Durable Object. The World V0 Durable Object is touched when the WebSocket route invokes the run-specific stub.

---

## 13. Locality hypothesis remains correctly bounded

The old public R0d test saw stable Poland RTT around 173 ms.

The fixed public room directory can touch `yard-1/2/3` Durable Objects before a human does. Cloudflare's current Durable Object placement model normally places an object near its first `get()` access and does not currently relocate it automatically.

The isolated human gate avoids this contamination by using a fresh unique deep-link run. Valid deep-link mode does not poll `/api/world-v0/rooms`; that directory polling occurs only in ordinary host/directory mode.

Owner-first remains the correct locality experiment:

- if the fresh human run has materially lower RTT than the old fixed Yard, that supports the placement-contamination hypothesis;
- if it remains around the old high latency, the hypothesis is weakened and locality/route deserves a new causal investigation.

RTT is secondary evidence. It must not replace the continuity verdict.

---

## 14. Durable Object process-loss boundary — world continuity is not persistence

The current SharedYardV0 world is an in-memory Box3D epoch.

The server intentionally prevents normal live-epoch hibernation using active timers because there is no world reconstruction contract. It also explicitly closes any Hibernation-API sockets found by a newly constructed object with `1012 world_epoch_lost_restart_required` rather than pretending that a lost in-memory Box3D world survived.

Cloudflare's current Durable Object lifecycle documentation states that Durable Objects can still shut down/restart for reasons including deployments, runtime updates and host/runtime decisions; WebSocket requests are terminated during shutdown. Cloudflare also states that important state that must survive eviction/restart must be persisted.

Therefore I1–I4 prove **transport/client-starvation continuity within a surviving WorldEpoch**, not durable world persistence across Worker/DO process loss.

This boundary was deliberately deferred and remains valid.

A human R0d PASS must not be upgraded into the claim "world continuity is solved in all failure modes".

If process loss actually occurs during the human gate, preserve it separately. It would be meaningful reliability evidence, but not proof that the I1 actor-local lifecycle model itself regressed.

---

## 15. Corrected Owner human gate

The next test should stay small and natural.

### Freshness

Generate a new valid human-only run ID at test time:

- 1–20 characters;
- only `A-Z`, `a-z`, `0-9`, `_`, `-`;
- high entropy;
- never used by CI or an older human run;
- do not remotely pre-touch the exact run before the Owner enters.

### Entry

- Owner in Poland opens the deep link and **enters first**;
- wait until the Owner sees the waiting-for-peer state;
- only then share the exact same URL with the second real person/device;
- wait for visibly live two-person play.

### Natural baseline

Play normally for a few minutes:

- move;
- look around;
- observe each other;
- interact with shared props;
- notice whether exact shared world behavior remains stable.

### Primary disturbance

Prefer one real mobile **background -> foreground** event on the second actor while the Owner remains foreground and keeps observing the world.

Do not deliberately kill/reload the page as the first R0d disturbance because cross-page ActorSession persistence is not the current qualified contract.

A second brief transport disturbance is optional only if the first event leaves the key question unresolved. Do not stack multiple faults into one ambiguous sequence.

---

## 16. Corrected human result classification

### Strong R0d PASS

The old global lifecycle failure is absent:

- healthy peer/world remain continuously alive;
- no global `live -> blank/recovery/waiting -> live` cycle dominates the run;
- the interrupted same-page actor returns/resumes into the same living world;
- no new failure is equally product-blocking.

Minor returning-actor discontinuity or a short actor-local neutralization period does not by itself negate the global lifecycle fix.

### Partial PASS / new bounded gap

The healthy peer/world remain alive, so the old global epoch-death model is fixed, but the returning actor has a distinct recovery defect, for example:

- a specific close code does not trigger resume;
- natural mobile discard reloads the page and loses the ActorSession token;
- returning actor resume is visibly too disruptive even without global world death.

This should close the old causal question while opening the smallest new client/session lifecycle contract justified by evidence.

### FAIL — old class persists

Ordinary use or one bounded disturbance still causes both players/world to collapse into the old global recovery/new-epoch behavior.

Preserve the exact sequence and isolate the smallest remaining lifecycle cause.

### INVALID / apparatus

Use only for a real specimen/test failure such as wrong deployment, different run IDs, stale/unreachable assets or provenance mismatch.

Do not classify real mobile lifecycle roughness as apparatus-invalid merely because the machine harness did not cover it.

---

## 17. Readiness verdict

**READY FOR OWNER R0d HUMAN RELIABILITY RE-TEST — WITH CORRECTED PROCEDURE AND CLAIM BOUNDARY.**

The audit found no evidence that warrants mutating or requalifying the frozen runtime before the human gate.

It did find meaningful procedural and epistemic corrections:

- the prior conversation-generated run ID was invalid because it exceeded 20 characters;
- general `leave/rejoin` is not currently equivalent to same-page ActorSession resume;
- mobile freeze/discard is intentionally not fully proven by I3b/I4b;
- explicit-close recovery is narrower than server resume authority;
- DO/process-loss continuity remains deliberately unimplemented;
- waiting-room/pre-start continuity is intentionally fail-closed;
- old authority smoke physical observations remain useful even though its epoch-death verdict is stale.

These corrections reduce the risk of a false PASS, false FAIL or invalid locality test.

Do **not** start I5, persistence, generic reconciliation, content/jump work, 3-player expansion, lobby redesign or broad refactoring before the Owner evidence merely because this audit found future concerns.

The highest-information next action remains the corrected real Owner test.