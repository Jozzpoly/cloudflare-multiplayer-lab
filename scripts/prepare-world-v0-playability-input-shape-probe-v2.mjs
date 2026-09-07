import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const sourcePath = "scripts/prepare-world-v0-playability-input-shape-probe.mjs";
const fixedPath = "scripts/.prepare-world-v0-playability-input-shape-probe-fixed.mjs";
let source = readFileSync(sourcePath, "utf8");
const token = "${client.index}";
const matches = source.split(token).length - 1;
if (matches !== 1) throw new Error(`expected exactly one unsafe client.index interpolation, found ${matches}`);
source = source.replace(token, "\\${client.index}");
writeFileSync(fixedPath, source);
await import(`${pathToFileURL(fixedPath).href}?fixed=${Date.now()}`);
console.log("WORLD_V0_PLAYABILITY_INPUT_SHAPE_PREPARER_V2_PASS");
