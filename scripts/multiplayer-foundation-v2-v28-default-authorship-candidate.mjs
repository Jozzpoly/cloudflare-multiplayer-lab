import { readFileSync, writeFileSync } from "node:fs";

const [,, ...args] = process.argv;
if (args.length < 5) throw new Error("usage: <a> <b> <c> <d> <output>");
const [a,b,c,d,output] = args;
const NOMINAL_HOLD_TICKS = 42;

function read(path, id) {
  const value = JSON.parse(readFileSync(path, "utf8"));
  const h = value.hostile?.diagnostic || value.diagnostic?.hostile || null;
  if (!h) throw new Error(id + ": hostile diagnostic missing");
  const warmup = value.hostile?.warmup?.inputScheduler || null;
  const finalScheduler = value.hostile?.inputScheduler || h.inputScheduler || null;
  if (!warmup || !finalScheduler) throw new Error(id + ": scheduler evidence missing");
  const commands = h.commandTrain?.commands || [];
  const windows = commands
    .map((command) => Number(command.maxTargetTickExclusive) - Number(command.startAuthorityBoundary))
    .filter(Number.isFinite);
  const ack = h.ackStatus || {};
  const rawLag = h.phaseError?.estimateLagTicks || [];
  const effectiveLag = h.phaseError?.authorshipEstimateLagTicks || rawLag;
  const contractDriven =
    value.requestedInputLeadProbeTicks == null &&
    value.requestedInputEstimateCeilingProbe == null &&
    warmup.contractInputLeadTicks === 8 &&
    warmup.contractInputAuthorshipLeadTicks === 14 &&
    warmup.inputLeadTicks === 14 &&
    warmup.inputLeadProbeTicks == null &&
    warmup.inputAuthorshipEstimateCeilingProbe == null &&
    warmup.inputAuthorshipLegalWindowCeilingEnabled === true &&
    finalScheduler.contractInputAuthorshipLeadTicks === 14 &&
    finalScheduler.inputLeadTicks === 14 &&
    finalScheduler.inputAuthorshipLegalWindowCeilingEnabled === true;
  return {
    id,
    scriptVerdict: value.verdict,
    contractDriven,
    requestedInputLeadProbeTicks: value.requestedInputLeadProbeTicks ?? null,
    requestedInputEstimateCeilingProbe: value.requestedInputEstimateCeilingProbe ?? null,
    contractInputLeadTicks: warmup.contractInputLeadTicks ?? null,
    contractInputAuthorshipLeadTicks: warmup.contractInputAuthorshipLeadTicks ?? null,
    effectiveInputLeadTicks: warmup.inputLeadTicks ?? null,
    simulationLeadTicks: warmup.simulationLeadTicks ?? null,
    ceilingEnabled: warmup.inputAuthorshipLegalWindowCeilingEnabled ?? null,
    exact: h.guardMismatches === 0 && h.firstStateMismatch == null,
    delivered: h.agencyDelivery?.delivered ?? null,
    total: h.agencyDelivery?.total ?? null,
    missedCommandIndexes: h.agencyDelivery?.missedCommandIndexes || [],
    rttMedianMs: h.rtt?.medianMs ?? null,
    rttP95Ms: h.rtt?.p95Ms ?? null,
    serverLate: h.serverLateDelta ?? null,
    serverRejected: h.serverRejectedDelta ?? null,
    tooFuture: ack?.too_future?.records || 0,
    authorityWindowTicks: windows,
    minAuthorityWindowTicks: windows.length ? Math.min(...windows) : null,
    stallContaminated: windows.some((value) => value < NOMINAL_HOLD_TICKS),
    ceilingActivations: rawLag.reduce((count, value, index) =>
      count + (Number.isFinite(value) && Number.isFinite(effectiveLag[index]) &&
        Math.abs(value - effectiveLag[index]) > 1e-6 ? 1 : 0), 0),
    commandLeadTicks: commands.map((command) => command.browserInputLeadTicks).filter(Number.isFinite),
    commandAck: (h.commandAck || []).map((entry) => ({
      index: entry.index,
      viableRecords: entry.viableRecords,
      lateRecords: entry.lateRecords,
      maxArrivalMarginTicks: entry.maxArrivalMarginTicks,
      deliveredInWindow: entry.deliveredInWindow,
    })),
  };
}

const specimens = [read(a,"default-a"),read(b,"default-b"),read(c,"default-c"),read(d,"default-d")];
const clean = specimens.filter((specimen) => !specimen.stallContaminated);
let classification = "DEFAULT_AUTHORSHIP_CANDIDATE_MIXED";
if (!specimens.every((specimen) => specimen.contractDriven)) {
  classification = "DEFAULT_AUTHORSHIP_CANDIDATE_CONTRACT_RED";
} else if (!specimens.every((specimen) => specimen.exact)) {
  classification = "DEFAULT_AUTHORSHIP_CANDIDATE_EXACTNESS_RED";
} else if (clean.length < 3) {
  classification = "DEFAULT_AUTHORSHIP_CANDIDATE_INCONCLUSIVE_STALL_CONTAMINATION";
} else if (clean.some((specimen) => specimen.delivered !== 8)) {
  classification = "DEFAULT_AUTHORSHIP_CANDIDATE_AGENCY_RED";
} else if (clean.some((specimen) => specimen.tooFuture > 0 || specimen.serverRejected > 0)) {
  classification = "DEFAULT_AUTHORSHIP_CANDIDATE_LEGAL_WINDOW_RED";
} else {
  classification = "DEFAULT_AUTHORSHIP_CANDIDATE_SUPPORTED";
}

const result = {
  verdict: "MF6_V28_DEFAULT_AUTHORSHIP_CANDIDATE_COMPLETE",
  classification,
  generatedAt: new Date().toISOString(),
  nominalHoldTicks: NOMINAL_HOLD_TICKS,
  cleanSpecimens: clean.map((specimen) => specimen.id),
  stallContaminated: specimens.filter((specimen) => specimen.stallContaminated).map((specimen) => specimen.id),
  contractDrivenAll: specimens.every((specimen) => specimen.contractDriven),
  exactAll: specimens.every((specimen) => specimen.exact),
  cleanPerfect: clean.filter((specimen) => specimen.delivered === 8).length,
  cleanTotal: clean.length,
  delivery: specimens.map((specimen) => `${specimen.delivered}/${specimen.total}`),
  rttMedianMs: specimens.map((specimen) => specimen.rttMedianMs),
  serverRejected: specimens.map((specimen) => specimen.serverRejected),
  tooFuture: specimens.map((specimen) => specimen.tooFuture),
  minAuthorityWindowTicks: specimens.map((specimen) => specimen.minAuthorityWindowTicks),
  ceilingActivations: specimens.map((specimen) => specimen.ceilingActivations),
  specimens,
  interpretation: "Fresh-runner qualification of the contract-driven MF6 default: legacy/default predictionLeadTicks remains 8, canonical inputAuthorshipLeadTicks is 14, local clientSimulationLeadTicks remains 2, and the legal-window ceiling comes from the simulation contract rather than a query probe.",
  nonClaim: "This qualifies a bounded research-branch timing candidate under shaped ordered TCP. It does not establish deployed-edge SLOs, packet-loss behavior or human 3-6 play quality.",
};
writeFileSync(output, JSON.stringify(result, null, 2));
console.log("MF6_V28_DEFAULT_AUTHORSHIP_CANDIDATE", JSON.stringify(result));
console.log(result.verdict);
console.log("MF6_V28_DEFAULT_AUTHORSHIP_CANDIDATE_CLASSIFICATION_" + classification);
