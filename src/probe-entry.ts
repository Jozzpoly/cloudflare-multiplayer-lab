import baseHandler, { World as BaseWorld } from "./index";
import {
  BOX3D_BENCHMARK_PRESETS,
  runBox3dBenchmark,
  runBox3dCompatibilityProbe,
} from "./box3d-probe";

const jsonHeaders = {
  "cache-control": "no-store",
  "content-type": "application/json; charset=utf-8",
};

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: jsonHeaders });
}

export class World extends BaseWorld {
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

    return super.fetch(request);
  }
}

async function probeResponse(request: Request, env: Env, internalPath: string): Promise<Response> {
  const world = env.WORLD.get(env.WORLD.idFromName("main"));
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
    return baseHandler.fetch(request, env);
  },
} satisfies ExportedHandler<Env>;
