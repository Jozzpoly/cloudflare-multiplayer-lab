import {
  WORLD_V0_SOLO_INSPECTION_REVISION,
  planWorldV0InspectionZeroInput,
  worldV0InspectionCompanionPlayerId,
} from "../public/world-v0/solo-inspection-core.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(WORLD_V0_SOLO_INSPECTION_REVISION === "shared-yard-v0-solo-inspection-v1", "solo inspection revision drift");

for (const human of ["Jozz", "abcdefghijklmnopqrstuvwx", "A_B-C"] ) {
  const id = worldV0InspectionCompanionPlayerId(human);
  assert(/^[A-Za-z0-9_-]{1,24}$/.test(id), `invalid companion id ${id}`);
  assert(id.length <= 24, `companion id too long ${id}`);
}

const beforeWindow = planWorldV0InspectionZeroInput({
  boundaryTick: 0,
  protocolStartTick: 90,
  nextTargetTick: 90,
  maxFutureTicks: 32,
  inputBatchSize: 2,
});
assert(beforeWindow.batches.length === 0, `must not send too-future prestart records ${JSON.stringify(beforeWindow)}`);

const firstWindow = planWorldV0InspectionZeroInput({
  boundaryTick: 60,
  protocolStartTick: 90,
  nextTargetTick: 90,
  maxFutureTicks: 32,
  inputBatchSize: 2,
});
assert(firstWindow.batches.length === 1, `expected one first-window batch ${JSON.stringify(firstWindow)}`);
assert(firstWindow.batches[0].length === 1 && firstWindow.batches[0][0].targetTick === 90, "first legal record must be T(90)");

const secondWindow = planWorldV0InspectionZeroInput({
  boundaryTick: 66,
  protocolStartTick: 90,
  nextTargetTick: firstWindow.nextTargetTick,
  maxFutureTicks: 32,
  inputBatchSize: 2,
});
const secondRecords = secondWindow.batches.flat();
assert(secondRecords.length === 6, `expected T(91)..T(96), got ${JSON.stringify(secondRecords)}`);
assert(secondRecords[0].targetTick === 91 && secondRecords.at(-1).targetTick === 96, "second window continuity broken");
assert(secondWindow.batches.every((batch) => batch.length >= 1 && batch.length <= 2), "batch-size contract broken");
assert(secondRecords.every((record) => record.x === 0 && record.z === 0), "inspection companion must stay neutral");
assert(secondRecords.every((record) => record.targetTick <= 66 + 32), "planner exceeded authority max-future contract");

const behind = planWorldV0InspectionZeroInput({
  boundaryTick: 120,
  protocolStartTick: 90,
  nextTargetTick: 110,
  maxFutureTicks: 32,
  inputBatchSize: 2,
});
assert(behind.skippedBehindTicks === 10, `behind-window accounting wrong ${JSON.stringify(behind)}`);
assert(behind.batches.flat()[0].targetTick === 120, "behind planner must never manufacture late records");

console.log("WORLD_V0_SOLO_INSPECTION_CORE_SMOKE_PASS", JSON.stringify({
  first: firstWindow.batches.flat().map((record) => record.targetTick),
  second: secondRecords.map((record) => record.targetTick),
  behindSkipped: behind.skippedBehindTicks,
}));
