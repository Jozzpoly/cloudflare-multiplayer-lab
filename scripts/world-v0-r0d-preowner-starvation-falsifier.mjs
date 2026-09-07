const BASE = process.env.MW_WORLD_V0_STARVE_BASE ?? "https://cloudflare-multiplayer-lab-reliability-play.jozzpoly.workers.dev";
const WS_BASE = BASE.replace(/^http/, "ws");
const RUN = process.env.MW_WORLD_V0_STARVE_RUN ?? `st-${Date.now().toString(36)}`;
const EXPECTED_SOURCE = process.env.MW_WORLD_V0_EXPECTED_SOURCE ?? "a2e821afbbc88371b033af311cc6882d46aa6916";
const EXPECTED_DELIVERY = process.env.MW_WORLD_V0_EXPECTED_DELIVERY ?? "7da9ddd4ad37221f63a3cd418a140824783480ec";
const TIMEOUT_MS = 20_000;
const RUN_PATTERN = /^[A-Za-z0-9_-]{1,20}$/;

if (!RUN_PATTERN.test(RUN)) throw new Error(`invalid falsifier run id ${RUN}`);

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
async function waitFor(fn, label, timeoutMs = TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    try {
      const value = await fn();
      if (value) return value;
      last = value;
    } catch (error) {
      last = error;
    }
    await sleep(20);
  }
  throw new Error(`${label} timeout · last=${last instanceof Error ? last.message : JSON.stringify(last)}`);
}

const provenanceResponse = await fetch(`${BASE}/world-v0/r0d-reliability-provenance.json?r=${Date.now()}`, { cache: "no-store" });
if (!provenanceResponse.ok) throw new Error(`provenance HTTP ${provenanceResponse.status}`);
const provenance = await provenanceResponse.json();
if (provenance.qualifiedSourceSha !== EXPECTED_SOURCE) {
  throw new Error(`qualified source drift ${provenance.qualifiedSourceSha} != ${EXPECTED_SOURCE}`);
}
if (provenance.deliverySha !== EXPECTED_DELIVERY) {
  throw new Error(`delivery drift ${provenance.deliverySha} != ${EXPECTED_DELIVERY}`);
}

function makeClient(playerId) {
  const params = new URLSearchParams({ run: RUN, player: playerId });
  const ws = new WebSocket(`${WS_BASE}/world-v0/ws?${params}`);
  const messages = [];
  const state = { boundaryTick: 0, closed: false, closeCode: null, closeReason: null };
  ws.addEventListener("message", (event) => {
    try {
      const message = JSON.parse(String(event.data));
      messages.push(message);
      if (Number.isInteger(message?.boundaryTick)) state.boundaryTick = Math.max(state.boundaryTick, message.boundaryTick);
      if (Number.isInteger(message?.state?.boundaryTick)) state.boundaryTick = Math.max(state.boundaryTick, message.state.boundaryTick);
    } catch { /* diagnostic falsifier ignores malformed non-JSON traffic */ }
  });
  ws.addEventListener("close", (event) => {
    state.closed = true;
    state.closeCode = event.code;
    state.closeReason = event.reason || null;
  });
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

function startInputFeed(client, welcomeMessage, options = {}) {
  const identity = identityFrom(welcomeMessage);
  const protocolStartTick = Number(options.protocolStartTick ?? welcomeMessage.protocolStartTick ?? 0);
  let nextTarget = Math.max(protocolStartTick, Number(options.nextTarget ?? protocolStartTick));
  let batchSeq = Math.max(1, Number(options.nextBatchSeq ?? 1));
  const x = Number(options.x ?? 0);
  const z = Number(options.z ?? 0);
  let active = true;
  const timer = setInterval(() => {
    if (!active || client.ws.readyState !== WebSocket.OPEN) return;
    const maxAuthored = client.state.boundaryTick + 8;
    while (nextTarget + 1 <= maxAuthored) {
      client.ws.send(JSON.stringify({
        type: "world_v0_input_batch",
        ...identity,
        batchSeq,
        records: [
          { targetTick: nextTarget, x, z, jump: false },
          { targetTick: nextTarget + 1, x, z, jump: false },
        ],
      }));
      batchSeq += 1;
      nextTarget += 2;
    }
  }, 8);
  return {
    stop() { active = false; clearInterval(timer); },
    get batchSeq() { return batchSeq; },
    get nextTarget() { return nextTarget; },
  };
}

const a = makeClient("starve-a");
const aw = await welcome(a);
const b = makeClient("starve-b");
const bw = await welcome(b);
if (aw.worldEpoch !== bw.worldEpoch) throw new Error("peers did not share one WorldEpoch");
if (aw.selfSessionId === bw.selfSessionId) throw new Error("peers shared ActorSession identity");
const oldEpoch = aw.worldEpoch;

sendReady(a, aw);
sendReady(b, bw);
await waitMessage(a, (m) => m?.type === "world_v0_ready_ack", "A ready ack");
await waitMessage(b, (m) => m?.type === "world_v0_ready_ack", "B ready ack");
const startA = await waitMessage(a, (m) => m?.type === "world_v0_start", "A start");
const startB = await waitMessage(b, (m) => m?.type === "world_v0_start", "B start");
if (startA.protocolStartTick !== startB.protocolStartTick) throw new Error("protocol start disagreement");
aw.protocolStartTick = startA.protocolStartTick;
bw.protocolStartTick = startB.protocolStartTick;

const feedA = startInputFeed(a, aw, { x: 0.35, z: 0 });
const feedB = startInputFeed(b, bw, { x: -0.35, z: 0 });
const baseline = await waitMessage(a, (message) => message?.type === "world_v0_consumed" &&
  message.worldEpoch === oldEpoch &&
  message.players?.some((player) => player.netEntityId === bw.selfNetEntityId && player.source === "fresh"),
"B fresh baseline", 30_000);

const starvationStartedAtBoundary = baseline.boundaryTick;
feedB.stop(); // Deliberately leave B WebSocket OPEN. This is the old human-failure shape.

const expired = await waitMessage(a, (message) => message?.type === "world_v0_consumed" &&
  message.worldEpoch === oldEpoch &&
  message.boundaryTick > starvationStartedAtBoundary &&
  message.players?.some((player) => player.netEntityId === bw.selfNetEntityId && player.source === "lease_expired"),
"B actor-local lease expiry on live transport", 30_000);

if (b.ws.readyState !== WebSocket.OPEN || b.state.closed) {
  throw new Error(`B transport did not remain open through starvation: readyState=${b.ws.readyState} close=${b.state.closeCode}/${b.state.closeReason}`);
}
if (a.messages.some((message) => message?.type === "world_v0_epoch_ended") ||
    b.messages.some((message) => message?.type === "world_v0_epoch_ended")) {
  throw new Error("input starvation on live transport still killed the WorldEpoch");
}
const aAtExpiry = expired.players?.find((player) => player.netEntityId === aw.selfNetEntityId);
if (!aAtExpiry || aAtExpiry.source === "lease_expired") throw new Error("healthy A did not remain canonically live");

const throughExpiry = a.messages.filter((message) =>
  message?.type === "world_v0_consumed" && message.worldEpoch === oldEpoch && message.boundaryTick <= expired.boundaryTick
);
const lastFreshB = [...throughExpiry].reverse().find((message) =>
  message.players?.some((player) => player.netEntityId === bw.selfNetEntityId && player.source === "fresh")
);
if (!lastFreshB) throw new Error("could not locate B last fresh canonical boundary");
const leaseAfterLastFreshTicks = expired.boundaryTick - lastFreshB.boundaryTick;
if (leaseAfterLastFreshTicks !== 36) {
  throw new Error(`actor-local lease boundary drift: expected 36, got ${leaseAfterLastFreshTicks}`);
}

const nextBatchSeq = feedB.batchSeq;
const resumeTarget = Math.max(startB.protocolStartTick, b.state.boundaryTick + 6);
const feedB2 = startInputFeed(b, bw, {
  x: 0,
  z: 0.55,
  nextBatchSeq,
  nextTarget: resumeTarget,
  protocolStartTick: startB.protocolStartTick,
});

const recoveredFresh = await waitMessage(a, (message) => message?.type === "world_v0_consumed" &&
  message.worldEpoch === oldEpoch &&
  message.boundaryTick > expired.boundaryTick &&
  message.players?.some((player) => player.netEntityId === bw.selfNetEntityId && player.source === "fresh"),
"B fresh input recovery on same socket", 20_000);

if (b.ws.readyState !== WebSocket.OPEN || b.state.closed) throw new Error("B transport closed during same-socket recovery");
if (a.messages.some((message) => message?.type === "world_v0_epoch_ended") ||
    b.messages.some((message) => message?.type === "world_v0_epoch_ended")) {
  throw new Error("WorldEpoch ended during same-socket starvation recovery");
}

feedA.stop();
feedB2.stop();
const result = {
  revision: "world-v0-r0d-preowner-live-transport-starvation-v1",
  run: RUN,
  provenance: {
    qualifiedSourceSha: provenance.qualifiedSourceSha,
    deliverySha: provenance.deliverySha,
    worker: provenance.worker,
    simBuildId: provenance.simBuildId,
  },
  worldEpoch: oldEpoch,
  actorSessionId: bw.selfSessionId,
  transport: {
    remainedOpenThroughStarvation: true,
    starvationStartedAtBoundary,
    lastFreshBoundary: lastFreshB.boundaryTick,
    leaseExpiredBoundary: expired.boundaryTick,
    leaseAfterLastFreshTicks,
    recoveredFreshBoundary: recoveredFresh.boundaryTick,
    sameSocketRecovery: true,
  },
  sharedContinuity: {
    healthyPeerStayedFresh: true,
    worldEpochPreserved: true,
    noEpochEndedObserved: true,
  },
  verdict: "WORLD_V0_R0D_PREOWNER_LIVE_TRANSPORT_STARVATION_PASS",
  nonClaim: "This targets the original ordinary-visible-play causal shape: canonical input starvation while the actor transport remains open. It does not simulate browser main-thread stalls, mobile background/discard, process loss, or Owner-visible feel.",
};
console.log("WORLD_V0_R0D_PREOWNER_LIVE_TRANSPORT_STARVATION", JSON.stringify(result, null, 2));
console.log(result.verdict);

try { a.ws.close(1000, "starvation_falsifier_done"); } catch {}
try { b.ws.close(1000, "starvation_falsifier_done"); } catch {}
await sleep(50);
process.exit(0);
