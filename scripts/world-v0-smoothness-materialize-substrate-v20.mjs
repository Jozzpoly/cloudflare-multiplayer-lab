import { readFileSync, writeFileSync } from "node:fs";

// V20 qualification source: semantics intentionally unchanged after canonical baseline repair.
const path = "public/world-v0/app.js";
const marker = "WORLD_V0_SMOOTHNESS_SUBSTRATE_V20";
let source = readFileSync(path, "utf8");

if (source.includes(marker)) {
  console.log("World V0 smoothness substrate V20 already materialized");
  process.exit(0);
}

function replaceOnce(from, to, label) {
  const first = source.indexOf(from);
  if (first < 0) throw new Error(`V20 materializer missing seam: ${label}`);
  if (source.indexOf(from, first + from.length) >= 0) throw new Error(`V20 materializer ambiguous seam: ${label}`);
  source = source.slice(0, first) + to + source.slice(first + from.length);
}

// Exact correction coalescing. Canonical input maps still update immediately; only the
// expensive rewind/replay transaction is deferred until an exactness/render barrier.
const correctionSeam = `function maybeCorrect(candidates, reason) {\n  const target = earliestChangedTick(candidates);\n  if (target === null) return false;\n  return correctFrom(target, reason);\n}\n`;
const correctionCandidate = `${correctionSeam}\n// ${marker}: coalesce correction transactions without weakening exact state.\nconst pendingCorrectionTicks = new Set();\nfunction queueCorrection(candidates) {\n  for (const tick of candidates) {\n    if (Number.isInteger(tick) && tick >= 0) pendingCorrectionTicks.add(tick);\n  }\n}\nfunction flushQueuedCorrections(barrier) {\n  if (!pendingCorrectionTicks.size) return false;\n  const candidates = [...pendingCorrectionTicks];\n  pendingCorrectionTicks.clear();\n  const target = earliestChangedTick(candidates);\n  if (target === null) return false;\n  return correctFrom(target, \"coalesced:\" + barrier);\n}\n`;
replaceOnce(correctionSeam, correctionCandidate, "correction queue helpers");

replaceOnce(
  `  maybeCorrect(candidates, "peer-record");`,
  `  queueCorrection(candidates);`,
  "peer-record correction route",
);
replaceOnce(
  `  maybeCorrect([message.targetTick], "authority-consumed");`,
  `  queueCorrection([message.targetTick]);`,
  "authority-consumed correction route",
);
replaceOnce(
  `  compareStateGuard(message.boundaryTick, message.stateGuard);`,
  `  flushQueuedCorrections("snapshot");\n  compareStateGuard(message.boundaryTick, message.stateGuard);`,
  "snapshot exactness barrier",
);
replaceOnce(
  `      pumpLogicalInputScheduler();\n      advancePrediction();`,
  `      pumpLogicalInputScheduler();\n      flushQueuedCorrections("frame");\n      advancePrediction();`,
  "frame correction barrier",
);
replaceOnce(
  `function destroyLocalState() {\n  if (!localState) return;`,
  `function destroyLocalState() {\n  pendingCorrectionTicks.clear();\n  if (!localState) return;`,
  "correction queue teardown",
);

// Retained-history pressure is a prediction-safety boundary, not evidence that the
// ActorSession transport itself was lost. Stop speculative advancement before the
// correction window becomes unrecoverable and let live authority close the gap.
replaceOnce(
  `function advancePrediction() {\n  if (!localState || !phaseAnchor || runtimeFailed || actorResume.pending || topologyTransitionPending) return;`,
  `function advancePrediction() {\n  if (!localState || !phaseAnchor || runtimeFailed || actorResume.pending || topologyTransitionPending) return;\n  let predictionCeilingBoundary = null;`,
  "prediction ceiling prelude",
);
replaceOnce(
  `    const safeBlindTicks = Math.max(1, simulation.clientHistory.retainTicks - AUTHORITY_SILENCE_RETAIN_MARGIN_TICKS);\n    if (silenceTicks >= safeBlindTicks) {\n      beginActorResume("authority_silence_history_guard", { silenceTicks, safeBlindTicks });\n      return;\n    }`,
  `    const safeBlindTicks = Math.max(1, simulation.clientHistory.retainTicks - AUTHORITY_SILENCE_RETAIN_MARGIN_TICKS);\n    predictionCeilingBoundary = lastAuthorityBoundaryTick + safeBlindTicks - 1;\n    if (silenceTicks >= safeBlindTicks) return;`,
  "history pressure semantics",
);
replaceOnce(
  `  const targetBoundary = Math.max(0, Math.floor(estimate + simulation.timing.clientSimulationLeadTicks));`,
  `  const rawTargetBoundary = Math.max(0, Math.floor(estimate + simulation.timing.clientSimulationLeadTicks));\n  const targetBoundary = Number.isInteger(predictionCeilingBoundary)\n    ? Math.min(rawTargetBoundary, predictionCeilingBoundary)\n    : rawTargetBoundary;`,
  "prediction target clamp",
);

// Fail closed if any experimental test hook leaked into the integrated candidate.
for (const forbidden of ["__mwV15", "__mwV18", "WORLD_V0_PREDICTION_CEILING_V15", "WORLD_V0_CORRECTION_BATCHING_V18"]) {
  if (source.includes(forbidden)) throw new Error(`V20 candidate leaked experimental hook ${forbidden}`);
}

writeFileSync(path, source);
console.log("WORLD_V0_SMOOTHNESS_SUBSTRATE_V20_MATERIALIZED");
