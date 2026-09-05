import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.185.1/build/three.module.js";
import {
  WORLD_V0_BROWSER_UI_REVISION,
  WORLD_V0_BOX3D_PACKAGE,
  WORLD_V0_BOX3D_URL,
  WORLD_V0_CLIENT_SIM_REVISION,
  WORLD_V0_EXPECTED_PROTOCOL_REVISION,
  WORLD_V0_EXPECTED_SERVER_REVISION,
  WORLD_V0_EXPECTED_SIM_BUILD_ID,
  WORLD_V0_EXPECTED_STATE_GUARD_REVISION,
} from "./build-contract.js";
import {
  firstWorldV0StateDifference,
  packWorldV0State,
} from "./state-guard.js";
import {
  WORLD_V0_CAMERA_CONTROL,
  WORLD_V0_PLAYABLE_CONTROL_REVISION,
  cameraClipPlanes,
  cameraFogRange,
  cameraRelativeInput,
  clampOrbit,
  dragOrbit,
  orbitFromOffset,
  orbitOffset,
  pinchZoomDistance,
  wheelZoomDistance,
} from "./playable-control.js";

const FIXED_DT = 1 / 60;
const STEP_MS = 1000 / 60;
const MAX_PREDICTION_STEPS_PER_FRAME = 20;
const DIAGNOSTIC_RETAIN_TICKS = 96;
const CORRECTION_RETAIN = 128;
const FRAME_RETAIN = 240;
const PING_INTERVAL_MS = 1000;
const HUD_INTERVAL_MS = 200;
const LONG_FRAME_MS = 34;
const LONG_FRAME_RETAIN = 32;
const LIFECYCLE_RETAIN = 32;
const EPS = 1e-9;

const viewport = document.querySelector("#viewport");
const boot = document.querySelector("#boot");
const bootTitle = boot?.querySelector("h1");
const callsignInput = document.querySelector("#callsign");
const runInput = document.querySelector("#run");
const enterButton = document.querySelector("#enter");
const bootStatus = document.querySelector("#boot-status");
const sessionActions = document.querySelector("#session-actions");
const copyInviteButton = document.querySelector("#copy-invite");
const restartRoundButton = document.querySelector("#restart-round");
const notice = document.querySelector("#notice");
const joystick = document.querySelector("#joystick");
const joystickKnob = document.querySelector("#joystick-knob");
const cameraGimbal = document.querySelector("#camera-gimbal");
const cameraGimbalKnob = document.querySelector("#camera-gimbal-knob");
const copyEvidenceButton = document.querySelector("#copy-evidence");
const metricNames = ["net", "ticks", "guard", "corrections", "rewind", "replay", "rtt", "lease", "memory", "frame"];
const metric = Object.fromEntries(metricNames.map((name) => [name, document.querySelector(`#m-${name}`)]));
const required = [viewport, boot, bootTitle, callsignInput, runInput, enterButton, bootStatus, sessionActions, copyInviteButton, restartRoundButton, notice, joystick, joystickKnob, cameraGimbal, cameraGimbalKnob, copyEvidenceButton, ...Object.values(metric)];
if (required.some((value) => !value)) throw new Error("Shared Yard V0 UI incomplete");

const PLAYER_ID_PATTERN = /^[A-Za-z0-9_-]{1,24}$/;
const RUN_KEY_PATTERN = /^[A-Za-z0-9_-]{1,20}$/;
const urlParams = new URL(location.href).searchParams;
const storedCallsign = localStorage.getItem("shared-yard-v0-callsign") || "";
const storedRun = localStorage.getItem("shared-yard-v0-run") || "";
const randomRun = `yard-${Math.random().toString(36).slice(2, 8)}`;
callsignInput.value = urlParams.get("player") || storedCallsign || "";
runInput.value = urlParams.get("run") || storedRun || randomRun;

let b3 = null;
enterButton.disabled = true;
bootStatus.textContent = "Loading physics…";
try {
  const module = await import(WORLD_V0_BOX3D_URL);
  b3 = await module.default();
  const recordingFns = [
    "b3CreateRecording", "b3DestroyRecording", "b3World_StartRecording", "b3World_StopRecording", "b3Recording_GetSize",
    "b3RecPlayer_CreateFromRecording", "b3RecPlayer_Destroy", "b3RecPlayer_GetWorldId", "b3RecPlayer_GetBodyCount",
    "b3RecPlayer_GetBodyId", "b3RecPlayer_SeekFrame", "b3RecPlayer_GetFrame", "b3RecPlayer_HasDiverged",
    "b3RecPlayer_GetDivergeFrame", "b3Body_SetName", "b3Body_GetName", "b3Body_IsValid",
  ];
  const missing = recordingFns.filter((name) => typeof b3[name] !== "function");
  if (missing.length) throw new Error(`Box3D recording capability missing: ${missing.join(", ")}`);
  enterButton.disabled = false;
  bootStatus.textContent = "Ready · share the same Run key with another player";
} catch (error) {
  bootStatus.textContent = error instanceof Error ? error.message : String(error);
  enterButton.textContent = "Box3D failed";
  throw error;
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0d1218);
scene.fog = new THREE.Fog(0x0d1218, 18, 48);
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.05, 100);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.domElement.style.touchAction = "none";
renderer.domElement.style.overscrollBehavior = "none";
viewport.append(renderer.domElement);
scene.add(new THREE.HemisphereLight(0xb9d7e5, 0x27313a, 2));
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(7, 13, 9);
scene.add(sun);

const worldVisualRoot = new THREE.Group();
scene.add(worldVisualRoot);
const propMeshes = new Map();
let selfMesh = null;
let remoteMesh = null;
let visualContractBuiltFor = null;
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
const cameraTouchPointers = new Map();
let cameraPinch = null;
let cameraGimbalPointer = null;
let cameraGimbalInput = { x: 0, y: 0 };
let lastCameraControlAt = null;

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

resetCameraOrbit();

function clearWorldVisuals() {
  while (worldVisualRoot.children.length) worldVisualRoot.remove(worldVisualRoot.children[0]);
  propMeshes.clear();
  selfMesh = null;
  remoteMesh = null;
  visualContractBuiltFor = null;
  spatialCueCount = 0;
}

function makePresenceLabel(text, color) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const context = canvas.getContext("2d");
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "rgba(7, 13, 17, 0.72)";
  context.fillRect(24, 13, 208, 38);
  context.strokeStyle = "rgba(220, 245, 244, 0.14)";
  context.strokeRect(24.5, 13.5, 207, 37);
  context.fillStyle = color;
  context.font = "700 23px system-ui";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, 128, 32);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
  label.scale.set(1.75, 0.44, 1);
  label.userData.presenceText = text;
  return label;
}

function makeGroundRing(color) {
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.5,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.56, 0.7, 40), material);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.024;
  return ring;
}

function makeGroundText(text, color, position, scale = 1) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 96;
  const context = canvas.getContext("2d");
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = color;
  context.globalAlpha = 0.6;
  context.font = "700 34px system-ui";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, 256, 48);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(3.4 * scale, 0.64 * scale),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: 0.56, depthWrite: false, side: THREE.DoubleSide }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(position[0], 0.028, position[2]);
  worldVisualRoot.add(mesh);
  return mesh;
}

function makeZonePlane(size, position, color) {
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(size[0], size[1]),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.075, depthWrite: false, side: THREE.DoubleSide }),
  );
  plane.rotation.x = -Math.PI / 2;
  plane.position.set(position[0], 0.02, position[2]);
  worldVisualRoot.add(plane);
  return plane;
}

function buildSpatialCues(state) {
  const props = new Map((state?.props || []).map((prop) => [prop.id, prop]));
  const definitions = [
    { ids: ["prop-0", "prop-1", "prop-2", "prop-3", "prop-4", "prop-5"], label: "COLLISION YARD", size: [6.7, 4.1], labelOffset: [0, -2.25], color: 0x62a8c6, textColor: "#89cde1", textScale: 0.88 },
    { ids: ["prop-6", "prop-7", "prop-8"], label: "TOWER", size: [4.1, 4.0], labelOffset: [0, -1.95], color: 0xd9a166, textColor: "#efc28b", textScale: 0.7 },
    { ids: ["prop-9", "prop-10", "prop-11"], label: "IMPULSE LANE", size: [5.3, 2.3], labelOffset: [0, 1.4], color: 0x6fc6af, textColor: "#90e2ca", textScale: 0.76 },
  ];
  for (const definition of definitions) {
    const members = definition.ids.map((id) => props.get(id)).filter(Boolean);
    if (members.length !== definition.ids.length) continue;
    const centerX = members.reduce((sum, prop) => sum + prop.position[0], 0) / members.length;
    const centerZ = members.reduce((sum, prop) => sum + prop.position[2], 0) / members.length;
    makeZonePlane(definition.size, [centerX, 0, centerZ], definition.color);
    makeGroundText(
      definition.label,
      definition.textColor,
      [centerX + definition.labelOffset[0], 0, centerZ + definition.labelOffset[1]],
      definition.textScale,
    );
    spatialCueCount += 2;
  }
}

function buildArenaVisual(contract) {
  if (visualContractBuiltFor === contract.simBuildId) return;
  clearWorldVisuals();
  visualContractBuiltFor = contract.simBuildId;
  const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x27343d, roughness: 0.92 });
  const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x3d4b55, roughness: 0.84, transparent: true, opacity: 0.56 });
  for (const box of contract.arena.staticBoxes || []) {
    const [hx, hy, hz] = box.halfExtents;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(hx * 2, hy * 2, hz * 2), box.id === "ground" ? floorMaterial : wallMaterial);
    mesh.position.fromArray(box.position);
    worldVisualRoot.add(mesh);
  }
  const grid = new THREE.GridHelper(20, 20, 0x52707c, 0x30434d);
  grid.position.y = 0.006;
  grid.material.transparent = true;
  grid.material.opacity = 0.24;
  worldVisualRoot.add(grid);
}

function createPlayerMesh(isSelf) {
  const color = isSelf ? 0x76d8c0 : 0xe7a16e;
  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.56 });
  const group = new THREE.Group();
  const cylinder = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.9, 14), material);
  const top = new THREE.Mesh(new THREE.SphereGeometry(0.35, 14, 10), material);
  const bottom = new THREE.Mesh(new THREE.SphereGeometry(0.35, 14, 10), material);
  top.position.y = 0.45;
  bottom.position.y = -0.45;
  const label = makePresenceLabel(isSelf ? "YOU" : "PEER", isSelf ? "#94f6de" : "#ffc18b");
  label.position.set(0, 1.3, 0);
  group.add(cylinder, top, bottom, label);
  const ring = makeGroundRing(color);
  worldVisualRoot.add(group, ring);
  group.userData.presenceRing = ring;
  group.userData.presenceLabel = label;
  return group;
}

function propColor(id) {
  const numeric = Number(String(id).replace("prop-", ""));
  if (numeric >= 6 && numeric <= 8) return 0x956a45;
  if (numeric >= 9 && numeric <= 11) return 0xc28f58;
  return 0xb68a55;
}

function getPropMesh(id) {
  let mesh = propMeshes.get(id);
  if (!mesh) {
    const half = simulation?.propPhysics?.halfExtents || [0.46, 0.46, 0.46];
    mesh = new THREE.Mesh(
      new THREE.BoxGeometry(half[0] * 2, half[1] * 2, half[2] * 2),
      new THREE.MeshStandardMaterial({ color: propColor(id), roughness: 0.74 }),
    );
    worldVisualRoot.add(mesh);
    propMeshes.set(id, mesh);
  }
  return mesh;
}

const keys = new Set();
const movementCodes = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowLeft", "ArrowDown", "ArrowRight"]);
let touchInput = { x: 0, z: 0 };
let joystickPointer = null;

function keyboardInput() {
  let x = 0;
  let z = 0;
  if (keys.has("KeyA") || keys.has("ArrowLeft")) x -= 1;
  if (keys.has("KeyD") || keys.has("ArrowRight")) x += 1;
  if (keys.has("KeyW") || keys.has("ArrowUp")) z -= 1;
  if (keys.has("KeyS") || keys.has("ArrowDown")) z += 1;
  const length = Math.hypot(x, z);
  return length > 1 ? { x: x / length, z: z / length } : { x, z };
}

function rawCurrentInput() {
  const keyboard = keyboardInput();
  if (Math.hypot(keyboard.x, keyboard.z) > 0.01) return keyboard;
  return { ...touchInput };
}

function currentInput() {
  return cameraRelativeInput(rawCurrentInput(), cameraOrbit.yaw);
}

function sameInput(a, c) {
  return Math.abs(a.x - c.x) <= EPS && Math.abs(a.z - c.z) <= EPS;
}

function zeroInput() {
  return { x: 0, z: 0 };
}

function distance3(a, c) {
  return Math.hypot(a[0] - c[0], a[1] - c[1], a[2] - c[2]);
}

function moveToward2(cx, cz, tx, tz, maxDelta) {
  const dx = tx - cx;
  const dz = tz - cz;
  const distance = Math.hypot(dx, dz);
  if (distance <= maxDelta || distance < 1e-9) return [tx, tz];
  const scale = maxDelta / distance;
  return [cx + dx * scale, cz + dz * scale];
}

function pushBounded(values, value, retain) {
  values.push(value);
  if (values.length > retain) values.splice(0, values.length - retain);
}

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1))];
}

function showNotice(text) {
  notice.textContent = text;
  notice.classList.remove("hidden");
}

function clearNotice() {
  notice.classList.add("hidden");
  notice.textContent = "";
}

function formatBytes(value) {
  if (!Number.isFinite(value)) return "—";
  if (value < 1024) return `${value} B`;
  return `${(value / 1024).toFixed(1)} KiB`;
}

function recordLifecycle(type, details = {}) {
  pushBounded(lifecycleEvents, {
    at: new Date().toISOString(),
    type,
    boundaryTick: localState?.boundaryTick ?? null,
    networkState,
    ...details,
  }, LIFECYCLE_RETAIN);
}

let playing = false;
let runtimeFailed = false;
let runtimeFailureReason = null;
let runtimeFailureAt = null;
let sessionEnd = null;
let visibilityTransitionAt = performance.now();
let socket = null;
let networkState = "idle";
let callsign = "";
let runKey = "";
let identity = null;
let selfSessionId = null;
let remoteSessionId = null;
let selfNetEntityId = null;
let remoteNetEntityId = null;
let selfSlot = null;
let protocolStartTick = null;
let simulation = null;
let phaseAnchor = null;
let localState = null;
let batchSeq = 0;
let pendingBatch = [];
let pingTimer = null;
let hudTimer = null;
let lastFrameAt = null;
let correctionFrameWindowUntil = 0;

const pendingPings = new Map();
const rttSamples = [];
const frameSamples = [];
const correctionEvents = [];
const longFrameEvents = [];
const lifecycleEvents = [];
const intendedSelf = new Map();
const peerRemote = new Map();
const consumedByTick = new Map();
const usedByTick = new Map();
const diagnosticSamples = new Map();
const pendingStateGuards = new Map();

const metrics = {
  corrections: 0,
  latestRewind: 0,
  maxRewind: 0,
  latestReplaySteps: 0,
  maxReplaySteps: 0,
  maxCorrectionDurationMs: 0,
  maxRetainedBytes: 0,
  generationRotations: 0,
  remapFailures: 0,
  guardMatches: 0,
  guardMismatches: 0,
  guardPending: 0,
  firstStateMismatch: null,
  leaseExpiredSeen: 0,
  serverLate: 0,
  serverRejected: 0,
  latestCorrection: { self: 0, remote: 0, prop: 0 },
  maxCorrection: { self: 0, remote: 0, prop: 0 },
  maxFrameMs: 0,
  longFrames: 0,
};

function sessionRunKey() {
  return runKey || runInput.value.trim();
}

function buildInviteUrl() {
  const url = new URL(location.href);
  url.search = "";
  url.hash = "";
  const key = sessionRunKey();
  if (RUN_KEY_PATTERN.test(key)) url.searchParams.set("run", key);
  return url.toString();
}

function canRestartRound() {
  return !runtimeFailed && networkState.startsWith("closed") && (!socket || socket.readyState === WebSocket.CLOSED);
}

function updateSessionActions() {
  const compact = boot.classList.contains("compact");
  const inviteVisible = compact && (networkState === "waiting for peer" || networkState.startsWith("closed") || networkState.startsWith("epoch ended"));
  const restartVisible = compact && canRestartRound();
  copyInviteButton.classList.toggle("hidden", !inviteVisible);
  restartRoundButton.classList.toggle("hidden", !restartVisible);
  sessionActions.classList.toggle("hidden", !inviteVisible && !restartVisible);
}

function expectedWorldId() {
  return `shared-yard-v0-${runKey}`;
}

function assertSimulationContract(contract, phase) {
  if (!contract || typeof contract !== "object") throw new Error(`${phase} missing simulation contract`);
  if (contract.simBuildId !== WORLD_V0_EXPECTED_SIM_BUILD_ID) throw new Error(`${phase} SimBuildId mismatch ${contract.simBuildId}`);
  if (contract.clientSimRevision !== WORLD_V0_CLIENT_SIM_REVISION) throw new Error(`${phase} client sim revision mismatch ${contract.clientSimRevision}`);
  if (contract.protocolRevision !== WORLD_V0_EXPECTED_PROTOCOL_REVISION) throw new Error(`${phase} protocol revision mismatch ${contract.protocolRevision}`);
  if (contract.stateGuardRevision !== WORLD_V0_EXPECTED_STATE_GUARD_REVISION) throw new Error(`${phase} state guard revision mismatch ${contract.stateGuardRevision}`);
  if (contract.box3dRuntime?.package !== WORLD_V0_BOX3D_PACKAGE) throw new Error(`${phase} Box3D package mismatch ${contract.box3dRuntime?.package}`);
  if (contract.timing?.simulationHz !== 60 || contract.timing?.substeps !== 4) throw new Error(`${phase} fixed-step contract mismatch`);
  if (!Array.isArray(contract.netEntityOrder) || contract.netEntityOrder.length !== 14) throw new Error(`${phase} invalid NetEntityId order`);
  if (!Array.isArray(contract.stateComponents) || contract.stateComponents.length !== 13) throw new Error(`${phase} invalid state component contract`);
  return contract;
}

function adoptIdentity(message, phase) {
  if (message.revision && message.revision !== WORLD_V0_EXPECTED_SERVER_REVISION) throw new Error(`${phase} server revision mismatch ${message.revision}`);
  if (message.simBuildId !== WORLD_V0_EXPECTED_SIM_BUILD_ID) throw new Error(`${phase} SimBuildId mismatch ${message.simBuildId}`);
  if (message.clientSimRevision !== WORLD_V0_CLIENT_SIM_REVISION) throw new Error(`${phase} client sim identity mismatch ${message.clientSimRevision}`);
  if (message.worldId !== expectedWorldId()) throw new Error(`${phase} WorldId mismatch ${message.worldId}`);
  if (typeof message.worldEpoch !== "string" || !message.worldEpoch) throw new Error(`${phase} missing WorldEpoch`);
  const next = {
    worldId: message.worldId,
    worldEpoch: message.worldEpoch,
    simBuildId: message.simBuildId,
    clientSimRevision: message.clientSimRevision,
  };
  if (identity && JSON.stringify(identity) !== JSON.stringify(next)) throw new Error(`${phase} world identity drift`);
  identity = next;
}

function assertMessageIdentity(message, phase) {
  if (!identity) throw new Error(`${phase} before handshake identity`);
  for (const key of ["worldId", "worldEpoch", "simBuildId", "clientSimRevision"]) {
    if (message[key] !== identity[key]) throw new Error(`${phase} ${key} drift`);
  }
}

function identityFields() {
  if (!identity) throw new Error("world identity unavailable");
  return { ...identity };
}

function bodyPosition(body) {
  const out = [0, 0, 0];
  b3.b3Body_GetPosition(out, body);
  return [...out];
}

function bodyRotation(body) {
  const out = [0, 0, 0, 1];
  b3.b3Body_GetRotation(out, body);
  return [...out];
}

function bodyLinearVelocity(body) {
  const out = [0, 0, 0];
  b3.b3Body_GetLinearVelocity(out, body);
  return [...out];
}

function bodyAngularVelocity(body) {
  const out = [0, 0, 0];
  b3.b3Body_GetAngularVelocity(out, body);
  return [...out];
}

function flattenBodyState(body) {
  return [
    ...bodyPosition(body),
    ...bodyRotation(body),
    ...bodyLinearVelocity(body),
    ...bodyAngularVelocity(body),
  ];
}

function createStaticBox(world, box) {
  const def = b3.b3DefaultBodyDef();
  def.position = [...box.position];
  const body = b3.b3CreateBody(world, def);
  b3.b3CreateBoxShape(body, b3.b3DefaultShapeDef(), box.halfExtents[0], box.halfExtents[1], box.halfExtents[2]);
}

function createDynamicBox(world, locator, prop) {
  const physics = simulation.propPhysics;
  const def = b3.b3DefaultBodyDef();
  def.type = b3.b3BodyType.b3_dynamicBody;
  def.position = [...prop.position];
  def.rotation = [...(prop.rotation || [0, 0, 0, 1])];
  def.linearDamping = physics.linearDamping;
  def.angularDamping = physics.angularDamping;
  const body = b3.b3CreateBody(world, def);
  b3.b3Body_SetName(body, locator);
  const shape = b3.b3DefaultShapeDef();
  shape.density = physics.density;
  shape.baseMaterial.friction = physics.friction;
  shape.baseMaterial.restitution = physics.restitution;
  b3.b3CreateBoxShape(body, shape, physics.halfExtents[0], physics.halfExtents[1], physics.halfExtents[2]);
  return body;
}

function createActorBody(world, locator, player) {
  const physics = simulation.playerPhysics;
  const def = b3.b3DefaultBodyDef();
  def.type = b3.b3BodyType.b3_dynamicBody;
  def.position = [...player.position];
  def.rotation = [...(player.rotation || [0, 0, 0, 1])];
  def.linearDamping = physics.linearDamping;
  def.angularDamping = physics.angularDamping;
  const body = b3.b3CreateBody(world, def);
  b3.b3Body_SetName(body, locator);
  const shape = b3.b3DefaultShapeDef();
  shape.density = physics.density;
  shape.baseMaterial.friction = physics.friction;
  shape.baseMaterial.restitution = physics.restitution;
  b3.b3CreateCapsuleShape(body, shape, {
    center1: [...physics.capsuleCenter1],
    center2: [...physics.capsuleCenter2],
    radius: physics.capsuleRadius,
  });
  b3.b3Body_SetMotionLocks(body, {
    linearX: false,
    linearY: false,
    linearZ: false,
    angularX: Boolean(physics.angularLocks?.[0]),
    angularY: Boolean(physics.angularLocks?.[1]),
    angularZ: Boolean(physics.angularLocks?.[2]),
  });
  return body;
}

function createSimulationFromState(state) {
  const players = [...(state?.players || [])].sort((a, c) => (a.slot ?? 0) - (c.slot ?? 0));
  const props = [...(state?.props || [])];
  if (players.length !== 2) throw new Error(`Shared Yard start requires exactly two players, got ${players.length}`);
  const self = players.find((player) => player.sessionId === selfSessionId);
  const remote = players.find((player) => player.sessionId !== selfSessionId);
  if (!self || !remote) throw new Error("Shared Yard start state missing actor");
  remoteSessionId = remote.sessionId;
  remoteNetEntityId = remote.netEntityId;

  const wd = b3.b3DefaultWorldDef();
  wd.gravity = [...simulation.arena.gravity];
  const world = b3.b3CreateWorld(wd);
  for (const box of simulation.arena.staticBoxes || []) createStaticBox(world, box);

  const entityDefs = [];
  const actorBodies = new Map();
  const propBodies = new Map();
  const netBodies = new Map();

  for (const prop of props) {
    const locator = `prop:${prop.netEntityId || prop.id}`;
    const body = createDynamicBox(world, locator, prop);
    propBodies.set(prop.id, body);
    netBodies.set(prop.netEntityId || prop.id, body);
    entityDefs.push({ netEntityId: prop.netEntityId || prop.id, locator, kind: "prop", propId: prop.id });
    getPropMesh(prop.id);
  }

  for (const player of players) {
    const netEntityId = player.netEntityId || `actor:${player.slot}`;
    const locator = netEntityId;
    const body = createActorBody(world, locator, player);
    actorBodies.set(player.sessionId, body);
    netBodies.set(netEntityId, body);
    entityDefs.push({ netEntityId, locator, kind: "actor", slot: player.slot, sessionId: player.sessionId });
  }

  return {
    world,
    actorBodies,
    propBodies,
    netBodies,
    entityDefs,
    netEntityOrder: [...simulation.netEntityOrder],
    ownerPlayer: 0,
  };
}

function remapSimulation(player, entityDefs, netEntityOrder) {
  const world = b3.b3RecPlayer_GetWorldId(player);
  const byLocator = new Map();
  const count = b3.b3RecPlayer_GetBodyCount(player);
  for (let ordinal = 0; ordinal < count; ordinal += 1) {
    const body = b3.b3RecPlayer_GetBodyId(player, ordinal);
    if (!b3.b3Body_IsValid(body)) continue;
    const locator = b3.b3Body_GetName(body);
    if (!locator) continue;
    if (byLocator.has(locator)) throw new Error(`duplicate replay locator ${locator}`);
    byLocator.set(locator, body);
  }

  const actorBodies = new Map();
  const propBodies = new Map();
  const netBodies = new Map();
  for (const def of entityDefs) {
    const body = byLocator.get(def.locator);
    if (!body) {
      metrics.remapFailures += 1;
      throw new Error(`entity remap missing ${def.netEntityId} via ${def.locator}`);
    }
    netBodies.set(def.netEntityId, body);
    if (def.kind === "actor") actorBodies.set(def.sessionId, body);
    else propBodies.set(def.propId, body);
  }
  return { world, actorBodies, propBodies, netBodies, entityDefs: [...entityDefs], netEntityOrder: [...netEntityOrder], ownerPlayer: player };
}

function destroySimulation(sim) {
  if (!sim) return;
  if (sim.ownerPlayer) {
    try { b3.b3RecPlayer_Destroy(sim.ownerPlayer); } catch { /* teardown only */ }
  } else if (sim.world) {
    try { b3.b3DestroyWorld(sim.world); } catch { /* teardown only */ }
  }
  sim.ownerPlayer = 0;
}

function captureDynamic(sim) {
  const actors = new Map();
  for (const [id, body] of sim.actorBodies) actors.set(id, { position: bodyPosition(body), rotation: bodyRotation(body) });
  const props = new Map();
  for (const [id, body] of sim.propBodies) props.set(id, { position: bodyPosition(body), rotation: bodyRotation(body) });
  return { actors, props };
}

function capturePackedDiagnostic(sim) {
  return packWorldV0State(
    sim.netEntityOrder,
    simulation.stateComponents,
    (netEntityId) => {
      const body = sim.netBodies.get(netEntityId);
      if (!body) throw new Error(`state guard body missing ${netEntityId}`);
      return flattenBodyState(body);
    },
  );
}

function correctionDelta(before, after) {
  const selfBefore = before.actors.get(selfSessionId)?.position;
  const selfAfter = after.actors.get(selfSessionId)?.position;
  const remoteBefore = before.actors.get(remoteSessionId)?.position;
  const remoteAfter = after.actors.get(remoteSessionId)?.position;
  let prop = 0;
  for (const [id, state] of before.props) {
    const next = after.props.get(id);
    if (next) prop = Math.max(prop, distance3(state.position, next.position));
  }
  return {
    self: selfBefore && selfAfter ? distance3(selfBefore, selfAfter) : 0,
    remote: remoteBefore && remoteAfter ? distance3(remoteBefore, remoteAfter) : 0,
    prop,
  };
}

function applyIntent(body, input) {
  const velocity = bodyLinearVelocity(body);
  const hasInput = Math.hypot(input.x, input.z) > 0.01;
  const accel = hasInput ? simulation.movement.playerAcceleration : simulation.movement.playerDeceleration;
  const [nextX, nextZ] = moveToward2(
    velocity[0],
    velocity[2],
    input.x * simulation.movement.playerSpeed,
    input.z * simulation.movement.playerSpeed,
    accel * FIXED_DT,
  );
  b3.b3Body_SetLinearVelocity(body, [nextX, velocity[1], nextZ]);
}

function previousUsedInput(tick) {
  if (tick <= 0) return { self: zeroInput(), remote: zeroInput() };
  return usedByTick.get(tick - 1) || { self: zeroInput(), remote: zeroInput() };
}

function authoritativeInput(tick, sessionId) {
  return consumedByTick.get(tick)?.get(sessionId) || null;
}

function resolveInputsForTick(tick, previous) {
  if (protocolStartTick === null || tick < protocolStartTick) return { self: zeroInput(), remote: zeroInput() };
  const selfAuth = authoritativeInput(tick, selfSessionId);
  const remoteAuth = authoritativeInput(tick, remoteSessionId);
  const self = selfAuth || intendedSelf.get(tick) || previous.self;
  const remote = remoteAuth || peerRemote.get(tick) || previous.remote;
  return { self: { x: self.x, z: self.z }, remote: { x: remote.x, z: remote.z } };
}

function usedInputsChangedAt(tick) {
  const used = usedByTick.get(tick);
  if (!used) return false;
  const resolved = resolveInputsForTick(tick, previousUsedInput(tick));
  return !sameInput(used.self, resolved.self) || !sameInput(used.remote, resolved.remote);
}

function truncateUsedFrom(targetTick) {
  for (const tick of [...usedByTick.keys()]) if (tick >= targetTick) usedByTick.delete(tick);
}

function applyResolvedTick(sim, tick, allowGenerateSelf) {
  if (allowGenerateSelf && protocolStartTick !== null && tick >= protocolStartTick && !intendedSelf.has(tick)) {
    const intended = currentInput();
    intendedSelf.set(tick, { ...intended });
    queueInputRecord(tick, intended);
  }
  const previous = previousUsedInput(tick);
  const resolved = resolveInputsForTick(tick, previous);
  usedByTick.set(tick, { self: { ...resolved.self }, remote: { ...resolved.remote } });
  const selfBody = sim.actorBodies.get(selfSessionId);
  const remoteBody = sim.actorBodies.get(remoteSessionId);
  if (!selfBody || !remoteBody) throw new Error("predicted actor mapping incomplete");
  applyIntent(selfBody, resolved.self);
  applyIntent(remoteBody, resolved.remote);
}

function createHistory(sim) {
  const history = { segments: [], active: null, generation: 0, segmentRotations: 0 };
  localState = { sim, history, boundaryTick: 0 };
  startActiveRecording(0, "initial");
  storeDiagnostic(0);
}

function startActiveRecording(startTick, reason) {
  const history = localState.history;
  if (history.active) throw new Error("active recording already exists");
  const recording = b3.b3CreateRecording(simulation.clientHistory.recordingCapacityBytes);
  b3.b3World_StartRecording(localState.sim.world, recording);
  history.active = {
    recording,
    startTick,
    frames: 0,
    generation: history.generation,
    reason,
    seedBytes: b3.b3Recording_GetSize(recording),
  };
  updateRetainedBytes();
}

function finalizeActiveRecording(reason) {
  const history = localState.history;
  const active = history.active;
  if (!active) return null;
  b3.b3World_StopRecording(localState.sim.world);
  history.active = null;
  const bytes = b3.b3Recording_GetSize(active.recording);
  if (active.frames === 0) {
    b3.b3DestroyRecording(active.recording);
    return null;
  }
  const segment = {
    ...active,
    endTick: active.startTick + active.frames,
    validEndTick: active.startTick + active.frames,
    bytes,
    finalizeReason: reason,
  };
  history.segments.push(segment);
  updateRetainedBytes();
  return segment;
}

function updateRetainedBytes() {
  if (!localState) return 0;
  let bytes = localState.history.segments.reduce((sum, segment) => sum + segment.bytes, 0);
  if (localState.history.active) bytes += b3.b3Recording_GetSize(localState.history.active.recording);
  metrics.maxRetainedBytes = Math.max(metrics.maxRetainedBytes, bytes);
  return bytes;
}

function rotateIfNeeded(boundaryTick) {
  const history = localState.history;
  if (!history.active || history.active.frames < simulation.clientHistory.segmentTicks) return;
  finalizeActiveRecording("periodic");
  history.segmentRotations += 1;
  startActiveRecording(boundaryTick, "periodic");
}

function compareStateGuard(boundaryTick, guard) {
  if (!guard) throw new Error(`missing authority state guard at B(${boundaryTick})`);
  if (guard.revision !== WORLD_V0_EXPECTED_STATE_GUARD_REVISION) throw new Error(`state guard revision mismatch ${guard.revision}`);
  const predicted = diagnosticSamples.get(boundaryTick);
  if (!predicted) {
    pendingStateGuards.set(boundaryTick, guard);
    metrics.guardPending = pendingStateGuards.size;
    return;
  }
  const difference = firstWorldV0StateDifference(
    guard.packed,
    predicted,
    simulation.netEntityOrder,
    simulation.stateComponents,
  );
  pendingStateGuards.delete(boundaryTick);
  metrics.guardPending = pendingStateGuards.size;
  if (difference) {
    metrics.guardMismatches += 1;
    metrics.firstStateMismatch ||= { boundaryTick, ...difference };
    throw new Error(`FOUNDATION_STATE_DIVERGENCE B(${boundaryTick}) ${difference.netEntityId || difference.field}.${difference.component || ""}`);
  }
  metrics.guardMatches += 1;
}

function storeDiagnostic(boundaryTick) {
  if (!localState?.sim) return;
  diagnosticSamples.set(boundaryTick, capturePackedDiagnostic(localState.sim));
  const pending = pendingStateGuards.get(boundaryTick);
  if (pending) compareStateGuard(boundaryTick, pending);
  for (const tick of [...diagnosticSamples.keys()]) {
    if (tick < boundaryTick - DIAGNOSTIC_RETAIN_TICKS) diagnosticSamples.delete(tick);
  }
}

function managedPhysicsStep(tick, allowGenerateSelf) {
  applyResolvedTick(localState.sim, tick, allowGenerateSelf);
  b3.b3World_Step(localState.sim.world, FIXED_DT, simulation.timing.substeps);
  localState.boundaryTick = tick + 1;
  if (!localState.history.active) throw new Error("missing active recording during managed step");
  localState.history.active.frames += 1;
  rotateIfNeeded(localState.boundaryTick);
  updateRetainedBytes();
  storeDiagnostic(localState.boundaryTick);
}

function trimHistory() {
  if (!localState) return;
  const cutoff = localState.boundaryTick - simulation.clientHistory.retainTicks;
  const kept = [];
  for (const segment of localState.history.segments) {
    if (segment.validEndTick >= cutoff) kept.push(segment);
    else b3.b3DestroyRecording(segment.recording);
  }
  localState.history.segments = kept;
  for (const tick of [...usedByTick.keys()]) if (tick < cutoff - 1) usedByTick.delete(tick);
  for (const tick of [...intendedSelf.keys()]) if (tick < cutoff - 1) intendedSelf.delete(tick);
  for (const tick of [...peerRemote.keys()]) if (tick < cutoff - 1) peerRemote.delete(tick);
  for (const tick of [...consumedByTick.keys()]) if (tick < cutoff - 1) consumedByTick.delete(tick);
  updateRetainedBytes();
}

function selectCheckpoint(targetTick) {
  const candidates = localState.history.segments.filter((segment) => segment.startTick <= targetTick && segment.validEndTick >= targetTick);
  if (!candidates.length) throw new Error(`history_window_miss: no checkpoint for B(${targetTick}) at B(${localState.boundaryTick})`);
  candidates.sort((a, c) => c.startTick - a.startTick);
  return candidates[0];
}

function invalidateHistoryFrom(targetTick, selected) {
  const kept = [];
  for (const segment of localState.history.segments) {
    if (segment === selected && segment.startTick < targetTick) {
      segment.validEndTick = targetTick;
      kept.push(segment);
    } else if (segment.validEndTick <= targetTick) {
      kept.push(segment);
    } else {
      b3.b3DestroyRecording(segment.recording);
    }
  }
  localState.history.segments = kept;
}

function replaceLiveWithPlayer(player) {
  const old = localState.sim;
  const next = remapSimulation(player, old.entityDefs, old.netEntityOrder);
  localState.sim = next;
  destroySimulation(old);
}

function correctFrom(targetTick, reason) {
  if (!localState || targetTick >= localState.boundaryTick) return false;
  if (!usedInputsChangedAt(targetTick)) return false;
  const currentBoundary = localState.boundaryTick;
  const coldFirst = metrics.corrections === 0;
  const usedBefore = usedByTick.get(targetTick) || null;
  const resolvedAfter = resolveInputsForTick(targetTick, previousUsedInput(targetTick));
  const startedAt = performance.now();
  const before = captureDynamic(localState.sim);

  finalizeActiveRecording("correction-cut");
  const selected = selectCheckpoint(targetTick);
  const seekPrefix = targetTick - selected.startTick;
  const player = b3.b3RecPlayer_CreateFromRecording(selected.recording, 0);
  if (!player) throw new Error(`replay player create failed at target ${targetTick}`);
  b3.b3RecPlayer_SeekFrame(player, seekPrefix);
  if (b3.b3RecPlayer_GetFrame(player) !== seekPrefix) {
    b3.b3RecPlayer_Destroy(player);
    throw new Error(`replay seek mismatch at target ${targetTick}`);
  }
  if (b3.b3RecPlayer_HasDiverged(player)) {
    const frame = b3.b3RecPlayer_GetDivergeFrame(player);
    b3.b3RecPlayer_Destroy(player);
    throw new Error(`checkpoint replay diverged at frame ${frame}`);
  }

  invalidateHistoryFrom(targetTick, selected);
  replaceLiveWithPlayer(player);
  localState.history.generation += 1;
  metrics.generationRotations += 1;
  localState.boundaryTick = targetTick;
  truncateUsedFrom(targetTick);
  startActiveRecording(targetTick, `correction-${localState.history.generation}:${reason}`);

  let replayed = seekPrefix;
  for (let tick = targetTick; tick < currentBoundary; tick += 1) {
    managedPhysicsStep(tick, false);
    replayed += 1;
  }

  const after = captureDynamic(localState.sim);
  const delta = correctionDelta(before, after);
  const rewind = currentBoundary - targetTick;
  const durationMs = Math.max(0, performance.now() - startedAt);
  metrics.corrections += 1;
  metrics.latestRewind = rewind;
  metrics.maxRewind = Math.max(metrics.maxRewind, rewind);
  metrics.latestReplaySteps = replayed;
  metrics.maxReplaySteps = Math.max(metrics.maxReplaySteps, replayed);
  metrics.maxCorrectionDurationMs = Math.max(metrics.maxCorrectionDurationMs, durationMs);
  metrics.latestCorrection = delta;
  metrics.maxCorrection.self = Math.max(metrics.maxCorrection.self, delta.self);
  metrics.maxCorrection.remote = Math.max(metrics.maxCorrection.remote, delta.remote);
  metrics.maxCorrection.prop = Math.max(metrics.maxCorrection.prop, delta.prop);
  correctionFrameWindowUntil = Math.max(correctionFrameWindowUntil, performance.now() + 150);
  pushBounded(correctionEvents, {
    reason,
    targetTick,
    boundaryBefore: currentBoundary,
    checkpointStart: selected.startTick,
    seekPrefix,
    rewind,
    replaySteps: replayed,
    durationMs,
    coldFirst,
    usedBefore,
    resolvedAfter,
    delta,
  }, CORRECTION_RETAIN);
  trimHistory();
  return true;
}

function earliestChangedTick(candidates) {
  if (!localState) return null;
  const sorted = [...new Set(candidates)]
    .filter((tick) => Number.isInteger(tick) && tick >= 0 && tick < localState.boundaryTick)
    .sort((a, c) => a - c);
  for (const tick of sorted) if (usedInputsChangedAt(tick)) return tick;
  return null;
}

function maybeCorrect(candidates, reason) {
  const target = earliestChangedTick(candidates);
  if (target === null) return false;
  return correctFrom(target, reason);
}

function destroyLocalState() {
  if (!localState) return;
  try {
    if (localState.history.active) {
      b3.b3World_StopRecording(localState.sim.world);
      b3.b3DestroyRecording(localState.history.active.recording);
      localState.history.active = null;
    }
  } catch { /* teardown only */ }
  for (const segment of localState.history.segments) {
    try { b3.b3DestroyRecording(segment.recording); } catch { /* teardown only */ }
  }
  localState.history.segments = [];
  destroySimulation(localState.sim);
  localState = null;
}

function socketUrl() {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const url = new URL(`${protocol}//${location.host}/world-v0/ws`);
  url.searchParams.set("player", callsign);
  url.searchParams.set("run", runKey);
  return url.toString();
}

function queueInputRecord(targetTick, input) {
  pendingBatch.push({ targetTick, x: input.x, z: input.z });
  if (pendingBatch.length < simulation.timing.inputBatchSize) return;
  if (!socket || socket.readyState !== WebSocket.OPEN) throw new Error("input transport closed while generating canonical records");
  batchSeq += 1;
  const records = pendingBatch.splice(0, simulation.timing.inputBatchSize);
  socket.send(JSON.stringify({
    type: "world_v0_input_batch",
    ...identityFields(),
    batchSeq,
    records,
  }));
}

function sendPing() {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  const id = crypto.randomUUID();
  pendingPings.set(id, performance.now());
  socket.send(JSON.stringify({ type: "world_v0_ping", id }));
  if (pendingPings.size > 8) pendingPings.delete(pendingPings.keys().next().value);
}

function authorityTickEstimate(now = performance.now()) {
  if (!phaseAnchor) return null;
  return phaseAnchor.tick + (now - phaseAnchor.at) / STEP_MS;
}

function updatePhaseFromPong(message, receivedAt) {
  const sentAt = pendingPings.get(message.id);
  if (sentAt === undefined) return;
  pendingPings.delete(message.id);
  const rtt = Math.max(0, receivedAt - sentAt);
  pushBounded(rttSamples, rtt, 40);
  phaseAnchor = { tick: message.boundaryTick + rtt / (2 * STEP_MS), at: receivedAt };
}

function updatePhaseFromStart(message, receivedAt) {
  const medianRtt = rttSamples.length ? percentile(rttSamples, 0.5) : 0;
  phaseAnchor = { tick: message.boundaryTick + medianRtt / (2 * STEP_MS), at: receivedAt };
}

function classifyBatchAck(message) {
  assertMessageIdentity(message, "batch-ack");
  if (message.batchStatus === "stale_batch") metrics.serverRejected += 1;
  for (const record of message.records || []) {
    if (record.status === "late") metrics.serverLate += 1;
    if (["before_start", "too_future", "conflict"].includes(record.status)) metrics.serverRejected += 1;
  }
}

function handlePeerRecords(message) {
  assertMessageIdentity(message, "peer-records");
  if (!remoteSessionId || message.senderSessionId !== remoteSessionId) return;
  if (remoteNetEntityId && message.senderNetEntityId !== remoteNetEntityId) throw new Error("remote NetEntityId drift");
  const candidates = [];
  for (const record of message.records || []) {
    if (!Number.isInteger(record.targetTick) || !Number.isFinite(record.x) || !Number.isFinite(record.z)) continue;
    const existing = peerRemote.get(record.targetTick);
    if (existing && !sameInput(existing, record)) throw new Error(`conflicting relayed remote record at ${record.targetTick}`);
    if (!existing) {
      peerRemote.set(record.targetTick, { x: record.x, z: record.z });
      candidates.push(record.targetTick);
    }
  }
  maybeCorrect(candidates, "peer-record");
}

function handleConsumed(message) {
  assertMessageIdentity(message, "consumed");
  if (!Number.isInteger(message.targetTick)) return;
  const map = new Map();
  for (const player of message.players || []) {
    if (!player.sessionId || !Number.isFinite(player.x) || !Number.isFinite(player.z)) continue;
    map.set(player.sessionId, {
      x: player.x,
      z: player.z,
      fresh: Boolean(player.fresh),
      source: player.source,
      missingStreak: player.missingStreak,
    });
    if (player.source === "lease_expired") metrics.leaseExpiredSeen += 1;
  }
  consumedByTick.set(message.targetTick, map);
  maybeCorrect([message.targetTick], "authority-consumed");
}

function handleSnapshot(message) {
  assertMessageIdentity(message, "snapshot");
  if (message.revision !== WORLD_V0_EXPECTED_SERVER_REVISION) throw new Error(`snapshot server revision mismatch ${message.revision}`);
  if (!Number.isInteger(message.boundaryTick)) return;
  compareStateGuard(message.boundaryTick, message.stateGuard);
}

function handleStart(message) {
  assertMessageIdentity(message, "start");
  if (message.revision !== WORLD_V0_EXPECTED_SERVER_REVISION) throw new Error(`start server revision mismatch ${message.revision}`);
  const contract = assertSimulationContract(message.simulation, "start");
  if (!Number.isInteger(message.protocolStartTick) || !Number.isInteger(message.boundaryTick)) throw new Error("invalid start tick contract");
  if (message.boundaryTick !== 0 || message.state?.boundaryTick !== 0) throw new Error(`World V0 requires clean B(0), got ${message.boundaryTick}`);

  simulation = contract;
  destroyLocalState();
  intendedSelf.clear();
  peerRemote.clear();
  consumedByTick.clear();
  usedByTick.clear();
  diagnosticSamples.clear();
  pendingStateGuards.clear();
  protocolStartTick = message.protocolStartTick;
  buildArenaVisual(contract);
  const sim = createSimulationFromState(message.state);
  buildSpatialCues(message.state);
  createHistory(sim);
  compareStateGuard(0, message.state.stateGuard);
  updatePhaseFromStart(message, performance.now());
  if (!selfMesh) selfMesh = createPlayerMesh(true);
  if (!remoteMesh) remoteMesh = createPlayerMesh(false);
  sessionEnd = null;
  networkState = "live · Shared Yard V0";
  joystick.classList.add("active");
  cameraGimbal.classList.add("active");
  recordLifecycle("world-start", { protocolStartTick });
  clearNotice();
  syncMeshes();
}

function handleMessage(message) {
  if (message.type === "world_v0_welcome") {
    adoptIdentity(message, "welcome");
    simulation = assertSimulationContract(message.simulation, "welcome");
    selfSessionId = message.selfSessionId;
    selfNetEntityId = message.selfNetEntityId;
    selfSlot = message.slot;
    networkState = message.waitingForPeer ? "waiting for peer" : "peer joined";
    return;
  }
  if (message.type === "world_v0_roster") {
    assertMessageIdentity(message, "roster");
    const players = message.players || [];
    const remote = players.find((player) => player.sessionId !== selfSessionId);
    if (remote) {
      remoteSessionId = remote.sessionId;
      remoteNetEntityId = remote.netEntityId;
    }
    if (players.length === 2 && socket?.readyState === WebSocket.OPEN) {
      networkState = "both connected · ready";
      socket.send(JSON.stringify({ type: "world_v0_ready", ...identityFields() }));
    }
    return;
  }
  if (message.type === "world_v0_ready_ack") {
    assertMessageIdentity(message, "ready-ack");
    networkState = "ready · awaiting start";
    return;
  }
  if (message.type === "world_v0_start") return handleStart(message);
  if (message.type === "world_v0_peer_records") return handlePeerRecords(message);
  if (message.type === "world_v0_consumed") return handleConsumed(message);
  if (message.type === "world_v0_batch_ack") return classifyBatchAck(message);
  if (message.type === "world_v0_snapshot") return handleSnapshot(message);
  if (message.type === "world_v0_pong") {
    assertMessageIdentity(message, "pong");
    updatePhaseFromPong(message, performance.now());
    return;
  }
  if (message.type === "world_v0_epoch_ended") {
    assertMessageIdentity(message, "epoch-ended");
    playing = false;
    sessionEnd = {
      kind: "epoch-ended",
      reason: message.reason,
      boundaryTick: message.boundaryTick ?? localState?.boundaryTick ?? null,
      at: new Date().toISOString(),
    };
    networkState = `epoch ended · ${message.reason}`;
    joystick.classList.remove("active");
    cameraGimbal.classList.remove("active");
    recordLifecycle("epoch-ended", { reason: message.reason, boundaryTick: message.boundaryTick ?? null });
    showNotice(`Shared Yard round ended: ${message.reason}. Restart when ready.`);
    persistLastSessionEvidence("epoch-ended");
    updateProductStatus();
    return;
  }
  if (message.type === "world_v0_error") {
    if (identity && message.worldEpoch) assertMessageIdentity(message, "server-error");
    throw new Error(`World V0 server: ${message.error}`);
  }
}

function candidateError(error) {
  if (runtimeFailed) return;
  runtimeFailed = true;
  playing = false;
  const text = error instanceof Error ? error.message : String(error);
  runtimeFailureReason = text;
  runtimeFailureAt = new Date().toISOString();
  sessionEnd = { kind: "runtime-failure", reason: text, at: runtimeFailureAt, boundaryTick: localState?.boundaryTick ?? null };
  recordLifecycle("runtime-failure", { reason: text });
  networkState = "FOUNDATION / runtime failure";
  showNotice(text);
  console.error(error);
  persistLastSessionEvidence("runtime-failure");
  try { socket?.close(1011, "world_v0_candidate_error"); } catch { /* close race */ }
}

function connect() {
  networkState = "connecting";
  socket = new WebSocket(socketUrl());
  socket.addEventListener("open", () => {
    networkState = "syncing";
    recordLifecycle("socket-open");
    sendPing();
    pingTimer = setInterval(sendPing, PING_INTERVAL_MS);
    hudTimer = setInterval(updateHud, HUD_INTERVAL_MS);
  });
  socket.addEventListener("message", (event) => {
    if (typeof event.data !== "string") return;
    try {
      handleMessage(JSON.parse(event.data));
      updateProductStatus();
    } catch (error) { candidateError(error); }
  });
  socket.addEventListener("close", (event) => {
    playing = false;
    if (pingTimer) clearInterval(pingTimer);
    if (hudTimer) clearInterval(hudTimer);
    pingTimer = null;
    hudTimer = null;
    pendingPings.clear();
    const expectedAfterEpochEnd = sessionEnd?.kind === "epoch-ended";
    if (!sessionEnd) {
      sessionEnd = {
        kind: "transport-close",
        reason: event.reason || `close-${event.code}`,
        code: event.code,
        at: new Date().toISOString(),
        boundaryTick: localState?.boundaryTick ?? null,
      };
    }
    networkState = `closed ${event.code}`;
    joystick.classList.remove("active");
    cameraGimbal.classList.remove("active");
    cameraGimbalInput = { x: 0, y: 0 };
    cameraGimbalKnob.style.transform = "translate(0, 0)";
    recordLifecycle("socket-close", { code: event.code, reason: event.reason || null, wasClean: event.wasClean, expectedAfterEpochEnd });
    persistLastSessionEvidence("socket-close");
    updateProductStatus();
    if (!runtimeFailed) showNotice("Shared Yard round ended. Restart when ready; the next round uses a fresh world epoch.");
  });
  socket.addEventListener("error", () => {
    networkState = "network error";
    recordLifecycle("socket-error");
  });
}

function advancePrediction() {
  if (!localState || !phaseAnchor || runtimeFailed) return;
  const estimate = authorityTickEstimate();
  if (!Number.isFinite(estimate)) return;
  const targetBoundary = Math.max(0, Math.floor(estimate + simulation.timing.predictionLeadTicks));
  let steps = 0;
  while (localState.boundaryTick < targetBoundary && steps < MAX_PREDICTION_STEPS_PER_FRAME) {
    managedPhysicsStep(localState.boundaryTick, true);
    trimHistory();
    steps += 1;
  }
  if (localState.boundaryTick < targetBoundary - MAX_PREDICTION_STEPS_PER_FRAME) networkState = "prediction backlog";
}

function syncPresence(mesh, position) {
  const ring = mesh?.userData?.presenceRing;
  if (ring) ring.position.set(position[0], 0.024, position[2]);
}

function syncMeshes() {
  if (!localState?.sim || !selfSessionId || !remoteSessionId) return;
  if (!selfMesh) selfMesh = createPlayerMesh(true);
  if (!remoteMesh) remoteMesh = createPlayerMesh(false);
  const selfBody = localState.sim.actorBodies.get(selfSessionId);
  const remoteBody = localState.sim.actorBodies.get(remoteSessionId);
  if (selfBody) {
    const position = bodyPosition(selfBody);
    selfMesh.position.fromArray(position);
    selfMesh.quaternion.fromArray(bodyRotation(selfBody)).normalize();
    syncPresence(selfMesh, position);
  }
  if (remoteBody) {
    const position = bodyPosition(remoteBody);
    remoteMesh.position.fromArray(position);
    remoteMesh.quaternion.fromArray(bodyRotation(remoteBody)).normalize();
    syncPresence(remoteMesh, position);
  }
  for (const [id, body] of localState.sim.propBodies) {
    const mesh = getPropMesh(id);
    mesh.position.fromArray(bodyPosition(body));
    mesh.quaternion.fromArray(bodyRotation(body)).normalize();
  }
}

function cameraPresetName() {
  return portraitViewport() ? "portrait-orbit" : "desktop-orbit";
}

function updateCameraProjection() {
  const clip = cameraClipPlanes(cameraOrbit.distance);
  const fogRange = cameraFogRange(cameraOrbit.distance);
  let projectionChanged = false;
  if (Math.abs(camera.near - clip.near) > 1e-9) { camera.near = clip.near; projectionChanged = true; }
  if (Math.abs(camera.far - clip.far) > 1e-6) { camera.far = clip.far; projectionChanged = true; }
  if (projectionChanged) camera.updateProjectionMatrix();
  if (scene.fog) {
    scene.fog.near = fogRange.near;
    scene.fog.far = fogRange.far;
  }
}

function updateCamera() {
  if (!selfMesh) return;
  updateCameraProjection();
  const offset = orbitOffset(cameraOrbit);
  const targetY = selfMesh.position.y + 0.42;
  camera.position.set(selfMesh.position.x + offset[0], targetY + offset[1], selfMesh.position.z + offset[2]);
  camera.lookAt(selfMesh.position.x, targetY, selfMesh.position.z);
}

function recordFrame(now) {
  if (document.visibilityState !== "visible") {
    lastFrameAt = null;
    return;
  }
  if (lastFrameAt === null) {
    lastFrameAt = now;
    return;
  }
  const delta = Math.max(0, now - lastFrameAt);
  lastFrameAt = now;
  pushBounded(frameSamples, delta, FRAME_RETAIN);
  metrics.maxFrameMs = Math.max(metrics.maxFrameMs, delta);
  if (delta >= LONG_FRAME_MS) {
    metrics.longFrames += 1;
    pushBounded(longFrameEvents, {
      at: new Date().toISOString(),
      deltaMs: delta,
      boundaryTick: localState?.boundaryTick ?? null,
      correctionWindowActive: performance.now() < correctionFrameWindowUntil,
      corrections: metrics.corrections,
      maxCorrectionDurationMs: metrics.maxCorrectionDurationMs,
      serverLate: metrics.serverLate,
      rttMedianMs: percentile(rttSamples, 0.5),
      rttP95Ms: percentile(rttSamples, 0.95),
    }, LONG_FRAME_RETAIN);
  }
}
function buildEvidence() {
  const clip = cameraClipPlanes(cameraOrbit.distance);
  return {
    generatedAt: new Date().toISOString(),
    uiRevision: WORLD_V0_BROWSER_UI_REVISION,
    clientSimRevision: WORLD_V0_CLIENT_SIM_REVISION,
    expectedSimBuildId: WORLD_V0_EXPECTED_SIM_BUILD_ID,
    identity: identity ? { ...identity } : null,
    runKey,
    networkState,
    runtimeFailed,
    runtimeFailureReason,
    runtimeFailureAt,
    localBoundaryTick: localState?.boundaryTick ?? null,
    protocolStartTick,
    presentation: {
      selfPresence: selfMesh?.userData?.presenceLabel?.userData?.presenceText || null,
      remotePresence: remoteMesh?.userData?.presenceLabel?.userData?.presenceText || null,
      spatialCueCount,
      cameraPreset: cameraPresetName(),
      cameraFov: camera.fov,
      cameraNear: camera.near,
      cameraFar: camera.far,
      cameraClipTarget: clip,
      cameraControlRevision: WORLD_V0_PLAYABLE_CONTROL_REVISION,
      cameraOrbit: {
        yaw: cameraOrbit.yaw,
        pitch: cameraOrbit.pitch,
        distance: cameraOrbit.distance,
        userAdjusted: cameraOrbit.userAdjusted,
      },
      cameraControls: { drag: true, pinchZoom: true, gimbal: true, wheelZoom: true, invertYDefault: WORLD_V0_CAMERA_CONTROL.invertYDefault, zoomMode: "multiplicative-v1" },
      cameraGimbalInput: { ...cameraGimbalInput },
      movementMapping: "camera-relative-v1",
      rawInput: rawCurrentInput(),
      worldInputPreview: currentInput(),
    },
    session: {
      inviteUrl: buildInviteUrl(),
      restartAvailable: canRestartRound(),
      end: sessionEnd ? { ...sessionEnd } : null,
    },
    metrics: JSON.parse(JSON.stringify(metrics)),
    rtt: {
      samples: rttSamples.length,
      medianMs: percentile(rttSamples, 0.5),
      p95Ms: percentile(rttSamples, 0.95),
    },
    frame: {
      samples: frameSamples.length,
      p95Ms: percentile(frameSamples, 0.95),
      maxMs: metrics.maxFrameMs,
      longFrames: metrics.longFrames,
      correctionWindowActive: performance.now() < correctionFrameWindowUntil,
      longFrameEvents: longFrameEvents.map((event) => ({ ...event })),
    },
    lifecycleEvents: lifecycleEvents.map((event) => ({ ...event })),
    corrections: correctionEvents.map((event) => ({ ...event })),
    pendingStateGuardBoundaries: [...pendingStateGuards.keys()],
    historySegments: localState?.history?.segments?.map((segment) => ({
      startTick: segment.startTick,
      validEndTick: segment.validEndTick,
      generation: segment.generation,
      bytes: segment.bytes,
    })) ?? [],
  };
}
function persistLastSessionEvidence(reason) {
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
addEventListener("pagehide", () => persistLastSessionEvidence("pagehide"));
document.addEventListener("visibilitychange", () => {
  const now = performance.now();
  recordLifecycle("visibility", { state: document.visibilityState, elapsedSincePreviousMs: Math.max(0, now - visibilityTransitionAt) });
  visibilityTransitionAt = now;
  lastFrameAt = null;
});
window.__sharedYardV0Session = () => ({
  inviteUrl: buildInviteUrl(),
  restartAvailable: canRestartRound(),
  runKey: sessionRunKey(),
  networkState,
});

function productStatusText() {
  if (runtimeFailed) return "Runtime problem · open Diagnostics";
  if (networkState === "waiting for peer") return "Waiting for peer · use the same Run key";
  if (networkState === "peer joined" || networkState === "both connected · ready" || networkState === "ready · awaiting start") return "Peer found · synchronizing Shared Yard";
  if (networkState.startsWith("live")) return "Shared Yard live · move · drag to look · interact";
  if (networkState === "connecting" || networkState === "syncing") return "Connecting to Shared Yard…";
  if (networkState.startsWith("closed")) return "Round ended · restart when ready";
  if (networkState.startsWith("epoch ended")) return "Round ending · preparing fresh epoch";
  if (networkState === "prediction backlog") return "Catching up…";
  return "Ready · share the same Run key with another player";
}

function updateProductStatus() {
  updateSessionActions();
  if (!boot.classList.contains("compact")) return;
  bootTitle.textContent = "Shared Yard";
  bootStatus.textContent = productStatusText();
}

function updateHud() {
  metric.net.textContent = networkState;
  metric.ticks.textContent = localState ? `B(${localState.boundaryTick}) · start ${protocolStartTick ?? "—"}` : "—";
  metric.guard.textContent = `${metrics.guardMatches} exact · ${metrics.guardMismatches} fail · ${metrics.guardPending} pending`;
  metric.corrections.textContent = String(metrics.corrections);
  metric.rewind.textContent = `${metrics.latestRewind} / ${metrics.maxRewind}`;
  metric.replay.textContent = `${metrics.latestReplaySteps} / ${metrics.maxReplaySteps}`;
  metric.rtt.textContent = rttSamples.length ? `${percentile(rttSamples, 0.5).toFixed(1)} ms med` : "—";
  metric.lease.textContent = `${metrics.leaseExpiredSeen} expired · late ${metrics.serverLate}`;
  metric.memory.textContent = formatBytes(metrics.maxRetainedBytes);
  metric.frame.textContent = frameSamples.length ? `${percentile(frameSamples, 0.95).toFixed(1)} ms p95 · ${metrics.maxFrameMs.toFixed(1)} max` : "—";
  updateProductStatus();
}

function resetProtocolState() {
  destroyLocalState();
  intendedSelf.clear();
  peerRemote.clear();
  consumedByTick.clear();
  usedByTick.clear();
  diagnosticSamples.clear();
  pendingStateGuards.clear();
  correctionEvents.splice(0);
  longFrameEvents.splice(0);
  lifecycleEvents.splice(0);
  frameSamples.splice(0);
  rttSamples.splice(0);
  pendingBatch = [];
  batchSeq = 0;
  identity = null;
  selfSessionId = null;
  remoteSessionId = null;
  selfNetEntityId = null;
  remoteNetEntityId = null;
  selfSlot = null;
  protocolStartTick = null;
  simulation = null;
  phaseAnchor = null;
  lastFrameAt = null;
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
  runtimeFailed = false;
  runtimeFailureReason = null;
  runtimeFailureAt = null;
  sessionEnd = null;
  visibilityTransitionAt = performance.now();
  Object.assign(metrics, {
    corrections: 0,
    latestRewind: 0,
    maxRewind: 0,
    latestReplaySteps: 0,
    maxReplaySteps: 0,
    maxCorrectionDurationMs: 0,
    maxRetainedBytes: 0,
    generationRotations: 0,
    remapFailures: 0,
    guardMatches: 0,
    guardMismatches: 0,
    guardPending: 0,
    firstStateMismatch: null,
    leaseExpiredSeen: 0,
    serverLate: 0,
    serverRejected: 0,
    latestCorrection: { self: 0, remote: 0, prop: 0 },
    maxCorrection: { self: 0, remote: 0, prop: 0 },
    maxFrameMs: 0,
    longFrames: 0,
  });
  clearWorldVisuals();
}

function enterWorld() {
  callsign = callsignInput.value.trim();
  runKey = runInput.value.trim();
  if (!PLAYER_ID_PATTERN.test(callsign)) {
    showNotice("Callsign: 1–24 znaków A-Z, a-z, 0-9, _ lub -.");
    return;
  }
  if (!RUN_KEY_PATTERN.test(runKey)) {
    showNotice("Run key: 1–20 znaków A-Z, a-z, 0-9, _ lub -.");
    return;
  }
  localStorage.setItem("shared-yard-v0-callsign", callsign);
  localStorage.setItem("shared-yard-v0-run", runKey);
  const shareUrl = new URL(location.href);
  shareUrl.search = "";
  shareUrl.hash = "";
  shareUrl.searchParams.set("run", runKey);
  history.replaceState(null, "", shareUrl);
  resetProtocolState();
  clearNotice();
  playing = true;
  boot.classList.add("compact");
  bootTitle.textContent = "Shared Yard";
  networkState = "connecting";
  updateProductStatus();
  connect();
}

enterButton.addEventListener("click", enterWorld);
copyInviteButton.addEventListener("click", async () => {
  const text = buildInviteUrl();
  try {
    await navigator.clipboard.writeText(text);
    copyInviteButton.textContent = "Invite copied";
    setTimeout(() => { copyInviteButton.textContent = "Copy invite"; }, 1200);
  } catch {
    console.log(`Shared Yard invite: ${text}`);
    showNotice("Clipboard unavailable; invite link written to console.");
  }
});
restartRoundButton.addEventListener("click", () => {
  if (!canRestartRound()) return;
  enterWorld();
});
copyEvidenceButton.addEventListener("click", async () => {
  const text = JSON.stringify(buildEvidence(), null, 2);
  try {
    await navigator.clipboard.writeText(text);
    copyEvidenceButton.textContent = "Copied";
    setTimeout(() => { copyEvidenceButton.textContent = "Copy evidence"; }, 1000);
  } catch {
    console.log(text);
    showNotice("Clipboard unavailable; evidence written to console.");
  }
});

addEventListener("keydown", (event) => {
  if (!movementCodes.has(event.code)) return;
  keys.add(event.code);
  event.preventDefault();
});
addEventListener("keyup", (event) => {
  if (!movementCodes.has(event.code)) return;
  keys.delete(event.code);
  event.preventDefault();
});
addEventListener("blur", () => keys.clear());

function updateJoystick(event) {
  const rect = joystick.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  let dx = (event.clientX - cx) / (rect.width * 0.36);
  let dy = (event.clientY - cy) / (rect.height * 0.36);
  const length = Math.hypot(dx, dy);
  if (length > 1) { dx /= length; dy /= length; }
  touchInput = { x: dx, z: dy };
  joystickKnob.style.transform = `translate(${dx * 34}px, ${dy * 34}px)`;
}

joystick.addEventListener("pointerdown", (event) => {
  joystickPointer = event.pointerId;
  joystick.setPointerCapture(event.pointerId);
  updateJoystick(event);
});
joystick.addEventListener("pointermove", (event) => {
  if (event.pointerId !== joystickPointer) return;
  updateJoystick(event);
});
function releaseJoystick(event) {
  if (event.pointerId !== joystickPointer) return;
  joystickPointer = null;
  touchInput = zeroInput();
  joystickKnob.style.transform = "translate(0, 0)";
}
joystick.addEventListener("pointerup", releaseJoystick);
joystick.addEventListener("pointercancel", releaseJoystick);
joystick.addEventListener("lostpointercapture", releaseJoystick);

function cameraTouchSpan() {
  const points = [...cameraTouchPointers.values()];
  if (points.length < 2) return 0;
  return Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
}

function beginCameraPointer(event) {
  if (!playing) return;
  if (event.pointerType === "touch") {
    cameraTouchPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    try { renderer.domElement.setPointerCapture(event.pointerId); } catch { /* browser may not expose capture */ }
    if (cameraTouchPointers.size === 1) {
      cameraOrbit.pointerId = event.pointerId;
      cameraOrbit.lastX = event.clientX;
      cameraOrbit.lastY = event.clientY;
      cameraPinch = null;
    } else if (cameraTouchPointers.size === 2) {
      cameraOrbit.pointerId = null;
      cameraPinch = { startSpan: cameraTouchSpan(), startDistance: cameraOrbit.distance };
    }
    event.preventDefault();
    return;
  }
  if (cameraOrbit.pointerId !== null) return;
  if (event.pointerType === "mouse" && event.button !== 0 && event.button !== 2) return;
  cameraOrbit.pointerId = event.pointerId;
  cameraOrbit.lastX = event.clientX;
  cameraOrbit.lastY = event.clientY;
  try { renderer.domElement.setPointerCapture(event.pointerId); } catch { /* browser may not expose capture */ }
  event.preventDefault();
}

function moveCameraPointer(event) {
  if (event.pointerType === "touch" && cameraTouchPointers.has(event.pointerId)) {
    cameraTouchPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (cameraTouchPointers.size >= 2) {
      if (!cameraPinch) cameraPinch = { startSpan: cameraTouchSpan(), startDistance: cameraOrbit.distance };
      cameraOrbit.distance = pinchZoomDistance(cameraPinch.startDistance, cameraPinch.startSpan, cameraTouchSpan());
      cameraOrbit.userAdjusted = true;
      event.preventDefault();
      return;
    }
  }
  if (event.pointerId !== cameraOrbit.pointerId) return;
  const dx = event.clientX - cameraOrbit.lastX;
  const dy = event.clientY - cameraOrbit.lastY;
  cameraOrbit.lastX = event.clientX;
  cameraOrbit.lastY = event.clientY;
  const next = dragOrbit(cameraOrbit, dx, dy);
  cameraOrbit.yaw = next.yaw;
  cameraOrbit.pitch = next.pitch;
  cameraOrbit.distance = next.distance;
  cameraOrbit.userAdjusted = true;
  event.preventDefault();
}

function endCameraPointer(event) {
  if (event.pointerType === "touch" && cameraTouchPointers.has(event.pointerId)) {
    cameraTouchPointers.delete(event.pointerId);
    try { renderer.domElement.releasePointerCapture(event.pointerId); } catch { /* capture may already be gone */ }
    cameraPinch = null;
    const remaining = [...cameraTouchPointers.entries()][0];
    if (remaining) {
      cameraOrbit.pointerId = remaining[0];
      cameraOrbit.lastX = remaining[1].x;
      cameraOrbit.lastY = remaining[1].y;
    } else {
      cameraOrbit.pointerId = null;
    }
    event.preventDefault();
    return;
  }
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
  cameraOrbit.distance = wheelZoomDistance(cameraOrbit.distance, event.deltaY);
  cameraOrbit.userAdjusted = true;
  event.preventDefault();
}, { passive: false });
renderer.domElement.addEventListener("dblclick", (event) => {
  if (!playing) return;
  resetCameraOrbit();
  event.preventDefault();
});

function updateCameraGimbal(event) {
  const rect = cameraGimbal.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  let dx = (event.clientX - cx) / (rect.width * 0.38);
  let dy = (event.clientY - cy) / (rect.height * 0.38);
  const length = Math.hypot(dx, dy);
  if (length > 1) { dx /= length; dy /= length; }
  cameraGimbalInput = { x: dx, y: dy };
  cameraGimbalKnob.style.transform = `translate(${dx * 25}px, ${dy * 25}px)`;
}

cameraGimbal.addEventListener("pointerdown", (event) => {
  if (!playing || cameraGimbalPointer !== null) return;
  cameraGimbalPointer = event.pointerId;
  try { cameraGimbal.setPointerCapture(event.pointerId); } catch { /* browser may not expose capture */ }
  updateCameraGimbal(event);
  event.preventDefault();
});
cameraGimbal.addEventListener("pointermove", (event) => {
  if (event.pointerId !== cameraGimbalPointer) return;
  updateCameraGimbal(event);
  event.preventDefault();
});
function releaseCameraGimbal(event) {
  if (event.pointerId !== cameraGimbalPointer) return;
  cameraGimbalPointer = null;
  cameraGimbalInput = { x: 0, y: 0 };
  cameraGimbalKnob.style.transform = "translate(0, 0)";
  event.preventDefault();
}
cameraGimbal.addEventListener("pointerup", releaseCameraGimbal);
cameraGimbal.addEventListener("pointercancel", releaseCameraGimbal);
cameraGimbal.addEventListener("lostpointercapture", releaseCameraGimbal);

function advanceCameraGimbal(now) {
  if (lastCameraControlAt === null) {
    lastCameraControlAt = now;
    return;
  }
  const dt = Math.min(0.05, Math.max(0, (now - lastCameraControlAt) / 1000));
  lastCameraControlAt = now;
  if (!playing || Math.hypot(cameraGimbalInput.x, cameraGimbalInput.y) < 1e-6) return;
  const next = clampOrbit({
    yaw: cameraOrbit.yaw - cameraGimbalInput.x * WORLD_V0_CAMERA_CONTROL.gimbalYawRadiansPerSecond * dt,
    pitch: cameraOrbit.pitch - cameraGimbalInput.y * WORLD_V0_CAMERA_CONTROL.gimbalPitchRadiansPerSecond * dt,
    distance: cameraOrbit.distance,
  });
  cameraOrbit.yaw = next.yaw;
  cameraOrbit.pitch = next.pitch;
  cameraOrbit.distance = next.distance;
  cameraOrbit.userAdjusted = true;
}
function resize() {
  const portrait = portraitViewport();
  if (!cameraOrbit.userAdjusted) resetCameraOrbit();
  camera.aspect = innerWidth / innerHeight;
  camera.fov = portrait ? 62 : 55;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.setSize(innerWidth, innerHeight);
}
addEventListener("resize", resize);
resize();

function frame(now) {
  requestAnimationFrame(frame);
  recordFrame(now);
  advanceCameraGimbal(now);
  if (playing && !runtimeFailed) {
    try {
      advancePrediction();
      syncMeshes();
    } catch (error) {
      candidateError(error);
    }
  }
  updateCamera();
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);
updateHud();
