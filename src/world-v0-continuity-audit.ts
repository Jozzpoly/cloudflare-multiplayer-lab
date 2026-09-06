import { DurableObject } from "cloudflare:workers";
import { b3 } from "./box3d-runtime";

const SIM_HZ = 60;
const STEP_MS = 1000 / SIM_HZ;
const LEASE_TICKS = 36;
const MAX_ACTORS = 2;

type WorldId = ReturnType<typeof b3.b3CreateWorld>;
type BodyId = ReturnType<typeof b3.b3CreateBody>;
type Vec3 = [number, number, number];

type AuditActor = {
  token: string;
  playerId: string;
  actorId: string;
  slot: number;
  body: BodyId;
  socket: WebSocket | null;
  intentX: number;
  lastInputTick: number;
  stale: boolean;
  resumeCount: number;
};

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "cache-control": "no-store", "content-type": "application/json; charset=utf-8" },
  });
}

function bodyPosition(body: BodyId): Vec3 {
  const out: Vec3 = [0, 0, 0];
  b3.b3Body_GetPosition(out, body);
  return [out[0], out[1], out[2]];
}

function bodyVelocity(body: BodyId): Vec3 {
  const out: Vec3 = [0, 0, 0];
  b3.b3Body_GetLinearVelocity(out, body);
  return [out[0], out[1], out[2]];
}

function bodyHandle(body: BodyId) {
  return { index1: body.index1, world0: body.world0, generation: body.generation };
}

function finiteVec(values: readonly number[]): boolean {
  return values.every(Number.isFinite);
}

/**
 * Audit-only lifecycle specimen.
 *
 * Deliberately NOT the production SharedYardV0 protocol. It isolates one question:
 * can a real Durable Object + real WebSockets + the pinned Box3D runtime keep one
 * authoritative WorldEpoch alive while one transport disappears, neutralize only
 * that actor after the existing 36-tick lease, then bind a fresh socket back to
 * the same physical actor?
 */
export class ContinuityAuditDO extends DurableObject<any> {
  private world: WorldId | null = null;
  private worldEpoch: string | null = null;
  private tick = 0;
  private loop: ReturnType<typeof setInterval> | null = null;
  private sharedProp: BodyId | null = null;
  private readonly actorsByToken = new Map<string, AuditActor>();
  private readonly tokenBySocket = new Map<WebSocket, string>();

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/status")) return json(this.status());
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return json({ ok: false, error: "websocket_required" }, 426);
    }
    return this.accept(request);
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    const token = this.tokenBySocket.get(ws);
    const actor = token ? this.actorsByToken.get(token) : null;
    if (!actor || typeof raw !== "string") return;

    let message: unknown;
    try { message = JSON.parse(raw); } catch { return; }
    if (!message || typeof message !== "object") return;
    const value = message as Record<string, unknown>;
    if (value.type !== "input") return;

    const x = Number(value.x);
    if (!Number.isFinite(x)) return;
    actor.intentX = Math.max(-1, Math.min(1, x));
    actor.lastInputTick = this.tick;
    actor.stale = false;
    this.send(ws, {
      type: "input_ack",
      actorId: actor.actorId,
      boundaryTick: this.tick,
      worldEpoch: this.worldEpoch,
    });
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    this.detachSocket(ws);
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    this.detachSocket(ws);
  }

  private accept(request: Request): Response {
    const url = new URL(request.url);
    const playerId = (url.searchParams.get("player") ?? "").trim();
    const requestedToken = (url.searchParams.get("token") ?? "").trim();
    if (!/^[A-Za-z0-9_-]{1,24}$/.test(playerId)) return json({ ok: false, error: "invalid_player" }, 400);

    if (!this.world) this.createWorld();
    if (!this.world || !this.worldEpoch) return json({ ok: false, error: "world_not_ready" }, 500);

    let actor: AuditActor | undefined;
    let resumed = false;
    if (requestedToken) {
      actor = this.actorsByToken.get(requestedToken);
      if (!actor || actor.playerId !== playerId) return json({ ok: false, error: "invalid_resume_token" }, 403);
      resumed = true;
    } else {
      if (this.actorsByToken.size >= MAX_ACTORS) return json({ ok: false, error: "audit_world_full" }, 503);
      actor = this.createActor(playerId, this.actorsByToken.size);
      this.actorsByToken.set(actor.token, actor);
    }

    if (actor.socket && actor.socket.readyState === WebSocket.OPEN) {
      try { actor.socket.close(1012, "session_rebound"); } catch { /* audit race */ }
      this.tokenBySocket.delete(actor.socket);
    }

    const [client, server] = Object.values(new WebSocketPair()) as [WebSocket, WebSocket];
    this.ctx.acceptWebSocket(server, ["continuity-audit"]);
    actor.socket = server;
    actor.intentX = 0;
    actor.lastInputTick = this.tick;
    actor.stale = false;
    if (resumed) actor.resumeCount += 1;
    this.tokenBySocket.set(server, actor.token);

    this.send(server, {
      type: "continuity_welcome",
      playerId: actor.playerId,
      token: actor.token,
      actorId: actor.actorId,
      bodyHandle: bodyHandle(actor.body),
      slot: actor.slot,
      resumed,
      resumeCount: actor.resumeCount,
      boundaryTick: this.tick,
      worldEpoch: this.worldEpoch,
      state: this.status(),
    });
    return new Response(null, { status: 101, webSocket: client });
  }

  private createWorld(): void {
    const def = b3.b3DefaultWorldDef();
    def.gravity = [0, 0, 0];
    this.world = b3.b3CreateWorld(def);
    this.worldEpoch = crypto.randomUUID();
    this.tick = 0;

    const propDef = b3.b3DefaultBodyDef();
    propDef.type = b3.b3BodyType.b3_dynamicBody;
    propDef.position = [0, 0, 0];
    propDef.linearDamping = 0.15;
    this.sharedProp = b3.b3CreateBody(this.world, propDef);
    b3.b3Body_SetName(this.sharedProp, "shared:prop");
    const propShape = b3.b3DefaultShapeDef();
    propShape.density = 1;
    propShape.baseMaterial.friction = 0.8;
    b3.b3CreateBoxShape(this.sharedProp, propShape, 0.55, 0.55, 0.55);

    this.startLoop();
  }

  private createActor(playerId: string, slot: number): AuditActor {
    if (!this.world) throw new Error("world_not_ready");
    const def = b3.b3DefaultBodyDef();
    def.type = b3.b3BodyType.b3_dynamicBody;
    def.position = [slot === 0 ? -3 : 3, 0, 0];
    def.linearDamping = 0.25;
    const body = b3.b3CreateBody(this.world, def);
    const actorId = `actor:${slot}`;
    b3.b3Body_SetName(body, actorId);
    const shape = b3.b3DefaultShapeDef();
    shape.density = 1;
    shape.baseMaterial.friction = 0.8;
    b3.b3CreateBoxShape(body, shape, 0.4, 0.4, 0.4);
    return {
      token: crypto.randomUUID(),
      playerId,
      actorId,
      slot,
      body,
      socket: null,
      intentX: 0,
      lastInputTick: this.tick,
      stale: false,
      resumeCount: 0,
    };
  }

  private startLoop(): void {
    if (this.loop || !this.world) return;
    this.loop = setInterval(() => this.step(), STEP_MS);
  }

  private step(): void {
    if (!this.world) return;
    for (const actor of [...this.actorsByToken.values()].sort((a, c) => a.slot - c.slot)) {
      const missingTicks = this.tick - actor.lastInputTick;
      if (missingTicks >= LEASE_TICKS) actor.stale = true;
      const targetX = actor.stale ? 0 : actor.intentX * 2.5;
      const velocity = bodyVelocity(actor.body);
      b3.b3Body_SetLinearVelocity(actor.body, [targetX, velocity[1], velocity[2]]);
    }
    b3.b3World_Step(this.world, 1 / SIM_HZ, 4);
    this.tick += 1;
  }

  private detachSocket(ws: WebSocket): void {
    const token = this.tokenBySocket.get(ws);
    this.tokenBySocket.delete(ws);
    if (!token) return;
    const actor = this.actorsByToken.get(token);
    if (!actor || actor.socket !== ws) return;
    actor.socket = null;
  }

  private status() {
    const actors = [...this.actorsByToken.values()]
      .sort((a, c) => a.slot - c.slot)
      .map((actor) => ({
        playerId: actor.playerId,
        actorId: actor.actorId,
        bodyHandle: bodyHandle(actor.body),
        slot: actor.slot,
        connected: actor.socket?.readyState === WebSocket.OPEN,
        stale: actor.stale,
        lastInputTick: actor.lastInputTick,
        missingTicks: this.tick - actor.lastInputTick,
        resumeCount: actor.resumeCount,
        position: bodyPosition(actor.body),
        linearVelocity: bodyVelocity(actor.body),
      }));
    const prop = this.sharedProp ? {
      actorId: "shared:prop",
      bodyHandle: bodyHandle(this.sharedProp),
      position: bodyPosition(this.sharedProp),
      linearVelocity: bodyVelocity(this.sharedProp),
    } : null;
    const finite = actors.every((actor) => finiteVec([...actor.position, ...actor.linearVelocity])) &&
      (!prop || finiteVec([...prop.position, ...prop.linearVelocity]));
    return {
      ok: finite,
      revision: "world-v0-continuity-audit-do-v2-body-handle",
      worldEpoch: this.worldEpoch,
      boundaryTick: this.tick,
      simulationHz: SIM_HZ,
      inputLeaseTicks: LEASE_TICKS,
      inputLeaseMs: LEASE_TICKS * 1000 / SIM_HZ,
      actors,
      prop,
      finite,
    };
  }

  private send(ws: WebSocket, payload: unknown): void {
    if (ws.readyState !== WebSocket.OPEN) return;
    try { ws.send(JSON.stringify(payload)); } catch { /* audit close race */ }
  }
}

export default {
  async fetch(request: Request, env: any): Promise<Response> {
    const id = env.CONTINUITY_AUDIT.idFromName("world-v0-continuity-specimen");
    return env.CONTINUITY_AUDIT.get(id).fetch(request);
  },
};
