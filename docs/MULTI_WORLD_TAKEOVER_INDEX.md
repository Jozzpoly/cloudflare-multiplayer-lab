# Multi_World — Takeover Index

Status: **CANONICAL OPERATIONAL ENTRYPOINT — VERIFY LIVE**  
Updated: **2026-09-08**

This index is intentionally short. A fresh continuation should not reconstruct the whole project by reading every historical experiment.

---

## Canonical reading order

1. [`MULTI_WORLD_PROJECT_SOUL.md`](MULTI_WORLD_PROJECT_SOUL.md) — durable answer to **what Multi_World is trying to become**.
2. [`MULTI_WORLD_CURRENT_STATE.md`](MULTI_WORLD_CURRENT_STATE.md) — current qualified technical truth, lifecycle/input boundaries and nonclaims.
3. GitHub issue #8 — newest checkpoints when exact evidence/provenance matters.

Newest technical checkpoint:

`5592166219`

It records R2 Jump Reliability, exact `main` integration, qualification evidence and remaining nonclaims.

Older grounding/takeover documents are provenance, not startup requirements.

---

## Current exact anchors

### Canonical repository branch

Use live:

`main`

Always verify its head before acting. Documentation-only consolidation after the qualified product anchor may move `main` without creating a new runtime qualification.

### Qualified integrated runtime/evidence anchor

`main@692ac8524c0bd056458658408f7d78d82237aab9`

Clean qualified R2 source:

`world-v0-jump-reliability-r2@1afe2428518c7c97fb96fef46f8a010eaaba3999`

Qualified tree shared by both:

`b5f1608d2c090c984545be027cbe05a3dd8de69f`

The merge changed ancestry/provenance only; there is zero file diff between clean R2 and the integrated runtime anchor.

### Post-integration validation

All exact `main@692ac852...` gates passed:

- normal CI `34280426970` — **SUCCESS**;
- Session Continuity `34280426973` — **SUCCESS**;
  - artifact `10077414930`;
  - SHA-256 `eeea5b5a39f162372a6b61437a44465351ea8756a807dca9267e5f7794d190b2`;
- World V0 Current Validation `34280427073` — **SUCCESS**;
  - artifact `10077571450`;
  - SHA-256 `7d1389b9f391be5d02ac9a94853399e41568c6473c44638cb80d9c1b97e85463`.

Runtime identity at that anchor:

- contract `shared-yard-v0-contract-v14-jump-delivery-persistence`;
- authority `shared-yard-v0-authority-v11-jump-delivery-persistence`;
- browser sim `shared-yard-v0-browser-sim-v10-jump-delivery-persistence`;
- browser UI `shared-yard-v0-browser-ui-v19-jump-delivery-persistence`;
- simulation `shared-yard-v0-sim-cd8edc169f791a64`;
- session continuity `world-v0-session-continuity-r2-slot-bound`;
- directory `world-v0-public-room-directory-r2-slot-presence`.

### Human-qualified playability ancestor

`world-v0-playability-lead2-owner-feel@2250e45c53aaf2f9107ac718e2ac5dba6ab02d2e`

Preserve this as the relevant Owner-feel ancestor. Later closure/R1/R2 work did not reopen broad feel/content tuning.

### Earlier controls

- R1 integrated runtime `main@72f971cff84f991f994df1b821f656941c0cd8eb`;
- `world-v0-multiplayer-foundation-integration@a2e821afbbc88371b033af311cc6882d46aa6916`;
- `world-v0-r0d-reliability-retest@7da9ddd4ad37221f63a3cd418a140824783480ec`;
- R0d workflow `34060903778` — SUCCESS.

These are provenance controls, not current working branches.

---

## What changed in R2

R1 had repaired the original one-tick jump arrival race by representing a press over a fixed **six-tick future window**. That was better, but it still encoded an arbitrary transport-time budget.

R2 replaces that fixed window with **canonical-delivery persistence**:

- a press stays pending while the future-input horizon advances;
- late/rejected early ticks do not erase it;
- `world_v0_consumed` with canonical `jump=true` proves delivery and clears pending;
- authority still applies a physical jump only on a grounded rising edge;
- canonical `jump=true` while unsupported clears pending with `jumpApplied=false`, so it does not become a landing buffer.

The causal browser falsifier forced ordered outbound delay `180 ms -> 45 ms`:

- first authored tick `196`;
- canonical delivered tick `239`;
- **43-tick delivery span**, far beyond the former six-tick window;
- exactly one grounded impulse;
- second airborne press delivered but not applied;
- no delayed landing impulse;
- exact guard mismatches `0`;
- server late count `2 -> 75`, confirming the intended temporal-loss class was exercised.

Retained causal specimen:

`scripts/world-v0-jump-delivery-persistence-audit.mjs`

---

## R1 continuity remains earned

Within a still-recoverable live WorldEpoch, the **same browser profile** can recover the same ActorSession / NetEntity after close-tab/reopen through:

- the room list;
- the exact public `?run=yard-N` link.

Resume remains authority-backed and slot-bound:

- your own slot must be reserved;
- an already connected own slot cannot be silently stolen by a second tab;
- another player's reserved slot cannot authorize your Resume;
- a foreign/new browser profile remains unable to resume.

The room directory exposes only anonymous reserved slot numbers. Private resume authority remains browser-local and is not published.

---

## Immediate continuation state

**R2 Jump Reliability is integrated and post-merge qualified.** The demonstrated temporal transport-loss jump failure is closed without adding coyote time or landing buffering.

The broader reliability campaign should now **stop unless new evidence falsifies the integrated contract**. Do not invent another outage variant, retry sweep or qualification loop by momentum.

The next substantial work should begin with **product-frontier re-grounding**:

1. verify live `main` and classify any movement after `692ac852...` as docs-only or runtime-relevant;
2. read Project Soul and Current State;
3. inspect issue #8 checkpoint `5592166219` if exact provenance matters;
4. recover the latest relevant Owner play/product evidence;
5. identify the highest-value current friction or desired capability;
6. challenge old candidates rather than inherit them;
7. choose the smallest discriminating experiment/product slice;
8. use remote/device evidence only when the selected question requires it.

Do not automatically build persistence, lobby/membership architecture, 3-player support, broad refactors or arbitrary content.

---

## Evidence boundaries to remember

The qualified envelope does **not** establish:

- account/cloud or cross-device session persistence;
- Durable Object process-loss reconstruction of the same Box3D WorldEpoch;
- persistent/continuously open room semantics;
- arbitrary player churn or 3+ player scalability;
- mobile OS suspension / radio handover behavior;
- new remote Cloudflare placement qualification for the R2 head;
- a guarantee that every browser outage shorter than the 20 s authority grace recovers end-to-end;
- guaranteed discrete-input delivery through arbitrary permanent network loss;
- coyote time, landing buffering or broader support/contact forgiveness.

See `MULTI_WORLD_CURRENT_STATE.md` for the exact lifecycle and input distinctions.

---

## Historical material

Open older files only when a concrete question requires their evidence or reasoning. They must not override newer live evidence.

Useful historical classes include:

- `MULTI_WORLD_GROUNDING_V1.md`, grounding ledger/red-team and older fresh-takeover files;
- `MULTI_WORLD_HUMAN_TEST_CONTEXT.md`;
- dated Friend-Ready / post-Owner / two-phone documents;
- experiment-specific `WORLD_V0_*` / `WS0_*` documents;
- repository history for intentionally retired operating maps.

Historical branch warning:

`multi-world-r0d-reliability-handoff` remains stale independent documentation/provenance. **Do not merge it wholesale.**

---

## Minimal fresh-takeover procedure

A fresh browser orchestrator should:

1. verify live `main`;
2. compare/classify any commits after qualified runtime anchor `692ac8524c0bd056458658408f7d78d82237aab9`;
3. read Project Soul;
4. read Current State;
5. read newest issue #8 checkpoint, currently `5592166219`, when technical provenance matters;
6. recover the latest relevant Owner product/play evidence;
7. propose the smallest justified next product/research move rather than reopening historical infrastructure work by default.

Only conflicting evidence should force a deep reconstruction from older handoffs.
