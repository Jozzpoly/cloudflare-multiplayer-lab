import { DurableObject } from "cloudflare:workers";

const WORLD_WIDTH = 1600;
const WORLD_HEIGHT = 1000;
const PLAYER_RADIUS = 18;
const ACCELERATION = 920;
const DRAG = 5.2;
const MAX_SPEED = 330;
const DASH_IMPULSE = 310;
const DASH_COOLDOWN_MS = 1250;
const COMBO_WINDOW_MS = 2800;
const PICKUP_COUNT = 22;
const PLAYER_ID_PATTERN = /^[A-Za-z0-9_-]{1,24}$/;

const jsonHeaders = {
  "cache-control": "no-store",
  "content-type": "application/json; charset=utf-8",
};

type Pickup = {
  id: number;
  x: number;
  y: number;
  value: number;
  kind: "shard" | "core";
};

type WorldSocketAttachment = {
  playerId: string;
  sessionId: string;
  hue: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  inputX: number;
  inputY: number;
  score: number;
  combo: number;
  lastCollectAt: number;
  lastUpdate: number;
  dashReadyAt: number;
};

type ClientMessage =
  | { type: "input"; seq: number; x: number; y: number; dash: boolean }
  | { type: "ping"; id: string };

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: jsonHeaders });
}

function websocketUpgradeRequired(): Response {
  return new Response("Expected Upgrade: websocket", {
    status: 426,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizePlayerId(value: string | null): string | null {
  const normalized = value?.trim() ?? "";
  return PLAYER_ID_PATTERN.test(normalized) ? normalized : null;
}

function normalizeVector(x: number, y: number): { x: number; y: number } {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return { x: 0, y: 0 };
  const length = Math.hypot(x, y);
  if (length <= 1) return { x, y };
  return { x: x / length, y: y / length };
}

function parseClientMessage(raw: string): ClientMessage | null {
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return null; }
  if (typeof value !== "object" || value === null || !("type" in value)) return null;

  if (value.type === "ping" && "id" in value && typeof value.id === "string" && value.id.length <= 80) {
    return { type: "ping", id: value.id };
  }

  if (
    value.type === "input" &&
    "seq" in value && typeof value.seq === "number" && Number.isFinite(value.seq) &&
    "x" in value && typeof value.x === "number" &&
    "y" in value && typeof value.y === "number" &&
    "dash" in value && typeof value.dash === "boolean"
  ) {
    return { type: "input", seq: value.seq, x: value.x, y: value.y, dash: value.dash };
  }
  return null;
}

function createPickup(id: number): Pickup {
  const core = id % 9 === 0;
  return {
    id,
    x: 90 + Math.random() * (WORLD_WIDTH - 180),
    y: 90 + Math.random() * (WORLD_HEIGHT - 180),
    value: core ? 3 : 1,
    kind: core ? "core" : "shard",
  };
}

function createPickups(): Pickup[] {
  return Array.from({ length: PICKUP_COUNT }, (_, index) => createPickup(index));
}

function publicPlayer(player: WorldSocketAttachment) {
  return {
    playerId: player.playerId,
    sessionId: player.sessionId,
    hue: player.hue,
    x: player.x,
    y: player.y,
    vx: player.vx,
    vy: player.vy,
    score: player.score,
    combo: player.combo,
    comboExpiresAt: player.lastCollectAt + COMBO_WINDOW_MS,
    dashReadyAt: player.dashReadyAt,
  };
}

function directWebSocketResponse(request: Request): Response {
  if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return websocketUpgradeRequired();
  const [client, server] = Object.values(new WebSocketPair()) as [WebSocket, WebSocket];
  const connectionId = crypto.randomUUID();
  server.accept();
  server.addEventListener("message", (event) => {
    if (typeof event.data !== "string") return;
    const message = parseClientMessage(event.data);
    if (message?.type === "ping") server.send(JSON.stringify({ type: "pong", id: message.id, connectionId, serverReceivedAt: Date.now() }));
  });
  server.send(JSON.stringify({ type: "hello", connectionId, serverTime: new Date().toISOString() }));
  return new Response(null, { status: 101, webSocket: client });
}

export class World extends DurableObject<Env> {
  private pickups: Pickup[] = [];
  private pickupsReady = false;

  private async ensureWorld(): Promise<void> {
    if (this.pickupsReady) return;
    const stored = await this.ctx.storage.get<Pickup[]>("pickups");
    if (stored && stored.length === PICKUP_COUNT) {
      this.pickups = stored;
    } else {
      this.pickups = createPickups();
      await this.ctx.storage.put("pickups", this.pickups);
    }
    this.pickupsReady = true;
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return websocketUpgradeRequired();
    await this.ensureWorld();
    const url = new URL(request.url);
    const playerId = normalizePlayerId(url.searchParams.get("player"));
    if (!playerId) return jsonResponse({ ok: false, error: "invalid_player" }, 400);

    const [client, server] = Object.values(new WebSocketPair()) as [WebSocket, WebSocket];
    const now = Date.now();
    const attachment: WorldSocketAttachment = {
      playerId,
      sessionId: crypto.randomUUID(),
      hue: Math.floor(Math.random() * 360),
      x: 180 + Math.random() * (WORLD_WIDTH - 360),
      y: 180 + Math.random() * (WORLD_HEIGHT - 360),
      vx: 0, vy: 0, inputX: 0, inputY: 0,
      score: 0, combo: 1, lastCollectAt: 0,
      lastUpdate: now, dashReadyAt: 0,
    };

    this.ctx.acceptWebSocket(server, ["player"]);
    server.serializeAttachment(attachment);
    this.send(server, {
      type: "welcome",
      self: publicPlayer(attachment),
      players: this.players().map(publicPlayer),
      pickups: this.pickups,
      world: { width: WORLD_WIDTH, height: WORLD_HEIGHT },
      serverTime: now,
    });
    this.broadcast({ type: "player_joined", player: publicPlayer(attachment) }, server);
    this.broadcastScoreboard();
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    await this.ensureWorld();
    const player = this.readAttachment(ws);
    if (!player) { ws.close(1011, "missing_player_state"); return; }
    if (typeof raw !== "string") { this.send(ws, { type: "error", error: "text_frames_only" }); return; }
    const message = parseClientMessage(raw);
    if (!message) { this.send(ws, { type: "error", error: "invalid_message" }); return; }
    if (message.type === "ping") { this.send(ws, { type: "pong", id: message.id, serverReceivedAt: Date.now() }); return; }

    const now = Date.now();
    const input = normalizeVector(message.x, message.y);
    const dt = clamp((now - player.lastUpdate) / 1000, 0, 0.12);
    player.inputX = input.x;
    player.inputY = input.y;
    player.vx += input.x * ACCELERATION * dt;
    player.vy += input.y * ACCELERATION * dt;
    const damping = Math.exp(-DRAG * dt);
    player.vx *= damping;
    player.vy *= damping;

    const baseSpeed = Math.hypot(player.vx, player.vy);
    if (baseSpeed > MAX_SPEED) {
      const scale = MAX_SPEED / baseSpeed;
      player.vx *= scale;
      player.vy *= scale;
    }

    let dashed = false;
    if (message.dash && now >= player.dashReadyAt) {
      let dx = input.x;
      let dy = input.y;
      if (Math.hypot(dx, dy) < 0.1) {
        const speed = Math.hypot(player.vx, player.vy);
        if (speed > 1) { dx = player.vx / speed; dy = player.vy / speed; }
      }
      if (Math.hypot(dx, dy) >= 0.1) {
        player.vx += dx * DASH_IMPULSE;
        player.vy += dy * DASH_IMPULSE;
        player.dashReadyAt = now + DASH_COOLDOWN_MS;
        dashed = true;
      }
    }

    player.x += player.vx * dt;
    player.y += player.vy * dt;
    if (player.x < PLAYER_RADIUS) { player.x = PLAYER_RADIUS; player.vx = Math.abs(player.vx) * 0.35; }
    else if (player.x > WORLD_WIDTH - PLAYER_RADIUS) { player.x = WORLD_WIDTH - PLAYER_RADIUS; player.vx = -Math.abs(player.vx) * 0.35; }
    if (player.y < PLAYER_RADIUS) { player.y = PLAYER_RADIUS; player.vy = Math.abs(player.vy) * 0.35; }
    else if (player.y > WORLD_HEIGHT - PLAYER_RADIUS) { player.y = WORLD_HEIGHT - PLAYER_RADIUS; player.vy = -Math.abs(player.vy) * 0.35; }
    player.lastUpdate = now;

    let pickupChanged = false;
    for (let index = 0; index < this.pickups.length; index += 1) {
      const pickup = this.pickups[index];
      const radius = pickup.kind === "core" ? 34 : 29;
      if (Math.hypot(player.x - pickup.x, player.y - pickup.y) <= radius) {
        player.combo = now - player.lastCollectAt <= COMBO_WINDOW_MS ? Math.min(5, player.combo + 1) : 1;
        player.lastCollectAt = now;
        const points = pickup.value * player.combo;
        player.score += points;
        const replacement = createPickup(pickup.id);
        this.pickups[index] = replacement;
        pickupChanged = true;
        this.broadcast({ type: "collect", playerId: player.playerId, pickupId: pickup.id, pickupKind: pickup.kind, points, score: player.score, combo: player.combo, replacement });
      }
    }

    if (pickupChanged) await this.ctx.storage.put("pickups", this.pickups);
    ws.serializeAttachment(player);
    this.broadcast({ type: "player", player: publicPlayer(player), ack: message.seq, dashed, serverTime: now });
    if (pickupChanged) this.broadcastScoreboard();
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    const player = this.readAttachment(ws);
    if (player) {
      this.broadcast({ type: "player_left", playerId: player.playerId, sessionId: player.sessionId }, ws);
      this.broadcastScoreboard(ws);
    }
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    const player = this.readAttachment(ws);
    if (player) {
      this.broadcast({ type: "player_left", playerId: player.playerId, sessionId: player.sessionId }, ws);
      this.broadcastScoreboard(ws);
    }
  }

  private readAttachment(ws: WebSocket): WorldSocketAttachment | null {
    const value = ws.deserializeAttachment();
    if (typeof value !== "object" || value === null) return null;
    const candidate = value as Partial<WorldSocketAttachment>;
    if (
      typeof candidate.playerId !== "string" || typeof candidate.sessionId !== "string" ||
      typeof candidate.hue !== "number" || typeof candidate.x !== "number" || typeof candidate.y !== "number" ||
      typeof candidate.vx !== "number" || typeof candidate.vy !== "number" ||
      typeof candidate.score !== "number" || typeof candidate.combo !== "number" ||
      typeof candidate.lastUpdate !== "number" || typeof candidate.dashReadyAt !== "number"
    ) return null;
    return candidate as WorldSocketAttachment;
  }

  private players(exclude?: WebSocket): WorldSocketAttachment[] {
    const result: WorldSocketAttachment[] = [];
    for (const socket of this.ctx.getWebSockets("player")) {
      if (socket === exclude || socket.readyState !== WebSocket.OPEN) continue;
      const player = this.readAttachment(socket);
      if (player) result.push(player);
    }
    return result;
  }

  private broadcastScoreboard(exclude?: WebSocket): void {
    const scores = this.players(exclude)
      .map((player) => ({ playerId: player.playerId, hue: player.hue, score: player.score, combo: player.combo }))
      .sort((a, b) => b.score - a.score || a.playerId.localeCompare(b.playerId));
    this.broadcast({ type: "scoreboard", scores }, exclude);
  }

  private broadcast(payload: unknown, exclude?: WebSocket): void {
    const encoded = JSON.stringify(payload);
    for (const socket of this.ctx.getWebSockets("player")) {
      if (socket === exclude || socket.readyState !== WebSocket.OPEN) continue;
      try { socket.send(encoded); } catch { /* closing socket */ }
    }
  }

  private send(ws: WebSocket, payload: unknown): void {
    try { ws.send(JSON.stringify(payload)); } catch { /* browser lifecycle owns final state */ }
  }
}

async function worldWebSocketResponse(request: Request, env: Env): Promise<Response> {
  if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return websocketUpgradeRequired();
  const world = env.WORLD.get(env.WORLD.idFromName("main"));
  return world.fetch(request);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/ws") return directWebSocketResponse(request);
    if (url.pathname === "/game/ws") return worldWebSocketResponse(request, env);
    if (url.pathname === "/api/ping") return jsonResponse({ ok: true, service: "cloudflare-multiplayer-lab", stage: "gate-3-shared-world-game", timestamp: new Date().toISOString() });
    if (url.pathname.startsWith("/api/")) return jsonResponse({ ok: false, error: "not_found" }, 404);
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
