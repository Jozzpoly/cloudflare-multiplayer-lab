# World V0 lifecycle independence R0-B2 evidence

Status: **PASS — local Workerd + real Chromium browser topology gate**  
Date: 2026-09-15  
Branch: `research/world-v0-lifecycle-independence-r0`

## Claim

R0-B2 proves the opt-in `lifecycle=r0` World V0 browser path can execute the bounded transition:

`one real browser actor running solo -> second fresh browser actor joins later -> both continue in the same WorldEpoch`

while preserving the incumbent browser document, ActorSession / NetEntity identity, user-adjusted camera state, and exact authority-state convergence across the topology `1 -> 2` boundary.

The browser does not reload or re-enter a lobby to accomplish the transition. The incumbent rehydrates local Box3D state from the authority Recording seed for the new topology; the late joiner bootstraps from the same topology-bound authority state.

This is a bounded max-2 research result. It is **not** qualification of arbitrary `0..N` topology, actor removal/replacement, remote Cloudflare placement, mobile browser behavior, persistence, or product UX readiness.

## Qualified source

R0-B1 authority/protocol source remains:

`936e3a592ef345f7704c161e8459bd4a1b8c2d08`

R0-B2 materialized browser source commit:

`d409c2a68a7e2daa3f9014b576b23989f62ac733`

The B2 source commit changed only:

- `public/world-v0/app.js`

Diff size: 263 insertions / 30 deletions.

Read-only confirmation/apparatus cleanup commit:

`b7a1d81b5390801e15601459b9e8c78bf16bef38`

The one-shot B2 materializer was removed. The remaining B2 workflow has `contents: read`, verifies that the materialized source markers exist, runs the browser gates, and asserts `git diff --exit-code` after testing.

Default World V0 remains fixed-2P. R0 behavior remains opt-in through `lifecycle=r0`.

## Primary qualification

Run: `34972551275`  
Job: `104392117407`  
Apparatus head: `a506f19015f15cd720b7ed88776930a959259c02`  
Result: **completed / success**

Primary marker:

`WORLD_V0_LIFECYCLE_INDEPENDENCE_R0B2_REAL_CHROMIUM_PASS`

Browser: `Google Chrome 152.0.7977.82`

Observed R0 browser transition:

- A solo topology revision: `1`
- A solo guarded entity count: `13` (`1 actor + 12 props`)
- A moved while genuinely solo: `2.903909700802609 m`
- captured solo boundary: `246`
- topology-change boundary: `333`
- post-join topology revision: `2`
- post-join guarded entity count: `14`
- `WorldEpoch` preserved: `true`
- incumbent ActorSession preserved: `true`
- incumbent browser document sentinel preserved: `true`
- user-adjusted camera preserved: `true`
- incumbent exact authority rebase count: `1`
- late-join browser authority bootstrap/rebase count: `1`
- post-join A authored inputs: `404`
- post-join B authored inputs: `105`
- A exact guard matches: `81`
- B exact guard matches: `25`
- A guard mismatches: `0`
- B guard mismatches: `0`
- A continued moving after join: `0.32355195311274215 m`
- B moved after late join: `2.837607019036043 m`

Primary artifact:

- artifact ID: `10398061985`
- SHA-256: `413c80a50ba4fcb3b0a31657ecfe6908d25758a3f6b4c6d983c2b83e5d1d490d`

The same run also kept the existing fixed-2P real-Chromium I4B exact-rebase control green.

## Materialized-source read-only confirmation

Run: `34973051827`  
Job: `104393787709`  
Head: `b7a1d81b5390801e15601459b9e8c78bf16bef38`  
Result: **completed / success**

The workflow token had `contents: read`. The one-shot materializer was absent, and the final tracked-tree check was `git diff --exit-code`.

Confirmation marker:

`WORLD_V0_LIFECYCLE_INDEPENDENCE_R0B2_REAL_CHROMIUM_PASS`

Observed independent confirmation:

- A solo topology revision: `1`
- A solo entity count: `13`
- A solo movement: `2.9595155799764448 m`
- captured solo boundary: `243`
- topology-change boundary: `339`
- post-join topology revision: `2`
- post-join entity count: `14`
- `WorldEpoch` preserved: `true`
- incumbent ActorSession preserved: `true`
- browser document sentinel preserved: `true`
- user-adjusted camera preserved: `true`
- A rebase count: `1`
- B rebase count: `1`
- A authored inputs: `408`
- B authored inputs: `103`
- A exact guard matches: `83`
- B exact guard matches: `28`
- A guard mismatches: `0`
- B guard mismatches: `0`
- A post-join movement: `0.3235535357170783 m`
- B post-join movement: `2.8375369262946166 m`

Confirmation artifact:

- artifact ID: `10398720406`
- SHA-256: `95b72e094618bf670fd66b34aea8ec9955701c22f5000b90ed72e443297e9d0e`

## Fixed-2P regression control

The read-only confirmation run also passed the existing fixed-2P I4B real-Chromium exact-rebase test:

`WORLD_V0_INTEGRATION_I4B_REAL_CHROMIUM_EXACT_REBASE_PASS`

Observed control evidence included:

- same fixed-2P ActorSession before/after recovery: `true`
- same NetEntity identity: `true`
- controlled recovery gap: `216` ticks
- retained client history: `24` ticks
- input lease: `36` ticks
- authority rebase count: `1`
- exact guard matches: `34 -> 44`
- guard mismatches: `0`
- first state mismatch: `null`
- healthy peer runtime failure: `false`

Therefore B2 did not require redefining or silently weakening the existing fixed-2P browser recovery path.

## Browser semantics established by R0-B2

For the bounded `1 -> 2` topology transition the R0 browser now:

1. runs the first actor and persistent props with a topology-specific guarded entity order;
2. binds R0 ready/input traffic to the current topology revision and digest;
3. stops old-topology authorship/prediction when the authority announces a new roster/topology;
4. accepts the authority topology-change Recording as the exact new local physics boundary;
5. remaps the new actor topology into the existing browser shell without replacing the document;
6. preserves incumbent self identity and user camera state;
7. allows a fresh second browser to bootstrap directly into the already-running epoch from authority Recording state;
8. resumes canonical authorship and exact state-guard checking for both browsers;
9. retains the original fixed-2P path when R0 is not requested.

This is intentionally **not** a generalized multiplayer roster implementation. The proven browser model is one self actor plus an optional single remote actor.

## Non-claims

R0-B2 does **not** prove:

- topology `2 -> 1` actor removal while the world continues;
- replacement of a departed actor by a new human in the same epoch;
- arbitrary `0..N`, 3+, or MMO-scale actor topology;
- remote Cloudflare deployment/placement behavior for this R0 path;
- mobile browser continuity;
- perceptual jank quality beyond preservation of the tested document/camera state;
- persistent world reconstruction after process loss;
- production matchmaking, room UX, capacity policy, or product readiness.

## Stop condition / next decision

**R0-B2 closes the planned local `1 -> 2` lifecycle-independence proof. Do not automatically create R0-B3/R0-C merely because more topology cases are possible.**

B1 + B2 now provide direct local evidence that an ongoing WorldEpoch does not have to be born as a fixed two-player round: one actor can inhabit and move through the live world before a second human arrives, and the second human can join without replacing the world or browser shell.

The next step is a product/foundation decision, not another automatic research gate:

- decide whether this opt-in R0 semantic should be promoted toward the actual Shared Yard / multiplayer foundation contract;
- if promoted, integrate it deliberately with current product entry/presence/room semantics and prepare an Owner-facing ongoing-Yard test;
- only add topology removal/replacement work when the intended product lifecycle requires those semantics.

The fixed-2P qualified baseline remains available as a control until that promotion decision is made.