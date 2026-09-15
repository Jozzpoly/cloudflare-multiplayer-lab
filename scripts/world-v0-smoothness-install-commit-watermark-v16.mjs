import { readFileSync, writeFileSync } from "node:fs";

const mode = String(process.argv[2] ?? "commit");
if (!new Set(["clock", "commit"]).has(mode)) throw new Error(`V16 mode must be clock|commit, got ${mode}`);

const path = "public/world-v0/app.js";
const marker = "WORLD_V0_COMMIT_WATERMARK_V16";
let source = readFileSync(path, "utf8");
if (source.includes(marker)) {
  console.log("commit-watermark v16 hook already installed");
  process.exit(0);
}

function replaceOnce(from, to, label) {
  const first = source.indexOf(from);
  if (first < 0) throw new Error(`V16 install missing seam: ${label}`);
  if (source.indexOf(from, first + from.length) >= 0) throw new Error(`V16 install ambiguous seam: ${label}`);
  source = source.slice(0, first) + to + source.slice(first + from.length);
}

replaceOnce(
  "let localState = null;\nlet lastAuthorityBoundaryTick = null;",
  `let localState = null;\nlet lastAuthorityBoundaryTick = null;\n// ${marker}: test-only protocol-native commit watermark. A delivered world_v0_consumed\n// boundary means authority has irreversibly consumed the preceding target tick.\nlet lastCommittedBoundaryTickV16 = null;`,
  "commit watermark state",
);

replaceOnce(
  `function handleConsumed(message) {\n  assertMessageIdentity(message, "consumed");\n  assertR0MessageTopology(message, "consumed");\n  if (!Number.isInteger(message.targetTick)) return;`,
  `function handleConsumed(message) {\n  assertMessageIdentity(message, "consumed");\n  assertR0MessageTopology(message, "consumed");\n  if (Number.isInteger(message.boundaryTick)) {\n    const previousCommitted = lastCommittedBoundaryTickV16;\n    lastCommittedBoundaryTickV16 = lastCommittedBoundaryTickV16 === null\n      ? message.boundaryTick\n      : Math.max(lastCommittedBoundaryTickV16, message.boundaryTick);\n    if (typeof window.__mwV16ObserveCommit === "function") {\n      window.__mwV16ObserveCommit({\n        boundaryTick: message.boundaryTick,\n        targetTick: message.targetTick,\n        previousCommitted,\n        committedBoundary: lastCommittedBoundaryTickV16,\n        clockBoundary: lastAuthorityBoundaryTick,\n        localBoundary: localState?.boundaryTick ?? null,\n      });\n    }\n  }\n  if (!Number.isInteger(message.targetTick)) return;`,
  "consumed commit observation",
);

replaceOnce(
  "function advancePrediction() {\n  if (!localState || !phaseAnchor || runtimeFailed || actorResume.pending || topologyTransitionPending) return;",
  `function advancePrediction() {\n  if (!localState || !phaseAnchor || runtimeFailed || actorResume.pending || topologyTransitionPending) return;\n  // ${marker}: scheduling still follows the authority clock; rewind safety uses the selected watermark.\n  let safeBlindTicksV16 = null;\n  let referenceBoundaryV16 = null;\n  let referenceKindV16 = null;\n  let leadBeforeV16 = null;\n  let ceilingBoundaryV16 = null;`,
  "advance prelude",
);

const canonicalGuard = `  if (Number.isInteger(lastAuthorityBoundaryTick) && Number.isInteger(simulation?.clientHistory?.retainTicks)) {\n    const silenceTicks = Math.max(0, localState.boundaryTick - lastAuthorityBoundaryTick);\n    metrics.maxAuthoritySilenceTicks = Math.max(metrics.maxAuthoritySilenceTicks, silenceTicks);\n    const safeBlindTicks = Math.max(1, simulation.clientHistory.retainTicks - AUTHORITY_SILENCE_RETAIN_MARGIN_TICKS);\n    if (silenceTicks >= safeBlindTicks) {\n      beginActorResume("authority_silence_history_guard", { silenceTicks, safeBlindTicks });\n      return;\n    }\n  }`;
const replacementGuard = `  {\n    const selectedReference = ${mode === "commit" ? "lastCommittedBoundaryTickV16" : "lastAuthorityBoundaryTick"};\n    if (Number.isInteger(selectedReference) && Number.isInteger(simulation?.clientHistory?.retainTicks)) {\n      safeBlindTicksV16 = Math.max(1, simulation.clientHistory.retainTicks - AUTHORITY_SILENCE_RETAIN_MARGIN_TICKS);\n      referenceBoundaryV16 = selectedReference;\n      referenceKindV16 = ${JSON.stringify(mode === "commit" ? "delivered-consumed-commit" : "mixed-authority-clock")};\n      leadBeforeV16 = Math.max(0, localState.boundaryTick - selectedReference);\n      ceilingBoundaryV16 = selectedReference + safeBlindTicksV16 - 1;\n      metrics.maxAuthoritySilenceTicks = Math.max(metrics.maxAuthoritySilenceTicks, leadBeforeV16);\n      if (typeof window.__mwV16ObserveGuard === "function") {\n        window.__mwV16ObserveGuard({\n          mode: ${JSON.stringify(mode)},\n          referenceKind: referenceKindV16,\n          referenceBoundary: selectedReference,\n          committedBoundary: lastCommittedBoundaryTickV16,\n          clockBoundary: lastAuthorityBoundaryTick,\n          localBoundary: localState.boundaryTick,\n          lead: leadBeforeV16,\n          safeBlindTicks: safeBlindTicksV16,\n          ceilingBoundary: ceilingBoundaryV16,\n        });\n      }\n      // Retained-history pressure is not transport/session loss. Hold prediction at the\n      // semantic ceiling and let delivered authority advance the watermark.\n      if (leadBeforeV16 >= safeBlindTicksV16) return;\n    }\n  }`;
replaceOnce(canonicalGuard, replacementGuard, "history guard to watermark ceiling");

replaceOnce(
  "  const targetBoundary = Math.max(0, Math.floor(estimate + simulation.timing.clientSimulationLeadTicks));",
  `  const rawTargetBoundaryV16 = Math.max(0, Math.floor(estimate + simulation.timing.clientSimulationLeadTicks));\n  const targetBoundary = Number.isInteger(ceilingBoundaryV16)\n    ? Math.min(rawTargetBoundaryV16, ceilingBoundaryV16)\n    : rawTargetBoundaryV16;`,
  "prediction target ceiling",
);

replaceOnce(
  "  const stillBacklogged = localState.boundaryTick < targetBoundary - MAX_PREDICTION_STEPS_PER_FRAME;",
  `  if (typeof window.__mwV16ObserveAdvance === "function") {\n    window.__mwV16ObserveAdvance({\n      mode: ${JSON.stringify(mode)},\n      referenceKind: referenceKindV16,\n      referenceBoundary: referenceBoundaryV16,\n      committedBoundary: lastCommittedBoundaryTickV16,\n      clockBoundary: lastAuthorityBoundaryTick,\n      localBoundary: localState.boundaryTick,\n      leadBefore: leadBeforeV16,\n      leadAfter: Number.isInteger(referenceBoundaryV16) ? localState.boundaryTick - referenceBoundaryV16 : null,\n      safeBlindTicks: safeBlindTicksV16,\n      ceilingBoundary: ceilingBoundaryV16,\n      rawTargetBoundary: rawTargetBoundaryV16,\n      targetBoundary,\n      steps,\n      clamped: rawTargetBoundaryV16 > targetBoundary,\n    });\n  }\n  const stillBacklogged = localState.boundaryTick < targetBoundary - MAX_PREDICTION_STEPS_PER_FRAME;`,
  "advance observation",
);

source += `\n// ${marker} public test controls. Canonical app.js is restored after CI.\n{\n  const MODE_V16 = ${JSON.stringify(mode)};\n  const state = {\n    commitObservations: 0,\n    commitRegressions: 0,\n    guardObservations: 0,\n    advanceObservations: 0,\n    clampFrames: 0,\n    maxRawOvershootTicks: 0,\n    maxLeadBefore: 0,\n    maxLeadAfter: 0,\n    maxClockAheadOfCommit: 0,\n    maxStepsPerAdvance: 0,\n    safetyViolations: 0,\n    minSafeBlindTicks: null,\n    latestCommittedBoundary: null,\n    samples: [],\n  };\n  const retain = (sample) => {\n    state.samples.push(sample);\n    if (state.samples.length > 640) state.samples.splice(0, state.samples.length - 640);\n  };\n  window.__mwV16ObserveCommit = (sample) => {\n    state.commitObservations += 1;\n    if (Number.isInteger(sample?.previousCommitted) && Number.isInteger(sample?.boundaryTick) && sample.boundaryTick < sample.previousCommitted) state.commitRegressions += 1;\n    if (Number.isInteger(sample?.committedBoundary)) state.latestCommittedBoundary = sample.committedBoundary;\n    const skew = Number(sample?.clockBoundary) - Number(sample?.committedBoundary);\n    if (Number.isFinite(skew)) state.maxClockAheadOfCommit = Math.max(state.maxClockAheadOfCommit, skew);\n    if (state.commitObservations <= 12 || state.commitObservations % 50 === 0) retain({ kind: "commit", at: performance.now(), ...sample });\n    return true;\n  };\n  window.__mwV16ObserveGuard = (sample) => {\n    state.guardObservations += 1;\n    const lead = Number(sample?.lead ?? 0);\n    const safe = Number(sample?.safeBlindTicks);\n    state.maxLeadBefore = Math.max(state.maxLeadBefore, lead);\n    if (Number.isFinite(safe)) state.minSafeBlindTicks = state.minSafeBlindTicks === null ? safe : Math.min(state.minSafeBlindTicks, safe);\n    const skew = Number(sample?.clockBoundary) - Number(sample?.committedBoundary);\n    if (Number.isFinite(skew)) state.maxClockAheadOfCommit = Math.max(state.maxClockAheadOfCommit, skew);\n    if (Number.isFinite(safe) && lead >= safe - 2) retain({ kind: "guard", at: performance.now(), ...sample });\n    return true;\n  };\n  window.__mwV16ObserveAdvance = (sample) => {\n    state.advanceObservations += 1;\n    const leadAfter = Number(sample?.leadAfter);\n    const safe = Number(sample?.safeBlindTicks);\n    const rawTarget = Number(sample?.rawTargetBoundary);\n    const target = Number(sample?.targetBoundary);\n    const steps = Number(sample?.steps ?? 0);\n    if (sample?.clamped) state.clampFrames += 1;\n    if (Number.isFinite(rawTarget) && Number.isFinite(target)) state.maxRawOvershootTicks = Math.max(state.maxRawOvershootTicks, rawTarget - target);\n    if (Number.isFinite(leadAfter)) state.maxLeadAfter = Math.max(state.maxLeadAfter, leadAfter);\n    state.maxStepsPerAdvance = Math.max(state.maxStepsPerAdvance, steps);\n    if (Number.isFinite(leadAfter) && Number.isFinite(safe) && leadAfter >= safe) state.safetyViolations += 1;\n    if (sample?.clamped || steps > 4 || (Number.isFinite(safe) && Number.isFinite(leadAfter) && leadAfter >= safe - 2)) retain({ kind: "advance", at: performance.now(), ...sample });\n    return true;\n  };\n  window.__mwV16ResetCommitCeiling = () => {\n    state.commitObservations = 0;\n    state.commitRegressions = 0;\n    state.guardObservations = 0;\n    state.advanceObservations = 0;\n    state.clampFrames = 0;\n    state.maxRawOvershootTicks = 0;\n    state.maxLeadBefore = 0;\n    state.maxLeadAfter = 0;\n    state.maxClockAheadOfCommit = 0;\n    state.maxStepsPerAdvance = 0;\n    state.safetyViolations = 0;\n    state.minSafeBlindTicks = null;\n    state.latestCommittedBoundary = lastCommittedBoundaryTickV16;\n    state.samples = [];\n    return true;\n  };\n  window.__mwV16ReadCommitCeiling = () => ({\n    mode: MODE_V16,\n    currentCommittedBoundary: lastCommittedBoundaryTickV16,\n    currentClockBoundary: lastAuthorityBoundaryTick,\n    ...state,\n    samples: state.samples.map((entry) => ({ ...entry })),\n  });\n}\n`;

writeFileSync(path, source);
console.log(`WORLD_V0_COMMIT_WATERMARK_V16_INSTALLED mode=${mode}`);
