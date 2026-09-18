import { readFileSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
if (args.length < 7) {
  throw new Error("usage: node input-lead-counterbalanced.mjs <a8> <a10> <a12> <b12> <b10> <b8> <output>");
}
const [a8Path, a10Path, a12Path, b12Path, b10Path, b8Path, outputPath] = args;

function load(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function hostileDiagnostic(result) {
  return result?.hostile?.diagnostic || result?.diagnostic?.hostile || null;
}

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

function summarize(id, sequence, position, expectedLead, result) {
  const diagnostic = hostileDiagnostic(result);
  if (!diagnostic) throw new Error(id + ": hostile diagnostic missing");
  const scheduler = diagnostic.inputScheduler || {};
  const profile = diagnostic.proxy?.profile || {};
  const delivery = diagnostic.agencyDelivery || {};
  const commandAck = diagnostic.commandAck || [];
  const exact = diagnostic.guardMismatches === 0 && diagnostic.firstStateMismatch == null;
  const agency = delivery.total >= 8 && delivery.delivered === delivery.total;

  if (scheduler.contractInputLeadTicks !== 8) {
    throw new Error(id + ": contract lead drift " + scheduler.contractInputLeadTicks);
  }
  if (scheduler.inputLeadTicks !== expectedLead) {
    throw new Error(id + ": effective lead " + scheduler.inputLeadTicks + ", expected " + expectedLead);
  }
  if (scheduler.simulationLeadTicks !== 2) {
    throw new Error(id + ": simulation lead drift " + scheduler.simulationLeadTicks);
  }
  if (profile.latencyMs !== 100 || profile.jitterMs !== 25) {
    throw new Error(id + ": hostile profile drift " + JSON.stringify(profile));
  }

  return {
    id,
    sequence,
    position,
    lead: expectedLead,
    scriptVerdict: result.verdict,
    exact,
    agency,
    agencyDelivered: delivery.delivered ?? null,
    agencyTotal: delivery.total ?? null,
    rttMedianMs: diagnostic.rtt?.medianMs ?? null,
    rttP95Ms: diagnostic.rtt?.p95Ms ?? null,
    arrivalMeanMarginTicks: diagnostic.arrivalMargin?.meanMarginTicks ?? null,
    arrivalLateFraction: diagnostic.arrivalMargin?.lateFraction ?? null,
    commandOnsetSummary: numericSummary(
      (diagnostic.commandTrain?.commands || [])
        .map((command) => command.firstCanonicalOnsetTicks)
        .filter(Number.isFinite),
    ),
    viableRecordsSummary: numericSummary(commandAck.map((entry) => entry.viableRecords)),
    maxArrivalMarginSummary: numericSummary(commandAck.map((entry) => entry.maxArrivalMarginTicks)),
    survivingFutureSpanSummary: numericSummary(commandAck.map((entry) => entry.survivingFutureSpanTicks)),
    missedCommandIndexes: delivery.missedCommandIndexes || [],
  };
}

const specimens = [
  summarize("A-L8", "A", 1, 8, load(a8Path)),
  summarize("A-L10", "A", 2, 10, load(a10Path)),
  summarize("A-L12", "A", 3, 12, load(a12Path)),
  summarize("B-L12", "B", 1, 12, load(b12Path)),
  summarize("B-L10", "B", 2, 10, load(b10Path)),
  summarize("B-L8", "B", 3, 8, load(b8Path)),
];

const byLead = {};
for (const lead of [8, 10, 12]) {
  const members = specimens.filter((specimen) => specimen.lead === lead);
  byLead["L" + lead] = {
    specimens: members.map((specimen) => specimen.id),
    exactBoth: members.every((specimen) => specimen.exact),
    agencyBoth: members.every((specimen) => specimen.agency),
    agencyNeither: members.every((specimen) => !specimen.agency),
    agencyConsistent: members.every((specimen) => specimen.agency === members[0].agency),
    delivery: members.map((specimen) => String(specimen.agencyDelivered) + "/" + String(specimen.agencyTotal)),
    rttMedianMs: numericSummary(members.map((specimen) => specimen.rttMedianMs)),
    onsetTicks: numericSummary(members.map((specimen) => specimen.commandOnsetSummary.mean)),
    viableRecordsPerCommand: numericSummary(members.map((specimen) => specimen.viableRecordsSummary.mean)),
    maxArrivalMarginTicks: numericSummary(members.map((specimen) => specimen.maxArrivalMarginSummary.mean)),
    survivingFutureSpanTicks: numericSummary(members.map((specimen) => specimen.survivingFutureSpanSummary.mean)),
  };
}

const exactAll = specimens.every((specimen) => specimen.exact);
function agencyState(lead) {
  const group = byLead["L" + lead];
  if (!group.agencyConsistent) return "MIXED";
  return group.agencyBoth ? "PASS" : "RED";
}

const classification = exactAll
  ? "L8_" + agencyState(8) + "_L10_" + agencyState(10) + "_L12_" + agencyState(12)
  : "EXACTNESS_RED";

const positionRtt = {};
for (const position of [1, 2, 3]) {
  positionRtt["P" + position] = numericSummary(
    specimens.filter((specimen) => specimen.position === position).map((specimen) => specimen.rttMedianMs),
  );
}

const comparison = {
  verdict: "MF6_V28_INPUT_AUTHORSHIP_COUNTERBALANCED_COMPLETE",
  classification,
  generatedAt: new Date().toISOString(),
  exactAll,
  orderRobustAgency: [8, 10, 12].every((lead) => byLead["L" + lead].agencyConsistent),
  specimens,
  byLead,
  positionRtt,
  interpretation:
    classification === "L8_RED_L10_PASS_L12_PASS"
      ? "Both counterbalanced replicates preserved the same monotonic agency boundary: L8 failed while L10 and L12 passed despite swapping first/last treatment order. This supports a real authorship-horizon effect in the tested envelope, but does not qualify a production lead."
      : "Counterbalancing did not reproduce a stable L8/L10/L12 agency boundary. Treat the mixed result as envelope/order sensitivity and map conditions before policy design.",
  nonClaim:
    "Two counterbalanced triplets under one shaped-TCP profile are mechanism evidence, not a production SLO, deployed-edge distribution, adaptive-policy qualification, or human feel evidence.",
};

writeFileSync(outputPath, JSON.stringify(comparison, null, 2));
console.log("MF6_V28_INPUT_AUTHORSHIP_COUNTERBALANCED", JSON.stringify(comparison));
console.log(comparison.verdict);
console.log("MF6_V28_INPUT_AUTHORSHIP_COUNTERBALANCED_CLASSIFICATION_" + classification);

if (!exactAll) process.exitCode = 1;
