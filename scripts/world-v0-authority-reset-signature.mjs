import { spawn } from "node:child_process";

const BASE = "http://127.0.0.1:8789";
const WS_BASE = "ws://127.0.0.1:8789";
const RUN = `reset-${Date.now().toString(36)}`.slice(0, 20);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function assert(value, message) { if (!value) throw new Error(message); }

let worker = null;
function startWorker() {
  const child = spawn("npx", ["wrangler", "dev", "--env", "reliability_play", "--ip", "127.0.0.1", "--port", "8789"], {
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  const logs = [];
  child.stdout.on("data", (chunk) => logs.push(chunk));
  child.stderr.on("data", (chunk) => logs.push(chunk));
  worker = { child, logs };
  return worker;
}
async function stopWorker() {
  if (!worker?.child || worker.child.exitCode !== null) return;
  try { process.kill(-worker.child.pid, "SIGTERM"); } catch { try { worker.child.kill("SIGTERM"); } catch {} }
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline && worker.child.exitCode === null) await sleep(50);
  if (worker.child.exitCode === null) {
    try { process.kill(-worker.child.pid, "SIGKILL"); } catch { try { worker.child.kill("SIGKILL"); } catch {} }
  }
}
async function waitPing(expectUp, timeout = 15_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    let up = false;
    try { up = (await fetch(`${BASE}/api/ping`, { signal: AbortSignal.timeout(600), cache: "no-store" })).ok; } catch {}
    if (up === expectUp) return;
    await sleep(80);
  }
  throw new Error(`worker ping did not become ${expectUp ? "up" : "down"}`);
}

function connect(player, resume = null) {
  const params = new URLSearchParams({ run: RUN, player });
  if (resume) params.set("resume", resume);
  const startedAt = Date.now();
  const ws = new WebSocket(`${WS_BASE}/world-v0/ws?${params}`);
  const events = [];
  const messages = [];
  ws.addEventListener("open", () => events.push({ type: "open", atMs: Date.now() - startedAt }));
  ws.addEventListener("message", async (event) => {
    const raw = typeof event.data === "string" ? event.data : await event.data.text();
    let parsed = null; try { parsed = JSON.parse(raw); } catch {}
    messages.push(parsed);
    events.push({ type: "message", messageType: parsed?.type || null, atMs: Date.now() - startedAt });
  });
  ws.addEventListener("error", () => events.push({ type: "error", atMs: Date.now() - startedAt }));
  ws.addEventListener("close", (event) => events.push({ type: "close", code: event.code, reason: event.reason || null, clean: event.wasClean, atMs: Date.now() - startedAt }));
  return { player, ws, events, messages, startedAt };
}
async function waitMessage(client, type, label, timeout = 10_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const message = client.messages.find((value) => value?.type === type);
    if (message) return message;
    await sleep(25);
  }
  throw new Error(`${label} timeout events=${JSON.stringify(client.events.slice(-6))}`);
}
async function waitClose(client, label, timeout = 10_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const event = client.events.find((value) => value.type === "close");
    if (event) return event;
    await sleep(25);
  }
  throw new Error(`${label} close timeout events=${JSON.stringify(client.events.slice(-6))}`);
}
async function probeRejectedResume(player, token, timeout = 2500) {
  const client = connect(player, token);
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const welcome = client.messages.find((value) => value?.type === "world_v0_welcome");
    if (welcome) { try { client.ws.close(); } catch {} return { accepted: true, welcome, events: client.events }; }
    if (client.events.some((value) => value.type === "close")) return { accepted: false, events: client.events, durationMs: Date.now() - client.startedAt };
    await sleep(25);
  }
  try { client.ws.close(); } catch {}
  return { accepted: false, timeout: true, events: client.events, durationMs: Date.now() - client.startedAt };
}

const result = { run: RUN, generatedAt: new Date().toISOString() };
try {
  startWorker(); await waitPing(true);
  const a = connect("ResetA"); const b = connect("ResetB");
  const aw = await waitMessage(a, "world_v0_welcome", "A welcome");
  const bw = await waitMessage(b, "world_v0_welcome", "B welcome");
  assert(aw.worldEpoch === bw.worldEpoch, "initial epoch mismatch");
  const identity = (w) => ({ worldId: w.worldId, worldEpoch: w.worldEpoch, simBuildId: w.simBuildId, clientSimRevision: w.clientSimRevision });
  a.ws.send(JSON.stringify({ type: "world_v0_ready", ...identity(aw) }));
  b.ws.send(JSON.stringify({ type: "world_v0_ready", ...identity(bw) }));
  await waitMessage(a, "world_v0_start", "A start"); await waitMessage(b, "world_v0_start", "B start");
  result.oldEpoch = aw.worldEpoch;
  result.aSession = aw.selfSessionId; result.bSession = bw.selfSessionId;

  const resetAt = new Date().toISOString();
  await stopWorker(); await waitPing(false, 5000);
  const aClose = await waitClose(a, "A authority reset");
  const bClose = await waitClose(b, "B authority reset");
  result.resetAt = resetAt; result.aClose = aClose; result.bClose = bClose;

  startWorker(); await waitPing(true);
  const aResume = await probeRejectedResume("ResetA", aw.resumeToken);
  const bResume = await probeRejectedResume("ResetB", bw.resumeToken);
  result.aResumeAfterReset = aResume; result.bResumeAfterReset = bResume;
  assert(aResume.accepted === false && bResume.accepted === false, `old resume authority unexpectedly survived process reset`);

  const fresh = connect("ResetFresh");
  const fw = await waitMessage(fresh, "world_v0_welcome", "fresh after reset");
  result.freshEpoch = fw.worldEpoch; result.freshEvents = fresh.events;
  assert(fw.worldEpoch !== aw.worldEpoch, "fresh reset epoch reused old epoch");
  try { fresh.ws.close(1000, "done"); } catch {}

  result.verdict = "WORLD_V0_AUTHORITY_RESET_SIGNATURE_PASS";
  console.log(result.verdict, JSON.stringify(result));
} finally {
  await stopWorker();
}
