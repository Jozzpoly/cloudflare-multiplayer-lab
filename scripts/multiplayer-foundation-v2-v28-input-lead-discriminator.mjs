import { readFileSync, writeFileSync } from "node:fs";

const [l8Path, l10Path, l12Path, outputPath = "mf6-input-lead-discriminator.json"] = process.argv.slice(2);
if (!l8Path || !l10Path || !l12Path) {
  throw new Error("usage: node input-lead-discriminator.mjs <l8.json> <l10.json> <l12.json> [output.json]");
}

function load(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function hostileDiagnostic(result) {
  return result?.hostile?.diagnostic || result?.diagnostic?.hostile || null;
}

function summarize(label, result, expectedEffectiveLead) {
  const diagnostic = hostileDiagnostic(result);
  if (!diagnostic) throw new Error(`${label}: hostile diagnostic missing`);
  const scheduler = diagnostic.inputScheduler || {};
  const checks = diagnostic.checks || {};
  const proxy = diagnostic.proxy || {};
  const profile = proxy.profile || {};
  const rtt = diagnostic.rtt || {};
  const summary = {
    label,
    scriptVerdict: result.verdict,
    requestedInputLeadProbeTicks: result.requestedInputLeadProbeTicks ?? null,
    contractInputLeadTicks: scheduler.contractInputLeadTicks ?? null,
    effectiveInputLeadTicks: scheduler.inputLeadTicks ?? null,
    simulationLeadTicks: scheduler.simulationLeadTicks ?? null,
    exact: diagnostic.guardMismatches === 0 && diagnostic.firstStateMismatch == null,
    agencyDelivered: diagnostic.agencyDelivery?.delivered ?? null,
    agencyTotal: diagnostic.agencyDelivery?.total ?? null,
    agencyDeliveryRatio: diagnostic.agencyDelivery?.ratio ?? null,
    missedCommandIndexes: diagnostic.agencyDelivery?.missedCommandIndexes ?? [],
    agency: Boolean(
      checks.sustainedCanonicalAgency &&
      diagnostic.agencyDelivery?.total >= 8 &&
      diagnostic.agencyDelivery?.delivered === diagnostic.agencyDelivery?.total
    ),
    guardMatches: diagnostic.guardMatches ?? null,
    guardMismatches: diagnostic.guardMismatches ?? null,
    serverLateDelta: diagnostic.serverLateDelta ?? null,
    serverRejectedDelta: diagnostic.serverRejectedDelta ?? null,
    authoredDelta: diagnostic.inputSchedulerDelta?.authored ?? null,
    supersededDelta: diagnostic.inputSchedulerDelta?.superseded ?? null,
    latePerAuthored:
      Number.isFinite(diagnostic.serverLateDelta) &&
      Number.isFinite(diagnostic.inputSchedulerDelta?.authored) &&
      diagnostic.inputSchedulerDelta.authored > 0
        ? diagnostic.serverLateDelta / diagnostic.inputSchedulerDelta.authored
        : null,
    arrivalMargin: diagnostic.arrivalMargin || null,
    phaseError: {
      estimateLagTicks: diagnostic.phaseError?.estimateLagTicks || [],
      observedBoundaryLagTicks: diagnostic.phaseError?.observedBoundaryLagTicks || [],
    },
    commandOnsetTicks: (diagnostic.commandTrain?.commands || [])
      .map((command) => command.firstCanonicalOnsetTicks)
      .filter(Number.isFinite),
    commandWitnessCounts: (diagnostic.commandTrain?.commands || [])
      .map((command) => command.canonicalWitnessCount)
      .filter(Number.isFinite),
    commandAck: diagnostic.commandAck || [],
    authorityBoundaryDelta: diagnostic.authorityBoundaryDelta ?? null,
    localBoundaryDelta: diagnostic.localBoundaryDelta ?? null,
    rttSamples: rtt.samples ?? null,
    rttMedianMs: rtt.medianMs ?? null,
    rttP95Ms: rtt.p95Ms ?? null,
    profile: {
      name: profile.name ?? null,
      latencyMs: profile.latencyMs ?? null,
      jitterMs: profile.jitterMs ?? null,
    },
  };

  if (summary.contractInputLeadTicks !== 8) {
    throw new Error(`${label}: contract input lead drift ${summary.contractInputLeadTicks}`);
  }
  if (summary.effectiveInputLeadTicks !== expectedEffectiveLead) {
    throw new Error(`${label}: effective input lead ${summary.effectiveInputLeadTicks}, expected ${expectedEffectiveLead}`);
  }
  if (summary.simulationLeadTicks !== 2) {
    throw new Error(`${label}: simulation lead drift ${summary.simulationLeadTicks}`);
  }
  if (summary.profile.latencyMs !== 100 || summary.profile.jitterMs !== 25) {
    throw new Error(`${label}: hostile profile drift ${JSON.stringify(summary.profile)}`);
  }
  if (!Number.isInteger(summary.rttSamples) || summary.rttSamples < 3) {
    throw new Error(`${label}: insufficient hostile RTT samples ${summary.rttSamples}`);
  }
  return summary;
}

const l8 = summarize("L8-control", load(l8Path), 8);
const l10 = summarize("L10-treatment", load(l10Path), 10);
const l12 = summarize("L12-treatment", load(l12Path), 12);

function numericSummary(values) {
  const finite = values.filter(Number.isFinite);
  if (!finite.length) return { samples: 0, mean: null, min: null, max: null };
  return {
    samples: finite.length,
    mean: finite.reduce((sum, value) => sum + value, 0) / finite.length,
    min: Math.min(...finite),
    max: Math.max(...finite),
  };
}
for (const summary of [l8, l10, l12]) {
  summary.phaseError.estimateLagSummary = numericSummary(summary.phaseError.estimateLagTicks);
  summary.phaseError.observedBoundaryLagSummary = numericSummary(summary.phaseError.observedBoundaryLagTicks);
  summary.commandOnsetSummary = numericSummary(summary.commandOnsetTicks);
  summary.commandWitnessCountSummary = numericSummary(summary.commandWitnessCounts);
  summary.commandAckSummary = {
    viableRecords: numericSummary(summary.commandAck.map((entry) => entry.viableRecords)),
    lateRecords: numericSummary(summary.commandAck.map((entry) => entry.lateRecords)),
    maxArrivalMarginTicks: numericSummary(summary.commandAck.map((entry) => entry.maxArrivalMarginTicks)),
    survivingFutureSpanTicks: numericSummary(summary.commandAck.map((entry) => entry.survivingFutureSpanTicks)),
  };
}

let classification;
if (![l8, l10, l12].every((summary) => summary.exact)) {
  classification = "EXACTNESS_RED";
} else {
  classification = [
    `L8_${l8.agency ? "PASS" : "RED"}`,
    `L10_${l10.agency ? "PASS" : "RED"}`,
    `L12_${l12.agency ? "PASS" : "RED"}`,
  ].join("_");
}

const comparison = {
  verdict: "MF6_V28_INPUT_AUTHORSHIP_HORIZON_DISCRIMINATOR_COMPLETE",
  classification,
  generatedAt: new Date().toISOString(),
  declaredProfileComparable:
    [l10, l12].every((summary) =>
      summary.profile.latencyMs === l8.profile.latencyMs &&
      summary.profile.jitterMs === l8.profile.jitterMs),
  measuredRttMedianDeltaMs: {
    l10MinusL8:
      Number.isFinite(l8.rttMedianMs) && Number.isFinite(l10.rttMedianMs)
        ? l10.rttMedianMs - l8.rttMedianMs
        : null,
    l12MinusL8:
      Number.isFinite(l8.rttMedianMs) && Number.isFinite(l12.rttMedianMs)
        ? l12.rttMedianMs - l8.rttMedianMs
        : null,
  },
  l8,
  l10,
  l12,
  interpretation:
    classification === "L8_RED_L10_RED_L12_PASS"
      ? "In this hostile specimen, both 8- and 10-tick canonical authorship horizons exhausted before preserving all command transitions, while 12 ticks retained a surviving future tail. This isolates a boundary above L10 for this specimen, not a production setting."
      : classification === "L8_RED_L10_PASS_L12_PASS"
        ? "In this hostile specimen, 10 ticks was already sufficient to preserve all command transitions while 8 ticks was not. This identifies an intermediate surviving horizon but does not qualify L10 as production policy."
        : "The three-horizon specimen did not isolate a simple monotonic L8/L10/L12 boundary; inspect actual RTT, command delivery, onset and future-horizon survival before changing runtime policy.",
  nonClaim:
    "This is a bounded paired mechanism discriminator under one deterministic shaped-TCP apparatus. It is not a production lead recommendation, an adaptive-policy qualification, a deployed-edge SLO, or human feel evidence.",
};

writeFileSync(outputPath, JSON.stringify(comparison, null, 2));
console.log("MF6_V28_INPUT_AUTHORSHIP_HORIZON_DISCRIMINATOR", JSON.stringify(comparison));
console.log(comparison.verdict);
console.log(`MF6_V28_INPUT_AUTHORSHIP_HORIZON_CLASSIFICATION_${classification}`);

// Preserve qualification semantics: the current default L8 policy remains RED when
// it loses agency. Also fail on non-monotonic treatment behavior or exactness loss;
// diagnostic treatments never hide a default-policy failure.
if (
  !l8.exact || !l10.exact || !l12.exact ||
  !l8.agency ||
  (l8.agency && !l10.agency) ||
  (l10.agency && !l12.agency)
) {
  process.exitCode = 1;
}
