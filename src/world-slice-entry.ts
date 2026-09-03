import baseHandler, { World as BaseWorld } from "./index";
import { WorldSlice0 } from "./world-slice-0-two-client";
import { WorldSliceF5 } from "./world-slice-f5";
import { SharedYardV0 } from "./world-v0-shared-yard";

export class World extends BaseWorld {}
export { WorldSlice0, WorldSliceF5, SharedYardV0 };

function worldSliceStub(env: Env, name: string) {
  return env.WORLD_SLICE_0.get(env.WORLD_SLICE_0.idFromName(name));
}

function worldSliceF5Stub(env: Env, name: string) {
  return env.WORLD_SLICE_F5.get(env.WORLD_SLICE_F5.idFromName(name));
}

function sharedYardV0Stub(env: Env, name: string) {
  return env.SHARED_YARD_V0.get(env.SHARED_YARD_V0.idFromName(name));
}

async function worldSlice0ApiResponse(request: Request, env: Env): Promise<Response> {
  const world = worldSliceStub(env, "world-slice-0-a1");
  const url = new URL(request.url);
  url.pathname = "/__ws0";
  return world.fetch(new Request(url.toString(), { method: request.method, headers: request.headers }));
}

function worldSlice0InteractiveInstance(request: Request): string {
  const url = new URL(request.url);
  const player = (url.searchParams.get("player") ?? "").trim();

  // RC1 uses callsigns A-<run-key> and B-<run-key>. Route those paired
  // research clients to a run-specific Durable Object so every matrix cell
  // is a genuinely fresh world and teardown timing from the previous cell
  // cannot contaminate the next one. Ordinary WS0 clients retain the stable
  // world-slice-0-play instance and therefore unchanged behavior.
  const match = /^[AB]-([A-Za-z0-9_-]{1,20})$/.exec(player);
  if (match) return `world-slice-0-rc1-${match[1]}`;
  return "world-slice-0-play";
}

async function worldSlice0WebSocketResponse(request: Request, env: Env): Promise<Response> {
  if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
    return new Response("Expected Upgrade: websocket", { status: 426, headers: { "content-type": "text/plain; charset=utf-8" } });
  }
  const world = worldSliceStub(env, worldSlice0InteractiveInstance(request));
  return world.fetch(request);
}

function worldSliceF5Instance(request: Request): string {
  const url = new URL(request.url);
  const run = (url.searchParams.get("run") ?? "manual").trim();
  const safeRun = /^[A-Za-z0-9_-]{1,20}$/.test(run) ? run : "manual";
  return `world-slice-f5-${safeRun}`;
}

async function worldSliceF5WebSocketResponse(request: Request, env: Env): Promise<Response> {
  if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
    return new Response("Expected Upgrade: websocket", { status: 426, headers: { "content-type": "text/plain; charset=utf-8" } });
  }
  const world = worldSliceF5Stub(env, worldSliceF5Instance(request));
  return world.fetch(request);
}

function sharedYardV0Instance(request: Request): string {
  const url = new URL(request.url);
  const run = (url.searchParams.get("run") ?? "manual").trim();
  const safeRun = /^[A-Za-z0-9_-]{1,20}$/.test(run) ? run : "manual";
  return `shared-yard-v0-${safeRun}`;
}

async function sharedYardV0WebSocketResponse(request: Request, env: Env): Promise<Response> {
  if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
    return new Response("Expected Upgrade: websocket", { status: 426, headers: { "content-type": "text/plain; charset=utf-8" } });
  }
  const world = sharedYardV0Stub(env, sharedYardV0Instance(request));
  return world.fetch(request);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/world0") return worldSlice0ApiResponse(request, env);
    if (url.pathname === "/world0/ws") return worldSlice0WebSocketResponse(request, env);
    if (url.pathname === "/world0-f5/ws") return worldSliceF5WebSocketResponse(request, env);
    if (url.pathname === "/world-v0/ws" && env.SHARED_YARD_V0) return sharedYardV0WebSocketResponse(request, env);
    return baseHandler.fetch(request, env);
  },
} satisfies ExportedHandler<Env>;
