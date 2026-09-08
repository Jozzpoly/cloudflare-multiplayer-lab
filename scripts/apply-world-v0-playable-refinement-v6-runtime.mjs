import { readFileSync, writeFileSync } from "node:fs";

await import("./apply-world-v0-playable-refinement-v6.mjs");

const path = "public/world-v0/app.js";
let source = readFileSync(path, "utf8");
const before = 'addEventListener("visibilitychange", () => {';
const after = 'document.addEventListener("visibilitychange", () => {';
const first = source.indexOf(before);
if (first < 0) throw new Error("v6 generated visibility listener anchor missing");
if (source.indexOf(before, first + before.length) >= 0) throw new Error("v6 generated visibility listener anchor not unique");
source = source.slice(0, first) + after + source.slice(first + before.length);
if (!source.includes(after)) throw new Error("v6 document visibility listener correction failed");
writeFileSync(path, source);
console.log("WORLD_V0_PLAYABLE_REFINEMENT_V6_RUNTIME_PATCH_PASS", path);
