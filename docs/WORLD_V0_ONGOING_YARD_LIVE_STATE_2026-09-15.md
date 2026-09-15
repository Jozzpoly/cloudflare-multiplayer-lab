# World V0 — Ongoing Yard live state

Status: **REMOTE STAGING CANDIDATE PASS / OWNER + FRIEND PLAY FRONTIER**  
Date: 2026-09-15  
Product branch: `world-v0-ongoing-yard`

## Why this exists

Multi_World is not trying to become a networking framework or an endless reliability campaign. The product direction is a small shared physical living world: a place that can already be there, that a person can inhabit immediately, and into which another person can later arrive and become part of the same shared physical reality.

The immediate product question was:

> Can one person enter a public Yard alone, immediately move and affect the physical world, while the Yard remains visibly live and joinable so a friend can later enter the same ongoing WorldEpoch without resetting the incumbent player's world or browser shell?

That question is now machine-grounded locally and remotely. The next uncertainty is human experience, not another protocol property.

## Candidate source

Fresh product line was created from canonical `main@031c092d38430c73ecf033c5244f62545db204e2` rather than merging a research branch.

The product candidate selectively adopts the already-qualified R0 lifecycle source for:

- World V0 authority/protocol dynamic `1 -> 2` topology;
- browser topology rebase / late-join bootstrap;
- exact topology-bound state guards.

The generalized `research/multiplayer-foundation-v1-2026-09-13` remains a research donor, not a blanket runtime dependency.

Normal canonical public Yards now opt into the ongoing lifecycle before the browser runtime loads. Private/noncanonical run links retain the old fixed-2P path as a control.

Public room directory semantics are deliberately narrow:

- an empty public Yard is enterable;
- an active R0 public Yard with one occupied slot is `Live` and joinable;
- a full two-player Yard is not opened beyond its capacity;
- active fixed-2P worlds do not silently inherit R0 late-join semantics.

The obsolete `Inspect solo` synthetic-auto-peer path is hidden from the normal ongoing-public-Yard flow rather than expanded into the new product model.

## Local product-flow qualification

Head: `278b33a7f7a24ff4675c99c37816c41d2205b733`  
Run: `34978308129`  
Job: `104411669339`  
Result: **SUCCESS**

Real Chromium executed the normal public-room experience rather than a direct protocol harness:

1. browser A opened ordinary `/world-v0/`;
2. A selected public `Yard 1` and entered alone;
3. A reached a live one-actor R0 world and moved physically;
4. the public room API exposed the Yard as `1/2`, `live`, `joinable`;
5. browser B opened ordinary `/world-v0/`, saw the live Yard and clicked it;
6. B joined the same running WorldEpoch;
7. A kept its ActorSession and browser document;
8. both browsers continued canonical input with exact state guards.

Representative evidence:

- solo A movement: `2.875521905169046 m`;
- topology after join: revision `2`;
- incumbent ActorSession preserved: `true`;
- incumbent document preserved: `true`;
- A authored inputs: `374`;
- B authored inputs: `86`;
- A exact guard matches / mismatches: `76 / 0`;
- B exact guard matches / mismatches: `23 / 0`.

The existing fixed-2P I4B browser recovery control passed on the same candidate, including same ActorSession/NetEntity recovery beyond retained history and input lease with zero exact-state mismatch.

Local evidence artifact:

- artifact ID: `10400710932`
- SHA-256: `39dfcfe46741c081c464f2e82f62c4802614446006b9c9293f6da98ec484089d`

## Remote staging qualification

Exact deployed source head:

`3d5168c27c1a79e9d2fab7c95f80b17565f44fbe`

Isolated target:

`cloudflare-multiplayer-lab-staging`

Cloudflare Version ID:

`7edca29d-af44-459a-8b11-103b290cf2a2`

Staging URL:

`https://cloudflare-multiplayer-lab-staging.jozzpoly.workers.dev`

Delivery + remote run:

- run `34978809899`;
- job `104413407284`;
- result **SUCCESS**;
- exact-head checkout PASS;
- staging/root target separation PASS;
- staging deployment guard PASS;
- dry-run PASS;
- public UI revision `shared-yard-v0-browser-ui-v21-ongoing-yard` observed after deploy;
- remote real-Chromium public-flow PASS.

Remote product-flow evidence:

- public directory: `occupancy=1`, `connected=1`, `state=live`, `joinable=true`;
- solo A movement: `2.539547205939651 m`;
- topology after friend join: revision `2`;
- same ongoing WorldEpoch: `true`;
- incumbent ActorSession preserved: `true`;
- incumbent browser document preserved: `true`;
- A authored inputs: `547`;
- B authored inputs: `88`;
- A exact guard matches / mismatches: `105 / 0`;
- B exact guard matches / mismatches: `25 / 0`;
- verdict: `WORLD_V0_ONGOING_YARD_PUBLIC_FLOW_PASS`.

Remote evidence artifact:

- artifact ID: `10399809553`;
- SHA-256: `2b3073242fa98cc304aac00c2083430aaf3a3b0aac355515540ca8e53f853e09`.

`main` and qualified-play were not modified or redeployed by this campaign.

## What is proven — and what is not

Proven for this bounded candidate:

- normal public-room entry can start as a genuinely playable one-human physical Yard;
- the room directory exposes that already-running Yard as live and joinable;
- a second fresh browser can enter through the same public-room UX;
- the second actor becomes part of the same WorldEpoch without replacing the incumbent browser/session;
- both players continue canonical physical simulation with exact state convergence;
- the old fixed-2P route remains available as a control.

Not proven or not claimed:

- that the experience feels good, alive, social, surprising or worth returning to;
- that another person's arrival is perceptually satisfying rather than merely technically correct;
- actor removal / replacement as a product lifecycle;
- 3+ product topology;
- persistent world reconstruction after authority loss;
- accounts, matchmaking, MMO infrastructure or persistence architecture;
- that this branch should already replace canonical `main`.

## Stop condition / next move

**Stop automated feature expansion here.**

Do not respond to this PASS by inventing another topology/reliability gate, adding 3+, persistence, replacement, broad foundation transplants or unrelated world systems.

The next high-value evidence is Owner / friend play on the deployed staging candidate.

The human test should be natural rather than ceremonial:

- enter a public Yard alone and play for a moment;
- have another real person enter from the shared room list later;
- continue playing rather than following a scripted checklist.

Observe primarily:

- whether entering alone feels like entering a world rather than entering a waiting state;
- whether the friend's arrival feels continuous and legible;
- whether the shared physical place immediately suggests anything worth doing together;
- any jank, confusion, artificiality or friction that naturally breaks the experience;
- any unexpected behavior or idea that is more interesting than the planned question.

After human evidence, classify findings into `MUST FIX`, `AMPLIFY`, `NEW PHENOMENON`, `RESEARCH QUESTION`, or `DEFER`, and let those findings choose the next implementation frontier.

The purpose of the preceding rigor was to make this kind of direct play safe and informative. It is not a reason to postpone it.