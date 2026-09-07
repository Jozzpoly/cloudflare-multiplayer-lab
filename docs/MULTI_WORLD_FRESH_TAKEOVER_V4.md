# Multi_World — Fresh Takeover V4

Status: **PRE-OWNER AUDIT PASS 2 CLOSED / R0d HUMAN GATE NEXT**  
Prepared: **2026-09-07**

This supersedes `MULTI_WORLD_FRESH_TAKEOVER_V3.md` for new Browser ChatGPT conversations.

V3 remains provenance for the first pre-Owner audit. V4 incorporates Pass 2, including a correction to the human-test causal target and two new focused machine falsifiers executed against the exact frozen deployed R0d specimen.

---

# START TAKEOVER MANDATE

Take over **Multi_World** as a fresh execution continuation.

Repository:

`Jozzpoly/cloudflare-multiplayer-lab`

Do not resume broad implementation automatically. The current frontier is a real two-person Owner reliability test after two deliberate pre-Owner falsification passes.

## 1. Frozen runtime anchors

Qualified product/runtime source:

`world-v0-multiplayer-foundation-integration@a2e821afbbc88371b033af311cc6882d46aa6916`

Isolated R0d delivery:

`world-v0-r0d-reliability-retest@7da9ddd4ad37221f63a3cd418a140824783480ec`

Isolated Worker:

`cloudflare-multiplayer-lab-reliability-play`

Original final remote qualification:

`34060903778` — expected **completed / success**

Documentation/handoff branch:

`multi-world-r0d-reliability-handoff`

The docs branch may move. It is never runtime authority.

## 2. Canonical startup reading order

Read in this order:

1. `docs/MULTI_WORLD_CURRENT_STATE.md`
2. `docs/WORLD_V0_R0D_PRE_OWNER_FALSIFICATION_AUDIT_PASS2_2026-09-07.md`
3. `docs/WORLD_V0_R0D_PRE_OWNER_FALSIFICATION_AUDIT_2026-09-07.md`
4. `docs/WORLD_V0_R0D_RELIABILITY_RETEST_HANDOFF.md` as detailed historical machine/handoff evidence, subject to both audit corrections
5. `docs/WORLD_V0_R0D_RELIABILITY_EVIDENCE_MANIFEST.md` when exact original artifact provenance is needed
6. issue #8 comment `5558411044` — original human R0d continuity FAIL
7. issue #8 comment `5562283164` — original isolated remote I1–I4 machine gate GREEN
8. newest issue #8 checkpoint after Pass 2
9. `docs/MULTI_WORLD_PROJECT_SOUL.md` only as needed for broader intent

Do not let V3, V2 or older A2R-era takeover material override Pass 2.

## 3. Compact live verification before any human test

Verify only what can drift:

- `a2e821...` is still the integration head;
- `7da9ddd...` is still the R0d delivery head;
- delivery still descends from source;
- protected runtime/product paths still match the frozen source;
- workflow `34060903778` remains green;
- the isolated Worker provenance still identifies `a2e821... / 7da9ddd...`;
- the newest issue #8 checkpoint does not supersede this handoff;
- docs-only work has not leaked into runtime/delivery.

Do not rerun I1–I4 merely for reassurance if these anchors still hold.

## 4. What the old human failure actually was

The original R0d Owner FAIL in issue #8 comment `5558411044` occurred during ordinary visible two-person play.

The evidence showed:

- `session.end.reason = input_lease_expired:actor:1`;
- shared recovery/new-epoch behavior;
- the later `visibility:hidden` event was about 23.3 seconds **after** that lease-expiry failure.

Therefore mobile backgrounding did **not** cause the original failure.

This matters because the first human phase must attack ordinary visible-play starvation/global lifecycle coupling before any mobile background disturbance is introduced.

## 5. What is strongly machine-supported now

After canonical play starts:

- ActorSession lifetime is separated from WebSocket transport lifetime;
- one actor starvation no longer globally ends the WorldEpoch;
- 36-tick lease expiry is actor-local containment;
- healthy peer/world continuity survives actor loss/starvation in the qualified contract;
- same-page ActorSession resume uses a private resume token;
- authority-silence recovery can replace the transport and exact-rebase full Box3D state;
- I2 future-intent supersession is qualified;
- I3 proves canonical authorship independent from rAF while the JS event loop remains runnable;
- I4b proves bounded exact full-state recovery beyond local history/lease.

The lease was not widened to hide the problem.

## 6. Pass-2 direct reproduction of the old causal shape

Evidence branch:

`world-v0-r0d-preowner-starvation-falsifier`

Focused run:

`34104024218` — **PASS**

Verdict:

`WORLD_V0_R0D_PREOWNER_LIVE_TRANSPORT_STARVATION_PASS`

This run used the exact live isolated Worker and exact frozen provenance.

It deliberately stopped B canonical input while keeping B's WebSocket open.

Observed:

- B last fresh boundary `98`;
- B lease-expired boundary `134`;
- exact 36-tick lease;
- B transport remained open;
- A remained fresh;
- no epoch-ended event;
- same WorldEpoch survived;
- B returned to fresh canonical input at boundary `141` on the same socket.

This is the strongest direct machine evidence so far that the original authority-side `input starvation -> global epoch death` coupling is gone.

## 7. Pass-2 full renderer main-thread stall

I3 by design freezes only rAF and explicitly keeps the JS event loop runnable. Pass 2 therefore added a stronger browser falsifier where B's **entire renderer main thread** is blocked for 1400 ms while A runs in an independent Chrome process.

Evidence branch:

`world-v0-r0d-preowner-mainthread-falsifier`

Final head:

`4459eddac322cdee057aa8ec6732d01d2b9b4ce6`

Final trustworthy workflow run:

`34105021689` — **completed / success**

Artifact:

`10012014250`

ZIP SHA-256:

`cb4c1e67f5f5a5755030ebdfe48da7c798b1dfd3b5fbf0393c2d4edf3eee9384`

Verdict:

`WORLD_V0_R0D_PREOWNER_MAINTHREAD_STALL_PASS`

Final specimen proved:

- measured renderer block: 1400 ms;
- CDP main-thread probe blocked ~1494 ms, so the event loop was genuinely unavailable;
- healthy A observed actor-local lease while continuing to run;
- A session/world did not end;
- WorldEpoch stayed unchanged;
- B ActorSession stayed unchanged;
- B returned to exact state;
- `guardMismatches=0` and `guardPending=0`;
- the final repeat recovered by direct same-page catch-up;
- a preceding corrected run (`34104997239`) independently exercised the other permitted bounded class: one same-ActorSession authority-silence exact rebase.

Thus both bounded recovery branches have been observed under a full >lease main-thread stall.

## 8. Apparatus lesson from Pass 2

Do not blindly trust a green GitHub status.

Initial main-thread run `34104624070` was displayed as `success` even though the underlying Node test failed, because the shell pipeline used:

`node ... | tee ...`

without `pipefail`.

That workflow verdict is invalid evidence.

The harness also initially made an incorrect semantic assumption that a full main-thread stall must recover without rebase. Diagnostic evidence showed the existing I4b authority-silence exact-rebase path correctly taking over instead.

Both apparatus defects were corrected.

Final run `34105021689` uses `set -o pipefail`, so Node failure now fails the workflow.

This history is important: distinguish implementation failure, test-contract failure and CI verdict failure.

## 9. Remaining evidence boundaries

### Same-page ActorSession continuity is not persistent identity

`resumeToken` lives only in the current JavaScript page memory.

Full reload, tab destruction, browser process loss or reopening the link loses it.

Do not interpret deliberate kill/reload/reopen as the same contract as same-page continuity.

### Real Android/mobile lifecycle remains human evidence

Hosted Linux Chrome does not emulate all phone scheduling, OS suspension, tab discard or process destruction.

A natural mobile discard/process loss is meaningful product evidence even though it lies outside current same-page resume guarantees.

### Explicit close-code recovery is narrower than authority capability

Automatic explicit-close ActorSession resume is currently targeted at abnormal close code `1006`; authority-silence has its own independent path.

Other real close codes may expose a smaller client-lifecycle gap.

### DO/process-loss persistence remains unsolved

The live Box3D WorldEpoch is in-memory. Epoch pinning prevents normal hibernation but is not durable world persistence across Worker/DO runtime destruction.

Do not upgrade R0d transport/client continuity into a process-persistence claim.

### Pre-start is intentionally fail-closed

A waiting peer disappearing before canonical run start retires that waiting epoch.

The Owner must enter first and remain waiting until the second actor enters.

## 10. Fresh human run contract

Never reuse the previously generated overlong/invalid run ID.

Pattern:

`^[A-Za-z0-9_-]{1,20}$`

At the actual test moment generate a brand-new high-entropy valid run, preferably the Friend-Ready contract:

`yard-` + base64url of 10 fresh cryptographic random bytes.

Do not write the exact human run into CI logs or pre-touch its Durable Object remotely.

Human URL:

`https://cloudflare-multiplayer-lab-reliability-play.jozzpoly.workers.dev/world-v0/?run=<fresh-valid-run-id>`

## 11. Entry ordering

1. Owner in Poland opens the fresh deep link.
2. Owner clicks **Enter**.
3. Owner reaches `waiting for peer` and keeps the page alive.
4. Only then share the same URL with the second real person/device.
5. Second actor enters.
6. Wait until two-person play is clearly live.
7. Begin Phase A.

The static deep-link page load itself does not instantiate the room DO; WebSocket entry is the meaningful first room access.

## 12. Owner test — Phase A is primary

Both devices remain **foreground**.

Play naturally for several minutes. Include ordinary concurrent use:

- movement;
- camera;
- shared props/contact;
- jump if convenient;
- normal changes of direction and periods of simultaneous action.

Do not intentionally background, reload or kill either page during Phase A.

Primary question:

> During ordinary visible two-person play, is the previous global `live -> blank/recovery/waiting -> live` failure gone, with the healthy peer and shared WorldEpoch remaining continuously alive even if one client briefly starves internally?

This phase directly targets the old human failure.

A few minutes of natural play is more valuable here than a scripted telemetry ritual.

## 13. Owner test — Phase B is secondary

Only if Phase A is stable:

1. Owner stays foreground and continues observing/playing.
2. Second real device performs **one normal background -> foreground** cycle.
3. Do not deliberately kill/reload the tab.
4. Observe Owner/world continuity and returning-actor behavior.

This is a separate mobile lifecycle falsifier, not the explanation for the old failure.

If the OS naturally discards/destroys the page during this normal action, preserve that as real product evidence rather than declaring the run invalid.

## 14. Human result classification

### Old global failure PASS

Phase A remains live without the old global recovery/new-epoch collapse.

### Strong combined PASS

Phase A is stable and Phase B also returns the same-page actor to the existing living world without an equally serious new failure.

### Partial PASS / new bounded client gap

Phase A proves the old global defect is gone, but Phase B exposes a smaller returning-actor/mobile lifecycle problem while the healthy peer/world remains alive.

Close the old causal question and isolate the new contract.

### FAIL — old class persists

Ordinary foreground play or a bounded actor disturbance still globally collapses the healthy peer/shared WorldEpoch into the old blank/recovery/waiting/new-epoch cycle.

Preserve exact sequence and diagnose the smallest remaining cause.

### INVALID

Only for true apparatus/specimen problems such as wrong deployment, provenance mismatch, different run IDs, invalid invite or an incompatible/stale client that fail-closes before the intended experiment.

Real mobile behavior is not invalid merely because synthetic CI did not model it.

## 15. Human evidence burden

The Owner is not a telemetry operator.

Prefer:

- one short screen recording when convenient;
- qualitative description of what each device did;
- whether the Owner/world ever blanked/recovered/waited;
- whether the returning actor visibly jumped/teleported/restarted;
- RTT/evidence copy only when easy or when something fails.

Do not repeat a clear human result just to obtain prettier evidence.

## 16. Scope freeze remains

Before the human verdict do not start:

- I5;
- persistent ActorSession implementation;
- Durable Object world persistence;
- broader reconciliation architecture;
- jump/content expansion;
- 3-player support;
- lobby/matchmaking redesign;
- broad runtime refactoring;
- another generic reliability matrix.

Pass 2 authorized only targeted falsification of genuinely distinct evidence gaps.

## 17. Branch safety

Do not mutate:

`world-v0-multiplayer-foundation-integration@a2e821...`

or:

`world-v0-r0d-reliability-retest@7da9ddd...`

before the Owner gate.

Pass-2 evidence branches are not runtime candidates:

- `world-v0-r0d-preowner-starvation-falsifier`
- `world-v0-r0d-preowner-mainthread-falsifier`

Use `multi-world-r0d-reliability-handoff` only for documentation/evidence continuity.

## 18. When further pre-Owner auditing stops being valuable

Pass 2 directly covered:

- old-style input starvation with a live socket;
- full browser main-thread starvation beyond the lease;
- both direct catch-up and same-ActorSession exact-rebase bounded recovery;
- CI verdict integrity for the new falsifier.

A future `kontynuuj` should not mechanically create more variants of these same tests.

Only continue pre-Owner work if a **materially different residual uncertainty** can be named and falsified without mutating the candidate.

If no such distinct gap is found, tell the Owner plainly:

> teraz najważniejszy jest Twój test

## 19. First response after a future takeover

After compact live verification, report only:

- whether frozen anchors still match;
- whether Pass 2 / V4 remain current;
- whether any new contradiction appeared;
- whether further machine work has a distinct target or whether the Owner test is now the highest-value action.

When the Owner is actually ready, generate the fresh valid <=20-character human-only run and conduct the two-phase test above.

# END TAKEOVER MANDATE
