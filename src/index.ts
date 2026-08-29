import { DurableObject } from "cloudflare:workers";

const jsonHeaders = {
  "cache-control": "no-store",
  "content-type": "application/json; charset=utf-8",
};

const ROOM_ID_PATTERN = /^[A-Z0-9_-]{1,32}$/;
const PLAYER_ID_PATTERN = /^[A-Za-z0-9_-]{1,24}$/;

type RoomSocketAttachment = {
  roomId: string;
  playerId: string;
  sessionId: string;
  joinedAt: number;
};

type ClientMessage =
  | { type: "ping"; id: string }
  | { type: "signal"; id: string; text: string };

function normalizeRoomId(value: string): string | null {
  const normalized = value.trim().toUpperCase();
  return ROOM_ID_PATTERN.test(normalized) ? normalized : null;
}

function normalizePlayerId(value: string | null): string | null {
  const normalized = value?.trim() ?? "";
  return PLAYER_ID_PATTERN.test(normalized) ? normalized : null;
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: jsonHeaders,
  });
}

function websocketUpgradeRequired(): Response {
  return new Response("Expected Upgrade: websocket", {
    status: 426,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

function parseClientMessage(raw: string): ClientMessage | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }

  if (typeof value !== "object" || value === null || !("type" in value) || !("id" in value)) {
    return null;
  }

  if (typeof value.id !== "string" || value.id.length > 80) {
    return null;
  }

  if (value.type === "ping") {
    return { type: "ping", id: value.id };
  }

  if (value.type === "signal" && "text" in value && typeof value.text === "string") {
    const text = value.text.trim();
    if (text.length > 0 && text.length <= 240) {
      return { type: "signal", id: value.id, text };
    }
  }

  return null;
}

function directWebSocketResponse(request: Request): Response {
  const upgradeHeader = request.headers.get("Upgrade");
  if (upgradeHeader?.toLowerCase() !== "websocket") {
    return websocketUpgradeRequired();
  }

  const [client, server] = Object.values(new WebSocketPair()) as [WebSocket, WebSocket];
  const connectionId = crypto.randomUUID();

  server.accept();

  server.addEventListener("message", (event) => {
    if (typeof event.data !== "string") {
      server.send(JSON.stringify({ type: "error", error: "text_frames_only" }));
      return;
    }

    const message = parseClientMessage(event.data);
    if (!message || message.type !== "ping") {
      server.send(JSON.stringify({ type: "error", error: "unsupported_message" }));
      return;
    }

    server.send(
      JSON.stringify({
        type: "pong",
        id: message.id,
        connectionId,
        serverReceivedAt: Date.now(),
      }),
    );
  });

  server.send(
    JSON.stringify({
      type: "hello",
      connectionId,
      serverTime: new Date().toISOString(),
    }),
  );

  return new Response(null, {
    status: 101,
    webSocket: client,
  });
}

export class Room extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return websocketUpgradeRequired();
    }

    const url = new URL(request.url);
    const match = url.pathname.match(/^\/room\/([^/]+)\/ws$/);
    const roomId = match ? normalizeRoomId(decodeURIComponent(match[1])) : null;
    const playerId = normalizePlayerId(url.searchParams.get("player"));

    if (!roomId || !playerId) {
      return jsonResponse({ ok: false, error: "invalid_room_or_player" }, 400);
    }

    const [client, server] = Object.values(new WebSocketPair()) as [WebSocket, WebSocket];
    const attachment: RoomSocketAttachment = {
      roomId,
      playerId,
      sessionId: crypto.randomUUID(),
      joinedAt: Date.now(),
    };

    this.ctx.acceptWebSocket(server, ["member"]);
    server.serializeAttachment(attachment);

    this.send(server, {
      type: "hello",
      roomId,
      playerId,
      sessionId: attachment.sessionId,
      serverTime: new Date().toISOString(),
    });
    this.broadcastPresence(roomId);

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    const attachment = this.readAttachment(ws);
    if (!attachment) {
      ws.close(1011, "missing_session_attachment");
      return;
    }

    if (typeof raw !== "string") {
      this.send(ws, { type: "error", error: "text_frames_only" });
      return;
    }

    const message = parseClientMessage(raw);
    if (!message) {
      this.send(ws, { type: "error", error: "invalid_message" });
      return;
    }

    if (message.type === "ping") {
      this.send(ws, {
        type: "pong",
        id: message.id,
        roomId: attachment.roomId,
        sessionId: attachment.sessionId,
        serverReceivedAt: Date.now(),
      });
      return;
    }

    this.broadcast({
      type: "signal",
      id: message.id,
      roomId: attachment.roomId,
      from: attachment.playerId,
      text: message.text,
      serverReceivedAt: Date.now(),
    });
  }

  async webSocketClose(
    ws: WebSocket,
    _code: number,
    _reason: string,
    _wasClean: boolean,
  ): Promise<void> {
    const attachment = this.readAttachment(ws);
    if (attachment) {
      this.broadcastPresence(attachment.roomId, ws);
    }
  }

  async webSocketError(ws: WebSocket, _error: unknown): Promise<void> {
    const attachment = this.readAttachment(ws);
    if (attachment) {
      this.broadcastPresence(attachment.roomId, ws);
    }
  }

  private readAttachment(ws: WebSocket): RoomSocketAttachment | null {
    const value = ws.deserializeAttachment();
    if (typeof value !== "object" || value === null) {
      return null;
    }

    const candidate = value as Partial<RoomSocketAttachment>;
    if (
      typeof candidate.roomId !== "string" ||
      typeof candidate.playerId !== "string" ||
      typeof candidate.sessionId !== "string" ||
      typeof candidate.joinedAt !== "number"
    ) {
      return null;
    }

    return candidate as RoomSocketAttachment;
  }

  private participants(exclude?: WebSocket): string[] {
    const byPlayer = new Map<string, number>();

    for (const socket of this.ctx.getWebSockets("member")) {
      if (socket === exclude || socket.readyState !== WebSocket.OPEN) {
        continue;
      }

      const attachment = this.readAttachment(socket);
      if (!attachment) {
        continue;
      }

      const previousJoinedAt = byPlayer.get(attachment.playerId);
      if (previousJoinedAt === undefined || attachment.joinedAt > previousJoinedAt) {
        byPlayer.set(attachment.playerId, attachment.joinedAt);
      }
    }

    return [...byPlayer.keys()].sort((a, b) => a.localeCompare(b));
  }

  private broadcastPresence(roomId: string, exclude?: WebSocket): void {
    const participants = this.participants(exclude);
    this.broadcast(
      {
        type: "presence",
        roomId,
        count: participants.length,
        participants,
        serverTime: new Date().toISOString(),
      },
      exclude,
    );
  }

  private broadcast(payload: unknown, exclude?: WebSocket): void {
    const encoded = JSON.stringify(payload);
    for (const socket of this.ctx.getWebSockets("member")) {
      if (socket === exclude || socket.readyState !== WebSocket.OPEN) {
        continue;
      }
      try {
        socket.send(encoded);
      } catch {
        // A concurrently closing socket is not evidence of room failure.
      }
    }
  }

  private send(ws: WebSocket, payload: unknown): void {
    try {
      ws.send(JSON.stringify(payload));
    } catch {
      // The browser lifecycle is authoritative for whether the connection survived.
    }
  }
}

async function roomWebSocketResponse(request: Request, env: Env, url: URL): Promise<Response> {
  if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
    return websocketUpgradeRequired();
  }

  const match = url.pathname.match(/^\/room\/([^/]+)\/ws$/);
  if (!match) {
    return jsonResponse({ ok: false, error: "not_found" }, 404);
  }

  const roomId = normalizeRoomId(decodeURIComponent(match[1]));
  const playerId = normalizePlayerId(url.searchParams.get("player"));
  if (!roomId || !playerId) {
    return jsonResponse({ ok: false, error: "invalid_room_or_player" }, 400);
  }

  const room = env.ROOMS.get(env.ROOMS.idFromName(`room:${roomId}`));
  return room.fetch(request);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/ws") {
      return directWebSocketResponse(request);
    }

    if (url.pathname.startsWith("/room/")) {
      return roomWebSocketResponse(request, env, url);
    }

    if (url.pathname === "/api/ping") {
      return jsonResponse({
        ok: true,
        service: "cloudflare-multiplayer-lab",
        stage: "gate-3-stateful-room",
        timestamp: new Date().toISOString(),
      });
    }

    if (url.pathname.startsWith("/api/")) {
      return jsonResponse({ ok: false, error: "not_found" }, 404);
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
