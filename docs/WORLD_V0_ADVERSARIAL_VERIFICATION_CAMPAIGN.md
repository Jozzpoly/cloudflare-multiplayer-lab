# World V0 — Pre-Owner Adversarial Verification Campaign

Status: **ACTIVE / PRODUCT-CHALLENGING VERIFICATION**  
Date: **2026-09-10**  
Audit branch: `world-v0-foundation-adversarial-verification`  
Frozen product under test: `fef4a2a4b6007c3e42cbd3b430cb9943343cc970`

## Purpose

This is the deliberate broad challenge pass before the next Owner test. It is not a feature phase and it is not the later cleanup/refinement phase.

The goal is to try to falsify the current two-player foundation after the stabilization work, especially by composing previously separate lifecycle boundaries. A green result must mean more than “the same unit tests passed again”.

## Separation of phases

1. **Challenge / verify / validate now.** Search for new failure classes, race conditions, misleading evidence and hidden coupling.
2. **Repair / polish / simplify afterward.** Only failures or clearly justified debt discovered by phase 1 may drive product changes.
3. **Then cleanup / documentation / safe-stop consolidation.** Canonical docs, workflows, branches and provenance are updated only after the resulting product is stable again.

No 3+ player architecture, new gameplay feature, persistence system or broad repository cleanup is authorized inside this campaign.

## Product invariants under attack

### A. Ordinary healthy 2P play

- exact-state guard remains clean;
- bounded corrections/replay remain operational;
- no unexplained authority-silence recovery under healthy local conditions;
- one departing peer does not interrupt the survivor merely because the roster changed.

### B. ActorSession continuity

- same-owner live takeover/F5 preserves WorldEpoch + ActorSession + NetEntity;
- close/reopen Resume preserves exact identity while the authority still owns the epoch;
- another profile cannot steal private resume authority;
- directory uncertainty cannot silently turn a private Resume into a fresh destructive admission.

### C. Capacity and room lifecycle

- zero connected humans do not indefinitely own public capacity;
- protected reconnect remains protected;
- soft reservation becomes replaceable only after its intended boundary;
- repeated cross-Yard history cannot exhaust Yard 1/2/3;
- stale tokens cannot reclaim a replacement epoch.

### D. Authority process/epoch loss

- a normal transport loss with the old authority alive stays on exact ActorSession resume;
- a positively proven lost authority epoch falls back to a fresh round in the same logical Yard instead of exhausting the stale token;
- both peers losing authority simultaneously converge to one replacement epoch;
- repeated authority-loss recoveries must not accumulate stale recovery state.

### E. UI / input / evidence truth

- physical W/A/S/D typing remains owned by focused text input;
- join failure messages do not call capacity failure “network failure” or vice versa when evidence can distinguish them;
- evidence fields do not misleadingly carry stale epoch-scoped values into a new epoch;
- desktop/mobile-shaped browser presentation does not change lifecycle semantics.

## Campaign structure

### Pass 1 — broad local regression composition

Run the existing strong causal gates together on one exact product head, including live rebound, soft preemption, prestart vacancy, cross-page/direct Resume, directory-outage controls, join-failure clarity, keyboard input and the full historical Current Validation envelope.

### Pass 2 — repeated recovery stress

Run authority-process-loss recovery multiple times, not once, and verify every cycle creates a new shared epoch without runtime failure or exact-state mismatch.

### Pass 3 — public-room exhaustion/churn

Exercise all canonical Yards with persistent browser profiles so resumable history accumulates deliberately. Verify a third profile can still obtain vacant capacity and that retired local history stops authorizing old epochs.

### Pass 4 — visibility/background boundary

Where the browser apparatus can reproduce it reliably, combine authority/transport recovery with a hidden/background page and verify recovery is deferred or resumed without converting into fatal state.

### Pass 5 — remote random-DO repetition

Use only non-public random run keys on the already isolated qualified Worker. Do not touch fixed human Yard 1/2/3 from GitHub-hosted runners. Repeat the resumed-stayer and long lifecycle paths across fresh remote Durable Objects to separate local Workerd success from Cloudflare runtime behavior.

## Stop condition

The verification phase is complete when:

- all planned independent gates have a stable classification;
- any failures are reduced to a small causal set rather than a growing list of symptoms;
- further repetition is no longer producing materially new evidence;
- the remaining debt is concrete enough to hand to the repair/polish phase.

A failure is useful evidence. Do not weaken a gate merely to turn it green.
