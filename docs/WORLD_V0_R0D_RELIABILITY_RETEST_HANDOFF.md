# World V0 — R0d Reliability Re-test Handoff

Status: **MACHINE GATE CLOSED GREEN / OWNER HUMAN RE-TEST PENDING**  
Prepared: **2026-09-07**

This is the execution handoff for the exact next human gate. It is intentionally narrower than the full Multi_World history.

Read `MULTI_WORLD_CURRENT_STATE.md` first. Use GitHub issue #8 as the deeper evidence ledger.

---

## 1. Why this re-test exists

The first real R0d two-person/mobile-facing run on 2026-09-06 falsified the previous lifecycle model.

Observed product behavior repeatedly cycled through live play, blank/recovery/waiting, then live again during ordinary use.

Retained evidence showed an `input_lease_expired` event causing a new `worldEpoch`. The code path confirmed the underlying model:

- input lease: 36 ticks at 60 Hz = 600 ms;
- one actor reaching lease expiry could call global `endEpoch()`;
- peer socket close/error could also end the whole epoch;
- joining/resuming an already-running world was not supported;
- canonical input production depended on render-frame stepping.

The problem was therefore not simply "lease too short". Transport lifetime, actor lifetime and world lifetime were coupled incorrectly.

Issue #8 preserved that failure in comment `5558411044`.

---

## 2. Reliability campaign response

The project froze further content/jump/persistence work and performed a bounded Multiplayer Reliability Foundation campaign.

### I1 — ActorSession / transport separation

Goal:

- world epoch != one WebSocket lifetime;
- short starvation neutralizes/degrades one actor rather than killing everyone;
- peer socket loss leaves the world and healthy peer alive;
- stable logical actor identity survives transport rebind;
- same-actor resume token provides reconnect authority.

Qualified result:

- ActorSession is keyed independently of socket;
- session identity and network entity remain stable across reconnect;
- a new socket can rebind the same session;
- one actor lease expiry no longer globally ends the epoch;
- bounded cleanup remains when no connected actors survive beyond the lease boundary.

### I2 — Future intent supersession

Goal:

Allow a newer batch to correct an unconsumed future tick without rewriting already-consumed history.

Qualified result:

- higher/newer batch authority can supersede still-future unconsumed intent;
- consumed history remains immutable;
- stale/late/duplicate semantics remain bounded;
- peer relay follows the updated future intent.

### I3/I3b — rAF-independent canonical input transport

Goal:

Do not allow browser render suspension to stop the canonical input transport clock and accidentally create authority starvation.

Qualified result:

- canonical input production/transport has a temporal floor independent from `requestAnimationFrame()`;
- clean real-Chromium freeze campaigns can survive a 1200 ms isolated rAF stop without recovery contamination.

### I4/I4b — exact authority seed/rebase after long gap

Goal:

A resumed actor must be able to rejoin the already-running authoritative world even when the outage exceeds the retained local replay/history horizon.

Qualified result:

- server provides an exact full-state authoritative seed;
- resumed browser can discard an insufficient local timeline and rebase from exact authority;
- healthy peer/world continue during the absent actor gap;
- exact F32 state guard proves no hidden mismatch after rebase.

---

## 3. Exact source and delivery

### Product + reliability source

Branch:

`world-v0-multiplayer-foundation-integration`

Head:

`a2e821afbbc88371b033af311cc6882d46aa6916`

Treat this as the frozen runtime control for the re-test.

### Isolated human-test delivery

Branch:

`world-v0-r0d-reliability-retest`

Head:

`7da9ddd4ad37221f63a3cd418a140824783480ec`

Worker:

`https://cloudflare-multiplayer-lab-reliability-play.jozzpoly.workers.dev`

The delivery branch is a direct descendant of `a2e821...` and differs only in:

- `.github/workflows/world-v0-r0d-reliability-retest.yml`;
- `wrangler.jsonc`, adding the isolated `reliability_play` Worker/DO target.

No qualified World V0 product/runtime bytes differ.

Do not replace this with `cloudflare-multiplayer-lab-staging` just because that staging Worker already exists. Isolation is part of the evidence contract.

---

## 4. Final machine gate

Workflow run:

`34060903778`

Result:

**PASS**

The workflow performed, in order:

1. exact ancestry/runtime-byte guard;
2. full `npm run check`;
3. isolated environment contract validation;
4. isolated Wrangler dry run;
5. deployment only to `cloudflare-multiplayer-lab-reliability-play`;
6. exact deployed provenance check;
7. remote I1 ActorSession continuity probe;
8. remote I2 supersession probe;
9. remote I3b real-Chromium clean campaign;
10. remote I4b exact authority + real-Chromium rebase gate.

All final gates passed.

### Remote I1 key evidence

Verdict:

`WORLD_V0_INTEGRATION_I1_SERVER_SESSION_PASS`

Proved on real Worker/DO/WebSocket path:

- one peer transport drop did not kill world;
- healthy peer stayed alive;
- same `worldEpoch` survived the single drop;
- same `sessionId` and `netEntityId` survived rebind;
- resumed canonical input observed;
- cleanup occurred only after all peers were absent long enough.

### Remote I2 key evidence

Verdict:

`WORLD_V0_INTEGRATION_I2_REAL_DO_WEBSOCKET_PASS`

- newest future intent wins before consumption;
- stale authority cannot rewind;
- consumed history remains immutable;
- relay classification remains bounded.

### Remote I3b key evidence

Verdict:

`WORLD_V0_I3B_CLEAN_CAMPAIGN_PASS`

- clean result obtained attempt 1;
- 1200 ms rAF freeze;
- no recovery contamination;
- no post-freeze drain invalidation.

### Remote I4b key evidence

Authority probe:

- same ActorSession across rebind;
- drop `B91`;
- lease crossed `B136`;
- exact rebase `B141` after 50 ticks;
- fresh continuation `B150`.

Real-Chromium outage:

- 1500 ms controlled offline interval;
- source `B219`;
- healthy peer progressed to `B318` while actor absent;
- resumed browser exact rebase `B389`;
- 170 tick gap;
- local history retain = 24 ticks;
- input lease = 36 ticks;
- `guardMismatches=0`;
- `firstStateMismatch=null`;
- healthy peer still exact/live through `B428`.

Verdict:

`WORLD_V0_INTEGRATION_I4B_REAL_CHROMIUM_EXACT_REBASE_PASS`

---

## 5. Stale authority smoke — do not misclassify

The first isolated workflow run `34060727507` failed because the historical authority runtime smoke still expected the old lifecycle:

`lease_expired -> world_v0_epoch_ended -> both sockets close`

That expectation is precisely what I1 rejected.

Before timing out, the remote runtime already showed healthy authority behavior:

- both peers `120/120` accepted;
- zero late;
- zero rejected;
- all 120 relayed;
- all 120 fresh self/remote consumed;
- 245 shared exact guard samples;
- meaningful shared prop displacement;
- lease-expired consumption repeatedly observed;
- epoch remained alive;
- sockets remained alive.

Classification:

**test apparatus contract mismatch, not runtime failure.**

The final workflow correctly uses the I1–I4 current contract instead.

Do not revive this smoke as an acceptance gate unless it is explicitly rewritten to test the new semantics rather than epoch death.

---

## 6. Geography / room placement evidence boundary

The original public R0d human run reported stable RTT around 173 ms from Poland.

A strong hypothesis is that the fixed public `yard-1/2/3` Durable Objects were first materialized by GitHub-hosted remote qualification from a US Azure runner because the public room directory status checks touched every fixed room ID.

This is not direct proof of the exact Cloudflare datacenter.

For the reliability re-test the project therefore avoids the fixed room directory entirely.

Machine gates on `cloudflare-multiplayer-lab-reliability-play` used CI-only unique run IDs. They did not pre-touch the Owner's future human run ID.

The human test must preserve that isolation by creating a new unique deep-link run at the moment of testing.

---

## 7. Human re-test procedure

### Before the Owner opens anything

Fresh conversation should first perform only compact live verification:

- `world-v0-multiplayer-foundation-integration` still equals `a2e821...`;
- `world-v0-r0d-reliability-retest` still equals `7da9ddd...`;
- final workflow `34060903778` remains green;
- delivery diff still contains no product/runtime changes;
- isolated Worker provenance still points to qualified source `a2e821...` and delivery `7da9ddd...` if directly verifiable.

If those checks match, do not rerun the full machine campaign.

### Generate a fresh run

Create a new high-entropy human-only ID in the conversation, for example:

`r0d-pl-<fresh-random-suffix>`

Do not use a run ID from an older conversation or any CI log.

Build the exact URL:

`https://cloudflare-multiplayer-lab-reliability-play.jozzpoly.workers.dev/world-v0/?run=<fresh-run-id>`

### Entry order

1. Owner in Poland opens and enters first.
2. Wait until the Owner is actually in the world.
3. Share the exact same URL to the second real device/person.
4. Second person joins.

The point is not secrecy; the point is preventing a remote machine from becoming the first Durable Object accessor for this run.

### Natural play first

Do not begin with adversarial failure injection.

Spend a few minutes simply:

- moving;
- rotating camera;
- interacting physically with shared props;
- observing the other player;
- noticing whether the world stays continuously live.

### Then one bounded continuity disturbance

One or two natural events are enough:

- temporarily switch the phone to another app and return;
- briefly background/foreground the browser;
- short network interruption;
- one player leaves/rejoins.

Do not stack many failure modes into one ambiguous run.

### Primary judgement

Compare directly with the original failure:

> Does ordinary play still repeatedly collapse into blank/recovery/waiting/new-live cycles, or does the other player/world remain continuous while the interrupted actor resumes into the existing world?

### Useful evidence if convenient

- short screen recording;
- Copy Evidence from one or both clients;
- observed RTT;
- rough timing/context of any visible interruption;
- Owner qualitative judgement.

Missing evidence is not a reason to repeat a clear human result.

---

## 8. Result classification

### PASS candidate

A human PASS is justified if the original lifecycle failure is no longer observed in ordinary play and a bounded real interruption demonstrates that:

- healthy peer/world remain continuous;
- returning actor resumes without global epoch death;
- no repeated recovery-loop dominates the experience.

Minor presentation discontinuity on the returning actor may still become a later refinement question; do not require perceptual perfection to recognize that the global lifecycle model was fixed.

### FAIL

If the old disruptive cycle still appears, preserve:

- exact visible sequence;
- whether only returning actor or both players/world reset;
- any evidence reason/event;
- whether it was associated with backgrounding, network loss, or ordinary uninterrupted play.

Then isolate the smallest missing contract. Do not jump directly to a wholesale networking rewrite.

### INVALID / apparatus

Only classify the test invalid if the specimen itself is wrong, for example:

- branch/deployment provenance mismatch;
- second client actually entered a different run;
- worker unreachable or stale asset delivery;
- evidence clearly shows an unrelated deployment failure before the lifecycle question is exercised.

Do not use ordinary roughness or imperfect controls as an excuse to avoid a meaningful continuity verdict.

---

## 9. Stop conditions

Before human evidence, do not start:

- I5;
- new content;
- jump work;
- persistence;
- 3-player support;
- broader reconciliation architecture;
- generic networking framework work;
- unrelated cleanup.

Machine qualification has already reached its natural boundary.

After the human verdict, choose the next move from the strongest observed real friction rather than automatically returning to an old roadmap.

---

## 10. Canonical references

Repo:

`Jozzpoly/cloudflare-multiplayer-lab`

Issue:

`#8 — World Slice 0: embodied shared 3D place`

Key comments:

- `5558411044` — first R0d human gate FAIL / lifecycle model falsified;
- `5562283164` — isolated remote machine reliability re-test GREEN.

Current state:

`docs/MULTI_WORLD_CURRENT_STATE.md`

Fresh takeover mandate:

`docs/MULTI_WORLD_FRESH_TAKEOVER_V2.md`
