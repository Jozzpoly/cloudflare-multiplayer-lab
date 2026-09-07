import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const CONTRACT = "src/world-v0-contract.ts";
const CLIENT = "public/world-v0/app.js";
const BUILD = "public/world-v0/build-contract.js";

const OLD_CONTRACT_REV = "shared-yard-v0-contract-v7-i3-authority-temporal-floor";
const NEW_CONTRACT_REV = "shared-yard-v0-contract-v8-playability-split-lead";
const OLD_CLIENT_REV = "shared-yard-v0-browser-sim-v7-i3-authority-temporal-floor";
const NEW_CLIENT_REV = "shared-yard-v0-browser-sim-v8-playability-split-lead";
const OLD_SIM_BUILD = "shared-yard-v0-sim-888e471bc211091e";

function replaceOnce(text, before, after, label) {
  const first = text.indexOf(before);
  if (first < 0) throw new Error(`${label}: expected source not found`);
  if (text.indexOf(before, first + before.length) >= 0) throw new Error(`${label}: expected source is not unique`);
  return text.slice(0, first) + after + text.slice(first + before.length);
}

function writeChanged(path, before, after) {
  if (before === after) return false;
  writeFileSync(path, after);
  return true;
}

let contract = readFileSync(CONTRACT, "utf8");
const alreadyApplied = contract.includes(NEW_CONTRACT_REV);
if (!alreadyApplied) {
  contract = replaceOnce(contract, OLD_CONTRACT_REV, NEW_CONTRACT_REV, "contract revision");
  contract = replaceOnce(contract, OLD_CLIENT_REV, NEW_CLIENT_REV, "client simulation revision");
  contract = replaceOnce(
    contract,
    "  predictionLeadTicks: 8,\n  inputBatchSize: 2,",
    "  // Canonical input is authored far enough ahead to survive ordinary transport latency.\n  predictionLeadTicks: 8,\n  // Playability R1: local shared simulation no longer races all the way to the\n  // canonical authorship frontier. Keeping a smaller speculation horizon lets\n  // peer intent arrive before use instead of manufacturing pervasive rollback.\n  clientSimulationLeadTicks: 2,\n  inputBatchSize: 2,",
    "split lead timing",
  );
  writeFileSync(CONTRACT, contract);
}

let client = readFileSync(CLIENT, "utf8");
if (!client.includes("simulation.timing.clientSimulationLeadTicks")) {
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
    "split lead evidence",
  );
  writeFileSync(CLIENT, client);
}

// Import the patched TS contract so the exact SimBuildId is derived from the
// actual experiment bytes rather than guessed or hand-maintained.
const contractUrl = `${pathToFileURL(CONTRACT).href}?playability=${Date.now()}`;
const liveContract = await import(contractUrl);
const newSimBuild = liveContract.WORLD_V0_SIM_BUILD_ID;
if (typeof newSimBuild !== "string" || !newSimBuild.startsWith("shared-yard-v0-sim-")) {
  throw new Error(`invalid computed SimBuildId ${newSimBuild}`);
}

let build = readFileSync(BUILD, "utf8");
if (!build.includes(NEW_CLIENT_REV)) {
  build = replaceOnce(build, OLD_CLIENT_REV, NEW_CLIENT_REV, "build client revision");
}
if (!build.includes(newSimBuild)) {
  if (build.includes(OLD_SIM_BUILD)) {
    build = replaceOnce(build, OLD_SIM_BUILD, newSimBuild, "build SimBuildId");
  } else {
    build = build.replace(
      /export const WORLD_V0_EXPECTED_SIM_BUILD_ID = "shared-yard-v0-sim-[0-9a-f]+";/,
      `export const WORLD_V0_EXPECTED_SIM_BUILD_ID = "${newSimBuild}";`,
    );
    if (!build.includes(newSimBuild)) throw new Error("could not update build SimBuildId");
  }
}
writeFileSync(BUILD, build);

console.log(JSON.stringify({
  verdict: "WORLD_V0_PLAYABILITY_R1_SPLIT_LEAD_APPLIED",
  alreadyApplied,
  inputLeadTicks: liveContract.WORLD_V0_TIMING.predictionLeadTicks,
  simulationLeadTicks: liveContract.WORLD_V0_TIMING.clientSimulationLeadTicks,
  clientSimRevision: liveContract.WORLD_V0_CLIENT_SIM_REVISION,
  simBuildId: newSimBuild,
}, null, 2));
