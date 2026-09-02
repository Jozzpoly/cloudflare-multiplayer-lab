# Multi_World — Current state

Status: **HANDOFF READY / ACTIVE FRONTIER = F1 CAUSAL-TIME FEASIBILITY, PRE-EXECUTION**  
Date: 2026-09-02

This file is the short operational entry point for continuing Multi_World. It does not replace issue #8 or the historical research PRs; it tells a fresh collaborator what is current, what is frozen evidence, and what must be verified live before writing code.

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
- T4 isolated history-repair checkpoint: archived PR #22 / `e4fb8ef62d89fc7a21b05b241f1abcb1c3eb6a3d`;
- T5 actor→shared-prop causal-relay checkpoint: archived PR #23 / `a4263565a1b39de35f93f85c5ada01d8ef9147e3`;
- newest durable mechanism checkpoint: issue #8 comment `5515389350`;
- active feasibility branch: `ws0-sync-history-feasibility-f1-causal-time@9f423983928b0f6798f4768bbb3b5bc9a05665ec`.

F1 apparatus commit: `09d3ea8e85f632ad8e6481ecec9fdc4743e13320`. The current head adds only maintenance workflow pruning. F1 has **no PR, no dedicated workflow, no run, no artifact and no qualified result yet**.

## 3. Product truth currently established

The first real simultaneous desktop+phone session proved two things at once:

- immediate full-local embodiment can feel clean and pleasant;
- full local worlds + delayed remote intent + zero reconciliation do **not** preserve one shared physical truth under natural coupled interaction.

The human failure was cumulative and product-significant: actor disagreement propagated through later contacts into materially different shared prop/world states.

PR #15 remains the clean human control. Do not add synchronization treatments to it casually.

## 4. Mechanism-selection evidence

The current research ladder is intentionally frozen as evidence:

- PR #16: direct player↔player contact is a proven causal amplifier;
- T0 / PR #18: deterministic Node tick-domain lab qualified and reproduced the contact failure without wall-clock scheduler noise;
- T1 / PR #19: fresh remote `position + rotation + linear velocity` is mechanically strong while self remains directly uncorrected;
- T2 / PR #20: realistic snapshot age is a dominant constraint; stale hard state and naive linear hard forecast damage active contact;
- T3 / PR #21: simple stale-target velocity convergence rejected; local-contact reconciliation suspension retained only as a useful ingredient;
- T4 / PR #22: history-aware late remote-input repair collapses the isolated contact fork in a favorable deterministic oracle;
- T5 / PR #23: the same history repair prevents the actor fork from cascading into a divergent shared dynamic prop where the no-history control does create material prop divergence.

These completed research PRs are now archived/closed while their branches, artifacts and bodies remain provenance. T5 ends the current question "does history mechanically help?" with a qualified **yes**. It does **not** earn a production rollback architecture.

## 5. Current frontier — causal-time feasibility

The important newly exposed problem is that the real protocol has three distinct time domains:

`self source tick → WAN uplink → authority apply tick → WAN downlink → peer receive tick`

The current real client sends `{seq, x, z}` without a physics/source tick. Authority applies input after network receipt. `peer_input` is forwarded afterward with sequence and server wall-clock time, not a canonical source physics tick.

T4/T5 used a deliberately favorable oracle in which the delayed remote transition could be replayed at source time and authority truth was compatible with that source-time history. Therefore they do **not** prove that client-only replay is sufficient in the real topology.

F1 exists to discriminate the minimum time/history contract before any browser rollback implementation. Its candidate contrasts are:

1. receipt-live — current class of behavior;
2. peer replay to authority-apply time;
3. peer replay to source time while authority remains receipt-time;
4. source-time repair on authority and clients.

The F1 script itself is **not evidence** until its design is re-audited, given one bounded dedicated workflow, run, artifact and explicit verdict.

## 6. What is not earned

Do not infer or implement by default:

- full-world generic rollback framework;
- custom Box3D fork;
- standalone save/restore reconstructed from transforms and called a physics snapshot;
- higher snapshot rate as a substitute for causal correctness;
- prediction/ownership/MMO architecture imported wholesale from donors;
- browser smoothing before physical truth is understood;
- a claim that the 5–7 cm self replacement seen in the T5 oracle is perceptually acceptable;
- deployment of research treatments onto PR #15 staging.

Exact dependency remains `box3d.js@0.1.1`. Its public bindings expose deterministic recording/replay/RecPlayer facilities, but no proven branchable world snapshot/restore contract for our required altered-history simulation. Treat implementation feasibility as open.

## 7. Repository hygiene contract

Long-term convention from this checkpoint:

- `main` remains the infrastructure control unless a separate promotion decision is made;
- historical research branches remain immutable provenance and are not cleaned by deleting evidence;
- completed research PRs are closed/archived rather than left apparently active;
- PR #15 remains intentionally open as the frozen human control;
- an open research PR should mean work is currently active;
- the active frontier carries ordinary `ci.yml` plus only workflows needed by the current experiment;
- F1 currently contains **only `ci.yml`** under `.github/workflows`; its eventual dedicated F1 workflow should be added only after design review;
- one-shot historical workflows remain on their frozen evidence branches instead of being inherited indefinitely;
- issue #8 is the chronological evidence ledger; this file is the short current-state map.

## 8. First action after takeover

1. Verify the anchors above live.
2. Inspect F1 head `9f423983...` and confirm `09d3ea8... → 9f423983...` changes only inherited workflow deletion.
3. Re-audit the F1 causal-time contracts against the actual `input → authority → peer_input` path.
4. If F1 is still the smallest discriminating falsifier, add only its dedicated workflow, run it and preserve artifact/provenance.
5. If F1's model is wrong, correct the experiment before execution.

Do not start browser/runtime history implementation until this causal-time feasibility gate has a qualified answer.
