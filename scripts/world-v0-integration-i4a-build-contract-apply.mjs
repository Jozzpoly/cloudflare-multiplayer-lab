import { readFileSync, writeFileSync } from "node:fs";

const path = "public/world-v0/build-contract.js";
const simBuildId = process.argv[2] || "";
if (!/^shared-yard-v0-sim-[0-9a-f]{16}$/.test(simBuildId)) throw new Error(`invalid I4a SimBuildId ${simBuildId}`);
let source = readFileSync(path, "utf8");

const NEW_CLIENT = "shared-yard-v0-browser-sim-v5-i4-rebase-runtime-seam";
const NEW_SERVER = "shared-yard-v0-authority-v4-i4-rebase-runtime-seam";
const NEW_BUILD = "i4-raw-seed-bindings-box3djs-5d5a3af-emsdk-6.0.2";
const NEW_URL = "./box3d-i4/box3d.inline.mjs";

if (source.includes(NEW_CLIENT) && source.includes(NEW_SERVER) && source.includes(simBuildId) &&
    source.includes(`WORLD_V0_BOX3D_BUILD = "${NEW_BUILD}"`) && source.includes(NEW_URL)) {
  console.log(`WORLD_V0_I4A_BUILD_CONTRACT_APPLY already applied · ${simBuildId}`);
  process.exit(0);
}

function replaceOnce(before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`I4a build-contract marker missing: ${label}`);
  if (source.indexOf(before, first + before.length) >= 0) throw new Error(`I4a build-contract marker ambiguous: ${label}`);
  source = source.slice(0, first) + after + source.slice(first + before.length);
}

replaceOnce(`export const WORLD_V0_CLIENT_SIM_REVISION = "shared-yard-v0-browser-sim-v4-logical-input-scheduler";`,
  `export const WORLD_V0_CLIENT_SIM_REVISION = "${NEW_CLIENT}";`, "client revision");
replaceOnce(`export const WORLD_V0_EXPECTED_SERVER_REVISION = "shared-yard-v0-authority-v3-supersession";`,
  `export const WORLD_V0_EXPECTED_SERVER_REVISION = "${NEW_SERVER}";`, "server revision");
replaceOnce(/export const WORLD_V0_EXPECTED_SIM_BUILD_ID = "shared-yard-v0-sim-[0-9a-f]{16}";/.exec(source)?.[0] || "__missing__",
  `export const WORLD_V0_EXPECTED_SIM_BUILD_ID = "${simBuildId}";`, "SimBuildId");
replaceOnce(`export const WORLD_V0_BOX3D_PACKAGE = "box3d.js@0.1.1";\nexport const WORLD_V0_BOX3D_URL = "https://cdn.jsdelivr.net/npm/box3d.js@0.1.1/dist/box3d.inline.mjs";`,
  `export const WORLD_V0_BOX3D_PACKAGE = "box3d.js@0.1.1";\nexport const WORLD_V0_BOX3D_BUILD = "${NEW_BUILD}";\nexport const WORLD_V0_BOX3D_URL = "${NEW_URL}";`, "Box3D browser artifact");

writeFileSync(path, source);
console.log(`WORLD_V0_I4A_BUILD_CONTRACT_APPLY PASS · ${simBuildId}`);
