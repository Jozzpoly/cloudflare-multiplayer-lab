import { readFileSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const outputArg = args.find((arg) => arg.startsWith("--output="));
const output = outputArg ? outputArg.slice("--output=".length) : "world-v0-smoothness-tentative-trust-v10-comparison.json";
const paths = args.filter((arg) => !arg.startsWith("--output="));
if (paths.length < 2) throw new Error("V10 comparator needs at least two analysis files");

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
  max: values.length ? Math.max(...values) : 0,
  mean: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0,
  sum: values.reduce((sum, value) => sum + value, 0),
});

const loaded = paths.map((path) => ({ path, data: JSON.parse(readFileSync(path, "utf8")) }));
const usable = loaded.filter(({ data }) => data.verdict === "TENTATIVE_TRUST_POLICY_CHARACTERIZED");
const rejected = loaded.filter(({ data }) => data.verdict !== "TENTATIVE_TRUST_POLICY_CHARACTERIZED");
const byAlpha = new Map();
for (const entry of usable) {
  const alpha = String(entry.data.alpha);
  if (!byAlpha.has(alpha)) byAlpha.set(alpha, []);
  byAlpha.get(alpha).push(entry);
}
const alphas = [...byAlpha.keys()].sort((a, b) => Number(b) - Number(a));
if (alphas.length < 2) throw new Error(`need at least two usable V10 alphas, got ${alphas.join(",")}`);

const pooledSamples = Object.fromEntries(alphas.map((alpha) => [alpha, byAlpha.get(alpha).flatMap(({ data }) => data.samples || [])]));
const keySetByAlpha = new Map(alphas.map((alpha) => [alpha, new Set(pooledSamples[alpha].map((sample) => `${sample.reason}|${sample.rewind}`))]));
const commonReasonRewind = [...keySetByAlpha.get(alphas[0])]
  .filter((key) => alphas.every((alpha) => keySetByAlpha.get(alpha).has(key)))
  .sort();

const matched = {};
for (const key of commonReasonRewind) {
  matched[key] = Object.fromEntries(alphas.map((alpha) => {
    const samples = pooledSamples[alpha].filter((sample) => `${sample.reason}|${sample.rewind}` === key);
    return [alpha, {
      correctionMeters: summarize(samples.map((sample) => Number(sample.remoteCorrection))),
      inputDelta: summarize(samples.map((sample) => Number(sample.remoteInputDelta))),
    }];
  }));
}

const policySummary = Object.fromEntries(alphas.map((alpha) => {
  const runs = byAlpha.get(alpha).map(({ data }) => data);
  const samples = pooledSamples[alpha];
  const reasons = {};
  for (const reason of [...new Set(samples.map((sample) => sample.reason))].sort()) {
    const reasonSamples = samples.filter((sample) => sample.reason === reason);
    reasons[reason] = {
      events: reasonSamples.length,
      correctionMeters: summarize(reasonSamples.map((sample) => Number(sample.remoteCorrection))),
    };
  }
  return [alpha, {
    usableRuns: runs.length,
    runMaxCorrectionMeters: summarize(runs.map((run) => Number(run.totalRemoteCorrection.max))),
    runP95CorrectionMeters: summarize(runs.map((run) => Number(run.totalRemoteCorrection.p95))),
    runSumCorrectionMeters: summarize(runs.map((run) => Number(run.totalRemoteCorrection.sum))),
    pooledRemoteCorrectionMeters: summarize(samples.map((sample) => Number(sample.remoteCorrection))),
    byReason: reasons,
  }];
}));

const equalMatchedKey = Object.fromEntries(alphas.map((alpha) => {
  const keyMedians = commonReasonRewind.map((key) => matched[key][alpha].correctionMeters.p50);
  return [alpha, {
    commonKeys: keyMedians.length,
    meanOfKeyMedians: keyMedians.length ? keyMedians.reduce((sum, value) => sum + value, 0) / keyMedians.length : null,
    maxKeyMedian: keyMedians.length ? Math.max(...keyMedians) : null,
  }];
}));

const result = {
  revision: "world-v0-smoothness-tentative-trust-v10-comparison-v1",
  status: "matched source+rewind comparison plus total correction burden; characterization only",
  inputs: loaded.map(({ path, data }) => ({ path, alpha: data.alpha, verdict: data.verdict, pressure: data.pressure })),
  rejectedRuns: rejected.map(({ path, data }) => ({ path, alpha: data.alpha, verdict: data.verdict, pressure: data.pressure })),
  alphas,
  commonReasonRewind,
  matched,
  policySummary,
  equalMatchedKey,
};
result.signature = {
  multiplePoliciesUsable: alphas.length >= 2,
  commonMatchedKeysPresent: commonReasonRewind.length > 0,
  everyPolicyRepresented: alphas.every((alpha) => byAlpha.get(alpha).length > 0),
};
result.verdict = Object.values(result.signature).every(Boolean)
  ? "TENTATIVE_TRUST_POLICIES_COMPARABLE"
  : "TENTATIVE_TRUST_POLICIES_NOT_COMPARABLE";

writeFileSync(output, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
console.log(result.verdict);
