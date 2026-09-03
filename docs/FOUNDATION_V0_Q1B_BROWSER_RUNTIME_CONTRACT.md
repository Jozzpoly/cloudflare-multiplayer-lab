# Multi_World Foundation v0 — Q1b browser runtime determinism contract

Status: **Q1b FROZEN PRE-EXECUTION CONTRACT / NOT FOUNDATION QUALIFICATION**  
Parent evidence: Q1a apparatus PASS, issue #8 checkpoint `5527575571`  
Branch: `foundation-v0-q1-determinism-envelope`

## Question

Q1a established that the first-divergent-tick apparatus can preserve exact equality for independent same-contract worlds and detect a known one-tick causal perturbation at the expected boundary.

Q1b asks the next strictly smaller question before any Owner/device work:

> **Does the same F5-like coupled simulation, expressed once as shared application code and driven by one canonical ledger, produce the same canonical float32 state history in Node/Wasm and a real headless Chromium/Wasm runtime on the same CI host?**

This is a runtime-envelope probe, not a production determinism claim.

## Why Node ↔ Chromium first

It is the cheapest faithful runtime split available without Owner attention:

- Node and Chromium execute the same application module through distinct JS/Wasm hosts;
- Chromium is the browser engine family used by the existing desktop/mobile F5 path;
- using the exact locally installed `box3d.js@0.1.1` browser module avoids CDN/version ambiguity;
- a failure here would make phone testing premature;
- a pass earns, but does not replace, later architecture/device variance evidence.

## Frozen scene and ledger

Q1b reuses the Q1a/F5-like workload:

- 60 Hz;
- 4 Box3D substeps;
- gravity `[0,-20,0]`;
- F5 floor and perimeter walls;
- 12 F5 dynamic props with the same dimensions/material/damping contract;
- 2 F5 capsule actors with the same starts/material/damping/motion-lock contract;
- `speed=5.2`, `accel=28`, `decel=36`;
- stable actor identity and canonical slot-ordered intent application;
- 600 canonical ticks;
- a ledger that drives the actors through the central prop field and produces coupled contact.

The simulation implementation is one browser-compatible shared module imported by both Node and Chromium. Q1b is therefore testing runtime execution of the same application semantics, not comparing two hand-copied implementations.

## Canonical state trace

After every physics step, sample actors and props in stable application identity order.

For every dynamic entity record:

- position;
- rotation;
- linear velocity;
- angular velocity.

Each scalar is converted to its exact IEEE-754 float32 bit pattern. The comparison is performed on the complete canonical trace, not only on a lossy metric or final-state hash.

If a difference occurs, report:

- first divergent boundary tick;
- first differing entity;
- component and axis;
- Node and Chromium float32 bit patterns and decoded values.

## Cells

### A — Node baseline

Run the shared simulation module with `box3d.js@0.1.1` imported through `box3d.js/inline` in Node 22.

### B — Chromium exact-contract runtime

Serve the research page locally and run a real headless Chromium/Chrome process. Browser Box3D must come from the exact installed repository package (`node_modules/box3d.js/dist/box3d.inline.mjs`), not a floating remote dependency.

**Gate:** complete Node and Chromium canonical traces are bit-identical for all 600 ticks.

### C — browser evidence-path sensitivity control

Run Chromium again with the same declared one-tick perturbation used by Q1a: actor 1 receives neutral input at target tick 90 instead of the canonical command.

Compare this trace against the Node baseline.

**Gate:** first divergence is detected at boundary tick 91.

## Q1b PASS

Q1b passes only if:

1. Node and exact-contract Chromium traces are bit-identical for all 600 coupled ticks;
2. max prop displacement exceeds `0.05 m`, proving the run entered dynamic coupling;
3. the Chromium perturbation is detected at the expected first divergent boundary `91`;
4. the evidence records Node version, Chromium version, package contract and exact branch head/run provenance.

A Q1b PASS means only:

> **For this F5-like workload on the tested Linux x64 CI host, Node/Wasm and Chromium/Wasm execute the shared application simulation bit-identically, and the browser evidence path can localize a known one-tick divergence.**

It does **not** qualify:

- Android/ARM or other CPU architecture determinism;
- Firefox/WebKit;
- Cloudflare Worker runtime determinism;
- reconnect/world epoch semantics;
- persistence;
- final NetEntityId schema;
- production synchronization architecture.

## Natural stop

Stop after Q1b result interpretation and provenance capture.

Do not request Owner phone evidence, redesign F5 timing, add smoothing, or start reconnect/persistence work inside Q1b.