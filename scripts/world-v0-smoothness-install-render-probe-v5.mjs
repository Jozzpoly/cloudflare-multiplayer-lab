import { readFileSync, writeFileSync } from "node:fs";

const path = "public/world-v0/app.js";
const marker = "WORLD_V0_RENDER_PROBE_V5_VELOCITY_AUGMENT";
const source = readFileSync(path, "utf8");
if (source.includes(marker)) {
  console.log("render probe v5 velocity augment already installed");
  process.exit(0);
}
if (!source.includes("WORLD_V0_RENDER_PROBE_V3")) {
  throw new Error("render probe v5 requires the V3 test hook first");
}

const hook = `\n// ${marker} — test-only CI augmentation; canonical runtime source is restored after the run.\n{\n  const __mwRenderProbeV5BaseRead = window.__mwRenderProbeV3Read;\n  window.__mwRenderProbeV3Read = () => {\n    const sample = __mwRenderProbeV5BaseRead();\n    const selfBody = selfSessionId && localState?.sim?.actorBodies.get(selfSessionId);\n    const remoteBody = remoteSessionId && localState?.sim?.actorBodies.get(remoteSessionId);\n    const propBody = localState?.sim?.propBodies.get("prop-0");\n    return {\n      ...sample,\n      selfVelocity: selfBody ? bodyLinearVelocity(selfBody) : null,\n      remoteVelocity: remoteBody ? bodyLinearVelocity(remoteBody) : null,\n      propVelocity: propBody ? bodyLinearVelocity(propBody) : null,\n      worldInput: currentInput(),\n      cameraOrbit: {\n        yaw: cameraOrbit.yaw,\n        pitch: cameraOrbit.pitch,\n        distance: cameraOrbit.distance,\n      },\n      latestCorrection: { ...metrics.latestCorrection },\n    };\n  };\n}\n`;

writeFileSync(path, source + hook);
console.log("WORLD_V0_RENDER_PROBE_V5_VELOCITY_AUGMENT_INSTALLED");
