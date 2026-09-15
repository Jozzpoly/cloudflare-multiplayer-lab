# World V0 lifecycle independence R0-B1 evidence

Status: **PASS — local Workerd authority/protocol gate**  
Date: 2026-09-15  
Branch: `research/world-v0-lifecycle-independence-r0`

## Claim

R0-B1 proves the opt-in `lifecycle=r0` World V0 authority can execute this transition through the real local Worker / Durable Object / WebSocket path:

`one actor running canonically -> second fresh actor joins later -> both continue canonically`

without rotating `WorldEpoch`, replacing the first `ActorSession`, resetting the shared world, or allowing input authored against the old topology to leak across the topology boundary.

This is **not** browser, product, remote Cloudflare, persistence, arbitrary-roster, or actor-replacement qualification.

## Qualified source

Materialized authority/protocol commit:

`936e3a592ef345f7704c161e8459bd4a1b8c2d08`

The commit changed only:

- `src/world-v0-protocol.ts`
- `src/world-v0-shared-yard.ts`

Diff size: 178 insertions / 18 deletions across those two files.

Confirmation/apparatus cleanup commit:

`330bc8f876105e8d9ea46d8caca58c797bd91715`

The one-shot materializer was removed after it had produced and qualified the source. The permanent R0-B1 workflow is read-only and tests the source already stored in Git.

## Primary qualification run

Run: `34968182913`  
Job: `104377615847`  
Result: **completed / success**

Marker:

`WORLD_V0_LIFECYCLE_INDEPENDENCE_R0B1_PASS`

Observed transition:

- solo topology revision: `1`
- sustained solo fresh-input boundary: `160`
- topology-change boundary: `162`
- post-join topology revision: `2`
- deliberately queued old-topology target: `188`
- old pending input flushed: `true`
- stale topology rejected: `true`
- topology-change Recording rehydrate exact: `true`
- first actor ActorSession preserved: `true`
- second actor NetEntity: `actor:1`
- fresh two-actor continuation boundary: `202`
- same `WorldEpoch` before and after join: `true`

Primary evidence artifact:

- artifact ID: `10395972899`
- SHA-256: `bb6102eef9e3822565a3427fc5bfec3c6f60fe598b749e577dab6844b88b040a`

The same run also preserved the existing fixed-2P controls:

- repository-native TypeScript: PASS
- fixed World V0 protocol smoke: PASS
- Worker dry-run bundle: PASS
- existing I1 ActorSession / transport lifecycle probe: `WORLD_V0_INTEGRATION_I1_SERVER_SESSION_PASS`

## Materialized-source confirmation

Run: `34968527923`  
Job: `104378766841`  
Head: `330bc8f876105e8d9ea46d8caca58c797bd91715`  
Result: **completed / success**

This run had `contents: read` only. It did not generate or mutate authority source in the runner.

Marker:

`WORLD_V0_LIFECYCLE_INDEPENDENCE_R0B1_PASS`

Observed confirmation transition:

- solo topology revision: `1`
- sustained solo fresh-input boundary: `160`
- topology-change boundary: `162`
- post-join topology revision: `2`
- deliberately queued old-topology target: `188`
- old pending input flushed: `true`
- stale topology rejected: `true`
- topology-change Recording rehydrate exact: `true`
- first actor ActorSession preserved: `true`
- second actor NetEntity: `actor:1`
- fresh two-actor continuation boundary: `203`
- same `WorldEpoch` before and after join: `true`

Confirmation evidence artifact:

- artifact ID: `10395519224`
- SHA-256: `dc45e8f6dd3d38ffe05cd34d4dd44257071752e07e78f66e54a3660946ce8b2f`

The existing fixed-2P I1 lifecycle control also passed again in this read-only confirmation run.

## Topology contract established by R0-B1

R0 worlds now carry an explicit authority-authored topology identity containing:

- monotonic topology revision;
- deterministic topology digest;
- ordered active actor descriptors (`ActorSession`, NetEntity, authored slot);
- deterministic guarded entity order (active actors followed by the persistent authored props).

The one-actor and two-actor state guards are therefore valid but belong to different topology domains.

At the `1 -> 2` boundary the authority:

1. adds the new authored actor body to the live world;
2. increments topology revision;
3. clears transient pending/held actor input from the old topology;
4. publishes an exact authority Recording seed for the new topology;
5. informs the already-running peer through `world_v0_topology_changed`;
6. requires subsequent R0 ready/input messages to bind to the current topology revision/digest;
7. fails stale topology input closed without killing the healthy transport.

Default World V0 remains fixed-2P; R0 behavior is opt-in and does not silently redefine the qualified product baseline.

## Non-claims / open frontier

R0-B1 does **not** prove:

- browser topology projection or local Box3D rehydrate;
- perceptual continuity, absence of visible rehydrate jank, camera/input-shell continuity, or UI behavior;
- real two-browser entry flow;
- remote Cloudflare placement;
- Durable Object process-loss reconstruction for this product runtime;
- actor removal/replacement after disconnect;
- arbitrary `0..N` or 3+ roster support;
- persistence or MMO architecture;
- product readiness.

The next bounded frontier is **R0-B2: real browser topology transition**. It should preserve the existing browser shell/self identity while moving from `self + 0 remotes` to `self + 1 remote`, rehydrate local replay physics from the topology-change authority seed, and re-establish exact guard convergence without page reload or lobby re-entry.
