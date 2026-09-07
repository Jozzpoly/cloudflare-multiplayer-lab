# World V0 R0d human-entry repair — 2026-09-07

## Status

**HUMAN ENTRY REPAIR QUALIFIED + DEPLOYED TO ISOLATED RELIABILITY WORKER / OWNER RETEST NEXT**

The first attempted R0d Owner retest exposed a basic human-entry readiness defect before any gameplay/network verdict could be collected: the callsign wire contract accepted only `[A-Za-z0-9_-]{1,24}`, while the UI exposed only a 24-character maxlength and revealed the restricted character set after Enter.

This invalidated the previous claim that the candidate was fully ready for an ordinary Owner first-contact test. It did **not** invalidate the I1–I4 multiplayer reliability evidence, because the Owner attempt was blocked before the gameplay connection path.

## Frozen multiplayer/runtime anchors

- qualified runtime/source: `a2e821afbbc88371b033af311cc6882d46aa6916`
- previous R0d delivery: `7da9ddd4ad37221f63a3cd418a140824783480ec`
- sim build: `shared-yard-v0-sim-888e471bc211091e`
- isolated Worker remains: `cloudflare-multiplayer-lab-reliability-play`

The human-entry repair does not modify `src/`, `public/world-v0/app.js`, `public/world-v0/build-contract.js`, `public/world-v0/state-guard.js`, or `package-lock.json` relative to the previous R0d delivery.

## Repair

Qualified branch/head:

`world-v0-r0d-human-entry-readiness@3e03e8228f665bef32a4ba97058d69c2e27a9e48`

The repair:

- exposes human-readable name guidance before entry;
- accepts ordinary human names at the UI boundary and deterministically adapts them to the existing strict wire identity contract;
- handles Polish diacritics and spaces, e.g. `Józz :D -> Jozz-D`, `Ktoś testowy -> Ktos-testowy`;
- blocks names with no usable letters/numbers before any network touch;
- lets Enter submit the name naturally;
- replaces misleading deep-link-first copy (`Join your friend`) with neutral `Enter shared world`, because the first human may be the one instantiating the fresh run;
- pulls Friend-Ready / human-entry files into standard syntax and core checks;
- adds a browser gate matching the actual Owner procedure: cold fresh `?run=...` first entrant -> waiting -> second independent Chromium on the same link -> same live world and exact guards.

## Qualification evidence

Readiness workflow run `34142054891` on exact `3e03e822...`: **PASS**.

It proved bounded human-entry-only diff, full standard repo check, local Workerd startup with unchanged authority, real-human cold direct-link entry, and the current I1 ActorSession continuity contract.

Artifact `10026264308`, SHA-256 `457ff8b75e25c4096440d186bad04eb38a53abe9aea78e2676dcb3a46bf52f0b`.

The browser specimen used invalid emoji-only input (blocked before network), Owner input `Józz :D -> Jozz-D` as first entrant via Enter key, and peer input `Ktoś testowy -> Ktos-testowy` on the same cold direct link. Both joined the same `WorldId` / `WorldEpoch`; exact guard matches were `12 / 15`, mismatches `0`.

### Apparatus correction during qualification

Initial run `34141854451` passed the new human-entry gate but then failed because the workflow used historical `world-v0-session-friction-smoke.mjs` as a control. That smoke expects pre-I1 behavior: one peer disconnect ends the whole epoch and exposes Restart. I1 deliberately removed that global coupling.

The product was **not** changed to satisfy the obsolete test contract. The control was replaced with the current I1 ActorSession lifecycle probe. Run `34142054891` then passed cleanly.

## Public isolated delivery

Delivery branch/head:

`world-v0-r0d-human-entry-delivery@6f4abd4dd17c59078ab99530e64ef6cf752ab5ce`

Delivery workflow run `34142273602`: **PASS**.

The run independently passed qualified-candidate/frozen-authority isolation, full repo check, reliability Worker dry-run, isolated deployment, exact deployed provenance, public real-human cold direct-link browser gate, and public current I1 ActorSession continuity.

Public artifact `10026356500`, SHA-256 `86ec8ac5c6451b404c8945eda2228e5fcc0b2cadf32e55d00c9d6084443886fa`.

Exact deployed provenance:

- qualified runtime: `a2e821afbbc88371b033af311cc6882d46aa6916`
- base R0d delivery: `7da9ddd4ad37221f63a3cd418a140824783480ec`
- human-entry qualification: `3e03e8228f665bef32a4ba97058d69c2e27a9e48`
- public delivery: `6f4abd4dd17c59078ab99530e64ef6cf752ab5ce`
- Worker: `cloudflare-multiplayer-lab-reliability-play`
- sim build: `shared-yard-v0-sim-888e471bc211091e`

Public human-entry evidence produced `WORLD_V0_HUMAN_ENTRY_PASS` with same-epoch two-browser entry and exact guard matches `12 / 12`. Public I1 control produced `WORLD_V0_INTEGRATION_I1_SERVER_SESSION_PASS`, including healthy-peer survival and preserved WorldEpoch across one actor drop.

## Current boundary

The old Owner link/run should not be reused. The isolated Worker now serves the qualified human-entry repair, but the next Owner attempt must use a newly generated, untouched fresh run key.

Next evidence is again the human R0d reliability retest: Owner first on the fresh direct link, then the same link to the second human/device after `Waiting for friend`; primary Phase A is ordinary foreground two-person play. Only after stable Phase A should one normal second-device background -> foreground lifecycle be tested.

Do not claim the human reliability gate has passed until this real session is observed.
