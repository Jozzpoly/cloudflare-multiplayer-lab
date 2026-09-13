import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { resolve } from "node:path";

const PORT = 8801;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const CONFIG = resolve("wrangler.foundation-box3d-workerd-test.jsonc");
const WRANGLER_BIN = resolve("node_modules/wrangler/bin/wrangler.js");

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

async function waitAndProbe(server) {
  const deadline = Date.now() + 30_000;
  let lastError = null;
  while (Date.now() < deadline) {
    if (server.child.exitCode !== null) {
      throw new Error(`wrangler exited before Box3D probe with ${server.child.exitCode}\n${server.output()}`);
    }
    try {
      const response = await fetch(`${ORIGIN}/probe`, { signal: AbortSignal.timeout(5000) });
      const body = await response.json();
      if (response.ok) return body;
      lastError = new Error(`workerd Box3D probe returned ${response.status}: ${JSON.stringify(body)}`);
      if (response.status >= 500) throw lastError;
    } catch (error) {
      lastError = error;
      if (String(error).includes("workerd Box3D probe returned 500")) throw error;
    }
    await sleep(100);
  }
  throw new Error(`workerd Box3D probe readiness timeout: ${String(lastError)}\n${server.output()}`);
}

const server = startWrangler();
try {
  const body = await waitAndProbe(server);
  assert.equal(body.ok, true);
  assert(Number.isSafeInteger(body.copiedBytes) && body.copiedBytes > 0);
  assert.equal(body.exactFutureTicks, 90);
  console.log(
    `MULTIPLAYER FOUNDATION BOX3D WORKERD RUNTIME PASS · copiedBytes=${body.copiedBytes} · exact active-contact continuation through ${body.exactFutureTicks} ticks inside workerd`,
  );
} finally {
  await stopWrangler(server);
}
