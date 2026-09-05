import { readFileSync, writeFileSync } from "node:fs";

const SOURCE = "public/world-v0/app.js";
const OUTPUT = process.env.MW_WORLD_V0_SHARED_CONSEQUENCE_APP_OUTPUT || SOURCE;

let source = readFileSync(SOURCE, "utf8");

const before = 'if (!Array.isArray(contract.netEntityOrder) || contract.netEntityOrder.length !== 14) throw new Error(`${phase} invalid NetEntityId order`);';
const after = 'if (!Array.isArray(contract.netEntityOrder) || contract.netEntityOrder.length !== 25) throw new Error(`${phase} invalid NetEntityId order`);';
const occurrences = source.split(before).length - 1;
if (occurrences !== 1) {
  throw new Error(`browser adapter anchor drift: expected exactly one control-width assertion, found ${occurrences}`);
}
source = source.replace(before, after);

writeFileSync(OUTPUT, source);
console.log("WORLD_V0_SHARED_CONSEQUENCE_BROWSER_ADAPTER_PASS", JSON.stringify({
  sourcePath: SOURCE,
  outputPath: OUTPUT,
  controlDynamicEntityCount: 14,
  experimentDynamicEntityCount: 25,
  replacements: 1,
}));
