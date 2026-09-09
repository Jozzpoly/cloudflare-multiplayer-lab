# World V0 — Qualified Baseline Gate

Status: **OWNER-HUMAN QUALIFICATION PENDING**  
Prepared: **2026-09-09**  
Baseline runtime source: `main@3ffb3255892961feb2cc4362b80e2419c1a4c8a9`  
Qualified-play environment: `cloudflare-multiplayer-lab-qualified-play`

## Purpose

This gate consolidates the closed R1 Session Continuity and R2 Jump Reliability work into one ordinary playable baseline before any new product feature frontier is opened.

The target is not a new feature. It is the version we fought to earn:

- ordinary two-player Shared Yard entry;
- smooth and stable foreground play on representative placement;
- same-profile close-tab / ordinary reopen continuity while the ActorSession remains recoverable;
- R2 acknowledgement-driven jump delivery;
- no recurring false connection-loss / actor-resume churn caused by test placement;
- exact state guards remain clean.

Residual jump feel debt such as lack of coyote time or landing buffering is explicitly not a blocker unless it again becomes a dominant Owner-visible reliability failure.

## Why a new deployment environment is required

The earlier post-R2 Owner gate exposed a validation-apparatus defect. Remote GitHub-hosted CI touched fixed public staging room identities before the Polish Owner. Cloudflare Durable Objects are placed near their initial access and do not automatically migrate afterward, so the fixed staging Yards could be pinned far from the Owner and produce ~180–350 ms RTT, repeated authority-silence recovery and red connection notices.

A fresh run-specific Yard first touched by the Owner from Poland immediately returned the expected low-latency regime and removed recovery churn. The qualified baseline therefore uses a fresh Wrangler environment with an isolated Durable Object namespace.

Automation is forbidden from requesting the human room directory, public Yard status, `/world-v0/ws`, or any human run identity before the Owner performs first placement.

## Deployment contract

The qualified delivery workflow may:

- validate repository/runtime bytes locally;
- dry-run Wrangler locally;
- deploy the isolated `qualified_play` Worker;
- fetch only static `build-contract.js` and deployment provenance assets.

It must not instantiate a Shared Yard Durable Object.

The qualified runtime/product bytes must remain identical to the closed post-R2 baseline on `public/world-v0`, `src`, `package.json` and `package-lock.json`. Only deployment apparatus/configuration and qualification documentation may differ before Owner qualification.

## Owner-first placement procedure

After the workflow reports success:

1. On the Owner's first device in Poland, open the ordinary qualified-play entry page: `/world-v0/` without a `?run=` parameter.
2. Allow the public room directory to load. This is intentionally the first human-region access to the fresh qualified-play Shared Yard namespace.
3. Enter one ordinary Yard and wait for `waiting for peer`.
4. Open the same ordinary qualified-play entry page on the second device and join the same Yard through the normal room UI.
5. Play naturally for several minutes: movement, shared props and repeated jumps.
6. Close one game tab completely, reopen through the ordinary `/world-v0/` entry page and use the normal room UI to resume the reserved seat.
7. Continue ordinary play after resume.
8. Copy evidence from both devices at the end.

Do not use a special run-specific direct link for the qualification unless the ordinary entry path itself fails and a narrower falsifier is required.

## PASS judgement

This is primarily a product/human gate, not a synthetic benchmark. PASS requires all of the following together:

- Owner judges ordinary two-device play as broadly smooth and stable;
- no recurring red `Connection lost · restoring exact Shared Yard state…` notices during normal foreground play;
- same-profile close-tab -> ordinary room-list reopen restores the correct reserved ActorSession within the current recovery contract;
- jump is materially reliable enough that occasional residual feel imperfections no longer dominate play;
- `runtimeFailed = false` on both clients;
- exact state-guard mismatches remain `0`;
- ordinary foreground play shows no repeated `authoritySilenceResumes` / `rebases` cycle;
- RTT is consistent with representative European placement rather than the known US-contaminated ~180–350 ms regime.

The fresh Poland-first falsifier already demonstrated ~33 ms median / ~35 ms p95 on desktop with `authoritySilenceResumes = 0`, `rebases = 0`, and clean exact guards. Those values are evidence context, not a permanent hard SLO.

## FAIL classification

If the ordinary qualified-play flow is still unstable, do not open product feature work. Classify before changing runtime:

- high RTT from first Owner placement -> placement/environment assumption failed;
- low RTT but repeated authority-silence resume/rebase -> runtime recovery regression or hidden transport defect;
- continuity failure only after full tab close/reopen -> R1 product contract regression;
- canonical jump delivery missing under otherwise healthy transport -> R2 regression;
- only small grounded/contact timing imperfections -> residual controller/feel debt, not automatically a reliability-front reopening.

## What PASS earns

PASS establishes one solid current World V0 baseline that can be treated as the starting point for product-frontier re-grounding.

It does not itself authorize a particular next feature, account system, persistence model, richer world interaction, 3+ player expansion or MMO architecture. Those decisions happen only after this baseline is frozen and documented.
