# Multi_World Foundation v0 — Q1c x64 ↔ ARM64 determinism contract

Status: **Q1c FROZEN PRE-EXECUTION CONTRACT / NOT FOUNDATION QUALIFICATION**  
Parent evidence: Q1b Node↔Chromium runtime envelope PASS, issue #8 checkpoint `5527750245`  
Branch: `foundation-v0-q1-determinism-envelope`

## Question

Q1a qualified the first-divergent-tick apparatus. Q1b showed that Node/Wasm and real Chromium/Wasm on one Linux x64 host execute the shared F5-like application simulation bit-identically.

Q1c attacks the next high-value uncertainty without spending Owner/device attention:

> **Does the same pinned application simulation and canonical command ledger produce the same complete float32 physical history on native Linux x64 and native Linux ARM64 GitHub-hosted runners?**

This is an architecture-envelope probe. It is not an Android or mobile-browser qualification.

## Why architecture next

The Owner F5 session involved a phone, but Q1b still left CPU architecture untested. A late discovery that the same Wasm/application contract diverges across x64 and ARM64 would affect every later rollback/reconciliation assumption.

GitHub currently provides standard native `ubuntu-24.04-arm` hosted runners, so this uncertainty can be tested automatically before asking the Owner for another phone session.

## Frozen application contract

Q1c imports the exact shared simulation module already used by Q1b:

`public/foundation-q1b/sim-core.js`

Both architectures use:

- Node 22;
- locally installed `box3d.js@0.1.1` through `box3d.js/inline`;
- 60 Hz / 4 substeps;
- F5-like floor, perimeter, 12 props and 2 actors;
- stable application identity and canonical slot-ordered intent application;
- 600 canonical post-step boundaries;
- complete canonical float32 state trace for position, rotation, linear velocity and angular velocity.

No architecture-specific normalization or tolerance is permitted.

## Cells

### A — canonical baseline trajectory

Run the exact canonical ledger independently on:

- `ubuntu-24.04` x64;
- `ubuntu-24.04-arm` ARM64.

**Gate:** complete traces must be bit-identical for all 600 boundaries.

### B — independent perturbed trajectory

On both architectures, apply the already-declared sensitivity perturbation: actor 1 receives neutral input at target tick 90 instead of the canonical command.

**Gate:** x64 and ARM64 perturbed traces must also be bit-identical for all 600 boundaries.

This prevents a PASS that is accidentally specific to only one trajectory through the contact topology.

### C — per-architecture evidence sensitivity

Within each architecture compare baseline against its own perturbed trajectory.

**Gate:** both must first diverge at boundary tick 91.

## Coupling requirement

Baseline max prop displacement on each architecture must exceed `0.05 m`.

## Q1c PASS

Q1c passes only if:

1. x64 baseline and ARM64 baseline are bit-identical;
2. x64 perturbed and ARM64 perturbed are bit-identical;
3. both architecture-local baseline↔perturb comparisons first diverge at boundary 91;
4. both baseline scenes satisfy the coupling requirement;
5. evidence records exact runner architecture, Node version, Box3D package/version and workflow/head provenance.

A Q1c PASS means only:

> **For the two tested F5-like trajectories under Node 22 and `box3d.js@0.1.1`, native Linux x64 and native Linux ARM64 produced bit-identical canonical application state histories.**

It does **not** qualify:

- Android OS/browser runtime;
- ARM mobile thermal/performance behavior;
- Chromium ARM64 specifically;
- Firefox/WebKit;
- Cloudflare Worker runtime determinism;
- reconnect/world epoch or persistence semantics;
- final production synchronization architecture.

## Natural stop

Stop after Q1c result and provenance closure. Do not convert an architecture PASS directly into a phone/device qualification claim.