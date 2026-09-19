import { readFileSync, writeFileSync } from "node:fs";

const [,, ...args] = process.argv;
if (args.length < 5) throw new Error("usage: <a> <b> <c> <d> <output>");
const [a,b,c,d,output] = args;
const EXPECTED_LATENCY_MS = 120;
const EXPECTED_JITTER_MS = 30;
const NOMINAL_HOLD_TICKS = 42;

function read(path,id) {
  const value = JSON.parse(readFileSync(path,"utf8"));
  const h = value.hostile?.diagnostic || value.diagnostic?.hostile || null;
  if (!h) throw new Error(id + ": hostile diagnostic missing");
  const scheduler = value.hostile?.warmup?.inputScheduler || h.inputScheduler || null;
  if (!scheduler) throw new Error(id + ": scheduler evidence missing");
  const profile = h.proxy?.profile || value.hostile?.profile || null;
  const commands = h.commandTrain?.commands || [];
  const windows = commands
    .map((command) => Number(command.maxTargetTickExclusive) - Number(command.startAuthorityBoundary))
    .filter(Number.isFinite);
  const ack = h.ackStatus || {};
  return {
    id,
    scriptVerdict: value.verdict,
    profile,
    profileExact: profile?.latencyMs === EXPECTED_LATENCY_MS && profile?.jitterMs === EXPECTED_JITTER_MS,
    contractDriven:
      value.requestedInputLeadProbeTicks == null &&
      value.requestedInputEstimateCeilingProbe == null &&
      scheduler.contractInputLeadTicks === 8 &&
      scheduler.contractInputAuthorshipLeadTicks === 14 &&
      scheduler.inputLeadTicks === 14 &&
      scheduler.simulationLeadTicks === 2 &&
      scheduler.inputAuthorshipLegalWindowCeilingEnabled === true,
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
    commandAck: (h.commandAck || []).map((entry) => ({
      index: entry.index,
      viableRecords: entry.viableRecords,
      lateRecords: entry.lateRecords,
      maxArrivalMarginTicks: entry.maxArrivalMarginTicks,
      deliveredInWindow: entry.deliveredInWindow,
    })),
  };
}

const specimens = [read(a,"stress120-a"),read(b,"stress120-b"),read(c,"stress120-c"),read(d,"stress120-d")];
const clean = specimens.filter((specimen) => !specimen.stallContaminated);

let classification = "F4_STRESS120_MIXED";
if (!specimens.every((specimen) => specimen.profileExact && specimen.contractDriven)) {
  classification = "F4_STRESS120_APPARATUS_RED";
} else if (!specimens.every((specimen) => specimen.exact)) {
  classification = "F4_STRESS120_EXACTNESS_RED";
} else if (clean.length < 3) {
  classification = "F4_STRESS120_INCONCLUSIVE_STALL_CONTAMINATION";
} else if (clean.some((specimen) => specimen.serverRejected > 0 || specimen.tooFuture > 0)) {
  classification = "F4_STRESS120_LEGAL_WINDOW_RED";
} else if (clean.every((specimen) => specimen.delivered === 8)) {
  classification = "F4_STRESS120_SUPPORTED";
} else if (clean.some((specimen) => specimen.delivered === 8)) {
  classification = "F4_STRESS120_MIXED_AGENCY_BOUNDARY";
} else {
  classification = "F4_STRESS120_AGENCY_RED";
}
if (classification === "F4_STRESS120_LEGAL_WINDOW_RED") {
  // Keep the explicit branch above visible in the result without rewriting a
  // legal-window failure as an agency classification.
}

const result = {
  verdict: "MF6_V28_F4_STRESS120_COMPLETE",
  classification,
  generatedAt: new Date().toISOString(),
  declaredProfile: { latencyMs: EXPECTED_LATENCY_MS, jitterMs: EXPECTED_JITTER_MS },
  nominalHoldTicks: NOMINAL_HOLD_TICKS,
  cleanSpecimens: clean.map((specimen) => specimen.id),
  stallContaminated: specimens.filter((specimen) => specimen.stallContaminated).map((specimen) => specimen.id),
  exactAll: specimens.every((specimen) => specimen.exact),
  contractDrivenAll: specimens.every((specimen) => specimen.contractDriven),
  cleanPerfect: clean.filter((specimen) => specimen.delivered === 8).length,
  cleanTotal: clean.length,
  delivery: specimens.map((specimen) => `${specimen.delivered}/${specimen.total}`),
  rttMedianMs: specimens.map((specimen) => specimen.rttMedianMs),
  rttP95Ms: specimens.map((specimen) => specimen.rttP95Ms),
  serverRejected: specimens.map((specimen) => specimen.serverRejected),
  tooFuture: specimens.map((specimen) => specimen.tooFuture),
  minAuthorityWindowTicks: specimens.map((specimen) => specimen.minAuthorityWindowTicks),
  specimens,
  interpretation: "Fresh-runner sensitivity probe at the historical F3.0 stress cell of 120 ms one-way base delay plus 30 ms jitter, using the contract-driven L14 canonical authorship reserve, local simulation lead 2 and legal-window ceiling. Stall-contaminated specimens remain F6 evidence and do not move the clean F4 boundary.",
  nonClaim: "This is an ordered-TCP shaped stress point. It does not qualify packet loss/reorder, deployed-edge SLOs or human feel.",
};

writeFileSync(output, JSON.stringify(result,null,2));
console.log("MF6_V28_F4_STRESS120", JSON.stringify(result));
console.log(result.verdict);
console.log("MF6_V28_F4_STRESS120_CLASSIFICATION_" + classification);
