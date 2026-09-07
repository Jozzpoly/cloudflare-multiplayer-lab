import { readFileSync, writeFileSync } from "node:fs";

const sourcePath = "scripts/world-v0-playability-pressure-probe.mjs";
const outputPath = "scripts/.world-v0-playability-pressure-v2.mjs";
let source = readFileSync(sourcePath, "utf8");

const oldDrain = `  await sleep(1400);\n\n  await Promise.all(clients.map((client, index) => waitFor(\n    client,\n    \`(() => { const e = window.__sharedYardV0Evidence?.(); return e && !e.runtimeFailed && e.metrics?.guardMismatches === 0 && e.metrics?.guardPending === 0; })()\`,\n    \`client \${index} pressure drain\`,\n  )));\n  end = await Promise.all(clients.map(evidence));`;
const newDrain = `  // Pressure sampling is intentionally wall-clock bounded. Pending exact guards are\n  // recorded but do not block the pressure sample; exact drain is a separate gate.\n  await sleep(2500);\n  end = await Promise.all(clients.map(evidence));`;
if (!source.includes(oldDrain)) throw new Error("pressure v2: exact old drain block not found");
source = source.replace(oldDrain, newDrain);

const oldSummary = `    guardMatches: end.metrics?.guardMatches ?? null,\n    guardMismatches: end.metrics?.guardMismatches ?? null,\n    firstStateMismatch: end.metrics?.firstStateMismatch ?? null,`;
const newSummary = `    guardMatches: end.metrics?.guardMatches ?? null,\n    guardPending: end.metrics?.guardPending ?? null,\n    guardMismatches: end.metrics?.guardMismatches ?? null,\n    firstStateMismatch: end.metrics?.firstStateMismatch ?? null,`;
if (!source.includes(oldSummary)) throw new Error("pressure v2: summary anchor not found");
source = source.replace(oldSummary, newSummary);

source = source.replace(
  `  changeCount: CHANGE_COUNT,\n};`,
  `  changeCount: CHANGE_COUNT,\n  samplingContract: "fixed-wall-clock-v2-exact-drain-separated",\n};`,
);

writeFileSync(outputPath, source);
console.log("WORLD_V0_PLAYABILITY_PRESSURE_V2_PREPARED", outputPath);
