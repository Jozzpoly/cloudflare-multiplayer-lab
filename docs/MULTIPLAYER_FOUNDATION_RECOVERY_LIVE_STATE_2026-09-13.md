# Multiplayer Foundation — Recovery Live State

Date: 2026-09-15

Status: **Gate 4A PASS / Gate 4B PASS / Gate 4C local stack L1–L4b PASS / Gate 4C-R1 PASS for intentional deployed code-restart recovery / Gate 4C-R2 PASS for same-build idle hibernation recovery / not product-qualified**

This document is the current recovery/persistence source of truth. Claims are limited to executed evidence. Earlier detailed archaeology remains available in Git history; this snapshot intentionally keeps the defended state, evidence anchors, boundaries, and stop conditions compact.

## Live truth

The recovery stack has crossed two distinct real deployed Cloudflare lifecycle boundaries:

1. **R1 — intentional code deployment restart**

   `live authority → deterministic portable envelope + pinned Box3D Recording bytes → transactional SQLite DO generation-1 publication → real Cloudflare code deployment → fresh Durable Object constructor → restore before request handling → explicit resume → exact continuation through tick 329`

2. **R2 — same-build idle hibernation**

   `single deployed build → generation-1 publication → 30 s no requests to the Durable Object → fresh constructor → restore before resume → exact continuation through tick 329 → another 30 s idle interval → another fresh constructor → restore before resume → exact continuation through tick 329`

The dedicated remote apparatus is isolated from staging/product Workers and was explicitly disarmed after R2:

- branch: `research/multiplayer-foundation-recovery-remote`
- Worker: `cloudflare-multiplayer-lab-foundation-recovery`
- trigger contract: `multiplayer-foundation-remote-recovery-trigger-v2`
- expected resting trigger: `phase = idle`, `campaignId = unarmed`
- explicit post-R2 disarm commit: `0d0dab82296b1c4598dd84aed0251d875644ec52`
- post-R2 disarm Cloudflare version: `bf2dd1a2-281e-4a8e-8d0b-1c6aad079151`
- exact post-R2 idle runtime verification: PASS, run `34956316374`

Later closure-only commits may advance the branch while preserving `idle / unarmed`; live branch SHA must still be checked before any future campaign.

## Gate status

### Gate 4A — in-process exact authority recovery

**PASS / scoped headless specimen.** Run `34782916504` reconstructed a six-actor / twelve-prop authority after destroying the source Box3D world and remained exact through post-restore topology churn.

### Gate 4B — fresh-process exact authority recovery

**PASS / scoped isolated-build specimen.** Recovery uses an owned Recording-byte bridge because the qualified upstream package does not expose the required supported byte export/import path.

Pinned provenance:

- box3d.js `5d5a3af049cccd9948b2b55bac4342414af0ef64`
- Box3D `8441b4a06d6d09dcfb0b0f704df4d847d1437b92`
- Emscripten `6.0.2`
- Workers build profile: `static-wasm-csp-safe-byte-bridge-v1`

Key evidence:

- run `34783226902` — active-contact byte bridge PASS.
- run `34783461543` — fresh Node/WASM consumer restored the full authority and remained exact through tick `329`; wrong engine/hash/boundary rejected before restore.
- remote campaigns independently rebuilt the pinned producer/consumer path before publishing recovery material.

### Gate 4C-L1 — transactional checkpoint store

**PASS / scoped fault campaign.** Run `34784584096` defended:

`immutable content-addressed chunks → immutable manifest → atomic HEAD`

Interrupted future generations did not damage current recoverable truth; corruption and stale generations fail closed.

### Gate 4C-L2 — SQLite-backed Durable Object restart

**PASS / scoped local workerd specimen.** Run `34784856828` exercised real `ctx.storage.sql`, process death, persisted restart with changed constructor nonce, exact recovery, duplicate-generation rejection, and post-restart publication.

### Gate 4C-L3 — full authority envelope through durable restart

**PASS / scoped composition specimen.** Run `34785027968` proved full authority envelope publication through chunked SQLite DO storage, full workerd death, fresh constructor, fresh Node/WASM restore, and exact continuation through tick `329`.

### Gate 4C-L4a — Box3D inside workerd

**PASS / scoped Workers-runtime capability specimen.** Run `34786781239` established the CSP-safe static-WASM adapter needed by Workers, including `-sDYNAMIC_EXECUTION=0` and bounded engine rebind tokens.

### Gate 4C-L4b — fresh Durable Object constructor recovery

**PASS / scoped local Wrangler/workerd specimen.** Primary evidence: run `34788380888`, confirmed by run `34788569624`.

The second constructor had to report `restored` before `/resume`, restore generation `1` at tick `260`, preserve the `41829`-byte physics payload, change constructor nonce, and continue exactly through tick `329` including retire/replacement churn.

### Gate 4C-R1 — deployed Cloudflare deployment-restart recovery

**PASS / scoped intentional real Cloudflare code-deployment restart.** Campaign: `r1-deploy-restart-20260915`.

Seed deployment:

- commit `2b81e18b0a30c84edd6767617f0185c438a12189`
- Cloudflare version `fe78e47f-7a4d-4b5c-a952-3d2da2001f0a`
- workflow run `34917693666`, seed job `104218830007` — PASS
- generation `1` published at canonical tick `260`
- seed constructor nonce `3b1c92c4-d6c6-436b-9396-ce77c6812a50`
- deterministic envelope `279033` bytes
- physics payload `41829` bytes

Resume deployment:

- commit `6236c881851c0717aa2400aa80d6a996db1372ce`
- Cloudflare build `44102591-5347-4f75-ba54-287762c64c08` — PASS
- Cloudflare version `a6493629-83b6-490c-a15b-229cbcfd0e61`
- workflow run `34917984970`, resume job `104219700774` — PASS
- restored constructor nonce `4ee25295-d1f9-4929-a5e1-c956a428c1fe`
- constructor nonce changed: true
- restore observed before `/resume`: `restored`
- restored generation `1`, canonical tick `260`
- payload SHA-256 `2d73de5e6cd0f16da9283d67454519df8aa8791872d1b966bf97a5a8fa468ecd`
- physics payload `41829` bytes
- exact frame count `69`
- exact continuation through tick `329`

Literal qualification result:

`MULTIPLAYER FOUNDATION REMOTE DEPLOYMENT RESTART PASS · campaign=r1-deploy-restart-20260915 · build=6236c881851c0717aa2400aa80d6a996db1372ce · constructorNonceChanged=true · restoredBeforeResume=true · exactThrough=329`

Resume evidence artifact:

- artifact `foundation-recovery-remote-resume-34917984970`
- artifact ID `10376773011`
- SHA-256 `b5b8d7c544e404f6f39e7a0b4fe6c426302b70ae27b05d60869f703017b500be`

R1 qualifies an intentional code-deployment restart. It must not be used as evidence for idle hibernation, regional failover, host failure, or migration.

### Gate 4C-R2 — deployed same-build idle hibernation recovery

**PASS / scoped real Cloudflare idle-hibernation specimen.** Campaign: `r2-hibernate-20260915`.

Single deployed campaign build:

- commit `d1a77d24458887b5e091e2141796dc193faa5385`
- Cloudflare build `94c63989-41bb-4eb4-9862-97772bf38f91` — PASS
- Cloudflare version `b9d0986c-f72b-4469-be48-e019ff6511e2`
- workflow run `34920863776`, hibernate job `104228772326` — PASS
- `idle`, `seed`, and `resume` jobs were intentionally skipped; only the `hibernate` path executed

Independent recovery material qualification immediately before the remote lifecycle test:

- pinned Box3D producer rebuild — PASS
- fresh Node/WASM consumer — PASS
- source Recording/world destroyed before consumer restore
- wrong engine/hash/boundary rejected before restore
- envelope bytes `279033`
- envelope SHA-256 `2d73de5e6cd0f16da9283d67454519df8aa8791872d1b966bf97a5a8fa468ecd`
- physics payload `41829` bytes
- generation `1`, canonical tick `260`
- chunk count `9`

The remote test then held the deployed SHA constant and exercised two independent idle cycles. `/build` was used only as a no-DO-touch build identity control; the endpoint explicitly reports `durableObjectTouched = false` and does not resolve a Durable Object stub.

Constructor chain:

- seed instance A: `4f8fd281-9e14-4eb2-9f97-3c8e2dca7851`
- cycle 1: `30010 ms` quiet → restored instance B `4053ca57-13cb-4799-b709-b1ee6e0cbda7`
- cycle 2: `30010 ms` quiet → restored instance C `4b2a71b8-671d-45f1-b1fb-efb14d3ebca3`

For both cycles:

- deployed build remained exactly `d1a77d24458887b5e091e2141796dc193faa5385`
- no request was sent to the Durable Object during the 30-second quiet interval
- the first post-quiet DO observation reported a different `instanceNonce`
- `instanceNonce` is created on Durable Object class instantiation, not by `/resume`
- constructor recovery had already reached `restoreState = restored` before `/resume`
- restored generation `1`, canonical tick `260`, the same envelope SHA, `41829` physics bytes, and expected frame count `69`
- `/resume` stayed on that restored instance and matched all `69` expected frames exactly through tick `329`
- post-checkpoint retire/replacement churn remained exact

Literal qualification result:

`MULTIPLAYER FOUNDATION REMOTE HIBERNATION RECOVERY PASS · campaign=r2-hibernate-20260915 · build=d1a77d24458887b5e091e2141796dc193faa5385 · cycles=2 · quietMs>=30000 · sameBuild=true · restoredBeforeResume=true · exactThrough=329`

R2 evidence artifact:

- artifact `foundation-recovery-remote-hibernation-34920863776`
- artifact ID `10377882958`
- artifact ZIP SHA-256 `384bc36d04e99234b322b84e1642662e643d36bfbbff0f29f614f4f5c76ac18a`

Cloudflare's Durable Object lifecycle documentation states that an idle hibernateable object currently transitions to hibernated after about 10 seconds of inactivity when the documented eligibility conditions are satisfied; its in-memory state is discarded, and the next incoming request/event runs the Durable Object constructor again. The R2 apparatus used 30-second no-DO-request intervals and observed exactly that constructor-reentry signature twice while the deployed build remained unchanged.

Lifecycle reference: <https://developers.cloudflare.com/durable-objects/concepts/durable-object-lifecycle/>

R2 therefore qualifies **same-build idle hibernation recovery for this specimen**. It does not qualify every mechanism that can also produce a constructor restart.

## Workers Builds environment finding

The first remote deployment path failed before Box3D compilation because the Workers Builds host did not provide `cmake` in `PATH`, while the qualified GitHub Actions environment did.

The failure was bisected rather than worked around blindly:

- source checkout and pinned SHAs: PASS
- owned source patches: PASS
- `pnpm install --frozen-lockfile`: PASS
- `pnpm build`: FAIL
- single-threaded Box3D static library path: FAIL
- isolated `emcmake cmake ...` configure boundary: FAIL
- explicit probe confirmed host CMake absent

Remediation: build-local pinned CMake `3.31.6`, installed through the Python wheel and added only to that build's `PATH`.

Evidence:

- `7c88b4bbe6d1e1d53d50d3284060ac7d4cab0887` — pinned CMake bootstrap PASS in Workers Builds.
- `c68714f8edc59d6ab909c6469e523288fb63afab` — full canonical recovery bundle PASS with pinned CMake.
- `a30d20aee538af72798f18b473a05fcbd2e8d973` — first real idle recovery Worker deploy PASS.

The recovery builder therefore no longer depends on an undeclared host CMake installation.

## Apparatus corrections and closure

R1 exposed that the idle verifier originally ran on every trigger change while always demanding `phase = idle`, causing legal armed phases to produce a semantically false red check. That was corrected after R1: the verifier classifies the trigger and runs the exact idle smoke only for `phase = idle`.

R2 added a separate `hibernate` phase so the complete hibernation experiment could execute on one unchanged deployed SHA. Changing phase via another commit during the experiment would itself have caused a deployment restart and invalidated the claim.

Post-R2 closure also makes stale idle-verifier runs cancellable. This is intentionally limited to the idle-verification workflow; the recovery campaign workflow remains `cancel-in-progress: false` so an armed evidence campaign cannot be silently replaced by a later run.

The account-side Workers Builds root is the repository root. Root `package.json` and root `.node-version` are authoritative for deployment tooling; redundant child-root copies created during early account-configuration diagnosis are not part of the qualified deploy path.

## Defended findings

- Visible rigid-body fields are not an exact contact-world save state; hidden engine state matters.
- Seed-only Box3D Recordings can reconstruct worlds that accept new mutations and continue live simulation.
- Durable semantic truth, engine runtime checkpoint, transactional publication, and platform-specific reconstruction are distinct layers.
- Portable roster/event/input/topology state needs its own versioned checkpoint contract; exact physics alone is insufficient.
- Raw Recording bytes are build-specific recovery material, not a universal save format.
- Transactional immutable chunks + immutable manifest + atomic HEAD provide a robust publication boundary for the tested failures.
- A real Cloudflare code deployment created a fresh constructor that restored persisted authority before `/resume` and continued exactly under the qualified deterministic driver.
- On the same deployed Cloudflare build, documented idle hibernation recreated the Durable Object constructor twice; both constructors restored persisted authority before continuation and stayed exact through tick `329`.
- Exact cross-runtime qualification requires exactly representable host-side stimuli unless cross-runtime numeric behavior is separately qualified.

## Explicit non-claims

Still unproven or intentionally outside this qualification:

- the distinct **non-hibernateable** 70–140 second idle eviction path,
- host/process crash recovery as a separately identified mechanism,
- platform restart/failover or regional migration recovery,
- active authority migration between regions/hosts,
- runtime-checkpoint compatibility across Box3D/box3d.js upgrades,
- production packaging/distribution and upgrade policy for the custom Workers-compatible adapter,
- arbitrary cross-runtime bit identity for host-JS transcendental math,
- large-world checkpoint sizing/cadence and garbage collection,
- rollback networking,
- large-world partitioned persistence,
- browser `self + N` bootstrap/recovery,
- real human 3–6 player qualification,
- universal donor qualification,
- product readiness.

R2 must not be relabeled as regional failover, host-crash, migration, or universal eviction evidence merely because all of those can eventually lead to a constructor restart.

## Stop condition and current next move

The isolated recovery campaign has now answered the two material lifecycle questions that justified this lane for the present specimen:

1. persisted authority survives an intentional real Cloudflare code-deployment restart and resumes exactly;
2. persisted authority survives documented same-build idle hibernation, including repeated constructor recreation, and resumes exactly.

**Do not automatically create R3/R4/R5 durability gates.** Further platform-lifecycle experiments should require a concrete architecture decision that cannot be made from current evidence.

The strongest remaining durability debt before product use is no longer “can this authority survive the tested constructor-loss boundaries?” It is productization and scale:

- package/version/fingerprint/upgrade policy for the custom Workers-compatible Box3D byte adapter;
- checkpoint cadence, sizing, retention and garbage collection under realistic world scale;
- integration of the qualified recovery layers into the actual multiplayer/world topology only when product needs justify it.

The next project move should therefore be re-grounded from the broader Multi_World product/research frontier rather than continuing this isolated recovery lane by inertia. R1/R2 are strong architecture evidence, not a mandate to turn persistence research into the product itself.
