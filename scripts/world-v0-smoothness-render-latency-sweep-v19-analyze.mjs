import { readFileSync, writeFileSync } from "node:fs";

const input = process.argv[2];
const output = process.argv[3] || "world-v0-smoothness-latency-sweep-v19-analysis.json";
if (!input) throw new Error("usage: node world-v0-smoothness-render-latency-sweep-v19-analyze.mjs <capture.json> [output.json]");

const source = JSON.parse(readFileSync(input, "utf8"));
const ceiling = source.predictionCeilingV15 || {};
const ordered = source.orderedInboundV17 || {};
const batching = source.correctionBatchingV18 || {};
const mode = String(batching.mode || "unknown");
const delayMs = Number(source.orderedInboundDelayRequestedMsV17 || source.requestedLatencyMs || 0);
const rawPeerErrors = Array.isArray(source.apparatus?.rawPeer?.errors) ? source.apparatus.rawPeer.errors : [];
const rawPeerSuperseded = Number(source.apparatus?.rawPeer?.superseded || 0);

const guardMismatchDelta = Number(source.guardMismatchDelta || 0);
const resumeDelta = Number(source.authoritySilenceResumeDelta || 0);
const correctionDelta = Number(source.correctionDelta || 0);
const serverLateDelta = Number(source.serverLateDelta || 0);
const safeBlindTicks = Number(ceiling.minSafeBlindTicks);
const clampFrames = Number(ceiling.clampFrames || 0);
const maxRawOvershootTicks = Number(ceiling.maxRawOvershootTicks || 0);
const maxLeadAfter = Number(ceiling.maxLeadAfter || 0);
const safetyViolations = Number(ceiling.safetyViolations || 0);
const scheduled = Number(ordered.scheduled || 0);
const delivered = Number(ordered.delivered || 0);
const dropped = Number(ordered.dropped || 0);
const orderViolations = Number(ordered.orderViolations || 0);
const queueDepth = Number(ordered.queueDepth || 0);
const maxQueueDepth = Number(ordered.maxQueueDepth || 0);
const maxActualDelayMs = Number(ordered.maxActualDelayMs || 0);
const consumedQueued = Number(ordered.byType?.world_v0_consumed || 0);
const peerQueued = Number(ordered.byType?.world_v0_peer_records || 0);
const controlIntervals = Number(source.controlCadence?.validIntervals || 0);
const stressCadenceRatio = Number(source.cadence?.validRatio || 0);
const stressCadenceIntervals = Number(source.cadence?.validIntervals || 0);
const stressSteps = Number(source.stressInfo?.steps || 0);
const routeCalls = Number(batching.routeCalls || 0);
const candidateTicks = Number(batching.candidateTicks || 0);
const immediateCorrections = Number(batching.immediateCorrections || 0);
const correctionFlushes = Number(batching.correctionFlushes || 0);
const flushesWithPending = Number(batching.flushesWithPending || 0);
const maxRouteCallsPerFlush = Number(batching.maxRouteCallsPerFlush || 0);
const pendingTicks = Array.isArray(batching.pendingTicks) ? batching.pendingTicks : [];
const highHistoryPressureExpected = delayMs >= 400;

const common = {
  recognizedMode: mode === "immediate" || mode === "coalesced",
  sweepDelayRecognized: [90, 180, 300, 550].includes(delayMs),
  orderedDelayExercised: scheduled > 0 && delivered > 0 && maxQueueDepth > 0,
  canonicalConsumedTrafficDelayed: consumedQueued > 0,
  mutablePeerTrafficDelayed: peerQueued > 0,
  fifoOrderPreserved: orderViolations === 0,
  orderedBacklogFullyDrained: queueDepth === 0,
  orderedTransportNotInvalidated: dropped === 0,
  requestedDelayMateriallyObserved: maxActualDelayMs >= delayMs * 0.75,
  controlCadenceQualified: controlIntervals >= 50,
  stressCadenceRatioQualified: stressCadenceRatio >= 0.75,
  stressCadenceEvidenceQualified: stressCadenceIntervals >= 180,
  stressInputRan: stressSteps > 0,
  rawPeerProtocolClean: rawPeerErrors.length === 0,
  rawPeerSupersessionActive: rawPeerSuperseded >= 50,
  correctionPressureObserved: correctionDelta > 0 && routeCalls > 0 && candidateTicks > 0,
  exactnessPreserved: guardMismatchDelta === 0,
  actorResumeAvoided: resumeDelta === 0,
  ceilingNeverAdvancedIntoUnsafeLead: Number.isFinite(safeBlindTicks) && maxLeadAfter <= safeBlindTicks - 1,
  ceilingSafetyViolationsZero: safetyViolations === 0,
  expectedHighPressureClampObserved: !highHistoryPressureExpected || (clampFrames > 0 && maxRawOvershootTicks > 0),
  noPendingCorrectionDebtAtSnapshot: pendingTicks.length === 0,
};

const modeSpecific = mode === "immediate"
  ? { immediateCorrectionsObserved: immediateCorrections > 0 }
  : mode === "coalesced"
    ? {
        coalescedCorrectionsObserved: flushesWithPending > 0 && correctionFlushes > 0,
        correctionTransactionsDoNotExceedRoutes: correctionFlushes <= routeCalls,
      }
    : { invalidMode: false };
const pass = Object.values(common).every(Boolean) && Object.values(modeSpecific).every(Boolean);

const result = {
  revision: "world-v0-smoothness-latency-sweep-v19-analysis-v1",
  sourceRevision: source.revision ?? null,
  status: "latency sweep of immediate versus exact coalesced correction semantics under legal FIFO receive delay",
  mode,
  delayMs,
  stressMs: source.stressMs ?? null,
  highHistoryPressureExpected,
  exactness: {
    guardMismatchDelta,
    authoritySilenceResumeDelta: resumeDelta,
    correctionDelta,
    serverLateDelta,
  },
  performance: {
    controlCadence: source.controlCadence ?? null,
    stressCadence: source.cadence ?? null,
    stressInfo: source.stressInfo ?? null,
    sampleCount: source.sampleCount ?? null,
  },
  ceiling: {
    clampFrames,
    maxRawOvershootTicks,
    maxSilenceTicks: Number(ceiling.maxSilenceTicks || 0),
    safeBlindTicks: Number.isFinite(safeBlindTicks) ? safeBlindTicks : null,
    maxLeadAfter,
    safetyViolations,
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
  },
  batching: {
    routeCalls,
    candidateTicks,
    immediateCorrections,
    flushesWithPending,
    correctionFlushes,
    maxPendingTicks: Number(batching.maxPendingTicks || 0),
    maxRouteCallsPerFlush,
    routeToExactCorrectionRatio: correctionDelta > 0 ? routeCalls / correctionDelta : null,
    pendingTicks,
  },
  presentationCharacterization: {
    self: source.self ?? null,
    remote: source.remote ?? null,
    correctionVectorSummary: source.correctionVectorSummary ?? null,
  },
  apparatus: {
    rawPeerSuperseded,
    rawPeerErrors,
  },
  signature: { ...common, ...modeSpecific },
  verdict: pass
    ? (mode === "immediate" ? "LATENCY_SWEEP_V19_IMMEDIATE_QUALIFIED" : "LATENCY_SWEEP_V19_COALESCED_QUALIFIED")
    : "LATENCY_SWEEP_V19_NOT_COMPARABLE",
};

writeFileSync(output, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
console.log(result.verdict);
if (!pass) process.exitCode = 1;
