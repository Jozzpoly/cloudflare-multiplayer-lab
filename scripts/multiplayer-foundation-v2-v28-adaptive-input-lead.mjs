import { readFileSync, writeFileSync } from "node:fs";

const [,, ...args] = process.argv;
if (args.length < 5) throw new Error("usage: <a> <b> <c> <d> <output>");
const [a,b,c,d,output] = args;
const NOMINAL_HOLD_TICKS = 42;

function read(path, id) {
  const value = JSON.parse(readFileSync(path, "utf8"));
  const h = value.hostile?.diagnostic || value.diagnostic?.hostile || null;
  if (!h) throw new Error(id + " missing hostile diagnostic");
  const commands = h.commandTrain?.commands || [];
  const windows = commands
    .map((command) => Number(command.maxTargetTickExclusive) - Number(command.startAuthorityBoundary))
    .filter(Number.isFinite);
  const moderateScheduler = value.moderate?.inputScheduler || null;
  const warmupScheduler = value.hostile?.warmup?.inputScheduler || null;
  const hostileScheduler = value.hostile?.inputScheduler || null;
  const ack = h.ackStatus || {};
  return {
    id,
    scriptVerdict: value.verdict,
    exact: h.guardMismatches === 0 && h.firstStateMismatch == null,
    delivered: h.agencyDelivery?.delivered ?? null,
    total: h.agencyDelivery?.total ?? null,
    missedCommandIndexes: h.agencyDelivery?.missedCommandIndexes || [],
    rttMedianMs: h.rtt?.medianMs ?? null,
    rttP95Ms: h.rtt?.p95Ms ?? null,
    serverLate: h.serverLateDelta ?? null,
    serverRejected: h.serverRejectedDelta ?? null,
    tooFuture: ack?.too_future?.records || 0,
    minAuthorityWindowTicks: windows.length ? Math.min(...windows) : null,
    stallContaminated: windows.some((value) => value < NOMINAL_HOLD_TICKS),
    moderateLeadTicks: moderateScheduler?.inputLeadTicks ?? null,
    hostileWarmupLeadTicks: warmupScheduler?.inputLeadTicks ?? null,
    hostileFinalLeadTicks: hostileScheduler?.inputLeadTicks ?? null,
    raiseCount: hostileScheduler?.adaptiveInputLeadRaiseCount ?? null,
    commandLeadTicks: commands.map((command) => command.browserInputLeadTicks).filter(Number.isFinite),
    adaptiveEvents: hostileScheduler?.adaptiveInputLeadEvents || [],
    commandAck: (h.commandAck || []).map((entry) => ({
      index: entry.index,
      viableRecords: entry.viableRecords,
      lateRecords: entry.lateRecords,
      maxArrivalMarginTicks: entry.maxArrivalMarginTicks,
      deliveredInWindow: entry.deliveredInWindow,
    })),
  };
}

const specimens = [read(a,"adaptive-a"), read(b,"adaptive-b"), read(c,"adaptive-c"), read(d,"adaptive-d")];
const clean = specimens.filter((specimen) => !specimen.stallContaminated);
let classification = "ADAPTIVE_INPUT_LEAD_MIXED";
if (!specimens.every((specimen) => specimen.exact)) {
  classification = "ADAPTIVE_INPUT_LEAD_EXACTNESS_RED";
} else if (clean.length < 3) {
  classification = "ADAPTIVE_INPUT_LEAD_INCONCLUSIVE_STALL_CONTAMINATION";
} else if (clean.some((specimen) => specimen.delivered !== 8)) {
  classification = "ADAPTIVE_INPUT_LEAD_AGENCY_RED";
} else if (clean.some((specimen) => specimen.tooFuture > 0 || specimen.serverRejected > 0)) {
  classification = "ADAPTIVE_INPUT_LEAD_LEGAL_WINDOW_RED";
} else if (clean.some((specimen) => Number(specimen.moderateLeadTicks) >= 14)) {
  classification = "ADAPTIVE_INPUT_LEAD_PREMATURE_ESCALATION";
} else {
  classification = "ADAPTIVE_INPUT_LEAD_BOUNDED_SUPPORTED";
}

const result = {
  verdict: "MF6_V28_ADAPTIVE_INPUT_LEAD_DISCRIMINATOR_COMPLETE",
  classification,
  generatedAt: new Date().toISOString(),
  nominalHoldTicks: NOMINAL_HOLD_TICKS,
  cleanSpecimens: clean.map((specimen) => specimen.id),
  stallContaminated: specimens.filter((specimen) => specimen.stallContaminated).map((specimen) => specimen.id),
  exactAll: specimens.every((specimen) => specimen.exact),
  cleanPerfect: clean.filter((specimen) => specimen.delivered === 8).length,
  cleanTotal: clean.length,
  delivery: specimens.map((specimen) => `${specimen.delivered}/${specimen.total}`),
  rttMedianMs: specimens.map((specimen) => specimen.rttMedianMs),
  moderateLeadTicks: specimens.map((specimen) => specimen.moderateLeadTicks),
  hostileWarmupLeadTicks: specimens.map((specimen) => specimen.hostileWarmupLeadTicks),
  hostileFinalLeadTicks: specimens.map((specimen) => specimen.hostileFinalLeadTicks),
  raiseCount: specimens.map((specimen) => specimen.raiseCount),
  tooFuture: specimens.map((specimen) => specimen.tooFuture),
  minAuthorityWindowTicks: specimens.map((specimen) => specimen.minAuthorityWindowTicks),
  specimens,
  interpretation: "Diagnostic ACK-margin ratchet starts from the existing L8 contract and may only raise canonical authorship lead up to L14. The estimator ceiling remains opt-in. Clean F4 specimens require nominal authority progression; stall-contaminated specimens remain F6 evidence.",
  nonClaim: "This does not select a production adaptive policy, decay rule, threshold, deployed-edge SLO or human-feel setting.",
};
writeFileSync(output, JSON.stringify(result, null, 2));
console.log("MF6_V28_ADAPTIVE_INPUT_LEAD_DISCRIMINATOR", JSON.stringify(result));
console.log(result.verdict);
console.log("MF6_V28_ADAPTIVE_INPUT_LEAD_CLASSIFICATION_" + classification);
