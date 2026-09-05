import { readFileSync, writeFileSync } from "node:fs";

const SOURCE = "scripts/world-v0-authority-runtime-smoke.mjs";
const OUTPUT = "scripts/.world-v0-shared-consequence-authority-runtime-smoke.mjs";

let source = readFileSync(SOURCE, "utf8");

const replacements = [
  [
    "const EXPECTED_GUARD_LENGTH = 14 * 13 * 8;",
    "const EXPECTED_GUARD_LENGTH = 20 * 13 * 8;",
  ],
  [
    'assert(Array.isArray(message.props) && message.props.length === 12, "snapshot missing 12 props");',
    'assert(Array.isArray(message.props) && message.props.length === 18, "snapshot missing 18 props");',
  ],
];

for (const [before, after] of replacements) {
  const occurrences = source.split(before).length - 1;
  if (occurrences !== 1) {
    throw new Error(`authority adapter anchor drift: expected exactly one occurrence of ${JSON.stringify(before)}, found ${occurrences}`);
  }
  source = source.replace(before, after);
}

writeFileSync(OUTPUT, source);
console.log("WORLD_V0_SHARED_CONSEQUENCE_V1_AUTHORITY_ADAPTER_PASS", JSON.stringify({
  sourcePath: SOURCE,
  outputPath: OUTPUT,
  replacements: replacements.length,
  propCount: 18,
  dynamicEntityCount: 20,
  guardComponentsPerEntity: 13,
}));