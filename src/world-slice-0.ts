import { DurableObject } from "cloudflare:workers";
import { b3, BOX3D_RUNTIME } from "./box3d-runtime";

export const WS0_REVISION = "ws0-a2-protocol-v1";

const SIMULATION_HZ = 60;
const SIMULATION_STEP_MS = 1000 / SIMULATION_HZ;
const SUBSTEPS = 4;
const MAX_CATCHUP_STEPS = 4;
const SNAPSHOT_HZ = 10;
const SNAPSHOT_EVERY_TICKS = SIMULATION_HZ / SNAPSHOT_HZ;
const INPUT_LEASE_MS = 600;
const TELEMETRY_SAMPLE_LIMIT = 240;
const PROP_COUNT = 12;
const A1_ACTOR_COUNT = 2;
const MAX_INTERACTIVE_PLAYERS = 6;
const PLAYER_SPEED = 5.2;
const PLAYER_ACCELERATION = 28;
const PLAYER_DECELERATION = 36;
const PLAYER_ID_PATTERN = /^[A-Za-z0-9_-]{1,24}$/;

type WorldId = ReturnType<typeof b3.b3CreateWorld>;
type BodyId = ReturnType<typeof b3.b3CreateBody>;
type Vec3 = [number, number, number];
type Quat = [number, number, number, number];
type Mode = "idle" | "a1-scripted" | "interactive";

type PropRecord = {
  id: string;
  body: BodyId;
  initial: Vec3;
};

type InteractivePlayer = {
  playerId: string;
  sessionId: string;
  body: BodyId;
  inputX: number;
  inputZ: number;
  lastInputAt: number;
  lastInputSeq: number;
};

type SceneSample = {
  finite: boolean;
  checksum: number;
  maxPropDisplacement: number;
  actors: Array<{ id: string; sessionId?: string; position: Vec3; rotation: Quat; velocity: Vec3; ack?: number }>;
  props: Array<{ id: string; position: Vec3; rotation: Quat }>;
};

type ClientMessage =
  | { type: "input"; seq: number; x: number; z: number }
  | { type: "ping"; id: string };

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1));
  return sorted[index];
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
    },
  });
}

function websocketUpgradeRequired(): Response {
  return new Response("Expected Upgrade: websocket", {
    status: 426,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

function createStaticBox(world: WorldId, position: Vec3, halfExtents: Vec3): void {
  const bodyDef = b3.b3DefaultBodyDef();
  bodyDef.position = position;
  const body = b3.b3CreateBody(world, bodyDef);
  b3.b3CreateBoxShape(body, b3.b3DefaultShapeDef(), halfExtents[0], halfExtents[1], halfExtents[2]);
}

function normalizedInput(x: number, z: number): { x: number; z: number } {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return { x: 0, z: 0 };
  const length = Math.hypot(x, z);
  if (length <= 1) return { x, z };
  return { x: x / length, z: z / length };
}

function moveToward2(currentX: number, currentZ: number, targetX: number, targetZ: number, maxDelta: number): [number, number] {
  const dx = targetX - currentX;
  const dz = targetZ - currentZ;
  const distance = Math.hypot(dx, dz);
  if (distance <= maxDelta || distance < 1e-9) return [targetX, targetZ];
  const scale = maxDelta / distance;
  return [currentX + dx * scale, currentZ + dz * scale];
}

function parseClientMessage(raw: string): ClientMessage | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null || !("type" in value)) return null;
  if (value.type === "ping" && "id" in value && typeof value.id === "string" && value.id.length <= 80) {
    return { type: "ping", id: value.id };
  }
  if (
    value.type === "input" &&
    "seq" in value && typeof value.seq === "number" && Number.isFinite(value.seq) &&
    "x" in value && typeof value.x === "number" &&
    "z" in value && typeof value.z === "number"
  ) {
    return { type: "input", seq: Math.trunc(value.seq), x: value.x, z: value.z };
  }
  return null;
}

export class WorldSlice0 extends DurableObject<Env> {
  private world: WorldId | null = null;
  private mode: Mode = "idle";
  private scriptedActorBodies: BodyId[] = [];
  private props: PropRecord[] = [];
  private players = new Map<WebSocket, InteractivePlayer>();
  private loopTimer: ReturnType<typeof setInterval> | null = null;
  private lastPumpAt = 0;
  private accumulatorMs = 0;
  private startedAt = 0;
  private tick = 0;
  private snapshotSequence = 0;
  private callbacks = 0;
  private droppedTicks = 0;
  private catchupSteps = 0;
  private runSerial = 0;
  private runId: string | null = null;
  private failure: string | null = null;
  private pumpIntervalSamples: number[] = [];
  private lastRun: Record<string, unknown> | null = null;

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade")?.toLowerCase() === "websocket") return this.acceptInteractivePlayer(request);

    const url = new URL(request.url);
    const action = url.searchParams.get("action") ?? "status";

    try {
      if (action === "start") return json(this.startScriptedA1());
      if (action === "reset") {
        this.stop(true);
        return json(this.startScriptedA1());
      }
      if (action === "stop") return json(this.stop(false));
      if (action === "status") return json(this.status());
      return json({ ok: false, revision: WS0_REVISION, error: "invalid_action" }, 400);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.failure = message;
      this.stopLoop();
      return json({ ok: false, revision: WS0_REVISION, error: message, status: this.status() }, 500);
    }
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    const player = this.players.get(ws);
    if (!player) {
      ws.close(1011, "missing_player_state");
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
      this.send(ws, { type: "pong", id: message.id, tick: this.tick, serverTime: Date.now() });
      return;
    }
    if (message.seq <= player.lastInputSeq) return;
    const input = normalizedInput(message.x, message.z);
    player.inputX = input.x;
    player.inputZ = input.z;
    player.lastInputSeq = message.seq;
    player.lastInputAt = Date.now();
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    this.removeInteractivePlayer(ws);
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    this.removeInteractivePlayer(ws);
  }

  private acceptInteractivePlayer(request: Request): Response {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return websocketUpgradeRequired();
    const url = new URL(request.url);
    const playerId = (url.searchParams.get("player") ?? "").trim();
    if (!PLAYER_ID_PATTERN.test(playerId)) return json({ ok: false, error: "invalid_player" }, 400);
    if (this.players.size >= MAX_INTERACTIVE_PLAYERS) return json({ ok: false, error: "world_full" }, 503);

    if (this.mode !== "interactive" || !this.world) this.startInteractiveWorld();
    if (!this.world) return json({ ok: false, error: "world_not_ready" }, 500);

    const [client, server] = Object.values(new WebSocketPair()) as [WebSocket, WebSocket];
    const player = this.createInteractivePlayer(playerId, this.players.size);
    this.ctx.acceptWebSocket(server, ["ws0-player"]);
    this.players.set(server, player);

    this.send(server, {
      type: "welcome",
      revision: WS0_REVISION,
      selfSessionId: player.sessionId,
      simulation: this.simulationContract(),
      world: { halfExtent: 10 },
      state: this.snapshotState(),
      serverTime: Date.now(),
    });
    this.startLoop();
    return new Response(null, { status: 101, webSocket: client });
  }

  private startScriptedA1(): Record<string, unknown> {
    if (this.mode === "a1-scripted" && this.world && this.loopTimer && !this.failure) return this.status();
    this.resetRuntime("a1-scripted");
    this.createBaseScene();
    this.createScriptedActors();
    this.startLoop();
    return this.status();
  }

  private startInteractiveWorld(): void {
    this.stopLoop();
    this.destroyWorld();
    this.resetCounters("interactive");
    this.createBaseScene();
    // Player bodies are created lazily as sockets join.
  }

  private resetRuntime(mode: Mode): void {
    this.stopLoop();
    this.destroyWorld();
    this.resetCounters(mode);
  }

  private resetCounters(mode: Mode): void {
    this.mode = mode;
    this.runSerial += 1;
    this.runId = `ws0-${mode}-${this.runSerial}`;
    this.failure = null;
    this.tick = 0;
    this.snapshotSequence = 0;
    this.callbacks = 0;
    this.droppedTicks = 0;
    this.catchupSteps = 0;
    this.pumpIntervalSamples = [];
    this.accumulatorMs = 0;
    this.startedAt = Date.now();
  }

  private stop(forReset: boolean): Record<string, unknown> {
    const final = this.status();
    for (const socket of this.players.keys()) {
      try { socket.close(1001, "world_stopped"); } catch { /* lifecycle noise */ }
    }
    this.players.clear();
    this.stopLoop();
    this.destroyWorld();
    const stopped = { ...final, active: false, stopped: true };
    if (!forReset) this.lastRun = stopped;
    this.mode = "idle";
    return stopped;
  }

  private startLoop(): void {
    if (this.loopTimer || !this.world) return;
    const now = performance.now();
    this.lastPumpAt = now;
    this.accumulatorMs = 0;
    this.loopTimer = setInterval(() => this.pump(), SIMULATION_STEP_MS);
  }

  private stopLoop(): void {
    if (this.loopTimer) clearInterval(this.loopTimer);
    this.loopTimer = null;
    this.lastPumpAt = 0;
    this.accumulatorMs = 0;
  }

  private createBaseScene(): void {
    const worldDef = b3.b3DefaultWorldDef();
    worldDef.gravity = [0, -20, 0];
    const world = b3.b3CreateWorld(worldDef);
    this.world = world;

    createStaticBox(world, [0, -0.5, 0], [10, 0.5, 10]);
    createStaticBox(world, [-9.5, 1.5, 0], [0.5, 2, 10]);
    createStaticBox(world, [9.5, 1.5, 0], [0.5, 2, 10]);
    createStaticBox(world, [0, 1.5, -9.5], [10, 2, 0.5]);
    createStaticBox(world, [0, 1.5, 9.5], [10, 2, 0.5]);

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
      const body = b3.b3CreateBody(world, bodyDef);
      const shapeDef = b3.b3DefaultShapeDef();
      shapeDef.density = 22;
      shapeDef.baseMaterial.friction = 0.72;
      shapeDef.baseMaterial.restitution = 0.04;
      b3.b3CreateBoxShape(body, shapeDef, 0.46, 0.46, 0.46);
      this.props.push({ id: `prop-${index}`, body, initial });
    }
  }

  private createScriptedActors(): void {
    if (!this.world) return;
    const starts: Vec3[] = [[-7, 0.82, -0.65], [7, 0.82, 0.65]];
    this.scriptedActorBodies = starts.map((start) => this.createActorBody(start));
  }

  private createInteractivePlayer(playerId: string, slot: number): InteractivePlayer {
    if (!this.world) throw new Error("world_not_ready");
    const side = slot % 2 === 0 ? -1 : 1;
    const lane = Math.floor(slot / 2);
    const start: Vec3 = [side * (6.5 - lane * 0.8), 0.82, (slot % 3 - 1) * 1.4];
    return {
      playerId,
      sessionId: crypto.randomUUID(),
      body: this.createActorBody(start),
      inputX: 0,
      inputZ: 0,
      lastInputAt: Date.now(),
      lastInputSeq: 0,
    };
  }

  private createActorBody(start: Vec3): BodyId {
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
    b3.b3CreateCapsuleShape(body, shapeDef, {
      center1: [0, -0.45, 0],
      center2: [0, 0.45, 0],
      radius: 0.35,
    });
    return body;
  }

  private destroyWorld(): void {
    if (this.world) b3.b3DestroyWorld(this.world);
    this.world = null;
    this.scriptedActorBodies = [];
    this.props = [];
    this.players.clear();
  }

  private pump(): void {
    if (!this.world || this.failure) {
      this.stopLoop();
      return;
    }

    try {
      const now = performance.now();
      const elapsed = Math.max(0, Math.min(SIMULATION_STEP_MS * 10, now - this.lastPumpAt));
      this.lastPumpAt = now;
      this.callbacks += 1;
      this.pushSample(this.pumpIntervalSamples, elapsed);
      this.accumulatorMs += elapsed;

      let steps = 0;
      while (this.accumulatorMs >= SIMULATION_STEP_MS && steps < MAX_CATCHUP_STEPS) {
        if (this.mode === "a1-scripted") this.driveScriptedActors();
        if (this.mode === "interactive") this.applyInteractiveInputs(SIMULATION_STEP_MS / 1000, Date.now());
        b3.b3World_Step(this.world, 1 / SIMULATION_HZ, SUBSTEPS);
        this.tick += 1;
        steps += 1;
        this.accumulatorMs -= SIMULATION_STEP_MS;

        if (this.mode === "interactive" && this.tick % SNAPSHOT_EVERY_TICKS === 0) this.broadcastSnapshot();
      }

      if (steps > 1) this.catchupSteps += steps - 1;
      if (this.accumulatorMs >= SIMULATION_STEP_MS) {
        const dropped = Math.floor(this.accumulatorMs / SIMULATION_STEP_MS);
        this.droppedTicks += dropped;
        this.accumulatorMs %= SIMULATION_STEP_MS;
      }

      const sample = this.sampleScene();
      if (!sample.finite) throw new Error("non_finite_world_state");
    } catch (error) {
      this.failure = error instanceof Error ? error.message : String(error);
      this.stopLoop();
    }
  }

  private driveScriptedActors(): void {
    const phase = Math.floor(this.tick / 120) % 2 === 0 ? 1 : -1;
    for (let index = 0; index < this.scriptedActorBodies.length; index += 1) {
      const side = index === 0 ? 1 : -1;
      const vx = side * phase * 5.2;
      const vz = Math.sin((this.tick + index * 41) * 0.045) * 0.9;
      b3.b3Body_SetLinearVelocity(this.scriptedActorBodies[index], [vx, 0, vz]);
    }
  }

  private applyInteractiveInputs(dt: number, now: number): void {
    const velocity: Vec3 = [0, 0, 0];
    for (const player of this.players.values()) {
      b3.b3Body_GetLinearVelocity(velocity, player.body);
      const leased = now - player.lastInputAt <= INPUT_LEASE_MS;
      const inputX = leased ? player.inputX : 0;
      const inputZ = leased ? player.inputZ : 0;
      const hasInput = Math.hypot(inputX, inputZ) > 0.01;
      const targetX = inputX * PLAYER_SPEED;
      const targetZ = inputZ * PLAYER_SPEED;
      const acceleration = hasInput ? PLAYER_ACCELERATION : PLAYER_DECELERATION;
      const [nextX, nextZ] = moveToward2(velocity[0], velocity[2], targetX, targetZ, acceleration * dt);
      // Dynamic body remains solver-owned vertically and in all collision response.
      b3.b3Body_SetLinearVelocity(player.body, [nextX, velocity[1], nextZ]);
    }
  }

  private removeInteractivePlayer(ws: WebSocket): void {
    const player = this.players.get(ws);
    if (!player) return;
    this.players.delete(ws);
    if (this.world) {
      try { b3.b3DestroyBody(player.body); } catch { /* world teardown may race close */ }
    }
    this.broadcast({ type: "player_left", sessionId: player.sessionId, playerId: player.playerId, tick: this.tick });
    if (this.players.size === 0 && this.mode === "interactive") {
      this.stopLoop();
      this.destroyWorld();
      this.mode = "idle";
    }
  }

  private sampleScene(): SceneSample {
    if (!this.world) return { finite: true, checksum: 0, maxPropDisplacement: 0, actors: [], props: [] };

    let finite = true;
    let checksum = 0;
    let maxPropDisplacement = 0;
    const actors: SceneSample["actors"] = [];
    const props: SceneSample["props"] = [];
    const position: Vec3 = [0, 0, 0];
    const rotation: Quat = [0, 0, 0, 1];
    const velocity: Vec3 = [0, 0, 0];

    if (this.mode === "a1-scripted") {
      for (let index = 0; index < this.scriptedActorBodies.length; index += 1) {
        const body = this.scriptedActorBodies[index];
        b3.b3Body_GetPosition(position, body);
        b3.b3Body_GetRotation(rotation, body);
        b3.b3Body_GetLinearVelocity(velocity, body);
        const p: Vec3 = [position[0], position[1], position[2]];
        const q: Quat = [rotation[0], rotation[1], rotation[2], rotation[3]];
        const v: Vec3 = [velocity[0], velocity[1], velocity[2]];
        finite = finite && p.every(Number.isFinite) && q.every(Number.isFinite) && v.every(Number.isFinite);
        checksum += p[0] * 0.31 + p[1] * 0.53 + p[2] * 0.79;
        actors.push({ id: `actor-${index}`, position: p, rotation: q, velocity: v });
      }
    } else if (this.mode === "interactive") {
      for (const player of this.players.values()) {
        b3.b3Body_GetPosition(position, player.body);
        b3.b3Body_GetRotation(rotation, player.body);
        b3.b3Body_GetLinearVelocity(velocity, player.body);
        const p: Vec3 = [position[0], position[1], position[2]];
        const q: Quat = [rotation[0], rotation[1], rotation[2], rotation[3]];
        const v: Vec3 = [velocity[0], velocity[1], velocity[2]];
        finite = finite && p.every(Number.isFinite) && q.every(Number.isFinite) && v.every(Number.isFinite);
        checksum += p[0] * 0.31 + p[1] * 0.53 + p[2] * 0.79;
        actors.push({ id: player.playerId, sessionId: player.sessionId, position: p, rotation: q, velocity: v, ack: player.lastInputSeq });
      }
    }

    for (const prop of this.props) {
      b3.b3Body_GetPosition(position, prop.body);
      b3.b3Body_GetRotation(rotation, prop.body);
      const p: Vec3 = [position[0], position[1], position[2]];
      const q: Quat = [rotation[0], rotation[1], rotation[2], rotation[3]];
      finite = finite && p.every(Number.isFinite) && q.every(Number.isFinite);
      checksum += p[0] * 0.17 + p[1] * 0.37 + p[2] * 0.67;
      maxPropDisplacement = Math.max(maxPropDisplacement, Math.hypot(p[0] - prop.initial[0], p[2] - prop.initial[2]));
      props.push({ id: prop.id, position: p, rotation: q });
    }

    return { finite, checksum, maxPropDisplacement, actors, props };
  }

  private snapshotState() {
    const sample = this.sampleScene();
    return {
      runId: this.runId,
      tick: this.tick,
      sequence: this.snapshotSequence,
      players: sample.actors,
      props: sample.props,
      telemetry: this.telemetry(sample),
    };
  }

  private broadcastSnapshot(): void {
    this.snapshotSequence += 1;
    this.broadcast({
      type: "snapshot",
      revision: WS0_REVISION,
      ...this.snapshotState(),
      serverTime: Date.now(),
    });
  }

  private telemetry(sample: SceneSample) {
    const durationMs = this.startedAt ? Math.max(0, Date.now() - this.startedAt) : 0;
    const expectedTicks = durationMs / SIMULATION_STEP_MS;
    return {
      durationMs,
      tickRatio: expectedTicks > 0 ? this.tick / expectedTicks : 1,
      droppedTicks: this.droppedTicks,
      catchupSteps: this.catchupSteps,
      pumpIntervalMsP50: percentile(this.pumpIntervalSamples, 0.5),
      pumpIntervalMsP95: percentile(this.pumpIntervalSamples, 0.95),
      activePlayers: this.players.size,
      maxPropDisplacement: sample.maxPropDisplacement,
      finite: sample.finite,
    };
  }

  private status(): Record<string, unknown> {
    if (!this.world && !this.runId && this.lastRun) return this.lastRun;
    const sample = this.sampleScene();
    const durationMs = this.startedAt ? Math.max(0, Date.now() - this.startedAt) : 0;
    const expectedTicks = durationMs / SIMULATION_STEP_MS;
    return {
      ok: this.failure === null && sample.finite,
      revision: WS0_REVISION,
      stage: this.mode === "interactive" ? "world-slice-0-a2-protocol" : "world-slice-0-a1-server-foundation",
      runtime: BOX3D_RUNTIME,
      active: this.loopTimer !== null && this.world !== null && this.failure === null,
      mode: this.mode,
      runId: this.runId,
      simulation: this.simulationContract(),
      scene: { actors: this.mode === "a1-scripted" ? A1_ACTOR_COUNT : this.players.size, props: PROP_COUNT, gravity: [0, -20, 0] },
      durationMs,
      tick: this.tick,
      expectedTicks,
      tickRatio: expectedTicks > 0 ? this.tick / expectedTicks : 1,
      callbacks: this.callbacks,
      snapshotSequence: this.snapshotSequence,
      droppedTicks: this.droppedTicks,
      catchupSteps: this.catchupSteps,
      pumpIntervalMsP50: percentile(this.pumpIntervalSamples, 0.5),
      pumpIntervalMsP95: percentile(this.pumpIntervalSamples, 0.95),
      pumpIntervalMsMax: this.pumpIntervalSamples.length ? Math.max(...this.pumpIntervalSamples) : 0,
      failure: this.failure,
      checks: { finite: sample.finite, propMoved: sample.maxPropDisplacement > 0.25 },
      maxPropDisplacement: sample.maxPropDisplacement,
      checksum: sample.checksum,
      actors: sample.actors,
      props: sample.props,
    };
  }

  private simulationContract() {
    return {
      simulationHz: SIMULATION_HZ,
      simulationStepMs: SIMULATION_STEP_MS,
      substeps: SUBSTEPS,
      snapshotHz: SNAPSHOT_HZ,
      inputLeaseMs: INPUT_LEASE_MS,
      maxCatchupSteps: MAX_CATCHUP_STEPS,
      playerSpeed: PLAYER_SPEED,
    };
  }

  private pushSample(target: number[], value: number): void {
    target.push(value);
    if (target.length > TELEMETRY_SAMPLE_LIMIT) target.splice(0, target.length - TELEMETRY_SAMPLE_LIMIT);
  }

  private broadcast(payload: unknown): void {
    const encoded = JSON.stringify(payload);
    for (const socket of this.players.keys()) {
      if (socket.readyState !== WebSocket.OPEN) continue;
      try { socket.send(encoded); } catch { /* close race */ }
    }
  }

  private send(socket: WebSocket, payload: unknown): void {
    try { socket.send(JSON.stringify(payload)); } catch { /* close race */ }
  }
}
