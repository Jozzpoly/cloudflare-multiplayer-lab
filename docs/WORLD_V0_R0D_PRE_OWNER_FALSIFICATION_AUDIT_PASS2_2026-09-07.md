# World V0 R0d — Pre-Owner Falsification Audit Pass 2

Status: **PASS 2 CLOSED / FROZEN RUNTIME STILL UNCHANGED / OWNER HUMAN GATE REMAINS NEXT**  
Date: **2026-09-07**

This document extends, and where stated corrects, `WORLD_V0_R0D_PRE_OWNER_FALSIFICATION_AUDIT_2026-09-07.md`.

It was produced because the Owner still had time before the real two-person test and explicitly asked for another broad round of falsification rather than treating the first audit as sufficient.

The purpose was not to add I5 or reopen architecture. It was to attack the remaining gap between the qualified machine envelope and the exact causal shape of the prior human failure.

---

## 1. Frozen runtime anchors remain unchanged

Qualified product/runtime source:

`world-v0-multiplayer-foundation-integration@a2e821afbbc88371b033af311cc6882d46aa6916`

Isolated R0d delivery:

`world-v0-r0d-reliability-retest@7da9ddd4ad37221f63a3cd418a140824783480ec`

Isolated Worker:

`cloudflare-multiplayer-lab-reliability-play`

Final original remote qualification:

`34060903778` — completed / success

No runtime, protocol, Worker configuration, package, or frozen delivery file was modified by Pass 2.

Pass-2 execution branches are evidence-only descendants of `7da9ddd...` and explicitly guard against protected-runtime drift.

---

## 2. Major correction: the original R0d FAIL was ordinary visible play

The original Owner human FAIL in issue #8 comment `5558411044` was reread as causal evidence rather than merely as a remembered summary.

The key timing matters:

- the product entered the old global failure/recovery behavior during ordinary two-person play;
- evidence recorded `session.end.reason = input_lease_expired:actor:1` and an epoch rotation / same-room recovery sequence;
- the later `visibility:hidden` event occurred roughly **23.3 seconds after** the lease-expiry event;
- therefore the original failure was **not caused by backgrounding the phone**.

This corrects the emphasis in the first pre-Owner plan.

### Consequence for the human gate

The primary falsifier must first be:

> ordinary visible two-person play, with both devices remaining foreground, long enough to give the old client-starvation/global-lifecycle failure a fair chance to recur.

Only after that phase is stable should one natural mobile background -> foreground event be introduced as a separate second phase.

Background recovery remains important, but it is not the first causal question anymore.

---

## 3. Coverage gap found: I1 did not exactly reproduce the old live-transport starvation shape

Existing I1 proves actor-local lease containment and same-ActorSession resume after transport loss.

However its core starvation specimen stops B's input feed **and closes B's WebSocket**.

The old Owner failure did not establish a transport close before starvation. A meaningful missing falsifier therefore remained:

> what if B simply stops producing canonical input for longer than the 36-tick lease while the WebSocket itself remains open?

This is deliberately narrower than a new integration stage. It directly reproduces the old causal symptom at the authority boundary.

---

## 4. Focused live-transport starvation falsifier

Evidence branch:

`world-v0-r0d-preowner-starvation-falsifier`

Branch origin:

`7da9ddd4ad37221f63a3cd418a140824783480ec`

Added evidence-only paths:

- `scripts/world-v0-r0d-preowner-starvation-falsifier.mjs`
- `.github/workflows/world-v0-r0d-preowner-starvation-falsifier.yml`

The workflow first proves that no protected runtime path differs from the frozen delivery and verifies live deployed provenance before creating its CI-only run.

Final focused run:

`34104024218` — **PASS**

Artifact:

- ID: `10011623838`
- ZIP SHA-256: `6d63b08a6326fb418d341cf95c6611dcabce09f1e05af10c8ded5805fba08993`

Exact live provenance observed by the falsifier:

- qualified source: `a2e821afbbc88371b033af311cc6882d46aa6916`
- delivery: `7da9ddd4ad37221f63a3cd418a140824783480ec`
- Worker: `cloudflare-multiplayer-lab-reliability-play`
- SimBuildId: `shared-yard-v0-sim-888e471bc211091e`

### What the test did

1. Create two clients A/B in a fresh CI-only Yard.
2. Reach normal canonical two-player play.
3. Confirm B is producing fresh canonical input.
4. Stop **only B's input production**.
5. Keep B WebSocket open.
6. Wait beyond the 36-tick input lease.
7. Require A to remain canonically healthy and the same WorldEpoch to survive.
8. Require B transport to remain open.
9. Resume fresh B input on that same socket.
10. Require fresh canonical B consumption to return without epoch rotation or transport rebind.

### Exact result

- starvation started around authority boundary `91`;
- B last fresh boundary: `98`;
- B lease-expired boundary: `134`;
- exact gap: **36 ticks**;
- B WebSocket remained open;
- healthy A stayed fresh;
- no `world_v0_epoch_ended` was observed;
- same WorldEpoch remained alive;
- B returned to fresh canonical input at boundary `141`;
- recovery occurred on the same socket.

Verdict:

`WORLD_V0_R0D_PREOWNER_LIVE_TRANSPORT_STARVATION_PASS`

### What this materially proves

The exact old server-side causal shape — **visible/live actor input starvation without transport loss** — can no longer by itself kill the shared WorldEpoch.

This substantially strengthens the claim that the old global lifecycle coupling was actually removed rather than merely bypassed by reconnect logic.

Non-claim: it does not prove that a real browser main thread cannot stall, nor mobile background/discard behavior, nor human-visible smoothness.

---

## 5. Second coverage gap found: I3 freezes rAF, not the whole JS event loop

I3 Chromium deliberately replaces/holds `requestAnimationFrame()` while simultaneously proving that a separate 16 ms event-loop heartbeat remains alive.

That is correct for I3's contract: canonical input authorship is independent from rAF **while the JavaScript event loop remains runnable**.

It does not cover a stronger browser failure shape:

> the entire renderer main thread stalls for longer than the 36-tick lease, so both rAF and the scheduler `setInterval()` stop together while the healthy peer remains active.

Other I3b probes also do not close this exact gap:

- temporal-floor probe is a static/pure falsifier of stale authority estimation;
- resume-buffer probe covers accepted future input across transport rebind/exact rebase.

A bounded full-main-thread browser falsifier was therefore justified.

---

## 6. Full renderer main-thread stall falsifier

Evidence branch:

`world-v0-r0d-preowner-mainthread-falsifier`

Branch origin:

`7da9ddd4ad37221f63a3cd418a140824783480ec`

Final branch head after apparatus correction:

`4459eddac322cdee057aa8ec6732d01d2b9b4ce6`

Added evidence-only paths:

- `scripts/world-v0-r0d-preowner-mainthread-stall-falsifier.mjs`
- `.github/workflows/world-v0-r0d-preowner-mainthread-falsifier.yml`

The harness reuses the existing real-Chromium exact-state smoke, which launches A and B as two independent Chrome processes/profiles. It then deliberately busy-blocks B's renderer main thread for **1400 ms** while A remains independently runnable.

No runtime is deployed or modified.

---

## 7. Important apparatus failure caught during the new test

The first new main-thread run exposed a test-harness defect before it exposed a product defect.

Run:

`34104624070`

GitHub showed the workflow as `success`, but the underlying Node falsifier had actually failed.

Cause:

The workflow used:

`node ... | tee ...`

without shell `pipefail`, so `tee` returned zero and masked Node's non-zero exit status.

Artifact from this diagnostic run:

- ID `10011866849`
- ZIP SHA-256 `20133fc342b71e246a5750e2e6b665e30c12130c9384c8371751546c9f713618`

This green workflow status is **not valid PASS evidence**.

The workflow was corrected to use `set -o pipefail` before the pipeline.

### Why the underlying test initially failed

The first test contract also made an incorrect architectural assumption: it demanded that B recover from the full main-thread stall **without** using ActorSession recovery/rebase.

The diagnostic artifact showed the opposite:

- B local prediction reached a safety gap of `silenceTicks=26` while `safeBlindTicks=20`;
- the existing `authority_silence_history_guard` fired;
- B entered ActorSession resume;
- the same ActorSession was rebound;
- an exact full-state authority rebase was applied;
- B returned to live exact state;
- WorldEpoch did not rotate;
- A remained alive;
- exact guards remained clean.

That is the existing I4b safety design working as intended, not a product failure.

The test contract was corrected to recognize only two valid bounded recovery classes:

1. direct same-page exact catch-up with no ActorSession recovery; or
2. exactly bounded same-ActorSession recovery with exact rebase.

Anything else remains FAIL.

---

## 8. Corrected main-thread falsifier — final trustworthy PASS

A second run with corrected semantic classification already passed materially:

`34104997239`

It demonstrated one bounded same-ActorSession exact-rebase recovery after the full stall.

However that run still used the old workflow shell pipeline, so the final workflow verdict was intentionally not treated as sufficient by itself.

The fully corrected run is:

`34105021689` — **completed / success**

Head:

`4459eddac322cdee057aa8ec6732d01d2b9b4ce6`

This run includes both:

- corrected bounded recovery semantics; and
- corrected `pipefail`, so Node failure would now fail the workflow.

Artifact:

- ID `10012014250`
- ZIP SHA-256 `cb4c1e67f5f5a5755030ebdfe48da7c798b1dfd3b5fbf0393c2d4edf3eee9384`

Exact final specimen:

- requested full renderer main-thread stall: `1400 ms`;
- measured stall: exactly `1400 ms`;
- independent CDP main-thread probe was blocked for `1494 ms`, proving the renderer thread was actually unavailable;
- healthy A observed B's actor-local lease after about `873 ms`;
- A session did not end;
- same WorldEpoch survived;
- same B ActorSession survived;
- this repeat took the valid **direct same-page catch-up** path rather than rebase;
- B processed the queued lease-expired interval and resumed scheduler progress;
- `guardMismatches=0`;
- `guardPending=0`;
- no B rebase was required in this repeat;
- the normal two-Chromium exact-state envelope subsequently also passed.

Verdict:

`WORLD_V0_R0D_PREOWNER_MAINTHREAD_STALL_PASS`

The prior corrected run `34104997239` independently exercised the other permitted recovery class — **same-ActorSession exact rebase** — with:

- one authority-silence recovery;
- exact rebase;
- preserved ActorSession;
- preserved WorldEpoch;
- zero guard mismatches.

Together these two specimens are useful because scheduling order naturally selected both bounded recovery branches under the same 1400 ms full-main-thread disturbance.

---

## 9. Revised evidence picture after Pass 2

The machine evidence now covers three distinct starvation/stall envelopes:

### A. rAF-only starvation pressure

I3/I3b:

- rAF is frozen;
- JS event loop remains runnable;
- independent logical scheduler keeps canonical input flowing;
- no lease expiry in the clean I3 window.

### B. canonical input starvation with a live WebSocket

Pass-2 focused starvation falsifier:

- B stops sending input;
- B socket remains open;
- actor-local lease expires at exactly 36 ticks;
- healthy A/world survives;
- B fresh input resumes on the same socket.

### C. entire browser renderer main-thread stall > lease

Pass-2 main-thread Chromium falsifier:

- B rAF and JS timers are both unavailable for 1400 ms;
- healthy A/world remains alive;
- B may recover either by direct catch-up or the existing authority-silence same-ActorSession exact-rebase path;
- both bounded branches were observed across corrected specimens;
- final exact state remains clean.

This is substantially stronger coverage of the old human failure family than existed before Pass 2.

---

## 10. What remains genuinely human/mobile evidence

Pass 2 still does **not** justify skipping the Owner test.

The remaining materially different envelopes are now narrower:

- actual Android/mobile browser scheduling and process lifecycle;
- background/foreground behavior under the real OS;
- tab freeze/discard or process destruction;
- mobile WebSocket close semantics and arbitrary close codes;
- real Polish Owner-first Durable Object placement / RTT;
- human-visible continuity, blanking, jumps, feel and friction;
- any interaction between real device load, rendering, touch input and network that does not reproduce cleanly on hosted Linux Chromium.

The human gate has therefore become more valuable, not less: it is testing the residual real-device/product layer after the main machine-addressable causal shapes have been attacked directly.

---

## 11. Human test is now explicitly two-phase

### Phase A — primary old-failure falsifier

Both real devices remain foreground.

Play naturally for several minutes:

- movement;
- camera;
- shared props/contact;
- jump if convenient;
- ordinary simultaneous interaction.

Do **not** background either device during this phase.

Primary question:

> Can ordinary visible two-person play still make one client's starvation collapse the healthy peer/shared WorldEpoch into the old `live -> blank/recovery/waiting -> live` cycle?

If yes: old class persists — FAIL.

If no after a meaningful natural play interval: this is new human evidence directly against the original failure mode.

### Phase B — separate mobile lifecycle falsifier

Only after Phase A is stable:

- Owner remains foreground and keeps observing/playing;
- second device performs one normal background -> foreground cycle;
- do not deliberately kill/reload the tab;
- observe whether the Owner/world remains live and how the returning actor recovers.

This tests a different boundary and must not overwrite the Phase-A verdict.

---

## 12. Updated result taxonomy

### Old global failure PASS

Owner/shared world stays alive through ordinary Phase-A play and does not enter the prior global recovery/new-epoch cycle.

### Strong combined PASS

Phase A is stable, and Phase B also returns the interrupted same-page actor into the existing world without an equally serious new product failure.

### Partial PASS / new client-lifecycle gap

Phase A proves the old global coupling is gone, but Phase B reveals a bounded returning-actor/mobile lifecycle defect while the healthy peer/world remains alive.

This closes the old causal question and opens a smaller new one.

### Old class FAIL

Ordinary foreground play or a bounded actor disturbance still globally kills/rotates the shared WorldEpoch and pushes both clients through the old blank/recovery/waiting cycle.

### INVALID

Reserve for specimen/apparatus problems: wrong deployment, provenance mismatch, different run IDs, invalid invite, stale/incompatible client that fail-closes before the intended test, etc.

Real mobile behavior is not INVALID merely because it falls outside a synthetic machine harness.

---

## 13. Decision after Pass 2

**Do not patch runtime before the Owner test.**

Pass 2 found and fixed test-apparatus problems, not evidence of a runtime blocker.

It also directly reproduced and passed the old live-transport starvation shape and a stronger full-renderer-main-thread stall shape against the exact frozen deployed specimen.

The next justified frontier remains the real human/mobile gate.

Further pre-Owner work is allowed only if it attacks a genuinely distinct residual uncertainty. Re-running variants of the same starvation/stall envelope for reassurance is now low value.

If another audit round cannot identify a materially different falsifiable gap, the correct response is:

> teraz najważniejszy jest Twój test

---

## 14. Pass-2 evidence anchors

### Live-transport starvation

Branch:

`world-v0-r0d-preowner-starvation-falsifier`

Run:

`34104024218`

Artifact ID:

`10011623838`

Verdict:

`WORLD_V0_R0D_PREOWNER_LIVE_TRANSPORT_STARVATION_PASS`

### Full main-thread stall

Branch:

`world-v0-r0d-preowner-mainthread-falsifier`

Final evidence head:

`4459eddac322cdee057aa8ec6732d01d2b9b4ce6`

Final trustworthy workflow run:

`34105021689`

Artifact ID:

`10012014250`

Artifact ZIP SHA-256:

`cb4c1e67f5f5a5755030ebdfe48da7c798b1dfd3b5fbf0393c2d4edf3eee9384`

Verdict:

`WORLD_V0_R0D_PREOWNER_MAINTHREAD_STALL_PASS`

Historical apparatus diagnostic run:

`34104624070` — workflow status must **not** be interpreted as PASS because the original shell pipeline masked Node failure.

---

End state: **frozen runtime preserved; machine-addressable old-failure coverage materially strengthened; human Phase A ordinary-visible-play test is primary; Phase B mobile background is secondary; Owner gate remains the correct next product decision.**
