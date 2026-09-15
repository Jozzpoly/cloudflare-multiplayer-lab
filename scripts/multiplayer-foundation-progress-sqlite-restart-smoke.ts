import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { FoundationActorInputRegistry } from "../src/multiplayer-foundation/actor-input-registry.ts";
import { FoundationEntityTopology } from "../src/multiplayer-foundation/entity-topology.ts";
import {
  createFoundationReplicationProgressOverlay,
  encodeFoundationReplicationProgressOverlay,
  type FoundationReplicationProgressOverlay,
} from "../src/multiplayer-foundation/replication-progress-overlay.ts";
import { FoundationRosterMachine } from "../src/multiplayer-foundation/roster-machine.ts";

const PORT = 8794;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const CONFIG = resolve("wrangler.foundation-progress-test.jsonc");
const WRANGLER_BIN = resolve("node_modules/wrangler/bin/wrangler.js");
const PERSIST_DIR = mkdtempSync(join(tmpdir(), "mw-foundation-progress-sqlite-"));
const OBJECT = `progress-${Date.now().toString(36)}`;
const WORLD_EPOCH = "progress-sqlite-epoch-1";
const WORLD_ID = "progress-sqlite-world-1";
const BASE_TICK = 33;
const MAX_FUTURE_TICKS = 80;

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
    if (server.child.exitCode !== null) throw new Error(`wrangler exited before progress readiness\n${server.output()}`);
    try {
      const response = await fetch(`${ORIGIN}/health?object=${encodeURIComponent(OBJECT)}`, { signal: AbortSignal.timeout(1000) });
      if (response.ok) return;
    } catch {
      // workerd is still starting.
    }
    await sleep(100);
  }
  throw new Error(`progress wrangler readiness timeout\n${server.output()}`);
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

async function request(path: string, init?: RequestInit): Promise<{ status: number; body: any }> {
  const separator = path.includes("?") ? "&" : "?";
  const response = await fetch(`${ORIGIN}${path}${separator}object=${encodeURIComponent(OBJECT)}`, {
    ...init,
    signal: AbortSignal.timeout(5000),
  });
  return { status: response.status, body: await response.json() };
}

function buildOverlay(baseGeneration: number, progressSequence: number, extraAccepted: number): FoundationReplicationProgressOverlay {
  const roster = new FoundationRosterMachine({ worldEpoch: WORLD_EPOCH, capacity: 3 });
  for (let index = 0; index < 3; index += 1) {
    roster.queue({
      kind: "join",
      mutationId: `join-${index + 1}-session-${index}`,
      effectiveTick: index + 1,
      actorSessionId: `session-${index}`,
    });
  }
  roster.advanceTo(BASE_TICK);
  const snapshot = roster.snapshot();
  const topology = new FoundationEntityTopology(WORLD_EPOCH, ["prop-0"]);
  const topologySnapshot = topology.syncRoster(snapshot);
  const inputs = new FoundationActorInputRegistry(WORLD_EPOCH, MAX_FUTURE_TICKS);
  inputs.syncRoster(snapshot);
  for (let actorIndex = 0; actorIndex < snapshot.actors.length; actorIndex += 1) {
    const actor = snapshot.actors[actorIndex];
    for (let offset = 1; offset <= 15; offset += 1) {
      const accepted = inputs.schedule({
        actorId: actor.actorId,
        actorSessionId: actor.actorSessionId,
        targetTick: BASE_TICK + offset,
        x: actorIndex === 0 ? 0.8 : actorIndex === 1 ? -0.8 : 0,
        z: actorIndex === 2 ? -1 : 0.6,
      }, BASE_TICK);
      assert.equal(accepted.status, "accepted");
    }
  }
  const acceptedInputRecords = 90 + extraAccepted;
  return createFoundationReplicationProgressOverlay({
    worldId: WORLD_ID,
    worldEpoch: WORLD_EPOCH,
    baseCheckpointGeneration: baseGeneration,
    baseCanonicalTick: BASE_TICK,
    topologyRevision: topologySnapshot.topologyRevision,
    topologyDigest: topologySnapshot.topologyDigest,
    progressSequence,
    inputCheckpoint: inputs.checkpoint(snapshot),
    workerState: {
      syncSequence: 9 + progressSequence,
      syncsSent: 9 + progressSequence,
      correctionSyncs: 3,
      resumeSyncs: 0,
      inputCommitsSent: 18 + extraAccepted * 3,
      committedInputRecords: acceptedInputRecords,
      acceptedInputRecords,
      invalidMessages: 0,
      staleReady: 0,
      resumedSessions: [],
      bindings: snapshot.actors.map((actor, index) => ({
        actorSessionId: actor.actorSessionId,
        actorId: actor.actorId,
        lastTopologyRevision: topologySnapshot.topologyRevision,
        expectedSyncId: `sync-${baseGeneration}-${progressSequence}-${index}`,
        expectedRuntimeDigest: `runtime-${baseGeneration}-${progressSequence}-${index}`,
        readyTopologyRevision: topologySnapshot.topologyRevision,
        inputBatches: 2 + progressSequence,
      })),
    },
  });
}

async function writeOverlay(overlay: FoundationReplicationProgressOverlay) {
  return request("/write", {
    method: "POST",
    headers: { "content-type": "application/octet-stream" },
    body: encodeFoundationReplicationProgressOverlay(overlay) as unknown as BodyInit,
  });
}

let firstServer: ReturnType<typeof startWrangler> | null = null;
let secondServer: ReturnType<typeof startWrangler> | null = null;
try {
  firstServer = startWrangler();
  await waitForWrangler(firstServer);
  const firstHealth = await request("/health");
  assert.equal(firstHealth.status, 200);
  const firstNonce = firstHealth.body.instanceNonce;

  const seq1 = buildOverlay(1, 1, 45);
  const firstWrite = await writeOverlay(seq1);
  assert.equal(firstWrite.status, 200, JSON.stringify(firstWrite.body));
  assert.equal(firstWrite.body.result.status, "stored");
  assert.equal(firstWrite.body.result.progressSequence, 1);
  assert.equal(firstWrite.body.stats.rows, 1);

  const exactRetry = await writeOverlay(seq1);
  assert.equal(exactRetry.status, 200, JSON.stringify(exactRetry.body));
  assert.equal(exactRetry.body.result.status, "idempotent");

  const conflict = buildOverlay(1, 1, 46);
  const conflictingRetry = await writeOverlay(conflict);
  assert.equal(conflictingRetry.status, 409);
  assert.match(conflictingRetry.body.error, /conflicting retry/);

  const skipped = buildOverlay(1, 3, 47);
  const skippedWrite = await writeOverlay(skipped);
  assert.equal(skippedWrite.status, 409);
  assert.match(skippedWrite.body.error, /advance exactly by one/);

  const seq2 = buildOverlay(1, 2, 46);
  const secondWrite = await writeOverlay(seq2);
  assert.equal(secondWrite.status, 200, JSON.stringify(secondWrite.body));
  assert.equal(secondWrite.body.result.status, "stored");
  assert.equal(secondWrite.body.result.progressSequence, 2);

  const beforeRestart = await request("/read-for-base?generation=1");
  assert.equal(beforeRestart.status, 200, JSON.stringify(beforeRestart.body));
  assert.equal(beforeRestart.body.overlay.stateDigest, seq2.stateDigest);
  assert.equal(beforeRestart.body.overlay.progressSequence, 2);

  await stopWrangler(firstServer);
  firstServer = null;

  secondServer = startWrangler();
  await waitForWrangler(secondServer);
  const secondHealth = await request("/health");
  assert.equal(secondHealth.status, 200);
  const secondNonce = secondHealth.body.instanceNonce;
  assert.notEqual(secondNonce, firstNonce, "full workerd restart did not create a fresh Durable Object constructor");

  const afterRestart = await request("/read-for-base?generation=1");
  assert.equal(afterRestart.status, 200, JSON.stringify(afterRestart.body));
  assert.equal(afterRestart.body.overlay.stateDigest, seq2.stateDigest);
  assert.equal(afterRestart.body.overlay.progressSequence, 2);
  assert.equal(afterRestart.body.overlay.baseCheckpointGeneration, 1);

  const base2seq1 = buildOverlay(2, 1, 10);
  const baseAdvance = await writeOverlay(base2seq1);
  assert.equal(baseAdvance.status, 200, JSON.stringify(baseAdvance.body));
  assert.equal(baseAdvance.body.result.status, "stored");
  assert.equal(baseAdvance.body.result.baseCheckpointGeneration, 2);
  assert.equal(baseAdvance.body.result.progressSequence, 1);

  const base2Retry = await writeOverlay(base2seq1);
  assert.equal(base2Retry.status, 200, JSON.stringify(base2Retry.body));
  assert.equal(base2Retry.body.result.status, "idempotent");

  const staleWrite = await writeOverlay(buildOverlay(1, 3, 47));
  assert.equal(staleWrite.status, 409);
  assert.match(staleWrite.body.error, /base generation cannot move backwards/);

  const futureForOldBase = await request("/read-for-base?generation=1");
  assert.equal(futureForOldBase.status, 409);
  assert.match(futureForOldBase.body.error, /newer than recovered base checkpoint/);

  const staleForFutureBase = await request("/read-for-base?generation=3");
  assert.equal(staleForFutureBase.status, 200, JSON.stringify(staleForFutureBase.body));
  assert.equal(staleForFutureBase.body.overlay, null);

  const finalRead = await request("/read-for-base?generation=2");
  assert.equal(finalRead.status, 200, JSON.stringify(finalRead.body));
  assert.equal(finalRead.body.overlay.stateDigest, base2seq1.stateDigest);
  assert.equal(finalRead.body.stats.rows, 1);

  const writeTimes = [firstWrite.body.writeMs, exactRetry.body.writeMs, secondWrite.body.writeMs, baseAdvance.body.writeMs]
    .filter((value) => typeof value === "number" && Number.isFinite(value));

  console.log("MULTIPLAYER_FOUNDATION_PROGRESS_SQLITE_RESTART_PASS", JSON.stringify({
    firstConstructorNonce: firstNonce,
    secondConstructorNonce: secondNonce,
    recoveredBaseGeneration: afterRestart.body.overlay.baseCheckpointGeneration,
    recoveredProgressSequence: afterRestart.body.overlay.progressSequence,
    recoveredStateDigest: afterRestart.body.overlay.stateDigest,
    finalBaseGeneration: finalRead.body.overlay.baseCheckpointGeneration,
    finalProgressSequence: finalRead.body.overlay.progressSequence,
    finalByteLength: finalRead.body.stats.byteLength,
    databaseSize: finalRead.body.stats.databaseSize,
    sampledWriteMs: writeTimes,
    negativeCases: 4,
  }));
} finally {
  await stopWrangler(firstServer);
  await stopWrangler(secondServer);
  try { rmSync(PERSIST_DIR, { recursive: true, force: true }); } catch { /* temp cleanup */ }
}
