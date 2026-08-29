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

    const input = normalizeVector(message.x, message.y);
    player.inputX = input.x;
    player.inputY = input.y;
    player.lastInputAt = Date.now();
    player.lastInputSeq = Math.max(player.lastInputSeq, message.seq);
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
      this.accumulatorMs % = SIMULATION_STEP_MS;
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
    this.pickups = Array.from({ length: PIKKUP_COUNT }, (_, index) => this.createPickup(index));
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
      hue: hashString(jek'«!ÛaŠÊî't¤€”€ÌØÀ°(€€€€€àèÍÁ…İ¸¹à°(€€€€€äèÍÁ…İ¸¹ä°(€€€€€Ùàè€À°(€€€€€Ùäè€À°(€€€€€¥¹ÁÕÑ`è€À°(€€€€€¥¹ÁÕÑdè€À°(€€€€€±…ÍÑ%¹ÁÕÑĞè…Ñ”¹¹½Ü ¤°(€€€€€±…ÍÑ%¹ÁÕÑM•Äè€À°(€€€€€‘…Í¡EÕ•Õ•è™…±Í”°(€€€€€Í½É”è€À°(€€€€€½µ‰¼è€Ä°(€€€€€±…ÍÑ½±±•ÑĞè€À°(€€€€€‘…Í¡I•…‘åĞè€À°(€€€€€ÉÕ¹%èÑ¡¥Ì¹ÉÕ¹%°(€€€€€ÉÕ¹M••èÑ¡¥Ì¹ÉÕ¹M••°(€€€ôì(€ô((€ÁÉ¥Ù…Ñ”ÍÁ…İ¹½È¡Á±…å•É%èÍÑÉ¥¹œ¤èìàè¹Õµ‰•Èìäè¹Õµ‰•Èôì(€€€½¹ÍĞ„€ô¡…Í¡MÑÉ¥¹œ¡€‘íÑ¡¥Ì¹ÉÕ¹M••‘ôè‘íÁ±…å•É%‘ôéá€¤€¼€ĞÈäĞäØÜÈäØì(€€€½¹ÍĞˆ€ô¡…Í¡MÑÉ¥¹œ¡€‘íÑ¡¥Ì¹ÉÕ¹M••‘ôè‘íÁ±…å•É%‘ôéå€¤€¼€ĞÈäĞäØÜÈäØì(€€€É•ÑÕÉ¸ì(€€€€€àè€ÄàÀ€¬„€¨€¡]=I1}]%Q €´€ÌØÀ¤°(€€€€€äè€ÄàÀ€¬ˆ€¨€¡]=I1}!%!P€´€ÌØÀ¤°(€€€ôì(€ô((€ÁÉ¥Ù…Ñ”É•µ½Ù•A±…å•È¡İÌè]•‰M½­•Ğ¤èÙ½¥ì(€€€½¹ÍĞÁ±…å•È€ôÑ¡¥Ì¹Á±…å•ÉÌ¹•Ğ¡İÌ¤€üüÑ¡¥Ì¹É•…‘ÑÑ…¡µ•¹Ğ¡İÌ¤ì(€€€¥˜€ …Á±…å•È¤É•ÑÕÉ¸ì((€€€Ñ¡¥Ì¹Á±…å•ÉÌ¹‘•±•Ñ”¡İÌ¤ì(€€€Ñ¡¥Ì¹‰É½…‘…ÍĞ¡ì(€€€€€ÑåÁ”è€‰Á±…å•É}±•™Ğˆ°(€€€€€Á±…å•É%èÁ±…å•È¹Á±…å•É%°(€€€€€Í•ÍÍ¥½¹%èÁ±…å•È¹Í•ÍÍ¥½¹%°(€€€ô°İÌ¤ì(€€€Ñ¡¥Ì¹‰É½…‘…ÍÑM½É•‰½…É¡İÌ¤ì((€€€¥˜€¡Ñ¡¥Ì¹Á±…å•ÉÌ¹Í¥é”€ôôô€À¤Ñ¡¥Ì¹ÍÑ½Á1½½À ¤ì(€ô((€ÁÉ¥Ù…Ñ”É•ÍÑ½É•Ñ¥Ù•M½­•ÑÌ ¤èÙ½¥ì(€€€™½È€¡½¹ÍĞÍ½­•Ğ½˜Ñ¡¥Ì¹Ñà¹•Ñ]•‰M½­•ÑÌ ‰Á±…å•Èˆ¤¤ì(€€€€€½¹ÍĞÉ•ÍÑ½É•€ôÑ¡¥Ì¹É•…‘ÑÑ…¡µ•¹Ğ¡Í½­•Ğ¤ì(€€€€€¥˜€ …É•ÍÑ½É•¤½¹Ñ¥¹Õ”ì(€€€€€¥˜€¡Ñ¡¥Ì¹Á±…å•ÉÌ¹Í¥é”€ôôô€À€˜˜É•ÍÑ½É•¹ÉÕ¹M••¤ì(€€€€€€€Ñ¡¥Ì¹ÉÕ¹M••€ô¹½Éµ…±¥é•M••¡É•ÍÑ½É•¹ÉÕ¹M••¤ì(€€€€€€€Ñ¡¥Ì¹ÉÕ¹%€ôÉ•ÍÑ½É•¹ÉÕ¹%ñğÑ¡¥Ì¹ÉÕ¹%ì(€€€€€€€½¹ÍĞÉ•ÍÑ½É•‘M•É¥…°€ô9Õµ‰•È¡Ñ¡¥Ì¹ÉÕ¹%¹ÍÁ±¥Ğ ˆ´ˆ¤¹…Ğ ´Ä¤¤ì(€€€€€€€¥˜€¡9Õµ‰•È¹¥Í%¹Ñ••È¡É•ÍÑ½É•‘M•É¥…°¤€˜˜É•ÍÑ½É•‘M•É¥…°€ø€À¤Ñ¡¥Ì¹ÉÕ¹M•É¥…°€ôÉ•ÍÑ½É•‘M•É¥…°ì(€€€€€€€Ñ¡¥Ì¹É¹MÑ…Ñ”€ôÑ¡¥Ì¹ÉÕ¹M••ì(€€€€€€€Ñ¡¥Ì¹Á¥­ÕÁÌ€ôÉÉ…ä¹™É½´¡ì±•¹Ñ èA%--UA}=U9Pô°€¡|°¥¹‘•à¤€ôøÑ¡¥Ì¹É•…Ñ•A¥­ÕÀ¡¥¹‘•à¤¤ì(€€€€€ô(€€€€€Ñ¡¥Ì¹Á±…å•ÉÌ¹Í•Ğ¡Í½­•Ğ°É•ÍÑ½É•¤ì(€€€ô(€ô((€ÁÉ¥Ù…Ñ”É•ÍÑ½É•M½­•Ğ¡İÌè]•‰M½­•Ğ¤èA±…å•ÉMÑ…Ñ”ğ¹Õ±°ì(€€€½¹ÍĞÁ±…å•È€ôÑ¡¥Ì¹É•…‘ÑÑ…¡µ•¹Ğ¡İÌ¤ì(€€€¥˜€¡Á±…å•È¤Ñ¡¥Ì¹Á±…å•ÉÌ¹Í•Ğ¡İÌ°Á±…å•È¤ì(€€€É•ÑÕÉ¸Á±…å•Èì(€ô((€ÁÉ¥Ù…Ñ”É•…‘ÑÑ…¡µ•¹Ğ¡İÌè]•‰M½­•Ğ¤èA±…å•ÉMÑ…Ñ”ğ¹Õ±°ì(€€€½¹ÍĞÙ…±Õ”€ôİÌ¹‘•Í•É¥…±¥é•ÑÑ…¡µ•¹Ğ ¤ì(€€€¥˜€¡ÑåÁ•½˜Ù…±Õ”€„ôô€‰½‰©•ĞˆñğÙ…±Õ”€ôôô¹Õ±°¤É•ÑÕÉ¸¹Õ±°ì(€€€½¹ÍĞ…¹‘¥‘…Ñ”€ôÙ…±Õ”…ÌA…ÉÑ¥…°ñA±…å•ÉMÑ…Ñ”øì((€€€¥˜€ (€€€€€ÑåÁ•½˜…¹‘¥‘…Ñ”¹Á±…å•É%€„ôô€‰ÍÑÉ¥¹œˆñğ(€€€€€ÑåÁ•½˜…¹‘¥‘…Ñ”¹Í•ÍÍ¥½¹%€„ôô€‰ÍÑÉ¥¹œˆñğ(€€€€€ÑåÁ•½˜…¹‘¥‘…Ñ”¹¡Õ”€„ôô€‰¹Õµ‰•Èˆñğ(€€€€€ÑåÁ•½˜…¹‘¥‘…Ñ”¹à€„ôô€‰¹Õµ‰•Èˆñğ(€€€€€ÑåÁ•½˜…¹‘¥‘…Ñ”¹ä€„ôô€‰¹Õµ‰•Èˆñğ(€€€€€ÑåÁ•½˜…¹‘¥‘…Ñ”¹Ùà€„ôô€‰¹Õµ‰•Èˆñğ(€€€€€ÑåÁ•½˜…¹‘¥‘…Ñ”¹Ùä€„ôô€‰¹Õµ‰•Èˆñğ(€€€€€ÑåÁ•½˜…¹‘¥‘…Ñ”¹¥¹ÁÕÑ`€„ôô€‰¹Õµ‰•Èˆñğ(€€€€€ÑåÁ•½˜…¹‘¥‘…Ñ”¹¥¹ÁÕÑd€„ôô€‰¹Õµ‰•Èˆñğ(€€€€€ÑåÁ•½˜…¹‘¥‘…Ñ”¹±…ÍÑ%¹ÁÕÑĞ€„ôô€‰¹Õµ‰•Èˆñğ(€€€€€ÑåÁ•½˜…¹‘¥‘…Ñ”¹±…ÍÑ%¹ÁÕÑM•Ä€„ôô€‰¹Õµ‰•Èˆñğ(€€€€€ÑåÁ•½˜…¹‘¥‘…Ñ”¹‘…Í¡EÕ•Õ•€„ôô€‰‰½½±•…¸ˆñğ(€€€€€ÑåÁ•½˜…¹‘¥‘…Ñ”¹Í½É”€„ôô€‰¹Õµ‰•Èˆñğ(€€€€€ÑåÁ•½˜…¹‘¥‘…Ñ”¹½µ‰¼€„ôô€‰¹Õµ‰•Èˆñğ(€€€€€ÑåÁ•½˜…¹‘¥‘…Ñ”¹±…ÍÑ½±±•ÑĞ€„ôô€‰¹Õµ‰•Èˆñğ(€€€€€ÑåÁ•½˜…¹‘¥‘…Ñ”¹‘…Í¡I•…‘åĞ€„ôô€‰¹Õµ‰•Èˆñğ(€€€€€ÑåÁ•½˜…¹‘¥‘…Ñ”¹ÉÕ¹%€„ôô€‰ÍÑÉ¥¹œˆñğ(€€€€€ÑåÁ•½˜…¹‘¥‘…Ñ”¹ÉÕ¹M••€„ôô€‰¹Õµ‰•Èˆ(€€€€¤ì(€€€€€É•ÑÕÉ¸¹Õ±°ì(€€€ô((€€€É•ÑÕÉ¸…¹‘¥‘…Ñ”…ÌA±…å•ÉMÑ…Ñ”ì(€ô((€ÁÉ¥Ù…Ñ”ÁÕ‰±¥A±…å•È¡Á±…å•ÈèA±…å•ÉMÑ…Ñ”¤ì(€€€É•ÑÕÉ¸ì(€€€€€Á±…å•É%èÁ±…å•È¹Á±…å•É%°(€€€€€Í•ÍÍ¥½¹%èÁ±…å•È¹Í•ÍÍ¥½¹%°(€€€€€¡Õ”èÁ±…å•È¹¡Õ”°(€€€€àèÁ±…å•È¹à°(€€€€äèÁ±…å•È¹ä°(€€€€ÙàèÁ±…å•È¹Ùà°(€€€€€ÙäèÁ±…å•È¹Ùä°(€€€€€Í½É”èÁ±…å•È¹Í½É”°(€€€€€½µ‰¼èÁ±…å•È¹½µ‰¼°(€€€€€½µ‰½áÁ¥É•ÍĞèÁ±…å•È¹±…ÍÑ½±±•ÑĞ€¬=5	=}]%9=]}5L°(€€€€€‘…Í¡I•…‘åĞèÁ±…å•È¹‘…Í¡I•…‘åĞ°(€€€€€…¬èÁ±…å•È¹±…ÍÑ%¹ÁÕÑM•Ä°(€€€ôì(€ô((€ÁÉ¥Ù…Ñ”ÁÕ‰±¥A±…å•ÉÌ ¤ì(€€€É•ÑÕÉ¸l¸¸¹Ñ¡¥Ì¹Á±…å•ÉÌ¹Ù…±Õ•Ì ¥t¹µ…À ¡Á±…å•È¤€ôøÑ¡¥Ì¹ÁÕ‰±¥A±…å•È¡Á±…å•È¤¤ì(€ô((€ÁÉ¥Ù…Ñ”‰É½…‘…ÍÑM½É•‰½…É¡•á±Õ‘”üè]•‰M½­•Ğ¤èÙ½¥ì(€€€½¹ÍĞÍ½É•Ì€ôl¸¸¹Ñ¡¥Ì¹Á±…å•ÉÌ¹Ù…±Õ•Ì ¥t(€€€€¹µ…À ¡Á±…å•È¤€ôø€¡ì(€€€€€Á±…å•É%èÁ±…å•È¹Á±…å•É%°(€€€€€¡Õ”èÁ±…å•È¹¡Õ”°(€€€€€Í½É”èÁ±…å•È¹Í½É”°(€€€€€½µ‰¼èÁ±…å•È¹½µ‰¼°(€€€ô¤¤(€€€€¹Í½ÉĞ ¡„°ˆ¤€ôøˆ¹Í½É”€´„¹Í½É”ñğ„¹Á±…å•É%¹±½…±•½µÁ…É”¡ˆ¹Á±…å•É%¤¤ì((€€€Ñ¡¥Ì¹‰É½…‘…ÍĞ¡ìÑåÁ”è€‰Í½É•‰½…Éˆ°Í½É•Ìô°•á±Õ‘”¤ì(€ô((€ÁÉ¥Ù…Ñ”Í¥µÕ±…Ñ¥½¹½¹ÑÉ…Ğ ¤ì(€€€É•ÑÕÉ¸ì(€€€€€Í¥µÕ±…Ñ¥½¹!èèM%5U1Q%=9}!h°(€€€€€Í¥µÕ±…Ñ¥½¹MÑ•Á5ÌèM%5U1Q%=9}MQA}5L°(€€€€€Í¹…ÁÍ¡½Ñ!èèM9AM!=Q}!h°(€€€€€¥¹ÁÕÑ1•…Í•5Ìè%9AUQ}1M}5L°(€€€€€µ…á…Ñ¡ÕÁMÑ•ÁÌè5a}Q!UA}MQAL°(€€€ôì(€ô((€ÁÉ¥Ù…Ñ”ÉÕ¹½¹ÑÉ…Ğ ¤ì(€€€É•ÑÕÉ¸ì(€€€€€¥èÑ¡¥Ì¹ÉÕ¹%°(€€€€€Í••èÑ¡¥Ì¹ÉÕ¹M••°(€€€€€Ñ¥¬èÑ¡¥Ì¹Ñ¥¬°(€€€ôì(€ô((€ÁÉ¥Ù…Ñ”Ñ•±•µ•ÑÉåA…å±½…¡¹½Üè¹Õµ‰•È¤ì(€€€Ñ¡¥Ì¹É½±±I…Ñ•]¥¹‘½Ü¡¹½Ü¤ì(€€€É•ÑÕÉ¸ì(€€€€€Ñ…É•ÑM¥µÕ±…Ñ¥½¹!èèM%5U1Q%=9}!h°(€€€€€Ñ…É•ÑM¹…ÁÍ¡½Ñ!èèM9AM!=Q}!h°(€€€€€…Ñ¥Ù•A±…å•ÉÌèÑ¡¥Ì¹Á±…å•ÉÌ¹Í¥é”°(€€€€€Ñ¥¬èÑ¡¥Ì¹Ñ¥¬°(€€€€€Í¹…ÁÍ¡½ÑM•ÅÕ•¹”èÑ¡¥Ì¹Í¹…ÁÍ¡½ÑM•ÅÕ•¹”°(€€€€€Ñ¥­ÕÉ…Ñ¥½¹5Í@ÔÀèÁ•É•¹Ñ¥±”¡Ñ¡¥Ì¹Ñ¥­ÕÉ…Ñ¥½¹M…µÁ±•Ì°€À¸Ô¤°(€€€€€Ñ¥­ÕÉ…Ñ¥½¹5Í@äÔèÁ•É•¹Ñ¥±”¡Ñ¡¥Ì¹Ñ¥­ÕÉ…Ñ¥½¹M…µÁ±•Ì°€À¸äÔ¤°(€€€€€Ñ¥­É¥™Ñ5Í@ÔÀèÁ•É•¹Ñ¥±”¡Ñ¡¥Ì¹Ñ¥­É¥™ÑM…µÁ±•Ì°€À¸Ô¤°(€€€€€Ñ¥­É¥™Ñ5Í@äÔèÁ•É•¹Ñ¥±”¡Ñ¡¥Ì¹Ñ¥­É¥™ÑM…µÁ±•Ì°€À¸äÔ¤°(€€€€€‘É½ÁÁ•‘Q¥­ÌèÑ¡¥Ì¹‘É½ÁÁ•‘Q¥­Ì°(€€€€€…Ñ¡ÕÁMÑ•ÁÌèÑ¡¥Ì¹…Ñ¡ÕÁMÑ•ÁÌ°(€€€€€…Ñ¥Ù•ÕÉ…Ñ¥½¹5ÌèÑ¡¥Ì¹…Ñ¥Ù•IÕ¹MÑ…ÉÑ•‘Ğ€ü5…Ñ ¹µ…à À°¹½Ü€´Ñ¡¥Ì¹…Ñ¥Ù•IÕ¹MÑ…ÉÑ•‘Ğ¤€è€À°(€€€€€€¸¸¹Ñ¡¥Ì¹É…Ñ•Ì°(€€€ôì(€ô((€ÁÉ¥Ù…Ñ”É½±±I…Ñ•]¥¹‘½Ü¡¹½Üè¹Õµ‰•È¤èÙ½¥ì(€€€½¹ÍĞ•±…ÁÍ•€ô¹½Ü€´Ñ¡¥Ì¹É…Ñ•]¥¹‘½İMÑ…ÉÑ•‘Ğì(€€€¥˜€¡•±…ÁÍ•€ğ€ÄÀÀÀ¤É•ÑÕÉ¸ì(€€€½¹ÍĞÍ…±”€ô€ÄÀÀÀ€¼5…Ñ ¹µ…à Ä°•±…ÁÍ•¤ì(€€€Ñ¡¥Ì¹É…Ñ•Ì€ôì(€€€€€¥¹ÁÕÑÍA•ÉM•ŒèÑ¡¥Ì¹É…Ñ•]¥¹‘½İ%¹ÁÕÑÌ€¨Í…±”°(€€€€€Í¹…ÁÍ¡½ÑÍA•ÉM•ŒèÑ¡¥Ì¹É…Ñ•]¥¹‘½İM¹…ÁÍ¡½ÑÌ€¨Í…±”°(€€€€€¥¹‰½Õ¹‘	åÑ•ÍA•ÉM•ŒèÑ¡¥Ì¹É…Ñ•]¥¹‘½İ%¹‰½Õ¹‘	åÑ•Ì€¨Í…±”°(€€€€€½ÕÑ‰½Õ¹‘	åÑ•ÍA•ÉM•ŒèÑ¡¥Ì¹É…Ñ•]¥¹‘½İ=ÕÑ‰½Õ¹‘	åÑ•Ì€¨Í…±”°(€€€ôì(€€€Ñ¡¥Ì¹É…Ñ•]¥¹‘½İMÑ…ÉÑ•‘Ğ€ô¹½Üì(€€€Ñ¡¥Ì¹É…Ñ•]¥¹‘½İ%¹ÁÕÑÌ€ô€Àì(€€€Ñ¡¥Ì¹É…Ñ•]¥¹‘½İM¹…ÁÍ¡½ÑÌ€ô€Àì(€€€Ñ¡¥Ì¹É…Ñ•]¥¹‘½İ%¹‰½Õ¹‘	åÑ•Ì€ô€Àì(€€€Ñ¡¥Ì¹É…Ñ•]¥¹‘½İ=ÕÑ‰½Õ¹‘	åÑ•Ì€ô€Àì(€ô((€ÁÉ¥Ù…Ñ”ÁÕÍ¡M…µÁ±”¡Ñ…É•Ğè¹Õµ‰•Émt°Ù…±Õ”è¹Õµ‰•È¤èÙ½¥ì(€€€Ñ…É•Ğ¹ÁÕÍ ¡Ù…±Õ”¤ì(€€€¥˜€¡Ñ…É•Ğ¹±•¹Ñ €øQ15QIe}M5A1}1%5%P¤Ñ…É•Ğ¹ÍÁ±¥” À°Ñ…É•Ğ¹±•¹Ñ €´Q15QIe}M5A1}1%5%P¤ì(€ô((€ÁÉ¥Ù…Ñ”‰É½…‘…ÍĞ¡Á…å±½…èÕ¹­¹½İ¸°•á±Õ‘”üè]•‰M½­•Ğ¤èÙ½¥ì(€€€½¹ÍĞ•¹½‘•€ô)M=8¹ÍÑÉ¥¹¥™ä¡Á…å±½…¤ì(€€€™½È€¡½¹ÍĞÍ½­•Ğ½˜Ñ¡¥Ì¹Á±…å•ÉÌ¹­•åÌ ¤¤ì(€€€€€¥˜€¡Í½­•Ğ€ôôô•á±Õ‘”ñğÍ½­•Ğ¹É•…‘åMÑ…Ñ”€„ôô]•‰M½­•Ğ¹=A8¤½¹Ñ¥¹Õ”ì(€€€€€ÑÉäì(€€€€€€€Í½­•Ğ¹Í•¹¡•¹½‘•¤ì(€€€€€€€Ñ¡¥Ì¹É…Ñ•]¥¹‘½İ=ÕÑ‰½Õ¹‘	åÑ•Ì€¬ô•¹½‘•¹±•¹Ñ ì(€€€€€ô…Ñ ì(€€€€€€€€¼¼½¹ÕÉÉ•¹Ğ±½Í”¥Ì•áÁ•Ñ•±¥™•å±”¹½¥Í”°¹½Ğ„Í¥µÕ±…Ñ¥½¸™…¥±ÕÉ”¸(€€€€€ô(€€€ô(€ô((€ÁÉ¥Ù…Ñ”Í•¹¡İÌè]•‰M½­•Ğ°Á…å±½…èÕ¹­¹½İ¸¤èÙ½¥ì(€€€½¹ÍĞ•¹½‘•€ô)M=8¹ÍÑÉ¥¹¥™ä¡Á…å±½…¤ì(€€€ÑÉäì(€€€€€İÌ¹Í•¹¡•¹½‘•¤ì(€€€€€Ñ¡¥Ì¹É…Ñ•]¥¹‘½İ=ÕÑ‰½Õ¹‘	åÑ•Ì€¬ô•¹½‘•¹±•¹Ñ ì(€€€ô…Ñ ì(€€€€€€¼¼	É½İÍ•È½Í½­•Ğ±¥™•å±”½İ¹Ì™¥¹…°‘•±¥Ù•ÉäÍÑ…Ñ”¸(€€€ô(€ô)ô()…Íå¹Œ™Õ¹Ñ¥½¸İ½É±‘]•‰M½­•ÑI•ÍÁ½¹Í”¡É•ÅÕ•ÍĞèI•ÅÕ•ÍĞ°•¹Øè¹Ø¤èAÉ½µ¥Í”ñI•ÍÁ½¹Í”øì(€¥˜€¡É•ÅÕ•ÍĞ¹¡•…‘•ÉÌ¹•Ğ ‰UÁÉ…‘”ˆ¤ü¹Ñ½1½İ•É…Í” ¤€„ôô€‰İ•‰Í½­•Ğˆ¤É•ÑÕÉ¸İ•‰Í½­•ÑUÁÉ…‘•I•ÅÕ¥É• ¤ì(€½¹ÍĞİ½É±€ô•¹Ø¹]=I1¹•Ğ¡•¹Ø¹]=I1¹¥‘É½µ9…µ” ‰µ…¥¸ˆ¤¤ì(€É•ÑÕÉ¸İ½É±¹™•Ñ ¡É•ÅÕ•ÍĞ¤ì)ô()•áÁ½ÉĞ‘•™…Õ±Ğì(€…Íå¹Œ™•Ñ ¡É•ÅÕ•ÍĞèI•ÅÕ•ÍĞ°•¹Øè¹Ø¤èAÉ½µ¥Í”ñI•ÍÁ½¹Í”øì(€€€½¹ÍĞÕÉ°€ô¹•ÜUI0¡É•ÅÕ•ÍĞ¹ÕÉ°¤ì(€€€¥˜€¡ÕÉ°¹Á…Ñ¡¹…µ”€ôôô€ˆ½İÌˆ¤É•ÑÕÉ¸‘¥É•Ñ]•‰M½­•ÑI•ÍÁ½¹Í”¡É•ÅÕ•ÍĞ¤ì(€€€¥˜€¡ÕÉ°¹Á…Ñ¡¹…µ”€ôôô€ˆ½…µ”½İÌˆ¤É•ÑÕÉ¸İ½É±‘]•‰M½­•ÑI•ÍÁ½¹Í”¡É•ÅÕ•ÍĞ°•¹Ø¤ì(€€€¥˜€¡ÕÉ°¹Á…Ñ¡¹…µ”€ôôô€ˆ½…Á¤½Á¥¹œˆ¤ì(€€€€€É•ÑÕÉ¸©Í½¹I•ÍÁ½¹Í”¡ì(€€€€€€€½¬èÑÉÕ”°(€€€€€€€Í•ÉÙ¥”è€‰±½Õ‘™±…É”µµÕ±Ñ¥Á±…å•Èµ±…ˆˆ°(€€€€€€€ÍÑ…”è€‰…Ñ”´Ñ„µ™¥á•µÍ¥µÕ±…Ñ¥½¸µÍÕ‰ÍÑÉ…Ñ”ˆ°(€€€€€€€Ñ¥µ•ÍÑ…µÀè¹•Ü…Ñ” ¤¹Ñ½%M=MÑÉ¥¹œ ¤°(€€€€€ô¤ì(€€€ô(€€€¥˜€¡ÕÉ°¹Á…Ñ¡¹…µ”¹ÍÑ…ÉÑÍ]¥Ñ  ˆ½…Á¤¼ˆ¤¤É•ÑÕÉ¸©Í½¹I•ÍÁ½¹Í”¡ì½¬è™…±Í”°•ÉÉ½Èè€‰¹½Ñ}™½Õ¹ˆô°€ĞÀĞ¤ì(€€€É•ÑÕÉ¸•¹Ø¹MMQL¹™•Ñ ¡É•ÅÕ•ÍĞ¤ì(€ô°)ôÍ…Ñ¥Í™¥•ÌáÁ½ÉÑ•‘!…¹‘±•Èñ¹Øøì(