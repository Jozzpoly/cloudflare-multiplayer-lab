# Multiplayer Foundation — Recovery Live State

Date: 2026-09-15

Status: **Gate 4A PASS / Gate 4B PASS / Gate 4C local stack L1–L4b PASS / Gate 4C-R1 PASS for intentional real Cloudflare code-deployment restart / not product-qualified**

This document is the current recovery/persistence source of truth. Claims are limited to executed evidence. Earlier detailed archaeology remains available in Git history; this snapshot intentionally keeps the defended state, evidence anchors, boundaries, and next research decision compact.

## Live truth

The recovery stack has now crossed the first real deployed Cloudflare restart boundary.

Defended path:

`live authority → deterministic portable envelope + pinned Box3D Recording bytes → transactional SQLite DO generation-1 publication → real Cloudflare code deployment → fresh Durable Object constructor → restore before request handling → explicit resume → exact continuation through tick 329`

The dedicated remote apparatus is isolated from staging/product Workers and is currently **disarmed**:

- branch: `research/multiplayer-foundation-recovery-remote`
- Worker: `cloudflare-multiplayer-lab-foundation-recovery`
- trigger: `phase = idle`, `campaignId = unarmed`
- disarm commit: `afea5cc285e71e0b5f9f535e024448083ae6f06e`
- disarm Cloudflare version: `0f7c9f3d-ce37-43dd-ad8f-ba494ed32c9c`
- exact idle runtime verification: PASS

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
- R1 seed repeated an independent producer/consumer rebuild before publication and passed with the final deterministic driver.

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

Executed deploy A / seed:

- commit `2b81e18b0a30c84edd6767617f0185c438a12189`
- Cloudflare version `fe78e47f-7a4d-4b5c-a952-3d2da2001f0a`
- workflow run `34917693666`, seed job `104218830007` — PASS
- independent exact Box3D producer/consumer rebuild — PASS
- generation `1` published at canonical tick `260`
- seed constructor nonce `3b1c92c4-d6c6-436b-9396-ce77c6812a50`
- deterministic envelope `279033` bytes
- physics payload `41829` bytes

Executed deploy B / resume:

- commit `6236c881851c0717aa2400aa80d6a996db1372ce`
- Cloudflare build `44102591-5347-4f75-ba54-287762c64c08` — PASS
- Cloudflare version `a6493629-83b6-490c-a15b-229cbcfd0e61`
- workflow run `34917984970`, resume job `104219700774` — PASS
- restored constructor nonce `4ee25295-d1f9-4929-a5e1-c956a428c1fe`
- constructor nonce changed: true
- restore state observed before `/resume`: `restored`
- restored generation `1`, canonical tick `260`
- restored payload SHA-256 `2d73de5e6cd0f16da9283d67454519df8aa8791872d1b966bf97a5a8fa468ecd`
- physics payload `41829` bytes
- exact frame count `69`
- exact continuation through tick `329`
- final actor IDs: `actor:0`, `actor:1`, `actor:3`, `actor:5`, `actor:6`, `actor:7`

Literal qualification result:

`MULTIPLAYER FOUNDATION REMOTE DEPLOYMENT RESTART PASS · campaign=r1-deploy-restart-20260915 · build=6236c881851c0717aa2400aa80d6a996db1372ce · constructorNonceChanged=true · restoredBeforeResume=true · exactThrough=329`

Resume evidence artifact:

- artifact `foundation-recovery-remote-resume-34917984970`
- artifact ID `10376773011`
- SHA-256 `b5b8d7c544e404f6f39e7a0b4fe6c426302b70ae27b05d60869f703017b500be`

The campaign was then explicitly disarmed and independently returned to exact `idle / unarmed` runtime state.

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

Remediation: build-local pinned CMake `3.31.6`, installed through the official Python wheel and added only to that build's `PATH`.

Evidence:

- `7c88b4bbe6d1e1d53d50d3284060ac7d4cab0887` — pinned CMake bootstrap PASS in Workers Builds.
- `c68714f8edc59d6ab909c6469e523288fb63afab` — full canonical recovery bundle PASS with pinned CMake.
- `a30d20aee538af72798f18b473a05fcbd2e8d973` — first real idle recovery Worker deploy PASS.

The recovery builder therefore no longer depends on an undeclared host CMake installation.

## Apparatus correction after R1

During R1, `.github/workflows/multiplayer-foundation-remote-idle-verify.yml` was found to run on every trigger change while always demanding `phase = idle`. That makes legal `seed` and `resume` phases produce a semantically false red idle check.

R1 was not modified mid-flight. The apparatus correction was intentionally deferred until after resume PASS and explicit disarm. The verifier now classifies the trigger first and runs the exact idle smoke only for `phase = idle`; `seed`/`resume` report an intentional idle-verification skip instead of a false failure.

## Defended findings

- Visible rigid-body fields are not an exact contact-world save state; hidden engine state matters.
- Seed-only Box3D Recordings can reconstruct worlds that accept new mutations and continue live simulation.
- Durable semantic truth, engine runtime checkpoint, transactional publication, and platform-specific reconstruction are distinct layers.
- Portable roster/event/input/topology state needs its own versioned checkpoint contract; exact physics alone is insufficient.
- Raw Recording bytes are build-specific recovery material, not a universal save format.
- Transactional immutable chunks + immutable manifest + atomic HEAD provide a robust publication boundary for the tested failures.
- A real Cloudflare code deployment created a fresh constructor that restored the persisted authority before `/resume` and continued exactly under the qualified deterministic driver.
- Exact cross-runtime qualification requires exactly representable host-side stimuli unless cross-runtime numeric behavior is separately qualified.

## Explicit non-claims

Still unproven:

- spontaneous real Cloudflare eviction or hibernation recovery,
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

Gate 4C-R1 must **not** be relabeled as spontaneous eviction, hibernation, failover, or migration evidence.

## Current next move

The controlled deployment-restart question is answered for this specimen. The next durability work should be chosen as a new explicit gate rather than silently extending R1.

A likely next research boundary is an independently evidenced spontaneous deployed constructor restart/eviction path, if Cloudflare provides a controllable or observable way to exercise it. That should be treated as a separate experiment with its own falsifier and stop conditions, not as an automatic consequence of R1.

Separately, eventual product use still needs packaging/version/fingerprint/upgrade policy for the custom Workers-compatible Box3D adapter. R1 is strong architecture evidence; it is not product qualification.
