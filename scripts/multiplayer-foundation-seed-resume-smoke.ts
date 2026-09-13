import assert from "node:assert/strict";
import Box3D from "box3d.js";

const b3 = await Box3D();
const DT = 1 / 60;
const SUBSTEPS = 4;
const HORIZON = 120;

type BodyId = ReturnType<typeof b3.b3CreateBody>;
type WorldId = ReturnType<typeof b3.b3CreateWorld>;
type Vec3 = [number, number, number];
type Quat = [number, number, number, number];
type State = {
  position: Vec3;
  rotation: Quat;
  linearVelocity: Vec3;
  angularVelocity: Vec3;
  awake: boolean;
};

function createContactWorld(): { world: WorldId; body: BodyId } {
  const worldDef = b3.b3DefaultWorldDef();
  worldDef.gravity = [0, -10, 0];
  const world = b3.b3CreateWorld(worldDef);

  const groundDef = b3.b3DefaultBodyDef();
  groundDef.position = [0, -0.5, 0];
  const ground = b3.b3CreateBody(world, groundDef);
  const groundShape = b3.b3DefaultShapeDef();
  groundShape.baseMaterial.friction = 0.8;
  b3.b3CreateBoxShape(ground, groundShape, 20, 0.5, 20);

  const bodyDef = b3.b3DefaultBodyDef();
  bodyDef.type = b3.b3BodyType.b3_dynamicBody;
  bodyDef.position = [0, 2.5, 0];
  const body = b3.b3CreateBody(world, bodyDef);
  const shapeDef = b3.b3DefaultShapeDef();
  shapeDef.density = 1;
  shapeDef.baseMaterial.friction = 0.8;
  b3.b3CreateBoxShape(body, shapeDef, 0.5, 0.5, 0.5);
  return { world, body };
}

function readState(body: BodyId): State {
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

function applyFutureMutation(body: BodyId, tick: number): void {
  if (tick === 30) b3.b3Body_SetLinearVelocity(body, [-1.25, 0.5, 0.8]);
  if (tick === 70) b3.b3Body_SetAngularVelocity(body, [0.15, -0.7, 0.35]);
}

function findOnlyDynamicBody(player: unknown): BodyId {
  const count = b3.b3RecPlayer_GetBodyCount(player);
  const dynamic: BodyId[] = [];
  for (let index = 0; index < count; index += 1) {
    const body = b3.b3RecPlayer_GetBodyId(player, index);
    if (b3.b3Body_GetType(body) === b3.b3BodyType.b3_dynamicBody) dynamic.push(body);
  }
  assert.equal(dynamic.length, 1, "seed fixture must expose exactly one dynamic body");
  return dynamic[0];
}

const source = createContactWorld();
for (let tick = 0; tick < 180; tick += 1) b3.b3World_Step(source.world, DT, SUBSTEPS);
assert(Math.abs(readState(source.body).position[1] - 0.5) < 0.02, "seed fixture must be in persistent ground contact");

b3.b3Body_SetAwake(source.body, true);
b3.b3Body_SetLinearVelocity(source.body, [2.0, 0, 0.35]);
const checkpointState = readState(source.body);

// Start and stop immediately at a valid step boundary. This recording contains
// the internal seed snapshot but no recorded future simulation frames.
const recording = b3.b3CreateRecording(0);
b3.b3World_StartRecording(source.world, recording);
b3.b3World_StopRecording(source.world);

const baseline: State[] = [];
for (let tick = 1; tick <= HORIZON; tick += 1) {
  applyFutureMutation(source.body, tick);
  b3.b3World_Step(source.world, DT, SUBSTEPS);
  baseline.push(readState(source.body));
}
b3.b3DestroyWorld(source.world);

const player = b3.b3RecPlayer_CreateFromRecording(recording, 1);
assert(player, "seed-only recording must create a replay player");
assert.equal(b3.b3RecPlayer_GetFrameCount(player), 0, "seed-only checkpoint must contain zero recorded future frames");
assert.equal(b3.b3RecPlayer_IsAtEnd(player), true, "zero-frame player should begin at end-of-recording");
assert.equal(b3.b3RecPlayer_HasDiverged(player), false);

const restoredWorld = b3.b3RecPlayer_GetWorldId(player);
assert.equal(b3.b3World_IsValid(restoredWorld), true);
const restoredBody = findOnlyDynamicBody(player);
assert.deepEqual(readState(restoredBody), checkpointState, "seed snapshot must expose the exact checkpoint body state before continuation");

let firstDifference: { tick: number; reference: State; candidate: State } | null = null;
for (let tick = 1; tick <= HORIZON; tick += 1) {
  applyFutureMutation(restoredBody, tick);
  b3.b3World_Step(restoredWorld, DT, SUBSTEPS);
  const candidate = readState(restoredBody);
  if (firstDifference === null && JSON.stringify(candidate) !== JSON.stringify(baseline[tick - 1])) {
    firstDifference = { tick, reference: baseline[tick - 1], candidate };
  }
}

assert.equal(
  firstDifference,
  null,
  `seed-only replay world failed exact physical continuation: ${JSON.stringify(firstDifference)}`,
);

b3.b3RecPlayer_Destroy(player);
b3.b3DestroyRecording(recording);

console.log(
  `MULTIPLAYER FOUNDATION SEED RESUME SMOKE PASS · internal seed-only snapshot restored active contact state and remained exact for ${HORIZON} future ticks with post-restore mutations`,
);
