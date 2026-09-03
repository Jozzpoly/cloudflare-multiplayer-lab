import { readFileSync, writeFileSync } from "node:fs";
import {
  Q1B_EXPECTED_PERTURB_BOUNDARY,
  firstTraceDifference,
} from "../public/foundation-q1b/sim-core.js";

const x64Path = process.env.MW_Q1C_X64 || "q1c-artifacts/foundation-v0-q1c-x64/foundation-v0-q1c-x64.json";
const arm64Path = process.env.MW_Q1C_ARM64 || "q1c-artifacts/foundation-v0-q1c-arm64/foundation-v0-q1c-arm64.json";
const output = process.env.MW_Q1C_SUMMARY || "foundation-v0-q1c-summary.json";

const x64 = JSON.parse(readFileSync(x64Path, "utf8"));
const arm64 = JSON.parse(readFileSync(arm64Path, "utf8"));

function sameFields(a, b) {
  return JSON.stringify(a.fields) === JSON.stringify(b.fields);
}

function compareTrace(reference, candidate) {
  if (!sameFields(reference, candidate)) {
    return { pass: false, firstDivergence: { boundaryTick: 0, field: "field-layout" } };
  }
  const firstDivergence = firstTraceDifference(reference, candidate);
  return { pass: firstDivergence === null, firstDivergence };
}

const baselineArchitecture = compareTrace(x64.baseline, arm64.baseline);
const perturbArchitecture = compareTrace(x64.perturb, arm64.perturb);
const x64SensitivityDifference = firstTraceDifference(x64.baseline, x64.perturb);
const arm64SensitivityDifference = firstTraceDifference(arm64.baseline, arm64.perturb);
const x64SensitivityPass = x64SensitivityDifference?.boundaryTick === Q1B_EXPECTED_PERTURB_BOUNDARY;
const arm64SensitivityPass = arm64SensitivityDifference?.boundaryTick === Q1B_EXPECTED_PERTURB_BOUNDARY;
const couplingPass = x64.baseline.maxPropDisplacement > 0.05 && arm64.baseline.maxPropDisplacement > 0.05;
const archIdentityPass = x64.runtime.arch === "x64" && arm64.runtime.arch === "arm64";
const pass = baselineArchitecture.pass && perturbArchitecture.pass && x64SensitivityPass && arm64SensitivityPass && couplingPass && archIdentityPass;

const summary = {
  revision: "foundation-v0-q1c-architecture-v1",
  generatedAt: new Date().toISOString(),
  provenance: {
    githubSha: process.env.GITHUB_SHA || null,
    githubRunId: process.env.GITHUB_RUN_ID || null,
    githubRunAttempt: process.env.GITHUB_RUN_ATTEMPT || null,
  },
  runtimes: {
    x64: {
      node: x64.runtime.node,
      platform: x64.runtime.platform,
      arch: x64.runtime.arch,
      package: x64.packageContract,
      sourceRunId: x64.provenance.githubRunId,
    },
    arm64: {
      node: arm64.runtime.node,
      platform: arm64.runtime.platform,
      arch: arm64.runtime.arch,
      package: arm64.packageContract,
      sourceRunId: arm64.provenance.githubRunId,
    },
  },
  architectureIdentity: { pass: archIdentityPass },
  coupledScene: {
    pass: couplingPass,
    x64MaxPropDisplacement: x64.baseline.maxPropDisplacement,
    arm64MaxPropDisplacement: arm64.baseline.maxPropDisplacement,
  },
  baselineX64VsArm64: baselineArchitecture,
  perturbedX64VsArm64: perturbArchitecture,
  localSensitivity: {
    x64: {
      pass: x64SensitivityPass,
      expectedFirstDivergentBoundary: Q1B_EXPECTED_PERTURB_BOUNDARY,
      firstDivergence: x64SensitivityDifference,
    },
    arm64: {
      pass: arm64SensitivityPass,
      expectedFirstDivergentBoundary: Q1B_EXPECTED_PERTURB_BOUNDARY,
      firstDivergence: arm64SensitivityDifference,
    },
  },
  verdict: pass ? "Q1C_PASS_X64_ARM64_ARCHITECTURE_ENVELOPE" : "Q1C_FAIL",
  nonClaim: "Q1c does not qualify Android/browser runtime, ARM mobile performance, Cloudflare Worker determinism, reconnect/persistence or production synchronization architecture.",
};

writeFileSync(output, JSON.stringify(summary, null, 2));
console.log(`${summary.revision} · ${summary.verdict}`);
console.log(`baseline x64↔arm64: ${baselineArchitecture.pass ? "IDENTICAL" : `DIVERGED@${baselineArchitecture.firstDivergence?.boundaryTick ?? "unknown"}`}`);
console.log(`perturb x64↔arm64: ${perturbArchitecture.pass ? "IDENTICAL" : `DIVERGED@${perturbArchitecture.firstDivergence?.boundaryTick ?? "unknown"}`}`);
console.log(`sensitivity x64=${x64SensitivityDifference?.boundaryTick ?? "none"} arm64=${arm64SensitivityDifference?.boundaryTick ?? "none"}`);
console.log(`coupled displacement x64=${x64.baseline.maxPropDisplacement.toFixed(6)}m arm64=${arm64.baseline.maxPropDisplacement.toFixed(6)}m`);
if (!pass) process.exitCode = 1;
