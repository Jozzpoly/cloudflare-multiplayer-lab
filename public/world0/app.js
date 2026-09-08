import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.185.1/build/three.module.js";

const CLIENT_REVISION = "ws0-a2-client-v2";
const INPUT_INTERVAL_MS = 66;
const PING_INTERVAL_MS = 2000;
const HUD_INTERVAL_MS = 250;
const SAMPLE_LIMIT = 160;
const LOCAL_HARD_SNAP_DISTANCE = 2.5;
const AUTH_PROJECTION_CAP_MS = 150;
const PLAYER_ACCELERATION = 28;
const PLAYER_DECELERATION = 36;

const viewport = document.querySelector("#viewport");
const boot = document.querySelector("#boot");
const callsignInput = document.querySelector("#callsign");
const enterButton = document.querySelector("#enter");
const hud = document.querySelector("#hud");
const controls = document.querySelector("#controls");
const notice = document.querySelector("#notice");
const netEl = document.querySelector("#net");
const metricIds = ["m-rtt", "m-correction", "m-gap", "m-age", "m-tick", "m-scheduler", "m-ack", "m-snaps", "m-fps"];
const metrics = Object.fromEntries(metricIds.map((id) => [id, document.querySelector(`#${id}`)]));
const required = [viewport, boot, callsignInput, enterButton, hud, controls, notice, netEl, ...Object.values(metrics)];
if (required.some((value) => !value)) throw new Error("WS0 A2 UI incomplete");

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
const remoteMaterial = new THREE.MeshStandardMaterial({ color: 0xe69b77, roughness: 0.56 });

const propMeshes = new Map();
const playerMeshes = new Map();
const keys = new Set();
const rttSamples = [];
const correctionSamples = [];
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
let simulation = { simulationHz: 60, snapshotHz: 10, inputLeaseMs: 600, playerSpeed: 5.2 };
let inputSeq = 0;
let latestAck = 0;
let latestTelemetry = null;
let lastSnapshotAt = null;
let lastSnapshotAgeMs = null;
let serverClockOffsetMs = null;
let hardSnapCount = 0;
let lastFrameAt = performance.now();
let frameCounterStartedAt = performance.now();
let frameCounter = 0;

const localPrediction = {
  initialized: false,
  position: new THREE.Vector3(),
  velocity: new THREE.Vector3(),
  targetY: 0,
  rotation: new THREE.Quaternion(),
  authRotation: new THREE.Quaternion(),
};

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

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function moveToward2(currentX, currentZ, targetX, targetZ, maxDelta) {
  const dx = targetX - currentX;
  const dz = targetZ - currentZ;
  const distance = Math.hypot(dx, dz);
  if (distance <= maxDelta || distance < 1e-9) return [targetX, targetZ];
  const scale = maxDelta / distance;
  return [currentX + dx * scale, currentZ + dz * scale];
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

function createPlayerMesh(isSelf) {
  const material = isSelf ? selfMaterial : remoteMaterial;
  const group = new THREE.Group();
  const cylinder = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.9, 14), material);
  const top = new THREE.Mesh(new THREE.SphereGeometry(0.35, 14, 10), material);
  const bottom = new THREE.Mesh(new THREE.SphereGeometry(0.35, 14, 10), material);
  top.position.y = 0.45;
  bottom.position.y = -0.45;
  group.add(cylinder, top, bottom);
  group.userData.targetPosition = new THREE.Vector3();
  group.userData.targetQuaternion = new THREE.Quaternion();
  scene.add(group);
  return group;
}

function getPlayerMesh(player) {
  let mesh = playerMeshes.get(player.sessionId);
  if (!mesh) {
    mesh = createPlayerMesh(player.sessionId === selfSessionId);
    playerMeshes.set(player.sessionId, mesh);
  }
  return mesh;
}

function getPropMesh(prop) {
  let mesh = propMeshes.get(prop.id);
  if (!mesh) {
    mesh = new THREE.Mesh(propGeometry, propMaterial);
    mesh.userData.targetPosition = new THREE.Vector3();
    mesh.userData.targetQuaternion = new THREE.Quaternion();
    scene.add(mesh);
    propMeshes.set(prop.id, mesh);
  }
  return mesh;
}

function applyState(state, immediate = false, serverTime = null) {
  if (!state) return;
  const players = state.players || [];
  const props = state.props || [];
  const livePlayers = new Set(players.map((player) => player.sessionId));
  const liveProps = new Set(props.map((prop) => prop.id));

  let projectionAgeMs = 0;
  if (serverClockOffsetMs !== null && Number.isFinite(serverTime)) {
    lastSnapshotAgeMs = Math.max(0, Date.now() + serverClockOffsetMs - serverTime);
    projectionAgeMs = clamp(lastSnapshotAgeMs, 0, AUTH_PROJECTION_CAP_MS);
  }
  const projectionDt = projectionAgeMs / 1000;

  for (const player of players) {
    const projected = new THREE.Vector3(
      player.position[0] + (player.velocity?.[0] || 0) * projectionDt,
      player.position[1] + (player.velocity?.[1] || 0) * projectionDt,
      player.position[2] + (player.velocity?.[2] || 0) * projectionDt,
    );
    const authoritativeVelocity = new THREE.Vector3().fromArray(player.velocity || [0, 0, 0]);
    const authoritativeRotation = new THREE.Quaternion().fromArray(player.rotation || [0, 0, 0, 1]).normalize();
    const mesh = getPlayerMesh(player);

    if (player.sessionId === selfSessionId) {
      latestAck = Number.isFinite(player.ack) ? player.ack : latestAck;
      if (!localPrediction.initialized || immediate) {
        localPrediction.initialized = true;
        localPrediction.position.copy(projected);
        localPrediction.velocity.copy(authoritativeVelocity);
        localPrediction.targetY = projected.y;
        localPrediction.rotation.copy(authoritativeRotation);
        localPrediction.authRotation.copy(authoritativeRotation);
      } else {
        const dx = projected.x - localPrediction.position.x;
        const dz = projected.z - localPrediction.position.z;
        const horizontalCorrection = Math.hypot(dx, dz);
        pushSample(correctionSamples, horizontalCorrection);
        localPrediction.targetY = projected.y;
        localPrediction.authRotation.copy(authoritativeRotation);

        if (horizontalCorrection > LOCAL_HARD_SNAP_DISTANCE) {
          localPrediction.position.copy(projected);
          localPrediction.velocity.copy(authoritativeVelocity);
          hardSnapCount += 1;
        } else {
          // Reconcile only when a fresh authoritative sample arrives. Between
          // snapshots the predictor is free-running; it is never pulled toward
          // a stale snapshot every render frame.
          localPrediction.position.x += dx * 0.22;
          localPrediction.position.z += dz * 0.22;
          localPrediction.position.y += (projected.y - localPrediction.position.y) * 0.55;
          localPrediction.velocity.x += (authoritativeVelocity.x - localPrediction.velocity.x) * 0.28;
          localPrediction.velocity.z += (authoritativeVelocity.z - localPrediction.velocity.z) * 0.28;
          localPrediction.velocity.y = authoritativeVelocity.y;
          localPrediction.rotation.slerp(authoritativeRotation, 0.4);
        }
      }
    } else {
      mesh.userData.targetPosition.copy(projected);
      mesh.userData.targetQuaternion.copy(authoritativeRotation);
      if (immediate) {
        mesh.position.copy(projected);
        mesh.quaternion.copy(authoritativeRotation);
      }
    }
  }

  for (const [sessionId, mesh] of playerMeshes) {
    if (!livePlayers.has(sessionId)) {
      scene.remove(mesh);
      playerMeshes.delete(sessionId);
    }
  }

  for (const prop of props) {
    const mesh = getPropMesh(prop);
    mesh.userData.targetPosition.fromArray(prop.position || [0, 0, 0]);
    mesh.userData.targetQuaternion.fromArray(prop.rotation || [0, 0, 0, 1]).normalize();
    if (immediate) {
      mesh.position.copy(mesh.userData.targetPosition);
      mesh.quaternion.copy(mesh.userData.targetQuaternion);
    }
  }

  for (const [id, mesh] of propMeshes) {
    if (!liveProps.has(id)) {
      scene.remove(mesh);
      propMeshes.delete(id);
    }
  }
}

function handleMessage(message) {
  if (message.type === "welcome") {
    selfSessionId = message.selfSessionId;
    simulation = { ...simulation, ...(message.simulation || {}) };
    latestTelemetry = message.state?.telemetry || latestTelemetry;
    applyState(message.state, true, message.serverTime);
    setNetwork("live", "live");
    clearNotice();
    return;
  }
  if (message.type === "snapshot") {
    const receivedAt = performance.now();
    if (lastSnapshotAt !== null) pushSample(snapshotGapSamples, receivedAt - lastSnapshotAt);
    lastSnapshotAt = receivedAt;
    latestTelemetry = message.telemetry || latestTelemetry;
    applyState(message, false, message.serverTime);
    return;
  }
  if (message.type === "player_left") {
    const mesh = playerMeshes.get(message.sessionId);
    if (mesh) scene.remove(mesh);
    playerMeshes.delete(message.sessionId);
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
    catch { /* malformed research frame is ignored */ }
  });
  socket.addEventListener("close", () => {
    stopNetworkLoops();
    socket = null;
    selfSessionId = null;
    localPrediction.initialized = false;
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

function sendInput() {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  const input = currentInput();
  inputSeq += 1;
  socket.send(JSON.stringify({ type: "input", seq: inputSeq, x: input.x, z: input.z }));
}

function sendPing() {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  const id = crypto.randomUUID();
  pendingPings.set(id, { perf: performance.now(), wall: Date.now() });
  socket.send(JSON.stringify({ type: "ping", id }));
}

function startNetworkLoops() {
  stopNetworkLoops();
  inputTimer = setInterval(sendInput, INPUT_INTERVAL_MS);
  pingTimer = setInterval(sendPing, PING_INTERVAL_MS);
  hudTimer = setInterval(renderHud, HUD_INTERVAL_MS);
  sendInput();
  sendPing();
}

function stopNetworkLoops() {
  if (inputTimer) clearInterval(inputTimer);
  if (pingTimer) clearInterval(pingTimer);
  if (hudTimer) clearInterval(hudTimer);
  inputTimer = pingTimer = hudTimer = null;
}

function updateLocalPrediction(dt) {
  if (!localPrediction.initialized) return;
  const input = currentInput();
  const hasInput = Math.hypot(input.x, input.z) > 0.01;
  const targetX = input.x * simulation.playerSpeed;
  const targetZ = input.z * simulation.playerSpeed;
  const acceleration = hasInput ? PLAYER_ACCELERATION : PLAYER_DECELERATION;
  const [vx, vz] = moveToward2(localPrediction.velocity.x, localPrediction.velocity.z, targetX, targetZ, acceleration * dt);
  localPrediction.velocity.x = vx;
  localPrediction.velocity.z = vz;
  localPrediction.position.x += vx * dt;
  localPrediction.position.z += vz * dt;

  // Vertical motion and rotation are presentation-only in A2. The client does
  // not run gravity/contact physics for the player or props.
  localPrediction.position.y += (localPrediction.targetY - localPrediction.position.y) * (1 - Math.exp(-12 * dt));
  localPrediction.rotation.slerp(localPrediction.authRotation, 1 - Math.exp(-12 * dt));

  const mesh = selfSessionId ? playerMeshes.get(selfSessionId) : null;
  if (mesh) {
    mesh.position.copy(localPrediction.position);
    mesh.quaternion.copy(localPrediction.rotation);
  }
}

function smoothAuthoritativeMeshes(dt) {
  const alpha = 1 - Math.exp(-12 * dt);
  for (const [sessionId, mesh] of playerMeshes) {
    if (sessionId === selfSessionId) continue;
    mesh.position.lerp(mesh.userData.targetPosition, alpha);
    mesh.quaternion.slerp(mesh.userData.targetQuaternion, alpha);
  }
  for (const mesh of propMeshes.values()) {
    mesh.position.lerp(mesh.userData.targetPosition, alpha);
    mesh.quaternion.slerp(mesh.userData.targetQuaternion, alpha);
  }
}

function updateCamera(dt) {
  if (localPrediction.initialized) cameraFocus.copy(localPrediction.position);
  else cameraFocus.set(0, 0, 0);
  cameraDesired.set(cameraFocus.x + 8.5, cameraFocus.y + 8.5, cameraFocus.z + 11.5);
  camera.position.lerp(cameraDesired, 1 - Math.exp(-5 * dt));
  camera.lookAt(cameraFocus.x, cameraFocus.y + 0.15, cameraFocus.z);
}

function renderHud() {
  const rtt50 = percentile(rttSamples, 0.5);
  const rtt95 = percentile(rttSamples, 0.95);
  const corr50 = percentile(correctionSamples, 0.5);
  const corr95 = percentile(correctionSamples, 0.95);
  const gap50 = percentile(snapshotGapSamples, 0.5);
  const gap95 = percentile(snapshotGapSamples, 0.95);
  metrics["m-rtt"].textContent = rttSamples.length ? `${rtt50.toFixed(0)} / ${rtt95.toFixed(0)} ms` : "—";
  metrics["m-correction"].textContent = correctionSamples.length ? `${corr50.toFixed(3)} / ${corr95.toFixed(3)}` : "—";
  metrics["m-gap"].textContent = snapshotGapSamples.length ? `${gap50.toFixed(0)} / ${gap95.toFixed(0)} ms` : "—";
  metrics["m-age"].textContent = lastSnapshotAgeMs === null ? "—" : `${lastSnapshotAgeMs.toFixed(0)} ms`;
  metrics["m-tick"].textContent = latestTelemetry ? Number(latestTelemetry.tickRatio).toFixed(4) : "—";
  metrics["m-scheduler"].textContent = latestTelemetry ? `${latestTelemetry.droppedTicks} / ${latestTelemetry.catchupSteps}` : "—";
  metrics["m-ack"].textContent = `${latestAck} / ${inputSeq}`;
  metrics["m-snaps"].textContent = String(hardSnapCount);
  metrics["m-fps"].textContent = fpsSamples.length ? `${percentile(fpsSamples, 0.5).toFixed(0)} p50` : "—";
}

function animate(now) {
  const dt = clamp((now - lastFrameAt) / 1000, 0, 0.05);
  lastFrameAt = now;
  updateLocalPrediction(dt);
  smoothAuthoritativeMeshes(dt);
  updateCamera(dt);
  renderer.render(scene, camera);

  frameCounter += 1;
  if (now - frameCounterStartedAt >= 1000) {
    pushSample(fpsSamples, frameCounter * 1000 / (now - frameCounterStartedAt));
    frameCounter = 0;
    frameCounterStartedAt = now;
  }
}
renderer.setAnimationLoop(animate);

enterButton.addEventListener("click", () => {
  const callsign = callsignInput.value.trim();
  if (!/^[A-Za-z0-9_-]{1,24}$/.test(callsign)) {
    showNotice("Callsign: 1–24 letters, digits, _ or -");
    return;
  }
  localStorage.setItem("ws0-callsign", callsign);
  clearNotice();
  boot.classList.add("hidden");
  hud.classList.remove("hidden");
  controls.classList.remove("hidden");
  playing = true;
  connect();
});

callsignInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") enterButton.click();
});

addEventListener("keydown", (event) => {
  if (["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.code)) {
    keys.add(event.code);
    event.preventDefault();
  }
});
addEventListener("keyup", (event) => keys.delete(event.code));
addEventListener("blur", () => keys.clear());
addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.setSize(innerWidth, innerHeight);
});

camera.position.set(8.5, 9, 11.5);
camera.lookAt(0, 0.5, 0);
console.info(`${CLIENT_REVISION} · Three.js r${THREE.REVISION}`);
