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
  "function sessionRunKey() {",
  `const PLAYABILITY_OBSERVABILITY_REVISION = "world-v0-playability-observability-v1";
const playabilityObservability = {
  revision: PLAYABILITY_OBSERVABILITY_REVISION,
  correctionCount: 0,
  correctionDurationMs: 0,
  rewindTicks: 0,
  replaySteps: 0,
  byReason: { "peer-record": 0, "authority-consumed": 0, other: 0 },
  distance: {
    self: { total: 0, over001: 0, over005: 0, over010: 0, over025: 0 },
    remote: { total: 0, over001: 0, over005: 0, over010: 0, over025: 0 },
    prop: { total: 0, over001: 0, over005: 0, over010: 0, over025: 0 },
  },
};

function resetPlayabilityObservability() {
  playabilityObservability.correctionCount = 0;
  playabilityObservability.correctionDurationMs = 0;
  playabilityObservability.rewindTicks = 0;
  playabilityObservability.replaySteps = 0;
  Object.assign(playabilityObservability.byReason, { "peer-record": 0, "authority-consumed": 0, other: 0 });
  for (const value of Object.values(playabilityObservability.distance)) {
    Object.assign(value, { total: 0, over001: 0, over005: 0, over010: 0, over025: 0 });
  }
}

function recordPlayabilityCorrection(reason, delta, durationMs, rewind, replaySteps) {
  playabilityObservability.correctionCount += 1;
  playabilityObservability.correctionDurationMs += durationMs;
  playabilityObservability.rewindTicks += rewind;
  playabilityObservability.replaySteps += replaySteps;
  if (Object.hasOwn(playabilityObservability.byReason, reason)) playabilityObservability.byReason[reason] += 1;
  else playabilityObservability.byReason.other += 1;
  for (const key of ["self", "remote", "prop"]) {
    const magnitude = Number(delta?.[key] || 0);
    const target = playabilityObservability.distance[key];
    target.total += magnitude;
    if (magnitude > 0.01) target.over001 += 1;
    if (magnitude > 0.05) target.over005 += 1;
    if (magnitude > 0.10) target.over010 += 1;
    if (magnitude > 0.25) target.over025 += 1;
  }
}

function currentSelfSimulationProbe() {
  if (!localState?.sim || !selfSessionId) return null;
  const body = localState.sim.actorBodies.get(selfSessionId);
  if (!body) return null;
  return {
    boundaryTick: localState.boundaryTick,
    position: bodyPosition(body),
    linearVelocity: bodyLinearVelocity(body),
  };
}

function sessionRunKey() {`,
  "observability state",
);

replaceOnce(
  `  metrics.maxCorrection.prop = Math.max(metrics.maxCorrection.prop, delta.prop);
  correctionFrameWindowUntil = Math.max(correctionFrameWindowUntil, performance.now() + 150);`,
  `  metrics.maxCorrection.prop = Math.max(metrics.maxCorrection.prop, delta.prop);
  recordPlayabilityCorrection(reason, delta, durationMs, rewind, replayed);
  correctionFrameWindowUntil = Math.max(correctionFrameWindowUntil, performance.now() + 150);`,
  "correction severity accumulation",
);

replaceOnce(
  `    metrics: JSON.parse(JSON.stringify(metrics)),
    rtt: {`,
  `    metrics: JSON.parse(JSON.stringify(metrics)),
    playabilityObservability: JSON.parse(JSON.stringify(playabilityObservability)),
    simulationProbe: currentSelfSimulationProbe(),
    rtt: {`,
  "evidence observability",
);

replaceOnce(
  `window.__sharedYardV0PlayableControl = () => ({
  revision: WORLD_V0_PLAYABLE_CONTROL_REVISION,
  cameraOrbit: { ...cameraOrbit },
  rawInput: rawCurrentInput(),
  worldInput: currentInput(),
});`,
  `window.__sharedYardV0PlayableControl = () => ({
  revision: WORLD_V0_PLAYABLE_CONTROL_REVISION,
  cameraOrbit: { ...cameraOrbit },
  rawInput: rawCurrentInput(),
  worldInput: currentInput(),
});
window.__sharedYardV0PlayabilityTest = {
  revision: PLAYABILITY_OBSERVABILITY_REVISION,
  setDrive({ x = 0, z = 0, yaw = null } = {}) {
    touchInput = { x: Number(x) || 0, z: Number(z) || 0 };
    if (Number.isFinite(yaw)) {
      cameraOrbit.yaw = yaw;
      cameraOrbit.userAdjusted = true;
    }
    return { rawInput: rawCurrentInput(), worldInput: currentInput(), simulationProbe: currentSelfSimulationProbe() };
  },
  stopDrive() {
    touchInput = zeroInput();
    return { rawInput: rawCurrentInput(), worldInput: currentInput(), simulationProbe: currentSelfSimulationProbe() };
  },
  probe() {
    return {
      rawInput: rawCurrentInput(),
      worldInput: currentInput(),
      simulationProbe: currentSelfSimulationProbe(),
      observability: JSON.parse(JSON.stringify(playabilityObservability)),
    };
  },
};`,
  "playability test hook",
);

replaceOnce(
  `    longFrames: 0,
  });
  clearWorldVisuals();`,
  `    longFrames: 0,
  });
  resetPlayabilityObservability();
  clearWorldVisuals();`,
  "observability reset",
);

writeFileSync(PATH, source);
console.log(JSON.stringify({ verdict: "WORLD_V0_PLAYABILITY_OBSERVABILITY_APPLIED", revision: "world-v0-playability-observability-v1" }, null, 2));
