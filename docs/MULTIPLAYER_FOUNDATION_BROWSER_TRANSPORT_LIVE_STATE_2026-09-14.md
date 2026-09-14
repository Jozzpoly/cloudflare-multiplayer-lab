# Multiplayer Foundation — browser / transport live state

Status: **RESEARCH / GATE 5 SCOPED AUTOMATED FOUNDATION PASS / NOT PRODUCT QUALIFIED**  
Date: 2026-09-14  
Branch: `research/multiplayer-foundation-v1-2026-09-13`  
PR: #51

This document is the current browser/transport truth for the isolated Multiplayer Foundation campaign. It supersedes older statements that Gate 5 is wholly unproven. It does not supersede the separate recovery live-state document and is not permission to merge this research line as a product-readiness claim.

## Live truth

The foundation now has executed evidence that a dynamic browser client is no longer constrained to the qualified fixed-2P `self + remote` topology.

Scoped automated evidence currently demonstrates:

- dynamic client projection with one `self` plus `0..N` remotes keyed by stable ActorSession/Actor identity;
- real Chromium hydration from exact Box3D recording bytes;
- topology rebootstrap across `2 → 6` active actors and same-epoch churn;
- a late-joining client using the same physical seed/topology as an existing client while selecting a different `self` actor;
- a typed fail-closed replication wire vocabulary around the already-qualified bootstrap/runtime seams;
- real local Cloudflare `wrangler/workerd` + one Durable Object + real WebSockets + three independent Chromium targets;
- dynamic networked membership `1 → 2 → 3` with topology-bound runtime sync and owned scheduled input acceptance;
- end-to-end authority/client Box3D convergence from real recording bytes through that real transport path;
- authority-authored canonical input commit propagation for three distinct simultaneous non-zero client input streams;
- exact 60-tick browser/authority convergence through shared actor/prop physical interaction.

The qualified fixed-2P World V0 on `main` remains untouched reference evidence.

## Executed checkpoints

### 5E3B — alternate-self late join in Chromium: PASS

Research head: `0bf170abfb47a1e4e7b2e6b84d5cb29e39411d3b`  
Actions: `34867225179` / job `104053978346` — `completed / success`.

At one six-actor physical boundary:

- primary client: `session-self → actor:0`;
- late-join client: `session-d → actor:4`;
- both had five remotes;
- both received the same physical topology and the same recording seed bytes/checksum;
- projection/runtime digests differed because `self/remote` semantics are client-relative;
- both remained exact against one authority for 30 shared future ticks in real Chromium.

This demonstrates that physical truth is not incorrectly bound to one client's `self` identity.

### 5F0 — replication wire contract: PASS

Initial research head: `05e1ec667a74d5a12a97082ff64d4fdf112c9241`  
Initial Actions: `34867859430` / job `104056125983` — `completed / success`.

The original bounded v1 wire vocabulary contained:

- `foundation_join`;
- `foundation_runtime_sync`;
- `foundation_runtime_ready`;
- `foundation_input_batch`;
- `foundation_input_result`.

For 5F3 this contract was intentionally versioned to `multiplayer-foundation-replication-v2-input-commit` rather than silently extending v1. v2 adds authority-authored `foundation_input_commit` with recipient ActorSession, source ActorSession/ActorId, topology revision, batch sequence, authority boundary tick and canonical records. The protocol smoke now also exercises invalid recipient/boundary/source cases.

No delta-state protocol, binary optimization or interest-management policy was introduced.

### 5F1 — real local DO/WebSocket/3-Chromium transport: PASS

Research head: `ee001d7dba81e59edf3c3515a104163efeccb313`  
Actions: `34870420352` / job `104064660039` — `completed / success`.

One local Cloudflare workerd Durable Object served three independent Chromium targets over real WebSockets:

- `session-alpha → actor:0`;
- `session-bravo → actor:1`;
- `session-charlie → actor:2`;
- topology advanced `1 → 2 → 3`;
- six topology/runtime syncs were delivered and acknowledged;
- three client input batches / six input records were authority-accepted;
- no invalid protocol message or stale-ready event occurred;
- the same run continued through existing browser regressions, typecheck and Worker dry-run.

The seed in this specific transport-isolation specimen was intentionally synthetic. Physical-byte integration was the next separate gate rather than being confounded with first WebSocket/DO lifecycle validation.

### 5F2 — live Box3D authority + real transport + exact browser convergence: PASS

Research head: `ca90ea11baa095e7719f3dfd9f4e4bf0ff59ae06`.

Dedicated convergence workflow:

- run `34871635591`;
- job `104068679712`;
- result: `completed / success`;
- marker: `MULTIPLAYER_FOUNDATION_LOCAL_PHYSICS_TRANSPORT_PASS`.

Ordinary repository CI at the same head:

- run `34871640032`;
- job `104068695559`;
- result: `completed / success`.

The isolated specimen executed:

- one live World-V0-configured Box3D authority inside local workerd / Durable Object;
- full arena + 12 persistent props + three dynamically joined actors;
- real `b3Recording_CopyData` authority seeds transported through `foundation_runtime_sync`;
- three independent Chromium clients hydrating their own Box3D runtimes from those bytes;
- final topology revision `3` with two remotes per client;
- six zero-input batches / 90 authority-accepted scheduled records covering 30 future ticks for all three actors;
- 30 independent future Box3D steps in each browser runtime;
- a same-topology authority `correction` sync at canonical tick `33`;
- exact equality between every browser's pre-correction state guard and the authority correction boundary;
- successful hydration of the correction seed afterward.

Final executed evidence:

- authority boundary tick: `33`;
- topology digest: `e6cce2820eb5cc3c`;
- total runtime syncs: `9` (`6` membership/topology + `3` correction);
- correction syncs: `3`;
- final recording seed: `31637 B`;
- final seed FNV-1a32: `74d5adbd`;
- all three clients: `exactContinuationTicks = 30` and `correctionGuardMatched = true`.

This remains the neutral control specimen for later interactive replication work.

### 5F3 — canonical non-zero multi-client input propagation + interacting exact convergence: PASS / scoped

Research head: `fdaa9a058fbaf6e1323a1a5f3bb2af8cdf5075e4`.

Dedicated interactive workflow:

- run `34873837398`;
- first job `104076010206` — `completed / success`;
- confirmatory rerun job `104076580552` — `completed / success`;
- marker: `MULTIPLAYER_FOUNDATION_INTERACTIVE_PHYSICS_TRANSPORT_PASS`.

Ordinary repository CI at the same research head:

- run `34873842535`;
- job `104076027844` — `completed / success`.

Neutral-control regression on the same runtime/fixture/runner code before the workflow-only head advance:

- head `af78c30fddf5467f7cf18512749feef1bc9e3569`;
- run `34873792595` / job `104075864659` — `completed / success`;
- marker: `MULTIPLAYER_FOUNDATION_LOCAL_PHYSICS_TRANSPORT_PASS`;
- retained 30-tick zero-input exact convergence with no commit traffic.

5F3 executed one authority with three distinct simultaneous deterministic non-zero input streams:

- `session-alpha / actor:0` → `(0.8, 0.6)`;
- `session-bravo / actor:1` → `(-0.8, 0.6)`;
- `session-charlie / actor:2` → `(0, -1)`;
- four 15-tick batches per actor;
- `12` total input batches;
- `180` authority-accepted canonical records;
- `180` committed canonical source records;
- `36` recipient-bound `foundation_input_commit` messages from authority.

Each Chromium client independently received:

- `12` canonical commit messages;
- `180` canonical records;
- commits from all three ActorSessions;
- its own local input as prediction followed by authority commit;
- peer input only through authority-authored commits;
- resolved input frames whose three actors were all authority-sourced before simulation.

Each browser then advanced its own Box3D runtime for `60` future ticks and matched the authority's correction guard exactly at canonical tick `63`.

First and confirmatory runs produced the same final physical evidence:

- topology revision: `3`;
- topology digest: `e6cce2820eb5cc3c`;
- final recording seed: `35153 B`;
- final seed FNV-1a32: `1cc11f63`;
- maximum horizontal prop displacement: `0.06361874507046983 m`;
- all three clients: `exactContinuationTicks = 60`;
- all three clients: `correctionGuardMatched = true`.

The prop displacement requirement is intentional: 5F3 cannot pass merely by moving three independent actors in empty space. Shared dynamic world state was measurably disturbed while all replicas remained exact.

## What this does **not** prove

5F3 closes the previous non-neutral peer-input gap for one bounded local deterministic specimen. It does not make the transport generally resilient or product-ready.

Still unproven in this line:

- reconnect/resume while non-neutral shared physical interaction is active;
- retire/replacement through real browser transports during active physical continuation;
- controlled latency, jitter, loss, duplicate and reorder of input/commit/runtime-sync traffic;
- late or superseding canonical input that actually forces replay/reconciliation in the live browser transport path;
- meaningful 3/6-client CPU, memory, bandwidth and message-rate measurements;
- deployed-Cloudflare behavior for this browser/transport specimen;
- real 3–6 human Owner/friend playability and feel;
- product UX, capacity policy or readiness;
- MMO-scale, interest management, partitioning or authority migration.

The separate recovery campaign remains authoritative for restart/storage claims. A local browser transport PASS must not be promoted into a deployed recovery claim.

## Current-best next frontier

The next narrow falsifier should be **transport/lifecycle disturbance while canonical shared motion is active**, not simply a longer clean run.

The preferred sequence is:

1. keep one live physical authority and three browser clients;
2. preserve distinct non-zero canonical input streams and measurable shared actor/prop interaction;
3. first exercise a controlled transport interruption/reconnect of one ActorSession without replacing its identity;
4. require the reconnected browser to rehydrate/resume and return to exact convergence while the other clients remain live;
5. then separately introduce deterministic latency/jitter/duplicate/reorder and finally loss;
6. only after those semantics are grounded should the campaign broaden into N-client load/scale measurement and deployed edge validation.

A future test that merely survives network disturbance by repeatedly shipping full corrections would not automatically qualify the intended replication design; message provenance, bounded recovery cost and the actual reconciliation path must remain inspectable.

Evidence boundary for that next step: 5F3 demonstrates clean-path canonical input fan-out and exact continuation. It does **not** demonstrate replay after a commit arrives after local simulation has already consumed the affected tick. That distinction must remain explicit when designing the first impairment/reconnect specimen.

## Certification interpretation

Gate 5 should now be read as:

**PASS / scoped automated dynamic browser + real local transport + byte-seed Box3D + authority-authored multi-client canonical input convergence specimen.**

Gate 5F3 specifically is:

**PASS / scoped repeated 3-client non-zero canonical input and interacting exact-convergence specimen.**

This is not a Gate-7 human/product PASS and is not evidence that resilience, network impairment, scaling or deployed-runtime questions are solved.
