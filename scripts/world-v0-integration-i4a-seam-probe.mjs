import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import {
  WORLD_V0_BOX3D_RUNTIME,
  WORLD_V0_SIM_BUILD_ID,
} from "../src/world-v0-contract.ts";

const modulePath = resolve("public/world-v0/box3d-i4/box3d.inline.mjs");
const wasmPath = resolve("public/world-v0/box3d-i4/box3d.wasm");
const expectedBuild = "i4-raw-seed-bindings-box3djs-5d5a3af-emsdk-6.0.2";

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}
function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(statSync(modulePath).size > 100_000, "I4a custom Box3D module unexpectedly small");
assert(statSync(wasmPath).size > 100_000, "I4a custom Box3D wasm unexpectedly small");
assert(WORLD_V0_BOX3D_RUNTIME.package === "box3d.js@0.1.1", "I4a package lineage drift");
assert(WORLD_V0_BOX3D_RUNTIME.build === expectedBuild, "I4a build identity drift");

const { default: Box3D } = await import(`${pathToFileURL(modulePath).href}?i4a=${Date.now()}`);
const b3 = await Box3D();
for (const name of ["b3Recording_CopyData", "b3RecPlayer_CreateFromBytes", "b3Bytes_Fnv1a32"]) {
  assert(typeof b3[name] === "function", `I4a custom binding missing ${name}`);
}

const runtime = readFileSync("src/box3d-runtime.ts", "utf8");
const server = readFileSync("src/world-v0-shared-yard.ts", "utf8");
const browser = readFileSync("public/world-v0/app.js", "utf8");
const buildContract = readFileSync("public/world-v0/build-contract.js", "utf8");

assert(runtime.includes("../public/world-v0/box3d-i4/box3d.inline.mjs"), "Worker is not pinned to I4a module");
assert(runtime.includes("../public/world-v0/box3d-i4/box3d.wasm"), "Worker is not pinned to I4a wasm");
assert(server.includes("b3.b3Body_SetName(body, `prop:${authored.id}`)"), "authority prop recording locator missing");
assert(server.includes("createPlayerBody(start, `actor:${slot}`)"), "authority actor recording locator missing");
assert(browser.includes("b3RecPlayer_CreateFromBytes"), "browser raw rebase capability guard missing");
assert(browser.includes("contract.box3dRuntime?.build !== WORLD_V0_BOX3D_BUILD"), "browser Box3D build fail-closed guard missing");
assert(buildContract.includes(`WORLD_V0_EXPECTED_SIM_BUILD_ID = "${WORLD_V0_SIM_BUILD_ID}"`), "browser SimBuildId is not synchronized");
assert(buildContract.includes(`WORLD_V0_BOX3D_BUILD = "${expectedBuild}"`), "browser Box3D build identity not synchronized");
assert(buildContract.includes(`WORLD_V0_BOX3D_URL = "./box3d-i4/box3d.inline.mjs"`), "browser Box3D URL not local/pinned");

const result = {
  revision: "world-v0-integration-i4a-runtime-seam-v1",
  simBuildId: WORLD_V0_SIM_BUILD_ID,
  box3d: {
    package: WORLD_V0_BOX3D_RUNTIME.package,
    build: WORLD_V0_BOX3D_RUNTIME.build,
    moduleBytes: statSync(modulePath).size,
    wasmBytes: statSync(wasmPath).size,
    moduleSha256: sha256(modulePath),
    wasmSha256: sha256(wasmPath),
    rawSeedBindings: true,
  },
  authorityRecordingLocators: {
    actors: "actor:<slot>",
    props: "prop:<netEntityId>",
    browserReplayCompatible: true,
  },
  verdict: "WORLD_V0_INTEGRATION_I4A_RUNTIME_SEAM_PASS",
  nonClaim: "This proves the pinned custom physics artifact and recording locator seam are present and identity-guarded. It does not yet prove authority-to-browser wire rebase or reconnect recovery; those belong to I4b.",
};
console.log("WORLD_V0_INTEGRATION_I4A_RUNTIME_SEAM", JSON.stringify(result, null, 2));
console.log(result.verdict);
