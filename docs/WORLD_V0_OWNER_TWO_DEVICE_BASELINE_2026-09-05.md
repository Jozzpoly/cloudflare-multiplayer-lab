# World V0 — Owner two-device real-device baseline

Date: **2026-09-05**
Status: **accepted real-device coherence evidence; not two-human social-play evidence**

## Test shape

The Owner ran the public Friend-Ready World V0 through the normal user path on two physical devices controlled by one person:

- desktop browser as the host;
- phone browser as the invited peer;
- invite copied through an ordinary Messenger flow;
- approximately 113 seconds of shared-world use;
- both clients moved, changed camera view and physically interacted with the same movable props;
- one peer then left and the remaining client observed the normal epoch termination path.

The Owner supplied synchronized screen recordings plus copied evidence snapshots from both devices. Those raw recordings/snapshots are conversation evidence and are not committed to this repository.

## Shared identity

Both snapshots reported the same:

- `WorldId`: `shared-yard-v0-jozz-v5-0904`;
- `WorldEpoch`: `62317b0f-189a-40f6-997a-f75beb0c4fa5`;
- `SimBuildId`: `shared-yard-v0-sim-579c7aa172198390`;
- UI revision: `shared-yard-v0-browser-ui-v8-friend-entry`;
- client simulation revision: `shared-yard-v0-browser-sim-v1`.

The recordings visibly corroborate host → invite → friend entry, `YOU` / `PEER` presence and shared physical consequences on the same props.

## Desktop evidence

End snapshot:

- boundary tick `6756`;
- `runtimeFailed=false`;
- guard matches `1125`;
- guard mismatches `0`;
- pending guards `0`;
- `firstStateMismatch=null`;
- lease expiry `0`;
- server rejected input `0`;
- remap failures `0`;
- RTT median about `14.2 ms`, p95 about `15.1 ms`;
- frame p95 about `4.3 ms`;
- max frame about `83.4 ms`, `2` recorded long frames;
- maximum rewind `7` ticks and maximum replay `10` steps;
- maximum correction wall time `3.5 ms`.

The session ended with `peer_left_restart_required`; the remaining client then observed clean WebSocket close code `1012`, marked as expected after epoch end.

## Phone evidence

Snapshot while still live:

- boundary tick `6631`;
- `runtimeFailed=false`;
- guard matches `1104`;
- guard mismatches `0`;
- pending guards `0`;
- `firstStateMismatch=null`;
- lease expiry `0`;
- server rejected input `0`;
- remap failures `0`;
- server-late count `7`;
- RTT median about `25.2 ms`, p95 about `83.3 ms`;
- frame p95 about `16.8 ms`;
- max frame `259 ms`, `27` recorded long frames;
- maximum rewind `12` ticks and maximum replay `17` steps;
- recorded maximum correction wall time `47.2 ms`.

The phone therefore showed materially rougher scheduling, frame timing and network/correction pressure than the desktop, while retaining exact-state agreement and continuing to play through more than 6600 simulation ticks.

## What this evidence demonstrates

Accepted claim:

> The current two-player Friend-Ready Shared Yard can complete its real host/invite/join path on a desktop plus a physical phone, sustain shared physical interaction for a multi-minute-order session, and preserve exact-state correctness under the observed device/network conditions.

This materially upgrades confidence over hosted-Chromium-only evidence. The multiplayer foundation has now been exercised on two real devices through the intended entry path.

## What it does NOT demonstrate

This run does **not** establish:

- two-human social presence or fun;
- friend onboarding quality when the second participant is unfamiliar with the project;
- reconnect/resume/persistence semantics;
- Android/mobile performance as generally qualified across devices;
- long-session thermal/background behavior;
- three- or four-player behavior;
- that current physical content is rich enough for sustained play.

One person controlled both devices, so social/product judgements that require two independent humans remain open.

## Product implication

The nearest technical unknown is no longer simply whether the current two-device shared-world loop can remain coherent on real hardware. The stronger open question is whether the shared physical world contains enough legible consequence, expressive interaction and emergent possibility to justify continued voluntary play with another human.

Do not respond by expanding transport/count/persistence merely because those are known exclusions. Prefer an isolated, bounded physical-play experiment that preserves the qualified Friend-Ready control and seeks a stronger shared cause → consequence loop.

The earlier `world-v0-playable-impact-lab-v0` may be mined as donor material, but it is not itself qualified product evidence and must not be promoted wholesale.

## Control after mobile input hardening

Immediately after this Owner test, the separately qualified `lostpointercapture` mobile-input hardening was materialized on top of the tested FR-A source:

`world-v0-friend-ready-v1@5dd28a899c4f60c9227f1eb93026f571ced733e3`

The change is limited to releasing joystick/gimbal state on `lostpointercapture` plus correcting the interaction-smoke gimbal release assertion. It does not change authority, protocol or `SimBuildId`.

Public delivery after exact-byte promotion:

`world-v0-staging-delivery@35902816a9bebe38b19d675267f8303ec32e6210`

Remote staging qualification:

- `33970892543` — PASS, including first-attempt remote exact-state;
- `33970892558` — PASS, independent provenance-bound public Friend Entry.

The Owner test itself was performed on the immediately preceding FR-A public build. Its shared-world correctness evidence remains applicable to that tested specimen; the post-test input hardening has independent machine qualification and must not be retroactively described as having been human-tested in this run.
