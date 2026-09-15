import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  FOUNDATION_REPLICATION_PROTOCOL_REVISION,
  parseFoundationReplicationServerMessage,
} from "../src/multiplayer-foundation/replication-protocol.ts";
import { FOUNDATION_BOX3D_RECORDING_SEED_FORMAT } from "../src/multiplayer-foundation/client-runtime-bootstrap.ts";
import { WORLD_V0_SIM_BUILD_ID } from "../src/world-v0-contract.ts";

const PORT = 8793;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const CONFIG = resolve("wrangler.foundation-replication-physics-test.jsonc");
const WRANGLER_BIN = resolve("node_modules/wrangler/bin/wrangler.js");
const RUN = `reconnect-midprogress-${Date.now().toString(36)}`;
const WORLD_ID = `foundation-physics-replication-${RUN}`;
const SESSIONS = ["session-alpha", "session-bravo", "session-charlie"] as const;
const RECONNECT_SESSION = "session-bravo";
const EXPECTED_FINAL_STATE_GUARD_SHA256 = "1d76b17f64630dad372d1166806a7aee9f3ed500cc8ee4fc2d6a2d898cc205d6";
const INPUTS = [
  { x: 0.8, z: 0.6 },
  { x: -0.8, z: 0.6 },
  { x: 0, z: -1 },
] as const;
const PROFILE = {
  profileId: "shared-yard-foundation-client-v1",
  buildId: WORLD_V0_SIM_BUILD_ID,
  stateSchemaId: "shared-yard-rigidbody-f32-13-v1",
};
const PERSIST_DIR = mkdtempSync(join(tmpdir(), "mw-foundation-midprogress-do-"));

function sleep(ms: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

function sha256Text(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function boundedAppend(current: string, chunk: unknown): string {
  const next = current + String(chunk);
  return next.length > 24000 ? next.slice(-24000) : next;
}

function startWrangler() {
  const child = spawn(process.execPath, [
    WRANGLER_BIN,
    "dev",
    "--config",
    CONFIG,
    "--ip",
    "127.0.0.1",
    "--port",
    String(PORT),
    "--persist-to",
    PERSIST_DIR,
    "--log-level",
    "error",
  ], {
    cwd: process.cwd(),
    env: { ...process.env, CI: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (chunk) => { output = boundedAppend(output, chunk); });
  child.stderr.on("data", (chunk) => { output = boundedAppend(output, chunk); });
  return { child, output: () => output };
}

async function waitForWrangler(server: ReturnType<typeof startWrangler>): Promise<void> {
  const deadline = Date.now() + 35_000;
  while (Date.now() < deadline) {
    if (server.child.exitCode !== null) {
      throw new Error(`wrangler exited before readiness with ${server.child.exitCode}\n${server.output()}`);
    }
    try {
      const response = await fetch(`${ORIGIN}/health`, { signal: AbortSignal.timeout(1000) });
      if (response.ok) return;
    } catch {
      // workerd is still starting.
    }
    await sleep(100);
  }
  throw new Error(`wrangler readiness timeout\n${server.output()}`);
}

async function stopWrangler(server: ReturnType<typeof startWrangler> | null): Promise<void> {
  if (!server || server.child.exitCode !== null) return;
  server.child.kill("SIGTERM");
  const exited = await Promise.race([
    new Promise<boolean>((resolveExit) => server.child.once("exit", () => resolveExit(true))),
    sleep(5000).then(() => false),
  ]);
  if (!exited && server.child.exitCode === null) {
    server.child.kill("SIGKILL");
    await new Promise((resolveExit) => server.child.once("exit", resolveExit));
  }
}

async function rawStatus(): Promise<{ status: number; body: any }> {
  const response = await fetch(
    `${ORIGIN}/foundation-physics/status?run=${encodeURIComponent(RUN)}`,
    { signal: AbortSignal.timeout(3000) },
  );
  return { status: response.status, body: await response.json() };
}

async function status(): Promise<any> {
  const observed = await rawStatus();
  assert.equal(observed.status, 200, JSON.stringify(observed.body));
  return observed.body;
}

async function waitForStatus(predicate: (value: any) => boolean, label: string, timeoutMs = 60_000): Promise<any> {
  const deadline = Date.now() + timeoutMs;
  let last: unknown = null;
  while (Date.now() < deadline) {
    try {
      last = await status();
      if (predicate(last)) return last;
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    await sleep(100);
  }
  throw new Error(`${label} timeout · last=${JSON.stringify(last)}`);
}

type ClientState = {
  worldEpoch: string | null;
  actorId: string | null;
  topologyRevision: number;
  topologyDigest: string | null;
  readySyncs: number;
  resumeSyncs: number;
  correctionTick: number | null;
  inputResults: number;
  commitMessages: number;
  commitRecords: number;
  failure: string | null;
};

type AttachmentKind = "join" | "resume";

class ProbeClient {
  readonly actorSessionId: string;
  readonly input: { x: number; z: number };
  socket: WebSocket;
  private readonly intentionalClosures = new Set<WebSocket>();
  readonly state: ClientState = {
    worldEpoch: null,
    actorId: null,
    topologyRevision: 0,
    topologyDigest: null,
    readySyncs: 0,
    resumeSyncs: 0,
    correctionTick: null,
    inputResults: 0,
    commitMessages: 0,
    commitRecords: 0,
    failure: null,
  };

  constructor(actorSessionId: string, input: { x: number; z: number }) {
    this.actorSessionId = actorSessionId;
    this.input = input;
    this.socket = this.installSocket("join");
  }

  private installSocket(kind: AttachmentKind): WebSocket {
    const socket = new WebSocket(`ws://127.0.0.1:${PORT}/foundation-physics/ws?run=${encodeURIComponent(RUN)}`);
    socket.addEventListener("open", () => {
      try {
        if (kind === "join") {
          socket.send(JSON.stringify({
            type: "foundation_join",
            revision: FOUNDATION_REPLICATION_PROTOCOL_REVISION,
            requestId: `join-${this.actorSessionId}`,
            worldId: WORLD_ID,
            actorSessionId: this.actorSessionId,
            executionProfile: PROFILE,
          }));
          return;
        }
        assert(this.state.worldEpoch && this.state.actorId && this.state.topologyRevision > 0 && this.state.topologyDigest);
        socket.send(JSON.stringify({
          type: "foundation_resume",
          revision: FOUNDATION_REPLICATION_PROTOCOL_REVISION,
          requestId: `resume-${this.actorSessionId}`,
          worldId: WORLD_ID,
          worldEpoch: this.state.worldEpoch,
          actorSessionId: this.actorSessionId,
          actorId: this.state.actorId,
          topologyRevision: this.state.topologyRevision,
          topologyDigest: this.state.topologyDigest,
          executionProfile: PROFILE,
        }));
      } catch (error) {
        this.state.failure = error instanceof Error ? error.stack ?? error.message : String(error);
      }
    });
    socket.addEventListener("message", (event) => {
      void this.handleMessage(event, socket).catch((error) => {
        this.state.failure = error instanceof Error ? error.stack ?? error.message : String(error);
      });
    });
    socket.addEventListener("error", () => {
      if (!this.intentionalClosures.has(socket) && !this.state.failure) this.state.failure = "WebSocket error";
    });
    socket.addEventListener("close", (event) => {
      const intentional = this.intentionalClosures.delete(socket);
      if (!intentional && !this.state.failure) {
        this.state.failure = `unexpected close ${event.code} ${event.reason}`;
      }
    });
    return socket;
  }

  private async handleMessage(event: MessageEvent, socket: WebSocket): Promise<void> {
    const raw = typeof event.data === "string" ? event.data : await (event.data as Blob).text();
    const parsed = parseFoundationReplicationServerMessage(raw, {
      worldId: WORLD_ID,
      actorSessionId: this.actorSessionId,
      executionProfile: PROFILE,
      seedFormatId: FOUNDATION_BOX3D_RECORDING_SEED_FORMAT,
      ...(this.state.worldEpoch ? { worldEpoch: this.state.worldEpoch } : {}),
    });
    assert(parsed, `${this.actorSessionId} server message failed protocol validation`);

    if (parsed.message.type === "foundation_runtime_sync") {
      const sync = parsed.message;
      const hydrated = parsed.hydratedRuntimeBootstrap;
      this.state.worldEpoch ??= sync.worldEpoch;
      assert.equal(sync.worldEpoch, this.state.worldEpoch);
      assert.equal(hydrated.projection.self.actorSessionId, this.actorSessionId);
      const actorId = hydrated.projection.self.netEntityId;
      if (this.state.actorId !== null) assert.equal(actorId, this.state.actorId, "ActorId drift");
      this.state.actorId = actorId;
      this.state.topologyRevision = hydrated.envelope.topology.topologyRevision;
      this.state.topologyDigest = hydrated.envelope.topology.topologyDigest;
      if (sync.reason === "resume") {
        assert.equal(hydrated.envelope.canonicalTick, 33, "resume boundary drift");
        this.state.resumeSyncs += 1;
      }
      if (sync.reason === "correction") this.state.correctionTick = hydrated.envelope.canonicalTick;
      socket.send(JSON.stringify({
        type: "foundation_runtime_ready",
        revision: FOUNDATION_REPLICATION_PROTOCOL_REVISION,
        worldId: WORLD_ID,
        worldEpoch: sync.worldEpoch,
        actorSessionId: this.actorSessionId,
        syncId: sync.syncId,
        runtimeDigest: sync.runtimeBootstrap.envelopeDigest,
      }));
      this.state.readySyncs += 1;
      return;
    }

    if (parsed.message.type === "foundation_input_result") {
      assert(parsed.message.records.every((record) => record.status === "accepted"));
      this.state.inputResults += 1;
      return;
    }

    assert.equal(parsed.message.type, "foundation_input_commit");
    this.state.commitMessages += 1;
    this.state.commitRecords += parsed.message.records.length;
  }

  sendBatch(batchSeq: number, firstTick: number): void {
    assert.equal(this.socket.readyState, WebSocket.OPEN);
    assert(this.state.worldEpoch && this.state.actorId && this.state.topologyRevision > 0);
    const records = Array.from({ length: 15 }, (_, index) => ({
      targetTick: firstTick + index,
      x: this.input.x,
      z: this.input.z,
    }));
    this.socket.send(JSON.stringify({
      type: "foundation_input_batch",
      revision: FOUNDATION_REPLICATION_PROTOCOL_REVISION,
      worldId: WORLD_ID,
      worldEpoch: this.state.worldEpoch,
      actorSessionId: this.actorSessionId,
      actorId: this.state.actorId,
      topologyRevision: this.state.topologyRevision,
      batchSeq,
      records,
    }));
  }

  disconnectForResume(): void {
    assert.equal(this.socket.readyState, WebSocket.OPEN);
    const socket = this.socket;
    this.intentionalClosures.add(socket);
    socket.close(1000, "controlled-midprogress-reconnect");
  }

  openResumeTransport(): void {
    this.socket = this.installSocket("resume");
  }

  close(): void {
    this.intentionalClosures.add(this.socket);
    try { this.socket.close(1000, "probe-complete"); } catch { /* cleanup */ }
  }
}

async function waitForClient(client: ProbeClient, predicate: (state: ClientState) => boolean, label: string): Promise<ClientState> {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (client.state.failure) throw new Error(`${label}: ${client.state.failure}`);
    if (predicate(client.state)) return { ...client.state };
    await sleep(50);
  }
  throw new Error(`${label} timeout · ${JSON.stringify(client.state)}`);
}

let wrangler: ReturnType<typeof startWrangler> | null = null;
const clients: ProbeClient[] = [];
try {
  wrangler = startWrangler();
  await waitForWrangler(wrangler);

  for (let index = 0; index < SESSIONS.length; index += 1) {
    const client = new ProbeClient(SESSIONS[index], INPUTS[index]);
    clients.push(client);
    const expectedRevision = index + 1;
    await waitForClient(client, (state) => state.topologyRevision === expectedRevision, `join topology ${expectedRevision}`);
    await waitForStatus(
      (value) => value.topologyRevision === expectedRevision && value.readyCurrentTopology === expectedRevision,
      `authority ready topology ${expectedRevision}`,
    );
  }

  for (const client of clients) {
    await waitForClient(client, (state) => state.topologyRevision === 3, "final topology delivery");
  }
  await waitForStatus((value) => value.topologyRevision === 3 && value.readyCurrentTopology === 3, "final topology ready");

  const actorIdentity = new Map(clients.map((client) => [client.actorSessionId, client.state.actorId] as const));
  assert.deepEqual([...actorIdentity.values()], ["actor:0", "actor:1", "actor:2"]);

  for (const client of clients) {
    client.sendBatch(1, 4);
    client.sendBatch(2, 19);
  }
  for (const client of clients) {
    await waitForClient(client, (state) => state.correctionTick === 33, "phase-1 correction");
  }

  const phase1 = await waitForStatus(
    (value) => value.boundaryTick === 33
      && value.checkpointGeneration === 1
      && value.inputBatches === 6
      && value.acceptedInputRecords === 90
      && value.committedInputRecords === 90
      && value.inputCommitsSent === 18
      && value.readyCurrentTopology === 3,
    "phase-1 durable boundary",
  );
  assert.equal(phase1.restoreState, "empty");

  // Advance canonical/protocol truth beyond the exact physics checkpoint without
  // providing enough input to advance the authority simulation to its next base.
  for (const client of clients) client.sendBatch(3, 34);
  const partial = await waitForStatus(
    (value) => value.boundaryTick === 33
      && value.checkpointGeneration === 1
      && value.inputBatches === 9
      && value.acceptedInputRecords === 135
      && value.committedInputRecords === 135
      && value.inputCommitsSent === 27
      && value.progressSequence >= 6
      && value.progressPayloadBytes > 0,
    "partial post-checkpoint protocol progress",
  );
  assert.equal(partial.restoredCheckpointTick, 33);
  assert.equal(partial.progressStorage.rows, 1);
  const constructorBefore = partial.constructorNonce;

  let restored: any = null;
  for (let window = 1; window <= 3; window += 1) {
    await sleep(18_000);
    const observed = await rawStatus();
    assert.equal(observed.status, 200, JSON.stringify(observed.body));
    if (observed.body?.constructorNonce !== constructorBefore) {
      restored = observed.body;
      break;
    }
    assert.equal(observed.body.boundaryTick, 33);
    assert.equal(observed.body.inputBatches, 9);
    assert.equal(observed.body.acceptedInputRecords, 135);
  }

  assert(restored, "workerd did not hibernate the mid-progress authority within bounded quiet windows");
  assert.equal(restored.restoreState, "restored");
  assert.equal(restored.restoreError, null);
  assert.notEqual(restored.constructorNonce, constructorBefore);
  assert.equal(restored.recoveredSocketBindings, 3);
  assert.equal(restored.connectedTransports, 3);
  assert.equal(restored.readyCurrentTopology, 3);
  assert.equal(restored.boundaryTick, 33);
  assert.equal(restored.checkpointGeneration, 1);
  assert.equal(restored.restoredCheckpointTick, 33);
  assert.equal(restored.inputBatches, 9);
  assert.equal(restored.acceptedInputRecords, 135);
  assert.equal(restored.committedInputRecords, 135);
  assert.equal(restored.inputCommitsSent, 27);
  assert(restored.progressSequence >= 6);
  assert(restored.progressPayloadBytes > 0);
  assert.equal(restored.progressStorage.rows, 1);
  for (const actor of restored.actors) {
    assert.equal(actor.actorId, actorIdentity.get(actor.actorSessionId), `restored ActorId drift for ${actor.actorSessionId}`);
  }

  // Preserve the existing reconnect-profile contract: exactly one ActorSession
  // performs an explicit transport resume before the second 30-tick segment.
  const reconnectClient = clients.find((client) => client.actorSessionId === RECONNECT_SESSION);
  assert(reconnectClient, "reconnect client missing");
  const resumedActorId = reconnectClient.state.actorId;
  reconnectClient.disconnectForResume();
  await waitForStatus(
    (value) => value.connectedTransports === 2
      && value.actors.find((actor: any) => actor.actorSessionId === RECONNECT_SESSION)?.transportConnected === false,
    "controlled transport detach",
  );
  reconnectClient.openResumeTransport();
  await waitForClient(reconnectClient, (state) => state.resumeSyncs === 1, "controlled transport resume sync");
  const resumed = await waitForStatus(
    (value) => value.connectedTransports === 3
      && value.readyCurrentTopology === 3
      && value.resumeSyncs === 1
      && value.resumedSessions.includes(RECONNECT_SESSION),
    "controlled transport resume ready",
  );
  assert.equal(reconnectClient.state.actorId, resumedActorId);
  assert.equal(
    resumed.actors.find((actor: any) => actor.actorSessionId === RECONNECT_SESSION)?.actorId,
    resumedActorId,
  );

  // Batch 3 (ticks 34..48) was accepted before hibernation and exists only in
  // the bounded progress overlay above the tick-33 exact base. Batch 4 completes
  // the segment after restore. Exact final state identity plus a second natural
  // hibernation proves those inputs affected physics and that the resulting
  // Recording seed can reconstruct the durable tick-63 authority boundary.
  for (const client of clients) client.sendBatch(4, 49);
  for (const client of clients) {
    await waitForClient(client, (state) => state.correctionTick === 63, "phase-2 correction after mid-progress restore");
  }

  const final = await waitForStatus(
    (value) => value.boundaryTick === 63
      && value.checkpointGeneration === 2
      && value.restoredCheckpointTick === 63
      && value.inputBatches === 12
      && value.acceptedInputRecords === 180
      && value.committedInputRecords === 180
      && value.inputCommitsSent === 36
      && value.continuationTicks === 60
      && value.resumeSyncs === 1
      && value.readyCurrentTopology === 3,
    "exact continuation after mid-progress hibernation",
  );

  assert.equal(sha256Text(final.finalGuardPacked), EXPECTED_FINAL_STATE_GUARD_SHA256);
  assert(Number.isSafeInteger(final.finalSeedBytes) && final.finalSeedBytes > 0);
  assert.match(final.finalSeedFnv1a32, /^[0-9a-f]{8}$/);
  assert.equal(final.topologyRevision, 3);
  assert.equal(final.topologyDigest, phase1.topologyDigest);
  assert.deepEqual(final.resumedSessions, [RECONNECT_SESSION]);
  for (const actor of final.actors) {
    assert.equal(actor.actorId, actorIdentity.get(actor.actorSessionId), `final ActorId drift for ${actor.actorSessionId}`);
  }
  for (const client of clients) {
    const state = await waitForClient(
      client,
      (candidate) => candidate.inputResults === 4 && candidate.commitMessages === 12 && candidate.commitRecords === 180,
      `final protocol accounting ${client.actorSessionId}`,
    );
    assert.equal(state.actorId, actorIdentity.get(client.actorSessionId));
  }
  assert.equal(reconnectClient.state.resumeSyncs, 1);

  const finalConstructorBefore = final.constructorNonce;
  let finalRestored: any = null;
  for (let window = 1; window <= 3; window += 1) {
    await sleep(18_000);
    const observed = await rawStatus();
    assert.equal(observed.status, 200, JSON.stringify(observed.body));
    if (observed.body?.constructorNonce !== finalConstructorBefore) {
      finalRestored = observed.body;
      break;
    }
    assert.equal(observed.body.boundaryTick, 63);
    assert.equal(observed.body.checkpointGeneration, 2);
    assert.equal(sha256Text(observed.body.finalGuardPacked), EXPECTED_FINAL_STATE_GUARD_SHA256);
  }

  assert(finalRestored, "workerd did not hibernate the final authority within bounded quiet windows");
  assert.equal(finalRestored.restoreState, "restored");
  assert.equal(finalRestored.restoreError, null);
  assert.notEqual(finalRestored.constructorNonce, finalConstructorBefore);
  assert.equal(finalRestored.recoveredSocketBindings, 3);
  assert.equal(finalRestored.connectedTransports, 3);
  assert.equal(finalRestored.readyCurrentTopology, 3);
  assert.equal(finalRestored.boundaryTick, 63);
  assert.equal(finalRestored.checkpointGeneration, 2);
  assert.equal(finalRestored.restoredCheckpointTick, 63);
  assert.equal(finalRestored.inputBatches, 12);
  assert.equal(finalRestored.acceptedInputRecords, 180);
  assert.equal(finalRestored.committedInputRecords, 180);
  assert.equal(finalRestored.inputCommitsSent, 36);
  assert.equal(finalRestored.continuationTicks, 60);
  assert.equal(finalRestored.resumeSyncs, 1);
  assert.deepEqual(finalRestored.resumedSessions, [RECONNECT_SESSION]);
  assert.equal(finalRestored.finalGuardPacked, final.finalGuardPacked);
  assert.equal(sha256Text(finalRestored.finalGuardPacked), EXPECTED_FINAL_STATE_GUARD_SHA256);
  for (const actor of finalRestored.actors) {
    assert.equal(actor.actorId, actorIdentity.get(actor.actorSessionId), `final restored ActorId drift for ${actor.actorSessionId}`);
  }

  console.log("MULTIPLAYER_FOUNDATION_MIDPROGRESS_HIBERNATION_RECOVERY_PASS", JSON.stringify({
    run: RUN,
    worldId: WORLD_ID,
    phase1BoundaryTick: phase1.boundaryTick,
    baseCheckpointGeneration: phase1.checkpointGeneration,
    partialInputBatches: partial.inputBatches,
    partialAcceptedInputRecords: partial.acceptedInputRecords,
    partialProgressSequence: partial.progressSequence,
    partialProgressPayloadBytes: partial.progressPayloadBytes,
    constructorBeforeHibernation: constructorBefore,
    constructorAfterHibernation: restored.constructorNonce,
    restoreState: restored.restoreState,
    recoveredSocketBindings: restored.recoveredSocketBindings,
    restoredInputBatches: restored.inputBatches,
    restoredAcceptedInputRecords: restored.acceptedInputRecords,
    resumedSession: RECONNECT_SESSION,
    resumedActorId,
    finalBoundaryTick: final.boundaryTick,
    finalCheckpointGeneration: final.checkpointGeneration,
    finalInputBatches: final.inputBatches,
    finalAcceptedInputRecords: final.acceptedInputRecords,
    finalCommittedInputRecords: final.committedInputRecords,
    finalInputCommitsSent: final.inputCommitsSent,
    continuationTicks: final.continuationTicks,
    finalGuardSha256: sha256Text(final.finalGuardPacked),
    finalRecordingSeedBytes: final.finalSeedBytes,
    finalRecordingSeedFnv1a32: final.finalSeedFnv1a32,
    finalConstructorBeforeHibernation: finalConstructorBefore,
    finalConstructorAfterHibernation: finalRestored.constructorNonce,
    finalRestoreState: finalRestored.restoreState,
    clients: clients.map((client) => ({
      actorSessionId: client.actorSessionId,
      actorId: client.state.actorId,
      inputResults: client.state.inputResults,
      commitMessages: client.state.commitMessages,
      commitRecords: client.state.commitRecords,
      resumeSyncs: client.state.resumeSyncs,
      correctionTick: client.state.correctionTick,
    })),
  }));
} finally {
  for (const client of clients) client.close();
  await stopWrangler(wrangler);
  try { rmSync(PERSIST_DIR, { recursive: true, force: true }); } catch { /* temp cleanup */ }
}
