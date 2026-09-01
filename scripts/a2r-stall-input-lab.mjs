import Box3D from "box3d.js";
import { FixedStepClock } from "../public/world0-a2r/fixed-step-clock.js";

const b3 = await Box3D();
const HZ = 60;
const DT = 1 / HZ;
const SUBSTEPS = 4;
const SPEED = 5.2;
const ACCEL = 28;
const DECEL = 36;
const PROP_COUNT = 12;
const PLAYER = "player";
const EPS = 1e-9;

function distanceXZ(a, b) { return Math.hypot(a[0] - b[0], a[2] - b[2]); }
function distance3(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); }
function moveToward2(cx, cz, tx, tz, maxDelta) {
  const dx = tx - cx, dz = tz - cz, d = Math.hypot(dx, dz);
  if (d <= maxDelta || d < EPS) return [tx, tz];
  const s = maxDelta / d;
  return [cx + dx * s, cz + dz * s];
}
function normalizeInput([x, z]) {
  const d = Math.hypot(x, z);
  return d > 1 ? [x / d, z / d] : [x, z];
}
function staticBox(world, position, half) {
  const def = b3.b3DefaultBodyDef();
  def.position = position;
  const body = b3.b3CreateBody(world, def);
  b3.b3CreateBoxShape(body, b3.b3DefaultShapeDef(), half[0], half[1], half[2]);
}
function createWorld() {
  const wd = b3.b3DefaultWorldDef();
  wd.gravity = [0, -20, 0];
  const world = b3.b3CreateWorld(wd);
  staticBox(world, [0, -0.5, 0], [10, 0.5, 10]);
  staticBox(world, [-9.5, 1.5, 0], [0.5, 2, 10]);
  staticBox(world, [9.5, 1.5, 0], [0.5, 2, 10]);
  staticBox(world, [0, 1.5, -9.5], [10, 2, 0.5]);
  staticBox(world, [0, 1.5, 9.5], [10, 2, 0.5]);

  const bodies = new Map();
  for (let i = 0; i < PROP_COUNT; i += 1) {
    const col = i % 4, row = Math.floor(i / 4);
    const bd = b3.b3DefaultBodyDef();
    bd.type = b3.b3BodyType.b3_dynamicBody;
    bd.position = [(col - 1.5) * 1.05, 0.46, (row - 1) * 1.05];
    bd.linearDamping = 0.08;
    bd.angularDamping = 0.12;
    const body = b3.b3CreateBody(world, bd);
    const sd = b3.b3DefaultShapeDef();
    sd.density = 22;
    sd.baseMaterial.friction = 0.72;
    sd.baseMaterial.restitution = 0.04;
    b3.b3CreateBoxShape(body, sd, 0.46, 0.46, 0.46);
    bodies.set(`prop-${i}`, body);
  }

  const pd = b3.b3DefaultBodyDef();
  pd.type = b3.b3BodyType.b3_dynamicBody;
  pd.position = [-6.5, 0.82, -1.4];
  pd.linearDamping = 0.3;
  pd.angularDamping = 8;
  const player = b3.b3CreateBody(world, pd);
  const ps = b3.b3DefaultShapeDef();
  ps.density = 80;
  ps.baseMaterial.friction = 0.8;
  ps.baseMaterial.restitution = 0.02;
  b3.b3CreateCapsuleShape(player, ps, { center1: [0, -0.45, 0], center2: [0, 0.45, 0], radius: 0.35 });
  b3.b3Body_SetMotionLocks(player, { linearX: false, linearY: false, linearZ: false, angularX: true, angularY: true, angularZ: true });
  bodies.set(PLAYER, player);
  return { world, bodies };
}
function destroy(sim) { b3.b3DestroyWorld(sim.world); }
function bodyState(body) {
  const position = [0, 0, 0], velocity = [0, 0, 0];
  b3.b3Body_GetPosition(position, body);
  b3.b3Body_GetLinearVelocity(velocity, body);
  return { position: [...position], velocity: [...velocity] };
}
function applyInput(sim, raw) {
  const [x, z] = normalizeInput(raw);
  const body = sim.bodies.get(PLAYER);
  const v = [0, 0, 0];
  b3.b3Body_GetLinearVelocity(v, body);
  const active = Math.hypot(x, z) > 0.01;
  const [vx, vz] = moveToward2(v[0], v[2], x * SPEED, z * SPEED, (active ? ACCEL : DECEL) * DT);
  b3.b3Body_SetLinearVelocity(body, [vx, v[1], vz]);
}
function step(sim, input) {
  applyInput(sim, input);
  b3.b3World_Step(sim.world, DT, SUBSTEPS);
}
function maxPropDistance(a, b) {
  let max = 0;
  for (let i = 0; i < PROP_COUNT; i += 1) {
    max = Math.max(max, distance3(bodyState(a.bodies.get(`prop-${i}`)).position, bodyState(b.bodies.get(`prop-${i}`)).position));
  }
  return max;
}
function errors(a, b) {
  return {
    player: distanceXZ(bodyState(a.bodies.get(PLAYER)).position, bodyState(b.bodies.get(PLAYER)).position),
    prop: maxPropDistance(a, b),
  };
}

const SCENARIOS = {
  "press-during-stall": {
    input(t) { return t < 1.10 ? [0, 0] : t < 3.2 ? [1, 0] : [0, 0]; },
  },
  "release-during-stall": {
    input(t) { return t < 1.10 ? [1, 0] : [0, 0]; },
  },
  "reverse-during-stall": {
    input(t) { return t < 1.10 ? [1, 0] : t < 2.8 ? [-1, 0] : [0, 0]; },
  },
};
const STALLS = [
  { name: "100ms", start: 1.05, duration: 0.10 },
  { name: "250ms", start: 1.00, duration: 0.25 },
];

function run(scenario, stall) {
  const ideal = createWorld();
  const stalled = createWorld();
  const clock = new FixedStepClock({ stepSeconds: DT, maxStepsPerAdvance: 8 });
  const durationSeconds = 6.5;
  const totalWallTicks = Math.round(durationSeconds * HZ);
  const stallStartTick = Math.round(stall.start * HZ);
  const stallTicks = Math.round(stall.duration * HZ);
  const stallEndTick = stallStartTick + stallTicks;
  let skippedElapsed = 0;
  let maxAfterResumePlayer = 0;
  let maxAfterResumeProp = 0;
  let maxBacklog = 0;

  try {
    for (let wallTick = 0; wallTick < totalWallTicks; wallTick += 1) {
      const t = wallTick * DT;
      step(ideal, scenario.input(t));

      if (wallTick >= stallStartTick && wallTick < stallEndTick) {
        skippedElapsed += DT;
        continue;
      }

      const elapsed = DT + skippedElapsed;
      skippedElapsed = 0;
      // This intentionally mirrors the browser candidate: every catch-up step
      // in one render advance reads the *current* input, not historical input.
      const currentInput = scenario.input(t);
      clock.advance(elapsed, () => step(stalled, currentInput));
      maxBacklog = Math.max(maxBacklog, clock.backlogSteps);

      if (wallTick >= stallEndTick) {
        const e = errors(stalled, ideal);
        maxAfterResumePlayer = Math.max(maxAfterResumePlayer, e.player);
        maxAfterResumeProp = Math.max(maxAfterResumeProp, e.prop);
      }
    }

    // Drain any remaining simulation debt without advancing wall time. This is
    // the best case for the current strategy; if divergence remains, it is from
    // input history loss rather than merely unfinished backlog.
    for (let i = 0; i < 120 && clock.backlogSteps > 0; i += 1) {
      const t = durationSeconds;
      clock.advance(0, () => step(stalled, scenario.input(t)));
    }

    const final = errors(stalled, ideal);
    return {
      maxAfterResumePlayer,
      maxAfterResumeProp,
      finalPlayer: final.player,
      finalProp: final.prop,
      maxBacklog,
      finalBacklog: clock.backlogSteps,
      dropped: clock.totalDroppedSteps,
      idealSteps: totalWallTicks,
      stalledSteps: clock.totalSteps,
    };
  } finally {
    destroy(ideal);
    destroy(stalled);
  }
}

function f(v) { return Number(v).toFixed(3); }
const results = [];
console.log("\nA2R stall/input-transition falsifier — current backlog strategy");
for (const [scenarioName, scenario] of Object.entries(SCENARIOS)) {
  for (const stall of STALLS) {
    const result = run(scenario, stall);
    results.push({ scenario: scenarioName, stall: stall.name, result });
    console.log(`  ${scenarioName}/${stall.name} | max player/prop ${f(result.maxAfterResumePlayer)}/${f(result.maxAfterResumeProp)} | final ${f(result.finalPlayer)}/${f(result.finalProp)} | backlog max/final ${result.maxBacklog}/${result.finalBacklog} | steps ${result.stalledSteps}/${result.idealSteps} | dropped ${result.dropped}`);
  }
}

if (!results.every(({ result }) => Object.values(result).every(Number.isFinite))) throw new Error("non-finite stall/input result");
if (!results.every(({ result }) => result.finalBacklog === 0 && result.dropped === 0 && result.stalledSteps === result.idealSteps)) {
  throw new Error("stall lab failed to repay simulation-time debt");
}
