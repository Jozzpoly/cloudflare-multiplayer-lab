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
const IDS = [A_ID, B_ID, PROP_ID];
const EPS = 1e-12;
const ASSERT_EPS = 1e-8;
const DIVERGENCE_EPS = 1e-7;

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

function snapshot(sim) {
  const result = {};
  for (const [id, body] of sim.bodies) {
    result[id] = state(body);
    const values = [
      ...result[id].position,
      ...result[id].rotation,
      ...result[id].linearVelocity,
      ...result[id].angularVelocity,
    ];
    if (!values.every(Number.isFinite)) throw new Error(`non-finite state: ${id}`);
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
  // Mirrors A2R: horizontal controller intent, solver-owned Y velocity.
  b3.b3Body_SetLinearVelocity(body, [nextX, velocity[1], nextZ]);
}

function aInputAt(experimentTick) {
  if (experimentTick < 0) return [0, 0];
  const t = experimentTick * DT;
  return t < 1.65 ? [1, 0] : [0, 0];
}

function applyPassiveBVerticalImpulse(sim) {
  const bState = state(sim.bodies.get(B_ID));
  b3.b3Body_SetLinearVelocity(sim.bodies.get(B_ID), [
    bState.linearVelocity[0],
    6,
    bState.linearVelocity[2],
  ]);
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

function maxComponent(error) {
  return Math.max(error.position, error.rotation, error.linearVelocity, error.angularVelocity);
}

function compare(traceA, traceB, offsetA = 0, offsetB = 0) {
  const count = Math.min(traceA.length - offsetA, traceB.length - offsetB);
  const max = Object.fromEntries(IDS.map((id) => [id, {
    position: 0,
    rotation: 0,
    linearVelocity: 0,
    angularVelocity: 0,
  }]));
  const firstDivergenceTick = Object.fromEntries(IDS.map((id) => [id, null]));

  for (let i = 0; i < count; i += 1) {
    for (const id of IDS) {
      const error = bodyError(traceA[i + offsetA][id], traceB[i + offsetB][id]);
      for (const key of Object.keys(error)) max[id][key] = Math.max(max[id][key], error[key]);
      if (firstDivergenceTick[id] === null && maxComponent(error) > DIVERGENCE_EPS) {
        firstDivergenceTick[id] = i;
      }
    }
  }
  return { max, firstDivergenceTick };
}

function finalError(traceA, traceB) {
  const result = {};
  for (const id of IDS) result[id] = bodyError(traceA.at(-1)[id], traceB.at(-1)[id]);
  return result;
}

function maxAcrossComparison(comparison) {
  return Math.max(...IDS.flatMap((id) => Object.values(comparison.max[id])));
}

function runTrace({ aDelayTicks, bImpulseDelayTicks, enableBImpulse }) {
  const sim = createWorld();
  try {
    for (let tick = 0; tick < WARMUP_TICKS; tick += 1) step(sim, [0, 0]);

    const trace = [];
    for (let tick = 0; tick < RUN_TICKS; tick += 1) {
      if (enableBImpulse && tick === bImpulseDelayTicks) applyPassiveBVerticalImpulse(sim);
      step(sim, aInputAt(tick - aDelayTicks));
      trace.push(snapshot(sim));
    }
    return trace;
  } finally {
    b3.b3DestroyWorld(sim.world);
  }
}

function stationaryPhaseControl(delayTicks) {
  const authority = runTrace({ aDelayTicks: 0, bImpulseDelayTicks: -1, enableBImpulse: false });
  const delayed = runTrace({ aDelayTicks: delayTicks, bImpulseDelayTicks: -1, enableBImpulse: false });
  return compare(authority, delayed, 0, delayTicks);
}

function passiveContention(delayTicks) {
  // Authority/reference: both causes occur now.
  const authority = runTrace({ aDelayTicks: 0, bImpulseDelayTicks: 0, enableBImpulse: true });

  // Pure global-delay control: both causes are shifted together. This should
  // remain an exact phase copy of authority and proves the harness itself.
  const globallyDelayed = runTrace({
    aDelayTicks: delayTicks,
    bImpulseDelayTicks: delayTicks,
    enableBImpulse: true,
  });

  // Mixed-causality world: B's local solver-owned event happens now, while
  // remote A arrives late. This is the actual RC0 treatment.
  const mixed = runTrace({ aDelayTicks: delayTicks, bImpulseDelayTicks: 0, enableBImpulse: true });

  const globalPhaseControl = compare(authority, globallyDelayed, 0, delayTicks);
  const mixedVsGlobalSameTime = compare(mixed, globallyDelayed);
  const mixedVsAuthoritySameTime = compare(mixed, authority);

  return {
    globalPhaseControl,
    mixedVsGlobalSameTime,
    mixedVsAuthoritySameTime,
    finalResidualMixedVsAuthority: finalError(mixed, authority),
  };
}

const delays = [0, 3, 6];
const stationary = delays.map((delayTicks) => ({
  delayTicks,
  delayMs: delayTicks * DT * 1000,
  phaseControl: stationaryPhaseControl(delayTicks),
}));

const passive = delays.map((delayTicks) => ({
  delayTicks,
  delayMs: delayTicks * DT * 1000,
  ...passiveContention(delayTicks),
}));

for (const result of stationary) {
  const max = maxAcrossComparison(result.phaseControl);
  if (max > ASSERT_EPS) throw new Error(`stationary phase control failed at ${result.delayTicks} ticks: ${max}`);
}
for (const result of passive) {
  const max = maxAcrossComparison(result.globalPhaseControl);
  if (max > ASSERT_EPS) throw new Error(`global-delay phase control failed at ${result.delayTicks} ticks: ${max}`);
}

function compactComparison(comparison) {
  return {
    max: comparison.max,
    firstDivergenceTick: comparison.firstDivergenceTick,
  };
}

console.log(JSON.stringify({
  experiment: 'RC0 one-sided causal contention — mixed-causality discrimination',
  substrate: {
    box3d: '0.1.1',
    simulationHz: SIM_HZ,
    substeps: SUBSTEPS,
    playerSpeed: PLAYER_SPEED,
    playerAcceleration: PLAYER_ACCELERATION,
    playerDeceleration: PLAYER_DECELERATION,
  },
  contract: {
    authority: 'A-now + passive-B-now',
    globalDelayControl: 'A-delayed + passive-B-delayed',
    mixedTreatment: 'A-delayed + passive-B-now',
    bInput: 'zero X/Z input throughout; one +6 m/s solver-owned Y velocity event only',
    geometry: { playerA: [-2.2, 0.82, 0], prop: [0, 0.46, 0], playerB: [1.45, 0.82, 0] },
  },
  stationaryPhaseControls: stationary.map((r) => ({
    delayTicks: r.delayTicks,
    delayMs: r.delayMs,
    phaseControl: compactComparison(r.phaseControl),
  })),
  passiveContention: passive.map((r) => ({
    delayTicks: r.delayTicks,
    delayMs: r.delayMs,
    globalPhaseControl: compactComparison(r.globalPhaseControl),
    mixedVsGlobalSameTime: compactComparison(r.mixedVsGlobalSameTime),
    mixedVsAuthoritySameTime: compactComparison(r.mixedVsAuthoritySameTime),
    finalResidualMixedVsAuthority: r.finalResidualMixedVsAuthority,
  })),
}, null, 2));
