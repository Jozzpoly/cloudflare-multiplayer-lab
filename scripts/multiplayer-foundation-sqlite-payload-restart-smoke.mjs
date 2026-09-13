import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const [sourcePath, recoveredPath] = process.argv.slice(2);
assert(sourcePath, "source payload path required");
assert(recoveredPath, "recovered payload path required");

const PORT = 8800;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const CONFIG = resolve("wrangler.foundation-checkpoint-test.jsonc");
const WRANGLER_BIN = resolve("node_modules/wrangler/bin/wrangler.js");
const OBJECT = "gate-4c-authority-envelope";
const PERSIST_DIR = mkdtempSync(join(tmpdir(), "multi-world-authority-envelope-sqlite-"));
const sourceBytes = readFileSync(sourcePath);
const sourceSha256 = createHash("sha256").update(sourceBytes).digest("hex");

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
      if (response.ok) return response.json();
    } catch {
      // Runtime is still starting.
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

async function publishBytes() {
  const params = new URLSearchParams({
    object: OBJECT,
    generation: "1",
    tick: "260",
    chunk: String(32 * 1024),
  });
  const response = await fetch(`${ORIGIN}/publish-bytes?${params}`, {
    method: "POST",
    headers: { "content-type": "application/octet-stream" },
    body: sourceBytes,
    signal: AbortSignal.timeout(15_000),
  });
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  return body;
}

async function recoverBytes() {
  const response = await fetch(`${ORIGIN}/recover-bytes?object=${encodeURIComponent(OBJECT)}`, {
    signal: AbortSignal.timeout(15_000),
  });
  assert.equal(response.status, 200);
  const bytes = Buffer.from(await response.arrayBuffer());
  return {
    bytes,
    generation: response.headers.get("x-foundation-generation"),
    canonicalTick: response.headers.get("x-foundation-canonical-tick"),
    sha256: response.headers.get("x-foundation-payload-sha256"),
    instanceNonce: response.headers.get("x-foundation-instance-nonce"),
  };
}

let firstServer = null;
let secondServer = null;
try {
  assert(sourceBytes.byteLength > 0 && sourceBytes.byteLength <= 1024 * 1024, "source payload must fit isolated test envelope bound");

  firstServer = startWrangler();
  const firstHealth = await waitForReady(firstServer);
  const firstInstanceNonce = firstHealth.instanceNonce;

  const published = await publishBytes();
  assert.equal(published.head.generation, 1);
  assert.equal(published.head.canonicalTick, 260);
  assert.equal(published.payloadByteLength, sourceBytes.byteLength);
  assert.equal(published.payloadSha256, sourceSha256);

  const beforeRestart = await recoverBytes();
  assert.equal(beforeRestart.instanceNonce, firstInstanceNonce);
  assert.equal(beforeRestart.generation, "1");
  assert.equal(beforeRestart.canonicalTick, "260");
  assert.equal(beforeRestart.sha256, sourceSha256);
  assert.deepEqual(beforeRestart.bytes, sourceBytes, "SQLite payload must match producer envelope before restart");

  await stopWrangler(firstServer);
  firstServer = null;

  secondServer = startWrangler();
  const secondHealth = await waitForReady(secondServer);
  assert.notEqual(secondHealth.instanceNonce, firstInstanceNonce, "full workerd restart must create a fresh DO constructor instance");

  const afterRestart = await recoverBytes();
  assert.equal(afterRestart.instanceNonce, secondHealth.instanceNonce);
  assert.equal(afterRestart.generation, "1");
  assert.equal(afterRestart.canonicalTick, "260");
  assert.equal(afterRestart.sha256, sourceSha256);
  assert.equal(afterRestart.bytes.byteLength, sourceBytes.byteLength);
  assert.deepEqual(afterRestart.bytes, sourceBytes, "SQLite payload must survive workerd restart byte-for-byte");
  const recoveredSha256 = createHash("sha256").update(afterRestart.bytes).digest("hex");
  assert.equal(recoveredSha256, sourceSha256);

  writeFileSync(recoveredPath, afterRestart.bytes);
  console.log(
    `MULTIPLAYER FOUNDATION SQLITE PAYLOAD RESTART PASS · payloadBytes=${sourceBytes.byteLength} · sha256=${sourceSha256} · full workerd restart changed constructor nonce · recovered bytes exact`,
  );
} finally {
  if (firstServer) await stopWrangler(firstServer);
  if (secondServer) await stopWrangler(secondServer);
  rmSync(PERSIST_DIR, { recursive: true, force: true });
}
