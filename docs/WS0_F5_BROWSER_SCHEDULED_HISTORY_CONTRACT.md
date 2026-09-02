# WS0 F5 — isolated browser scheduled-history contract

Status: **PRE-EXECUTION / NO BROWSER RESULT**

## 1. Qualified inputs

F5 starts from F4 head `d33294e9052e37cf716d809e7dca551d1065df44` and does not reopen the already-qualified lab questions:

- F3.0: an ahead-of-authority canonical prediction timeline can give a forward authority future input records under bounded delay, but real clock synchronization/drift was explicitly not proven.
- F3.1: when scheduled target-tick records are available on time, a forward-only authority plus complete client history repair preserves one coupled actor/shared-matter history. In the carried real-peer timing traces, scheduled-forward and source-time authority rollback had identical client correction cost.
- F4: the F3.1 client correction semantics can be implemented with bounded recent `box3d.js@0.1.1` recording history. With the 8-tick segment candidate and 24-tick retained window, observed max replay was 16 / 18 / 20 physics steps for the carried 65 / 85 / 85+HOL traces, below the frozen 21-step bound. Corrected history can itself be corrected again, and entity rebinding must be generation-local.

F5 moves those results into an actual two-browser runtime. It is not another offline temporal-family discriminator.

## 2. Research question

> Can two real browser clients run a causal `L=8` predicted canonical timeline against an isolated forward-only Cloudflare authority, exchange future ticked input without future-human knowledge, repair late remote/consumption information with bounded complete-world Box3D history, and expose the resulting correction honestly enough for immediate human judgement?

A successful compile or WebSocket connection is not an F5 result.

## 3. Isolation boundary

F5 MUST NOT change the normal `/world0/ws` protocol semantics or the frozen human baseline route.

Use:

- a new exported Durable Object class `WorldSliceF5`;
- a new binding `WORLD_SLICE_F5`;
- a new worker route `/world0-f5/ws`;
- a new browser surface `/world0-f5/`;
- a separate DO instance name, optionally keyed by a short `run` query parameter.

Existing `WORLD_SLICE_0`, `/world0/ws`, `/world0-two-client/` and PR #15 remain controls.

## 4. Canonical tick semantics

Server `tick = T` means the authority is at boundary `B(T)`, immediately before consuming input for canonical tick `T` and executing that physics step.

Client local `boundaryTick = C` means its predicted world is at `B(C)`.

The client aims to maintain:

`C ~= estimatedAuthorityTickNow + L`

with `L=8` for this gate.

The client is therefore ahead in **canonical simulation time**, not clairvoyant in wall time.

### Causality requirement

At wall time `now`, when the client is about to simulate its current predicted canonical tick `T`, it samples the human input **now**, applies that value locally to tick `T`, and emits the logical input record `{targetTick:T, x, z}` now.

The client MUST NOT create a value for tick `T` before it has actually sampled the human input that it applies to local predicted tick `T`.

This is the live implementation counterpart of F3.0's prediction lead.

## 5. Authority scheduled-input contract

F5 authority remains forward-only.

Client transport:

- one logical input record per predicted canonical tick after protocol activation;
- transport batch size `2`;
- each record contains integer `targetTick` plus normalized `x/z`;
- batches have a monotonic batch sequence;
- accepted future records are immutable for this experiment; conflicting duplicate values for one target tick are rejected rather than silently replaced.

Authority:

1. validates record shape and a bounded future window;
2. rejects/classifies records whose target tick is already consumed;
3. buffers accepted records by `(sessionId,targetTick)`;
4. immediately relays newly validated future records to the other F5 peer;
5. at boundary `B(T)`, consumes the exact buffered record for `T` if present, otherwise holds the previously consumed input;
6. applies the consumed inputs to Box3D and executes tick `T`;
7. broadcasts authoritative **consumption feedback** for tick `T` to both peers, including the actual consumed `x/z` and whether a new record was accepted for that tick.

Consumption feedback is required because F3.1's L6 negative proved that two clients can agree with each other while both disagree with authority if they assume a target tick was consumed when it was not.

## 6. Phase estimator / activation boundary

F5 does not claim a production clock synchronization protocol.

For this bounded browser gate:

- ping/pong carries current authority tick;
- browser measures RTT;
- at pong receipt it estimates current authority phase as `pongTick + RTT/2 / stepMs` under a symmetric-path approximation;
- local elapsed time advances that anchor until the next pong;
- diagnostics report actual predicted lead and phase error signals.

To avoid startup records being late merely because the second browser was still joining, the authority chooses a `protocolStartTick` sufficiently in the future and broadcasts one `f5_start` snapshot to both clients. Before that tick the canonical input is zero. Each browser may catch its local prediction world up, but only begins logical input generation at `protocolStartTick`.

The activation delay is startup scaffolding, not evidence for a production lead.

## 7. Client predicted world

Each browser owns a complete local Box3D world:

- both actor bodies;
- all shared props;
- same movement/contact constants as authority;
- self-first actor creation order remains allowed to differ between the two browsers.

Self human input is applied immediately to the browser's current predicted canonical tick.

Remote input priority for tick `T`:

1. authoritative consumed input for `T`, when known;
2. validated peer future record for `T`, when known;
3. hold-last known remote input.

Self input priority for tick `T`:

1. authoritative consumed input for `T`, when known;
2. locally generated intended record for `T`;
3. hold-last.

When newly received peer or consumption information changes the input that was actually used for an already simulated tick, the browser repairs from the earliest changed tick.

## 8. Bounded browser history

Use the F4 candidate geometry unchanged for the first browser implementation:

- recording segment length: 8 ticks;
- retained window: 24 ticks;
- checkpoint restore boundary: `B(T)` before corrected tick `T`;
- corrected resimulation itself starts a new recording generation at the corrected boundary;
- stale suffix history is invalidated;
- overlapping later corrections may restore into the corrected generation.

No replay from connection/session seed is allowed for normal correction after the retained history has warmed up.

### Entity identity

Stable browser application identity is host-owned:

- props: stable prop ids;
- actors: stable server session ids.

Box3D `BodyId` and prior-generation creation ordinal are not stable identity.

On every replay generation handoff, enumerate replay bodies, use the preserved F5 body-name locator to rebuild `NetEntityId -> generation-local ordinal -> current BodyId`, and validate uniqueness/completeness before resimulation.

Body name remains an experimental locator seam, not the claimed final production identity transport.

## 9. Same-canonical-tick diagnostics

F5 MUST NOT repeat the old mixed-time diagnostic that compares the browser's current predicted world to a delayed authority snapshot from an older tick.

After each local predicted step, retain lightweight diagnostic samples keyed by canonical boundary tick.

When an authority snapshot for `B(T)` arrives, compare it only against the browser sample for the same `T` if retained.

Report separately:

- same-tick self position residual;
- same-tick remote position residual;
- same-tick max prop residual;
- snapshot age relative to current predicted tick.

These public-state samples are diagnostics only and are not used as rollback state.

## 10. Required live metrics

Expose in the browser HUD and `window.__WS0_F5__.snapshot()` at minimum:

### Timeline / transport
- connection state;
- authority tick estimate;
- local predicted boundary tick;
- measured prediction lead;
- RTT median;
- generated input records / sent batches;
- server late/rejected records;
- consumed accepted / missing counts;
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

### Same-tick truth diagnostics
- latest / max same-tick self residual;
- latest / max same-tick remote residual;
- latest / max same-tick prop residual.

## 11. Presentation rule

Raw physics correction is the default F5 presentation.

Do not hide corrections with smoothing before the first Owner test.

A later explicit presentation variant may preserve the corrected physics world while visually amortizing the mesh/camera offset, but it must be a separate toggle/variant and must never feed smoothed transforms back into physics.

## 12. Automated validation before Owner test

Before asking for human play:

1. `npm run check` passes;
2. F5 browser JS passes syntax check;
3. the worker dry-run accepts the new F5 DO binding/export and routes;
4. a pure deterministic protocol smoke validates server consume semantics for on-time, missing, late and conflicting duplicate records;
5. PR diff confirms the old `/world0/ws` implementation file is unchanged unless a separately justified compatibility fix is unavoidable.

If the new Durable Object binding requires a migration/configuration step that cannot be safely represented in repo config, stop and classify that deployment blocker rather than mutating the existing `WorldSlice0` as a shortcut.

## 13. First Owner gate

The first human gate is deliberately small:

- one desktop browser + one phone browser;
- one fresh F5 run instance;
- both connected before protocol activation;
- direct player-player contact and pushing shared props;
- raw correction presentation;
- HUD evidence captured alongside subjective judgement.

Questions for Owner:

1. Does local self control still feel immediate despite the canonical lead?
2. Are rollback corrections perceptible as pops/teleports/camera discontinuities?
3. Are remote-player corrections more objectionable than shared-matter corrections?
4. Does the world feel physically shared rather than like two approximations?
5. Is the correction magnitude/frequency low enough to justify presentation-layer treatment, or does the temporal model itself still feel wrong?

## 14. Natural stopping boundary

F5 ends at the first faithful two-device raw-correction Owner judgement with matching runtime telemetry, or at a concrete implementation/deployment blocker that prevents such a test.

Do not in F5:

- tune a final smoothing algorithm;
- optimize checkpoint cadence from one device;
- claim production clock synchronization;
- add packet loss/reconnect architecture;
- merge research into PR #15;
- replace the frozen normal `/world0/ws` route.
