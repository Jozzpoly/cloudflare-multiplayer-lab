import { readFileSync, writeFileSync } from "node:fs";

const path = "public/world-v0/build-contract.js";
const simBuildId = process.argv[2];
if (!/^shared-yard-v0-sim-[0-9a-f]{16}$/.test(simBuildId ?? "")) {
  throw new Error(`invalid I3 SimBuildId: ${simBuildId}`);
}

const NEW_CLIENT = "shared-yard-v0-browser-sim-v4-logical-input-scheduler";
let source = readFileSync(path, "utf8");
if (source.includes(`WORLD_V0_CLIENT_SIM_REVISION = "${NEW_CLIENT}"`) &&
    source.includes(`WORLD_V0_EXPECTED_SIM_BUILD_ID = "${simBuildId}"`)) {
  console.log(`WORLD_V0_I3_BUILD_CONTRACT_APPLY already applied · ${simBuildId}`);
  process.exit(0);
}

function replaceOnce(before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`I3 build-contract marker missing: ${label}`);
  if (source.indexOf(before, first + before.length) >= 0) throw new Error(`I3 build-contract marker ambiguous: ${label}`);
  source = source.slice(0, first) + after + source.slice(first + before.length);
}

replaceOnce(
  `export const WORLD_V0_CLIENT_SIM_REVISION = "shared-yard-v0-browser-sim-v3-supersession";`,
  `export const WORLD_V0_CLIENT_SIM_REVISION = "${NEW_CLIENT}";`,
  "client simulation revision",
);
const simMarker = /export const WORLD_V0_EXPECTED_SIM_BUILD_ID = "shared-yard-v0-sim-[0-9a-f]{16}";/.exec(source)?.[0];
if (!simMarker) throw new Error("I3 build-contract SimBuildId marker missing");
replaceOnce(simMarker, `export const WORLD_V0_EXPECTED_SIM_BUILD_ID = "${simBuildId}";`, "SimBuildId");

writeFileSync(path, source);
console.log(`WORLD_V0_I3_BUILD_CONTRACT_APPLY PASS · ${simBuildId}`);
