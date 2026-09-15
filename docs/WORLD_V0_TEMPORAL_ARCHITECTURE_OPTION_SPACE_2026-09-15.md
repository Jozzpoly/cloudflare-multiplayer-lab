# World V0 — temporal architecture option space

Status: **OPTION RESEARCH / NO ARCHITECTURE SELECTED**  
Date: 2026-09-15  
Prerequisites: causal audit closure + Owner-ready validation architecture.

## Why this document exists

The current regression is not safely solved by changing one number. The existing representation binds continuously changing human intent to mutable future global target ticks. The causal audit proved that this creates near-deadline revisions and two correction streams.

Before modifying runtime, compare the main architecture families that could carry the actual Multi_World product direction:

- one persistent authoritative shared world;
- solo entry with a friend joining later;
- responsive local movement;
- believable remote movement;
- physically shared dynamic props/interactions;
- browser delivery through Cloudflare Workers + Durable Objects + WebSockets today;
- future growth beyond a two-player research specimen;
- exact/recoverable canonical state without requiring exact state to equal presentation every rendered frame.

No option below is a recommendation yet.

## Hidden assumption to challenge

The current foundation often treats these as almost the same thing:

1. there is one canonical exact shared world;
2. every client runs an exact speculative copy of the entire shared world;
3. the client's exact speculative copy is also what it renders directly.

Only (1) is clearly a product requirement.

(2) and (3) are architecture choices.

A server-authoritative canonical world can remain exact while clients present predicted/interpolated approximations. Established client/server networking families explicitly separate server truth, local prediction and remote presentation. This does not make the world less shared; it changes where temporal uncertainty is represented.

## External reference families

These are conceptual references, not recipes to copy.

- Valve/Quake-style client prediction: local player applies immutable user commands immediately; authoritative state later reconciles, then unacknowledged commands are replayed.
- Gaffer client/server networked physics: server authority plus client approximation/prediction; corrections are expected and presentation policy matters.
- snapshot interpolation/state synchronization: canonical simulation and displayed remote state are intentionally different temporal layers.
- GGPO-style rollback: predict missing remote inputs, roll back when actual inputs disagree; local input remains immediate.
- distributed/ownership physics: transfer authority for interacted objects to avoid whole-world rollback at the cost of ownership/conflict semantics.

Our shared Box3D props and persistent WorldEpoch mean none maps 1:1.

## Option A — salvage current split-lead mutable-future model

### Shape

Keep:

- authorship lead ~8;
- local simulation lead ~2;
- future per-target records;
- supersession.

Add:

- explicit mutable/frozen zones;
- revision coalescing;
- better reconciliation scheduling;
- presentation smoothing;
- stronger late-revision policy.

### Advantages

- smallest conceptual migration;
- preserves current exact whole-world client simulation;
- reuses nearly all foundation/recovery machinery;
- likely fastest path to a visibly improved experiment.

### Fundamental risk

A freeze/commit zone does not erase the split-lead trade-off. If a human changes input after a near-future target is frozen:

- local prediction can use the new input and later disagree with canonical frozen intent; or
- local simulation must also honor frozen intent, adding input delay.

Coalescing can reduce work amplification but cannot remove this semantic disagreement.

Presentation smoothing can hide residual corrections but must not become a mask for pathological input revision churn.

### Research verdict

**Worth prototyping as a bounded salvage candidate, not safe to assume as final architecture.**

## Option B — F5-like coupled lead with immutable per-target input

### Shape

Return to the useful property of positive F5:

- local predicted shared simulation lives roughly as far ahead as canonical input must be authored;
- each target tick samples local human intent once when predicted simulation reaches it;
- accepted future record is immutable;
- no continuous rewrite of previously authored target ticks.

### Evidence in our project

Owner-positive two-client F5 `aaf791bc...` used this general shape and was judged smooth in a real desktop+phone session despite high correction counts.

### Advantages

- removes current mutable-target revision race;
- historical human-positive evidence exists;
- local control remains immediate;
- deterministic rewind/replay machinery fits naturally.

### Costs / risks

- the entire client world must live substantially ahead of authority;
- with real ~180–230 ms RTT, eight ticks (~133 ms) may not be enough, tempting an even deeper speculative horizon;
- deeper whole-world speculation means more replay work and larger possible corrections when remote actors/props differ;
- cost grows with world complexity and future player count;
- side effects/presentation around deep rollback become harder;
- a persistent world with late join/reconnect may not want every client to carry a deep exact speculative global world.

### Research verdict

**High-value control architecture because it already earned Owner-positive evidence; scalability and deep shared-physics speculation are the main red-team targets.**

## Option C — ordered command stream + local actor prediction + authoritative replay

### Shape

Stop assigning every human sample to a far-future global canonical tick.

Instead:

- input becomes an immutable ordered command/sample stream with sequence/time;
- local actor prediction applies new commands immediately;
- authority processes received command history in order at its own timeline;
- authoritative state acknowledges processed commands;
- local client restores authoritative self state and replays still-unacknowledged local commands.

This is conceptually closer to classic Quake/Source client-side prediction.

### Advantages

- no mutable canonical future-tick forecast;
- human input change rate produces one new command/sample, not repeated rewrites of seven future targets;
- local self responsiveness remains immediate;
- reliable ordered WebSocket fits an immutable ordered command stream reasonably well;
- well-understood acknowledgement/replay invariants;
- scales better conceptually than whole-world deep rollback for the local actor path.

### Hard part for Multi_World

Our player can physically affect shared dynamic props. Server command processing occurs against canonical world state at a later wall-clock time than the client's immediate prediction. A self-only replay can be exact for isolated movement but not necessarily for actor↔prop or actor↔remote contact.

This option therefore tends to imply a stronger separation between:

- local predicted self/contact feel;
- canonical shared prop state;
- remote presentation.

### Research verdict

**Very strong candidate for the actor/control backbone, but shared-prop interaction strategy must be proven rather than assumed.**

## Option D — deterministic whole-world rollback / GGPO-like input prediction

### Shape

- each participant contributes immutable input per local frame/tick;
- missing remote input is predicted, commonly from previous input;
- local input is immediate;
- when actual remote input differs, restore a prior whole-world state and replay;
- authority/server may still arbitrate identity/history, but canonical input is not repeatedly rewritten far into the future.

### Advantages

- deterministic Box3D/replay research already gives us unusually strong donor capability;
- shared actor↔prop interactions remain inside one deterministic speculative simulation;
- local control can be extremely responsive;
- temporal uncertainty is represented as prediction of missing remote input, not revision of the local player's declared future.

### Costs / risks

- rollback cost scales with latency, player count and world complexity;
- every predicted shared prop can participate in rollback;
- browser CPU budget can become severe;
- audiovisual/gameplay side effects need rollback-safe semantics;
- long-lived persistent world and many actors are a poor fit for unconstrained global rollback;
- current project eventually wants more than a tiny fighting-game-like arena.

### Research verdict

**Technically plausible and worth a bounded experiment because our deterministic foundation is strong; dangerous as the default long-term whole-world architecture without aggressive scope/LOD boundaries.**

## Option E — server/input-buffer delay + client prediction

### Shape

Authority deliberately simulates behind wall clock by a bounded input buffer so ordinary client commands arrive before their intended server step.

Clients predict ahead for responsiveness.

### Advantages

- reduces late-input churn without revising already committed targets;
- preserves a clean single server chronology;
- latency/jitter budget becomes explicit and tunable;
- can combine with immutable commands or ticks.

### Costs / risks

- canonical world is intentionally delayed;
- remote/shared interaction feedback may acquire extra delay;
- clients may still need to predict substantially ahead of the delayed authority;
- too-small buffer recreates late-input corrections; too-large buffer increases interaction latency;
- variable geographically distributed RTT complicates one global delay.

### Research verdict

**Useful dimension to test, probably as part of another architecture rather than a complete answer by itself.**

## Option F — authoritative state sync / interpolation for remote world

### Shape

Keep server/DO as exact canonical physics authority.

Client responsibilities become asymmetric:

- predict local actor immediately;
- render remote actors and most props from buffered authoritative state using interpolation/extrapolation;
- reconcile local actor against authority;
- optionally predict selected local interactions for feel.

### Advantages

- exact canonical world remains singular and simple;
- remote presentation can absorb jitter instead of exposing every rewind;
- scales better to more actors/objects than exact full-world client rollback;
- aligns with common client/server state synchronization practice;
- naturally separates canonical truth from presentation.

### Costs / risks

- remote actors/props are deliberately displayed slightly in the past;
- local actor colliding with a visually delayed prop needs special handling;
- naive local prediction can show contacts the authority later rejects;
- requires snapshot/state bandwidth and careful interpolation buffers;
- no longer proves that every client physics world is exact at every visible frame — because that ceases to be the goal.

### Research verdict

**Strong long-term scalability candidate; shared physical interaction feel is the critical experiment.**

## Option G — distributed / temporary ownership for interacted physics

### Shape

- server remains coordinator/persistence authority;
- a player/client may temporarily own simulation of an actor or prop cluster it interacts with;
- ownership state is replicated; transitions resolve conflicts.

### Advantages

- immediate local physical interaction without global rollback;
- physics cost can be distributed;
- good fit for non-competitive cooperative/sandbox interactions in some designs.

### Costs / risks

- ownership transfer is a major new system;
- simultaneous interaction creates conflict-resolution problems;
- cheating/trust becomes more complex;
- persistence/reconnect and host loss interact with ownership;
- a prop pushed by two players can expose authority-transfer artifacts;
- substantially more architecture than the current product needs immediately.

### Research verdict

**Interesting long-term donor direction, not justified as the first repair unless simpler authoritative models fail the shared-interaction tests.**

## Option H — hybrid actor command prediction + authoritative/interpolated world

### Shape

Combine C and F:

- immutable local command stream;
- immediate self prediction;
- server/DO remains canonical exact full-world physics;
- remote actors and unowned props use buffered authoritative presentation;
- local interaction can receive a narrowly scoped predicted layer, corrected against authority;
- presentation is explicitly separate from canonical simulation state.

Possible future extensions could add temporary ownership or bounded local rollback only where evidence earns it.

### Advantages

- removes mutable canonical future as a foundational primitive;
- preserves responsive self control;
- preserves server-authoritative persistent shared world;
- does not require every client to rollback the entire future world;
- offers a path toward more players/world complexity;
- lets prediction scope follow relevance/interaction rather than global topology.

### Costs / risks

- hardest conceptual departure from the current 'exact full client world' purity;
- local actor↔prop contacts need carefully designed reconciliation/presentation;
- state-sync/interpolation tooling must be built and measured;
- more than one temporal representation exists intentionally, so debugging/provenance must be excellent.

### Research verdict

**Potentially the strongest long-term family for Multi_World, but it must earn that status through bounded interaction experiments. Do not promote it on architectural taste alone.**

## Cross-cutting requirement — presentation separation

Regardless of temporal architecture, canonical physics and presentation should no longer be implicitly identical concepts.

That does not require hiding arbitrary errors with lerp.

It means the presentation layer has an explicit contract for:

- local immediate motion;
- remote interpolation/extrapolation;
- residual correction absorption;
- hard discontinuities/rebases;
- camera behavior;
- topology/join/respawn transitions.

The Truth layer remains measurable underneath it.

## Cross-cutting requirement — correction work coalescing

Even if the current protocol is replaced later, no architecture should perform multiple full replay passes merely because one logical temporal update was fragmented into several transport messages that arrived in the same processing turn.

Coalescing is a local efficiency/correctness-of-scheduling improvement, not a complete temporal solution.

## Current transport constraint

As of the 2026-09-15 research pass, Cloudflare Workers documentation explicitly supports WebSockets/DO WebSockets for realtime coordination. Workers protocol documentation does not expose an inbound WebTransport/datagram application API comparable to browser WebTransport for this use case.

Therefore architecture evaluation assumes reliable ordered WebSocket transport today. A future transport change may improve stale-message behavior, but it is not required to explain or reproduce the current regression and is not an immediate escape hatch.

## Evaluation matrix for experiments

Every serious candidate should be compared on:

| Dimension | Question |
| --- | --- |
| Local response | Does self react immediately to continuous digital/analog input? |
| Canonical intent | How is human intent mapped to authority time without pretending future intent is known? |
| Remote feel | Can the other actor move without visible jitter at ordinary RTT/jitter? |
| Shared props | Does self↔prop↔remote interaction remain believable and canonically shared? |
| Correction causality | What events cause corrections, and are they bounded by real uncertainty rather than scheduler churn? |
| Presentation | Can residual truth corrections avoid visible teleports without hiding semantic failure? |
| CPU | What is replay/prediction cost under stress? |
| Latency range | What changes at 30, 100, 180, 250+ ms RTT? |
| Browser lifecycle | What happens after hidden/suspended clients return? |
| Reconnect | Does ActorSession continuity remain independent of ordinary prediction safety? |
| Scale direction | Does cost grow with all world objects/players or mostly with relevant/local state? |
| Debuggability | Can one bad frame be traced from input -> network -> authority -> correction -> render? |
| Migration | How much of the defended current foundation is preserved versus replaced? |

## Suggested experimental order — not implementation roadmap yet

The next phase should compare **small architecture specimens**, not rewrite the main candidate.

Highest-information experiments:

1. **F5-like immutable coupled-lead control** on current Box3D/topology contract: establish whether the historical good property survives current shared props/session semantics and current RTT.
2. **Immutable command-stream self prediction specimen**: actor movement only first; prove that continuous input no longer creates per-target revision churn and measure reconciliation under artificial latency.
3. Extend command-stream specimen to one shared prop contact; measure local feel vs canonical correction.
4. **Authoritative/interpolated remote presentation specimen**: keep canonical server state but stop requiring the remote mesh to render live rollback state.
5. Only if needed, whole-world rollback/GGPO-like specimen for a tightly bounded two-player arena.

Do not combine all ideas in the first experiment. The purpose is to identify which temporal representation gives Multi_World the best trade-off before committing the product architecture.

## Current research preference, deliberately non-final

Evidence currently makes two directions especially valuable to falsify against each other:

- **B: F5-like coupled immutable exact prediction** — strongest historical continuity / smallest conceptual departure;
- **H: immutable command-predicted self + authoritative/interpolated shared world** — strongest likely long-term scaling/product direction.

Option A (salvage current mutable future) remains useful as a low-cost control: if careful freeze/coalescing cannot eliminate the pathology without adding control delay or canonical staleness, that is evidence to stop investing in the current representation.

No architecture is selected by this document.
