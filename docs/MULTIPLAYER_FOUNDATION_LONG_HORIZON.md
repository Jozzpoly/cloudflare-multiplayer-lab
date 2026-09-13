# Multi_World Multiplayer Foundation — long-horizon architecture program

Status: **ACTIVE RESEARCH PROGRAM / ARCHITECTURE HYPOTHESES, NOT FROZEN API**  
Date: 2026-09-13  
Research branch: `research/multiplayer-foundation-v1-2026-09-13`  
Qualified product reference remains the fixed-2P World V0 on `main`.

This document answers a broader question than the current 1–6-player experiment:

> What multiplayer foundation would remain useful across Jozzpoly's future games and laboratories without forcing radically different products into one networking model?

The answer is deliberately a **program to earn architecture**, not a declaration that the final architecture has already been discovered.

## 1. Mission

Build a professional multiplayer foundation that can begin with a small shared Box3D world but can later serve materially different products:

- small real-time cooperative physical worlds;
- vehicle and machine sandboxes with articulated dynamic topology;
- collaborative builders/editors with persistent authored truth;
- hidden-information and turn/transaction games;
- long-lived simulations and procedural worlds;
- embodied bots and asynchronous LLM-driven residents;
- eventually larger worlds requiring interest management, partitioning, migration or multiple authority domains.

The foundation should be reusable because its **semantics are clean and evidenced**, not because every future feature is implemented now.

A future project must be able to adopt the smallest useful capability without inheriting Multi_World's yard, UI, Cloudflare deployment, Box3D representation, tick rate or product policy.

## 2. Evidence boundary today

Already executed on this research branch:

- dynamic membership from 0/1 through 6 active actors in one `WorldEpoch`;
- ActorSession continuity separated from transport connection;
- monotonic actor identity and deterministic membership mutation;
- dynamic topology revision/digest and exact entity coverage;
- dynamic scheduled-input ownership with owner-mismatch rejection;
- real Box3D actor creation/destruction while one world continues running;
- same-epoch retirement + replacement;
- six actors + twelve props covered by one 18-entity exact float32 guard;
- exact repeated headless scenario agreement across two runs;
- full repository CI, typecheck, existing World V0 regressions and Worker dry-run remain green.

Primary Gate-3 execution checkpoint:

- research head `44745053e88fa4603693ea5cba77c5c6e779ab08`;
- GitHub Actions run `34775518201`;
- `MULTIPLAYER FOUNDATION PHYSICS SMOKE PASS` executed in the normal repository `npm run check` path.

This proves a **headless authority specimen**, not browser multiplayer, durable-world recovery, six-human play quality, production scale or donor portability.

## 3. Portfolio donor audit

The portfolio was reviewed as requirement evidence. A repository can expose a useful stressor without donating its architecture.

| Repository / project | Multiplayer stressor or transferable lesson | Architecture authority here? |
| --- | --- | --- |
| `cloudflare-multiplayer-lab` | real-time authority, prediction/reconciliation, reconnect, physical shared world | current execution specimen only |
| `Coopege` | party lifecycle, LAN/Internet portability, authoritative save, latency/jitter/drop/reorder diagnostics | requirements/evidence donor |
| `Tysi-c-The-Game` | hidden state, per-seat projections, private rooms, bots/humans through one command path, browser lifecycle | strong semantic stress fixture |
| `Jozzue_Vehicles_Sandbox` | editable mechanism topology, one authority truth per mechanical relation, BUILD↔PLAY loop | future physical/topology stress fixture |
| `JV-Box3D-Web-experiment` | continuous vehicle control, physics/build provenance, browser/mobile delivery | real-time physics donor/stressor |
| `JV-Box3D-Web-Public` | source vs published artifact authority, exact manifests and compatibility provenance | release/provenance lesson |
| `JOZZ-ENGINEERING-SANDBOX` | collaborative authoring potential, versioned authored document, machinery/terrain/destruction ambitions | long-horizon authoring/world stress fixture |
| `voxel-aeronautics-workshop` | authored graph → deterministic compilation → runtime assembly; separate identity domains; articulated fracture | strong topology/identity stress fixture |
| `PROJECT-ANVIL-Machine-Matter-Physical-Fabric-Laboratory` | persistent semantic truth compiled into disposable runtime bodies/relations; topology replacement/rebind | strong truth/representation stress fixture |
| `planet-matter-lab` | globally curved adaptive editable world, potentially enormous spatial state | long-horizon partition/interest stressor only |
| `Box3d-Character-Controler` | high-level player intent + finite physical execution; reciprocal world/object interaction | command/authority stress fixture |
| `Llm-Live-NPC` | slow/asynchronous intent producer; bounded perception; validated affordances; no direct truth mutation | actor/intent/projection stress fixture |
| `Gloopipelago` | deterministic living simulation, explicit RNG, long-lived causal world, view must not become authority | determinism/world-lifetime stress fixture |
| `HomeScan-Web-Builder` | project truth distinct from assets/rendering; editor commands; future sharing; entity split/merge remap | authoring/asset stress fixture |
| `Jozz-Universal-Rig-Editor` | SOURCE ≠ authored truth ≠ evaluated motion ≠ renderer; preview/commit/cancel; provenance | authoring/representation stress fixture |
| `Jozz-Splat-Game-Lab` | visual capture is not calibrated world truth; coordinate/provenance boundaries | representation/asset lesson |
| `Box3d_FunProject` | native Box3D, cross-platform determinism/recording/replay, kernel intervention when justified | physics backend capability donor |
| `Simply_game_experiment` | procedural action world, many AI/projectiles/progression/persistence | legacy stress ideas, low authority |
| `Jozz_Test_Mod_0.04` | externally owned host/game runtime integration possibility | low-priority integration stressor |

### Portfolio-wide conclusion

No single current project defines the universal foundation.

The strongest repeated lesson across otherwise unrelated projects is:

> **Identity, authored/domain truth, runtime realization, presentation and transport are different things.**

A multiplayer architecture that collapses them into one replicated object graph would be convenient for the current yard and expensive for future projects.

## 4. Non-negotiable architectural principles — current hypotheses

These are stronger than implementation preferences but remain falsifiable.

### 4.1 Authority is about truth, not hosting technology

The portable core defines who may propose a change, who validates it, how it becomes canonical and what observers may learn.

Cloudflare Durable Objects are one current authority host adapter. A future native server, LAN host or other backend must be possible without changing game semantics.

### 4.2 Transport lifetime is not actor lifetime

A dropped socket is not automatically a departed player/actor. Reconnection, page refresh, mobile backgrounding and network switching are ordinary lifecycle events.

### 4.3 Intent producer is not world authority

Human input, heuristic bot decisions and LLM cognition may all produce intents/commands. They do not directly mutate canonical world truth.

The authority validates capability, ownership, legality, timing and current state before applying an outcome.

### 4.4 Projection is not truth

A client receives a **projection** of canonical truth appropriate to that recipient and current interest/visibility policy.

This is needed both for hidden-information games and for future scale. A renderer or viewport never becomes world authority merely because it is what one client currently sees.

### 4.5 Runtime representation is disposable unless explicitly promoted

Physics bodies, renderer nodes, interpolation buffers, compiled craft bodies and other runtime objects may be reconstructed from more durable truth.

Do not make `physicsBodyId == saveId == authoredId == networkId` a foundational assumption.

### 4.6 One universal fixed tick is rejected

Real-time physics needs canonical fixed-step ordering. Tysiąc-like games need action/transaction ordering. Collaborative authoring needs document revisions/transactions.

The portable semantic layer therefore needs a more general concept of **canonical order/revision**. A fixed simulation tick is a real-time profile specialization, not the universal clock of every future game.

### 4.7 Recovery semantics must be explicit

After process loss, deployment, eviction or migration, the system must either:

- reconstruct continuity to the contract it claims;
- explicitly begin a new epoch/discontinuity;
- or fail closed.

It may never silently recreate an approximate world while claiming uninterrupted canonical continuity.

### 4.8 Scale is earned by changing the right layer

Do not distribute a six-player room because an MMO might exist later.

Preserve seams for recipient projection, spatial interest, world partition and authority handoff. Introduce their implementations only when measured workloads or a real consumer require them.

## 5. Proposed architecture shape

The current-best shape has **three levels**.

### 5.1 Portable semantic core

No Cloudflare, DOM, renderer or Box3D dependency.

Candidate responsibilities:

1. **World / Instance Identity** — stable identity and epoch/discontinuity rules.
2. **Canonical Ordering** — monotonically ordered accepted mutations; profile-specific tick/revision/action semantics.
3. **Membership / Presence** — logical actor membership separate from connection state.
4. **Identity Domains / Provenance** — durable semantic IDs and explicit mappings to compiled/runtime/network identities.
5. **Command / Intent Envelope** — who proposes what against which epoch/revision/actor.
6. **Authorization / Capability** — ownership, role and domain legality boundary before mutation.
7. **Canonical Mutation Result** — accepted/rejected result plus explicit reason and canonical position.
8. **Projection Contract** — recipient-scoped view of canonical state/events.
9. **Compatibility Identity** — schema/rules/simulation build fingerprints and negotiated rejection.
10. **Recovery Metadata** — enough identity/provenance to prove what was restored and from where.

Not all of these deserve independent packages or public APIs. The list is a responsibility map to prevent accidental coupling while experiments decide the actual implementation shape.

### 5.2 Execution profiles

Profiles adapt the portable semantics to qualitatively different worlds.

#### Real-time physical profile

- fixed canonical simulation tick;
- scheduled input;
- authoritative physics runtime;
- snapshots/state guards;
- prediction/reconciliation where justified;
- dynamic physical topology;
- bounded latency/fault behavior.

Multi_World 1–6 is the first executable specimen.

#### Transactional / turn-based profile

- action sequence or domain revision rather than 60 Hz world tick;
- private/scoped projection;
- commands and legality;
- bots and humans through the same command seam;
- durable match state and browser reconnect.

A tiny Tysiąc-like hidden-information fixture is a future falsifier; the actual Tysiąc product should not become a test dependency.

#### Collaborative authoring profile

- authoritative document revision;
- preview vs committed mutation;
- preconditions/conflict handling;
- stable semantic identities through split/merge/rebind where possible;
- assets referenced by immutable provenance, not embedded into every state packet;
- runtime realization rebuilt downstream.

A tiny assembly/document fixture should falsify this before JV/JES/ANVIL integration is attempted.

#### Autonomous actor profile

- bounded perception projection;
- slow/asynchronous cognition;
- intent submission against possibly advanced canonical state;
- validation/rejection/replan;
- no LLM call inside the hard real-time authority loop unless a specific game earns that design.

### 5.3 Platform/runtime adapters

Adapters may include:

- Cloudflare Durable Object authority host;
- SQLite durable checkpoint store;
- WebSocket transport;
- browser client transport/lifecycle;
- Box3D real-time runtime;
- native dedicated-server/runtime adapters later;
- LAN host adapter later.

Adapters translate platform events into portable semantics; they do not define those semantics.

## 6. Truth-domain model

A future complex game may contain several truths at once. The foundation must not assume they are one object graph.

| Truth domain | Example | Persistence / replication character |
| --- | --- | --- |
| membership truth | actor A belongs to epoch E | canonical, small, durable/reconstructable |
| game/domain truth | cards, inventory, door state, quest state | canonical, project-specific |
| authored truth | machine graph, building document, semantic matter | canonical and usually durable |
| compiled truth | rigid islands, runtime assembly plan | deterministic derivative where possible |
| runtime truth | Box3D bodies/velocities, temporary AI execution | high-rate, often disposable/reconstructable |
| projection truth | what client/seat/NPC is permitted or interested to observe | derivative and recipient-scoped |
| asset/provenance truth | exact model/scan/source revision | immutable/versioned references |
| diagnostic/evidence state | RTT, drift, lineage, guard hashes | observational; never gameplay authority by accident |

A product may use only two of these. The foundation must not require all of them.

## 7. Identity model

The current `actor:<ordinal>` research ID is appropriate for the bounded physical specimen, not a universal ID grammar.

Long-horizon rule:

> **Separate identity domains; map them explicitly.**

Examples:

- Account/User identity — optional product identity, outside early foundation.
- ActorSession identity — one logical actor continuity in a world epoch.
- Semantic entity identity — authored/domain object.
- Runtime realization identity — current body/joint/renderer/compiled instance.
- Transport connection identity — replaceable device/socket binding.
- Asset/source revision identity — immutable provenance.

Mappings need explicit lifecycle and provenance. A runtime body may disappear and be regenerated without deleting the authored machine part it realizes.

## 8. Canonical ordering instead of one universal clock

The architecture should be able to express:

- physical tick `T=48219` inside one epoch;
- turn/action sequence `A=37` inside one match;
- document revision `R=812` after an accepted edit;
- membership mutation ordered relative to the relevant profile boundary.

Current research question:

> What is the smallest portable ordering contract that supports these without becoming a generic event-sourcing framework?

Candidate answer to falsify:

- every canonical mutation has an epoch identity and a monotonically advancing canonical position;
- profiles define how wall-clock time, simulation ticks or transactions create those positions;
- commands carry the canonical state/revision assumptions required for safe validation;
- clients can detect stale, future, duplicate and incompatible submissions.

Do **not** generalize the current `effectiveTick` API until a non-physics fixture proves which parts are truly shared.

## 9. Logical replication classes

Do not freeze wire channels or codecs yet. First distinguish semantics.

Candidate logical classes:

1. **control / lifecycle** — hello, compatibility, join, resume, leave, epoch changes;
2. **intent / command** — client or autonomous-agent proposals;
3. **canonical topology / mutation** — reliable accepted structural changes;
4. **bootstrap / checkpoint projection** — authoritative state needed to enter/resume;
5. **high-rate runtime state** — replaceable snapshots/corrections where newest state may supersede old state;
6. **domain events / outcomes** — scoped consequences useful for presentation/perception;
7. **asset/provenance references** — hashes/revisions and acquisition metadata, not arbitrary raw-asset rebroadcast;
8. **diagnostics / evidence** — RTT, drift, rejection reasons, overload, checkpoint lineage.

WebSocket may carry all of these over one ordered connection today. Their semantic separation prevents the transport choice from becoming architecture.

## 10. Projection and visibility

Recipient-scoped projection is a first-class seam because it solves several future problems with one legitimate abstraction:

- hidden cards/information;
- fog/perception for NPCs;
- spatial interest management;
- spectators/admin/debug views;
- avoiding unnecessary replication of huge worlds;
- privacy/capability boundaries.

Early Multi_World may still project the whole tiny yard to every player. That is a **policy choice**, not a foundation invariant.

Future interest management should be able to replace an `all entities` projector without changing canonical world ownership.

## 11. Recovery and persistence program

Persistence is not synonymous with serializing the entire runtime every frame.

Candidate recovery family to test:

`durable checkpoint + bounded canonical mutation/input suffix + explicit epoch/build/provenance identity`

This is **not a commitment to event sourcing**.

The next physical experiment must determine whether Box3D runtime state can be reconstructed exactly or within a defensible explicit boundary.

Required recovery evidence:

- checkpoint completeness and version identity;
- size and write cost;
- restore latency;
- exact/bounded divergence after restore;
- stale/incompatible checkpoint rejection;
- crash during checkpoint/write handling;
- recovery lineage visible to diagnostics;
- restart must not impersonate continuity if the physical contract cannot be restored.

Product policies may later choose among freeze-on-empty, durable dormant world, new epoch after loss, or continued background simulation. Those are product semantics, not hidden infrastructure defaults.

## 12. Security, ownership and hidden-state baseline

The long-horizon baseline is server/authority validation, not trust in client state.

At minimum the architecture must support:

- ActorSession → capability/ownership binding;
- command validation against epoch/revision and domain legality;
- malformed/oversized/rate-abusive message rejection;
- projection that cannot accidentally serialize hidden canonical fields;
- no client authority over save ownership, canonical tick/revision or other actors;
- explicit compatibility/build rejection;
- audit-friendly rejection reasons without leaking hidden information.

Full production anti-cheat, account security and economy protection remain product-specific later layers.

## 13. Scaling horizons

These are **horizons**, not promises and not immediate implementation scopes.

### H0 — one small authority domain

Current target: 1–6 physical actors, later measured beyond six where useful.

One authority host owns one coherent physical world. Full-yard projection is acceptable while measured cost is small.

### H1 — denser single authority domain

Potential future: more actors/entities in one room/world.

Likely tools if evidence demands them:

- recipient interest/projection;
- lower update frequency for low-priority state;
- delta/quantized/binary encoding;
- spatial/entity indexing;
- budgeted replication schedules.

No fixed player-count promise is made before load evidence.

### H2 — large world with multiple authority domains

Potential Planet Matter / large sandbox horizon.

Likely questions:

- spatial cells/zones and ownership;
- entity migration/handoff;
- cross-boundary interactions;
- persistent world partitioning;
- observers whose interest spans several domains.

Do not split one tightly coupled physics island across processes until a concrete experiment proves a need and a valid boundary.

### H3 — geographically distributed product

Cloudflare Durable Objects currently stay where created; placement influences latency and automatic relocation is not presently available.

Future architecture may need room placement, migration/new-epoch semantics or regional product policies. Keep this outside the portable gameplay core.

### H4 — portfolio donor qualification

A core becomes broadly reusable only after materially different consumers use it without importing hidden Multi_World assumptions.

At least two cross-domain falsifiers should eventually exist:

- non-physics hidden-information/transactional fixture;
- collaborative authored-world/assembly fixture.

## 14. Quality and evidence architecture

The foundation itself should ship with an **evidence apparatus**, not just runtime code.

### Machine evidence layers

- deterministic semantic-unit tests;
- model/state-machine/property tests for lifecycle invariants;
- headless authority scenarios;
- exact state/topology guards where meaningful;
- recovery/replay campaigns;
- protocol compatibility and malformed-input negatives;
- deterministic network fault injection: latency, jitter, loss, duplicate, reorder, reconnect;
- synthetic N-client load;
- browser lifecycle tests: refresh/background/close/reopen;
- hidden-state leakage tests;
- platform adapter integration tests;
- long soak/stress runs;
- provenance receipts binding results to exact source/build/config.

### Owner evidence

Owner time is reserved for qualities automation cannot certify:

- multiplayer feel;
- clarity of peer presence and causal feedback;
- builder collaboration naturalness;
- driving/physical interaction feel;
- mobile/desktop ergonomics;
- whether the resulting system actually enables the intended play.

Before an Owner gate, automation should remove avoidable crashes, obvious lifecycle failures, protocol mistakes and reproducibility uncertainty.

### Claim discipline

Use statuses such as:

- `PASS` — exact scoped executable claim passed;
- `ADEQUATE` — enough evidence to enter the next experiment, not full qualification;
- `UNPROVEN` — intended but not executed;
- `FAIL / MATERIAL FINDING` — experiment falsified an assumption or revealed debt.

A green CI badge proves only the checks that actually ran.

## 15. Research tracks from here

The work should advance on several coordinated tracks without turning them into one blocking mega-milestone.

### Track R — physical continuity/recovery

Immediate next technical frontier.

- reconstruct live Box3D state after destroying the runtime;
- measure exactness/divergence and checkpoint economics;
- then exercise real Durable Object storage/restart semantics.

### Track C — dynamic client replication

After authority/recovery semantics are sufficiently grounded:

- self + `0..N` peers;
- live add/remove;
- late-join bootstrap;
- topology-aware rebase;
- reconnect/resume;
- no regression of earned prediction/reconciliation behavior.

### Track N — network resilience and load

- deterministic network impairment harness;
- 1/2/3/6 first, then sweep upward until a real bottleneck appears;
- CPU, memory, message/byte rates, serialization, reconciliation, catch-up and failure diagnostics;
- security/abuse limits.

### Track X — cross-domain donor falsification

Do not wait until the end to discover the core is secretly physics-specific.

First bounded research questions:

1. can membership/session/compatibility/command/projection semantics operate without a fixed 60 Hz tick?
2. can a private projection prevent canonical hidden-state leakage?
3. can one authored semantic object survive replacement of its runtime realization?

Use tiny fixtures. Do not integrate real Tysiąc/JV/JES merely to test an abstraction.

### Track S — scale architecture

Research only until N exposes a need.

- projection/interest model;
- entity/world partition boundaries;
- authority handoff/migration semantics;
- large persistent state placement;
- region/latency consequences.

## 16. Immediate execution order

1. Reconcile the current Gate-3 execution evidence into project truth and PR state.
2. Build Gate-4 physical recovery falsifier before claiming a durable physical world.
3. In parallel, define the smallest cross-domain canonical-order/command/projection model and try to break it with a tiny non-physics fixture.
4. Do not rewrite the browser client until authority bootstrap/recovery semantics are clear enough to tell the client what continuity means.
5. Then build dynamic `self + N` browser replication and synthetic network impairment/load harnesses.
6. Increase player/entity counts until measurements expose the first real scaling boundary; optimize that boundary rather than an imagined one.
7. Qualify donor status only through independent consumers.

## 17. Stop rules

Stop or narrow a line when:

- an abstraction exists only because a hypothetical future feature might need it;
- a generic API becomes harder to explain than two explicit profile-specific adapters;
- a benchmark has no decision it could change;
- documentation begins substituting for executable evidence;
- green tests do not exercise the claimed layer;
- platform-specific constraints leak into portable semantic contracts without necessity;
- a donor import brings more assumptions than proven capability.

Broaden a line when:

- multiple materially different projects independently expose the same missing boundary;
- a measured bottleneck invalidates the current scale model;
- recovery/fault testing reveals hidden coupling;
- a cross-domain falsifier cannot be expressed without changing an allegedly portable assumption.

## 18. Current long-horizon judgement

The best present direction is **not** a universal replicated-object framework and **not** an MMO backend built in advance.

It is a small, rigorously qualified family of multiplayer semantics:

`identity + canonical ordering + membership + validated intent + scoped projection + explicit realization + explicit recovery`

with real-time physics, transactional games, collaborative authoring and autonomous actors as different execution profiles.

Multi_World should earn these pieces one by one under increasingly hostile tests. If the shared core survives materially different fixtures, it becomes a donor. If it does not, split the architecture rather than protecting the abstraction.
