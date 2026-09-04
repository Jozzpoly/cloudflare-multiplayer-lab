import { readFileSync, writeFileSync } from "node:fs";

await import("./apply-world-v0-playable-refinement-v6-tests.mjs");

const path = "scripts/world-v0-runtime-shell-smoke.mjs";
let source = readFileSync(path, "utf8");
const before = 'cameraControlRevision === "shared-yard-v0-playable-control-v1"';
const after = 'cameraControlRevision === "shared-yard-v0-playable-control-v2"';
const first = source.indexOf(before);
if (first < 0) throw new Error("v6 runtime-shell control revision anchor missing");
if (source.indexOf(before, first + before.length) >= 0) throw new Error("v6 runtime-shell control revision anchor not unique");
source = source.slice(0, first) + after + source.slice(first + before.length);
writeFileSync(path, source);
console.log("WORLD_V0_PLAYABLE_REFINEMENT_V6_REGRESSION_PATCH_PASS", path);
