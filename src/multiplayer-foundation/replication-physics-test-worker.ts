import { DurableObject } from "cloudflare:workers";
import {
  WORLD_V0_SIM_BUILD_ID,
  WORLD_V0_STATE_COMPONENTS,
} from "../world-v0-contract.ts";
import { FoundationActorInputRegistry } from "./actor-input-registry.ts";
import {
  createFoundationClientBootstrap,
  type FoundationClientExecutionProfile,
} from "./client-bootstrap.ts";
import { createFoundationClientRuntimeBootstrap } from "./client-runtime-bootstrap.ts";
import { FoundationEntityTopology } from "./entity-topology.ts";
import { FoundationReplicationPhysicsRuntime } from "./replication-physics-runtime.ts";
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
const INPUT_BATCH_TICKS = 15;
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

type ClientBinding = {
  socket: WebSocket;
  actorSessionId: string;
  actorId: `actor:${number}`;
  lastTopologyRevision: number;
  expectedSyncId: string;
  expectedRuntimeDigest: string;
  readyTopologyRevision: number | null;
  inputBatches: number;
};

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

export class FoundationReplicationPhysicsTestWorld extends DurableObject<PhysicsReplicationEnv> {
  private readonly roster = new FoundationRosterMachine({ worldEpoch: WORLD_EPOCH, capacity: CAPACITY });
  private readonly topology = new FoundationEntityTopology(WORLD_EPOCH, PERSISTENT_WORLD);
  private readonly inputs = new FoundationActorInputRegistry(WORLD_EPOCH, MAX_FUTURE_TICKS);
  private readonly physics = new FoundationReplicationPhysicsRuntime();
  private readonly bindingBySession = new Map<string, ClientBinding>();
  private readonly sessionBySocket = new Map<WebSocket, string>();
  private readonly propStartXZ = new Map<string, readonly [number, number]>();
  private worldId: string | null = null;
  private interactive = false;
  private syncSequence = 0;
  private syncsSent = 0;
  private correctionSyncs = 0;
  private inputCommitsSent = 0;
  private committedInputRecords = 0;
  private acceptedInputRecords = 0;
  private invalidMessages = 0;
  private staleReady = 0;
  private advancedContinuation = false;
  private finalGuardPacked: string | null = null;
  private finalSeedBytes = 0;
  private finalSeedFnv1a32: string | null = null;
  private maxPropHorizontalDisplacement = 0;

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const run = normalizeRun(url.searchParams.get("run"));
    if (!run) return json({ ok: false, error: "invalid_run" }, 400);
    const requestedWorldId = expectedWorldId(run);
    if (this.worldId !== null && this.worldId !== requestedWorldId) {
      return json({ ok: false, error: "world_id_mismatch" }, 409);
    }
    if (this.worldId === null) {
      this.worldId = requestedWorldId;
      this.interactive = run.startsWith("interactive-");
    }
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return json(this.status());
    const [client, server] = Object.values(new WebSocketPair()) as [WebSocket, WebSocket];
    this.ctx.acceptWebSocket(server, ["foundation-replication-physics-test"]);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(socket: WebSocket, raw: string | ArrayBuffer): Promise<void> {
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
      return;
    }

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
    this.send(socket, foundationReplicationInputResult({
      worldId: this.worldId!,
      worldEpoch: WORLD_EPOCH,
      actorSessionId: binding.actorSessionId,
      actorId: binding.actorId,
      batchSeq: message.batchSeq,
      records,
    }));
    if (this.interactive && committedRecords.length > 0) {
      this.committedInputRecords += committedRecords.length;
      for (const recipient of this.bindingBySession.values()) {
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
    this.maybeAdvanceContinuation();
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

  private broadcastRuntimeSync(
    newSessionId: string | null,
    previousTopologyRevision: number,
    correction: boolean,
  ): void {
    const topology = this.topology.snapshot();
    for (const binding of this.bindingBySession.values()) {
      const isNew = binding.actorSessionId === newSessionId;
      const reason: FoundationRuntimeSyncReason = correction ? "correction" : isNew ? "join" : "topology_change";
      const previous = isNew
        ? null
        : correction
          ? topology.topologyRevision
          : binding.lastTopologyRevision || previousTopologyRevision;
      const runtimeBootstrap = this.createRuntimeBootstrap(binding.actorSessionId);
      if (correction) {
        this.finalSeedBytes = runtimeBootstrap.executionSeed.byteLength;
        this.finalSeedFnv1a32 = runtimeBootstrap.executionSeed.fnv1a32;
      }
      const syncId = `physics-sync-${++this.syncSequence}-${this.roster.snapshot().currentTick}-${binding.actorId.replace(":", "-")}`;
      binding.lastTopologyRevision = topology.topologyRevision;
      binding.expectedSyncId = syncId;
      binding.expectedRuntimeDigest = runtimeBootstrap.envelopeDigest;
      binding.readyTopologyRevision = null;
      this.syncsSent += 1;
      if (correction) this.correctionSyncs += 1;
      this.send(binding.socket, foundationReplicationRuntimeSync({
        syncId,
        reason,
        worldId: this.worldId!,
        worldEpoch: WORLD_EPOCH,
        actorSessionId: binding.actorSessionId,
        previousTopologyRevision: previous,
        runtimeBootstrap,
      }));
    }
  }

  private continuationTicks(): number {
    return this.interactive ? INTERACTIVE_CONTINUATION_TICKS : NEUTRAL_CONTINUATION_TICKS;
  }

  private requiredInputBatches(): number {
    return this.continuationTicks() / INPUT_BATCH_TICKS;
  }

  private maybeAdvanceContinuation(): void {
    const continuationTicks = this.continuationTicks();
    if (this.advancedContinuation || this.bindingBySession.size !== CAPACITY) return;
    if (![...this.bindingBySession.values()].every((binding) => binding.inputBatches === this.requiredInputBatches())) return;
    if (this.acceptedInputRecords !== CAPACITY * continuationTicks) return;
    this.advancedContinuation = true;
    const startTick = this.roster.snapshot().currentTick;
    for (let targetTick = startTick + 1; targetTick <= startTick + continuationTicks; targetTick += 1) {
      const outcomes = this.roster.advanceTo(targetTick);
      if (outcomes.length !== 0) throw new Error("unexpected topology mutation during physics continuation");
      const roster = this.roster.snapshot();
      const topology = this.topology.syncRoster(roster);
      this.inputs.syncRoster(roster);
      this.physics.step(roster.actors.map((actor) => {
        const input = this.inputs.consume(actor.actorId, targetTick);
        return { actorId: actor.actorId, x: input.x, z: input.z };
      }));
      if (targetTick === startTick + continuationTicks) {
        this.finalGuardPacked = this.physics.captureGuard(topology).packed;
      }
    }
    if (this.interactive) {
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
  }

  private status() {
    const roster = this.roster.snapshot();
    const topology = this.topology.snapshot();
    return {
      ok: true,
      revision: "foundation-local-physics-transport-worker-v2-input-commit",
      protocolRevision: FOUNDATION_REPLICATION_PROTOCOL_REVISION,
      box3dBuild: this.physics.buildId,
      mode: this.interactive ? "interactive" : "neutral",
      worldId: this.worldId,
      worldEpoch: WORLD_EPOCH,
      boundaryTick: roster.currentTick,
      topologyRevision: topology.topologyRevision,
      topologyDigest: topology.topologyDigest,
      actors: roster.actors.map((actor) => ({ actorId: actor.actorId, actorSessionId: actor.actorSessionId })),
      connectedTransports: this.sessionBySocket.size,
      readyCurrentTopology: [...this.bindingBySession.values()].filter((binding) => binding.readyTopologyRevision === topology.topologyRevision).length,
      inputBatches: [...this.bindingBySession.values()].reduce((sum, binding) => sum + binding.inputBatches, 0),
      acceptedInputRecords: this.acceptedInputRecords,
      committedInputRecords: this.committedInputRecords,
      inputCommitsSent: this.inputCommitsSent,
      syncsSent: this.syncsSent,
      correctionSyncs: this.correctionSyncs,
      continuationTicks: this.advancedContinuation ? this.continuationTicks() : 0,
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
    if (binding?.socket === socket) binding.readyTopologyRevision = null;
  }
}

export default {
  async fetch(request: Request, env: PhysicsReplicationEnv): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return json({ ok: true, revision: "foundation-local-physics-transport-worker-v2-input-commit" });
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