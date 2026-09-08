# Multi_World — Takeover Index

Status: **CANONICAL OPERATIONAL ENTRYPOINT — VERIFY LIVE**  
Updated: **2026-09-08**

This index is intentionally short. A fresh continuation should not reconstruct the whole project by reading every historical experiment.

---

## Canonical reading order

1. [`MULTI_WORLD_PROJECT_SOUL.md`](MULTI_WORLD_PROJECT_SOUL.md) — durable answer to **what Multi_World is trying to become**.
2. [`MULTI_WORLD_CURRENT_STATE.md`](MULTI_WORLD_CURRENT_STATE.md) — current qualified technical truth, lifecycle boundaries and nonclaims.
3. GitHub issue #8 — newest checkpoints when exact evidence/provenance matters.

Newest R1 integration checkpoint:

`5590133257`

It records PR #39, exact integrated `main`, post-merge validation and remaining nonclaims.

Older grounding/takeover documents are provenance, not startup requirements.

---

## Current exact anchors

### Canonical repository branch

Use live:

`main`

Always verify its head before acting. Documentation-only consolidation after the qualified product anchor may move `main` without creating a new runtime qualification.

### Qualified integrated product/evidence anchor

Exact post-merge product checkpoint:

`main@72f971cff84f991f994df1b821f656941c0cd8eb`

Qualified R1 parent:

`world-v0-session-continuity-r1-exec@c5b071fa15dff403ba82891e21f36fd36c4ac791`

PR #39 merged the exact qualified R1 tree. The merge tree is:

`c57ab4a7c90aebd5101ae09e973481fb80e8243b`

and is identical to the qualified R1 tree.

### Post-merge validation

All exact `main@72f971c...` gates passed:

- normal CI `34264320221` — **SUCCESS**;
- Session Continuity Validation `34264320224` — **SUCCESS**;
  - artifact `10071208496`;
  - SHA-256 `218cc61c43d6b6eb34ddbc71824651cde975a91b090c881dfc963bb388b1032b`;
- World V0 Current Validation `34264320312` — **SUCCESS**;
  - artifact `10071385727`;
  - SHA-256 `014c4467103a4baf71756d2bcd2d8c086ba4ad032faa638d258d9c02873cbf28`.

Runtime identity at that anchor:

- authority `shared-yard-v0-authority-v9-prestart-live-start-gate`;
- browser UI `shared-yard-v0-browser-ui-v17-slot-bound-session-continuity`;
- simulation `shared-yard-v0-sim-69ad9c7d0430a929`;
- session continuity `world-v0-session-continuity-r2-slot-bound`;
- directory `world-v0-public-room-directory-r2-slot-presence`.

### Human-qualified playability ancestor

`world-v0-playability-lead2-owner-feel@2250e45c53aaf2f9107ac718e2ac5dba6ab02d2e`

Preserve this as the relevant Owner-feel ancestor. Later reliability/R1 work did not reopen feel/content tuning.

### Earlier reliability controls

- `world-v0-multiplayer-foundation-integration@a2e821afbbc88371b033af311cc6882d46aa6916`;
- `world-v0-r0d-reliability-retest@7da9ddd4ad37221f63a3cd418a140824783480ec`;
- R0d workflow `34060903778` — SUCCESS.

These are provenance controls, not current working branches.

---

## What changed in R1

The old takeover docs said that closing a page and opening a new tab could not preserve ActorSession identity. That statement is now stale.

Within a still-recoverable live WorldEpoch, the **same browser profile** can now recover the same ActorSession / NetEntity after close-tab/reopen through:

- the room list;
- the exact public `?run=yard-N` link.

The resume offer is authority-backed and slot-bound:

- your own slot must be reserved;
- an already connected own slot cannot be silently stolen by a second tab;
- another player's reserved slot cannot authorize your Resume;
- a foreign/new browser profile remains unable to resume.

The room directory exposes only anonymous reserved slot numbers. Private resume authority remains browser-local and is not published.

---

## Immediate continuation state

R1 Session Continuity is **integrated and post-merge qualified**. The previous reliability/consolidation work and R1 are strong enough that the agent should **not** keep inventing outage variants by momentum.

The next substantial work should begin with **product-frontier re-grounding**:

1. verify live `main` and classify any movement after `72f971c...` as docs-only or runtime-relevant;
2. read Project Soul and Current State;
3. inspect the newest issue #8 checkpoint if exact provenance matters;
4. recover the latest relevant Owner play/product evidence;
5. identify the highest-value current friction or desired capability;
6. challenge old candidates rather than inheriting them;
7. choose the smallest discriminating experiment/product slice;
8. use remote/device evidence only when the chosen question requires it.

Do not automatically build persistence, lobby/membership architecture, 3-player support, broad refactors or arbitrary content.

Jump/content behavior was not part of R1. Treat any jump issue as a separate causal/product question, not an inherited next phase.

---

## Evidence boundaries to remember

The qualified envelope **does** include same-profile close-tab/new-tab ActorSession continuity, but it still does **not** establish:

- account/cloud or cross-device session persistence;
- Durable Object process-loss reconstruction of the same Box3D WorldEpoch;
- persistent/continuously open room semantics;
- arbitrary player churn or 3+ player scalability;
- mobile OS suspension / radio handover behavior;
- new remote Cloudflare placement qualification for the R1 head;
- a guarantee that every browser outage shorter than the 20 s authority grace recovers end-to-end.

See `MULTI_WORLD_CURRENT_STATE.md` for the exact lifecycle distinctions.

---

## Historical material

Open older files only when a concrete question requires their evidence or reasoning. They must not override newer live evidence.

Useful historical classes include:

- `MULTI_WORLD_GROUNDING_V1.md`, grounding ledger/red-team and older fresh-takeover files;
- `MULTI_WORLD_HUMAN_TEST_CONTEXT.md`;
- dated 2026-09-05 Friend-Ready / post-Owner / two-phone documents;
- experiment-specific `WORLD_V0_*` / `WS0_*` documents;
- repository history for the intentionally retired `WORLD_V0_OPERATING_MAP.md`.

Historical branch warning:

`multi-world-r0d-reliability-handoff` remains stale independent documentation/provenance. **Do not merge it wholesale.**

---

## Minimal fresh-takeover procedure

A fresh browser orchestrator should:

1. verify live `main`;
2. compare/classify any commits after qualified product anchor `72f971cff84f991f994df1b821f656941c0cd8eb`;
3. read Project Soul;
4. read Current State;
5. read newest issue #8 checkpoint, currently `5590133257`, when technical provenance matters;
6. recover the latest relevant Owner product/play evidence;
7. propose the smallest justified next product/research move rather than reopening historical infrastructure work by default.

Only conflicting evidence should force a deep reconstruction from older handoffs.
