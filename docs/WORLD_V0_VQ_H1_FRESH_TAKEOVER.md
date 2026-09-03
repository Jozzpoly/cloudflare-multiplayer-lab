# Multi_World — Shared Yard V0 / VQ-H1 fresh takeover mandate

**Canonical handoff head when written:** `world-v0-shared-yard@80e40685ae7d0a70ca5f5ae6ce8fadd64f3c94b3`

**Status:** `PREPARATION COMPLETE / EXECUTION PLAN READY`

**Product implementation:** `BLOCKED — VQ-H1 VALIDATION HARDENING, THEN OWNER/DEVICE A/B`

This is the startup mandate for the fresh execution conversation. It is deliberately shorter than the full dossier. The new agent must still read the canonical documents below before acting.

---

## 1. Grounding order

Repo:

`Jozzpoly/cloudflare-multiplayer-lab`

Verify live branch:

`world-v0-shared-yard`

Expected handoff head at creation:

`80e40685ae7d0a70ca5f5ae6ce8fadd64f3c94b3`

If live head differs, inspect the intervening commits before proceeding. Documentation/provenance-only movement is acceptable if it does not invalidate this mandate; runtime/harness movement must be explicitly reconciled.

Read in this order:

1. `docs/WORLD_V0_PEER_AWARENESS_READINESS.md`
2. `docs/WORLD_V0_PEER_AWARENESS_REMOTE_GATE.md`
3. this file `docs/WORLD_V0_VQ_H1_FRESH_TAKEOVER.md`
4. issue #8 newest preparation checkpoint
5. PR #32 current state

Then verify the relevant live implementation/harness seams before changing anything:

- `scripts/world-v0-authority-runtime-smoke.mjs`
- `scripts/world-v0-chromium-cloud-smoke.mjs`
- `.github/workflows/world-v0-staging-cloud-smoke.yml`
- `public/world-v0/app.js`
- `public/world-v0/build-contract.js`

Qualified Presence runtime anchor:

`9572329f1e077fb5d365c8c28c39b476a3e7b2ca`

Qualified/clean runtime Git tree:

`50a68de38db2b40eeaf8be5e73def3100d3aee05`

Premature PEER-indicator scaffold `b5da62f2...` was intentionally withdrawn. Do not resurrect it by momentum.

PR #32 remains **draft / DO NOT MERGE**.

---

## 2. First and only initial execution stage: VQ-H1

Do **not** begin camera, HUD, off-screen PEER cue, Core physics expansion, Foundation redesign or Owner PLAY first.

The immediate task is validation apparatus hardening because the pre-handoff remote qualification exposed an evidence-harness defect.

Workflow carrying the key pre-handoff evidence:

`33807169991`

Staging deploy used by that gate:

- trigger SHA `f6b0338aba99859a73739149cec9357a6006742b`
- Build ID `45a2b036-8a98-4619-9577-00d03ce5327d`
- Version ID `0a4d7870-51a5-4e2c-9526-2a59d8dbe974`

Observed evidence:

- ordinary local regression repeatedly PASS;
- local exact-state first run starved and dead-manned with zero state mismatch, then same-SHA rerun PASS;
- remote authority attempt 1: socket closed before required `world_v0_epoch_ended` evidence;
- remote authority attempt 2: protocol path reached final assertions but prop displacement only `0.0035911018731132195 m`.

Demonstrated harness flaw:

`world-v0-authority-runtime-smoke.mjs` currently assigns synthetic `+X/-X` movement by peer-array creation order, while authoritative slot assignment arrives asynchronously in `world_v0_welcome`. The physical stimulus can therefore be wrong on real staging even while protocol assertions remain healthy.

The failed run did not emit enough slot/input provenance to prove that inversion occurred in that exact attempt. Do not overclaim it. Harden observability and stimulus, then retest.

---

## 3. VQ-H1 required scope

### H1.1 deterministic physical stimulus

Preferred approach:

- after authoritative B(0), identify each controlled actor from actual session/slot state;
- derive the central interaction target from the actual central barricade props (`prop-0..prop-5`) or an equivalently explicit B(0)-derived target;
- compute normalized actor→target XZ input;
- make the probe invariant to socket/peer-array order;
- assert distinct authoritative slots separately.

Do not merely hide the current symptom by lowering the prop-displacement threshold.

### H1.2 failure observability

Every authority-smoke failure must provide enough evidence to classify it without another instrumentation commit:

- peer-array index;
- authoritative slot/session identity;
- B(0) actor position;
- physical target and chosen input vector;
- accepted/late/rejected/relayed/fresh counts;
- latest boundary and snapshot count;
- max prop displacement;
- lease-expired observations;
- epoch-ended seen/reason;
- WebSocket close code/reason/order when available.

### H1.3 permutation/unit falsifier

Prove the stimulus helper remains correct when peer order / slot assignment is permuted.

### H1.4 local + repeated staging authority boundary

After hardening:

1. standard CI / frozen-F5 checks PASS;
2. local authority smoke PASS;
3. isolated staging authority smoke PASS;
4. rerun staging authority on the **same deployed SHA** and require a second PASS.

Because a separate premature-close signature was observed before hardening, recurrence of that signature after deterministic-stimulus hardening is a STOP condition requiring lifecycle/transport diagnosis. Do not rerun until green by chance.

### H1.5 Chromium launcher A/B

Current exact-state Chrome launch uses `--disable-gpu` and can rely on deprecated automatic SwiftShader fallback. The first same-SHA qualification attempt showed severe hosted-runner starvation, but no state divergence, and the rerun passed.

Run a bounded same-runtime comparison:

- current launcher;
- explicit documented SwANGLE/SwiftShader launcher.

Do not weaken canonical input lease/dead-man semantics, exact-state guard, active-tick requirement or guard-match requirement to improve CI success rate.

A launcher change is earned only if it preserves correctness and removes a harness dependency/confounder.

### H1.6 final VQ-H1 machine gate

VQ-H1 closes only with:

- local exact-state PASS;
- staging authority PASS twice on one deployment;
- remote two-process Chromium exact-state PASS;
- zero state mismatch / pending guard / remap failure / runtime failure at verdict;
- production World V0 isolation PASS.

One recorded hosted-runner starvation failure with zero state mismatch may justify one exact same-SHA retry. Recurrent starvation is a harness problem to harden, not a success to average into existence.

---

## 4. Natural STOP boundary after VQ-H1

When VQ-H1 passes, **stop implementation work** and prepare the Owner/device baseline. Do not immediately implement C1/C2/C3.

Owner A/B then compares the qualified baseline with phone slot order swapped:

- Run A: Android joins first → phone slot 0;
- Run B: desktop joins first → phone slot 1;
- use fresh Run keys/epochs;
- natural play, not a scripted movement benchmark.

The purpose is to separate:

- slot-dependent camera bias;
- portrait viewport limitation;
- actual active-play PEER-awareness need;
- Foundation/input/performance/feel issues.

Only after Owner evidence may one product outcome be selected:

- C0 no change;
- C1 slot-symmetric inward follow;
- C2 temporary establishing view;
- C3 contextual off-screen PEER cue;
- C4 later higher-coupling two-target camera if simpler options fail.

C0 is a legitimate win.

---

## 5. Operating constraints

- Treat previous recommendations as candidates, not obligations.
- Do not lower thresholds or relax contracts merely to make qualification green.
- Separate harness/evidence failures from runtime/product failures.
- Preserve provenance for failed attempts.
- Keep causal blast radius bounded.
- If evidence contradicts the VQ-H1 diagnosis, revise the diagnosis rather than forcing the prepared plan.
- Do not reopen detached Foundation labs unless new evidence actually challenges the qualified envelope.
- Do not merge PR #32.

---

## 6. Completion report expected from the fresh conversation

At VQ-H1 natural boundary, report explicitly:

- exact final SHA;
- what changed in harness versus runtime;
- permutation/unit evidence;
- local authority result;
- both same-deployment remote authority results;
- local exact-state result;
- remote exact-state result;
- production-isolation result;
- any retained nonclaims/flakes;
- verdict `VQ-H1 PASS` or `VQ-H1 NOT PASS`;
- whether Owner A/B is now authorized.

Do not begin the Owner-requested product implementation merely because VQ-H1 passes. The Owner/device A/B judgement remains the next separate gate.
