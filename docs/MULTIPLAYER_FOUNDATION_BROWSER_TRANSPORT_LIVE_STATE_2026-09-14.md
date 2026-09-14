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
- end-to-end authority/client Box3D convergence from real recording bytes through that real transport path.

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

Research head: `05e1ec667a74d5a12a97082ff64d4fdf112c9241`  
Actions: `34867859430` / job `104056125983` — `completed / success`.

Bounded v1 wire vocabulary:

- `foundation_join`;
- `foundation_runtime_sync`;
- `foundation_runtime_ready`;
- `foundation_input_batch`;
- `foundation_input_result`.

`runtime_sync` transports the already-qualified semantic/runtime bootstrap rather than introducing a second state representation. The smoke exercised 11 malformed/binding cases and requires fail-closed world/profile/session/topology/seed validation.

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

This is the first executed end-to-end specimen that combines live Box3D authority, real local Cloudflare DO/WebSocket transport, multiple independent Chromium clients, real recording-byte bootstrap and exact future physical convergence.

## What this does **not** prove

5F2 deliberately uses canonical zero input for the 30-tick convergence horizon. Each browser predicts its own zero input while remote actors can correctly hold the zero bootstrap baseline. This isolates seed/transport/physics equivalence without pretending peer input propagation is already solved.

Still unproven in this line:

- non-neutral input from multiple clients propagated to the other client replicas with exact/reconciled semantics;
- simultaneous intentionally different movement that produces shared actor↔prop / actor↔actor consequences through the new replication protocol;
- reconnect/resume of the new dynamic transport path through a live physical run;
- retire/replacement through real browser transports;
- controlled latency, jitter, loss, duplicate and reorder;
- meaningful 3/6-client CPU, memory and network load measurements;
- deployed-Cloudflare behavior for this new browser/transport specimen;
- real 3–6 human Owner/friend playability and feel;
- product UX, capacity policy or readiness;
- MMO-scale, interest management, partitioning or authority migration.

The separate recovery campaign remains authoritative for restart/storage claims. A local browser transport PASS must not be promoted into a deployed recovery claim.

## Current-best next frontier

The next narrow falsifier should be **non-neutral multi-client canonical input propagation** over the new replication path.

It should avoid immediately building a general snapshot/delta protocol. The smallest useful experiment is:

1. three clients remain on one live physical authority;
2. each owns a distinct deterministic non-zero input stream;
3. authority-valid accepted input is propagated to the other clients with explicit identity/tick provenance;
4. every client feeds those canonical/peer inputs into its existing input ledger;
5. all browser Box3D runtimes advance through the same interacting physical horizon;
6. authority correction verifies exact convergence or identifies the first real reconciliation requirement;
7. actor/prop interaction is deliberately present so a trivial independent-motion case cannot pass accidentally.

Only after that seam is grounded should the campaign broaden into deterministic network impairment and N-client load/scale work.

## Certification interpretation

Gate 5 should now be read as:

**PASS / scoped automated browser + transport + byte-seed physical convergence specimen.**

It is not a Gate-7 human/product PASS and is not evidence that the remaining non-neutral replication, resilience, scaling or deployed-runtime questions are solved.
