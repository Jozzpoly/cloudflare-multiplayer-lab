import { readFileSync, writeFileSync } from "node:fs";

const [,, ...args] = process.argv;
if (args.length < 5) throw new Error("usage: <control-a> <control-b> <ceiling-a> <ceiling-b> <output>");
const [controlA, controlB, ceilingA, ceilingB, output] = args;

function read(path, id, mode) {
  const value = JSON.parse(readFileSync(path, "utf8"));
  const hostile = value.hostile?.diagnostic || value.diagnostic?.hostile || null;
  if (!hostile) throw new Error(id + " missing hostile diagnostic");
  return {
    id,
    mode,
    scriptVerdict: value.verdict,
    exact: hostile.guardMismatches === 0 && hostile.firstStateMismatch == null,
    delivered: hostile.agencyDelivery?.delivered ?? null,
    total: hostile.agencyDelivery?.total ?? null,
    rttMedianMs: hostile.rtt?.medianMs ?? null,
    rttP95Ms: hostile.rtt?.p95Ms ?? null,
    serverLate: hostile.serverLateDelta ?? null,
    serverRejected: hostile.serverRejectedDelta ?? null,
    ackStatus: hostile.ackStatus || {},
    rawEstimateLagTicks: hostile.phaseError?.estimateLagTicks || [],
    authorshipEstimateLagTicks: hostile.phaseError?.authorshipEstimateLagTicks || [],
    observedBoundaryLagTicks: hostile.phaseError?.observedBoundaryLagTicks || [],
  };
}

const specimens = [
  read(controlA, "control-a", "control"),
  read(controlB, "control-b", "control"),
  read(ceilingA, "ceiling-a", "ceiling"),
  read(ceilingB, "ceiling-b", "ceiling"),
];

function group(mode) {
  const rows = specimens.filter((s) => s.mode === mode);
  return {
    specimens: rows.map((s) => s.id),
    exactAll: rows.every((s) => s.exact),
    delivery: rows.map((s) => `${s.delivered}/${s.total}`),
    rttMedianMs: rows.map((s) => s.rttMedianMs),
    rttP95Ms: rows.map((s) => s.rttP95Ms),
    serverLate: rows.map((s) => s.serverLate),
    serverRejected: rows.map((s) => s.serverRejected),
    tooFuture: rows.map((s) => s.ackStatus?.too_future?.records || 0),
    accepted: rows.map((s) => s.ackStatus?.accepted?.records || 0),
    superseded: rows.map((s) => s.ackStatus?.superseded?.records || 0),
    late: rows.map((s) => s.ackStatus?.late?.records || 0),
  };
}

const result = {
  verdict: "MF6_V28_AUTHORITY_ESTIMATE_CEILING_DISCRIMINATOR_COMPLETE",
  generatedAt: new Date().toISOString(),
  control: group("control"),
  ceiling: group("ceiling"),
  specimens,
  interpretation: "Compare L12 control against the opt-in authorship-estimate ceiling using actual RTT, authority-realized delivery, ACK status and exactness. This is mechanism evidence only; it does not change production timing policy.",
};
writeFileSync(output, JSON.stringify(result, null, 2));
console.log("MF6_V28_AUTHORITY_ESTIMATE_CEILING_DISCRIMINATOR", JSON.stringify(result));
console.log(result.verdict);
