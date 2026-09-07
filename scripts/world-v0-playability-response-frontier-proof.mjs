import { readFileSync } from "node:fs";

const app = readFileSync("public/world-v0/app.js", "utf8");
const contract = readFileSync("src/world-v0-contract.ts", "utf8");

const requiredAnchors = [
  "const startTick = Math.max(protocolStartTick, Math.floor(estimate) + 1);",
  "const authoredThrough = Math.floor(estimate + simulation.timing.predictionLeadTicks) - 1;",
  "const targetBoundary = Math.max(0, Math.floor(estimate + simulation.timing.predictionLeadTicks));",
];
for (const anchor of requiredAnchors) {
  if (!app.includes(anchor)) throw new Error(`response frontier source anchor missing: ${anchor}`);
}
if (!contract.includes("predictionLeadTicks: 8")) throw new Error("canonical input lead is no longer 8");

const rows = [];
for (const lead of [0, 1, 2, 3, 4, 8]) {
  let immediateForAllPhases = true;
  let minimumSlack = Infinity;
  let maximumSlack = -Infinity;
  for (let i = 0; i < 1000; i += 1) {
    const fraction = i / 1000;
    const estimate = 100 + fraction;
    const earliestAuthoredTick = Math.floor(estimate) + 1;
    const boundaryRequiredToConsume = earliestAuthoredTick + 1;
    const targetBoundary = Math.floor(estimate + lead);
    const slack = targetBoundary - boundaryRequiredToConsume;
    minimumSlack = Math.min(minimumSlack, slack);
    maximumSlack = Math.max(maximumSlack, slack);
    if (targetBoundary < boundaryRequiredToConsume) immediateForAllPhases = false;
  }
  rows.push({ lead, immediateForAllPhases, minimumSlack, maximumSlack });
}

const firstImmediate = rows.find((row) => row.immediateForAllPhases)?.lead ?? null;
if (firstImmediate !== 2) throw new Error(`expected structural response frontier at lead2, got ${firstImmediate}`);
if (rows.find((row) => row.lead === 1)?.immediateForAllPhases) throw new Error("lead1 unexpectedly has immediate-use capacity");

const result = {
  verdict: "WORLD_V0_PLAYABILITY_RESPONSE_FRONTIER_PROOF_PASS",
  inputAuthorshipLeadTicks: 8,
  earliestNewInputRule: "floor(authorityEstimate)+1",
  consumptionBoundaryRule: "earliestAuthoredTick+1",
  firstImmediateSimulationLeadTicks: firstImmediate,
  rows,
  nonClaim: "This is a scheduling-capacity proof, not a wall-clock latency or Owner-feel measurement. It assumes the prediction pass is runnable and not backlogged.",
};
console.log(JSON.stringify(result, null, 2));
