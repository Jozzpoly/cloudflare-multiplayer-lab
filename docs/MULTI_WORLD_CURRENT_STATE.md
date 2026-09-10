# Multi_World — Current State

Status: **CURRENT STABILIZATION TRUTH / FINAL OWNER GATE PENDING**  
Grounded: **2026-09-10**  
Current product anchor: `fef4a2a4b6007c3e42cbd3b430cb9943343cc970`  
Polish branch: `world-v0-foundation-polish-closure`

This document answers **what is true now**. It does not replace [`MULTI_WORLD_PROJECT_SOUL.md`](MULTI_WORLD_PROJECT_SOUL.md), which remains the durable statement of project intent. During this stabilization closure, exact product/evidence anchors and newer issue #8 checkpoints outrank older main-branch documentation.

---

## 1. Fast state

Multi_World currently has a strong, heavily challenged **two-player Shared Yard multiplayer foundation**:

- one server-authoritative Box3D physical world;
- responsive browser-side prediction/replay;
- scheduled canonical input;
- exact f32 state guards;
- acknowledgement-driven jump delivery;
- same-browser-profile ActorSession continuity;
- public Yard directory with connected/protected/soft/vacant capacity semantics;
- same-owner live F5/new-tab rebound;
- demand-driven fresh-epoch handoff when dormant capacity is needed;
- bounded automatic recovery when the in-memory authority WorldEpoch is positively proven gone;
- browser and mobile-oriented entry/control shell;
- clearer separation of capacity/lifecycle/transport join failures.

The active goal is **not another feature**. We are in final polish and documentation cleanup before one representative Owner requalification. If that passes, the project should reach a deliberate safe stop.

---

## 2. Hierarchy of truth during this closure

Use this order:

1. exact product source `fef4a2a4b6007c3e42cbd3b430cb9943343cc970` and its successful qualification evidence;
2. latest issue #8 stabilization checkpoints — especially authority-loss checkpoint `5611456843` and broad adversarial checkpoint `5611643968`;
3. this Current State document;
4. `MULTI_WORLD_PROJECT_SOUL.md` for durable intent;
5. `MULTI_WORLD_TAKEOVER_INDEX.md` for compact operational startup;
6. older R0/R1/R2/handoff documents as provenance only.

`main` still contains the older integrated R2-era canonical history. It must not silently override the newer unmerged stabilization product simply because it is the default branch. A future safe-stop integration decision will reconcile that deliberately.

---

## 3. Exact current product and delivery anchors

### Product source

`fef4a2a4b6007c3e42cbd3b430cb9943343cc970`

Message:

`Recover public Yard after lost authority epoch`

The authority-loss promotion changed browser recovery behavior only. Server physics, deterministic topology and SimBuild identity did not change.

### Current qualified-play Owner candidate

URL:

`https://cloudflare-multiplayer-lab-qualified-play.jozzpoly.workers.dev/world-v0/`

Delivery:

- run `34426803131` / job `102713664761` — **SUCCESS**;
- Cloudflare Version ID `d62c2e72-c4d9-4124-8847-85815d715ff1`;
- artifact `10132969847`;
- digest `sha256:0abc40bf613c7e503d4084f2eeac08475b56404dee5d66b0e617ec948fdf4639`;
- delivery ended with `HUMAN_DURABLE_OBJECTS_UNTOUCHED_BY_WORKFLOW`.

### Runtime identity

Simulation/physics identity remains:

- contract `shared-yard-v0-contract-v14-jump-delivery-persistence`;
- authority `shared-yard-v0-authority-v11-jump-delivery-persistence`;
- browser sim `shared-yard-v0-browser-sim-v10-jump-delivery-persistence`;
- browser UI `shared-yard-v0-browser-ui-v19-jump-delivery-persistence`;
- protocol `shared-yard-v0-scheduled-input-v3-supersession`;
- state guard `shared-yard-v0-f32-state-v1`;
- SimBuild `shared-yard-v0-sim-cd8edc169f791a64`.

Current admission/lifecycle shell identity:

- session continuity `world-v0-session-continuity-r3-live-rebind`;
- public room entry `world-v0-public-room-entry-r3-presence-capacity`;
- public room directory `world-v0-public-room-directory-r4-vacant-capacity`;
- join failure clarity `world-v0-join-failure-clarity-v1`;
- authority epoch-loss recovery `world-v0-authority-epoch-loss-v1`.

---

## 4. What the two-player foundation has earned

Within the current fixed-2P envelope, evidence supports:

- `60 Hz / 4 substeps` deterministic Box3D simulation;
- two player actors plus shared dynamic props;
- exact state comparison across authority/client prediction;
- canonical scheduled input with a 36-tick actor-local missing-input lease;
- bounded prediction history and exact authority recording rebase;
- acknowledgement-driven discrete jump delivery instead of a fixed temporal jump window;
- same-WorldEpoch / same-ActorSession recovery for recoverable transport failures;
- bounded pre-start ambiguity recovery;
- committed-start recovery when one browser misses the start transition;
- same-profile room-list and direct-link Resume;
- same-owner live rebound while the old socket is still connected;
- foreign profiles cannot claim another ActorSession without its private token;
- public presence distinguishes connected, protected reserved, soft reserved and fully vacant resumable states;
- dormant histories no longer permanently own public capacity;
- fresh demand against a soft reservation rotates the fixed deterministic epoch instead of mutating one actor in place;
- the still-connected old peer automatically re-enters the same logical Yard as a fresh actor after that handoff;
- retired old-epoch tokens fail closed;
- fully vacant assembled epochs remain resumable to a valid private token, but a fresh outsider may claim the unused public capacity first;
- near-simultaneous Resume-versus-fresh races resolve to one authority-valid winner without split-brain;
- if an abnormal transport loss occurs but authority still reports the same epoch, exact ActorSession resume remains the path;
- if exact resume fails and reachable authority positively proves the source epoch is gone, canonical public-Yard clients fresh-recover into one replacement epoch instead of exhausting a dead token;
- if authority evidence is unavailable/uncertain, continuity is not destroyed merely because of uncertainty;
- W/A/S/D text input ownership is protected from gameplay handlers;
- join failure copy can distinguish capacity, lifecycle protection, unavailable Yard, transport/handshake and unknown-state cases.

---

## 5. Current lifecycle and capacity contract

### Actor transport versus ActorSession

WebSocket transport lifetime and ActorSession lifetime are separate. A private resume token owns only its exact ActorSession.

### Active all-transport grace

When an active two-player epoch loses all transports, the authority keeps the neutralized in-memory epoch alive for approximately 20 seconds (`20 * 60` ticks). Historical cartography still establishes preservation through 19 s and retirement after roughly 21 s.

### One-player waiting room

A pure one-player pre-start waiting room remains fail-closed on disconnect. It does not hold a long-lived ambiguous two-player commitment.

### Fully assembled pre-start ambiguity

Once both ActorSessions exist, a bounded ambiguity window allows exact Resume because authority cannot know whether the final browser `ready` intent was successfully delivered before transport loss. Protocol start still requires both players ready and both transports live.

### Protected reservation

After one active actor disconnects, its private session remains protected through the existing recovery horizon. A stranger cannot preempt that seat yet.

### Soft reservation

After that protected horizon, the dormant exact session may still resume while unused, but it no longer has the right to block unrelated demand indefinitely.

### Demand-driven handoff

A fresh outsider requesting a soft-only active Yard retires the old fixed-2P WorldEpoch with a recoverable handoff and starts a fresh epoch for the same logical Yard. This avoids unsafe in-epoch dynamic roster replacement.

### Fully vacant resumable epoch

If both assembled actors are disconnected, there are zero active humans. Private Resume remains valid if it wins the race, but dormant history does not own public capacity. A fresh admission may retire the unused epoch and become the first actor in a fresh one.

### Authority-process / epoch loss

For canonical public Yards only:

1. abnormal active transport loss first attempts exact ActorSession Resume;
2. if authority still reports the same source epoch, exact Resume continues;
3. if authority state is uncertain, exact Resume remains fail-closed and the token is retained;
4. only positive reachable evidence that the source epoch is gone allows stale-token retirement;
5. the browser then fresh-joins the same logical Yard;
6. both recovering peers converge on one replacement epoch.

The old physical world is not reconstructed.

---

## 6. Latest qualification and adversarial evidence

### Authority-loss promotion

- broad ephemeral candidate regression `34424103275` — **SUCCESS**;
- promotion `34426170055` / job `102711755735` — **SUCCESS**;
- promoted product `fef4a2a4...`.

### Post-promotion verification

- focused post-promotion run `34426373914` — **SUCCESS**;
- full Current Validation `34426331772` — **SUCCESS**.

### Broad adversarial campaign

Run `34428181101` — **SUCCESS / 8 of 8 jobs**.

It included:

- three repeated authority losses in one persistent browser pair;
- authority loss while one peer was background-hidden;
- retained history across all three public Yards without capacity exhaustion;
- four fresh remote Cloudflare Durable Objects;
- same-owner live rebound;
- real keyboard text ownership;
- soft reservation automatic handoff;
- zero-online capacity release;
- resumed-stayer composition;
- direct-link exact Resume;
- directory-outage fail-closed Resume.

A separate authority race run `34428538218` — **SUCCESS** — observed both legal winner orders for private Resume versus unrelated fresh admission and no split-brain.

This broad phase reached its automated stop condition: additional combinations stopped producing new product failure classes.

---

## 7. Current polish findings

### Canonical validation coverage

The standard `npm run check` previously omitted the new authority-epoch-loss and join-failure-clarity modules/smokes. The polish branch now includes them in `check:client`, so the ordinary repository-green signal again covers the current stabilization product.

### Dependency/toolchain security

`npm audit --omit=dev` reports **0 production vulnerabilities**.

Three high-severity alerts remain in the development toolchain through:

`wrangler -> miniflare -> sharp`

Current graph:

- Wrangler `4.127.1`;
- Miniflare `5.20260828.0-alpha`;
- sharp `0.35.2`.

An isolated upgrade to Wrangler `4.130.0` passed the complete repository validation but retained the same three dev-only findings (`sharp 0.35.2`). Therefore no toolchain change is being made merely to move a version number; this remains bounded dev-dependency debt pending an upstream graph that actually removes the advisories.

### Documentation

The old Current State, baseline gate and authority-loss design documents had become materially stale. They are being refreshed in the polish branch before Owner requalification.

---

## 8. Explicit nonclaims / remaining boundaries

Do not promote these into capabilities:

- no durable reconstruction of a lost Box3D WorldEpoch;
- no account/cloud identity or cross-device private session transfer;
- no persistent continuously-open-world architecture;
- no arbitrary dynamic membership inside one epoch;
- no 3+ player scalability yet;
- no seamless MMO-style actor succession;
- no guarantee through arbitrary permanent network loss;
- no guarantee that every mobile OS/radio suspension pattern matches desktop transport tests;
- no coyote time / landing buffer / broad character-controller forgiveness;
- no final Owner qualification of the latest delivered `fef4...` candidate yet;
- no broad repository branch deletion yet.

The current client still assumes the fixed two-actor topology (`self + one remote`). That assumption is deliberately retained until the later 3+ architecture frontier.

---

## 9. Current project decision

The automated foundation campaign is strong enough to stop expanding by momentum.

Current posture:

> **The two-player multiplayer core is technically strong, broadly adversarially requalified and in final polish. One representative Owner desktop/mobile adversarial run remains before freeze.**

If that human run passes:

1. freeze exact baseline/provenance;
2. enter deliberate safe stop;
3. consolidate validation/workflow debt;
4. classify and clean branches without losing provenance;
5. refresh final takeover/current-state docs;
6. only then formally review Project Soul and the longer-horizon role of Multi_World;
7. only after that open the next multiplayer frontier, with 3+ players an early desired capability.

If the Owner run finds a reproducible foundation failure, classify and repair that specific falsifier before safe stop instead.

---

## 10. Fresh takeover reading order

1. `MULTI_WORLD_PROJECT_SOUL.md` — durable purpose;
2. **this file** — current technical/project truth;
3. `WORLD_V0_FOUNDATION_STABILIZATION_DIRECTION.md` — current closure order and remaining gate;
4. `WORLD_V0_QUALIFIED_BASELINE_GATE.md` — exact Owner qualification target;
5. newest issue #8 checkpoint when detailed provenance matters;
6. historical R0/R1/R2 docs only when a concrete question requires their evidence.
