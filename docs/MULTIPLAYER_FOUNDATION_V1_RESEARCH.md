# Multi_World Multiplayer Foundation v1 — research contract

Status: **RESEARCH / GATE 3 HEADLESS AUTHORITY PASS / NOT PRODUCT QUALIFIED**  
Date: 2026-09-13  
Research branch: `research/multiplayer-foundation-v1-2026-09-13`  
Grounding base: `main@031c092d38430c73ecf033c5244f62545db204e2`

Long-horizon donor/architecture program:

- [`MULTIPLAYER_FOUNDATION_LONG_HORIZON.md`](MULTIPLAYER_FOUNDATION_LONG_HORIZON.md)

This document remains the **bounded executable 1–6 physical-world campaign**. The long-horizon document records cross-project requirements and architecture hypotheses. Neither is permission to merge the research branch as a claim of product readiness.

## 1. Frontier

The qualified fixed-2P Shared Yard remains valuable reference evidence, but its fixed topology is not the intended long-term multiplayer abstraction.

The bounded v1 frontier must prove that one authoritative physical world can:

- run naturally with 1–6 concurrently active actors;
- accept actors after the world has already started;
- retire and replace actors without recreating the world;
- keep world, membership, ActorSession and transport lifetimes distinct;
- preserve exact ownership between scheduled intent and physical actor;
- generalize dynamic topology/state guards beyond `actor:0 + actor:1`;
- remain compatible with the qualified World V0 line while research stays isolated;
- provide evidence useful to a future portable core without pretending that the current Box3D/tick model is universal.

The qualified World V0 implementation is a **reference specimen and donor of earned evidence**, not code that must be generalized line-by-line.

## 2. Evidence truth

### Existing World V0 evidence

The accepted line already supports:

- one server-authoritative shared physical world;
- scheduled canonical input;
- browser prediction and reconciliation;
- epoch/build identity guards;
- ActorSession continuity and bounded reconnect semantics;
- bounded transport-loss handling;
- Owner-qualified fixed-2P behavior.

This research branch must not silently invalidate those achievements.

### Gate-1/2 execution evidence

Headless foundation evidence covers:

- canonical dynamic roster mutation through 1–6 active actors in one `WorldEpoch`;
- capacity rejection without consuming actor identity;
- transport loss/rebind without topology mutation;
- terminal ActorSession identity inside one epoch;
- monotonic actor ordinals with no identity reuse after retirement;
- deterministic same-tick retirement/join ordering;
- mutation idempotency, including retry after execution;
- dynamic actor + persistent-world entity topology with revision/digest identity;
- deterministic spawn selection independent from actor identity;
- variable-width exact float32 state guards bound to topology identity.

Earlier full-suite checkpoint:

- `540109717d642aa892785bbba5ef4302557e2dab`;
- Actions `34773206868`;
- `completed / success`.

### Gate-3 execution evidence — 2026-09-13

The decisive headless authority fixture is now part of the normal repository `npm run check` path.

Execution checkpoint:

- research head `44745053e88fa4603693ea5cba77c5c6e779ab08`;
- GitHub Actions run `34775518201`;
- job `103772805970`;
- result: `completed / success`.

The executed log contains PASS results for:

- roster;
- topology;
- spawn policy;
- dynamic state guard;
- input ownership;
- live Box3D authority physics;
- existing World V0 regressions;
- A2R forecast check;
- TypeScript;
- Worker dry-run validation.

The physical smoke specifically demonstrated:

- one Box3D world survives the entire scenario;
- physical membership changes `0→1→2→3→4→5→6` while that world is advancing;
- per-ActorSession scheduled input drives the correct physical actor;
- wrong ownership is rejected by the input seam;
- `actor:2` retires and its actual Box3D body is destroyed;
- replacement `actor:6` enters in the same `WorldEpoch` without actor-ID reuse;
- final exact state guard covers 18 live entities: six actors + twelve props;
- a second complete run produces the same topology digest, final exact float32 guard and checkpoint guards.

This is **Gate-3 PASS for the scoped headless authority specimen**.

It is not evidence for browser `self + N`, six-human product feel, Durable Object restart continuity or production scale.

### Not earned yet

The following remain unproven:

- 3–6 player browser product behavior;
- dynamic browser replica topology and late-join bootstrap;
- durable reconstruction of the physical world after runtime/DO loss;
- real storage checkpoint/recovery semantics;
- acceptable CPU/network behavior under real/synthetic multi-client load;
- resilience under controlled latency/jitter/loss/duplicate/reorder;
- hidden/private recipient projection as a portable capability;
- non-physics canonical ordering semantics;
- donor portability into independent consumers;
- interest management, world partition, authority migration or MMO-scale semantics.

## 3. Platform conclusion — current scope

For the present small-room physical frontier, **one authoritative Cloudflare Durable Object per world/room remains current-best**.

This is a scoped deployment choice, not the portable multiplayer architecture.

Current platform facts relevant to the decision:

- Durable Objects are intended to coordinate multiple clients, including multiplayer workloads;
- Hibernation WebSockets can keep client connections while the DO is not resident in memory;
- the documented per-DO WebSocket ceiling is far beyond this experiment, while CPU/memory workload remains the practical constraint;
- SQLite-backed DO storage is available but does not make in-memory Box3D state durable by itself;
- eviction/restart can destroy in-memory runtime state;
- a DO currently remains at its creation location, so future geographic placement/migration is a distinct scaling concern.

Therefore Gate 4 is about **recovery semantics**, not merely writing something to SQLite.

## 4. Bounded architecture seams

For the current real-time physical profile, keep these responsibilities distinct even if implementation remains compact:

| Boundary | Responsibility |
| --- | --- |
| `WorldIdentity / WorldEpoch` | identity of one canonical physical-world continuity run |
| `ActorSession` | logical actor continuity inside that epoch |
| `TransportBinding` | replaceable socket/device attachment |
| `RosterState` | canonical membership and join/retire history |
| `ActorInputRegistry` | ActorSession → ActorId scheduled-intent ownership |
| `AuthorityRuntime` | canonical fixed-step physical simulation |
| `EntityTopology` | current dynamic physical/entity membership + revision/digest |
| `SpawnPolicy` | physical placement policy, explicitly not actor identity |
| `StateGuard` | exact scoped authority evidence bound to topology identity |
| `WorldCheckpoint` | candidate durable reconstruction material; not qualified yet |
| `ReplicationProtocol` | future bootstrap/state/topology/input/rebase semantics |
| product policy | capacity, retention, spawn UX, room rules, visibility |

The cross-project architecture must later generalize only the semantics that survive non-physics falsifiers. In particular, do **not** promote `effectiveTick` into a universal API before a transaction/revision fixture proves what the shared canonical-order contract actually is.

## 5. Earned invariants

### 5.1 Membership mutation

For the physical profile, join/retire are canonical mutations effective at canonical ticks.

A socket opening/closing is not itself a topology mutation.

Consequences:

- transport loss does not retire an actor;
- reconnect/rebind does not allocate a replacement actor;
- new membership/retirement cannot rewrite past canonical history;
- exact mutation retries are idempotent;
- one `mutationId` cannot alias different payloads.

### 5.2 Actor identity

Inside one `WorldEpoch`:

- actor ordinals increase monotonically;
- actor IDs are not reused after retirement;
- ActorSession identity is terminal after it has owned an actor;
- capacity counts active memberships rather than historical ordinal range;
- physical spawn locations can be reused independently of identity.

### 5.3 Same-tick ordering

Current research rule:

1. retirement before join;
2. lexical canonical `mutationId` ordering within a phase;
3. exact idempotent retries;
4. conflicting mutation-ID reuse rejected.

This is a tested physical-profile rule, not a frozen universal protocol.

### 5.4 Dynamic physical topology

The headless specimen supports:

- dynamic actor body creation/destruction;
- persistent props;
- topology revision + digest;
- exact live-entity coverage checks;
- topology-bound exact state guards;
- runtime churn without recreating the world.

`simBuildId` remains code/config/schema identity and is not overloaded with current roster identity.

### 5.5 Input ownership

Scheduled physical intent is bound to `(ActorId, ActorSession)`.

- another ActorSession cannot steer that actor;
- retired actors lose their input channel;
- replacement actors get fresh ownership;
- transport detach/rebind does not change actor ownership;
- malformed temporal ownership cannot silently retarget a body.

## 6. Recovery — Gate 4

SQLite storage exists, but physical continuity is still unproven.

First bounded reconstruction experiment:

1. start a live authority scenario and advance to canonical tick `T`;
2. capture candidate reconstruction material plus exact epoch/build/topology/provenance metadata;
3. destroy the entire in-memory Box3D authority runtime;
4. construct a clean runtime;
5. restore at the intended continuity boundary;
6. apply the same canonical input/mutation suffix;
7. compare exact state guards at restoration and across a bounded future horizon;
8. measure checkpoint size, encode/decode cost, restore latency and divergence;
9. intentionally corrupt/stale/incompatibly version checkpoint material and require fail-closed rejection.

Possible outcomes:

- **A — exact reconstruction:** checkpoint + bounded suffix can represent continuity for the scoped runtime;
- **B — deterministic but discontinuous reconstruction:** define an explicit recovery/rebase/new-epoch contract;
- **C — unstable or impractical:** reject the checkpoint strategy and test a different boundary.

A restart may never silently impersonate continuity that the reconstruction evidence does not support.

After the pure runtime experiment, repeat through real Durable Object storage/lifecycle apparatus.

## 7. Browser consequence — Gate 5

The current fixed `self + remote` client is not the target.

Required dynamic browser model:

- one local controlled actor;
- `0..N` remote replicas keyed by stable actor/entity identity;
- dynamic add/remove;
- topology-aware bootstrap and rebase;
- late join into an already-running world;
- reconnect/resume semantics derived from Gate-4 continuity rules;
- existing prediction/reconciliation behavior preserved or deliberately replaced with stronger evidence.

Do not rewrite the browser merely because Gate 3 is green. Recovery/bootstrap semantics should first tell the client exactly what state continuity means.

## 8. Resilience and scaling — Gate 6+

Initial measured points remain 1 / 2 / 3 / 6, followed by an upward sweep until a real bottleneck appears.

Measure:

- authority CPU per tick and wall-clock second;
- catch-up/overrun behavior;
- memory;
- input/snapshot/topology serialization time and size;
- messages and bytes per client/room;
- browser simulation/reconciliation cost;
- reconnect and late-join cost;
- checkpoint write/restore cost;
- controlled latency, jitter, loss, duplicate and reorder;
- failure diagnostics.

Do not introduce binary encoding, interest management, spatial partitioning, distributed physics or regional shards merely because they may be useful later.

The long-horizon architecture deliberately preserves seams for them so measured evidence can introduce the correct mechanism at the correct layer.

## 9. Certification ladder

| Gate | Scope | Status |
| --- | --- | --- |
| 0 | fixed-2 coupling / live-truth boundary audit | **ADEQUATE** |
| 1 | roster + membership lifecycle | **PASS** |
| 2 | dynamic topology + spawn + state guard | **PASS / scoped** |
| 3 | live headless Box3D 0→6 + ownership + churn + repeatability | **PASS / scoped authority specimen** |
| 4 | physical reconstruction + restart/storage semantics | **ACTIVE NEXT FRONTIER / UNPROVEN** |
| 5 | dynamic browser `self + N`, bootstrap, late join, resume | **UNPROVEN** |
| 6 | deterministic network faults + synthetic load + scale sweep | **UNPROVEN** |
| 7 | real 3–6 human Owner/friend sessions | **UNPROVEN** |
| 8 | independent donor consumers / cross-domain portability | **UNPROVEN** |

Gate 8 is expanded in the long-horizon program: a physics-only second fixture is insufficient for a claim of broad portfolio portability. At least one non-physics semantic falsifier and one authored-world/assembly falsifier should eventually challenge the proposed shared core.

## 10. Current execution order

1. Keep fixed-2P World V0 untouched as qualified reference/regression evidence.
2. Reconcile Gate-3 PASS into PR/project truth.
3. Execute Gate-4 pure physical reconstruction falsifier.
4. Run a small cross-domain research thread on canonical order/command/projection without changing the physical runtime API prematurely.
5. After recovery semantics are grounded, build dynamic browser bootstrap/replicas.
6. Build deterministic network impairment + N-client load apparatus before asking the Owner to act as routine QA.
7. Put real humans into the system only when automation has removed avoidable infrastructure uncertainty.
8. Promote donor claims only when materially different consumers prove the boundaries are genuinely portable.

## 11. Quality rule

Move aggressively on **isolated reversible falsifiers** and slowly on **claims, public contracts, migration and irreversible architecture**.

A green CI run is evidence only for checks that actually executed. Owner time is used for multiplayer feel and product judgement after machine-verifiable lifecycle, authority, recovery and resilience claims have been pushed as far as practical by automation.
