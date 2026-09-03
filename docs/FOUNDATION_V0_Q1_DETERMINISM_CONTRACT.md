# Multi_World Foundation v0 — Q1 application determinism contract

Status: **Q1a FROZEN PRE-EXECUTION CONTRACT / NOT FOUNDATION QUALIFICATION**  
Base evidence: F5 Live Truth Gate PASS, issue #8 checkpoint `5527471748`  
Base tree: `ws0-f5-browser-scheduled-history@dcba3f5f3d49eb05f3932c0a9db57cea15e635da` / Git tree `9e8c29dcbcf52325d957797a94289e3456b70cf5`

## Why this is first

F5 established that the scheduled-forward + bounded client-history family is promising in a real desktop/phone session. It did **not** establish that independently constructed Multi_World simulations execute the same application-level history tick-for-tick.

That unknown is expensive to discover late. Box3D determinism alone is insufficient if application creation order, host iteration order, input application order, state extraction or later gameplay code introduces a different causal history.

Q1 therefore starts with the smallest useful diagnostic primitive:

> **Given one canonical command ledger and one declared simulation contract, can independently constructed F5-like worlds remain state-identical tick by tick, and can the apparatus name the first divergent tick when the ledger is intentionally changed?**

This stage is deliberately narrower than cross-device qualification. It earns the apparatus before spending Owner/device attention.

## Q1a scope

Q1a is an offline Node/Wasm twin-world experiment using the exact pinned `box3d.js@0.1.1` package family and the F5 physical constants that matter to the carried scene:

- 60 Hz;
- 4 Box3D substeps;
- gravity `[0,-20,0]`;
- same floor/perimeter geometry;
- same 12 dynamic props, dimensions, density, damping, friction and restitution;
- same two capsule actors, starts, density, damping, friction, restitution and angular locks;
- same `speed=5.2`, `accel=28`, `decel=36` controller semantics;
- actor intent applied in canonical slot order.

The deterministic ledger must deliberately enter coupled contact rather than test only free motion.

## State fingerprint

After every canonical physics tick, record a canonical fingerprint over stable application identity, not Box3D handles.

For each actor and prop in stable `NetEntityId` order, include at minimum:

- position;
- rotation;
- linear velocity;
- angular velocity.

Numbers are normalized to exact float32 bit patterns before hashing so reporting/JSON formatting cannot hide or invent a difference.

The report must contain the first divergent boundary tick and first differing entity/component when divergence occurs.

## Cells

### A — exact independent twins

Construct two independent F5-like worlds from the same declared contract and feed the exact same command ledger.

**Gate:** no fingerprint or component divergence over the full run.

### B — apparatus sensitivity control

Construct another independent world with one declared actor input delayed by exactly one canonical tick.

**Gate:** the apparatus must detect the change at the first affected post-step boundary. A harness that reports equality here is invalid.

### C — creation-order probe

Construct the same logical world while reversing only actor body creation order, preserving stable actor identity and canonical slot-ordered input application.

This cell is diagnostic, not pre-judged PASS/FAIL:

- if it remains identical, record that result only for this bounded scene;
- if it diverges, record the first divergent tick/component and promote canonical creation ordering from precaution to demonstrated application-level determinism requirement.

Do not repair or normalize the result inside Q1a.

## Q1a PASS

Q1a passes only if:

1. exact independent twins remain bit-identical across the full coupled ledger;
2. the one-tick perturbation is detected at the expected first affected boundary;
3. the creation-order probe produces an interpretable result with first-divergent-tick evidence if it differs;
4. the output records exact revision, package/version contract and run parameters.

Q1a PASS means only:

> **the first-divergent-tick apparatus is trustworthy enough to carry into real browser/device qualification.**

It does **not** mean Multi_World is cross-platform deterministic.

## Natural stop

Stop immediately after Q1a result interpretation.

Do not in this stage:

- change F5 temporal semantics;
- tune prediction lead/history;
- add smoothing;
- design reconnect/world persistence;
- build a generic hashing/telemetry framework;
- ask the Owner for phone testing.

If Q1a passes, the next candidate is a bounded Q1b that reuses the same ledger/fingerprint contract in actual browser runtimes and compares authority/desktop/phone or the cheapest faithful subset. If Q1a exposes application-order divergence, first decide whether the existing F5 canonical ordering already closes it or whether a smaller ordering hardening experiment is required.