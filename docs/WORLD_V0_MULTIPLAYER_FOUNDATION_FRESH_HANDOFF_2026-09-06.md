# Multi_World / World V0 — Multiplayer Foundation fresh conversation handoff

Status: **HANDOFF READY / FOUNDATION AUDIT CONTINUES / NO PRODUCT PROMOTION AUTHORIZED**  
Prepared: **2026-09-06**  
Repository: `Jozzpoly/cloudflare-multiplayer-lab`

This document is the **current continuation authority for a fresh Browser ChatGPT conversation**. It is intentionally narrower and newer than the old A2/A3/F1–F5 takeover packages. Those older documents remain useful provenance, but a conversation change is **not** a reason to restart their research ladders.

The fresh conversation must verify live GitHub state before acting. Exact SHAs below are handoff checkpoints, not permission to assume nothing changed.

---

## 1. Read this project correctly before touching the implementation

Read first:

1. `docs/MULTI_WORLD_PROJECT_SOUL.md`
2. this document
3. the newest Multi_World checkpoint in GitHub issue #8

The project is not a networking laboratory whose goal is maximal infrastructure sophistication. Its purpose is to build toward a **small shared physical living world** where a few real people genuinely inhabit the same place, affect the same matter, and experience consequences as shared reality rather than loosely synchronized client illusions.

The central product tension remains:

> **PLAYER INTENT ↔ PHYSICAL CONSEQUENCE ↔ SHARED TRUTH**

Technical rigor exists to protect that experience. It must not become infrastructure gravity.

The Owner is the authority on product intent, priorities, feel, free play and whether a mechanism is worth living with. Browser ChatGPT is expected to carry most of the technical/research/execution burden: reconstruct live truth, challenge assumptions, design bounded falsifiers, implement and validate where justified, preserve negative evidence and provenance, and bring the Owner back in mainly when human judgement is genuinely the next source of information.

Near-term human reality is still a very small shared world, especially 2–3 people. Do not silently turn current continuity work into MMO backend design, generic netcode framework design, large-scale persistence, account/economy work, combat infrastructure or speculative scaling.

---

## 2. Exact handoff state before this document commit

### Canonical audit branch before proof lane

`world-v0-multiplayer-foundation-audit@60f776d6e7d8f23d3a077255b75396a4cca5a789`

Commit:

`ci(world-v0): run stale-actor containment probe`

Known exact CI on that SHA:

- `World V0 Multiplayer Foundation Audit` run `34028473462` — **SUCCESS**;
- `World V0 Architecture Readiness Probes` also completed successfully on the same audit head.

### Continuity architecture proof lane before this document commit

`world-v0-continuity-architecture-proofs@543df8f53c9f8bfe2c88e8e927582e71b4902e0f`

Live compare at handoff preparation:

- merge base: exactly `60f776d6e7d8f23d3a077255b75396a4cca5a789`;
- proof branch: **14 commits ahead**;
- proof branch: **0 commits behind**;
- therefore the proof lane was a clean linear descendant of the audit branch at the time this handoff was prepared.

The latest proof work is **audit/specimen apparatus**, not a public product promotion. No deliberate `public/world-v0` runtime mutation, staging promotion or production/root promotion was made during this continuity/raw-seed proof lane.

Before continuing, re-fetch both branch heads. If they differ from the handoff checkpoints, compare the drift rather than overwriting it.

---

## 3. Current phase: what we are actually doing

We are in a **bounded critical Multiplayer Foundation audit** after World V0 became real enough to expose reliability/continuity debt that would be expensive to carry into a more serious shared living world.

This audit was deliberately broadened because the current stage is important, not because every possible infrastructure problem deserves solving. The correct stopping rule is:

> continue while unresolved foundation semantics are both real and future-expensive; stop when further substrate work is less informative than returning to actual people and the world.

The work is not authorized to prebuild every possible persistence, scaling or networking feature.

The current high-value foundation questions are:

1. **failure-domain semantics** — does one client/connection failure kill the shared world, or can it degrade only that actor?
2. **connection/session/world identity** — what survives disconnect and what truly defines a new simulation generation?
3. **rebase/checkpoint substrate** — can an exact same-build client or reconstructed authority receive faithful physics state without rebuilding an ad-hoc serializer prematurely?
4. **input production under stalls** — why can a browser stall starve authority even when deterministic physics itself is healthy?
5. **authoritative process loss** — how should a real DO restart differ semantically from a transient client transport loss?
6. **placement/locality materialization** — can metadata/CI traffic accidentally decide the gameplay DO location before a representative player does?

Do not broaden beyond these merely because adjacent infrastructure exists.

---

## 4. EARNED: connection failure does not need to destroy actor or world

The strongest new result is a real Durable Object continuity specimen.

Exact workflow:

- run: `34031990762`
- job: `101483094312`
- artifact: `9988912179`
- proof head: `543df8f53c9f8bfe2c88e8e927582e71b4902e0f`
- verdict: `WORLD_V0_CONTINUITY_DO_SAME_EPOCH_RESUME_PASS`

This was not an abstract state-machine model. It used:

- a real local Wrangler Durable Object;
- real `WebSocketPair` / WebSocket transport;
- project-pinned `box3d.js@0.1.1` in the Worker runtime;
- 60 Hz simulation;
- the current 36-tick input lease = 600 ms;
- two physical actors in one shared Box3D world.

### Exact causal trace

- B transport dropped at boundary tick `48`;
- B was observed stale after the lease at tick `89`;
- world continued while A remained healthy;
- fresh pre-resume state was captured at tick `101`;
- B reconnected through a **new WebSocket** at tick `104`;
- canonical resumed input was acknowledged at tick `105`;
- shared simulation continued to tick `140`.

Identity and physical continuity:

- observed `WorldEpoch` rotations: **0**;
- B before drop: `actor:1`;
- B after resume: `actor:1`;
- Box3D body handle before drop: `{ index1: 3, world0: 0, generation: 1 }`;
- Box3D body handle after resume: exactly the same;
- stable resume token preserved;
- healthy peer stayed connected;
- stale actor body remained in the shared world;
- the same resumed body accepted canonical input;
- resumed physical displacement: `1.4751953358870833 m`;
- world remained finite.

### Earned architectural statement

The following separation is now mechanically demonstrated on the actual current substrate:

> **Connection ≠ ActorSession ≠ WorldEpoch**

Interpretation:

- **Connection** is replaceable transport.
- **ActorSession** is the logical/physical participant that may survive transport loss.
- **WorldEpoch** is the authoritative simulation generation, not the lifetime of an individual socket.
- input lease expiry can mean **stale-neutral actor intent**, not destruction of the world;
- a valid resume can bind a new connection to the same ActorSession/body within the same WorldEpoch.

This does **not** yet prove production protocol security, browser reconnect UX, remote Cloudflare behavior, authority restart reconstruction or cross-SimBuild restore.

### Why this matters against current product code

Current `SharedYardV0` still couples these domains too tightly:

- players are keyed by `WebSocket`;
- socket close/error leads to epoch-ending behavior;
- lease failure can end the epoch;
- session identity is created in the connection acceptance path.

The proof shows those couplings are implementation policy, not a necessity imposed by Box3D or Durable Objects.

Do not immediately rewrite production `SharedYardV0`. First finish the remaining future-expensive semantic audit so the production change can be small and coherent rather than a sequence of incompatible patches.

---

## 5. OPEN: raw Box3D recording bytes as a wire/rebase substrate

This is the most immediate unresolved causal problem at handoff.

### Goal

Qualify or reject a narrow proposition:

> exact same-build Box3D recording bytes can serve as an **ephemeral wire/rebase seed** for the pinned wrapper/runtime.

This is **not** an attempt to declare Box3D recordings a durable save-game format, cross-version migration format, authenticated protocol payload or final compression choice.

Pinned upstream used in the proof:

- `box3d.js@0.1.1`;
- `box3d.js` commit `5d5a3af049cccd9948b2b55bac4342414af0ef64`;
- Box3D submodule `8441b4a06d6d09dcfb0b0f704df4d847d1437b92`;
- emsdk `6.0.2`.

Exact latest evidence:

- workflow run: `34031990762`
- job: `101483094518`
- artifact: `9988931600`
- build step: **SUCCESS**
- runtime round-trip proof: **FAILURE**

Native error:

`b3RecPlayer_Create: snapshot deserialization failed`

Probe error:

`CreateFromBytes failed after byte-faithful ingress verification`

### Negative/apparatus history that must be preserved

1. An early run looked green because `node ... | tee` did not propagate the Node failure. The workflow was corrected with `set -euo pipefail`. Never cite the early green icon as a raw-seed PASS.
2. A possible collision from keeping a direct replay world alive beside a second replay world was removed: the direct control player is now destroyed before raw replay creation. Failure remained.
3. JS→C++ `typed_memory_view(...).set(...)` was suspected as a marshalling bug. The latest binding replaced it with deliberately slow **byte-by-byte ingress** and added FNV-1a verification across the JS/C++ boundary.
4. The latest proof verifies byte size/hash before calling native `b3RecPlayer_Create`. The failure still occurs **inside native snapshot deserialization**.

Therefore the next agent must **not** spend another iteration tweaking JS marshalling unless new evidence contradicts the checksum result.

### Correct next discriminator

Inspect the pinned upstream Box3D recording/replay implementation and answer causally:

- what exact pointer/range does `b3RecPlayer_CreateFromRecording` effectively pass into native replay creation?
- is `b3Recording_GetData()` + `b3Recording_GetSize()` the exact serialized range expected by `b3RecPlayer_Create`, or does the recording object carry offset/header/capacity/metadata semantics not represented by that pair?
- does recording start/stop produce a buffer whose beginning is not the replay snapshot beginning?
- is the direct-from-recording wrapper using a different internal path than the copied-byte hypothesis assumes?

Design the **cheapest source-grounded falsifier** after inspecting the native implementation. Do not patch production Box3D or invent a full serializer yet.

Relevant files on the proof lane:

- `scripts/world-v0-patch-box3d-raw-seed-binding.mjs`
- `scripts/world-v0-box3d-raw-seed-roundtrip-audit.mjs`
- `.github/workflows/world-v0-continuity-architecture-proofs.yml`

---

## 6. EARNED static finding: canonical client input generation is coupled to rAF physics progress

Current browser input path was traced exactly.

The critical chain is:

`requestAnimationFrame(frame)`
→ `advancePrediction()`
→ predicted physics step
→ `applyResolvedTick(... allowGenerateSelf=true)`
→ `consumeIntendedInput()`
→ `queueInputRecord(targetTick, intended)`
→ batch
→ `WebSocket.send(...)`

Therefore `requestAnimationFrame` is not only presentation cadence. Today it indirectly controls:

- predicted tick progress;
- intent sampling;
- creation of canonical future input records;
- transmission of those records.

A sufficiently bad main-thread/render/event-loop stall can therefore starve authority even if Box3D determinism and the network path are otherwise healthy.

Current timing contract at the audit checkpoint:

- simulation: 60 Hz;
- prediction lead: `8` ticks ≈ `133 ms`;
- input batch size: `2`;
- server max future window: `32` ticks ≈ `533 ms`;
- missing-input lease: `36` ticks = `600 ms`.

### Important prohibited shortcut

Do **not** solve this by simply increasing prediction lead/prefill from 8 toward 32.

Current server semantics for a second record targeting the same unconsumed future tick are:

- identical input → `duplicate_same`;
- changed input → `conflict`.

Future intent is therefore **not supersedable** today. Large prefill would make old intent impossible to correct and could trade starvation for hundreds of milliseconds of stale control/input lag. That would attack the embodiment goal.

The right design space is narrower:

- containment means a missing-input actor should degrade without killing peers/world;
- short gaps can remain bounded `held` before stale-neutral;
- input production/scheduling should be separated from rendering where that actually reduces accidental starvation;
- a total JS event-loop stall cannot be defeated by another main-thread timer;
- if materially larger future coverage is later needed, define and falsify a safe **supersede-unconsumed-future-intent** semantic rather than freezing future intent blindly.

Do not mutate timing constants before resolving the semantic contract.

Relevant current product files:

- `public/world-v0/app.js`
- `src/world-v0-contract.ts`
- `src/world-v0-protocol.ts`
- `src/world-v0.ts`

---

## 7. OPEN semantic boundary: transport failure versus authoritative process loss

Do not collapse these two failures.

### Transport/client failure

Current earned direction:

- keep the same WorldEpoch;
- retain ActorSession/body;
- stale-neutral only that actor after the lease;
- healthy peers and shared physics continue;
- a valid new connection can resume the same actor.

This is the continuity DO result above.

### Actual authoritative process/simulation-generation loss

A Durable Object can be recreated because of deployment/runtime/platform lifecycle. A live 60 Hz physics DO is not something we should try to treat as a sleeping/hibernating simulation while it is actively ticking.

If the authoritative Box3D process is genuinely lost, pretending the exact old WorldEpoch still exists would be semantically false. A new generation / WorldEpoch may be appropriate.

But a serious living world should eventually be able to reconstruct enough bounded state that a process loss does **not** mean “all shared matter resets to an empty/default Yard”.

The next foundation work after raw-seed discrimination should therefore be a **bounded restart/checkpoint reconstruction falsifier**, not full persistence architecture.

The desired question is roughly:

> can we checkpoint the minimum exact or sufficiently authoritative shared state needed to instantiate a new simulation generation after process loss, with explicit epoch rotation and without pretending continuity that was not preserved?

Keep this bounded to current World V0 semantics. Do not build accounts, databases, long-term character saves, economies or MMO persistence as part of this proof.

---

## 8. OPEN locality rule: first materialization matters, not merely stub lookup

Current best interpretation from the audit:

- obtaining a Durable Object stub is not itself necessarily the moment the object instance is materialized;
- an actual call such as `fetch()` can become the first request that starts/materializes the gameplay object;
- current room/status/CI probing can therefore matter if it invokes the gameplay DO before a representative player request;
- Durable Object placement is a future-expensive property because initial location can affect player latency.

Working rule to verify against current Cloudflare documentation and live routing before implementation:

> **No read-only metadata, CI or status request should accidentally be the first request that materializes a gameplay DO when representative player locality matters.**

This is not yet a request to build a global placement service. First prove whether current routing actually violates the intended rule, then isolate metadata from gameplay materialization with the smallest justified change.

Because Cloudflare platform behavior is time-sensitive, re-check current official documentation before relying on this handoff statement as platform truth.

---

## 9. Product/runtime facts that changed since older handoffs

Do not bring stale product assumptions forward automatically.

At the audit checkpoint, `src/world-v0-contract.ts` already reports the jump-era contract family:

- `shared-yard-v0-contract-v2-jump`;
- `shared-yard-v0-authority-v2-jump`;
- `shared-yard-v0-browser-sim-v2-jump`;
- `shared-yard-v0-scheduled-input-v2-jump`.

The browser UI includes the jump button.

Therefore older Owner feedback such as “jump is missing” is important historical pressure but **not a current runtime fact**. Verify current behavior before reopening jump work.

Likewise, earlier Friend-Ready / Two-Phone public staging evidence remains useful historical product evidence, but the current foundation audit has advanced beyond those exact source SHAs. Do not assume an old staging SHA is the current product candidate without live verification.

The latest continuity/raw-seed proof lane intentionally did **not** promote or alter staging/production.

---

## 10. Evidence classification at handoff

### EARNED

- Shared authoritative Box3D + canonical tick/scheduled-input + predicted/resimulated-client family remains valuable enough to preserve unless new evidence disproves it.
- One client transport failure does **not** mechanically require destroying the shared physics world.
- `Connection != ActorSession != WorldEpoch` is demonstrated in a real local Durable Object/WebSocket/Box3D specimen.
- stale-neutral actor containment and same-epoch resume are mechanically feasible on the current substrate.
- current canonical browser input generation is causally coupled to rAF-driven predicted physics progress.
- naive large future prefill is incompatible with current non-supersedable future-record semantics if we care about responsive intent.

### OPEN / needs another falsifier

- why raw copied recording bytes fail native replay deserialization even after byte-faithful ingress verification;
- whether raw recording bytes are viable same-build ephemeral rebase/checkpoint substrate at all;
- bounded authority process-loss checkpoint/reconstruction contract;
- exact correction/rebase horizon once continuity semantics change;
- safe render-independent input scheduler / possible future-intent supersession semantics;
- representative-player locality versus metadata-first DO materialization;
- production integration of ActorSession/Connection separation;
- remote/cloud and browser UX qualification after a production candidate exists.

### HYPOTHESES / not selected architecture

- raw Box3D recording bytes as the final checkpoint format;
- a particular durable storage schema;
- a specific resume-token security model;
- large future-input prefill;
- hibernating an actively ticking physics world;
- generic rollback/network framework;
- 3+ player scaling work as the immediate next task;
- persistence/MMO infrastructure as a consequence of this audit.

---

## 11. Immediate continuation order for a fresh conversation

Unless fresh live evidence changes the priority, use this order:

### 0. Compact live reground

Before implementation:

- verify live `world-v0-multiplayer-foundation-audit` head;
- verify live `world-v0-continuity-architecture-proofs` head if it still exists separately;
- compare against the handoff SHA;
- inspect latest relevant workflow runs, especially the mixed continuity/raw proof;
- verify no unexpected `public/world-v0`, staging or production mutation occurred after this handoff.

Do **not** redo a broad historical A2/A3/F1–F5 research recap unless live state is genuinely contradictory.

### 1. Finish raw-seed native source discrimination

Read pinned Box3D recording/replay source. Determine the exact native buffer/range semantics behind direct recording replay versus `GetData/GetSize`. Build one smallest causal probe. Preserve a negative answer if raw bytes are not actually a viable ingress surface.

### 2. Bounded authority restart/checkpoint falsifier

Only after the seed/state substrate question is understood, test process-loss reconstruction semantics with explicit WorldEpoch rotation. Do not design full persistence.

### 3. Input scheduler / future-intent semantics

Separate presentation cadence from canonical intent production where meaningful. If larger future coverage is required, design supersession semantics for **unconsumed** future input before increasing lead. Test control responsiveness as well as starvation resistance.

### 4. Locality isolation

Verify whether current status/CI paths can first-materialize gameplay DOs and whether that materially affects placement. Fix only the demonstrated path.

### 5. Integration readiness review

Before mutating the real `SharedYardV0`, synthesize what the audit has actually earned into the smallest coherent production contract. Challenge whether any unresolved item still justifies more foundation work.

### 6. Return to world/human evidence when foundation is strong enough

The audit must end. Once remaining failure semantics are sufficiently bounded, the next source of truth should again become a real shared play session rather than an ever-larger technical matrix.

---

## 12. Hard boundaries for the next conversation

Do not, merely because the conversation is fresh:

- restart A2/A3 or F1–F5;
- repeat already-qualified F5/World V0 evidence without a new causal question;
- promote staging/production automatically;
- merge into root/default branch automatically;
- replace Box3D/network stack wholesale because one proof is red;
- turn two-player continuity into generic MMO scaling;
- increase snapshot/tick/input lead constants as a substitute for semantic analysis;
- erase or hide negative evidence to make CI green;
- ask the Owner to run terminal commands when GitHub/browser tooling can perform the work;
- turn the brother/friend into a QA operator when human play becomes the next gate.

Use narrow experimental branches/specimens where a causal question can be isolated. Preserve exact SHAs, run IDs, artifact IDs and the distinction between machine PASS, architectural inference and Owner judgement.

---

## 13. Useful current files / probes

Foundation/product core:

- `src/world-v0.ts`
- `src/world-v0-contract.ts`
- `src/world-v0-protocol.ts`
- `public/world-v0/app.js`

Current audit apparatus includes:

- `.github/workflows/world-v0-multiplayer-foundation-audit.yml`
- `.github/workflows/world-v0-architecture-readiness-probes.yml`
- `.github/workflows/world-v0-epoch-death-trace-audit.yml`
- `.github/workflows/world-v0-mobile-pressure-audit.yml`
- `.github/workflows/world-v0-continuity-architecture-proofs.yml`
- `scripts/world-v0-continuity-do-probe.mjs`
- `scripts/world-v0-box3d-raw-seed-roundtrip-audit.mjs`
- `scripts/world-v0-patch-box3d-raw-seed-binding.mjs`
- `wrangler.continuity-audit.jsonc`

Read implementation and probe code before trusting a verdict label. Several useful findings in this project came from discovering that the apparatus itself was wrong.

---

## 14. Handoff hygiene / recent tooling artifacts

During preparation of this handoff, connector misuse accidentally created GitHub issues `#36` and `#37`. Both were immediately closed as `not_planned` and explicitly titled `[tooling artifact] temporary issue — ignore`.

They are **not project evidence, roadmap items or failed experiments**. A fresh agent scanning “recent issues” must ignore them.

---

## 15. Definition of a successful fresh takeover

A good new conversation should be able to say, after a compact live check:

- what is **EARNED**;
- what remains **OPEN**;
- what is only a **HYPOTHESIS**;
- what exact branch/SHA is the continuation point;
- what single next falsifier has the highest information value;
- why that falsifier matters to the future shared living world rather than to infrastructure elegance.

Then it should continue the work autonomously.

The expected immediate frontier at preparation time is:

> **inspect native Box3D recording/replay buffer semantics and causally explain the byte-faithful raw replay deserialization failure before changing another layer.**

If live evidence contradicts that priority, the new agent should explicitly explain why and reselect the frontier rather than following this document mechanically.
