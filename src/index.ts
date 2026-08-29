const jsonHeaders = {
  "cache-control": "no-store",
  "content-type": "application/json; charset=utf-8",
};

function websocketResponse(request: Request): Response {
  const upgradeHeader = request.headers.get("Upgrade");
  if (upgradeHeader?.toLowerCase() !== "websocket") {
    return new Response("Expected Upgrade: websocket", {
      status: 426,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  const [client, server] = Object.values(new WebSocketPair()) as [WebSocket, WebSocket];
  const connectionId = crypto.randomUUID();

  server.accept();

  server.addEventListener("message", (event) => {
    if (typeof event.data !== "string") {
      server.send(JSON.stringify({ type: "error", error: "text_frames_only" }));
      return;
    }

    let message: unknown;
    try {
      message = JSON.parse(event.data);
    } catch {
      server.send(JSON.stringify({ type: "error", error: "invalid_json" }));
      return;
    }

    if (
      typeof message === "object" &&
      message !== null &&
      "type" in message &&
      message.type === "ping" &&
      "id" in message &&
      typeof message.id === "string"
    ) {
      server.send(
        JSON.stringify({
          type: "pong",
          id: message.id,
          connectionId,
          serverReceivedAt: Date.now(),
        }),
      );
      return;
    }

    server.send(JSON.stringify({ type: "error", error: "unsupported_message" }));
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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/ws") {
      return websocketResponse(request);
    }

    if (url.pathname === "/api/ping") {
      return new Response(
        JSON.stringify({
          ok: true,
          service: "cloudflare-multiplayer-lab",
          stage: "gate-1-deployment-sanity",
          timestamp: new Date().toISOString(),
        }),
        { headers: jsonHeaders },
      );
    }

    if (url.pathname.startsWith("/api/")) {
      return new Response(JSON.stringify({ ok: false, error: "not_found" }), {
        status: 404,
        headers: jsonHeaders,
      });
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
