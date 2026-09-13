import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const [envelopePath] = process.argv.slice(2);
assert(envelopePath, "authority envelope path required");

const PORT = 8810;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const CONFIG = resolve("wrangler.foundation-authority-constructor-test.jsonc");
const WRANGLER_BIN = resolve("node_modules/wrangler/bin/wrangler.js");
const WORKER_FIXTURE = resolve("scripts/fixtures/multiplayer-foundation-authority-constructor-worker.mjs");
const OBJECT = "gate-4c-authority-constructor";
const PERSIST_DIR = mkdtempSync(join(tmpdir(), "multi-world-authority-constructor-"));
const envelopeBytes = readFileSync(envelopePath);
const envelope = JSON.parse(envelopeBytes.toString("utf8"));
const envelopeSha256 = createHash("sha256").update(envelopeBytes).digest("hex");

function instrumentDivergenceDiagnostics() {
  const source = readFileSync(WORKER_FIXTURE, "utf8");
  const needle = "          requireCondition(sameJson(actual, expected), `fresh-constructor authority divergence at tick ${expected.tick}`);";
  assert.equal(source.split(needle).length - 1, 1, "constructor divergence diagnostic insertion point drifted");
  const replacement = [
    "          if (!sameJson(actual, expected)) {",
    "            const differingKeys = Object.keys(expected).filter((key) => JSON.stringify(actual[key]) !== JSON.stringify(expected[key]));",
    "            const details = differingKeys.map((key) => {",
    "              const actualValue = actual[key];",
    "              const expectedValue = expected[key];",
    "              if (key === 'guardPacked' && typeof actualValue === 'string' && typeof expectedValue === 'string') {",
    "                const limit = Math.min(actualValue.length, expectedValue.length);",
    "                let firstDiff = -1;",
    "                for (let index = 0; index < limit; index += 1) {",
    "                  if (actualValue[index] !== expectedValue[index]) { firstDiff = index; break; }",
    "                }",
    "                if (firstDiff === -1 && actualValue.length !== expectedValue.length) firstDiff = limit;",
    "                const start = Math.max(0, firstDiff - 32);",
    "                const end = firstDiff < 0 ? 64 : firstDiff + 64;",
    "                return `guardPacked:firstDiff=${firstDiff}:actualLength=${actualValue.length}:expectedLength=${expectedValue.length}:actualAround=${JSON.stringify(actualValue.slice(start, end))}:expectedAround=${JSON.stringify(expectedValue.slice(start, end))}`;",
    "              }",
    "              return `${key}:actual=${JSON.stringify(actualValue)}:expected=${JSON.stringify(expectedValue)}`;",
    "            });",
    "            throw new Error(`fresh-constructor authority divergence at tick ${expected.tick}; differingKeys=${differingKeys.join(',')}; ${details.join(' | ')}`);",
    "          }",
  ].join("\n");
  writeFileSync(WORKER_FIXTURE, source.replace(needle, replacement));
}

instrumentDivergenceDiagnostics();

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

function boundedAppend(current, chunk) {
  const next = current + String(chunk);
  return next.length > 16000 ? next.slice(-16000) : next;
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

async function requestJson(path, init = undefined) {
  const response = await fetch(`${ORIGIN}${path}`, {
    ...init,
    signal: AbortSignal.timeout(20_000),
  });
  const body = await response.json();
  return { response, body };
}

async function waitForHealth(server, expectedState) {
  const deadline = Date.now() + 40_000;
  let last = null;
  while (Date.now() < deadline) {
    if (server.child.exitCode !== null) {
      throw new Error(`wrangler exited before readiness with ${server.child.exitCode}\n${server.output()}`);
    }
    try {
      const result = await requestJson(`/health?object=${encodeURIComponent(OBJECT)}`);
      last = result.body;
      if (result.response.ok && result.body.restoreState === expectedState) return result.body;
      if (result.body.restoreState === "failed") {
        throw new Error(`fresh constructor restore failed: ${JSON.stringify(result.body)}\n${server.output()}`);
      }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("fresh constructor restore failed:")) throw error;
    }
    await sleep(100);
  }
  throw new Error(`wrangler health timeout waiting for ${expectedState}; last=${JSON.stringify(last)}\n${server.output()}`);
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

async function publishEnvelope() {
  const result = await requestJson(`/publish-envelope?object=${encodeURIComponent(OBJECT)}`, {
    method: "POST",
    headers: { "content-type": "application/octet-stream" },
    body: envelopeBytes,
  });
  assert.equal(result.response.status, 200, JSON.stringify(result.body));
  return result.body;
}

async function resumeAuthority() {
  const result = await requestJson(`/resume?object=${encodeURIComponent(OBJECT)}`, { method: "POST" });
  assert.equal(result.response.status, 200, JSON.stringify(result.body));
  return result.body;
}

let firstServer = null;
let secondServer = null;
try {
  assert(envelopeBytes.byteLength > 0 && envelopeBytes.byteLength <= 1024 * 1024, "authority envelope must fit isolated test bound");
  assert.equal(envelope.revision, "multiplayer-foundation-authority-byte-envelope-probe-v1");
  assert.equal(envelope.canonicalTick, 260);
  assert.equal(envelope.worldEpoch, "authority-byte-process-epoch");
  assert.equal(envelope.physics.byteLength, 41829);
  assert(Array.isArray(envelope.expectedFrames) && envelope.expectedFrames.length > 0);
  const expectedLastTick = envelope.expectedFrames.at(-1).tick;

  firstServer = startWrangler();
  const firstHealth = await waitForHealth(firstServer, "empty");
  const firstInstanceNonce = firstHealth.instanceNonce;
  assert.equal(firstHealth.restoredBoundary, null);

  const published = await publishEnvelope();
  assert.equal(published.instanceNonce, firstInstanceNonce);
  assert.equal(published.head.generation, 1);
  assert.equal(published.head.canonicalTick, 260);
  assert.equal(published.head.worldEpoch, envelope.worldEpoch);
  assert.equal(published.payloadByteLength, envelopeBytes.byteLength);
  assert.equal(published.payloadSha256, envelopeSha256);
  assert(published.chunkCount > 1, "authority envelope should exercise multi-chunk publication");

  const firstAfterPublish = await waitForHealth(firstServer, "empty");
  assert.equal(firstAfterPublish.instanceNonce, firstInstanceNonce);
  assert.equal(firstAfterPublish.restoredBoundary, null, "publication must not masquerade as constructor restore");

  await stopWrangler(firstServer);
  firstServer = null;

  secondServer = startWrangler();
  const secondHealth = await waitForHealth(secondServer, "restored");
  assert.notEqual(secondHealth.instanceNonce, firstInstanceNonce, "full workerd restart must create a fresh DO constructor instance");
  assert.equal(secondHealth.restoreError, null);
  assert(secondHealth.restoredBoundary, "fresh constructor must report restored boundary before resume request");
  assert.equal(secondHealth.restoredBoundary.generation, 1);
  assert.equal(secondHealth.restoredBoundary.canonicalTick, 260);
  assert.equal(secondHealth.restoredBoundary.payloadSha256, envelopeSha256);
  assert.equal(secondHealth.restoredBoundary.physicsByteLength, 41829);
  assert.equal(secondHealth.restoredBoundary.expectedFrameCount, envelope.expectedFrames.length);
  assert.equal(secondHealth.resumed, false, "constructor must restore without consuming future frames");

  const resumed = await resumeAuthority();
  assert.equal(resumed.instanceNonce, secondHealth.instanceNonce);
  assert.equal(resumed.restoredBoundary.generation, 1);
  assert.equal(resumed.restoredBoundary.canonicalTick, 260);
  assert.equal(resumed.exactFrameCount, envelope.expectedFrames.length);
  assert.equal(resumed.resumedThrough, expectedLastTick);
  assert(resumed.finalActorIds.includes("actor:7"), "post-restore replacement actor missing");
  assert(!resumed.finalActorIds.includes("actor:4"), "post-restore retired actor survived");

  const afterResumeHealth = await waitForHealth(secondServer, "restored");
  assert.equal(afterResumeHealth.instanceNonce, secondHealth.instanceNonce);
  assert.equal(afterResumeHealth.resumed, true);

  console.log(
    `MULTIPLAYER FOUNDATION AUTHORITY CONSTRUCTOR RESTART PASS · envelopeBytes=${envelopeBytes.byteLength} · physicsBytes=${envelope.physics.byteLength} · full workerd restart changed constructor nonce · fresh DO constructor restored from SQLite before request handling · exact authority future through tick ${expectedLastTick}`,
  );
} finally {
  if (firstServer) await stopWrangler(firstServer);
  if (secondServer) await stopWrangler(secondServer);
  rmSync(PERSIST_DIR, { recursive: true, force: true });
}
