import { readFileSync, writeFileSync } from "node:fs";

const contractPath = "src/world-v0-contract.ts";
const browserPath = "public/world-v0/app.js";
let contract = readFileSync(contractPath, "utf8");
let browser = readFileSync(browserPath, "utf8");

const NEW_CONTRACT = "shared-yard-v0-contract-v7-i3-authority-temporal-floor";
const NEW_CLIENT = "shared-yard-v0-browser-sim-v7-i3-authority-temporal-floor";
const NEW_SCHEDULER = "shared-yard-v0-logical-input-scheduler-v2-authority-floor";
const MARKER = "I3b authority-observed temporal floor";

if (contract.includes(NEW_CONTRACT) && contract.includes(NEW_CLIENT) && browser.includes(MARKER) && browser.includes(NEW_SCHEDULER)) {
  console.log("WORLD_V0_I3B_TEMPORAL_FLOOR_APPLY already applied");
  process.exit(0);
}

function replaceOnce(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`I3b patch marker missing: ${label}`);
  if (source.indexOf(before, first + before.length) >= 0) throw new Error(`I3b patch marker ambiguous: ${label}`);
  return source.slice(0, first) + after + source.slice(first + before.length);
}

contract = replaceOnce(
  contract,
  'export const WORLD_V0_CONTRACT_REVISION = "shared-yard-v0-contract-v6-i4-exact-full-state-rebase";',
  `export const WORLD_V0_CONTRACT_REVISION = "${NEW_CONTRACT}";`,
  "contract revision",
);
contract = replaceOnce(
  contract,
  'export const WORLD_V0_CLIENT_SIM_REVISION = "shared-yard-v0-browser-sim-v6-i4-exact-full-state-rebase";',
  `export const WORLD_V0_CLIENT_SIM_REVISION = "${NEW_CLIENT}";`,
  "client simulation revision",
);

browser = replaceOnce(
  browser,
  `function authorityTickEstimate(now = performance.now()) {\n  if (!phaseAnchor) return null;\n  return phaseAnchor.tick + (now - phaseAnchor.at) / STEP_MS;\n}`,
  `function authorityTickEstimate(now = performance.now()) {\n  if (!phaseAnchor) return null;\n  const phaseEstimate = phaseAnchor.tick + (now - phaseAnchor.at) / STEP_MS;\n  // I3b authority-observed temporal floor. world_v0_consumed / ACK / snapshot\n  // traffic gives us a monotonic authority boundary far more frequently than the\n  // ping phase anchor. Never schedule from an estimate older than authority state\n  // the client has already actually observed.\n  return Number.isInteger(lastAuthorityBoundaryTick)\n    ? Math.max(phaseEstimate, lastAuthorityBoundaryTick)\n    : phaseEstimate;\n}`,
  "authority estimate floor",
);

browser = replaceOnce(
  browser,
  `  const startTick = Math.max(protocolStartTick, Math.floor(estimate));\n  const authoredThrough = Math.floor(estimate + simulation.timing.predictionLeadTicks) - 1;`,
  `  // Canonical authorship starts strictly after the estimated current authority\n  // boundary. Targeting floor(estimate) is an arrival race: the authority may\n  // consume that boundary while the batch is in transport. Prediction horizon is\n  // intentionally unchanged; this only removes the unsafe front edge.\n  const startTick = Math.max(protocolStartTick, Math.floor(estimate) + 1);\n  const authoredThrough = Math.floor(estimate + simulation.timing.predictionLeadTicks) - 1;`,
  "strict-future scheduler front edge",
);

browser = replaceOnce(
  browser,
  `revision: "shared-yard-v0-logical-input-scheduler-v1"`,
  `revision: "${NEW_SCHEDULER}"`,
  "scheduler evidence revision",
);

if (!contract.includes(NEW_CONTRACT) || !contract.includes(NEW_CLIENT) ||
    !browser.includes(MARKER) || !browser.includes(NEW_SCHEDULER) ||
    !browser.includes("Math.max(phaseEstimate, lastAuthorityBoundaryTick)") ||
    !browser.includes("Math.floor(estimate) + 1")) {
  throw new Error("I3b temporal-floor patch postcondition failed");
}

writeFileSync(contractPath, contract);
writeFileSync(browserPath, browser);
console.log("WORLD_V0_I3B_TEMPORAL_FLOOR_APPLY PASS");
