import fs from "node:fs";

const path = "public/world-v0/app.js";
let source = fs.readFileSync(path, "utf8");

function replaceOnce(anchor, replacement, label) {
  const first = source.indexOf(anchor);
  if (first < 0) throw new Error(`missing ${label} anchor`);
  if (source.indexOf(anchor, first + anchor.length) >= 0) throw new Error(`non-unique ${label} anchor`);
  source = source.replace(anchor, replacement);
}

// Replace the existing reset block before defining the helper, otherwise the
// helper body itself would intentionally duplicate this exact anchor.
replaceOnce(
  `  keys.clear();
  touchInput = zeroInput();
  joystickPointer = null;
  joystickKnob.style.transform = "translate(0, 0)";
  cameraOrbit.pointerId = null;
  cameraTouchPointers.clear();
  cameraPinch = null;
  cameraGimbalPointer = null;
  cameraGimbalInput = { x: 0, y: 0 };
  cameraGimbalKnob.style.transform = "translate(0, 0)";
  lastCameraControlAt = null;`,
  `  neutralizeTransientInputs();`,
  "protocol-reset-input-neutralization"
);

replaceOnce(
  'addEventListener("blur", () => keys.clear());',
  `function neutralizeTransientInputs() {
  keys.clear();
  touchInput = zeroInput();
  joystickPointer = null;
  joystickKnob.style.transform = "translate(0, 0)";
  cameraOrbit.pointerId = null;
  cameraTouchPointers.clear();
  cameraPinch = null;
  cameraGimbalPointer = null;
  cameraGimbalInput = { x: 0, y: 0 };
  cameraGimbalKnob.style.transform = "translate(0, 0)";
  lastCameraControlAt = null;
}
addEventListener("blur", neutralizeTransientInputs);`,
  "window-blur"
);

replaceOnce(
  `document.addEventListener("visibilitychange", () => {
  const now = performance.now();
  recordLifecycle("visibility", { state: document.visibilityState, elapsedSincePreviousMs: Math.max(0, now - visibilityTransitionAt) });
  visibilityTransitionAt = now;
  lastFrameAt = null;
});`,
  `document.addEventListener("visibilitychange", () => {
  const now = performance.now();
  recordLifecycle("visibility", { state: document.visibilityState, elapsedSincePreviousMs: Math.max(0, now - visibilityTransitionAt) });
  visibilityTransitionAt = now;
  lastFrameAt = null;
  if (document.visibilityState !== "visible") neutralizeTransientInputs();
});`,
  "visibility-hidden"
);

replaceOnce(
  `renderer.domElement.addEventListener("pointerup", endCameraPointer);
renderer.domElement.addEventListener("pointercancel", endCameraPointer);`,
  `renderer.domElement.addEventListener("pointerup", endCameraPointer);
renderer.domElement.addEventListener("pointercancel", endCameraPointer);
renderer.domElement.addEventListener("lostpointercapture", endCameraPointer);`,
  "canvas-lostpointercapture"
);

fs.writeFileSync(path, source);
console.log("WORLD_V0_TWO_PHONE_INTERRUPTION_TRANSFORM_APPLIED", JSON.stringify({ path }));
