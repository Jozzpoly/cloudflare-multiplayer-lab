import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const sourcePath = join(here, "ws0-f3-1-coupled-timeline.mjs");
const runtimePath = join(here, ".ws0-f3-1-coupled-timeline-runtime.mjs");
const source = readFileSync(sourcePath, "utf8");
const needle = "trace.padEnd(22)";
const matches = source.split(needle).length - 1;
if (matches !== 1) throw new Error(`expected exactly one logging-only patch site, found ${matches}`);
const patched = source.replace(needle, "trace.name.padEnd(22)");
writeFileSync(runtimePath, patched);
try {
  await import(`${pathToFileURL(runtimePath).href}?run=${Date.now()}`);
} finally {
  try { unlinkSync(runtimePath); } catch { /* cleanup only */ }
}
