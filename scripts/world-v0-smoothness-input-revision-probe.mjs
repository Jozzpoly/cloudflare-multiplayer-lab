import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { cameraRelativeInput } from "../public/world-v0/playable-control.js";

const OUTPUT = process.env.MW_WORLD_V0_REVISION_OUTPUT ?? "world-v0-smoothness-input-revision.json";
const PREDICTION_LEAD_TICKS = 8;
const START = 100;

class SchedulerModel {
  constructor() {
    this.intended = new Map();
    this.sent = new Map();
    this.authored = 0;
    this.superseded = 0;
    this.pumps = 0;
    this.revisionsByTick = new Map();
    this.maxWindowRecords = 0;
  }
  same(a, b) {
    return Math.abs(a.x - b.x) <= 1e-9 && Math.abs(a.z - b.z) <= 1e-9;
  }
  pump(estimate, movement) {
    // Literal current browser semantics since 0657187f: never author the estimated
    // current authority boundary itself. The nominal lead remains eight ticks, but
    // floor(estimate)+1 .. floor(estimate+8)-1 contains at most seven records.
    const startTick = Math.max(START, Math.floor(estimate) + 1);
    const through = Math.floor(estimate + PREDICTION_LEAD_TICKS) - 1;
    if (through < startTick) return;
    this.pumps += 1;
    this.maxWindowRecords = Math.max(this.maxWindowRecords, through - startTick + 1);
    for (let tick = startTick; tick <= through; tick += 1) {
      const next = { x: movement.x, z: movement.z };
      const existing = this.intended.get(tick);
      if (!existing) {
        this.intended.set(tick, next);
        this.sent.set(tick, next);
        this.authored += 1;
        continue;
      }
      if (this.same(existing, next)) continue;
      this.intended.set(tick, next);
      // Upper semantic pressure model: every previously authored tick is treated as
      // already sent, so a changed value exercises the legal supersession path.
      this.superseded += 1;
      this.revisionsByTick.set(tick, (this.revisionsByTick.get(tick) || 0) + 1);
      this.sent.set(tick, next);
    }
  }
}

function runScenario({ name, seconds = 4, pumpsPerTick = 2, yawAt }) {
  const model = new SchedulerModel();
  const totalTicks = seconds * 60;
  const totalPumps = totalTicks * pumpsPerTick;
  for (let i = 0; i < totalPumps; i += 1) {
    const temporalTicks = i / pumpsPerTick;
    const estimate = START + temporalTicks;
    const yaw = yawAt(temporalTicks, totalTicks);
    const movement = cameraRelativeInput({ x: 0, z: -1 }, yaw);
    model.pump(estimate, movement);
  }
  const counts = [...model.revisionsByTick.values()].sort((a, b) => a - b);
  const sum = counts.reduce((a, b) => a + b, 0);
  const percentile = (p) => counts.length ? counts[Math.min(counts.length - 1, Math.floor((counts.length - 1) * p))] : 0;
  return {
    name,
    seconds,
    pumpsPerTick,
    pumps: model.pumps,
    authored: model.authored,
    superseded: model.superseded,
    supersededPerAuthored: model.authored ? model.superseded / model.authored : 0,
    maxAuthoredWindowRecords: model.maxWindowRecords,
    revisedTicks: counts.length,
    meanRevisionsPerRevisedTick: counts.length ? sum / counts.length : 0,
    p50RevisionsPerRevisedTick: percentile(0.50),
    p95RevisionsPerRevisedTick: percentile(0.95),
    maxRevisionsPerTick: counts.length ? counts.at(-1) : 0,
  };
}

const fixed = runScenario({
  name: "fixed-camera-W",
  yawAt: () => 0,
});
const oneTurn = runScenario({
  name: "single-90deg-turn",
  yawAt: (t) => t < 120 ? 0 : Math.PI / 2,
});
const smoothOrbitOnePump = runScenario({
  name: "smooth-orbit-one-pump-per-tick",
  pumpsPerTick: 1,
  yawAt: (t, total) => (t / total) * Math.PI * 2,
});
const smoothOrbitTwoPumps = runScenario({
  name: "smooth-orbit-two-pumps-per-tick",
  pumpsPerTick: 2,
  yawAt: (t, total) => (t / total) * Math.PI * 2,
});
const oscillatingOrbit = runScenario({
  name: "oscillating-orbit-two-pumps-per-tick",
  pumpsPerTick: 2,
  yawAt: (t) => Math.sin((t / 60) * Math.PI * 1.5) * 1.1,
});

for (const scenario of [fixed, oneTurn, smoothOrbitOnePump, smoothOrbitTwoPumps, oscillatingOrbit]) {
  assert.equal(scenario.maxAuthoredWindowRecords, 7, "authority-floor authored window drifted");
}
assert.equal(fixed.superseded, 0, "fixed camera unexpectedly revises future movement");
assert(oneTurn.superseded > 0, "single camera turn did not revise future movement");
assert(smoothOrbitOnePump.superseded > oneTurn.superseded, "continuous orbit did not amplify future revisions");
assert(smoothOrbitTwoPumps.superseded > smoothOrbitOnePump.superseded, "second scheduler pump opportunity did not amplify revisions");
assert(smoothOrbitTwoPumps.maxRevisionsPerTick >= 12, "continuous orbit did not repeatedly revise the same future tick");

const result = {
  revision: "world-v0-smoothness-input-revision-probe-v2-authority-floor",
  contract: {
    predictionLeadTicks: PREDICTION_LEAD_TICKS,
    authorityFloorExcludesEstimatedCurrentTick: true,
    maxAuthoredFutureRecordsPerPump: 7,
    note: "Pure upper-pressure model of the current authority-floor future-intent semantics; no network or physics.",
  },
  scenarios: [fixed, oneTurn, smoothOrbitOnePump, smoothOrbitTwoPumps, oscillatingOrbit],
  derived: {
    orbitVsFixedSupersessionDelta: smoothOrbitTwoPumps.superseded - fixed.superseded,
    dualPumpAmplification: smoothOrbitOnePump.superseded ? smoothOrbitTwoPumps.superseded / smoothOrbitOnePump.superseded : null,
  },
  verdict: "CAMERA_RELATIVE_FUTURE_REVISION_PRESSURE_PROVEN",
};
writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
console.log(result.verdict);
