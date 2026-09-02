import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { spawnSync } from "node:child_process";

const DONOR = "scripts/rc1-integrated-causality-envelope.mjs";
const GENERATED = "scripts/.ws0-player-contact-isolation.generated.mjs";

const DELAYS = process.env.WS0_CONTACT_DELAYS || "0,65,85";

const SCENARIOS = `const SCENARIOS = [
  {
    name: "approach-no-contact",
    analysisStartMs: 1650,
    durationMs: 5800,
    a: [
      { atMs: 0, x: 0, z: 1 },
      { atMs: 360, x: 0, z: 0 },
      { atMs: 600, x: 0, z: 1 },
      { atMs: 1500, x: 0, z: 0 },
      { atMs: 1800, x: 1, z: 0 },
      { atMs: 2800, x: 0, z: 0 },
    ],
    b: [
      { atMs: 0, x: 0, z: 0 },
      { atMs: 600, x: 0, z: 1 },
      { atMs: 1500, x: 0, z: 0 },
      { atMs: 1800, x: -1, z: 0 },
      { atMs: 2800, x: 0, z: 0 },
    ],
  },
  {
    name: "player-contact-only",
    analysisStartMs: 1650,
    durationMs: 7200,
    a: [
      { atMs: 0, x: 0, z: 1 },
      { atMs: 360, x: 0, z: 0 },
      { atMs: 600, x: 0, z: 1 },
      { atMs: 1500, x: 0, z: 0 },
      { atMs: 1800, x: 1, z: 0 },
      { atMs: 4300, x: 0, z: 0 },
    ],
    b: [
      { atMs: 0, x: 0, z: 0 },
      { atMs: 600, x: 0, z: 1 },
      { atMs: 1500, x: 0, z: 0 },
      { atMs: 1800, x: -1, z: 0 },
      { atMs: 4300, x: 0, z: 0 },
    ],
  },
];`;

function replaceRange(source, startMarker, endMarker, replacement) {
  const start = source.indexOf(startMarker);
  if (start < 0) throw new Error(`missing donor marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start);
  if (end < 0) throw new Error(`missing donor end marker: ${endMarker}`);
  return source.slice(0, start) + replacement + source.slice(end);
}

let source = readFileSync(DONOR, "utf8");

const delayStart = source.indexOf("const DELAYS_MS =");
const scenarioStart = source.indexOf("const SCENARIOS = [");
if (delayStart < 0 || scenarioStart < 0 || scenarioStart <= delayStart) {
  throw new Error("RC1 donor delay/scenario seam changed");
}
source = source.slice(0, delayStart) +
  `const DELAYS_MS = process.env.WS0_CONTACT_DELAYS\n  ? process.env.WS0_CONTACT_DELAYS.split(\",\").map(Number).filter(Number.isFinite)\n  : [0, 65, 85];\n\n` +
  source.slice(scenarioStart);

const scenarioEnd = source.indexOf("\n];", source.indexOf("const SCENARIOS = ["));
if (scenarioEnd < 0) throw new Error("RC1 donor scenario block changed");
source = source.slice(0, source.indexOf("const SCENARIOS = [")) + SCENARIOS + source.slice(scenarioEnd + 4);

const oldGate = `        const movement = Math.max(analysisA.authorityRowMovement, analysisB.authorityRowMovement);\n        if (!(movement > 0.12)) {\n          throw new Error(\`\${scenario.name}/\${delayMs} did not exercise tracked shared row: movement=\${movement}\`);\n        }`;
const newGate = `        const movement = Math.max(analysisA.authorityRowMovement, analysisB.authorityRowMovement);\n        if (movement > 0.05) {\n          throw new Error(\`\${scenario.name}/\${delayMs} contaminated by shared-prop contact: movement=\${movement}\`);\n        }`;
if (!source.includes(oldGate)) throw new Error("RC1 donor shared-row qualification seam changed");
source = source.replace(oldGate, newGate);
source = source.replaceAll("RC1 integrated temporal causality envelope", "WS0 player-contact causal isolation");
source = source.replaceAll("rc1-envelope.json", "ws0-player-contact-isolation.json");
source = source.replaceAll("RC1 STRUCTURAL RUN PASS", "WS0 PLAYER-CONTACT ISOLATION STRUCTURAL PASS");

writeFileSync(GENERATED, source);
try {
  const result = spawnSync(process.execPath, [GENERATED], {
    stdio: "inherit",
    env: { ...process.env, WS0_CONTACT_DELAYS: DELAYS },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
} finally {
  try { unlinkSync(GENERATED); } catch { /* research teardown */ }
}
