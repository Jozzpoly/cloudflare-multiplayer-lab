import { writeFileSync } from "node:fs";

const BASE = (process.env.MW_WORLD_V0_PRESTART_PARTIAL_BASE || "http://127.0.0.1:8787").replace(/\/$/, "");
const OUTPUT = process.env.MW_WORLD_V0_PRESTART_PARTIAL_OUTPUT || "world-v0-prestart-partial-resume.json";
const TIMEOUT_MS = 8_000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function assert(condition, message) { if (!condition) throw new Error(message); }

function connect(run, player, resume = null) {
  const wsBase = BASE.replace(/^http/, "ws");
  const params = new URLSearchParams({ run, player });
  if (resume) params.set("resume", resume);
  const ws = new WebSocket(`${wsBase}/world-v0/ws?${params}`);
  const messages = [];
  ws.addEventListener("message", async (event) => {
    const raw = typeof event.data === "string" ? event.data : await event.data.text();
    try { messages.push(JSON.parse(raw)); } catch {}
  });
  return { ws, messages };
}

async function waitMessage(client, predicate, label, timeoutMs = TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const found = client.messages.find(predicate);
    if (found) return found;
    await sleep(25);
  }
  throw new Error(`${label} timeout · ${JSON.stringify(client.messages.slice(-8))}`);
}

function identity(welcome) {
  return {
    worldId: welcome.worldId,
    worldEpoch: welcome.worldEpoch,
    simBuildId: welcome.simBuildId,
    clientSimRevision: welcome.clientSimRevision,
  };
}

const suffix = Date.now().toString(36).slice(-7);
const run = `pr-${suffix}`;
const aPlayer = `PartialA-${suffix}`;
const bPlayer = `PartialB-${suffix}`;
const a = connect(run, aPlayer);
const aw = await waitMessage(a, (m) => m?.type === "world_v0_welcome", "A welcome");
const b = connect(run, bPlayer);
const bw = await waitMessage(b, (m) => m?.type === "world_v0_welcome", "B welcome");
assert(aw.worldEpoch === bw.worldEpoch, "initial epoch mismatch");
assert(aw.protocolStartTick === null && bw.protocolStartTick === null, "probe unexpectedly started early");

await waitMessage(a, (m) => m?.type === "world_v0_roster" && m.players?.length === 2, "A two-player roster");
a.ws.send(JSON.stringify({ type: "world_v0_ready", ...identity(aw) }));
await waitMessage(a, (m) => m?.type === "world_v0_ready_ack", "A ready ack");
assert(!a.messages.some((m) => m?.type === "world_v0_start"), "start committed before B ready");

b.ws.close(1000, "partial-resume-drop-b");
await sleep(250);
a.ws.close(1000, "partial-resume-drop-a");
await sleep(350);

const resumedB = connect(run, bPlayer, bw.resumeToken);
const rw = await waitMessage(resumedB, (m) => m?.type === "world_v0_welcome", "B resume");
assert(rw.resumed === true, "B resume rejected inside ambiguity grace");
assert(rw.worldEpoch === bw.worldEpoch, "B resume rotated epoch");
assert(rw.selfSessionId === bw.selfSessionId, "B resume changed ActorSession");
assert(rw.protocolStartTick === null, "run already started before B re-ready");
assert(rw.waitingForPeer === true, "apparatus invalid: authority did not observe B as sole connected player");

resumedB.ws.send(JSON.stringify({ type: "world_v0_ready", ...identity(rw) }));
await waitMessage(resumedB, (m) => m?.type === "world_v0_ready_ack", "B resumed ready ack");
const start = await waitMessage(resumedB, (m) => m?.type === "world_v0_start", "unexpected start with A disconnected", 3000);

const result = {
  revision: "world-v0-closure-prestart-partial-resume-v1-falsifier",
  run,
  worldEpoch: bw.worldEpoch,
  beforeDisconnect: {
    aReadyAck: true,
    bReadySent: false,
    protocolStartTick: null,
  },
  resumedB: {
    resumed: rw.resumed,
    sameWorldEpoch: rw.worldEpoch === bw.worldEpoch,
    sameActorSession: rw.selfSessionId === bw.selfSessionId,
    waitingForPeer: rw.waitingForPeer,
  },
  startWithPeerOffline: {
    observed: Boolean(start),
    protocolStartTick: start.protocolStartTick,
    worldEpoch: start.worldEpoch,
  },
  verdict: "WORLD_V0_CLOSURE_PRESTART_PARTIAL_RESUME_START_REPRODUCED",
  interpretation: "Authority started the two-player protocol after only B had reconnected because A's pre-disconnect ready flag remained true. The preserved pre-start ActorSession is valid, but protocol start must additionally require both live transports.",
  nonClaim: "This is a local raw-WebSocket lifecycle falsifier. It tests authority start eligibility only, not browser presentation or production network incidence.",
};
writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
console.log("WORLD_V0_CLOSURE_PRESTART_PARTIAL_RESUME", JSON.stringify(result, null, 2));
console.log(result.verdict);

for (const client of [a, b, resumedB]) {
  try { client.ws.close(1000, "partial-resume-audit-done"); } catch {}
}
