import { readFileSync, writeFileSync } from "node:fs";

function replaceOnce(text, before, after, label) {
  const first = text.indexOf(before);
  if (first < 0) {
    if (text.includes(after)) return text;
    throw new Error(`A1 patch anchor missing: ${label}`);
  }
  if (text.indexOf(before, first + before.length) >= 0) throw new Error(`A1 patch anchor duplicated: ${label}`);
  return text.slice(0, first) + after + text.slice(first + before.length);
}

const appPath = "public/world-v0/app.js";
let app = readFileSync(appPath, "utf8");

app = replaceOnce(app,
`import {
  firstWorldV0StateDifference,
  packWorldV0State,
} from "./state-guard.js";`,
`import {
  firstWorldV0StateDifference,
  packWorldV0State,
} from "./state-guard.js";
import {
  WORLD_V0_PLAYABLE_CONTROL_REVISION,
  cameraRelativeInput,
  clampOrbit,
  orbitFromOffset,
  orbitOffset,
} from "./playable-control.js";`,
"playable-control import");

app = replaceOnce(app,
`renderer.outputColorSpace = THREE.SRGBColorSpace;
viewport.append(renderer.domElement);`,
`renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.domElement.style.touchAction = "none";
renderer.domElement.style.overscrollBehavior = "none";
viewport.append(renderer.domElement);`,
"canvas touch policy");

app = replaceOnce(app,
`let visualContractBuiltFor = null;
let spatialCueCount = 0;`,
`let visualContractBuiltFor = null;
let spatialCueCount = 0;

const CAMERA_DEFAULT_OFFSETS = {
  desktop: [7.4, 6.3, 8.7],
  portrait: [9.4, 8.4, 11.8],
};
const cameraOrbit = {
  yaw: 0,
  pitch: 0,
  distance: 0,
  userAdjusted: false,
  pointerId: null,
  lastX: 0,
  lastY: 0,
};

function portraitViewport() {
  return innerWidth <= 720 && innerHeight > innerWidth;
}

function defaultCameraOrbit() {
  return orbitFromOffset(portraitViewport() ? CAMERA_DEFAULT_OFFSETS.portrait : CAMERA_DEFAULT_OFFSETS.desktop);
}

function resetCameraOrbit() {
  const next = defaultCameraOrbit();
  cameraOrbit.yaw = next.yaw;
  cameraOrbit.pitch = next.pitch;
  cameraOrbit.distance = next.distance;
  cameraOrbit.userAdjusted = false;
}

resetCameraOrbit();`,
"camera orbit state");

app = replaceOnce(app,
`function currentInput() {
  const keyboard = keyboardInput();
  if (Math.hypot(keyboard.x, keyboard.z) > 0.01) return keyboard;
  return { ...touchInput };
}`,
`function rawCurrentInput() {
  const keyboard = keyboardInput();
  if (Math.hypot(keyboard.x, keyboard.z) > 0.01) return keyboard;
  return { ...touchInput };
}

function currentInput() {
  return cameraRelativeInput(rawCurrentInput(), cameraOrbit.yaw);
}`,
"camera-relative current input");

app = replaceOnce(app,
`let playing = false;
let runtimeFailed = false;
let socket = null;`,
`let playing = false;
let runtimeFailed = false;
let runtimeFailureReason = null;
let runtimeFailureAt = null;
let socket = null;`,
"runtime failure provenance state");

app = replaceOnce(app,
`  if (message.type === "world_v0_epoch_ended") {
    assertMessageIdentity(message, "epoch-ended");
    networkState = \`epoch ended · \${message.reason}\`;
    showNotice(\`Shared Yard epoch ended: \${message.reason}. Start a fresh run.\`);
    return;
  }`,
`  if (message.type === "world_v0_epoch_ended") {
    assertMessageIdentity(message, "epoch-ended");
    networkState = \`epoch ended · \${message.reason}\`;
    showNotice(\`Shared Yard epoch ended: \${message.reason}. Start a fresh run.\`);
    persistLastSessionEvidence("epoch-ended");
    return;
  }`,
"epoch evidence persistence");

app = replaceOnce(app,
`function candidateError(error) {
  if (runtimeFailed) return;
  runtimeFailed = true;
  playing = false;
  const text = error instanceof Error ? error.message : String(error);
  networkState = "FOUNDATION / runtime failure";
  showNotice(text);
  console.error(error);
  try { socket?.close(1011, "world_v0_candidate_error"); } catch { /* close race */ }
}`,
`function candidateError(error) {
  if (runtimeFailed) return;
  runtimeFailed = true;
  playing = false;
  const text = error instanceof Error ? error.message : String(error);
  runtimeFailureReason = text;
  runtimeFailureAt = new Date().toISOString();
  networkState = "FOUNDATION / runtime failure";
  showNotice(text);
  console.error(error);
  persistLastSessionEvidence("runtime-failure");
  try { socket?.close(1011, "world_v0_candidate_error"); } catch { /* close race */ }
}`,
"runtime failure provenance");

app = replaceOnce(app,
`    networkState = \`closed \${event.code}\`;
    joystick.classList.remove("active");
    updateProductStatus();`,
`    networkState = \`closed \${event.code}\`;
    joystick.classList.remove("active");
    persistLastSessionEvidence("socket-close");
    updateProductStatus();`,
"socket close evidence persistence");

app = replaceOnce(app,
`function cameraPresetName() {
  return innerWidth <= 720 && innerHeight > innerWidth ? "portrait-wide-follow" : "desktop-follow";
}

function updateCamera() {
  if (!selfMesh) return;
  const portrait = cameraPresetName() === "portrait-wide-follow";
  const offset = portrait ? [9.4, 8.4, 11.8] : [7.4, 6.3, 8.7];
  camera.position.set(selfMesh.position.x + offset[0], selfMesh.position.y + offset[1], selfMesh.position.z + offset[2]);
  camera.lookAt(selfMesh.position.x, selfMesh.position.y + 0.42, selfMesh.position.z);
}`,
`function cameraPresetName() {
  return portraitViewport() ? "portrait-orbit" : "desktop-orbit";
}

function updateCamera() {
  if (!selfMesh) return;
  const offset = orbitOffset(cameraOrbit);
  const targetY = selfMesh.position.y + 0.42;
  camera.position.set(selfMesh.position.x + offset[0], targetY + offset[1], selfMesh.position.z + offset[2]);
  camera.lookAt(selfMesh.position.x, targetY, selfMesh.position.z);
}`,
"orbit camera render");

app = replaceOnce(app,
`    networkState,
    runtimeFailed,
    localBoundaryTick: localState?.boundaryTick ?? null,`,
`    networkState,
    runtimeFailed,
    runtimeFailureReason,
    runtimeFailureAt,
    localBoundaryTick: localState?.boundaryTick ?? null,`,
"failure reason evidence");

app = replaceOnce(app,
`      cameraPreset: cameraPresetName(),
      cameraFov: camera.fov,
    },`,
`      cameraPreset: cameraPresetName(),
      cameraFov: camera.fov,
      cameraControlRevision: WORLD_V0_PLAYABLE_CONTROL_REVISION,
      cameraOrbit: {
        yaw: cameraOrbit.yaw,
        pitch: cameraOrbit.pitch,
        distance: cameraOrbit.distance,
        userAdjusted: cameraOrbit.userAdjusted,
      },
      movementMapping: "camera-relative-v1",
      rawInput: rawCurrentInput(),
      worldInputPreview: currentInput(),
    },`,
"playable control evidence");

app = replaceOnce(app,
`window.__sharedYardV0Evidence = buildEvidence;`,
`function persistLastSessionEvidence(reason) {
  try {
    const payload = { ...buildEvidence(), persistedReason: reason };
    localStorage.setItem("shared-yard-v0-last-evidence", JSON.stringify(payload));
    return payload;
  } catch {
    return null;
  }
}

window.__sharedYardV0Evidence = buildEvidence;
window.__sharedYardV0PlayableControl = () => ({
  revision: WORLD_V0_PLAYABLE_CONTROL_REVISION,
  cameraOrbit: { ...cameraOrbit },
  rawInput: rawCurrentInput(),
  worldInput: currentInput(),
});
window.__sharedYardV0LastEvidence = () => {
  try {
    const raw = localStorage.getItem("shared-yard-v0-last-evidence");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};
addEventListener("pagehide", () => persistLastSessionEvidence("pagehide"));`,
"background evidence hooks");

app = replaceOnce(app,
`  if (networkState.startsWith("live")) return "Shared Yard live · move and interact";`,
`  if (networkState.startsWith("live")) return "Shared Yard live · move · drag to look · interact";`,
"live product status");

app = replaceOnce(app,
`  lastFrameAt = null;
  runtimeFailed = false;
  Object.assign(metrics, {`,
`  lastFrameAt = null;
  runtimeFailed = false;
  runtimeFailureReason = null;
  runtimeFailureAt = null;
  Object.assign(metrics, {`,
"failure provenance reset");

app = replaceOnce(app,
`  touchInput = { x: dx, z: -dy };`,
`  touchInput = { x: dx, z: dy };`,
"mobile joystick vertical direction");

app = replaceOnce(app,
`joystick.addEventListener("pointerup", releaseJoystick);
joystick.addEventListener("pointercancel", releaseJoystick);

function resize() {
  const portrait = innerWidth <= 720 && innerHeight > innerWidth;
  camera.aspect = innerWidth / innerHeight;
  camera.fov = portrait ? 62 : 55;`,
`joystick.addEventListener("pointerup", releaseJoystick);
joystick.addEventListener("pointercancel", releaseJoystick);

function beginCameraPointer(event) {
  if (!playing || cameraOrbit.pointerId !== null) return;
  if (event.pointerType === "mouse" && event.button !== 0 && event.button !== 2) return;
  cameraOrbit.pointerId = event.pointerId;
  cameraOrbit.lastX = event.clientX;
  cameraOrbit.lastY = event.clientY;
  try { renderer.domElement.setPointerCapture(event.pointerId); } catch { /* browser may not expose capture */ }
  event.preventDefault();
}

function moveCameraPointer(event) {
  if (event.pointerId !== cameraOrbit.pointerId) return;
  const dx = event.clientX - cameraOrbit.lastX;
  const dy = event.clientY - cameraOrbit.lastY;
  cameraOrbit.lastX = event.clientX;
  cameraOrbit.lastY = event.clientY;
  const next = clampOrbit({
    yaw: cameraOrbit.yaw - dx * 0.006,
    pitch: cameraOrbit.pitch + dy * 0.004,
    distance: cameraOrbit.distance,
  });
  cameraOrbit.yaw = next.yaw;
  cameraOrbit.pitch = next.pitch;
  cameraOrbit.distance = next.distance;
  cameraOrbit.userAdjusted = true;
  event.preventDefault();
}

function endCameraPointer(event) {
  if (event.pointerId !== cameraOrbit.pointerId) return;
  cameraOrbit.pointerId = null;
  try { renderer.domElement.releasePointerCapture(event.pointerId); } catch { /* capture may already be gone */ }
  event.preventDefault();
}

renderer.domElement.addEventListener("pointerdown", beginCameraPointer);
renderer.domElement.addEventListener("pointermove", moveCameraPointer);
renderer.domElement.addEventListener("pointerup", endCameraPointer);
renderer.domElement.addEventListener("pointercancel", endCameraPointer);
renderer.domElement.addEventListener("contextmenu", (event) => event.preventDefault());
renderer.domElement.addEventListener("wheel", (event) => {
  if (!playing) return;
  const next = clampOrbit({
    yaw: cameraOrbit.yaw,
    pitch: cameraOrbit.pitch,
    distance: cameraOrbit.distance + event.deltaY * 0.012,
  });
  cameraOrbit.distance = next.distance;
  cameraOrbit.userAdjusted = true;
  event.preventDefault();
}, { passive: false });
renderer.domElement.addEventListener("dblclick", (event) => {
  if (!playing) return;
  resetCameraOrbit();
  event.preventDefault();
});

function resize() {
  const portrait = portraitViewport();
  if (!cameraOrbit.userAdjusted) resetCameraOrbit();
  camera.aspect = innerWidth / innerHeight;
  camera.fov = portrait ? 62 : 55;`,
"camera interaction controls");

writeFileSync(appPath, app);

const buildPath = "public/world-v0/build-contract.js";
let build = readFileSync(buildPath, "utf8");
build = replaceOnce(
  build,
  `export const WORLD_V0_BROWSER_UI_REVISION = "shared-yard-v0-browser-ui-v3-presence";`,
  `export const WORLD_V0_BROWSER_UI_REVISION = "shared-yard-v0-browser-ui-v4-playable-control";`,
  "browser UI revision",
);
writeFileSync(buildPath, build);

console.log("WORLD_V0_PLAYABLE_A1_PATCH_APPLIED");
