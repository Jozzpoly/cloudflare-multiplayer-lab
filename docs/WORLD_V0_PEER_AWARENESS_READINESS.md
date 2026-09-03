# Shared Yard V0 — peer-awareness / camera readiness dossier

## Status

**Preparation / execution-plan readiness:** `READY`

**Product camera / PEER-awareness implementation readiness:** `BLOCKED — VQ-H1 VALIDATION HARDENING, THEN OWNER/DEVICE BASELINE`

This distinction is intentional. The problem space, candidate set, causal risks, validation contract and stop conditions are prepared well enough for a fresh execution conversation. The product change itself is **not** yet authorized.

No final camera, HUD, PEER-indicator, physics-expansion, Foundation redesign or merge work should begin from this document alone.

---

## 1. Fresh-conversation mandate

The next conversation must begin with **VQ-H1 validation hardening**, not with a camera or HUD implementation.

Required order:

1. verify the exact live branch/head and this dossier;
2. verify the clean runtime tree still matches the qualified Presence baseline;
3. execute the bounded VQ-H1 harness-hardening stage from `WORLD_V0_PEER_AWARENESS_REMOTE_GATE.md`;
4. requalify isolated staging through authority + remote exact-state evidence;
5. only then run the planned Android/desktop Owner A/B baseline;
6. classify C0–C4 from Owner evidence;
7. select **exactly one** first product candidate with fixed success/rejection criteria;
8. implement that candidate only after the above boundary is closed.

Do not inherit the previously started PEER-indicator idea merely because it exists in history.

PR #32 remains **draft / DO NOT MERGE**.

---

## 2. Qualified runtime truth

Machine-qualified Product Shell + Spatial Presence checkpoint:

`9572329f1e077fb5d365c8c28c39b476a3e7b2ca`

Qualified Git tree:

`50a68de38db2b40eeaf8be5e73def3100d3aee05`

Relevant unchanged simulation identity:

- `SimBuildId = shared-yard-v0-sim-579c7aa172198390`
- `WORLD_V0_CLIENT_SIM_REVISION = shared-yard-v0-browser-sim-v1`
- `WORLD_V0_SERVER_REVISION = shared-yard-v0-authority-v1`
- `WORLD_V0_PROTOCOL_REVISION = shared-yard-v0-scheduled-input-v1`
- presentation revision: `shared-yard-v0-browser-ui-v3-presence`

Local exact-state L2 qualification on `9572329f...`:

- workflow `33803727000`, attempt 2;
- Chrome `152.0.7977.64`;
- verdict `WORLD_V0_PASS_REAL_CHROMIUM_EXACT_STATE_ENVELOPE`;
- WorldEpoch `7e9d95ad-1667-4980-8dcb-6867f00f7661`;
- client A: B308, `51` exact matches, `0` mismatch, `0` pending, `0` remap failure, runtime failure false;
- client B: B311, `52` exact matches, `0` mismatch, `0` pending, `0` remap failure, runtime failure false;
- rollback/replay was exercised;
- hosted-runner timing is a stress/nonclaim, not performance qualification.

The current product baseline already includes:

- physical YOU and PEER capsules;
- YOU / PEER world-space labels;
- ground rings;
- authored COLLISION YARD / TOWER / IMPULSE LANE spatial cues;
- compact product shell with diagnostics collapsed by default;
- desktop and portrait camera presets;
- unchanged qualified multiplayer simulation underneath.

---

## 3. Premature PEER-indicator hypothesis was explicitly withdrawn

Premature scaffold:

`b5da62f20921e0372769c260941c850969b46693`

It added only a hidden six-line DOM surface. It did **not** implement projection, styling, distance, evidence or behavior and was never qualified.

Cleanup:

`49fbd46cd656f0c38897df64e7a6916e3edb25d9`

The scaffold was removed. Crucially, this cleanup commit has the **same Git tree** as qualified `9572329f...`:

`50a68de38db2b40eeaf8be5e73def3100d3aee05`

Thus the clean runtime/source baseline after preparation cleanup is byte-identical as a Git tree to the qualified Presence checkpoint. Later preparation commits are documentation/test-trigger provenance only.

This matters methodologically: the next conversation starts from a clean qualified runtime, not a half-implemented HUD solution.

---

## 4. Product problem — solution-neutral

The open question is:

> Does Shared Yard V0 give a player, especially on a portrait phone viewport, enough **physical awareness of the other player and shared Yard** to support useful two-person play without turning the experience into marker-following UI?

The goal is **not** to keep PEER visible at all times.

The desired property is:

> I understand another physical body is present in the same space, I can establish where they are when it matters, and the camera/UI does not replace the world as the primary source of that understanding.

Non-goals for this stage:

- final third-person camera architecture;
- minimap;
- >2-player navigation;
- spectating;
- final facing/orientation model;
- camera collision/occlusion system;
- aim camera;
- new abilities;
- new physics props;
- new spawn/lifecycle systems.

---

## 5. Demonstrated camera confounder: slot-dependent hemisphere bias

The earlier visual conclusion “mobile bad, desktop good” was confounded by slot:

- portrait client was slot 0;
- desktop client was slot 1.

Authored starts:

- slot 0: `[-6.5, 0.82, -1.4]`
- slot 1: `[+6.5, 0.82, 0.0]`

Current follow camera applies the same positive world-space X/Z offset regardless of slot:

- desktop: `[+7.4,+6.3,+8.7]`, FOV `55°`;
- portrait: `[+9.4,+8.4,+11.8]`, FOV `62°`.

Analytic B(0) projection of PEER under current geometry is approximately:

| View | slot 0 sees PEER | slot 1 sees PEER |
| --- | ---: | ---: |
| desktop | NDC `(2.347,-1.969)` — strongly off-screen | `(-0.503,0.355)` — on-screen |
| portrait | `(3.665,-0.851)` — far off-screen | `(-1.319,0.257)` — slightly outside |

So the strongest demonstrated visual defect is not simply “phone needs an indicator”. The current follow camera points the two spawn slots into different useful hemispheres.

### Symmetric inward-camera analytical probe

Mirroring the camera X/Z hemisphere by slot, so each camera sits outward of its spawn and looks inward toward shared space, gives approximately:

- desktop: symmetric PEER projection around `(-0.503,0.355)` — comfortably visible;
- portrait: symmetric around `(-1.319,0.257)` — still slightly outside the narrow frame.

Therefore two distinct questions must remain separate:

1. remove/accept slot camera bias;
2. decide whether portrait needs additional establishing or active off-screen awareness after that.

Do not collapse them into one HUD feature.

---

## 6. Portrait framing bound

With symmetric inward portrait geometry and current FOV, pulling the camera back can include both authored starts without touching physics.

Approximate scale versus current portrait offset:

| scale | peer horizontal \|NDC x\| |
| ---: | ---: |
| 1.00× | 1.319 |
| 1.25× | 1.128 |
| 1.50× | 0.985 |
| 1.75× | 0.874 |
| ~1.81× | ~0.850 |
| 2.00× | 0.786 |

This makes a temporary establishing view during the already-neutral B(0)→B(90) window technically plausible. It does **not** prove such a transition feels good.

Solving the same problem with FOV alone would require an aggressively wide portrait view and is currently a weaker hypothesis because it would shrink world/prop readability.

---

## 7. Product candidate matrix — no candidate authorized yet

### C0 — no change

The qualified baseline wins if Owner play shows that losing PEER is natural/non-problematic and slot bias does not materially hurt understanding.

### C1 — slot-symmetric inward follow

Current strongest **technical** camera hypothesis.

- use existing `selfSlot` only as presentation input;
- mirror camera hemisphere so both slots face meaningful shared Yard space;
- preserve self-owned follow;
- no continuous PEER centering;
- no HUD cue;
- no simulation/input/network changes.

C1 is not promoted by geometry alone.

### C2 — temporary pre-start establishing view

Candidate only if portrait needs initial spatial establishment after slot bias is separated.

- use existing B(0)→B(90) neutral window;
- briefly frame both players / meaningful Yard space;
- transition to self-owned follow before active input;
- no permanent remote-player camera coupling.

Must be rejected if it feels artificial, delays ownership, disorients, or only makes the opening prettier without helping later understanding.

### C3 — contextual off-screen PEER cue

Only justified if Owner play demonstrates a recurring active-play awareness problem after camera bias is separated.

First bounded version, if earned:

- one PEER only;
- subtle screen-edge direction cue;
- optional coarse planar distance;
- hidden inside an awareness-safe viewport region;
- robust behind camera;
- safe-area / joystick / diagnostics / notice aware;
- visually subordinate to world-space PEER presence.

External HCI evidence says off-screen visualizations have task-dependent tradeoffs; more complex techniques are not automatically better for a single target. Multi_World optimizes physical/social presence, not generic marker acquisition speed.

### C4 — dynamic two-target / midpoint framing

Retained only as a later, higher-coupling alternative. It risks letting the remote player influence local camera position/zoom and therefore needs its own experiment if simpler options fail.

---

## 8. New preparation blocker: remote qualification apparatus

Preparation intentionally attempted a fresh isolated staging qualification before asking for Owner/device judgement.

Trigger SHA:

`f6b0338aba99859a73739149cec9357a6006742b`

This commit changed documentation only. Staging Connected Build passed on the exact SHA:

- Build ID `45a2b036-8a98-4619-9577-00d03ce5327d`;
- Version ID `0a4d7870-51a5-4e2c-9526-2a59d8dbe974`;
- production isolation remained intact.

Workflow:

`33807169991`

### Local evidence

Ordinary local-regression passed repeatedly.

Local exact-state L2:

- first attempt failed by hosted-runner starvation/dead-man before the long boundary;
- both clients nevertheless had B162/B167, `26` exact matches each, `0` mismatch, `0` pending, `0` remap failure, rollback/replay exercised, runtime failure false;
- p95 frames were ~83–100 ms with ~1 s maxima;
- same-SHA rerun then passed exact-state at B304/B305 with `43` exact matches each, `0` mismatch, `0` pending, `0` remap failure, runtime failure false;
- PASS artifact `9913478276`, digest `sha256:a2eb8bb894fe21540f81a72e6366af6a40e8014ed3e1a87b6df4fc2c9a67a88c`.

This does not falsify the qualified runtime; it exposes CI timing sensitivity.

### Remote authority attempt 1

Correct target/deploy readiness and production isolation passed, then one two-peer epoch closed a socket before required `world_v0_epoch_ended` evidence was observed.

Signature:

`closed before epoch-ended evidence`

This remains an unresolved lifecycle/transport observation until the deterministic stimulus flaw below is removed and the run repeated with stronger diagnostics.

### Remote authority attempt 2

A clean same-SHA failed-job rerun reached the final assertions but prop displacement was only:

`0.0035911018731132195 m`

All assertions before the prop witness had already passed for that peer, including scheduled input acceptance/freshness, finite snapshots, lease expiry and expected epoch ending.

### Causal harness flaw

Current `world-v0-authority-runtime-smoke.mjs` assigns movement by peer-array creation order:

- peer 0 → `+X`;
- peer 1 → `-X`.

But authoritative slot is assigned asynchronously and arrives later in `world_v0_welcome`. The smoke records `welcome.slot` but does not use it to define the physical stimulus.

Therefore socket-order inversion on real staging can send both actors away from the central Yard while protocol correctness remains healthy. The final prop-displacement check then fails for an evidence-harness reason.

The failed log did not print slot/input provenance, so this is a strongly supported causal explanation, not a directly observed slot inversion for that exact attempt.

**Conclusion:** Owner/device baseline is not the immediate next execution step. The remote qualification harness must first be hardened and requalified.

Canonical detailed gate:

`docs/WORLD_V0_PEER_AWARENESS_REMOTE_GATE.md`

---

## 9. Mandatory first execution stage — VQ-H1 validation hardening

Do this in the **new conversation**. Do not perform product-camera/HUD work in parallel.

### H1.1 — deterministic authority stimulus

Preferred design:

- derive each peer’s probe direction from authoritative B(0) state;
- identify controlled actor by `welcome.selfSessionId`;
- derive central interaction target from actual central barricade (`prop-0..prop-5`) centroid;
- normalize actor→target XZ direction;
- make stimulus independent of peer-array order and slot arrival ordering;
- still assert distinct authoritative slots.

A slot-based `slot0 => inward / slot1 => inward` helper is an acceptable bounded fallback, but B(0)-derived targeting is preferred because it qualifies the actual scene state.

### H1.2 — make failures self-diagnosing

Record on every failure, not only PASS:

- peer index + authoritative slot;
- B(0) self position;
- target + chosen input vector;
- accepted / late / rejected / relayed / fresh counts;
- latest boundary / snapshots;
- max prop displacement;
- lease-expired count;
- epoch-ended seen/reason;
- WebSocket close code/reason and useful event ordering.

Preserve production-isolation, guard equality, identity and wrong-epoch checks.

### H1.3 — permutation falsifier

Before network qualification, prove the stimulus helper is invariant to peer-array ordering / mocked slot permutation.

### H1.4 — acceptance boundary for remote authority

After hardening:

1. local authority smoke PASS;
2. isolated staging authority PASS on one deployed SHA;
3. rerun staging authority on the **same deployment** and require a second PASS.

Two remote passes are required because pre-hardening evidence also contained the separate premature-close signature. If that signature recurs, stop and diagnose lifecycle/transport semantics instead of rerunning until green.

### H1.5 — exact Chromium harness review

Current exact-state launcher uses `--disable-gpu` and Chrome 152 emitted an automatic SwiftShader WebGL fallback deprecation warning during the starvation failure.

Current Chromium documentation recommends explicit SwiftShader opt-in for headless/software WebGL, including SwANGLE forms such as:

- `--use-gl=angle`
- `--use-angle=swiftshader`
- `--enable-unsafe-swiftshader`

Do **not** immediately replace the launcher from theory. Run a bounded same-SHA local A/B:

- current launch mode;
- explicit documented SwANGLE mode.

Do not weaken dead-man semantics, exact guard, `MIN_ACTIVE_TICKS`, or `MIN_GUARD_MATCHES` to improve CI pass rate. Prefer a new launch mode only if it preserves the same correctness path and removes the deprecated fallback dependency without a new confounder.

### H1.6 — machine boundary required before Owner baseline

Require:

- local exact-state PASS;
- isolated staging authority PASS twice on the same deployment;
- remote two-process Chromium exact-state PASS;
- zero state mismatch / pending guard / remap failure / runtime failure at verdict;
- production isolation PASS.

A one-off hosted-runner starvation failure with zero state mismatch may be retried once on the exact same SHA **after evidence is recorded**. A recurrent starvation pattern is a harness blocker, not something to normalize.

---

## 10. Owner/device baseline — only after VQ-H1 closes

Use current baseline with no camera/PEER-awareness candidate applied.

### Run A — phone slot 0

1. Android joins a fresh Run key first;
2. desktop joins second;
3. natural play for at least ~60–90 s; a few minutes if useful.

### Run B — phone slot 1

1. desktop joins a new fresh Run key first;
2. Android joins second;
3. comparable natural play.

Do not turn this into a scripted movement benchmark.

Record separately:

1. initial awareness of the other physical body;
2. whether camera points into useful shared Yard space;
3. whether PEER leaving frame during active play is confusing/frustrating or natural;
4. whether a navigation cue is actually desired and in what situation;
5. whether an edge cue would help or instead weaken physical shared-world presence;
6. portrait prop/world readability at current scale/FOV;
7. Foundation/input/performance/feel problems separately from camera awareness.

Classification:

- slot 0 clearly worse, slot 1 acceptable → C1 strongly supported;
- both starts acceptable, active PEER loss recurrent/problematic → C3 becomes plausible;
- both need initial shared-space establishment, active loss acceptable → C1/C2 before HUD;
- no meaningful issue → C0 wins; stop awareness work;
- Foundation/feel issue dominates → stop product expansion and classify separately.

---

## 11. Validation contract for the eventual selected product candidate

### L0

- normal repo CI PASS;
- frozen-F5 preflight PASS;
- no unintended authority/protocol/simulation changes;
- presentation revision changes only when presentation changes.

### L1 product evidence

Camera-aware shell evidence must cover all four combinations:

- desktop slot 0;
- desktop slot 1;
- portrait slot 0;
- portrait slot 1.

Record:

- `selfSlot`;
- camera preset / hemisphere / phase;
- PEER projected NDC or equivalent screen coordinate;
- semantic YOU/PEER presence;
- exact B(0) guard;
- same-live-state screenshots;
- zero runtime/state-guard failure.

Do not use “PEER always visible” as a generic success criterion.

Candidate-specific checks:

- C1 → prove slot symmetry / intended inward framing;
- C2 → both bodies in establishing safe frame, then deterministic transition to self follow;
- C3 → cue appears correctly outside awareness-safe frame and disappears inside it.

### L2

Any eventual candidate touching `public/world-v0/app.js` must use `[runtime-qualify]` and pass the two-real-Chrome exact-state falsifier.

Reason: the same `requestAnimationFrame` loop drives presentation **and** `advancePrediction()` / scheduled-input generation. “Presentation only” still has temporal blast radius.

No hosted-runner timing metric becomes a product-performance claim.

---

## 12. Physics expansion remains downstream

Product Lab suggests a later **Core interaction set** is more promising than the Broad set:

- heavy co-op block;
- beam;
- ball.

Ramp + gate added clutter and should not be carried forward automatically.

Do not start Core physics expansion until camera/peer-awareness is either:

- accepted as C0/no problem; or
- resolved by one bounded product candidate + Owner judgement.

---

## 13. Readiness state machine

### Current state

`PREPARATION COMPLETE / EXECUTION PLAN READY`

but

`PRODUCT IMPLEMENTATION BLOCKED`

because VQ-H1 and Owner/device A/B evidence remain unexecuted.

### Gate A — validation apparatus ready

VQ-H1 closes only after its local + repeated remote authority + remote exact-state boundary passes.

### Gate B — product problem classified

Owner A/B baseline closes only after slot effect / viewport effect / active-awareness need are separated.

### Gate C — product implementation ready

Only then:

- exactly one of C0–C4 is selected (C0 may intentionally select no implementation);
- hypothesis fixed;
- blast radius fixed;
- L1/L2 evidence contract fixed;
- Owner success/rejection criteria fixed.

At that point report:

`READY FOR BOUNDED PRODUCT IMPLEMENTATION`

and implement only that candidate.

---

## 14. Why this preparation is considered complete

The preparation phase has done the work it can legitimately do without crossing into execution:

- restored a clean qualified runtime baseline;
- rejected momentum from an unearned HUD scaffold;
- demonstrated the camera-slot confounder analytically;
- kept C0 as a valid outcome;
- compared camera/HUD candidate classes rather than preselecting one;
- defined the Owner A/B experiment;
- attempted fresh remote qualification instead of assuming deployment health;
- discovered and reproduced flaws in the qualification apparatus;
- separated local exact-state starvation from actual divergence;
- identified a causal peer-order flaw in the authority physical stimulus;
- specified validation-hardening scope and natural stop boundaries;
- preserved the rule that product implementation belongs after evidence, not before it.

No further product coding in this conversation would be “preparation”; it would begin executing VQ-H1 or a product hypothesis and therefore belongs in the fresh conversation requested by the Owner.
