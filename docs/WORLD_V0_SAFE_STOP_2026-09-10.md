# World V0 — Safe Stop / Recovery Map — 2026-09-10

Status: **ACTIVE CLOSURE CONTRACT**

## Purpose

World V0 has passed its final two-player qualification. This document defines how to clean the repository without losing product authority, reproducibility or useful provenance before the next multiplayer era begins.

The cleanup is intentionally conservative: branch count reduction is useful, but preservation of unique evidence and simple recovery matters more than reaching an aesthetically minimal number of refs.

## Frozen anchors

### Exact qualified product

`7755a668d7488f04ecbf42a00fbc96fcb978d544`

Permanent recovery ref:

`archive/world-v0-qualified-2p-baseline-2026-09-10`

### Exact final delivery/provenance

`fa5e45594f0c39ba4e96c13b4ef783bbaae1ba65`

Permanent recovery ref:

`archive/world-v0-final-delivery-2026-09-10`

### Pre-safe-stop main

`829deef82c71780d2d661e7a7e82685739d7b23d`

Recovery ref:

`archive/pre-safe-stop-main-2026-09-10`

The exact qualified product is 139 commits ahead of the pre-safe-stop `main` and 0 behind. Therefore the qualified history is linearly integrable without a merge rewrite.

## Evidence anchors

Final focused Owner-UI causal gate:

- run `34474057233` — SUCCESS;
- artifact `10150740652`;
- digest `sha256:62bb4b39cb70e46f280df7bfcae061a51bb5b72744a30817d456dc2c688df38d`.

Final Current Validation:

- run `34474343862` — SUCCESS;
- artifact `10151068683`;
- digest `sha256:728f0f5c7dfa68a6fb5f11ab04a1fd7e8b6c55f8d63b6d123255fb54ffa4827d`.

Final qualified-play delivery:

- run `34475199474` / job `102864191837` — SUCCESS;
- Cloudflare Version `1cc9a0fd-2fac-4d23-a75d-c66669ddee01`;
- artifact `10151181384`;
- digest `sha256:4d0cdc5eb04bf3dcafdbad4ccd469b2db24f7d372f1549212d7e0321e3f49553`.

Owner qualification:

- broad ordinary-play verdict: stable and smooth;
- final post-repair real-device sanity: 3/3 PASS.

## Cleanup classification

Every branch/workflow candidate should be classified into one of four buckets before deletion:

### A — canonical/live

Required for current operation, current docs or near-term continuation. Keep.

### B — archive/evidence witness

Not active development, but the ref uniquely improves recovery, evidence interpretation, or an important historical donor. Keep under a small explicit archive namespace when practical.

### C — redundant/consumed

Temporary materialize/probe/audit/delivery branches or one-shot workflows whose useful commits are already ancestors of the frozen product/archived delivery or whose result is fully anchored by immutable run/artifact/checkpoint references. Safe deletion candidate.

### D — uncertain

Any ref whose unique commits, external deployment meaning, evidence attachment or future donor value has not been established. Do not delete until resolved.

## Destructive-cleanup rules

Before deleting a ref, establish at least one of:

- its head is reachable from a retained canonical/archive ref; or
- its unique evidence is represented by retained immutable GitHub run/artifact/checkpoint references and its code is not needed as a donor; or
- an explicit replacement archive ref preserves the unique commit(s).

Do not bulk-delete based only on branch age or naming.

Do not alter or redeploy `cloudflare-multiplayer-lab-qualified-play` as part of repository hygiene.

Do not force-update `main`.

## Workflow policy

Retain reusable regression/qualification gates that still answer a live question cheaply and clearly.

Delete consumed one-shot materializers, delivery workflows and narrow falsifiers from the current canonical branch when:

- their decisive run/artifact is anchored;
- rerunning them would be unsafe, misleading or unnecessary;
- their implementation is recoverable through Git history/archive refs if later archaeology is required.

Historical workflow runs remain evidence even after their YAML is removed from the current branch.

## Main integration policy

The qualified runtime history is a descendant of the current `main`; no merge rewrite is needed.

Preferred closure shape:

1. finish docs/apparatus cleanup on `world-v0-safe-stop-closure` as descendants of final delivery/product history;
2. validate that protected runtime/product paths remain byte-identical to `7755a668...`;
3. run ordinary repository validation on the closure head;
4. fast-forward `main` to the validated closure descendant;
5. verify live `main` and archive anchors;
6. only then delete redundant active-looking working refs.

The canonical branch may therefore contain later documentation/apparatus-only commits while the qualified product authority remains exactly `7755a668...`.

## Scope guard

Safe stop is not permission to redesign multiplayer.

No implementation of 3+, persistence, authentication, roster replacement or solo waiting should enter this cleanup branch.

## Next-era seed intentionally retained

After cleanup, a high-priority near-term product change is:

> A player can enter a Yard alone, immediately inhabit and play in the physical world, and wait there for another player.

This is materially different from merely keeping a lobby/session reservation alive. It implies that the world can already exist as a playable world with one connected human and later admit another participant without treating the second connection as the event that creates gameplay itself.

It should be designed together with the known lifetime separation:

`world lifetime != roster lifetime != ActorSession lifetime != transport/device lifetime`

This is a seed for post-cleanup architecture work, not a hidden extension of the frozen fixed-2P baseline.

## Active tracker

GitHub issue #41: `World V0 safe stop / repository archaeology and cleanup`.

When cleanup completes, this document should remain as the recovery map while transient closure branches may be retired.