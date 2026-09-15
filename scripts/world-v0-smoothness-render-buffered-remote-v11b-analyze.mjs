import { readFileSync, writeFileSync } from "node:fs";

const input = process.argv[2];
const output = process.argv[3] || "world-v0-smoothness-buffered-remote-v11b-analysis.json";
if (!input) throw new Error("usage: node world-v0-smoothness-render-buffered-remote-v11b-analyze.mjs <capture.json> [output.json]");
const source = JSON.parse(readFileSync(input, "utf8"));
const timeline = source.confirmedTimelineV11 || {};
const presentation = source.bufferedRemoteV11b || {};
const samples = Array.isArray(source.samples) ? source.samples : [];

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1))];
}
function summary(values) {
  const clean = values.filter(Number.isFinite);
  return {
    count: clean.length,
    p50: percentile(clean, 0.5),
    p95: percentile(clean, 0.95),
    p99: percentile(clean, 0.99),
    max: clean.length ? Math.max(...clean) : 0,
    mean: clean.length ? clean.reduce((sum, value) => sum + value, 0) / clean.length : 0,
  };
}
function distance3(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return null;
  return Math.hypot((b[0] ?? 0) - (a[0] ?? 0), (b[1] ?? 0) - (a[1] ?? 0), (b[2] ?? 0) - (a[2] ?? 0));
}

const intervals = [];
for (let index = 1; index < samples.length; index += 1) {
  const a = samples[index - 1];
  const b = samples[index];
  const dtMs = b.t - a.t;
  if (!(dtMs >= 5 && dtMs <= 50)) continue;
  const step = distance3(a.remote, b.remote);
  if (!Number.isFinite(step)) continue;
  const correctionDelta = Math.max(0, (b.corrections ?? 0) - (a.corrections ?? 0));
  intervals.push({
    dtMs,
    step,
    speed: step / (dtMs / 1000),
    correctionDelta,
    correctionAssociated: correctionDelta > 0 || Boolean(a.correctionWindowActive) || Boolean(b.correctionWindowActive),
    boundaryFrom: a.localBoundaryTick,
    boundaryTo: b.localBoundaryTick,
  });
}
const correctionIntervals = intervals.filter((entry) => entry.correctionAssociated);
const ordinaryIntervals = intervals.filter((entry) => !entry.correctionAssociated);
const correctionSteps = correctionIntervals.map((entry) => entry.step);
const ordinarySteps = ordinaryIntervals.map((entry) => entry.step);
const ordinaryP95 = percentile(ordinarySteps, 0.95);
const correctionP95 = percentile(correctionSteps, 0.95);

const presentationSamples = Array.isArray(presentation.samples) ? presentation.samples : [];
const spatialOffsets = presentationSamples.map((entry) => entry.spatialOffset);
const presentationLagTicks = presentationSamples.map((entry) =>
  Number.isFinite(entry.localBoundary) && Number.isFinite(entry.presentationBoundary)
    ? entry.localBoundary - entry.presentationBoundary
    : NaN
);
const segmentEvents = Array.isArray(presentation.segmentEvents) ? presentation.segmentEvents : [];
const segmentDurations = segmentEvents.map((entry) => entry.durationMs);
const segmentBoundarySpans = segmentEvents.map((entry) => entry.targetBoundary - entry.fromBoundary);

const commitments = Array.isArray(timeline.commitments) ? timeline.commitments : [];
const uniqueBoundaries = [...new Set(commitments.map((entry) => entry.boundary).filter(Number.isInteger))].sort((a, b) => a - b);
const commitGaps = [];
for (let i = 1; i < uniqueBoundaries.length; i += 1) commitGaps.push(uniqueBoundaries[i] - uniqueBoundaries[i - 1]);
const revisionViolations = Array.isArray(timeline.revisionViolations) ? timeline.revisionViolations : [];
const missingCommitSamples = Array.isArray(timeline.missingCommitSamples) ? timeline.missingCommitSamples : [];
const timelineFrames = Array.isArray(timeline.frameSamples) ? timeline.frameSamples : [];
const newestConfirmedLag = timelineFrames.map((entry) => entry.lagTicks);

const rawPeerSuperseded = source.apparatus?.rawPeer?.superseded ?? 0;
const signature = {
  mutableFuturePressurePresent: rawPeerSuperseded > 0,
  exactnessPreserved: source.guardMismatchDelta === 0,
  recoveryExcludedFromMeasuredWindow: source.authoritySilenceResumeDelta === 0,
  committedTimelinePresent: uniqueBoundaries.length >= 2,
  committedTimelineImmutable: revisionViolations.length === 0,
  guardCommitSamplesPresent: missingCommitSamples.length === 0,
  bufferedPresentationEnabled: presentation.enabled === true,
  bufferedPresentationSampled: presentationSamples.length > 0,
  visibleRemoteIntervalsSampled: intervals.length > 0,
};
const comparable = Object.values(signature).every(Boolean);

const result = {
  revision: "world-v0-smoothness-buffered-remote-v11b-analysis-v1",
  sourceRevision: source.revision ?? null,
  status: "test-only confirmed-anchor remote presentation characterization; no Owner-ready smoothness SLO asserted",
  pressure: {
    rawPeerSuperseded,
    correctionDelta: source.correctionDelta ?? null,
    serverLateDelta: source.serverLateDelta ?? null,
    guardMismatchDelta: source.guardMismatchDelta ?? null,
    authoritySilenceResumeDelta: source.authoritySilenceResumeDelta ?? null,
  },
  confirmedTimeline: {
    uniqueCommitments: uniqueBoundaries.length,
    commitGapTicks: summary(commitGaps),
    newestConfirmedLagTicks: summary(newestConfirmedLag),
    revisionViolations: revisionViolations.length,
    missingCommitSamples: missingCommitSamples.length,
  },
  presentation: {
    anchorsRetained: Array.isArray(presentation.anchors) ? presentation.anchors.length : 0,
    samples: presentationSamples.length,
    segmentEvents: segmentEvents.length,
    segmentDurationMs: summary(segmentDurations),
    segmentBoundarySpanTicks: summary(segmentBoundarySpans),
    localMinusPresentationBoundaryTicks: summary(presentationLagTicks),
    spatialOffsetFromExactMeters: summary(spatialOffsets),
  },
  visibleRemote: {
    validIntervals: intervals.length,
    allStepMeters: summary(intervals.map((entry) => entry.step)),
    allSpeedMetersPerSecond: summary(intervals.map((entry) => entry.speed)),
    correctionAssociatedIntervals: correctionIntervals.length,
    correctionAssociatedStepMeters: summary(correctionSteps),
    ordinaryIntervals: ordinaryIntervals.length,
    ordinaryStepMeters: summary(ordinarySteps),
    correctionToOrdinaryP95StepRatio: ordinaryP95 > 0 ? correctionP95 / ordinaryP95 : null,
    worstCorrectionAssociated: [...correctionIntervals].sort((a, b) => b.step - a.step).slice(0, 12),
  },
  signature,
  verdict: comparable ? "BUFFERED_REMOTE_PRESENTATION_CHARACTERIZED" : "BUFFERED_REMOTE_PRESENTATION_NOT_COMPARABLE",
};

writeFileSync(output, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
console.log(result.verdict);
if (!comparable) process.exitCode = 1;
