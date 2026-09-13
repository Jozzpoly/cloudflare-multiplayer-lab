# Multi_World Multiplayer Foundation v1 — research contract

Status: **RESEARCH / NOT PRODUCT QUALIFIED / DO NOT MERGE AS A CLAIM OF READINESS**  
Date: 2026-09-13  
Research branch: `research/multiplayer-foundation-v1-2026-09-13`  
Grounding base: `main@031c092d38430c73ecf033c5244f62545db204e2`

## 1. Why this frontier exists

The qualified fixed-2P Shared Yard remains valuable evidence, but its current topology is not the intended long-term multiplayer abstraction.

The next product frontier is not "change 2 to 6". It is to earn a multiplayer foundation that:

- runs naturally with **1–6 concurrently active actors** in one shared authoritative physical world;
- allows actors to join an already-running `WorldEpoch` without resetting that world;
- distinguishes world lifetime, actor membership lifetime, ActorSession lifetime, and transport binding lifetime;
- preserves the useful authority / scheduled-input / prediction / reconciliation / identity lessons already qualified in World V0;
- is architected so the reusable multiplayer semantics can later be extracted as a donor rather than remaining inseparable from one Multi_World yard;
- stays narrow enough to falsify before we build accounts, MMO infrastructure, distributed physics, or other speculative layers.

The qualified World V0 implementation is therefore a **reference specimen and donor of earned evidence**, not source code that must be generalized line-by-line.

## 2. Evidence already earned vs. evidence not yet earned

### Earned by the existing World V0 line

Existing project evidence supports a useful baseline:

- one server-authoritative shared physical world;
- scheduled canonical input;
- browser prediction and reconciliation;
- epoch/build identity guards;
- ActorSession continuity and bounded reconnect semantics;
- bounded transport-loss handling;
- Owner-qualified fixed-2P product behavior.

This research branch must not silently invalidate those achievements.

### Newly earned on this research branch

Headless foundation evidence now covers:

- canonical dynamic roster mutation through 1–6 active actors in one `WorldEpoch`;
- capacity rejection without consuming actor identity;
- transport loss/rebind without topology mutation;
- monotonic actor ordinals with no identity reuse after retirement;
- deterministic same-tick retirement/join ordering and mutation idempotency;
- dynamic actor + persistent-world entity topology with revision/digest identity;
- deterministic spawn selection that does not couple physical spawn position to actor identity;
- variable-width exact float32 state guards bound to topology identity;
- full repository CI compatibility for the combined foundation seams.

Primary full-suite execution checkpoint for Gate 1 + Gate 2 core:

- research head `540109717d642aa892785bbba5ef4302557e2dab`;
- GitHub Actions run `34773206868`;
- result: `completed / success`.

### Not earned yet

The following remain research claims until independently certified:

- 3–6 player product behavior;
- late join into an **active Box3D** physical simulation;
- dynamic scheduled-input ownership integrated with the authority runtime;
- dynamic browser replica topology;
- durable reconstruction of the authoritative physical world after Durable Object restart/eviction/deployment;
- acceptable CPU/bandwidth behavior at six active players;
- donor portability into a second consumer;
- continuous-world / MMO semantics.

## 3. Platform conclusion — provisional but evidence-backed

For the 1–6 player frontier, **one authoritative Cloudflare Durable Object per world/room remains the default architecture**.

This is not a claim that one Durable Object scales to every future Multi_World ambition. It is a scoped conclusion for this frontier:

- Cloudflare explicitly positions Durable Objects as a single coordination point for multiple clients, including multiplayer games;
- the Hibernation WebSocket API permits far more connections than this frontier needs (platform maximum 32,768 per Durable Object, with practical CPU/memory limits applying earlier);
- SQLite-backed Durable Object storage is transactional and strongly consistent;
- Durable Object in-memory state is lost on eviction/restart and must not be treated as durable truth.

Therefore the immediate scaling risk is **simulation/lifecycle/recovery design**, not a six-WebSocket platform ceiling.

Official sources checked 2026-09-13:

- https://developers.cloudflare.com/durable-objects/best-practices/websockets/
- https://developers.cloudflare.com/durable-objects/api/state/
- https://developers.cloudflare.com/durable-objects/reference/in-memory-state/
- https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/
- https://developers.cloudflare.com/durable-objects/concepts/durable-object-lifecycle/
- https://developers.cloudflare.com/durable-objects/platform/limits/

## 4. Architectural boundary

The intended foundation should separate these concepts even if early implementation keeps some of them in one process/class:

| Boundary | Responsibility |
| --- | --- |
| `WorldIdentity / WorldEpoch` | identity of one canonical physical-world run |
| `ActorSession` | logical playable actor continuity inside that world |
| `TransportBinding` | currently attached WebSocket/device connection; replaceable |
| `RosterState` | active memberships and canonical join/retire history |
| `AuthorityRuntime` | canonical tick and physical simulation |
| `NetEntityRegistry` | dynamic actor entities plus world/static entities |
| `WorldCheckpoint` | durable reconstruction material, still unqualified |
| `ReplicationProtocol` | snapshots, inputs, topology changes, rebase |
| product policy | capacity, spawn policy, retention policy, UX |

A future donor should expose the semantics above without requiring Multi_World-specific yard layout or UI and without hard-coding Cloudflare APIs into the portable core.

## 5. Core invariants for the first executable foundation

These are active hypotheses being converted into executable checks.

### 5.1 Canonical membership mutation

A join or retirement is a **canonical world event effective at a canonical tick**.

A WebSocket opening/closing by itself is not a topology mutation.

This means:

- transport loss does not retire an actor;
- reconnect/rebind to the same ActorSession does not allocate a new actor;
- fresh membership enters at an explicit future tick;
- retirement enters at an explicit future tick;
- canonical history cannot be rewritten by scheduling a new mutation in the past.

### 5.2 Stable actor identity

Within one `WorldEpoch`:

- actors receive monotonically increasing `actorOrdinal` values;
- actor NetEntityId is initially `actor:<actorOrdinal>`;
- ordinals are never reused after retirement;
- capacity counts active memberships, not the highest ordinal ever allocated.

This deliberately removes the current coupling `slot = players.size = actor identity`.

### 5.3 Deterministic same-tick ordering

Membership mutations sharing a tick need a deterministic cross-runtime order.

Current research rule:

1. retirements execute before joins at the same tick, allowing deterministic same-tick replacement;
2. within one phase, mutations are ordered by explicit byte/code-unit lexical `mutationId` ordering, not locale-sensitive comparison;
3. an exact repeated `mutationId` + payload is idempotent even after execution;
4. reusing a `mutationId` for a different payload is invalid.

This rule is intentionally exposed to falsification. It is not yet a frozen public protocol.

### 5.4 Dynamic topology

Static props may remain statically defined, but actors are dynamic.

The research contract now proves headlessly that topology can carry:

- monotonically changing `topologyRevision`;
- canonical active actor/entity order;
- a topology digest;
- exact entity coverage checks;
- state guards comparable only when topology identity is compatible.

`simBuildId` remains code/config/schema identity. It must not be overloaded with current roster identity.

### 5.5 Spawn is policy, not identity

A physical entry point is not an actor slot.

The current research seam deterministically selects the first safe candidate position from canonical policy order and current blockers. A later `actor:6` may therefore reuse a physical location once occupied by retired `actor:2` without reusing `actor:2` identity.

This seam is intentionally replaceable by a more advanced spawn policy later.

## 6. Client consequence

The existing singular `self + remote` client shape cannot be the long-term foundation.

Target client abstraction:

- one local controlled actor;
- `0..N` remote actor replicas keyed by stable NetEntityId;
- dynamic add/remove visuals and simulation bodies;
- rebase against a dynamic entity registry/topology revision;
- per-actor relayed canonical inputs where prediction needs them;
- no assumption that the world begins only after a full fixed roster exists.

This does **not** authorize a client rewrite yet. The headless authority physics contract must earn confidence first.

## 7. Recovery is a separate hard problem

SQLite-backed Durable Object storage exists in the current deployment configuration, but the live Box3D runtime is currently in-memory and is not thereby durable.

The foundation must explicitly decide what a dormant/restarted world means.

First bounded experiment:

1. run authoritative Box3D to canonical tick `T`;
2. capture candidate reconstruction material (`recording`/canonical state + required metadata);
3. destroy the in-memory simulation;
4. construct a clean authority runtime;
5. restore at `T`;
6. replay an identical scheduled-input suffix;
7. compare canonical guards over a bounded horizon;
8. measure checkpoint size, restore latency, divergence, and write frequency/cost.

Possible outcomes:

- **A — exact/bounded-exact reconstruction:** recording/state checkpoint becomes a viable recovery primitive;
- **B — reproducible but non-exact:** define an explicit recovery discontinuity or stronger canonical serialization strategy;
- **C — unstable/too expensive:** reject the approach before product integration.

Until this experiment passes, "durable world" is **not proven**.

For the near term, a dormant world may legitimately freeze when no active players remain. Simulating elapsed offscreen time is a separate product feature, not a hidden infrastructure requirement.

## 8. Performance and scaling policy

For 1–6 actors, prefer measurement over premature infrastructure.

Do not introduce binary protocols, interest management, multi-DO distributed physics, regional shards, or custom compression merely because they may be useful at future scale.

Measure first at 1 / 2 / 3 / 6 players:

- authority CPU time per simulation step and per wall-clock second;
- catch-up loops / dropped or late ticks;
- inbound/outbound WebSocket messages per second;
- bytes per client per second and aggregate bytes per room;
- snapshot serialization size/time;
- client simulation/reconciliation cost;
- disconnect/reconnect behavior under artificial loss;
- Durable Object duration/storage behavior once durable recovery is introduced.

An `O(N²)` relay is not automatically a defect at `N <= 6`; it becomes a defect when measured cost or future donor requirements justify replacement.

## 9. Deliberate non-goals for this frontier

Do not expand current implementation scope into:

- accounts / passwords / global player identity;
- inventory/economy persistence;
- seamless MMO actor succession;
- multi-region simulation of one physical world;
- splitting one small physical room across several authority processes;
- hundreds/thousands of actors in one simulation;
- production matchmaking;
- final anti-cheat/security architecture;
- final binary network protocol;
- arbitrary continuous offline world time.

Extension seams are welcome. Speculative implementation is not.

## 10. Certification ladder

A layer may advance only when the previous layer has enough evidence to make the next test informative.

### Gate 0 — Boundary / live-truth audit

Status: **ADEQUATE**.

Evidence:

- fixed-2P couplings located across contract, authority orchestration, state guard, protocol start conditions, and browser client;
- current qualified World V0 remains untouched on `main`;
- research isolated on a dedicated branch and draft PR.

### Gate 1 — Headless roster/lifecycle contract

Status: **PASS for the current research contract**.

Proven by executable smoke + full repository CI:

- 1→2→3→6 late joins in one `WorldEpoch`;
- capacity rejection without identity consumption;
- reconnect/transport loss without topology mutation;
- retirement and same-tick replacement;
- no actor ordinal reuse;
- deterministic same-tick competition;
- exact mutation retry idempotency, including after execution;
- replay of identical canonical mutation log reproduces identical roster state/outcomes.

Implementation/evidence:

- `src/multiplayer-foundation/roster-machine.ts`
- `scripts/multiplayer-foundation-roster-smoke.ts`
- full-suite checkpoint `540109717d642aa892785bbba5ef4302557e2dab`
- Actions `34773206868` → `completed / success`

### Gate 2 — Dynamic entity/topology contract

Status: **CORE PASS / ADEQUATE TO ENTER HEADLESS PHYSICS INTEGRATION**.

Proven by executable smokes + full repository CI:

- persistent world entities + dynamic actor registry;
- topology revision/digest semantics;
- exact entity coverage validation;
- generalized variable-width float32 state guard bound to topology identity;
- deterministic six-candidate spawn allocation policy;
- actor identity remains independent from reusable physical spawn position;
- stale/forged topology rejection;
- transport-only changes do not invalidate topology/state-guard identity.

Implementation/evidence:

- `src/multiplayer-foundation/entity-topology.ts`
- `src/multiplayer-foundation/spawn-policy.ts`
- `src/multiplayer-foundation/state-guard.ts`
- `scripts/multiplayer-foundation-topology-smoke.ts`
- `scripts/multiplayer-foundation-spawn-smoke.ts`
- `scripts/multiplayer-foundation-state-guard-smoke.ts`
- full-suite checkpoint `540109717d642aa892785bbba5ef4302557e2dab`
- Actions `34773206868` → `completed / success`

Still open inside the wider Gate 2/3 boundary:

- dynamic scheduled-input ownership attached to real authority actors;
- actual Box3D body creation/destruction on canonical roster mutations;
- proof that topology/state guards remain coherent through physical churn.

Those are intentionally moved into the headless authority integration experiment rather than being declared solved by abstract state machines.

### Gate 3 — Authority physics integration

Required:

- Box3D authority can start with one actor;
- 2nd–6th actors can enter a running simulation on canonical ticks;
- retirement/replacement can remove/add physical actor bodies without corrupting the world;
- dynamic scheduled-input ownership remains attached to the correct ActorSession/NetEntityId;
- topology state guards cover the actual live Box3D entity set;
- deterministic/bounded-repeatable headless scenarios.

Status: **NEXT ACTIVE FRONTIER / NOT YET PROVEN**.

### Gate 4 — Recovery / restart experiment

Required:

- authoritative reconstruction experiment described above;
- deliberate process/DO restart or eviction-oriented validation;
- storage schema and failure semantics;
- evidence that a restart cannot silently masquerade as continuity when physical state was lost.

Status: **NOT STARTED**.

### Gate 5 — Dynamic browser replica certification

Required:

- self + N peers;
- live add/remove;
- generalized rebase;
- late join snapshot/bootstrap;
- existing prediction/reconciliation quality not silently regressed.

Status: **NOT STARTED**.

### Gate 6 — synthetic 1/2/3/6 resilience + load

Required:

- repeatable six-client harness;
- latency/loss/reconnect stimulus;
- CPU/network metrics;
- failure diagnostics and no hidden fixed-2 assumptions.

Status: **NOT STARTED**.

### Gate 7 — Owner / human multiplayer qualification

Required only after automation makes the build worth human attention:

- real 3–6 player sessions;
- mixed desktop/mobile where useful;
- gameplay feel and visibility of peers;
- reconnection and late-join behavior observed as a person, not inferred from headless PASS.

Status: **NOT STARTED**.

### Gate 8 — donor qualification

A foundation is not "donor-grade" because it lives in a folder named foundation.

Required evidence:

- a second deliberately small consumer/fixture uses the core without importing Multi_World yard/UI policy;
- platform-specific adapters are separable from portable semantics;
- extraction does not require copying hidden assumptions from World V0;
- donor documentation states exactly what is portable and what remains product-specific.

Status: **NOT STARTED**.

## 11. Near-term execution order

1. Build a bounded headless Box3D authority fixture that starts with one actor and applies canonical joins through six while the world is already advancing.
2. Add retirement/replacement churn and dynamic per-actor input ownership to that physical fixture.
3. Bind actual live Box3D entity coverage to the dynamic topology/state guard and falsify stale/wrong ownership cases.
4. Only after Gate 3 is credible, run the physical reconstruction experiment before promising persistent-world continuity.
5. Then design the dynamic browser replica and late-join bootstrap path from earned authority semantics, rather than rewriting the client speculatively.
6. Preserve fixed-2P World V0 as a regression/reference specimen until the new line earns stronger evidence.
7. Qualify donor claims only with a second consumer/fixture, not folder structure or intention.

## 12. Decision rule

Move fast on **reversible isolated experiments** and slowly on **claims, migrations, and irreversible architecture**.

The research branch may change aggressively. `main` and the qualified product should move only when a bounded body of evidence demonstrates that the new foundation preserves what matters and actually removes the fixed-2P constraints it claims to remove.
