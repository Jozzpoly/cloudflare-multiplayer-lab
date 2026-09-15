# Multiplayer Foundation — R2 Same-Build Hibernation Apparatus

Date: 2026-09-15

Status: **PREPARED / UNEXECUTED**

Gate name: **Gate 4C-R2 — repeated same-build idle hibernation recovery**

This apparatus is a new gate. It does not extend or relabel Gate 4C-R1.

R1 proved exact recovery across an intentional real Cloudflare code deployment. R2 asks a different question: can the same deployed Worker and Durable Object namespace survive a natural idle in-memory teardown/reconstruction boundary without any code deployment between checkpoint publication and recovery?

## Platform contract being exercised

Cloudflare currently documents that a Durable Object which is idle and satisfies the hibernation conditions transitions to the hibernated state after roughly 10 seconds of inactivity. In hibernation, in-memory state is discarded. The next request/event runs the Durable Object constructor again before handling that event.

Source:

- https://developers.cloudflare.com/durable-objects/concepts/durable-object-lifecycle/

Cloudflare separately documents a 70–140 second inactivity eviction path for idle non-hibernateable Durable Objects. That is **not** R2 and should be treated as a later independent gate.

The current recovery specimen is designed to be hibernateable after request completion: it does not intentionally leave timers, in-progress outbound fetches, standard WebSockets, outbound TCP sockets, or unfinished request handlers alive.

## Why R2 cannot use the R1 seed → resume commit sequence

Changing the recovery trigger from `seed` to `resume` creates a new Git commit and therefore a new Cloudflare deployment. That would reproduce R1's deployment boundary and contaminate any hibernation claim.

R2 therefore uses a dedicated trigger phase:

`hibernate`

One exact deployed SHA performs the whole experiment:

`exact build → fresh constructor empty → generation-1 publication → quiet window → same build still live → fresh constructor restored → exact resume`

No Git commit or Cloudflare code deployment is permitted between publication and recovery.

## Stronger repeated-cycle contract

One constructor nonce change could be confounded by an unrelated runtime restart. R2 therefore requires two consecutive idle reconstruction cycles on the same deployed SHA and same campaign object.

Executed shape:

`seed constructor A → publish generation 1 → 30 s no DO requests → constructor B restored → exact resume to 329 → 30 s no DO requests → constructor C restored → exact resume to 329`

Required assertions:

- one exact Worker build SHA for the complete campaign;
- one exact Cloudflare trigger phase/campaign for the complete campaign;
- independent pinned Box3D producer/consumer rebuild before publication;
- generation `1` published at canonical tick `260`;
- physics payload `41829` bytes;
- at least `30000 ms` of silence before each recovery observation;
- `/build` may be checked after the quiet window because the outer Worker serves it without obtaining/invoking the Durable Object stub;
- constructor B nonce differs from A;
- constructor C nonce differs from B and A;
- each reconstructed constructor reports `restoreState = restored` before `/resume`;
- each restored boundary is generation `1`, tick `260`, with the exact checkpoint payload hash and `41829` physics bytes;
- each `/resume` reproduces all `69` expected frames exactly through tick `329`;
- post-checkpoint actor churn remains exact (`actor:7` present, `actor:4` absent).

## Fail-closed conditions

R2 fails if any of the following occurs:

- the deployed build SHA changes during the campaign;
- the trigger phase/campaign changes;
- publication is not generation `1` at tick `260`;
- the first observation after either quiet window retains the previous constructor nonce;
- restore is not complete before `/resume`;
- payload/physics provenance differs;
- exact continuation diverges at any frame;
- a deployment occurs between publication and either recovery observation.

A failed attempt must not be reinterpreted as evidence for hibernation. The trigger must be explicitly disarmed after the campaign regardless of PASS or FAIL.

## Claim boundary

Even on PASS, R2 supports only a scoped claim: repeated natural same-build constructor reconstruction under the documented hibernation conditions, with durable generation-1 recovery and exact continuation for this qualified specimen.

R2 does **not** by itself prove:

- the separate 70–140 second non-hibernateable eviction path;
- platform restart/failover;
- regional migration;
- recovery across engine/adapter upgrades;
- production operational policy;
- product readiness.

Cloudflare does not expose a test-side "this exact reconstruction was hibernation" flag in this apparatus. Attribution therefore comes from the documented lifecycle contract, the specimen's hibernateable shape, the enforced idle windows, unchanged build identity, and repeated constructor reconstruction. A later gate for non-hibernateable inactivity eviction must use a deliberately non-hibernateable specimen and independent evidence.
