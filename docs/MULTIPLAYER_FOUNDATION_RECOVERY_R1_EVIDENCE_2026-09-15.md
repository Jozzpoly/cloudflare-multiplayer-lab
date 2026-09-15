# Multiplayer Foundation — Gate 4C-R1 Evidence

Date: 2026-09-15

Verdict: **PASS — intentional real Cloudflare code-deployment restart only**

Campaign: `r1-deploy-restart-20260915`

This record preserves the executed evidence for Gate 4C-R1. It does not claim spontaneous eviction, hibernation, platform failover, migration, or product readiness.

## Qualification contract

The gate required a real two-deployment boundary against the same dedicated Durable Object namespace:

`deploy A → fresh constructor empty → independently rebuilt deterministic authority envelope → generation-1 SQLite publication → deploy B → different constructor nonce → generation 1 restored before /resume → exact continuation through tick 329`

Required resume assertions included:

- exact expected deployed commit before evidence acceptance,
- changed constructor nonce across deploy A/B,
- `restoreState = restored` before `/resume`,
- generation `1`, canonical tick `260`,
- physics payload `41829` bytes,
- exact continuation through tick `329`,
- post-checkpoint retire/replacement churn preserved.

## Deploy A — seed

Commit: `2b81e18b0a30c84edd6767617f0185c438a12189`

Cloudflare:

- Worker: `cloudflare-multiplayer-lab-foundation-recovery`
- Workers Build: `a6af4519-4f33-47c9-8da3-452095d27c05`
- Cloudflare version: `fe78e47f-7a4d-4b5c-a952-3d2da2001f0a`
- result: PASS

GitHub Actions:

- workflow run: `34917693666`
- seed job: `104218830007`
- result: PASS

Before remote publication the workflow independently rebuilt and verified the byte-capable Box3D producer/consumer path:

- box3d.js `5d5a3af049cccd9948b2b55bac4342414af0ef64`
- Box3D `8441b4a06d6d09dcfb0b0f704df4d847d1437b92`
- Emscripten `6.0.2`
- exact fresh Node/WASM continuation through tick `329`: PASS

Seed publication evidence:

- generation: `1`
- canonical tick: `260`
- constructor nonce: `3b1c92c4-d6c6-436b-9396-ce77c6812a50`
- envelope bytes: `279033`
- physics bytes: `41829`

Literal seed result:

`MULTIPLAYER FOUNDATION REMOTE RECOVERY SEED PASS · campaign=r1-deploy-restart-20260915 · build=2b81e18b0a30c84edd6767617f0185c438a12189 · instanceNonce=3b1c92c4-d6c6-436b-9396-ce77c6812a50 · envelopeBytes=279033 · physicsBytes=41829`

## Deploy B — resume

Commit: `6236c881851c0717aa2400aa80d6a996db1372ce`

Cloudflare:

- Workers Build: `44102591-5347-4f75-ba54-287762c64c08`
- Cloudflare version: `a6493629-83b6-490c-a15b-229cbcfd0e61`
- result: PASS

GitHub Actions:

- workflow run: `34917984970`
- resume job: `104219700774`
- result: PASS

Restored evidence:

- previous constructor nonce: `3b1c92c4-d6c6-436b-9396-ce77c6812a50`
- restored constructor nonce: `4ee25295-d1f9-4929-a5e1-c956a428c1fe`
- constructor nonce changed: `true`
- restored before `/resume`: `true`
- generation: `1`
- canonical tick: `260`
- payload SHA-256: `2d73de5e6cd0f16da9283d67454519df8aa8791872d1b966bf97a5a8fa468ecd`
- physics byte length: `41829`
- expected frame count: `69`
- exact frame count: `69`
- resumed through tick: `329`
- final actor IDs: `actor:0`, `actor:1`, `actor:3`, `actor:5`, `actor:6`, `actor:7`

Literal qualification result:

`MULTIPLAYER FOUNDATION REMOTE DEPLOYMENT RESTART PASS · campaign=r1-deploy-restart-20260915 · build=6236c881851c0717aa2400aa80d6a996db1372ce · constructorNonceChanged=true · restoredBeforeResume=true · exactThrough=329`

Resume artifact:

- name: `foundation-recovery-remote-resume-34917984970`
- artifact ID: `10376773011`
- size: `1218` bytes
- SHA-256: `b5b8d7c544e404f6f39e7a0b4fe6c426302b70ae27b05d60869f703017b500be`

## Post-campaign disarm

After the PASS, the remote trigger was explicitly restored to:

- `campaignId = unarmed`
- `phase = idle`
- `expectedPreviousInstanceNonce = null`

Disarm commit: `afea5cc285e71e0b5f9f535e024448083ae6f06e`

Cloudflare:

- Workers Build: `3d088140-d2eb-4f29-9743-c1b0f08c2e44`
- Cloudflare version: `0f7c9f3d-ce37-43dd-ad8f-ba494ed32c9c`
- result: PASS

The exact idle runtime verifier also passed against the disarmed commit.

## Environment blocker discovered and removed

Workers Builds initially failed at the first CMake configure boundary because host `cmake` was absent. GitHub Actions had CMake, so the assumption had remained hidden during earlier qualification.

The failure was bisected to `emcmake cmake ...`; the builder now bootstraps pinned CMake `3.31.6` into a build-local directory instead of depending on host state.

Evidence anchors:

- `7c88b4bbe6d1e1d53d50d3284060ac7d4cab0887` — CMake bootstrap probe PASS.
- `c68714f8edc59d6ab909c6469e523288fb63afab` — full canonical recovery bundle PASS.
- `a30d20aee538af72798f18b473a05fcbd2e8d973` — first real idle deploy PASS after remediation.

## Scope boundary

R1 demonstrates that the qualified authority checkpoint can survive an **intentional real Cloudflare code deployment** and be restored by a fresh Durable Object constructor before explicit resume, with exact continuation under the qualified deterministic driver.

R1 does **not** demonstrate:

- spontaneous eviction/hibernation recovery,
- Cloudflare platform restart/failover recovery,
- regional migration,
- adapter/checkpoint compatibility across engine upgrades,
- large-world operational policy,
- product readiness.

Any next remote durability claim requires a new named gate and independent evidence.
