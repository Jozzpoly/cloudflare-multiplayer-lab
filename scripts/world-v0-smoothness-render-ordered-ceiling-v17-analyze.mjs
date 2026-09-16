import { readFileSync, writeFileSync } from "node:fs";

const input = process.argv[2];
const output = process.argv[3] || "world-v0-smoothness-ordered-ceiling-v17-analysis.json";
if (!input) throw new Error("usage: node world-v0-smoothness-render-ordered-ceiling-v17-analyze.mjs <capture.json> [output.json]");

const source = JSON.parse(readFileSync(input, "utf8"));
const v15 = source.predictionCeilingV15 || {};
const ordered = source.orderedInboundV17 || {};
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
const requestedDelayMs = Number(source.orderedInboundDelayRequestedMsV17 || 0);
const scheduled = Number(ordered.scheduled || 0);
const delivered = Number(ordered.delivered || 0);
const dropped = Number(ordered.dropped || 0);
const orderViolations = Number(ordered.orderViolations || 0);
const queueDepth = Number(ordered.queueDepth || 0);
const maxQueueDepth = Number(ordered.maxQueueDepth || 0);
const maxActualDelayMs = Number(ordered.maxActualDelayMs || 0);
const consumedQueued = Number(ordered.byType?.world_v0_consumed || 0);
const controlIntervals = Number(source.controlCadence?.validIntervals || 0);
const stressCadenceRatio = Number(source.cadence?.validRatio || 0);
const stressCadenceIntervals = Number(source.cadence?.validIntervals || 0);
const stressSteps = Number(source.stressInfo?.steps || 0);
const stressMs = Number(source.stressMs || 0);

const common = {
  recognizedMode: mode === "baseline" || mode === "ceiling",
  orderedDelayConfigured: requestedDelayMs >= 500,
  orderedDelayExercised: scheduled > 0 && delivered > 0 && maxQueueDepth > 0,
  canonicalConsumedTrafficDelayed: consumedQueued > 0,
  fifoOrderPreserved: orderViolations === 0,
  orderedBacklogFullyDrained: queueDepth === 0,
  requestedDelayMateriallyObserved: maxActualDelayMs >= requestedDelayMs * 0.8,
  controlCadenceQualified: controlIntervals >= 50,
  stressCadenceRatioQualified: stressCadenceRatio >= 0.75,
  stressCadenceEvidenceQualified: stressCadenceIntervals >= 180,
  stressInputStepsQualified: stressSteps >= stressMs / 20,
  guardObservationsPresent: Number(v15.guardObservations || 0) > 0,
  advanceObservationsPresent: Number(v15.advanceObservations || 0) > 0,
  rawPeerProtocolClean: rawPeerErrors.length === 0,
  exactnessPreserved: guardMismatchDelta === 0,
};

const baselineSpecific = {
  baselineReachedHistoryPressure: pressureFrames > 0 && Number.isFinite(safeBlindTicks) && maxSilenceTicks >= safeBlindTicks,
  baselineTriggeredActorResume: resumeDelta > 0,
};

const ceilingSpecific = {
  ceilingDemandPresent: clampFrames > 0 && maxRawOvershootTicks > 0,
  ceilingActuallyClamped: clampFrames > 0,
  ceilingAvoidedActorResume: resumeDelta === 0,
  ceilingNeverAdvancedIntoUnsafeLead: Number.isFinite(safeBlindTicks) && maxLeadAfter <= safeBlindTicks - 1,
  ceilingSafetyViolationsZero: safetyViolations === 0,
  ceilingDidNotInvalidateQueuedTransport: dropped === 0,
};

const modeSpecific = mode === "baseline"
  ? baselineSpecific
  : mode === "ceiling"
    ? ceilingSpecific
    : { invalidMode: false };

const comparable = Object.values(common).every(Boolean);
const modePass = comparable && Object.values(modeSpecific).every(Boolean);

const result = {
  revision: "world-v0-smoothness-ordered-ceiling-v17-analysis-v2-stress-cadence-qualified",
  sourceRevision: source.revision ?? null,
  status: "test-only hard prediction ceiling under legal receive-side FIFO delay; qualification mirrors inherited render-stress cadence gates",
  mode,
  requestedDelayMs,
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
  orderedInbound: {
    scheduled,
    delivered,
    dropped,
    orderViolations,
    queueDepth,
    maxQueueDepth,
    maxActualDelayMs,
    byType: ordered.byType || {},
    retainedEvents: Array.isArray(ordered.events) ? ordered.events.length : 0,
  },
  apparatus: {
    rawPeerSuperseded: source.apparatus?.rawPeer?.superseded ?? null,
    rawPeerErrors,
    controlCadence: source.controlCadence ?? null,
    cadence: source.cadence ?? null,
    stressInfo: source.stressInfo ?? null,
    sampleCount: source.sampleCount ?? null,
  },
  signature: { ...common, ...modeSpecific },
  verdict: modePass
    ? (mode === "baseline"
      ? "ORDERED_CEILING_V17_BASELINE_RESUME_REPRODUCED"
      : "ORDERED_CEILING_V17_QUALIFIED")
    : "ORDERED_CEILING_V17_NOT_COMPARABLE",
};

writeFileSync(output, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
console.log(result.verdict);
if (!modePass) process.exitCode = 1;
