# Multi_World — Human test / device context

Status: **CANONICAL SUPPORTING CONTEXT / PRODUCT PRESSURE, NOT IMMEDIATE FEATURE SCOPE**  
Grounded: **2026-09-02**

This document captures how Multi_World is expected to be used and tested by real people so that a fresh orchestrator does not optimize only for desktop automation or mistake mobile support for a late port.

---

## 1. Desktop and mobile are both real play surfaces

Multi_World is intended to be played on **desktop and mobile**.

This does not mean both surfaces must expose identical UI or camera behavior.

It does mean they should participate in the **same shared physical world and the same networking/physics truth model**. Mobile must not become a separate simplified simulation merely because its controls differ.

Current implication:

- desktop and mobile may have different input adapters and camera/presentation layers;
- the underlying gameplay intent should be translated into the same physical semantics where practical;
- device-specific control work must not silently fork player mechanics or shared-body behavior.

---

## 2. Camera and touch controls are expected product work

A useful mobile version will eventually require deliberate work on:

- camera behavior;
- touch movement controls / virtual sticks or touchpads;
- touch interaction affordances;
- HUD density and readable feedback;
- orientation/viewport ergonomics;
- mobile performance and frame pacing.

These are **real future requirements**, not optional polish.

However they are not all prerequisites for the next remote-causality experiment.

Use the smallest input/presentation surface necessary for each falsifier, then improve mobile UX when a human test would otherwise be measuring bad controls rather than shared-world physics.

---

## 3. Human multiplayer testing is unusually available

The Owner can often recruit another real person (for example a brother or Salik) to join on a phone, making genuine human-human stress tests practical rather than rare ceremonial events.

Expected availability:

- **2 players** — practical baseline human multiplayer test;
- **3 players** — realistic early stress test;
- **4 players** — sometimes possible and valuable as an opportunistic stronger stress test;
- there is **no current urgency** to design around four players before 2–3 player behavior is understood.

This is a project advantage and should shape the validation strategy.

Do not waste it by asking for repeated low-information manual experiments that automation could have rejected first.

---

## 4. Preferred validation ladder

For new multiplayer/shared-physics work, default toward:

1. exact/synthetic two-world or multi-world falsifiers where useful;
2. automated protocol/cloud clients;
3. real browser/device smoke;
4. **2-person human play** once structural failures have been removed;
5. **3-person stress play** after the two-player model is coherent enough to learn something new;
6. **4-person opportunistic stress** when available, without turning it into a premature scaling milestone.

Human tests should answer perceptual/gameplay questions that machines cannot answer well:

- does another player's presence feel physically believable?;
- does shared matter feel like one world rather than fighting corrections?;
- are remote actions legible and causally understandable?;
- does local control remain immediate under contention?;
- does the situation become interesting/funny/cooperative/competitive in ways the scripted trace did not predict?;
- does mobile control/camera interfere enough that the networking result becomes unjudgeable?

---

## 5. Device-input principle

The preferred direction is:

> **device-specific controls -> shared gameplay intent -> shared physical semantics**

Do not encode keyboard keys, touch coordinates or camera implementation into the core physical/networking contract unless evidence forces it.

This aligns with the neighboring Character Controller donor's device-independent intent boundary, but it does **not** imply that Donor v1 must be imported now.

A2R's present `x/z` input contract is still provisional. A future richer intent contract should be introduced only when the actual embodied gameplay requires it.

---

## 6. Camera is part of perceptual correctness

Camera is not merely visual polish in a physically networked world.

Earlier A2 evidence already showed that coupling camera focus directly to corrected player state can amplify small network corrections into whole-scene discontinuities.

Future camera work should therefore distinguish:

- physical simulation state;
- visual player state;
- camera anchor/state.

For multiplayer, camera also becomes part of **remote-player legibility**: another person's action must be understandable without forcing the local camera to follow network noise.

Desktop and mobile may legitimately use different camera/control ergonomics while preserving the same underlying shared-world truth.

---

## 7. What not to infer from the availability of 3–4 testers

Do not jump directly to:

- four-player architecture;
- interest management;
- replication graph design;
- shard/matchmaking infrastructure;
- MMO-scale load testing;
- dedicated mobile simulation code;
- large control-remapping systems.

The immediate value of extra human testers is **better falsification of small-group shared physical truth**, not an instruction to scale the backend.

---

## 8. Owner attention rule

The project should continue minimizing Owner attention cost.

Before asking for a multiplayer human test, the orchestrator should ideally already know:

- exact candidate SHA/deployment;
- that clients can connect;
- that the intended shared-prop interaction path is exercised;
- that server scheduler/finite-state checks are healthy;
- that obvious client divergence/crash conditions are absent;
- what single human question the run is meant to answer.

The Owner should not have to become a telemetry operator while trying to judge whether the world feels good.

When possible, record HUD/evidence passively and analyze it after play.

---

## 9. Current human-test direction after A2R

A2R provides a smooth single-owner reference but intentionally rejects multiplayer.

The next meaningful human progression, **after automated two-client falsification**, is likely:

### Two people

- desktop + phone is a natural baseline;
- each player should alternately act while the other observes/interacts;
- then both should contest/cooperate on the same prop or cluster;
- free play should follow after the bounded trace so unexpected behavior can emerge.

### Three people

Use only after two-player behavior is coherent enough that a third actor creates a genuinely new causality/stress condition rather than merely multiplying an obvious bug.

### Four people

Treat as a valuable opportunistic stress test when available, not a current acceptance gate.

---

## 10. Takeover consequence

A fresh Multi_World project should preserve both truths simultaneously:

1. **the next fundamental technical question is still shared physical truth / remote causality, not mobile UI implementation**;
2. **desktop + mobile real human play is part of the product and validation target, so the architecture must not quietly make mobile a second-class or incompatible world.**

Use device-specific presentation/control work when it increases the fidelity of the human experiment. Do not let it obscure the causal networking question, and do not postpone it indefinitely as “polish” once it starts limiting real play.
