# Multi_World × Jaskinia × Medium — source-bound entry seam (2026-10-19)

**Purpose:** a small, reversible *receiving-project handoff*, not an architecture decision or instructions to merge the repositories. Multi remains a **multiplayer/shared-world technology donor**. Jaskinia remains the owner's one entrance to independent work; Opus owns its live implementation. Medium remains an optional source-aware working substrate, **not** a new central deployment or session controller.

## Exact verified source observations

| Boundary | Evidence | Narrow claim |
| --- | --- | --- |
| Multi qualified `main` | [`d6b9be57`](https://github.com/Jozzpoly/cloudflare-multiplayer-lab/commit/d6b9be57aaa7272aa38d6b93639dc464d8faebb3), [current state](https://github.com/Jozzpoly/cloudflare-multiplayer-lab/blob/d6b9be57aaa7272aa38d6b93639dc464d8faebb3/docs/MULTI_WORLD_CURRENT_STATE.md) | 2-actor Ongoing Yard + V28 post-Owner hardening baseline, not six-person product and not a new after-hardening human acceptance test |
| Multi research | [`f26f9c6`](https://github.com/Jozzpoly/cloudflare-multiplayer-lab/commit/f26f9c6e31cb6103e9e1eb55350ecc6a8acc0be7), [run 39318923780](https://github.com/Jozzpoly/cloudflare-multiplayer-lab/actions/runs/39318923780) | Local Workerd/Chromium MF6 active six-body authority, visible session-keyed 3D models and exact same-epoch churn tested; **unmerged, undeployed, not human 3–6 qualification** |
| Live staging page | [staging World V0](https://cloudflare-multiplayer-lab-staging.jozzpoly.workers.dev/world-v0/), [public build-contract](https://cloudflare-multiplayer-lab-staging.jozzpoly.workers.dev/world-v0/build-contract.js), [ping](https://cloudflare-multiplayer-lab-staging.jozzpoly.workers.dev/api/ping) | On 2026-10-19 the page opened in Opera, `/api/ping` returned `ok:true`, and public build contract matched `main`: `browser-ui-v22`, `browser-sim-v10`, `sim-cd8edc169f791a64`. **No verified complete human enter / live play / cross-device return** in this observation. Opera page accessibility later displayed `Catching up…`; do not suppress this uncertainty |
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

- Use the existing staging **two-actor** URL as a **candidate** entry. The stable **launcher** URL is `https://cloudflare-multiplayer-lab-staging.jozzpoly.workers.dev/world-v0/`, without a fixed `run` parameter. The game generates/chooses a per-entry Yard; invitations to the same Yard are **separate, user-chosen deep links**, not catalog defaults.
- **Before** declaring this URL `sprawdzil` / “verified playable”, perform one ordinary top-level desktop open → Enter → live movement/jump → close/reopen or Resume, plus a bounded touch/mobile return test when practical. The current Opera inspection stopped short of qualifying that.
- In Jaskinia's **existing** `data/wejscia.json` (receiving-project decision; **not changed here**), the likely mapping after verification is for `cloudflare-multiplayer-lab`: `url` = stable staging launcher; `okno:false`; `dlaczego` = Worker session identity and possible third-party iframe storage partitioning; `sprawdzil` / `kiedy` = actual evidence, not inferred.
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

**Pilot success:** Opus can independently identify the correct candidate URL and scope, a normal player can enter 2P staging from a Jaskinia-originating doorway and return without loss of a valid session, and a fresh agent can locate the **exact** separate source, runtime and human-qualification status without asking Jozz to summarize it.

**Failure/stop:** the Worker remains in “Catching up…”, cannot pass real enter/return, the iframe changes storage ownership, a global refresh/bus is required to make the demo appear, the candidate URL promises six-person play, or any private token/room key ends up in the public handoff. Report this instead of forcing a misleading `Zagraj` badge.

**Explicitly not performed here:** no Jaskinia source mutation, no Worker redeploy, no MF6 merge, no public room-state API, no automatic repo refresh, no shared secret/session transport, no Medium platform changes, no human acceptance claim.
