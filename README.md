# Cloudflare Multiplayer Lab

Evidence-driven laboratory for a Cloudflare-first browser multiplayer workflow.

The goal is not to build a generic game framework up front. Each gate should answer one useful infrastructure/gameplay question with real runtime evidence.

## Experiment gates

1. **Deployment sanity — PASS.** Static frontend + Worker + `/api/ping` work publicly.
2. **Realtime transport — PASS.** Public WebSocket round-trip plus bounded reconnect/recovery validated in a real Android browser.
3. **Single shared world game — PASS.** One Durable Object coordinated Neon Salvage concurrently across two independent real phones.
4. **Authoritative shared simulation — IN PROGRESS.** Test a continuous server-owned world with measurable timing, prediction/reconciliation and later shared physical interaction.

## Gate 4A: fixed simulation substrate

Gate 4A deliberately keeps Neon Salvage familiar while changing the authority model underneath it.

Baseline contract:

- 20 Hz fixed authoritative simulation,
- 10 Hz authoritative snapshots,
- ~15 Hz baseline input transport,
- input messages update control state only,
- fixed-step accumulator with bounded catch-up,
- 600 ms server input lease for mobile background safety,
- deterministic seeded run/reset,
- server + client telemetry for timing, traffic and reconciliation.

A mobile LAB panel exposes the measurements instead of hiding them. The experiment contract and non-claims are recorded in [`docs/gates/gate-4-shared-simulation-lab.md`](docs/gates/gate-4-shared-simulation-lab.md).

## Gate 3 control specimen

Gate 3 / Neon Salvage is preserved as the validated control boundary: two phones from different manufacturers joined one public shared world with touch play, shared movement/state, pickups and scoreboard behavior. The Gate 3 record is in [`docs/gates/gate-3-shared-world-game.md`](docs/gates/gate-3-shared-world-game.md).

## Validation

```bash
npm install
npm run check
```

Local development:

```bash
npm install
npm run dev
```

## Public lab Worker

`https://cloudflare-multiplayer-lab.jozzpoly.workers.dev`

This repository remains a laboratory. Staging/deployment isolation and deterministic dependency locking are hardening topics, not evidence claims established by the current gates.
