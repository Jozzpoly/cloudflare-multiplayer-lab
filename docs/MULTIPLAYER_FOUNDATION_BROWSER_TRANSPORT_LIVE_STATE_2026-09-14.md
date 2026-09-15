# Multiplayer Foundation — browser / transport live state

Status: **RESEARCH / SCOPED AUTOMATED FOUNDATION + LOCAL LIFECYCLE COMPOSITION PASS / NOT PRODUCT QUALIFIED**  
Date: 2026-09-15  
Branch: `research/multiplayer-foundation-v1-2026-09-13`  
PR: #51

This is the current source of truth for the isolated browser / transport Multiplayer Foundation campaign. Older checkpoint descriptions remain useful provenance, but should not override the live conclusions below. The separate recovery branch remains authoritative for real deployed Cloudflare restart / hibernation evidence.

## Live truth

The research line now has executed evidence for one bounded dynamic multiplayer authority that composes:

- stable ActorSession / ActorId identity with dynamic `self + 0..N remotes` projection;
- real Chromium hydration from Box3D recording seeds;
- real local Cloudflare `wrangler/workerd` Durable Object + WebSockets;
- dynamic membership `1 → 2 → 3` and earlier wider-topology / late-join browser evidence;
- authority-authored canonical input commits for three simultaneous non-zero client input streams;
- shared actor / prop physical interaction with exact browser-authority convergence;
- controlled transport detach + resume of one ActorSession without identity replacement;
- Durable Object hibernation and constructor re-entry while live socket bindings survive;
- durable exact checkpoint recovery;
- arbitrary-progress recovery where accepted future inputs live in a bounded progress overlay above an older exact physics checkpoint;
- exact continuation after that mid-progress hibernation;
- a second hibernation after the resulting final checkpoint, proving that the final Recording seed itself reconstructs the exact durable authority boundary.

The qualified fixed-2P World V0 on `main` remains untouched reference evidence. This research branch is not yet product authority.

## Evidence ladder

### Gate 5 browser / transport foundation

Earlier checkpoints established, in order:

- alternate-self late join and wider dynamic browser topology;
- typed fail-closed replication protocol;
- real local DO / WebSocket / three-Chromium transport;
- live Box3D authority plus browser seed hydration;
- authority-authored canonical input fan-out;
- repeated 60-tick exact convergence under three distinct non-zero input streams and measurable shared prop interaction.

The last clean-path 3-client interactive specimen reached:

- topology revision `3`;
- topology digest `e6cce2820eb5cc3c`;
- `12` input batches;
- `180` authority-accepted canonical records;
- `180` committed canonical records;
- `36` recipient-bound commit messages;
- maximum horizontal prop displacement `0.06361874507046983 m`;
- exact browser / authority convergence through canonical tick `63`.

### Reconnect + hibernation control: PASS / scoped

A real Chromium reconnect / hibernation control proved that one ActorSession can detach and resume without ActorId replacement while the other clients remain live, and that the workerd Durable Object can hibernate / reconstruct and still reach exact convergence at tick `63`.

Representative passing evidence:

- research head `5a66479e019fe675ac92167e53aea376a766992c`;
- Actions run `34879196382`;
- job `104178399317`;
- marker `MULTIPLAYER_FOUNDATION_HIBERNATION_RECOVERY_RECONNECT_PASS`.

That control produced final Recording provenance `35153 B / b98daa7d`.

### Arbitrary-progress hibernation recovery: PASS / scoped

Canonical semantic gate head:

`3f3ee3bcd5f259923b3a3f0d1fccc7c7e8c5f5b8`

Dedicated workflow:

- run `34962335022`;
- job `104358599349`;
- result `completed / success`;
- marker `MULTIPLAYER_FOUNDATION_MIDPROGRESS_HIBERNATION_RECOVERY_PASS`.

Ordinary repository CI at the same head:

- run `34962338930`;
- job `104358611717`;
- result `completed / success`.

The specimen executed this stronger sequence:

1. reach exact durable physics checkpoint generation `1` at tick `33`;
2. accept batch 3 (`ticks 34..48`) for all three actors without advancing physics, leaving canonical future input in a durable progress overlay;
3. naturally hibernate the DO;
4. reconstruct a fresh constructor from exact base + progress overlay while preserving three socket bindings;
5. explicitly detach / resume `session-bravo` without replacing `actor:1`;
6. provide batch 4 (`ticks 49..63`) and continue exact physics to tick `63`;
7. require the exact final state guard;
8. publish checkpoint generation `2`;
9. naturally hibernate again;
10. reconstruct another fresh constructor from the final Recording seed and require the same exact tick-63 state guard.

Executed final evidence:

- partial progress: `9` input batches / `135` accepted records;
- progress sequence: `6`;
- first constructor transition: `6b121231… → aa9f6a99…`;
- first restore state: `restored`;
- final tick: `63`;
- final checkpoint generation: `2`;
- final accepted / committed records: `180 / 180`;
- final commit messages sent: `36`;
- exact final state guard SHA-256: `1d76b17f64630dad372d1166806a7aee9f3ed500cc8ee4fc2d6a2d898cc205d6`;
- final Recording provenance: `35153 B / de6fd36b`;
- second constructor transition: `aa9f6a99… → 7896ef20…`;
- second restore state: `restored`;
- all three ActorIds preserved;
- `session-bravo` resumed exactly once as `actor:1`.

## Important oracle correction: Recording bytes are not canonical state identity

The historical arbitrary-progress falsifier originally required the final Recording FNV to equal the clean reconnect control (`b98daa7d`). The mid-progress path instead produced `de6fd36b`, making the old gate red.

That red result was investigated rather than patched around.

Controlled diagnostic runs proved:

- clean control Recording: `35153 / b98daa7d`;
- mid-progress Recording: `35153 / de6fd36b`;
- both rehydrate to the same exact state guard SHA-256 `1d76b17f…cc205d6`;
- after the same additional 60 non-trivial physics steps, both produce the same future guard SHA-256 `6679ec5243d1282fbf482660a8e5c7a3bde8bf47c05c9234a5376a3e9b5ee90a`;
- their newly captured Recordings still differ (`c2b3312d` vs `30399ab0`);
- after rehydrating those second-generation divergent Recordings and running another 120-step horizon with a different input regime, both again produce the same exact guard SHA-256 `e61bc33e575209c37708a080f73dccbad6807056c3d2f3bfa4056ff2ba52519d`;
- their third Recording hashes still differ (`1b1bae62` vs `50204dae`).

Diagnostic runs:

- first future-equivalence run `34961144781`;
- second-order rehydration run `34961677192`.

Conclusion:

**For this pinned Box3D Recording path, byte/FNV identity is provenance, not canonical physical-state identity.**

Correctness gates must require valid seed rehydration and exact semantic state / continuation. They must not require two independently captured equivalent Recording payloads to be byte-identical. Replacing `b98daa7d` with another magic hash would recreate the same mistake.

The permanent mid-progress gate now uses exact state identity plus a real second constructor restore from the final durable checkpoint. Temporary future-equivalence apparatus was only a falsification tool and is not part of the intended permanent runtime design.

## Scope boundaries

This is a strong **local deterministic lifecycle-composition PASS**, not product qualification.

Still unproven or intentionally open:

- deterministic latency / jitter / duplicate / reorder / loss behavior in the live transport path;
- late or superseding canonical input that requires real replay / reconciliation after local consumption;
- actor retire / replacement while active physical continuation is running;
- meaningful 3–6 client CPU, memory, bandwidth and message-rate measurements;
- deployed-edge qualification of this full browser / transport specimen;
- multi-human Owner / friend playability and feel;
- product UX, capacity policy, matchmaking / room policy, auth or identity productization;
- MMO-scale interest management, partitioning or authority migration.

The separate recovery campaign proves real deployed restart / same-build hibernation recovery for its isolated recovery specimen. Do not silently promote those claims into this browser specimen, or vice versa.

## Stop condition reached for the current lifecycle subcampaign

The previous frontier was reconnect / hibernation while meaningful canonical motion was active. That frontier is now sufficiently grounded for the current foundation phase.

Do **not** continue inventing R3/R4-style durability gates merely because more failure modes can be named. Additional resilience experiments should be justified by a concrete architectural or product question.

The higher-value next move is reconvergence toward a usable Multi_World continuation:

1. treat the closed recovery branch as an evidence donor, not a blanket merge source;
2. keep this foundation branch as the current dynamic browser / transport research authority;
3. identify the minimal defended contracts that should move toward the playable Yard / ongoing-world line;
4. preserve dynamic membership, stable ActorSession identity, canonical input provenance, exact recovery seams and inspectable reconnect behavior;
5. return to an Owner-visible loop sooner rather than expanding the laboratory indefinitely;
6. use network-impairment or scale falsifiers when they answer a concrete design decision, not as an endless prerequisite chain.

## Certification interpretation

Current scoped interpretation:

**PASS — dynamic local browser multiplayer, real DO/WebSocket transport, authority-authored multi-client canonical inputs, shared Box3D interaction, controlled reconnect, natural hibernation, arbitrary-progress durable recovery and final-checkpoint rehydration have all been demonstrated in bounded automated specimens.**

Not demonstrated:

**product readiness, deployed full-stack resilience, hostile-network robustness, scale or human playability.**
