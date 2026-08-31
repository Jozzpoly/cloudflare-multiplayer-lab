import Box3D from "box3d.js/inline";

const PROBE_STEPS = 180;
const PROBE_DT = 1 / 60;
const PROBE_SUBSTEPS = 4;

let box3dPromise: ReturnType<typeof Box3D> | null = null;

function loadBox3D() {
  if (!box3dPromise) box3dPromise = Box3D();
  return box3dPromise;
}

export async function runBox3dCompatibilityProbe() {
  const initializedBeforeRun = box3dPromise !== null;
  const initStartedAt = performance.now();
  const b3 = await loadBox3D();
  const initDurationMs = performance.now() - initStartedAt;

  const worldDef = b3.b3DefaultWorldDef();
  worldDef.gravity = [0, -10, 0];
  const world = b3.b3CreateWorld(worldDef);

  try {
    const groundDef = b3.b3DefaultBodyDef();
    groundDef.position = [0, -0.5, 0];
    const ground = b3.b3CreateBody(world, groundDef);
    b3.b3CreateBoxShape(ground, b3.b3DefaultShapeDef(), 8, 0.5, 8);

    const bodyDef = b3.b3DefaultBodyDef();
    bodyDef.type = b3.b3BodyType.b3_dynamicBody;
    bodyDef.position = [0, 5, 0];
    const body = b3.b3CreateBody(world, bodyDef);
    const shapeDef = b3.b3DefaultShapeDef();
    shapeDef.density = 28;
    b3.b3CreateBoxShape(body, shapeDef, 0.5, 0.5, 0.5);

    const stepStartedAt = performance.now();
    for (let step = 0; step < PROBE_STEPS; step += 1) {
      b3.b3World_Step(world, PROBE_DT, PROBE_SUBSTEPS);
    }
    const stepDurationMs = performance.now() - stepStartedAt;

    const position: [number, number, number] = [0, 0, 0];
    b3.b3Body_GetPosition(position, body);
    const finite = position.every(Number.isFinite);
    const settledOnGround = finite && position[1] > 0.2 && position[1] < 1.2;

    return {
      ok: settledOnGround,
      package: "box3d.js@0.1.1",
      build: "inline-single-threaded",
      initializedBeforeRun,
      initDurationMs,
      stepDurationMs,
      averageStepDurationMs: stepDurationMs / PROBE_STEPS,
      steps: PROBE_STEPS,
      fixedDtSeconds: PROBE_DT,
      substeps: PROBE_SUBSTEPS,
      finalPosition: position,
      checks: {
        finite,
        settledOnGround,
      },
    };
  } finally {
    b3.b3DestroyWorld(world);
  }
}
