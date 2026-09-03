import { DurableObject } from "cloudflare:workers";
import { b3, BOX3D_RUNTIME } from "./box3d-runtime";
import {
  WORLD_V0_ARENA,
  WORLD_V0_BOX3D_RUNTIME,
  WORLD_V0_CLIENT_SIM_REVISION,
  WORLD_V0_MOVEMENT,
  WORLD_V0_NET_ENTITY_ORDER,
  WORLD_V0_PLAYER_PHYSICS,
  WORLD_V0_PLAYER_STARTS,
  WORLD_V0_PROP_LAYOUT,
  WORLD_V0_PROP_PHYSICS,
  WORLD_V0_SERVER_REVISION,
  WORLD_V0_SIM_BUILD_ID,
  WORLD_V0_STATE_GUARD_REVISION,
  WORLD_V0_TIMING,
  worldV0SimulationContract,
} from "./world-v0-contract";
import {
  WORLD_V0_MAX_FUTURE_TICKS,
  WORLD_V0_PROTOCOL_REVISION,
  WorldV0ScheduledInputBuffer,
  expectedWorldV0Identity,
  parseWorldV0ClientMessage,
  sameWorldV0Identity,
  type WorldV0ConsumedInput,
} from "./world-v0-protocol";

if (
  BOX3D_RUNTIME.package !== WORLD_V0_BOX3D_RUNTIME.package ||
  BOX3D_RUNTIME.build !== WORLD_V0_BOX3D_RUNTIME.build
) {
  throw new Error(`World V0 Box3D runtime drift: ${BOX3D_RUNTIME.package}:${BOX3D_RUNTIME.build}`);
}

const STEP_MS = 1000 / WORLD_V0_TIMING.simulationHz;
const SNAPSHOT_EVERY_TICKS = WORLD_V0_TIMING.simulationHz / WORLD_V0_TIMING.snapshotHz;
const MAX_PLAYERS = 2;
const PLAYER_ID_PATTERN = /^[A-Za-z0-9_-]{1,24}$/;
const RUN_KEY_PATTERN = /^[A-Za-z0-9_-]{1,20}$/;

type WorldId = ReturnType<typeof b3.b3CreateWorld>;
type BodyId = ReturnType<typeof b3.b3CreateBody>;
type Vec3 = [number, number, number];
type Quat = [number, number, number, number];

type DynamicState = {
  netEntityId: string;
  position: Vec3;
  rotation: Quat;
  linearVelocity: Vec3;
  angularVelocity: Vec3;
};

type SharedYardProp = {
  id: string;
  body: BodyId;
  initial: Vec3;
  cluster: string;
};

type SharedYardPlayer = {
  playerId: string;
  sessionId: string;
  netEntityId: string;
  slot: number;
  body: BodyId;
  ready: boolean;
  input: WorldV0ScheduledInputBuffer;
};

type SharedYardSceneSample = {
  finite: boolean;
  players: Array<DynamicState & { id: string; sessionId: string; slot: number }>;
  props: Array<DynamicState & { id: string; cluster: string }>;
};

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "cache-control": "no-store", "content-type": "application/json; charset=utf-8" },
  });
}

function moveToward2(cx: number, cz: number, tx: number, tz: number, maxDelta: number): [number, number] {
  const dx = tx - cx;
  const dz = tz - cz;
  const distance = Math.hypot(dx, dz);
  if (distance <= maxDelta || distance < 1e-9) return [tx, tz];
  const scale = maxDelta / distance;
  return [cx + dx * scale, cz + dz * scale];
}

function normalizeRunKey(raw: string | null): string {
  const value = (raw ?? "manual").trim();
  return RUN_KEY_PATTERN.test(value) ? value : "manual";
}

function readVec3(getter: (out: Vec3, body: BodyId) => void, body: BodyId): Vec3 {
  const out: Vec3 = [0, 0, 0];
  getter(out, body);
  return [out[0], out[1], out[2]];
}

function readQuat(body: BodyId): Quat {
  const out: Quat = [0, 0, 0, 1];
  b3.b3Body_GetRotation(out, body);
  return [out[0], out[1], out[2], out[3]];
}

function readDynamicState(netEntityId: string, body: BodyId): DynamicState {
  return {
    netEntityId,
    position: readVec3(b3.b3Body_GetPosition, body),
    rotation: readQuat(body),
    linearVelocity: readVec3(b3.b3Body_GetLinearVelocity, body),
    angularVelocity: readVec3(b3.b3Body_GetAngularVelocity, body),
  };
}

function finiteDynamicState(state: DynamicState): boolean {
  return [
    ...state.position,
    ...state.rotation,
    ...state.linearVelocity,
    ...state.angularVelocity,
  ].every(Number.isFinite);
}

const FLOAT32_VIEW = new DataView(new ArrayBuffer(4));
function encodeFloat32Bits(value: number): string {
  FLOAT32_VIEW.setFloat32(0, value, true);
  return FLOAT32_VIEW.getUint32(0, true).toString(16).padStart(8, "0");
}

function flattenDynamicState(state: DynamicState): number[] {
  return [
    ...state.position,
    ...state.rotation,
    ...state.linearVelocity,
    ...state.angularVelocity,
  ];
}

export class SharedYardV0 extends DurableObject<Env> {
  private world: WorldId | null = null;
  private worldId: string | null = null;
  private worldEpoch: string | null = null;
  private props: SharedYardProp[] = [];
  private readonly players = new Map<WebSocket, SharedYardPlayer>();
  private loopTimer: ReturnType<typeof setInterval> | null = null;
  private epochPinTimer: ReturnType<typeof setInterval> | null = null;
  private lastPumpAt = 0;
  private accumulatorMs = 0;
  private tick = 0;
  private snapshotSequence = 0;
  private protocolStartTick: number | null = null;
  private droppedTicks = 0;
  private catchupSteps = 0;
  private failure: string | null = null;
  private resetting = false;

  // Field initialization runs after the DurableObject base constructor. If a
  // hibernation-enabled WebSocket survived an unexpected object re-creation,
  // close it immediately instead of restoring an incomplete physics epoch.
  private readonly restoredSocketsClosed = this.closeRestoredSockets();

  private closeRestoredSockets(): number {
    const sockets = this.ctx.getWebSockets();
    for (const socket of sockets) {
      try { socket.close(1012, "world_epoch_lost_restart_required"); } catch { /* recovery close only */ }
    }
    return sockets.length;
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return json({
        ok: this.failure === null,
        revision: WORLD_V0_SERVER_REVISION,
        protocolRevision: WORLD_V0_PROTOCOL_REVISION,
        worldId: this.worldId,
        worldEpoch: this.worldEpoch,
        simBuildId: WORLD_V0_SIM_BUILD_ID,
        boundaryTick: this.tick,
        protocolStartTick: this.protocolStartTick,
        players: this.players.size,
        active: this.loopTimer !== null,
        droppedTicks: this.droppedTicks,
        catchupSteps: this.catchupSteps,
        failure: this.failure,
      });
    }
    return this.acceptPlayer(request);
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    const player = this.players.get(ws);
    if (!player) {
      try { ws.close(1011, "missing_world_v0_player"); } catch { /* lifecycle race */ }
      return;
    }
    if (typeof raw !== "string") {
      this.send(ws, { type: "world_v0_error", error: "text_frames_only", ...this.identityPayload() });
      return;
    }

    const message = parseWorldV0ClientMessage(raw);
    if (!message) {
      this.send(ws, { type: "world_v0_error", error: "invalid_message", ...this.identityPayload() });
      return;
    }

    if (message.type === "world_v0_ping") {
      this.send(ws, {
        type: "world_v0_pong",
        id: message.id,
        boundaryTick: this.tick,
        protocolStartTick: this.protocolStartTick,
        serverTime: Date.now(),
        ...this.identityPayload(),
      });
      return;
    }

    const expectedIdentity = this.expectedIdentity();
    if (!sameWorldV0Identity(expectedIdentity, message)) {
      this.send(ws, {
        type: "world_v0_error",
        error: "world_identity_mismatch",
        expected: expectedIdentity,
        received: {
          worldId: message.worldId,
          worldEpoch: message.worldEpoch,
          simBuildId: message.simBuildId,
          clientSimRevision: message.clientSimRevision,
        },
        ...this.identityPayload(),
      });
      try { ws.close(1008, "world_identity_mismatch"; } catch { /* close race */ }
      return;
    }

    if (message.type === "world_v0_ready") {
      player.ready = true;
      this.send(ws, { type: "world_v0_ready_ack", boundaryTick: this.tick, ...this.identityPayload() });
      this.maybeStartProtocol();
      return;
    }

    if (this.protocolStartTick === null) {
      this.send(ws, {
        type: "world_v0_batch_ack",
        batchSeq: message.batchSeq,
        batchStatus: "protocol_not_scheduled",
        records: [],
        ...this.identityPayload(),
      });
      return;
    }

    const acceptance = player.input.acceptBatch(
      message,
      this.tick,
      this.protocolStartTick,
      WORLD_V0_MAX_FUTURE_TICKS,
    );
    const accepted = acceptance.records.filter((record) => record.status === "accepted");
    if (accepted.length) {
      const payload = {
        type: "world_v0_peer_records",
        senderSessionId: player.sessionId,
        senderPlayerId: player.playerId,
        senderNetEntityId: player.netEntityId,
        batchSeq: message.batchSeq,
        records: accepted.map(({ targetTick, x, z }) => ({ targetTick, x, z })),
        relayBoundaryTick: this.tick,
        serverTime: Date.now(),
        ...this.identityPayload(),
      };
      for (const [peerSocket] of this.players) {
        if (peerSocket !== ws) this.send(peerSocket, payload);
      }
    }

    this.send(ws, {
      type: "world_v0_batch_ack",
      boundaryTick: this.tick,
      protocolStartTick: this.protocolStartTick,
      ...acceptance,
      stats: player.input.stats(),
      ...this.identityPayload(),
    });
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    this.endEpochFromSocket(ws, "peer_left_restart_required");
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    this.endEpochFromSocket(ws, "peer_error_restart_required");
  }

  private acceptPlayer(request: Request): Response {
    const url = new URL(request.url);
    const playerId = (url.searchParams.get("player") ?? "").trim();
    const runKey = normalizeRunKey(url.searchParams.get("run"));
    const requestedWorldId = `shared-yard-v0-${runKey}`;
    if (!PLAYER_ID_PATTERN.test(playerId)) return json({ ok: false, error: "invalid_player" }, 400);
    if (this.protocolStartTick !== null || this.loopTimer) return json({ ok: false, error: "world_v0_run_already_active" }, 409);
    if (this.players.size >= MAX_PLAYERS) return json({ ok: false, error: "world_v0_full" }, 503);

    if (!this.world) this.createWorld(requestedWorldId);
    if (!this.world || !this.worldId || !this.worldEpoch) return json({ ok: false, error: "world_not_ready" }, 500);
    if (this.worldId !== requestedWorldId) return json({ ok: false, error: "world_id_mismatch" }, 409);

    const [client, server] = Object.values(new WebSocketPair()) as [WebSocket, WebSocket];
    const slot = this.players.size;
    const netEntityId = `actor:${slot}`;
    const body = this.createPlayerBody(WORLD_V0_PLAYER_STARTS[slot]);
    const player: SharedYardPlayer = {
      playerId,
      sessionId: crypto.randomUUID(),
      netEntityId,
      slot,
      body,
      ready: false,
      input: new WorldV0ScheduledInputBuffer(),
    };

    this.ensureEpochPinned();
    this.ctx.acceptWebSocket(server, ["shared-yard-v0-player"]);
    this.players.set(server, player);
    this.send(server, {
      type: "world_v0_welcome",
      revision: WORLD_V0_SERVER_REVISION,
      selfSessionId: player.sessionId,
      selfNetEntityId: player.netEntityId,
      slot,
      waitingForPeer: this.players.size < MAX_PLAYERS,
      simulation: worldV0SimulationContract(),
      state: this.snapshotState(),
      serverTime: Date.now(),
      ...this.identityPayload(),
    });
    this.broadcast({
      type: "world_v0_roster",
      boundaryTick: this.tick,
      players: this.snapshotState().players.map(({ id, sessionId, slot, netEntityId }) => ({ id, sessionId, slot, netEntityId })),
      ...this.identityPayload(),
    });
    return new Response(null, { status: 101, webSocket: client });
  }

  private maybeStartProtocol(): void {
    if (this.protocolStartTick !== null || this.players.size !== MAX_PLAYERS) return;
    if ([...this.players.values()].some((player) => !player.ready)) return;

    this.protocolStartTick = this.tick + WORLD_V0_TIMING.protocolStartDelayTicks;
    this.broadcast({
      type: "world_v0_start",
      revision: WORLD_V0_SERVER_REVISION,
      boundaryTick: this.tick,
      protocolStartTick: this.protocolStartTick,
      simulation: worldV0SimulationContract(),
      state: this.snapshotState(),
      serverTime: Date.now(),
      ...this.identityPayload(),
    });
    this.startLoop();
  }

  private createWorld(worldId: string): void {
    this.destroyWorld();
    const def = b3.b3DefaultWorldDef();
    def.gravity = [...WORLD_V0_ARENA.gravity];
    this.world = b3.b3CreateWorld(def);
    this.worldId = worldId;
    this.worldEpoch = crypto.randomUUID();
    this.tick = 0;
    this.snapshotSequence = 0;
    this.protocolStartTick = null;
    this.droppedTicks = 0;
    this.catchupSteps = 0;
    this.failure = null;

    for (const box of WORLD_V0_ARENA.staticBoxes) {
      const bodyDef = b3.b3DefaultBodyDef();
      bodyDef.position = [...box.position];
      const body = b3.b3CreateBody(this.world, bodyDef);
      b3.b3CreateBoxShape(
        body,
        b3.b3DefaultShapeDef(),
        box.halfExtents[0],
        box.halfExtents[1],
        box.halfExtents[2],
      );
    }

    this.props = [];
    for (const authored of WORLD_V0_PROP_LAYOUT) {
      const initial: Vec3 = [...authored.position];
      const bodyDef = b3.b3DefaultBodyDef();
      bodyDef.type = b3.b3BodyType.b3_dynamicBody;
      bodyDef.position = initial;
      bodyDef.linearDamping = WORLD_V0_PROP_PHYSICS.linearDamping;
      bodyDef.angularDamping = WORLD_V0_PROP_PHYSICS.angularDamping;
      const body = b3.b3CreateBody(this.world, bodyDef);
      b3.b3Body_SetName(body, authored.id);
      const shapeDef = b3.b3DefaultShapeDef();
      shapeDef.density = WORLD_V0_PROP_PHYSICS.density;
      shapeDef.baseMaterial.friction = WORLD_V0_PROP_PHYSICS.friction;
      shapeDef.baseMaterial.restitution = WORLD_V0_PROP_PHYSICS.restitution;
      b3.b3CreateBoxShape(
        body,
        shapeDef,
        WORLD_V0_PROP_PHYSICS.halfExtents[0],
        WORLD_V0_PROP_PHYSICS.halfExtents[1],
        WORLD_V0_PROP_PHYSICS.halfExtents[2],
      );
      this.props.push({ id: authored.id, cluster: authored.cluster, body, initial });
    }
  }

  private createPlayerBody(start: readonly [number, number, number]): BodyId {
    if (!this.world) throw new Error("world_not_ready");
    const bodyDef = b3.b3DefaultBodyDef();
    bodyDef.type = b3.b3BodyType.b3_dynamicBody;
    bodyDef.position = [...start];
    bodyDef.linearDamping = WORLD_V0_PLAYER_PHYSICS.linearDamping;
    bodyDef.angularDamping = WORLD_V0_PLAYER_PHYSICS.angularDamping;
    const body = b3.b3CreateBody(this.world, bodyDef);
    const shapeDef = b3.b3DefaultShapeDef();
    shapeDef.density = WORLD_V0_PLAYER_PHYSICS.density;
    shapeDef.baseMaterial.friction = WORLD_V0_PLAYER_PHYSICS.friction;
    shapeDef.baseMaterial.restitution = WORLD_V0_PLAYER_PHYSICS.restitution;
    b3.b3CreateCapsuleShape(body, shapeDef, {
      center1: [...WORLD_V0_PLAYER_PHYSICS.capsuleCenter1],
      center2: [...WORLD_V0_PLAYER_PHYSICS.capsuleCenter2],
      radius: WORLD_V0_PLAYER_PHYSICS.capsuleRadius,
    });
    b3.b3Body_SetMotionLocks(body, {
      linearX: false,
      linarY: false,
      linearZ: false,
      angularX: WORLD_V0_PLAYER_PHYSICS.angularLocks[0],
      angularY: WORLD_V0_PLAYER_PHYSICS.angularLocks[1],
      angularZ: WORLD_V0_PLAYER_PHYSICS.angularLocks[2],
    });
    return body;
  }

  private ensureEpochPinned(): void {
    if (this.epochPinTimer) return;
    // acceptWebSocket() enables hibernation. The first World V0 envelope has no
    // reconstruction contract, so a live epoch must remain non-hibernateable.
    // Cloudflare documents scheduled callbacks as a hibernation blocker.
    this.epochPinTimer = setInterval(() => {
      if (!this.world) this.stopEpochPin();
    }, 1000);
  }

  private stopEpochPin(): void {
    if (this.epochPinTimer) clearInterval(this.epochPinTimer);
    this.epochPinTimer = null;
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
      while (this.accumulatorMs >= STEP_MS && steps < WORLD_V0_TIMING.maxCatchupSteps) {
        this.stepCanonicalTick();
        steps += 1;
        this.accumulatorMs -= STEP_MS;
        if (!this.world || this.loopTimer === null) break;
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
      this.broadcast({ type: "world_v0_error", error: this.failure, boundaryTick: this.tick, ...this.identityPayloadSafe() });
      this.endEpoch(`authority_failure:${this.failure}`);
    }
  }

  private stepCanonicalTick(): void {
    if (!this.world) return;
    const targetTick = this.tick;
    const active = this.protocolStartTick !== null && targetTick >= this.protocolStartTick;
    const consumed: Array<{
      sessionId: string;
      playerId: string;
      netEntityId: string;
      slot: number;
    } & WorldV0ConsumedInput> = [];
    let leaseExpiredBy: SharedYardPlayer | null = null;

    for (const player of this.sortedPlayers()) {
      const input = active
        ? player.input.consume(targetTick)
        : { targetTick, x: 0, z: 0, fresh: false, source: "held" as const, missingStreak: 0 };
      this.applyIntent(player.body, input.x, input.zi;
      consumed.push({
        sessionId: player.sessionId,
        playerId: player.playerId,
        netEntityId: player.netEntityId,
        slot: player.slot,
        ...input,
      });
      if (active && input.source === "lease_expired" && !leaseExpiredBy) leaseExpiredBy = player;
    }

    b3.b3World_Step(this.world, 1 / WORLD_V0_TIMING.simulationHz, WORLD_V0_TIMING.substeps);
    this.tick = targetTick + 1;

    if (active) {
      this.broadcast({
        type: "world_v0_consumed",
        targetTick,
        boundaryTick: this.tick,
        players: consumed,
        serverTime: Date.now(),
        ...this.identityPayload(),
      });
    }

    if (leaseExpiredBy) {
      this.endEpoch(`input_lease_expired:${leaseExpiredBy.netEntityId}`);
      return;
    }

    if (this.tick % SNAPSHOT_EVERY_TICKS === 0) this.broadcastSnapshot();
  }

  private applyIntent(body: BodyId, inputX: number, inputZ: number): void {
    const velocity = readVec3(b3.b3Body_GetLinearVelocity, body);
    const hasInput = Math.hypot(inputX, inputZ) > 0.01;
    const [nextX, nextZ] = moveToward2(
      velocity[0],
      velocity[2],
      inputX * WORLD_V0_MOVEMENT.playerSpeed,
      inputZ * WORLD_V0_MOVEMENT.playerSpeed,
      (hasInput ? WORLD_V0_MOVEMENT.playerAcceleration : WORLD_V0_MOVEMENT.playerDeceleration) /
        WORLD_V0_TIMING.simulationHz,
    );
    b3.b3Body_SetLinearVelocity(body, [nextX, velocity[1], nextZ]);
  }

  private sampleScene(): SharedYardSceneSample {
    if (!this.world) return { finite: true, players: [], props: [] };
    let finite = true;
    const players: SharedYardSceneSample["players"] = [];
    const props: SharedYardSceneSample["props"] = [];

    for (const player of this.sortedPlayers()) {
      const dynamic = readDynamicState(player.netEntityId, player.body);
      finite = finite && finiteDynamicState(dynamic);
      players.push({
        id: player.playerId,
        sessionId: player.sessionId,
        slot: player.slot,
        ...dynamic,
      });
    }

    for (const prop of this.props) {
      const dynamic = readDynamicState(prop.id, prop.body);
      finite = finite && finiteDynamicState(dynamic);
      props.push({ id: prop.id, cluster: prop.cluster, ...dynamic });
    }
    return { finite, players, props };
  }

  private packStateGuard(sample: SharedYardSceneSample): { revision: string; packed: string } | null {
    const byId = new Map<string, DynamicState>();
    for (const player of sample.players) byId.set(player.netEntityId, player);
    for (const prop of sample.props) byId.set(prop.netEntityId, prop);
    if (byId.size !== WORLD_V0_NET_ENTITY_ORDER.length) return null;

    let packed = "";
    for (const netEntityId of WORLD_V0_NET_ENTITY_ORDER) {
      const state = byId.get(netEntityId);
      if (!state) return null;
      for (const value of flattenDynamicState(state)) packed += encodeFloat32Bits(value);
    }
    return { revision: WORLD_V0_STATE_GUARD_REVISION, packed };
  }

  private snapshotState() {
    const sample = this.sampleScene();
    return {
      boundaryTick: this.tick,
      sequence: this.snapshotSequence,
      players: sample.players,
      props: sample.props,
      finite: sample.finite,
      stateGuard: this.packStateGuard(sample),
    };
  }

  private broadcastSnapshot(): void {
    this.snapshotSequence += 1;
    this.broadcast({
      type: "world_v0_snapshot",
      revision: WORLD_V0_SERVER_REVISION,
      ...this.snapshotState(),
      serverTime: Date.now(),
      ...this.identityPayload(),
    });
  }

  private sortedPlayers(): SharedYardPlayer[] {
    return [...this.players.values()].sort((a, b) => a.slot - b.slot);
  }

  private identityPayload() {
    if (!this.worldId || !this.worldEpoch) throw new Error("world_identity_not_ready");
    return {
      worldId: this.worldId,
      worldEpoch: this.worldEpoch,
      simBuildId: WORLD_V0_SIM_BUILD_ID,
      clientSimRevision: WORLD_V0_CLIENT_SIM_REVISION,
    };
  }

  private identityPayloadSafe() {
    return {
      worldId: this.worldId,
      worldEpoch: this.worldEpoch,
      simBuildId: WORLD_V0_SIM_BUILD_ID,
      clientSimRevision: WORLD_V0_CLIENT_SIM_REVISION,
    };
  }

  private expectedIdentity() {
    if (!this.worldId || !this.worldEpoch) throw new Error("world_identity_not_ready");
    return expectedWorldV0Identity(this.worldId, this.worldEpoch);
  }

  private endEpochFromSocket(ws: WebSocket, reason: string): void {
    if (!this.players.has(ws)) return;
    this.endEpoch(reason);
  }

  private endEpoch(reason: string): void {
    if (this.resetting) return;
    this.resetting = true;
    const identity = this.identityPayloadSafe();
    try {
      this.broadcast({
        type: "world_v0_epoch_ended",
        reason,
        boundaryTick: this.tick,
        serverTime: Date.now(),
        ...identity,
      });
      for (const socket of this.players.keys()) {
        try { socket.close(1012, reason); } catch { /* lifecycle race */ }
      }
      this.players.clear();
      this.stopLoop();
      this.stopEpochPin();
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
    this.worldId = null;
    this.worldEpoch = null;
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
