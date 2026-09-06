import { readFileSync } from "node:fs";
import {
  WORLD_V0_BOX3D_RUNTIME,
  WORLD_V0_CLIENT_HISTORY,
  WORLD_V0_SIM_BUILD_ID,
  WORLD_V0_TIMING,
} from "../src/world-v0-contract.ts";

function assert(condition, message) { if (!condition) throw new Error(message); }
const server = readFileSync("src/world-v0-shared-yard.ts", "utf8");
const browser = readFileSync("public/world-v0/app.js", "utf8");
const build = readFileSync("public/world-v0/build-contract.js", "utf8");

assert(WORLD_V0_BOX3D_RUNTIME.build === "i4-raw-seed-bindings-box3djs-5d5a3af-emsdk-6.0.2", "I4b lost I4a Box3D seam");
assert(server.includes("world-v0-authority-rebase-seed-v1"), "authority seed revision missing");
assert(server.includes("b3.b3World_StartRecording(this.world, recording)"), "authority seed recording start missing");
assert(server.includes("b3.b3World_StopRecording(this.world)"), "authority seed finalization missing");
assert(server.includes("b3.b3Recording_CopyData(recording)"), "authority seed copy missing");
assert(server.includes("rebaseSeed,"), "resumed welcome seed missing");
assert(browser.includes("world-v0-browser-actor-resume-v1"), "browser actor resume contract missing");
assert(browser.includes("b3.b3RecPlayer_CreateFromBytes(bytes, 1)"), "browser raw seed creation missing");
assert(browser.includes("createHistoryAtBoundary(next, seed.boundaryTick, \"authority-rebase\")"), "browser arbitrary-boundary history reset missing");
assert(browser.includes("batchSeq = Math.max(batchSeq, message.resumeLastBatchSeq)"), "browser batch-seq recovery missing");
assert(browser.includes('url.searchParams.set("resume", resumeToken)'), "browser resume-token transport missing");
assert(build.includes(`WORLD_V0_EXPECTED_SIM_BUILD_ID = "${WORLD_V0_SIM_BUILD_ID}"`), "browser SimBuildId drift");
assert(WORLD_V0_CLIENT_HISTORY.retainTicks === 24, "I4b unexpectedly widened history horizon");
assert(WORLD_V0_TIMING.inputLeaseMissingTicks === 36, "I4b unexpectedly widened input lease");

const result = {
  revision: "world-v0-integration-i4b-seam-v1",
  simBuildId: WORLD_V0_SIM_BUILD_ID,
  historyRetainTicks: WORLD_V0_CLIENT_HISTORY.retainTicks,
  inputLeaseMissingTicks: WORLD_V0_TIMING.inputLeaseMissingTicks,
  box3dBuild: WORLD_V0_BOX3D_RUNTIME.build,
  verdict: "WORLD_V0_INTEGRATION_I4B_SEAM_PASS",
  nonClaim: "This is a static/runtime-contract seam check. Wire exactness and automatic browser recovery require the authority and Chromium gates.",
};
console.log("WORLD_V0_INTEGRATION_I4B_SEAM", JSON.stringify(result, null, 2));
console.log(result.verdict);
