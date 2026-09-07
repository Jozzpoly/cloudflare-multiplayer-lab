import { readFileSync, writeFileSync } from "node:fs";

const PATH = "public/world-v0/app.js";
let source = readFileSync(PATH, "utf8");

function replaceOnce(before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`${label}: source anchor not found`);
  if (source.indexOf(before, first + before.length) >= 0) throw new Error(`${label}: source anchor not unique`);
  source = source.slice(0, first) + after + source.slice(first + before.length);
}

replaceOnce(
  `function currentSelfSimulationProbe() {`,
  `const INPUT_RESPONSE_REVISION = "world-v0-input-response-frontier-v1";
let inputResponseSequence = 0;
let inputResponseProbe = null;

function inputResponseSnapshot() {
  return inputResponseProbe ? JSON.parse(JSON.stringify(inputResponseProbe)) : null;
}

function armInputResponse({ x = 0, z = 0, yaw = null } = {}) {
  touchInput = { x: Number(x) || 0, z: Number(z) || 0 };
  if (Number.isFinite(yaw)) {
    cameraOrbit.yaw = yaw;
    cameraOrbit.userAdjusted = true;
  }
  const requestedAt = performance.now();
  const estimate = authorityTickEstimate(requestedAt);
  const input = currentInput();
  inputResponseSequence += 1;
  inputResponseProbe = {
    revision: INPUT_RESPONSE_REVISION,
    id: inputResponseSequence,
    requestedAt,
    requestAuthorityEstimate: Number.isFinite(estimate) ? estimate : null,
    requestAuthorityFloor: Number.isFinite(estimate) ? Math.floor(estimate) : null,
    requestLocalBoundary: localState?.boundaryTick ?? null,
    requestLocalMinusAuthority: Number.isFinite(estimate) && Number.isInteger(localState?.boundaryTick)
      ? localState.boundaryTick - estimate
      : null,
    requestedInput: { ...input },
    authoredAt: null,
    authoredTick: null,
    authoredAuthorityEstimate: null,
    authoredLocalBoundary: null,
    requiredBoundaryToConsume: null,
    predictionTargetAtAuthorship: null,
    immediateCapacityAtAuthorship: null,
    appliedAt: null,
    appliedTick: null,
    appliedBoundaryBefore: null,
    appliedAuthorityEstimate: null,
    requestToAuthoredMs: null,
    requestToAppliedMs: null,
    authorityAdvanceToApply: null,
    completed: false,
  };
  return inputResponseSnapshot();
}

function maybeRecordInputResponseAuthorship(estimate, startTick, authoredThrough) {
  const probe = inputResponseProbe;
  if (!probe || probe.completed || probe.authoredTick !== null) return;
  for (let tick = startTick; tick <= authoredThrough; tick += 1) {
    const intended = intendedSelf.get(tick);
    if (!intended || !sameInput(intended, probe.requestedInput)) continue;
    const now = performance.now();
    const targetBoundary = Math.max(0, Math.floor(estimate + simulation.timing.clientSimulationLeadTicks));
    probe.authoredAt = now;
    probe.authoredTick = tick;
    probe.authoredAuthorityEstimate = estimate;
    probe.authoredLocalBoundary = localState?.boundaryTick ?? null;
    probe.requiredBoundaryToConsume = tick + 1;
    probe.predictionTargetAtAuthorship = targetBoundary;
    probe.immediateCapacityAtAuthorship = targetBoundary >= tick + 1;
    probe.requestToAuthoredMs = Math.max(0, now - probe.requestedAt);
    return;
  }
}

function maybeRecordInputResponseApplied(tick, resolvedSelf) {
  const probe = inputResponseProbe;
  if (!probe || probe.completed || probe.authoredTick === null) return;
  if (tick < probe.authoredTick || !sameInput(resolvedSelf, probe.requestedInput)) return;
  const now = performance.now();
  const estimate = authorityTickEstimate(now);
  probe.appliedAt = now;
  probe.appliedTick = tick;
  probe.appliedBoundaryBefore = localState?.boundaryTick ?? null;
  probe.appliedAuthorityEstimate = Number.isFinite(estimate) ? estimate : null;
  probe.requestToAppliedMs = Math.max(0, now - probe.requestedAt);
  probe.authorityAdvanceToApply = Number.isFinite(estimate) && Number.isFinite(probe.requestAuthorityEstimate)
    ? estimate - probe.requestAuthorityEstimate
    : null;
  probe.completed = true;
}

function currentSelfSimulationProbe() {`,
  "input response observability state",
);

replaceOnce(
  `  sendInputRevisionRecords(revisions);
}`,
  `  maybeRecordInputResponseAuthorship(estimate, startTick, authoredThrough);
  sendInputRevisionRecords(revisions);
}`,
  "input response authorship observation",
);

replaceOnce(
  `  usedByTick.set(tick, { self: { ...resolved.self }, remote: { ...resolved.remote } });
  const selfBody = sim.actorBodies.get(selfSessionId);`,
  `  usedByTick.set(tick, { self: { ...resolved.self }, remote: { ...resolved.remote } });
  maybeRecordInputResponseApplied(tick, resolved.self);
  const selfBody = sim.actorBodies.get(selfSessionId);`,
  "input response consumption observation",
);

replaceOnce(
  `    simulationProbe: currentSelfSimulationProbe(),
    rtt: {`,
  `    simulationProbe: currentSelfSimulationProbe(),
    inputResponseProbe: inputResponseSnapshot(),
    rtt: {`,
  "input response evidence",
);

replaceOnce(
  `  stopDrive() {
    touchInput = zeroInput();`,
  `  armResponse(options = {}) {
    return armInputResponse(options);
  },
  responseProbe() {
    return inputResponseSnapshot();
  },
  clearResponseProbe() {
    inputResponseProbe = null;
    return true;
  },
  stopDrive() {
    touchInput = zeroInput();`,
  "input response test hook",
);

replaceOnce(
  `  resetPlayabilityObservability();
  clearWorldVisuals();`,
  `  resetPlayabilityObservability();
  inputResponseProbe = null;
  clearWorldVisuals();`,
  "input response reset",
);

writeFileSync(PATH, source);
console.log(JSON.stringify({ verdict: "WORLD_V0_INPUT_RESPONSE_OBSERVABILITY_APPLIED", revision: "world-v0-input-response-frontier-v1" }, null, 2));
