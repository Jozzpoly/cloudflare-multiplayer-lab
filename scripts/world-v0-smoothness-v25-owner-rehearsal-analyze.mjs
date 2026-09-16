import { readFileSync, writeFileSync } from "node:fs";

const input = process.argv[2];
const output = process.argv[3] || "world-v0-smoothness-v25-owner-rehearsal-analysis.json";
if (!input) throw new Error("usage: node world-v0-smoothness-v25-owner-rehearsal-analyze.mjs <evidence.json> [output.json]");

const evidence = JSON.parse(readFileSync(input, "utf8"));
const samples = [...(evidence.samples || [])].sort((a, b) => a.t - b.t);
if (samples.length < 10) throw new Error(`owner rehearsal needs >=10 render samples, got ${samples.length}`);

const position = (value) => Array.isArray(value) && value.length >= 3 ? value.slice(0, 3).map(Number) : null;
const distance = (a, b) => a && b ? Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) : null;
const percentile = (values, p) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1));
  return sorted[index];
};
const summarize = (values) => ({
  count: values.length,
  p50: percentile(values, 0.50),
  p95: percentile(values, 0.95),
  p99: percentile(values, 0.99),
  max: values.length ? Math.max(...values) : 0,
});

const intervals = [];
for (let index = 1; index < samples.length; index += 1) {
  const previous = samples[index - 1];
  const current = samples[index];
  const from = position(previous.remote);
  const to = position(current.remote);
  if (!from || !to) continue;
  const dtMs = Number(current.t) - Number(previous.t);
  if (!(dtMs > 0)) continue;
  const stepMeters = distance(from, to);
  const correctionCounterChanged = Number(current.corrections) !== Number(previous.corrections);
  const correctionAssociated = Boolean(previous.correctionWindowActive || current.correctionWindowActive || correctionCounterChanged);
  intervals.push({
    t0: previous.t,
    t1: current.t,
    dtMs,
    stepMeters,
    speedMetersPerSecond: stepMeters / (dtMs / 1000),
    correctionAssociated,
    localBoundaryDelta: Number.isInteger(previous.localBoundaryTick) && Number.isInteger(current.localBoundaryTick)
      ? current.localBoundaryTick - previous.localBoundaryTick
      : null,
  });
}
if (intervals.length < 8) throw new Error(`owner rehearsal needs >=8 valid remote intervals, got ${intervals.length}`);

const bucket = (rows) => ({
  intervals: rows.length,
  stepMeters: summarize(rows.map((row) => row.stepMeters)),
  speedMetersPerSecond: summarize(rows.map((row) => row.speedMetersPerSecond)),
  frameDtMs: summarize(rows.map((row) => row.dtMs)),
});
const correctionRows = intervals.filter((row) => row.correctionAssociated);
const ordinaryRows = intervals.filter((row) => !row.correctionAssociated);
const finalPresentation = evidence.after?.presentation?.remotePresentation
  ?? evidence.after?.remotePresentation
  ?? evidence.presentation?.remotePresentation
  ?? null;

const result = {
  revision: "world-v0-smoothness-v25-owner-rehearsal-analysis-v1",
  sourceRevision: evidence.revision ?? null,
  contractStatus: "mechanism-transfer rehearsal; not an Owner perceptual SLO",
  pressure: {
    rawPeerSuperseded: evidence.apparatus?.rawPeer?.superseded ?? null,
    correctionDelta: evidence.correctionDelta ?? null,
    serverLateDelta: evidence.serverLateDelta ?? null,
    guardMismatchDelta: evidence.guardMismatchDelta ?? null,
    authoritySilenceResumeDelta: evidence.authoritySilenceResumeDelta ?? null,
  },
  trajectory: {
    all: bucket(intervals),
    correctionAssociated: bucket(correctionRows),
    ordinary: bucket(ordinaryRows),
  },
  finalPresentation,
  signature: {
    mutableFuturePressurePresent: Number(evidence.apparatus?.rawPeer?.superseded ?? 0) > 0,
    exactnessPreserved: evidence.guardMismatchDelta === 0,
    recoveryExcluded: evidence.authoritySilenceResumeDelta === 0,
    sufficientTrajectory: intervals.length >= 8,
  },
};
result.verdict = Object.values(result.signature).every(Boolean)
  ? "WORLD_V0_V25_DISPLAYED_MOTION_CHARACTERIZED"
  : "WORLD_V0_V25_DISPLAYED_MOTION_NOT_CHARACTERIZED";

writeFileSync(output, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
console.log(result.verdict);
