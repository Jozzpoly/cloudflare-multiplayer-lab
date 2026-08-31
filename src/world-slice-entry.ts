import baseHandler, { World as BaseWorld } from "./index";
import { WorldSlice0 } from "./world-slice-0";

export class World extends BaseWorld {}
export { WorldSlice0 };

async function worldSlice0Response(request: Request, env: Env): Promise<Response> {
  const world = env.WORLD_SLICE_0.get(env.WORLD_SLICE_0.idFromName("world-slice-0"));
  const url = new URL(request.url);
  url.pathname = "/__ws0";
  return world.fetch(new Request(url.toString(), {
    method: request.method,
    headers: request.headers,
  }));
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/world0") return worldSlice0Response(request, env);
    return baseHandler.fetch(request, env);
  },
} satisfies ExportedHandler<Env>;
