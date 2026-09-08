import { WorldSlice0 as BaseWorldSlice0 } from "./world-slice-0";

export const TWO_CLIENT_PROBE_REVISION = "ws0-a2r-two-client-intent-v1";
const MAX_PROBE_PLAYERS = 2;

type PeerIntent = {
  seq: number;
  x: number;
  z: number;
};

function normalizedInput(x: number, z: number): { x: number; z: number } {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return { x: 0, z: 0 };
  const length = Math.hypot(x, z);
  if (length <= 1) return { x, z };
  return { x: x / length, z: z / length };
}

export function parsePeerIntent(raw: string | ArrayBuffer): PeerIntent | null {
  if (typeof raw !== "string") return null;

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }

  if (typeof value !== "object" || value === null || !("type" in value) || value.type !== "input") return null;
  if (!("seq" in value) || typeof value.seq !== "number" || !Number.isFinite(value.seq)) return null;
  if (!("x" in value) || typeof value.x !== "number") return null;
  if (!("z" in value) || typeof value.z !== "number") return null;

  const input = normalizedInput(value.x, value.z);
  return { seq: Math.trunc(value.seq), x: input.x, z: input.z };
}

/**
 * Bounded two-client extension of the preserved A2R server substrate.
 *
 * Authority, Box3D stepping, snapshots and input application remain owned by
 * BaseWorldSlice0. This layer adds only one causal side channel: after a valid
 * input frame is accepted in-order for one socket, the normalized intent is
 * forwarded to the other interactive socket. The sender never receives its
 * own peer event, so a client in this deliberately two-player probe does not
 * need a new identity/ownership protocol merely to identify the one remote
 * actor.
 *
 * This is research instrumentation, not a general multiplayer protocol.
 */
export class WorldSlice0 extends BaseWorldSlice0 {
  private readonly lastForwardedSeq = new WeakMap<WebSocket, number>();

  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade")?.toLowerCase() === "websocket") {
      const activeSockets = this.ctx.getWebSockets("ws0-player");
      if (activeSockets.length >= MAX_PROBE_PLAYERS) {
        return new Response(JSON.stringify({
          ok: false,
          error: "two_client_probe_full",
          probeRevision: TWO_CLIENT_PROBE_REVISION,
        }), {
          status: 503,
          headers: {
            "cache-control": "no-store",
            "content-type": "application/json; charset=utf-8",
          },
        });
      }
    }

    return super.fetch(request);
  }

  override async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    const intent = parsePeerIntent(raw);
    await super.webSocketMessage(ws, raw);

    if (!intent || ws.readyState !== WebSocket.OPEN) return;
    const previousSeq = this.lastForwardedSeq.get(ws) ?? 0;
    if (intent.seq <= previousSeq) return;
    this.lastForwardedSeq.set(ws, intent.seq);

    const encoded = JSON.stringify({
      type: "peer_input",
      probeRevision: TWO_CLIENT_PROBE_REVISION,
      seq: intent.seq,
      x: intent.x,
      z: intent.z,
      serverTime: Date.now(),
    });

    for (const peer of this.ctx.getWebSockets("ws0-player")) {
      if (peer === ws || peer.readyState !== WebSocket.OPEN) continue;
      try {
        peer.send(encoded);
      } catch {
        // Close races remain lifecycle noise; authoritative simulation is
        // unchanged and the normal snapshot path continues independently.
      }
    }
  }

  override async webSocketClose(ws: WebSocket): Promise<void> {
    this.lastForwardedSeq.delete(ws);
    await super.webSocketClose(ws);
  }

  override async webSocketError(ws: WebSocket): Promise<void> {
    this.lastForwardedSeq.delete(ws);
    await super.webSocketError(ws);
  }
}
