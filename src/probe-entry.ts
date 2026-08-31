import baseHandler, { World as BaseWorld } from "./index";
import {
  BOX3D_BENCHMARK_PRESETS,
  BOX3D_SOAK_PRESET_IDS,
  createBox3dSoakRuntime,
  runBox3dBenchmark,
  runBox3dCompatibilityProbe,
  type Box3dBenchmarkPreset,
  type Box3dSoakRuntime,
} from "./box3d-probe";

const F2_REVISION = "box3d-f2-soak-v1";
const SOAK_MAX_CATCHUP_STEPS = 4;
const SOAK_SAMPLE_LIMIT = 240;
const SOAK_OBJECT_NAME = "box3d-f2-soak";

const jsonHeaders = {
  "cache-control": "no-store",
  "content-type": "application/json; charset=utf-8",
};

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: jsonHeaders });
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1));
  return sorted[index];
}

type SoakSession = {
  runId: string;
  preset: Box3dBenchmarkPreset;
  runtime: Box3dSoakRuntime;
  startedAt: number;
  lastPumpAt: number;
  accumulatorMs: number;
  ticks: number;
  callbacks: number;
  droppedTicks: number;
  catchupSteps: number;
  intervalSamples: number[];
  intervalMaxMs: number;
  failure: string | null;
};

export class World extends BaseWorld {
  private soakSession: SoakSession | null = null;
  private soakTimer: ReturnType<typeof setInterval> | null = null;

  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/__probe/box3d") {
      try {
        const result = await runBox3dCompatibilityProbe();
        return jsonResponse({
          stage: "physical-server-substrate-f0",
          runtime: "durable-object",
          ...result,
        }, result.ok ? 200 : 500);
      } catch (error) {
        return jsonResponse({
          ok: false,
          stage: "physical-server-substrate-f0",
          runtime: "durable-object",
          error: error instanceof Error ? error.message : String(error),
        }, 500);
      }
    }

    if (url.pathname === "/__probe/box3d-benchmark") {
      const presetId = url.searchParams.get("preset") ?? "";
      const preset = BOX3D_BENCHMARK_PRESETS[presetId];
      if (!preset) {
        return jsonResponse({
          ok: false,
          stage: "physical-server-substrate-f1",
          runtime: "durable-object",
          error: "invalid_preset",
          presets: Object.keys(BOX3D_BENCHMARK_PRESETS),
        }, 400);
      }
      try {
        const result = runBox3dBenchmark(preset);
        return jsonResponse({
          stage: "physical-server-substrate-f1",
          runtime: "durable-object",
          ...result,
        }, result.ok ? 200 : 500);
      } catch (error) {
        return jsonResponse({
          ok: false,
          stage: "physical-server-substrate-f1",
          runtime: "durable-object",
          preset,
          error: error instanceof Error ? error.message : String(error),
        }, 500);
      }
    }

    if (url.pathname === "/__probe/box3d-soak") {
      return this.handleSoakRequest(url);
    }

    return super.fetch(request);
  }

  private handleSoakRequest(url: URL): Response {
    const action = url.searchParams.get("action") ?? "status";
    if (action === "start") {
      const presetId = url.searchParams.get("preset") ?? "";
      const preset = BOX3D_BENCHMARK_PRESETS[presetId];
      if (!preset || !BOX3D_SOAK_PRESET_IDS.has(presetId)) {
        return jsonResponse({
          ok: false,
          stage: "physical-server-substrate-f2",
          revision: F2_REVISION,
          error: "invalid_soak_preset",
          presets: [...BOX3D_SOAK_PRESET_IDS],
        }, 400);
      }
      this.stopSoak(true);
      const runtime = createBox3dSoakRuntime(preset);
      const now = Date.now();
      this.soakSession = {
        runId: crypto.randomUUID(),
        preset,
        runtime,
        startedAt: now,
        lastPumpAt: now,
        accumulatorMs: 0,
        ticks: 0,
        callbacks: 0,
        droppedTicks: 0,
        catchupSteps: 0,
        intervalSamples: [],
        intervalMaxMs: 0,
        failure: null,
      };
      this.soakTimer = setInterval(() => this.pumpSoak(), 1000 / preset.hz);
      return jsonResponse(this.soakStatus());
    }

    if (action === "stop") {
      const status = this.soakStatus();
      this.stopSoak(true);
      return jsonResponse({ ...status, active: false, stopped: true });
    }

    if (action !== "status") {
      return jsonResponse({
        ok: false,
        stage: "physical-server-substrate-f2",
        revision: F2_REVISION,
        error: "invalid_action",
      }, 400);
    }

    return jsonResponse(this.soakStatus());
  }

  private pumpSoak(): void {
    const session = this.soakSession;
    if (!session || session.failure) return;
    const now = Date.now();
    const rawElapsed = Math.max(0, now - session.lastPumpAt);
    session.lastPumpAt = now;
    session.callbacks += 1;
    session.intervalSamples.push(rawElapsed);
    if (session.intervalSamples.length > SOAK_SAMPLE_LIMIT) {
      session.intervalSamples.splice(0, session.intervalSamples.length - SOAK_SAMPLE_LIMIT);
    }
    session.intervalMaxMs = Math.max(session.intervalMaxMs, rawElapsed);

    const elapsed = Math.min(rawElapsed, 250);
    session.accumulatorMs += elapsed;
    const stepMs = 1000 / session.preset.hz;
    let stepsThisPump = 0;

    try {
      while (session.accumulatorMs + 1e-6 >= stepMs && stepsThisPump < SOAK_MAX_CATCHUP_STEPS) {
        session.runtime.step();
        session.ticks += 1;
        stepsThisPump += 1;
        session.accumulatorMs -= stepMs;
      }
      if (stepsThisPump > 1) session.catchupSteps += stepsThisPump - 1;
      if (session.accumulatorMs >= stepMs) {
        const dropped = Math.floor(session.accumulatorMs / stepMs);
        session.droppedTicks += dropped;
        session.accumulatorMs -= dropped * stepMs;
      }
    } catch (error) {
      session.failure = error instanceof Error ? error.message : String(error);
      this.clearSoakTimer();
    }
  }

  private soakStatus() {
    const session = this.soakSession;
    if (!session) {
      return {
        ok: true,
        stage: "physical-server-substrate-f2",
        revision: F2_REVISION,
        runtime: "durable-object",
        active: false,
      };
    }

    let sample: { finite: boolean; checksum: number };
    try {
      sample = session.runtime.sample();
    } catch (error) {
      session.failure = error instanceof Error ? error.message : String(error);
      sample = { finite: false, checksum: Number.NaN };
      this.clearSoakTimer();
    }
    if (!sample.finite && !session.failure) {
      session.failure = "non_finite_state";
      this.clearSoakTimer();
    }

    const now = Date.now();
    const durationMs = Math.max(0, now - session.startedAt);
    const expectedTicks = durationMs * session.preset.hz / 1000;
    return {
      ok: session.failure === null && sample.finite,
      stage: "physical-server-substrate-f2",
      revision: F2_REVISION,
      runtime: "durable-object",
      active: this.soakTimer !== null && session.failure === null,
      runId: session.runId,
      preset: session.preset,
      durationMs,
      ticks: session.ticks,
      expectedTicks,
      tickRatio: expectedTicks > 0 ? session.ticks / expectedTicks : 0,
      callbacks: session.callbacks,
      droppedTicks: session.droppedTicks,
      catchupSteps: session.catchupSteps,
      accumulatorMs: session.accumulatorMs,
      pumpIntervalMsP50: percentile(session.intervalSamples, 0.5),
      pumpIntervalMsP95: percentile(session.intervalSamples, 0.95),
      pumpIntervalMsMax: session.intervalMaxMs,
      finalChecksum: sample.checksum,
      failure: session.failure,
      checks: { finite: sample.finite },
    };
  }

  private clearSoakTimer(): void {
    if (this.soakTimer !== null) clearInterval(this.soakTimer);
    this.soakTimer = null;
  }

  private stopSoak(destroyRuntime: boolean): void {
    this.clearSoakTimer();
    if (destroyRuntime && this.soakSession) this.soakSession.runtime.destroy();
    this.soakSession = null;
  }
}

async function probeResponse(request: Request, env: Env, internalPath: string, objectName = "main"): Promise<Response> {
  const world = env.WORLD.get(env.WORLD.idFromName(objectName));
  const url = new URL(request.url);
  url.pathname = internalPath;
  return world.fetch(new Request(url.toString(), { method: "GET" }));
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/box3d-probe") {
      url.search = "";
      return probeResponse(new Request(url.toString()), env, "/__probe/box3d");
    }
    if (url.pathname === "/api/box3d-benchmark") {
      return probeResponse(request, env, "/__probe/box3d-benchmark");
    }
    if (url.pathname === "/api/box3d-soak") {
      return probeResponse(request, env, "/__probe/box3d-soak", SOAK_OBJECT_NAME);
    }
    return baseHandler.fetch(request, env);
  },
} satisfies ExportedHandler<Env>;
