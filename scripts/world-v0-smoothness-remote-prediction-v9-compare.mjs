import { readFileSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
if (args.length < 3) throw new Error("usage: node world-v0-smoothness-remote-prediction-v9-compare.mjs <analysis...> [--output=file.json]");
const outputArg = args.find((arg) => arg.startsWith("--output="));
const output = outputArg ? outputArg.slice("--output=".length) : "world-v0-smoothness-remote-prediction-v9-comparison.json";
const paths = args.filter((arg) => !arg.startsWith("--output="));

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
});

const all = paths.map((path) => ({ path, data: JSON.parse(readFileSync(path, "utf8")) }));
const usable = all.filter(({ data }) => data.verdict === "REMOTE_PREDICTION_POLICY_CHARACTERIZED");
const rejected = all.filter(({ data }) => data.verdict !== "REMOTE_PREDICTION_POLICY_CHARACTERIZED").map(({ path, data }) => ({
  path,
  factor: data.fallbackFactor,
  verdict: data.verdict,
  pressure: data.pressure,
}));

const byFactor = new Map();
for (const entry of usable) {
  const factor = String(entry.data.fallbackFactor);
  if (!byFactor.has(factor)) byFactor.set(factor, []);
  byFactor.get(factor).push(entry);
}
const factors = [...byFactor.keys()].sort((a, b) => Number(b) - Number(a));
if (factors.length < 2) throw new Error(`need at least two usable factors, got ${factors.join(",")}`);

const pooledSamples = {};
const rewindsByFactor = new Map();
for (const factor of factors) {
  const samples = byFactor.get(factor).flatMap(({ data }) => data.samples || []);
  pooledSamples[factor] = samples;
  rewindsByFactor.set(factor, new Set(samples.map((sample) => Number(sample.rewind))));
}
const commonRewinds = [...rewindsByFactor.get(factors[0])]
  .filter((rewind) => factors.every((factor) => rewindsByFactor.get(factor).has(rewind)))
  .sort((a, b) => a - b);

const matchedByRewind = {};
for (const rewind of commonRewinds) {
  matchedByRewind[String(rewind)] = Object.fromEntries(factors.map((factor) => {
    const samples = pooledSamples[factor].filter((sample) => Number(sample.rewind) === rewind);
    return [factor, {
      correctionMeters: summarize(samples.map((sample) => Number(sample.remoteCorrection))),
      inputDelta: summarize(samples.map((sample) => Number(sample.remoteInputDelta))),
      usedRemoteMagnitude: summarize(samples.map((sample) => Number(sample.usedRemoteMagnitude))),
    }];
  }));
}

const weightedMatched = Object.fromEntries(factors.map((factor) => {
  const values = commonRewinds.flatMap((rewind) => pooledSamples[factor]
    .filter((sample) => Number(sample.rewind) === rewind)
    .map((sample) => Number(sample.remoteCorrection)));
  return [factor, summarize(values)];
}));

// Equal-age score: each common rewind contributes one median, so a factor cannot win merely
// because its run happened to contain more easy one-tick corrections.
const equalAge = Object.fromEntries(factors.map((factor) => {
  const perAgeMedians = commonRewinds.map((rewind) => matchedByRewind[String(rewind)][factor].correctionMeters.p50);
  return [factor, {
    commonAges: perAgeMedians.length,
    meanOfAgeMedians: perAgeMedians.length ? perAgeMedians.reduce((sum, value) => sum + value, 0) / perAgeMedians.length : null,
    maxAgeMedian: perAgeMedians.length ? Math.max(...perAgeMedians) : null,
  }];
}));

const result = {
  revision: "world-v0-smoothness-remote-prediction-v9-comparison-v1",
  status: "matched-rewind policy comparison; characterization, not yet canonical policy selection",
  inputs: all.map(({ path, data }) => ({ path, factor: data.fallbackFactor, verdict: data.verdict, pressure: data.pressure })),
  usableRunsByFactor: Object.fromEntries(factors.map((factor) => [factor, byFactor.get(factor).length])),
  rejectedRuns: rejected,
  commonRewinds,
  matchedByRewind,
  pooledAcrossCommonRewinds: weightedMatched,
  equalAge,
};
result.signature = {
  multiplePoliciesUsable: factors.length >= 2,
  commonRewindAgesPresent: commonRewinds.length > 0,
  everyFactorRepresented: factors.every((factor) => byFactor.get(factor).length > 0),
};
result.verdict = Object.values(result.signature).every(Boolean)
  ? "REMOTE_PREDICTION_POLICIES_MATCHED_AGE_COMPARABLE"
  : "REMOTE_PREDICTION_POLICIES_NOT_COMPARABLE";

writeFileSync(output, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
console.log(result.verdict);
