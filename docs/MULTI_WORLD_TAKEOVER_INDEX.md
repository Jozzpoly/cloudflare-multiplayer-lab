# Multi_World — Takeover Index

Status: **CURRENT OPERATIONAL ENTRYPOINT — VERIFY LIVE**  
Updated: **2026-09-10**

This index is intentionally short. A fresh continuation should not reconstruct the whole project from historical branches unless a concrete question requires it.

---

## Canonical reading order for the current closure

1. [`MULTI_WORLD_PROJECT_SOUL.md`](MULTI_WORLD_PROJECT_SOUL.md) — durable answer to **what Multi_World is trying to become**.
2. [`MULTI_WORLD_CURRENT_STATE.md`](MULTI_WORLD_CURRENT_STATE.md) — current technical truth, exact product/delivery anchors, lifecycle boundaries and nonclaims.
3. [`WORLD_V0_FOUNDATION_STABILIZATION_DIRECTION.md`](WORLD_V0_FOUNDATION_STABILIZATION_DIRECTION.md) — current execution order and remaining gate.
4. [`WORLD_V0_QUALIFIED_BASELINE_GATE.md`](WORLD_V0_QUALIFIED_BASELINE_GATE.md) — exact Owner qualification target.
5. GitHub issue #8 — newest checkpoints when detailed evidence/provenance matters.

Important recent issue checkpoints:

- authority-epoch-loss stabilization: `5611456843`;
- broad adversarial verification: `5611643968`.

Older R0/R1/R2/takeover documents are provenance, not startup requirements.

---

## Current exact anchors

### Frozen stabilization product

`fef4a2a4b6007c3e42cbd3b430cb9943343cc970`

Message:

`Recover public Yard after lost authority epoch`

This is the current product authority for the final polish/Owner-gate phase. `main` still carries older integrated R2-era canonical history and should not silently override this newer unmerged stabilization product.

### Current qualified-play Owner candidate

`https://cloudflare-multiplayer-lab-qualified-play.jozzpoly.workers.dev/world-v0/`

Delivery:

- run `34426803131` / job `102713664761` — **SUCCESS**;
- Cloudflare Version ID `d62c2e72-c4d9-4124-8847-85815d715ff1`;
- product bytes match `fef4a2a4...`;
- human public Yard Durable Objects were not touched by the delivery workflow.

### Current simulation identity

- contract `shared-yard-v0-contract-v14-jump-delivery-persistence`;
- authority `shared-yard-v0-authority-v11-jump-delivery-persistence`;
- browser sim `shared-yard-v0-browser-sim-v10-jump-delivery-persistence`;
- browser UI `shared-yard-v0-browser-ui-v19-jump-delivery-persistence`;
- protocol `shared-yard-v0-scheduled-input-v3-supersession`;
- state guard `shared-yard-v0-f32-state-v1`;
- SimBuild `shared-yard-v0-sim-cd8edc169f791a64`.

### Current admission/lifecycle shell

- session continuity `world-v0-session-continuity-r3-live-rebind`;
- public room entry `world-v0-public-room-entry-r3-presence-capacity`;
- directory `world-v0-public-room-directory-r4-vacant-capacity`;
- join failure clarity `world-v0-join-failure-clarity-v1`;
- authority epoch-loss recovery `world-v0-authority-epoch-loss-v1`.

---

## What changed since the old R2 takeover spine

R1/R2 remain earned, but the project no longer stops at those capabilities.

The September stabilization campaign additionally closed:

- gameplay keyboard stealing W/A/S/D from callsign input;
- same-owner F5/new-tab overlap failing against its own live ActorSession;
- dormant ActorSessions permanently consuming public Yard capacity;
- cross-Yard history exhausting all three public Yards;
- unsafe ambiguity between protected and replaceable reservations;
- fully vacant resumable epochs owning capacity despite zero connected humans;
- stale old-epoch tokens surviving demand-driven handoff;
- generic join messages conflating capacity/lifecycle/transport failures;
- fatal `actor_session_resume_exhausted` when the in-memory authority WorldEpoch was actually gone.

The current fixed two-player deterministic topology is deliberately preserved. These repairs do **not** introduce dynamic roster replacement or 3+ players.

---

## Latest evidence to trust

### Post-promotion product gates

- focused authority-loss/ordinary-outage requalification `34426373914` — **SUCCESS**;
- full historical Current Validation `34426331772` — **SUCCESS**.

### Broad adversarial campaign

`34428181101` — **SUCCESS / 8 of 8 jobs**.

Notable extra challenges:

- three authority losses in one persistent browser pair;
- one peer background-hidden during authority loss;
- retained history across Yard 1/2/3 without capacity exhaustion;
- four fresh remote Cloudflare Durable Objects;
- composed same-owner/soft-handoff/zero-online/direct-resume flows.

### Admission race

`34428538218` — **SUCCESS**.

Near-simultaneous private Resume versus unrelated fresh admission produced both legal winner orders across repeated cases. Exactly one authority-valid outcome won each time; no split-brain/double WorldEpoch was observed.

---

## Current polish branch

`world-v0-foundation-polish-closure`

Purpose:

- do not change gameplay/runtime unless a new falsifier requires it;
- repair canonical validation coverage;
- reconcile stale documentation;
- audit dependency/toolchain debt;
- classify reusable gates versus one-shot apparatus;
- prepare a clean final Owner gate and eventual safe stop.

The polish branch currently changes the frozen product only in validation/documentation surfaces. Standard `npm run check` has been extended so the authority-epoch-loss and join-failure-clarity modules and smoke tests are part of the ordinary canonical repository check.

Toolchain finding: production dependency audit is clean. The remaining three high advisories are dev-only under `wrangler -> miniflare -> sharp`; a tested Wrangler `4.130.0` upgrade does not remove them, so no cosmetic upgrade is currently justified.

---

## Immediate continuation state

**Do not open another feature frontier.**

The current order is:

1. finish bounded polish/document/validation cleanup;
2. ensure the polish branch has no unintended product drift;
3. run one final representative Owner adversarial qualification against the delivered candidate;
4. if PASS, freeze the two-player baseline and enter safe stop;
5. then classify/retire one-shot workflows and branches without losing provenance;
6. only after cleanup review Project Soul / repository role and choose the next multiplayer frontier.

The preliminary long-horizon direction remains that Multi_World may become a long-lived multiplayer systems laboratory / reusable core, with **3+ players an early desired post-cleanup capability**. Do not implement that during this closure.

---

## Evidence boundaries to remember

The current foundation does **not** establish:

- durable reconstruction of a lost Box3D WorldEpoch;
- account/cloud or cross-device private session identity;
- persistent continuously-open-world semantics;
- arbitrary dynamic membership in one deterministic epoch;
- 3+ player scalability;
- guaranteed recovery through every mobile OS/radio suspension pattern;
- arbitrary permanent-network-loss input delivery;
- coyote time, landing buffer or a final character controller.

Authority-loss recovery deliberately fresh-starts the same logical Yard when the old in-memory epoch is positively gone; it does not resurrect the old physical state.

---

## Minimal fresh-takeover procedure

A fresh browser orchestrator should:

1. verify live `world-v0-foundation-polish-closure` and product anchor `fef4a2a4...`;
2. confirm any commits after `fef4...` are validation/docs/apparatus only unless evidence says otherwise;
3. read Project Soul;
4. read Current State;
5. read stabilization direction and Owner gate;
6. inspect issue #8 checkpoint `5611643968` when exact adversarial evidence matters;
7. continue final polish or Owner qualification — **not** historical reliability exploration by default.

Only conflicting new evidence should force reconstruction from older branches or handoffs.
