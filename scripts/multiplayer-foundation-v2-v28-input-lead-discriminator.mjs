import { readFileSync, writeFileSync } from "node:fs";

const [l8Path, l12Path, outputPath = "mf6-input-lead-discriminator.json"] = process.argv.slice(2);
if (!l8Path || !l12Path) {
  throw new Error("usage: node input-lead-discriminator.mjs <l8.json> <l12.json> [output.json]");
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
l8.phaseError.estimateLagSummary = numericSummary(l8.phaseError.estimateLagTicks);
l8.phaseError.observedBoundaryLagSummary = numericSummary(l8.phaseError.observedBoundaryLagTicks);
l12.phaseError.estimateLagSummary = numericSummary(l12.phaseError.estimateLagTicks);
l12.phaseError.observedBoundaryLagSummary = numericSummary(l12.phaseError.observedBoundaryLagTicks);

let classification;
if (!l8.exact || !l12.exact) {
  classification = "EXACTNESS_RED";
} else if (!l8.agency && l12.agency) {
  classification = "L8_AGENCY_RED_L12_AGENCY_PASS";
} else if (!l8.agency && !l12.agency) {
  classification = "L8_AGENCY_RED_L12_AGENCY_RED";
} else if (l8.agency && l12.agency) {
  classification = "L8_AGENCY_PASS_L12_AGENCY_PASS";
} else {
  classification = "L8_AGENCY_PASS_L12_AGENCY_RED";
}

const comparison = {
  verdict: "MF6_V28_INPUT_AUTHORSHIP_HORIZON_DISCRIMINATOR_COMPLETE",
  classification,
  generatedAt: new Date().toISOString(),
  declaredProfileComparable:
    l8.profile.latencyMs === l12.profile.latencyMs &&
    l8.profile.jitterMs === l12.profile.jitterMs,
  measuredRttMedianDeltaMs:
    Number.isFinite(l8.rttMedianMs) && Number.isFinite(l12.rttMedianMs)
      ? l12.rttMedianMs - l8.rttMedianMs
      : null,
  l8,
  l12,
  interpretation:
    classification === "L8_AGENCY_RED_L12_AGENCY_PASS"
      ? "Changing only the browser canonical input-authorship horizon from 8 to 12 ticks restored all eight authority-windowed direction commands in this paired hostile specimen while client simulation lead remained 2."
      : "The paired sustained-command specimen did not isolate a simple L8-to-L12 full-agency restoration; inspect delivery ratios and lateness before changing runtime policy.",
  nonClaim:
    "This is a bounded paired mechanism discriminator under one deterministic shaped-TCP apparatus. It is not a production lead recommendation, an adaptive-policy qualification, a deployed-edge SLO, or human feel evidence.",
};

writeFileSync(outputPath, JSON.stringify(comparison, null, 2));
console.log("MF6_V28_INPUT_AUTHORSHIP_HORIZON_DISCRIMINATOR", JSON.stringify(comparison));
console.log(comparison.verdict);
console.log(`MF6_V28_INPUT_AUTHORSHIP_HORIZON_CLASSIFICATION_${classification}`);

// Preserve qualification semantics: the current default L8 policy remains RED when
// its agency fails even if the diagnostic L12 treatment restores agency.
if (!l8.exact || !l8.agency || !l12.exact || (l8.agency && !l12.agency)) {
  process.exitCode = 1;
}
