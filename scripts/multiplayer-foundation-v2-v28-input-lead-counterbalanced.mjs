import { readFileSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
if (args.length < 7) {
  throw new Error("usage: node input-lead-isolated-replicates.mjs <a8> <a10> <a12> <b8> <b10> <b12> <output>");
}
const [a8Path, a10Path, a12Path, b8Path, b10Path, b12Path, outputPath] = args;

function load(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}
function hostileDiagnostic(result) {
  return result?.hostile?.diagnostic || result?.diagnostic?.hostile || null;
}
function numericSummary(values) {
  const finite = values.filter(Number.isFinite);
  if (!finite.length) return { samples: 0, mean: null, min: null, max: null, spread: null };
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  return {
    samples: finite.length,
    mean: finite.reduce((sum, value) => sum + value, 0) / finite.length,
    min,
    max,
    spread: max - min,
  };
}
function summarize(id, replicate, expectedLead, result) {
  const diagnostic = hostileDiagnostic(result);
  if (!diagnostic) throw new Error(id + ": hostile diagnostic missing");
  const scheduler = diagnostic.inputScheduler || {};
  const profile = diagnostic.proxy?.profile || {};
  const delivery = diagnostic.agencyDelivery || {};
  const commandAck = diagnostic.commandAck || [];
  const exact = diagnostic.guardMismatches === 0 && diagnostic.firstStateMismatch == null;
  const agency = delivery.total >= 8 && delivery.delivered === delivery.total;

  if (scheduler.contractInputLeadTicks !== 8) throw new Error(id + ": contract lead drift");
  if (scheduler.inputLeadTicks !== expectedLead) throw new Error(id + ": effective lead drift");
  if (scheduler.simulationLeadTicks !== 2) throw new Error(id + ": simulation lead drift");
  if (profile.latencyMs !== 100 || profile.jitterMs !== 25) throw new Error(id + ": hostile profile drift");

  return {
    id,
    replicate,
    lead: expectedLead,
    scriptVerdict: result.verdict,
    exact,
    agency,
    agencyDelivered: delivery.delivered ?? null,
    agencyTotal: delivery.total ?? null,
    missedCommandIndexes: delivery.missedCommandIndexes || [],
    rttMedianMs: diagnostic.rtt?.medianMs ?? null,
    rttP95Ms: diagnostic.rtt?.p95Ms ?? null,
    arrivalMeanMarginTicks: diagnostic.arrivalMargin?.meanMarginTicks ?? null,
    arrivalLateFraction: diagnostic.arrivalMargin?.lateFraction ?? null,
    serverLateDelta: diagnostic.serverLateDelta ?? null,
    serverRejectedDelta: diagnostic.serverRejectedDelta ?? null,
    commandOnsetTicks: numericSummary(
      (diagnostic.commandTrain?.commands || [])
        .map((command) => command.firstCanonicalOnsetTicks)
        .filter(Number.isFinite),
    ),
    viableRecordsPerCommand: numericSummary(commandAck.map((entry) => entry.viableRecords)),
    maxArrivalMarginTicks: numericSummary(commandAck.map((entry) => entry.maxArrivalMarginTicks)),
    survivingFutureSpanTicks: numericSummary(commandAck.map((entry) => entry.survivingFutureSpanTicks)),
  };
}

const specimens = [
  summarize("A-L8", "A", 8, load(a8Path)),
  summarize("A-L10", "A", 10, load(a10Path)),
  summarize("A-L12", "A", 12, load(a12Path)),
  summarize("B-L8", "B", 8, load(b8Path)),
  summarize("B-L10", "B", 10, load(b10Path)),
  summarize("B-L12", "B", 12, load(b12Path)),
];

const byLead = {};
for (const lead of [8, 10, 12]) {
  const members = specimens.filter((specimen) => specimen.lead === lead);
  const agencyConsistent = members.every((specimen) => specimen.agency === members[0].agency);
  byLead["L" + lead] = {
    specimens: members.map((specimen) => specimen.id),
    exactBoth: members.every((specimen) => specimen.exact),
    agencyConsistent,
    agencyBoth: members.every((specimen) => specimen.agency),
    agencyNeither: members.every((specimen) => !specimen.agency),
    delivery: members.map((specimen) => String(specimen.agencyDelivered) + "/" + String(specimen.agencyTotal)),
    rttMedianMs: numericSummary(members.map((specimen) => specimen.rttMedianMs)),
    rttP95Ms: numericSummary(members.map((specimen) => specimen.rttP95Ms)),
    arrivalMeanMarginTicks: numericSummary(members.map((specimen) => specimen.arrivalMeanMarginTicks)),
    onsetTicks: numericSummary(members.map((specimen) => specimen.commandOnsetTicks.mean)),
    viableRecordsPerCommand: numericSummary(members.map((specimen) => specimen.viableRecordsPerCommand.mean)),
    maxArrivalMarginTicks: numericSummary(members.map((specimen) => specimen.maxArrivalMarginTicks.mean)),
    survivingFutureSpanTicks: numericSummary(members.map((specimen) => specimen.survivingFutureSpanTicks.mean)),
    serverRejectedDelta: numericSummary(members.map((specimen) => specimen.serverRejectedDelta)),
  };
}

const exactAll = specimens.every((specimen) => specimen.exact);
function state(lead) {
  const group = byLead["L" + lead];
  if (!group.agencyConsistent) return "MIXED";
  return group.agencyBoth ? "PASS" : "RED";
}
const classification = exactAll
  ? "L8_" + state(8) + "_L10_" + state(10) + "_L12_" + state(12)
  : "EXACTNESS_RED";

const comparison = {
  verdict: "MF6_V28_INPUT_AUTHORSHIP_ISOLATED_REPLICATES_COMPLETE",
  classification,
  generatedAt: new Date().toISOString(),
  exactAll,
  independentRunnerReplicates: true,
  specimens,
  byLead,
  interpretation:
    classification === "L8_RED_L10_PASS_L12_PASS"
      ? "Two independent fresh-runner replicates reproduce L8 agency loss while L10 and L12 preserve all command transitions. This strengthens a real authorship-horizon effect without the cumulative authority-stall contamination of the serial counterbalance."
      : "Independent fresh-runner replicates do not produce a stable L8/L10/L12 boundary. Map the result against actual RTT, arrival margin and rejection mode before policy design.",
  nonClaim:
    "Two isolated replicates per lead under one shaped-TCP profile are bounded mechanism evidence, not a production SLO, deployed-edge distribution, adaptive-policy qualification, or human feel evidence.",
};

writeFileSync(outputPath, JSON.stringify(comparison, null, 2));
console.log("MF6_V28_INPUT_AUTHORSHIP_ISOLATED_REPLICATES", JSON.stringify(comparison));
console.log(comparison.verdict);
console.log("MF6_V28_INPUT_AUTHORSHIP_ISOLATED_REPLICATES_CLASSIFICATION_" + classification);

if (!exactAll) process.exitCode = 1;
