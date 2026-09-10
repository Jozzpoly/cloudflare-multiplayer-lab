# World V0 — Foundation Stabilization Direction

Status: **COMPLETE / SAFE STOP ENTERED**  
Updated: **2026-09-10**  
Qualified product: `7755a668d7488f04ecbf42a00fbc96fcb978d544`

## Closure verdict

The September stabilization campaign is complete. Its purpose was to make the current two-player Shared Yard foundation trustworthy enough to freeze before broader architecture work.

The sequence actually completed was:

1. stabilize the existing fixed-2P foundation;
2. challenge it causally and adversarially;
3. repair confirmed lifecycle/capacity/recovery/UI defects;
4. re-run historical regression coverage;
5. deliver an isolated Owner candidate;
6. perform broad desktop/mobile human play;
7. repair the final Diagnostics-focus / desktop-touch UI defect;
8. pass final tiny real-device sanity **3/3**;
9. freeze the baseline and enter deliberate safe stop.

No new feature frontier is part of this document.

## Closed failure classes

The campaign repaired and requalified:

- dormant reservations permanently consuming public Yard capacity;
- same-owner F5/new-tab being blocked by its own live ActorSession;
- cross-Yard dormant history exhausting all public Yards;
- protected versus replaceable reservation ambiguity;
- stale old-epoch tokens after demand-driven handoff;
- insufficient join/lifecycle/network error distinction;
- browser exhaustion against an ActorSession whose authority WorldEpoch was actually gone;
- callsign text losing W/A/S/D to global gameplay handling;
- Diagnostics `<summary>` focus swallowing later gameplay WASD;
- mobile touch controls appearing on normal fine-pointer desktop.

Broad automated adversarial verification reached its stop condition without finding another product blocker, and the subsequent Owner run judged ordinary play stable and smooth.

## Frozen identity

Exact product:

`7755a668d7488f04ecbf42a00fbc96fcb978d544`

Final presentation/input:

- browser UI `shared-yard-v0-browser-ui-v20-owner-ui-focus`;
- keyboard focus guard `world-v0-keyboard-focus-guard-v2-semantic-ownership`.

Simulation/network identity remains:

- authority `shared-yard-v0-authority-v11-jump-delivery-persistence`;
- browser sim `shared-yard-v0-browser-sim-v10-jump-delivery-persistence`;
- protocol `shared-yard-v0-scheduled-input-v3-supersession`;
- state guard `shared-yard-v0-f32-state-v1`;
- SimBuild `shared-yard-v0-sim-cd8edc169f791a64`.

## Final qualification evidence

- Owner UI causal run `34474057233` — **SUCCESS**;
- Current Validation `34474343862` — **SUCCESS**;
- final delivery `34475199474` — **SUCCESS**;
- final Cloudflare Version `1cc9a0fd-2fac-4d23-a75d-c66669ddee01`;
- broad Owner ordinary-play verdict: **stable and smooth**;
- final real-device sanity: **3/3 PASS**.

## Accepted limits carried out of stabilization

The fixed two-actor topology remains deliberate baseline debt. In particular, soft-reservation replacement may rotate the WorldEpoch and lose prior physical history. Stabilization did not attempt to introduce persistent world lifetime, arbitrary roster mutation, 3+ players, account identity or seamless actor succession.

## Post-stabilization order

The project is now in safe stop:

1. preserve exact product/delivery/pre-integration recovery anchors;
2. reconcile canonical docs;
3. perform controlled branch/workflow/PR archaeology;
4. remove redundant/consumed apparatus only when recovery is proven;
5. integrate the linear qualified history into `main` without rewriting the qualified product;
6. leave a compact canonical and recovery spine;
7. then review Project Soul and formalize the next multiplayer era.

## Deferred next-era requirement

A player should soon be able to enter a Yard **alone**, immediately inhabit/play in the world and wait there for another player. The current `Waiting in this Yard` pre-start shell is therefore temporary old-lifecycle behavior.

That requirement belongs after cleanup and should be considered together with:

`world lifetime != roster lifetime != ActorSession lifetime != transport/device lifetime`

Do not reopen the frozen baseline merely to implement it opportunistically.