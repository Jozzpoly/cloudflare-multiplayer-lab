import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.185.1/build/three.module.js";

const CLIENT_REVISION = "ws0-f5-browser-client-v1";
const PROTOCOL_REVISION = "ws0-f5-scheduled-input-v1";
const BOX3D_URL = "https://cdn.jsdelivr.net/npm/box3d.js@0.1.1/dist/box3d.inline.mjs";
const FIXED_DT = 1 / 60;
const STEP_MS = 1000 / 60;
const SEGMENT_TICKS = 8;
const RETAIN_TICKS = 24;
const RECORDING_CAPACITY = 2 * 1024 * 1024;
const INPUT_BATCH_SIZE = 2;
const PREDICTION_LEAD_TICKS = 8;
const MAX_PREDICTION_STEPS_PER_FRAME = 20;
const DIAGNOSTIC_RETAIN_TICKS = 72;
const PING_INTERVAL_MS = 1000;
const HUD_INTERVAL_MS = 200;
const PLAYER_ACCELERATION = 28;
const PLAYER_DECELERATION = 36;
const DEFAULT_PLAYER_SPEED = 5.2;
const EPS = 1e-9;

const viewport = document.querySelector("#viewport");
const boot = document.querySelector("#boot");
const callsignInput = document.querySelector("#callsign");
const runInput = document.querySelector("#run");
const enterButton = document.querySelector("#enter");
const bootStatus = document.querySelector("#boot-status");
const hud = document.querySelector("#hud");
const notice = document.querySelector("#notice");
const joystick = document.querySelector("#joystick");
const joystickKnob = document.querySelector("#joystick-knob");
const metricNames = [
  "net", "run", "ticks", "lead", "rtt", "input", "reject", "consume", "peer", "snapshot-age",
  "corrections", "rewind", "replay", "memory", "generations", "remap",
  "self", "remote", "prop", "same-self", "same-remote", "same-prop",
];
const metric = Object.fromEntries(metricNames.map((name) => [name, document.querySelector(`#m-${name}`)]));
const required = [viewport, boot, callsignInput, runInput, enterButton, bootStatus, hud, notice, joystick, joystickKnob, ...Object.values(metric)];
if (required.some((value) => !value)) throw new Error("F5 UI incomplete");

const urlParams = new URL(location.href).searchParams;
const storedCallsign = localStorage.getItem("ws0-f5-callsign") || "";
const storedRun = localStorage.getItem("ws0-f5-run") || "";
const randomRun = `f5-${Math.random().toString(36).slice(2, 8)}`;
callsignInput.value = urlParams.get("player") || storedCallsign || "";
runInput.value = urlParams.get("run") || storedRun || randomRun;

let b3 = null;
enterButton.disabled = true;
bootStatus.textContent = `client ${CLIENT_REVISION}`;
try {
  const module = await import(BOX3D_URL);
  b3 = await module.default();
  const recordingFns = [
    "b3CreateRecording", "b3DestroyRecording", "b3World_StartRecording", "b3World_StopRecording", "b3Recording_GetSize",
    "b3RecPlayer_CreateFromRecording", "b3RecPlayer_Destroy", "b3RecPlayer_GetWorldId", "b3RecPlayer_GetBodyCount",
    "b3RecPlayer_GetBodyId", "b3RecPlayer_SeekFrame", "b3RecPlayer_GetFrame", "b3RecPlayer_HasDiverged",
    "b3RecPlayer_GetDivergeFrame", "b3Body_SetName", "b3Body_GetName", "b3Body_IsValid",
  ];
  const missing = recordingFns.filter((name) => typeof b3[name] !== "function");
  if (missing.length) throw new Error(`box3d.js recording capability missing: ${missing.join(", ")}`);
  enterButton.disabled = false;
  enterButton.textContent = "Enter F5 probe";
  bootStatus.textContent = `${CLIENT_REVISION} · box3d.js 0.1.1 recording ready`;
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

const floor = new THREE.Mesh(new THREE.BoxGeometry(20, 1, 20), new THREE.MeshStandardMaterial({ color: 0x25313a, roughness: 0.92 }));
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
let touchInput = { x: 0, z: 0 };
function keyboardInput() {
  let x = 0, z = 0;
  if (keys.has("KeyA") || keys.has("ArrowLeft")) x -= 1;
  if (keys.has("KeyD") || keys.has("ArrowRight")) x += 1;
  if (keys.has("KeyW") || keys.has("ArrowUp")) z -= 1;
  if (keys.has("KeyS") || keys.has("ArrowDown")) z += 1;
  const length = Math.hypot(x, z);
  return length > 1 ? { x: x / length, z: z / length } : { x, z };
}
function currentInput() {
  const keyboard = keyboardInput();
  if (Math.hypot(keyboard.x, keyboard.z) > 0.01) return keyboard;
  return { ...touchInput };
}
function sameInput(a, c) { return Math.abs(a.x - c.x) <= EPS && Math.abs(a.z - c.z) <= EPS; }
function zeroInput() { return { x: 0, z: 0 }; }
function distance3(a, c) { return Math.hypot(a[0]-c[0], a[1]-c[1], a[2]-c[2]); }
function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a,b) => a-b);
  return sorted[Math.min(sorted.length-1, Math.max(0, Math.ceil(sorted.length*p)-1))];
}
function moveToward2(cx, cz, tx, tz, maxDelta) {
  const dx=tx-cx, dz=tz-cz, d=Math.hypot(dx,dz);
  if (d<=maxDelta || d<1e-9) return [tx,tz];
  const scale=maxDelta/d;
  return [cx+dx*scale, cz+dz*scale];
}
function showNotice(text) { notice.textContent = text; notice.classList.remove("hidden"); }
function clearNotice() { notice.classList.add("hidden"); notice.textContent = ""; }
function formatMeters(value) { return Number.isFinite(value) ? `${value.toFixed(3)} m` : "—"; }
function formatBytes(value) {
  if (!Number.isFinite(value)) return "—";
  if (value < 1024) return `${value} B`;
  return `${(value/1024).toFixed(1)} KiB`;
}

let playing = false;
let socket = null;
let networkState = "idle";
let callsign = "";
let runKey = "";
let selfSessionId = null;
let remoteSessionId = null;
let selfSlot = null;
let protocolStartTick = null;
let simulation = {
  simulationHz: 60,
  substeps: 4,
  playerSpeed: DEFAULT_PLAYER_SPEED,
  playerAcceleration: PLAYER_ACCELERATION,
  playerDeceleration: PLAYER_DECELERATION,
  predictionLeadTicks: PREDICTION_LEAD_TICKS,
  inputBatchSize: INPUT_BATCH_SIZE,
};
const pendingPings = new Map();
const rttSamples = [];
let pingTimer = null;
let hudTimer = null;
let phaseAnchor = null;
let localState = null;
let batchSeq = 0;
let pendingBatch = [];
const intendedSelf = new Map();
const peerRemote = new Map();
const consumedByTick = new Map();
const usedByTick = new Map();
const diagnosticSamples = new Map();

const metrics = {
  generatedInputRecords: 0,
  sentBatches: 0,
  serverLate: 0,
  serverRejected: 0,
  consumedSelfFresh: 0,
  consumedSelfMissing: 0,
  consumedFreshTotal: 0,
  consumedMissingTotal: 0,
  peerFutureRecords: 0,
  corrections: 0,
  latestRewind: 0,
  maxRewind: 0,
  latestReplaySteps: 0,
  maxReplaySteps: 0,
  maxRetainedBytes: 0,
  generationRotations: 0,
  remapFailures: 0,
  latestCorrection: { self: 0, remote: 0, prop: 0 },
  maxCorrection: { self: 0, remote: 0, prop: 0 },
  latestSameTick: { self: NaN, remote: NaN, prop: NaN },
  maxSameTick: { self: 0, remote: 0, prop: 0 },
  latestSnapshotAge: NaN,
  maxSnapshotAge: 0,
};

function createStaticBox(world, position, half) {
  const def = b3.b3DefaultBodyDef();
  def.position = [...position];
  const body = b3.b3CreateBody(world, def);
  b3.b3CreateBoxShape(body, b3.b3DefaultShapeDef(), half[0], half[1], half[2]);
}
function createDynamicBox(world, locator, position, rotation) {
  const def = b3.b3DefaultBodyDef();
  def.type = b3.b3BodyType.b3_dynamicBody;
  def.position = [...position];
  def.rotation = [...(rotation || [0,0,0,1])];
  def.linearDamping = 0.08;
  def.angularDamping = 0.12;
  const body = b3.b3CreateBody(world, def);
  b3.b3Body_SetName(body, locator);
  const shape = b3.b3DefaultShapeDef();
  shape.density = 22;
  shape.baseMaterial.friction = 0.72;
  shape.baseMaterial.restitution = 0.04;
  b3.b3CreateBoxShape(body, shape, 0.46, 0.46, 0.46);
  return body;
}
function createActorBody(world, locator, player) {
  const def = b3.b3DefaultBodyDef();
  def.type = b3.b3BodyType.b3_dynamicBody;
  def.position = [...(player.position || [0,0.82,0])];
  def.rotation = [...(player.rotation || [0,0,0,1])];
  def.linearDamping = 0.3;
  def.angularDamping = 8;
  const body = b3.b3CreateBody(world, def);
  b3.b3Body_SetName(body, locator);
  const shape = b3.b3DefaultShapeDef();
  shape.density = 80;
  shape.baseMaterial.friction = 0.8;
  shape.baseMaterial.restitution = 0.02;
  b3.b3CreateCapsuleShape(body, shape, { center1:[0,-0.45,0], center2:[0,0.45,0], radius:0.35 });
  b3.b3Body_SetMotionLocks(body, { linearX:false, linearY:false, linearZ:false, angularX:true, angularY:true, angularZ:true });
  if (Array.isArray(player.velocity) && player.velocity.length === 3) b3.b3Body_SetLinearVelocity(body, player.velocity);
  return body;
}
function bodyPosition(body) { const out=[0,0,0]; b3.b3Body_GetPosition(out,body); return [...out]; }
function bodyRotation(body) { const out=[0,0,0,1]; b3.b3Body_GetRotation(out,body); return [...out]; }
function bodyVelocity(body) { const out=[0,0,0]; b3.b3Body_GetLinearVelocity(out,body); return [...out]; }
function applyIntent(body, input) {
  const velocity = bodyVelocity(body);
  const hasInput = Math.hypot(input.x,input.z) > 0.01;
  const speed = simulation.playerSpeed || DEFAULT_PLAYER_SPEED;
  const accel = hasInput ? (simulation.playerAcceleration || PLAYER_ACCELERATION) : (simulation.playerDeceleration || PLAYER_DECELERATION);
  const [nextX,nextZ] = moveToward2(velocity[0],velocity[2],input.x*speed,input.z*speed,accel*FIXED_DT);
  b3.b3Body_SetLinearVelocity(body,[nextX,velocity[1],nextZ]);
}
function createSimulationFromState(state) {
  const players = [...(state?.players || [])].sort((a,b) => (a.slot ?? 0) - (b.slot ?? 0));
  const props = [...(state?.props || [])];
  if (players.length !== 2) throw new Error(`F5 start requires exactly two players, got ${players.length}`);
  const self = players.find((player) => player.sessionId === selfSessionId);
  if (!self) throw new Error("F5 start state missing self player");
  const remote = players.find((player) => player.sessionId !== selfSessionId);
  if (!remote) throw new Error("F5 start state missing remote player");
  remoteSessionId = remote.sessionId;

  const wd = b3.b3DefaultWorldDef();
  wd.gravity = [0,-20,0];
  const world = b3.b3CreateWorld(wd);
  createStaticBox(world,[0,-0.5,0],[10,0.5,10]);
  createStaticBox(world,[-9.5,1.5,0],[0.5,2,10]);
  createStaticBox(world,[9.5,1.5,0],[0.5,2,10]);
  createStaticBox(world,[0,1.5,-9.5],[10,2,0.5]);
  createStaticBox(world,[0,1.5,9.5],[10,2,0.5]);

  const entityDefs = [];
  const propBodies = new Map();
  for (const prop of props) {
    const locator = `prop:${prop.id}`;
    const body = createDynamicBox(world,locator,prop.position || [0,0.46,0],prop.rotation || [0,0,0,1]);
    propBodies.set(prop.id,body);
    entityDefs.push({ netEntityId:prop.id, locator, kind:"prop" });
    getPropMesh(prop.id);
  }

  const actorBodies = new Map();
  for (const player of players) {
    const locator = `actor:${player.slot}`;
    const body = createActorBody(world,locator,player);
    actorBodies.set(player.sessionId,body);
    entityDefs.push({ netEntityId:player.sessionId, locator, kind:"actor", slot:player.slot });
  }

  return { world, actorBodies, propBodies, entityDefs, ownerPlayer:0 };
}
function remapSimulation(player, entityDefs) {
  const world = b3.b3RecPlayer_GetWorldId(player);
  const byLocator = new Map();
  const ordinalByLocator = new Map();
  const count = b3.b3RecPlayer_GetBodyCount(player);
  for (let ordinal=0; ordinal<count; ordinal++) {
    const body = b3.b3RecPlayer_GetBodyId(player,ordinal);
    if (!b3.b3Body_IsValid(body)) continue;
    const locator = b3.b3Body_GetName(body);
    if (!locator) continue;
    if (byLocator.has(locator)) throw new Error(`duplicate replay locator ${locator}`);
    byLocator.set(locator,body);
    ordinalByLocator.set(locator,ordinal);
  }
  const actorBodies = new Map();
  const propBodies = new Map();
  for (const def of entityDefs) {
    const body = byLocator.get(def.locator);
    if (!body) {
      metrics.remapFailures += 1;
      throw new Error(`entity remap missing ${def.netEntityId} via ${def.locator}`);
    }
    if (def.kind === "actor") actorBodies.set(def.netEntityId,body);
    else propBodies.set(def.netEntityId,body);
  }
  return { world, actorBodies, propBodies, entityDefs:[...entityDefs], ordinalByLocator, ownerPlayer:player };
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
  for (const [id,body] of sim.actorBodies) actors.set(id,{ position:bodyPosition(body), rotation:bodyRotation(body) });
  const props = new Map();
  for (const [id,body] of sim.propBodies) props.set(id,{ position:bodyPosition(body), rotation:bodyRotation(body) });
  return { actors, props };
}
function captureDiagnostic(sim) {
  const actors = {};
  const props = {};
  for (const [id,body] of sim.actorBodies) actors[id] = bodyPosition(body);
  for (const [id,body] of sim.propBodies) props[id] = bodyPosition(body);
  return { actors, props };
}
function correctionDelta(before, after) {
  const selfBefore = before.actors.get(selfSessionId)?.position;
  const selfAfter = after.actors.get(selfSessionId)?.position;
  const remoteBefore = before.actors.get(remoteSessionId)?.position;
  const remoteAfter = after.actors.get(remoteSessionId)?.position;
  let prop = 0;
  for (const [id,state] of before.props) {
    const next = after.props.get(id);
    if (next) prop = Math.max(prop,distance3(state.position,next.position));
  }
  return {
    self: selfBefore && selfAfter ? distance3(selfBefore,selfAfter) : 0,
    remote: remoteBefore && remoteAfter ? distance3(remoteBefore,remoteAfter) : 0,
    prop,
  };
}

function previousUsedInput(tick) {
  if (tick <= 0) return { self:zeroInput(), remote:zeroInput() };
  return usedByTick.get(tick-1) || { self:zeroInput(), remote:zeroInput() };
}
function authoritativeInput(tick, sessionId) {
  return consumedByTick.get(tick)?.get(sessionId) || null;
}
function resolveInputsForTick(tick, previous) {
  if (protocolStartTick === null || tick < protocolStartTick) return { self:zeroInput(), remote:zeroInput() };
  const selfAuth = authoritativeInput(tick,selfSessionId);
  const remoteAuth = authoritativeInput(tick,remoteSessionId);
  const self = selfAuth || intendedSelf.get(tick) || previous.self;
  const remote = remoteAuth || peerRemote.get(tick) || previous.remote;
  return { self:{x:self.x,z:self.z}, remote:{x:remote.x,z:remote.z} };
}
function usedInputsChangedAt(tick) {
  const used = usedByTick.get(tick);
  if (!used) return false;
  const resolved = resolveInputsForTick(tick, previousUsedInput(tick));
  return !sameInput(used.self,resolved.self) || !sameInput(used.remote,resolved.remote);
}
function truncateUsedFrom(targetTick) {
  for (const tick of [...usedByTick.keys()]) if (tick >= targetTick) usedByTick.delete(tick);
}
function applyResolvedTick(sim,tick,allowGenerateSelf) {
  if (allowGenerateSelf && protocolStartTick !== null && tick >= protocolStartTick && !intendedSelf.has(tick)) {
    const intended = currentInput();
    intendedSelf.set(tick,{...intended});
    queueInputRecord(tick,intended);
  }
  const previous = previousUsedInput(tick);
  const resolved = resolveInputsForTick(tick,previous);
  usedByTick.set(tick,{ self:{...resolved.self}, remote:{...resolved.remote} });
  const selfBody = sim.actorBodies.get(selfSessionId);
  const remoteBody = sim.actorBodies.get(remoteSessionId);
  if (!selfBody || !remoteBody) throw new Error("predicted actor mapping incomplete");
  applyIntent(selfBody,resolved.self);
  applyIntent(remoteBody,resolved.remote);
}

function createHistory(sim) {
  const historyState = { segments: [], active: null, generation: 0, segmentRotations: 0 };
  localState = { sim, history:historyState, boundaryTick:0 };
  startActiveRecording(0,"initial");
  storeDiagnostic(0);
}
function startActiveRecording(startTick,reason) {
  const historyState = localState.history;
  if (historyState.active) throw new Error("active recording already exists");
  const recording = b3.b3CreateRecording(RECORDING_CAPACITY);
  b3.b3World_StartRecording(localState.sim.world,recording);
  historyState.active = { recording,startTick,frames:0,generation:historyState.generation,reason,seedBytes:b3.b3Recording_GetSize(recording) };
  updateRetainedBytes();
}
function finalizeActiveRecording(reason) {
  const historyState = localState.history;
  const active = historyState.active;
  if (!active) return null;
  b3.b3World_StopRecording(localState.sim.world);
  historyState.active = null;
  const bytes = b3.b3Recording_GetSize(active.recording);
  if (active.frames === 0) {
    b3.b3DestroyRecording(active.recording);
    return null;
  }
  const segment = { ...active, endTick:active.startTick+active.frames, validEndTick:active.startTick+active.frames, bytes, finalizeReason:reason };
  historyState.segments.push(segment);
  updateRetainedBytes();
  return segment;
}
function updateRetainedBytes() {
  if (!localState) return 0;
  let bytes = localState.history.segments.reduce((sum,segment) => sum + segment.bytes,0);
  if (localState.history.active) bytes += b3.b3Recording_GetSize(localState.history.active.recording);
  metrics.maxRetainedBytes = Math.max(metrics.maxRetainedBytes,bytes);
  return bytes;
}
function rotateIfNeeded(boundaryTick) {
  const historyState = localState.history;
  if (!historyState.active || historyState.active.frames < SEGMENT_TICKS) return;
  finalizeActiveRecording("periodic");
  historyState.segmentRotations += 1;
  startActiveRecording(boundaryTick,"periodic");
}
function managedPhysicsStep(tick,allowGenerateSelf) {
  applyResolvedTick(localState.sim,tick,allowGenerateSelf);
  b3.b3World_Step(localState.sim.world,FIXED_DT,simulation.substeps || 4);
  localState.boundaryTick = tick + 1;
  if (!localState.history.active) throw new Error("missing active recording during managed step");
  localState.history.active.frames += 1;
  rotateIfNeeded(localState.boundaryTick);
  updateRetainedBytes();
  storeDiagnostic(localState.boundaryTick);
}
function trimHistory() {
  if (!localState) return;
  const cutoff = localState.boundaryTick - RETAIN_TICKS;
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
  for (const tick of [...diagnosticSamples.keys()]) if (tick < localState.boundaryTick - DIAGNOSTIC_RETAIN_TICKS) diagnosticSamples.delete(tick);
  updateRetainedBytes();
}
function selectCheckpoint(targetTick) {
  const candidates = localState.history.segments.filter((segment) => segment.startTick <= targetTick && segment.validEndTick >= targetTick);
  if (!candidates.length) throw new Error(`history_window_miss: no checkpoint for B(${targetTick}) at B(${localState.boundaryTick})`);
  candidates.sort((a,b) => b.startTick-a.startTick);
  return candidates[0];
}
function invalidateHistoryFrom(targetTick,selected) {
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
  const next = remapSimulation(player,old.entityDefs);
  localState.sim = next;
  destroySimulation(old);
}
function storeDiagnostic(boundaryTick) {
  if (!localState?.sim) return;
  diagnosticSamples.set(boundaryTick,captureDiagnostic(localState.sim));
  for (const tick of [...diagnosticSamples.keys()]) if (tick < boundaryTick-DIAGNOSTIC_RETAIN_TICKS) diagnosticSamples.delete(tick);
}
function correctFrom(targetTick,reason) {
  if (!localState || targetTick >= localState.boundaryTick) return false;
  const currentBoundary = localState.boundaryTick;
  if (!usedInputsChangedAt(targetTick)) return false;
  const before = captureDynamic(localState.sim);

  finalizeActiveRecording("correction-cut");
  const selected = selectCheckpoint(targetTick);
  const seekPrefix = targetTick - selected.startTick;
  const player = b3.b3RecPlayer_CreateFromRecording(selected.recording,0);
  if (!player) throw new Error(`replay player create failed at target ${targetTick}`);
  b3.b3RecPlayer_SeekFrame(player,seekPrefix);
  if (b3.b3RecPlayer_GetFrame(player) !== seekPrefix) {
    b3.b3RecPlayer_Destroy(player);
    throw new Error(`replay seek mismatch at target ${targetTick}`);
  }
  if (b3.b3RecPlayer_HasDiverged(player)) {
    const frame = b3.b3RecPlayer_GetDivergeFrame(player);
    b3.b3RecPlayer_Destroy(player);
    throw new Error(`checkpoint replay diverged at frame ${frame}`);
  }

  invalidateHistoryFrom(targetTick,selected);
  replaceLiveWithPlayer(player);
  localState.history.generation += 1;
  metrics.generationRotations += 1;
  localState.boundaryTick = targetTick;
  truncateUsedFrom(targetTick);
  startActiveRecording(targetTick,`correction-${localState.history.generation}:${reason}`);

  let replayed = seekPrefix;
  for (let tick=targetTick; tick<currentBoundary; tick++) {
    managedPhysicsStep(tick,false);
    replayed += 1;
  }
  const after = captureDynamic(localState.sim);
  const delta = correctionDelta(before,after);
  const rewind = currentBoundary-targetTick;
  metrics.corrections += 1;
  metrics.latestRewind = rewind;
  metrics.maxRewind = Math.max(metrics.maxRewind,rewind);
  metrics.latestReplaySteps = replayed;
  metrics.maxReplaySteps = Math.max(metrics.maxReplaySteps,replayed);
  metrics.latestCorrection = delta;
  metrics.maxCorrection.self = Math.max(metrics.maxCorrection.self,delta.self);
  metrics.maxCorrection.remote = Math.max(metrics.maxCorrection.remote,delta.remote);
  metrics.maxCorrection.prop = Math.max(metrics.maxCorrection.prop,delta.prop);
  trimHistory();
  return true;
}
function earliestChangedTick(candidates) {
  if (!localState) return null;
  const sorted = [...new Set(candidates)].filter((tick) => Number.isInteger(tick) && tick >= 0 && tick < localState.boundaryTick).sort((a,b) => a-b);
  for (const tick of sorted) if (usedInputsChangedAt(tick)) return tick;
  return null;
}
function maybeCorrect(candidates,reason) {
  const target = earliestChangedTick(candidates);
  if (target === null) return false;
  return correctFrom(target,reason);
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
  const url = new URL(`${protocol}//${location.host}/world0-f5/ws`);
  url.searchParams.set("player",callsign);
  url.searchParams.set("run",runKey);
  return url.toString();
}
function queueInputRecord(targetTick,input) {
  metrics.generatedInputRecords += 1;
  pendingBatch.push({ targetTick,x:input.x,z:input.z });
  if (pendingBatch.length < INPUT_BATCH_SIZE) return;
  if (!socket || socket.readyState !== WebSocket.OPEN) throw new Error("input transport closed while generating canonical records");
  batchSeq += 1;
  const records = pendingBatch.splice(0,INPUT_BATCH_SIZE);
  socket.send(JSON.stringify({ type:"f5_input_batch", batchSeq, records }));
  metrics.sentBatches += 1;
}
function sendPing() {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  const id = crypto.randomUUID();
  pendingPings.set(id,performance.now());
  socket.send(JSON.stringify({ type:"f5_ping", id }));
  if (pendingPings.size > 8) pendingPings.delete(pendingPings.keys().next().value);
}
function authorityTickEstimate(now=performance.now()) {
  if (!phaseAnchor) return null;
  return phaseAnchor.tick + (now-phaseAnchor.at)/STEP_MS;
}
function updatePhaseFromPong(message,receivedAt) {
  const sentAt = pendingPings.get(message.id);
  if (sentAt === undefined) return;
  pendingPings.delete(message.id);
  const rtt = Math.max(0,receivedAt-sentAt);
  rttSamples.push(rtt);
  if (rttSamples.length > 40) rttSamples.splice(0,rttSamples.length-40);
  phaseAnchor = { tick:message.boundaryTick + rtt/(2*STEP_MS), at:receivedAt };
}
function updatePhaseFromStart(message,receivedAt) {
  const medianRtt = rttSamples.length ? percentile(rttSamples,0.5) : 0;
  phaseAnchor = { tick:message.boundaryTick + medianRtt/(2*STEP_MS), at:receivedAt };
}
function resetProtocolState() {
  intendedSelf.clear();
  peerRemote.clear();
  consumedByTick.clear();
  usedByTick.clear();
  diagnosticSamples.clear();
  pendingBatch = [];
  batchSeq = 0;
  protocolStartTick = null;
  remoteSessionId = null;
  phaseAnchor = null;
  Object.assign(metrics,{
    generatedInputRecords:0,sentBatches:0,serverLate:0,serverRejected:0,consumedSelfFresh:0,consumedSelfMissing:0,
    peerFutureRecords:0,consumedFreshTotal:0,consumedMissingTotal:0,corrections:0,latestRewind:0,maxRewind:0,latestReplaySteps:0,maxReplaySteps:0,maxRetainedBytes:0,
    generationRotations:0,remapFailures:0,
  });
  metrics.latestCorrection={self:0,remote:0,prop:0};
  metrics.maxCorrection={self:0,remote:0,prop:0};
  metrics.latestSameTick={self:NaN,remote:NaN,prop:NaN};
  metrics.maxSameTick={self:0,remote:0,prop:0};
  metrics.latestSnapshotAge=NaN; metrics.maxSnapshotAge=0;
}
function classifyBatchAck(message) {
  if (message.batchStatus === "stale_batch") metrics.serverRejected += 1;
  for (const record of message.records || []) {
    if (record.status === "late") metrics.serverLate += 1;
    if (["before_start","too_future","conflict"].includes(record.status)) metrics.serverRejected += 1;
  }
}
function handlePeerRecords(message) {
  if (message.protocolRevision !== PROTOCOL_REVISION) throw new Error(`peer protocol revision mismatch ${message.protocolRevision}`);
  if (!remoteSessionId || message.senderSessionId !== remoteSessionId) return;
  const candidates=[];
  for (const record of message.records || []) {
    if (!Number.isInteger(record.targetTick) || !Number.isFinite(record.x) || !Number.isFinite(record.z)) continue;
    const existing = peerRemote.get(record.targetTick);
    if (existing && !sameInput(existing,record)) throw new Error(`conflicting relayed remote record at ${record.targetTick}`);
    if (!existing) {
      peerRemote.set(record.targetTick,{x:record.x,z:record.z});
      metrics.peerFutureRecords += 1;
      candidates.push(record.targetTick);
    }
  }
  maybeCorrect(candidates,"peer-record");
}
function handleConsumed(message) {
  if (!Number.isInteger(message.targetTick)) return;
  const tick = message.targetTick;
  const map = new Map();
  for (const player of message.players || []) {
    if (!player.sessionId || !Number.isFinite(player.x) || !Number.isFinite(player.z)) continue;
    map.set(player.sessionId,{x:player.x,z:player.z,fresh:Boolean(player.fresh)});
    if (player.fresh) metrics.consumedFreshTotal += 1; else metrics.consumedMissingTotal += 1;
    if (player.sessionId === selfSessionId) {
      if (player.fresh) metrics.consumedSelfFresh += 1;
      else metrics.consumedSelfMissing += 1;
    }
  }
  consumedByTick.set(tick,map);
  maybeCorrect([tick],"authority-consumed");
}
function compareSnapshot(message) {
  const boundaryTick = message.boundaryTick;
  if (!Number.isInteger(boundaryTick)) return;
  const predicted = diagnosticSamples.get(boundaryTick);
  if (localState) { metrics.latestSnapshotAge=Math.max(0,localState.boundaryTick-boundaryTick); metrics.maxSnapshotAge=Math.max(metrics.maxSnapshotAge,metrics.latestSnapshotAge); }
  if (!predicted) return;
  const self = (message.players || []).find((player) => player.sessionId === selfSessionId);
  const remote = (message.players || []).find((player) => player.sessionId === remoteSessionId);
  const selfPredicted = predicted.actors[selfSessionId];
  const remotePredicted = predicted.actors[remoteSessionId];
  const selfResidual = self && selfPredicted ? distance3(selfPredicted,self.position || [0,0,0]) : NaN;
  const remoteResidual = remote && remotePredicted ? distance3(remotePredicted,remote.position || [0,0,0]) : NaN;
  let propResidual = 0;
  for (const prop of message.props || []) {
    const local = predicted.props[prop.id];
    if (local) propResidual = Math.max(propResidual,distance3(local,prop.position || [0,0,0]));
  }
  metrics.latestSameTick={self:selfResidual,remote:remoteResidual,prop:propResidual};
  if (Number.isFinite(selfResidual)) metrics.maxSameTick.self=Math.max(metrics.maxSameTick.self,selfResidual);
  if (Number.isFinite(remoteResidual)) metrics.maxSameTick.remote=Math.max(metrics.maxSameTick.remote,remoteResidual);
  metrics.maxSameTick.prop=Math.max(metrics.maxSameTick.prop,propResidual);
}
function handleStart(message) {
  if (message.protocolRevision !== PROTOCOL_REVISION) throw new Error(`start protocol mismatch ${message.protocolRevision}`);
  if (!Number.isInteger(message.protocolStartTick) || !Number.isInteger(message.boundaryTick)) throw new Error("invalid F5 start tick contract");
  if (message.boundaryTick !== 0) throw new Error(`first F5 gate expects B(0) seed, got B(${message.boundaryTick})`);
  simulation={...simulation,...(message.simulation || {})};
  if (simulation.simulationHz !== 60 || simulation.substeps !== 4 || simulation.predictionLeadTicks !== PREDICTION_LEAD_TICKS || simulation.inputBatchSize !== INPUT_BATCH_SIZE) {
    throw new Error(`F5 simulation contract mismatch ${JSON.stringify(simulation)}`);
  }
  destroyLocalState();
  intendedSelf.clear(); peerRemote.clear(); consumedByTick.clear(); usedByTick.clear(); diagnosticSamples.clear();
  protocolStartTick=message.protocolStartTick;
  const sim=createSimulationFromState(message.state);
  createHistory(sim);
  updatePhaseFromStart(message,performance.now());
  if (!selfMesh) selfMesh=createPlayerMesh(selfMaterial);
  if (!remoteMesh) remoteMesh=createPlayerMesh(remoteMaterial);
  networkState="live · raw scheduled-history";
  joystick.classList.add("active");
  clearNotice();
  syncMeshes();
}
function handleMessage(message) {
  if (message.type === "f5_welcome") {
    if (message.protocolRevision !== PROTOCOL_REVISION) throw new Error(`welcome protocol mismatch ${message.protocolRevision}`);
    selfSessionId=message.selfSessionId;
    selfSlot=message.slot;
    simulation={...simulation,...(message.simulation || {})};
    networkState=message.waitingForPeer ? "waiting for peer" : "peer joined";
    return;
  }
  if (message.type === "f5_roster") {
    const players=message.players || [];
    const remote=players.find((player) => player.sessionId !== selfSessionId);
    if (remote) remoteSessionId=remote.sessionId;
    if (players.length===2 && socket?.readyState===WebSocket.OPEN) {
      networkState="both connected · ready";
      socket.send(JSON.stringify({type:"f5_ready"}));
    }
    return;
  }
  if (message.type === "f5_ready_ack") { networkState="ready · awaiting start"; return; }
  if (message.type === "f5_start") { handleStart(message); return; }
  if (message.type === "f5_peer_records") { handlePeerRecords(message); return; }
  if (message.type === "f5_consumed") { handleConsumed(message); return; }
  if (message.type === "f5_batch_ack") { classifyBatchAck(message); return; }
  if (message.type === "f5_snapshot") { compareSnapshot(message); return; }
  if (message.type === "f5_pong") { updatePhaseFromPong(message,performance.now()); return; }
  if (message.type === "f5_error") throw new Error(`F5 server: ${message.error}`);
}
function connect() {
  networkState="connecting";
  socket=new WebSocket(socketUrl());
  socket.addEventListener("open",()=>{
    networkState="syncing";
    sendPing();
    pingTimer=setInterval(sendPing,PING_INTERVAL_MS);
    hudTimer=setInterval(updateHud,HUD_INTERVAL_MS);
  });
  socket.addEventListener("message",(event)=>{
    if (typeof event.data !== "string") return;
    try { handleMessage(JSON.parse(event.data)); }
    catch (error) {
      const text=error instanceof Error?error.message:String(error);
      networkState="candidate error";
      showNotice(text);
      console.error(error);
      try { socket?.close(1011,"f5_candidate_error"); } catch { /* close race */ }
    }
  });
  socket.addEventListener("close",(event)=>{
    playing=false;
    if (pingTimer) clearInterval(pingTimer);
    if (hudTimer) clearInterval(hudTimer);
    pingTimer=hudTimer=null;
    pendingPings.clear();
    networkState=`closed ${event.code}`;
    showNotice("F5 connection ended. This gate intentionally requires a fresh two-device run after disconnect.");
  });
  socket.addEventListener("error",()=>{networkState="network error";});
}

function advancePrediction() {
  if (!localState || !phaseAnchor) return;
  const estimate=authorityTickEstimate();
  if (!Number.isFinite(estimate)) return;
  const targetBoundary=Math.max(0,Math.floor(estimate+(simulation.predictionLeadTicks||PREDICTION_LEAD_TICKS)));
  let steps=0;
  while (localState.boundaryTick<targetBoundary && steps<MAX_PREDICTION_STEPS_PER_FRAME) {
    managedPhysicsStep(localState.boundaryTick,true);
    trimHistory();
    steps+=1;
  }
  if (localState.boundaryTick<targetBoundary-MAX_PREDICTION_STEPS_PER_FRAME) {
    networkState="prediction backlog";
  }
}
function syncMeshes() {
  if (!localState?.sim || !selfSessionId || !remoteSessionId) return;
  if (!selfMesh) selfMesh=createPlayerMesh(selfMaterial);
  if (!remoteMesh) remoteMesh=createPlayerMesh(remoteMaterial);
  const selfBody=localState.sim.actorBodies.get(selfSessionId);
  const remoteBody=localState.sim.actorBodies.get(remoteSessionId);
  if (selfBody) {
    selfMesh.position.fromArray(bodyPosition(selfBody));
    selfMesh.quaternion.fromArray(bodyRotation(selfBody)).normalize();
  }
  if (remoteBody) {
    remoteMesh.position.fromArray(bodyPosition(remoteBody));
    remoteMesh.quaternion.fromArray(bodyRotation(remoteBody)).normalize();
  }
  for (const [id,body] of localState.sim.propBodies) {
    const mesh=getPropMesh(id);
    mesh.position.fromArray(bodyPosition(body));
    mesh.quaternion.fromArray(bodyRotation(body)).normalize();
  }
}
function updateCamera() {
  if (!selfMesh) return;
  camera.position.set(selfMesh.position.x+7.2,selfMesh.position.y+6.2,selfMesh.position.z+8.4);
  camera.lookAt(selfMesh.position.x,selfMesh.position.y+0.45,selfMesh.position.z);
}
function updateHud() {
  const estimate=authorityTickEstimate();
  const boundary=localState?.boundaryTick;
  const lead=Number.isFinite(estimate)&&Number.isInteger(boundary)?boundary-estimate:NaN;
  metric.net.textContent=networkState;
  metric.run.textContent=`${runKey || "—"} / ${selfSlot ?? "—"}`;
  metric.ticks.textContent=Number.isFinite(estimate)&&Number.isInteger(boundary)?`${estimate.toFixed(1)} / ${boundary}`:"—";
  metric.lead.textContent=Number.isFinite(lead)?`${lead.toFixed(2)} ticks`:"—";
  metric.rtt.textContent=rttSamples.length?`${percentile(rttSamples,0.5).toFixed(0)} ms`:"—";
  metric.input.textContent=`${metrics.generatedInputRecords} / ${metrics.sentBatches}`;
  metric.reject.textContent=`${metrics.serverLate} / ${metrics.serverRejected}`;
  metric.consume.textContent=`${metrics.consumedFreshTotal} / ${metrics.consumedMissingTotal}`;
  metric.peer.textContent=String(metrics.peerFutureRecords);
  metric.corrections.textContent=String(metrics.corrections);
  metric.rewind.textContent=`${metrics.latestRewind} / ${metrics.maxRewind} ticks`;
  metric.replay.textContent=`${metrics.latestReplaySteps} / ${metrics.maxReplaySteps}`;
  metric.memory.textContent=formatBytes(metrics.maxRetainedBytes);
  metric.generations.textContent=String(metrics.generationRotations);
  metric.remap.textContent=String(metrics.remapFailures);
  metric.self.textContent=`${formatMeters(metrics.latestCorrection.self)} / ${formatMeters(metrics.maxCorrection.self)}`;
  metric.remote.textContent=`${formatMeters(metrics.latestCorrection.remote)} / ${formatMeters(metrics.maxCorrection.remote)}`;
  metric.prop.textContent=`${formatMeters(metrics.latestCorrection.prop)} / ${formatMeters(metrics.maxCorrection.prop)}`;
  metric["same-self"].textContent=`${formatMeters(metrics.latestSameTick.self)} / ${formatMeters(metrics.maxSameTick.self)}`;
  metric["same-remote"].textContent=`${formatMeters(metrics.latestSameTick.remote)} / ${formatMeters(metrics.maxSameTick.remote)}`;
  metric["same-prop"].textContent=`${formatMeters(metrics.latestSameTick.prop)} / ${formatMeters(metrics.maxSameTick.prop)}`;
  metric["snapshot-age"].textContent=Number.isFinite(metrics.latestSnapshotAge)?`${metrics.latestSnapshotAge} / ${metrics.maxSnapshotAge} ticks`:"—";
}
function enterWorld() {
  callsign=callsignInput.value.trim();
  runKey=runInput.value.trim();
  if (!/^[A-Za-z0-9_-]{1,24}$/.test(callsign)) { bootStatus.textContent="Callsign: 1–24 chars, letters / digits / _ / -"; return; }
  if (!/^[A-Za-z0-9_-]{1,20}$/.test(runKey)) { bootStatus.textContent="Run key: 1–20 chars, letters / digits / _ / -"; return; }
  localStorage.setItem("ws0-f5-callsign",callsign);
  localStorage.setItem("ws0-f5-run",runKey);
  const url=new URL(location.href);
  url.searchParams.set("run",runKey);
  window.history.replaceState(null,"",url);
  playing=true;
  resetProtocolState();
  boot.classList.add("hidden");
  hud.classList.remove("hidden");
  clearNotice();
  connect();
}

function updateJoystick(event) {
  const rect=joystick.getBoundingClientRect();
  const cx=rect.left+rect.width/2, cy=rect.top+rect.height/2;
  let dx=event.clientX-cx, dy=event.clientY-cy;
  const radius=45;
  const length=Math.hypot(dx,dy);
  if (length>radius) { dx=dx/length*radius; dy=dy/length*radius; }
  joystickKnob.style.transform=`translate(${dx}px, ${dy}px)`;
  touchInput={x:dx/radius,z:dy/radius};
}
let joystickPointer=null;
joystick.addEventListener("pointerdown",(event)=>{
  event.preventDefault();
  joystickPointer=event.pointerId;
  joystick.setPointerCapture(event.pointerId);
  updateJoystick(event);
});
joystick.addEventListener("pointermove",(event)=>{
  if (event.pointerId!==joystickPointer) return;
  event.preventDefault();
  updateJoystick(event);
});
function releaseJoystick(event) {
  if (event.pointerId!==joystickPointer) return;
  joystickPointer=null;
  touchInput=zeroInput();
  joystickKnob.style.transform="translate(0,0)";
}
joystick.addEventListener("pointerup",releaseJoystick);
joystick.addEventListener("pointercancel",releaseJoystick);

enterButton.addEventListener("click",enterWorld);
callsignInput.addEventListener("keydown",(event)=>{if(event.key==="Enter"&&!enterButton.disabled)enterWorld();});
runInput.addEventListener("keydown",(event)=>{if(event.key==="Enter"&&!enterButton.disabled)enterWorld();});
window.addEventListener("keydown",(event)=>{if(!movementCodes.has(event.code))return;event.preventDefault();keys.add(event.code);});
window.addEventListener("keyup",(event)=>{if(!movementCodes.has(event.code))return;keys.delete(event.code);});
window.addEventListener("blur",()=>{keys.clear();touchInput=zeroInput();joystickKnob.style.transform="translate(0,0)";});
window.addEventListener("resize",()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
window.addEventListener("beforeunload",()=>{try{socket?.close(1000,"page_unload");}catch{/* unload */}});

window.__WS0_F5__={
  snapshot(){
    const estimate=authorityTickEstimate();
    return {
      clientRevision:CLIENT_REVISION,
      protocolRevision:PROTOCOL_REVISION,
      playing,networkState,runKey,selfSessionId,remoteSessionId,selfSlot,protocolStartTick,
      authorityTickEstimate:estimate,
      localPredictedBoundaryTick:localState?.boundaryTick??null,
      predictionLead:Number.isFinite(estimate)&&localState?localState.boundaryTick-estimate:null,
      rttMedianMs:rttSamples.length?percentile(rttSamples,0.5):null,
      generatedInputRecords:metrics.generatedInputRecords,sentBatches:metrics.sentBatches,
      serverLateRecords:metrics.serverLate,serverRejectedRecords:metrics.serverRejected,
      consumedFresh:metrics.consumedFreshTotal,consumedMissing:metrics.consumedMissingTotal,
      consumedSelfFresh:metrics.consumedSelfFresh,consumedSelfMissing:metrics.consumedSelfMissing,
      peerFutureRecords:metrics.peerFutureRecords,
      corrections:metrics.corrections,latestRewindTicks:metrics.latestRewind,maxRewindTicks:metrics.maxRewind,
      latestReplaySteps:metrics.latestReplaySteps,maxReplaySteps:metrics.maxReplaySteps,
      maxRetainedRecordingBytes:metrics.maxRetainedBytes,replayGenerationRotations:metrics.generationRotations,entityRemapFailures:metrics.remapFailures,
      correction:{latest:{...metrics.latestCorrection},max:{...metrics.maxCorrection}},
      sameTickResidual:{latest:{...metrics.latestSameTick},max:{...metrics.maxSameTick}},
      snapshotAge:{latest:metrics.latestSnapshotAge,max:metrics.maxSnapshotAge},
      historySegments:localState?.history?.segments?.map((segment)=>({startTick:segment.startTick,validEndTick:segment.validEndTick,generation:segment.generation,bytes:segment.bytes}))??[],
    };
  },
};

function animate() {
  requestAnimationFrame(animate);
  if (playing) {
    try {
      advancePrediction();
      syncMeshes();
      updateCamera();
    } catch (error) {
      const text=error instanceof Error?error.message:String(error);
      networkState="candidate error";
      showNotice(text);
      console.error(error);
      try { socket?.close(1011,"f5_prediction_error"); } catch { /* close race */ }
      playing=false;
    }
  }
  renderer.render(scene,camera);
}
camera.position.set(0,7,14);
camera.lookAt(0,0.8,0);
requestAnimationFrame(animate);
