# World V0 — Authority Epoch Loss Resilience

Status: **IMPLEMENTED / PROMOTED / POST-PROMOTION QUALIFIED**  
Updated: **2026-09-10**  
Promoted product: `fef4a2a4b6007c3e42cbd3b430cb9943343cc970`

## Why this exists

The 2026-09-09 Owner stress run produced a strong failure after an otherwise healthy two-player session:

- both active browsers lost their WebSockets nearly simultaneously with abnormal close `1006`;
- exact-state guards and ordinary play before the event were healthy;
- both browsers repeatedly retried the private ActorSession against the old WorldEpoch;
- the old resume authority no longer existed;
- one client eventually reached `actor_session_resume_exhausted`.

Repeated resumed-stayer handoff tests later passed locally and remotely, including repeated churn on the same Durable Object, so the exact trigger was not proven to be soft-reservation handoff itself.

A controlled authority-process reset reproduced the mechanism-equivalent failure class: both active sockets closed `1006`, the in-memory WorldEpoch/ActorSessions disappeared, and the old private resume tokens could no longer succeed. World V0 deliberately does not persist/reconstruct the exact Box3D WorldEpoch after authority process loss.

## Implemented invariant

For canonical public Yards (`yard-1`, `yard-2`, `yard-3`):

> An abnormal active transport loss first attempts exact ActorSession resume. The client abandons that exact resume only when reachable authority-backed room evidence positively proves that the source `worldEpoch` no longer exists. It then fresh-joins the same logical Yard instead of exhausting a dead token into a FOUNDATION failure.

Transport uncertainty is not treated as proof of authority loss.

## Authority verdict

Given source epoch `E`:

- **same-epoch** — the directory is reachable and still reports `E`; keep the private token and continue exact ActorSession resume;
- **epoch-gone** — the directory is reachable and authoritatively reports no epoch or a different epoch; clear only the stale session for `E` and enter fresh same-Yard recovery;
- **unknown** — the directory is unreachable, missing, unavailable or otherwise untrustworthy; retain the token and continue bounded exact resume.

A replacement epoch created by the other recovering peer is positive evidence that `E` is gone.

## Recovery transition

After an `epoch-gone` verdict the browser:

1. retires the old ActorSession-resume path;
2. clears only the stored ActorSession belonging to the lost epoch;
3. enters `authority_epoch_lost_recovery`;
4. reconnects to the same canonical Yard without the stale token;
5. creates or joins the replacement waiting epoch;
6. starts normally when both peers are present;
7. continues under the existing exact-state guard contract.

The old physical world is intentionally lost. This mechanism is recovery of **service/play continuity**, not exact reconstruction of the lost WorldEpoch.

## Evidence

### Failure-class baseline

`World V0 Authority Reset Browser Baseline` run `34412577662` completed successfully by confirming the pre-repair client ends in the fatal authority-loss outcome after a controlled authority-process reset.

### Candidate and promotion

The bounded candidate was exercised against controlled authority loss, same-epoch long-outage negative control, and the broader stabilization envelope. Broad ephemeral regression run `34424103275` completed successfully.

Promotion workflow:

- run `34426170055` / job `102711755735` — **SUCCESS**;
- product commit `fef4a2a4b6007c3e42cbd3b430cb9943343cc970`;
- message `Recover public Yard after lost authority epoch`.

The product change is bounded to browser recovery logic. It does not alter server physics, Box3D simulation, protocol topology or SimBuild identity.

### Post-promotion requalification

Focused post-promotion run `34426373914` / job `102712379185` — **SUCCESS**:

- two real browsers recover from authority-process loss into one fresh replacement WorldEpoch;
- ordinary 14 s transport loss while authority remains alive preserves the exact old ActorSession/NetEntity and exact rebase;
- exact-state guard mismatches remain `0`.

Full historical Current Validation run `34426331772` / job `102712250503` — **SUCCESS** across the retained R1/R2 lifecycle/recovery envelope.

### Broad adversarial verification

The later pre-Owner campaign challenged the frozen `fef4...` product without runtime drift:

- broad run `34428181101` — **SUCCESS**, all 8 jobs;
- three consecutive authority losses in one live browser pair — **PASS**;
- authority loss while a peer is background-hidden — **PASS**;
- cross-Yard retained-history/capacity pressure — **PASS**;
- four fresh remote Cloudflare Durable Objects — **4/4 PASS**;
- composed local lifecycle/Resume/handoff sequence — **PASS**.

A separate Resume-vs-fresh admission race run `34428538218` also passed. Both legal race outcomes were observed: sometimes private Resume won and fresh admission was rejected; sometimes fresh admission won and rotated the epoch. No split-brain or double authoritative world was observed.

## Explicit nonclaims

This repair does **not** add:

- durable persistence of the current Box3D world;
- reconstruction of an exact lost WorldEpoch after Durable Object restart;
- account/cloud identity;
- dynamic roster replacement inside one deterministic epoch;
- 3+ players;
- cross-room migration;
- generic recovery semantics for arbitrary non-public run keys.

Those remain separate architecture frontiers after the current stabilization safe stop.

## Current posture

The authority-epoch-loss blocker is closed at the automated/causal level. The remaining gate is representative Owner human qualification of the delivered current candidate, including desktop and mobile natural use. If that passes, this mechanism becomes part of the frozen two-player baseline rather than an active reliability frontier.
