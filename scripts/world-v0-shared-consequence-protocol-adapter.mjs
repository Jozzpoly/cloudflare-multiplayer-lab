import { readFileSync, writeFileSync } from "node:fs";

const sourcePath = "scripts/world-v0-protocol-smoke.ts";
const outputPath = "scripts/.world-v0-shared-consequence-protocol-smoke.ts";
let source = readFileSync(sourcePath, "utf8");

const replacements = [
  [
    'assert.equal(WORLD_V0_PROP_LAYOUT.length, 12, "Shared Yard V0 must keep the F5 12-prop body count");',
    'assert.equal(WORLD_V0_PROP_LAYOUT.length, 18, "Shared Consequence V1 must keep the bounded 18-prop experiment count");',
  ],
  [
    'assert.equal(new Set(WORLD_V0_PROP_LAYOUT.map((prop) => prop.id)).size, 12, "prop NetEntityIds must be unique");',
    'assert.equal(new Set(WORLD_V0_PROP_LAYOUT.map((prop) => prop.id)).size, 18, "prop NetEntityIds must be unique");',
  ],
  [
    'assert.equal(WORLD_V0_NET_ENTITY_ORDER.length, 14);',
    'assert.equal(WORLD_V0_NET_ENTITY_ORDER.length, 20);',
  ],
];

for (const [before, after] of replacements) {
  const occurrences = source.split(before).length - 1;
  if (occurrences !== 1) {
    throw new Error(`Shared Consequence V1 protocol adapter anchor drift: expected one occurrence of ${JSON.stringify(before)}, got ${occurrences}`);
  }
  source = source.replace(before, after);
}

writeFileSync(outputPath, source);
console.log("WORLD_V0_SHARED_CONSEQUENCE_V1_PROTOCOL_ADAPTER_PASS", JSON.stringify({ sourcePath, outputPath, replacements: replacements.length }));