import { readFileSync, writeFileSync } from "node:fs";

const files = [
  ".github/workflows/world-v0-current-validation.yml",
  ".github/workflows/world-v0-session-continuity-r1-qualification.yml",
];
const before = "    branches: [main, world-v0-session-continuity-r1-exec]";
const after = "    branches: [main, world-v0-session-continuity-r1-exec, world-v0-jump-reliability-r1]";

for (const path of files) {
  const source = readFileSync(path, "utf8");
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`qualification bridge source mismatch: ${path}`);
  if (source.indexOf(before, first + before.length) >= 0) throw new Error(`qualification bridge source ambiguous: ${path}`);
  writeFileSync(path, source.slice(0, first) + after + source.slice(first + before.length));
}

console.log("WORLD_V0_JUMP_QUALIFICATION_BRIDGE_MATERIALIZED", JSON.stringify({ files }));
