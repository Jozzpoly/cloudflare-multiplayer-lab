import { readFileSync, writeFileSync } from "node:fs";

const mode = String(process.argv[2] ?? "coalesced");
if (!new Set(["immediate", "coalesced"]).has(mode)) throw new Error(`V18 mode must be immediate|coalesced, got ${mode}`);

const path = "public/world-v0/app.js";
const marker = "WORLD_V0_CORRECTION_BATCHING_V18";
let source = readFileSync(path, "utf8");
if (source.includes(marker)) {
  console.log("correction batching v18 hook already installed");
  process.exit(0);
}

function replaceOnce(from, to, label) {
  const first = source.indexOf(from);
  if (first < 0) throw new Error(`V18 install missing seam: ${label}`);
  if (source.indexOf(from, first + from.length) >= 0) throw new Error(`V18 install ambiguous seam: ${label}`);
  source = source.slice(0, first) + to + source.slice(first + from.length);
}

const correctionSeam = `function maybeCorrect(candidates, reason) {\n  const target = earliestChangedTick(candidates);\n  if (target === null) return false;\n  return correctFrom(target, reason);\n}\n`;
const correctionWithBatching = `${correctionSeam}\n// ${marker}: test-only exact correction transaction coalescing. Input maps update immediately;\n// rewind/replay may be deferred only until a render-frame or snapshot/state-guard barrier.\nconst CORRECTION_BATCHING_V18_MODE = ${JSON.stringify(mode)};\nconst pendingCorrectionTicksV18 = new Set();\nconst pendingCorrectionReasonsV18 = new Set();\nconst correctionBatchingV18 = {\n  routeCalls: 0,\n  candidateTicks: 0,\n  uniqueCandidateAdds: 0,\n  immediateCorrections: 0,\n  flushCalls: 0,\n  flushesWithPending: 0,\n  correctionFlushes: 0,\n  noCorrectionFlushes: 0,\n  maxPendingTicks: 0,\n  routeCallsSinceFlush: 0,\n  maxRouteCallsPerFlush: 0,\n  reasons: {},\n  barriers: {},\n  events: [],\n};\nfunction retainCorrectionBatchingV18(event) {\n  correctionBatchingV18.events.push(event);\n  if (correctionBatchingV18.events.length > 256) correctionBatchingV18.events.splice(0, correctionBatchingV18.events.length - 256);\n}\nfunction routeCorrectionV18(candidates, reason) {\n  const normalized = [...new Set(candidates)].filter((tick) => Number.isInteger(tick) && tick >= 0);\n  correctionBatchingV18.routeCalls += 1;\n  correctionBatchingV18.routeCallsSinceFlush += 1;\n  correctionBatchingV18.candidateTicks += normalized.length;\n  correctionBatchingV18.reasons[reason] = (correctionBatchingV18.reasons[reason] || 0) + 1;\n  if (CORRECTION_BATCHING_V18_MODE === "immediate") {\n    const corrected = maybeCorrect(normalized, reason);\n    if (corrected) correctionBatchingV18.immediateCorrections += 1;\n    return corrected;\n  }\n  for (const tick of normalized) {\n    if (!pendingCorrectionTicksV18.has(tick)) correctionBatchingV18.uniqueCandidateAdds += 1;\n    pendingCorrectionTicksV18.add(tick);\n  }\n  if (normalized.length) pendingCorrectionReasonsV18.add(reason);\n  correctionBatchingV18.maxPendingTicks = Math.max(correctionBatchingV18.maxPendingTicks, pendingCorrectionTicksV18.size);\n  return false;\n}\nfunction flushCorrectionBatchingV18(barrier) {\n  correctionBatchingV18.flushCalls += 1;\n  correctionBatchingV18.barriers[barrier] = (correctionBatchingV18.barriers[barrier] || 0) + 1;\n  if (CORRECTION_BATCHING_V18_MODE === "immediate") {\n    correctionBatchingV18.maxRouteCallsPerFlush = Math.max(correctionBatchingV18.maxRouteCallsPerFlush, correctionBatchingV18.routeCallsSinceFlush);\n    correctionBatchingV18.routeCallsSinceFlush = 0;\n    return false;\n  }\n  if (!pendingCorrectionTicksV18.size) {\n    correctionBatchingV18.noCorrectionFlushes += 1;\n    correctionBatchingV18.routeCallsSinceFlush = 0;\n    return false;\n  }\n  correctionBatchingV18.flushesWithPending += 1;\n  correctionBatchingV18.maxRouteCallsPerFlush = Math.max(correctionBatchingV18.maxRouteCallsPerFlush, correctionBatchingV18.routeCallsSinceFlush);\n  const candidates = [...pendingCorrectionTicksV18];\n  const reasons = [...pendingCorrectionReasonsV18].sort();\n  const routeCalls = correctionBatchingV18.routeCallsSinceFlush;\n  pendingCorrectionTicksV18.clear();\n  pendingCorrectionReasonsV18.clear();\n  correctionBatchingV18.routeCallsSinceFlush = 0;\n  const target = earliestChangedTick(candidates);\n  if (target === null) {\n    correctionBatchingV18.noCorrectionFlushes += 1;\n    return false;\n  }\n  const reason = "v18-coalesced:" + barrier + ":" + (reasons.join("+") || "unknown");\n  const corrected = correctFrom(target, reason);\n  if (corrected) {\n    correctionBatchingV18.correctionFlushes += 1;\n    retainCorrectionBatchingV18({ at: performance.now(), barrier, target, candidates: candidates.length, routeCalls, reasons });\n  } else {\n    correctionBatchingV18.noCorrectionFlushes += 1;\n  }\n  return corrected;\n}\nfunction resetCorrectionBatchingV18() {\n  if (pendingCorrectionTicksV18.size) throw new Error("V18 reset with pending corrections " + pendingCorrectionTicksV18.size);\n  correctionBatchingV18.routeCalls = 0;\n  correctionBatchingV18.candidateTicks = 0;\n  correctionBatchingV18.uniqueCandidateAdds = 0;\n  correctionBatchingV18.immediateCorrections = 0;\n  correctionBatchingV18.flushCalls = 0;\n  correctionBatchingV18.flushesWithPending = 0;\n  correctionBatchingV18.correctionFlushes = 0;\n  correctionBatchingV18.noCorrectionFlushes = 0;\n  correctionBatchingV18.maxPendingTicks = 0;\n  correctionBatchingV18.routeCallsSinceFlush = 0;\n  correctionBatchingV18.maxRouteCallsPerFlush = 0;\n  correctionBatchingV18.reasons = {};\n  correctionBatchingV18.barriers = {};\n  correctionBatchingV18.events = [];\n  return true;\n}\n`;
replaceOnce(correctionSeam, correctionWithBatching, "correction routing seam");

replaceOnce(
  `  maybeCorrect(candidates, "peer-record");`,
  `  routeCorrectionV18(candidates, "peer-record");`,
  "peer record correction route",
);
replaceOnce(
  `  maybeCorrect([message.targetTick], "authority-consumed");`,
  `  routeCorrectionV18([message.targetTick], "authority-consumed");`,
  "authority consumed correction route",
);
replaceOnce(
  `  compareStateGuard(message.boundaryTick, message.stateGuard);`,
  `  flushCorrectionBatchingV18("snapshot");\n  compareStateGuard(message.boundaryTick, message.stateGuard);`,
  "snapshot exactness barrier",
);
replaceOnce(
  `      pumpLogicalInputScheduler();\n      advancePrediction();`,
  `      pumpLogicalInputScheduler();\n      flushCorrectionBatchingV18("frame");\n      advancePrediction();`,
  "render-frame correction barrier",
);
replaceOnce(
  `function destroyLocalState() {\n  if (!localState) return;`,
  `function destroyLocalState() {\n  pendingCorrectionTicksV18.clear();\n  pendingCorrectionReasonsV18.clear();\n  correctionBatchingV18.routeCallsSinceFlush = 0;\n  if (!localState) return;`,
  "clear pending correction transaction on local state destruction",
);

source += `\n// ${marker} public test controls. Canonical app.js is restored after CI.\nwindow.__mwV18FlushCorrectionBatching = (barrier = "external") => flushCorrectionBatchingV18(String(barrier));\nwindow.__mwV18ResetCorrectionBatching = () => resetCorrectionBatchingV18();\nwindow.__mwV18ReadCorrectionBatching = () => ({\n  mode: CORRECTION_BATCHING_V18_MODE,\n  ...correctionBatchingV18,\n  reasons: { ...correctionBatchingV18.reasons },\n  barriers: { ...correctionBatchingV18.barriers },\n  pendingTicks: [...pendingCorrectionTicksV18].sort((a, b) => a - b),\n  pendingReasons: [...pendingCorrectionReasonsV18].sort(),\n  events: correctionBatchingV18.events.map((entry) => ({ ...entry, reasons: [...entry.reasons] })),\n});\n`;

writeFileSync(path, source);
console.log(`WORLD_V0_CORRECTION_BATCHING_V18_INSTALLED mode=${mode}`);
