# Multi_World — Current state

Status: **HANDOFF READY / ACTIVE FRONTIER = F3 BOUNDED CHECKPOINT LATE-INPUT RESIM, PRE-EXECUTION**  
Date: 2026-09-02

This file is the short operational entry point for continuing Multi_World. It does not replace issue #8 or the historical research PRs; it tells a fresh collaborator what is current, what is frozen evidence, and what must be verified live before writing runtime code.

## 1. Authority order

For technical truth use, in order:

1. live repo / exact branch / exact SHA / current CI or deployment evidence;
2. newest qualified checkpoint in issue #8 and the corresponding research PR/artifact;
3. canonical project documents on `multi-world-takeover-grounding`;
4. older plans, takeover drafts and conversation history.

Plans are candidates, not commitments. Do not continue a numbered experiment merely because it exists.

## 2. Live anchors to verify first

- infrastructure control: `main@d5758bf18b5ebd5fb7ce5a705d525c80d3bca5de`;
- frozen desktop+mobile zero-reconciliation human control: PR #15 / `ws0-human-two-player-mobile-baseline@f6d6b2f275a0c097ab9ce1e26d86a9fa912391b1`;
- T5 actor→shared-prop causal-relay checkpoint: archived PR #23 / `a4263565a1b39de35f93f85c5ada01d8ef9147e3`;
- F1 causal-time checkpoint: archived PR #24 / `2872e7b3b5f369bbe9f7bfad7fcd555c9d16f710`; issue #8 comment `5516192962`;
- F2 bounded full-physics checkpoint feasibility: archived PR #25 / `1c6807f1562d832753a7514cd6d2c1ea0100c0a3`; issue #8 comment `5516336021`;
- active frontier branch: `ws0-sync-history-f3-bounded-resim`, created from exact F2 head `1c6807f1562d832753a7514cd6d2c1ea0100c0a3` and **pre-result** at this checkpoint.

Always verify these live. The active F3 branch has no qualified F3 result merely because it exists.

## 3. Product truth currently established

The first real simultaneous desktop+phone session proved two things at once:

- immediate full-local embodiment can feel clean and pleasant;
- full local worlds + delayed remote intent + zero reconciliation do **not** preserve one shared physical truth under natural coupled interaction.

The human failure was cumulative and product-significant: actor disagreement propagated through later contacts into materially different shared prop/world states.

PR #15 remains the clean human control. Do not add synchronization treatments to it casually.

## 4. Mechanism-selection evidence

The qualified research ladder is preserved as evidence:

- PR #16: direct player↔player contact is a proven causal amplifier;
- T0 / PR #18: deterministic Node tick-domain lab qualified and reproduced the contact failure without wall-clock scheduler noise;
- T1 / PR #19: fresh remote `position + rotation + linear velocity` is mechanically strong while self remains directly uncorrected;
- T2 / PR #20: realistic snapshot age is a dominant constraint; stale hard state and naive linear hard forecast damage active contact;
- T3 / PR #21: simple stale-target velocity convergence rejected; local-contact reconciliation suspension retained only as a useful ingredient;
- T4 / PR #22: history-aware late remote-input repair collapses the isolated contact fork in a favorable deterministic oracle;
- T5 / PR #23: the same history repair prevents the actor fork from cascading into a divergent shared dynamic prop where the no-history control does create material prop divergence;
- F1 / PR #24: a **common canonical event timeline** is required; repairing only the remote actor is structurally insufficient. Both authority-time and source-time common histories are mechanically coherent, but they place WAN-delay cost differently;
- F2 / PR #25: exact `box3d.js@0.1.1` already exposes enough recording/replay machinery for a bounded, branchable, rolling **full-physics checkpoint** path, including active-contact fidelity and generational ownership handoff.

Completed research PRs are closed/archived, unmerged, while their branches, artifacts and PR bodies remain provenance.

## 5. F1 qualified causal-time result

The real protocol has distinct time domains:

`self source time → WAN uplink → authority receipt/apply tick → WAN downlink → peer receipt`

Current `input` carries `{seq, x, z}` without a physics/source tick. Authority applies input after receipt. Current `peer_input` carries no canonical source physics tick or authoritative apply tick.

F1 compared five bounded policies after correcting the original design to include a missing production-relevant `all-authority-tick` family.

Qualified interpretation:

- `receipt-live` diverges strongly;
- repairing only the remote actor, even to authority-apply time, leaves mixed histories and persistent disagreement;
- peer-only source-time repair can make peers agree while authority remains on a different transient physical history;
- `all-authority-tick` can converge to one authority-time history with a forward-only server, but the isolated lab required roughly **0.38 m / 0.50 m** maximum local-self replacement at 65/85 ms one-way delay;
- `all-source` also converges to one history while requiring authority-side history repair, with roughly **0.013 m / 0.016 m** isolated F1 local-self replacement; coupled T5 remains the stronger presentation-cost evidence at roughly **0.050 m / 0.068 m**.

Therefore source-time canonical history is the current favored family for local continuity, **not a final architecture decision**. F1 does not prove authority-time presentation impossible and does not prove source-time authority rollback cheap.

## 6. F2 qualified checkpoint result

Exact dependency remains `box3d.js@0.1.1`. F2 verified the actual JS binding and pinned Box3D implementation rather than assuming upstream API surface.

The binding exposes recording/replay facilities including recording start/stop, recording size, replay-player creation, backward seek and access to the replay-owned world. It does not expose a standalone raw snapshot API or the upstream keyframe-policy controls.

The bounded F2 probes nevertheless established:

1. **branchability** — after backward seek, ordinary `b3World_Step` on `b3RecPlayer_GetWorldId()` matched replay continuation with exact measured body-state delta `0`; a deliberate body mutation then produced a stable distinct branch;
2. **rolling active-contact seeds** — a recording started while measured body-contact records were present restored both its seed and its later state with exact measured delta `0` in the lab; small-scene seeds were about 18 KB and incremental recording cost about 47–61 B/frame;
3. **generation handoff** — a corrected replay-owned world can start a fresh recording, create a new replay-player/world generation, then survive destruction of the old owner while remaining normally step-able.

This removes two previously assumed requirements from the current path: replay from the beginning of the session and public-body-state reconstruction are **not required** merely to obtain a recent complete physics checkpoint.

It does **not** prove production CPU/memory cost, final checkpoint cadence, protocol semantics, or application-level entity-ID remapping.

## 7. Current frontier — F3 bounded checkpoint late-input resimulation

F3 is the smallest next discriminating gate because F1 selected a common-history requirement and F2 established a plausible complete-history substrate, but those two results have not yet been joined on the actual qualified causal problem.

F3 should replace the old T4/T5 replay-from-global-seed oracle with:

- recent rolling recording checkpoints;
- finite host input/event history;
- restoration of the complete physical world from a recent checkpoint;
- branch at the causal source tick;
- bounded replay only to current time;
- generational handoff after correction.

At the qualified 65/85 ms one-way envelope, require evidence that the bounded mechanism reaches the same causal truth as the T4/T5 source-time oracle through player contact and later shared-matter relay. Record replay span, checkpoint bytes and ownership rotations.

Do not treat a script or branch as F3 evidence until the design is audited and an exact-head dedicated workflow/run/artifact plus standard CI support an explicit verdict.

## 8. What is not earned

Do not infer or implement by default:

- browser/server production rollback framework;
- final synchronization protocol or trusted client timestamp/tick semantics;
- final checkpoint cadence, retention horizon or memory budget;
- application entity-ID remapping across world generations;
- custom Box3D fork;
- causal-subset rewind;
- higher snapshot rate as a substitute for causal correctness;
- browser smoothing before physical truth and correction placement are understood;
- a claim that source-time authority history repair is production-cheap;
- a claim that authority-time common history is unusable;
- deployment of research treatments onto PR #15 staging.

## 9. Repository hygiene contract

- `main` remains the infrastructure control unless a separate promotion decision is made;
- historical research branches remain immutable provenance and are not cleaned by deleting evidence;
- completed research PRs are closed/archived and remain unmerged unless a separate promotion decision exists;
- PR #15 remains intentionally open as the frozen human control;
- an open research PR should mean work is currently active;
- the active frontier carries ordinary `ci.yml` plus only workflows needed by the current experiment;
- one-shot historical workflows remain on their frozen evidence branches instead of being inherited indefinitely;
- issue #8 is the chronological evidence ledger; this file is the short current-state map.

## 10. First action after takeover

1. Verify the live anchors above, especially the newest issue #8 checkpoint and active F3 head.
2. Read the exact qualified T5 causal-relay apparatus and F2 checkpoint/lifecycle probes.
3. Re-audit the F3 bounded-resim contract, including checkpoint tick semantics, event ordering, full-world body remapping and correction ownership lifecycle.
4. If the design remains the smallest honest test, add one bounded F3 apparatus and dedicated workflow; preserve exact-head artifact/provenance.
5. Only after F3 qualifies should browser/runtime history integration become a candidate frontier.

Do not start browser/runtime rollback merely because F1 and F2 are individually positive.