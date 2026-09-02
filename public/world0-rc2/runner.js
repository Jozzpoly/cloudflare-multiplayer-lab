import { FixedStepClock } from "../world0-a2r/fixed-step-clock.js";

const RC2_REVISION = "ws0-rc2-sparse-authority-closure-v1";
const PROBE_REVISION = "ws0-a2r-two-client-intent-v1";
const BOX3D_URL = "https://cdn.jsdelivr.net/npm/box3d.js@0.1.1/dist/box3d.inline.mjs";
const FIXED_DT = 1 / 60;
const INPUT_INTERVAL_MS = 66;
const PLAYER_ACCELERATION = 28;
const PLAYER_DECELERATION = 36;
const EPS = 1e-9;
const TRACKED_PROP_IDS = ["prop-0", "prop-1", "prop-2", "prop-3"];
const HISTORY_LIMIT = 1200;
const AUTHORITY_LIMIT = 240;
const PEER_EVENT_LIMIT = 720;
const CLOSURE_EVENT_LIMIT = 32;

const params = new URLSearchParams(location.search);
const callsign = params.get("player") || `rc2-${crypto.randomUUID().slice(0, 6)}`;
const remoteDelayMs = Math.max(0, Number(params.get("delayMs") || 0));
const remoteJitterMs = Math.max(0, Number(params.get("jitterMs") || 0));
const jitterSeed = Math.trunc(Number(params.get("jitterSeed") || 1));
const statusElement = document.querySelector("#status");

let b3 = null;
let socket = null;
let inputTimer = null;
let selfSessionId = null;
let networkState = "booting";
let simulation = { simulationHz: 60, snapshotHz: 10, substeps: 4, inputLeaseMs: 600, playerSpeed: 5.2 };
let inputSeq = 0;
let latestAck = 0;
let latestTelemetry = null;
let playerCount = 0;
let peerReceived = 0;
let peerApplied = 0;
let snapshotCount = 0;
let currentSelfInput = { x: 0, z: 0 };
let lastSentInput = null;
let currentRemoteInput = { x: 0, z: 0 };
let lastRemoteAppliedAt = -Infinity;
let lastPeerSeqApplied = 0;
let lastScheduledPeerApplyAt = -Infinity;
let traceGeneration = 0;
let traceTimers = [];
let lastFrameAt = performance.now();
let latestAuthorityProps = [];
let latestAuthorityTick = NaN;
let latestAuthorityServerTime = NaN;

const peerQueue = [];
const peerEvents = [];
const localHistory = [];
const authorityHistory = [];
const appliedTraceEvents = [];
const closureEvents = [];

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

function setStatus(text) {
  networkState = text;
  if (statusElement) statusElement.textContent = `${RC2_REVISION}\n${text}`;
}

function pushBounded(target, value, limit) {
  target.push(value);
  if (target.length > limit) target.splice(0, target.length - limit);
}

function finiteNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function vectorDistance(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return Infinity;
  return Math.hypot(...a.map((value, index) => value - b[index]));
}

function moveToward2(currentX, currentZ, targetX, targetZ, maxDelta) {
  const dx = targetX - currentX;
  const dz = targetZ - currentZ;
  const distance = Math.hypot(dx, dz);
  if (distance <= maxDelta || distance < EPS) return [targetX, targetZ];
  const scale = maxDelta / distance;
  return [currentX + dx * scale, currentZ + dz * scale];
}

function normalizedInput(x, z) {
  x = finiteNumber(x);
  z = finiteNumber(z);
  const length = Math.hypot(x, z);
  if (length <= 1) return { x, z };
  return { x: x / length, z: z / length };
}

function deterministicJitter(seq) {
  if (remoteJitterMs <= 0) return 0;
  let value = (Math.imul((seq | 0) ^ jitterSeed, 1664525) + 1013904223) >>> 0;
  value ^= value >>> 16;
  const unit = (value >>> 0) / 0xffffffff;
  return (unit * 2 - 1) * remoteJitterMs;
}

function socketUrl() {
  const url = new URL("/world0/ws", location.href);
  url.protocol = location.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("player", callsign);
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
}

function ensureRemote(player) {
  if (!player || player.sessionId === selfSessionId || !local.world) return;
  if (local.remote?.sessionId === player.sessionId) return;
  if (local.remote) throw new Error("RC2 received more than one remote player");
  local.remote = {
    sessionId: player.sessionId,
    playerId: player.id,
    body: createPlayerBody(player),
  };
}

function removeRemote(sessionId) {
  if (!local.remote || local.remote.sessionId !== sessionId) return;
  try { b3.b3DestroyBody(local.remote.body); } catch { /* teardown race */ }
  local.remote = null;
  currentRemoteInput = { x: 0, z: 0 };
  lastRemoteAppliedAt = -Infinity;
  lastPeerSeqApplied = 0;
  peerQueue.splice(0, peerQueue.length);
}

function seedLocalWorld(state) {
  destroyLocalWorld();
  const players = state?.players || [];
  const props = state?.props || [];
  if (players.length > 2) throw new Error("RC2 scope exceeded: more than two players");
  const self = players.find((player) => player.sessionId === selfSessionId);
  if (!self) throw new Error("RC2 welcome missing self player");

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
  }

  local.selfBody = createPlayerBody(self);
  for (const player of players) ensureRemote(player);
  local.initialized = true;
  playerCount = players.length;
  recordLocalSample();
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

function bodyPosition(body) {
  if (!body) return null;
  const out = [0, 0, 0];
  b3.b3Body_GetPosition(out, body);
  return [out[0], out[1], out[2]];
}

function bodyLinearVelocity(body) {
  if (!body) return null;
  const out = [0, 0, 0];
  b3.b3Body_GetLinearVelocity(out, body);
  return [out[0], out[1], out[2]];
}

function bodyAngularVelocity(body) {
  if (!body) return null;
  const out = [0, 0, 0];
  b3.b3Body_GetAngularVelocity(out, body);
  return [out[0], out[1], out[2]];
}

function trackedRowFromBodies() {
  return TRACKED_PROP_IDS.map((id) => bodyPosition(local.propBodies.get(id)) || [NaN, NaN, NaN]);
}

function trackedRowFromSnapshot(props) {
  const byId = new Map((props || []).map((prop) => [prop.id, prop.position]));
  return TRACKED_PROP_IDS.map((id) => {
    const value = byId.get(id);
    return Array.isArray(value) ? [value[0], value[1], value[2]] : [NaN, NaN, NaN];
  });
}

function recordLocalSample() {
  if (!local.initialized || !local.selfBody) return;
  pushBounded(localHistory, {
    wall: Date.now(),
    perf: performance.now(),
    step: local.steps,
    self: bodyPosition(local.selfBody),
    remote: local.remote ? bodyPosition(local.remote.body) : null,
    row: trackedRowFromBodies(),
  }, HISTORY_LIMIT);
}

function applyAuthorityPropsOnce(label = "manual") {
  if (!local.initialized || !local.world) throw new Error("RC2 local world is not ready");
  if (!latestAuthorityProps.length) throw new Error("RC2 has no authoritative prop snapshot yet");

  const propEvents = [];
  for (const prop of latestAuthorityProps) {
    const body = local.propBodies.get(prop.id);
    if (!body || !Array.isArray(prop.position) || prop.position.length !== 3 || !Array.isArray(prop.rotation) || prop.rotation.length !== 4) continue;

    const beforePosition = bodyPosition(body);
    const beforeLinear = bodyLinearVelocity(body);
    const beforeAngular = bodyAngularVelocity(body);
    b3.b3Body_SetTransform(body, [...prop.position], [...prop.rotation]);

    const transformedLinear = bodyLinearVelocity(body);
    const transformedAngular = bodyAngularVelocity(body);
    if (vectorDistance(beforeLinear, transformedLinear) > 1e-12) b3.b3Body_SetLinearVelocity(body, beforeLinear);
    if (vectorDistance(beforeAngular, transformedAngular) > 1e-12) b3.b3Body_SetAngularVelocity(body, beforeAngular);

    const afterLinear = bodyLinearVelocity(body);
    const afterAngular = bodyAngularVelocity(body);
    propEvents.push({
      id: prop.id,
      beforePosition,
      authorityPosition: [...prop.position],
      positionCorrection: vectorDistance(beforePosition, prop.position),
      preservedLinearVelocity: [...beforeLinear],
      preservedAngularVelocity: [...beforeAngular],
      linearVelocityMutation: vectorDistance(beforeLinear, afterLinear),
      angularVelocityMutation: vectorDistance(beforeAngular, afterAngular),
    });
  }

  const event = {
    label: String(label),
    wall: Date.now(),
    perf: performance.now(),
    localStep: local.steps,
    authorityTick: latestAuthorityTick,
    authorityServerTime: latestAuthorityServerTime,
    propCount: propEvents.length,
    props: propEvents,
  };
  pushBounded(closureEvents, event, CLOSURE_EVENT_LIMIT);
  recordLocalSample();
  return event;
}

function applyDuePeerInputs(now) {
  while (peerQueue.length && peerQueue[0].applyAt <= now) {
    const event = peerQueue.shift();
    if (event.seq <= lastPeerSeqApplied) continue;
    lastPeerSeqApplied = event.seq;
    currentRemoteInput = { x: event.x, z: event.z };
    lastRemoteAppliedAt = now;
    peerApplied += 1;
    event.appliedAt = now;
  }
}

function remoteInputForStep(now) {
  if (now - lastRemoteAppliedAt > simulation.inputLeaseMs) return { x: 0, z: 0 };
  return currentRemoteInput;
}

function stepLocalPhysics(frameDt) {
  if (!local.initialized || !local.world || !local.selfBody) return;
  localClock.advance(frameDt, () => {
    const now = performance.now();
    applyDuePeerInputs(now);
    applyIntent(local.selfBody, currentSelfInput);
    if (local.remote) applyIntent(local.remote.body, remoteInputForStep(now));
    b3.b3World_Step(local.world, FIXED_DT, simulation.substeps || 4);
    local.steps = localClock.totalSteps;
    local.droppedSteps = localClock.totalDroppedSteps;
    recordLocalSample();
  });
  local.steps = localClock.totalSteps;
  local.droppedSteps = localClock.totalDroppedSteps;
}

function sendInput(force = false) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return false;
  const input = normalizedInput(currentSelfInput.x, currentSelfInput.z);
  const changed = !lastSentInput || Math.abs(lastSentInput.x - input.x) > EPS || Math.abs(lastSentInput.z - input.z) > EPS;
  if (!force && !changed) return false;
  inputSeq += 1;
  lastSentInput = { ...input };
  socket.send(JSON.stringify({ type: "input", seq: inputSeq, x: input.x, z: input.z }));
  return true;
}

function setSelfInput(x, z, source = "trace") {
  currentSelfInput = normalizedInput(x, z);
  const applied = {
    wall: Date.now(),
    perf: performance.now(),
    source,
    x: currentSelfInput.x,
    z: currentSelfInput.z,
  };
  pushBounded(appliedTraceEvents, applied, 120);
  sendInput(false);
  return applied;
}

function scheduleTrace(events, epochMs) {
  if (!Array.isArray(events) || !Number.isFinite(epochMs)) throw new Error("invalid RC2 trace schedule");
  traceGeneration += 1;
  const generation = traceGeneration;
  for (const timer of traceTimers) clearTimeout(timer);
  traceTimers = [];
  const normalized = events.map((event, index) => ({
    atMs: Math.max(0, finiteNumber(event.atMs)),
    x: finiteNumber(event.x),
    z: finiteNumber(event.z),
    index,
  })).sort((a, b) => a.atMs - b.atMs || a.index - b.index);

  for (const event of normalized) {
    const due = epochMs + event.atMs;
    const timer = setTimeout(() => {
      if (generation !== traceGeneration) return;
      setSelfInput(event.x, event.z, `trace:${event.index}`);
    }, Math.max(0, due - Date.now()));
    traceTimers.push(timer);
  }
  return { generation, epochMs, events: normalized };
}

function queuePeerInput(message) {
  const receivedAt = performance.now();
  const jitter = deterministicJitter(message.seq);
  const nominalApplyAt = receivedAt + Math.max(0, remoteDelayMs + jitter);
  const applyAt = Math.max(nominalApplyAt, lastScheduledPeerApplyAt + 0.001);
  lastScheduledPeerApplyAt = applyAt;
  const event = {
    seq: Math.trunc(message.seq),
    x: finiteNumber(message.x),
    z: finiteNumber(message.z),
    serverTime: finiteNumber(message.serverTime, NaN),
    receivedWall: Date.now(),
    receivedAt,
    jitter,
    applyAt,
    appliedAt: null,
  };
  peerQueue.push(event);
  peerReceived += 1;
  pushBounded(peerEvents, event, PEER_EVENT_LIMIT);
}

function recordAuthoritySnapshot(message) {
  const players = message.players || [];
  playerCount = players.length;
  const self = players.find((player) => player.sessionId === selfSessionId);
  const remote = players.find((player) => player.sessionId !== selfSessionId) || null;
  if (self && Number.isFinite(self.ack)) latestAck = self.ack;
  for (const player of players) if (player.sessionId !== selfSessionId) ensureRemote(player);
  if (local.remote && !players.some((player) => player.sessionId === local.remote.sessionId)) removeRemote(local.remote.sessionId);

  latestTelemetry = message.telemetry || latestTelemetry;
  latestAuthorityTick = finiteNumber(message.tick, NaN);
  latestAuthorityServerTime = finiteNumber(message.serverTime, NaN);
  latestAuthorityProps = (message.props || []).map((prop) => ({
    id: prop.id,
    position: Array.isArray(prop.position) ? [...prop.position] : null,
    rotation: Array.isArray(prop.rotation) ? [...prop.rotation] : null,
  }));
  snapshotCount += 1;
  pushBounded(authorityHistory, {
    serverTime: latestAuthorityServerTime,
    receivedWall: Date.now(),
    tick: latestAuthorityTick,
    self: self?.position ? [...self.position] : null,
    remote: remote?.position ? [...remote.position] : null,
    row: trackedRowFromSnapshot(message.props),
  }, AUTHORITY_LIMIT);
}

function handleMessage(message) {
  if (message.type === "welcome") {
    selfSessionId = message.selfSessionId;
    simulation = { ...simulation, ...(message.simulation || {}) };
    if (simulation.simulationHz !== 60 || simulation.substeps !== 4) {
      throw new Error(`RC2 contract mismatch: ${simulation.simulationHz} Hz / ${simulation.substeps} substeps`);
    }
    latestTelemetry = message.state?.telemetry || latestTelemetry;
    seedLocalWorld(message.state);
    setStatus("live");
    return;
  }

  if (message.type === "peer_input") {
    if (message.probeRevision !== PROBE_REVISION) throw new Error(`RC2 peer revision mismatch: ${message.probeRevision}`);
    if (!Number.isFinite(message.seq) || !Number.isFinite(message.x) || !Number.isFinite(message.z)) return;
    queuePeerInput(message);
    return;
  }

  if (message.type === "snapshot") {
    recordAuthoritySnapshot(message);
    return;
  }

  if (message.type === "player_left") {
    removeRemote(message.sessionId);
    playerCount = Math.max(1, playerCount - 1);
    return;
  }

  if (message.type === "error") throw new Error(`RC2 server error: ${message.error}`);
}

function connect() {
  setStatus("connecting");
  socket = new WebSocket(socketUrl());
  socket.addEventListener("open", () => {
    setStatus("syncing");
    sendInput(true);
    inputTimer = setInterval(() => sendInput(true), INPUT_INTERVAL_MS);
  });
  socket.addEventListener("message", (event) => {
    if (typeof event.data !== "string") return;
    try {
      handleMessage(JSON.parse(event.data));
    } catch (error) {
      setStatus(`error: ${error instanceof Error ? error.message : String(error)}`);
      try { socket.close(1011, "rc2_candidate_error"); } catch { /* ignore */ }
    }
  });
  socket.addEventListener("close", (event) => {
    if (inputTimer) clearInterval(inputTimer);
    inputTimer = null;
    if (!networkState.startsWith("error:")) setStatus(`closed:${event.code}`);
  });
  socket.addEventListener("error", () => setStatus("network-error"));
}

function snapshot() {
  return {
    revision: RC2_REVISION,
    probeRevision: PROBE_REVISION,
    callsign,
    networkState,
    remoteDelayMs,
    remoteJitterMs,
    jitterSeed,
    selfSessionId,
    playerCount,
    inputSeq,
    latestAck,
    peerReceived,
    peerApplied,
    lastPeerSeqApplied,
    snapshotCount,
    localSteps: local.steps,
    localDroppedSteps: local.droppedSteps,
    hasRemoteBody: Boolean(local.remote),
    queueDepth: peerQueue.length,
    telemetry: latestTelemetry ? { ...latestTelemetry } : null,
    selfPosition: local.selfBody ? bodyPosition(local.selfBody) : null,
    remotePosition: local.remote ? bodyPosition(local.remote.body) : null,
    row: local.initialized ? trackedRowFromBodies() : null,
    latestAuthorityTick,
    latestAuthorityServerTime,
    latestAuthorityPropCount: latestAuthorityProps.length,
    closureCount: closureEvents.length,
  };
}

function exportEvidence() {
  return {
    meta: snapshot(),
    traceEvents: appliedTraceEvents.map((event) => ({ ...event })),
    peerEvents: peerEvents.map((event) => ({ ...event })),
    closureEvents: closureEvents.map((event) => ({
      ...event,
      props: event.props.map((prop) => ({ ...prop })),
    })),
    localHistory: localHistory.map((sample) => ({
      ...sample,
      self: sample.self ? [...sample.self] : null,
      remote: sample.remote ? [...sample.remote] : null,
      row: sample.row.map((position) => [...position]),
    })),
    authorityHistory: authorityHistory.map((sample) => ({
      ...sample,
      self: sample.self ? [...sample.self] : null,
      remote: sample.remote ? [...sample.remote] : null,
      row: sample.row.map((position) => [...position]),
    })),
  };
}

const api = { snapshot, scheduleTrace, setSelfInput, applyAuthorityPropsOnce, exportEvidence };
window.__RC1__ = api;
window.__RC2__ = api;

b3 = await (await import(BOX3D_URL)).default();
setStatus("physics-ready");
connect();

function animate(now) {
  requestAnimationFrame(animate);
  const frameDt = Math.max(0, (now - lastFrameAt) / 1000);
  lastFrameAt = now;
  stepLocalPhysics(frameDt);
}
requestAnimationFrame(animate);
