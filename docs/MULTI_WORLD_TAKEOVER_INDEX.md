# Multi_World — Takeover package index

Status: **HANDOFF READY / PRE-OWNER FALSIFICATION PASS 2 CLOSED / R0d HUMAN GATE NEXT**  
Updated: **2026-09-07**  
Handoff branch: `multi-world-r0d-reliability-handoff`

This index supersedes the old A2R-era takeover order and the earlier V2/V3 startup orders.

The handoff branch is documentation/reference only. Runtime authority remains the frozen source and delivery specimens below.

---

## Canonical reading order now

1. **`MULTI_WORLD_CURRENT_STATE.md`**  
   Baseline current-state authority from machine-qualification closure. Keep its runtime/delivery anchors, but apply the later audit layers below.

2. **`WORLD_V0_R0D_PRE_OWNER_FALSIFICATION_AUDIT_PASS2_2026-09-07.md`**  
   Current highest-priority pre-human evidence layer. It rereads the original Owner FAIL, corrects the causal target of the human gate, directly reproduces live-socket input starvation, adds a full renderer-main-thread stall falsifier, records the CI `tee`/`pipefail` apparatus bug, and closes Pass 2 without changing runtime.

3. **`WORLD_V0_R0D_PRE_OWNER_FALSIFICATION_AUDIT_2026-09-07.md`**  
   First pre-Owner audit. Retains the run-ID correction, same-page resume boundary, mobile lifecycle boundary, DO/process persistence nonclaim and other implementation red-team findings.

4. **`MULTI_WORLD_FRESH_TAKEOVER_V4.md`**  
   Current startup mandate for a fresh Browser ChatGPT continuation. V4 supersedes V3/V2.

5. **`WORLD_V0_R0D_RELIABILITY_RETEST_HANDOFF.md`**  
   Detailed machine/handoff history. Useful as provenance; broad older wording is subject to both audit layers.

6. **`WORLD_V0_R0D_RELIABILITY_EVIDENCE_MANIFEST.md`**  
   Exact digest of the original final remote I1–I4 artifact.

7. **GitHub issue #8, comment `5558411044`**  
   Original R0d human continuity FAIL. Important causal fact: lease-expiry/global failure happened during ordinary visible play, roughly 23.3 seconds before the later `visibility:hidden` event.

8. **GitHub issue #8, comment `5562283164`**  
   Original isolated remote machine gate GREEN after I1–I4.

9. **Newest issue #8 Pass-2 checkpoint**  
   Current compact continuation checkpoint after the additional starvation/main-thread falsifiers.

10. **`MULTI_WORLD_PROJECT_SOUL.md`**  
    Stable broader project intent when needed.

Older `MULTI_WORLD_FRESH_TAKEOVER_V3.md`, V2, V1 and A2R-era grounding are provenance, not current startup authority.

---

## Exact frozen runtime/delivery anchors

### Qualified product + reliability source

`world-v0-multiplayer-foundation-integration@a2e821afbbc88371b033af311cc6882d46aa6916`

Role: frozen R0c product + Multiplayer Reliability Foundation I1–I4 runtime control.

### Isolated R0d delivery specimen

`world-v0-r0d-reliability-retest@7da9ddd4ad37221f63a3cd418a140824783480ec`

Role: delivery-only descendant of `a2e821...`.

Expected isolated Worker:

`cloudflare-multiplayer-lab-reliability-play`

Original final remote workflow:

`34060903778` — **PASS**

Delivery diff from `a2e821...` remains limited to:

- `.github/workflows/world-v0-r0d-reliability-retest.yml`;
- `wrangler.jsonc` isolated `reliability_play` environment.

No qualified World V0 product/runtime bytes differ.

### Handoff/documentation branch

`multi-world-r0d-reliability-handoff`

Its head may move only for documentation/evidence continuity. It is not a runtime candidate.

---

## Pass-2 focused evidence branches

These are evidence-only descendants of the frozen delivery and are **not runtime candidates**.

### Live-transport starvation

Branch:

`world-v0-r0d-preowner-starvation-falsifier`

Run:

`34104024218` — **PASS**

Artifact ID:

`10011623838`

Verdict:

`WORLD_V0_R0D_PREOWNER_LIVE_TRANSPORT_STARVATION_PASS`

It stops B input while keeping B WebSocket open. B lease expires exactly after 36 ticks; A remains fresh; same WorldEpoch survives; B resumes fresh input on the same socket.

### Full renderer main-thread stall

Branch:

`world-v0-r0d-preowner-mainthread-falsifier`

Final evidence head:

`4459eddac322cdee057aa8ec6732d01d2b9b4ce6`

Final trustworthy workflow run:

`34105021689` — **PASS**

Artifact ID:

`10012014250`

Artifact ZIP SHA-256:

`cb4c1e67f5f5a5755030ebdfe48da7c798b1dfd3b5fbf0393c2d4edf3eee9384`

Verdict:

`WORLD_V0_R0D_PREOWNER_MAINTHREAD_STALL_PASS`

It blocks B's whole renderer main thread for measured 1400 ms while A runs independently. A sees B actor-local lease and remains alive; same epoch and ActorSession survive; B returns to exact state. Final repeat used direct catch-up; preceding corrected run `34104997239` exercised one bounded same-ActorSession exact rebase.

### Apparatus warning

Run `34104624070` must **not** be interpreted as PASS from its GitHub status.

The original workflow used `node ... | tee ...` without `pipefail`, masking the underlying Node failure. The test also initially demanded recovery without rebase, which was an incorrect semantic assumption. Both apparatus defects were corrected before the final trustworthy run above.

---

## Current evidence boundary after Pass 2

The original global lifecycle defect is now attacked at multiple distinct layers:

- actor starvation with transport loss — I1;
- future-intent causality — I2;
- rAF-only starvation while event loop stays runnable — I3/I3b;
- long transport/authority gap with exact ActorSession rebase — I4b;
- **input starvation while WebSocket stays open** — Pass 2 live-transport falsifier;
- **full renderer main-thread stall beyond the 36-tick lease** — Pass 2 Chromium falsifier.

Current machine-supported conclusions:

- ActorSession lifetime is independent from current WebSocket lifetime after canonical start;
- one actor lease expiry is actor-local containment rather than global epoch death;
- healthy peer/world survives live-socket actor starvation;
- a full browser-main-thread stall can recover either by direct exact catch-up or the bounded same-ActorSession exact-rebase path;
- both bounded browser recovery classes have been observed with zero state-guard mismatch;
- the frozen Worker provenance remained exact during Pass-2 tests.

Important nonclaims remain:

- same-page resume is not persistent player identity across reload/process destruction;
- hosted Linux Chromium is not full Android/mobile lifecycle evidence;
- arbitrary WebSocket close codes remain broader than the currently explicit client close-code resume path;
- Durable Object/Worker process-loss world persistence is not implemented;
- pre-start waiting-peer loss intentionally remains fail-closed.

The Owner human test remains the highest-information next evidence.

---

## Correct next human action — two phases

Do **not** reuse any run ID already written in an older conversation or CI log.

At actual test time:

1. generate a new high-entropy run ID matching `^[A-Za-z0-9_-]{1,20}$`;
2. do not pre-touch that exact run remotely or through CI;
3. use the isolated Worker deep link;
4. Owner in Poland opens it and clicks **Enter first**;
5. wait until Owner reaches `waiting for peer`;
6. only then share the exact same URL with the second real device/person;
7. wait until two-person play is visibly live.

### Phase A — primary old-failure falsifier

Both devices remain foreground.

Play naturally for several minutes with ordinary concurrent movement/camera/shared-prop interaction.

Do **not** background either device during this phase.

Primary question:

> Can ordinary visible play still produce the old global `live -> blank/recovery/waiting -> live` collapse, or does the healthy peer/shared WorldEpoch remain alive even if one browser briefly starves internally?

This phase directly matches the original human failure chronology.

### Phase B — secondary mobile lifecycle falsifier

Only after Phase A is stable:

- Owner remains foreground and observing/playing;
- second device performs one normal background -> foreground cycle;
- do not deliberately kill/reload the tab.

Observe whether the Owner/world remains continuous and how the returning actor recovers.

If the OS naturally discards/destroys the page, preserve that as meaningful product evidence rather than declaring the run invalid.

---

## Result classification

### Old global failure PASS

Phase A remains continuously live without the prior global recovery/new-epoch cycle.

### Strong combined PASS

Phase A is stable and Phase B also returns the same-page actor into the existing world without an equally serious new defect.

### Partial PASS / bounded new client gap

Phase A proves the old global defect is gone, but Phase B reveals a smaller returning-actor/mobile lifecycle issue while the healthy peer/world survives.

### FAIL — old class persists

Ordinary foreground play or a bounded actor disturbance still globally kills/rotates the shared WorldEpoch and drives both clients through the old recovery cycle.

### INVALID

Reserve for actual apparatus/specimen problems such as wrong deployment, provenance mismatch, different run IDs, invalid invite or incompatible/stale client fail-closed before the intended experiment.

---

## Scope freeze

Do not add I5, persistent ActorSession, Durable Object persistence, broader reconciliation, content/jump work, 3-player expansion, lobby redesign, broad runtime refactoring or another generic reliability matrix before the Owner verdict merely for reassurance.

Pass 2 directly covered the most obvious remaining starvation/stall gaps.

Further pre-Owner work is justified only if a **materially different residual uncertainty** can be named and falsified without mutating the frozen candidate.

If not, the correct next answer is:

> teraz najważniejszy jest Twój test

---

## Preserved original artifact identity

Original final GitHub Actions artifact from workflow `34060903778`:

- artifact ID `9997448698`;
- artifact name `world-v0-r0d-reliability-retest-1`;
- ZIP size `54,384 bytes`;
- ZIP SHA-256 `2a2a740d9fe3e9f87602a1704814ef824f0fb716ec8e8c79d1194e441d3942b4`.

`WORLD_V0_R0D_RELIABILITY_EVIDENCE_MANIFEST.md` preserves exact original file-level hashes and compact verdict payloads.

---

## Historical/non-frontier warning

`world-v0-friend-ready-foundation-integration@5dd28a899c4f60c9227f1eb93026f571ced733e3`

remains an abandoned inert branch from a rejected ancestry hypothesis. It is not a frontier.
