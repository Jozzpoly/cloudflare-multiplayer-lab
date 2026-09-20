import { readFileSync, writeFileSync } from "node:fs";

const [,, aPath, bPath, outputPath] = process.argv;
if (!aPath || !bPath || !outputPath) throw new Error("usage: <a.json> <b.json> <output.json>");

const specimens = [
  JSON.parse(readFileSync(aPath, "utf8")),
  JSON.parse(readFileSync(bPath, "utf8")),
];

function summarize(value, id) {
  return {
    id,
    verdict: value.verdict,
    error: value.error || null,
    hiddenReproduced:
      value.apparatus?.beforeVisibility === "visible" &&
      value.apparatus?.hiddenState === "hidden" &&
      value.apparatus?.hiddenVisibility === "hidden" &&
      value.apparatus?.visibleAgain === "visible",
    freezeRequestedMs: value.freeze?.requestedMs ?? null,
    freezeCommand: value.freeze?.lifecycleCommand ?? null,
    visibilityAfterThaw: value.freeze?.visibilityAfterThaw ?? null,
    authorityBoundaryDeltaDuringFreeze: value.freeze?.authorityBoundaryDelta ?? null,
    authorityConnectedPlayersDuringFreeze: value.freeze?.authorityConnectedPlayers ?? null,
    browserSlotLeaseExpired: value.freeze?.browserSlotLeaseExpired ?? null,
    browserSlotStale: value.freeze?.browserSlotStale ?? null,
    guardMismatchesAfterThaw: value.freeze?.guardMismatchesAfterThaw ?? null,
    firstStateMismatchAfterThaw: value.freeze?.firstStateMismatchAfterThaw ?? null,
    actorResumePendingAfterThaw: value.freeze?.actorResumePendingAfterThaw ?? null,
    networkStateAfterThaw: value.freeze?.networkStateAfterThaw ?? null,
    identityPreserved: value.identity?.preserved === true,
    recoveryRebases: value.recovery?.rebases ?? null,
    recoveryGuardMismatches: value.recovery?.guardMismatches ?? null,
    recoveryFirstStateMismatch: value.recovery?.firstStateMismatch ?? null,
    postForegroundAgencyWitness: value.postForegroundAgency?.witness || null,
    finalGuardMismatches: value.final?.guardMismatches ?? null,
  };
}

const summaries = specimens.map((value, index) => summarize(value, index === 0 ? "a" : "b"));
const apparatusAll = summaries.every((value) =>
  !value.error &&
  value.hiddenReproduced &&
  value.freezeRequestedMs === 8000 &&
  value.freezeCommand === "Page.setWebLifecycleState:frozen->active" &&
  value.visibilityAfterThaw === "hidden"
);
const authorityProgressAll = summaries.every((value) =>
  Number.isFinite(value.authorityBoundaryDeltaDuringFreeze) &&
  value.authorityBoundaryDeltaDuringFreeze > 100
);
const identityPreservedAll = summaries.every((value) => value.identityPreserved);
const exactAll = summaries.every((value) =>
  value.guardMismatchesAfterThaw === 0 &&
  value.firstStateMismatchAfterThaw == null &&
  value.recoveryGuardMismatches === 0 &&
  value.recoveryFirstStateMismatch == null &&
  value.finalGuardMismatches === 0
);
const agencyAll = summaries.every((value) => Boolean(value.postForegroundAgencyWitness));

let classification = "F5_FROZEN_LIFECYCLE_MIXED";
if (!apparatusAll) {
  classification = "F5_FROZEN_LIFECYCLE_APPARATUS_RED";
} else if (!authorityProgressAll) {
  classification = "F5_FROZEN_LIFECYCLE_AUTHORITY_CONTINUITY_RED";
} else if (!identityPreservedAll || !exactAll || !agencyAll) {
  classification = "F5_FROZEN_LIFECYCLE_RECOVERY_RED";
} else {
  classification = "F5_FROZEN_LIFECYCLE_RECOVERY_SUPPORTED";
}

const result = {
  verdict: "MF6_F5_FROZEN_LIFECYCLE_AGGREGATE_COMPLETE",
  classification,
  generatedAt: new Date().toISOString(),
  apparatusAll,
  authorityProgressAll,
  identityPreservedAll,
  exactAll,
  agencyAll,
  summaries,
  interpretation: "Two fresh-runner specimens reproduce hidden-tab state, apply a bounded eight-second CDP page freeze while authority remains active, thaw while still hidden, then require same-identity exact foreground recovery and a fresh authority-consumed command.",
  nonClaim: "CDP page freeze is a controlled browser lifecycle stressor, not proof of OS process eviction, mobile app kill/restart, or all browser-specific lifecycle policies.",
};
writeFileSync(outputPath, JSON.stringify(result, null, 2));
console.log("MF6_F5_FROZEN_LIFECYCLE_AGGREGATE", JSON.stringify(result));
console.log(result.verdict);
console.log("MF6_F5_FROZEN_LIFECYCLE_CLASSIFICATION_" + classification);
