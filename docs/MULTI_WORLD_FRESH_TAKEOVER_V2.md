# Multi_World — Fresh Takeover V2

Status: **READY FOR NEW CONVERSATION / R0d HUMAN RELIABILITY GATE NEXT**  
Prepared: **2026-09-07**

Use this as the startup mandate for the next Browser ChatGPT conversation.

---

# START TAKEOVER MANDATE

Take over **Multi_World** as a fresh execution continuation.

Repository:

`Jozzpoly/cloudflare-multiplayer-lab`

The project is currently at a deliberately narrow boundary: the Multiplayer Reliability Foundation I1–I4 has finished machine qualification and the next evidence must be an Owner real-device R0d reliability re-test.

Do not restart broad research, add features or rerun old synthetic campaigns unless compact live verification finds a contradiction.

## 1. Verify exact live anchors first

### Qualified product + reliability source

Branch:

`world-v0-multiplayer-foundation-integration`

Expected frozen head:

`a2e821afbbc88371b033af311cc6882d46aa6916`

### Isolated R0d delivery specimen

Branch:

`world-v0-r0d-reliability-retest`

Expected frozen head:

`7da9ddd4ad37221f63a3cd418a140824783480ec`

Expected isolated Worker:

`cloudflare-multiplayer-lab-reliability-play`

Expected final remote qualification workflow:

`34060903778` — PASS

### Handoff docs branch

Branch:

`multi-world-r0d-reliability-handoff`

Its exact head may be newer than this document because handoff documentation was finalized after creating the branch. Verify live.

This docs branch is not runtime authority.

## 2. Read in this order

1. `docs/MULTI_WORLD_CURRENT_STATE.md`
2. `docs/WORLD_V0_R0D_RELIABILITY_RETEST_HANDOFF.md`
3. GitHub issue #8 comment `5558411044` — original R0d human continuity FAIL
4. GitHub issue #8 comment `5562283164` — final isolated remote machine gate GREEN
5. `docs/MULTI_WORLD_PROJECT_SOUL.md` only as needed to recover broader project intent

Older `MULTI_WORLD_GROUNDING_*`, `MULTI_WORLD_FRESH_TAKEOVER*`, A2R-era documents and early issue history are provenance, not the current frontier. Read them only if a live inconsistency requires deeper reconstruction.

## 3. Compact live verification only

Before asking the Owner to test, verify:

- the two frozen heads above still match;
- `7da9ddd...` is still a descendant of `a2e821...`;
- the diff from `a2e821...` to `7da9ddd...` still changes only the R0d workflow and isolated `wrangler.jsonc` delivery environment;
- workflow `34060903778` is still green;
- no newer issue #8 checkpoint supersedes the handoff;
- if directly accessible, isolated deployed provenance still identifies qualified source `a2e821...` and delivery `7da9ddd...`.

If all match, stop verification there. Do not rerun I1–I4 just to feel safer.

## 4. Current evidence you should inherit unless contradicted live

The first R0d real two-person/mobile-facing human test failed because one actor's short input starvation / socket loss could kill the shared WorldEpoch and force both clients through recovery/new epoch cycles.

Reliability I1–I4 changed that lifecycle model and passed remote qualification on the isolated Worker:

- I1: ActorSession survives transport loss; one actor failure does not globally kill the world;
- I2: newer future intent can supersede unconsumed older intent without rewriting consumed history;
- I3b: canonical input transport survives a clean 1200 ms rAF freeze;
- I4b: exact authority rebase resumes the same actor after a gap far beyond local history and input lease while a healthy peer/world continues.

Remote real-Chromium I4b observed a 1500 ms outage and a 170-tick rebase gap with `guardMismatches=0` while the healthy peer stayed live.

This is strong machine evidence, not a substitute for human judgement.

## 5. Do not be misled by the historical authority smoke

Run `34060727507` failed only because old `world-v0-authority-runtime-smoke.mjs` still required pre-I1 behavior:

`lease expiry -> epoch death -> socket close`

The new runtime correctly kept the epoch and sockets alive. That run had otherwise already shown clean authority traffic and exact shared guards.

Classification: stale apparatus contract, not runtime regression.

Do not make the runtime satisfy that old expectation.

## 6. Perform the Owner human re-test next

The Owner explicitly deferred the real test to this new conversation.

At test time generate a **new unique run ID that has never appeared in CI or an older human test**.

Use the isolated Worker deep link:

`https://cloudflare-multiplayer-lab-reliability-play.jozzpoly.workers.dev/world-v0/?run=<fresh-run-id>`

Do not use the normal fixed `yard-1/2/3` directory for this test.

Ordering:

1. Owner opens and enters the fresh run first from Poland.
2. Only once Owner is inside, share exactly the same URL with the second real device/person.
3. Play naturally for several minutes.
4. Then perform at most one or two natural continuity events: phone background/foreground, brief network interruption or leave/rejoin.

Primary human question:

> Is the previous product-blocking `live -> blank/recovery/waiting -> live` global continuity failure gone, with the healthy peer/world staying alive while the interrupted actor resumes into the existing world?

Useful evidence is welcome but do not turn the Owner into a telemetry operator. A short recording, Copy Evidence, RTT and qualitative judgement are enough when convenient. Do not repeat a clear result merely to recover a missing blob.

## 7. Classify before continuing

### If human reliability is substantially fixed

Record the exact Owner evidence, close the R0d reliability re-test and then reassess the project from the strongest real friction observed in play.

Do not automatically choose I5, jump, persistence or an old roadmap item.

### If continuity still fails

Preserve the exact failure sequence and isolate the smallest missing lifecycle/rebase contract. Do not jump immediately to a wholesale networking rewrite.

### If the specimen is invalid

Repair only the deployment/provenance/test boundary and rerun the smallest necessary gate.

## 8. Scope freeze until the human verdict

Do not start:

- I5;
- new reconciliation systems;
- new content or jump work;
- persistence;
- 3-player expansion;
- lobby/matchmaking redesign;
- generic networking framework work;
- broad refactoring/cleanup of the qualified runtime.

The current machine campaign is complete. Human evidence is the unresolved dependency.

## 9. Branch safety

Do not mutate:

- `world-v0-multiplayer-foundation-integration@a2e821...`;
- `world-v0-r0d-reliability-retest@7da9ddd...`;
- old R0/A2R controls merely to consolidate history.

The branch `world-v0-friend-ready-foundation-integration@5dd28a...` is an abandoned inert branch created during a mistaken ancestry hypothesis. It received no new commit and is not a frontier.

Use `multi-world-r0d-reliability-handoff` for handoff/reference documentation only.

## 10. First response expected in the new conversation

Give the Owner a compact state confirmation after live verification:

- whether anchors still match;
- whether remote machine gate is still valid;
- exact fresh human-test URL you generated;
- the one human question being tested;
- any material contradiction found.

If there is no contradiction, proceed directly to the Owner test rather than producing another long architecture review.

# END TAKEOVER MANDATE
