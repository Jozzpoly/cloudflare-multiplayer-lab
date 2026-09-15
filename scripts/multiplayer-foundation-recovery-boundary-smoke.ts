import assert from "node:assert/strict";
import Box3D from "box3d.js";

const b3 = await Box3D();
const DT = 1 / 60;
const SUBSTEPS = 4;

type BodyId = ReturnType<typeof b3.b3CreateBody>;
type WorldId = ReturnType<typeof b3.b3CreateWorld>;
type Vec3 = [number, number, number];
type Quat = [number, number, number, number];
type ExposedBodyState = {
  position: Vec3;
  rotation: Quat;
  linearVelocity: Vec3;
  angularVelocity: Vec3;
  awake: boolean;
};

type Divergence = {
  tick: number;
  component: string;
  reference: number | boolean;
  candidate: number | boolean;
};

function makeDynamicBox(world: WorldId, position: Vec3): BodyId {
  const bodyDef = b3.b3DefaultBodyDef();
  bodyDef.type = b3.b3BodyType.b3_dynamicBody;
  bodyDef.position = [...position];
  const body = b3.b3CreateBody(world, bodyDef);
  const shapeDef = b3.b3DefaultShapeDef();
  shapeDef.density = 1;
  shapeDef.baseMaterial.friction = 0.8;
  b3.b3CreateBoxShape(body, shapeDef, 0.5, 0.5, 0.5);
  return body;
}

function addGround(world: WorldId): void {
  const def = b3.b3DefaultBodyDef();
  def.position = [0, -0.5, 0];
  const ground = b3.b3CreateBody(world, def);
  const shapeDef = b3.b3DefaultShapeDef();
  shapeDef.baseMaterial.friction = 0.8;
  b3.b3CreateBoxShape(ground, shapeDef, 20, 0.5, 20);
}

function createWorld(gravity: Vec3, withGround: boolean): { world: WorldId; body: BodyId } {
  const def = b3.b3DefaultWorldDef();
  def.gravity = [...gravity];
  const world = b3.b3CreateWorld(def);
  if (withGround) addGround(world);
  const body = makeDynamicBox(world, withGround ? [0, 2.5, 0] : [1.25, 2.5, -0.75]);
  return { world, body };
}

function readState(body: BodyId): ExposedBodyState {
  const position: Vec3 = [0, 0, 0];
  const rotation: Quat = [0, 0, 0, 1];
  const linearVelocity: Vec3 = [0, 0, 0];
  const angularVelocity: Vec3 = [0, 0, 0];
  b3.b3Body_GetPosition(position, body);
  b3.b3Body_GetRotation(rotation, body);
  b3.b3Body_GetLinearVelocity(linearVelocity, body);
  b3.b3Body_GetAngularVelocity(angularVelocity, body);
  return {
    position: [...position],
    rotation: [...rotation],
    linearVelocity: [...linearVelocity],
    angularVelocity: [...angularVelocity],
    awake: b3.b3Body_IsAwake(body),
  };
}

function writeState(body: BodyId, state: ExposedBodyState): void {
  b3.b3Body_SetTransform(body, state.position, state.rotation);
  b3.b3Body_SetLinearVelocity(body, state.linearVelocity);
  b3.b3Body_SetAngularVelocity(body, state.angularVelocity);
  b3.b3Body_SetAwake(body, state.awake);
}

function firstStateDifference(reference: ExposedBodyState, candidate: ExposedBodyState, tick: number): Divergence | null {
  const numericGroups = [
    ["position", reference.position, candidate.position],
    ["rotation", reference.rotation, candidate.rotation],
    ["linearVelocity", reference.linearVelocity, candidate.linearVelocity],
    ["angularVelocity", reference.angularVelocity, candidate.angularVelocity],
  ] as const;
  for (const [label, a, b] of numericGroups) {
    for (let index = 0; index < a.length; index += 1) {
      if (Object.is(a[index], b[index])) continue;
      return { tick, component: `${label}.${index}`, reference: a[index], candidate: b[index] };
    }
  }
  if (reference.awake !== candidate.awake) {
    return { tick, component: "awake", reference: reference.awake, candidate: candidate.awake };
  }
  return null;
}

function runFreeFlight(): { firstDivergence: Divergence | null; horizon: number } {
  const baseline = createWorld([0, 0, 0], false);
  b3.b3Body_SetLinearVelocity(baseline.body, [1.25, -0.5, 0.75]);
  b3.b3Body_SetAngularVelocity(baseline.body, [0.2, -0.3, 0.4]);
  for (let tick = 0; tick < 30; tick += 1) b3.b3World_Step(baseline.world, DT, SUBSTEPS);

  const checkpoint = readState(baseline.body);
  const future: ExposedBodyState[] = [];
  const horizon = 120;
  for (let tick = 1; tick <= horizon; tick += 1) {
    b3.b3World_Step(baseline.world, DT, SUBSTEPS);
    future.push(readState(baseline.body));
  }
  b3.b3DestroyWorld(baseline.world);

  const restored = createWorld([0, 0, 0], false);
  writeState(restored.body, checkpoint);
  assert.deepEqual(readState(restored.body), checkpoint, "free-flight restore boundary must reproduce exposed state exactly");

  let firstDivergence: Divergence | null = null;
  for (let tick = 1; tick <= horizon; tick += 1) {
    b3.b3World_Step(restored.world, DT, SUBSTEPS);
    const difference = firstStateDifference(future[tick - 1], readState(restored.body), tick);
    if (difference && firstDivergence === null) firstDivergence = difference;
  }
  b3.b3DestroyWorld(restored.world);
  return { firstDivergence, horizon };
}

function runContact(): { firstDivergence: Divergence | null; horizon: number } {
  const baseline = createWorld([0, -10, 0], true);
  for (let tick = 0; tick < 180; tick += 1) b3.b3World_Step(baseline.world, DT, SUBSTEPS);
  assert(Math.abs(readState(baseline.body).position[1] - 0.5) < 0.02, "contact fixture must settle on the ground before checkpoint");

  // Preserve the existing contact manifold/cache but wake the body and give it a
  // deterministic tangential velocity immediately before the checkpoint.
  b3.b3Body_SetAwake(baseline.body, true);
  b3.b3Body_SetLinearVelocity(baseline.body, [2.0, 0, 0.35]);
  const checkpoint = readState(baseline.body);
  const future: ExposedBodyState[] = [];
  const horizon = 120;
  for (let tick = 1; tick <= horizon; tick += 1) {
    b3.b3World_Step(baseline.world, DT, SUBSTEPS);
    future.push(readState(baseline.body));
  }
  b3.b3DestroyWorld(baseline.world);

  const restored = createWorld([0, -10, 0], true);
  writeState(restored.body, checkpoint);
  assert.deepEqual(readState(restored.body), checkpoint, "contact restore boundary must reproduce exposed state exactly");

  let firstDivergence: Divergence | null = null;
  for (let tick = 1; tick <= horizon; tick += 1) {
    b3.b3World_Step(restored.world, DT, SUBSTEPS);
    const difference = firstStateDifference(future[tick - 1], readState(restored.body), tick);
    if (difference && firstDivergence === null) firstDivergence = difference;
  }
  b3.b3DestroyWorld(restored.world);
  return { firstDivergence, horizon };
}

const freeFlight = runFreeFlight();
assert.equal(
  freeFlight.firstDivergence,
  null,
  `free-flight exposed-state reconstruction unexpectedly diverged: ${JSON.stringify(freeFlight.firstDivergence)}`,
);

const contact = runContact();
assert(contact.firstDivergence, "contact fixture unexpectedly stayed exact; apparatus no longer isolates hidden contact/solver state");

console.log(
  `MULTIPLAYER FOUNDATION RECOVERY BOUNDARY SMOKE PASS · freeFlight=EXACT_THROUGH_${freeFlight.horizon} · contact=DIVERGED_AT_${contact.firstDivergence.tick} · contactFirstDifference=${JSON.stringify(contact.firstDivergence)}`,
);
