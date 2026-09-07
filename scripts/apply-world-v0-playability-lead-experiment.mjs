import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const CONTRACT = "src/world-v0-contract.ts";
const CLIENT = "public/world-v0/app.js";
const BUILD = "public/world-v0/build-contract.js";

const lead = Number(process.env.MW_WORLD_V0_SIM_LEAD);
if (!Number.isInteger(lead) || lead < 0 || lead > 8) {
  throw new Error(`MW_WORLD_V0_SIM_LEAD must be integer 0..8, got ${process.env.MW_WORLD_V0_SIM_LEAD}`);
}

const OLD_CONTRACT_REV = "shared-yard-v0-contract-v7-i3-authority-temporal-floor";
const OLD_CLIENT_REV = "shared-yard-v0-browser-sim-v7-i3-authority-temporal-floor";
const OLD_SIM_BUILD = "shared-yard-v0-sim-888e471bc211091e";
const NEW_CONTRACT_REV = `shared-yard-v0-contract-exp-playability-simlead-${lead}`;
const NEW_CLIENT_REV = `shared-yard-v0-browser-sim-exp-playability-simlead-${lead}`;

function replaceOnce(text, before, after, label) {
  const first = text.indexOf(before);
  if (first < 0) throw new Error(`${label}: expected source not found`);
  if (text.indexOf(before, first + before.length) >= 0) throw new Error(`${label}: expected source is not unique`);
  return text.slice(0, first) + after + text.slice(first + before.length);
}

let contract = readFileSync(CONTRACT, "utf8");
contract = replaceOnce(contract, OLD_CONTRACT_REV, NEW_CONTRACT_REV, "contract revision");
contract = replaceOnce(contract, OLD_CLIENT_REV, NEW_CLIENT_REV, "client simulation revision");
contract = replaceOnce(
  contract,
  "  predictionLeadTicks: 8,\n  inputBatchSize: 2,",
  `  // Canonical input authorship lead remains frozen for this experiment.\n  predictionLeadTicks: 8,\n  // Evidence-only playability sweep: client simulation speculation horizon.\n  clientSimulationLeadTicks: ${lead},\n  inputBatchSize: 2,`,
  "simulation lead timing",
);
writeFileSync(CONTRACT, contract);

let client = readFileSync(CLIENT, "utf8");
client = replaceOnce(
  client,
  "  const targetBoundary = Math.max(0, Math.floor(estimate + simulation.timing.predictionLeadTicks));",
  "  const targetBoundary = Math.max(0, Math.floor(estimate + simulation.timing.clientSimulationLeadTicks));",
  "client simulation horizon",
);
client = replaceOnce(
  client,
  "      cadenceMs: STEP_MS,\n      ownsCanonicalAuthorship: true,",
  "      cadenceMs: STEP_MS,\n      inputLeadTicks: simulation?.timing?.predictionLeadTicks ?? null,\n      simulationLeadTicks: simulation?.timing?.clientSimulationLeadTicks ?? null,\n      ownsCanonicalAuthorship: true,",
  "lead evidence",
);
writeFileSync(CLIENT, client);

const contractUrl = `${pathToFileURL(CONTRACT).href}?lead=${lead}-${Date.now()}`;
const liveContract = await import(contractUrl);
const newSimBuild = liveContract.WORLD_V0_SIM_BUILD_ID;
if (typeof newSimBuild !== "string" || !newSimBuild.startsWith("shared-yard-v0-sim-")) {
  throw new Error(`invalid computed SimBuildId ${newSimBuild}`);
}

let build = readFileSync(BUILD, "utf8");
build = replaceOnce(build, OLD_CLIENT_REV, NEW_CLIENT_REV, "build client revision");
build = replaceOnce(build, OLD_SIM_BUILD, newSimBuild, "build SimBuildId");
writeFileSync(BUILD, build);

console.log(JSON.stringify({
  verdict: "WORLD_V0_PLAYABILITY_SIM_LEAD_EXPERIMENT_APPLIED",
  inputLeadTicks: liveContract.WORLD_V0_TIMING.predictionLeadTicks,
  simulationLeadTicks: liveContract.WORLD_V0_TIMING.clientSimulationLeadTicks,
  clientSimRevision: liveContract.WORLD_V0_CLIENT_SIM_REVISION,
  simBuildId: newSimBuild,
}, null, 2));
