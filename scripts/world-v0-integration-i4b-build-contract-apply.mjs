import { readFileSync, writeFileSync } from "node:fs";

const path = "public/world-v0/build-contract.js";
const simBuildId = process.argv[2] || "";
if (!/^shared-yard-v0-sim-[0-9a-f]{16}$/.test(simBuildId)) throw new Error(`invalid I4b SimBuildId ${simBuildId}`);
let source = readFileSync(path, "utf8");

const NEW_CLIENT = "shared-yard-v0-browser-sim-v6-i4-exact-full-state-rebase";
const NEW_SERVER = "shared-yard-v0-authority-v5-i4-exact-full-state-rebase";

if (source.includes(NEW_CLIENT) && source.includes(NEW_SERVER) && source.includes(`WORLD_V0_EXPECTED_SIM_BUILD_ID = "${simBuildId}"`)) {
  console.log(`WORLD_V0_I4B_BUILD_CONTRACT_APPLY already applied · ${simBuildId}`);
  process.exit(0);
}

function replaceOnce(before, after, label) {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`I4b build-contract marker ${label}: expected 1, got ${count}`);
  source = source.replace(before, after);
}

replaceOnce(
  'export const WORLD_V0_CLIENT_SIM_REVISION = "shared-yard-v0-browser-sim-v5-i4-rebase-runtime-seam";',
  `export const WORLD_V0_CLIENT_SIM_REVISION = "${NEW_CLIENT}";`,
  "client revision",
);
replaceOnce(
  'export const WORLD_V0_EXPECTED_SERVER_REVISION = "shared-yard-v0-authority-v4-i4-rebase-runtime-seam";',
  `export const WORLD_V0_EXPECTED_SERVER_REVISION = "${NEW_SERVER}";`,
  "server revision",
);
const oldSim = /export const WORLD_V0_EXPECTED_SIM_BUILD_ID = "shared-yard-v0-sim-[0-9a-f]{16}";/.exec(source)?.[0];
if (!oldSim) throw new Error("I4b build-contract SimBuildId marker missing");
replaceOnce(oldSim, `export const WORLD_V0_EXPECTED_SIM_BUILD_ID = "${simBuildId}";`, "SimBuildId");

writeFileSync(path, source);
console.log(`WORLD_V0_I4B_BUILD_CONTRACT_APPLY PASS · ${simBuildId}`);
