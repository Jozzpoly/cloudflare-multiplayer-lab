import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";

const OUTPUT = process.env.MW_WORLD_V0_PRESENTATION_OUTPUT ?? "world-v0-smoothness-presentation-directness.json";
const source = readFileSync("public/world-v0/app.js", "utf8");
const audit = readFileSync("docs/WORLD_V0_SMOOTHNESS_REGRESSION_CAUSAL_AUDIT_2026-09-15.md", "utf8");

function block(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert(start >= 0 && end > start, `source block missing: ${startMarker} -> ${endMarker}`);
  return source.slice(start, end);
}

const sync = block("function syncMeshes()", "function updateCamera()");
const camera = block("function updateCamera()", "function recordFrame(");
const replace = block("function replaceLiveWithPlayer", "function correctFrom(");

assert(sync.includes("selfMesh.position.fromArray(position)"), "self mesh is no longer direct from physics position");
assert(sync.includes("remoteMesh.position.fromArray(position)"), "remote mesh is no longer direct from physics position");
assert(sync.includes("mesh.position.fromArray(bodyPosition(body))"), "prop mesh is no longer direct from physics position");
assert(!/lerp|damp|smooth|interpolat/i.test(sync), "syncMeshes now contains a presentation smoothing path; probe must be redesigned");
assert(camera.includes("camera.position.set(selfMesh.position.x + offset[0]"), "camera no longer follows self mesh directly in x");
assert(camera.includes("selfMesh.position.z + offset[2]"), "camera no longer follows self mesh directly in z");
assert(camera.includes("camera.lookAt(selfMesh.position.x, targetY, selfMesh.position.z)"), "camera target no longer follows self mesh directly");
assert(!/lerp|damp|smooth|interpolat/i.test(camera), "updateCamera now contains smoothing; probe must be redesigned");
assert(replace.includes("localState.sim = next"), "live simulation replacement marker missing");

const selfMatch = audit.match(/max self correction ~([0-9.]+) m/);
const remoteMatch = audit.match(/max remote correction reported by aggregate metrics ~([0-9.]+) m/);
const propMatch = audit.match(/max prop correction ~([0-9.]+) m/);
assert(selfMatch && remoteMatch && propMatch, "Owner correction magnitudes missing from causal audit");
const owner = {
  selfMaxMeters: Number(selfMatch[1]),
  remoteMaxMeters: Number(remoteMatch[1]),
  propMaxMeters: Number(propMatch[1]),
};

const result = {
  revision: "world-v0-smoothness-presentation-directness-v1",
  sourceContract: {
    correctedLiveSimulationReplacesPriorSimulation: true,
    selfMeshPhysicsPositionGain: 1,
    remoteMeshPhysicsPositionGain: 1,
    propMeshPhysicsPositionGain: 1,
    cameraSelfTranslationGainXZ: 1,
    independentPresentationState: false,
    correctionSmoothingInSyncPath: false,
  },
  ownerEvidenceImplication: {
    ...owner,
    nextSyncRemoteMeshDiscontinuityCanReachMeters: owner.remoteMaxMeters,
    nextSyncPropMeshDiscontinuityCanReachMeters: owner.propMaxMeters,
    selfCorrectionAlsoTranslatesCameraXZUpToMeters: owner.selfMaxMeters,
  },
  verdict: "EXACT_CORRECTION_DIRECTLY_EXPOSED_TO_PRESENTATION_PROVEN",
  nonClaim: "This proves the current source transfer path is direct and unsmoothed. It does not claim every correction delta is fully visible in a captured video frame; multiple simulation/correction events may occur between rendered frames.",
};
writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
console.log(result.verdict);
