import { readFileSync, writeFileSync } from "node:fs";

const PATH = "scripts/.world-v0-playability-input-shape-probe.mjs";
let source = readFileSync(PATH, "utf8");

const before = `    guardMatches: end.metrics?.guardMatches ?? null,
    guardMismatches: end.metrics?.guardMismatches ?? null,
    firstStateMismatch: end.metrics?.firstStateMismatch ?? null,`;
const after = `    guardMatches: end.metrics?.guardMatches ?? null,
    guardMismatches: end.metrics?.guardMismatches ?? null,
    guardPending: end.metrics?.guardPending ?? null,
    pendingStateGuardBoundaries: Array.isArray(end.pendingStateGuardBoundaries) ? [...end.pendingStateGuardBoundaries] : [],
    localBoundaryTick: end.localBoundaryTick ?? null,
    firstStateMismatch: end.metrics?.firstStateMismatch ?? null,`;
const first = source.indexOf(before);
if (first < 0) throw new Error("remote playability semantic guard anchor missing");
if (source.indexOf(before, first + before.length) >= 0) throw new Error("remote playability semantic guard anchor not unique");
source = source.slice(0, first) + after + source.slice(first + before.length);
writeFileSync(PATH, source);
console.log("WORLD_V0_REMOTE_PLAYABILITY_SEMANTIC_GUARD_PREPARED", PATH);
