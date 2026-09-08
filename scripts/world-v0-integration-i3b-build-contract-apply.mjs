import { readFileSync, writeFileSync } from "node:fs";

const path = "public/world-v0/build-contract.js";
const simBuildId = process.argv[2] || "";
if (!/^shared-yard-v0-sim-[0-9a-f]{16}$/.test(simBuildId)) throw new Error(`invalid I3b SimBuildId ${simBuildId}`);
let source = readFileSync(path, "utf8");

const OLD_CLIENT = "shared-yard-v0-browser-sim-v6-i4-exact-full-state-rebase";
const NEW_CLIENT = "shared-yard-v0-browser-sim-v7-i3-authority-temporal-floor";

if (source.includes(NEW_CLIENT) && source.includes(`WORLD_V0_EXPECTED_SIM_BUILD_ID = "${simBuildId}"`)) {
  console.log(`WORLD_V0_I3B_BUILD_CONTRACT_APPLY already applied · ${simBuildId}`);
  process.exit(0);
}

function replaceOnce(before, after, label) {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`I3b build-contract marker ${label}: expected 1, got ${count}`);
  source = source.replace(before, after);
}

replaceOnce(
  `export const WORLD_V0_CLIENT_SIM_REVISION = "${OLD_CLIENT}";`,
  `export const WORLD_V0_CLIENT_SIM_REVISION = "${NEW_CLIENT}";`,
  "client revision",
);
const oldSim = /export const WORLD_V0_EXPECTED_SIM_BUILD_ID = "shared-yard-v0-sim-[0-9a-f]{16}";/.exec(source)?.[0];
if (!oldSim) throw new Error("I3b build-contract SimBuildId marker missing");
replaceOnce(oldSim, `export const WORLD_V0_EXPECTED_SIM_BUILD_ID = "${simBuildId}";`, "SimBuildId");

writeFileSync(path, source);
console.log(`WORLD_V0_I3B_BUILD_CONTRACT_APPLY PASS · ${simBuildId}`);
