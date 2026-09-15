import { readFileSync, writeFileSync } from "node:fs";

const mode = String(process.argv[2] ?? "ceiling");
if (!new Set(["baseline", "ceiling"]).has(mode)) throw new Error(`V15 mode must be baseline|ceiling, got ${mode}`);

const path = "public/world-v0/app.js";
const marker = "WORLD_V0_PREDICTION_CEILING_V15";
let source = readFileSync(path, "utf8");
if (source.includes(marker)) {
  console.log("prediction-ceiling v15 hook already installed");
  process.exit(0);
}

function replaceOnce(from, to, label) {
  const first = source.indexOf(from);
  if (first < 0) throw new Error(`V15 install missing seam: ${label}`);
  if (source.indexOf(from, first + from.length) >= 0) throw new Error(`V15 install ambiguous seam: ${label}`);
  source = source.slice(0, first) + to + source.slice(first + from.length);
}

replaceOnce(
  "function advancePrediction() {\n  if (!localState || !phaseAnchor || runtimeFailed || actorResume.pending || topologyTransitionPending) return;",
  `function advancePrediction() {\n  if (!localState || !phaseAnchor || runtimeFailed || actorResume.pending || topologyTransitionPending) return;\n  // ${marker}: test-only per-call retained-history safety accounting.\n  let safeBlindTicksV15 = null;\n  let authorityBoundaryV15 = null;\n  let leadBeforeV15 = null;\n  let ceilingBoundaryV15 = null;`,
  "advancePrediction prelude",
);

const canonicalGuard = `    const safeBlindTicks = Math.max(1, simulation.clientHistory.retainTicks - AUTHORITY_SILENCE_RETAIN_MARGIN_TICKS);\n    if (silenceTicks >= safeBlindTicks) {\n      beginActorResume("authority_silence_history_guard", { silenceTicks, safeBlindTicks });\n      return;\n    }`;
const baselineGuard = `    const safeBlindTicks = Math.max(1, simulation.clientHistory.retainTicks - AUTHORITY_SILENCE_RETAIN_MARGIN_TICKS);\n    safeBlindTicksV15 = safeBlindTicks;\n    authorityBoundaryV15 = lastAuthorityBoundaryTick;\n    leadBeforeV15 = silenceTicks;\n    ceilingBoundaryV15 = lastAuthorityBoundaryTick + safeBlindTicks - 1;\n    if (typeof window.__mwV15ObserveGuard === "function") window.__mwV15ObserveGuard({ mode: "baseline", silenceTicks, safeBlindTicks, localBoundary: localState.boundaryTick, authorityBoundary: lastAuthorityBoundaryTick, ceilingBoundary: ceilingBoundaryV15, pressure: silenceTicks >= safeBlindTicks });\n    if (silenceTicks >= safeBlindTicks) {\n      beginActorResume("authority_silence_history_guard", { silenceTicks, safeBlindTicks });\n      return;\n    }`;
const ceilingGuard = `    const safeBlindTicks = Math.max(1, simulation.clientHistory.retainTicks - AUTHORITY_SILENCE_RETAIN_MARGIN_TICKS);\n    safeBlindTicksV15 = safeBlindTicks;\n    authorityBoundaryV15 = lastAuthorityBoundaryTick;\n    leadBeforeV15 = silenceTicks;\n    ceilingBoundaryV15 = lastAuthorityBoundaryTick + safeBlindTicks - 1;\n    if (typeof window.__mwV15ObserveGuard === "function") window.__mwV15ObserveGuard({ mode: "ceiling", silenceTicks, safeBlindTicks, localBoundary: localState.boundaryTick, authorityBoundary: lastAuthorityBoundaryTick, ceilingBoundary: ceilingBoundaryV15, pressure: silenceTicks >= safeBlindTicks });\n    // ${marker}: retained-history pressure is not session loss. If an external event has\n    // already put us at/over the limit, do not advance farther; live authority can still\n    // close the gap. Normal advancement below the limit is hard-clamped below.\n    if (silenceTicks >= safeBlindTicks) return;`;
replaceOnce(canonicalGuard, mode === "ceiling" ? ceilingGuard : baselineGuard, "authority history guard");

const canonicalTarget = "  const targetBoundary = Math.max(0, Math.floor(estimate + simulation.timing.clientSimulationLeadTicks));";
const targetBody = mode === "ceiling"
  ? `  const rawTargetBoundaryV15 = Math.max(0, Math.floor(estimate + simulation.timing.clientSimulationLeadTicks));\n  const targetBoundary = Number.isInteger(ceilingBoundaryV15)\n    ? Math.min(rawTargetBoundaryV15, ceilingBoundaryV15)\n    : rawTargetBoundaryV15;`
  : `  const rawTargetBoundaryV15 = Math.max(0, Math.floor(estimate + simulation.timing.clientSimulationLeadTicks));\n  const targetBoundary = rawTargetBoundaryV15;`;
replaceOnce(canonicalTarget, targetBody, "prediction target");

replaceOnce(
  "  const stillBacklogged = localState.boundaryTick < targetBoundary - MAX_PREDICTION_STEPS_PER_FRAME;",
  `  if (typeof window.__mwV15ObserveAdvance === "function") {\n    window.__mwV15ObserveAdvance({\n      mode: ${JSON.stringify(mode)},\n      localBoundary: localState.boundaryTick,\n      authorityBoundary: authorityBoundaryV15,\n      leadBefore: leadBeforeV15,\n      leadAfter: Number.isInteger(authorityBoundaryV15) ? localState.boundaryTick - authorityBoundaryV15 : null,\n      safeBlindTicks: safeBlindTicksV15,\n      ceilingBoundary: ceilingBoundaryV15,\n      rawTargetBoundary: rawTargetBoundaryV15,\n      targetBoundary,\n      steps,\n      clamped: rawTargetBoundaryV15 > targetBoundary,\n    });\n  }\n  const stillBacklogged = localState.boundaryTick < targetBoundary - MAX_PREDICTION_STEPS_PER_FRAME;`,
  "advance observation",
);

source += `\n// ${marker} public test controls. Canonical app.js is restored after CI.\n{\n  const MODE_V15 = ${JSON.stringify(mode)};\n  const state = {\n    guardObservations: 0,\n    advanceObservations: 0,\n    pressureFrames: 0,\n    clampFrames: 0,\n    maxSilenceTicks: 0,\n    minSafeBlindTicks: null,\n    maxRawOvershootTicks: 0,\n    maxLeadBefore: 0,\n    maxLeadAfter: 0,\n    maxStepsPerAdvance: 0,\n    safetyViolations: 0,\n    samples: [],\n  };\n  const retain = (sample) => {\n    state.samples.push(sample);\n    if (state.samples.length > 512) state.samples.splice(0, state.samples.length - 512);\n  };\n  window.__mwV15ObserveGuard = (sample) => {\n    state.guardObservations += 1;\n    const silenceTicks = Number(sample?.silenceTicks ?? 0);\n    const safeBlindTicks = Number(sample?.safeBlindTicks);\n    state.maxSilenceTicks = Math.max(state.maxSilenceTicks, silenceTicks);\n    state.maxLeadBefore = Math.max(state.maxLeadBefore, silenceTicks);\n    if (Number.isFinite(safeBlindTicks)) state.minSafeBlindTicks = state.minSafeBlindTicks === null ? safeBlindTicks : Math.min(state.minSafeBlindTicks, safeBlindTicks);\n    if (sample?.pressure) state.pressureFrames += 1;\n    retain({ kind: "guard", at: performance.now(), ...sample });\n    return true;\n  };\n  window.__mwV15ObserveAdvance = (sample) => {\n    state.advanceObservations += 1;\n    const leadAfter = Number(sample?.leadAfter);\n    const safeBlindTicks = Number(sample?.safeBlindTicks);\n    const steps = Number(sample?.steps ?? 0);\n    const rawTarget = Number(sample?.rawTargetBoundary);\n    const target = Number(sample?.targetBoundary);\n    if (sample?.clamped) state.clampFrames += 1;\n    if (Number.isFinite(rawTarget) && Number.isFinite(target)) state.maxRawOvershootTicks = Math.max(state.maxRawOvershootTicks, rawTarget - target);\n    if (Number.isFinite(leadAfter)) state.maxLeadAfter = Math.max(state.maxLeadAfter, leadAfter);\n    state.maxStepsPerAdvance = Math.max(state.maxStepsPerAdvance, steps);\n    if (MODE_V15 === "ceiling" && Number.isFinite(leadAfter) && Number.isFinite(safeBlindTicks) && leadAfter >= safeBlindTicks) state.safetyViolations += 1;\n    if (sample?.clamped || steps > 4 || (Number.isFinite(safeBlindTicks) && Number.isFinite(leadAfter) && leadAfter >= safeBlindTicks - 2)) retain({ kind: "advance", at: performance.now(), ...sample });\n    return true;\n  };\n  window.__mwV15ResetPredictionCeiling = () => {\n    state.guardObservations = 0;\n    state.advanceObservations = 0;\n    state.pressureFrames = 0;\n    state.clampFrames = 0;\n    state.maxSilenceTicks = 0;\n    state.minSafeBlindTicks = null;\n    state.maxRawOvershootTicks = 0;\n    state.maxLeadBefore = 0;\n    state.maxLeadAfter = 0;\n    state.maxStepsPerAdvance = 0;\n    state.safetyViolations = 0;\n    state.samples = [];\n    return true;\n  };\n  window.__mwV15ReadPredictionCeiling = () => ({ mode: MODE_V15, ...state, samples: state.samples.map((entry) => ({ ...entry })) });\n}\n`;

writeFileSync(path, source);
console.log(`WORLD_V0_PREDICTION_CEILING_V15_INSTALLED mode=${mode}`);
