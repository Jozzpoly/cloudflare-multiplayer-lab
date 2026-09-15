import { readFileSync, writeFileSync } from "node:fs";

const input = process.argv[2];
const output = process.argv[3] || "world-v0-smoothness-render-correction-component-v6.json";
if (!input) throw new Error("usage: node world-v0-smoothness-render-correction-component-v6-analyze.mjs <v6-evidence.json> [output.json]");

const evidence = JSON.parse(readFileSync(input, "utf8"));
const samples = [...(evidence.samples || [])].sort((a, b) => a.t - b.t);
const corrections = [...(evidence.correctionVectors || [])].sort((a, b) => a.t - b.t);
if (samples.length < 2) throw new Error("V6 analyzer requires at least two render samples");

const vector = (value) => Array.isArray(value) && value.length >= 3 ? value.map(Number) : [0, 0, 0];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const magnitude = (a) => Math.hypot(a[0], a[1], a[2]);
const percentile = (values, p) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * p)));
  return sorted[index];
};
const summarize = (values) => ({
  count: values.length,
  p50: percentile(values, 0.5),
  p95: percentile(values, 0.95),
  p99: percentile(values, 0.99),
  max: values.length ? Math.max(...values) : 0,
});

const intervals = [];
let cursor = 0;
for (let index = 1; index < samples.length; index += 1) {
  const previous = samples[index - 1];
  const current = samples[index];
  while (cursor < corrections.length && corrections[cursor].t <= previous.t) cursor += 1;
  const intervalCorrections = [];
  let scan = cursor;
  while (scan < corrections.length && corrections[scan].t <= current.t) {
    intervalCorrections.push(corrections[scan]);
    scan += 1;
  }
  cursor = scan;

  const summarizeEntity = (positionKey, correctionKey) => {
    const previousPosition = vector(previous[positionKey]);
    const currentPosition = vector(current[positionKey]);
    const actual = sub(currentPosition, previousPosition);
    const correction = intervalCorrections.reduce((sum, event) => add(sum, vector(event[correctionKey])), [0, 0, 0]);
    // With topology stable and no measured recovery/rebase, actual displacement decomposes into
    // ordinary exact-simulation evolution plus the instantaneous exact correction contribution.
    const physicsOnly = sub(actual, correction);
    const actualMagnitude = magnitude(actual);
    const correctionMagnitude = magnitude(correction);
    const physicsOnlyMagnitude = magnitude(physicsOnly);
    return {
      actual,
      correction,
      physicsOnly,
      actualMagnitude,
      correctionMagnitude,
      physicsOnlyMagnitude,
      correctionOpposesPhysics: correctionMagnitude > 1e-9 && physicsOnlyMagnitude > 1e-9 && dot(correction, physicsOnly) < 0,
      visibleDirectionReversed: actualMagnitude > 1e-6 && physicsOnlyMagnitude > 1e-6 && dot(actual, physicsOnly) < 0,
      movementRetention: physicsOnlyMagnitude > 1e-9 ? actualMagnitude / physicsOnlyMagnitude : null,
    };
  };

  intervals.push({
    t0: previous.t,
    t1: current.t,
    dtMs: current.t - previous.t,
    tickDelta: Number.isInteger(previous.localBoundaryTick) && Number.isInteger(current.localBoundaryTick)
      ? current.localBoundaryTick - previous.localBoundaryTick
      : null,
    correctionEvents: intervalCorrections.length,
    correctionReasons: intervalCorrections.reduce((counts, event) => {
      counts[event.reason] = (counts[event.reason] || 0) + 1;
      return counts;
    }, {}),
    self: summarizeEntity("self", "selfVector"),
    remote: summarizeEntity("remote", "remoteVector"),
    prop: summarizeEntity("prop", "propVector"),
  });
}

const entitySummary = (key) => {
  const withCorrection = intervals.filter((interval) => interval[key].correctionMagnitude > 1e-9);
  const reversals = withCorrection.filter((interval) => interval[key].visibleDirectionReversed);
  const opposing = withCorrection.filter((interval) => interval[key].correctionOpposesPhysics);
  const nearStalls = opposing.filter((interval) => interval[key].physicsOnlyMagnitude > 1e-6 && interval[key].movementRetention <= 0.25);
  const amplifications = withCorrection.filter((interval) => {
    const entity = interval[key];
    return entity.physicsOnlyMagnitude > 1e-6 && dot(entity.actual, entity.physicsOnly) > 0 && entity.movementRetention >= 2;
  });
  const magnitudes = withCorrection.map((interval) => interval[key].correctionMagnitude);
  return {
    correctionFrames: withCorrection.length,
    correctionMagnitude: summarize(magnitudes),
    directionReversalFrames: reversals.length,
    opposingCorrectionFrames: opposing.length,
    nearStallFrames: nearStalls.length,
    amplificationFrames: amplifications.length,
    strongestCancellation: nearStalls.length
      ? nearStalls.reduce((best, interval) => interval[key].movementRetention < best[key].movementRetention ? interval : best)
      : null,
    largestCorrectionFrame: withCorrection.length
      ? withCorrection.reduce((best, interval) => interval[key].correctionMagnitude > best[key].correctionMagnitude ? interval : best)
      : null,
  };
};

const reasonSummary = corrections.reduce((summary, event) => {
  const reason = event.reason || "unknown";
  const bucket = summary[reason] ||= { events: 0, selfNonzero: 0, remoteNonzero: 0, propNonzero: 0 };
  bucket.events += 1;
  if (magnitude(vector(event.selfVector)) > 1e-9) bucket.selfNonzero += 1;
  if (magnitude(vector(event.remoteVector)) > 1e-9) bucket.remoteNonzero += 1;
  if (magnitude(vector(event.propVector)) > 1e-9) bucket.propNonzero += 1;
  return summary;
}, {});

const result = {
  revision: "world-v0-smoothness-render-correction-component-v6-analyzer-v1",
  sourceRevision: evidence.revision,
  contractStatus: "causal negative-control characterization only; not an Owner perceptual SLO",
  assumptions: {
    samePerformanceClock: "render samples use rAF timestamp and correction hook uses performance.now() in the same browser page",
    stableMeasuredTopology: true,
    measuredRecoveryDelta: evidence.authoritySilenceResumeDelta,
    exactnessDelta: evidence.guardMismatchDelta,
    decomposition: "presented displacement = physics-only exact evolution + summed pre-to-post correction displacement inside the render interval",
  },
  pressure: {
    rawPeerSuperseded: evidence.apparatus?.rawPeer?.superseded ?? null,
    correctionDelta: evidence.correctionDelta,
    serverLateDelta: evidence.serverLateDelta,
    guardMismatchDelta: evidence.guardMismatchDelta,
    authoritySilenceResumeDelta: evidence.authoritySilenceResumeDelta,
  },
  reasonSummary,
  self: entitySummary("self"),
  remote: entitySummary("remote"),
  prop: entitySummary("prop"),
};

result.signature = {
  mutableFuturePressurePresent: Number(result.pressure.rawPeerSuperseded) > 0,
  exactnessPreserved: result.pressure.guardMismatchDelta === 0,
  recoveryExcludedFromMeasuredWindow: result.pressure.authoritySilenceResumeDelta === 0,
  remoteCorrectionReachedPresentationIntervals: result.remote.correctionFrames > 0,
  reconciliationChangedVisibleTrajectoryDirectionOrNearlyStalledIt:
    result.remote.directionReversalFrames > 0 || result.remote.nearStallFrames > 0,
};
result.verdict = Object.values(result.signature).every(Boolean)
  ? "RECONCILIATION_RENDER_TRAJECTORY_DISTORTION_REPRODUCED"
  : "RECONCILIATION_RENDER_TRAJECTORY_DISTORTION_NOT_REPRODUCED";

writeFileSync(output, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
console.log(result.verdict);
