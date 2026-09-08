import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  WORLD_V0_CLIENT_SIM_REVISION,
  WORLD_V0_CONTRACT_REVISION,
  WORLD_V0_PROTOCOL_REVISION,
  WORLD_V0_SERVER_REVISION,
  WORLD_V0_TIMING,
  WORLD_V0_SIM_BUILD_ID,
} from "../src/world-v0-contract.ts";

assert.equal(WORLD_V0_CONTRACT_REVISION, "shared-yard-v0-contract-v7-i3-authority-temporal-floor");
assert.equal(WORLD_V0_CLIENT_SIM_REVISION, "shared-yard-v0-browser-sim-v7-i3-authority-temporal-floor");
assert.equal(WORLD_V0_SERVER_REVISION, "shared-yard-v0-authority-v5-i4-exact-full-state-rebase");
assert.equal(WORLD_V0_PROTOCOL_REVISION, "shared-yard-v0-scheduled-input-v3-supersession");
assert.equal(WORLD_V0_TIMING.simulationHz, 60);
assert.equal(WORLD_V0_TIMING.predictionLeadTicks, 8);
assert.equal(WORLD_V0_TIMING.inputBatchSize, 2);
assert.equal(WORLD_V0_TIMING.maxFutureTicks, 32);
assert.equal(WORLD_V0_TIMING.inputLeaseMissingTicks, 36);
assert.match(WORLD_V0_SIM_BUILD_ID, /^shared-yard-v0-sim-[0-9a-f]{16}$/);
assert.notEqual(WORLD_V0_SIM_BUILD_ID, "shared-yard-v0-sim-6125fe326d69d410");

function oldAuthorityEstimate(phaseEstimate) {
  return phaseEstimate;
}
function candidateAuthorityEstimate(phaseEstimate, observedBoundary) {
  return Number.isInteger(observedBoundary)
    ? Math.max(phaseEstimate, observedBoundary)
    : phaseEstimate;
}
function oldWindow(estimate, protocolStart = 90) {
  return {
    start: Math.max(protocolStart, Math.floor(estimate)),
    through: Math.floor(estimate + WORLD_V0_TIMING.predictionLeadTicks) - 1,
  };
}
function candidateWindow(estimate, protocolStart = 90) {
  return {
    start: Math.max(protocolStart, Math.floor(estimate) + 1),
    through: Math.floor(estimate + WORLD_V0_TIMING.predictionLeadTicks) - 1,
  };
}

// Captured failing CI shape: sparse ping phase estimate can be ~8 ticks behind a
// boundary the client has already observed through consumed/ACK traffic.
const phaseEstimate = 211.4;
const observedBoundary = 217;
const oldEstimate = oldAuthorityEstimate(phaseEstimate);
const fixedEstimate = candidateAuthorityEstimate(phaseEstimate, observedBoundary);
const old = oldWindow(oldEstimate);
const fixed = candidateWindow(fixedEstimate);

assert.equal(old.start, 211);
assert.equal(old.through, 218);
assert(old.start <= observedBoundary, "control no longer reproduces unsafe front edge");
assert.equal(fixedEstimate, observedBoundary, "observed authority boundary did not floor stale phase estimate");
assert.equal(fixed.start, 218, "candidate did not begin strictly after observed/current authority boundary");
assert.equal(fixed.through, 224, "candidate unexpectedly changed the prediction horizon formula");
assert(fixed.start > observedBoundary, "candidate can newly author current/past authority boundary");
assert(fixed.through - observedBoundary <= WORLD_V0_TIMING.predictionLeadTicks,
  "candidate exceeded existing prediction lead");

// Fresh phase estimates still work without an observed-boundary floor.
const phaseOnly = candidateAuthorityEstimate(121.25, null);
assert.equal(phaseOnly, 121.25);
assert.deepEqual(candidateWindow(phaseOnly), { start: 122, through: 128 });

// A newer phase estimate is never dragged backward by an older observed boundary.
assert.equal(candidateAuthorityEstimate(140.75, 139), 140.75);

const browser = readFileSync("public/world-v0/app.js", "utf8");
assert(browser.includes("I3b authority-observed temporal floor"));
assert(browser.includes("Math.max(phaseEstimate, lastAuthorityBoundaryTick)"));
assert(browser.includes("Math.floor(estimate) + 1"));
assert(browser.includes("shared-yard-v0-logical-input-scheduler-v2-authority-floor"));
assert(!browser.includes("const startTick = Math.max(protocolStartTick, Math.floor(estimate));"));

const evidence = {
  revision: "world-v0-integration-i3b-temporal-floor-v1",
  simBuildId: WORLD_V0_SIM_BUILD_ID,
  reproducedFailureShape: {
    phaseEstimate,
    observedBoundary,
    oldWindow: old,
  },
  candidate: {
    estimate: fixedEstimate,
    window: fixed,
    strictFutureFrontEdge: fixed.start > observedBoundary,
    predictionLeadTicksUnchanged: WORLD_V0_TIMING.predictionLeadTicks,
    inputLeaseMissingTicksUnchanged: WORLD_V0_TIMING.inputLeaseMissingTicks,
  },
  preserved: {
    serverRevision: WORLD_V0_SERVER_REVISION,
    protocolRevision: WORLD_V0_PROTOCOL_REVISION,
    maxFutureTicks: WORLD_V0_TIMING.maxFutureTicks,
  },
  verdict: "WORLD_V0_INTEGRATION_I3B_TEMPORAL_FLOOR_PASS",
  nonClaim: "This pure/static falsifier proves the stale-phase/current-boundary authoring defect is removed without increasing lead, lease, history, or protocol windows. Real Chromium repeatability is still required before runtime promotion.",
};
console.log("WORLD_V0_INTEGRATION_I3B_TEMPORAL_FLOOR", JSON.stringify(evidence, null, 2));
console.log(evidence.verdict);
