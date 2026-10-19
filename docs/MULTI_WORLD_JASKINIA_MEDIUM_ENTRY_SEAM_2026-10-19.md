# Multi_World × Jaskinia × Medium — source-bound entry seam (2026-10-19)

**Purpose:** a small, reversible *receiving-project handoff*, not an architecture decision or instructions to merge the repositories. Multi remains a **multiplayer/shared-world technology donor**. Jaskinia remains the owner's one entrance to independent work; Opus owns its live implementation. Medium remains an optional source-aware working substrate, **not** a new central deployment or session controller.

## 2026-10-20 Owner update — early 2P in Jaskinia is explicitly wanted

Owner confirmed **do not wait for MF6**: put the existing 2P staging Yard into Jaskinia early to make casual play and return possible. This revises the earlier *wait for complete verified playable session before adding an entry* suggestion: an **honestly labeled early-access launcher** is authorized, with its incomplete play verification visible, rather than withholding the door.

**Implementation done, not yet published:** [Jaskinia draft PR #6](https://github.com/Jozzpoly/Jozz-Cave-Workbench/pull/6) against Opus's `v6-materialy` branch. Exactly 3 files: `data/wejscia.json` adds stable staging URL + `okno:false` and source-accurate verification limits; `data/library.json` updates only Multi's entry in the current snapshot; `tools/jk63_test.mjs` adds 2 smoke assertions for URL/tab-only and no iframe in the game window. PR source branch: `experiment/multi-2p-jaskinia-entry-2026-10-20`. The PR is **draft**, preserving Opus ownership of Jaskinia versioning, release/data-safety regression and deployment; [Kompas routing note](https://github.com/Jozzpoly/Jozz-Cave-Workbench/issues/5#issuecomment-6278927691).

Static JSON consistency and exact 3-file compare were checked; the `jk63_test.mjs` additions **were subsequently exercised in headless Chromium as linked above**, and both generated-page entry and hosted 2P round-trip passed bounded machine checks. The Worker and public GitHub Pages were not modified. Do not assert that Jaskinia already displays the updated button until Opus publishes it. Separate tabs remain a transitional one-Home doorway; deeper iframe / saved session unification is a *later experiment*, not required for first play.

### 2026-10-20 follow-through — 2P browser ingress and real deployed staging

The early-access [Jaskinia PR #6](https://github.com/Jozzpoly/Jozz-Cave-Workbench/pull/6) now has two **independent, completed machine experiments** beyond the earlier public asset/ping checks:

- [Jaskinia assembled UI CI #39339635618](https://github.com/Jozzpoly/Jozz-Cave-Workbench/actions/runs/39339635618): `python tools/build.py` plus Jaskinia render in fresh GitHub runner and Playwright Chromium, **8/8 PASS**. Verifies external 2P URL, launch-tab semantics, no embedded Worker iframe and regression coverage for Tysiąc and VAW.
- [Actual hosted staging Worker CI #39340405745](https://github.com/Jozzpoly/Jozz-Cave-Workbench/actions/runs/39340405745): two distinct Chromium contexts in a unique private test Yard, both active in the same WorldEpoch, canonical movement authorship, exact guard mismatches 0; close the first tab and reopen its actual URL **with the same browser origin storage**; authority-backed Resume recovers the **same ActorSession and WorldEpoch**; script errors 0. The first attempt [39340084838](https://github.com/Jozzpoly/Jozz-Cave-Workbench/actions/runs/39340084838) failed because the probe clicked the button before the module had completed installing its handler; after gating on the full app/entry bootstrap the real Worker trial passed. This is not a human-feel, real mobile hardware, intermittent-hosting, or 3–6 actor qualification.
- The link metadata now explains the **two-person start requirement** and the pre-existing `Advanced / inspection → Inspect solo` with automated companion, whose machine-only scenario is explicitly **not** multiplayer qualification. [Re-run #39341132007](https://github.com/Jozzpoly/Jozz-Cave-Workbench/actions/runs/39341132007) assembled the updated UI and again passed **8/8**.

All CI driver scripts and single-use workflows were removed from the PR after execution; the final diff still consists of the *three agreed source/data/test files*, with the real hosted Worker and Multi qualified `main` unchanged. PR #6 was moved out of draft, ready for Opus's release judgement. **Public Jaskinia still does not include the new entry until Opus builds and publishes**, and Owner/human/mobile play quality is not demonstrated. This is precisely the distinction between source-ready and visible-in-the-Home; do not claim the button is already live.

## Exact verified source observations

| Boundary | Evidence | Narrow claim |
| --- | --- | --- |
| Multi qualified `main` | [`d6b9be57`](https://github.com/Jozzpoly/cloudflare-multiplayer-lab/commit/d6b9be57aaa7272aa38d6b93639dc464d8faebb3), [current state](https://github.com/Jozzpoly/cloudflare-multiplayer-lab/blob/d6b9be57aaa7272aa38d6b93639dc464d8faebb3/docs/MULTI_WORLD_CURRENT_STATE.md) | 2-actor Ongoing Yard + V28 post-Owner hardening baseline, not six-person product and not a new after-hardening human acceptance test |
| Multi research | [`f26f9c6`](https://github.com/Jozzpoly/cloudflare-multiplayer-lab/commit/f26f9c6e31cb6103e9e1eb55350ecc6a8acc0be7), [run 39318923780](https://github.com/Jozzpoly/cloudflare-multiplayer-lab/actions/runs/39318923780) | Local Workerd/Chromium MF6 active six-body authority, visible session-keyed 3D models and exact same-epoch churn tested; **unmerged, undeployed, not human 3–6 qualification** |
| Live staging page | [staging World V0](https://cloudflare-multiplayer-lab-staging.jozzpoly.workers.dev/world-v0/), [public build-contract](https://cloudflare-multiplayer-lab-staging.jozzpoly.workers.dev/world-v0/build-contract.js), [ping](https://cloudflare-multiplayer-lab-staging.jozzpoly.workers.dev/api/ping) | On 2026-10-19 the page opened in Opera, `/api/ping` returned `ok:true`, and public build contract matched `main`: `browser-ui-v22`, `browser-sim-v10`, `sim-cd8edc169f791a64`. The live [public room directory](https://cloudflare-multiplayer-lab-staging.jozzpoly.workers.dev/api/world-v0/rooms) returned the R5 Ongoing Yard contract with **three canonical public yards (`yard-1`–`yard-3`), each capacity 2 and joinable, all empty at observation time**. **No verified complete human enter / live play / cross-device return** in this observation. Opera page accessibility later displayed `Catching up…`; do not suppress this uncertainty |
| Published Jaskinia | [public v6.3](https://jozzpoly.github.io/Jozz-Cave-Workbench/), [v6.3 release notes](https://github.com/Jozzpoly/Jozz-Cave-Workbench/blob/v6-materialy/docs/2026-10-19-v63-bezpieczne-wydanie.md) | Actual public UI on 19 Oct showed `v6.3`; repo snapshot was dated 19 Oct 03:26 local and was already many hours old. Snapshot freshness is **not runtime/deploy health** |
| Jaskinia entry plumbing | [`data/wejscia.json`](https://github.com/Jozzpoly/Jozz-Cave-Workbench/blob/v6-materialy/data/wejscia.json), [`tools/build.py`](https://github.com/Jozzpoly/Jozz-Cave-Workbench/blob/v6-materialy/tools/build.py), [`40-types.js`](https://github.com/Jozzpoly/Jozz-Cave-Workbench/blob/v6-materialy/src/jaskinia/40-types.js) | Existing **source-owned verified play-address override** supports external Worker URL and `okno:false` (Tysiąc precedent). Current `cloudflare-multiplayer-lab` record has `pages:null`, `wejscie:null`, so normal `Zagraj` cannot offer Multi |
| Jaskinia Owner boundary | [Kompas issue #5](https://github.com/Jozzpoly/Jozz-Cave-Workbench/issues/5), [AGENTS.md](https://github.com/Jozzpoly/Jozz-Cave-Workbench/blob/v6-materialy/AGENTS.md) | One Home UX but autonomous projects; Opus owns Jaskinia. Automatic repository data refresh is expressly **not authorized yet** (source/frequency/cost unresolved) |
| Medium substrate | [North Star](https://github.com/Jozzpoly/Shared-Work-Medium-Lab/blob/main/docs/NORTH_STAR.md), [guardrails](https://github.com/Jozzpoly/Shared-Work-Medium-Lab/blob/main/docs/DESIGN_GUARDRAILS.md), [capability expedition #7](https://github.com/Jozzpoly/Shared-Work-Medium-Lab/issues/7) | Use existing source-bound GitHub/Issue/commit/run handles, preserve distinct object/source/projection identities and human vs machine evidence; no new mandatory integration API or central live-state watcher |

## Exact cross-project friction

Three different clocks are currently presented as if they might mean one thing:

1. **Repository activity** — Jaskinia snapshot's `last_ts` / “żywe” reflect project commit recency *at snapshot time*, including research commits.
2. **Deployment and entry** — staging hosts the **2P main-era build**, not the latest MF6 branch; a valid static response or ping is not an end-to-end playable session.
3. **Session/world truth** — actual WorldEpoch, capacity, valid ActorSession resume, and human-feel qualification are **live, contextual, and not inferable from either of the above**.

If Jaskinia shows “MultiWorld — żywe” and a `Zagraj` link, it must not silently imply “latest six-person research is deployed and six humans can play.” If Medium quotes CI green, it must not translate six-body machine correctness into a human product PASS.

## Smallest useful shared pilot — existing mechanisms only

### Multi → Jaskinia

- Use the existing staging **two-actor** URL as a **candidate** entry. The stable **launcher** URL is `https://cloudflare-multiplayer-lab-staging.jozzpoly.workers.dev/world-v0/`, without a fixed `run` parameter. Ordinary no-`run` entry opens the **live canonical public Yard directory**, not a new private room on each click. The player chooses a public Yard. Its card checks per-room ActorSession storage and can offer Resume if the authority still recognizes that epoch. Explicit private Yard invitations are **separate deliberate deep links**. On later `Zagraj`, the public room must be reselected; do not claim one-click automatic return to the previous actor.
- **Before** declaring this URL `sprawdzil` / “verified playable”, perform top-level entry → choose a public Yard → Enter → live movement/jump → reopen base URL → reselect the same Yard and Resume, plus a bounded touch/mobile return test when practical. A directory response showing joinable capacity is not evidence of successful movement or Resume. The current Opera inspection stopped short of qualifying that.
- Jaskinia's existing `data/wejscia.json` mapping was now **proposed in isolated PR #6**: `url` = stable staging launcher; `okno:false`; `dlaczego` = Worker ActorSession and possible iframe partitioning; `sprawdzil` explicitly says **page, build revision and public room-directory verified, but human Enter/Resume not yet verified**. This follows the Owner's authorization for early 2P access, without mislabeling the result.
- Top-level new tab is a **deliberate first pilot**, as already done for Tysiąc. This preserves the Worker origin's ActorSession storage and avoids untested iframe partitioning. A Jaskinia doorway does not require same-origin, shared runtime or a monolith.
- Jaskinia's existing `#repo~cloudflare-multiplayer-lab` address and `Zagraj` / game window semantics remain the home-side entrance. Do not add another dashboard, launcher service, or a second competing Home.

### Jaskinia → Multi

- Treat 3–6-human usability tests, **real mobile focus/keyboard/touch**, playing with another person, and natural tab ↔ Jaskinia return as valuable Owner-side evidence. The Multiplayer Foundation consumes these as *multiplayer lifecycle/playability falsifiers*, **not** requests for arbitrary new gameplay.
- Separate **private ActorSession capability** (stored and validated on the Worker/game origin) from Jaskinia's private workspace state (`jaskinia:v3`) and its public project catalog. Never include `resumeToken`, session-storage records, unguessable Yard invite links, user notes or identity-bearing session IDs in public metadata, `postMessage`, public CI workpieces or broad logging.
- The Jaskinia instrument contract ([v1](https://github.com/Jozzpoly/Jozz-Cave-Workbench/blob/v6-materialy/docs/przyrzad/KONTRAKT.md)) is a **possible later opt-in** for **sanitized** progress/capacity/lag/connection summaries in a supported iframe. It is not a prerequisite for first entry. If explored, verify parent origin, `event.source`, redaction, throttling, focus ownership, hidden-window rAF behavior and storage partition effects. Because first pilot is tab-only, do **not** claim Jaskinia currently receives live telemetry from it.
- Jaskinia private remarks and agent-panel material live in **browser-local/private storage**; they are not automatically shared with arbitrary GitHub agents. An explicit reviewed package or source-native feedback transfer remains required.

### Medium → both

- Use the **current exact commit, CI run, Worker build contract and Jaskinia snapshot date** as separate source handles. These are ordinary existing GitHub/URL artifacts; no new database/schema/service/monitor.
- Preserve actual distinctions: tested Git research source ≠ qualified main ≠ deployed build ≠ per-session liveness ≠ Owner play verdict. A useful Medium workpiece can make that ambiguity visible while remaining an *optional* research note, not an operational requirement for Jaskinia to launch Multi.
- Let Opus independently choose whether/when to consume this handoff. Do not artificially count a coordinated request as spontaneous Medium adoption.

## Next discriminating test and stop conditions

**Pilot success:** Opus can independently identify the correct candidate URL and scope, a normal player can choose a 2P public Yard from a Jaskinia-originating doorway and later reselect it for valid same-ActorSession Resume, and a fresh agent can locate the **exact** separate source, runtime and human-qualification status without asking Jozz to summarize it.

**Failure/stop:** the Worker remains in “Catching up…”, cannot pass real enter/return, the iframe changes storage ownership, a global refresh/bus is required to make the demo appear, the candidate URL promises six-person play, or any private token/room key ends up in the public handoff. Report this instead of forcing a misleading `Zagraj` badge.

**Explicitly not performed here:** no change to Jaskinia's *active* `v6-materialy` or public GitHub Pages deployment (only isolated PR #6), no Worker redeploy, no MF6 merge, no public room-state API change, no automatic repo refresh, no shared secret/session transport, no Medium platform changes, no human acceptance claim.
