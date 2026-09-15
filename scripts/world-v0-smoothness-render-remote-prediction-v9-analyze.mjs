import { readFileSync, writeFileSync } from "node:fs";

const input = process.argv[2];
const output = process.argv[3] || "world-v0-smoothness-render-remote-prediction-v9-analysis.json";
if (!input) throw new Error("usage: node world-v0-smoothness-render-remote-prediction-v9-analyze.mjs <evidence.json> [output.json]");

const evidence = JSON.parse(readFileSync(input, "utf8"));
const policy = evidence.remotePredictionV9;
if (!policy || !Number.isFinite(Number(policy.fallbackFactor))) throw new Error("V9 prediction policy evidence missing");
const vectors = evidence.correctionVectors || [];
const decisions = policy.corrections || [];
if (vectors.length !== decisions.length) throw new Error(`V9/V6 correction evidence count mismatch ${vectors.length} != ${decisions.length}`);

const magnitude = (vector) => Array.isArray(vector) ? Math.hypot(...vector.map(Number)) : 0;
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
  mean: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0,
});
const inputMagnitude = (input) => input ? Math.hypot(Number(input.x) || 0, Number(input.z) || 0) : 0;
const inputDelta = (before, after) => before && after
  ? Math.hypot((Number(after.x) || 0) - (Number(before.x) || 0), (Number(after.z) || 0) - (Number(before.z) || 0))
  : 0;
const bucketFor = (rewind) => {
  if (rewind <= 1) return "1";
  if (rewind === 2) return "2";
  if (rewind <= 5) return "3-5";
  if (rewind <= 9) return "6-9";
  return "10+";
};

const aligned = vectors.map((vector, index) => {
  const decision = decisions[index];
  for (const key of ["reason", "targetTick", "boundaryBefore"]) {
    if (vector[key] !== decision[key]) throw new Error(`V9/V6 correction alignment mismatch at ${index} field=${key}`);
  }
  const usedRemote = decision.usedBefore?.remote || null;
  const resolvedRemote = decision.resolvedAfter?.remote || null;
  return {
    index,
    reason: vector.reason,
    targetTick: vector.targetTick,
    boundaryBefore: vector.boundaryBefore,
    rewind: Number(decision.rewind),
    remoteCorrection: magnitude(vector.remoteVector),
    selfCorrection: magnitude(vector.selfVector),
    propCorrection: magnitude(vector.propVector),
    usedRemote,
    resolvedRemote,
    usedRemoteMagnitude: inputMagnitude(usedRemote),
    resolvedRemoteMagnitude: inputMagnitude(resolvedRemote),
    remoteInputDelta: inputDelta(usedRemote, resolvedRemote),
  };
});

const remotePeerCorrections = aligned.filter((event) => event.reason === "peer-record" && event.remoteCorrection > 1e-9);
const exactGroups = new Map();
const bucketGroups = new Map();
for (const event of remotePeerCorrections) {
  const exactKey = String(event.rewind);
  if (!exactGroups.has(exactKey)) exactGroups.set(exactKey, []);
  exactGroups.get(exactKey).push(event);
  const bucketKey = bucketFor(event.rewind);
  if (!bucketGroups.has(bucketKey)) bucketGroups.set(bucketKey, []);
  bucketGroups.get(bucketKey).push(event);
}

const summarizeGroup = (events) => ({
  events: events.length,
  correctionMeters: summarize(events.map((event) => event.remoteCorrection)),
  inputDelta: summarize(events.map((event) => event.remoteInputDelta)),
  usedRemoteMagnitude: summarize(events.map((event) => event.usedRemoteMagnitude)),
  resolvedRemoteMagnitude: summarize(events.map((event) => event.resolvedRemoteMagnitude)),
});
const exactRewind = Object.fromEntries([...exactGroups.entries()].sort((a, b) => Number(a[0]) - Number(b[0])).map(([key, events]) => [key, summarizeGroup(events)]));
const rewindBuckets = Object.fromEntries(["1", "2", "3-5", "6-9", "10+"].filter((key) => bucketGroups.has(key)).map((key) => [key, summarizeGroup(bucketGroups.get(key))]));

const result = {
  revision: "world-v0-smoothness-render-remote-prediction-v9-analysis-v1",
  sourceRevision: evidence.revision,
  status: "remote speculative-input characterization; policy comparison must use matched rewind ages and uncontaminated runs",
  fallbackFactor: Number(policy.fallbackFactor),
  pressure: {
    rawPeerSuperseded: evidence.apparatus?.rawPeer?.superseded ?? null,
    correctionDelta: evidence.correctionDelta,
    serverLateDelta: evidence.serverLateDelta,
    guardMismatchDelta: evidence.guardMismatchDelta,
    authoritySilenceResumeDelta: evidence.authoritySilenceResumeDelta,
  },
  alignment: {
    correctionVectors: vectors.length,
    policyCorrections: decisions.length,
    aligned: true,
  },
  remotePeerCorrection: summarize(remotePeerCorrections.map((event) => event.remoteCorrection)),
  rewind: summarize(remotePeerCorrections.map((event) => event.rewind)),
  remoteInputDelta: summarize(remotePeerCorrections.map((event) => event.remoteInputDelta)),
  exactRewind,
  rewindBuckets,
  samples: remotePeerCorrections,
};

result.signature = {
  policyResolved: Number.isFinite(result.fallbackFactor),
  mutableFuturePressurePresent: Number(result.pressure.rawPeerSuperseded) > 0,
  exactnessPreserved: result.pressure.guardMismatchDelta === 0,
  recoveryExcludedFromMeasuredWindow: result.pressure.authoritySilenceResumeDelta === 0,
  correctionEvidenceAligned: result.alignment.aligned,
  remotePeerCorrectionObserved: result.remotePeerCorrection.count > 0,
};
result.verdict = Object.values(result.signature).every(Boolean)
  ? "REMOTE_PREDICTION_POLICY_CHARACTERIZED"
  : "REMOTE_PREDICTION_POLICY_NOT_COMPARABLE";

writeFileSync(output, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
console.log(result.verdict);
