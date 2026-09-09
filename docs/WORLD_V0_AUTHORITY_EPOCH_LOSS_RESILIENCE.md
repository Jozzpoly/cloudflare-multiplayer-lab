# World V0 — Authority Epoch Loss Resilience

Status: **DESIGNED FOR FOUNDATION STABILIZATION / NOT YET IMPLEMENTED**

## Why this exists

The 2026-09-09 Owner stress run produced one strong remote failure after an otherwise healthy session:

- a fresh 2-player epoch had started successfully;
- RTT, exact-state guards, correction size and server-late evidence were healthy;
- both active browsers then lost their WebSockets nearly simultaneously with abnormal close `1006`;
- both browsers repeatedly attempted private ActorSession resume against the old epoch;
- the old resume path remained unusable and one client eventually reached `actor_session_resume_exhausted`;
- a later fresh epoch on the same qualified Worker worked normally again.

The exact trigger is **not proven**. The resumed-stayer handoff sequence was subsequently replayed successfully:

- locally;
- on five fresh Cloudflare random-run Durable Objects;
- after 12 create/end/destroy churn cycles (24 distinct epochs) on one remote Durable Object.

A controlled local authority-process reset, however, reproduced a mechanism-equivalent signature:

- both active sockets closed `1006`;
- old private resume tokens became unusable;
- a fresh actor immediately received a new epoch.

Cloudflare documents that Durable Object instances can occasionally be shut down/restarted and active WebSockets terminate when that happens. World V0 currently keeps the active simulation/ActorSession map only in memory and deliberately has no durable reconstruction contract.

Therefore foundation stabilization must not assume that every abnormal transport loss implies that the old ActorSession still exists.

## Non-goals

This bounded repair does **not** add:

- durable persistence of the current Box3D world;
- reconstruction of an exact lost WorldEpoch after Durable Object restart;
- account identity;
- dynamic roster replacement within a deterministic epoch;
- 3+ players;
- cross-room migration;
- generic recovery for arbitrary non-public run keys.

Those are separate architecture frontiers.

## Required invariant

For canonical public Yards (`yard-1`, `yard-2`, `yard-3`):

> An abnormal active transport loss must first attempt exact ActorSession resume. The client may abandon that exact resume only after reachable authority evidence positively proves that the previous `worldEpoch` no longer exists. If the old epoch is gone, the client must recover by joining the same logical Yard fresh instead of exhausting the old token into a FOUNDATION runtime failure.

This deliberately separates **transport uncertainty** from **authority-epoch loss**.

## Authority verdict

After a failed exact ActorSession resume attempt, inspect the existing public room directory with cache disabled.

Given `sourceEpoch = E` and the canonical room record:

### `same-epoch`

Directory is reachable, the room is not `unavailable`, and `room.worldEpoch === E`.

Meaning:
- the authority still reports the old epoch;
- do **not** clear the private token;
- continue bounded exact ActorSession resume.

### `epoch-gone`

Directory is reachable, the canonical room record is authoritative/not `unavailable`, and its `worldEpoch` is either null or differs from `E`.

Meaning:
- the previous authority epoch no longer exists;
- exact ActorSession resume is impossible by contract;
- clear only the stored ActorSession belonging to `E`;
- transition into fresh room recovery for the same Yard.

A different new epoch is also positive evidence that `E` is gone. This is important when both peers recover concurrently: one peer may already have created the replacement epoch before the other performs its verdict check.

### `unknown`

Directory request fails, room is missing, directory status is `unavailable`, or its result cannot be trusted.

Meaning:
- uncertainty is **not** permission to destroy continuity;
- retain the old private ActorSession and continue the existing bounded backoff.

## Recovery transition after `epoch-gone`

When loss of the source epoch is positively confirmed:

1. retire the ActorSession-resume timer/path;
2. preserve the source epoch in evidence;
3. clear the stored ActorSession only for that source epoch;
4. enter a dedicated room-recovery reason, `authority_epoch_lost_recovery`;
5. reset protocol/client state through the existing fresh room-recovery boundary;
6. reconnect to the same `runKey` **without** the old resume token;
7. first recovering peer creates the fresh waiting epoch; the second joins it;
8. when the pair starts, exact-state guards must remain clean.

The old physical world is intentionally lost. UI copy must not claim an exact-state resume after this transition.

## Races that must remain safe

### Exact resume wins first

If the old authority is alive and accepts the token before any `epoch-gone` verdict, exact ActorSession resume completes as today. No fresh recovery occurs.

### Both peers lose authority simultaneously

Both may independently confirm `epoch-gone`.

Expected outcome:
- both clear only their stale old-epoch tokens;
- both attempt fresh recovery to the same Yard;
- first request creates the replacement waiting epoch;
- second request joins it;
- ordinary 2P start follows.

### One peer creates replacement before the other checks

The second peer sees a **different** `worldEpoch`. That is positive proof the old epoch is gone and it fresh-joins the replacement.

### Directory is temporarily unreachable

Neither peer may clear its token merely because the diagnostic channel is unavailable. Existing exact-resume retry/backoff remains active.

### Normal short 1006 with old epoch alive

Directory still reports the same epoch. Existing ActorSession resume remains the only recovery path and must preserve exact state.

## Required causal gates

### A. Current behavior baseline — forced authority-process reset

Real Chromium A+B start a local 2P epoch. Kill the local authority process, restart it with empty in-memory state, keep both browser pages alive.

Current product should reproduce the known weakness:
- dual `1006`;
- repeated old-token ActorSession resume;
- eventual `actor_session_resume_exhausted` or otherwise no automatic shared recovery.

This proves the test actually exercises the failure class.

### B. Candidate authority-loss recovery

Apply the bounded repair only in an ephemeral runner workspace and repeat A.

Required PASS:
- dual `1006` observed;
- at least one failed exact ActorSession resume occurs before fallback;
- reachable directory positively reports source epoch gone;
- both clients record `authority-epoch-lost-confirmed`;
- both transition through fresh room recovery, not exact resume;
- same replacement `worldEpoch` on both clients;
- both receive `world_v0_start`;
- runtimeFailed remains false;
- exact-state guard mismatches remain zero;
- authority/prediction advances for a post-start observation window.

### C. Negative control — old epoch still alive

Force a browser-side transport loss without killing authority.

Required PASS:
- directory reports the same old epoch;
- no `authority-epoch-lost-confirmed` event;
- old private ActorSession resumes exactly;
- same worldEpoch/session identity retained.

### D. Directory unavailable control

During failed exact resume, make `/api/world-v0/rooms` unavailable while authority remains uncertain.

Required PASS:
- no stale-token clearing;
- no fresh room recovery solely because directory is unavailable;
- bounded exact-resume policy remains fail-closed.

### E. Existing stabilization envelope

After the candidate passes A–D:
- resumed-stayer soft-preemption causal gate;
- same-owner live rebound/F5;
- zero-online capacity;
- cross-page Resume;
- full Current Validation.

## Evidence improvements after the blocker

The Owner recording showed that future forensic work would benefit from:

- visible wall-clock UTC/local time plus monotonic `T+` overlay;
- short Yard / WorldEpoch / actor-slot marker;
- authority-instance/generation marker exposed by the server, if possible;
- epoch-scoped provenance for fields such as `lastRecoveredBoundary`.

These should improve observability, not alter recovery semantics, and should be handled after the authority-loss blocker is resolved.
