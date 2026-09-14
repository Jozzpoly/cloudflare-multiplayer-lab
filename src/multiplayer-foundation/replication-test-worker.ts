import { DurableObject } from "cloudflare:workers";
import { FoundationActorInputRegistry } from "./actor-input-registry.ts";
import {
  createFoundationClientBootstrap,
  type FoundationClientExecutionProfile,
} from "./client-bootstrap.ts";
import {
  FOUNDATION_BOX3D_RECORDING_SEED_FORMAT,
  createFoundationClientRuntimeBootstrap,
} from "./client-runtime-bootstrap.ts";
import { FoundationEntityTopology } from "./entity-topology.ts";
import {
  FOUNDATION_REPLICATION_PROTOCOL_REVISION,
  foundationReplicationInputResult,
  foundationReplicationRuntimeSync,
  parseFoundationReplicationClientMessage,
  sameFoundationExecutionProfile,
  type FoundationRuntimeSyncReason,
} from "./replication-protocol.ts";
import { FoundationRosterMachine } from "./roster-machine.ts";

const WORLD_EPOCH = "foundation-local-transport-epoch-1";
const CAPACITY = 3;
const MAX_FUTURE_TICKS = 8;
const PERSISTENT_WORLD = ["prop:0", "prop:1"] as const;
const STATE_COMPONENTS = ["position.x", "position.z"] as const;
const PROFILE: FoundationClientExecutionProfile = {
  profileId: "shared-yard-foundation-client-v1",
  buildId: "foundation-local-transport-build-1",
  stateSchemaId: "foundation-local-transport-f32-2-v1",
};
const SEED_BYTES = Uint8Array.from([17, 34, 51, 68, 85, 102, 119, 136]);
const RUN_PATTERN = /^[A-Za-z0-9_-]{1,40}$/;

type ReplicationTestEnv = {
  FOUNDATION_REPLICATION_TEST: DurableObjectNamespace<FoundationReplicationTestWorld>;
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

function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fnv1a32(bytes: Uint8Array): string {
  let hash = 0x811c9dc5 >>> 0;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function normalizeRun(raw: string | null): string | null {
  const value = (raw ?? "").trim();
  return RUN_PATTERN.test(value) ? value : null;
}

function expectedWorldId(run: string): string {
  return `foundation-replication-${run}`;
}

export class FoundationReplicationTestWorld extends DurableObject<ReplicationTestEnv> {
  private readonly roster = new FoundationRosterMachine({ worldEpoch: WORLD_EPOCH, capacity: CAPACITY });
  private readonly topology = new FoundationEntityTopology(WORLD_EPOCH, PERSISTENT_WORLD);
  private readonly inputs = new FoundationActorInputRegistry(WORLD_EPOCH, MAX_FUTURE_TICKS);
  private readonly bindingBySession = new Map<string, ClientBinding>();
  private readonly sessionBySocket = new Map<WebSocket, string>();
  private worldId: string | null = null;
  private syncSequence = 0;
  private syncsSent = 0;
  private staleReady = 0;
  private acceptedInputRecords = 0;
  private invalidMessages = 0;

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const run = normalizeRun(url.searchParams.get("run"));
    if (!run) return json({ ok: false, error: "invalid_run" }, 400);
    const requestedWorldId = expectedWorldId(run);
    if (this.worldId !== null && this.worldId !== requestedWorldId) {
      return json({ ok: false, error: "world_id_mismatch" }, 409);
    }
    this.worldId ??= requestedWorldId;

    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return json(this.status());
    }

    const [client, server] = Object.values(new WebSocketPair()) as [WebSocket, WebSocket];
    this.ctx.acceptWebSocket(server, ["foundation-replication-test"]);
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
    if (!binding || binding.socket !== socket) {
      this.closePolicy(socket, "unbound_transport");
      return;
    }
    if (message.worldId !== this.worldId || message.actorSessionId !== binding.actorSessionId) {
      this.closePolicy(socket, "transport_identity_mismatch");
      return;
    }
    if (message.worldEpoch !== WORLD_EPOCH) {
      this.closePolicy(socket, "world_epoch_mismatch");
      return;
    }

    if (message.type === "foundation_runtime_ready") {
      if (message.syncId !== binding.expectedSyncId) {
        this.staleReady += 1;
        return;
      }
      if (message.runtimeDigest !== binding.expectedRuntimeDigest) {
        this.closePolicy(socket, "runtime_digest_mismatch");
        return;
      }
      binding.readyTopologyRevision = binding.lastTopologyRevision;
      return;
    }

    const topology = this.topology.snapshot();
    if (message.actorId !== binding.actorId || message.topologyRevision !== topology.topologyRevision) {
      this.closePolicy(socket, "input_identity_or_topology_mismatch");
      return;
    }
    if (binding.readyTopologyRevision !== topology.topologyRevision) {
      this.closePolicy(socket, "input_before_runtime_ready");
      return;
    }

    const records = message.records.map((record) => {
      const acceptance = this.inputs.schedule({
        actorId: binding.actorId,
        actorSessionId: binding.actorSessionId,
        targetTick: record.targetTick,
        x: record.x,
        z: record.z,
      }, this.roster.snapshot().currentTick);
      if (acceptance.status === "accepted" || acceptance.status === "superseded") {
        this.acceptedInputRecords += 1;
      }
      return {
        actorId: acceptance.actorId,
        targetTick: acceptance.targetTick,
        status: acceptance.status,
      };
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
    if (this.sessionBySocket.has(socket)) {
      this.closePolicy(socket, "duplicate_join_on_transport");
      return;
    }
    if (message.worldId !== this.worldId) {
      this.closePolicy(socket, "join_world_mismatch");
      return;
    }
    if (!sameFoundationExecutionProfile(message.executionProfile, PROFILE)) {
      this.closePolicy(socket, "execution_profile_mismatch");
      return;
    }
    if (this.bindingBySession.has(message.actorSessionId)) {
      this.closePolicy(socket, "duplicate_actor_session");
      return;
    }
    if (this.bindingBySession.size >= CAPACITY) {
      this.closePolicy(socket, "capacity_reached");
      return;
    }

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
    if (!joined || joined.status !== "joined") {
      this.closePolicy(socket, "join_mutation_failed");
      return;
    }
    const roster = this.roster.snapshot();
    this.topology.syncRoster(roster);
    this.inputs.syncRoster(roster);

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
    this.broadcastRuntimeSync(binding.actorSessionId, previousTopologyRevision);
  }

  private broadcastRuntimeSync(newSessionId: string, previousTopologyRevision: number): void {
    const topology = this.topology.snapshot();
    for (const binding of this.bindingBySession.values()) {
      const isNew = binding.actorSessionId === newSessionId;
      const reason: FoundationRuntimeSyncReason = isNew ? "join" : "topology_change";
      const previous = isNew ? null : binding.lastTopologyRevision || previousTopologyRevision;
      const runtimeBootstrap = this.createRuntimeBootstrap(binding.actorSessionId);
      const syncId = `sync-${++this.syncSequence}-${topology.topologyRevision}-${binding.actorId.replace(":", "-")}`;
      const sync = foundationReplicationRuntimeSync({
        syncId,
        reason,
        worldId: this.worldId!,
        worldEpoch: WORLD_EPOCH,
        actorSessionId: binding.actorSessionId,
        previousTopologyRevision: previous,
        runtimeBootstrap,
      });
      binding.lastTopologyRevision = topology.topologyRevision;
      binding.expectedSyncId = syncId;
      binding.expectedRuntimeDigest = runtimeBootstrap.envelopeDigest;
      binding.readyTopologyRevision = null;
      this.syncsSent += 1;
      this.send(binding.socket, sync);
    }
  }

  private createRuntimeBootstrap(selfActorSessionId: string) {
    const roster = this.roster.snapshot();
    const topology = this.topology.snapshot();
    const stateById = new Map(topology.entityOrder.map((netEntityId, index) => [
      netEntityId,
      [Math.fround(index * 0.125), Math.fround(roster.currentTick * 0.25)],
    ] as const));
    const bootstrap = createFoundationClientBootstrap({
      worldEpoch: WORLD_EPOCH,
      canonicalTick: roster.currentTick,
      selfActorSessionId,
      executionProfile: PROFILE,
      topology,
      stateComponents: STATE_COMPONENTS,
      entityStates: topology.entityOrder.map((netEntityId) => ({
        netEntityId,
        values: [...stateById.get(netEntityId)!],
      })),
      inputBaselines: roster.actors.map((actor) => ({
        netEntityId: actor.actorId,
        actorSessionId: actor.actorSessionId,
        x: 0,
        z: 0,
        jump: false,
      })),
    });
    return createFoundationClientRuntimeBootstrap({
      bootstrap,
      executionSeed: {
        formatId: FOUNDATION_BOX3D_RECORDING_SEED_FORMAT,
        worldEpoch: WORLD_EPOCH,
        canonicalTick: roster.currentTick,
        topologyRevision: topology.topologyRevision,
        topologyDigest: topology.topologyDigest,
        bodyNames: ["arena:static:0", ...topology.entityOrder],
        byteLength: SEED_BYTES.byteLength,
        fnv1a32: fnv1a32(SEED_BYTES),
        bytesBase64: encodeBase64(SEED_BYTES),
      },
    });
  }

  private status() {
    const roster = this.roster.snapshot();
    const topology = this.topology.snapshot();
    return {
      ok: true,
      revision: "foundation-local-transport-worker-v1",
      protocolRevision: FOUNDATION_REPLICATION_PROTOCOL_REVISION,
      worldId: this.worldId,
      worldEpoch: WORLD_EPOCH,
      boundaryTick: roster.currentTick,
      topologyRevision: topology.topologyRevision,
      topologyDigest: topology.topologyDigest,
      actors: roster.actors.map((actor) => ({
        actorId: actor.actorId,
        actorSessionId: actor.actorSessionId,
      })),
      connectedTransports: this.sessionBySocket.size,
      readyCurrentTopology: [...this.bindingBySession.values()].filter((binding) =>
        binding.readyTopologyRevision === topology.topologyRevision
      ).length,
      inputBatches: [...this.bindingBySession.values()].reduce((sum, binding) => sum + binding.inputBatches, 0),
      acceptedInputRecords: this.acceptedInputRecords,
      syncsSent: this.syncsSent,
      staleReady: this.staleReady,
      invalidMessages: this.invalidMessages,
      seedBytes: SEED_BYTES.byteLength,
      seedFnv1a32: fnv1a32(SEED_BYTES),
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
    if (binding?.socket === socket) {
      // Gate 5F1 deliberately proves transport detach without implicit actor retirement.
      // Membership stays canonical until a future explicit retire/resume experiment.
      binding.readyTopologyRevision = null;
    }
  }
}

export default {
  async fetch(request: Request, env: ReplicationTestEnv): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health") return json({ ok: true, revision: "foundation-local-transport-worker-v1" });
    if (url.pathname !== "/foundation-replication/ws" && url.pathname !== "/foundation-replication/status") {
      return new Response("not found", { status: 404 });
    }
    const run = normalizeRun(url.searchParams.get("run"));
    if (!run) return json({ ok: false, error: "invalid_run" }, 400);
    const stub = env.FOUNDATION_REPLICATION_TEST.get(
      env.FOUNDATION_REPLICATION_TEST.idFromName(`foundation-replication-${run}`),
    );
    return stub.fetch(request);
  },
} satisfies ExportedHandler<ReplicationTestEnv>;
