import { DurableObject } from "cloudflare:workers";
import { b3, BOX3D_RUNTIME } from "./box3d-runtime";

export const WS0_REVISION = "ws0-a1-v1";

const SIMULATION_HZ = 60;
const SIMULATION_STEP_MS = 1000 / SIMULATION_HZ;
const SUBSTEPS = 4;
const MAX_CATCHUP_STEPS = 4;
const TELEMETRY_SAMPLE_LIMIT = 240;
const PROP_COUNT = 12;
const ACTOR_COUNT = 2;

type WorldId = ReturnType<typeof b3.b3CreateWorld>;
type BodyId = ReturnType<typeof b3.b3CreateBody>;
type Vec3 = [number, number, number];

type PropRecord = {
  id: string;
  body: BodyId;
  initial: Vec3;
};

type SceneSample = {
  finite: boolean;
  checksum: number;
  maxPropDisplacement: number;
  actors: Array<{ id: string; position: Vec3 }>;
  props: Array<{ id: string; position: Vec3 }>;
};

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1));
  return sorted[index];
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
    },
  });
}

function createStaticBox(world: WorldId, position: Vec3, halfExtents: Vec3): void {
  const bodyDef = b3.b3DefaultBodyDef();
  bodyDef.position = position;
  const body = b3.b3CreateBody(world, bodyDef);
  b3.b3CreateBoxShape(body, b3.b3DefaultShapeDef(), halfExtents[0], halfExtents[1], halfExtents[2]);
}

export class WorldSlice0 extends DurableObject<Env> {
  private world: WorldId | null = null;
  private actorBodies: BodyId[] = [];
  private props: PropRecord[] = [];
  private loopTimer: ReturnType<typeof setInterval> | null = null;
  private lastPumpAt = 0;
  private accumulatorMs = 0;
  private startedAt = 0;
  private tick = 0;
  private callbacks = 0;
  private droppedTicks = 0;
  private catchupSteps = 0;
  private runSerial = 0;
  private runId: string | null = null;
  private failure: string | null = null;
  private pumpIntervalSamples: number[] = [];
  private lastRun: Record<string, unknown> | null = null;

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const action = url.searchParams.get("action") ?? "status";

    try {
      if (action === "start") return json(this.start());
      if (action === "reset") {
        this.stop(true);
        return json(this.start());
      }
      if (action === "stop") return json(this.stop(false));
      if (action === "status") return json(this.status());
      return json({ ok: false, revision: WS0_REVISION, error: "invalid_action" }, 400);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.failure = message;
      this.stopLoop();
      return json({ ok: false, revision: WS0_REVISION, error: message, status: this.status() }, 500);
    }
  }

  private start(): Record<string, unknown> {
    if (this.world && this.loopTimer && !this.failure) return this.status();

    this.destroyWorld();
    this.runSerial += 1;
    this.runId = `ws0-a1-${this.runSerial}`;
    this.failure = null;
    this.tick = 0;
    this.callbacks = 0;
    this.droppedTicks = 0;
    this.catchupSteps = 0;
    this.pumpIntervalSamples = [];
    this.accumulatorMs = 0;
    this.startedAt = Date.now();
    this.createScene();
    this.lastPumpAt = performance.now();
    this.loopTimer = setInterval(() => this.pump(), SIMULATION_STEP_MS);
    return this.status();
  }

  private stop(forReset: boolean): Record<string, unknown> {
    const final = this.status();
    this.stopLoop();
    this.destroyWorld();
    const stopped = { ...final, active: false, stopped: true };
    if (!forReset) this.lastRun = stopped;
    return stopped;
  }

  private stopLoop(): void {
    if (this.loopTimer) clearInterval(this.loopTimer);
    this.loopTimer = null;
    this.lastPumpAt = 0;
    this.accumulatorMs = 0;
  }

  private createScene(): void {
    const worldDef = b3.b3DefaultWorldDef();
    worldDef.gravity = [0, -20, 0];
    const world = b3.b3CreateWorld(worldDef);
    this.world = world;

    // A deliberately small, legible place: floor plus waist-high perimeter walls.
    createStaticBox(world, [0, -0.5, 0], [10, 0.5, 10]);
    createStaticBox(world, [-9.5, 1.5, 0], [0.5, 2, 10]);
    createStaticBox(world, [9.5, 1.5, 0], [0.5, 2, 10]);
    createStaticBox(world, [0, 1.5, -9.5], [10, 2, 0.5]);
    createStaticBox(world, [0, 1.5, 9.5], [10, 2, 0.5]);

    this.props = [];
    for (let index = 0; index < PROP_COUNT; index += 1) {
      const col = index % 4;
      const row = Math.floor(index / 4);
      const initial: Vec3 = [
        (col - 1.5) * 1.05,
        0.46,
        (row - 1) * 1.05,
      ];
      const bodyDef = b3.b3DefaultBodyDef();
      bodyDef.type = b3.b3BodyType.b3_dynamicBody;
      bodyDef.position = initial;
      bodyDef.linearDamping = 0.08;
      bodyDef.angularDamping = 0.12;
      const body = b3.b3CreateBody(world, bodyDef);
      const shapeDef = b3.b3DefaultShapeDef();
      shapeDef.density = 22;
      shapeDef.baseMaterial.friction = 0.72;
      shapeDef.baseMaterial.restitution = 0.04;
      b3.b3CreateBoxShape(body, shapeDef, 0.46, 0.46, 0.46);
      this.props.push({ id: `prop-${index}`, body, initial });
    }

    this.actorBodies = [];
    const actorStarts: Vec3[] = [
      [-7, 0.82, -0.65],
      [7, 0.82, 0.65],
    ];
    for (let index = 0; index < ACTOR_COUNT; index += 1) {
      const bodyDef = b3.b3DefaultBodyDef();
      bodyDef.type = b3.b3BodyType.b3_dynamicBody;
      bodyDef.position = actorStarts[index];
      bodyDef.linearDamping = 0.3;
      bodyDef.angularDamping = 8;
      const body = b3.b3CreateBody(world, bodyDef);
      const shapeDef = b3.b3DefaultShapeDef();
      shapeDef.density = 80;
      shapeDef.baseMaterial.friction = 0.8;
      shapeDef.baseMaterial.restitution = 0.02;
      b3.b3CreateCapsuleShape(body, shapeDef, {
        center1: [0, -0.45, 0],
        center2: [0, 0.45, 0],
        radius: 0.35,
      });
      this.actorBodies.push(body);
    }
  }

  private destroyWorld(): void {
    if (this.world) b3.b3DestroyWorld(this.world);
    this.world = null;
    this.actorBodies = [];
    this.props = [];
  }

  private pump(): void {
    if (!this.world || this.failure) {
      this.stopLoop();
      return;
    }

    try {
      const now = performance.now();
      const elapsed = Math.max(0, Math.min(SIMULATION_STEP_MS * 10, now - this.lastPumpAt));
      this.lastPumpAt = now;
      this.callbacks += 1;
      this.pushSample(this.pumpIntervalSamples, elapsed);
      this.accumulatorMs += elapsed;

      let steps = 0;
      while (this.accumulatorMs >= SIMULATION_STEP_MS && steps < MAX_CATCHUP_STEPS) {
        this.driveActors();
        b3.b3World_Step(this.world, 1 / SIMULATION_HZ, SUBSTEPS);
        this.tick += 1;
        steps += 1;
        this.accumulatorMs -= SIMULATION_STEP_MS;
      }

      if (steps > 1) this.catchupSteps += steps - 1;
      if (this.accumulatorMs >= SIMULATION_STEP_MS) {
        const dropped = Math.floor(this.accumulatorMs / SIMULATION_STEP_MS);
        this.droppedTicks += dropped;
        this.accumulatorMs %= SIMULATION_STEP_MS;
      }

      const sample = this.sampleScene();
      if (!sample.finite) throw new Error("non_finite_world_state");
    } catch (error) {
      this.failure = error instanceof Error ? error.message : String(error);
      this.stopLoop();
    }
  }

  private driveActors(): void {
    const phase = Math.floor(this.tick / 120) % 2 === 0 ? 1 : -1;
    for (let index = 0; index < this.actorBodies.length; index += 1) {
      const side = index === 0 ? 1 : -1;
      const vx = side * phase * 5.2;
      const vz = Math.sin((this.tick + index * 41) * 0.045) * 0.9;
      // Scripted A1 stressor only: this is not a candidate player controller.
      b3.b3Body_SetLinearVelocity(this.actorBodies[index], [vx, 0, vz]);
    }
  }

  private sampleScene(): SceneSample {
    if (!this.world) {
      return { finite: true, checksum: 0, maxPropDisplacement: 0, actors: [], props: [] };
    }

    let finite = true;
    let checksum = 0;
    let maxPropDisplacement = 0;
    const actors: Array<{ id: string; position: Vec3 }> = [];
    const props: Array<{ id: string; position: Vec3 }> = [];
    const position: Vec3 = [0, 0, 0];

    for (let index = 0; index < this.actorBodies.length; index += 1) {
      b3.b3Body_GetPosition(position, this.actorBodies[index]);
      const actorPosition: Vec3 = [position[0], position[1], position[2]];
      finite = finite && actorPosition.every(Number.isFinite);
      checksum += actorPosition[0] * 0.31 + actorPosition[1] * 0.53 + actorPosition[2] * 0.79;
      actors.push({ id: `actor-${index}`, position: actorPosition });
    }

    for (const prop of this.props) {
      b3.b3Body_GetPosition(position, prop.body);
      const propPosition: Vec3 = [position[0], position[1], position[2]];
      finite = finite && propPosition.every(Number.isFinite);
      checksum += propPosition[0] * 0.17 + propPosition[1] * 0.37 + propPosition[2] * 0.67;
      maxPropDisplacement = Math.max(
        maxPropDisplacement,
        Math.hypot(propPosition[0] - prop.initial[0], propPosition[2] - prop.initial[2]),
      );
      props.push({ id: prop.id, position: propPosition });
    }

    return { finite, checksum, maxPropDisplacement, actors, props };
  }

  private status(): Record<string, unknown> {
    if (!this.world && !this.runId && this.lastRun) return this.lastRun;

    const sample = this.sampleScene();
    const durationMs = this.startedAt ? Math.max(0, Date.now() - this.startedAt) : 0;
    const expectedTicks = durationMs / SIMULATION_STEP_MS;
    const active = this.loopTimer !== null && this.world !== null && this.failure === null;

    return {
      ok: this.failure === null && sample.finite,
      revision: WS0_REVISION,
      stage: "world-slice-0-a1-server-foundation",
      runtime: BOX3D_RUNTIME,
      active,
      runId: this.runId,
      simulation: {
        hz: SIMULATION_HZ,
        stepMs: SIMULATION_STEP_MS,
        substeps: SUBSTEPS,
        maxCatchupSteps: MAX_CATCHUP_STEPS,
      },
      scene: {
        actors: ACTOR_COUNT,
        props: PROP_COUNT,
        gravity: [0, -20, 0],
      },
      durationMs,
      tick: this.tick,
      expectedTicks,
      tickRatio: expectedTicks > 0 ? this.tick / expectedTicks : 1,
      callbacks: this.callbacks,
      droppedTicks: this.droppedTicks,
      catchupSteps: this.catchupSteps,
      pumpIntervalMsP50: percentile(this.pumpIntervalSamples, 0.5),
      pumpIntervalMsP95: percentile(this.pumpIntervalSamples, 0.95),
      pumpIntervalMsMax: this.pumpIntervalSamples.length ? Math.max(...this.pumpIntervalSamples) : 0,
      failure: this.failure,
      checks: {
        finite: sample.finite,
        propMoved: sample.maxPropDisplacement > 0.25,
      },
      maxPropDisplacement: sample.maxPropDisplacement,
      checksum: sample.checksum,
      actors: sample.actors,
      props: sample.props,
    };
  }

  private pushSample(target: number[], value: number): void {
    target.push(value);
    if (target.length > TELEMETRY_SAMPLE_LIMIT) target.splice(0, target.length - TELEMETRY_SAMPLE_LIMIT);
  }
}
