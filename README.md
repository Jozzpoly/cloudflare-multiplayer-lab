# Multi_World / Cloudflare Multiplayer Lab

Evidence-driven R&D laboratory for **multiplayer / shared-world technology**.

The current test specimen is **World V0 / Ongoing Shared Yard**: a deliberately small server-authoritative Box3D crucible used to develop and falsify real-time multiplayer behavior under shared active physics.

**Multiplayer systems are the primary product of this repository.** Gameplay, map content and interaction affordances exist here only when they provide a useful test surface for multiplayer technology. Multi_World is not being developed by feature expansion into the future game; future games should consume or donate proven systems from this lab.

## Start here

1. [`docs/MULTI_WORLD_PROJECT_SOUL.md`](docs/MULTI_WORLD_PROJECT_SOUL.md) — durable product intent and research posture.
2. [`docs/MULTI_WORLD_CURRENT_STATE.md`](docs/MULTI_WORLD_CURRENT_STATE.md) — compact current technical/project truth.
3. [`docs/MULTI_WORLD_TAKEOVER_INDEX.md`](docs/MULTI_WORLD_TAKEOVER_INDEX.md) — minimal continuation path.
4. [`docs/WORLD_V0_POST_OWNER_V28_HARDENING_2026-09-18.md`](docs/WORLD_V0_POST_OWNER_V28_HARDENING_2026-09-18.md) — detailed evidence for the current baseline.
5. GitHub issue #8 — historical evidence ledger when a specific provenance question requires it.

Retired campaign history is preserved through `archive/multi-world-history-2026-09-18`; it is not the default startup narrative.

## Current qualified baseline

Qualified World V0 runtime:

`2bb295ba583e1852337e88e89f8cb790e104f70d`

Final-runtime qualification:

`35286869307` — **SUCCESS**

Exact isolated staging delivery:

`35288291564` — **SUCCESS**

The qualified product supports, inside the current bounded two-actor envelope:

- one player entering alone and immediately inhabiting the physical Yard;
- a second player joining later into the same ongoing WorldEpoch;
- server-authoritative Box3D shared physical state at fixed `60 Hz / 4 substeps`;
- responsive local browser prediction with exact authoritative correction;
- scheduled canonical input and acknowledgement-driven causal jump delivery;
- bounded same-ActorSession transport/page recovery;
- protected and soft reservation semantics that eventually return public capacity;
- exact causal identity through replay / Resume / rebase;
- executable desktop and real mobile-touch movement, camera and jump controls;
- explicit distinction between room-capacity and transport/handshake failures.

The Owner accepted the foreground smoothness envelope during the V25/V28 campaign. Subsequent post-Owner hardening repaired private refresh continuity, same-profile rebound, Diagnostics keyboard ownership and R0 recovery bookkeeping. There has not been a new full two-human perceptual campaign after those repairs.

## Current repository topology

The V28 / Ongoing Yard campaign is closed.

Live branches are deliberately reduced to:

- `main`;
- `archive/multi-world-history-2026-09-18`.

Historical research/staging/delivery branches were removed only after aggregate archive recoverability was proven.

The retained live workflow spine is:

- `.github/workflows/ci.yml`;
- `.github/workflows/workflow-pipeline-safety-audit.yml`;
- `.github/workflows/world-v0-current-validation.yml`;
- `.github/workflows/world-v0-staging-delivery.yml`.

## Current work boundary

**Do not add gameplay/features by momentum. Do not restart old reliability ladders without a new multiplayer failure or capability question.**

The next substantial phase is the **Multiplayer Foundation**: continue developing a reusable real-time physical multiplayer substrate toward the already accepted early envelope of **1–6 dynamic actors**.

Core technical scope includes:

- dynamic join / leave and roster mutation;
- transport loss, resume and recovery;
- shared active physics under authoritative truth;
- real process / runtime restart behavior;
- network impairment and latency regimes;
- browser / mobile / platform lifecycle;
- browser self+N execution;
- load / fault behavior and, when earned, interest-management pressure;
- machine evidence plus real 3–6-human qualification.

Before new implementation, recover and verify what the archived Multiplayer Foundation v1 research already proved. The Ongoing Yard + V28 two-actor runtime is a qualified regression/test baseline, not the end goal and not a request for gameplay expansion.

## Explicit nonclaims

Current evidence does **not** establish:

- durable reconstruction of a lost physical WorldEpoch after process/state loss;
- account/cloud identity or cross-device private-session transfer;
- a persistent continuously-open world;
- arbitrary 3+ actor topology;
- MMO-style roster mutation;
- correctness through permanent network loss;
- that the current remote-presentation policy is final forever;
- that existing Owner perceptual evidence replaces future multi-human play testing.

## Local development

Use the exact dependency graph:

```bash
npm ci
npm run check
```

Run locally:

```bash
npm ci
npm run dev
```

Multi_World's durable objective is:

> Develop and qualify reusable multiplayer/shared-world technology that can make a small real-time physical world behave as one coherent place across real people, devices, failures and lifecycle transitions.
