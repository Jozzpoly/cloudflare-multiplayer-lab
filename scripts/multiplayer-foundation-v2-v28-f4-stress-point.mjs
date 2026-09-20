import { readFileSync, writeFileSync } from "node:fs";

const [,, latencyRaw, jitterRaw, a,b,c,d,output] = process.argv;
const latencyMs = Number(latencyRaw);
const jitterMs = Number(jitterRaw);
if (!Number.isFinite(latencyMs) || !Number.isFinite(jitterMs) || !output) {
  throw new Error("usage: <latency-ms> <jitter-ms> <a> <b> <c> <d> <output>");
}
const NOMINAL_HOLD_TICKS = 42;

function read(path,id) {
  const value = JSON.parse(readFileSync(path,"utf8"));
  const h = value.hostile?.diagnostic || value.diagnostic?.hostile || null;
  if (!h) throw new Error(id + ": hostile diagnostic missing");
  const scheduler =
    value.hostile?.warmup?.inputScheduler ||
    h.inputScheduler ||
    value.baseline?.inputScheduler ||
    null;
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
    scriptError: value.error || null,
    profile,
    profileExact: profile?.latencyMs === latencyMs && profile?.jitterMs === jitterMs,
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
    arrivalMargin: h.arrivalMargin || null,
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

const specimens = [
  read(a,"stress-a"),read(b,"stress-b"),read(c,"stress-c"),read(d,"stress-d")
];
const clean = specimens.filter((specimen) => !specimen.stallContaminated);

let classification = "F4_STRESS_MIXED";
if (!specimens.every((specimen) => specimen.profileExact && specimen.contractDriven)) {
  classification = "F4_STRESS_APPARATUS_RED";
} else if (!specimens.every((specimen) => specimen.exact)) {
  classification = "F4_STRESS_EXACTNESS_RED";
} else if (clean.length < 3) {
  classification = "F4_STRESS_INCONCLUSIVE_STALL_CONTAMINATION";
} else if (clean.some((specimen) => specimen.serverRejected > 0 || specimen.tooFuture > 0)) {
  classification = "F4_STRESS_LEGAL_WINDOW_RED";
} else if (clean.every((specimen) => specimen.delivered === 8)) {
  classification = "F4_STRESS_SUPPORTED";
} else if (clean.some((specimen) => specimen.delivered === 8)) {
  classification = "F4_STRESS_MIXED_AGENCY_BOUNDARY";
} else {
  classification = "F4_STRESS_AGENCY_RED";
}

const result = {
  verdict: "MF6_V28_F4_STRESS_POINT_COMPLETE",
  classification,
  generatedAt: new Date().toISOString(),
  declaredProfile: { latencyMs, jitterMs },
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
  maxArrivalMarginByCommand: specimens.map((specimen) =>
    specimen.commandAck.map((entry) => entry.maxArrivalMarginTicks)
  ),
  specimens,
  interpretation: "Fresh-runner outer-envelope stress point for the contract-driven L14 canonical authorship reserve, local simulation lead 2 and legal-window ceiling. Agency-negative exact specimens remain valid boundary evidence; only authority-window compression below the nominal 42-tick hold is classified as F6 stall contamination.",
  nonClaim: "This is an ordered-TCP shaped stress point, not packet loss/reorder, a deployed-edge SLO or human feel qualification.",
};
writeFileSync(output, JSON.stringify(result,null,2));
console.log("MF6_V28_F4_STRESS_POINT", JSON.stringify(result));
console.log(result.verdict);
console.log("MF6_V28_F4_STRESS_POINT_CLASSIFICATION_" + classification);
