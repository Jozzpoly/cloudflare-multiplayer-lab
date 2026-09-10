# World V0 — Stabilization Polish Ledger

Status: **POLISH CLOSURE / FINAL OWNER GATE PENDING**  
Date: **2026-09-10**  
Frozen product: `fef4a2a4b6007c3e42cbd3b430cb9943343cc970`  
Polish branch: `world-v0-foundation-polish-closure`

## Purpose

This ledger records the bounded polish/repair/cleanup pass performed after the broad adversarial verification campaign. It is intentionally not a new feature plan and does not rewrite Project Soul.

The governing rule is:

> improve trust, maintainability and takeover truth without changing the frozen gameplay/runtime unless a new falsifier requires it.

## 1. Product preservation

The polish branch was created from exact frozen product `fef4a2a4...`.

Repeated compare checks confirm no polish changes in:

- `public/world-v0/**`;
- `src/**`;
- `package-lock.json`.

The only package change is `package.json` validation coverage. Product behavior remains the already delivered `fef4...` candidate.

## 2. Broad adversarial input to polish

Polish began only after the product-challenging phase reached its automated stop condition.

Primary campaign:

- branch `world-v0-foundation-adversarial-verification`;
- run `34428181101` — **SUCCESS / 8 of 8 jobs**;
- product under test `fef4a2a4...`;
- no product drift.

Additional authority race:

- run `34428538218` — **SUCCESS**;
- seven near-simultaneous private Resume versus unrelated fresh-admission races;
- both legal winner orders observed;
- no split-brain or double authoritative WorldEpoch.

## 3. Validation coverage repair

### Problem

The promoted product had added:

- `public/world-v0/authority-epoch-loss.js`;
- `public/world-v0/join-failure-clarity.js`;

and corresponding smoke tests, but the ordinary `npm run check` did not execute those new contract smokes.

### Repair

`package.json` `check:client` now includes syntax checks for both modules and runs:

- `scripts/world-v0-authority-epoch-loss-classifier-smoke.mjs`;
- `scripts/world-v0-join-failure-clarity-smoke.mjs`.

The standard repository check therefore once again covers the current stabilization product instead of relying on specialist one-shot workflows.

### Global Current Validation repair

`.github/workflows/world-v0-current-validation.yml` was also stale relative to the new product. It now:

- includes `world-v0-foundation-polish-closure` in its push branches;
- triggers on both new product modules and both smoke scripts;
- explicitly asserts authority-loss and join-failure revision markers;
- explicitly requires both smoke PASS markers in the ordinary repository-check step.

Final polish Current Validation run is recorded below when complete.

## 4. Dependency and toolchain audit

One-shot debt audit and toolchain audit established:

### Production graph

`npm audit --omit=dev`:

- info `0`;
- low `0`;
- moderate `0`;
- high `0`;
- critical `0`.

### Development graph

Full `npm audit` reports three high findings under the development-only chain:

`wrangler -> miniflare -> sharp`

Current frozen graph:

- Wrangler `4.127.1`;
- Miniflare `5.20260828.0-alpha`;
- sharp `0.35.2`.

An isolated candidate upgrade to Wrangler `4.130.0`:

- passed the complete repository validation;
- kept production vulnerabilities at zero;
- still reported the same three high dev-only findings;
- still resolved sharp `0.35.2`.

Decision: **do not churn the frozen toolchain merely to change the Wrangler version**. Keep this as bounded upstream dev-dependency debt until a candidate graph actually removes the advisory path.

Evidence: toolchain audit run `34429140500`, artifact `10133798229`, digest `sha256:7238ed80d4e2c4ba426b7c87510a1bc80c2ff6a792bd644f2c41521bfcdde22a`.

## 5. Canonical documentation reconciliation

The following documents were materially stale and have been refreshed on the polish branch:

- `MULTI_WORLD_CURRENT_STATE.md`;
- `MULTI_WORLD_TAKEOVER_INDEX.md`;
- `WORLD_V0_FOUNDATION_STABILIZATION_DIRECTION.md`;
- `WORLD_V0_QUALIFIED_BASELINE_GATE.md`;
- `WORLD_V0_AUTHORITY_EPOCH_LOSS_RESILIENCE.md`.

The refreshed spine now points to:

- frozen product `fef4a2a4...`;
- authority-loss checkpoint `5611456843`;
- broad adversarial checkpoint `5611643968`;
- qualified-play delivery run `34426803131`;
- Cloudflare Version ID `d62c2e72-c4d9-4124-8847-85815d715ff1`.

`MULTI_WORLD_PROJECT_SOUL.md` is intentionally unchanged. Formal project-role/Soul review remains a post-Owner-PASS safe-stop task.

## 6. Consumed workflow retirement

The polish pass removed active workflow files that had already completed their one-shot purpose and whose results remain preserved in Git history, Actions runs/artifacts and issue #8.

Retired categories include:

- authority-loss candidate/regression/promotion machinery;
- controlled pre-repair authority-reset baselines;
- direct-Resume outage/repair machinery;
- join-failure clarity repair workflow;
- vacant-capacity repair/refinement workflows;
- peer-departure isolation workflow;
- qualified deployment forensics;
- pre-Owner adversarial one-shot workflow;
- resumed-stayer local/remote/repetition/churn forensics;
- superseded old qualified-baseline delivery workflow;
- the polish-only toolchain audit workflow after its artifact was preserved.

These deletions remove active automation surface, not evidence. The underlying commits, specialist scripts and Actions artifacts remain available for provenance/reproduction.

## 7. Workflows deliberately retained

Do not interpret polish cleanup as a general workflow purge.

Important retained gates include:

- `.github/workflows/ci.yml`;
- `.github/workflows/world-v0-current-validation.yml`;
- `.github/workflows/world-v0-foundation-stabilization-causal-gate.yml`;
- `.github/workflows/world-v0-foundation-stabilization-delivery.yml`;
- `.github/workflows/world-v0-session-continuity-r1-qualification.yml`.

Older R0/R1/R2 workflows have not been broadly deleted during this pre-freeze pass. Their classification belongs to the larger post-freeze workflow/branch archaeology, where provenance can be reviewed as a whole.

## 8. Remaining final gate

No further synthetic reliability expansion is justified by momentum.

The remaining blocker is one representative **Owner adversarial human qualification** of the currently delivered `fef4...` candidate on representative Poland placement, including desktop and mobile.

Owner URL:

`https://cloudflare-multiplayer-lab-qualified-play.jozzpoly.workers.dev/world-v0/`

The Owner gate should judge natural play, smoothness, F5/live takeover, close/reopen Resume, capacity reuse, protected/soft/vacant transitions, stale-profile rejection, Yard cycling, keyboard text entry, error clarity, mobile background/return and recovery behavior.

## 9. After Owner PASS

Only after the final human gate passes:

1. freeze exact baseline and evidence anchors;
2. enter deliberate safe stop;
3. reconcile the stabilization product with the long-lived canonical repository branch;
4. classify remaining workflows and >150 branches as canonical, retained evidence/archive, superseded, disposable or unknown;
5. preserve provenance before deletion;
6. reduce active branch/workflow surface deliberately;
7. review Project Soul / repository role;
8. only then open the next multiplayer frontier, with 3+ players an early desired capability.

If Owner qualification instead finds a reproducible foundation failure, repair that specific falsifier before safe stop.

## 10. Stop condition

Polish is complete when:

- final Current Validation is green on the polish branch;
- compare against `fef4...` confirms zero runtime/source drift beyond validation/docs/workflow surfaces;
- documentation and operational takeover entrypoints describe the current product truth;
- consumed one-shot automation has been retired without deleting evidence;
- the final Owner test can begin without another preparatory feature or reliability campaign.
