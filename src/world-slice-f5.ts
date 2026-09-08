import { DurableObject } from "cloudflare:workers";
import { b3, BOX3D_RUNTIME } from "./box3d-runtime";
import {
  F5_INPUT_BATCH_SIZE,
  F5_MAX_FUTURE_TICKS,
  F5_PREDICTION_LEAD_TICKS,
  F5_PROTOCOL_REVISION,
  F5ScheduledInputBuffer,
  parseF5ClientMessage,
  type F5ConsumedInput,
} from "./ws0-f5-protocol";

export const F5_SERVER_REVISION = "ws0-f5-authority-v1";

const SIMULATION_HZ = 60;
const STEP_MS = 1000 / SIMULATION_HZ;
const SUBSTEPS = 4;
const MAX_CATCHUP_STEPS = 4;
const SNAPSHOT_HZ = 10;
const SNAPSHOT_EVERY_TICKS = SIMULATION_HZ / SNAPSHOT_HZ;
const PROTOCOL_START_DELAY_TICKS = 90;
const MAX_PLAYERS = 2;
const PROP_COUNT = 12;
const PLAYER_SPEED = 5.2;
const PLAYER_ACCELERATION = 28;
const PLAYER_DECELERATION = 36;
const PLAYER_ID_PATTERN = /^[A-Za-z0-9_-]{1,24}$/;
const PLAYER_STARTS: Vec3[] = [[-6.5, 0.82, -1.4], [6.5, 0.82, 0]];

type WorldId = ReturnType<typeof b3.b3CreateWorld>;
type BodyId = ReturnType<typeof b3.b3CreateBody>;
type Vec3 = [number, number, number];
type Quat = [number, number, number, number];

type F5Prop = { id: string; body: BodyId; initial: Vec3 };
type F5Player = {
  playerId: string;
  sessionId: string;
  slot: number;
  body: BodyId;
  ready: boolean;
  input: F5ScheduledInputBuffer;
};

type F5SceneSample = {
  finite: boolean;
  players: Array<{
    id: string;
    sessionId: string;
    slot: number;
    position: Vec3;
    rotation: Quat;
    velocity: Vec3;
  }>;
  props: Array<{ id: string; position: Vec3; rotation: Quat }>;
};

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "cache-control": "no-store", "content-type": "application/json; charset=utf-8" },
  });
}

function createStaticBox(world: WorldId, position: Vec3, halfExtents: Vec3): void {
  const def = b3.b3DefaultBodyDef();
  def.position = position;
  const body = b3.b3CreateBody(world, def);
  b3.b3CreateBoxShape(body, b3.b3DefaultShapeDef(), halfExtents[0], halfExtents[1], halfExtents[2]);
}

function moveToward2(cx: number, cz: number, tx: number, tz: number, maxDelta: number): [number, number] {
  const dx = tx - cx;
  const dz = tz - cz;
  const distance = Math.hypot(dx, dz);
  if (distance <= maxDelta || distance < 1e-9) return [tx, tz];
  const scale = maxDelta / distance;
  return [cx + dx * scale, cz + dz * scale];
}

export class WorldSliceF5 extends DurableObject<Env> {
  private world: WorldId | null = null;
  private props: F5Prop[] = [];
  private readonly players = new Map<WebSocket, F5Player>();
  private loopTimer: ReturnType<typeof setInterval> | null = null;
  private lastPumpAt = 0;
  private accumulatorMs = 0;
  private tick = 0;
  private snapshotSequence = 0;
  private protocolStartTick: number | null = null;
  private droppedTicks = 0;
  private catchupSteps = 0;
  private failure: string | null = null;
  private resetting = false;

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return json({
        ok: this.failure === null,
        revision: F5_SERVER_REVISION,
        protocolRevision: F5_PROTOCOL_REVISION,
        boundaryTick: this.tick,
        protocolStartTick: this.protocolStartTick,
        players: this.players.size,
        active: this.loopTimer !== null,
        failure: this.failure,
      });
    }
    return this.acceptPlayer(request);
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    const player = this.players.get(ws);
    if (!player) {
      try { ws.close(1011, "missing_f5_player"); } catch { /* lifecycle race */ }
      return;
    }
    if (typeof raw !== "string") {
      this.send(ws, { type: "f5_error", error: "text_frames_only" });
      return;
    }

    const message = parseF5ClientMessage(raw);
    if (!message) {
      this.send(ws, { type: "f5_error", error: "invalid_message" });
      return;
    }

    if (message.type === "f5_ping") {
      this.send(ws, {
        type: "f5_pong",
        id: message.id,
        boundaryTick: this.tick,
        protocolStartTick: this.protocolStartTick,
        serverTime: Date.now(),
      });
      return;
    }

    if (message.type === "f5_ready") {
      player.ready = true;
      this.send(ws, { type: "f5_ready_ack", boundaryTick: this.tick });
      this.maybeStartProtocol();
      return;
    }

    if (this.protocolStartTick === null) {
      this.send(ws, { type: "f5_batch_ack", batchSeq: message.batchSeq, batchStatus: "protocol_not_scheduled", records: [] });
      return;
    }

    const acceptance = player.input.acceptBatch(message, this.tick, this.protocolStartTick, F5_MAX_FUTURE_TICKS);
    const accepted = acceptance.records.filter((record) => record.status === "accepted");
    if (accepted.length) {
      const payload = {
        type: "f5_peer_records",
        protocolRevision: F5_PROTOCOL_REVISION,
        senderSessionId: player.sessionId,
        senderPlayerId: player.playerId,
        batchSeq: message.batchSeq,
        records: accepted.map(({ targetTick, x, z }) => ({ targetTick, x, z })),
        relayBoundaryTick: this.tick,
        serverTime: Date.now(),
      };
      for (const [peerSocket] of this.players) {
        if (peerSocket !== ws) this.send(peerSocket, payload);
      }
    }

    this.send(ws, {
      type: "f5_batch_ack",
      boundaryTick: this.tick,
      protocolStartTick: this.protocolStartTick,
      ...acceptance,
      stats: player.input.stats(),
    });
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    this.removePlayerAndReset(ws, "peer_left_restart_required");
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    this.removePlayerAndReset(ws, "peer_error_restart_required");
  }

  private acceptPlayer(request: Request): Response {
    const url = new URL(request.url);
    const playerId = (url.searchParams.get("player") ?? "").trim();
    if (!PLAYER_ID_PATTERN.test(playerId)) return json({ ok: false, error: "invalid_player" }, 400);
    if (this.protocolStartTick !== null || this.loopTimer) return json({ ok: false, error: "f5_run_already_active" }, 409);
    if (this.players.size >= MAX_PLAYERS) return json({ ok: false, error: "f5_probe_full" }, 503);

    if (!this.world) this.createWorld();
    if (!this.world) return json({ ok: false, error: "world_not_ready" }, 500);

    const [client, server] = Object.values(new WebSocketPair()) as [WebSocket, WebSocket];
    const slot = this.players.size;
    const body = this.createPlayerBody(PLAYER_STARTS[slot]);
    const player: F5Player = {
      playerId,
      sessionId: crypto.randomUUID(),
      slot,
      body,
      ready: false,
      input: new F5ScheduledInputBuffer(),
    };

    this.ctx.acceptWebSocket(server, ["ws0-f5-player"]);
    this.players.set(server, player);
    this.send(server, {
      type: "f5_welcome",
      revision: F5_SERVER_REVISION,
      protocolRevision: F5_PROTOCOL_REVISION,
      selfSessionId: player.sessionId,
      slot,
      waitingForPeer: this.players.size < MAX_PLAYERS,
      simulation: this.simulationContract(),
      state: this.snapshotState(),
      serverTime: Date.now(),
    });
    this.broadcast({
      type: "f5_roster",
      boundaryTick: this.tick,
      players: this.snapshotState().players.map(({ id, sessionId, slot }) => ({ id, sessionId, slot })),
    });
    return new Response(null, { status: 101, webSocket: client });
  }

  private maybeStartProtocol(): void {
    if (this.protocolStartTick !== null || this.players.size !== MAX_PLAYERS) return;
    if ([...this.players.values()].some((player) => !player.ready)) return;

    this.protocolStartTick = this.tick + PROTOCOL_START_DELAY_TICKS;
    this.broadcast({
      type: "f5_start",
      revision: F5_SERVER_REVISION,
      protocolRevision: F5_PROTOCOL_REVISION,
      boundaryTick: this.tick,
      protocolStartTick: this.protocolStartTick,
      simulation: this.simulationContract(),
      state: this.snapshotState(),
      serverTime: Date.now(),
    });
    this.startLoop();
  }

  private createWorld(): void {
    this.destroyWorld();
    const def = b3.b3DefaultWorldDef();
    def.gravity = [0, -20, 0];
    this.world = b3.b3CreateWorld(def);
    this.tick = 0;
    this.snapshotSequence = 0;
    this.protocolStartTick = null;
    this.droppedTicks = 0;
    this.catchupSteps = 0;
    this.failure = null;

    createStaticBox(this.world, [0, -0.5, 0], [10, 0.5, 10]);
    createStaticBox(this.world, [-9.5, 1.5, 0], [0.5, 2, 10]);
    createStaticBox(this.world, [9.5, 1.5, 0], [0.5, 2, 10]);
    createStaticBox(this.world, [0, 1.5, -9.5], [10, 2, 0.5]);
    createStaticBox(this.world, [0, 1.5, 9.5], [10, 2, 0.5]);

    this.props = [];
    for (let index = 0; index < PROP_COUNT; index += 1) {
      const col = index % 4;
      const row = Math.floor(index / 4);
      const initial: Vec3 = [(col - 1.5) * 1.05, 0.46, (row - 1) * 1.05];
      const bodyDef = b3.b3DefaultBodyDef();
      bodyDef.type = b3.b3BodyType.b3_dynamicBody;
      bodyDef.position = initial;
      bodyDef.linearDamping = 0.08;
      bodyDef.angularDamping = 0.12;
      const body = b3.b3CreateBody(this.world, bodyDef);
      const shapeDef = b3.b3DefaultShapeDef();
      shapeDef.density = 22;
      shapeDef.baseMaterial.friction = 0.72;
      shapeDef.baseMaterial.restitution = 0.04;
      b3.b3CreateBoxShape(body, shapeDef, 0.46, 0.46, 0.46);
      this.props.push({ id: `prop-${index}`, body, initial });
    }
  }

  private createPlayerBody(start: Vec3): BodyId {
    if (!this.world) throw new Error("world_not_ready");
    const bodyDef = b3.b3DefaultBodyDef();
    bodyDef.type = b3.b3BodyType.b3_dynamicBody;
    bodyDef.position = start;
    bodyDef.linearDamping = 0.3;
    bodyDef.angularDamping = 8;
    const body = b3.b3CreateBody(this.world, bodyDef);
    const shapeDef = b3.b3DefaultShapeDef();
    shapeDef.density = 80;
    shapeDef.baseMaterial.friction = 0.8;
    shapeDef.baseMaterial.restitution = 0.02;
    b3.b3CreateCapsuleShape(body, shapeDef, { center1: [0, -0.45, 0], center2: [0, 0.45, 0], radius: 0.35 });
    b3.b3Body_SetMotionLocks(body, {
      linearX: false,
      linearY: false,
      linearZ: false,
      angularX: true,
      angularY: true,
      angularZ: true,
    });
    return body;
  }

  private startLoop(): void {
    if (this.loopTimer || !this.world) return;
    this.lastPumpAt = performance.now();
    this.accumulatorMs = 0;
    this.loopTimer = setInterval(() => this.pump(), STEP_MS);
  }

  private stopLoop(): void {
    if (this.loopTimer) clearInterval(this.loopTimer);
    this.loopTimer = null;
    this.lastPumpAt = 0;
    this.accumulatorMs = 0;
  }

  private pump(): void {
    if (!this.world || this.failure) {
      this.stopLoop();
      return;
    }

    try {
      const now = performance.now();
      const elapsed = Math.max(0, Math.min(STEP_MS * 10, now - this.lastPumpAt));
      this.lastPumpAt = now;
      this.accumulatorMs += elapsed;

      let steps = 0;
      while (this.accumulatorMs >= STEP_MS && steps < MAX_CATCHUP_STEPS) {
        this.stepCanonicalTick();
        steps += 1;
        this.accumulatorMs -= STEP_MS;
      }
      if (steps > 1) this.catchupSteps += steps - 1;
      if (this.accumulatorMs >= STEP_MS) {
        const dropped = Math.floor(this.accumulatorMs / STEP_MS);
        this.droppedTicks += dropped;
        this.accumulatorMs %= STEP_MS;
      }
      if (!this.sampleScene().finite) throw new Error("non_finite_world_state");
    } catch (error) {
      this.failure = error instanceof Error ? error.message : String(error);
      this.broadcast({ type: "f5_error", error: this.failure, boundaryTick: this.tick });
      this.stopLoop();
    }
  }

  private stepCanonicalTick(): void {
    if (!this.world) return;
    const targetTick = this.tick;
    const active = this.protocolStartTick !== null && targetTick >= this.protocolStartTick;
    const consumed: Array<{ sessionId: string; playerId: string; slot: number } & F5ConsumedInput> = [];

    for (const player of this.sortedPlayers()) {
      const input = active
        ? player.input.consume(targetTick)
        : { targetTick, x: 0, z: 0, fresh: false };
      this.applyIntent(player.body, input.x, input.z);
      consumed.push({ sessionId: player.sessionId, playerId: player.playerId, slot: player.slot, ...input });
    }

    b3.b3World_Step(this.world, 1 / SIMULATION_HZ, SUBSTEPS);
    this.tick = targetTick + 1;

    if (active) {
      this.broadcast({
        type: "f5_consumed",
        protocolRevision: F5_PROTOCOL_REVISION,
        targetTick,
        boundaryTick: this.tick,
        players: consumed,
        serverTime: Date.now(),
      });
    }
    if (this.tick % SNAPSHOT_EVERY_TICKS === 0) this.broadcastSnapshot();
  }

  private applyIntent(body: BodyId, inputX: number, inputZ: number): void {
    const velocity: Vec3 = [0, 0, 0];
    b3.b3Body_GetLinearVelocity(velocity, body);
    const hasInput = Math.hypot(inputX, inputZ) > 0.01;
    const [nextX, nextZ] = moveToward2(
      velocity[0],
      velocity[2],
      inputX * PLAYER_SPEED,
      inputZ * PLAYER_SPEED,
      (hasInput ? PLAYER_ACCELERATION : PLAYER_DECELERATION) / SIMULATION_HZ,
    );
    b3.b3Body_SetLinearVelocity(body, [nextX, velocity[1], nextZ]);
  }

  private sampleScene(): F5SceneSample {
    if (!this.world) return { finite: true, players: [], props: [] };
    let finite = true;
    const position: Vec3 = [0, 0, 0];
    const rotation: Quat = [0, 0, 0, 1];
    const velocity: Vec3 = [0, 0, 0];
    const players: F5SceneSample["players"] = [];
    const props: F5SceneSample["props"] = [];

    for (const player of this.sortedPlayers()) {
      b3.b3Body_GetPosition(position, player.body);
      b3.b3Body_GetRotation(rotation, player.body);
      b3.b3Body_GetLinearVelocity(velocity, player.body);
      const p: Vec3 = [position[0], position[1], position[2]];
      const q: Quat = [rotation[0], rotation[1], rotation[2], rotation[3]];
      const v: Vec3 = [velocity[0], velocity[1], velocity[2]];
      finite = finite && p.every(Number.isFinite) && q.every(Number.isFinite) && v.every(Number.isFinite);
      players.push({ id: player.playerId, sessionId: player.sessionId, slot: player.slot, position: p, rotation: q, velocity: v });
    }

    for (const prop of this.props) {
      b3.b3Body_GetPosition(position, prop.body);
      b3.b3Body_GetRotation(rotation, prop.body);
      const p: Vec3 = [position[0], position[1], position[2]];
      const q: Quat = [rotation[0], rotation[1], rotation[2], rotation[3]];
      finite = finite && p.every(Number.isFinite) && q.every(Number.isFinite);
      props.push({ id: prop.id, position: p, rotation: q });
    }
    return { finite, players, props };
  }

  private snapshotState() {
    const sample = this.sampleScene();
    return {
      boundaryTick: this.tick,
      sequence: this.snapshotSequence,
      players: sample.players,
      props: sample.props,
      finite: sample.finite,
    };
  }

  private broadcastSnapshot(): void {
    this.snapshotSequence += 1;
    this.broadcast({
      type: "f5_snapshot",
      revision: F5_SERVER_REVISION,
      protocolRevision: F5_PROTOCOL_REVISION,
      ...this.snapshotState(),
      serverTime: Date.now(),
    });
  }

  private simulationContract() {
    return {
      simulationHz: SIMULATION_HZ,
      simulationStepMs: STEP_MS,
      substeps: SUBSTEPS,
      snapshotHz: SNAPSHOT_HZ,
      predictionLeadTicks: F5_PREDICTION_LEAD_TICKS,
      inputBatchSize: F5_INPUT_BATCH_SIZE,
      maxFutureTicks: F5_MAX_FUTURE_TICKS,
      protocolStartDelayTicks: PROTOCOL_START_DELAY_TICKS,
      playerSpeed: PLAYER_SPEED,
      playerAcceleration: PLAYER_ACCELERATION,
      playerDeceleration: PLAYER_DECELERATION,
      box3dRuntime: BOX3D_RUNTIME,
    };
  }

  private sortedPlayers(): F5Player[] {
    return [...this.players.values()].sort((a, b) => a.slot - b.slot);
  }

  private removePlayerAndReset(ws: WebSocket, reason: string): void {
    if (this.resetting || !this.players.has(ws)) return;
    this.resetting = true;
    try {
      this.players.delete(ws);
      for (const socket of this.players.keys()) {
        try { socket.close(1012, reason); } catch { /* lifecycle race */ }
      }
      this.players.clear();
      this.stopLoop();
      this.destroyWorld();
      this.protocolStartTick = null;
      this.tick = 0;
    } finally {
      this.resetting = false;
    }
  }

  private destroyWorld(): void {
    if (this.world) {
      try { b3.b3DestroyWorld(this.world); } catch { /* teardown only */ }
    }
    this.world = null;
    this.props = [];
  }

  private broadcast(payload: unknown): void {
    for (const socket of this.players.keys()) this.send(socket, payload);
  }

  private send(socket: WebSocket, payload: unknown): void {
    if (socket.readyState !== WebSocket.OPEN) return;
    try { socket.send(JSON.stringify(payload)); } catch { /* close race */ }
  }
}
