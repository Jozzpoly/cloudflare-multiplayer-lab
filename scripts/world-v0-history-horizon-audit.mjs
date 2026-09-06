import { WORLD_V0_CLIENT_HISTORY } from "../src/world-v0-contract.ts";

const { segmentTicks, retainTicks } = WORLD_V0_CLIENT_HISTORY;

function createHistory() {
  return { segments: [], active: { startTick: 0, frames: 0 } };
}

function finalizeActive(history, boundaryTick) {
  const active = history.active;
  if (!active || active.frames === 0) return;
  history.segments.push({
    startTick: active.startTick,
    validEndTick: active.startTick + active.frames,
  });
  history.active = null;
}

function startActive(history, boundaryTick) {
  history.active = { startTick: boundaryTick, frames: 0 };
}

function rotateIfNeeded(history, boundaryTick) {
  if (!history.active || history.active.frames < segmentTicks) return;
  finalizeActive(history, boundaryTick);
  startActive(history, boundaryTick);
}

function trimHistory(history, boundaryTick) {
  const cutoff = boundaryTick - retainTicks;
  history.segments = history.segments.filter((segment) => segment.validEndTick >= cutoff);
}

function correctionCoverage(history, boundaryTick) {
  const segments = history.segments.map((segment) => ({ ...segment }));
  if (history.active?.frames > 0) {
    segments.push({
      startTick: history.active.startTick,
      validEndTick: history.active.startTick + history.active.frames,
    });
  }
  const selectable = (targetTick) => segments.some((segment) => segment.startTick <= targetTick && segment.validEndTick >= targetTick);
  let maxRewind = 0;
  for (let age = 1; age <= boundaryTick; age += 1) {
    if (selectable(boundaryTick - age)) maxRewind = age;
    else break;
  }
  return { maxRewind, segments };
}

const history = createHistory();
const rows = [];
const successByAge = new Map();
const samples = 512;
const warmup = 128;

for (let boundaryTick = 1; boundaryTick <= warmup + samples; boundaryTick += 1) {
  history.active.frames += 1;
  rotateIfNeeded(history, boundaryTick);
  trimHistory(history, boundaryTick);
  if (boundaryTick <= warmup) continue;
  const coverage = correctionCoverage(history, boundaryTick);
  rows.push({
    boundaryTick,
    phase: boundaryTick % segmentTicks,
    maxRewind: coverage.maxRewind,
    oldestSegmentStart: coverage.segments[0]?.startTick ?? null,
    segmentCountIfCorrectionNow: coverage.segments.length,
  });
  for (let age = retainTicks - 2; age <= retainTicks + segmentTicks + 2; age += 1) {
    const targetTick = boundaryTick - age;
    const ok = coverage.segments.some((segment) => segment.startTick <= targetTick && segment.validEndTick >= targetTick);
    const value = successByAge.get(age) || { ok: 0, total: 0 };
    value.total += 1;
    if (ok) value.ok += 1;
    successByAge.set(age, value);
  }
}

const maxRewinds = rows.map((row) => row.maxRewind);
const byPhase = [...new Set(rows.map((row) => row.phase))].sort((a, b) => a - b).map((phase) => {
  const values = rows.filter((row) => row.phase === phase).map((row) => row.maxRewind);
  return { phase, min: Math.min(...values), max: Math.max(...values), values: [...new Set(values)] };
});
const ageCoverage = [...successByAge.entries()].sort((a, b) => a[0] - b[0]).map(([age, value]) => ({
  age,
  successPct: (100 * value.ok) / value.total,
  ok: value.ok,
  total: value.total,
}));

const result = {
  revision: "world-v0-history-horizon-audit-v1",
  contract: { segmentTicks, retainTicks },
  observedEffectiveMaxRewind: {
    minimumAcrossSegmentPhases: Math.min(...maxRewinds),
    maximumAcrossSegmentPhases: Math.max(...maxRewinds),
  },
  byPhase,
  ageCoverage,
  interpretation: "This mirrors the current app's rotate/trim/selectCheckpoint interval semantics, including finalizing the active segment before a correction. A correction age whose coverage is below 100% is phase-dependent even with identical network delay.",
};

console.log("WORLD_V0_HISTORY_HORIZON_AUDIT", JSON.stringify(result, null, 2));

if (result.observedEffectiveMaxRewind.minimumAcrossSegmentPhases !== retainTicks + 1) {
  throw new Error(`unexpected minimum effective rewind ${result.observedEffectiveMaxRewind.minimumAcrossSegmentPhases}`);
}
if (result.observedEffectiveMaxRewind.maximumAcrossSegmentPhases !== retainTicks + segmentTicks) {
  throw new Error(`unexpected maximum effective rewind ${result.observedEffectiveMaxRewind.maximumAcrossSegmentPhases}`);
}
const guaranteed = ageCoverage.filter((row) => row.successPct === 100).at(-1)?.age ?? 0;
const impossible = ageCoverage.find((row) => row.successPct === 0)?.age ?? null;
if (guaranteed !== retainTicks + 1 || impossible !== retainTicks + segmentTicks + 1) {
  throw new Error(`unexpected phase boundary ${JSON.stringify({ guaranteed, impossible })}`);
}
console.log(`WORLD_V0_HISTORY_HORIZON_PHASE_DEPENDENCE_CONFIRMED guaranteed=${guaranteed} best=${retainTicks + segmentTicks} impossibleAt=${impossible}`);
