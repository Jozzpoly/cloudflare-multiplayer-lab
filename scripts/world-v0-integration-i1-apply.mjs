import { readFileSync, writeFileSync } from "node:fs";

const path = "src/world-v0-shared-yard.ts";
let source = readFileSync(path, "utf8");

if (source.includes("resumeToken: string;") && source.includes("sessionBySocket")) {
  console.log("WORLD_V0_I1_APPLY already applied");
  process.exit(0);
}

function replaceOnce(before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`I1 patch marker missing: ${label}`);
  if (source.indexOf(before, first + before.length) >= 0) throw new Error(`I1 patch marker ambiguous: ${label}`);
  source = source.slice(0, first) + after + source.slice(first + before.length);
}

replaceOnce(`type SharedYardPlayer = {
  playerId: string;
  sessionId: string;
  netEntityId: string;
  slot: number;
  body: BodyId;
  ready: boolean;
  input: WorldV0ScheduledInputBuffer;
};`, `type SharedYardPlayer = {
  playerId: string;
  sessionId: string;
  resumeToken: string;
  netEntityId: string;
  slot: number;
  body: BodyId;
  ready: boolean;
  input: WorldV0ScheduledInputBuffer;
  socket: WebSocket | null;
  resumeCount: number;
};`, "player session shape");

replaceOnce(
  `  private readonly players = new Map<WebSocket, SharedYardPlayer>();`,
  `  // ActorSession lifetime is deliberately independent from transport lifetime.\n  // sessionId is public simulation identity; resumeToken is private reconnect authority.\n  private readonly players = new Map<string, SharedYardPlayer>();\n  private readonly sessionBySocket = new Map<WebSocket, string>();`,
  "session maps",
);

replaceOnce(
  `        players: this.players.size,\n        physicsLoopActive: this.loopTimer !== null,`,
  `        players: this.players.size,\n        connectedPlayers: this.connectedPlayerCount(),\n        stalePlayers: [...this.players.values()].filter((player) =>\n          player.input.stats().currentMissingStreak >= WORLD_V0_TIMING.inputLeaseMissingTicks\n        ).length,\n        physicsLoopActive: this.loopTimer !== null,`,
  "status connectivity",
);

replaceOnce(
  `    const player = this.players.get(ws);`,
  `    const player = this.playerForSocket(ws);`,
  "socket player lookup",
);

replaceOnce(
  `      this.endEpoch(\`world_identity_mismatch:\${player.netEntityId}\`);\n      return;`,
  `      // A stale/bad transport must not be allowed to destroy the shared WorldEpoch.\n      this.detachSocket(ws);\n      try { ws.close(1008, "world_identity_mismatch"); } catch { /* close race */ }\n      return;`,
  "identity mismatch containment",
);

replaceOnce(
  `      for (const [peerSocket] of this.players) {\n        if (peerSocket !== ws) this.send(peerSocket, payload);\n      }`,
  `      for (const peer of this.players.values()) {\n        if (peer.socket && peer.socket !== ws) this.send(peer.socket, payload);\n      }`,
  "peer relay sockets",
);

replaceOnce(
  `  async webSocketClose(ws: WebSocket): Promise<void> {\n    this.endEpochFromSocket(ws, "peer_left_restart_required");\n  }\n\n  async webSocketError(ws: WebSocket): Promise<void> {\n    this.endEpochFromSocket(ws, "peer_error_restart_required");\n  }`,
  `  async webSocketClose(ws: WebSocket): Promise<void> {\n    this.detachSocket(ws);\n  }\n\n  async webSocketError(ws: WebSocket): Promise<void> {\n    this.detachSocket(ws);\n  }`,
  "transport loss containment",
);

const acceptStart = source.indexOf("  private acceptPlayer(request: Request): Response {");
const acceptEnd = source.indexOf("\n  private maybeStartProtocol(): void {", acceptStart);
if (acceptStart < 0 || acceptEnd < 0) throw new Error("I1 acceptPlayer block markers missing");
const acceptReplacement = `  private acceptPlayer(request: Request): Response {
    const url = new URL(request.url);
    const playerId = (url.searchParams.get("player") ?? "").trim();
    const requestedResumeToken = (url.searchParams.get("resume") ?? "").trim();
    const runKey = normalizeRunKey(url.searchParams.get("run"));
    const requestedWorldId = \`shared-yard-v0-\${runKey}\`;
    if (!PLAYER_ID_PATTERN.test(playerId)) return json({ ok: false, error: "invalid_player" }, 400);

    let player: SharedYardPlayer | undefined;
    let resumed = false;

    if (requestedResumeToken) {
      if (!this.world || !this.worldId || !this.worldEpoch) {
        return json({ ok: false, error: "invalid_resume_token" }, 403);
      }
      if (this.worldId !== requestedWorldId) return json({ ok: false, error: "world_id_mismatch" }, 409);
      player = [...this.players.values()].find((candidate) => candidate.resumeToken === requestedResumeToken);
      if (!player || player.playerId !== playerId) return json({ ok: false, error: "invalid_resume_token" }, 403);
      resumed = true;
    } else {
      // Fresh actors may only join before the run starts. Reconnects use the private token above.
      if (this.protocolStartTick !== null || this.loopTimer) return json({ ok: false, error: "world_v0_run_already_active" }, 409);
      if (this.players.size >= MAX_PLAYERS) return json({ ok: false, error: "world_v0_full" }, 503);
      if (!this.world) this.createWorld(requestedWorldId);
      if (!this.world || !this.worldId || !this.worldEpoch) return json({ ok: false, error: "world_not_ready" }, 500);
      if (this.worldId !== requestedWorldId) return json({ ok: false, error: "world_id_mismatch" }, 409);

      const slot = this.players.size;
      const start = WORLD_V0_PLAYER_STARTS[slot];
      if (!start) return json({ ok: false, error: "world_v0_slot_missing" }, 500);
      player = {
        playerId,
        sessionId: crypto.randomUUID(),
        resumeToken: crypto.randomUUID(),
        netEntityId: \`actor:\${slot}\`,
        slot,
        body: this.createPlayerBody(start),
        ready: false,
        input: new WorldV0ScheduledInputBuffer(),
        socket: null,
        resumeCount: 0,
      };
      this.players.set(player.sessionId, player);
    }

    if (!player || !this.world || !this.worldId || !this.worldEpoch) {
      return json({ ok: false, error: "world_not_ready" }, 500);
    }

    // A newer connection owns the ActorSession. The old socket is detached before
    // closing so its eventual close callback cannot detach the replacement socket.
    const previousSocket = player.socket;
    if (previousSocket) {
      this.sessionBySocket.delete(previousSocket);
      player.socket = null;
      try { previousSocket.close(1012, "session_rebound"); } catch { /* rebound race */ }
    }

    const [client, server] = Object.values(new WebSocketPair()) as [WebSocket, WebSocket];
    this.ensureEpochPinned();
    this.ctx.acceptWebSocket(server, ["shared-yard-v0-player"]);
    player.socket = server;
    if (resumed) player.resumeCount += 1;
    this.sessionBySocket.set(server, player.sessionId);

    this.send(server, {
      type: "world_v0_welcome",
      revision: WORLD_V0_SERVER_REVISION,
      selfSessionId: player.sessionId,
      selfNetEntityId: player.netEntityId,
      resumeToken: player.resumeToken,
      resumed,
      resumeCount: player.resumeCount,
      resumeLastBatchSeq: player.input.stats().lastBatchSeq,
      slot: player.slot,
      waitingForPeer: this.connectedPlayerCount() < MAX_PLAYERS,
      protocolStartTick: this.protocolStartTick,
      simulation: worldV0SimulationContract(),
      state: this.snapshotState(),
      serverTime: Date.now(),
      ...this.identityPayload(),
    });
    this.broadcast({
      type: "world_v0_roster",
      boundaryTick: this.tick,
      players: this.snapshotState().players.map(({ id, sessionId, slot: playerSlot, netEntityId: entityId }) => ({
        id,
        sessionId,
        slot: playerSlot,
        netEntityId: entityId,
      })),
      ...this.identityPayload(),
    });
    return new Response(null, { status: 101, webSocket: client });
  }
`;
source = source.slice(0, acceptStart) + acceptReplacement + source.slice(acceptEnd);

replaceOnce(
  `    let leaseExpiredBy: SharedYardPlayer | null = null;\n`,
  ``,
  "lease epoch-death accumulator",
);
replaceOnce(
  `      if (active && input.source === "lease_expired" && !leaseExpiredBy) leaseExpiredBy = player;\n`,
  ``,
  "lease epoch-death selection",
);
replaceOnce(
  `    if (leaseExpiredBy) {\n      this.endEpoch(\`input_lease_expired:\${leaseExpiredBy.netEntityId}\`);\n      return;\n    }`,
  `    // Lease expiry is actor-local containment, not WorldEpoch death. Once no\n    // transport survives, however, allow the run to die after every session has\n    // crossed the same bounded lease rather than creating an always-on zombie DO.\n    if (active && this.players.size > 0 && this.connectedPlayerCount() === 0 &&\n        [...this.players.values()].every((player) =>\n          player.input.stats().currentMissingStreak >= WORLD_V0_TIMING.inputLeaseMissingTicks\n        )) {\n      this.endEpoch("all_players_disconnected_lease_expired");\n      return;\n    }`,
  "actor-local lease containment",
);

const oldLifecycle = `  private endEpochFromSocket(ws: WebSocket, reason: string): void {
    if (!this.players.has(ws)) return;
    this.endEpoch(reason);
  }
`;
const newLifecycle = `  private playerForSocket(ws: WebSocket): SharedYardPlayer | null {
    const sessionId = this.sessionBySocket.get(ws);
    return sessionId ? this.players.get(sessionId) ?? null : null;
  }

  private connectedPlayerCount(): number {
    let count = 0;
    for (const player of this.players.values()) {
      if (player.socket?.readyState === WebSocket.OPEN) count += 1;
    }
    return count;
  }

  private detachSocket(ws: WebSocket): void {
    const sessionId = this.sessionBySocket.get(ws);
    this.sessionBySocket.delete(ws);
    if (!sessionId) return;
    const player = this.players.get(sessionId);
    if (!player || player.socket !== ws) return;
    player.socket = null;

    // Before canonical play starts there is no ticking lease to clean up an empty
    // run, so an entirely abandoned waiting room may end immediately.
    if (this.protocolStartTick === null && this.connectedPlayerCount() === 0) {
      this.endEpoch("all_players_disconnected_before_start");
    }
  }
`;
replaceOnce(oldLifecycle, newLifecycle, "socket lifecycle helpers");

replaceOnce(
  `      for (const socket of this.players.keys()) {\n        try { socket.close(1012, reason); } catch { /* lifecycle race */ }\n      }\n      this.players.clear();`,
  `      for (const player of this.players.values()) {\n        if (!player.socket) continue;\n        try { player.socket.close(1012, reason); } catch { /* lifecycle race */ }\n      }\n      this.sessionBySocket.clear();\n      this.players.clear();`,
  "epoch teardown sockets",
);

replaceOnce(
  `  private broadcast(payload: unknown): void {\n    for (const socket of this.players.keys()) this.send(socket, payload);\n  }`,
  `  private broadcast(payload: unknown): void {\n    for (const player of this.players.values()) {\n      if (player.socket) this.send(player.socket, payload);\n    }\n  }`,
  "connected broadcast",
);

if (!source.includes("resumeToken: string;") ||
    !source.includes("all_players_disconnected_lease_expired") ||
    !source.includes("private detachSocket(ws: WebSocket)")) {
  throw new Error("I1 patch postcondition failed");
}

writeFileSync(path, source);
console.log("WORLD_V0_I1_APPLY PASS");