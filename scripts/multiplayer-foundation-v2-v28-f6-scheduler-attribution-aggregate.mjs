import { readFileSync, writeFileSync } from "node:fs";

const [,, controlAPath, controlBPath, treatmentAPath, treatmentBPath, outputPath] = process.argv;
if (!outputPath) throw new Error("usage: <control-a> <control-b> <treatment-a> <treatment-b> <output>");

const read = (path) => JSON.parse(readFileSync(path, "utf8"));
const controls = [read(controlAPath), read(controlBPath)];
const treatments = [read(treatmentAPath), read(treatmentBPath)];

function mean(values) {
  const finite = values.filter(Number.isFinite);
  return finite.length ? finite.reduce((sum,value)=>sum+value,0)/finite.length : null;
}

function summarize(group) {
  return {
    specimens: group.map((value) => value.run),
    progressRatio: group.map((value) => value.scheduler?.progressRatio ?? null),
    droppedRatio: group.map((value) => value.scheduler?.droppedRatio ?? null),
    boundaryDelta: group.map((value) => value.scheduler?.boundaryDelta ?? null),
    droppedTicksDelta: group.map((value) => value.scheduler?.droppedTicksDelta ?? null),
    catchupStepsDelta: group.map((value) => value.scheduler?.catchupStepsDelta ?? null),
    zeroProgressIntervals: group.map((value) => value.scheduler?.zeroProgressIntervals ?? null),
    droppedTickIntervals: group.map((value) => value.scheduler?.droppedTickIntervals ?? null),
    progressRatioMean: mean(group.map((value) => value.scheduler?.progressRatio)),
    droppedRatioMean: mean(group.map((value) => value.scheduler?.droppedRatio)),
  };
}

const control = summarize(controls);
const treatment = summarize(treatments);
const treatmentBrowser = treatments.map((value) => value.browser || null);
const browserExactAll = treatmentBrowser.every((value) => value?.exact === true);
const browserDeliveryAll = treatmentBrowser.every((value) => value?.delivered === value?.total && value?.total === 8);

let classification = "F6_SCHEDULER_ATTRIBUTION_MIXED";
if (controls.some((value) => value.error) || treatments.some((value) => value.error)) {
  classification = "F6_SCHEDULER_ATTRIBUTION_APPARATUS_RED";
} else if (!browserExactAll) {
  classification = "F6_SCHEDULER_ATTRIBUTION_EXACTNESS_RED";
} else if (!Number.isFinite(control.progressRatioMean) || !Number.isFinite(treatment.progressRatioMean)) {
  classification = "F6_SCHEDULER_ATTRIBUTION_INSUFFICIENT";
} else {
  const relativeProgressLoss = control.progressRatioMean - treatment.progressRatioMean;
  const relativeDroppedIncrease = treatment.droppedRatioMean - control.droppedRatioMean;
  if (control.progressRatioMean >= 0.85 &&
      control.droppedRatioMean <= 0.15 &&
      relativeProgressLoss >= 0.15 &&
      relativeDroppedIncrease >= 0.10) {
    classification = "F6_COLOCATED_APPARATUS_PRESSURE_SUPPORTED";
  } else if (control.progressRatioMean < 0.80 || control.droppedRatioMean > 0.20) {
    classification = "F6_AUTHORITY_BASELINE_PRESSURE_PRESENT";
  } else {
    classification = "F6_NO_STRONG_ATTRIBUTION_SEPARATION";
  }
}

const result = {
  verdict: "MF6_F6_SCHEDULER_ATTRIBUTION_COMPLETE",
  classification,
  generatedAt: new Date().toISOString(),
  control,
  treatment,
  browserExactAll,
  browserDeliveryAll,
  treatmentBrowser,
  controls,
  treatments,
  interpretation: "Compare authority canonical wall-clock progress and explicit scheduler droppedTicks/catchupSteps on fresh runners with six raw peers alone versus the full co-located Chromium + shaped-TCP apparatus. Relative classification is diagnostic, not a production scheduler policy.",
  nonClaim: "This does not prove Cloudflare deployed-edge scheduler behavior, performance capacity, human feel, or that CI co-location is the only possible source of authority stalls.",
};
writeFileSync(outputPath, JSON.stringify(result, null, 2));
console.log("MF6_F6_SCHEDULER_ATTRIBUTION", JSON.stringify(result));
console.log(result.verdict);
console.log("MF6_F6_SCHEDULER_ATTRIBUTION_CLASSIFICATION_" + classification);
