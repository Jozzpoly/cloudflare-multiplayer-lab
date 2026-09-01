import Box3D from 'box3d.js';

const SIM_HZ = 60;
const DT = 1 / SIM_HZ;
const SUBSTEPS = 4;
const PLAYER_SPEED = 5.2;
const PLAYER_ACCELERATION = 28;
const PLAYER_DECELERATION = 36;
const HEARTBEAT_MS = 66;
const PROP_COUNT = 12;
const PLAYER_ID = 'player';
const EPS = 1e-9;

const b3 = await Box3D();

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1));
  return sorted[index];
}

function vecLength(v) {
  return Math.hypot(v[0], v[1], v[2]);
}

function horizontalDistance(a, b) {
  return Math.hypot(a[0] - b[0], a[2] - b[2]);
}

function vec3Finite(v) {
  return v.every(Number.isFinite);
}

function quatFinite(q) {
  return q.every(Number.isFinite);
}

function clampVector(v, maxLength) {
  const length = vecLength(v);
  if (length <= maxLength || length < EPS) return v;
  const scale = maxLength / length;
  return [v[0] * scale, v[1] * scale, v[2] * scale];
}

function normalizeInput(x, z) {
  const length = Math.hypot(x, z);
  if (length <= 1 || length < EPS) return [x, z];
  return [x / length, z / length];
}

function moveToward2(currentX, currentZ, targetX, targetZ, maxDelta) {
  const dx = targetX - currentX;
  const dz = targetZ - currentZ;
  const distance = Math.hypot(dx, dz);
  if (distance <= maxDelta || distance < EPS) return [targetX, targetZ];
  const scale = maxDelta / distance;
  return [currentX + dx * scale, currentZ + dz * scale];
}

function shapeKey(id) {
  return `${id.index1}:${id.world0}:${id.generation}`;
}

function quatNormalize(q) {
  const length = Math.hypot(q[0], q[1], q[2], q[3]);
  if (length < EPS) return [0, 0, 0, 1];
  return [q[0] / length, q[1] / length, q[2] / length, q[3] / length];
}

function quatMultiply(a, b) {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}

function quatConjugate(q) {
  return [-q[0], -q[1], -q[2], q[3]];
}

function integrateRotation(rotation, angularVelocity, dt) {
  const speed = vecLength(angularVelocity);
  if (speed < EPS || dt <= 0) return rotation;
  const halfAngle = 0.5 * speed * dt;
  const scale = Math.sin(halfAngle) / speed;
  const delta = [
    angularVelocity[0] * scale,
    angularVelocity[1] * scale,
    angularVelocity[2] * scale,
    Math.cos(halfAngle),
  ];
  return quatNormalize(quatMultiply(delta, rotation));
}

function rotationVectorToTarget(current, target) {
  let error = quatNormalize(quatMultiply(target, quatConjugate(current)));
  if (error[3] < 0) error = error.map((value) => -value);
  const w = clamp(error[3], -1, 1);
  const angle = 2 * Math.acos(w);
  const sinHalf = Math.sqrt(Math.max(0, 1 - w * w));
  if (sinHalf < 1e-6 || angle < 1e-6) return [0, 0, 0];
  const scale = angle / sinHalf;
  return [error[0] * scale, error[1] * scale, error[2] * scale];
}

function makeRng(seed) {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  };
}

function jitteredDelayMs(baseMs, jitterMs, rng) {
  if (jitterMs <= 0) return baseMs;
  return Math.max(0, baseMs + (rng() * 2 - 1) * jitterMs);
}

function createStaticBox(world, position, halfExtents) {
  const bodyDef = b3.b3DefaultBodyDef();
  bodyDef.position = position;
  const body = b3.b3CreateBody(world, bodyDef);
  b3.b3CreateBoxShape(body, b3.b3DefaultShapeDef(), halfExtents[0], halfExtents[1], halfExtents[2]);
}

function createWorld({ enableContactEvents }) {
  const worldDef = b3.b3DefaultWorldDef();
  worldDef.gravity = [0, -20, 0];
  const world = b3.b3CreateWorld(worldDef);

  createStaticBox(world, [0, -0.5, 0], [10, 0.5, 10]);
  createStaticBox(world, [-9.5, 1.5, 0], [0.5, 2, 10]);
  createStaticBox(world, [9.5, 1.5, 0], [0.5, 2, 10]);
  createStaticBox(world, [0, 1.5, -9.5], [10, 2, 0.5]);
  createStaticBox(world, [0, 1.5, 9.5], [10, 2, 0.5]);

  const bodies = new Map();
  const shapeOwners = new Map();

  for (let index = 0; index < PROP_COUNT; index += 1) {
    const col = index % 4;
    const row = Math.floor(index / 4);
    const initial = [(col - 1.5) * 1.05, 0.46, (row - 1) * 1.05];
    const bodyDef = b3.b3DefaultBodyDef();
    bodyDef.type = b3.b3BodyType.b3_dynamicBody;
    bodyDef.position = initial;
    bodyDef.linearDamping = 0.08;
    bodyDef.angularDamping = 0.12;
    const body = b3.b3CreateBody(world, bodyDef);
    const shapeDef = b3.b3DefaultShapeDef();
    shapeDef.density = 22;
    shapeDef.baseMaterial.friction = 0.72;
    shapeDef.baseMaterial.restitution = 0.04;
    shapeDef.enableContactEvents = enableContactEvents;
    shapeDef.enableHitEvents = enableContactEvents;
    const shape = b3.b3CreateBoxShape(body, shapeDef, 0.46, 0.46, 0.46);
    const id = `prop-${index}`;
    bodies.set(id, { id, body, shape, initial, kind: 'prop' });
    shapeOwners.set(shapeKey(shape), id);
  }

  const playerDef = b3.b3DefaultBodyDef();
  playerDef.type = b3.b3BodyType.b3_dynamicBody;
  playerDef.position = [-6.5, 0.82, -1.4];
  playerDef.linearDamping = 0.3;
  playerDef.angularDamping = 8;
  const playerBody = b3.b3CreateBody(world, playerDef);
  const playerShapeDef = b3.b3DefaultShapeDef();
  playerShapeDef.density = 80;
  playerShapeDef.baseMaterial.friction = 0.8;
  playerShapeDef.baseMaterial.restitution = 0.02;
  playerShapeDef.enableContactEvents = enableContactEvents;
  playerShapeDef.enableHitEvents = enableContactEvents;
  const playerShape = b3.b3CreateCapsuleShape(playerBody, playerShapeDef, {
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
  bodies.set(PLAYER_ID, {
    id: PLAYER_ID,
    body: playerBody,
    shape: playerShape,
    initial: [-6.5, 0.82, -1.4],
    kind: 'player',
  });
  shapeOwners.set(shapeKey(playerShape), PLAYER_ID);

  const events = enableContactEvents ? b3.createEventsBuffer() : null;
  const touch = enableContactEvents ? b3.createContactTouchEvent() : null;
  const hit = enableContactEvents ? b3.createContactHitEvent() : null;

  return {
    world,
    bodies,
    shapeOwners,
    events,
    touch,
    hit,
    activePairs: new Map(),
    collisionCooldownUntil: new Map(),
  };
}

function destroyWorld(sim) {
  if (sim.events) b3.destroyEventsBuffer(sim.events);
  b3.b3DestroyWorld(sim.world);
}

function bodyState(record) {
  const position = [0, 0, 0];
  const rotation = [0, 0, 0, 1];
  const linearVelocity = [0, 0, 0];
  const angularVelocity = [0, 0, 0];
  b3.b3Body_GetPosition(position, record.body);
  b3.b3Body_GetRotation(rotation, record.body);
  b3.b3Body_GetLinearVelocity(linearVelocity, record.body);
  b3.b3Body_GetAngularVelocity(angularVelocity, record.body);
  return {
    position: [...position],
    rotation: [...rotation],
    linearVelocity: [...linearVelocity],
    angularVelocity: [...angularVelocity],
    awake: b3.b3Body_IsAwake(record.body),
  };
}

function worldSnapshot(sim, tick) {
  const states = {};
  for (const [id, record] of sim.bodies) states[id] = bodyState(record);
  return { tick, states };
}

function finiteWorld(sim) {
  for (const record of sim.bodies.values()) {
    const state = bodyState(record);
    if (!vec3Finite(state.position) || !quatFinite(state.rotation) || !vec3Finite(state.linearVelocity) || !vec3Finite(state.angularVelocity)) {
      return false;
    }
  }
  return true;
}

function applyPlayerInput(sim, input) {
  const player = sim.bodies.get(PLAYER_ID);
  const velocity = [0, 0, 0];
  b3.b3Body_GetLinearVelocity(velocity, player.body);
  const [inputX, inputZ] = normalizeInput(input[0], input[1]);
  const hasInput = Math.hypot(inputX, inputZ) > 0.01;
  const targetX = inputX * PLAYER_SPEED;
  const targetZ = inputZ * PLAYER_SPEED;
  const acceleration = hasInput ? PLAYER_ACCELERATION : PLAYER_DECELERATION;
  const [nextX, nextZ] = moveToward2(velocity[0], velocity[2], targetX, targetZ, acceleration * DT);
  b3.b3Body_SetLinearVelocity(player.body, [nextX, velocity[1], nextZ]);
}

function dynamicPairFromEvent(sim, shapeIdA, shapeIdB) {
  const a = sim.shapeOwners.get(shapeKey(shapeIdA));
  const b = sim.shapeOwners.get(shapeKey(shapeIdB));
  if (!a || !b || a === b) return null;
  const first = a < b ? a : b;
  const second = a < b ? b : a;
  return { key: `${first}|${second}`, a: first, b: second };
}

function updateContactState(sim, tick, cooldownTicks) {
  if (!sim.events) return;
  b3.getEvents(sim.events, sim.world);

  for (let i = 0, n = b3.getNumContactBeginEvents(sim.events); i < n; i += 1) {
    b3.getContactBeginEventAt(sim.touch, sim.events, i);
    const pair = dynamicPairFromEvent(sim, sim.touch.shapeIdA, sim.touch.shapeIdB);
    if (!pair) continue;
    sim.activePairs.set(pair.key, pair);
    sim.collisionCooldownUntil.set(pair.a, tick + cooldownTicks);
    sim.collisionCooldownUntil.set(pair.b, tick + cooldownTicks);
  }

  for (let i = 0, n = b3.getNumContactEndEvents(sim.events); i < n; i += 1) {
    b3.getContactEndEventAt(sim.touch, sim.events, i);
    const pair = dynamicPairFromEvent(sim, sim.touch.shapeIdA, sim.touch.shapeIdB);
    if (pair) {
      sim.activePairs.delete(pair.key);
      sim.collisionCooldownUntil.set(pair.a, tick + cooldownTicks);
      sim.collisionCooldownUntil.set(pair.b, tick + cooldownTicks);
    }
  }

  for (let i = 0, n = b3.getNumContactHitEvents(sim.events); i < n; i += 1) {
    b3.getContactHitEventAt(sim.hit, sim.events, i);
    const pair = dynamicPairFromEvent(sim, sim.hit.shapeIdA, sim.hit.shapeIdB);
    if (!pair) continue;
    sim.collisionCooldownUntil.set(pair.a, tick + cooldownTicks);
    sim.collisionCooldownUntil.set(pair.b, tick + cooldownTicks);
  }
}

function activeContactBodies(sim) {
  const result = new Set();
  for (const pair of sim.activePairs.values()) {
    result.add(pair.a);
    result.add(pair.b);
  }
  return result;
}

function projectedState(snapshotState, ageSeconds) {
  return {
    position: [
      snapshotState.position[0] + snapshotState.linearVelocity[0] * ageSeconds,
      snapshotState.position[1] + snapshotState.linearVelocity[1] * ageSeconds,
      snapshotState.position[2] + snapshotState.linearVelocity[2] * ageSeconds,
    ],
    rotation: integrateRotation(snapshotState.rotation, snapshotState.angularVelocity, ageSeconds),
    linearVelocity: snapshotState.linearVelocity,
    angularVelocity: snapshotState.angularVelocity,
  };
}

function correctionScale(sim, bodyId, tick, params, contactBodies) {
  if (contactBodies.has(bodyId)) return params.collisionScale;
  const until = sim.collisionCooldownUntil.get(bodyId) ?? -Infinity;
  if (tick >= until) return 1;
  const remaining = until - tick;
  const rampTicks = Math.max(1, Math.round(params.rampMs / 1000 * SIM_HZ));
  const t = clamp(1 - remaining / rampTicks, 0, 1);
  return params.collisionScale + (1 - params.collisionScale) * t;
}

function applyForecastCorrection(sim, latestSnapshot, tick, params, metrics) {
  if (!latestSnapshot) return;
  const ageSeconds = Math.max(0, tick - latestSnapshot.tick) * DT;
  const contactBodies = activeContactBodies(sim);
  const omegaP = 4 / (params.tau * params.tau);
  const omegaD = 4 / params.tau;

  for (const [id, record] of sim.bodies) {
    const authoritative = latestSnapshot.states[id];
    if (!authoritative) continue;
    const target = projectedState(authoritative, ageSeconds);
    const local = bodyState(record);
    const scale = correctionScale(sim, id, tick, params, contactBodies);

    const posError = [
      target.position[0] - local.position[0],
      target.position[1] - local.position[1],
      target.position[2] - local.position[2],
    ];
    const velError = [
      target.linearVelocity[0] - local.linearVelocity[0],
      target.linearVelocity[1] - local.linearVelocity[1],
      target.linearVelocity[2] - local.linearVelocity[2],
    ];
    const positionErrorLength = vecLength(posError);
    const velocityErrorLength = vecLength(velError);
    const linearWithinDeadzone = positionErrorLength < params.positionDeadzone && velocityErrorLength < params.velocityDeadzone;
    let linearAccel = linearWithinDeadzone ? [0, 0, 0] : [
      posError[0] * omegaP + velError[0] * omegaD,
      posError[1] * omegaP + velError[1] * omegaD,
      posError[2] * omegaP + velError[2] * omegaD,
    ];
    linearAccel = clampVector(linearAccel, params.maxLinearAccel * scale);
    const linearAccelLength = vecLength(linearAccel);
    metrics.correctionAccel.push(linearAccelLength);
    if (linearAccelLength > EPS) {
      b3.b3Body_SetLinearVelocity(record.body, [
        local.linearVelocity[0] + linearAccel[0] * DT,
        local.linearVelocity[1] + linearAccel[1] * DT,
        local.linearVelocity[2] + linearAccel[2] * DT,
      ]);
    }

    if (record.kind === 'player') continue;
    const rotationError = rotationVectorToTarget(local.rotation, target.rotation);
    const angularVelError = [
      target.angularVelocity[0] - local.angularVelocity[0],
      target.angularVelocity[1] - local.angularVelocity[1],
      target.angularVelocity[2] - local.angularVelocity[2],
    ];
    const angularWithinDeadzone = vecLength(rotationError) < params.angleDeadzone && vecLength(angularVelError) < params.angularVelocityDeadzone;
    let angularAccel = angularWithinDeadzone ? [0, 0, 0] : [
      rotationError[0] * omegaP + angularVelError[0] * omegaD,
      rotationError[1] * omegaP + angularVelError[1] * omegaD,
      rotationError[2] * omegaP + angularVelError[2] * omegaD,
    ];
    angularAccel = clampVector(angularAccel, params.maxAngularAccel * scale);
    if (vecLength(angularAccel) > EPS) {
      b3.b3Body_SetAngularVelocity(record.body, [
        local.angularVelocity[0] + angularAccel[0] * DT,
        local.angularVelocity[1] + angularAccel[1] * DT,
        local.angularVelocity[2] + angularAccel[2] * DT,
      ]);
    }
  }
}

function sampleErrors(authority, client, metrics) {
  const authorityPlayer = bodyState(authority.bodies.get(PLAYER_ID));
  const clientPlayer = bodyState(client.bodies.get(PLAYER_ID));
  metrics.playerError.push(horizontalDistance(authorityPlayer.position, clientPlayer.position));

  let maxPropError = 0;
  for (let index = 0; index < PROP_COUNT; index += 1) {
    const id = `prop-${index}`;
    const a = bodyState(authority.bodies.get(id));
    const c = bodyState(client.bodies.get(id));
    maxPropError = Math.max(maxPropError, vecLength([
      a.position[0] - c.position[0],
      a.position[1] - c.position[1],
      a.position[2] - c.position[2],
    ]));
  }
  metrics.maxPropError.push(maxPropError);

  const contacts = activeContactBodies(client);
  if (contacts.has(PLAYER_ID)) {
    metrics.contactPlayerError.push(metrics.playerError.at(-1));
    metrics.contactPropError.push(maxPropError);
  }
}

const SCENARIOS = {
  free: {
    durationSeconds: 4,
    inputAt(t) {
      if (t < 2.2) return [0, -1];
      if (t < 3.1) return [0, 1];
      return [0, 0];
    },
  },
  push: {
    durationSeconds: 6,
    inputAt(t) {
      if (t < 4.2) return [1, 0];
      return [0, 0];
    },
  },
  reversal: {
    durationSeconds: 6,
    inputAt(t) {
      if (t < 2.6) return [1, 0];
      if (t < 4.8) return [-1, 0];
      return [0, 0];
    },
  },
  diagonal: {
    durationSeconds: 6,
    inputAt(t) {
      if (t < 2.4) return [1, 0.35];
      if (t < 4.4) return [1, -0.5];
      return [0, 0];
    },
  },
};

function inputChanged(a, b) {
  return !b || Math.abs(a[0] - b[0]) > 1e-9 || Math.abs(a[1] - b[1]) > 1e-9;
}

function enqueue(queue, deliverAtMs, payload) {
  queue.push({ deliverAtMs, payload });
  queue.sort((a, b) => a.deliverAtMs - b.deliverAtMs);
}

function deliver(queue, nowMs, handler) {
  while (queue.length && queue[0].deliverAtMs <= nowMs + 1e-6) {
    handler(queue.shift().payload);
  }
}

function summarizeMetrics(metrics) {
  return {
    playerP50: percentile(metrics.playerError, 0.5),
    playerP95: percentile(metrics.playerError, 0.95),
    playerMax: Math.max(0, ...metrics.playerError),
    propP50: percentile(metrics.maxPropError, 0.5),
    propP95: percentile(metrics.maxPropError, 0.95),
    propMax: Math.max(0, ...metrics.maxPropError),
    contactPlayerP95: percentile(metrics.contactPlayerError, 0.95),
    contactPropP95: percentile(metrics.contactPropError, 0.95),
    correctionAccelP95: percentile(metrics.correctionAccel, 0.95),
  };
}

function scoreSummary(summary) {
  return (
    summary.playerP95 * 1.0 +
    summary.propP95 * 1.15 +
    summary.contactPlayerP95 * 1.35 +
    summary.contactPropP95 * 1.5 +
    summary.correctionAccelP95 * 0.006
  );
}

function runScenario({ scenarioName, network, params, seed = 1 }) {
  const scenario = SCENARIOS[scenarioName];
  if (!scenario) throw new Error(`unknown scenario: ${scenarioName}`);
  const authority = createWorld({ enableContactEvents: false });
  const client = createWorld({ enableContactEvents: true });
  const inputQueue = [];
  const snapshotQueue = [];
  const rng = makeRng(seed);
  const metrics = {
    playerError: [],
    maxPropError: [],
    contactPlayerError: [],
    contactPropError: [],
    correctionAccel: [],
  };

  let authorityInput = [0, 0];
  let latestSnapshot = null;
  let lastSentInput = null;
  let nextHeartbeatAtMs = 0;
  const totalTicks = Math.round(scenario.durationSeconds * SIM_HZ);
  const snapshotEveryTicks = Math.max(1, Math.round(SIM_HZ / network.snapshotHz));
  const cooldownTicks = Math.max(1, Math.round(params.rampMs / 1000 * SIM_HZ));

  try {
    for (let tick = 0; tick < totalTicks; tick += 1) {
      const nowMs = tick * DT * 1000;
      const localInput = scenario.inputAt(tick * DT);

      if (inputChanged(localInput, lastSentInput) || nowMs + 1e-6 >= nextHeartbeatAtMs) {
        const delay = jitteredDelayMs(network.oneWayMs, network.jitterMs, rng);
        enqueue(inputQueue, nowMs + delay, [...localInput]);
        lastSentInput = [...localInput];
        nextHeartbeatAtMs = nowMs + HEARTBEAT_MS;
      }

      deliver(inputQueue, nowMs, (input) => {
        authorityInput = input;
      });
      deliver(snapshotQueue, nowMs, (snapshot) => {
        latestSnapshot = snapshot;
      });

      applyPlayerInput(authority, authorityInput);
      applyPlayerInput(client, localInput);
      applyForecastCorrection(client, latestSnapshot, tick, params, metrics);

      b3.b3World_Step(authority.world, DT, SUBSTEPS);
      b3.b3World_Step(client.world, DT, SUBSTEPS);
      updateContactState(client, tick, cooldownTicks);

      if ((tick + 1) % snapshotEveryTicks === 0) {
        const snapshot = worldSnapshot(authority, tick + 1);
        const delay = jitteredDelayMs(network.oneWayMs, network.jitterMs, rng);
        enqueue(snapshotQueue, nowMs + DT * 1000 + delay, snapshot);
      }

      sampleErrors(authority, client, metrics);
      if (!finiteWorld(authority) || !finiteWorld(client)) {
        throw new Error(`non-finite state at tick ${tick}`);
      }
    }

    return summarizeMetrics(metrics);
  } finally {
    destroyWorld(authority);
    destroyWorld(client);
  }
}

function aggregateResults(results) {
  const keys = Object.keys(results[0].summary);
  const aggregate = {};
  for (const key of keys) aggregate[key] = Math.max(...results.map((result) => result.summary[key]));
  aggregate.score = results.reduce((sum, result) => sum + scoreSummary(result.summary), 0) / results.length;
  return aggregate;
}

function candidateGrid(ciMode) {
  if (ciMode) {
    return [{ tau: 0.28, maxLinearAccel: 24, maxAngularAccel: 32, collisionScale: 0.2, rampMs: 220, positionDeadzone: 0.015, velocityDeadzone: 0.05, angleDeadzone: 0.02, angularVelocityDeadzone: 0.05 }];
  }
  const candidates = [];
  for (const tau of [0.18, 0.28, 0.4]) {
    for (const maxLinearAccel of [16, 28, 44]) {
      for (const collisionScale of [0, 0.2, 0.45]) {
        for (const rampMs of [140, 260]) {
          candidates.push({
            tau,
            maxLinearAccel,
            maxAngularAccel: maxLinearAccel * 1.35,
            collisionScale,
            rampMs,
            positionDeadzone: 0.015,
            velocityDeadzone: 0.05,
            angleDeadzone: 0.02,
            angularVelocityDeadzone: 0.05,
          });
        }
      }
    }
  }
  return candidates;
}

function formatNumber(value) {
  return Number(value).toFixed(3);
}

function printResult(label, aggregate, params) {
  console.log(`\n${label}`);
  console.log(`  params: ${JSON.stringify(params)}`);
  console.log(
    `  player p95/max ${formatNumber(aggregate.playerP95)}/${formatNumber(aggregate.playerMax)} | ` +
    `prop p95/max ${formatNumber(aggregate.propP95)}/${formatNumber(aggregate.propMax)} | ` +
    `contact player/prop p95 ${formatNumber(aggregate.contactPlayerP95)}/${formatNumber(aggregate.contactPropP95)} | ` +
    `correction accel p95 ${formatNumber(aggregate.correctionAccelP95)} | score ${formatNumber(aggregate.score)}`,
  );
}

const ciMode = process.argv.includes('--ci');
const scenarioNames = ciMode ? ['free', 'push'] : Object.keys(SCENARIOS);
const networks = ciMode
  ? [{ name: 'a2-observed', oneWayMs: 63, jitterMs: 6, snapshotHz: 10 }]
  : [
      { name: 'good', oneWayMs: 30, jitterMs: 3, snapshotHz: 10 },
      { name: 'a2-observed', oneWayMs: 63, jitterMs: 6, snapshotHz: 10 },
      { name: 'hostile', oneWayMs: 100, jitterMs: 12, snapshotHz: 10 },
    ];

const candidates = candidateGrid(ciMode);
const ranked = [];

for (let index = 0; index < candidates.length; index += 1) {
  const params = candidates[index];
  const results = [];
  for (let n = 0; n < networks.length; n += 1) {
    for (let s = 0; s < scenarioNames.length; s += 1) {
      const summary = runScenario({
        scenarioName: scenarioNames[s],
        network: networks[n],
        params,
        seed: 1000 + n * 17 + s,
      });
      results.push({ network: networks[n].name, scenario: scenarioNames[s], summary });
    }
  }
  ranked.push({ params, aggregate: aggregateResults(results), results });
}

ranked.sort((a, b) => a.aggregate.score - b.aggregate.score);
const best = ranked[0];
printResult(ciMode ? 'A2R forecast CI smoke' : 'A2R forecast best candidate', best.aggregate, best.params);

if (!ciMode) {
  console.log('\nTop 5 candidates:');
  for (const entry of ranked.slice(0, 5)) {
    console.log(
      `  score ${formatNumber(entry.aggregate.score)} | p95 player ${formatNumber(entry.aggregate.playerP95)} | ` +
      `prop ${formatNumber(entry.aggregate.propP95)} | contact ${formatNumber(entry.aggregate.contactPlayerP95)}/${formatNumber(entry.aggregate.contactPropP95)} | ` +
      JSON.stringify(entry.params),
    );
  }

  console.log('\nBest candidate detail:');
  for (const result of best.results) {
    console.log(
      `  ${result.network}/${result.scenario}: player p95 ${formatNumber(result.summary.playerP95)}, ` +
      `prop p95 ${formatNumber(result.summary.propP95)}, contact ${formatNumber(result.summary.contactPlayerP95)}/${formatNumber(result.summary.contactPropP95)}`,
    );
  }

  console.log('\nSnapshot-rate cross-check at observed A2 latency:');
  for (const snapshotHz of [10, 15, 20]) {
    const results = scenarioNames.map((scenarioName, s) => ({
      summary: runScenario({
        scenarioName,
        network: { name: `${snapshotHz}hz`, oneWayMs: 63, jitterMs: 6, snapshotHz },
        params: best.params,
        seed: 9000 + s,
      }),
    }));
    const aggregate = aggregateResults(results);
    console.log(
      `  ${snapshotHz} Hz: player p95 ${formatNumber(aggregate.playerP95)}, prop p95 ${formatNumber(aggregate.propP95)}, ` +
      `contact ${formatNumber(aggregate.contactPlayerP95)}/${formatNumber(aggregate.contactPropP95)}, score ${formatNumber(aggregate.score)}`,
    );
  }
}

if (!Number.isFinite(best.aggregate.score)) throw new Error('non-finite A2R forecast score');
if (ciMode && (best.aggregate.playerMax > 5 || best.aggregate.propMax > 5)) {
  throw new Error(`A2R forecast smoke diverged: playerMax=${best.aggregate.playerMax}, propMax=${best.aggregate.propMax}`);
}
