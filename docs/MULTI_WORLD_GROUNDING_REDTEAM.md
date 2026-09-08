# Multi_World — Grounding Ledger Red-Team

Status: **CRITIQUE OF `MULTI_WORLD_GROUNDING_LEDGER.md` v0**  
Purpose: attack overclaims, hidden architecture commitments and cross-project contamination before producing a final takeover package.

This document intentionally preserves criticism separately rather than silently rewriting the v0 draft. The final ledger v1 should merge accepted corrections and then supersede both drafts for takeover use.

---

## 1. A2R human evidence was slightly overstated in v0

The strongest human fact is:

> Owner reports the functioning single-player A2R local-physics path feels **very smooth**.

The `~212/235 ms RTT` screenshot came from the later desktop/mobile second-client attempt in which that client was already rejected by the intentional single-player guard and reported `0 local physics steps` / `candidate error`.

Therefore it is **not justified** to phrase the evidence as “A2R was proven smooth at 212/235 ms RTT.”

Correct classification:

- **OWNER-OBSERVED:** functioning A2R single-player feel is very smooth;
- **OBSERVED SEPARATELY:** the rejected second-client/mobile connection saw ~212/235 ms RTT;
- **NOT PROVEN:** the exact smooth active local-physics run had that RTT.

The final takeover ledger must preserve this separation.

---

## 2. Do not prematurely call A2 “closed PASS”

A2R has extremely strong automated evidence plus positive Owner judgement, but the uploaded gameplay recording was not independently recovered for frame-by-frame analysis in the final session.

Current-best wording:

> A2R is the first positive human-reference candidate and strongly supports the local-solver contact hypothesis.

Do not silently upgrade this to:

> final networking solution / formal proof of all A2 perceptual behavior.

The research value is already high without overstating closure.

---

## 3. Remote causality is the central next hypothesis, not the only unknown

The v0 ledger correctly identifies **remote causality** as the most valuable next research problem. That remains current-best.

However a fresh project must also see adjacent unresolved state-contract problems:

- current prop snapshots carry position + rotation only, not linear/angular velocity;
- A2R is qualified as a **fresh-world** seed; joining/reconnecting into a moving live world is not yet a proven faithful seed path;
- server and client have different fixed-step/backlog policies under stalls;
- no robust rare recovery/reseed contract is selected;
- local representation of a remote player is completely unresolved.

These are not reasons to solve everything before two-client work. They are reasons to avoid interpreting an A3 failure as automatically “Forecast is required.”

---

## 4. The existing server's `MAX_INTERACTIVE_PLAYERS = 6` is not multiplayer evidence for A2R

The authority can create multiple dynamic player bodies and accepts up to six sockets.

That proves only that server-side storage/body creation is not artificially capped at one.

It does **not** prove:

- six-player scheduler headroom;
- remote-player presentation;
- local prediction of multiple actors;
- shared-body coherence under multiple independent inputs;
- useful gameplay at six players.

Fresh takeover material should describe `6` as an implementation limit in the current server, not an achieved scaling result.

---

## 5. Character Controller is a powerful donor precisely because importing it would be a large confounder

The donor and A2R happen to share a useful qualified substrate envelope:

- `box3d.js@0.1.1`;
- `1/60 s` fixed step;
- `4` substeps.

This superficial compatibility must not hide the deeper difference.

A2R's player is a **solver-owned dynamic rigid-body capsule** whose horizontal velocity is directly driven toward a target and whose contact response remains in Box3D.

Character Controller Donor v1 is a **controller-owned embodiment contract** with virtual mass, causal reciprocity, explicit support transport and its own preStep/postStep lifecycle.

Importing Donor v1 into the next networking crucible would therefore change:

- state ownership;
- contact/reciprocity semantics;
- support mechanics;
- locomotion behavior;
- intent shape;
- likely prediction/reconciliation requirements.

That is not a harmless “better movement” swap. It should happen only when an integration question explicitly earns that blast radius.

---

## 6. Persistence is product pressure, not current substrate truth

The desired direction is a small **persistent** cooperative living world.

Current WS0/A2R evidence does not establish persistence architecture, storage semantics, reconnect restoration or long-lived world migration.

Use persistence to evaluate whether future architecture is painting the project into a corner, but do not make persistence a prerequisite for the next remote-causality experiment.

---

## 7. Cloudflare staging work is operational evidence, not project identity

The production/staging incident and later isolation work mattered because bad deployment plumbing was contaminating experiments.

The useful enduring lessons are:

- deployments must not mutate controls accidentally;
- evidence must identify the exact deployed specimen;
- staging needs real isolation before human judgement;
- infrastructure failures must be separated from physics/network failures.

The takeover does **not** need the full history of `WRANGLER_CI_OVERRIDE_NAME`, failed preview-router experiments or every Version ID unless diagnosing deployment again.

That history is provenance, not project soul.

---

## 8. A2R temporal evidence survives the red-team

Repo-native issue #8 records a strong temporal result:

At the modeled ~63 ms one-way condition:

- welcome/start lag ~4 ticks;
- best history alignment ~7–9 ticks;
- prediction lead relative to server-now ~+3…+5 ticks;
- aligned player residual commonly ~0.00–0.01;
- aligned prop/contact residual commonly ~0.00–0.04;
- settled/final residual commonly ~0.00–0.03.

At modeled 100 ms one-way:

- prediction lead ~+5…+6 ticks;
- aligned contact residual remains small in tested traces.

A 1.5 s idle-after-welcome variant did not remove the lead, weakening the hypothesis that startup lag alone caused it.

This remains **STRONGLY SUPPORTED MODEL EVIDENCE**, not a guarantee about arbitrary real-world multiplayer traces.

---

## 9. Stall/input-history classification also survives

Exact A/B evidence cleanly separates two policies during 100–250 ms main-thread stalls overlapping input transitions:

- current-input catch-up can leave persistent player/prop divergence even though no simulation ticks are discarded;
- ideal history-aware catch-up converged to the same final state in all six tested scenarios.

Therefore the demonstrated fault is genuinely **input-history assignment during catch-up**.

What remains unknown is the correct cross-device browser contract for obtaining/reconstructing that history. The WebDriver timestamp probe does not establish a safe universal solution.

Keep this as a bounded recovery debt. Do not let it expand into rollback infrastructure without new evidence.

---

## 10. Current-best reclassification after red-team

### PROVEN

- Cloudflare/DO/WebSocket substrate can host the small shared-world research runtime;
- server Box3D physical world works at the qualified WS0 cadence in validated runs;
- server player -> dynamic prop contact works;
- original A2 client baseline failed perceptually while server substrate remained healthy;
- A2R exact browser/cloud pipeline runs end-to-end;
- A2R local full-Box3D contact path exists and is mechanically exercised;
- staging/production isolation was achieved for the final A2R candidate;
- stall+input-history fault exists in the bounded synthetic/exact scenarios.

### OWNER-OBSERVED

- functioning A2R single-player feel is very smooth.

### STRONGLY SUPPORTED

- much of A2R's active owner-vs-authority difference is temporal prediction lead rather than fundamentally different contact dynamics in tested traces;
- local solver-owned contact is a strong explanation for why A2R improves over the original A2 presentation model.

### CURRENT-BEST PROVISIONAL

- remote causality/shared-body contention is the highest-value next research crucible;
- preserve A2R owner feel while importing delayed causality from another actor;
- start with asymmetric A acts -> B observes before simultaneous contention.

### UNKNOWN

- remote-player local representation;
- shared-prop correction/resimulation/forecast requirements;
- live-world/reconnect seed contract;
- rare recovery policy;
- practical 2–3 player quality and 5–6 player headroom;
- final controller representation;
- final transport/backend/cadence;
- persistence/product architecture.

### REJECTED / DEFERRED

- original A2 delayed-authority contact presentation as acceptable baseline;
- continuous owner correction as an automatic default;
- mutating the A2R human-reference into A3;
- automatic Donor v1 import;
- generic rollback/Forecast/ownership/interaction-island frameworks before the two-client falsifier earns them;
- new product repo before the shared physical substrate earns it.

---

## 11. Red-team verdict

The v0 ledger's **direction survives**, but its final version should be narrower in three ways:

1. separate Owner smoothness from the high-RTT second-client screenshot;
2. describe remote causality as current-best next unknown rather than predetermined architecture;
3. make donor state-ownership differences explicit before any downstream integration.

With those corrections, the project is ready for a Project Soul draft and then a fresh takeover mandate.
