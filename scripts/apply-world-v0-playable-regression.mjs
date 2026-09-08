import { readFileSync, writeFileSync } from "node:fs";

function replaceOptional(text, before, after, label) {
  const count = text.split(before).length - 1;
  if (count > 1) throw new Error(`playable regression anchor ${label}: expected at most 1, found ${count}`);
  return count === 1 ? text.replace(before, after) : text;
}

const path = "scripts/world-v0-runtime-shell-smoke.mjs";
let text = readFileSync(path, "utf8");

// This is a historical migration, not an assertion that UI v4 remains the latest
// presentation forever. Later revisions are intentionally left untouched.
text = replaceOptional(
  text,
  'const EXPECTED_UI_REVISION = "shared-yard-v0-browser-ui-v3-presence";',
  'const EXPECTED_UI_REVISION = "shared-yard-v0-browser-ui-v4-playable-control";',
  "legacy UI revision",
);
text = replaceOptional(text, '"portrait-wide-follow"', '"portrait-orbit"', "portrait camera preset");
text = replaceOptional(text, '"desktop-follow"', '"desktop-orbit"', "desktop camera preset");

if (!text.includes('cameraControlRevision === "shared-yard-v0-playable-control-v1"')) {
  const anchor = '  assert(runtime.evidence?.presentation?.cameraPreset === expectedCamera, `camera preset drift ${JSON.stringify(runtime.evidence?.presentation)}`);';
  const after = `${anchor}\n  assert(runtime.evidence?.presentation?.cameraControlRevision === "shared-yard-v0-playable-control-v1", \`camera control revision drift \${JSON.stringify(runtime.evidence?.presentation)}\`);\n  assert(runtime.evidence?.presentation?.movementMapping === "camera-relative-v1", \`movement mapping drift \${JSON.stringify(runtime.evidence?.presentation)}\`);\n  assert(runtime.evidence?.runtimeFailureReason === null, \`unexpected runtime failure reason \${runtime.evidence?.runtimeFailureReason}\`);`;
  if (!text.includes(anchor)) throw new Error("playable regression anchor evidence assertions missing");
  text = text.replace(anchor, after);
}

writeFileSync(path, text);
console.log("WORLD_V0_PLAYABLE_REGRESSION_PATCH_APPLIED");
