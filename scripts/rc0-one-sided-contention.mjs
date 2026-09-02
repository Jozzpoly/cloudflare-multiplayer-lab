import Box3D from 'box3d.js';

const SIM_HZ = 60;
const DT = 1 / SIM_HZ;
const SUBSTEPS = 4;
const PLAYER_SPEED = 5.2;
const PLAYER_ACCELERATION = 28;
const PLAYER_DECELERATION = 36;
const WARMUP_TICKS = 120;
const RUN_TICKS = 360;
const A_ID = 'player-a';
const B_ID = 'player-b';
const PROP_ID = 'prop-0';
const EPS = 1e-12;

const b3 = await Box3D();

function vecDistance(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function quatDistance(a, b) {
  const direct = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2], a[3] - b[3]);
  const negated = Math.hypot(a[0] + b[0], a[1] + b[1], a[2] + b[2], a[3] + b[3]);
  return Math.min(direct, negated);
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

function createStaticBox(world, position, halfExtents) {
  const bodyDef = b3.b3DefaultBodyDef();
  bodyDef.position = position;
  const body = b3.b3CreateBody(world, bodyDef);
  b3.b3CreateBoxShape(body, b3.b3DefaultShapeDef(), halfExtents[0], halfExtents[1], halfExtents[2]);
}

function createActor(world, position) {
  const bodyDef = b3.b3DefaultBodyDef();
  bodyDef.type = b3.b3BodyType.b3_dynamicBody;
  bodyDef.position = position;
  bodyDef.linearDamping = 0.3;
  bodyDef.angularDamping = 8;
  const body = b3.b3CreateBody(world, bodyDef);
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
    linearX: false,
    linearY: false,
    linearZ: false,
    angularX: true,
    angularY: true,
    angularZ: true,
  });
  return body;
}

function createProp(world, position) {
  const bodyDef = b3.b3DefaultBodyDef();
  bodyDef.type = b3.b3BodyType.b3_dynamicBody;
  bodyDef.position = position;
  bodyDef.linearDamping = 0.08;
  bodyDef.angularDamping = 0.12;
  const body = b3.b3CreateBody(world, bodyDef);
  const shapeDef = b3.b3DefaultShapeDef();
  shapeDef.density = 22;
  shapeDef.baseMaterial.friction = 0.72;
  shapeDef.baseMaterial.restitution = 0.04;
  b3.b3CreateBoxShape(body, shapeDef, 0.46, 0.46, 0.46);
  return body;
}

function createWorld() {
  const worldDef = b3.b3DefaultWorldDef();
  worldDef.gravity = [0, -20, 0];
  const world = b3.b3CreateWorld(worldDef);
  createStaticBox(world, [0, -0.5, 0], [10, 0.5, 10]);
  const bodies = new Map([
    [A_ID, createActor(world, [-2.2, 0.82, 0])],
    [B_ID, createActor(world, [1.45, 0.82, 0])],
    [PROP_ID, createProp(world, [0, 0.46, 0])],
  ]);
  return { world, bodies };
}

function destroyWorld(sim) {
  b3.b3DestroyWorld(sim.world);
}

function state(body) {
  const position = [0, 0, 0];
  const rotation = [0, 0, 0, 1];
  const linearVelocity = [0, 0, 0];
  const angularVelocity = [0, 0, 0];
  b3.b3Body_GetPosition(position, body);
  b3.b3Body_GetRotation(rotation, body);
  b3.b3Body_GetLinearVelocity(linearVelocity, body);
  b3.b3Body_GetAngularVelocity(angularVelocity, body);
  return {
    position: [...position],
    rotation: [...rotation],
    linearVelocity: [...linearVelocity],
    angularVelocity: [...angularVelocity],
  };
}

function finiteState(s) {
  return [...s.position, ...s.rotation, ...s.linearVelocity, ...s.angularVelocity].every(Number.isFinite);
}

function snapshot(sim) {
  const result = {};
  for (const [id, body] of sim.bodies) {
    result[id] = state(body);
    if (!finiteState(result[id])) throw new Error(`non-finite state: ${id}`);
  }
  return result;
}

function applyPlayerInput(body, input) {
  const velocity = [0, 0, 0];
  b3.b3Body_GetLinearVelocity(velocity, body);
  const [inputX, inputZ] = normalizeInput(input[0], input[1]);
  const hasInput = Math.hypot(inputX, inputZ) > 0.01;
  const targetX = inputX * PLAYER_SPEED;
  const targetZ = inputZ * PLAYER_SPEED;
  const acceleration = hasInput ? PLAYER_ACCELERATION : PLAYER_DECELERATION;
  const [nextX, nextZ] = moveToward2(velocity[0], velocity[2], targetX, targetZ, acceleration * DT);
  b3.b3Body_SetLinearVelocity(body, [nextX, velocity[1], nextZ]);
}

function inputAt(experimentTick) {
  if (experimentTick < 0) return [0, 0];
  const t = experimentTick * DT;
  if (t < 1.65) return [1, 0];
  return [0, 0];
}

function step(sim, aInput) {
  applyPlayerInput(sim.bodies.get(A_ID), aInput);
  applyPlayerInput(sim.bodies.get(B_ID), [0, 0]);
  b3.b3World_Step(sim.world, DT, SUBSTEPS);
}

function bodyError(a, b) {
  return {
    position: vecDistance(a.position, b.position),
    rotation: quatDistance(a.rotation, b.rotation),
    linearVelocity: vecDistance(a.linearVelocity, b.linearVelocity),
    angularVelocity: vecDistance(a.angularVelocity, b.angularVelocity),
  };
}

function maxBodyError(a, b) {
  const e = bodyError(a, b);
  return Math.max(e.position, e.rotation, e.linearVelocity, e.angularVelocity);
}

function compareTraces(authorityTrace, observerTrace, shiftTicks) {
  const ids = [A_ID, B_ID, PROP_ID];
  const sameTimeMax = Object.fromEntries(ids.map((id) => [id, 0]));
  const phaseAlignedMax = Object.fromEntries(ids.map((id) => [id, 0]));
  const firstDivergenceTick = Object.fromEntries(ids.map((id) => [id, null]));

  for (let tick = 0; tick < authorityTrace.length; tick += 1) {
    for (const id of ids) {
      const error = maxBodyError(authorityTrace[tick][id], observerTrace[tick][id]);
      sameTimeMax[id] = Math.max(sameTimeMax[id], error);
      if (firstDivergenceTick[id] === null && error > 1e-7) firstDivergenceTick[id] = tick;
    }
  }

  for (let tick = 0; tick + shiftTicks < observerTrace.length; tick += 1) {
    for (const id of ids) {
      phaseAlignedMax[id] = Math.max(
        phaseAlignedMax[id],
        maxBodyError(authorityTrace[tick][id], observerTrace[tick + shiftTicks][id]),
      );
    }
  }

  const finalError = {};
  const authorityFinal = authorityTrace.at(-1);
  const observerFinal = observerTrace.at(-1);
  for (const id of ids) finalError[id] = bodyError(authorityFinal[id], observerFinal[id]);

  return {
    sameTimeMax,
    phaseAlignedMax,
    firstDivergenceTick,
    finalError,
    authorityFinal,
    observerFinal,
  };
}

const SCENARIOS = {
  stationary: {
    label: 'stationary-B phase control',
    begin() {},
  },
  passiveVerticalB: {
    label: 'passive solver-owned B vertical forcing',
    begin(sim) {
      const bState = state(sim.bodies.get(B_ID));
      b3.b3Body_SetLinearVelocity(sim.bodies.get(B_ID), [
        bState.linearVelocity[0],
        6,
        bState.linearVelocity[2],
      ]);
    },
  },
};

function run(delayTicks, scenario) {
  const authority = createWorld();
  const observer = createWorld();
  try {
    for (let tick = 0; tick < WARMUP_TICKS; tick += 1) {
      step(authority, [0, 0]);
      step(observer, [0, 0]);
    }

    scenario.begin(authority);
    scenario.begin(observer);

    const authorityTrace = [];
    const observerTrace = [];
    for (let tick = 0; tick < RUN_TICKS; tick += 1) {
      step(authority, inputAt(tick));
      step(observer, inputAt(tick - delayTicks));
      authorityTrace.push(snapshot(authority));
      observerTrace.push(snapshot(observer));
    }

    return compareTraces(authorityTrace, observerTrace, delayTicks);
  } finally {
    destroyWorld(authority);
    destroyWorld(observer);
  }
}

const delays = [0, 3, 6];
const results = Object.fromEntries(Object.entries(SCENARIOS).map(([scenarioName, scenario]) => [
  scenarioName,
  delays.map((delayTicks) => ({
    delayTicks,
    delayMs: delayTicks * DT * 1000,
    ...run(delayTicks, scenario),
  })),
]));

for (const [scenarioName, scenarioResults] of Object.entries(results)) {
  const control = scenarioResults[0];
  const controlMax = Math.max(...Object.values(control.sameTimeMax));
  if (controlMax > 1e-8) {
    throw new Error(`RC0 invalid: ${scenarioName} 0 ms control diverged (${controlMax})`);
  }
}

const stationaryPhaseResidual = Math.max(
  ...results.stationary.slice(1).flatMap((result) => Object.values(result.phaseAlignedMax)),
);
if (stationaryPhaseResidual > 1e-8) {
  throw new Error(`RC0 invalid: stationary phase control did not collapse under known delay (${stationaryPhaseResidual})`);
}

console.log(JSON.stringify({
  experiment: 'RC0 one-sided causal contention',
  substrate: {
    box3d: '0.1.1',
    simulationHz: SIM_HZ,
    substeps: SUBSTEPS,
    playerSpeed: PLAYER_SPEED,
    playerAcceleration: PLAYER_ACCELERATION,
    playerDeceleration: PLAYER_DECELERATION,
    note: 'B receives zero horizontal input in every scenario; passiveVerticalB changes only solver-owned Y velocity once after warmup.',
  },
  geometry: {
    playerA: [-2.2, 0.82, 0],
    prop: [0, 0.46, 0],
    playerB: [1.45, 0.82, 0],
  },
  scenarioLabels: Object.fromEntries(Object.entries(SCENARIOS).map(([name, scenario]) => [name, scenario.label])),
  results,
}, null, 2));
