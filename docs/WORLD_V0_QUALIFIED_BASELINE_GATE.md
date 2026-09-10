# World V0 — Qualified Baseline Gate

Status: **FINAL OWNER REQUALIFICATION PENDING**  
Updated: **2026-09-10**  
Current product source: `fef4a2a4b6007c3e42cbd3b430cb9943343cc970`  
Qualified-play environment: `cloudflare-multiplayer-lab-qualified-play`

## Purpose

This is the final human gate for the current two-player foundation before safe stop. It no longer describes only the old post-R2 baseline: it includes the September stabilization work around public capacity, same-owner live rebound, error clarity and bounded recovery when an in-memory authority WorldEpoch is genuinely gone.

The target is still not a new product frontier. It is a trustworthy ordinary two-player Shared Yard baseline.

## Current delivered specimen

Owner URL:

`https://cloudflare-multiplayer-lab-qualified-play.jozzpoly.workers.dev/world-v0/`

Exact product commit:

`fef4a2a4b6007c3e42cbd3b430cb9943343cc970`

Delivery:

- run `34426803131` / job `102713664761` — **SUCCESS**;
- Cloudflare Version ID `d62c2e72-c4d9-4124-8847-85815d715ff1`;
- artifact `10132969847`;
- digest `sha256:0abc40bf613c7e503d4084f2eeac08475b56404dee5d66b0e617ec948fdf4639`.

The delivery workflow proved protected product bytes were identical to `fef4a2a4...` and did not instantiate/probe the human public Yard Durable Objects.

## Automated evidence already earned

The current product has already passed:

- focused post-promotion authority-loss/ordinary-outage requalification — run `34426373914`;
- full historical Current Validation — run `34426331772`;
- broad adversarial verification — run `34428181101`, **8/8 jobs success**;
- Resume-vs-fresh authority race — run `34428538218`, **SUCCESS**.

The broad campaign added coverage beyond the old baseline:

- three repeated authority-process losses in one browser pair;
- background-hidden peer during authority loss;
- retained-history pressure across Yard 1/2/3;
- four fresh remote Cloudflare Durable Objects;
- same-owner live rebound;
- physical W/A/S/D text-entry ownership;
- protected -> soft -> demand-driven epoch handoff;
- zero-online capacity release;
- resumed-stayer handoff composition;
- direct-link Resume and directory-outage fail-closed behavior.

No new product blocker was found in the broad campaign.

## What the Owner gate must judge

This remains primarily a human/product gate. Automated green evidence does not replace natural play.

PASS requires the combined experience to be good enough that remaining defects are bounded debt rather than reasons to distrust the multiplayer foundation.

Judge especially:

- ordinary two-device foreground play is broadly smooth and stable;
- movement, shared props and jump remain usable and responsive;
- exact same-profile F5/live takeover works without an artificial full-room rejection;
- close-tab -> ordinary room-list reopen / Resume works while continuity still exists;
- a dormant history does not permanently own Yard capacity;
- after the protected window, another player can take needed capacity through the intentional fresh-epoch handoff;
- a retired old profile cannot steal the replacement session;
- cycling between Yards does not accumulate permanent blockers;
- W/A/S/D can be typed normally into the callsign field;
- join/capacity/lifecycle/network messages are materially distinguishable;
- mobile movement/jump, background/foreground and close/reopen behavior are representative enough to trust the baseline;
- `runtimeFailed = false` in ordinary successful play;
- exact state-guard mismatches remain `0`;
- normal foreground play does not exhibit recurring recovery churn.

## Authority loss versus ordinary transport loss

A key new distinction is now part of the candidate:

### Old epoch still alive

If an abnormal transport loss occurs and authority still reports the same WorldEpoch, the browser keeps exact ActorSession recovery and exact rebase semantics.

### Old epoch positively gone

If exact resume fails and reachable authority-backed room evidence proves the source WorldEpoch no longer exists, the browser abandons the dead private token and fresh-joins the same logical Yard. Both peers should converge on one replacement epoch instead of eventually reaching `actor_session_resume_exhausted`.

### Authority state uncertain

If the directory cannot establish whether the source epoch still exists, uncertainty is not permission to destroy continuity. The client remains fail-closed to the existing bounded exact-resume path.

This is service/play continuity after authority loss; it does not reconstruct the lost physical world.

## Practical Owner run

Use ordinary natural play rather than following a laboratory script too literally. A useful hostile run should still include, when convenient:

1. type a callsign containing `W`, `A`, `S`, `D`;
2. join the same Yard from two independent profiles/devices and play for a while;
3. F5 or reopen the same profile while the pair is live;
4. close one peer and observe protected reservation first, then capacity becoming available later;
5. let a third profile take the available seat and judge the brief intentional epoch reset/recovery;
6. try returning with the displaced old profile;
7. cycle between Yard 1/2/3 enough to look for capacity leaks;
8. do representative mobile play including background/foreground and close/reopen;
9. continue playing through odd transitions instead of stopping immediately, so recovery behavior itself is exercised;
10. capture video and copy Diagnostics/evidence from both sides if a suspicious transition occurs.

## PASS / FAIL interpretation

### PASS

The two-player foundation is stable enough to freeze when:

- natural Owner play is broadly smooth and comprehensible;
- lifecycle operations recover or fail in the intended bounded way;
- no new recurring blocker appears;
- exact-state evidence stays clean;
- remaining imperfections are small controller/presentation/feel debt.

### FAIL

Do not open the next feature frontier if the Owner still sees a reproducible foundation defect such as:

- recurrent simultaneous disconnect/recovery failure;
- a Yard becoming permanently unavailable because of dormant history;
- same-owner F5 unable to recover a valid ActorSession;
- stale identity stealing an active replacement session;
- repeated low-latency recovery churn during ordinary foreground play;
- nonzero exact-state guard mismatches;
- mobile behavior that materially contradicts the desktop foundation contract.

Classify the failure before changing runtime.

## What PASS earns

PASS earns a deliberate safe stop, not immediate 3+ player implementation.

After PASS:

- freeze exact runtime/product and evidence anchors;
- refresh canonical Current State / takeover docs;
- retire consumed one-shot validation apparatus while preserving decisive evidence;
- perform controlled branch archaeology and cleanup;
- then review Project Soul / repository role and formalize the next multiplayer era.

The current preliminary long-horizon direction remains that this repository may become a long-lived multiplayer systems laboratory / reusable multiplayer core, with 3+ players an early post-cleanup capability target. That direction is not made canonical by this gate alone.
