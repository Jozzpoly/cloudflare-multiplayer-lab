import { readFileSync, writeFileSync } from "node:fs";

const input = process.argv[2];
const output = process.argv[3] || "world-v0-smoothness-prediction-ceiling-v15-analysis.json";
if (!input) throw new Error("usage: node world-v0-smoothness-render-prediction-ceiling-v15-analyze.mjs <capture.json> [output.json]");

const source = JSON.parse(readFileSync(input, "utf8"));
const v15 = source.predictionCeilingV15 || {};
const authorityDelay = source.authorityDelayV15 || {};
const mode = String(v15.mode || "unknown");
const samples = Array.isArray(v15.samples) ? v15.samples : [];
const clampSamples = samples.filter((entry) => entry?.kind === "advance" && entry?.clamped === true);
const pressureSamples = samples.filter((entry) => entry?.kind === "guard" && entry?.pressure === true);
const rawPeerErrors = Array.isArray(source.apparatus?.rawPeer?.errors) ? source.apparatus.rawPeer.errors : [];

const guardMismatchDelta = Number(source.guardMismatchDelta || 0);
const resumeDelta = Number(source.authoritySilenceResumeDelta || 0);
const safeBlindTicks = Number(v15.minSafeBlindTicks);
const maxSilenceTicks = Number(v15.maxSilenceTicks || 0);
const pressureFrames = Number(v15.pressureFrames || 0);
const clampFrames = Number(v15.clampFrames || 0);
const maxRawOvershootTicks = Number(v15.maxRawOvershootTicks || 0);
const maxLeadAfter = Number(v15.maxLeadAfter || 0);
const safetyViolations = Number(v15.safetyViolations || 0);
const maxStepsPerAdvance = Number(v15.maxStepsPerAdvance || 0);
const authorityDelayRequestedMs = Number(source.authorityDelayRequestedMsV15 || 0);
const authorityMessagesScheduled = Number(authorityDelay.scheduled || 0);
const authorityMessagesDelivered = Number(authorityDelay.delivered || 0);

const common = {
  recognizedMode: mode === "baseline" || mode === "ceiling",
  deterministicAuthorityDelayConfigured: authorityDelayRequestedMs >= 500,
  deterministicAuthorityDelayExercised: authorityMessagesScheduled > 0 && authorityMessagesDelivered > 0,
  guardObservationsPresent: Number(v15.guardObservations || 0) > 0,
  advanceObservationsPresent: Number(v15.advanceObservations || 0) > 0,
  rawPeerProtocolClean: rawPeerErrors.length === 0,
  exactnessPreserved: guardMismatchDelta === 0,
};

const baselineSpecific = {
  baselineReachedHistoryPressure: pressureFrames > 0 && Number.isFinite(safeBlindTicks) && maxSilenceTicks >= safeBlindTicks,
  baselineTriggeredResume: resumeDelta > 0,
};
const ceilingSpecific = {
  ceilingPressureDemandPresent: clampFrames > 0 && maxRawOvershootTicks > 0,
  ceilingActuallyClamped: clampFrames > 0,
  ceilingAvoidedActorResume: resumeDelta === 0,
  ceilingNeverAdvancedIntoUnsafeLead: Number.isFinite(safeBlindTicks) && maxLeadAfter <= safeBlindTicks - 1,
  ceilingSafetyViolationsZero: safetyViolations === 0,
};

const modeSpecific = mode === "baseline" ? baselineSpecific : mode === "ceiling" ? ceilingSpecific : { invalidMode: false };
const comparable = Object.values(common).every(Boolean);
const modePass = comparable && Object.values(modeSpecific).every(Boolean);

const result = {
  revision: "world-v0-smoothness-prediction-ceiling-v15-analysis-v2-deterministic-authority-delay",
  sourceRevision: source.revision ?? null,
  status: "test-only retained-history prediction ceiling under deterministic authority-state delivery delay with live pong phase anchors",
  mode,
  authorityDelayRequestedMs,
  stressMs: source.stressMs ?? null,
  exactness: {
    guardMismatchDelta,
    correctionDelta: source.correctionDelta ?? null,
    serverLateDelta: source.serverLateDelta ?? null,
    authoritySilenceResumeDelta: resumeDelta,
  },
  ceiling: {
    guardObservations: Number(v15.guardObservations || 0),
    advanceObservations: Number(v15.advanceObservations || 0),
    pressureFrames,
    clampFrames,
    maxSilenceTicks,
    safeBlindTicks: Number.isFinite(safeBlindTicks) ? safeBlindTicks : null,
    maxRawOvershootTicks,
    maxLeadBefore: Number(v15.maxLeadBefore || 0),
    maxLeadAfter,
    maxStepsPerAdvance,
    safetyViolations,
    retainedClampSamples: clampSamples.length,
    retainedPressureSamples: pressureSamples.length,
    strongestClampSamples: [...clampSamples]
      .sort((a, b) => ((b.rawTargetBoundary ?? 0) - (b.targetBoundary ?? 0)) - ((a.rawTargetBoundary ?? 0) - (a.targetBoundary ?? 0)))
      .slice(0, 12),
  },
  authorityDelivery: {
    scheduled: authorityMessagesScheduled,
    delivered: authorityMessagesDelivered,
    dropped: Number(authorityDelay.dropped || 0),
    byType: authorityDelay.byType || {},
    maxObservedBoundary: authorityDelay.maxObservedBoundary ?? null,
  },
  apparatus: {
    rawPeerSuperseded: source.apparatus?.rawPeer?.superseded ?? null,
    rawPeerErrors,
    controlCadence: source.controlCadence ?? null,
    cadence: source.cadence ?? null,
    sampleCount: source.sampleCount ?? null,
  },
  signature: { ...common, ...modeSpecific },
  verdict: modePass
    ? (mode === "baseline" ? "PREDICTION_CEILING_BASELINE_RESUME_REPRODUCED" : "PREDICTION_CEILING_V15_SAFETY_CHARACTERIZED")
    : "PREDICTION_CEILING_V15_NOT_COMPARABLE",
};

writeFileSync(output, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
console.log(result.verdict);
if (!modePass) process.exitCode = 1;
