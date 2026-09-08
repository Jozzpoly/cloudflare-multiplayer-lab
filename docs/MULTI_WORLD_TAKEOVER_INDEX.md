# Multi_World — Takeover Index

Status: **CANONICAL OPERATIONAL ENTRYPOINT — VERIFY LIVE**  
Updated: **2026-09-08**

This index is intentionally short. A fresh continuation should not need to reconstruct the whole project by reading every historical experiment.

---

## Canonical reading order

### 1. `MULTI_WORLD_PROJECT_SOUL.md`

Read first for the durable answer to:

> **What is Multi_World trying to become, and what values should survive changes of technology?**

It is product/research direction, not live architecture.

### 2. `MULTI_WORLD_CURRENT_STATE.md`

Read second for:

> **What is actually qualified now, what remains unproven, and what is the current repository/project state?**

This is the canonical live-state summary.

### 3. GitHub issue #8 — newest checkpoint

Use issue #8 when exact evidence/provenance matters.

Technical closure checkpoint:

`5577741764`

It records the four defects found during closure, their repairs, final clean-head validation and explicit non-claims. Read newer issue comments too if they exist; consolidation or later project work may have advanced after that technical checkpoint.

---

## Current exact anchors

### Canonical repository branch

Use live:

`main`

The closure/main consolidation merge checkpoint is:

`66f40bb86a066658b15bbd45c7baea86d1bb2a44`

PR #38 reconciled the formerly diverged histories without changing runtime relative to the qualified technical checkpoint.

Validation around that promotion:

- PR CI `34177475444` — SUCCESS;
- F5 preflight `34177475333` — SUCCESS;
- post-merge `main` push CI `34177544920` — SUCCESS on exact merge head `66f40bb...`.

Subsequent documentation-only commits may move `main`; verify live head before acting.

### Qualified runtime/evidence authority

Exact checkpoint:

`world-v0-closure-stabilization@1a759f0bd7aefd70027b2ed1d85e5cc7987bc01b`

Final retained validator:

- run `34176613974`;
- job `101907169173`;
- result `completed / success`;
- artifact `10037571475`;
- artifact SHA-256 `3de29b79003fe747f0af2602357c446bf633f95fd26c7d33a922547787565c23`.

Runtime identity at that checkpoint:

- authority `shared-yard-v0-authority-v9-prestart-live-start-gate`;
- sim build `shared-yard-v0-sim-69ad9c7d0430a929`.

Do not call a later docs-only `main` SHA a new runtime qualification.

### Human-qualified playability ancestor

`world-v0-playability-lead2-owner-feel@2250e45c53aaf2f9107ac718e2ac5dba6ab02d2e`

Preserve this as the relevant Owner-feel ancestor.

### Earlier reliability anchors

- `world-v0-multiplayer-foundation-integration@a2e821afbbc88371b033af311cc6882d46aa6916`;
- `world-v0-r0d-reliability-retest@7da9ddd4ad37221f63a3cd418a140824783480ec`;
- R0d workflow `34060903778` = SUCCESS.

These are provenance controls, not current working branches.

---

## Immediate continuation state

The temporary feature freeze that existed specifically to complete reliability closure and repository consolidation is no longer the active blocker.

Technical lifecycle/recovery closure is strong enough to stop inventing additional outage variants, and the former `main` divergence has been reconciled.

The next work is **product-frontier re-grounding**, not automatic execution of an old phase plan:

1. verify live `main` and classify any commits after the consolidation checkpoint;
2. read Project Soul and Current State;
3. recover the latest relevant Owner play/product evidence;
4. identify the highest-value current friction or desired capability;
5. challenge old candidates such as jump, room continuity, richer interaction, persistence or player-count work rather than inheriting them by momentum;
6. choose the smallest discriminating next experiment or product slice;
7. use remote/device evidence only when the selected question actually requires it.

Do not use the end of consolidation as permission to build persistence, lobby/membership architecture, arbitrary content, 3-player support or broad refactors without a concrete product question.

---

## Current evidence boundaries to remember

The current qualified envelope includes bounded same-ActorSession recovery and exact authority rebase, but it does **not** establish:

- cross-tab/new-tab ActorSession continuity;
- Durable Object process-loss reconstruction;
- persistent/open-room semantics;
- mobile radio/handover behavior;
- remote Cloudflare placement for the final v9 closure head;
- a guarantee that every browser outage below the 20 s authority grace recovers.

See `MULTI_WORLD_CURRENT_STATE.md` for the exact lifecycle distinctions.

---

## Historical documents — useful only when needed

The following are preserved because they contain reasoning history, negative evidence, Owner feedback or older takeover context. They are **not required startup reading** and must not override newer live evidence:

- `MULTI_WORLD_GROUNDING_V1.md` — 2026-09-02 consolidated grounding around the earlier A2/A2R frontier;
- `MULTI_WORLD_HUMAN_TEST_CONTEXT.md` — human/device test context;
- `MULTI_WORLD_FRESH_TAKEOVER_V1.md` — previous fresh-project mandate;
- `MULTI_WORLD_FRESH_TAKEOVER.md` — older heavier takeover draft;
- `MULTI_WORLD_GROUNDING_LEDGER.md` — broad historical ledger;
- `MULTI_WORLD_GROUNDING_REDTEAM.md` — red-team critique that shaped the older grounding;
- dated 2026-09-05 Friend-Ready / post-Owner / post-R1 / two-phone documents — preserved product and sequencing provenance from the former independent `main` side;
- experiment-specific `WORLD_V0_*` and `WS0_*` documents — local evidence/contract history.

The old `WORLD_V0_OPERATING_MAP.md` was intentionally not restored as a live file during consolidation because its 2026-09-05 snapshot described itself as current. It remains reachable through repository history.

---

## Historical branch warning

`multi-world-r0d-reliability-handoff` is a stale independent documentation/provenance branch relative to the qualified closure lineage.

**Do not merge it wholesale.**

If some historical statement is still useful, re-derive it against live canonical evidence rather than importing the branch as authority.

---

## Minimal fresh-takeover procedure

A fresh browser orchestrator should:

1. verify live `main`;
2. compare it with the consolidation merge checkpoint `66f40bb86a066658b15bbd45c7baea86d1bb2a44` and classify any later commits;
3. read Project Soul;
4. read Current State;
5. verify the newest issue #8 checkpoint and current CI when technical qualification matters;
6. recover the latest relevant Owner product/play evidence;
7. propose the smallest justified next product/research move rather than reopening historical infrastructure work by default.

Only if those checks reveal conflicting evidence should older grounding/handoff material be reopened in depth.
