# World V0 — Foundation Stabilization Direction

Status: **OWNER CORE PASS / FINAL UI SANITY BEFORE SAFE STOP**  
Updated: **2026-09-10**  
Exact final candidate: `7755a668d7488f04ecbf42a00fbc96fcb978d544`  
Polish branch: `world-v0-foundation-polish-closure`

## Execution order

The current closure order is now:

1. stabilize the fixed two-player foundation;
2. challenge it broadly and independently;
3. polish, repair and reconcile validation/documentation debt;
4. run representative Owner desktop/mobile qualification;
5. repair only a concrete defect found by that Owner run;
6. perform one tiny sanity check of that repair;
7. freeze and enter deliberate safe stop;
8. only then perform broader branch/workflow archaeology and formalize the next multiplayer era.

Steps 1–5 are complete. Step 6 is the only current gate.

New gameplay/product architecture is not the current frontier.

## Stabilization work already closed

### Dormant capacity ownership — CLOSED

Public Yard state distinguishes connected capacity, protected reconnect reservations, soft/replaceable reservations and fully vacant resumable epochs. Dormant history may retain private Resume authority while unused but does not own scarce public capacity indefinitely.

### Same-owner live rebound — CLOSED

The exact private ActorSession token may atomically supersede that same actor's older transport. Foreign profiles cannot claim the ActorSession without the token.

### Cross-Yard capacity exhaustion — CLOSED

Retained history across Yard 1/2/3 was explicitly challenged without permanently exhausting public capacity.

### Text-entry keyboard ownership — CLOSED

Callsign fields retain physical W/A/S/D as text and do not leak those keys into gameplay.

### Join/lifecycle/network error clarity — CLOSED TO CURRENT SCOPE

Capacity, reconnect protection, unavailable Yard, transport/handshake and unknown-state failures are materially distinguished rather than collapsed into one generic message.

### Authority WorldEpoch loss — CLOSED AT CURRENT FOUNDATION SCOPE

On abnormal active loss the browser first attempts exact ActorSession Resume. Same-epoch or uncertain authority evidence preserves that path. Only positive reachable evidence that the old epoch is gone permits stale-token retirement and fresh re-entry into the same logical Yard.

This prevents a dead ActorSession token from exhausting into a fatal foundation failure when the in-memory authority epoch genuinely disappeared.

## Broad verification before the latest Owner run

Decisive automated evidence includes:

- authority-loss post-promotion focused gate `34426373914` — **SUCCESS**;
- full Current Validation `34426331772` — **SUCCESS**;
- broad adversarial campaign `34428181101` — **SUCCESS / 8 of 8 jobs**;
- near-simultaneous Resume-vs-fresh race `34428538218` — **SUCCESS**.

Those campaigns covered repeated authority loss, background-hidden recovery, retained history across all public Yards, fresh remote Cloudflare Durable Objects, same-owner live rebound, physical keyboard ownership, soft/vacant handoffs and exact Resume controls.

Additional resumed-stayer causal work reproduced the previously suspicious lifecycle composition successfully locally and repeatedly on fresh remote Durable Objects. The earlier fatal dual-`1006` signature was instead reproduced by controlled loss of the in-memory authority process, which motivated the bounded authority-epoch-loss recovery above.

## Owner broad human qualification — PASS WITH ONE LOCAL UI DEFECT

The 2026-09-10 Owner recordings produced the important human result:

> ordinary gameplay was stable and smooth.

No broad netcode/reliability failure was reproduced. The dominant concrete defect was local input ownership:

- clicking/opening/closing Diagnostics could leave focus on the `<summary>` element;
- the old keyboard guard then swallowed WASD because it treated every focused interactive control like an editable field;
- movement only returned after another gameplay/touch surface was clicked;
- desktop also unnecessarily displayed touch control surfaces.

This was classified as a bounded UI/input freeze blocker, not a reason to reopen the multiplayer core.

## Final Owner UI repair — CLOSED AUTOMATICALLY / HUMAN SANITY PENDING

Exact product source:

`7755a668d7488f04ecbf42a00fbc96fcb978d544`

Repair:

- editables still own all keyboard input;
- `summary`, buttons and links own activation keys (`Space` / `Enter`) but no longer swallow unrelated gameplay WASD simply because they retain focus;
- ownership is symmetric across keydown/keyup;
- joystick, camera gimbal and JUMP are hidden for primary fine-pointer desktop and shown for coarse-pointer/mobile;
- browser UI revision advanced to `shared-yard-v0-browser-ui-v20-owner-ui-focus`;
- keyboard guard revision advanced to `world-v0-keyboard-focus-guard-v2-semantic-ownership`.

Physics/simulation/server authority/protocol remain unchanged.

Focused real-Chromium gate:

- run `34474057233` — **SUCCESS**;
- artifact `10150740652`;
- digest `sha256:62bb4b39cb70e46f280df7bfcae061a51bb5b72744a30817d456dc2c688df38d`.

Full Current Validation on exact `7755a668...`:

- run `34474343862` — **SUCCESS**;
- artifact `10151068683`;
- digest `sha256:728f0f5c7dfa68a6fb5f11ab04a1fd7e8b6c55f8d63b6d123255fb54ffa4827d`.

All historical lifecycle/prestart/cross-page/all-drop/exact-rebase/dual-browser/human-entry gates remained green.

## Final delivered Owner candidate

URL:

`https://cloudflare-multiplayer-lab-qualified-play.jozzpoly.workers.dev/world-v0/`

Delivery:

- branch `world-v0-foundation-final-delivery`;
- delivery head `fa5e45594f0c39ba4e96c13b4ef783bbaae1ba65`;
- run `34475199474` / job `102864191837` — **SUCCESS**;
- Cloudflare Version ID `1cc9a0fd-2fac-4d23-a75d-c66669ddee01`;
- artifact `10151181384`;
- digest `sha256:4d0cdc5eb04bf3dcafdbad4ccd469b2db24f7d372f1549212d7e0321e3f49553`;
- protected product bytes matched exact `7755a668...`;
- static convergence passed;
- `HUMAN_DURABLE_OBJECTS_UNTOUCHED_BY_WORKFLOW`.

## Exact current identities

Unchanged simulation/physics identity:

- contract `shared-yard-v0-contract-v14-jump-delivery-persistence`;
- authority `shared-yard-v0-authority-v11-jump-delivery-persistence`;
- browser sim `shared-yard-v0-browser-sim-v10-jump-delivery-persistence`;
- protocol `shared-yard-v0-scheduled-input-v3-supersession`;
- state guard `shared-yard-v0-f32-state-v1`;
- SimBuild `shared-yard-v0-sim-cd8edc169f791a64`.

Final presentation/lifecycle shell:

- browser UI `shared-yard-v0-browser-ui-v20-owner-ui-focus`;
- keyboard focus guard `world-v0-keyboard-focus-guard-v2-semantic-ownership`;
- session continuity `world-v0-session-continuity-r3-live-rebind`;
- public room entry `world-v0-public-room-entry-r3-presence-capacity`;
- public room directory `world-v0-public-room-directory-r4-vacant-capacity`;
- join failure clarity `world-v0-join-failure-clarity-v1`;
- authority epoch-loss recovery `world-v0-authority-epoch-loss-v1`.

## Accepted boundary for later architecture work

The fixed two-player topology still rotates to a fresh WorldEpoch when a soft-reserved actor is replaced by a new player. This intentionally discards the old epoch's shared physical history rather than attempting unsafe in-epoch actor replacement.

That behavior is acceptable for this baseline, but it is **not** the intended architecture for a persistent co-op sandbox or mini-MMO. Later work must explicitly reconsider:

`world lifetime != roster lifetime != ActorSession lifetime != transport/device lifetime`

Do not open that redesign until after safe stop and repository cleanup.

## Remaining blocker before safe stop

Only a small human sanity check remains:

1. desktop Diagnostics open/close must no longer interrupt WASD;
2. desktop touch controls must be absent on normal fine-pointer desktop;
3. mobile/coarse-pointer touch controls must remain present and usable.

No new broad reliability campaign is justified unless this final sanity test reveals conflicting evidence.

## Safe-stop requirement

If the sanity check passes:

- freeze exact product `7755a668...` and Cloudflare Version `1cc9a0fd...`;
- preserve final Owner verdict/evidence;
- stop product expansion;
- inventory/classify workflows and >150 branches before deletion;
- preserve archive/evidence/donor provenance;
- reconcile the stabilized baseline with the long-lived canonical branch deliberately;
- review Project Soul / repository role only after cleanup;
- only then open the next multiplayer frontier, with 3+ players an early desired capability.

## Guardrail

The goal is not perfection. The current foundation has reached the point where remaining architectural limitations are identifiable future work rather than evidence that the basic two-player multiplayer core is untrustworthy. The only open factual question in this closure is whether the final delivered UI repair behaves correctly on the Owner's real devices.
