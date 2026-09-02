import baseHandler, { World as BaseWorld } from "./index";
import { WorldSlice0 } from "./world-slice-0-two-client";

export class World extends BaseWorld {}
export { WorldSlice0 };

function worldSliceStub(env: Env, name: string) {
  return env.WORLD_SLICE_0.get(env.WORLD_SLICE_0.idFromName(name));
}

async function worldSlice0ApiResponse(request: Request, env: Env): Promise<Response> {
  const world = worldSliceStub(env, "world-slice-0-a1");
  const url = new URL(request.url);
  url.pathname = "/__ws0";
  return world.fetch(new Request(url.toString(), { method: request.method, headers: request.headers }));
}

async function worldSlice0WebSocketResponse(request: Request, env: Env): Promise<Response> {
  if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
    return new Response("Expected Upgrade: websocket", { status: 426, headers: { "content-type": "text/plain; charset=utf-8" } });
  }
  const world = worldSliceStub(env, "world-slice-0-play");
  return world.fetch(request);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/world0") return worldSlice0ApiResponse(request, env);
    if (url.pathname === "/world0/ws") return worldSlice0WebSocketResponse(request, env);
    return baseHandler.fetch(request, env);
  },
} satisfies ExportedHandler<Env>;
