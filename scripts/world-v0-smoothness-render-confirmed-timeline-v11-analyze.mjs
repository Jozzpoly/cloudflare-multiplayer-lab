import { readFileSync, writeFileSync } from "node:fs";

const input = process.argv[2];
const output = process.argv[3] || "world-v0-smoothness-confirmed-timeline-v11-analysis.json";
if (!input) throw new Error("usage: node world-v0-smoothness-render-confirmed-timeline-v11-analyze.mjs <capture.json> [output.json]");
const source = JSON.parse(readFileSync(input, "utf8"));
const timeline = source.confirmedTimelineV11 || {};
const commitments = Array.isArray(timeline.commitments) ? timeline.commitments : [];
const frameSamples = Array.isArray(timeline.frameSamples) ? timeline.frameSamples : [];
const revisionViolations = Array.isArray(timeline.revisionViolations) ? timeline.revisionViolations : [];
const missingCommitSamples = Array.isArray(timeline.missingCommitSamples) ? timeline.missingCommitSamples : [];

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

const uniqueByBoundary = new Map();
for (const commitment of commitments) {
  if (!Number.isInteger(commitment.boundary)) continue;
  if (!uniqueByBoundary.has(commitment.boundary)) uniqueByBoundary.set(commitment.boundary, commitment);
}
const uniqueCommitments = [...uniqueByBoundary.values()].sort((a, b) => a.boundary - b.boundary);
const commitGaps = [];
for (let i = 1; i < uniqueCommitments.length; i += 1) {
  commitGaps.push(uniqueCommitments[i].boundary - uniqueCommitments[i - 1].boundary);
}
const commitLagTicks = uniqueCommitments.map((entry) => entry.lagTicks);
const validFrameSamples = frameSamples.filter((entry) => Number.isInteger(entry.localBoundary));
const frameWithCommit = validFrameSamples.filter((entry) => Number.isInteger(entry.newestCommittedBoundary) && Number.isFinite(entry.lagTicks));
const frameWithTwoCommits = frameWithCommit.filter((entry) => (entry.committedCount ?? 0) >= 2);
const frameLagTicks = frameWithCommit.map((entry) => entry.lagTicks);
const spanTicks = uniqueCommitments.length > 1
  ? uniqueCommitments[uniqueCommitments.length - 1].boundary - uniqueCommitments[0].boundary + 1
  : uniqueCommitments.length;
const positionlessCommits = uniqueCommitments.filter((entry) => !Array.isArray(entry.position)).length;
const rawPeerSuperseded = source.apparatus?.rawPeer?.superseded ?? 0;

const signature = {
  mutableFuturePressurePresent: rawPeerSuperseded > 0,
  exactnessPreserved: source.guardMismatchDelta === 0,
  recoveryExcludedFromMeasuredWindow: source.authoritySilenceResumeDelta === 0,
  committedSamplesObserved: uniqueCommitments.length > 0,
  committedRemotePositionsObserved: uniqueCommitments.length > 0 && positionlessCommits === 0,
  committedBoundariesNeverRevised: revisionViolations.length === 0,
  guardCommitSamplesPresent: missingCommitSamples.length === 0,
  frameFreshnessObserved: frameWithCommit.length > 0,
};
const comparable = Object.values(signature).every(Boolean);

const result = {
  revision: "world-v0-smoothness-confirmed-timeline-v11-analysis-v1",
  sourceRevision: source.revision ?? null,
  status: "authority-confirmed remote presentation timeline characterization; no presentation SLO asserted",
  pressure: {
    rawPeerSuperseded,
    correctionDelta: source.correctionDelta ?? null,
    serverLateDelta: source.serverLateDelta ?? null,
    guardMismatchDelta: source.guardMismatchDelta ?? null,
    authoritySilenceResumeDelta: source.authoritySilenceResumeDelta ?? null,
  },
  commitments: {
    rawEvents: commitments.length,
    uniqueBoundaries: uniqueCommitments.length,
    firstBoundary: uniqueCommitments[0]?.boundary ?? null,
    lastBoundary: uniqueCommitments.at(-1)?.boundary ?? null,
    spanTicks,
    boundaryCoverageRatio: spanTicks ? uniqueCommitments.length / spanTicks : 0,
    positionlessCommits,
    lagTicks: summary(commitLagTicks),
    gapTicks: summary(commitGaps),
    gapsOverOneTick: commitGaps.filter((gap) => gap > 1).length,
    maxGapTicks: commitGaps.length ? Math.max(...commitGaps) : 0,
  },
  frames: {
    sampled: validFrameSamples.length,
    withCommittedAnchor: frameWithCommit.length,
    withTwoCommittedAnchors: frameWithTwoCommits.length,
    anchorCoverageRatio: validFrameSamples.length ? frameWithCommit.length / validFrameSamples.length : 0,
    interpolationReadyRatio: validFrameSamples.length ? frameWithTwoCommits.length / validFrameSamples.length : 0,
    newestCommittedLagTicks: summary(frameLagTicks),
  },
  integrity: {
    revisionViolations: revisionViolations.length,
    revisionViolationSamples: revisionViolations.slice(0, 16),
    missingCommitSamples: missingCommitSamples.length,
    missingCommitSampleExamples: missingCommitSamples.slice(0, 16),
  },
  signature,
  verdict: comparable ? "CONFIRMED_PRESENTATION_TIMELINE_CHARACTERIZED" : "CONFIRMED_PRESENTATION_TIMELINE_NOT_COMPARABLE",
};

writeFileSync(output, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
console.log(result.verdict);
if (!comparable) process.exitCode = 1;
