# World V0 — post-R1 critical review and continuation gate

Date: **2026-09-05**
Status: **current execution-control review after Owner R1 closure**

This review supersedes older sequencing statements that still treated F5 as the latest Owner hands-on gate or treated another prewritten feature as automatically next. It does not erase their evidence.

## 1. Correct human anchor

The latest preserved Owner hands-on gate before the work reviewed here is issue #8 comment `5551557521`, recorded 2026-09-05 after fresh play on the remotely-qualified v7 Yard.

Owner judgement at that gate:

- camera accepted for the current stage;
- a roughly one-second startup hitch was noticed, then normal smooth behavior; currently non-blocking;
- the existing 12-prop Yard interactions — tower, barricade, impulse line, pushing and ramming — had already been exercised many times and were becoming boring;
- do **not** keep asking the Owner to re-test the same 12-prop toy;
- explicit missing capabilities felt in play: **jump**, **better multiplayer**, and **much simpler friend entry/onboarding**;
- easier room/session continuity remained attractive;
- after closing the friend-ready/embodiment gap, the desired direction is toward a more serious small cooperative living world / mini-MMO, without jumping straight to MMO infrastructure.

This is the correct review anchor. F5 remains important foundation evidence, but it is not the latest Owner test.

## 2. Live public control verified during this review

The public Friend-Ready control has advanced beyond the source references in the previous canonical docs.

Current source:

`world-v0-friend-ready-v1@5dd28a899c4f60c9227f1eb93026f571ced733e3`

The only runtime change from the previous `f9686b6...` Friend-Ready specimen is the bounded mobile input-release fix:

- joystick releases on `lostpointercapture`;
- mobile camera gimbal releases on `lostpointercapture`;
- the interaction smoke explicitly checks released gimbal input.

The isolated qualification/materialization lane is preserved at:

`world-v0-mobile-input-release-probe@ffce519dd8813fed3cac276f08e3a3783688652f`

Relevant workflow evidence:

- mobile input release probe `33970636391` — PASS;
- materialization `33970636425` — PASS.

Current public delivery:

`world-v0-staging-delivery@35902816a9bebe38b19d675267f8303ec32e6210`

Its product-source pointer is exactly `world-v0-friend-ready-v1@5dd28a899...`.

Remote delivery run `33970892543` — PASS:

- exact promoted bytes / deployment provenance;
- staging-vs-production isolation;
- remote authority;
- remote presentation, controls, lifecycle and Inspect solo;
- remote exact-state on attempt 1, with no retry needed.

Provenance-bound Friend Entry run `33970892558` — PASS.

The frozen simulation identity remains unchanged:

`shared-yard-v0-sim-579c7aa172198390`

The current public Friend-Ready source therefore differs from the earlier public specimen only in the bounded mobile pointer-release fix. Authority, protocol and simulation remain frozen.

## 3. Review of work since Owner R1 closure

### A. Friend-Ready entry / invite flow

**Verdict: KEEP / STRONG / DIRECTLY EARNED.**

This work answered an explicit Owner complaint rather than a speculative roadmap item.

What it demonstrably changed:

- normal host entry no longer requires understanding a raw `Run` value;
- room identity is seeded from Web Crypto rather than the old weak random fallback;
- an invite URL carries the room identity;
- friend entry presents a normal `Join your friend` flow;
- raw/advanced controls remain available without dominating the normal path;
- the underlying authority/protocol/SimBuild stayed unchanged.

Machine qualification proves the flow is wired, provenance-bound and preserves the previous correctness envelope. It does **not** prove that two humans find it frictionless in practice. That requires the next natural friend session.

### B. Room Continuity Probe RCP0

**Verdict: KEEP AS ISOLATED DONOR / TECHNICALLY VIABLE / NOT PRODUCT-VALIDATED.**

RCP0 was also earned by real Owner pressure: repeated round/session ceremony and interest in a more continuously available room.

The probe demonstrated a bounded client-side continuity mechanism under one stable logical room identity across repeated fresh epochs. It deliberately did not claim persistence, join-in-progress, server reconstruction or a permanently running room.

The most important limitation remains semantic: current authority cannot distinguish a voluntary social leave from a generic WebSocket close. The probe records that ambiguity rather than pretending to know the cause.

Not promoting RCP0 after its machine PASS was the correct decision. Human session friction should decide whether it becomes product behavior.

### C. Post-FR-A sequencing correction

**Verdict: KEEP / STRATEGICALLY CORRECT.**

The later evidence override replaced the old automatic sequence with:

`public Friend-Ready control → natural friend-play → strongest real friction / emergent demand → one bounded next hypothesis`

That correction was good. It recognized that jump, RCP0 and Stress × Play were candidate responses, not mandatory numbered stages.

The existing evidence snapshot / diagnostics path is already sufficient for the first natural session. Adding a recorder, archive UI or more telemetry before that session would be apparatus-first work with little expected decision value.

### D. Mobile `lostpointercapture` hardening

**Verdict: KEEP / SMALL BOUNDED CORRECTNESS FIX.**

The fix is two release hooks plus a stronger interaction falsifier. It does not alter authority, protocol, simulation or world content. It has isolated qualification and has been remotely redeployed with exact provenance.

The failure here was not implementation quality. The failure was documentation freshness: canonical docs still pointed to the older `f9686b6...` / `a19eb34...` public specimen after live source and delivery had advanced.

This review repairs that provenance boundary.

### E. Shared Consequence V0

**Verdict: PRESERVE AS RESEARCH EVIDENCE / DO NOT PROMOTE.**

V0 was a speculative attempt to answer the broader problem that the Yard had become physically boring. Its scene used a six-cube impulse train feeding a 4×2 breakwall under ordinary player locomotion.

The real-authority phenomenon measurement did demonstrate a causal effect under two-peer scheduled-input authority:

- neutral wall drift was about 1.36 mm max;
- active train movement reached about 16.85 cm max;
- active breakwall movement reached about **2.11 cm max**;
- three wall blocks exceeded 20 mm.

That is real narrow evidence that the chain can transmit a player-caused physical consequence. It is also evidence that the particular V0 design is too weak to justify product promotion on its own.

The V0 workflow as a whole was not a clean full qualification because exact-state failed in that run. The phenomenon measurement itself passed and remains useful as a separate evidence class.

### F. Geometry micro-lab and calibration

**Verdict: KEEP THE FINDINGS / STOP THE SEARCH.**

This was technically the strongest part of the Shared Consequence investigation.

The first micro-lab accidentally tested near-contact pushing rather than the real authority stimulus. That mismatch was detected instead of being optimized around. The lab was then calibrated from the recorded real-authority pre-push state and reproduced the V0 control result exactly in the key deterministic metrics:

- train max displacement `0.16848335346148635 m`;
- wall max displacement `0.021099103656105914 m`.

That establishes useful fidelity for the specific control case.

The bounded matrix then showed:

- reducing the six-cube train materially increases downstream wall motion;
- one mediator + central split hit produced about `0.276 m` wall max, `0.113 m` mean, with 4/8 blocks over 100 mm in the calibrated lab;
- a single-column hit produced a much larger local spike (~`0.869 m`) but concentrated it in roughly one vertical pair rather than distributing consequence;
- staggered and compact support topologies did not produce a meaningful cascade advantage;
- none of the tested layouts produced a convincing collapse; rotations remained only a few degrees.

Important claim boundary: the predictor was validated against one V0 control stimulus. The ranking of altered geometries has **not** been independently reproduced in real authority. `one mediator + wide4x2 split` is therefore the best of this bounded lab set, not a demonstrated product design winner.

Further wall/topology optimization would now be overfitting a speculative content hypothesis.

### G. Shared Consequence V1 correctness specimen

**Verdict: TECHNICALLY STRONG / PRODUCT VALUE UNPROVEN / PARK.**

V1 materialized the one-mediator lab candidate while preserving global prop/player physics. It uses 18 props / 20 dynamic entities and a changed SimBuild:

`shared-yard-v0-sim-3f61a8e5d03fe65d`

Exact specimen:

`world-v0-shared-consequence-v1@6fbf2b1e5fc11013cf0e1008e68915c3ef8dbe42`

Its correctness qualification is strong:

- core PASS;
- presentation PASS;
- Inspect solo PASS;
- first exact-state attempt classified as `clean_hosted_starvation` with clean client evidence;
- one targeted retry of the exact job on the same SHA passed.

What this proves: the altered 18-prop/20-entity experimental runtime can preserve the tested local authority/browser/exact-state envelope.

What it does **not** prove: that the scene is more fun, more social, more readable, more useful for friend-play, or worth replacing the public Friend-Ready control.

### H. V1 real-authority phenomenon apparatus

**Verdict: APPARATUS ONLY / UNRUN / PARK NOW.**

Branch:

`world-v0-shared-consequence-v1-phenomenon@d74a564cbbdc701cffe98a8eef113fdc16417b17`

It is exactly one commit beyond the V1 correctness specimen and adds only a phenomenon script. It does not mutate runtime.

The script is better designed than the early micro-lab: it uses an ordinary-locomotion route, two peers, scheduled input, shared exact guards and records pre-impact position/velocity plus per-entity displacement.

But no workflow/run has yet produced evidence from it.

Do **not** run it by momentum. The missing question is no longer `can this wall move more?`; the missing question is `what does a real friend session reveal as the next product bottleneck?`.

## 4. Primary process finding

The work after R1 divides into two qualitatively different periods.

### Evidence-driven period

Friend Entry, RCP0 and the small mobile release fix were closely connected to explicit Owner friction. They were bounded, isolated and preserved the qualified foundation.

### Drift period

After the public Friend-Ready control was ready and the canonical sequencing already said `friend-play next`, the project started another physical-richness investigation before receiving that friend-play evidence.

This repeated the earlier failure pattern in a subtler form:

- the work was technically disciplined;
- branches were isolated;
- evidence classes were carefully scoped;
- qualified public runtime was protected;

but the research apparatus again began selecting the next question.

The proxy objective also drifted. `wall displacement`, `movedOver100mm`, and spatial distribution are useful physical metrics, but they are not evidence that the interaction is fun, socially legible or aligned with what two players naturally try to do.

The correct lesson is not to discard the research. It is to stop before converting it into product sequence.

## 5. What is genuinely demonstrated now

Strongly demonstrated:

- a current public Friend-Ready control exists with low-friction host/invite semantics and stronger room-key entropy;
- the current public mobile pointer-release behavior is hardened and remotely qualified;
- the frozen two-player authority/protocol/SimBuild envelope remains intact on that public control;
- RCP0 can preserve one logical room identity across repeated fresh epochs in its bounded opt-in probe;
- V0's six-cube train transmits only a weak ~2 cm wall consequence in the measured authority scenario;
- the calibrated isolated lab can reproduce that exact V0 control outcome;
- chain length and impact alignment strongly affect energy transfer in the tested geometry family;
- V1 preserves the tested local correctness envelope at 18 props / 20 dynamic entities.

Not demonstrated:

- that Friend-Ready entry feels frictionless to an actual friend;
- that present multiplayer is socially satisfying;
- that RCP0 should become default behavior;
- that jump is or is not the dominant next embodiment improvement;
- that Shared Consequence V1 produces its predicted larger effect under real authority;
- that the predicted larger effect is fun or worth shipping;
- that a breakwall/cascade is the right kind of physical richness;
- that the next living-world step should be persistence, 3 players, a larger place, items, richer verbs or more physics content.

## 6. Continuation decision

**Shared Consequence is parked as a donor/research lane.**

Preserve:

- V0 authority phenomenon evidence;
- calibrated geometry-lab results;
- V1 correctness specimen;
- the unrun V1 phenomenon apparatus.

Do not delete them and do not promote them.

The current product frontier returns to the exact remotely-qualified public Friend-Ready control:

`world-v0-friend-ready-v1@5dd28a899...`

through:

`world-v0-staging-delivery@35902816...`

The next decision-producing evidence is a **natural two-human friend session**, not another Owner solo repetition and not another preselected feature.

## 7. Plan to develop, refine and ground the work

### R0 — provenance and review grounding

- repair canonical source/delivery references;
- record this post-R1 review;
- mark Shared Consequence V1 and its phenomenon apparatus as parked research;
- preserve the qualified public control unchanged.

Natural stop: a fresh takeover can identify the human anchor, exact public specimen, parked research and next human gate without reconstructing the conversation.

### R1 — natural Friend-Ready session

Use the current public control with two real humans/devices.

Do not present a QA checklist to the friend. Normal path:

1. Owner enters normally;
2. uses `Invite friend`;
3. friend opens the link, enters a name and joins;
4. both play naturally until either something becomes interesting or the current limits become obvious.

Observe only what materially emerges:

- actual entry/invite friction;
- whether being together changes the value of the otherwise exhausted Yard;
- peer readability and shared-object consequence;
- whether current correction/network behavior feels artificial under natural timing;
- whether round ending / peer disappearance makes continuity a real need;
- whether lack of jump immediately dominates play;
- what players spontaneously try that the world cannot support;
- whether a third participant or larger place becomes a real desire.

Existing evidence capture is enough. Do not add more telemetry first.

### R2 — synthesis immediately after the session

Classify observations as:

- **MUST FIX** — blocks useful play;
- **AMPLIFY** — already creates value and deserves strengthening;
- **NEW PHENOMENON** — unexpected behavior worth preserving;
- **RESEARCH QUESTION** — needs one bounded falsifier;
- **DEFER** — interesting but not current bottleneck.

Choose one product uncertainty.

### R3 — one earned next change

Candidate responses are conditional, not a feature queue:

- entry/session friction → refine Friend Entry or promote/rework RCP0;
- missing vertical embodiment → bounded jump/support experiment;
- social/network artificiality → targeted multiplayer coherence work;
- physically dead world → reopen Shared Consequence / Stress × Play donor evidence, but choose the playful phenomenon from human behavior rather than from wall metrics;
- pressure for more place → smallest larger authored-world experiment;
- real three-person demand → bounded 3-player work;
- repeated desire to return to the same place → persistence/room-continuity research.

### R4 — living-world expansion only after the bottleneck is known

The intended direction remains a small cooperative living world, but `mini-MMO` must not become permission to prebuild accounts, economy, persistence, orchestration or scale infrastructure.

Near-term product progress should maximize meaningful shared-world capability per unit of Owner attention while preserving the validated two-player physical truth substrate.

## 8. Stopping rule

Until the natural Friend-Ready session produces new evidence:

- no new default feature;
- no jump implementation by roadmap inertia;
- no RCP0 promotion by machine-green inertia;
- no Shared Consequence V1 phenomenon run by research inertia;
- no new telemetry apparatus;
- no 3-player, persistence or larger-world implementation by mini-MMO label.

Allowed work is provenance/documentation maintenance or fixing a concrete blocker that prevents the friend session itself.
