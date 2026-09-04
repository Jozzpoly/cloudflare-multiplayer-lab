import { readFileSync, writeFileSync } from "node:fs";

function replaceExact(text, before, after, expectedCount, label) {
  const count = text.split(before).length - 1;
  if (count === 0 && text.includes(after)) return text;
  if (count !== expectedCount) throw new Error(`playable regression anchor ${label}: expected ${expectedCount}, found ${count}`);
  return text.split(before).join(after);
}

const path = "scripts/world-v0-runtime-shell-smoke.mjs";
let text = readFileSync(path, "utf8");
text = replaceExact(
  text,
  'const EXPECTED_UI_REVISION = "shared-yard-v0-browser-ui-v3-presence";',
  'const EXPECTED_UI_REVISION = "shared-yard-v0-browser-ui-v4-playable-control";',
  1,
  "UI revision",
);
text = replaceExact(text, '"portrait-wide-follow"', '"portrait-orbit"', 1, "portrait camera preset");
text = replaceExact(text, '"desktop-follow"', '"desktop-orbit"', 1, "desktop camera preset");
text = replaceExact(
  text,
  '  assert(runtime.evidence?.presentation?.cameraPreset === expectedCamera, `camera preset drift ${JSON.stringify(runtime.evidence?.presentation)}`);',
  '  assert(runtime.evidence?.presentation?.cameraPreset === expectedCamera, `camera preset drift ${JSON.stringify(runtime.evidence?.presentation)}`);\n  assert(runtime.evidence?.presentation?.cameraControlRevision === "shared-yard-v0-playable-control-v1", `camera control revision drift ${JSON.stringify(runtime.evidence?.presentation)}`);\n  assert(runtime.evidence?.presentation?.movementMapping === "camera-relative-v1", `movement mapping drift ${JSON.stringify(runtime.evidence?.presentation)}`);\n  assert(runtime.evidence?.runtimeFailureReason === null, `unexpected runtime failure reason ${runtime.evidence?.runtimeFailureReason}`);',
  1,
  "playable evidence assertions",
);
writeFileSync(path, text);
console.log("WORLD_V0_PLAYABLE_REGRESSION_PATCH_APPLIED");
