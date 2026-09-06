import { WORLD_V0_TIMING } from "../src/world-v0-contract.ts";

const BASE = process.env.MW_WORLD_V0_I3B_BASE || "http://127.0.0.1:8797";
const WS_BASE = BASE.replace(/^http/, "ws");
const RUN = process.env.MW_WORLD_V0_I3B_RUN || `i3b-buffer-${Date.now().toString(36)}`;
const TIMEOUT_MS = 20_000;

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function assert(condition, message) { if (!condition) throw new Error(message); }
async function waitFor(fn, label, timeoutMs = TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    try {
      const value = await fn();
      if (value) return value;
      last = value;
    } catch (error) { last = error; }
    await sleep(15);
  }
  throw new Error(`${label} timeout · last=${last instanceof Error ? last.message : JSON.stringify(last)}`);
}

await waitFor(async () => {
  try { return (await fetch(`${BASE}/world-v0/`, { cache: "no-store" })).ok; }
  catch { return false; }
}, "worker readiness");

function makeClient(playerId, resumeToken = null) {
  const params = new URLSearchParams({ run: RUN, player: playerId });
  if (resumeToken) params.set("resume", resumeToken);
  const ws = new WebSocket(`${WS_BASE}/world-v0/ws?${params}`);
  const messages = [];
  const state = { boundaryTick: 0, closed: false };
  ws.addEventListener("message", (event) => {
    try {
      const message = JSON.parse(String(event.data));
      messages.push(message);
      if (Number.isInteger(message?.boundaryTick)) state.boundaryTick = Math.max(state.boundaryTick, message.boundaryTick);
      if (Number.isInteger(message?.state?.boundaryTick)) state.boundaryTick = Math.max(state.boundaryTick, message.state.boundaryTick);
    } catch { /* diagnostic only */ }
  });
  ws.addEventListener("close", () => { state.closed = true; });
  const opened = new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", () => reject(new Error(`${playerId} websocket error before open`)), { once: true });
  });
  return { playerId, ws, messages, state, opened };
}

async function waitMessage(client, predicate, label, timeoutMs = TIMEOUT_MS) {
  await client.opened;
  return waitFor(() => client.messages.find(predicate) || false, label, timeoutMs);
}
async function welcome(client) {
  return waitMessage(client, (message) => message?.type === "world_v0_welcome", `${client.playerId} welcome`);
}
function identityFrom(message) {
  return {
    worldId: message.worldId,
    worldEpoch: message.worldEpoch,
    simBuildId: message.simBuildId,
    clientSimRevision: message.clientSimRevision,
  };
}
function sendReady(client, welcomeMessage) {
  client.ws.send(JSON.stringify({ type: "world_v0_ready", ...identityFrom(welcomeMessage) }));
}

const a = makeClient("i3b-buffer-a");
const aw = await welcome(a);
let b = makeClient("i3b-buffer-b");
let bw = await welcome(b);
assert(aw.worldEpoch === bw.worldEpoch, "future-buffer peers split WorldEpoch");
sendReady(a, aw);
sendReady(b, bw);
const start = await waitMessage(a, (m) => m?.type === "world_v0_start", "world start");
await waitMessage(b, (m) => m?.type === "world_v0_start", "B world start");
const actorSessionId = bw.selfSessionId;
const resumeToken = bw.resumeToken;
assert(actorSessionId && resumeToken, "future-buffer actor identity missing");

let proof = null;
let nextBatchSeq = 1;
for (let attempt = 1; attempt <= 3 && !proof; attempt += 1) {
  const active = await waitMessage(a, (m) => m?.type === "world_v0_consumed" && m.boundaryTick >= start.protocolStartTick + 2,
    `active authority attempt ${attempt}`);
  const observedBoundary = Math.max(active.boundaryTick, a.state.boundaryTick, b.state.boundaryTick);
  const targetTick = observedBoundary + WORLD_V0_TIMING.maxFutureTicks;
  const marker = { x: 0.55 + attempt * 0.05, z: -0.2, jump: false };
  const batchSeq = Math.max(nextBatchSeq, Number(bw.resumeLastBatchSeq || 0) + 1);
  b.ws.send(JSON.stringify({
    type: "world_v0_input_batch",
    ...identityFrom(bw),
    batchSeq,
    records: [{ targetTick, ...marker }],
  }));
  const ack = await waitMessage(b, (m) => m?.type === "world_v0_batch_ack" && m.batchSeq === batchSeq,
    `future marker ACK attempt ${attempt}`);
  const record = ack.records?.find((entry) => entry.targetTick === targetTick);
  assert(record?.status === "accepted", `future marker not newly accepted: ${JSON.stringify(record)}`);
  nextBatchSeq = batchSeq + 1;

  try { b.ws.close(1000, `i3b_future_buffer_rebind_${attempt}`); } catch {}
  const rebound = makeClient("i3b-buffer-b", resumeToken);
  const reboundWelcome = await welcome(rebound);
  assert(reboundWelcome.resumed === true, "future-buffer rebind was not resumed");
  assert(reboundWelcome.worldEpoch === bw.worldEpoch, "future-buffer rebind rotated WorldEpoch");
  assert(reboundWelcome.selfSessionId === actorSessionId, "future-buffer rebind changed ActorSession");
  assert(reboundWelcome.resumeToken === resumeToken, "future-buffer rebind changed resume token");
  assert(Number(reboundWelcome.resumeLastBatchSeq) >= batchSeq, "future-buffer rebind lost last batch sequence");

  const rebaseBoundary = reboundWelcome.rebaseSeed?.boundaryTick;
  assert(Number.isInteger(rebaseBoundary), "future-buffer rebind missing exact rebase boundary");
  b = rebound;
  bw = reboundWelcome;

  if (rebaseBoundary >= targetTick) {
    console.log("WORLD_V0_I3B_RESUME_BUFFER_RETRY", JSON.stringify({ attempt, observedBoundary, targetTick, rebaseBoundary }));
    continue;
  }

  const consumed = await waitMessage(a, (m) => m?.type === "world_v0_consumed" && m.targetTick === targetTick,
    `preserved future marker consumption attempt ${attempt}`);
  const actor = consumed.players?.find((entry) => entry.sessionId === actorSessionId);
  assert(actor, "preserved future marker missing actor consumption");
  assert(actor.source === "fresh", `preserved future marker was not fresh: ${actor.source}`);
  assert(Math.abs(actor.x - marker.x) < 1e-9 && Math.abs(actor.z - marker.z) < 1e-9,
    `preserved future marker changed: ${JSON.stringify(actor)} vs ${JSON.stringify(marker)}`);
  proof = {
    attempt,
    observedBoundary,
    targetTick,
    rebaseBoundary,
    consumedBoundary: consumed.boundaryTick,
    batchSeq,
    marker,
    source: actor.source,
  };
}

assert(proof, "could not preserve a still-future accepted input across bounded actor rebind attempts");
try { a.ws.close(1000, "i3b_future_buffer_done"); } catch {}
try { b.ws.close(1000, "i3b_future_buffer_done"); } catch {}

const result = {
  revision: "world-v0-i3b-resume-buffer-v1",
  run: RUN,
  simBuildId: bw.simBuildId,
  actorSessionId,
  maxFutureTicks: WORLD_V0_TIMING.maxFutureTicks,
  proof,
  verdict: "WORLD_V0_I3B_RESUME_BUFFER_PASS",
  nonClaim: "This proves an already accepted future canonical input remains in the authority ActorSession buffer across transport rebind and exact rebase. It does not claim that post-rebase re-authoring can revise ticks the authority has already consumed.",
};
console.log("WORLD_V0_I3B_RESUME_BUFFER", JSON.stringify(result, null, 2));
console.log(result.verdict);
