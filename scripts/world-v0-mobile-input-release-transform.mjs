import { readFileSync, writeFileSync } from "node:fs";

function replaceExactlyOnce(path, before, after, label) {
  const source = readFileSync(path, "utf8");
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`${label}: anchor missing in ${path}`);
  if (source.indexOf(before, first + before.length) >= 0) throw new Error(`${label}: anchor is not unique in ${path}`);
  if (source.includes(after)) throw new Error(`${label}: candidate already applied in ${path}`);
  writeFileSync(path, source.slice(0, first) + after + source.slice(first + before.length));
}

const app = "public/world-v0/app.js";
replaceExactlyOnce(
  app,
  `joystick.addEventListener("pointerup", releaseJoystick);\njoystick.addEventListener("pointercancel", releaseJoystick);`,
  `joystick.addEventListener("pointerup", releaseJoystick);\njoystick.addEventListener("pointercancel", releaseJoystick);\njoystick.addEventListener("lostpointercapture", releaseJoystick);`,
  "joystick lostpointercapture",
);

replaceExactlyOnce(
  app,
  `cameraGimbal.addEventListener("pointerup", releaseCameraGimbal);\ncameraGimbal.addEventListener("pointercancel", releaseCameraGimbal);`,
  `cameraGimbal.addEventListener("pointerup", releaseCameraGimbal);\ncameraGimbal.addEventListener("pointercancel", releaseCameraGimbal);\ncameraGimbal.addEventListener("lostpointercapture", releaseCameraGimbal);`,
  "gimbal lostpointercapture",
);

const interaction = "scripts/world-v0-playable-interaction-smoke.mjs";
replaceExactlyOnce(
  interaction,
  `  const gimbalAfter = await cdp.evaluate(sessionId, \`window.__sharedYardV0PlayableControl()\`);`,
  `  const gimbalAfter = await cdp.evaluate(sessionId, \`({ ...window.__sharedYardV0PlayableControl(), gimbalInput: window.__sharedYardV0Evidence().presentation.cameraGimbalInput })\`);`,
  "truthful gimbal release assertion",
);

console.log("WORLD_V0_MOBILE_INPUT_RELEASE_TRANSFORM_APPLIED");
