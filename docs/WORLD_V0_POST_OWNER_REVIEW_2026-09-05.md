# World V0 — post-Owner review and continuation gate

Date: **2026-09-05**
Status: **current review / execution-control record**

This review was requested before any further product expansion. It audits the work performed after the last clearly preserved Owner live test, challenges the interpretation of that work, repairs the current roadmap boundary and defines what must happen before substantial continuation.

## 1. Review anchor

The last clearly preserved Owner hands-on gate before the reviewed work is the **F5 live truth gate**:

- real desktop + phone session;
- roughly two minutes of raw-correction play;
- Owner controlled both devices;
- Owner reported smooth behavior and no noticed world disagreement;
- subsequent video/telemetry forensics attempted to falsify that judgement rather than treating it as sufficient by itself.

F5 therefore provides the human baseline entering this review. Earlier A2R smoothness remains important historical evidence, but it is not the latest Owner test.

## 2. Project-level criterion

The project purpose remains a small shared physical living world in which a few people inhabit one place, affect the same matter and experience coherent shared consequences.

Evidence hierarchy for the reviewed stage:

1. Owner hands-on judgement for feel, usability, fun and product direction;
2. live branch/runtime evidence for implementation truth;
3. qualified frozen specimens for regression/control truth;
4. current operating documentation;
5. older plans and historical evidence.

Machine PASS must not silently become Owner PASS, friend-play PASS, device-performance PASS or product-direction approval.

## 3. Current live control points verified during review

- frozen foundation control: `world-v0-shared-yard@b27de8b04c27777250c47e7e936674e0f147fdfa`;
- qualified playable: `world-v0-playable-frontier@1699fb71b3abef425aea6e21cdb81cb7d11250d5`;
- remotely qualified staging delivery: `world-v0-staging-delivery@d6e9d47d72aeac34bc6341a76ebdf7e53ff6522f`;
- Stress × Play control lane: `world-v0-capacity-cartography@d086f51792795d1ab73ba43f9e3b4dbf97441bb7`;
- exploratory causal-correction branch: `world-v0-capacity-sp1c-ram-shock@306e4cbee5ffed381856d6d9124b66e5052da864`;
- unqualified product hypothesis: `world-v0-playable-impact-lab-v0@33ddd527051bd71e4bde236948cb1c96b9a34a6b`;
- frozen qualified SimBuild remains `shared-yard-v0-sim-579c7aa172198390`.

The Impact Lab branch is exactly one commit ahead of the qualified playable frontier and changes only `src/world-v0-contract.ts`. It has no qualification workflow run. It is therefore cheap to park and does not contaminate the qualified line.

## 4. Review of work since F5 Owner live gate

### A. F5 → bounded Foundation v0 qualification

**Verdict: KEEP / STRONG.**

The project did not continue the old synchronization ladder by momentum. It converted the F5 result into a bounded Foundation qualification with an explicit exit toward an inhabitable world.

High-value outcomes included:

- explicit `WorldId`, `WorldEpoch`, `SimBuildId`, client revision and canonical-tick identity;
- application-owned `NetEntityId` rather than relying on Box3D body identity;
- exact same-boundary F32 application-state guard;
- fail-closed epoch semantics for stale identity, history failure, disconnect and lease expiry;
- bounded correction provenance;
- preservation of F5 as evidence rather than mutation of the human-tested specimen.

This work increased confidence that a real shared world could be built without pretending the substrate was production-complete.

**Boundary retained:** this does not qualify persistence, reconnect, topology churn, >2 players or a permanent Cloudflare/WebSocket/Box3D architecture.

### B. Foundation → Shared Yard V0

**Verdict: KEEP / STRONG, but human product evidence remains incomplete.**

The Shared Yard contract was a good transition from detached networking research into a small physical place:

- exactly two players;
- two upright dynamic capsules;
- 12 authored physical props;
- central barricade, collapse tower and impulse train;
- identical authority/browser simulation contract;
- exact-state and lifecycle evidence retained.

This is aligned with the project soul: one small place, shared matter, physical consequence, low content quantity.

However, machine qualification of Shared Yard is not equivalent to a fresh Owner free-play verdict on the current final product surface.

### C. Playable controls, camera and presentation

**Verdict: KEEP / OWNER-DRIVEN / NEEDS OWNER RECHECK.**

The camera work responded to direct Owner friction rather than speculative feature design. Current camera control contract includes:

- pitch approximately `[-1.45, +1.45]` rad;
- distance `0.18 .. 750`;
- mouse/touch orbit;
- wheel and pinch zoom;
- mobile camera gimbal;
- camera-relative movement.

The unusually permissive distance range intentionally reflects Owner preference. Machine tests prove interaction wiring, bounds and rendered presentation; they do **not** prove that the resulting camera feels natural across ordinary play.

The next Owner baseline must therefore re-evaluate camera behavior rather than treating the automated PASS as final UX acceptance.

### D. `Inspect solo`

**Verdict: KEEP / HIGH VALUE / CORRECTLY BOUNDED.**

`Inspect solo` directly reduces Owner attention/friction while preserving real authority semantics:

- the human occupies normal slot 0;
- a lightweight AUTO peer occupies normal slot 1;
- the AUTO peer uses the same ready/input protocol and deterministic neutral scheduled input;
- the same authority, epoch, exact-state, prediction and rollback machinery remain active;
- inspection evidence is explicitly `qualificationEligible=false`.

This is a good example of tooling that reduces Owner cost without creating a fake local sandbox.

It must remain explicitly insufficient for real two-human social-presence/device-timing questions.

### E. Execution substrate / CI / staging hardening

**Verdict: KEEP / NECESSARY RESPONSE TO REAL FAILURES / NOW STOP BY DEFAULT.**

The later infrastructure work was larger than ideal, but it was not arbitrary ceremony. It fixed concrete ambiguity:

- authority stimulus depended on peer creation order rather than authoritative slot;
- deployment provenance could be ambiguous;
- dependency resolution was not pinned;
- monolithic browser-heavy qualification produced cumulative Chromium/SwiftShader starvation that looked like a regression without state mismatch.

The final response was technically sound:

- committed lockfile + `npm ci` on product specimens;
- explicit product-source pointer for staging;
- protected-byte equality check before promotion;
- public deployment provenance;
- fresh-runner separation of core / presentation / solo / exact-state evidence classes;
- no weakening of exact-state thresholds to make CI green.

Qualified playable run `33957370821` and remote staging run `33957492089` passed the intended classes.

**Cost / lesson:** this execution work consumed substantial attention after the substrate was already near usable. The current operating rule is therefore correct: infrastructure is now good enough and must not become the default frontier again without a concrete blocker.

### F. Stress × Play program

**Verdict: KEEP THE PROGRAM / REPAIR EXECUTION CLASSIFICATION.**

The program itself is strategically good because it deliberately links stress phenomena with emergent play while preserving claim boundaries.

Useful work completed includes:

- shared deterministic phenomenon manifest / Chaos DNA;
- allocation observability;
- production-shaped recording/history measurements;
- preallocation A/B;
- exact replay checks;
- causal-footprint instrumentation and correction-shock experiments.

But actual execution drifted from the written stage order.

#### SP1 is not complete

SP1 was supposed to find and narrow a real rollback/history substrate boundary (`lastKnownGood ↔ firstBroken`) across demanding phenomena. The later allocation/preallocation probes gave useful information but did not finish that boundary search.

The project must not write down a body-count capacity envelope that has not been demonstrated.

#### The work called `SP1C` is conceptually an exploratory SP5 preflight

`world-v0-capacity-sp1c-ram-shock` tests:

- a small historical perturbation;
- large causal propagation;
- non-boundary Recording→RecPlayer seek;
- stale-future-history invalidation;
- exact corrected-vs-ground-truth recovery;
- correction timing scaling.

That is a causal-amplifier / adversarial-time question, not the primary SP1 boundary question.

The non-boundary v2 result is still useful isolated evidence:

- target `B(27)` with real `seekFrame=3`;
- correction at `B(48)`;
- stale future invalidation destroys later history segments;
- exact F32 recovery at `B(48)` and again at `B(72)` for 32/64/128 bodies across two deterministic repeats;
- large causal footprint in the ram-chain scene.

But its claim must remain narrow:

- isolated hosted Node;
- no Durable Object authority;
- no real network timing;
- no browser frame/render pressure;
- no mobile/device performance qualification;
- only two timing repeats;
- correction arrival is still deliberately shaped by the harness.

The measured correction milliseconds are therefore diagnostic clues, not product thresholds.

### G. SP1B recording preallocation interpretation

**Verdict: USEFUL FINDING / NO PRODUCT CHANGE YET.**

The A/B showed that the current 2 MiB initial recording capacity behaves as costly preallocation rather than as a demonstrated safety wall. Smaller cases pay substantially more allocator memory with the 2 MiB policy, while large cases can grow beyond it anyway.

This weakens any rationale that says "2 MiB is safe because it is a capacity ceiling".

It does **not** by itself justify changing the qualified product recording policy. The current 12-prop world is healthy and changing the policy would touch a qualified causal path without a demonstrated product problem.

### H. Impact Lab translation

**Verdict: PARK / UNQUALIFIED / NOT EARNED YET.**

The branch `world-v0-playable-impact-lab-v0@33ddd527...` is safe because it is isolated and only one commit ahead of the qualified playable frontier.

The decision to immediately continue qualifying it was not justified.

Reasons:

1. There is no fresh Owner verdict on the current qualified v7 Yard after the camera and `Inspect solo` work.
2. The top-level Operating Map already says hands-on Yard play should choose the next product move.
3. The SP1C causal result does not transfer directly to this layout.
4. The lab `ram-chain` amplifier uses a large heavy fast ram; the Impact Lab draft uses the normal uniform Shared Yard cube physics and player locomotion as the actuator.
5. 12→32 props changes simulation identity and expands state width, history, snapshots and guard packing. It is not merely a presentation/layout change.
6. Existing authority qualification contains explicit 12-prop / 14-dynamic-body expectations, so a 32-prop scene requires deliberate causal requalification rather than mechanical count edits.
7. It would create product complexity before we know whether current play is lacking physical richness, camera quality, movement feel, social readability, session flow or something else entirely.

The branch should be preserved as a cheap hypothesis donor, not deleted and not promoted.

## 5. Main conclusions of the review

### What genuinely improved

- Foundation truth and failure semantics are far stronger than at F5.
- Shared Yard turned networking research into an actual small physical place.
- The current product has much lower Owner-entry friction.
- Camera control is substantially more permissive and mobile-aware.
- `Inspect solo` makes ordinary iterative inspection cheap without corrupting authority semantics.
- staging provenance and qualification are much more trustworthy.
- Stress × Play produced reusable deterministic phenomena and useful correction research.
- qualified/frozen work was protected throughout; experimental mistakes remained reversible.

### What did not improve enough

- fresh human knowledge about **the current** Yard;
- genuine two-human social-presence evidence on the current product;
- evidence that the current world is fun enough to revisit;
- evidence telling us which physical affordance should be added next;
- a completed Stress × Play capacity map;
- integrated stress authority/browser/device envelopes.

### Primary process failure detected

After building a strong execution substrate, the project continued generating technical evidence faster than it generated new Owner/world knowledge.

The specific failure was not "too much rigor". The failure was allowing rigor to choose the next question after its original question was already answered.

The correction is not to weaken validation. It is to put validation back behind the actual product uncertainty.

## 6. Revised continuation roadmap

This roadmap supersedes any momentum-based continuation of Impact Lab or a blind completion of every Stress × Play stage.

### R0 — review / grounding / freeze (NOW)

Actions:

- preserve qualified foundation/playable/staging heads;
- mark Impact Lab parked/unqualified;
- record SP1C as exploratory SP5-preflight evidence;
- record SP1 as still incomplete;
- repair stale issue/PR sequencing language;
- do not modify qualified runtime while this review is being closed.

Natural stop: a fresh session can identify what is qualified, what is experimental, what is incomplete and why the next human evidence is needed without reconstructing this conversation.

### R1 — current-product Owner baseline

Use exact remote-qualified staging corresponding to `world-v0-playable-frontier@1699fb71...`.

Prefer `Inspect solo` first because a second human is not needed to judge:

- entry friction;
- controller feel;
- camera orbit / zoom / gimbal;
- readability of YOU/PEER/spatial zones;
- whether the 12-prop Yard invites interaction;
- whether current physical toys are interesting enough to explore;
- what immediately feels artificial, annoying, dead or unexpectedly fun.

This is not a QA form. A few minutes of free exploration plus natural verbal feedback is better.

Natural stop: Owner can state what currently feels good, what blocks play and what they naturally want to try next.

### R2 — real two-human / two-device baseline

Run only when the question genuinely needs another person.

Use the same qualified candidate before adding new content.

Observe:

- peer spatial legibility;
- shared-object consequence;
- obstruction/cooperation/conflict;
- join/restart friction;
- correction/artificiality under natural human timing;
- whether spontaneous games emerge;
- whether the second human changes what the Yard is for.

Natural stop: at least one genuine social/physical interaction loop has been observed and current product blockers are classified.

### R3 — Owner-feedback synthesis

Classify observations into:

- **MUST FIX** — blocks useful play/testing;
- **AMPLIFY** — already fun/useful and worth strengthening;
- **NEW PHENOMENON** — unexpected behavior worth preserving/reproducing;
- **RESEARCH QUESTION** — needs a bounded falsifier before product change;
- **DEFER** — interesting but not the current bottleneck.

Choose one next product uncertainty, not a feature list.

### R4 — smallest earned product refinement

Only after R1/R2 evidence.

Likely categories, not preselected solutions:

- control/camera polish;
- peer-presence readability;
- session/lifecycle friction;
- physical affordance richness;
- a bounded Stress × Play translation;
- a new small world interaction.

Validation must be proportional to the actual causal blast radius.

### R5 — physical-richness experiment, only if earned

If Owner play says the Yard lacks interesting causal machinery, revive Stress × Play translations deliberately.

Do **not** automatically revive the current 32-prop Impact Lab.

First define:

- the desired playful phenomenon;
- what lab evidence actually transfers;
- the smallest scene/mechanic that can expose it;
- whether per-prop mass/shape/action semantics are required;
- expected state-width/correction cost;
- exact Owner question.

Then isolate one candidate and qualify it.

### R6 — Stress × Play continuation on demand

Research lane remains valuable but is no longer allowed to determine product sequencing by itself.

When capacity research resumes:

- keep SP1 explicitly incomplete until a real boundary is found or the search is consciously retired;
- preserve SP1B allocation findings;
- rename/reclassify SP1C conceptually as SP5-preflight evidence;
- before product claims, eventually earn SP3 authority and SP4 integrated two-client evidence for the relevant phenomenon;
- use play-discovered anomalies to choose which missing stress stage matters.

## 7. Continuation-readiness gate

Substantial new product expansion should not begin until these are true:

- [x] frozen foundation/playable/staging identities are live-verified;
- [x] latest machine qualification is understood and correctly scoped;
- [x] Impact Lab is explicitly parked rather than mistaken for active frontier;
- [x] SP1C claim is narrowed/reclassified;
- [x] execution infrastructure is no longer default frontier;
- [ ] current v7 receives fresh Owner hands-on judgement;
- [ ] real two-human play is performed if the next decision depends on social/peer timing;
- [ ] the next product uncertainty is selected from observed friction/fun rather than from lab momentum.

## 8. Immediate execution decision

**Do not continue implementing or qualifying Impact Lab now.**

The correct next product evidence is a fresh Owner baseline on the exact current remotely-qualified Yard. In parallel, repository/provenance cleanup may only do work that reduces ambiguity and does not touch the qualified runtime.

The desired state after this review is not "more tests". It is a project where the next test, experiment or implementation is obviously connected to the thing the Owner is trying to feel, understand or build.
