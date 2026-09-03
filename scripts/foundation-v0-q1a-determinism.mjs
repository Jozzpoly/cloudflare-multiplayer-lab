import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import Box3D from "box3d.js/inline";

const b3 = await Box3D();
const REVISION = "foundation-v0-q1a-determinism-v1";
const OUTPUT = process.env.MW_Q1_OUTPUT || "foundation-v0-q1a-determinism.json";
const DT = 1 / 60;
const SUBSTEPS = 4;
const TOTAL_TICKS = 600;
const PERTURB_TARGET_TICK = 90;
const EXPECTED_PERTURB_BOUNDARY = PERTURB_TARGET_TICK + 1;
const PLAYER_SPEED = 5.2;
const PLAYER_ACCELERATION = 28;
const PLAYER_DECELERATION = 36;
const PROP_COUNT = 12;
const PLAYER_STARTS = [[-6.5, 0.82, -1.4], [6.5, 0.82, 0]];
const F32 = new DataView(new ArrayBuffer(4));

function f32Bits(value) {
  F32.setFloat32(0, value, true);
  return F32.getUint32(0, true).toString(16).padStart(8, "0");
}

function readVec3(getter, body) {
  const out = [0, 0, 0];
  getter(out, body);
  return out;
}

function readQuat(body) {
  const out = [0, 0, 0, 1];
  b3.b3Body_GetRotation(out, body);
  return out;
}

function createStaticBox(world, position, halfExtents) {
  const def = b3.b3DefaultBodyDef();
  def.position = [...position];
  const body = b3.b3CreateBody(world, def);
  b3.b3CreateBoxShape(body, b3.b3DefaultShapeDef(), halfExtents[0], halfExtents[1], halfExtents[2]);
}

function createProp(world, index) {
  const col = index % 4;
  const row = Math.floor(index / 4);
  const initial = [(col - 1.5) * 1.05, 0.46, (row - 1) * 1.05];
  const def = b3.b3DefaultBodyDef();
  def.type = b3.b3BodyType.b3_dynamicBody;
  def.position = [...initial];
  def.linearDamping = 0.08;
  def.angularDamping = 0.12;
  const body = b3.b3CreateBody(world, def);
  b3.b3Body_SetName(body, `prop-${index}`);
  const shape = b3.b3DefaultShapeDef();
  shape.density = 22;
  shape.baseMaterial.friction = 0.72;
  shape.baseMaterial.restitution = 0.04;
  b3.b3CreateBoxShape(body, shape, 0.46, 0.46, 0.46);
  return { id: `prop-${index}`, body, initial };
}

function createActor(world, slot) {
  const def = b3.b3DefaultBodyDef();
  def.type = b3.b3BodyType.b3_dynamicBody;
  def.position = [...PLAYER_STARTS[slot]];
  def.linearDamping = 0.3;
  def.angularDamping = 8;
  const body = b3.b3CreateBody(world, def);
  b3.b3Body_SetName(body, `actor:${slot}`);
  const shape = b3.b3DefaultShapeDef();
  shape.density = 80;
  shape.baseMaterial.friction = 0.8;
  shape.baseMaterial.restitution = 0.02;
  b3.b3CreateCapsuleShape(body, shape, { center1: [0, -0.45, 0], center2: [0, 0.45, 0], radius: 0.35 });
  b3.b3Body_SetMotionLocks(body, {
    linearX: false,
    linearY: false,
    linearZ: false,
    angularX: true,
    angularY: true,
    angularZ: true,
  });
  return { id: `actor:${slot}`, body, slot };
}

function createCell(actorCreationOrder = [0, 1]) {
  const def = b3.b3DefaultWorldDef();
  def.gravity = [0, -20, 0];
  const world = b3.b3CreateWorld(def);
  createStaticBox(world, [0, -0.5, 0], [10, 0.5, 10]);
  createStaticBox(world, [-9.5, 1.5, 0], [0.5, 2, 10]);
  createStaticBox(world, [9.5, 1.5, 0], [0.5, 2, 10]);
  createStaticBox(world, [0, 1.5, -9.5], [10, 2, 0.5]);
  createStaticBox(world, [0, 1.5, 9.5], [10, 2, 0.5]);
  const props = Array.from({ length: PROP_COUNT }, (_, index) => createProp(world, index));
  const actors = new Map();
  for (const slot of actorCreationOrder) actors.set(slot, createActor(world, slot));
  return { world, props, actors, maxPropDisplacement: 0 };
}

function moveToward2(cx, cz, tx, tz, maxDelta) {
  const dx = tx - cx;
  const dz = tz - cz;
  const distance = Math.hypot(dx, dz);
  if (distance <= maxDelta || distance < 1e-9) return [tx, tz];
  const scale = maxDelta / distance;
  return [cx + dx * scale, cz + dz * scale];
}

function applyIntent(body, input) {
  const velocity = readVec3(b3.b3Body_GetLinearVelocity, body);
  const hasInput = Math.hypot(input.x, input.z) > 0.01;
  const [nextX, nextZ] = moveToward2(
    velocity[0],
    velocity[2],
    input.x * PLAYER_SPEED,
    input.z * PLAYER_SPEED,
    (hasInput ? PLAYER_ACCELERATION : PLAYER_DECELERATION) * DT,
  );
  b3.b3Body_SetLinearVelocity(body, [nextX, velocity[1], nextZ]);
}

function canonicalInput(slot, tick) {
  if (tick < 90) return { x: 0, z: 0 };
  if (tick < 210) return slot === 0 ? { x: 1, z: 0 } : { x: -1, z: 0 };
  if (tick < 270) return slot === 0 ? { x: 0, z: 1 } : { x: 0, z: -1 };
  if (tick < 330) return slot === 0 ? { x: -1, z: 0 } : { x: 1, z: 0 };
  if (tick < 420) return slot === 0 ? { x: 0.70710678, z: -0.70710678 } : { x: -0.70710678, z: 0.70710678 };
  if (tick < 510) return slot === 0 ? { x: 1, z: 0.35 } : { x: -1, z: -0.35 };
  return { x: 0, z: 0 };
}

function stepCell(cell, targetTick, perturb = false) {
  for (const slot of [0, 1]) {
    let input = canonicalInput(slot, targetTick);
    if (perturb && slot === 1 && targetTick === PERTURB_TARGET_TICK) input = { x: 0, z: 0 };
    applyIntent(cell.actors.get(slot).body, input);
  }
  b3.b3World_Step(cell.world, DT, SUBSTEPS);
  for (const prop of cell.props) {
    const position = readVec3(b3.b3Body_GetPosition, prop.body);
    cell.maxPropDisplacement = Math.max(
      cell.maxPropDisplacement,
      Math.hypot(
        position[0] - prop.initial[0],
        position[1] - prop.initial[1],
        position[2] - prop.initial[2],
      ),
    );
  }
}

function bodyState(body) {
  const position = readVec3(b3.b3Body_GetPosition, body);
  const rotation = readQuat(body);
  const linearVelocity = readVec3(b3.b3Body_GetLinearVelocity, body);
  const angularVelocity = readVec3(b3.b3Body_GetAngularVelocity, body);
  const values = { position, rotation, linearVelocity, angularVelocity };
  const bits = Object.fromEntries(
    Object.entries(values).map(([component, vector]) => [component, vector.map(f32Bits)]),
  );
  return { values, bits };
}

function sample(cell) {
  const entities = [];
  for (const slot of [0, 1]) entities.push([`actor:${slot}`, cell.actors.get(slot).body]);
  for (const prop of cell.props) entities.push([prop.id, prop.body]);
  entities.sort(([a], [c]) => a.localeCompare(c));
  const state = Object.fromEntries(entities.map(([id, body]) => [id, bodyState(body)]));
  const payload = Object.entries(state).map(([id, value]) => [id, value.bits]);
  const fingerprint = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  return { fingerprint, state };
}

function firstDifference(a, c) {
  const componentOrder = ["position", "rotation", "linearVelocity", "angularVelocity"];
  for (const id of Object.keys(a.state)) {
    for (const component of componentOrder) {
      const abits = a.state[id].bits[component];
      const cbits = c.state[id].bits[component];
      for (let axis = 0; axis < abits.length; axis += 1) {
        if (abits[axis] !== cbits[axis]) {
          return {
            entity: id,
            component,
            axis,
            baselineBits: abits[axis],
            candidateBits: cbits[axis],
            baselineValue: a.state[id].values[component][axis],
            candidateValue: c.state[id].values[component][axis],
          };
        }
      }
    }
  }
  return null;
}

function compareAtBoundary(reference, candidate, boundaryTick) {
  const a = sample(reference);
  const c = sample(candidate);
  if (a.fingerprint === c.fingerprint) return null;
  return {
    boundaryTick,
    referenceFingerprint: a.fingerprint,
    candidateFingerprint: c.fingerprint,
    difference: firstDifference(a, c),
  };
}

const twinA = createCell([0, 1]);
const twinB = createCell([0, 1]);
const perturb = createCell([0, 1]);
const reverseCreation = createCell([1, 0]);
let twinDivergence = null;
let perturbDivergence = null;
let orderDivergence = null;

try {
  for (let targetTick = 0; targetTick < TOTAL_TICKS; targetTick += 1) {
    stepCell(twinA, targetTick, false);
    stepCell(twinB, targetTick, false);
    stepCell(perturb, targetTick, true);
    stepCell(reverseCreation, targetTick, false);
    const boundaryTick = targetTick + 1;
    if (!twinDivergence) twinDivergence = compareAtBoundary(twinA, twinB, boundaryTick);
    if (!perturbDivergence) perturbDivergence = compareAtBoundary(twinA, perturb, boundaryTick);
    if (!orderDivergence) orderDivergence = compareAtBoundary(twinA, reverseCreation, boundaryTick);
  }

  const coupledScene = twinA.maxPropDisplacement > 0.05;
  const exactTwinsPass = twinDivergence === null;
  const sensitivityPass = perturbDivergence?.boundaryTick === EXPECTED_PERTURB_BOUNDARY;
  const pass = exactTwinsPass && sensitivityPass && coupledScene;
  const evidence = {
    revision: REVISION,
    generatedAt: new Date().toISOString(),
    packageContract: "box3d.js@0.1.1 imported through box3d.js/inline",
    box3dVersion: b3.b3GetVersion(),
    simulation: {
      ticks: TOTAL_TICKS,
      hz: 60,
      substeps: SUBSTEPS,
      gravity: [0, -20, 0],
      props: PROP_COUNT,
      actorCreationOrder: [0, 1],
      canonicalIntentApplicationOrder: [0, 1],
      speed: PLAYER_SPEED,
      acceleration: PLAYER_ACCELERATION,
      deceleration: PLAYER_DECELERATION,
    },
    coupledScene: { pass: coupledScene, maxPropDisplacement: twinA.maxPropDisplacement },
    exactIndependentTwins: { pass: exactTwinsPass, firstDivergence: twinDivergence },
    oneTickSensitivityControl: {
      pass: sensitivityPass,
      perturbedActor: "actor:1",
      perturbedTargetTick: PERTURB_TARGET_TICK,
      expectedFirstDivergentBoundary: EXPECTED_PERTURB_BOUNDARY,
      firstDivergence: perturbDivergence,
    },
    actorCreationOrderProbe: {
      reversedCreationOrder: [1, 0],
      diverged: orderDivergence !== null,
      firstDivergence: orderDivergence,
    },
    verdict: pass ? "Q1A_PASS_APPARATUS_EARNED" : "Q1A_FAIL",
    nonClaim: "Q1a does not qualify cross-browser or cross-device determinism; it only validates the first-divergent-tick apparatus in one offline Node/Wasm process.",
  };

  writeFileSync(OUTPUT, JSON.stringify(evidence, null, 2));
  console.log(`${REVISION} · ${evidence.verdict}`);
  console.log(`coupled max prop displacement=${twinA.maxPropDisplacement.toFixed(6)} m`);
  console.log(`exact twins: ${exactTwinsPass ? "IDENTICAL" : `DIVERGED@${twinDivergence.boundaryTick}`}`);
  console.log(`1-tick control: ${perturbDivergence ? `DIVERGED@${perturbDivergence.boundaryTick}` : "NO DIVERGENCE"}`);
  console.log(`reverse actor creation: ${orderDivergence ? `DIVERGED@${orderDivergence.boundaryTick}` : "IDENTICAL"}`);
  if (!pass) process.exitCode = 1;
} finally {
  for (const cell of [reverseCreation, perturb, twinB, twinA]) b3.b3DestroyWorld(cell.world);
}
