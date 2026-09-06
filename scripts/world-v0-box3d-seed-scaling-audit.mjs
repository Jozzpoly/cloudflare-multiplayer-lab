import Box3D from "box3d.js/inline";
import { performance } from "node:perf_hooks";

const b3 = await Box3D();
const FIXED_DT = 1 / 60;
const SUBSTEPS = 4;
const COUNTS = [14, 32, 64, 128];
const SETTLE_TICKS = 300;
const CONTINUATION_TICKS = 60;

function bodyState(body) {
  const p = [0, 0, 0];
  const q = [0, 0, 0, 1];
  const lv = [0, 0, 0];
  const av = [0, 0, 0];
  b3.b3Body_GetPosition(p, body);
  b3.b3Body_GetRotation(q, body);
  b3.b3Body_GetLinearVelocity(lv, body);
  b3.b3Body_GetAngularVelocity(av, body);
  return [...p, ...q, ...lv, ...av];
}

const f32 = new DataView(new ArrayBuffer(4));
function bits(value) {
  f32.setFloat32(0, value, true);
  return f32.getUint32(0, true);
}
function exactState(a, c) {
  const aa = bodyState(a);
  const cc = bodyState(c);
  return aa.length === cc.length && aa.every((value, index) => bits(value) === bits(cc[index]));
}

function createWorld(dynamicCount) {
  const wd = b3.b3DefaultWorldDef();
  wd.gravity = [0, -20, 0];
  const world = b3.b3CreateWorld(wd);

  const groundDef = b3.b3DefaultBodyDef();
  groundDef.position = [0, -0.5, 0];
  const ground = b3.b3CreateBody(world, groundDef);
  b3.b3CreateBoxShape(ground, b3.b3DefaultShapeDef(), 20, 0.5, 20);

  const bodies = [];
  const columns = Math.ceil(Math.sqrt(dynamicCount));
  for (let i = 0; i < dynamicCount; i += 1) {
    const xIndex = i % columns;
    const layer = Math.floor(i / columns);
    const zBand = layer % 2;
    const yLayer = Math.floor(layer / 2);
    const def = b3.b3DefaultBodyDef();
    def.type = b3.b3BodyType.b3_dynamicBody;
    def.position = [
      (xIndex - (columns - 1) / 2) * 0.93,
      0.46 + yLayer * 0.92,
      (zBand - 0.5) * 0.94,
    ];
    def.linearDamping = 0.08;
    def.angularDamping = 0.12;
    const body = b3.b3CreateBody(world, def);
    b3.b3Body_SetName(body, `seed-body-${i}`);
    const shape = b3.b3DefaultShapeDef();
    shape.density = 22;
    shape.baseMaterial.friction = 0.72;
    shape.baseMaterial.restitution = 0.04;
    b3.b3CreateBoxShape(body, shape, 0.46, 0.46, 0.46);
    bodies.push(body);
  }
  return { world, bodies };
}

function replayBodies(player, dynamicCount) {
  const byName = new Map();
  const n = b3.b3RecPlayer_GetBodyCount(player);
  for (let i = 0; i < n; i += 1) {
    const body = b3.b3RecPlayer_GetBodyId(player, i);
    if (!b3.b3Body_IsValid(body)) continue;
    const name = b3.b3Body_GetName(body);
    if (name) byName.set(name, body);
  }
  return Array.from({ length: dynamicCount }, (_, i) => byName.get(`seed-body-${i}`) || null);
}

const rows = [];
for (const dynamicCount of COUNTS) {
  const { world, bodies } = createWorld(dynamicCount);
  for (let tick = 0; tick < SETTLE_TICKS; tick += 1) b3.b3World_Step(world, FIXED_DT, SUBSTEPS);

  const recording = b3.b3CreateRecording(0);
  b3.b3World_StartRecording(world, recording);
  const seedBytes = b3.b3Recording_GetSize(recording);
  b3.b3World_StopRecording(world);

  const restoreStarted = performance.now();
  const player = b3.b3RecPlayer_CreateFromRecording(recording, 1);
  const restoreMs = performance.now() - restoreStarted;
  if (!player) throw new Error(`restore failed for ${dynamicCount} bodies`);
  const restoredWorld = b3.b3RecPlayer_GetWorldId(player);
  const restoredBodies = replayBodies(player, dynamicCount);
  if (restoredBodies.some((body) => !body)) throw new Error(`body remap failed for ${dynamicCount}`);

  let exactAtSeed = true;
  for (let i = 0; i < dynamicCount; i += 1) exactAtSeed &&= exactState(bodies[i], restoredBodies[i]);
  if (!exactAtSeed) throw new Error(`seed restore not exact for ${dynamicCount}`);

  const continuationStarted = performance.now();
  let exactContinuation = true;
  for (let tick = 0; tick < CONTINUATION_TICKS; tick += 1) {
    b3.b3World_Step(world, FIXED_DT, SUBSTEPS);
    b3.b3World_Step(restoredWorld, FIXED_DT, SUBSTEPS);
    for (let i = 0; i < dynamicCount; i += 1) {
      if (!exactState(bodies[i], restoredBodies[i])) {
        exactContinuation = false;
        break;
      }
    }
    if (!exactContinuation) break;
  }
  const continuationMs = performance.now() - continuationStarted;
  if (!exactContinuation) throw new Error(`continued restored world diverged for ${dynamicCount}`);

  rows.push({
    dynamicCount,
    seedBytes,
    seedKiB: seedBytes / 1024,
    bytesPerDynamicBody: seedBytes / dynamicCount,
    restoreMs,
    exactAtSeed,
    exactContinuation,
    continuationTicks: CONTINUATION_TICKS,
    pairedContinuationWallMs: continuationMs,
  });

  b3.b3RecPlayer_Destroy(player);
  b3.b3DestroyRecording(recording);
  b3.b3DestroyWorld(world);
}

const ratios = rows.slice(1).map((row, index) => ({
  from: rows[index].dynamicCount,
  to: row.dynamicCount,
  bodyRatio: row.dynamicCount / rows[index].dynamicCount,
  byteRatio: row.seedBytes / rows[index].seedBytes,
}));

const result = {
  revision: "world-v0-box3d-seed-scaling-audit-v1",
  settleTicks: SETTLE_TICKS,
  continuationTicks: CONTINUATION_TICKS,
  rows,
  ratios,
  nonClaim: "Restore timings are CI-runner measurements, not a mobile performance qualification. This tests same-build single-threaded Box3D recording seeds only.",
};
console.log("WORLD_V0_BOX3D_SEED_SCALING_AUDIT", JSON.stringify(result, null, 2));
console.log("WORLD_V0_BOX3D_SEED_SCALING_PASS");
