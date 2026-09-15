import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";

const OUTPUT = process.env.MW_WORLD_V0_VALIDATION_TOPOLOGY_OUTPUT ?? "world-v0-validation-topology-audit.json";
const read = (path) => readFileSync(path, "utf8");

const files = {
  package: read("package.json"),
  ci: read(".github/workflows/ci.yml"),
  current: read(".github/workflows/world-v0-current-validation.yml"),
  product: read(".github/workflows/world-v0-ongoing-yard-product.yml"),
  staging: read(".github/workflows/world-v0-ongoing-yard-staging.yml"),
  stabilization: read(".github/workflows/world-v0-foundation-stabilization-causal-gate.yml"),
  ownerUi: read(".github/workflows/world-v0-owner-ui-regression.yml"),
};

function includesAll(source, values) { return values.every((value) => source.includes(value)); }

const runtimeBlastRadius = [
  "public/world-v0/app.js",
  "src/world-v0-contract.ts",
  "src/world-v0-protocol.ts",
  "src/world-v0-shared-yard.ts",
];

const observations = {
  ci: {
    automaticOnMain: files.ci.includes("branches: [main]"),
    automaticOnPullRequest: files.ci.includes("pull_request:"),
    executesNpmCheck: files.ci.includes("npm run check"),
  },
  npmCheck: {
    runsA2rForecast: files.package.includes('"check:a2r": "node scripts/a2r-forecast-lab.mjs --ci"'),
    runsA2rOwnerLab: files.package.includes("a2r-owner-lab.mjs") && /\"check\"\s*:\s*\"[^\"]*a2r-owner-lab/.test(files.package),
    browserAuditNamesMayBeSyntaxOnly: files.package.includes("node --check scripts/world-v0-chromium-cloud-smoke.mjs"),
  },
  currentValidation: {
    automaticOnlyOnMain: files.current.includes("branches: [main]"),
    runtimePathsCovered: runtimeBlastRadius.filter((path) => files.current.includes(`- ${path}`)),
    recoveryHeavy: includesAll(files.current, [
      "Requalify automatic ActorSession exact-rebase recovery",
      "Requalify dual-browser hard-drop recovery",
      "Requalify cross-page ActorSession resume",
    ]),
    explicitSmoothnessContract: /smoothness|correction jerk|presentation discontinuity|supersession rate/i.test(files.current),
  },
  ongoingProduct: {
    branchScoped: files.product.includes("- world-v0-ongoing-yard"),
    broadRuntimePaths: files.product.includes("- public/world-v0/**") && files.product.includes("- src/world-v0-shared-yard.ts"),
    executesBehavioralChromium: files.product.includes("node scripts/world-v0-ongoing-yard-product-chromium.mjs"),
    executesFixedRecoveryControl: files.product.includes("world-v0-integration-i4b-chromium-rebase-audit.mjs"),
    explicitSmoothnessContract: /smoothness|correction jerk|presentation discontinuity|supersession rate/i.test(files.product),
  },
  remoteStaging: {
    branchScoped: files.staging.includes("- world-v0-ongoing-yard"),
    runtimePathTriggers: runtimeBlastRadius.filter((path) => files.staging.includes(`- ${path}`)),
    workflowFileOnlyPushPath: files.staging.includes("- .github/workflows/world-v0-ongoing-yard-staging.yml") && !runtimeBlastRadius.some((path) => files.staging.includes(`- ${path}`)),
    executesRemoteBehavioralChromium: files.staging.includes("node scripts/world-v0-ongoing-yard-product-chromium.mjs"),
  },
  manualGates: {
    stabilizationDispatchOnly: files.stabilization.includes("on:\n  workflow_dispatch:") && !files.stabilization.includes("push:"),
    ownerUiDispatchOnly: files.ownerUi.includes("on:\n  workflow_dispatch:") && !files.ownerUi.includes("push:"),
  },
};

assert.equal(observations.ci.automaticOnMain, true);
assert.equal(observations.ci.automaticOnPullRequest, true);
assert.equal(observations.npmCheck.runsA2rForecast, true);
assert.equal(observations.npmCheck.runsA2rOwnerLab, false, "A2R owner feel lab unexpectedly became part of canonical npm check; update audit");
assert.equal(observations.currentValidation.recoveryHeavy, true);
assert.equal(observations.currentValidation.explicitSmoothnessContract, false, "current validation already has smoothness contract; update audit");
assert.equal(observations.ongoingProduct.executesBehavioralChromium, true);
assert.equal(observations.ongoingProduct.explicitSmoothnessContract, false, "ongoing product flow already has smoothness contract; update audit");
assert.equal(observations.remoteStaging.workflowFileOnlyPushPath, true, "remote staging runtime trigger gap no longer present; update audit");
assert.equal(observations.manualGates.stabilizationDispatchOnly, true);
assert.equal(observations.manualGates.ownerUiDispatchOnly, true);

const result = {
  revision: "world-v0-validation-topology-audit-v1",
  runtimeBlastRadius,
  observations,
  structuralGaps: [
    "canonical-npm-check-does-not-execute-owner-feel-lab",
    "current-validation-protects-truth-recovery-but-has-no-explicit-smoothness-contract",
    "ongoing-product-behavioral-flow-has-no-explicit-smoothness-contract",
    "remote-staging-behavioral-proof-is-not-automatically-triggered-by-runtime-path-changes",
    "stabilization-and-owner-ui-gates-are-manual-dispatch-only",
    "several-browser-audit-scripts-are-syntax-checked-inside-npm-check-rather-than-behaviorally-executed",
  ],
  verdict: "VALIDATION_TOPOLOGY_COVERAGE_GAPS_PROVEN",
  nonClaim: "Manual or branch-specific gates can still have strong evidence value. This audit only distinguishes existence of tests from automatic regression protection across runtime blast radius.",
};
writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
console.log(result.verdict);
