import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const PORT = 8799;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const CONFIG = resolve("wrangler.foundation-checkpoint-test.jsonc");
const WRANGLER_BIN = resolve("node_modules/wrangler/bin/wrangler.js");
const OBJECT = "gate-4c-sqlite-restart";
const ISOLATED_OBJECT = "gate-4c-sqlite-isolation";
const PERSIST_DIR = mkdtempSync(join(tmpdir(), "multi-world-checkpoint-sqlite-"));

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

function boundedAppend(current, chunk) {
  const next = current + String(chunk);
  return next.length > 12000 ? next.slice(-12000) : next;
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

async function waitForReady(server) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (server.child.exitCode !== null) {
      throw new Error(`wrangler exited before readiness with ${server.child.exitCode}\n${server.output()}`);
    }
    try {
      const response = await fetch(`${ORIGIN}/health?object=${encodeURIComponent(OBJECT)}`, {
        signal: AbortSignal.timeout(1000),
      });
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }
    await sleep(100);
  }
  throw new Error(`wrangler readiness timeout\n${server.output()}`);
}

async function stopWrangler(server) {
  if (server.child.exitCode !== null) return;
  server.child.kill("SIGTERM");
  const exited = await Promise.race([
    new Promise((resolveExit) => server.child.once("exit", () => resolveExit(true))),
    sleep(5000).then(() => false),
  ]);
  if (!exited && server.child.exitCode === null) {
    server.child.kill("SIGKILL");
    await new Promise((resolveExit) => server.child.once("exit", resolveExit));
  }
}

async function requestJson(path, expectedStatus = 200) {
  const response = await fetch(`${ORIGIN}${path}`, { signal: AbortSignal.timeout(15_000) });
  const body = await response.json();
  assert.equal(response.status, expectedStatus, `${path}: ${JSON.stringify(body)}`);
  return body;
}

async function recover(object = OBJECT) {
  return requestJson(`/recover?object=${encodeURIComponent(object)}`);
}

async function publish({ generation, tick, seed, bytes, object = OBJECT }) {
  const params = new URLSearchParams({
    object,
    generation: String(generation),
    tick: String(tick),
    seed: String(seed),
    bytes: String(bytes),
    chunk: String(32 * 1024),
  });
  const response = await fetch(`${ORIGIN}/publish?${params}`, { signal: AbortSignal.timeout(15_000) });
  return { status: response.status, body: await response.json() };
}

let firstServer = null;
let secondServer = null;
try {
  firstServer = startWrangler();
  await waitForReady(firstServer);

  const empty = await recover();
  assert.equal(empty.ok, true);
  assert.equal(empty.recovered, null);
  const firstInstanceNonce = empty.instanceNonce;

  const isolatedEmpty = await recover(ISOLATED_OBJECT);
  assert.equal(isolatedEmpty.recovered, null, "separate Durable Object identity must start with separate SQLite storage");
  assert.notEqual(isolatedEmpty.instanceNonce, firstInstanceNonce, "separate object identity must be a separate DO instance");

  const generation1 = await publish({ generation: 1, tick: 260, seed: 0x11111111, bytes: 279_068 });
  assert.equal(generation1.status, 200, JSON.stringify(generation1.body));
  assert.equal(generation1.body.head.generation, 1);
  assert.equal(generation1.body.payloadByteLength, 279_068);
  assert(generation1.body.stats.immutableRows > 2);
  assert.equal(generation1.body.stats.headRows, 1);

  // Two callers race to publish the same next generation with different payloads.
  // Exactly one may become HEAD; the other must observe stale/CAS conflict and fail.
  const [candidateA, candidateB] = await Promise.all([
    publish({ generation: 2, tick: 300, seed: 0x22222222, bytes: 350_123 }),
    publish({ generation: 2, tick: 301, seed: 0x33333333, bytes: 310_777 }),
  ]);
  const successfulCandidates = [candidateA, candidateB].filter((candidate) => candidate.status === 200);
  const rejectedCandidates = [candidateA, candidateB].filter((candidate) => candidate.status === 409);
  assert.equal(successfulCandidates.length, 1, `one generation-2 publication must win: ${JSON.stringify([candidateA, candidateB])}`);
  assert.equal(rejectedCandidates.length, 1, `one generation-2 publication must fail: ${JSON.stringify([candidateA, candidateB])}`);
  assert.match(rejectedCandidates[0].body.error, /not newer than 2|HEAD changed during publication/);

  const winner = successfulCandidates[0].body;
  assert.equal(winner.head.generation, 2);
  const expectedTick = winner.head.canonicalTick;
  const expectedSha = winner.payloadSha256;
  const expectedBytes = winner.payloadByteLength;

  const beforeRestart = await recover();
  assert.equal(beforeRestart.instanceNonce, firstInstanceNonce, "same running DO must keep constructor nonce");
  assert.equal(beforeRestart.recovered.generation, 2);
  assert.equal(beforeRestart.recovered.canonicalTick, expectedTick);
  assert.equal(beforeRestart.recovered.payloadSha256, expectedSha);
  assert.equal(beforeRestart.recovered.payloadByteLength, expectedBytes);

  await stopWrangler(firstServer);
  firstServer = null;

  // Explicitly cross the local workerd process boundary while preserving only
  // the configured Durable Object persistence directory.
  secondServer = startWrangler();
  await waitForReady(secondServer);

  const afterRestart = await recover();
  assert.equal(afterRestart.ok, true);
  assert.notEqual(afterRestart.instanceNonce, firstInstanceNonce, "full workerd restart must create a fresh DO constructor instance");
  assert.equal(afterRestart.recovered.generation, 2);
  assert.equal(afterRestart.recovered.canonicalTick, expectedTick);
  assert.equal(afterRestart.recovered.payloadSha256, expectedSha);
  assert.equal(afterRestart.recovered.payloadByteLength, expectedBytes);
  assert.equal(afterRestart.stats.headRows, 1);

  const duplicateAfterRestart = await publish({ generation: 2, tick: expectedTick + 1, seed: 0x55555555, bytes: 100_001 });
  assert.equal(duplicateAfterRestart.status, 409);
  assert.match(duplicateAfterRestart.body.error, /is not newer than 2/);

  const generation3 = await publish({ generation: 3, tick: 340, seed: 0x44444444, bytes: 418_290 });
  assert.equal(generation3.status, 200, JSON.stringify(generation3.body));
  assert.equal(generation3.body.head.generation, 3);

  const finalRecovery = await recover();
  assert.equal(finalRecovery.recovered.generation, 3);
  assert.equal(finalRecovery.recovered.canonicalTick, 340);
  assert.equal(finalRecovery.recovered.payloadSha256, generation3.body.payloadSha256);
  assert.equal(finalRecovery.recovered.payloadByteLength, 418_290);

  console.log(
    `MULTIPLAYER FOUNDATION SQLITE RESTART PASS · real SQLite-backed DO · concurrent generation-2 publication had one winner · full Wrangler/workerd restart changed constructor nonce and preserved exact generation-2 payload · generation-3 publication after restart recovered · databaseSize=${finalRecovery.stats.databaseSize}`,
  );
} finally {
  if (firstServer) await stopWrangler(firstServer);
  if (secondServer) await stopWrangler(secondServer);
  rmSync(PERSIST_DIR, { recursive: true, force: true });
}
