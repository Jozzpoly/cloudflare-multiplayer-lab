import assert from "node:assert/strict";
import { spawn } from "node:child_process";
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
  correctionTick: number | null;
  inputResults: number;
  commitMessages: number;
  commitRecords: number;
  failure: string | null;
};

class ProbeClient {
  readonly actorSessionId: string;
  readonly input: { x: number; z: number };
  readonly socket: WebSocket;
  readonly state: ClientState = {
    worldEpoch: null,
    actorId: null,
    topologyRevision: 0,
    topologyDigest: null,
    readySyncs: 0,
    correctionTick: null,
    inputResults: 0,
    commitMessages: 0,
    commitRecords: 0,
    failure: null,
  };

  constructor(actorSessionId: string, input: { x: number; z: number }) {
    this.actorSessionId = actorSessionId;
    this.input = input;
    this.socket = new WebSocket(`ws://127.0.0.1:${PORT}/foundation-physics/ws?run=${encodeURIComponent(RUN)}`);
    this.socket.addEventListener("open", () => {
      this.socket.send(JSON.stringify({
        type: "foundation_join",
        revision: FOUNDATION_REPLICATION_PROTOCOL_REVISION,
        requestId: `join-${actorSessionId}`,
        worldId: WORLD_ID,
        actorSessionId,
        executionProfile: PROFILE,
      }));
    });
    this.socket.addEventListener("message", (event) => {
      void this.handleMessage(event).catch((error) => {
        this.state.failure = error instanceof Error ? error.stack ?? error.message : String(error);
      });
    });
    this.socket.addEventListener("error", () => {
      if (!this.state.failure) this.state.failure = "WebSocket error";
    });
    this.socket.addEventListener("close", (event) => {
      if (!this.state.failure) this.state.failure = `unexpected close ${event.code} ${event.reason}`;
    });
  }

  private async handleMessage(event: MessageEvent): Promise<void> {
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
      if (sync.reason === "correction") this.state.correctionTick = hydrated.envelope.canonicalTick;
      this.socket.send(JSON.stringify({
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

  close(): void {
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

  // Advance canonical/protocol truth beyond the durable physics boundary without
  // providing enough batches to advance the authority simulation to its next checkpoint.
  for (const client of clients) client.sendBatch(3, 34);
  const partial = await waitForStatus(
    (value) => value.boundaryTick === 33
      && value.checkpointGeneration === 1
      && value.inputBatches === 9
      && value.acceptedInputRecords === 135
      && value.committedInputRecords === 135
      && value.inputCommitsSent === 27,
    "partial post-checkpoint protocol progress",
  );
  assert.equal(partial.checkpointGeneration, 1);
  assert.equal(partial.restoredCheckpointTick, 33);
  const constructorBefore = partial.constructorNonce;

  let observedFailure: { status: number; body: any } | null = null;
  for (let window = 1; window <= 3; window += 1) {
    await sleep(18_000);
    const observed = await rawStatus();
    if (observed.body?.constructorNonce !== constructorBefore) {
      observedFailure = observed;
      break;
    }
    assert.equal(observed.status, 200, `unexpected status before constructor replacement: ${JSON.stringify(observed.body)}`);
    assert.equal(observed.body.boundaryTick, 33);
    assert.equal(observed.body.inputBatches, 9);
  }

  assert(observedFailure, "workerd did not hibernate the mid-progress authority within bounded quiet windows");
  assert.equal(observedFailure.status, 503, JSON.stringify(observedFailure.body));
  assert.equal(observedFailure.body.error, "authority_restore_failed");
  assert.notEqual(observedFailure.body.constructorNonce, constructorBefore);
  const detail = String(observedFailure.body.detail ?? "");
  assert.match(detail, /recovered socket attachment protocol state drift/);

  console.log("MULTIPLAYER_FOUNDATION_MIDPROGRESS_HIBERNATION_GAP_CONFIRMED", JSON.stringify({
    run: RUN,
    worldId: WORLD_ID,
    phase1BoundaryTick: phase1.boundaryTick,
    durableGeneration: phase1.checkpointGeneration,
    partialBoundaryTick: partial.boundaryTick,
    partialInputBatches: partial.inputBatches,
    partialAcceptedInputRecords: partial.acceptedInputRecords,
    partialCommittedInputRecords: partial.committedInputRecords,
    partialInputCommitsSent: partial.inputCommitsSent,
    constructorBeforeHibernation: constructorBefore,
    constructorAfterHibernation: observedFailure.body.constructorNonce,
    expectedRestoreFailure: "recovered socket attachment protocol state drift",
  }));
} finally {
  for (const client of clients) client.close();
  await stopWrangler(wrangler);
  try { rmSync(PERSIST_DIR, { recursive: true, force: true }); } catch { /* temp cleanup */ }
}
