import Box3D from "./box3d-byte-probe.generated.mjs";
import box3dWasmModule from "./box3d-byte-probe.generated.wasm";

const DT = 1 / 60;
const SUBSTEPS = 4;
const HORIZON = 90;
const BOX3D_BODY_NAME_MAX = 18;
const SEMANTIC_BODY_NAME = "sem:wprobe";
if (SEMANTIC_BODY_NAME.length > BOX3D_BODY_NAME_MAX) throw new Error("workerd probe rebind token exceeds pinned Box3D body-name limit");
let box3dPromise = null;

function getBox3D() {
  box3dPromise ??= Box3D({
    instantiateWasm(imports, successCallback) {
      const instance = new WebAssembly.Instance(box3dWasmModule, imports);
      successCallback(instance, box3dWasmModule);
      return instance.exports;
    },
  });
  return box3dPromise;
}

function state(b3, body) {
  const p = [0, 0, 0];
  const q = [0, 0, 0, 1];
  const lv = [0, 0, 0];
  const av = [0, 0, 0];
  b3.b3Body_GetPosition(p, body);
  b3.b3Body_GetRotation(q, body);
  b3.b3Body_GetLinearVelocity(lv, body);
  b3.b3Body_GetAngularVelocity(av, body);
  return [...p, ...q, ...lv, ...av, b3.b3Body_IsAwake(body)];
}

function mutate(b3, body, tick) {
  if (tick === 25) b3.b3Body_SetLinearVelocity(body, [-1.1, 0.35, 0.75]);
  if (tick === 55) b3.b3Body_SetAngularVelocity(body, [0.2, -0.6, 0.4]);
}

function createContactWorld(b3) {
  const worldDef = b3.b3DefaultWorldDef();
  worldDef.gravity = [0, -10, 0];
  const world = b3.b3CreateWorld(worldDef);

  const groundDef = b3.b3DefaultBodyDef();
  groundDef.position = [0, -0.5, 0];
  const ground = b3.b3CreateBody(world, groundDef);
  b3.b3Body_SetName(ground, "ground");
  const groundShape = b3.b3DefaultShapeDef();
  groundShape.baseMaterial.friction = 0.8;
  b3.b3CreateBoxShape(ground, groundShape, 20, 0.5, 20);

  const bodyDef = b3.b3DefaultBodyDef();
  bodyDef.type = b3.b3BodyType.b3_dynamicBody;
  bodyDef.position = [0, 2.5, 0];
  const body = b3.b3CreateBody(world, bodyDef);
  b3.b3Body_SetName(body, SEMANTIC_BODY_NAME);
  const shapeDef = b3.b3DefaultShapeDef();
  shapeDef.density = 1;
  shapeDef.baseMaterial.friction = 0.8;
  b3.b3CreateBoxShape(body, shapeDef, 0.5, 0.5, 0.5);
  return { world, body };
}

function equalState(actual, expected) {
  return actual.length === expected.length && actual.every((value, index) => Object.is(value, expected[index]));
}

async function probe() {
  const b3 = await getBox3D();
  if (typeof b3.b3Recording_CopyBytes !== "function" || typeof b3.b3RecPlayer_CreateFromBytes !== "function") {
    throw new Error("byte bridge functions missing inside workerd");
  }

  const source = createContactWorld(b3);
  const sourceName = b3.b3Body_GetName(source.body);
  if (sourceName !== SEMANTIC_BODY_NAME) {
    throw new Error(`workerd source body name mismatch before snapshot: value=${JSON.stringify(sourceName)} type=${typeof sourceName}`);
  }

  for (let tick = 0; tick < 180; tick += 1) b3.b3World_Step(source.world, DT, SUBSTEPS);
  b3.b3Body_SetAwake(source.body, true);
  b3.b3Body_SetLinearVelocity(source.body, [2, 0, 0.35]);
  const checkpointState = state(b3, source.body);

  const recording = b3.b3CreateRecording(0);
  b3.b3World_StartRecording(source.world, recording);
  b3.b3World_StopRecording(source.world);
  const bytes = b3.b3Recording_CopyBytes(recording);
  if (!(bytes instanceof Uint8Array) || bytes.byteLength <= 0) throw new Error("workerd Recording byte copy failed");

  const baseline = [];
  for (let tick = 1; tick <= HORIZON; tick += 1) {
    mutate(b3, source.body, tick);
    b3.b3World_Step(source.world, DT, SUBSTEPS);
    baseline.push(state(b3, source.body));
  }
  b3.b3DestroyWorld(source.world);
  b3.b3DestroyRecording(recording);

  const player = b3.b3RecPlayer_CreateFromBytes(bytes, 1);
  if (!player) throw new Error("workerd RecPlayer creation from bytes failed");
  if (b3.b3RecPlayer_GetFrameCount(player) !== 0 || b3.b3RecPlayer_StepFrame(player) !== false) {
    throw new Error("workerd seed-only player unexpectedly contains future frames");
  }
  const restoredWorld = b3.b3RecPlayer_GetWorldId(player);
  const bodyCount = b3.b3RecPlayer_GetBodyCount(player);
  const restoredNames = [];
  let restoredBody = null;
  for (let index = 0; index < bodyCount; index += 1) {
    const candidate = b3.b3RecPlayer_GetBodyId(player, index);
    const valid = b3.b3Body_IsValid(candidate);
    const name = valid ? b3.b3Body_GetName(candidate) : null;
    restoredNames.push({ index, valid, name, nameType: typeof name });
    if (valid && name === SEMANTIC_BODY_NAME) {
      restoredBody = candidate;
      break;
    }
  }
  if (!restoredBody) {
    throw new Error(`workerd semantic body rebind failed: bodyCount=${bodyCount} restored=${JSON.stringify(restoredNames)}`);
  }
  if (!equalState(state(b3, restoredBody), checkpointState)) throw new Error("workerd checkpoint boundary mismatch");

  for (let tick = 1; tick <= HORIZON; tick += 1) {
    mutate(b3, restoredBody, tick);
    b3.b3World_Step(restoredWorld, DT, SUBSTEPS);
    if (!equalState(state(b3, restoredBody), baseline[tick - 1])) {
      throw new Error(`workerd byte-restored future diverged at tick ${tick}`);
    }
  }
  b3.b3RecPlayer_Destroy(player);
  return { copiedBytes: bytes.byteLength, exactFutureTicks: HORIZON, restoredBodyCount: bodyCount, rebindToken: SEMANTIC_BODY_NAME };
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname !== "/probe") return Response.json({ ok: false, error: "not_found" }, { status: 404 });
    try {
      const result = await probe();
      return Response.json({ ok: true, ...result });
    } catch (error) {
      return Response.json({ ok: false, error: error instanceof Error ? error.stack ?? error.message : String(error) }, { status: 500 });
    }
  },
};