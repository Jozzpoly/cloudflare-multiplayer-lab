import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { WORLD_V0_TIMING } from "../src/world-v0-contract.ts";

const OUTPUT = process.env.MW_WORLD_V0_REVISION_DEADLINE_OUTPUT ?? "world-v0-smoothness-revision-deadline.json";
const HZ = WORLD_V0_TIMING.simulationHz;
const LEAD = WORLD_V0_TIMING.predictionLeadTicks;
assert.equal(HZ, 60);
assert.equal(LEAD, 8);

function authoredWindow(estimate) {
  const startTick = Math.floor(estimate) + 1;
  const authoredThrough = Math.floor(estimate + LEAD) - 1;
  const ticks = [];
  for (let tick = startTick; tick <= authoredThrough; tick += 1) ticks.push(tick);
  return ticks;
}

function analyzePumpRate(pumpsPerTick, targetStart = 100, targetCount = 120) {
  const observations = new Map();
  const beginEstimate = targetStart - LEAD - 2;
  const endEstimate = targetStart + targetCount + 2;
  const step = 1 / pumpsPerTick;
  for (let estimate = beginEstimate; estimate <= endEstimate + 1e-9; estimate += step) {
    for (const tick of authoredWindow(estimate)) {
      if (tick < targetStart || tick >= targetStart + targetCount) continue;
      const list = observations.get(tick) ?? [];
      list.push(estimate);
      observations.set(tick, list);
    }
  }

  const rows = [];
  for (let tick = targetStart; tick < targetStart + targetCount; tick += 1) {
    const seen = observations.get(tick) ?? [];
    assert(seen.length > 0, `target ${tick} never entered authored window`);
    const firstEstimate = seen[0];
    const lastEstimate = seen.at(-1);
    rows.push({
      tick,
      firstLeadTicks: tick - firstEstimate,
      lastRevisionLeadTicks: tick - lastEstimate,
      firstLeadMs: ((tick - firstEstimate) / HZ) * 1000,
      lastRevisionLeadMs: ((tick - lastEstimate) / HZ) * 1000,
      mutablePumpOpportunities: seen.length,
    });
  }

  const values = (key) => rows.map((row) => row[key]).sort((a, b) => a - b);
  const percentile = (list, p) => list[Math.min(list.length - 1, Math.floor((list.length - 1) * p))];
  const lastMs = values("lastRevisionLeadMs");
  const firstMs = values("firstLeadMs");
  const opportunities = values("mutablePumpOpportunities");
  return {
    pumpsPerTick,
    samples: rows.length,
    initialAuthoringLeadMs: {
      min: firstMs[0],
      median: percentile(firstMs, 0.5),
      max: firstMs.at(-1),
    },
    finalMutableRevisionLeadMs: {
      min: lastMs[0],
      median: percentile(lastMs, 0.5),
      max: lastMs.at(-1),
    },
    mutablePumpOpportunities: {
      min: opportunities[0],
      median: percentile(opportunities, 0.5),
      max: opportunities.at(-1),
    },
    representative: rows.slice(0, 4),
  };
}

const onePump = analyzePumpRate(1);
const twoPumps = analyzePumpRate(2);
const fourPumps = analyzePumpRate(4);

assert(onePump.initialAuthoringLeadMs.median >= 100, "initial future lead unexpectedly collapsed");
assert(twoPumps.initialAuthoringLeadMs.median >= 100, "dual-pump initial future lead unexpectedly collapsed");
assert(twoPumps.finalMutableRevisionLeadMs.median <= (1000 / HZ) / 2 + 1e-6, "dual-pump revision deadline retained more than half a tick of margin");
assert(fourPumps.finalMutableRevisionLeadMs.median <= (1000 / HZ) / 4 + 1e-6, "higher pump cadence did not move final revision closer to authority deadline");

const result = {
  revision: "world-v0-smoothness-revision-deadline-v1",
  simulationHz: HZ,
  predictionLeadTicks: LEAD,
  scenarios: [onePump, twoPumps, fourPumps],
  verdict: "FUTURE_REVISION_DEADLINE_MARGIN_COLLAPSE_PROVEN",
  conclusion: "The 8-tick prediction lead protects first authorship, but current mutable-future semantics allow the same target tick to be revised until the estimated authority boundary is less than one tick away. At two pump opportunities per tick, a representative final legal revision is only about half a tick (~8.3 ms) ahead of that target. Higher pump cadence moves the final revision even closer to the deadline.",
  nonClaim: "This is a scheduler-time semantic bound, not a network measurement. It does not assume any particular one-way latency or claim every final revision is transmitted/accepted.",
};

writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
console.log(result.verdict);
