import { readFileSync, writeFileSync } from "node:fs";

const budget = Number(process.env.MW_WORLD_V0_V22_CATCHUP_STEPS ?? process.argv[2] ?? 8);
if (!Number.isInteger(budget) || budget < 1 || budget > 20) {
  throw new Error(`V22 catch-up budget must be an integer 1..20, got ${budget}`);
}

// Build V22 strictly on the already-qualified V20 substrate. This import is
// intentionally side-effectful: V20 materializes the prediction ceiling and
// exact correction coalescing before this bounded catch-up experiment.
await import("./world-v0-smoothness-materialize-substrate-v20.mjs");

const path = "public/world-v0/app.js";
const marker = `WORLD_V0_HIDDEN_CATCHUP_BUDGET_V22:${budget}`;
let source = readFileSync(path, "utf8");
if (!source.includes("WORLD_V0_SMOOTHNESS_SUBSTRATE_V20")) {
  throw new Error("V22 requires materialized V20 substrate");
}
if (source.includes("WORLD_V0_HIDDEN_CATCHUP_BUDGET_V22:")) {
  throw new Error("V22 catch-up budget already materialized");
}

const seam = "const MAX_PREDICTION_STEPS_PER_FRAME = 20;";
const first = source.indexOf(seam);
if (first < 0 || source.indexOf(seam, first + seam.length) >= 0) {
  throw new Error("V22 prediction-step seam missing or ambiguous");
}
source = source.slice(0, first)
  + `const MAX_PREDICTION_STEPS_PER_FRAME = ${budget}; // ${marker}`
  + source.slice(first + seam.length);

writeFileSync(path, source);
console.log(`WORLD_V0_V22_CATCHUP_BUDGET_MATERIALIZED ${budget}`);
