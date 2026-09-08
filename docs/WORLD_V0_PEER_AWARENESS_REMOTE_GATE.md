# Shared Yard V0 — peer-awareness Owner-baseline remote gate

**Status:** `BLOCKED — VALIDATION HARNESS HARDENING REQUIRED`

This file records the isolated Cloudflare staging qualification attempted before the required Owner/device A/B baseline described in `WORLD_V0_PEER_AWARENESS_READINESS.md`.

It does **not** change or authorize any product/runtime implementation.

## Runtime under test

The presentation/runtime source was restored at:

`49fbd46cd656f0c38897df64e7a6916e3edb25d9`

That cleanup commit has the exact same Git tree as the local-L2-qualified Presence checkpoint `9572329f1e077fb5d365c8c28c39b476a3e7b2ca`:

`50a68de38db2b40eeaf8be5e73def3100d3aee05`

The remote-gate trigger was documentation-only:

`f6b0338aba99859a73739149cec9357a6006742b`

Cloudflare staging Connected Build on that exact SHA passed:

- service: `cloudflare-multiplayer-lab-staging`
- Build ID: `45a2b036-8a98-4619-9577-00d03ce5327d`
- Version ID: `0a4d7870-51a5-4e2c-9526-2a59d8dbe974`

Production isolation also passed: root production continued to return 404 for the World V0 asset.

## Qualification run

GitHub workflow:

`33807169991`

The first attempt and one clean failed-job rerun were performed without changing the SHA or runtime.

### Stable local evidence

Ordinary local-regression passed on both attempts:

- local Workerd authority / identity / dead-man smoke: PASS;
- Product Lab render matrix: PASS;
- real rendered Shared Yard shell: PASS.

Local exact-state L2 had one starvation failure followed by a clean PASS on the same SHA.

#### L2 attempt 1 — timing/starvation failure, not state divergence

Artifact:

`9913431688`

Both clients remained exact through the observed envelope:

- B167 / B162;
- `26` exact guard matches each;
- `0` guard mismatches;
- `0` pending guards;
- `0` remap failures;
- rollback/replay exercised;
- runtime failure false.

The hosted runner produced p95 frame times around `83–100 ms` and maxima near `1 s`; canonical input leases expired and both clients closed 1012 before the required long qualification boundary. This is a qualification-timing failure, not evidence of state divergence.

#### L2 attempt 2 — PASS

Artifact:

`9913478276`

digest:

`sha256:a2eb8bb894fe21540f81a72e6366af6a40e8014ed3e1a87b6df4fc2c9a67a88c`

Verdict:

`WORLD_V0_PASS_REAL_CHROMIUM_EXACT_STATE_ENVELOPE`

- Chrome `152.0.7977.64`;
- WorldEpoch `2a36f08d-02fd-4dd2-88f1-772b3f6f19a9`;
- SimBuildId `shared-yard-v0-sim-579c7aa172198390`;
- client A: B304, `43` exact matches, `0` mismatch, `0` pending, `0` remap failure, runtime failure false;
- client B: B305, `43` exact matches, `0` mismatch, `0` pending, `0` remap failure, runtime failure false;
- rollback/replay exercised on both clients;
- timing remains a hosted-runner stress/nonclaim.

This preserves the qualified-runtime hypothesis. The remote authority gate, not simulation exactness, is the current blocker.

## Remote authority failures

### Attempt 1

The target was ready on the correct staging build and production isolation passed. The first two-peer authority epoch then lost a socket before the client received required `world_v0_epoch_ended` evidence:

`ciA-... closed before epoch-ended evidence`

This signature remains unexplained. It must be revisited after the deterministic-stimulus flaw below is removed; do not silently classify it away.

### Attempt 2

The second remote run reached the final authority assertions, but:

`maxPropDisplacement = 0.0035911018731132195`

and failed the required `> 0.05 m` physical-interaction witness.

All assertions preceding prop displacement for that peer had already passed, including start, accepted/fresh scheduled input, finite snapshots, lease expiry and epoch-end reason.

## Demonstrated harness flaw

`world-v0-authority-runtime-smoke.mjs` currently binds synthetic movement to **peer-array creation order**:

- `peers[0] -> { x: +1, z: 0 }`
- `peers[1] -> { x: -1, z: 0 }`

Cloudflare assigns the authoritative player slot asynchronously in `world_v0_welcome`, and the smoke records `welcome.slot` but does not use it to choose the probe direction.

Therefore a remote socket-order inversion can make both actors move away from the central Yard while every protocol/fresh-input assertion remains valid. The final prop-displacement failure is then expected. This is a causal flaw in the evidence stimulus.

The specific failed run did not print slot/input provenance, so socket-order inversion is a strongly supported explanation, not a directly observed fact for that run. The next harness must make this observable.

## Required next stage — VQ-H1 validation hardening

This is the **first execution stage in the next conversation**. Do not start camera/HUD/physics product work before it closes.

Scope should remain test/evidence-only unless new evidence proves a runtime defect.

### H1.1 — deterministic authority stimulus

Replace peer-index movement assumptions with a direction derived from authoritative B(0) state.

Preferred design:

1. after `world_v0_start`, find the local controlled actor by `welcome.selfSessionId`;
2. derive a central interaction target from the actual B(0) central barricade props (`prop-0..prop-5` centroid);
3. normalize the actor-to-target XZ vector and use that as the canonical synthetic input;
4. make the calculation independent of peer-array order and slot assignment;
5. assert two distinct authoritative slots are present, but do not use creation order as semantic identity.

A simpler `slot0 => +X / slot1 => -X` mapping is acceptable as a bounded fallback, but B(0)-derived targeting is preferred because it is tied to the actual scene being qualified rather than an incidental socket ordering.

### H1.2 — failure observability

Any failed authority smoke must emit enough provenance to classify it without another code change:

- peer index and authoritative slot;
- self B(0) position;
- chosen probe input / target;
- accepted, late, rejected, relayed and consumed-fresh counts;
- latest boundary and snapshot count;
- max prop displacement;
- lease-expired count;
- whether epoch-ended was observed and its reason;
- WebSocket close code/reason and event ordering where available.

Preserve existing production-isolation, identity, guard-equality and wrong-epoch checks.

### H1.3 — deterministic helper/permutation falsifier

Before network qualification, prove the stimulus helper is invariant to peer-array ordering. Test both `[slot0, slot1]` and `[slot1, slot0]` / equivalent mocked B(0) peer permutations and verify each controlled actor still receives a vector toward the intended central interaction target.

### H1.4 — remote authority acceptance boundary

After hardening, on one already-deployed exact SHA:

- local authority smoke PASS;
- isolated staging authority smoke PASS;
- repeat the staging authority smoke on the same deployed SHA and require a second PASS.

Two same-deployment passes are justified because the pre-hardening gate also exposed one independent `closed before epoch-ended evidence` signature. If that close signature recurs after deterministic stimulus hardening, stop and investigate lifecycle/transport semantics; do not rerun until green by chance.

### H1.5 — Chromium qualification harness review

The current exact-state launcher uses `--disable-gpu` and relies on software WebGL fallback. Chrome 152 emitted the automatic SwiftShader fallback deprecation warning during the starvation failure.

Current Chromium documentation says automatic SwiftShader WebGL fallback is deprecated and explicitly supports SwANGLE via:

- `--use-gl=angle`
- `--use-angle=swiftshader`
- `--enable-unsafe-swiftshader`

Before changing the launcher, perform a bounded local A/B on the same runtime SHA:

- current launcher;
- explicit documented SwANGLE launcher.

Do not weaken the canonical dead-man, exact-state guard, `MIN_ACTIVE_TICKS`, or `MIN_GUARD_MATCHES` to make hosted CI green. Prefer the explicit mode only if evidence shows it preserves the same browser path/correctness and removes the deprecated fallback dependency without creating a new confounder.

### H1.6 — final machine boundary before Owner baseline

Only after the hardened authority gate is stable:

1. local two-process Chromium exact-state PASS;
2. isolated staging authority PASS twice on the same deployment;
3. remote two-process Chromium exact-state PASS;
4. zero exact-state mismatch / pending / remap / runtime failure at verdict;
5. production isolation PASS.

A hosted-runner starvation failure with zero state mismatch may be retried once on the exact same SHA only after its evidence is recorded. A recurrent starvation failure is a harness blocker and must be hardened rather than normalized.

## Owner gate remains after VQ-H1

Only after the machine boundary above passes should the planned Android/desktop slot-swapped Owner A/B baseline run.

No peer-awareness candidate (C0/C1/C2/C3/C4) is selected by this file.

PR #32 remains **draft / DO NOT MERGE**.
