# WS0 F5 — isolated browser scheduled-history contract

Status: **CANDIDATE PREPARED / PRE-DEPLOY / NO LIVE BROWSER RESULT**

Live implementation head at this amendment: `ca8fc10ee93fe91684ba2de2302e2650eeba0a21`.

This contract was amended after automated implementation preflight but **before any F5 staging/runtime/Owner result**. The amendment aligns stale text with the actual deterministic implementation order and adds measurement-only evidence hardening. It does not change the core temporal family, physical semantics, F4 history geometry, raw-presentation rule or Owner pass/fail question.

## 0. Pre-live interpretation correction

Before F5 runtime execution, the recovered F3.0/F3.1 evidence was re-audited specifically for human wall-time causality.

F3.0 defines a client with prediction lead `L` as simulating canonical tick `S + L` while authority is at `S`, and newly sampled local input is applied immediately to that currently predicted tick. F3.1 compared scheduled-forward and source-time-common as different canonical-history policies. Their equal measured client correction/history cost is valid for the carried canonical histories, but must **not** be expanded into a claim that both policies realize the same human wall-clock event on the same authoritative tick.

Scheduled-forward intentionally maps a human action sampled now onto the client's current future canonical tick. Source-time authority rollback instead maps a late action into earlier authority history. Therefore the policies place wall-time/canonical-time cost differently even when their eventual repair horizon is similar.

F5 is the first live discriminator of whether the scheduled mapping is acceptable in actual play. It MUST preserve the no-future-human-knowledge rule and expose measured prediction lead, authority consumption and raw correction rather than borrowing a more favorable interpretation of F3.1.

## 1. Qualified inputs

F5 starts from F4 head `d33294e9052e37cf716d809e7dca551d1065df44` and does not reopen already-qualified lab questions:

- F3.0: an ahead-of-authority canonical prediction timeline can give a forward authority future input records under bounded delay, but production clock synchronization/drift was not proven.
- F3.1: when scheduled target-tick records are available on time, forward authority plus complete client history repair preserves one coupled actor/shared-matter history. Scheduled-forward and source-time authority rollback had identical measured client correction/history cost for their respective canonical mappings; F5 does not treat this as proof of identical wall-clock feel.
- F4: F3.1 correction semantics can be implemented with bounded recent `box3d.js@0.1.1` recording history. With the 8-tick segment candidate and 24-tick retained window, observed max replay was 16 / 18 / 20 physics steps for carried 65 / 85 / 85+HOL traces, below the frozen 21-step bound. Corrected history can itself be corrected again, and entity rebinding must be generation-local.

F5 moves those results into an actual two-browser runtime. It is not another offline temporal-family discriminator.

## 2. Research question

> Can two real browser clients run a causal `L=8` predicted canonical timeline against an isolated forward-only Cloudflare authority, exchange future ticked input without future-human knowledge, repair late remote/consumption information with bounded complete-world Box3D history, and expose the resulting correction honestly enough for human judgement on desktop + phone?

A successful compile, dry-run or WebSocket connection is not an F5 result.

## 3. Isolation boundary

F5 MUST NOT change the normal `/world0/ws` protocol semantics or the frozen human baseline route.

Use:

- exported Durable Object class `WorldSliceF5`;
- binding `WORLD_SLICE_F5`;
- worker route `/world0-f5/ws`;
- browser surface `/world0-f5/`;
- separate DO instance keyed by a short `run` value.

Existing `WORLD_SLICE_0`, `/world0/ws`, `/world0-two-client/` and PR #15 remain controls.

For F5, `WORLD_SLICE_F5`, its `exports` lifecycle entry and `/world0-f5/ws` worker-first asset route are **staging-only**. Root/production Durable Object bindings and lifecycle declarations remain unchanged. Creating/updating the staging Durable Object lifecycle requires an explicit staging deployment; ordinary root Connected Builds remain traffic-inert version uploads and must not apply the F5 lifecycle change.

## 4. Canonical tick semantics

Server `tick = T` means authority is at boundary `B(T)`, immediately before consuming input for canonical tick `T` and executing that physics step.

Client local `boundaryTick = C` means its predicted world is at `B(C)`.

The client aims to maintain:

`C ~= estimatedAuthorityTickNow + L`

with experimental `L=8` for this gate.

The client is ahead in **canonical simulation time**, not clairvoyant in wall time.

### Causality requirement

At wall time `now`, when the browser is about to simulate its current predicted tick `T`, it samples human input **now**, applies that value locally to tick `T`, and emits logical input record `{targetTick:T, x, z}` now.

The client MUST NOT create a value for tick `T` before it has actually sampled the human input that it applies to local predicted tick `T`.

## 5. Authority scheduled-input contract

F5 authority remains forward-only.

Client transport:

- one logical input record per predicted canonical tick after protocol activation;
- transport batch size `2`;
- each record contains integer `targetTick` plus normalized `x/z`;
- batches have monotonic batch sequence;
- accepted future records are immutable in this experiment; conflicting duplicate values for one target tick are rejected.

Authority:

1. validates record shape and a bounded future window;
2. rejects/classifies records whose target tick is already consumed;
3. buffers accepted records by `(sessionId,targetTick)`;
4. immediately relays newly validated future records to the other F5 peer;
5. at `B(T)`, consumes exact buffered record `T` if present, otherwise holds the previously consumed input;
6. applies consumed inputs and executes Box3D tick `T`;
7. broadcasts authoritative **consumption feedback** for tick `T`, including actual consumed `x/z` and whether a fresh record existed.

Consumption feedback is required because F3.1's near-boundary negative proved that two clients can agree with each other while both disagree with authority if they assume a target tick was consumed when it was not.

## 6. Phase estimator / activation boundary

F5 does not claim a production clock synchronization protocol.

For this bounded browser gate:

- ping/pong carries current authority boundary tick;
- browser measures RTT;
- at pong receipt it estimates authority phase using a symmetric-path RTT/2 approximation;
- local elapsed time advances that anchor until the next pong;
- diagnostics expose actual measured prediction lead / timeline behavior.

To avoid startup records being late because the second browser is still joining, authority selects a future `protocolStartTick` after both browsers are ready and sends a common F5 start state. Before activation, canonical input is zero. The startup delay is scaffolding, not evidence for a production lead controller.

## 7. Client predicted world and deterministic host ordering

Each browser owns a complete local Box3D world:

- both actor bodies;
- all shared props;
- the same movement/contact constants as authority.

### Canonical creation/application order

The prepared browser implementation sorts actors by authoritative server `slot` before body creation. This supersedes the stale pre-implementation allowance for self-first creation order.

Where host-side application order can affect deterministic simulation, authority and clients should use the same canonical ordering. Do not rely on a currently commutative operation (`SetLinearVelocity` on separate bodies) as a long-term determinism guarantee.

This rule is evidence-hardening, not a claim that application-level determinism is already qualified. Cross-device/application determinism is a later Foundation v0 question.

### Input resolution

Self human input is applied immediately to the browser's current predicted canonical tick.

Remote input priority for tick `T`:

1. authoritative consumed input for `T`, when known;
2. validated peer future record for `T`, when known;
3. hold-last known remote input.

Self input priority for tick `T`:

1. authoritative consumed input for `T`, when known;
2. locally generated intended record for `T`;
3. hold-last.

When newly received peer or consumption information changes the input actually used for an already simulated tick, the browser repairs from the earliest changed tick.

## 8. Bounded browser history

Use the F4 candidate geometry unchanged for the first browser result:

- recording segment length: 8 ticks;
- retained window: 24 ticks;
- checkpoint restore boundary: `B(T)` before corrected tick `T`;
- corrected resimulation starts a new recording generation at the corrected boundary;
- stale suffix history is invalidated;
- later overlapping corrections may restore into corrected history.

No replay from connection/session seed is allowed as a hidden normal correction fallback after the retained history has warmed up. A history-window miss is evidence to classify, not a reason to silently broaden the mechanism.

### Entity identity

Stable browser application identity is host-owned:

- props: stable prop ids;
- actors: stable server session ids for this F5 run.

Box3D `BodyId` and prior-generation creation ordinal are not stable identity.

On every replay generation handoff, enumerate replay bodies, use the preserved F5 body-name locator to rebuild stable-id → current replay body mapping, and validate uniqueness/completeness before resimulation.

Body name remains an experimental locator seam, not a final production identity representation.

## 9. Same-canonical-tick diagnostics

F5 MUST NOT compare the browser's current predicted world directly against a delayed authority snapshot from an older tick.

After predicted steps, retain lightweight diagnostic samples keyed by canonical boundary tick.

When an authority snapshot for `B(T)` arrives, compare only against browser sample `B(T)` if retained.

Report separately:

- same-tick self position residual;
- same-tick remote position residual;
- same-tick max prop residual;
- snapshot age relative to current predicted boundary.

These samples are diagnostics only, not rollback state.

## 10. Required live metrics

Expose in browser HUD / `window.__WS0_F5__.snapshot()` at minimum:

### Timeline / transport
- connection state;
- authority tick estimate;
- local predicted boundary tick;
- measured prediction lead;
- RTT median;
- generated input records / sent batches;
- server late/rejected records;
- authority consumed fresh / missing counts;
- peer future records received.

### History
- correction count;
- latest / max logical rewind ticks;
- latest / max actual replayed physics steps;
- max retained recording bytes;
- replay generation rotations;
- entity remap failures.

### Visible correction
- latest / max self physical replacement;
- latest / max remote replacement;
- latest / max shared-prop replacement.

### Same-tick truth
- latest / max same-tick self residual;
- latest / max same-tick remote residual;
- latest / max same-tick prop residual.

### Pre-live instrumentation amendment

Before the first Owner result, add measurement-only timing sufficient to distinguish temporal correction from mobile CPU/frame cost:

- latest / max correction-resimulation wall duration;
- preferably a small retained distribution such as p50/p95 if cheap;
- useful frame-delta / long-frame diagnostics around correction bursts.

Do not optimize the correction mechanism in response to those metrics before the raw F5 Owner gate unless it is functionally unusable.

## 11. Simulation/build fingerprint

Before live qualification, expose an explicit experimental simulation fingerprint in F5 handshake/telemetry.

At minimum it should identify the assumptions whose mismatch would invalidate same-simulation comparison, such as:

- F5 protocol/client/server revision;
- pinned Box3D package/build identity available to the project;
- 60 Hz / substep contract;
- movement constants/history geometry relevant to this gate.

This may be a simple deterministic `SimBuildId`-like string/hash for F5. Do not design the final production versioning system here.

The purpose is evidence integrity: a desktop, phone and authority result should say which simulation contract produced it.

## 12. Presentation rule

Raw physics correction is the F5 presentation.

Do not hide corrections with smoothing before the first Owner test.

A later presentation treatment may visually amortize mesh/camera displacement while corrected physics truth changes immediately, but it must be a separate layer and must never feed smoothed transforms back into physics.

## 13. Automated validation before Owner test

Before asking for human play:

1. `npm run check` passes;
2. F5 browser JS syntax/check gate passes;
3. staging dry-run accepts F5 DO binding/export/routes;
4. deterministic protocol smoke validates on-time, missing/hold-last, late, future-window and conflicting duplicate semantics;
5. frozen `/world0/ws` / PR #15 control files remain unchanged;
6. explicit staging deployment targets `cloudflare-multiplayer-lab-staging`, not root production lifecycle;
7. deployed F5 server/client revisions and simulation fingerprint are verified;
8. automated live WebSocket/DO smoke proves two clients can enter the same isolated run, activate the protocol, produce/consume ticked input and retain finite authority state before Owner attention is used.

A deployment blocker must be classified directly rather than bypassed by mutating `WorldSlice0` or root production lifecycle.

## 14. First Owner gate

One deliberate but natural desktop + phone session:

1. remote idle / local movement;
2. both moving without contact;
3. direct player-player contact;
4. pushing/interacting with shared props.

This progression is not four separate ceremonies; it helps localize the first perceptual failure while preserving free-play judgement.

Questions:

1. Does local self control still feel immediate despite scheduled canonical lead?
2. Are physical corrections perceptible as pops/teleports/camera discontinuities?
3. Is any hitch correlated with correction CPU/frame bursts, especially on phone?
4. Are remote-player corrections more objectionable than shared-matter corrections?
5. Does the world feel physically shared rather than like two approximations?
6. Is the correction magnitude/frequency low enough to justify later presentation treatment, or does the temporal model itself still feel wrong?

## 15. Natural stopping boundary

F5 ends at the first faithful two-device raw-correction Owner judgement with matching runtime telemetry, or at a concrete runtime/deployment blocker that prevents such a test.

Do not in F5:

- tune final smoothing;
- optimize checkpoint cadence from one device;
- claim production clock synchronization or final prediction lead;
- add packet-loss/reconnect architecture;
- implement the later Foundation v0 qualification program;
- build causal islands/binary protocol/transport replacement;
- merge research into the frozen control;
- replace normal `/world0/ws` semantics.

If F5 survives, use its measured result to design the concrete **Multiplayer Foundation v0 Qualification** described by `MULTI_WORLD_FOUNDATION_STRATEGY.md`. If F5 fails at the temporal/feel level, challenge the current scheduled-forward family before investing in that qualification program.
