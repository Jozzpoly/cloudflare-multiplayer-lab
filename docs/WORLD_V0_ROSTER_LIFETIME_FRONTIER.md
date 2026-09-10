# World V0 — Roster Lifetime Frontier

Status: **BOUNDED RESEARCH FRONTIER / NO PRODUCT IMPLEMENTATION YET**  
Grounded: **2026-09-11**

## Product question

Can a player enter a Yard alone, immediately inhabit and change the physical world, and later be joined by a second player without replacing the existing WorldEpoch or resetting physical consequences?

This is deliberately narrower than persistence, arbitrary dynamic rosters, 3+ players, accounts, or MMO architecture.

## Current evidence

The qualified fixed-2P baseline already separates several lifetimes that matter:

`world lifetime != roster lifetime != ActorSession lifetime != transport/device lifetime`

But the current implementation still couples roster completion to simulation start:

- the authority creates the Box3D world when the first actor is admitted;
- canonical stepping does not start until exactly two players are present, connected and ready;
- a fresh actor cannot join after the protocol has started;
- a one-player pre-start disconnect ends the WorldEpoch immediately;
- authority state guards require the fixed 14-entity order, including `actor:0` and `actor:1`;
- the browser simulation and authority-rebase path currently require exactly two player sessions.

Therefore the immediate problem is not that a solo World does not exist. It exists but is held in a pre-start lifecycle where time/input are disabled and later admission is closed once time starts.

## First falsifier

Before changing the browser prediction/reconciliation topology, test the narrower authority question:

1. create one WorldEpoch and admit actor 0;
2. begin canonical stepping with actor 0 while retaining the fixed two-slot simulation contract;
3. use the existing authority stimulus to make actor 0 cause a measurable physical change to one or more props;
4. admit actor 1 later into the same WorldEpoch;
5. prove the WorldEpoch identity is unchanged;
6. prove the changed prop state is not reset by actor 1 admission;
7. prove the resulting two-actor authority state can satisfy the existing fixed entity ordering/state-guard semantics;
8. verify the normal qualified 2P path is not regressed.

### PASS

The same authoritative physical world evolves with one active actor, retains its consequences, then accepts the second actor without world reset and reaches a valid two-actor state.

### FAIL / informative result

Any requirement to replace the WorldEpoch, reset props, rebuild canonical simulation state, or violate deterministic entity/state-guard identity when actor 1 arrives.

## Candidate seam, not yet a decision

The smallest plausible direction is to keep the current fixed two-actor entity topology during this experiment and distinguish **slot existence** from **ActorSession occupancy**. An unoccupied actor slot could remain neutral until a real ActorSession claims it.

This is only a hypothesis. Do not promote it to architecture until the authority falsifier earns it.

## Explicit non-goals

Do not use this frontier to introduce:

- arbitrary roster sizes;
- 3+ support;
- durable world persistence/reconstruction;
- account identity;
- world storage;
- generalized join/leave architecture;
- a new networking framework;
- premature client prediction refactors.

The objective is one causal question: **can World lifetime stop depending on initial roster completion while preserving the qualified shared-physics foundation?**
