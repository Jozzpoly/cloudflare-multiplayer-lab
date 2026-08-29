# Gate 4 — Authoritative Shared Simulation Lab

## Gate 4A — Fixed simulation substrate

**Status:** PASS / FREEZE CANDIDATE  
**Validated runtime:** 2026-08-29  
**Branch:** `gate-4-shared-simulation-lab`  
**Draft PR:** #4

## Canonical Gate 4 question

Can one Cloudflare Durable Object act as a useful server for a small continuous physically shared world for roughly 1–5 mobile players, with measurable prediction/reconciliation, bounded network stress and an acceptable personal-session cost model?

Gate 4 remains a multi-stage research program. Gate 4A answers only the fixed-authoritative-simulation substrate question; it does not establish shared rigid-body physics or final vehicle-simulation suitability.

## Gate 4A question

Can the existing Neon Salvage world move from input-driven integration to a real fixed-step authoritative server simulation without hiding timing failures, while remaining mobile-playable and reproducible enough for later A/B experiments?

**Verdict: yes for the tested 1–2 client mobile workload.** The central hypothesis survived repository validation, Cloudflare deployment and real mobile runtime evidence.

## Fixed contract

The baseline deliberately separates three cadences:

- authoritative simulation: **20 Hz** / 50 ms fixed step,
- authoritative snapshot broadcast: **10 Hz**,
- client input transport: **~15 Hz** baseline heartbeat.

Receiving an input message does not advance world time. Input only updates the latest accepted control state and sequence number. World state advances only inside the fixed simulation loop.

The active Durable Object uses a fixed-step accumulator with bounded catch-up:

- at most 4 simulation steps per pump,
- excess backlog is counted as dropped ticks,
- callback drift and tick execution cost are sampled,
- the timer starts with the first player and stops after the last player leaves,
- active fixed-tick sessions are intentionally non-hibernating; idle sessions can return to a hibernatable lifecycle.

## Mobile input safety

Control input is a 600 ms lease. If no fresh accepted input arrives, movement becomes neutral and queued dash is cleared. Runtime background/app-switch testing confirmed that stale held input did not leave the player running away after the browser was backgrounded for several seconds.

Gate 4A closure also makes sequence semantics explicit: input with `seq <= lastInputSeq` is ignored. This prepares later application-level impairment/reordering tests without changing the normal WebSocket/TCP model.

## Deterministic run/reset

A run has an explicit 32-bit seed and run id.

- pickup placement uses a deterministic PRNG,
- player spawn derives from `seed + playerId`,
- LAB can reset the shared run to a supplied seed,
- reset clears motion, scores, combos, input state and scheduler counters,
- closure hardening resets active-run duration with the run,
- DO reconstruction restores the numeric run serial from the persisted run id so later resets remain monotonic.

Runtime evidence visibly confirmed a reset to seed `5`, including tick/score reset and continued play. A clean same-seed-twice visual A/B was not captured, so identical-layout replay remains source-supported rather than independently closed by recording. This limitation does not block the central Gate 4A fixed-simulation verdict.

## Measurement contract

Server telemetry includes target simulation/snapshot frequencies, active players, tick/snapshot sequence, tick execution p50/p95, scheduler drift p50/p95, dropped/catch-up ticks, inputs/sec, snapshots/sec, approximate application bytes/sec and active-run duration.

Client telemetry includes RTT p50/p95, ping-derived snapshot age, snapshot inter-arrival p95, time-aware prediction correction p50/p95, rendered FPS, input messages/sec and approximate application bytes/sec.

These are falsification measurements, not production SLOs.

## Runtime evidence

Two supplied mobile recordings were reviewed against the Gate 4A contract.

Observed in the real mobile run:

- Gate 4A remained playable with two participants visible in the shared world;
- simulation cadence tracked the 20 Hz target;
- server snapshots stayed about 10/s and the client received about 9.6–10.4/s;
- dropped ticks remained 0 and catch-up remained 0 during normal play;
- tick drift p95 was normally 0 ms with a short ~5 ms transient after reset;
- RTT was roughly 23–28 ms p50/p95 in the cleaner captured run;
- snapshot age was roughly 11–13 ms and snapshot-gap p95 roughly 102–103 ms;
- local prediction correction was roughly 3.8–4.4 px p50 and 5.9–6.2 px p95, with no obvious normal-play snapping;
- the observed client sent roughly 15 inputs/s;
- background/resume produced no sustained stale-input runaway and the session recovered after a transient latency spike;
- reset to seed `5` visibly reset run state and continued cleanly.

One observation remains deliberately unclassified: server input rate was roughly 16–17/s while two participants were visible, lower than ~30/s if both phones were foregrounded and heartbeating at ~15/s. The recording does not establish the second phone's timer/background state, so this is deferred to a future controlled pressure test rather than treated as a failure.

## Automated and closure evidence

Earlier runtime-candidate heads passed the normal repository toolchain and Cloudflare Connected Build, including `ddcbe3e0874e9c54d915bacfb7eca9d56621c7e2` with Cloudflare Version ID `ee0508db-22cb-46de-b6b4-6adcbcb67a8d`.

Closure hardening source commit: `0f77f0b729c423e08f67ddc97c2d40090bbb48d3`.

That source patch was applied through exact one-occurrence assertions and passed the full `npm run check` path before commit. Net source change from the pre-closure candidate is only `src/index.ts` (+7/-2):

1. reject stale/duplicate input sequences,
2. increment tick before executing the corresponding simulation step,
3. reset active-run duration on run reset,
4. reconstruct run serial from restored run id.

The workflow used only to transport that patch removed itself in the same source commit and is not part of the final tree.

## Gate 4A criteria disposition

1. Repository validation / Wrangler dry-run — **PASS**.
2. Cloudflare build/deploy acceptance with `WORLD` binding — **PASS**.
3. Real mobile playability after authority-model change — **PASS**.
4. World advancement owned by fixed simulation rather than input callbacks — **PASS**.
5. Near-target simulation/snapshot cadence without sustained dropped-tick growth in the observed 1–2 client run — **PASS**.
6. Prediction correction bounded enough to avoid normal-play snapping — **PASS for observed baseline conditions**.
7. Background/throttled stale-input neutralization — **PASS**.
8. Deterministic seed/reset mechanism — **PASS by source contract; same-seed-twice visual A/B not independently captured**.

## Gate 4A non-claims

A PASS does not establish:

- shared rigid-body physics,
- player-player or player-object physical interaction,
- vehicle dynamics,
- 3–5 real-device pressure behavior,
- bad-network robustness,
- 20 Hz as the final best cadence,
- low cost at scale,
- suitability as a full vehicle-physics server.

## Freeze boundary

Once the final owner-authored closure head passes standard GitHub CI and Cloudflare deployment and the exact validated tree is promoted to `main`, Gate 4A is frozen as the control specimen.

The next separate candidate stage is Gate 4B: introduce one genuinely shared authoritative dynamic body (Reactor Core) and test multi-client physical impulse interaction. Gate 4B must not be folded into this closure stage.

## Known hardening debt

The repository still has no committed package lock. Exact direct tool versions remain pinned, but dependency locking must be normalized before this lab is treated as a reusable production template.
