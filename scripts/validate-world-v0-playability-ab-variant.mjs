import { readFileSync } from "node:fs";

const path = process.argv[2];
if (!path) throw new Error("usage: node validate-world-v0-playability-ab-variant.mjs <summary.json>");

const value = JSON.parse(readFileSync(path, "utf8"));
if (value.verdict !== "WORLD_V0_PLAYABILITY_REMOTE_AB_VARIANT_COMPLETE") {
  throw new Error(`variant summary verdict invalid: ${value.verdict}`);
}
if (!Array.isArray(value.attempts) || value.attempts.length !== 2) {
  throw new Error(`expected exactly 2 attempts, got ${value.attempts?.length}`);
}

for (const attempt of value.attempts) {
  if (!Array.isArray(attempt.localResponse) || attempt.localResponse.length !== 2) {
    throw new Error(`APPARATUS_INVALID ${value.variant} attempt ${attempt.attempt}: response evidence incomplete`);
  }
  if (!Array.isArray(attempt.clients) || attempt.clients.length !== 2) {
    throw new Error(`APPARATUS_INVALID ${value.variant} attempt ${attempt.attempt}: client evidence incomplete`);
  }
  for (const [index, client] of attempt.clients.entries()) {
    if (client.finalNetworkState !== "live · Shared Yard V0") {
      throw new Error(`APPARATUS_INVALID ${value.variant} attempt ${attempt.attempt} client ${index}: final network state ${JSON.stringify(client.finalNetworkState)}`);
    }
    if (!Number.isFinite(client.tickSpan) || client.tickSpan < 400) {
      throw new Error(`APPARATUS_INVALID ${value.variant} attempt ${attempt.attempt} client ${index}: incomplete tick span ${client.tickSpan}`);
    }
    if (!Number.isFinite(client.frameP95Ms) || client.frameP95Ms > 40) {
      throw new Error(`APPARATUS_INVALID ${value.variant} attempt ${attempt.attempt} client ${index}: frame p95 ${client.frameP95Ms}`);
    }
    if (client.guardPending !== 0) {
      throw new Error(`APPARATUS_INVALID ${value.variant} attempt ${attempt.attempt} client ${index}: pending exact guards ${client.guardPending}`);
    }
  }
}

console.log("WORLD_V0_PLAYABILITY_REMOTE_AB_COMPLETE_LIVE_SPECIMEN_PASS", JSON.stringify({
  variant: value.variant,
  runtimeSha: value.runtimeSha,
  simulationLeadTicks: value.simulationLeadTicks,
  attempts: value.attempts.length,
  tickSpans: value.attempts.flatMap((attempt) => attempt.clients.map((client) => client.tickSpan)),
}));
