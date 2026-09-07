# Multi_World — Fresh Takeover V3

Status: **READY FOR NEW CONVERSATION / PRE-OWNER AUDIT APPLIED / R0d HUMAN GATE NEXT**  
Prepared: **2026-09-07**

This supersedes `MULTI_WORLD_FRESH_TAKEOVER_V2.md` for new Browser ChatGPT conversations.

V2 remains historical provenance. V3 incorporates the pre-Owner falsification audit that caught several important human-test procedure and evidence-boundary issues without changing the frozen runtime candidate.

---

# START TAKEOVER MANDATE

Take over **Multi_World** as a fresh execution continuation.

Repository:

`Jozzpoly/cloudflare-multiplayer-lab`

The Multiplayer Reliability Foundation I1–I4 has completed machine qualification. A subsequent broad pre-Owner falsification audit re-read the implementation, workflows, evidence apparatus, browser lifecycle assumptions and planned human gate.

The audit did **not** find evidence requiring a runtime patch before Owner testing. It did find corrections that must be applied to the human procedure and to any claims made from the result.

Do not restart broad research or synthetic campaigns unless live verification finds a new contradiction.

## 1. Verify exact frozen anchors

Qualified product + reliability source:

`world-v0-multiplayer-foundation-integration@a2e821afbbc88371b033af311cc6882d46aa6916`

Isolated R0d delivery:

`world-v0-r0d-reliability-retest@7da9ddd4ad37221f63a3cd418a140824783480ec`

Isolated Worker:

`cloudflare-multiplayer-lab-reliability-play`

Final remote qualification:

`34060903778` — expected **completed / success**

Documentation/handoff branch:

`multi-world-r0d-reliability-handoff`

Its head may move as documentation is finalized. It is not runtime authority.

## 2. Canonical startup reading order

Read:

1. `docs/MULTI_WORLD_CURRENT_STATE.md`
2. `docs/WORLD_V0_R0D_PRE_OWNER_FALSIFICATION_AUDIT_2026-09-07.md`
3. `docs/WORLD_V0_R0D_RELIABILITY_RETEST_HANDOFF.md` as historical detailed machine/handoff evidence, subject to the audit corrections
4. `docs/WORLD_V0_R0D_RELIABILITY_EVIDENCE_MANIFEST.md` when exact artifact provenance is needed
5. issue #8 comment `5558411044` — original human continuity FAIL
6. issue #8 comment `5562283164` — isolated remote machine gate GREEN
7. the newest issue #8 checkpoint after the pre-Owner audit
8. `docs/MULTI_WORLD_PROJECT_SOUL.md` only as needed for broader intent

Do not let V2 or older A2R-era takeover documents override the pre-Owner audit.

## 3. Compact live verification only

Before the human test verify:

- both frozen heads still match;
- delivery is still a descendant of the qualified source;
- product/runtime protected paths still match `a2e821...` exactly;
- final workflow `34060903778` remains green;
- no newer issue #8 checkpoint supersedes the audit;
- handoff-only changes have not leaked into runtime/delivery.

If these remain true, do not rerun I1–I4 merely for reassurance.

## 4. What is strongly supported now

The original global lifecycle defect was changed at its causal source.

After canonical play starts:

- ActorSession lifetime is separated from WebSocket lifetime;
- one actor starvation / transport loss no longer globally ends the WorldEpoch;
- lease expiry becomes actor-local neutral containment;
- same-page reconnect can rebind the same ActorSession using its private resume token;
- long-gap recovery can use an exact Box3D full-state seed/rebase;
- healthy peer/world continuity survived remote I1/I4b qualification;
- I2 future intent supersession and I3 rAF-independent canonical authorship passed their bounded falsifiers.

The 36-tick input lease was not simply increased to hide the problem.

## 5. Critical evidence boundaries inherited from the audit

### Same-page resume != persistent player identity

The browser keeps `resumeToken` only in live JavaScript memory.

A transport interruption / authority silence in the same living page can resume the same ActorSession.

A full page reload, tab destruction, process loss or reopening the link loses that token. A fresh actor cannot join an already-started run without the token.

Therefore do **not** use deliberate full close/reload/reopen as the first R0d continuity disturbance and do not describe generic `leave/rejoin` as already qualified.

### Real mobile background is still human evidence

I3b proves independence from `requestAnimationFrame()` while the event loop remains runnable.

I4b proves exact recovery through a controlled real-Chromium network outage, but its harness deliberately suppresses normal browser background throttling. It does not prove real phone freeze/discard behavior.

If a natural mobile background causes page discard/process destruction and the actor cannot return because its token was lost, that is meaningful new product evidence rather than an invalid test.

### Explicit close-code recovery is narrower than server authority

The browser auto-resume close path explicitly recognizes abnormal close `1006`, while authority-silence recovery has its own path.

Other close codes may end the local round without automatically reusing the still-valid ActorSession token. Preserve the exact sequence if this occurs; do not generalize before evidence.

### DO/process-loss persistence remains unsolved

The live Box3D WorldEpoch is in memory and intentionally pinned against normal hibernation. Durable Object/Worker shutdown or runtime restart can still destroy that in-memory world and terminate sockets.

I1–I4 therefore prove transport/client-starvation continuity **within a surviving WorldEpoch**, not persistent world continuity across process loss.

Do not upgrade a human PASS into a broader persistence claim.

### Pre-start remains fail-closed

If one waiting peer disappears before canonical play starts, the waiting epoch is intentionally retired and later entrants receive a fresh waiting epoch.

Active-run ActorSession continuity is the qualified contract, not waiting-lobby reconnect.

## 6. Correct fresh human run contract

The previous conversation generated an overlong run ID. It is invalid and must never be reused.

The actual room/run pattern is:

`^[A-Za-z0-9_-]{1,20}$`

At the actual test time generate a **brand-new high-entropy valid run ID of at most 20 characters**.

Preferred shape: use the Friend-Ready entropy contract — `yard-` plus base64url encoding of 10 fresh cryptographic random bytes.

Do not use an ID already written in an old conversation, CI log or prior test.

Do not remotely open/pre-touch that exact run before the Owner enters.

Human URL:

`https://cloudflare-multiplayer-lab-reliability-play.jozzpoly.workers.dev/world-v0/?run=<fresh-valid-run-id>`

## 7. Exact entry ordering

1. Owner in Poland opens the fresh deep link.
2. Owner **clicks Enter** and reaches the waiting-for-peer state.
3. Owner keeps the page alive there.
4. Only then share the exact same URL with the second real person/device.
5. Second actor enters.
6. Wait until two-person play is visibly live before disturbing anything.

Opening the static page alone does not establish the run's Durable Object. The WebSocket entry is the meaningful first run access.

Valid deep-link mode bypasses the public `yard-1/2/3` directory polling, preserving the Owner-first locality experiment.

## 8. Corrected Owner test

Start with ordinary play for a few minutes: movement, camera, observing the peer and pushing shared props.

Primary disturbance should be one natural **background -> foreground** event on the second real device while the Owner remains foreground and observes the world continuously.

Do not deliberately kill/reload the second page during this first disturbance.

A second brief transport interruption is optional only if the first event does not exercise the question. Do not stack failure modes into an ambiguous run.

Primary question:

> Is the previous product-blocking global `live -> blank/recovery/waiting -> live` failure gone, with the healthy peer and shared world remaining continuously alive while the interrupted same-page actor recovers?

Secondary observations:

- returning actor continuity / visible jump;
- whether the absent actor briefly finishes pre-authored movement before neutralizing;
- any close/recovery reason visible in evidence;
- fresh Owner-first RTT;
- any new friction as serious as the original failure.

Evidence is useful but the Owner is not a telemetry operator. One short recording, qualitative description, RTT and Copy Evidence when convenient are sufficient. Do not repeat a clear result merely to recover a missing blob.

## 9. Result classification before any next work

### Strong PASS

Healthy peer/world stay live; no global old-style recovery cycle dominates; interrupted same-page actor returns to the existing living world; no equally serious new failure appears.

### Partial PASS / new bounded gap

The old global epoch-death defect is clearly gone, but returning-actor recovery has a separate defect — for example close-code handling, mobile discard/token loss or unacceptable local recovery discontinuity.

Close the old causal question and isolate the smallest new contract.

### FAIL — old class persists

A bounded natural event still globally collapses both players/world into the old recovery/new-epoch cycle.

Preserve exact sequence and identify the smallest remaining lifecycle cause.

### INVALID

Use only for a real apparatus/specimen problem such as wrong deployment, different run IDs, inaccessible/stale assets or provenance mismatch.

Real mobile lifecycle behavior is not invalid merely because a machine harness did not cover it.

## 10. Scope freeze remains

Before the Owner verdict do not start:

- I5;
- persistent ActorSession implementation;
- Durable Object world persistence;
- broader reconciliation machinery;
- jump/content expansion;
- 3-player support;
- lobby/matchmaking redesign;
- broad runtime refactoring;
- another generic synthetic reliability matrix.

The audit identified future edges; it did not authorize pre-emptive feature expansion.

## 11. Branch safety

Do not mutate:

`world-v0-multiplayer-foundation-integration@a2e821...`

or:

`world-v0-r0d-reliability-retest@7da9ddd...`

before the human gate.

Use `multi-world-r0d-reliability-handoff` only for documentation/evidence continuity.

The abandoned `world-v0-friend-ready-foundation-integration@5dd28a...` remains inert/non-frontier.

## 12. First response expected after future takeover

After compact live verification, tell the Owner only what is decision-relevant:

- whether frozen anchors still match;
- whether the pre-Owner audit remains the current authority;
- whether any new contradiction appeared;
- when the Owner is actually ready to test, generate a **fresh valid <=20-character** human-only run URL;
- remind them: enter first and reach waiting-for-peer before sharing;
- state the one global-continuity question being tested.

Do **not** generate the human run ID days or conversations early. Freshness is part of the test contract.

# END TAKEOVER MANDATE
