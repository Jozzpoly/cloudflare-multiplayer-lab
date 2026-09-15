import { readFileSync, writeFileSync } from "node:fs";

const input = process.argv[2];
const output = process.argv[3] || "world-v0-smoothness-render-presentation-v8-analysis.json";
if (!input) throw new Error("usage: node world-v0-smoothness-render-presentation-v8-analyze.mjs <evidence.json> [output.json]");
const evidence = JSON.parse(readFileSync(input, "utf8"));
const presentation = evidence.presentationV8;
if (!presentation) throw new Error("V8 presentation evidence missing");

const magnitude = (vector) => Array.isArray(vector) ? Math.hypot(...vector) : 0;
const percentile = (values, p) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * p)));
  return sorted[index];
};
const summary = (values) => ({
  count: values.length,
  p50: percentile(values, 0.5),
  p95: percentile(values, 0.95),
  p99: percentile(values, 0.99),
  max: values.length ? Math.max(...values) : 0,
});
const safeRatio = (numerator, denominator) => denominator > 0 ? numerator / denominator : null;

const rawRemote = (evidence.correctionVectors || [])
  .map((event) => magnitude(event.remoteVector))
  .filter((value) => value > 1e-9);
const injections = presentation.injections || [];
const injectionCorrections = injections.map((event) => magnitude(event.exactCorrection)).filter((value) => value > 1e-9);
const immediateLeaks = injections.map((event) => Number(event.continuityResidualMagnitude) || 0).filter((value) => value > 1e-9);
const recoverySteps = (presentation.syncs || []).map((event) => Number(event.recoveryMagnitude) || 0).filter((value) => value > 1e-9);
const offsets = (presentation.syncs || []).map((event) => Number(event.offsetMagnitude) || 0);
const caps = [
  ...injections.map((event) => Number(event.capMeters)),
  ...(presentation.syncs || []).map((event) => Number(event.capMeters)),
].filter((value) => Number.isFinite(value) && value > 0);
const clampedEvents = injections.filter((event) => event.clamped);

const raw = summary(rawRemote);
const injected = summary(injectionCorrections);
const leak = summary(immediateLeaks);
const recovery = summary(recoverySteps);
const offset = summary(offsets);
const capMetersMin = caps.length ? Math.min(...caps) : null;
const capMetersMax = caps.length ? Math.max(...caps) : null;
const maxVisibleCorrectionComponent = Math.max(leak.max, recovery.max);

const result = {
  revision: "world-v0-smoothness-render-presentation-v8-analysis-v1",
  sourceRevision: evidence.revision,
  status: "bounded presentation-debt characterization; not yet canonical runtime or Owner-ready tuning",
  halfLifeMs: presentation.halfLifeMs,
  capTicks: presentation.capTicks,
  capMeters: { min: capMetersMin, max: capMetersMax },
  pressure: {
    rawPeerSuperseded: evidence.apparatus?.rawPeer?.superseded ?? null,
    correctionDelta: evidence.correctionDelta,
    serverLateDelta: evidence.serverLateDelta,
    guardMismatchDelta: evidence.guardMismatchDelta,
    authoritySilenceResumeDelta: evidence.authoritySilenceResumeDelta,
  },
  rawExactRemoteCorrection: raw,
  bridgeInjectionCorrection: injected,
  immediateCorrectionLeak: leak,
  correctionRecoveryPerSync: recovery,
  visualOffsetFromExact: offset,
  clamping: {
    correctionEvents: injections.length,
    clampedEvents: clampedEvents.length,
    clampedRatio: injections.length ? clampedEvents.length / injections.length : 0,
  },
  visibleCorrectionTransfer: {
    maxComponent: maxVisibleCorrectionComponent,
    maxComponentToRawMax: safeRatio(maxVisibleCorrectionComponent, raw.max),
    leakMaxToRawMax: safeRatio(leak.max, raw.max),
    recoveryMaxToRawMax: safeRatio(recovery.max, raw.max),
  },
};

const epsilon = 1e-7;
result.signature = {
  mutableFuturePressurePresent: Number(result.pressure.rawPeerSuperseded) > 0,
  exactnessPreserved: result.pressure.guardMismatchDelta === 0,
  recoveryExcludedFromMeasuredWindow: result.pressure.authoritySilenceResumeDelta === 0,
  remoteCorrectionObserved: raw.count > 0 && injections.length > 0,
  physicalCapResolved: Number.isFinite(capMetersMax) && capMetersMax > 0,
  presentationDebtBoundRespected: Number.isFinite(capMetersMax) && offset.max <= capMetersMax + epsilon,
  correctionTransferCharacterized: leak.count + recovery.count > 0,
};
result.candidateImprovement = {
  maximumCorrectionComponentReduced: raw.max > 0 && maxVisibleCorrectionComponent < raw.max,
  boundForcedImmediateLeak: clampedEvents.length > 0,
  maxOffsetMeters: offset.max,
  maxImmediateLeakMeters: leak.max,
  maxRecoveryStepMeters: recovery.max,
};
result.verdict = Object.values(result.signature).every(Boolean)
  ? "BOUNDED_REMOTE_PRESENTATION_DEBT_CHARACTERIZED"
  : "BOUNDED_REMOTE_PRESENTATION_DEBT_NOT_PROVEN";

writeFileSync(output, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
console.log(result.verdict);
