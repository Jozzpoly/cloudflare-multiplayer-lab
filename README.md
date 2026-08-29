# Cloudflare Multiplayer Lab

Evidence-driven laboratory for a Cloudflare-first browser multiplayer workflow.

The goal is not to build a generic game framework up front. Each gate should answer one useful infrastructure/gameplay question with real runtime evidence.

## Experiment gates

1. **Deployment sanity — PASS.** Static frontend + Worker + `/api/ping` work publicly.
2. **Realtime transport — PASS.** Public WebSocket round-trip plus bounded reconnect/recovery validated in a real Android browser.
3. **Single shared world game — PASS.** One Durable Object coordinated Neon Salvage concurrently across two independent real phones.
4. **Authoritative shared simulation — IN PROGRESS.** Gate 4A fixed-authoritative substrate is PASS/frozen; later shared physical interaction remains separate work.

## Gate 4A: fixed simulation substrate — PASS / frozen

Gate 4A deliberately kept Neon Salvage recognizable while changing the authority model underneath it.

Validated baseline:

- 20 Hz fixed authoritative simulation,
- 10 Hz authoritative snapshots,
- ~15 Hz baseline input transport,
- input messages update control state only,
- fixed-step accumulator with bounded catch-up,
- 600 ms server input lease for mobile background safety,
- deterministic seeded run/reset,
- server + client telemetry for timing, traffic and reconciliation.

Real mobile evidence showed coherent ~20 Hz simulation / ~10 Hz snapshots, 0 dropped ticks and 0 catch-up during normal play, small measured prediction corrections, working mobile background stale-input protection, and continued shared-world play with two participants visible.

Closure hardening made tick labeling, per-run duration, restored run serial and stale input sequence handling explicit without changing gameplay or cadence. The full contract, runtime evidence, limitations and non-claims are recorded in [`docs/gates/gate-4-shared-simulation-lab.md`](docs/gates/gate-4-shared-simulation-lab.md).

Gate 4B has **not** started. Its next candidate question is whether multiple clients can coherently influence one genuinely shared server-authoritative dynamic body.

## Gate 3 control specimen

Gate 3 / Neon Salvage remains the validated previous boundary: two phones from different manufacturers joined one public shared world with touch play, shared movement/state, pickups and scoreboard behavior. The Gate 3 record is in [`docs/gates/gate-3-shared-world-game.md`](docs/gates/gate-3-shared-world-game.md).

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

This repository remains a laboratory. Deployment isolation and deterministic dependency locking are hardening topics, not evidence claims established by the current gates.
