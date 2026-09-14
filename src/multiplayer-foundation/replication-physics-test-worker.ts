import { DurableObject } from "cloudflare:workers";
import {
  WORLD_V0_SIM_BUILD_ID,
  WORLD_V0_STATE_COMPONENTS,
} from "../world-v0-contract.ts";
import { FoundationActorInputRegistry } from "./actor-input-registry.ts";
import { FoundationCheckpointSqliteStorage } from "./checkpoint-sqlite-storage.ts";
import {
  publishFoundationCheckpoint,
  recoverFoundationCheckpoint,
} from "./checkpoint-store.ts";
import {
  createFoundationClientBootstrap,
  type FoundationClientExecutionProfile,
} from "./client-bootstrap.ts";
import { createFoundationClientRuntimeBootstrap } from "./client-runtime-bootstrap.ts";
import { FoundationEntityTopology } from "./entity-topology.ts";
import {
  decodeFoundationReplicationLiveCheckpoint,
  encodeFoundationReplicationLiveCheckpoint,
  FOUNDATION_REPLICATION_LIVE_CHECKPOINT_REVISION,
  type FoundationReplicationLiveBindingState,
  type FoundationReplicationLiveCheckpoint,
  type FoundationReplicationLiveMode,
} from "./replication-live-checkpoint.ts";
import {
  FoundationReplicationPhysicsRuntime,
  type FoundationReplicationPhysicsActorBinding,
} from "./replication-physics-runtime.ts";
import {
  FOUNDATION_REPLICATION_PROTOCOL_REVISION,
  foundationReplicationInputCommit,
  foundationReplicationInputResult,
  foundationReplicationRuntimeSync,
  parseFoundationReplicationClientMessage,
  sameFoundationExecutionProfile,
  type FoundationRuntimeSyncReason,
} from "./replication-protocol.ts";
import { FoundationRosterMachine } from "./roster-machine.ts";

const WORLD_EPOCH = "foundation-local-physics-epoch-1";
const CAPACITY = 3;
const MAX_FUTURE_TICKS = 80;
const NEUTRAL_CONTINUATION_TICKS = 30;
const INTERACTIVE_CONTINUATION_TICKS = 60;
const RECONNECT_SEGMENT_TICKS = 30;
const INPUT_BATCH_TICKS = 15;
const CHECKPOINT_CHUNK_BYTES = 32 * 1024;
const SOCKET_ATTACHMENT_REVISION = "multiplayer-foundation-physics-socket-attachment-v1";
const RUN_PATTERN = /^[A-Za-z0-9_-]{1,40}$/;
const PROFILE: FoundationClientExecutionProfile = {
  profileId: "shared-yard-foundation-client-v1",
  buildId: WORLD_V0_SIM_BUILD_ID,
  stateSchemaId: "shared-yard-rigidbody-f32-13-v1",
};
const PERSISTENT_WORLD = Array.from({ length: 12 }, (_, index) => `prop-${index}`);

type PhysicsReplicationEnv = {
  FOUNDATION_REPLICATION_PHYSICS_TEST: DurableObjectNamespace<FoundationReplicationPhysicsTestWorld>;
};

type ClientBinding = FoundationReplicationLiveBindingState & {
  socket: WebSocket | null;
};

type PhysicsSocketAttachment = FoundationReplicationLiveBindingState & {
  revision: typeof SOCKET_ATTACHMENT_REVISION;
  protocolRevision: typeof FOUNDATION_REPLICATION_PROTOCOL_REVISION;
  worldId: string;
  worldEpoch: string;
};

type RestoreState = "pending" | "empty" | "restored" | "failed";

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function normalizeRun(raw: string | null): string | null {
  const value = (raw ?? "").trim();
  return RUN_PATTERN.test(value) ? value : null;
}

function expectedWorldId(run: string): string {
  return `foundation-physics-replication-${run}`;
}

function modeForRun(run: string): FoundationReplicationLiveMode {
  if (run.startsWith("reconnect-")) return "reconnect";
  if (run.startsWith("interactive-")) return "interactive";
  return "neutral";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function bindingState(binding: ClientBinding): FoundationReplicationLiveBindingState {
  return {
    actorSessionId: binding.actorSessionId,
    actorId: binding.actorId,
    lastTopologyRevision: binding.lastTopologyRevision,
    expectedSyncId: binding.expectedSyncId,
    expectedRuntimeDigest: binding.expectedRuntimeDigest,
    readyTopologyRevision: binding.readyTopologyRevision,
    inputBatches: binding.inputBatches,
  };
}

function parseSocketAttachment(value: unknown): PhysicsSocketAttachment | null {
  if (!isRecord(value)) return null;
  if (value.revision !== SOCKET_ATTACHMENT_REVISION) return null;
  if (value.protocolRevision !== FOUNDATION_REPLICATION_PROTOCOL_REVISION) return null;
  if (typeof value.worldId !== "string" || value.worldId.length === 0) return null;
  if (value.worldEpoch !== WORLD_EPOCH) return null;
  if (typeof value.actorSessionId !== "string" || value.actorSessionId.length === 0) return null;
  if (typeof value.actorId !== "string" || !/^actor:\d+$/.test(value.actorId)) return null;
  if (typeof value.lastTopologyRevision !== "number" || !Number.isSafeInteger(value.lastTopologyRevision) || value.lastTopologyRevision < 0) return null;
  if (typeof value.expectedSyncId !== "string" || value.expectedSyncId.length === 0) return null;
  if (typeof value.expectedRuntimeDigest !== "string" || value.expectedRuntimeDigest.length === 0) return null;
  if (
    value.readyTopologyRevision !== null
    && (typeof value.readyTopologyRevision !== "number" || !Number.isSafeInteger(value.readyTopologyRevision) || value.readyTopologyRevision < 0)
  ) return null;
  if (typeof value.inputBatches !== "number" || !Number.isSafeInteger(value.inputBatches) || value.inputBatches < 0) return null;
  return value as PhysicsSocketAttachment;
}

export class FoundationReplicationPhysicsTestWorld extends DurableObject<PhysicsReplicationEnv> {
  private readonly constructorNonce = crypto.randomUUID();
  private readonly constructorBornAtMs = Date.now();
  private readonly checkpointStorage: FoundationCheckpointSqliteStorage;
  private roster = new FoundationRosterMachine({ worldEpoch: WORLD_EPOCH, capacity: CAPACITY });
  private topology = new FoundationEntityTopology(WORLD_EPOCH, PERSISTENT_WORLD);
  private inputs = new FoundationActorInputRegistry(WORLD_EPOCH, MAX_FUTURE_TICKS);
  private physics = new FoundationReplicationPhysicsRuntime();
  private readonly bindingBySession = new Map<string, ClientBinding>();
  private readonly sessionBySocket = new Map<WebSocket, string>();
  private readonly propStartXZ = new Map<string, readonly [number, number]>();
  private readonly resumedSessions = new Set<string>();
  private restoreState: RestoreState = "pending";
  private restoreError: string | null = null;
  private checkpointGeneration = 0;
  private checkpointPublishes = 0;
  private checkpointPayloadBytes = 0;
  private restoredCheckpointTick: number | null = null;
  private recoveredSocketBindings = 0;
  private worldId: string | null = null;
  private mode: FoundationReplicationLiveMode = "neutral";
  private syncSequence = 0;
  private syncsSent = 0;
  private correctionSyncs = 0;
  private resumeSyncs = 0;
  private inputCommitsSent = 0;
  private committedInputRecords = 0;
  private acceptedInputRecords = 0;
  private invalidMessages = 0;
  private staleReady = 0;
  private completedContinuationTicks = 0;
  private finalGuardPacked: string | null = null;
  private finalSeedBytes = 0;
  private finalSeedFnv1a32: string | null = null;
  private maxPropHorizontalDisplacement = 0;

  constructor(ctx: DurableObjectState, env: PhysicsReplicationEnv) {
    super(ctx, env);
    this.checkpointStorage = new FoundationCheckpointSqliteStorage(ctx.storage);
    ctx.blockConcurrencyWhile(async () => {
      try {
        const recovered = await recoverFoundationCheckpoint(this.checkpointStorage);
        if (!recovered) {
          if (ctx.getWebSockets().length > 0) {
            throw new Error("hibernation WebSockets survived without a durable live authority checkpoint");
          }
          this.restoreState = "empty";
          return;
        }
        const checkpoint = decodeFoundationReplicationLiveCheckpoint(recovered.payload);
        if (recovered.head.worldEpoch !== checkpoint.worldEpoch) throw new Error("live checkpoint HEAD WorldEpoch mismatch");
        if (recovered.head.canonicalTick !== checkpoint.canonicalTick) throw new Error("live checkpoint HEAD canonical tick mismatch");
        this.restoreLiveCheckpoint(checkpoint, recovered.head.generation, recovered.payload.byteLength);
        this.restoreState = "restored";
      } catch (error) {
        this.restoreState = "failed";
        this.restoreError = error instanceof Error ? error.stack ?? error.message : String(error);
      }
    });
  }

  async fetch(request: Request): Promise<Response> {
    if (this.restoreState === "failed") {
      return json({ ok: false, error: "authority_restore_failed", detail: this.restoreError, constructorNonce: this.constructorNonce }, 503);
    }
    const url = new URL(request.url);
    const run = normalizeRun(url.searchParams.get("run"));
    if (!run) return json({ ok: false, error: "invalid_run" }, 400);
    const requestedWorldId = expectedWorldId(run);
    if (this.worldId !== null && this.worldId !== requestedWorldId) {
      return json({ ok: false, error: "world_id_mismatch" }, 409);
    }
    if (this.worldId === null) {
      this.worldId = requestedWorldId;
      this.mode = modeForRun(run);
    }
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return json(this.status());
    const [client, server] = Object.values(new WebSocketPair()) as [WebSocket, WebSocket];
    this.ctx.acceptWebSocket(server, ["foundation-replication-physics-test"]);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(socket: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    if (this.restoreState === "failed") return this.closePolicy(socket, "authority_restore_failed");
    if (typeof raw !== "string") {
      this.invalidMessages += 1;
      this.closePolicy(socket, "text_frames_only");
      return;
    }
    const message = parseFoundationReplicationClientMessage(raw);
    if (!message) {
      this.invalidMessages += 1;
      this.closePolicy(socket, "invalid_message");
      return;
    }
    if (message.type === "foundation_join") {
      this.handleJoin(socket, message);
      return;
    }
    if (message.type === "foundation_resume") {
      this.handleResume(socket, message);
      return;
    }

    const actorSessionId = this.sessionBySocket.get(socket);
    const binding = actorSessionId ? this.bindingBySession.get(actorSessionId) : undefined;
    if (!binding || binding.socket !== socket) return this.closePolicy(socket, "unbound_transport");
    if (message.worldId !== this.worldId || message.actorSessionId !== binding.actorSessionId) {
      return this.closePolicy(socket, "transport_identity_mismatch");
    }
    if (message.worldEpoch !== WORLD_EPOCH) return this.closePolicy(socket, "world_epoch_mismatch");

    if (message.type === "foundation_runtime_ready") {
      if (message.syncId !== binding.expectedSyncId) {
        this.staleReady += 1;
        return;
      }
      if (message.runtimeDigest !== binding.expectedRuntimeDigest) return this.closePolicy(socket, "runtime_digest_mismatch");
      binding.readyTopologyRevision = binding.lastTopologyRevision;
      this.persistSocketAttachment(binding);
      return;
    }
    if (message.type !== "foundation_input_batch") return this.closePolicy(socket, "unsupported_bound_message");

    const topology = this.topology.snapshot();
    if (message.actorId !== binding.actorId || message.topologyRevision !== topology.topologyRevision) {
      return this.closePolicy(socket, "input_identity_or_topology_mismatch");
    }
    if (binding.readyTopologyRevision !== topology.topologyRevision) return this.closePolicy(socket, "input_before_runtime_ready");

    const authorityBoundaryTick = this.roster.snapshot().currentTick;
    const committedRecords: Array<{ targetTick: number; x: number; z: number }> = [];
    const records = message.records.map((record) => {
      const acceptance = this.inputs.schedule({
        actorId: binding.actorId,
        actorSessionId: binding.actorSessionId,
        targetTick: record.targetTick,
        x: record.x,
        z: record.z,
      }, authorityBoundaryTick);
      if (acceptance.status === "accepted" || acceptance.status === "superseded") {
        this.acceptedInputRecords += 1;
        committedRecords.push({ targetTick: record.targetTick, x: record.x, z: record.z });
      }
      return { actorId: acceptance.actorId, targetTick: acceptance.targetTick, status: acceptance.status };
    });
    binding.inputBatches += 1;
    this.persistSocketAttachment(binding);
    this.send(socket, foundationReplicationInputResult({
      worldId: this.worldId!,
      worldEpoch: WORLD_EPOCH,
      actorSessionId: binding.actorSessionId,
      actorId: binding.actorId,
      batchSeq: message.batchSeq,
      records,
    }));
    if (this.usesCanonicalInputCommits() && committedRecords.length > 0) {
      this.committedInputRecords += committedRecords.length;
      for (const recipient of this.bindingBySession.values()) {
        if (!this.isCurrentTransportConnected(recipient) || !recipient.socket) continue;
        this.send(recipient.socket, foundationReplicationInputCommit({
          worldId: this.worldId!,
          worldEpoch: WORLD_EPOCH,
          recipientActorSessionId: recipient.actorSessionId,
          sourceActorSessionId: binding.actorSessionId,
          actorId: binding.actorId,
          topologyRevision: topology.topologyRevision,
          batchSeq: message.batchSeq,
          authorityBoundaryTick,
          records: committedRecords,
        }));
        this.inputCommitsSent += 1;
      }
    }
    await this.maybeAdvanceContinuation();
  }

  async webSocketClose(socket: WebSocket): Promise<void> {
    this.detachTransport(socket);
  }

  async webSocketError(socket: WebSocket): Promise<void> {
    this.detachTransport(socket);
  }

  private handleJoin(
    socket: WebSocket,
    message: Extract<NonNullable<ReturnType<typeof parseFoundationReplicationClientMessage>>, { type: "foundation_join" }>,
  ): void {
    if (this.sessionBySocket.has(socket)) return this.closePolicy(socket, "duplicate_join_on_transport");
    if (message.worldId !== this.worldId) return this.closePolicy(socket, "join_world_mismatch");
    if (!sameFoundationExecutionProfile(message.executionProfile, PROFILE)) return this.closePolicy(socket, "execution_profile_mismatch");
    if (this.bindingBySession.has(message.actorSessionId)) return this.closePolicy(socket, "duplicate_actor_session");
    if (this.bindingBySession.size >= CAPACITY) return this.closePolicy(socket, "capacity_reached");

    const previousTopologyRevision = this.topology.snapshot().topologyRevision;
    const effectiveTick = this.roster.snapshot().currentTick + 1;
    this.roster.queue({
      kind: "join",
      mutationId: `join-${effectiveTick}-${message.actorSessionId}`,
      effectiveTick,
      actorSessionId: message.actorSessionId,
    });
    const outcomes = this.roster.advanceTo(effectiveTick);
    const joined = outcomes.find((outcome) => outcome.status === "joined" && outcome.actorSessionId === message.actorSessionId);
    if (!joined || joined.status !== "joined") return this.closePolicy(socket, "join_mutation_failed");

    this.physics.addActor(joined.actorId, joined.actorSessionId);
    const roster = this.roster.snapshot();
    this.topology.syncRoster(roster);
    this.inputs.syncRoster(roster);
    this.physics.step(roster.actors.map((actor) => {
      const input = this.inputs.consume(actor.actorId, effectiveTick);
      return { actorId: actor.actorId, x: input.x, z: input.z };
    }));

    const binding: ClientBinding = {
      socket,
      actorSessionId: message.actorSessionId,
      actorId: joined.actorId,
      lastTopologyRevision: 0,
      expectedSyncId: "",
      expectedRuntimeDigest: "",
      readyTopologyRevision: null,
      inputBatches: 0,
    };
    this.bindingBySession.set(binding.actorSessionId, binding);
    this.sessionBySocket.set(socket, binding.actorSessionId);
    if (this.bindingBySession.size === CAPACITY && this.propStartXZ.size === 0) {
      for (const propId of PERSISTENT_WORLD) {
        const state = this.physics.entityState(propId);
        this.propStartXZ.set(propId, [state[0], state[2]]);
      }
    }
    this.broadcastRuntimeSync(binding.actorSessionId, previousTopologyRevision, false);
  }

  private handleResume(
    socket: WebSocket,
    message: Extract<NonNullable<ReturnType<typeof parseFoundationReplicationClientMessage>>, { type: "foundation_resume" }>,
  ): void {
    if (this.mode !== "reconnect") return this.closePolicy(socket, "resume_not_enabled");
    if (this.sessionBySocket.has(socket)) return this.closePolicy(socket, "resume_transport_already_bound");
    if (message.worldId !== this.worldId) return this.closePolicy(socket, "resume_world_mismatch");
    if (message.worldEpoch !== WORLD_EPOCH) return this.closePolicy(socket, "resume_world_epoch_mismatch");
    if (!sameFoundationExecutionProfile(message.executionProfile, PROFILE)) return this.closePolicy(socket, "resume_execution_profile_mismatch");

    const topology = this.topology.snapshot();
    if (message.topologyRevision !== topology.topologyRevision || message.topologyDigest !== topology.topologyDigest) {
      return this.closePolicy(socket, "resume_topology_mismatch");
    }
    const actor = this.roster.snapshot().actors.find((candidate) => candidate.actorSessionId === message.actorSessionId);
    if (!actor || actor.actorId !== message.actorId) return this.closePolicy(socket, "resume_actor_identity_mismatch");
    if (actor.transportConnected) return this.closePolicy(socket, "resume_transport_still_connected");
    const binding = this.bindingBySession.get(message.actorSessionId);
    if (!binding || binding.actorId !== message.actorId) return this.closePolicy(socket, "resume_binding_missing");
    if (binding.socket !== null) return this.closePolicy(socket, "resume_binding_still_has_transport");

    binding.socket = socket;
    binding.readyTopologyRevision = null;
    this.sessionBySocket.set(socket, binding.actorSessionId);
    if (!this.roster.setTransportConnected(binding.actorSessionId, true)) {
      this.sessionBySocket.delete(socket);
      binding.socket = null;
      return this.closePolicy(socket, "resume_roster_rebind_failed");
    }
    this.resumedSessions.add(binding.actorSessionId);
    this.sendRuntimeSync(binding, "resume", topology.topologyRevision);
  }

  private createRuntimeBootstrap(selfActorSessionId: string) {
    const roster = this.roster.snapshot();
    const topology = this.topology.snapshot();
    const seed = this.physics.captureSeed(WORLD_EPOCH, roster.currentTick, topology);
    const bootstrap = createFoundationClientBootstrap({
      worldEpoch: WORLD_EPOCH,
      canonicalTick: roster.currentTick,
      selfActorSessionId,
      executionProfile: PROFILE,
      topology,
      stateComponents: WORLD_V0_STATE_COMPONENTS,
      entityStates: topology.entityOrder.map((netEntityId) => ({
        netEntityId,
        values: this.physics.entityState(netEntityId).map((value) => Math.fround(value)),
      })),
      inputBaselines: roster.actors.map((actor) => ({
        netEntityId: actor.actorId,
        actorSessionId: actor.actorSessionId,
        x: 0,
        z: 0,
        jump: false,
      })),
    });
    return createFoundationClientRuntimeBootstrap({ bootstrap, executionSeed: seed });
  }

  private sendRuntimeSync(
    binding: ClientBinding,
    reason: FoundationRuntimeSyncReason,
    previousTopologyRevision: number | null,
  ): void {
    if (!binding.socket) throw new Error(`cannot send runtime sync without transport for ${binding.actorSessionId}`);
    const runtimeBootstrap = this.createRuntimeBootstrap(binding.actorSessionId);
    if (reason === "correction") {
      this.finalSeedBytes = runtimeBootstrap.executionSeed.byteLength;
      this.finalSeedFnv1a32 = runtimeBootstrap.executionSeed.fnv1a32;
    }
    const syncId = `physics-sync-${++this.syncSequence}-${this.roster.snapshot().currentTick}-${binding.actorId.replace(":", "-")}`;
    binding.lastTopologyRevision = this.topology.snapshot().topologyRevision;
    binding.expectedSyncId = syncId;
    binding.expectedRuntimeDigest = runtimeBootstrap.envelopeDigest;
    binding.readyTopologyRevision = null;
    this.syncsSent += 1;
    if (reason === "correction") this.correctionSyncs += 1;
    if (reason === "resume") this.resumeSyncs += 1;
    this.persistSocketAttachment(binding);
    this.send(binding.socket, foundationReplicationRuntimeSync({
      syncId,
      reason,
      worldId: this.worldId!,
      worldEpoch: WORLD_EPOCH,
      actorSessionId: binding.actorSessionId,
      previousTopologyRevision,
      runtimeBootstrap,
    }));
  }

  private broadcastRuntimeSync(
    newSessionId: string | null,
    previousTopologyRevision: number,
    correction: boolean,
  ): void {
    const topology = this.topology.snapshot();
    for (const binding of this.bindingBySession.values()) {
      if (!this.isCurrentTransportConnected(binding)) continue;
      const isNew = binding.actorSessionId === newSessionId;
      const reason: FoundationRuntimeSyncReason = correction ? "correction" : isNew ? "join" : "topology_change";
      const previous = isNew
        ? null
        : correction
          ? topology.topologyRevision
          : binding.lastTopologyRevision || previousTopologyRevision;
      this.sendRuntimeSync(binding, reason, previous);
    }
  }

  private persistSocketAttachment(binding: ClientBinding): void {
    if (!binding.socket || !this.worldId) return;
    const attachment: PhysicsSocketAttachment = {
      revision: SOCKET_ATTACHMENT_REVISION,
      protocolRevision: FOUNDATION_REPLICATION_PROTOCOL_REVISION,
      worldId: this.worldId,
      worldEpoch: WORLD_EPOCH,
      ...bindingState(binding),
    };
    binding.socket.serializeAttachment(attachment);
  }

  private usesCanonicalInputCommits(): boolean {
    return this.mode !== "neutral";
  }

  private isCurrentTransportConnected(binding: ClientBinding): boolean {
    return binding.socket !== null && this.sessionBySocket.get(binding.socket) === binding.actorSessionId;
  }

  private async maybeAdvanceContinuation(): Promise<void> {
    if (this.bindingBySession.size !== CAPACITY) return;

    if (this.mode === "reconnect") {
      if (this.completedContinuationTicks === 0) {
        if (![...this.bindingBySession.values()].every((binding) => binding.inputBatches === 2)) return;
        if (this.acceptedInputRecords !== CAPACITY * RECONNECT_SEGMENT_TICKS) return;
        await this.advanceContinuationSegment(RECONNECT_SEGMENT_TICKS);
        return;
      }
      if (this.completedContinuationTicks === RECONNECT_SEGMENT_TICKS) {
        if (this.resumedSessions.size !== 1) return;
        if (![...this.bindingBySession.values()].every((binding) => binding.inputBatches === 4)) return;
        if (this.acceptedInputRecords !== CAPACITY * RECONNECT_SEGMENT_TICKS * 2) return;
        await this.advanceContinuationSegment(RECONNECT_SEGMENT_TICKS);
      }
      return;
    }

    if (this.completedContinuationTicks !== 0) return;
    const continuationTicks = this.mode === "interactive" ? INTERACTIVE_CONTINUATION_TICKS : NEUTRAL_CONTINUATION_TICKS;
    const requiredInputBatches = continuationTicks / INPUT_BATCH_TICKS;
    if (![...this.bindingBySession.values()].every((binding) => binding.inputBatches === requiredInputBatches)) return;
    if (this.acceptedInputRecords !== CAPACITY * continuationTicks) return;
    await this.advanceContinuationSegment(continuationTicks);
  }

  private async advanceContinuationSegment(segmentTicks: number): Promise<void> {
    const startTick = this.roster.snapshot().currentTick;
    for (let targetTick = startTick + 1; targetTick <= startTick + segmentTicks; targetTick += 1) {
      const outcomes = this.roster.advanceTo(targetTick);
      if (outcomes.length !== 0) throw new Error("unexpected topology mutation during physics continuation");
      const roster = this.roster.snapshot();
      const topology = this.topology.syncRoster(roster);
      this.inputs.syncRoster(roster);
      this.physics.step(roster.actors.map((actor) => {
        const input = this.inputs.consume(actor.actorId, targetTick);
        return { actorId: actor.actorId, x: input.x, z: input.z };
      }));
      if (targetTick === startTick + segmentTicks) {
        this.finalGuardPacked = this.physics.captureGuard(topology).packed;
      }
    }
    this.completedContinuationTicks += segmentTicks;
    if (this.mode !== "neutral") {
      for (const propId of PERSISTENT_WORLD) {
        const start = this.propStartXZ.get(propId);
        if (!start) throw new Error(`interactive prop baseline missing ${propId}`);
        const state = this.physics.entityState(propId);
        this.maxPropHorizontalDisplacement = Math.max(
          this.maxPropHorizontalDisplacement,
          Math.hypot(state[0] - start[0], state[2] - start[1]),
        );
      }
    }
    this.broadcastRuntimeSync(null, this.topology.snapshot().topologyRevision, true);
    if (this.mode === "reconnect") await this.publishLiveCheckpoint();
  }

  private async publishLiveCheckpoint(): Promise<void> {
    if (this.mode !== "reconnect" || !this.worldId) return;
    const roster = this.roster.snapshot();
    const topology = this.topology.snapshot();
    const bindings = [...this.bindingBySession.values()]
      .sort((a, b) => Number(a.actorId.slice("actor:".length)) - Number(b.actorId.slice("actor:".length)))
      .map(bindingState);
    if (bindings.length !== roster.actors.length) throw new Error("live checkpoint binding coverage mismatch");
    for (const actor of roster.actors) {
      const binding = bindings.find((candidate) => candidate.actorSessionId === actor.actorSessionId);
      if (!binding || binding.actorId !== actor.actorId) throw new Error(`live checkpoint binding identity mismatch for ${actor.actorId}`);
    }
    const physicsSeed = this.physics.captureSeed(WORLD_EPOCH, roster.currentTick, topology);
    const checkpoint: FoundationReplicationLiveCheckpoint = {
      revision: FOUNDATION_REPLICATION_LIVE_CHECKPOINT_REVISION,
      protocolRevision: FOUNDATION_REPLICATION_PROTOCOL_REVISION,
      worldId: this.worldId,
      worldEpoch: WORLD_EPOCH,
      canonicalTick: roster.currentTick,
      topologyRevision: topology.topologyRevision,
      topologyDigest: topology.topologyDigest,
      mode: this.mode,
      rosterCheckpoint: this.roster.checkpoint(),
      inputCheckpoint: this.inputs.checkpoint(roster),
      physicsSeed,
      workerState: {
        syncSequence: this.syncSequence,
        syncsSent: this.syncsSent,
        correctionSyncs: this.correctionSyncs,
        resumeSyncs: this.resumeSyncs,
        inputCommitsSent: this.inputCommitsSent,
        committedInputRecords: this.committedInputRecords,
        acceptedInputRecords: this.acceptedInputRecords,
        invalidMessages: this.invalidMessages,
        staleReady: this.staleReady,
        completedContinuationTicks: this.completedContinuationTicks,
        finalGuardPacked: this.finalGuardPacked,
        finalSeedBytes: this.finalSeedBytes,
        finalSeedFnv1a32: this.finalSeedFnv1a32,
        maxPropHorizontalDisplacement: this.maxPropHorizontalDisplacement,
        propStartXZ: [...this.propStartXZ.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([entityId, [x, z]]) => ({ entityId, x, z })),
        resumedSessions: [...this.resumedSessions].sort(),
        bindings,
      },
    };
    const payload = encodeFoundationReplicationLiveCheckpoint(checkpoint);
    const head = await publishFoundationCheckpoint(this.checkpointStorage, {
      generation: this.checkpointGeneration + 1,
      worldEpoch: WORLD_EPOCH,
      canonicalTick: roster.currentTick,
      payload,
      chunkBytes: CHECKPOINT_CHUNK_BYTES,
    });
    const verified = await recoverFoundationCheckpoint(this.checkpointStorage);
    if (!verified || verified.head.generation !== head.generation || verified.head.canonicalTick !== roster.currentTick) {
      throw new Error("live checkpoint failed immediate durable recovery verification");
    }
    decodeFoundationReplicationLiveCheckpoint(verified.payload);
    this.checkpointGeneration = head.generation;
    this.checkpointPublishes += 1;
    this.checkpointPayloadBytes = payload.byteLength;
    this.restoredCheckpointTick = roster.currentTick;
  }

  private restoreLiveCheckpoint(
    checkpoint: FoundationReplicationLiveCheckpoint,
    generation: number,
    payloadBytes: number,
  ): void {
    if (checkpoint.worldEpoch !== WORLD_EPOCH) throw new Error("live checkpoint WorldEpoch mismatch");
    if (!checkpoint.worldId.startsWith("foundation-physics-replication-reconnect-")) {
      throw new Error("live checkpoint world is outside reconnect recovery scope");
    }
    if (checkpoint.mode !== "reconnect") throw new Error("live checkpoint mode is outside reconnect recovery scope");

    const roster = FoundationRosterMachine.fromCheckpoint(structuredClone(checkpoint.rosterCheckpoint));
    const rosterSnapshot = roster.snapshot();
    if (rosterSnapshot.currentTick !== checkpoint.canonicalTick) throw new Error("restored roster tick mismatch");
    if (rosterSnapshot.topologyRevision !== checkpoint.topologyRevision) throw new Error("restored roster topology revision mismatch");
    const inputs = FoundationActorInputRegistry.fromCheckpoint(structuredClone(checkpoint.inputCheckpoint), rosterSnapshot);
    const topology = new FoundationEntityTopology(WORLD_EPOCH, PERSISTENT_WORLD);
    const topologySnapshot = topology.syncRoster(rosterSnapshot);
    if (topologySnapshot.topologyRevision !== checkpoint.topologyRevision) throw new Error("restored topology revision mismatch");
    if (topologySnapshot.topologyDigest !== checkpoint.topologyDigest) throw new Error("restored topology digest mismatch");
    if (checkpoint.physicsSeed.worldEpoch !== WORLD_EPOCH || checkpoint.physicsSeed.canonicalTick !== checkpoint.canonicalTick) {
      throw new Error("restored physics seed canonical boundary mismatch");
    }
    if (
      checkpoint.physicsSeed.topologyRevision !== checkpoint.topologyRevision
      || checkpoint.physicsSeed.topologyDigest !== checkpoint.topologyDigest
    ) throw new Error("restored physics seed topology mismatch");
    const actorBindings: FoundationReplicationPhysicsActorBinding[] = rosterSnapshot.actors.map((actor) => ({
      actorId: actor.actorId,
      actorSessionId: actor.actorSessionId,
    }));
    const physics = FoundationReplicationPhysicsRuntime.fromSeed(checkpoint.physicsSeed, actorBindings);
    const restoredGuard = physics.captureGuard(topologySnapshot).packed;
    if (checkpoint.workerState.finalGuardPacked !== null && restoredGuard !== checkpoint.workerState.finalGuardPacked) {
      throw new Error("restored physics guard does not match durable checkpoint boundary");
    }

    this.roster = roster;
    this.inputs = inputs;
    this.topology = topology;
    this.physics = physics;
    this.worldId = checkpoint.worldId;
    this.mode = checkpoint.mode;
    this.syncSequence = checkpoint.workerState.syncSequence;
    this.syncsSent = checkpoint.workerState.syncsSent;
    this.correctionSyncs = checkpoint.workerState.correctionSyncs;
    this.resumeSyncs = checkpoint.workerState.resumeSyncs;
    this.inputCommitsSent = checkpoint.workerState.inputCommitsSent;
    this.committedInputRecords = checkpoint.workerState.committedInputRecords;
    this.acceptedInputRecords = checkpoint.workerState.acceptedInputRecords;
    this.invalidMessages = checkpoint.workerState.invalidMessages;
    this.staleReady = checkpoint.workerState.staleReady;
    this.completedContinuationTicks = checkpoint.workerState.completedContinuationTicks;
    this.finalGuardPacked = checkpoint.workerState.finalGuardPacked;
    this.finalSeedBytes = checkpoint.workerState.finalSeedBytes;
    this.finalSeedFnv1a32 = checkpoint.workerState.finalSeedFnv1a32;
    this.maxPropHorizontalDisplacement = checkpoint.workerState.maxPropHorizontalDisplacement;
    this.propStartXZ.clear();
    for (const entry of checkpoint.workerState.propStartXZ) this.propStartXZ.set(entry.entityId, [entry.x, entry.z]);
    this.resumedSessions.clear();
    for (const session of checkpoint.workerState.resumedSessions) this.resumedSessions.add(session);

    this.bindingBySession.clear();
    this.sessionBySocket.clear();
    for (const state of checkpoint.workerState.bindings) {
      const actor = rosterSnapshot.actors.find((candidate) => candidate.actorSessionId === state.actorSessionId);
      if (!actor || actor.actorId !== state.actorId) throw new Error(`restored binding identity mismatch for ${state.actorSessionId}`);
      if (state.lastTopologyRevision !== checkpoint.topologyRevision) throw new Error(`restored binding topology mismatch for ${state.actorSessionId}`);
      if (state.readyTopologyRevision !== null && state.readyTopologyRevision !== checkpoint.topologyRevision) {
        throw new Error(`restored binding ready topology mismatch for ${state.actorSessionId}`);
      }
      this.bindingBySession.set(state.actorSessionId, { socket: null, ...state });
    }
    if (this.bindingBySession.size !== rosterSnapshot.actors.length) throw new Error("restored binding coverage mismatch");

    this.recoveredSocketBindings = 0;
    for (const socket of this.ctx.getWebSockets()) {
      let attachment: PhysicsSocketAttachment | null = null;
      try {
        attachment = parseSocketAttachment(socket.deserializeAttachment());
      } catch {
        attachment = null;
      }
      if (!attachment) {
        try { socket.close(1008, "missing_or_invalid_hibernation_attachment"); } catch { /* close race */ }
        continue;
      }
      if (attachment.worldId !== checkpoint.worldId) throw new Error("recovered socket attachment world mismatch");
      const binding = this.bindingBySession.get(attachment.actorSessionId);
      if (!binding || binding.actorId !== attachment.actorId) throw new Error("recovered socket attachment identity mismatch");
      if (binding.socket !== null) throw new Error(`duplicate recovered socket for ${binding.actorSessionId}`);
      if (
        attachment.lastTopologyRevision !== binding.lastTopologyRevision
        || attachment.expectedSyncId !== binding.expectedSyncId
        || attachment.expectedRuntimeDigest !== binding.expectedRuntimeDigest
        || attachment.inputBatches !== binding.inputBatches
      ) throw new Error(`recovered socket attachment protocol state drift for ${binding.actorSessionId}`);
      if (attachment.readyTopologyRevision !== null && attachment.readyTopologyRevision !== checkpoint.topologyRevision) {
        throw new Error(`recovered socket attachment ready topology drift for ${binding.actorSessionId}`);
      }
      binding.socket = socket;
      binding.readyTopologyRevision = attachment.readyTopologyRevision;
      this.sessionBySocket.set(socket, binding.actorSessionId);
      this.recoveredSocketBindings += 1;
    }

    for (const actor of rosterSnapshot.actors) {
      const connected = [...this.sessionBySocket.values()].includes(actor.actorSessionId);
      if (!this.roster.setTransportConnected(actor.actorSessionId, connected)) {
        throw new Error(`restored roster transport reconciliation failed for ${actor.actorSessionId}`);
      }
    }
    this.checkpointGeneration = generation;
    this.checkpointPayloadBytes = payloadBytes;
    this.restoredCheckpointTick = checkpoint.canonicalTick;
  }

  private status() {
    const roster = this.roster.snapshot();
    const topology = this.topology.snapshot();
    return {
      ok: this.restoreState !== "failed",
      revision: "foundation-local-physics-transport-worker-v4-hibernation-recovery",
      protocolRevision: FOUNDATION_REPLICATION_PROTOCOL_REVISION,
      box3dBuild: this.physics.buildId,
      constructorNonce: this.constructorNonce,
      constructorAgeMs: Date.now() - this.constructorBornAtMs,
      restoreState: this.restoreState,
      restoreError: this.restoreError,
      checkpointGeneration: this.checkpointGeneration,
      checkpointPublishes: this.checkpointPublishes,
      checkpointPayloadBytes: this.checkpointPayloadBytes,
      restoredCheckpointTick: this.restoredCheckpointTick,
      recoveredSocketBindings: this.recoveredSocketBindings,
      checkpointStorage: this.checkpointStorage.stats(),
      hibernationWebSockets: this.ctx.getWebSockets().length,
      mode: this.mode,
      worldId: this.worldId,
      worldEpoch: WORLD_EPOCH,
      boundaryTick: roster.currentTick,
      topologyRevision: topology.topologyRevision,
      topologyDigest: topology.topologyDigest,
      actors: roster.actors.map((actor) => ({
        actorId: actor.actorId,
        actorSessionId: actor.actorSessionId,
        transportConnected: actor.transportConnected,
      })),
      connectedTransports: this.sessionBySocket.size,
      readyCurrentTopology: [...this.bindingBySession.values()].filter((binding) =>
        binding.readyTopologyRevision === topology.topologyRevision && this.isCurrentTransportConnected(binding)
      ).length,
      inputBatches: [...this.bindingBySession.values()].reduce((sum, binding) => sum + binding.inputBatches, 0),
      acceptedInputRecords: this.acceptedInputRecords,
      committedInputRecords: this.committedInputRecords,
      inputCommitsSent: this.inputCommitsSent,
      syncsSent: this.syncsSent,
      correctionSyncs: this.correctionSyncs,
      resumeSyncs: this.resumeSyncs,
      resumedSessions: [...this.resumedSessions].sort(),
      continuationTicks: this.completedContinuationTicks,
      finalGuardPacked: this.finalGuardPacked,
      finalSeedBytes: this.finalSeedBytes,
      finalSeedFnv1a32: this.finalSeedFnv1a32,
      maxPropHorizontalDisplacement: this.maxPropHorizontalDisplacement,
      staleReady: this.staleReady,
      invalidMessages: this.invalidMessages,
    };
  }

  private send(socket: WebSocket, payload: unknown): void {
    try { socket.send(JSON.stringify(payload)); } catch { /* transport teardown race */ }
  }

  private closePolicy(socket: WebSocket, reason: string): void {
    this.detachTransport(socket);
    try { socket.close(1008, reason); } catch { /* close race */ }
  }

  private detachTransport(socket: WebSocket): void {
    const session = this.sessionBySocket.get(socket);
    this.sessionBySocket.delete(socket);
    if (!session) return;
    const binding = this.bindingBySession.get(session);
    if (binding?.socket !== socket) return;
    binding.socket = null;
    binding.readyTopologyRevision = null;
    this.roster.setTransportConnected(session, false);
  }
}

export default {
  async fetch(request: Request, env: PhysicsReplicationEnv): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return json({ ok: true, revision: "foundation-local-physics-transport-worker-v4-hibernation-recovery" });
    }
    if (url.pathname !== "/foundation-physics/ws" && url.pathname !== "/foundation-physics/status") {
      return new Response("not found", { status: 404 });
    }
    const run = normalizeRun(url.searchParams.get("run"));
    if (!run) return json({ ok: false, error: "invalid_run" }, 400);
    const stub = env.FOUNDATION_REPLICATION_PHYSICS_TEST.get(
      env.FOUNDATION_REPLICATION_PHYSICS_TEST.idFromName(`foundation-physics-${run}`),
    );
    return stub.fetch(request);
  },
} satisfies ExportedHandler<PhysicsReplicationEnv>;
