import { readFileSync, writeFileSync } from "node:fs";

const input = process.argv[2];
const output = process.argv[3] || "world-v0-smoothness-render-presentation-v7-analysis.json";
if (!input) throw new Error("usage: node world-v0-smoothness-render-presentation-v7-analyze.mjs <evidence.json> [output.json]");
const evidence = JSON.parse(readFileSync(input, "utf8"));
const presentation = evidence.presentationV7;
if (!presentation) throw new Error("V7 presentation evidence missing");

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

const rawRemote = (evidence.correctionVectors || [])
  .map((event) => magnitude(event.remoteVector))
  .filter((value) => value > 1e-9);
const injections = presentation.injections || [];
const injectionCorrections = injections.map((event) => magnitude(event.exactCorrection)).filter((value) => value > 1e-9);
const residuals = injections.map((event) => Number(event.continuityResidualMagnitude) || 0);
const recoverySteps = (presentation.syncs || []).map((event) => Number(event.recoveryMagnitude) || 0).filter((value) => value > 1e-9);
const offsets = (presentation.syncs || []).map((event) => Number(event.offsetMagnitude) || 0);

const raw = summary(rawRemote);
const injected = summary(injectionCorrections);
const recovery = summary(recoverySteps);
const offset = summary(offsets);
const continuity = summary(residuals);
const safeRatio = (numerator, denominator) => denominator > 0 ? numerator / denominator : null;

const result = {
  revision: "world-v0-smoothness-render-presentation-v7-analysis-v1",
  sourceRevision: evidence.revision,
  status: "bounded presentation experiment; not yet canonical runtime or Owner-ready tuning",
  halfLifeMs: presentation.halfLifeMs,
  pressure: {
    rawPeerSuperseded: evidence.apparatus?.rawPeer?.superseded ?? null,
    correctionDelta: evidence.correctionDelta,
    serverLateDelta: evidence.serverLateDelta,
    guardMismatchDelta: evidence.guardMismatchDelta,
    authoritySilenceResumeDelta: evidence.authoritySilenceResumeDelta,
  },
  rawExactRemoteCorrection: raw,
  bridgeInjectionCorrection: injected,
  bridgeContinuityResidual: continuity,
  correctionRecoveryPerSync: recovery,
  visualOffsetFromExact: offset,
  transfer: {
    maxRecoveryToRawMax: safeRatio(recovery.max, raw.max),
    p95RecoveryToRawP95: safeRatio(recovery.p95, raw.p95),
    maxOffsetToRawMax: safeRatio(offset.max, raw.max),
  },
};

result.signature = {
  mutableFuturePressurePresent: Number(result.pressure.rawPeerSuperseded) > 0,
  exactnessPreserved: result.pressure.guardMismatchDelta === 0,
  recoveryExcludedFromMeasuredWindow: result.pressure.authoritySilenceResumeDelta === 0,
  remoteCorrectionObserved: raw.count > 0 && injections.length > 0,
  injectionContinuityExact: continuity.max <= 1e-7,
  recoveryActuallyDistributedAcrossSyncs: recovery.count > 0,
  maximumCorrectionTransferReduced: raw.max > 0 && recovery.max < raw.max,
};
result.verdict = Object.values(result.signature).every(Boolean)
  ? "REMOTE_CORRECTION_PRESENTATION_TRANSFER_REDUCED"
  : "REMOTE_CORRECTION_PRESENTATION_TRANSFER_NOT_PROVEN";

writeFileSync(output, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
console.log(result.verdict);
