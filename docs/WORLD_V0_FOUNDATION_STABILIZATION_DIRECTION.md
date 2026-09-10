# World V0 — Foundation Stabilization Direction

Status: **FINAL POLISH / PRE-OWNER REQUALIFICATION**  
Updated: **2026-09-10**  
Product anchor under polish: `fef4a2a4b6007c3e42cbd3b430cb9943343cc970`  
Polish branch: `world-v0-foundation-polish-closure`

## Execution order

Do not skip forward:

1. **Stabilize the current two-player multiplayer foundation.**
2. **Challenge it broadly and independently.**
3. **Polish, repair, clean and update the canonical project spine.**
4. **Run final representative Owner qualification.**
5. **Reach a deliberate safe stop.**
6. **Only then perform broader repository/branch consolidation and formalize the next long-horizon Multi_World direction.**

New gameplay/product features are not the current frontier.

## What the September stabilization campaign found and closed

The hostile Owner tests exposed real foundation debt. The following items are now repaired and causally requalified rather than merely planned.

### 1. Dormant reservations no longer own public capacity indefinitely — CLOSED

Current public-Yard semantics distinguish connected capacity, protected reconnect reservations, soft/replaceable reservations and fully vacant resumable epochs.

A dormant ActorSession may retain private resume authority while unused, but it cannot indefinitely prevent unrelated people from using the Yard. Because the current simulation topology is fixed at two actors, replacement is performed by an explicit WorldEpoch handoff rather than unsafe in-epoch actor mutation.

### 2. Same-owner refresh/live rebound — CLOSED

Possession of the exact private ActorSession token can atomically supersede that same actor's older transport. A foreign profile without the token cannot claim it.

### 3. Cross-Yard capacity exhaustion — CLOSED

Repeated retained history across Yard 1/2/3 no longer permanently exhausts the public room pool. The broad adversarial campaign explicitly accumulated history across all three Yards and kept capacity recoverable.

### 4. Gameplay keyboard stealing text input — CLOSED

Focused UI controls own their keyboard events before gameplay WASD/Space handlers. Real Chromium physical-key input was verified with `wasdWASD` remaining intact in the callsign field.

### 5. Join/lifecycle/network failure copy — CLOSED TO CURRENT SCOPE

The entry shell now classifies capacity-full, protected lifecycle state, unavailable Yard, connection/handshake failure and unknown room state separately instead of collapsing them into one generic network message.

### 6. Authority-process / WorldEpoch loss — CLOSED AT AUTOMATED CAUSAL LEVEL

The Owner recording exposed a fatal dual-`1006` path where both clients could keep retrying an ActorSession that no longer existed and eventually reach `actor_session_resume_exhausted`.

The promoted product now:

- first tries exact private ActorSession resume;
- keeps that path when the old epoch is still alive or authority evidence is uncertain;
- only when reachable authority proves the source epoch is gone, clears the stale token and fresh-joins the same logical Yard;
- allows both peers to converge on one replacement epoch.

Product commit: `fef4a2a4b6007c3e42cbd3b430cb9943343cc970`.

## Verification completed after the last Owner failure

The frozen product was challenged beyond its normal regression suite before polish began.

Broad adversarial run `34428181101` completed **SUCCESS / 8 of 8 jobs**. It covered:

- three consecutive authority losses in the same live browser pair;
- authority loss with one peer background-hidden;
- retained-history pressure across all public Yards;
- four fresh remote Cloudflare Durable Objects;
- same-owner live rebound;
- physical keyboard ownership;
- soft reservation and automatic handoff;
- zero-online capacity semantics;
- resumed-stayer composition;
- direct-link exact Resume;
- directory-outage fail-closed Resume.

Separate race run `34428538218` completed **SUCCESS** and exercised near-simultaneous private Resume versus unrelated fresh admission. Both legal winner orders occurred without split-brain or double authority.

No new product blocker was found in these passes.

## Current polish findings

The polish phase has already found real non-runtime debt:

- canonical `npm run check` did not include the new authority-epoch-loss and join-failure-clarity modules/smokes; this has been repaired on the polish branch;
- `npm audit --omit=dev` reports **0 production vulnerabilities**;
- three high-severity npm findings exist only in the dev toolchain through `wrangler -> miniflare -> sharp`;
- isolated upgrade from Wrangler `4.127.1` to `4.130.0` passed the full repository check but did **not** remove those alerts, so no cosmetic toolchain churn is justified yet;
- several canonical documents were materially stale and are being refreshed in this phase.

## Current product identity

Physics/simulation provenance remains intentionally unchanged by admission/lifecycle repairs:

- contract `shared-yard-v0-contract-v14-jump-delivery-persistence`;
- authority `shared-yard-v0-authority-v11-jump-delivery-persistence`;
- browser sim `shared-yard-v0-browser-sim-v10-jump-delivery-persistence`;
- browser UI `shared-yard-v0-browser-ui-v19-jump-delivery-persistence`;
- protocol `shared-yard-v0-scheduled-input-v3-supersession`;
- state guard `shared-yard-v0-f32-state-v1`;
- SimBuild `shared-yard-v0-sim-cd8edc169f791a64`.

Admission/session shell identity:

- public room entry `world-v0-public-room-entry-r3-presence-capacity`;
- public room directory `world-v0-public-room-directory-r4-vacant-capacity`;
- session continuity `world-v0-session-continuity-r3-live-rebind`;
- join failure clarity `world-v0-join-failure-clarity-v1`;
- authority epoch-loss recovery `world-v0-authority-epoch-loss-v1`.

## Delivered Owner candidate

The current qualified-play Owner candidate is deployed to:

`https://cloudflare-multiplayer-lab-qualified-play.jozzpoly.workers.dev/world-v0/`

Delivery run `34426803131` / job `102713664761` — **SUCCESS**.  
Cloudflare Version ID: `d62c2e72-c4d9-4124-8847-85815d715ff1`.

The delivery workflow verified protected product bytes against `fef4a2a4...` and ended with `HUMAN_DURABLE_OBJECTS_UNTOUCHED_BY_WORKFLOW`.

## Remaining blocker before safe stop

One gate remains deliberately human:

> representative Owner adversarial play of this exact delivered candidate, including desktop×desktop and mobile use.

The important natural behaviors are ordinary play/smoothness, F5/live takeover, close/reopen Resume, Yard cycling/capacity pressure, text-entry ownership, error clarity, background/return and recovery if a real transport/authority event occurs.

Small bounded jump/contact feel imperfections remain debt, not automatically a reliability-front reopening unless they again dominate human play.

## Safe-stop requirement

If the final Owner qualification passes, stop before opening 3+ players or another major architecture frontier.

The safe stop should then include:

- frozen exact product/runtime and delivery anchors;
- refreshed Current State / takeover spine;
- preservation of decisive evidence and issue #8 checkpoints;
- classification of workflows into retained reusable gates versus consumed one-shot apparatus;
- controlled branch archaeology and cleanup — no mass deletion;
- explicit preservation of evidence/archive/donor provenance;
- only after that, formal review of Project Soul and the longer-term role of this repository as a multiplayer systems laboratory / reusable core.

The previously observed branch count was already well above 150. Branch reduction is therefore a real post-freeze task, but destructive cleanup remains deferred until the final Owner gate establishes the baseline we are preserving.

## Guardrail

The goal is not perfection. Stabilization ends when the two-player foundation is trustworthy enough that remaining imperfections are bounded debt rather than reasons to distrust the multiplayer core. The broad adversarial campaign has reached that automated stop condition. Final human qualification is now the remaining factual gate before safe stop.
