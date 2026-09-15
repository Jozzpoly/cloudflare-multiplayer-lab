import { readFileSync, writeFileSync } from "node:fs";

const inputPath = process.env.MW_WORLD_V0_RENDER_INPUT ?? "world-v0-smoothness-render-discontinuity-v5.json";
const outputPath = process.env.MW_WORLD_V0_RESIDUAL_OUTPUT ?? "world-v0-smoothness-render-residual-v5.json";
const input = JSON.parse(readFileSync(inputPath, "utf8"));
const samples = Array.isArray(input.samples) ? input.samples : [];
if (samples.length < 2) throw new Error(`render residual analyzer needs raw samples, got ${samples.length}`);

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1))];
}
function stats(values) {
  return {
    count: values.length,
    p50: percentile(values, 0.5),
    p95: percentile(values, 0.95),
    p99: percentile(values, 0.99),
    max: values.length ? Math.max(...values) : 0,
  };
}
function finiteVec(value) {
  return Array.isArray(value) && value.length >= 3 && value.every(Number.isFinite);
}
function analyzeBody(positionKey, velocityKey) {
  const intervals = [];
  for (let i = 1; i < samples.length; i += 1) {
    const a = samples[i - 1];
    const b = samples[i];
    const dtMs = b.t - a.t;
    if (!(dtMs >= 5 && dtMs <= 50)) continue;
    if (!finiteVec(a[positionKey]) || !finiteVec(b[positionKey]) || !finiteVec(a[velocityKey]) || !finiteVec(b[velocityKey])) continue;
    const dt = dtMs / 1000;
    const observedDx = b[positionKey][0] - a[positionKey][0];
    const observedDz = b[positionKey][2] - a[positionKey][2];
    const expectedDx = (a[velocityKey][0] + b[velocityKey][0]) * 0.5 * dt;
    const expectedDz = (a[velocityKey][2] + b[velocityKey][2]) * 0.5 * dt;
    const residualX = observedDx - expectedDx;
    const residualZ = observedDz - expectedDz;
    const residual = Math.hypot(residualX, residualZ);
    const velocityDelta = Math.hypot(
      b[velocityKey][0] - a[velocityKey][0],
      b[velocityKey][2] - a[velocityKey][2],
    );
    const acceleration = velocityDelta / dt;
    const correctionDelta = Math.max(0, Number(b.corrections || 0) - Number(a.corrections || 0));
    const correctionAssociated = correctionDelta > 0 || Boolean(a.correctionWindowActive) || Boolean(b.correctionWindowActive);
    intervals.push({
      dtMs,
      residual,
      residualX,
      residualZ,
      acceleration,
      correctionDelta,
      correctionAssociated,
      boundaryFrom: a.localBoundaryTick,
      boundaryTo: b.localBoundaryTick,
    });
  }
  const correction = intervals.filter((entry) => entry.correctionAssociated);
  const ordinary = intervals.filter((entry) => !entry.correctionAssociated);
  const correctionResiduals = correction.map((entry) => entry.residual);
  const ordinaryResiduals = ordinary.map((entry) => entry.residual);
  const correctionAcceleration = correction.map((entry) => entry.acceleration);
  const ordinaryAcceleration = ordinary.map((entry) => entry.acceleration);
  const ordinaryP95 = percentile(ordinaryResiduals, 0.95);
  const correctionP95 = percentile(correctionResiduals, 0.95);
  return {
    intervals: intervals.length,
    correctionIntervals: correction.length,
    ordinaryIntervals: ordinary.length,
    residual: {
      all: stats(intervals.map((entry) => entry.residual)),
      correctionAssociated: stats(correctionResiduals),
      ordinary: stats(ordinaryResiduals),
      correctionVsOrdinaryP95Ratio: ordinaryP95 > 1e-9 ? correctionP95 / ordinaryP95 : (correctionP95 > 0 ? null : 1),
      correctionMinusOrdinaryP95: correctionP95 - ordinaryP95,
    },
    acceleration: {
      correctionAssociated: stats(correctionAcceleration),
      ordinary: stats(ordinaryAcceleration),
    },
    worstCorrectionResiduals: [...correction]
      .sort((a, b) => b.residual - a.residual)
      .slice(0, 12),
  };
}

const self = analyzeBody("self", "selfVelocity");
const remote = analyzeBody("remote", "remoteVelocity");
const prop = analyzeBody("prop", "propVelocity");
const result = {
  revision: "world-v0-smoothness-render-residual-v5",
  sourceRevision: input.revision,
  sourceVerdict: input.verdict,
  sourceSignature: input.signature,
  sampleCount: samples.length,
  method: "For each valid 5..50 ms render interval, compare observed horizontal displacement with trapezoidal integration of the body's pre/post horizontal Box3D velocity. The residual is a direct render-vs-physical-trajectory discontinuity measure and does not assume a fixed render FPS or a scalar speed ceiling.",
  thresholdStatus: "characterization only; no Owner-ready SLO is pinned from this single bad specimen",
  self,
  remote,
  prop,
};

const selfCorrectionP95 = self.residual.correctionAssociated.p95;
const selfOrdinaryP95 = self.residual.ordinary.p95;
result.diagnostic = {
  correctionPressurePresent: Boolean(input.signature?.negativeControlPressurePresent),
  selfCorrectionResidualP95: selfCorrectionP95,
  selfOrdinaryResidualP95: selfOrdinaryP95,
  selfCorrectionResidualElevated: selfCorrectionP95 > selfOrdinaryP95,
  selfCorrectionResidualMateriallyElevated: selfCorrectionP95 >= selfOrdinaryP95 * 2 && selfCorrectionP95 - selfOrdinaryP95 >= 0.005,
};
result.verdict = result.diagnostic.correctionPressurePresent && result.diagnostic.selfCorrectionResidualElevated
  ? "CORRECTION_ASSOCIATED_TRAJECTORY_RESIDUAL_OBSERVED"
  : "TRAJECTORY_RESIDUAL_NOT_SEPARATED";

writeFileSync(outputPath, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
console.log(result.verdict);
