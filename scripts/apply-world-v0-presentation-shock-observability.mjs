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
  `const PRESENTATION_SHOCK_REVISION = "world-v0-presentation-shock-v1";

function shockStats() {
  return { samples: 0, total: 0, max: 0, over001: 0, over005: 0, over010: 0, over025: 0 };
}

function freshPresentationShock() {
  return {
    revision: PRESENTATION_SHOCK_REVISION,
    renderedFrames: 0,
    correctedFrames: 0,
    uncorrectedFrames: 0,
    correctionEventsObserved: 0,
    maxCorrectionsInFrame: 0,
    byReason: { "peer-record": 0, "authority-consumed": 0, other: 0 },
    netCorrection: { self: shockStats(), remote: shockStats(), prop: shockStats() },
    renderDisplacementCorrected: { self: shockStats(), remote: shockStats(), prop: shockStats() },
    renderDisplacementUncorrected: { self: shockStats(), remote: shockStats(), prop: shockStats() },
    latestCorrectedFrame: null,
  };
}

let presentationShock = freshPresentationShock();
let presentationAccumulator = {
  corrections: 0,
  self: [0, 0, 0],
  remote: [0, 0, 0],
  props: new Map(),
  byReason: { "peer-record": 0, "authority-consumed": 0, other: 0 },
};
let lastRenderedDynamic = null;

function resetPresentationAccumulator() {
  presentationAccumulator = {
    corrections: 0,
    self: [0, 0, 0],
    remote: [0, 0, 0],
    props: new Map(),
    byReason: { "peer-record": 0, "authority-consumed": 0, other: 0 },
  };
}

function resetPresentationShockObservability() {
  presentationShock = freshPresentationShock();
  resetPresentationAccumulator();
  lastRenderedDynamic = null;
}

function addVector(target, before, after) {
  if (!before || !after) return;
  target[0] += after[0] - before[0];
  target[1] += after[1] - before[1];
  target[2] += after[2] - before[2];
}

function magnitude3(value) {
  return Array.isArray(value) ? Math.hypot(value[0] || 0, value[1] || 0, value[2] || 0) : 0;
}

function recordShockMagnitude(target, magnitude) {
  if (!Number.isFinite(magnitude)) return;
  target.samples += 1;
  target.total += magnitude;
  target.max = Math.max(target.max, magnitude);
  if (magnitude > 0.01) target.over001 += 1;
  if (magnitude > 0.05) target.over005 += 1;
  if (magnitude > 0.10) target.over010 += 1;
  if (magnitude > 0.25) target.over025 += 1;
}

function accumulatePresentationCorrection(before, after, reason) {
  presentationAccumulator.corrections += 1;
  const reasonKey = Object.hasOwn(presentationAccumulator.byReason, reason) ? reason : "other";
  presentationAccumulator.byReason[reasonKey] += 1;
  const selfBefore = before?.actors?.get(selfSessionId)?.position;
  const selfAfter = after?.actors?.get(selfSessionId)?.position;
  const remoteBefore = before?.actors?.get(remoteSessionId)?.position;
  const remoteAfter = after?.actors?.get(remoteSessionId)?.position;
  addVector(presentationAccumulator.self, selfBefore, selfAfter);
  addVector(presentationAccumulator.remote, remoteBefore, remoteAfter);
  for (const [id, state] of before?.props || []) {
    const next = after?.props?.get(id);
    if (!next) continue;
    let vector = presentationAccumulator.props.get(id);
    if (!vector) {
      vector = [0, 0, 0];
      presentationAccumulator.props.set(id, vector);
    }
    addVector(vector, state.position, next.position);
  }
}

function maxPropVectorMagnitude(map) {
  let max = 0;
  for (const vector of map.values()) max = Math.max(max, magnitude3(vector));
  return max;
}

function maxPropRenderedDisplacement(previous, current) {
  let max = 0;
  for (const [id, position] of current.props) {
    const prior = previous.props.get(id);
    if (prior) max = Math.max(max, distance3(prior, position));
  }
  return max;
}

function captureRenderedDynamic(selfBody, remoteBody) {
  const props = new Map();
  for (const [id, body] of localState.sim.propBodies) props.set(id, bodyPosition(body));
  return {
    self: selfBody ? bodyPosition(selfBody) : null,
    remote: remoteBody ? bodyPosition(remoteBody) : null,
    props,
  };
}

function flushPresentationShockFrame(selfBody, remoteBody) {
  const current = captureRenderedDynamic(selfBody, remoteBody);
  if (!lastRenderedDynamic) {
    lastRenderedDynamic = current;
    resetPresentationAccumulator();
    return;
  }

  const corrected = presentationAccumulator.corrections > 0;
  presentationShock.renderedFrames += 1;
  if (corrected) presentationShock.correctedFrames += 1;
  else presentationShock.uncorrectedFrames += 1;

  const rendered = {
    self: current.self && lastRenderedDynamic.self ? distance3(lastRenderedDynamic.self, current.self) : 0,
    remote: current.remote && lastRenderedDynamic.remote ? distance3(lastRenderedDynamic.remote, current.remote) : 0,
    prop: maxPropRenderedDisplacement(lastRenderedDynamic, current),
  };

  if (corrected) {
    presentationShock.correctionEventsObserved += presentationAccumulator.corrections;
    presentationShock.maxCorrectionsInFrame = Math.max(presentationShock.maxCorrectionsInFrame, presentationAccumulator.corrections);
    for (const key of ["peer-record", "authority-consumed", "other"]) {
      presentationShock.byReason[key] += presentationAccumulator.byReason[key];
    }
    const net = {
      self: magnitude3(presentationAccumulator.self),
      remote: magnitude3(presentationAccumulator.remote),
      prop: maxPropVectorMagnitude(presentationAccumulator.props),
    };
    for (const key of ["self", "remote", "prop"]) {
      recordShockMagnitude(presentationShock.netCorrection[key], net[key]);
      recordShockMagnitude(presentationShock.renderDisplacementCorrected[key], rendered[key]);
    }
    presentationShock.latestCorrectedFrame = {
      boundaryTick: localState?.boundaryTick ?? null,
      corrections: presentationAccumulator.corrections,
      net,
      rendered,
      reasons: { ...presentationAccumulator.byReason },
    };
  } else {
    for (const key of ["self", "remote", "prop"]) {
      recordShockMagnitude(presentationShock.renderDisplacementUncorrected[key], rendered[key]);
    }
  }

  lastRenderedDynamic = current;
  resetPresentationAccumulator();
}

function currentSelfSimulationProbe() {`,
  "presentation shock observability state",
);

replaceOnce(
  `  recordPlayabilityCorrection(reason, delta, durationMs, rewind, replayed);
  correctionFrameWindowUntil = Math.max(correctionFrameWindowUntil, performance.now() + 150);`,
  `  recordPlayabilityCorrection(reason, delta, durationMs, rewind, replayed);
  accumulatePresentationCorrection(before, after, reason);
  correctionFrameWindowUntil = Math.max(correctionFrameWindowUntil, performance.now() + 150);`,
  "presentation correction accumulation",
);

replaceOnce(
  `  const selfBody = localState.sim.actorBodies.get(selfSessionId);
  const remoteBody = localState.sim.actorBodies.get(remoteSessionId);
  if (selfBody) {`,
  `  const selfBody = localState.sim.actorBodies.get(selfSessionId);
  const remoteBody = localState.sim.actorBodies.get(remoteSessionId);
  flushPresentationShockFrame(selfBody, remoteBody);
  if (selfBody) {`,
  "render-frame shock flush",
);

replaceOnce(
  `    playabilityObservability: JSON.parse(JSON.stringify(playabilityObservability)),
    simulationProbe: currentSelfSimulationProbe(),`,
  `    playabilityObservability: JSON.parse(JSON.stringify(playabilityObservability)),
    presentationShock: JSON.parse(JSON.stringify(presentationShock)),
    simulationProbe: currentSelfSimulationProbe(),`,
  "presentation shock evidence",
);

replaceOnce(
  `  probe() {
    return {
      rawInput: rawCurrentInput(),
      worldInput: currentInput(),
      simulationProbe: currentSelfSimulationProbe(),
      observability: JSON.parse(JSON.stringify(playabilityObservability)),
    };
  },`,
  `  probe() {
    return {
      rawInput: rawCurrentInput(),
      worldInput: currentInput(),
      simulationProbe: currentSelfSimulationProbe(),
      observability: JSON.parse(JSON.stringify(playabilityObservability)),
      presentationShock: JSON.parse(JSON.stringify(presentationShock)),
    };
  },
  resetPresentationShock() {
    resetPresentationShockObservability();
    return JSON.parse(JSON.stringify(presentationShock));
  },`,
  "presentation shock test hook",
);

replaceOnce(
  `  resetPlayabilityObservability();
  clearWorldVisuals();`,
  `  resetPlayabilityObservability();
  resetPresentationShockObservability();
  clearWorldVisuals();`,
  "presentation shock reset",
);

writeFileSync(PATH, source);
console.log(JSON.stringify({ verdict: "WORLD_V0_PRESENTATION_SHOCK_OBSERVABILITY_APPLIED", revision: "world-v0-presentation-shock-v1" }, null, 2));