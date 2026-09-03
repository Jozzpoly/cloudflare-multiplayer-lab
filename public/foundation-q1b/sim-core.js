export const Q1B_REVISION = "foundation-v0-q1b-browser-runtime-v1";
export const Q1B_TOTAL_TICKS = 600;
export const Q1B_PERTURB_TARGET_TICK = 90;
export const Q1B_EXPECTED_PERTURB_BOUNDARY = 91;

const DT = 1 / 60;
const SUBSTEPS = 4;
const PLAYER_SPEED = 5.2;
const PLAYER_ACCELERATION = 28;
const PLAYER_DECELERATION = 36;
const PROP_COUNT = 12;
const PLAYER_STARTS = [[-6.5, 0.82, -1.4], [6.5, 0.82, 0]];
const AXES_3 = ["x", "y", "z"];
const AXES_4 = ["x", "y", "z", "w"];
const COMPONENTS = [
  ["position", AXES_3],
  ["rotation", AXES_4],
  ["linearVelocity", AXES_3],
  ["angularVelocity", AXES_3],
];

function createF32Encoder() {
  const view = new DataView(new ArrayBuffer(4));
  return (value) => {
    view.setFloat32(0, value, true);
    return view.getUint32(0, true).toString(16).padStart(8, "0");
  };
}

function readVec3(getter, body) {
  const out = [0, 0, 0];
  getter(out, body);
  return out;
}

function readQuat(b3, body) {
  const out = [0, 0, 0, 1];
  b3.b3Body_GetRotation(out, body);
  return out;
}

function createStaticBox(b3, world, position, halfExtents) {
  const def = b3.b3DefaultBodyDef();
  def.position = [...position];
  const body = b3.b3CreateBody(world, def);
  b3.b3CreateBoxShape(body, b3.b3DefaultShapeDef(), halfExtents[0], halfExtents[1], halfExtents[2]);
}

function createProp(b3, world, index) {
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

function createActor(b3, world, slot) {
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
  b3.b3CreateCapsuleShape(body, shape, {
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
  return { id: `actor:${slot}`, body, slot };
}

function createWorldState(b3) {
  const def = b3.b3DefaultWorldDef();
  def.gravity = [0, -20, 0];
  const world = b3.b3CreateWorld(def);

  createStaticBox(b3, world, [0, -0.5, 0], [10, 0.5, 10]);
  createStaticBox(b3, world, [-9.5, 1.5, 0], [0.5, 2, 10]);
  createStaticBox(b3, world, [9.5, 1.5, 0], [0.5, 2, 10]);
  createStaticBox(b3, world, [0, 1.5, -9.5], [10, 2, 0.5]);
  createStaticBox(b3, world, [0, 1.5, 9.5], [10, 2, 0.5]);

  const props = Array.from({ length: PROP_COUNT }, (_, index) => createProp(b3, world, index));
  const actors = new Map([[0, createActor(b3, world, 0)], [1, createActor(b3, world, 1)]]);
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

function canonicalInput(slot, tick) {
  if (tick < 90) return { x: 0, z: 0 };
  if (tick < 210) return slot === 0 ? { x: 1, z: 0 } : { x: -1, z: 0 };
  if (tick < 270) return slot === 0 ? { x: 0, z: 1 } : { x: 0, z: -1 };
  if (tick < 330) return slot === 0 ? { x: -1, z: 0 } : { x: 1, z: 0 };
  if (tick < 420) return slot === 0 ? { x: 0.70710678, z: -0.70710678 } : { x: -0.70710678, z: 0.70710678 };
  if (tick < 510) return slot === 0 ? { x: 1, z: 0.35 } : { x: -1, z: -0.35 };
  return { x: 0, z: 0 };
}

function applyIntent(b3, body, input) {
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

function bodyValues(b3, body) {
  return {
    position: readVec3(b3.b3Body_GetPosition, body),
    rotation: readQuat(b3, body),
    linearVelocity: readVec3(b3.b3Body_GetLinearVelocity, body),
    angularVelocity: readVec3(b3.b3Body_GetAngularVelocity, body),
  };
}

function buildEntityOrder(cell) {
  const entities = [
    ["actor:0", cell.actors.get(0).body],
    ["actor:1", cell.actors.get(1).body],
    ...cell.props.map((prop) => [prop.id, prop.body]),
  ];
  entities.sort(([a], [b]) => a.localeCompare(b));
  return entities;
}

function buildFields(entityOrder) {
  const fields = [];
  for (const [id] of entityOrder) {
    for (const [component, axes] of COMPONENTS) {
      for (const axis of axes) fields.push(`${id}.${component}.${axis}`);
    }
  }
  return fields;
}

function sampleTraceRow(b3, entityOrder, encodeF32) {
  let packed = "";
  for (const [, body] of entityOrder) {
    const values = bodyValues(b3, body);
    for (const [component] of COMPONENTS) {
      for (const value of values[component]) packed += encodeF32(value);
    }
  }
  return packed;
}

export function decodeTraceValue(hex) {
  const view = new DataView(new ArrayBuffer(4));
  view.setUint32(0, Number.parseInt(hex, 16), true);
  return view.getFloat32(0, true);
}

export function firstTraceDifference(reference, candidate) {
  const tickCount = Math.min(reference.trace.length, candidate.trace.length);
  for (let index = 0; index < tickCount; index += 1) {
    const a = reference.trace[index];
    const b = candidate.trace[index];
    if (a === b) continue;
    const scalarCount = Math.min(a.length, b.length) / 8;
    for (let scalar = 0; scalar < scalarCount; scalar += 1) {
      const offset = scalar * 8;
      const aBits = a.slice(offset, offset + 8);
      const bBits = b.slice(offset, offset + 8);
      if (aBits !== bBits) {
        return {
          boundaryTick: index + 1,
          field: reference.fields[scalar] ?? `scalar:${scalar}`,
          referenceBits: aBits,
          candidateBits: bBits,
          referenceValue: decodeTraceValue(aBits),
          candidateValue: decodeTraceValue(bBits),
        };
      }
    }
    return {
      boundaryTick: index + 1,
      field: "trace-row-length",
      referenceLength: a.length,
      candidateLength: b.length,
    };
  }
  if (reference.trace.length !== candidate.trace.length) {
    return {
      boundaryTick: tickCount + 1,
      field: "trace-length",
      referenceLength: reference.trace.length,
      candidateLength: candidate.trace.length,
    };
  }
  return null;
}

export function runQ1bSimulation(b3, { perturb = false } = {}) {
  const cell = createWorldState(b3);
  const encodeF32 = createF32Encoder();
  const entityOrder = buildEntityOrder(cell);
  const fields = buildFields(entityOrder);
  const trace = [];

  try {
    for (let targetTick = 0; targetTick < Q1B_TOTAL_TICKS; targetTick += 1) {
      for (const slot of [0, 1]) {
        let input = canonicalInput(slot, targetTick);
        if (perturb && slot === 1 && targetTick === Q1B_PERTURB_TARGET_TICK) input = { x: 0, z: 0 };
        applyIntent(b3, cell.actors.get(slot).body, input);
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

      trace.push(sampleTraceRow(b3, entityOrder, encodeF32));
    }

    return {
      revision: Q1B_REVISION,
      perturb,
      packageContract: "box3d.js@0.1.1 inline/precompiled wasm",
      box3dVersion: b3.b3GetVersion(),
      simulation: {
        ticks: Q1B_TOTAL_TICKS,
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
      maxPropDisplacement: cell.maxPropDisplacement,
      fields,
      trace,
    };
  } finally {
    b3.b3DestroyWorld(cell.world);
  }
}
