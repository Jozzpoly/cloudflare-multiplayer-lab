import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.185.1/build/three.module.js";
import { FixedStepClock } from "../world0-a2r/fixed-step-clock.js";

const CLIENT_REVISION = "ws0-a2r-two-client-intent-client-v1";
const PROBE_REVISION = "ws0-a2r-two-client-intent-v1";
const BOX3D_URL = "https://cdn.jsdelivr.net/npm/box3d.js@0.1.1/dist/box3d.inline.mjs";
const INPUT_INTERVAL_MS = 66;
const PING_INTERVAL_MS = 2000;
const HUD_INTERVAL_MS = 250;
const FIXED_DT = 1 / 60;
const PLAYER_ACCELERATION = 28;
const PLAYER_DECELERATION = 36;
const EPS = 1e-9;

const viewport = document.querySelector("#viewport");
const boot = document.querySelector("#boot");
const callsignInput = document.querySelector("#callsign");
const enterButton = document.querySelector("#enter");
const bootStatus = document.querySelector("#boot-status");
const hud = document.querySelector("#hud");
const notice = document.querySelector("#notice");
const metric = Object.fromEntries([
  "net", "players", "peer", "ack", "self", "remote", "prop", "local", "scheduler", "rtt",
].map((name) => [name, document.querySelector(`#m-${name}`)]));

const required = [viewport, boot, callsignInput, enterButton, bootStatus, hud, notice, ...Object.values(metric)];
if (required.some((value) => !value)) throw new Error("WS0 two-client probe UI incomplete");

let b3 = null;
enterButton.disabled = true;
bootStatus.textContent = `client ${CLIENT_REVISION}`;
try {
  const module = await import(BOX3D_URL);
  b3 = await module.default();
  enterButton.disabled = false;
  enterButton.textContent = "Enter two-client probe";
  bootStatus.textContent = `${CLIENT_REVISION} · box3d.js 0.1.1 ready`;
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

scene.add(new THREE.HemisphereLight(0xb8d8e4, 0x29313b, 2));
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
const remoteMaterial = new THREE.MeshStandardMaterial({ color: 0xe8a46b, roughness: 0.56 });
const propMeshes = new Map();
let selfMesh = null;
let remoteMesh = null;

function createPlayerMesh(material) {
  const group = new THREE.Group();
  const cylinder = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.9, 14), material);
  const top = new THREE.Mesh(new THREE.SphereGeometry(0.35, 14, 10), material);
  const bottom = new THREE.Mesh(new THREE.SphereGeometry(0.35, 14, 10), material);
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

const keys = new Set();
const movementCodes = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);
const rttSamples = [];
const pendingPings = new Map();
let socket = null;
let playing = false;
let inputTimer = null;
let pingTimer = null;
let hudTimer = null;
let selfSessionId = null;
let networkState = "idle";
let simulation = { simulationHz: 60, snapshotHz: 10, substeps: 4, inputLeaseMs: 600, playerSpeed: 5.2 };
let inputSeq = 0;
let latestAck = 0;
let latestTelemetry = null;
let lastSentInput = null;
let peerInputCount = 0;
let snapshotCount = 0;
let playerCount = 0;
let lastPeerInput = { seq: 0, x: 0, z: 0, receivedAt: -Infinity };
let latestDivergence = { self: null, remote: null, prop: null };
let maxDivergence = { self: 0, remote: 0, prop: 0 };

const local = {
  world: null,
  selfBody: null,
  remote: null,
  propBodies: new Map(),
  initialized: false,
  steps: 0,
  droppedSteps: 0,
};
const localClock = new FixedStepClock({ stepSeconds: FIXED_DT, maxStepsPerAdvance: 8 });
const vec3Scratch = [0, 0, 0];
const quatScratch = [0, 0, 0, 1];
const cameraFocus = new THREE.Vector3();
const cameraDesired = new THREE.Vector3();
let lastFrameAt = performance.now();

const storedCallsign = localStorage.getItem("ws0-two-client-callsign");
callsignInput.value = storedCallsign || `P-${crypto.randomUUID().slice(0, 6)}`;

function pushSample(target, value, limit = 120) {
  if (!Number.isFinite(value)) return;
  target.push(value);
  if (target.length > limit) target.splice(0, target.length - limit);
}

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1));
  return sorted[index];
}

function distance3(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function moveToward2(currentX, currentZ, targetX, targetZ, maxDelta) {
  const dx = targetX - currentX;
  const dz = targetZ - currentZ;
  const distance = Math.hypot(dx, dz);
  if (distance <= maxDelta || distance < EPS) return [targetX, targetZ];
  const scale = maxDelta / distance;
  return [currentX + dx * scale, currentZ + dz * scale];
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

function showNotice(text) {
  notice.textContent = text;
  notice.classList.remove("hidden");
}

function clearNotice() {
  notice.textContent = "";
  notice.classList.add("hidden");
}

function setNetwork(value) {
  networkState = value;
}

function socketUrl() {
  const url = new URL("/world0/ws", location.href);
  url.protocol = location.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("player", callsignInput.value.trim());
  return url.toString();
}

function createStaticBox(world, position, halfExtents) {
  const bodyDef = b3.b3DefaultBodyDef();
  bodyDef.position = position;
  const body = b3.b3CreateBody(world, bodyDef);
  b3.b3CreateBoxShape(body, b3.b3DefaultShapeDef(), halfExtents[0], halfExtents[1], halfExtents[2]);
}

function createPlayerBody(player) {
  const bodyDef = b3.b3DefaultBodyDef();
  bodyDef.type = b3.b3BodyType.b3_dynamicBody;
  bodyDef.position = [...(player.position || [0, 0.82, 0])];
  bodyDef.rotation = [...(player.rotation || [0, 0, 0, 1])];
  bodyDef.linearDamping = 0.3;
  bodyDef.angularDamping = 8;
  const body = b3.b3CreateBody(local.world, bodyDef);
  const shapeDef = b3.b3DefaultShapeDef();
  shapeDef.density = 80;
  shapeDef.baseMaterial.friction = 0.8;
  shapeDef.baseMaterial.restitution = 0.02;
  b3.b3CreateCapsuleShape(body, shapeDef, {
    center1: [0, -0.45, 0],
    center2: [0, 0.45, 0],
    radius: 0.35,
  });
  b3.b3Body_SetMotionLocks(body, {
    linearX: false, linearY: false, linearZ: false,
    angularX: true, angularY: true, angularZ: true,
  });
  if (Array.isArray(player.velocity) && player.velocity.length === 3) b3.b3Body_SetLinearVelocity(body, player.velocity);
  return body;
}

function destroyLocalWorld() {
  if (local.world) {
    try { b3.b3DestroyWorld(local.world); } catch { /* teardown only */ }
  }
  local.world = null;
  local.selfBody = null;
  local.remote = null;
  local.propBodies.clear();
  local.initialized = false;
  localClock.reset();
  local.steps = 0;
  local.droppedSteps = 0;
  if (remoteMesh) {
    scene.remove(remoteMesh);
    remoteMesh = null;
  }
}

function ensureRemote(player) {
  if (!player || player.sessionId === selfSessionId || !local.world) return;
  if (local.remote?.sessionId === player.sessionId) return;
  if (local.remote) throw new Error("two-client probe received more than one remote player");

  const body = createPlayerBody(player);
  local.remote = {
    sessionId: player.sessionId,
    playerId: player.id,
    body,
  };
  remoteMesh = createPlayerMesh(remoteMaterial);
}

function removeRemote(sessionId) {
  if (!local.remote || local.remote.sessionId !== sessionId) return;
  try { b3.b3DestroyBody(local.remote.body); } catch { /* teardown race */ }
  local.remote = null;
  if (remoteMesh) {
    scene.remove(remoteMesh);
    remoteMesh = null;
  }
}

function seedLocalWorld(state) {
  destroyLocalWorld();
  const players = state?.players || [];
  const props = state?.props || [];
  if (players.length > 2) throw new Error("two-client probe received more than two players");
  const self = players.find((player) => player.sessionId === selfSessionId);
  if (!self) throw new Error("two-client welcome missing self player");

  const worldDef = b3.b3DefaultWorldDef();
  worldDef.gravity = [0, -20, 0];
  local.world = b3.b3CreateWorld(worldDef);
  createStaticBox(local.world, [0, -0.5, 0], [10, 0.5, 10]);
  createStaticBox(local.world, [-9.5, 1.5, 0], [0.5, 2, 10]);
  createStaticBox(local.world, [9.5, 1.5, 0], [0.5, 2, 10]);
  createStaticBox(local.world, [0, 1.5, -9.5], [10, 2, 0.5]);
  createStaticBox(local.world, [0, 1.5, 9.5], [10, 2, 0.5]);

  for (const prop of props) {
    const bodyDef = b3.b3DefaultBodyDef();
    bodyDef.type = b3.b3BodyType.b3_dynamicBody;
    bodyDef.position = [...(prop.position || [0, 0.46, 0])];
    bodyDef.rotation = [...(prop.rotation || [0, 0, 0, 1])];
    bodyDef.linearDamping = 0.08;
    bodyDef.angularDamping = 0.12;
    const body = b3.b3CreateBody(local.world, bodyDef);
    const shapeDef = b3.b3DefaultShapeDef();
    shapeDef.density = 22;
    shapeDef.baseMaterial.friction = 0.72;
    shapeDef.baseMaterial.restitution = 0.04;
    b3.b3CreateBoxShape(body, shapeDef, 0.46, 0.46, 0.46);
    local.propBodies.set(prop.id, body);
    getPropMesh(prop.id);
  }

  local.selfBody = createPlayerBody(self);
  for (const player of players) ensureRemote(player);
  local.initialized = true;
  playerCount = players.length;
  if (!selfMesh) selfMesh = createPlayerMesh(selfMaterial);
  syncMeshes();
}

function applyIntent(body, input) {
  if (!body) return;
  const velocity = [0, 0, 0];
  b3.b3Body_GetLinearVelocity(velocity, body);
  const hasInput = Math.hypot(input.x, input.z) > 0.01;
  const targetX = input.x * simulation.playerSpeed;
  const targetZ = input.z * simulation.playerSpeed;
  const acceleration = hasInput ? PLAYER_ACCELERATION : PLAYER_DECELERATION;
  const [nextX, nextZ] = moveToward2(velocity[0], velocity[2], targetX, targetZ, acceleration * FIXED_DT);
  b3.b3Body_SetLinearVelocity(body, [nextX, velocity[1], nextZ]);
}

function remoteInputForStep() {
  const age = performance.now() - lastPeerInput.receivedAt;
  return age <= simulation.inputLeaseMs ? lastPeerInput : { x: 0, z: 0 };
}

function stepLocalPhysics(frameDt) {
  if (!local.initialized || !local.world || !local.selfBody) return;
  localClock.advance(frameDt, () => {
    applyIntent(local.selfBody, currentInput());
    if (local.remote) applyIntent(local.remote.body, remoteInputForStep());
    b3.b3World_Step(local.world, FIXED_DT, simulation.substeps || 4);
  });
  local.steps = localClock.totalSteps;
  local.droppedSteps = localClock.totalDroppedSteps;
}

function bodyPosition(body) {
  const out = [0, 0, 0];
  b3.b3Body_GetPosition(out, body);
  return out;
}

function syncMeshes() {
  if (!local.initialized || !local.selfBody || !selfMesh) return;
  b3.b3Body_GetPosition(vec3Scratch, local.selfBody);
  b3.b3Body_GetRotation(quatScratch, local.selfBody);
  selfMesh.position.fromArray(vec3Scratch);
  selfMesh.quaternion.fromArray(quatScratch).normalize();

  if (local.remote && remoteMesh) {
    b3.b3Body_GetPosition(vec3Scratch, local.remote.body);
    b3.b3Body_GetRotation(quatScratch, local.remote.body);
    remoteMesh.position.fromArray(vec3Scratch);
    remoteMesh.quaternion.fromArray(quatScratch).normalize();
  }

  for (const [id, body] of local.propBodies) {
    const mesh = getPropMesh(id);
    b3.b3Body_GetPosition(vec3Scratch, body);
    b3.b3Body_GetRotation(quatScratch, body);
    mesh.position.fromArray(vec3Scratch);
    mesh.quaternion.fromArray(quatScratch).normalize();
  }
}

function sampleAuthorityDivergence(state) {
  if (!local.initialized || !local.selfBody) return;
  const players = state.players || [];
  if (players.length > 2) throw new Error("two-client snapshot exceeded probe scope");
  playerCount = players.length;
  const self = players.find((player) => player.sessionId === selfSessionId);
  if (!self) return;
  latestAck = Number.isFinite(self.ack) ? self.ack : latestAck;

  for (const player of players) {
    if (player.sessionId !== selfSessionId) ensureRemote(player);
  }
  if (local.remote && !players.some((player) => player.sessionId === local.remote.sessionId)) removeRemote(local.remote.sessionId);

  const selfDelta = distance3(bodyPosition(local.selfBody), self.position || [0, 0, 0]);
  let remoteDelta = null;
  if (local.remote) {
    const authorityRemote = players.find((player) => player.sessionId === local.remote.sessionId);
    if (authorityRemote) remoteDelta = distance3(bodyPosition(local.remote.body), authorityRemote.position || [0, 0, 0]);
  }

  let propDelta = 0;
  for (const prop of state.props || []) {
    const body = local.propBodies.get(prop.id);
    if (!body) continue;
    propDelta = Math.max(propDelta, distance3(bodyPosition(body), prop.position || [0, 0, 0]));
  }

  latestDivergence = { self: selfDelta, remote: remoteDelta, prop: propDelta };
  maxDivergence.self = Math.max(maxDivergence.self, selfDelta);
  if (remoteDelta !== null) maxDivergence.remote = Math.max(maxDivergence.remote, remoteDelta);
  maxDivergence.prop = Math.max(maxDivergence.prop, propDelta);
}

function handleMessage(message) {
  if (message.type === "welcome") {
    selfSessionId = message.selfSessionId;
    simulation = { ...simulation, ...(message.simulation || {}) };
    if (simulation.simulationHz !== 60 || simulation.substeps !== 4) {
      throw new Error(`two-client contract mismatch: ${simulation.simulationHz} Hz / ${simulation.substeps} substeps`);
    }
    latestTelemetry = message.state?.telemetry || latestTelemetry;
    seedLocalWorld(message.state);
    setNetwork("live · local self + delayed peer intent");
    clearNotice();
    return;
  }

  if (message.type === "peer_input") {
    if (message.probeRevision !== PROBE_REVISION) throw new Error(`peer-input revision mismatch: ${message.probeRevision}`);
    if (!Number.isFinite(message.seq) || !Number.isFinite(message.x) || !Number.isFinite(message.z)) return;
    if (message.seq <= lastPeerInput.seq) return;
    lastPeerInput = { seq: Math.trunc(message.seq), x: message.x, z: message.z, receivedAt: performance.now() };
    peerInputCount += 1;
    return;
  }

  if (message.type === "snapshot") {
    snapshotCount += 1;
    latestTelemetry = message.telemetry || latestTelemetry;
    sampleAuthorityDivergence(message);
    return;
  }

  if (message.type === "player_left") {
    removeRemote(message.sessionId);
    playerCount = Math.max(1, playerCount - 1);
    lastPeerInput = { seq: 0, x: 0, z: 0, receivedAt: -Infinity };
    return;
  }

  if (message.type === "pong") {
    const pending = pendingPings.get(message.id);
    if (!pending) return;
    pendingPings.delete(message.id);
    pushSample(rttSamples, performance.now() - pending);
    return;
  }

  if (message.type === "error") showNotice(`Server: ${message.error}`);
}

function connect() {
  setNetwork("connecting");
  socket = new WebSocket(socketUrl());
  socket.addEventListener("open", () => {
    setNetwork("syncing");
    sendInput(true);
    sendPing();
    inputTimer = setInterval(() => sendInput(true), INPUT_INTERVAL_MS);
    pingTimer = setInterval(sendPing, PING_INTERVAL_MS);
    hudTimer = setInterval(updateHud, HUD_INTERVAL_MS);
  });
  socket.addEventListener("message", (event) => {
    if (typeof event.data !== "string") return;
    try {
      handleMessage(JSON.parse(event.data));
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      showNotice(text);
      setNetwork("candidate error");
      socket?.close(1011, "two_client_candidate_error");
    }
  });
  socket.addEventListener("close", (event) => {
    if (inputTimer) clearInterval(inputTimer);
    if (pingTimer) clearInterval(pingTimer);
    inputTimer = pingTimer = null;
    pendingPings.clear();
    setNetwork(`closed ${event.code}`);
    showNotice("Probe connection ended. Reload for a fresh-world retry; reconnect/reseed is intentionally outside this gate.");
  });
  socket.addEventListener("error", () => setNetwork("network error"));
}

function sendInput(force = false) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return false;
  const input = currentInput();
  const changed = inputChanged(lastSentInput, input);
  if (!force && !changed) return false;
  inputSeq += 1;
  lastSentInput = { ...input };
  socket.send(JSON.stringify({ type: "input", seq: inputSeq, x: input.x, z: input.z }));
  return true;
}

function sendPing() {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  const id = crypto.randomUUID();
  pendingPings.set(id, performance.now());
  socket.send(JSON.stringify({ type: "ping", id }));
  if (pendingPings.size > 8) pendingPings.delete(pendingPings.keys().next().value);
}

function formatDelta(value) {
  return Number.isFinite(value) ? value.toFixed(3) : "—";
}

function updateHud() {
  metric.net.textContent = networkState;
  metric.players.textContent = String(playerCount);
  metric.peer.textContent = `${peerInputCount} · seq ${lastPeerInput.seq}`;
  metric.ack.textContent = `${latestAck} / ${inputSeq}`;
  metric.self.textContent = `${formatDelta(latestDivergence.self)} · max ${maxDivergence.self.toFixed(3)}`;
  metric.remote.textContent = `${formatDelta(latestDivergence.remote)} · max ${maxDivergence.remote.toFixed(3)}`;
  metric.prop.textContent = `${formatDelta(latestDivergence.prop)} · max ${maxDivergence.prop.toFixed(3)}`;
  metric.local.textContent = `${local.steps} steps · ${local.droppedSteps} dropped`;
  metric.scheduler.textContent = latestTelemetry ? `${latestTelemetry.droppedTicks ?? 0} / ${latestTelemetry.catchupSteps ?? 0}` : "—";
  metric.rtt.textContent = rttSamples.length ? `${percentile(rttSamples, 0.5).toFixed(0)} ms` : "—";
}

function updateCamera(dt) {
  if (!selfMesh) return;
  cameraFocus.copy(selfMesh.position);
  cameraFocus.y += 0.45;
  cameraDesired.set(selfMesh.position.x + 7.2, selfMesh.position.y + 6.2, selfMesh.position.z + 8.4);
  camera.position.lerp(cameraDesired, 1 - Math.exp(-5.5 * dt));
  camera.lookAt(cameraFocus);
}

function enterWorld() {
  const callsign = callsignInput.value.trim();
  if (!/^[A-Za-z0-9_-]{1,24}$/.test(callsign)) {
    bootStatus.textContent = "Callsign: 1–24 chars, letters / digits / _ / -";
    return;
  }
  localStorage.setItem("ws0-two-client-callsign", callsign);
  playing = true;
  boot.classList.add("hidden");
  hud.classList.remove("hidden");
  clearNotice();
  camera.position.set(0, 7, 14);
  connect();
}

enterButton.addEventListener("click", enterWorld);
callsignInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !enterButton.disabled) enterWorld();
});
window.addEventListener("keydown", (event) => {
  if (!movementCodes.has(event.code)) return;
  event.preventDefault();
  keys.add(event.code);
  sendInput(false);
});
window.addEventListener("keyup", (event) => {
  if (!movementCodes.has(event.code)) return;
  keys.delete(event.code);
  sendInput(false);
});
window.addEventListener("blur", () => {
  if (!keys.size) return;
  keys.clear();
  sendInput(false);
});
window.addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

window.__WS0_TWO_CLIENT__ = {
  snapshot() {
    return {
      clientRevision: CLIENT_REVISION,
      probeRevision: PROBE_REVISION,
      playing,
      networkState,
      selfSessionId,
      playerCount,
      peerInputCount,
      peerInputSeq: lastPeerInput.seq,
      inputSeq,
      latestAck,
      snapshotCount,
      localSteps: local.steps,
      localDroppedSteps: local.droppedSteps,
      hasRemoteBody: Boolean(local.remote),
      divergence: { ...latestDivergence },
      maxDivergence: { ...maxDivergence },
      telemetry: latestTelemetry ? { ...latestTelemetry } : null,
    };
  },
};

function animate(now) {
  requestAnimationFrame(animate);
  const dt = Math.max(0, (now - lastFrameAt) / 1000);
  lastFrameAt = now;
  stepLocalPhysics(dt);
  syncMeshes();
  updateCamera(dt);
  renderer.render(scene, camera);
}

camera.position.set(0, 7, 14);
camera.lookAt(0, 0.8, 0);
requestAnimationFrame(animate);
