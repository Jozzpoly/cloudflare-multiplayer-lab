import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.185.1/build/three.module.js";

const CLIENT_REVISION = "ws0-a2r-local-box3d-v1";
const BOX3D_URL = "https://cdn.jsdelivr.net/npm/box3d.js@0.1.1/dist/box3d.inline.mjs";
const INPUT_INTERVAL_MS = 66;
const PING_INTERVAL_MS = 2000;
const HUD_INTERVAL_MS = 250;
const SAMPLE_LIMIT = 180;
const PLAYER_ACCELERATION = 28;
const PLAYER_DECELERATION = 36;
const FIXED_DT = 1 / 60;
const MAX_LOCAL_STEPS_PER_FRAME = 8;
const SETTLED_AFTER_MS = 500;
const DESYNC_WARN_DISTANCE = 0.5;
const DESYNC_WARN_SNAPSHOTS = 3;
const EPS = 1e-9;

const viewport = document.querySelector("#viewport");
const boot = document.querySelector("#boot");
const callsignInput = document.querySelector("#callsign");
const enterButton = document.querySelector("#enter");
const bootStatus = document.querySelector("#boot-status");
const hud = document.querySelector("#hud");
const controls = document.querySelector("#controls");
const notice = document.querySelector("#notice");
const netEl = document.querySelector("#net");
const metricIds = [
  "m-rtt",
  "m-player-delta",
  "m-prop-delta",
  "m-settled",
  "m-gap",
  "m-age",
  "m-tick",
  "m-scheduler",
  "m-ack",
  "m-local",
  "m-fps",
];
const metrics = Object.fromEntries(metricIds.map((id) => [id, document.querySelector(`#${id}`)]));
const required = [viewport, boot, callsignInput, enterButton, bootStatus, hud, controls, notice, netEl, ...Object.values(metrics)];
if (required.some((value) => !value)) throw new Error("WS0 A2R UI incomplete");

enterButton.disabled = true;
enterButton.textContent = "Loading physics…";
bootStatus.textContent = `client ${CLIENT_REVISION}`;

let b3 = null;
try {
  const module = await import(BOX3D_URL);
  b3 = await module.default();
  enterButton.disabled = false;
  enterButton.textContent = "Enter A2R world";
  bootStatus.textContent = `client ${CLIENT_REVISION} · box3d.js 0.1.1 inline ready`;
} catch (error) {
  enterButton.textContent = "Box3D failed to load";
  bootStatus.textContent = error instanceof Error ? error.message : String(error);
  throw error;
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b1117);
scene.fog = new THREE.Fog(0x0b1117, 18, 46);

const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.05, 100);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
viewport.append(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xb8d8e4, 0x29313b, 2.0));
const sun = new THREE.DirectionalLight(0xffffff, 2.3);
sun.position.set(7, 13, 9);
scene.add(sun);

const floor = new THREE.Mesh(
  new THREE.BoxGeometry(20, 1, 20),
  new THREE.MeshStandardMaterial({ color: 0x25313a, roughness: 0.92, metalness: 0.02 }),
);
floor.position.y = -0.5;
scene.add(floor);

const grid = new THREE.GridHelper(20, 20, 0x50707c, 0x31434b);
grid.position.y = 0.006;
scene.add(grid);

const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x384650, roughness: 0.84 });
function addWall(x, y, z, sx, sy, sz) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), wallMaterial);
  mesh.position.set(x, y, z);
  scene.add(mesh);
}
addWall(-9.5, 1.5, 0, 1, 4, 20);
addWall(9.5, 1.5, 0, 1, 4, 20);
addWall(0, 1.5, -9.5, 20, 4, 1);
addWall(0, 1.5, 9.5, 20, 4, 1);

const propGeometry = new THREE.BoxGeometry(0.92, 0.92, 0.92);
const propMaterial = new THREE.MeshStandardMaterial({ color: 0xb68a55, roughness: 0.74 });
const selfMaterial = new THREE.MeshStandardMaterial({ color: 0x78d8c2, roughness: 0.56 });

const propMeshes = new Map();
let selfMesh = null;
const keys = new Set();
const rttSamples = [];
const playerDeltaSamples = [];
const propDeltaSamples = [];
const settledPlayerSamples = [];
const settledPropSamples = [];
const snapshotGapSamples = [];
const fpsSamples = [];
const pendingPings = new Map();

let socket = null;
let playing = false;
let reconnectTimer = null;
let inputTimer = null;
let pingTimer = null;
let hudTimer = null;
let selfSessionId = null;
let simulation = { simulationHz: 60, snapshotHz: 10, substeps: 4, inputLeaseMs: 600, playerSpeed: 5.2 };
let inputSeq = 0;
let latestAck = 0;
let latestTelemetry = null;
let lastSnapshotAt = null;
let lastSnapshotAgeMs = null;
let serverClockOffsetMs = null;
let lastFrameAt = performance.now();
let frameCounterStartedAt = performance.now();
let frameCounter = 0;
let lastSentInput = null;
let lastIntentChangeSeq = 0;
let lastIntentChangeAt = performance.now();
let settledDesyncStreak = 0;
let unsupportedMultiplayer = false;

const local = {
  world: null,
  playerBody: null,
  propBodies: new Map(),
  initialized: false,
  accumulator: 0,
  steps: 0,
  droppedSteps: 0,
};

const vec3Scratch = [0, 0, 0];
const quatScratch = [0, 0, 0, 1];
const cameraFocus = new THREE.Vector3();
const cameraDesired = new THREE.Vector3();
const storedCallsign = localStorage.getItem("ws0-callsign");
callsignInput.value = storedCallsign || `P-${crypto.randomUUID().slice(0, 6)}`;

function pushSample(target, value) {
  if (!Number.isFinite(value)) return;
  target.push(value);
  if (target.length > SAMPLE_LIMIT) target.splice(0, target.length - SAMPLE_LIMIT);
}

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1));
  return sorted[index];
}

function moveToward2(currentX, currentZ, targetX, targetZ, maxDelta) {
  const dx = targetX - currentX;
  const dz = targetZ - currentZ;
  const distance = Math.hypot(dx, dz);
  if (distance <= maxDelta || distance < EPS) return [targetX, targetZ];
  const scale = maxDelta / distance;
  return [currentX + dx * scale, currentZ + dz * scale];
}

function distance3(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function setNetwork(text, tone = "idle") {
  netEl.textContent = text;
  netEl.classList.toggle("live", tone === "live");
  netEl.classList.toggle("bad", tone === "bad");
}

function showNotice(text) {
  notice.textContent = text;
  notice.classList.remove("hidden");
}

function clearNotice() {
  notice.classList.add("hidden");
  notice.textContent = "";
}

function socketUrl() {
  const url = new URL("/world0/ws", location.href);
  url.protocol = location.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("player", callsignInput.value.trim());
  return url.toString();
}

function createPlayerMesh() {
  const group = new THREE.Group();
  const cylinder = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.9, 14), selfMaterial);
  const top = new THREE.Mesh(new THREE.SphereGeometry(0.35, 14, 10), selfMaterial);
  const bottom = new THREE.Mesh(new THREE.SphereGeometry(0.35, 14, 10), selfMaterial);
  top.position.y = 0.45;
  bottom.position.y = -0.45;
  group.add(cylinder, top, bottom);
  scene.add(group);
  return group;
}

function getPropMesh(id) {
  let mesh = propMeshes.get(id);
  if (!mesh) {
    mesh = new THREE.Mesh(propGeometry, propMaterial);
    scene.add(mesh);
    propMeshes.set(id, mesh);
  }
  return mesh;
}

function createStaticBox(world, position, halfExtents) {
  const bodyDef = b3.b3DefaultBodyDef();
  bodyDef.position = position;
  const body = b3.b3CreateBody(world, bodyDef);
  b3.b3CreateBoxShape(body, b3.b3DefaultShapeDef(), halfExtents[0], halfExtents[1], halfExtents[2]);
}

function destroyLocalWorld() {
  if (local.world) {
    try { b3.b3DestroyWorld(local.world); } catch { /* teardown-only */ }
  }
  local.world = null;
  local.playerBody = null;
  local.propBodies.clear();
  local.initialized = false;
  local.accumulator = 0;
  local.steps = 0;
  local.droppedSteps = 0;
  settledDesyncStreak = 0;
}

function seedLocalWorld(state) {
  destroyLocalWorld();
  const players = state?.players || [];
  const props = state?.props || [];
  const self = players.find((player) => player.sessionId === selfSessionId);
  if (!self) throw new Error("A2R welcome missing self player");
  if (players.some((player) => player.sessionId !== selfSessionId)) {
    unsupportedMultiplayer = true;
    throw new Error("A2R local-physics candidate is intentionally single-player only");
  }

  const worldDef = b3.b3DefaultWorldDef();
  worldDef.gravity = [0, -20, 0];
  const world = b3.b3CreateWorld(worldDef);
  local.world = world;

  createStaticBox(world, [0, -0.5, 0], [10, 0.5, 10]);
  createStaticBox(world, [-9.5, 1.5, 0], [0.5, 2, 10]);
  createStaticBox(world, [9.5, 1.5, 0], [0.5, 2, 10]);
  createStaticBox(world, [0, 1.5, -9.5], [10, 2, 0.5]);
  createStaticBox(world, [0, 1.5, 9.5], [10, 2, 0.5]);

  for (const prop of props) {
    const bodyDef = b3.b3DefaultBodyDef();
    bodyDef.type = b3.b3BodyType.b3_dynamicBody;
    bodyDef.position = [...(prop.position || [0, 0.46, 0])];
    bodyDef.rotation = [...(prop.rotation || [0, 0, 0, 1])];
    bodyDef.linearDamping = 0.08;
    bodyDef.angularDamping = 0.12;
    const body = b3.b3CreateBody(world, bodyDef);
    const shapeDef = b3.b3DefaultShapeDef();
    shapeDef.density = 22;
    shapeDef.baseMaterial.friction = 0.72;
    shapeDef.baseMaterial.restitution = 0.04;
    b3.b3CreateBoxShape(body, shapeDef, 0.46, 0.46, 0.46);
    local.propBodies.set(prop.id, body);
    getPropMesh(prop.id);
  }

  const playerDef = b3.b3DefaultBodyDef();
  playerDef.type = b3.b3BodyType.b3_dynamicBody;
  playerDef.position = [...(self.position || [-6.5, 0.82, -1.4])];
  playerDef.rotation = [...(self.rotation || [0, 0, 0, 1])];
  playerDef.linearDamping = 0.3;
  playerDef.angularDamping = 8;
  const playerBody = b3.b3CreateBody(world, playerDef);
  const playerShapeDef = b3.b3DefaultShapeDef();
  playerShapeDef.density = 80;
  playerShapeDef.baseMaterial.friction = 0.8;
  playerShapeDef.baseMaterial.restitution = 0.02;
  b3.b3CreateCapsuleShape(playerBody, playerShapeDef, {
    center1: [0, -0.45, 0],
    center2: [0, 0.45, 0],
    radius: 0.35,
  });
  b3.b3Body_SetMotionLocks(playerBody, {
    linearX: false,
    linearY: false,
    linearZ: false,
    angularX: true,
    angularY: true,
    angularZ: true,
  });
  if (Array.isArray(self.velocity) && self.velocity.length === 3) {
    b3.b3Body_SetLinearVelocity(playerBody, self.velocity);
  }
  local.playerBody = playerBody;
  local.initialized = true;
  local.accumulator = 0;

  if (!selfMesh) selfMesh = createPlayerMesh();
  syncMeshesFromPhysics();
}

function currentInput() {
  let x = 0;
  let z = 0;
  if (keys.has("KeyA") || keys.has("ArrowLeft")) x -= 1;
  if (keys.has("KeyD") || keys.has("ArrowRight")) x += 1;
  if (keys.has("KeyW") || keys.has("ArrowUp")) z -= 1;
  if (keys.has("KeyS") || keys.has("ArrowDown")) z += 1;
  const length = Math.hypot(x, z);
  if (length > 1) { x /= length; z /= length; }
  return { x, z };
}

function inputChanged(a, b) {
  return !a || !b || Math.abs(a.x - b.x) > EPS || Math.abs(a.z - b.z) > EPS;
}

function applyLocalPlayerInput() {
  if (!local.playerBody) return;
  const input = currentInput();
  const velocity = [0, 0, 0];
  b3.b3Body_GetLinearVelocity(velocity, local.playerBody);
  const hasInput = Math.hypot(input.x, input.z) > 0.01;
  const targetX = input.x * simulation.playerSpeed;
  const targetZ = input.z * simulation.playerSpeed;
  const acceleration = hasInput ? PLAYER_ACCELERATION : PLAYER_DECELERATION;
  const [nextX, nextZ] = moveToward2(velocity[0], velocity[2], targetX, targetZ, acceleration * FIXED_DT);
  b3.b3Body_SetLinearVelocity(local.playerBody, [nextX, velocity[1], nextZ]);
}

function stepLocalPhysics(frameDt) {
  if (!local.initialized || !local.world || unsupportedMultiplayer) return;
  local.accumulator += Math.min(frameDt, 0.25);
  let steps = 0;
  while (local.accumulator + EPS >= FIXED_DT && steps < MAX_LOCAL_STEPS_PER_FRAME) {
    applyLocalPlayerInput();
    b3.b3World_Step(local.world, FIXED_DT, simulation.substeps || 4);
    local.steps += 1;
    steps += 1;
    local.accumulator -= FIXED_DT;
  }
  if (local.accumulator >= FIXED_DT) {
    const dropped = Math.floor(local.accumulator / FIXED_DT);
    local.droppedSteps += dropped;
    local.accumulator -= dropped * FIXED_DT;
  }
}

function bodyPosition(body) {
  const out = [0, 0, 0];
  b3.b3Body_GetPosition(out, body);
  return out;
}

function syncMeshesFromPhysics() {
  if (!local.initialized || !local.playerBody) return;
  b3.b3Body_GetPosition(vec3Scratch, local.playerBody);
  b3.b3Body_GetRotation(quatScratch, local.playerBody);
  selfMesh.position.fromArray(vec3Scratch);
  selfMesh.quaternion.fromArray(quatScratch).normalize();

  for (const [id, body] of local.propBodies) {
    const mesh = getPropMesh(id);
    b3.b3Body_GetPosition(vec3Scratch, body);
    b3.b3Body_GetRotation(quatScratch, body);
    mesh.position.fromArray(vec3Scratch);
    mesh.quaternion.fromArray(quatScratch).normalize();
  }
}

function sampleAuthorityDivergence(state) {
  if (!local.initialized || !local.playerBody || unsupportedMultiplayer) return;
  const players = state.players || [];
  if (players.some((player) => player.sessionId !== selfSessionId)) {
    unsupportedMultiplayer = true;
    showNotice("A2R candidate stopped: a second interactive player joined. This gate is intentionally single-player.");
    setNetwork("multiplayer outside gate", "bad");
    return;
  }

  const self = players.find((player) => player.sessionId === selfSessionId);
  if (!self) return;
  latestAck = Number.isFinite(self.ack) ? self.ack : latestAck;

  const localPlayer = bodyPosition(local.playerBody);
  const playerDelta = distance3(localPlayer, self.position || [0, 0, 0]);
  let maxPropDelta = 0;
  for (const prop of state.props || []) {
    const body = local.propBodies.get(prop.id);
    if (!body) continue;
    maxPropDelta = Math.max(maxPropDelta, distance3(bodyPosition(body), prop.position || [0, 0, 0]));
  }
  pushSample(playerDeltaSamples, playerDelta);
  pushSample(propDeltaSamples, maxPropDelta);

  const input = currentInput();
  const noInput = Math.hypot(input.x, input.z) <= 0.01;
  const intentAcknowledged = latestAck >= lastIntentChangeSeq;
  const quietLongEnough = performance.now() - lastIntentChangeAt >= SETTLED_AFTER_MS;
  if (noInput && intentAcknowledged && quietLongEnough) {
    pushSample(settledPlayerSamples, playerDelta);
    pushSample(settledPropSamples, maxPropDelta);
    if (playerDelta > DESYNC_WARN_DISTANCE || maxPropDelta > DESYNC_WARN_DISTANCE) settledDesyncStreak += 1;
    else settledDesyncStreak = 0;
    if (settledDesyncStreak >= DESYNC_WARN_SNAPSHOTS) {
      showNotice(`Divergence warning: settled local↔authority delta ${playerDelta.toFixed(2)} player / ${maxPropDelta.toFixed(2)} prop. No correction applied.`);
    }
  }
}

function handleMessage(message) {
  if (message.type === "welcome") {
    selfSessionId = message.selfSessionId;
    simulation = { ...simulation, ...(message.simulation || {}) };
    if (simulation.simulationHz !== 60 || simulation.substeps !== 4) {
      throw new Error(`A2R contract mismatch: expected 60 Hz / 4 substeps, got ${simulation.simulationHz} / ${simulation.substeps}`);
    }
    latestTelemetry = message.state?.telemetry || latestTelemetry;
    seedLocalWorld(message.state);
    setNetwork("live · local physics", "live");
    clearNotice();
    return;
  }
  if (message.type === "snapshot") {
    const receivedAt = performance.now();
    if (lastSnapshotAt !== null) pushSample(snapshotGapSamples, receivedAt - lastSnapshotAt);
    lastSnapshotAt = receivedAt;
    latestTelemetry = message.telemetry || latestTelemetry;
    if (serverClockOffsetMs !== null && Number.isFinite(message.serverTime)) {
      lastSnapshotAgeMs = Math.max(0, Date.now() + serverClockOffsetMs - message.serverTime);
    }
    sampleAuthorityDivergence(message);
    return;
  }
  if (message.type === "pong") {
    const pending = pendingPings.get(message.id);
    if (!pending) return;
    pendingPings.delete(message.id);
    const rtt = performance.now() - pending.perf;
    pushSample(rttSamples, rtt);
    const offset = message.serverTime - (pending.wall + rtt / 2);
    serverClockOffsetMs = serverClockOffsetMs === null ? offset : serverClockOffsetMs * 0.82 + offset * 0.18;
    return;
  }
  if (message.type === "error") showNotice(`Server: ${message.error}`);
}

function connect() {
  if (!playing || (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING))) return;
  setNetwork("connecting");
  socket = new WebSocket(socketUrl());
  socket.addEventListener("open", () => {
    setNetwork("syncing");
    startNetworkLoops();
  });
  socket.addEventListener("message", (event) => {
    if (typeof event.data !== "string") return;
    try { handleMessage(JSON.parse(event.data)); }
    catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      showNotice(text);
      setNetwork("candidate error", "bad");
      socket?.close(1011, "a2r_candidate_error");
    }
  });
  socket.addEventListener("close", () => {
    stopNetworkLoops();
    socket = null;
    selfSessionId = null;
    destroyLocalWorld();
    unsupportedMultiplayer = false;
    setNetwork("reconnecting", "bad");
    if (playing && !reconnectTimer) {
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, 1200);
    }
  });
  socket.addEventListener("error", () => setNetwork("network error", "bad"));
}

function sendInput() {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  const input = currentInput();
  inputSeq += 1;
  if (inputChanged(lastSentInput, input)) {
    lastIntentChangeSeq = inputSeq;
    lastIntentChangeAt = performance.now();
    lastSentInput = { ...input };
    settledDesyncStreak = 0;
  }
  socket.send(JSON.stringify({ type: "input", seq: inputSeq, x: input.x, z: input.z }));
}

function sendPing() {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  const id = crypto.randomUUID();
  pendingPings.set(id, { perf: performance.now(), wall: Date.now() });
  socket.send(JSON.stringify({ type: "ping", id }));
  if (pendingPings.size > 8) pendingPings.delete(pendingPings.keys().next().value);
}

function startNetworkLoops() {
  stopNetworkLoops();
  sendInput();
  sendPing();
  inputTimer = setInterval(sendInput, INPUT_INTERVAL_MS);
  pingTimer = setInterval(sendPing, PING_INTERVAL_MS);
  hudTimer = setInterval(updateHud, HUD_INTERVAL_MS);
}

function stopNetworkLoops() {
  if (inputTimer) clearInterval(inputTimer);
  if (pingTimer) clearInterval(pingTimer);
  if (hudTimer) clearInterval(hudTimer);
  inputTimer = pingTimer = hudTimer = null;
  pendingPings.clear();
}

function updateCamera(dt) {
  if (!selfMesh) return;
  cameraFocus.copy(selfMesh.position);
  cameraFocus.y += 0.45;
  cameraDesired.set(selfMesh.position.x + 7.2, selfMesh.position.y + 6.2, selfMesh.position.z + 8.4);
  const alpha = 1 - Math.exp(-5.5 * dt);
  camera.position.lerp(cameraDesired, alpha);
  camera.lookAt(cameraFocus);
}

function formatPair(samples, digits = 0) {
  if (!samples.length) return "—";
  return `${percentile(samples, 0.5).toFixed(digits)} / ${percentile(samples, 0.95).toFixed(digits)}`;
}

function updateHud() {
  metrics["m-rtt"].textContent = rttSamples.length ? `${formatPair(rttSamples)} ms` : "—";
  metrics["m-player-delta"].textContent = playerDeltaSamples.length ? formatPair(playerDeltaSamples, 3) : "—";
  metrics["m-prop-delta"].textContent = propDeltaSamples.length ? formatPair(propDeltaSamples, 3) : "—";
  if (settledPlayerSamples.length && settledPropSamples.length) {
    metrics["m-settled"].textContent = `${percentile(settledPlayerSamples, 0.95).toFixed(3)} / ${percentile(settledPropSamples, 0.95).toFixed(3)}`;
  } else metrics["m-settled"].textContent = "—";
  metrics["m-gap"].textContent = snapshotGapSamples.length ? `${formatPair(snapshotGapSamples)} ms` : "—";
  metrics["m-age"].textContent = lastSnapshotAgeMs === null ? "—" : `${lastSnapshotAgeMs.toFixed(0)} ms`;
  metrics["m-tick"].textContent = Number.isFinite(latestTelemetry?.tickRatio) ? latestTelemetry.tickRatio.toFixed(4) : "—";
  metrics["m-scheduler"].textContent = latestTelemetry ? `${latestTelemetry.droppedTicks ?? 0} / ${latestTelemetry.catchupSteps ?? 0}` : "—";
  metrics["m-ack"].textContent = `${latestAck} / ${inputSeq}`;
  metrics["m-local"].textContent = `${local.steps} steps · ${local.droppedSteps} dropped`;
  metrics["m-fps"].textContent = fpsSamples.length ? percentile(fpsSamples, 0.5).toFixed(0) : "—";
}

function resetSamples() {
  for (const samples of [rttSamples, playerDeltaSamples, propDeltaSamples, settledPlayerSamples, settledPropSamples, snapshotGapSamples, fpsSamples]) {
    samples.length = 0;
  }
  pendingPings.clear();
  lastSnapshotAt = null;
  lastSnapshotAgeMs = null;
  serverClockOffsetMs = null;
  inputSeq = 0;
  latestAck = 0;
  lastSentInput = null;
  lastIntentChangeSeq = 0;
  lastIntentChangeAt = performance.now();
  settledDesyncStreak = 0;
}

function enterWorld() {
  const callsign = callsignInput.value.trim();
  if (!/^[A-Za-z0-9_-]{1,24}$/.test(callsign)) {
    bootStatus.textContent = "Callsign: 1–24 chars, letters / digits / _ / -";
    return;
  }
  localStorage.setItem("ws0-callsign", callsign);
  playing = true;
  resetSamples();
  boot.classList.add("hidden");
  hud.classList.remove("hidden");
  controls.classList.remove("hidden");
  clearNotice();
  camera.position.set(0, 7, 14);
  connect();
}

enterButton.addEventListener("click", enterWorld);
callsignInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !enterButton.disabled) enterWorld();
});

window.addEventListener("keydown", (event) => {
  if (["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.code)) {
    event.preventDefault();
    keys.add(event.code);
  }
});
window.addEventListener("keyup", (event) => keys.delete(event.code));
window.addEventListener("blur", () => keys.clear());
window.addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

function animate(now) {
  requestAnimationFrame(animate);
  const dt = Math.min(0.1, Math.max(0, (now - lastFrameAt) / 1000));
  lastFrameAt = now;
  frameCounter += 1;
  const fpsElapsed = now - frameCounterStartedAt;
  if (fpsElapsed >= 500) {
    pushSample(fpsSamples, frameCounter * 1000 / fpsElapsed);
    frameCounter = 0;
    frameCounterStartedAt = now;
  }

  stepLocalPhysics(dt);
  syncMeshesFromPhysics();
  updateCamera(dt);
  renderer.render(scene, camera);
}

camera.position.set(0, 7, 14);
camera.lookAt(0, 0.8, 0);
requestAnimationFrame(animate);
