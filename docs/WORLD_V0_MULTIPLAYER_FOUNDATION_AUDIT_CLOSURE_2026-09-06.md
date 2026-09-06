# World V0 Multiplayer Foundation — audit closure / integration readiness

Date: 2026-09-06

Canonical audit branch at closure preparation: `world-v0-multiplayer-foundation-audit`
Evidence head before this document: `6c6469cab921365b31bed78fd458c69ae2f3279c`
Original fresh-handoff checkpoint: `701fe2a1164cf11787f58c8cc65ccdb0204e760c`

This document closes the bounded Multiplayer Foundation audit as a technical discovery/qualification phase. It is not a production promotion, deployment authorization, public-room qualification, or claim that the integration candidate already exists.

## Decision

The audit has reached diminishing returns as an isolated proof campaign. The remaining high-value work is no longer another generic foundation probe; it is selective integration into a fresh candidate based on the live product source, followed by real shared-play/browser evidence and Owner judgement.

Do not merge or cherry-pick the audit branch wholesale. The live product branch `world-v0-public-room-r0` and this audit branch have diverged substantially. Reconstruct the minimum candidate semantics deliberately on top of the then-current product source.

## EARNED — bounded claims

### Connection/session/world lifecycle

- A transport connection is not the same thing as the actor session.
- A stale/disconnected actor can remain as the same physical body in the same `WorldEpoch` while its input becomes neutral after the bounded lease.
- A healthy peer and the shared physical world can continue while one actor is stale.
- The returning connection can rebind to the same actor/session without rotating `WorldEpoch` in the bounded continuity specimen.
- The current product behavior — socket close/error or one input lease expiry killing the entire epoch — is therefore not a necessary foundation constraint.

Evidence: `scripts/world-v0-continuity-do-probe.mjs`, `scripts/world-v0-stale-actor-containment-probe.mjs`.

### Short correction versus full rebase

Current client history is intentionally bounded:

- recording segment: 8 ticks;
- retained history: 24 ticks;
- guaranteed correction rewind across segment phases: 25 ticks (~416.7 ms at 60 Hz);
- best phase-dependent rewind: 32 ticks (~533.3 ms);
- 33 ticks is outside the current history envelope;
- input lease boundary: 36 missing ticks / 600 ms.

The correct architectural response is not to grow local history indefinitely. Short in-connection corrections use bounded local recording history; loss/rejoin beyond that boundary uses an explicit full-state rebase.

The stale-actor specimen creates a same-build full-state rebase at boundary 300, verifies exact state at the seed, and continues exactly for 120 ticks.

Evidence: `scripts/world-v0-history-horizon-audit.mjs`, `scripts/world-v0-stale-actor-containment-probe.mjs`.

### Finalized Box3D recording bytes as exact same-build rebase substrate

The earlier `snapshot deserialization failed` result was causally localized. The failed wire specimen copied the recording buffer before `b3World_StopRecording()`. Pinned Box3D finalization appends the trailing geometry registry and backpatches the header.

Observed audit specimen:

- active/unfinalized recording: 30,489 bytes, FNV-1a `e733ba72`;
- finalized recording: 32,313 bytes, FNV-1a `311a0929`;
- finalized bytes survive native recording destruction/source-buffer removal;
- byte ingress is faithful;
- replay seed is exact;
- 180/180 post-seed ticks continue exactly.

The failed unfinalized replay remains negative evidence. The earned claim is only that finalized recording bytes are viable as a same-build ephemeral wire/rebase substrate.

This is not a durable save format, cross-build migration format, or public compatibility promise.

Evidence: `scripts/world-v0-box3d-raw-seed-roundtrip-audit.mjs` plus the pinned binding/source build used by the continuity workflow.

### Authority process-loss reconstruction feasibility

A three-process specimen established bounded same-build reconstruction:

1. producer creates a finalized checkpoint and exits;
2. independent uninterrupted oracle computes expected continuation;
3. fresh process loads only the checkpoint envelope, rotates epoch, and continues.

Observed checkpoint: 32,313 bytes at tick 240; restore guard exact; 180/180 continuation exact; incompatible `simBuildId` rejected before native restore.

This establishes feasibility and a compatibility boundary. It does not require production checkpoint persistence in the next candidate.

Evidence: `scripts/world-v0-authority-restart-checkpoint-audit.mjs`.

### Future-intent supersession semantics

The current product protocol freezes the first different value accepted for a future tick as a `conflict`. The audit established a safer bounded candidate:

- a higher monotonic `batchSeq` may supersede a still-unconsumed future record;
- consumed history is immutable;
- identical retransmission remains `duplicate_same`;
- an older/stale batch cannot roll back a newer future intent;
- release/turn changes can replace stale prefetched movement;
- jump remains one-shot;
- peer-visible accepted/superseded records converge with authority semantics.

No timing constant, `maxFutureTicks`, or batch size needs to increase to obtain this semantic property.

Evidence: `scripts/world-v0-future-intent-supersession-audit.mjs`.

### Input scheduler topology

Current client authors the intended-input timeline through prediction advancement driven by `requestAnimationFrame`. The audit separated render cadence from logical input authorship.

With the current lead=8 and the same ~173 ms RTT model:

- 60 FPS rAF: 0% late;
- 40 ms render cadence: ~16.7% late;
- 120 ms render cadence: ~69.4% late;
- fixed 60 Hz logical authorship scheduler independent of rAF: 0% late.

The same candidate deliberately does not erase unrelated limits:

- ~248 ms RTT remains under-led at lead=8;
- 750 ms full same-main-thread event-loop stall still exceeds the 36-tick lease;
- 400 ms stall remains below lease expiry in the model.

Therefore the earned design statement is: canonical input authorship should be decoupled from render cadence. This does not imply that a Web Worker is required.

Evidence: `scripts/world-v0-input-scheduler-topology-audit.mjs`, `scripts/world-v0-multiplayer-timing-envelope-audit.mjs`.

### Locality scope discrimination

Current fixed-room discovery is a real placement hazard under current Cloudflare Durable Object placement semantics:

- `/api/world-v0/rooms` dereferences the gameplay Durable Object for each fixed room and fetches `/status`;
- host UI polls that directory every 1.2 s;
- staging R0 remote qualification explicitly fetches the directory;
- therefore fixed `yard-1/yard-2/yard-3` instances can be materialized by metadata/CI traffic before a representative player request.

The audit also established a bounded core lane:

- a valid unique `?run=...` invite/deep-link path does not poll the fixed-room directory before gameplay WebSocket join;
- gameplay authority itself rejects active/full joins, so directory occupancy is discovery/UX rather than the correctness authority.

Therefore fixed public rooms are still NOT locality-qualified, but they do not need to block a locality-sensitive unique-run shared-play candidate.

Do not build a directory registry/control plane solely to close this foundation audit.

Evidence: `scripts/world-v0-directory-locality-hazard-audit.mjs` v2, CI PASS at `6c6469cab921365b31bed78fd458c69ae2f3279c`.

## Integration readiness — minimum candidate semantics

Build the integration candidate fresh from the live product source. Treat the following as one coherent behavioral contract, but integrate in independently testable stages.

### I1 — actor/session continuity and stale containment

Must provide:

- stable actor/session identity separate from WebSocket connection identity;
- resumable/rebind token scoped to the current world/session;
- socket loss does not destroy the actor or rotate the whole world epoch;
- after `inputLeaseMissingTicks`, only the stale actor receives neutral intent;
- healthy actors/shared physics continue;
- reconnect may reclaim only the matching stale actor/session;
- duplicate/live connection races must not permit two connections to drive one actor simultaneously.

Do not add authority persistence yet.

### I2 — future-intent supersession

Integrate the qualified unconsumed-tick semantics into the real scheduled input buffer and peer relay:

- `accepted`, `duplicate_same`, `superseded`, `late`, `before_start`, `too_future`;
- stale batch rejection remains monotonic;
- no supersession of already-consumed ticks;
- peer relay must include effective superseded records exactly as authority accepted them.

Do not increase lead or future horizon as compensation.

### I3 — logical input authorship scheduler

Separate:

- canonical intended-input timeline generation/send cadence; and
- render/prediction stepping.

The logical scheduler may initially remain on the browser main thread. It must be independent of rAF while the event loop is runnable. Prediction continues to consume the same canonical intended-input timeline.

On an input transition, supersede authored-but-unconsumed future records rather than waiting for the prefetched horizon to drain.

Do not add a Worker unless real browser evidence after I1-I3 shows a future-expensive problem that the Worker specifically solves.

### I4 — explicit exact rebase gate

Before claiming robust resume after loss beyond local history, provide a real client/authority same-build full-state rebase path.

The preferred currently-earned substrate is a finalized Box3D recording payload guarded by `simBuildId`/simulation identity. However, current production `box3d.js` does not expose the required raw-copy/CreateFromBytes API; the audit proof obtained it through a pinned C++ binding patch + rebuild.

Therefore I4 must be isolated from I1-I3. Do not silently vendor or fork a new physics runtime as a side effect of the session refactor.

Until I4 passes on the real browser/runtime path, the candidate may claim improved transient connection/session continuity but must not claim exact same-epoch recovery from arbitrary history loss/new client state.

## Explicitly deferred — not blockers for the first integration candidate

### Authority restart persistence

Feasibility is earned. Production storage/checkpoint cadence, crash atomicity, restoration policy and cost are deferred until the shared world actually requires durable process-loss survival. A worker/process restart may still rotate/start a new epoch in the first candidate.

### Worker-based browser scheduler

Not required by current evidence. Same-thread fixed logical scheduling solves rAF cadence starvation but not a fully blocked event loop. Stale-neutral containment + explicit rebase provide a different recovery boundary. Revisit only with real device evidence.

### Fixed-room directory/control plane

Fixed rooms retain the first-materializer locality debt. Use unique run IDs for locality-sensitive candidate qualification. Do not construct KV/registry/metadata infrastructure merely to make the audit cosmetically green.

### RTT tuning

The ~248 ms modeled/observed envelope remains under-led at lead=8. Do not raise `predictionLeadTicks` before measuring representative-player RTT on a locality-safe unique run. Locality and RTT budget must be separated causally.

### Cross-build save/migration format

Raw Box3D recording bytes are same-build evidence only. No compatibility claim across `simBuildId` changes.

## Negative evidence that must survive integration

- unfinalized Box3D recording bytes fail deserialization and are not valid wire seeds;
- fixed public-room directory traffic can pre-materialize gameplay authority;
- lead=8 remains insufficient for the tested/modelled ~248 ms RTT envelope;
- a same-main-thread logical scheduler cannot produce input while the event loop is blocked for 750 ms;
- local recording history does not support arbitrary rewind; its current guaranteed bound is 25 ticks;
- the current production lifecycle still kills the world on socket loss/lease expiry until I1 is implemented;
- exact full-state browser rebase is not a production feature until I4 is integrated and qualified.

## Audit exit condition

The isolated Multiplayer Foundation audit is technically complete when this closure is accepted by live CI/provenance and no contradictory evidence appears. Further generic hardening would now risk infrastructure gravity.

The next execution phase is **selective integration + real shared play**, not another open-ended audit.

The first integration candidate should be created on a new branch from the then-current live product source. Do not deploy it automatically. Validate each stage locally/CI, then run a locality-safe unique-run browser/shared-play qualification. Owner judgement becomes first-class again once a real candidate is playable.

## Non-claims

This closure does not claim:

- production/staging promotion;
- public fixed-room locality;
- arbitrary network-condition support;
- authority process-loss persistence;
- background-tab/OS suspension continuity;
- exact rebase in the current product runtime;
- a Web Worker implementation;
- a durable save format;
- Owner-qualified feel, fun or shared-world UX.
