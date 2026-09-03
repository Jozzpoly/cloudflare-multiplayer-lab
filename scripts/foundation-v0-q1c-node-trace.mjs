import { readFileSync, writeFileSync } from "node:fs";
import Box3D from "box3d.js/inline";
import { runQ1bSimulation } from "../public/foundation-q1b/sim-core.js";

const label = process.env.MW_Q1C_LABEL || process.arch;
const expectedArch = process.env.MW_Q1C_EXPECTED_ARCH || process.arch;
if (process.arch !== expectedArch) {
  throw new Error(`runner architecture mismatch: expected ${expectedArch}, got ${process.arch}`);
}

const packageJson = JSON.parse(readFileSync("node_modules/box3d.js/package.json", "utf8"));
if (packageJson.version !== "0.1.1") throw new Error(`unexpected box3d.js version ${packageJson.version}`);

const b3 = await Box3D();
const baseline = runQ1bSimulation(b3, { perturb: false });
const perturb = runQ1bSimulation(b3, { perturb: true });

const evidence = {
  revision: "foundation-v0-q1c-architecture-v1",
  generatedAt: new Date().toISOString(),
  label,
  runtime: {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
  },
  packageContract: {
    name: packageJson.name,
    version: packageJson.version,
    import: "box3d.js/inline",
    box3dVersion: baseline.box3dVersion,
  },
  provenance: {
    githubSha: process.env.GITHUB_SHA || null,
    githubRunId: process.env.GITHUB_RUN_ID || null,
    githubRunAttempt: process.env.GITHUB_RUN_ATTEMPT || null,
  },
  baseline,
  perturb,
};

const path = `foundation-v0-q1c-${label}.json`;
writeFileSync(path, JSON.stringify(evidence, null, 2));
console.log(`${evidence.revision} · ${label} · ${process.platform}/${process.arch} · baseline=${baseline.maxPropDisplacement.toFixed(6)}m perturb=${perturb.maxPropDisplacement.toFixed(6)}m`);
console.log(`evidence written to ${path}`);
