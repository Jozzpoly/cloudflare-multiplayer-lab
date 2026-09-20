import { readFileSync, writeFileSync } from "node:fs";

const [,, aPath, bPath, outputPath] = process.argv;
if (!aPath || !bPath || !outputPath) {
  throw new Error("usage: <a.json> <b.json> <output.json>");
}
const specimens = [
  JSON.parse(readFileSync(aPath, "utf8")),
  JSON.parse(readFileSync(bPath, "utf8")),
];

function compact(value, id) {
  return {
    id,
    verdict: value.verdict,
    error: value.error || null,
    hiddenReproduced:
      value.apparatus?.beforeVisibility === "visible" &&
      value.apparatus?.hiddenState === "hidden" &&
      value.apparatus?.hiddenVisibility === "hidden" &&
      value.apparatus?.visibleAgain === "visible",
    identityPreserved: value.identity?.preserved === true,
    hiddenSchedulerPumpRatio: value.hidden?.schedulerPumpRatio ?? null,
    hiddenSchedulerPumps: value.hidden?.schedulerPumps ?? null,
    hiddenSchedulerAuthored: value.hidden?.schedulerAuthored ?? null,
    hiddenGuardMatchesDelta: value.hidden?.guardMatchesDelta ?? null,
    hiddenGuardMismatches: value.hidden?.guardMismatches ?? null,
    hiddenLocalBoundaryDelta: value.hidden?.localBoundaryDelta ?? null,
    hiddenAuthorityBoundaryDelta: value.hidden?.authorityBoundaryDelta ?? null,
    hiddenAuthorityDroppedTicksDelta: value.hidden?.authorityDroppedTicksDelta ?? null,
    hiddenActorResumePending: value.hidden?.actorResumePending ?? null,
    recoveryGuardMismatches: value.recovery?.guardMismatches ?? null,
    recoveryFirstStateMismatch: value.recovery?.firstStateMismatch ?? null,
    recoveryRebases: value.recovery?.rebases ?? null,
    postForegroundAgencyWitness: value.postForegroundAgency?.witness || null,
    finalGuardMismatches: value.final?.guardMismatches ?? null,
  };
}

const summaries = specimens.map((value, index) => compact(value, index === 0 ? "a" : "b"));
const hiddenReproducedAll = summaries.every((value) => value.hiddenReproduced);
const identityPreservedAll = summaries.every((value) => value.identityPreserved);
const exactAll = summaries.every((value) =>
  value.hiddenGuardMismatches === 0 &&
  value.recoveryGuardMismatches === 0 &&
  value.finalGuardMismatches === 0 &&
  value.recoveryFirstStateMismatch == null
);
const postForegroundAgencyAll = summaries.every((value) => Boolean(value.postForegroundAgencyWitness));
const pumpRatios = summaries.map((value) => value.hiddenSchedulerPumpRatio).filter(Number.isFinite);
const schedulerPressureObserved = pumpRatios.some((value) => value < 0.5);

let classification = "F5_BACKGROUND_VISIBILITY_MIXED";
if (specimens.some((value) => value.error)) {
  classification = "F5_BACKGROUND_VISIBILITY_APPARATUS_OR_RUNTIME_RED";
} else if (!hiddenReproducedAll) {
  classification = "F5_BACKGROUND_VISIBILITY_NOT_REPRODUCED";
} else if (!identityPreservedAll || !exactAll || !postForegroundAgencyAll) {
  classification = "F5_BACKGROUND_RECOVERY_RED";
} else if (schedulerPressureObserved) {
  classification = "F5_BACKGROUND_THROTTLED_RECOVERY_SUPPORTED";
} else {
  classification = "F5_HIDDEN_CONTINUITY_SUPPORTED_NO_TIMER_PRESSURE";
}

const result = {
  verdict: "MF6_F5_BACKGROUND_VISIBILITY_AGGREGATE_COMPLETE",
  classification,
  generatedAt: new Date().toISOString(),
  hiddenReproducedAll,
  identityPreservedAll,
  exactAll,
  postForegroundAgencyAll,
  schedulerPressureObserved,
  summaries,
  interpretation: "Two fresh-runner Chromium specimens place another tab in front while anti-background-throttling flags are absent. Classification separates actual hidden-state reproduction from measured scheduler pressure and from same-identity exact recovery after return.",
  nonClaim: "This is headless Chromium machine evidence. It does not by itself qualify OS-level desktop/mobile background suspension, browser process eviction or real-device lifecycle.",
};
writeFileSync(outputPath, JSON.stringify(result, null, 2));
console.log("MF6_F5_BACKGROUND_VISIBILITY_AGGREGATE", JSON.stringify(result));
console.log(result.verdict);
console.log("MF6_F5_BACKGROUND_VISIBILITY_CLASSIFICATION_" + classification);
