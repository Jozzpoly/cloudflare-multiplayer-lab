import Box3D from "box3d.js/inline";
import box3dWasm from "../node_modules/box3d.js/dist/box3d.wasm";

const PROBE_STEPS = 180;
const PROBE_DT = 1 / 60;
const PROBE_SUBSTEPS = 4;

type InstantiateSuccess = (instance: WebAssembly.Instance, module?: WebAssembly.Module) => void;
type Box3DFactoryOptions = {
  instantiateWasm: (imports: WebAssembly.Imports, success: InstantiateSuccess) => Record<string, never>;
};
type Box3DFactory = (options?: Box3DFactoryOptions) => ReturnType<typeof Box3D>;
type BodyId = ReturnType<Awaited<ReturnType<typeof Box3D>>["b3CreateBody"]>;
type BenchmarkScenario = "raw" | "actors";

export type Box3dBenchmarkPreset = {
  id: string;
  scenario: BenchmarkScenario;
  actors: number;
  props: number;
  steps: number;
  hz: number;
  substeps: number;
};

export const BOX3D_BENCHMARK_PRESETS: Record<string, Box3dBenchmarkPreset> = {
  "raw-16-60x4": { id: "raw-16-60x4", scenario: "raw", actors: 0, props: 16, steps: 300, hz: 60, substeps: 4 },
  "raw-32-60x4": { id: "raw-32-60x4", scenario: "raw", actors: 0, props: 32, steps: 300, hz: 60, substeps: 4 },
  "raw-64-60x4": { id: "raw-64-60x4", scenario: "raw", actors: 0, props: 64, steps: 300, hz: 60, substeps: 4 },
  "raw-128-60x4": { id: "raw-128-60x4", scenario: "raw", actors: 0, props: 128, steps: 300, hz: 60, substeps: 4 },
  "actors-1-props-16-60x4": { id: "actors-1-props-16-60x4", scenario: "actors", actors: 1, props: 16, steps: 300, hz: 60, substeps: 4 },
  "actors-2-props-32-60x4": { id: "actors-2-props-32-60x4", scenario: "actors", actors: 2, props: 32, steps: 300, hz: 60, substeps: 4 },
  "actors-6-props-32-60x4": { id: "actors-6-props-32-60x4", scenario: "actors", actors: 6, props: 32, steps: 300, hz: 60, substeps: 4 },
  "actors-6-props-64-60x4": { id: "actors-6-props-64-60x4", scenario: "actors", actors: 6, props: 64, steps: 300, hz: 60, substeps: 4 },
  "actors-6-props-64-60x2": { id: "actors-6-props-64-60x2", scenario: "actors", actors: 6, props: 64, steps: 300, hz: 60, substeps: 2 },
  "actors-6-props-64-30x4": { id: "actors-6-props-64-30x4", scenario: "actors", actors: 6, props: 64, steps: 150, hz: 30, substeps: 4 },
  "actors-6-props-64-30x2": { id: "actors-6-props-64-30x2", scenario: "actors", actors: 6, props: 64, steps: 150, hz: 30, substeps: 2 },
};

const factory = Box3D as Box3DFactory;
const startupInitStartedAt = performance.now();
const b3 = await factory({
  instantiateWasm(imports, success) {
    void WebAssembly.instantiate(box3dWasm, imports).then((instance) => {
      success(instance, box3dWasm);
    });
    return {};
  },
});
const startupInitDurationMs = performance.now() - startupInitStartedAt;

function createStaticBox(world: ReturnType<typeof b3.b3CreateWorld>, x: number, y: number, z: number, hx: number, hy: number, hz: number): void {
  const def = b3.b3DefaultBodyDef();
  def.position = [x, y, z];
  const body = b3.b3CreateBody(world, def);
  b3.b3CreateBoxShape(body, b3.b3DefaultShapeDef(), hx, hy, hz);
}

function createBenchmarkWorld(preset: Box3dBenchmarkPreset) {
  const worldDef = b3.b3DefaultWorldDef();
  worldDef.gravity = [0, -20, 0];
  const world = b3.b3CreateWorld(worldDef);

  createStaticBox(world, 0, -0.5, 0, 12, 0.5, 12);
  createStaticBox(world, -11.5, 1.5, 0, 0.5, 2, 12);
  createStaticBox(world, 11.5, 1.5, 0, 0.5, 2, 12);
  createStaticBox(world, 0, 1.5, -11.5, 12, 2, 0.5);
  createStaticBox(world, 0, 1.5, 11.5, 12, 2, 0.5);

  const propBodies: BodyId[] = [];
  const side = Math.max(2, Math.ceil(Math.sqrt(Math.max(1, preset.props) / 4)));
  const layerSize = side * side;
  for (let index = 0; index < preset.props; index += 1) {
    const layer = Math.floor(index / layerSize);
    const inLayer = index % layerSize;
    const col = inLayer % side;
    const row = Math.floor(inLayer / side);
    const def = b3.b3DefaultBodyDef();
    def.type = b3.b3BodyType.b3_dynamicBody;
    def.position = [
      (col - (side - 1) * 0.5) * 0.92,
      0.48 + layer * 0.96,
      (row - (side - 1) * 0.5) * 0.92,
    ];
    def.linearDamping = 0.06;
    def.angularDamping = 0.08;
    const body = b3.b3CreateBody(world, def);
    const shapeDef = b3.b3DefaultShapeDef();
    shapeDef.density = 24;
    shapeDef.baseMaterial.friction = 0.7;
    shapeDef.baseMaterial.restitution = 0.04;
    if (index % 3 === 0) {
      b3.b3CreateSphereShape(body, shapeDef, { center: [0, 0, 0], radius: 0.42 });
    } else {
      b3.b3CreateBoxShape(body, shapeDef, 0.42, 0.42, 0.42);
    }
    propBodies.push(body);
  }

  const actorBodies: BodyId[] = [];
  for (let index = 0; index < preset.actors; index += 1) {
    const def = b3.b3DefaultBodyDef();
    def.type = b3.b3BodyType.b3_dynamicBody;
    def.position = [-6 + index * (12 / Math.max(1, preset.actors - 1)), 0.78, -3.2 + (index % 3) * 3.2];
    def.linearDamping = 0.25;
    def.angularDamping = 5;
    const body = b3.b3CreateBody(world, def);
    const shapeDef = b3.b3DefaultShapeDef();
    shapeDef.density = 80;
    shapeDef.baseMaterial.friction = 0.75;
    shapeDef.baseMaterial.restitution = 0.02;
    b3.b3CreateCapsuleShape(body, shapeDef, {
      center1: [0, -0.4, 0],
      center2: [0, 0.4, 0],
      radius: 0.34,
    });
    actorBodies.push(body);
  }

  return { world, propBodies, actorBodies };
}

function driveActors(actorBodies: BodyId[], step: number): void {
  for (let index = 0; index < actorBodies.length; index += 1) {
    const phaseStep = step + index * 23;
    const direction = Math.floor(phaseStep / 90) % 2 === 0 ? 1 : -1;
    const vx = direction * (4.2 + index * 0.12);
    const vz = Math.sin(phaseStep * 0.07) * 2.2;
    b3.b3Body_SetLinearVelocity(actorBodies[index], [vx, 0, vz]);
  }
}

function checksumBodies(bodies: BodyId[]): { finite: boolean; checksum: number } {
  const position: [number, number, number] = [0, 0, 0];
  let checksum = 0;
  let finite = true;
  for (let index = 0; index < bodies.length; index += 1) {
    b3.b3Body_GetPosition(position, bodies[index]);
    finite = finite && position.every(Number.isFinite);
    checksum += position[0] * 0.31 + position[1] * 0.53 + position[2] * 0.79;
  }
  return { finite, checksum };
}

export function runBox3dBenchmark(preset: Box3dBenchmarkPreset) {
  const setupStartedAt = performance.now();
  const { world, propBodies, actorBodies } = createBenchmarkWorld(preset);
  const setupDurationMs = performance.now() - setupStartedAt;

  try {
    const dt = 1 / preset.hz;
    const stepStartedAt = performance.now();
    for (let step = 0; step < preset.steps; step += 1) {
      if (actorBodies.length > 0) driveActors(actorBodies, step);
      b3.b3World_Step(world, dt, preset.substeps);
    }
    const stepDurationMs = performance.now() - stepStartedAt;
    const state = checksumBodies([...propBodies, ...actorBodies]);

    return {
      ok: state.finite,
      package: "box3d.js@0.1.1",
      build: "inline-glue-precompiled-wasm-startup-init-single-threaded",
      preset,
      startupInitDurationMs,
      setupDurationMs,
      stepDurationMs,
      averageStepDurationMs: stepDurationMs / preset.steps,
      simulatedSeconds: preset.steps / preset.hz,
      finalChecksum: state.checksum,
      checks: { finite: state.finite },
    };
  } finally {
    b3.b3DestroyWorld(world);
  }
}

export async function runBox3dCompatibilityProbe() {
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
      build: "inline-glue-precompiled-wasm-startup-init-single-threaded",
      initializedBeforeRun: true,
      startupInitDurationMs,
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
