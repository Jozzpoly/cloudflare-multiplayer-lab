import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { spawnSync } from "node:child_process";

const DONOR = "scripts/rc1-integrated-causality-envelope.mjs";
const GENERATED = "scripts/.ws0-player-contact-isolation.generated.mjs";
const DELAYS = process.env.WS0_CONTACT_DELAYS || "0,65,85";
const ACTOR_SYNC = process.env.WS0_ACTOR_SYNC || "none";
const OUTPUT = process.env.WS0_CONTACT_OUTPUT || "ws0-player-contact-isolation.json";

if (!["none", "transform", "state"].includes(ACTOR_SYNC)) throw new Error(`invalid WS0_ACTOR_SYNC: ${ACTOR_SYNC}`);
if (!/^[A-Za-z0-9._-]+$/.test(OUTPUT)) throw new Error(`invalid WS0_CONTACT_OUTPUT: ${OUTPUT}`);

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

const oldUrls = [
  '        const aUrl = `${BASE_URL}/world0-rc1/?player=A-${nonce}&delayMs=${delayMs}`;',
  '        const bUrl = `${BASE_URL}/world0-rc1/?player=B-${nonce}&delayMs=${delayMs}`;',
].join("\n");
const encodedMode = encodeURIComponent(ACTOR_SYNC);
const treatmentUrls = [
  '        const aUrl = `${BASE_URL}/world0-rc1/?player=A-${nonce}&delayMs=${delayMs}&actorSync=' + encodedMode + '`;',
  '        const bUrl = `${BASE_URL}/world0-rc1/?player=B-${nonce}&delayMs=${delayMs}&actorSync=' + encodedMode + '`;',
].join("\n");
if (!source.includes(oldUrls)) throw new Error("RC1 donor URL seam changed");
source = source.replace(oldUrls, treatmentUrls);

const oldNavigation = `        await navigate(a, aUrl);\n        await navigate(b, bUrl);`;
const qualifiedNavigation = `        await navigate(a, aUrl);\n        await waitFor(\`\${scenario.name}/\${delayMs} A owns slot0\`, async () => {\n          const s = await state(a);\n          return s && s.networkState === \"live\" && s.playerCount === 1 &&\n            Array.isArray(s.selfPosition) && s.selfPosition[0] < -6 && s.selfPosition[2] < -1 ? s : false;\n        }, 25_000);\n        await navigate(b, bUrl);`;
if (!source.includes(oldNavigation)) throw new Error("RC1 donor navigation seam changed");
source = source.replace(oldNavigation, qualifiedNavigation);

const oldGate = `        const movement = Math.max(analysisA.authorityRowMovement, analysisB.authorityRowMovement);\n        if (!(movement > 0.12)) {\n          throw new Error(\`\${scenario.name}/\${delayMs} did not exercise tracked shared row: movement=\${movement}\`);\n        }`;
const newGate = `        const movement = Math.max(analysisA.authorityRowMovement, analysisB.authorityRowMovement);\n        if (movement > 0.05) {\n          throw new Error(\`\${scenario.name}/\${delayMs} contaminated by shared-prop contact: movement=\${movement}\`);\n        }\n\n        const separationA = distance3(finalA.selfPosition, finalA.remotePosition);\n        const separationB = distance3(finalB.selfPosition, finalB.remotePosition);\n        if (!Number.isFinite(separationA) || !Number.isFinite(separationB)) {\n          throw new Error(\`\${scenario.name}/\${delayMs} missing actor-separation evidence\`);\n        }\n        if (scenario.name === \"approach-no-contact\" && Math.min(separationA, separationB) < 2.0) {\n          throw new Error(\`\${scenario.name}/\${delayMs} accidentally contacted: separations=\${separationA}/\${separationB}\`);\n        }\n        if (scenario.name === \"player-contact-only\" && Math.max(separationA, separationB) > 0.9) {\n          throw new Error(\`\${scenario.name}/\${delayMs} failed to establish contact: separations=\${separationA}/\${separationB}\`);\n        }`;
if (!source.includes(oldGate)) throw new Error("RC1 donor shared-row qualification seam changed");
source = source.replace(oldGate, newGate);

source = source.replaceAll("RC1 integrated temporal causality envelope", `WS0 player-contact causal isolation · actorSync=${ACTOR_SYNC}`);
source = source.replaceAll("rc1-envelope.json", OUTPUT);
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
