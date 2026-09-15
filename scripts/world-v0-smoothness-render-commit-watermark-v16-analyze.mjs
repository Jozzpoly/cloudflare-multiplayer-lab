import { readFileSync, writeFileSync } from "node:fs";

const input = process.argv[2];
const output = process.argv[3] || "world-v0-smoothness-commit-watermark-v16-analysis.json";
if (!input) throw new Error("usage: node world-v0-smoothness-render-commit-watermark-v16-analyze.mjs <capture.json> [output.json]");

const source = JSON.parse(readFileSync(input, "utf8"));
const v16 = source.commitWatermarkV16 || {};
const delay = source.authorityDelayV16 || {};
const mode = String(v16.mode || "unknown");
const samples = Array.isArray(v16.samples) ? v16.samples : [];
const clampSamples = samples.filter((entry) => entry?.kind === "advance" && entry?.clamped === true);
const guardSamples = samples.filter((entry) => entry?.kind === "guard");
const commitSamples = samples.filter((entry) => entry?.kind === "commit");
const rawPeerErrors = Array.isArray(source.apparatus?.rawPeer?.errors) ? source.apparatus.rawPeer.errors : [];

const guardMismatchDelta = Number(source.guardMismatchDelta || 0);
const resumeDelta = Number(source.authoritySilenceResumeDelta || 0);
const safeBlindTicks = Number(v16.minSafeBlindTicks);
const clampFrames = Number(v16.clampFrames || 0);
const maxRawOvershootTicks = Number(v16.maxRawOvershootTicks || 0);
const maxLeadAfter = Number(v16.maxLeadAfter || 0);
const maxLeadBefore = Number(v16.maxLeadBefore || 0);
const maxClockAheadOfCommit = Number(v16.maxClockAheadOfCommit || 0);
const safetyViolations = Number(v16.safetyViolations || 0);
const authorityDelayRequestedMs = Number(source.authorityDelayRequestedMsV16 || 0);
const authorityMessagesScheduled = Number(delay.scheduled || 0);
const authorityMessagesDelivered = Number(delay.delivered || 0);
const authorityMessagesDropped = Number(delay.dropped || 0);
const commitObservations = Number(v16.commitObservations || 0);
const commitRegressions = Number(v16.commitRegressions || 0);

const common = {
  recognizedMode: mode === "clock" || mode === "commit",
  deterministicAuthorityDelayConfigured: authorityDelayRequestedMs >= 500,
  deterministicAuthorityDelayExercised: authorityMessagesScheduled > 0 && authorityMessagesDelivered > 0,
  commitWatermarkObserved: commitObservations > 0 && Number.isInteger(v16.currentCommittedBoundary),
  commitWatermarkMonotonic: commitRegressions === 0,
  guardObservationsPresent: Number(v16.guardObservations || 0) > 0,
  advanceObservationsPresent: Number(v16.advanceObservations || 0) > 0,
  rawPeerProtocolClean: rawPeerErrors.length === 0,
  clockCommitSeparationExercised: maxClockAheadOfCommit >= 20,
  clampDemandExercised: clampFrames > 0 && maxRawOvershootTicks > 0,
};

const clockSpecific = {
  clockControlCharacterized: true,
};
const commitSpecific = {
  commitExactnessPreserved: guardMismatchDelta === 0,
  commitAvoidedActorResume: resumeDelta === 0,
  commitDelayedCallbacksNotDropped: authorityMessagesDropped === 0,
  commitCeilingSafetyViolationsZero: safetyViolations === 0,
  commitCeilingStayedInsideRetainedHorizon: Number.isFinite(safeBlindTicks) && safeBlindTicks > 0 && maxLeadAfter <= safeBlindTicks - 1,
};

const modeSpecific = mode === "clock" ? clockSpecific : mode === "commit" ? commitSpecific : { invalidMode: false };
const apparatusPass = Object.values(common).every(Boolean);
const modePass = apparatusPass && Object.values(modeSpecific).every(Boolean);

let verdict = "COMMIT_WATERMARK_V16_NOT_COMPARABLE";
if (mode === "clock" && modePass) {
  verdict = guardMismatchDelta > 0
    ? "CLOCK_WATERMARK_CONTROL_DIVERGED"
    : "CLOCK_WATERMARK_CONTROL_EXACT_THIS_SPECIMEN";
} else if (mode === "commit" && modePass) {
  verdict = "COMMIT_WATERMARK_V16_SAFETY_CHARACTERIZED";
} else if (mode === "commit" && apparatusPass) {
  verdict = "COMMIT_WATERMARK_V16_SEMANTIC_FAIL";
}

const result = {
  revision: "world-v0-smoothness-commit-watermark-v16-analysis-v1",
  sourceRevision: source.revision ?? null,
  status: "test-only separation of authority clock from delivered-consumed canonical commit watermark under deterministic state-delivery lag",
  mode,
  authorityDelayRequestedMs,
  stressMs: source.stressMs ?? null,
  exactness: {
    guardMismatchDelta,
    correctionDelta: source.correctionDelta ?? null,
    serverLateDelta: source.serverLateDelta ?? null,
    authoritySilenceResumeDelta: resumeDelta,
  },
  watermark: {
    currentCommittedBoundary: v16.currentCommittedBoundary ?? null,
    currentClockBoundary: v16.currentClockBoundary ?? null,
    latestCommittedBoundary: v16.latestCommittedBoundary ?? null,
    commitObservations,
    commitRegressions,
    guardObservations: Number(v16.guardObservations || 0),
    advanceObservations: Number(v16.advanceObservations || 0),
    clampFrames,
    safeBlindTicks: Number.isFinite(safeBlindTicks) ? safeBlindTicks : null,
    maxRawOvershootTicks,
    maxLeadBefore,
    maxLeadAfter,
    maxClockAheadOfCommit,
    maxStepsPerAdvance: Number(v16.maxStepsPerAdvance || 0),
    safetyViolations,
    retainedClampSamples: clampSamples.length,
    retainedGuardSamples: guardSamples.length,
    retainedCommitSamples: commitSamples.length,
    strongestClampSamples: [...clampSamples]
      .sort((a, b) => ((b.rawTargetBoundary ?? 0) - (b.targetBoundary ?? 0)) - ((a.rawTargetBoundary ?? 0) - (a.targetBoundary ?? 0)))
      .slice(0, 12),
  },
  authorityDelivery: {
    scheduled: authorityMessagesScheduled,
    delivered: authorityMessagesDelivered,
    dropped: authorityMessagesDropped,
    byType: delay.byType || {},
    maxObservedBoundary: delay.maxObservedBoundary ?? null,
  },
  apparatus: {
    rawPeerSuperseded: source.apparatus?.rawPeer?.superseded ?? null,
    rawPeerErrors,
    controlCadence: source.controlCadence ?? null,
    cadence: source.cadence ?? null,
    sampleCount: source.sampleCount ?? null,
  },
  signature: { ...common, ...modeSpecific },
  verdict,
};

writeFileSync(output, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
console.log(verdict);
if (!modePass) process.exitCode = 1;
