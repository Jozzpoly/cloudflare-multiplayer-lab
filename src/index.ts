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

const SIMULATION_HZ = 20;
const SIMULATION_STEP_MS = 1000 / SIMULATION_HZ;
const SNAPSHOT_HZ = 10;
const SNAPSHOT_EVERY_TICKS = SIMULATION_HZ / SNAPSHOT_HZ;
const MAX_CATCHUP_STEPS = 4;
const INPUT_LEASE_MS = 600;
const DEFAULT_SEED = 0x4a4f5a5a;
const TELEMETRY_SAMPLE_LIMIT = 160;
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

type PlayerState = {
  playerId: string;
  sessionId: string;
  hue: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  inputX: number;
  inputY: number;
  lastInputAt: number;
  lastInputSeq: number;
  dashQueued: boolean;
  score: number;
  combo: number;
  lastCollectAt: number;
  dashReadyAt: number;
  runId: string;
  runSeed: number;
};

type ClientMessage =
  | { type: "input"; seq: number; x: number; y: number; dash: boolean }
  | { type: "ping"; id: string }
  | { type: "reset"; seed: number };

type RateTelemetry = {
  inputsPerSec: number;
  snapshotsPerSec: number;
  inboundBytesPerSec: number;
  outboundBytesPerSec: number;
};

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

function normalizeSeed(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_SEED;
  const normalized = Math.trunc(value) >>> 0;
  return normalized === 0 ? DEFAULT_SEED : normalized;
}

function parseClientMessage(raw: string): ClientMessage | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }

  if (typeof value !== "object" || value === null || !("type" in value)) return null;

  if (
    value.type === "ping" &&
    "id" in value &&
    typeof value.id === "string" &&
    value.id.length <= 80
  ) {
    return { type: "ping", id: value.id };
  }

  if (
    value.type === "input" &&
    "seq" in value && typeof value.seq === "number" && Number.isFinite(value.seq) &&
    "x" in value && typeof value.x === "number" &&
    "y" in value && typeof value.y === "number" &&
    "dash" in value && typeof value.dash === "boolean"
  ) {
    return {
      type: "input",
      seq: Math.trunc(value.seq),
      x: value.x,
      y: value.y,
      dash: value.dash,
    };
  }

  if (
    value.type === "reset" &&
    "seed" in value &&
    typeof value.seed === "number" &&
    Number.isFinite(value.seed)
  ) {
    return { type: "reset", seed: normalizeSeed(value.seed) };
  }

  return null;
}

function hashString(value: string): number {
  let hash = 2166136261 >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash >>> 0;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1));
  return sorted[index];
}

function directWebSocketResponse(request: Request): Response {
  if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return websocketUpgradeRequired();

  const [client, server] = Object.values(new WebSocketPair()) as [WebSocket, WebSocket];
  const connectionId = crypto.randomUUID();
  server.accept();

  server.addEventListener("message", (event) => {
    if (typeof event.data !== "string") return;
    const message = parseClientMessage(event.data);
    if (message?.type === "ping") {
      server.send(JSON.stringify({
        type: "pong",
        id: message.id,
        connectionId,
        serverReceivedAt: Date.now(),
      }));
    }
  });

  server.send(JSON.stringify({
    type: "hello",
    connectionId,
    serverTime: new Date().toISOString(),
  }));

  return new Response(null, { status: 101, webSocket: client });
}

export class World extends DurableObject<Env> {
  private players = new Map<WebSocket, PlayerState>();
  private pickups: Pickup[] = [];
  private runSeed = DEFAULT_SEED;
  private runSerial = 1;
  private runId = "";
  private rngState = DEFAULT_SEED;

  private loopTimer: ReturnType<typeof setInterval> | null = null;
  private lastPumpAt = 0;
  private accumulatorMs = 0;
  private tick = 0;
  private snapshotSequence = 0;
  private droppedTicks = 0;
  private catchupSteps = 0;
  private activeRunStartedAt = 0;

  private tickDurationSamples: number[] = [];
  private tickDriftSamples: number[] = [];

  private rateWindowStartedAt = Date.now();
  private rateWindowInputs = 0;
  private rateWindowSnapshots = 0;
  private rateWindowInboundBytes = 0;
  private rateWindowOutboundBytes = 0;
  private rates: RateTelemetry = {
    inputsPerSec: 0,
    snapshotsPerSec: 0,
    inboundBytesPerSec: 0,
    outboundBytesPerSec: 0,
  };

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.initializeRun(DEFAULT_SEED, false);
    this.restoreActiveSockets();
    if (this.players.size > 0) this.startLoop();
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return websocketUpgradeRequired();

    const url = new URL(request.url);
    const playerId = normalizePlayerId(url.searchParams.get("player"));
    if (!playerId) return jsonResponse({ ok: false, error: "invalid_player" }, 400);

    const [client, server] = Object.values(new WebSocketPair()) as [WebSocket, WebSocket];
    const player = this.createPlayer(playerId);

    this.ctx.acceptWebSocket(server, ["player"]);
    this.players.set(server, player);
    server.serializeAttachment(player);

    this.send(server, {
      type: "welcome",
      self: this.publicPlayer(player),
      players: this.publicPlayers(),
      pickups: this.pickups,
      world: { width: WORLD_WIDTH, height: WORLD_HEIGHT },
      simulation: this.simulationContract(),
      run: this.runContract(),
      telemetry: this.telemetryPayload(Date.now()),
      serverTime: Date.now(),
    });

    this.broadcast({ type: "player_joined", player: this.publicPlayer(player) }, server);
    this.broadcastScoreboard();
    this.startLoop();

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    const player = this.players.get(ws) ?? this.restoreSocket(ws);
    if (!player) {
      ws.close(1011, "missing_player_state");
      return;
    }

    if (typeof raw !== "string") {
      this.send(ws, { type: "error", error: "text_frames_only" });
      return;
    }

    this.rateWindowInboundBytes += raw.length;
    const message = parseClientMessage(raw);
    if (!message) {
      this.send(ws, { type: "error", error: "invalid_message" });
      return;
    }

    if (message.type === "ping") {
      this.send(ws, {
        type: "pong",
        id: message.id,
        serverReceivedAt: Date.now(),
        tick: this.tick,
      });
      return;
    }

    if (message.type === "reset") {
      this.resetRun(message.seed, player.playerId);
      return;
    }

    if (message.seq <= player.lastInputSeq) return;

    const input = normalizeVector(message.x, message.y);
    player.inputX = input.x;
    player.inputY = input.y;
    player.lastInputAt = Date.now();
    player.lastInputSeq = message.seq;
    player.dashQueued ||= message.dash;
    ws.serializeAttachment(player);
    this.rateWindowInputs += 1;
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    this.removePlayer(ws);
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    this.removePlayer(ws);
  }

  private startLoop(): void {
    if (this.loopTimer || this.players.size === 0) return;
    const now = performance.now();
    this.lastPumpAt = now;
    this.accumulatorMs = 0;
    this.activeRunStartedAt = Date.now();
    this.loopTimer = setInterval(() => this.pump(), SIMULATION_STEP_MS);
  }

  private stopLoop(): void {
    if (this.loopTimer) clearInterval(this.loopTimer);
    this.loopTimer = null;
    this.lastPumpAt = 0;
    this.accumulatorMs = 0;
  }

  private pump(): void {
    if (this.players.size === 0) {
      this.stopLoop();
      return;
    }

    const pumpStartedAt = performance.now();
    const elapsedMs = clamp(pumpStartedAt - this.lastPumpAt, 0, SIMULATION_STEP_MS * 10);
    this.lastPumpAt = pumpStartedAt;
    this.accumulatorMs += elapsedMs;
    this.pushSample(this.tickDriftSamples, Math.abs(elapsedMs - SIMULATION_STEP_MS));

    let steps = 0;
    while (this.accumulatorMs >= SIMULATION_STEP_MS && steps < MAX_CATCHUP_STEPS) {
      const stepStartedAt = performance.now();
      this.tick += 1;
      this.simulateStep(SIMULATION_STEP_MS / 1000, Date.now());
      steps += 1;
      this.accumulatorMs -= SIMULATION_STEP_MS;
      this.pushSample(this.tickDurationSamples, performance.now() - stepStartedAt);

      if (this.tick % SNAPSHOT_EVERY_TICKS === 0) {
        this.broadcastSnapshot();
      }
    }

    if (steps > 1) this.catchupSteps += steps - 1;

    if (this.accumulatorMs >= SIMULATION_STEP_MS) {
      const dropped = Math.floor(this.accumulatorMs / SIMULATION_STEP_MS);
      this.droppedTicks += dropped;
      this.accumulatorMs %= SIMULATION_STEP_MS;
    }
  }

  private simulateStep(dt: number, now: number): void {
    let scoreboardDirty = false;

    for (const [socket, player] of this.players) {
      if (socket.readyState !== WebSocket.OPEN) continue;

      if (now - player.lastInputAt > INPUT_LEASE_MS) {
        player.inputX = 0;
        player.inputY = 0;
        player.dashQueued = false;
      }

      player.vx += player.inputX * ACCELERATION * dt;
      player.vy += player.inputY * ACCELERATION * dt;

      const damping = Math.exp(-DRAG * dt);
      player.vx *= damping;
      player.vy *= damping;

      const baseSpeed = Math.hypot(player.vx, player.vy);
      if (baseSpeed > MAX_SPEED) {
        const scale = MAX_SPEED / baseSpeed;
        player.vx *= scale;
        player.vy *= scale;
      }

      if (player.dashQueued && now >= player.dashReadyAt) {
        let dx = player.inputX;
        let dy = player.inputY;
        if (Math.hypot(dx, dy) < 0.1) {
          const speed = Math.hypot(player.vx, player.vy);
          if (speed > 1) {
            dx = player.vx / speed;
            dy = player.vy / speed;
          }
        }
        if (Math.hypot(dx, dy) >= 0.1) {
          player.vx += dx * DASH_IMPULSE;
          player.vy += dy * DASH_IMPULSE;
          player.dashReadyAt = now + DASH_COOLDOWN_MS;
        }
      }
      player.dashQueued = false;

      player.x += player.vx * dt;
      player.y += player.vy * dt;
      this.resolveWorldBounds(player);

      for (let index = 0; index < this.pickups.length; index += 1) {
        const pickup = this.pickups[index];
        const radius = pickup.kind === "core" ? 34 : 29;
        if (Math.hypot(player.x - pickup.x, player.y - pickup.y) > radius) continue;

        player.combo = now - player.lastCollectAt <= COMBO_WINDOW_MS
          ? Math.min(5, player.combo + 1)
          : 1;
        player.lastCollectAt = now;
        const points = pickup.value * player.combo;
        player.score += points;
        const replacement = this.createPickup(pickup.id);
        this.pickups[index] = replacement;
        scoreboardDirty = true;

        this.broadcast({
          type: "collect",
          playerId: player.playerId,
          pickupId: pickup.id,
          pickupKind: pickup.kind,
          points,
          score: player.score,
          combo: player.combo,
          replacement,
          tick: this.tick,
        });
      }

      socket.serializeAttachment(player);
    }

    if (scoreboardDirty) this.broadcastScoreboard();
  }

  private resolveWorldBounds(player: PlayerState): void {
    if (player.x < PLAYER_RADIUS) {
      player.x = PLAYER_RADIUS;
      player.vx = Math.abs(player.vx) * 0.35;
    } else if (player.x > WORLD_WIDTH - PLAYER_RADIUS) {
      player.x = WORLD_WIDTH - PLAYER_RADIUS;
      player.vx = -Math.abs(player.vx) * 0.35;
    }

    if (player.y < PLAYER_RADIUS) {
      player.y = PLAYER_RADIUS;
      player.vy = Math.abs(player.vy) * 0.35;
    } else if (player.y > WORLD_HEIGHT - PLAYER_RADIUS) {
      player.y = WORLD_HEIGHT - PLAYER_RADIUS;
      player.vy = -Math.abs(player.vy) * 0.35;
    }
  }

  private broadcastSnapshot(): void {
    this.snapshotSequence += 1;
    this.rateWindowSnapshots += 1;
    const now = Date.now();
    const payload = {
      type: "snapshot",
      sequence: this.snapshotSequence,
      tick: this.tick,
      run: this.runContract(),
      players: this.publicPlayers(),
      telemetry: this.telemetryPayload(now),
      serverTime: now,
    };
    this.broadcast(payload);
  }

  private resetRun(seed: number, requestedBy: string): void {
    this.runSerial += 1;
    this.initializeRun(seed, true);

    for (const [socket, player] of this.players) {
      const spawn = this.spawnFor(player.playerId);
      player.x = spawn.x;
      player.y = spawn.y;
      player.vx = 0;
      player.vy = 0;
      player.inputX = 0;
      player.inputY = 0;
      player.lastInputAt = Date.now();
      player.lastInputSeq = 0;
      player.dashQueued = false;
      player.score = 0;
      player.combo = 1;
      player.lastCollectAt = 0;
      player.dashReadyAt = 0;
      player.runId = this.runId;
      player.runSeed = this.runSeed;
      socket.serializeAttachment(player);
    }

    this.tick = 0;
    this.snapshotSequence = 0;
    this.droppedTicks = 0;
    this.catchupSteps = 0;
    this.tickDurationSamples = [];
    this.tickDriftSamples = [];
    this.rateWindowStartedAt = Date.now();
    this.rateWindowInputs = 0;
    this.rateWindowSnapshots = 0;
    this.rateWindowInboundBytes = 0;
    this.rateWindowOutboundBytes = 0;
    this.rates = { inputsPerSec: 0, snapshotsPerSec: 0, inboundBytesPerSec: 0, outboundBytesPerSec: 0 };
    this.activeRunStartedAt = Date.now();
    this.lastPumpAt = performance.now();
    this.accumulatorMs = 0;

    this.broadcast({
      type: "run_reset",
      requestedBy,
      run: this.runContract(),
      players: this.publicPlayers(),
      pickups: this.pickups,
      simulation: this.simulationContract(),
      serverTime: Date.now(),
    });
    this.broadcastScoreboard();
  }

  private initializeRun(seed: number, preserveSerial: boolean): void {
    this.runSeed = normalizeSeed(seed);
    if (!preserveSerial) this.runSerial = Math.max(1, this.runSerial);
    this.runId = `${this.runSeed.toString(16).padStart(8, "0")}-${this.runSerial}`;
    this.rngState = this.runSeed;
    this.pickups = Array.from({ length: PICKUP_COUNT }, (_, index) => this.createPickup(index));
  }

  private nextRandom(): number {
    let x = this.rngState >>> 0;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.rngState = x >>> 0;
    return (this.rngState >>> 0) / 4294967296;
  }

  private createPickup(id: number): Pickup {
    const core = id % 9 === 0;
    return {
      id,
      x: 90 + this.nextRandom() * (WORLD_WIDTH - 180),
      y: 90 + this.nextRandom() * (WORLD_HEIGHT - 180),
      value: core ? 3 : 1,
      kind: core ? "core" : "shard",
    };
  }

  private createPlayer(playerId: string): PlayerState {
    const spawn = this.spawnFor(playerId);
    return {
      playerId,
      sessionId: crypto.randomUUID(),
      hue: hashString(`${playerId}:${this.runSeed}`) % 360,
      x: spawn.x,
      y: spawn.y,
      vx: 0,
      vy: 0,
      inputX: 0,
      inputY: 0,
      lastInputAt: Date.now(),
      lastInputSeq: 0,
      dashQueued: false,
      score: 0,
      combo: 1,
      lastCollectAt: 0,
      dashReadyAt: 0,
      runId: this.runId,
      runSeed: this.runSeed,
    };
  }

  private spawnFor(playerId: string): { x: number; y: number } {
    const a = hashString(`${this.runSeed}:${playerId}:x`) / 4294967296;
    const b = hashString(`${this.runSeed}:${playerId}:y`) / 4294967296;
    return {
      x: 180 + a * (WORLD_WIDTH - 360),
      y: 180 + b * (WORLD_HEIGHT - 360),
    };
  }

  private removePlayer(ws: WebSocket): void {
    const player = this.players.get(ws) ?? this.readAttachment(ws);
    if (!player) return;

    this.players.delete(ws);
    this.broadcast({
      type: "player_left",
      playerId: player.playerId,
      sessionId: player.sessionId,
    }, ws);
    this.broadcastScoreboard(ws);

    if (this.players.size === 0) this.stopLoop();
  }

  private restoreActiveSockets(): void {
    for (const socket of this.ctx.getWebSockets("player")) {
      const restored = this.readAttachment(socket);
      if (!restored) continue;
      if (this.players.size === 0 && restored.runSeed) {
        this.runSeed = normalizeSeed(restored.runSeed);
        this.runId = restored.runId || this.runId;
        const restoredSerial = Number(this.runId.split("-").at(-1));
        if (Number.isInteger(restoredSerial) && restoredSerial > 0) this.runSerial = restoredSerial;
        this.rngState = this.runSeed;
        this.pickups = Array.from({ length: PICKUP_COUNT }, (_, index) => this.createPickup(index));
      }
      this.players.set(socket, restored);
    }
  }

  private restoreSocket(ws: WebSocket): PlayerState | null {
    const player = this.readAttachment(ws);
    if (player) this.players.set(ws, player);
    return player;
  }

  private readAttachment(ws: WebSocket): PlayerState | null {
    const value = ws.deserializeAttachment();
    if (typeof value !== "object" || value === null) return null;
    const candidate = value as Partial<PlayerState>;

    if (
      typeof candidate.playerId !== "string" ||
      typeof candidate.sessionId !== "string" ||
      typeof candidate.hue !== "number" ||
      typeof candidate.x !== "number" ||
      typeof candidate.y !== "number" ||
      typeof candidate.vx !== "number" ||
      typeof candidate.vy !== "number" ||
      typeof candidate.inputX !== "number" ||
      typeof candidate.inputY !== "number" ||
      typeof candidate.lastInputAt !== "number" ||
      typeof candidate.lastInputSeq !== "number" ||
      typeof candidate.dashQueued !== "boolean" ||
      typeof candidate.score !== "number" ||
      typeof candidate.combo !== "number" ||
      typeof candidate.lastCollectAt !== "number" ||
      typeof candidate.dashReadyAt !== "number" ||
      typeof candidate.runId !== "string" ||
      typeof candidate.runSeed !== "number"
    ) {
      return null;
    }

    return candidate as PlayerState;
  }

  private publicPlayer(player: PlayerState) {
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
      ack: player.lastInputSeq,
    };
  }

  private publicPlayers() {
    return [...this.players.values()].map((player) => this.publicPlayer(player));
  }

  private broadcastScoreboard(exclude?: WebSocket): void {
    const scores = [...this.players.values()]
      .map((player) => ({
        playerId: player.playerId,
        hue: player.hue,
        score: player.score,
        combo: player.combo,
      }))
      .sort((a, b) => b.score - a.score || a.playerId.localeCompare(b.playerId));

    this.broadcast({ type: "scoreboard", scores }, exclude);
  }

  private simulationContract() {
    return {
      simulationHz: SIMULATION_HZ,
      simulationStepMs: SIMULATION_STEP_MS,
      snapshotHz: SNAPSHOT_HZ,
      inputLeaseMs: INPUT_LEASE_MS,
      maxCatchupSteps: MAX_CATCHUP_STEPS,
    };
  }

  private runContract() {
    return {
      id: this.runId,
      seed: this.runSeed,
      tick: this.tick,
    };
  }

  private telemetryPayload(now: number) {
    this.rollRateWindow(now);
    return {
      targetSimulationHz: SIMULATION_HZ,
      targetSnapshotHz: SNAPSHOT_HZ,
      activePlayers: this.players.size,
      tick: this.tick,
      snapshotSequence: this.snapshotSequence,
      tickDurationMsP50: percentile(this.tickDurationSamples, 0.5),
      tickDurationMsP95: percentile(this.tickDurationSamples, 0.95),
      tickDriftMsP50: percentile(this.tickDriftSamples, 0.5),
      tickDriftMsP95: percentile(this.tickDriftSamples, 0.95),
      droppedTicks: this.droppedTicks,
      catchupSteps: this.catchupSteps,
      activeDurationMs: this.activeRunStartedAt ? Math.max(0, now - this.activeRunStartedAt) : 0,
      ...this.rates,
    };
  }

  private rollRateWindow(now: number): void {
    const elapsed = now - this.rateWindowStartedAt;
    if (elapsed < 1000) return;
    const scale = 1000 / Math.max(1, elapsed);
    this.rates = {
      inputsPerSec: this.rateWindowInputs * scale,
      snapshotsPerSec: this.rateWindowSnapshots * scale,
      inboundBytesPerSec: this.rateWindowInboundBytes * scale,
      outboundBytesPerSec: this.rateWindowOutboundBytes * scale,
    };
    this.rateWindowStartedAt = now;
    this.rateWindowInputs = 0;
    this.rateWindowSnapshots = 0;
    this.rateWindowInboundBytes = 0;
    this.rateWindowOutboundBytes = 0;
  }

  private pushSample(target: number[], value: number): void {
    target.push(value);
    if (target.length > TELEMETRY_SAMPLE_LIMIT) target.splice(0, target.length - TELEMETRY_SAMPLE_LIMIT);
  }

  private broadcast(payload: unknown, exclude?: WebSocket): void {
    const encoded = JSON.stringify(payload);
    for (const socket of this.players.keys()) {
      if (socket === exclude || socket.readyState !== WebSocket.OPEN) continue;
      try {
        socket.send(encoded);
        this.rateWindowOutboundBytes += encoded.length;
      } catch {
        // Concurrent close is expected lifecycle noise, not a simulation failure.
      }
    }
  }

  private send(ws: WebSocket, payload: unknown): void {
    const encoded = JSON.stringify(payload);
    try {
      ws.send(encoded);
      this.rateWindowOutboundBytes += encoded.length;
    } catch {
      // Browser/socket lifecycle owns final delivery state.
    }
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
    if (url.pathname === "/api/ping") {
      return jsonResponse({
        ok: true,
        service: "cloudflare-multiplayer-lab",
        stage: "gate-4a-fixed-simulation-substrate",
        timestamp: new Date().toISOString(),
      });
    }
    if (url.pathname.startsWith("/api/")) return jsonResponse({ ok: false, error: "not_found" }, 404);
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
