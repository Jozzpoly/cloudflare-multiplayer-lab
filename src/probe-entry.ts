import baseHandler, { World as BaseWorld } from "./index";
import { runBox3dCompatibilityProbe } from "./box3d-probe";

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
    return super.fetch(request);
  }
}

async function box3dProbeResponse(request: Request, env: Env): Promise<Response> {
  const world = env.WORLD.get(env.WORLD.idFromName("main"));
  const url = new URL(request.url);
  url.pathname = "/__probe/box3d";
  url.search = "";
  return world.fetch(new Request(url.toString(), { method: "GET" }));
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/box3d-probe") return box3dProbeResponse(request, env);
    return baseHandler.fetch(request, env);
  },
} satisfies ExportedHandler<Env>;
