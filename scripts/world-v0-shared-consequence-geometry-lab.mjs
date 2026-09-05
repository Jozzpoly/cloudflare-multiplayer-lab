import { writeFileSync } from "node:fs";
import Box3D from "box3d.js/inline";
import {
  WORLD_V0_ARENA,
  WORLD_V0_MOVEMENT,
  WORLD_V0_PLAYER_PHYSICS,
  WORLD_V0_PROP_PHYSICS,
  WORLD_V0_TIMING,
} from "../src/world-v0-contract.ts";

const OUTPUT = process.env.MW_WORLD_V0_GEOMETRY_LAB_OUTPUT || "world-v0-shared-consequence-geometry-lab.json";
const REPEATS = 2;
const NEUTRAL_TICKS = 120;
const PUSH_TICKS = 180;
const SETTLE_TICKS = 120;
const TRAIN_Z = 3.3;
const WALL_X = 1.66;
const TRAIN_TAIL_X = 0.70;
const SPACING = 0.94;
const PLAYER_SURFACE_GAP = 0.05;
const HALF = WORLD_V0_PROP_PHYSICS.halfExtents;

const VARIANTS = [
  { id: "train3-wide4x2", trainLength: 3, wall: "wide4x2" },
  { id: "train4-wide4x2", trainLength: 4, wall: "wide4x2" },
  { id: "train6-wide4x2", trainLength: 6, wall: "wide4x2" },
  { id: "train3-tall2x4", trainLength: 3, wall: "tall2x4" },
  { id: "train4-tall2x4", trainLength: 4, wall: "tall2x4" },
  { id: "train6-tall2x4", trainLength: 6, wall: "tall2x4" },
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function moveToward2(cx, cz, tx, tz, maxDelta) {
  const dx = tx - cx;
  const dz = tz - cz;
  const distance = Math.hypot(dx, dz);
  if (distance <= maxDelta || distance < 1e-9) return [tx, tz];
  const scale = maxDelta / distance;
  return [cx + dx * scale, cz + dz * scale];
}

const FLOAT_VIEW = new DataView(new ArrayBuffer(4));
function floatBits(value) {
  FLOAT_VIEW.setFloat32(0, value, true);
  return FLOAT_VIEW.getUint32(0, true);
}

function hashBodies(b3, bodies) {
  let hash = 0x811c9dc5 >>> 0;
  const mix = (word) => {
    hash ^= word >>> 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  };
  for (const body of bodies) {
    const p = [0, 0, 0];
    const q = [0, 0, 0, 1];
    const lv = [0, 0, 0];
    const av = [0, 0, 0];
    b3.b3Body_GetPosition(p, body);
    b3.b3Body_GetRotation(q, body);
    b3.b3Body_GetLinearVelocity(lv, body);
    b3.b3Body_GetAngularVelocity(av, body);
    for (const value of [...p, ...q, ...lv, ...av]) mix(floatBits(value));
  }
  return hash.toString(16).padStart(8, "0");
}

function readBody(b3, body) {
  const position = [0, 0, 0];
  const rotation = [0, 0, 0, 1];
  const linearVelocity = [0, 0, 0];
  const angularVelocity = [0, 0, 0];
  b3.b3Body_GetPosition(position, body);
  b3.b3Body_GetRotation(rotation, body);
  b3.b3Body_GetLinearVelocity(linearVelocity, body);
  b3.b3Body_GetAngularVelocity(angularVelocity, body);
  const values = [...position, ...rotation, ...linearVelocity, ...angularVelocity];
  assert(values.every(Number.isFinite), "non-finite body state");
  return { position, rotation, linearVelocity, angularVelocity };
}

function positionDistance(a, b) {
  return Math.hypot(
    a.position[0] - b.position[0],
    a.position[1] - b.position[1],
    a.position[2] - b.position[2],
  );
}

function rotationDegrees(a, b) {
  const dot = Math.abs(
    a.rotation[0] * b.rotation[0] +
    a.rotation[1] * b.rotation[1] +
    a.rotation[2] * b.rotation[2] +
    a.rotation[3] * b.rotation[3]
  );
  return 2 * Math.acos(clamp(dot, -1, 1)) * 180 / Math.PI;
}

function wallPositions(shape) {
  if (shape === "wide4x2") {
    const columns = [1.89, 2.83, 3.77, 4.71];
    const rows = [0.46, 1.38];
    return rows.flatMap((y) => columns.map((z) => [WALL_X, y, z]));
  }
  if (shape === "tall2x4") {
    const columns = [2.83, 3.77];
    const rows = [0.46, 1.38, 2.30, 3.22];
    return rows.flatMap((y) => columns.map((z) => [WALL_X, y, z]));
  }
  throw new Error(`unknown wall shape ${shape}`);
}

function variantLayout(variant) {
  const firstX = TRAIN_TAIL_X - SPACING * (variant.trainLength - 1);
  const train = Array.from({ length: variant.trainLength }, (_, index) => ({
    id: `train-${index}`,
    position: [firstX + SPACING * index, 0.46, TRAIN_Z],
  }));
  const wall = wallPositions(variant.wall).map((position, index) => ({ id: `wall-${index}`, position }));
  return { train, wall, firstX };
}

function addStaticBox(b3, world, position, halfExtents) {
  const bodyDef = b3.b3DefaultBodyDef();
  bodyDef.position = [...position];
  const body = b3.b3CreateBody(world, bodyDef);
  b3.b3CreateBoxShape(body, b3.b3DefaultShapeDef(), halfExtents[0], halfExtents[1], halfExtents[2]);
  return body;
}

function addProp(b3, world, authored) {
  const bodyDef = b3.b3DefaultBodyDef();
  bodyDef.type = b3.b3BodyType.b3_dynamicBody;
  bodyDef.position = [...authored.position];
  bodyDef.linearDamping = WORLD_V0_PROP_PHYSICS.linearDamping;
  bodyDef.angularDamping = WORLD_V0_PROP_PHYSICS.angularDamping;
  const body = b3.b3CreateBody(world, bodyDef);
  b3.b3Body_SetName(body, authored.id);
  const shapeDef = b3.b3DefaultShapeDef();
  shapeDef.density = WORLD_V0_PROP_PHYSICS.density;
  shapeDef.baseMaterial.friction = WORLD_V0_PROP_PHYSICS.friction;
  shapeDef.baseMaterial.restitution = WORLD_V0_PROP_PHYSICS.restitution;
  b3.b3CreateBoxShape(body, shapeDef, HALF[0], HALF[1], HALF[2]);
  return body;
}

function addPlayer(b3, world, position) {
  const bodyDef = b3.b3DefaultBodyDef();
  bodyDef.type = b3.b3BodyType.b3_dynamicBody;
  bodyDef.position = [...position];
  bodyDef.linearDamping = WORLD_V0_PLAYER_PHYSICS.linearDamping;
  bodyDef.angularDamping = WORLD_V0_PLAYER_PHYSICS.angularDamping;
  const body = b3.b3CreateBody(world, bodyDef);
  const shapeDef = b3.b3DefaultShapeDef();
  shapeDef.density = WORLD_V0_PLAYER_PHYSICS.density;
  shapeDef.baseMaterial.friction = WORLD_V0_PLAYER_PHYSICS.friction;
  shapeDef.baseMaterial.restitution = WORLD_V0_PLAYER_PHYSICS.restitution;
  b3.b3CreateCapsuleShape(body, shapeDef, {
    center1: [...WORLD_V0_PLAYER_PHYSICS.capsuleCenter1],
    center2: [...WORLD_V0_PLAYER_PHYSICS.capsuleCenter2],
    radius: WORLD_V0_PLAYER_PHYSICS.capsuleRadius,
  });
  b3.b3Body_SetMotionLocks(body, {
    linearX: false,
    linearY: false,
    linearZ: false,
    angularX: WORLD_V0_PLAYER_PHYSICS.angularLocks[0],
    angularY: WORLD_V0_PLAYER_PHYSICS.angularLocks[1],
    angularZ: WORLD_V0_PLAYER_PHYSICS.angularLocks[2],
  });
  return body;
}

function applyIntent(b3, body, inputX, inputZ) {
  const velocity = [0, 0, 0];
  b3.b3Body_GetLinearVelocity(velocity, body);
  const hasInput = Math.hypot(inputX, inputZ) > 0.01;
  const [nextX, nextZ] = moveToward2(
    velocity[0], velocity[2],
    inputX * WORLD_V0_MOVEMENT.playerSpeed,
    inputZ * WORLD_V0_MOVEMENT.playerSpeed,
    (hasInput ? WORLD_V0_MOVEMENT.playerAcceleration : WORLD_V0_MOVEMENT.playerDeceleration) /
      WORLD_V0_TIMING.simulationHz,
  );
  b3.b3Body_SetLinearVelocity(body, [nextX, velocity[1], nextZ]);
}

function snapshotGroup(b3, entries) {
  return new Map(entries.map(({ id, body }) => [id, readBody(b3, body)]));
}

function groupMetrics(baseline, final, ids) {
  const perEntity = ids.map((id) => {
    const a = baseline.get(id);
    const b = final.get(id);
    assert(a && b, `missing state ${id}`);
    return {
      id,
      displacement: positionDistance(a, b),
      rotationDeg: rotationDegrees(a, b),
      verticalDrop: Math.max(0, a.position[1] - b.position[1]),
      finalY: b.position[1],
    };
  });
  const displacements = perEntity.map((x) => x.displacement);
  const rotations = perEntity.map((x) => x.rotationDeg);
  const drops = perEntity.map((x) => x.verticalDrop);
  return {
    maxDisplacement: Math.max(...displacements),
    meanDisplacement: displacements.reduce((a, b) => a + b, 0) / displacements.length,
    maxRotationDeg: Math.max(...rotations),
    meanRotationDeg: rotations.reduce((a, b) => a + b, 0) / rotations.length,
    maxVerticalDrop: Math.max(...drops),
    movedOver50mm: perEntity.filter((x) => x.displacement > 0.05).length,
    movedOver100mm: perEntity.filter((x) => x.displacement > 0.10).length,
    rotatedOver20Deg: perEntity.filter((x) => x.rotationDeg > 20).length,
    rotatedOver45Deg: perEntity.filter((x) => x.rotationDeg > 45).length,
    perEntity,
  };
}

function runOne(b3, variant, active) {
  const layout = variantLayout(variant);
  const worldDef = b3.b3DefaultWorldDef();
  worldDef.gravity = [...WORLD_V0_ARENA.gravity];
  const world = b3.b3CreateWorld(worldDef);
  addStaticBox(b3, world, [0, -0.5, 0], [10, 0.5, 10]);

  const train = layout.train.map((authored) => ({ ...authored, body: addProp(b3, world, authored) }));
  const wall = layout.wall.map((authored) => ({ ...authored, body: addProp(b3, world, authored) }));
  const playerX = layout.firstX - (HALF[0] + WORLD_V0_PLAYER_PHYSICS.capsuleRadius + PLAYER_SURFACE_GAP);
  const player = addPlayer(b3, world, [playerX, 0.82, TRAIN_Z]);
  const allBodies = [player, ...train.map((x) => x.body), ...wall.map((x) => x.body)];

  for (let tick = 0; tick < NEUTRAL_TICKS; tick += 1) {
    applyIntent(b3, player, 0, 0);
    b3.b3World_Step(world, 1 / WORLD_V0_TIMING.simulationHz, WORLD_V0_TIMING.substeps);
  }
  const baselineTrain = snapshotGroup(b3, train);
  const baselineWall = snapshotGroup(b3, wall);
  const baselinePlayer = readBody(b3, player);
  const baselineHash = hashBodies(b3, allBodies);

  for (let tick = 0; tick < PUSH_TICKS; tick += 1) {
    applyIntent(b3, player, active ? 1 : 0, 0);
    b3.b3World_Step(world, 1 / WORLD_V0_TIMING.simulationHz, WORLD_V0_TIMING.substeps);
  }
  for (let tick = 0; tick < SETTLE_TICKS; tick += 1) {
    applyIntent(b3, player, 0, 0);
    b3.b3World_Step(world, 1 / WORLD_V0_TIMING.simulationHz, WORLD_V0_TIMING.substeps);
  }

  const finalTrain = snapshotGroup(b3, train);
  const finalWall = snapshotGroup(b3, wall);
  const finalPlayer = readBody(b3, player);
  const finalHash = hashBodies(b3, allBodies);
  const result = {
    active,
    baselineHash,
    finalHash,
    playerStart: [playerX, 0.82, TRAIN_Z],
    playerBaseline: baselinePlayer,
    playerFinal: finalPlayer,
    train: groupMetrics(baselineTrain, finalTrain, train.map((x) => x.id)),
    wall: groupMetrics(baselineWall, finalWall, wall.map((x) => x.id)),
  };

  if (typeof b3.b3DestroyWorld === "function") b3.b3DestroyWorld(world);
  return result;
}

function summarizeVariant(variant, control, active) {
  return {
    id: variant.id,
    trainLength: variant.trainLength,
    wall: variant.wall,
    bodyCount: variant.trainLength + 8 + 1,
    deterministic: {
      control: control.every((run) => run.finalHash === control[0].finalHash),
      active: active.every((run) => run.finalHash === active[0].finalHash),
    },
    control: control[0],
    active: active[0],
    causalDelta: {
      trainMaxDisplacement: active[0].train.maxDisplacement - control[0].train.maxDisplacement,
      wallMaxDisplacement: active[0].wall.maxDisplacement - control[0].wall.maxDisplacement,
      wallMaxRotationDeg: active[0].wall.maxRotationDeg - control[0].wall.maxRotationDeg,
      wallMaxVerticalDrop: active[0].wall.maxVerticalDrop - control[0].wall.maxVerticalDrop,
      movedOver100mmDelta: active[0].wall.movedOver100mm - control[0].wall.movedOver100mm,
      rotatedOver45DegDelta: active[0].wall.rotatedOver45Deg - control[0].wall.rotatedOver45Deg,
    },
  };
}

const evidence = {
  verdict: "WORLD_V0_SHARED_CONSEQUENCE_GEOMETRY_LAB_FAIL",
  generatedAt: new Date().toISOString(),
  runtime: "box3d.js@0.1.1 inline / Node",
  constants: {
    simulationHz: WORLD_V0_TIMING.simulationHz,
    substeps: WORLD_V0_TIMING.substeps,
    neutralTicks: NEUTRAL_TICKS,
    pushTicks: PUSH_TICKS,
    settleTicks: SETTLE_TICKS,
    playerSurfaceGap: PLAYER_SURFACE_GAP,
    propPhysics: WORLD_V0_PROP_PHYSICS,
    playerPhysics: WORLD_V0_PLAYER_PHYSICS,
    movement: WORLD_V0_MOVEMENT,
  },
  variants: [],
  error: null,
};

try {
  const b3 = await Box3D();
  assert(typeof b3.b3CreateWorld === "function", "Box3D inline boot missing b3CreateWorld");
  for (const variant of VARIANTS) {
    const control = [];
    const active = [];
    for (let repeat = 0; repeat < REPEATS; repeat += 1) control.push(runOne(b3, variant, false));
    for (let repeat = 0; repeat < REPEATS; repeat += 1) active.push(runOne(b3, variant, true));
    const summary = summarizeVariant(variant, control, active);
    assert(summary.deterministic.control, `${variant.id}: control nondeterministic`);
    assert(summary.deterministic.active, `${variant.id}: active nondeterministic`);
    evidence.variants.push(summary);
    console.log("GEOMETRY_CELL", JSON.stringify({
      id: summary.id,
      controlWall: {
        maxDisplacement: summary.control.wall.maxDisplacement,
        maxRotationDeg: summary.control.wall.maxRotationDeg,
      },
      activeWall: {
        maxDisplacement: summary.active.wall.maxDisplacement,
        meanDisplacement: summary.active.wall.meanDisplacement,
        maxRotationDeg: summary.active.wall.maxRotationDeg,
        maxVerticalDrop: summary.active.wall.maxVerticalDrop,
        movedOver100mm: summary.active.wall.movedOver100mm,
        rotatedOver45Deg: summary.active.wall.rotatedOver45Deg,
      },
      activeTrainMax: summary.active.train.maxDisplacement,
      causalDelta: summary.causalDelta,
    }));
  }
  evidence.verdict = "WORLD_V0_SHARED_CONSEQUENCE_GEOMETRY_LAB_COMPLETE";
  writeFileSync(OUTPUT, JSON.stringify(evidence, null, 2));
  console.log(evidence.verdict);
} catch (error) {
  evidence.error = error instanceof Error ? error.stack || error.message : String(error);
  writeFileSync(OUTPUT, JSON.stringify(evidence, null, 2));
  throw error;
}
