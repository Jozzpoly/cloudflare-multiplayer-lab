import { readFileSync, writeFileSync } from "node:fs";

const path = "public/world-v0/build-contract.js";
const simBuildId = process.argv[2];
if (!/^shared-yard-v0-sim-[0-9a-f]{16}$/.test(simBuildId ?? "")) {
  throw new Error(`invalid I2 SimBuildId: ${simBuildId}`);
}

const NEW = {
  client: "shared-yard-v0-browser-sim-v3-supersession",
  server: "shared-yard-v0-authority-v3-supersession",
  protocol: "shared-yard-v0-scheduled-input-v3-supersession",
};

let source = readFileSync(path, "utf8");
if (
  source.includes(`WORLD_V0_CLIENT_SIM_REVISION = "${NEW.client}"`) &&
  source.includes(`WORLD_V0_EXPECTED_SERVER_REVISION = "${NEW.server}"`) &&
  source.includes(`WORLD_V0_EXPECTED_PROTOCOL_REVISION = "${NEW.protocol}"`) &&
  source.includes(`WORLD_V0_EXPECTED_SIM_BUILD_ID = "${simBuildId}"`)
) {
  console.log(`WORLD_V0_I2_BUILD_CONTRACT_APPLY already applied · ${simBuildId}`);
  process.exit(0);
}

function replaceOnce(before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`I2 build-contract marker missing: ${label}`);
  if (source.indexOf(before, first + before.length) >= 0) throw new Error(`I2 build-contract marker ambiguous: ${label}`);
  source = source.slice(0, first) + after + source.slice(first + before.length);
}

replaceOnce(
  `export const WORLD_V0_CLIENT_SIM_REVISION = "shared-yard-v0-browser-sim-v2-jump";`,
  `export const WORLD_V0_CLIENT_SIM_REVISION = "${NEW.client}";`,
  "client sim revision",
);
replaceOnce(
  `export const WORLD_V0_EXPECTED_SERVER_REVISION = "shared-yard-v0-authority-v2-jump";`,
  `export const WORLD_V0_EXPECTED_SERVER_REVISION = "${NEW.server}";`,
  "server revision",
);
replaceOnce(
  `export const WORLD_V0_EXPECTED_PROTOCOL_REVISION = "shared-yard-v0-scheduled-input-v2-jump";`,
  `export const WORLD_V0_EXPECTED_PROTOCOL_REVISION = "${NEW.protocol}";`,
  "protocol revision",
);
replaceOnce(
  /export const WORLD_V0_EXPECTED_SIM_BUILD_ID = "shared-yard-v0-sim-[0-9a-f]{16}";/.exec(source)?.[0] ?? "__missing_sim_build_marker__",
  `export const WORLD_V0_EXPECTED_SIM_BUILD_ID = "${simBuildId}";`,
  "sim build id",
);

writeFileSync(path, source);
console.log(`WORLD_V0_I2_BUILD_CONTRACT_APPLY PASS · ${simBuildId}`);
