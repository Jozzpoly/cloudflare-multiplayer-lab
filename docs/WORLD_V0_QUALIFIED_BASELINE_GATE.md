# World V0 — Qualified Baseline Gate

Status: **PASS / BASELINE FROZEN**  
Updated: **2026-09-10**  
Exact qualified product: `7755a668d7488f04ecbf42a00fbc96fcb978d544`

## Verdict

The current fixed-two-player Shared Yard foundation has passed its final Owner gate and is qualified for deliberate safe stop.

The final broad desktop/mobile Owner recordings judged ordinary play **stable and smooth**. They did not reproduce a broad multiplayer/netcode failure. They isolated one local UI/input defect around Diagnostics focus plus unnecessary desktop touch controls; both were repaired in the final product.

The final tiny real-device sanity after that repair passed **3/3**:

1. desktop: repeatedly open/close Diagnostics -> immediate WASD continues working without another click/refresh — **PASS**;
2. desktop: joystick/gimbal/JUMP absent on normal fine-pointer desktop — **PASS**;
3. mobile: joystick/gimbal/JUMP visible and usable — **PASS**.

No further broad Owner reliability campaign is required by default.

## Exact product and evidence

Product source:

`7755a668d7488f04ecbf42a00fbc96fcb978d544`

Focused Owner-UI causal run:

- run `34474057233` — **SUCCESS**;
- artifact `10150740652`;
- digest `sha256:62bb4b39cb70e46f280df7bfcae061a51bb5b72744a30817d456dc2c688df38d`.

Full Current Validation on exact final product:

- run `34474343862` — **SUCCESS**;
- artifact `10151068683`;
- digest `sha256:728f0f5c7dfa68a6fb5f11ab04a1fd7e8b6c55f8d63b6d123255fb54ffa4827d`.

Final delivery:

- branch `world-v0-foundation-final-delivery`;
- head `fa5e45594f0c39ba4e96c13b4ef783bbaae1ba65`;
- run `34475199474` / job `102864191837` — **SUCCESS**;
- Worker `cloudflare-multiplayer-lab-qualified-play`;
- Cloudflare Version `1cc9a0fd-2fac-4d23-a75d-c66669ddee01`;
- artifact `10151181384`;
- digest `sha256:4d0cdc5eb04bf3dcafdbad4ccd469b2db24f7d372f1549212d7e0321e3f49553`;
- terminal marker `HUMAN_DURABLE_OBJECTS_UNTOUCHED_BY_WORKFLOW`.

The delivery commit adds delivery apparatus; protected product bytes are the exact qualified `7755a668...` source.

## Qualified product identity

Presentation/input:

- browser UI `shared-yard-v0-browser-ui-v20-owner-ui-focus`;
- keyboard focus guard `world-v0-keyboard-focus-guard-v2-semantic-ownership`.

Server simulation/network identity remains:

- authority `shared-yard-v0-authority-v11-jump-delivery-persistence`;
- browser sim `shared-yard-v0-browser-sim-v10-jump-delivery-persistence`;
- protocol `shared-yard-v0-scheduled-input-v3-supersession`;
- state guard `shared-yard-v0-f32-state-v1`;
- SimBuild `shared-yard-v0-sim-cd8edc169f791a64`.

## What PASS means

PASS means the current two-player foundation is trustworthy enough that remaining limitations are bounded debt rather than reasons to distrust the core.

It does **not** prove or authorize claims of:

- persistent physical-world reconstruction;
- arbitrary dynamic roster replacement;
- 3+ players;
- account/cloud identity;
- seamless MMO-style lifecycle;
- universal mobile network/suspension recovery;
- final movement/controller behavior.

A fresh player taking a soft-reserved seat can still rotate the fixed WorldEpoch and lose prior physical history. That is an accepted architectural limit of this baseline.

## What PASS earns

The correct next action is not another feature. It is:

1. freeze exact product/delivery/recovery anchors;
2. deliberate safe stop;
3. canonical documentation reconciliation;
4. controlled workflow/branch/PR archaeology and cleanup;
5. compact recovery/takeover spine;
6. then Project Soul / repository-role review and next-era architecture selection.

## Deferred near-term Owner requirement

After cleanup, the next-era design should allow a player to enter a Yard **alone**, immediately inhabit and play in the physical world, and wait there for another player. The current waiting shell is not the intended near-term product behavior.

Do not retrofit that feature into the frozen baseline during cleanup.