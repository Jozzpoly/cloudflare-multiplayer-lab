const BASE = process.env.MW_WORLD_V0_CONTINUITY_BASE ?? "http://127.0.0.1:8791";
const WS_BASE = BASE.replace(/^http/, "ws");
const TIMEOUT_MS = 12_000;

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function dist3(a, b) { return Math.hypot(a[0]-b[0], a[1]-b[1], a[2]-b[2]); }

async function waitFor(fn, label, timeoutMs = TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    try {
      last = await fn();
      if (last) return last;
    } catch (error) {
      last = error;
    }
    await sleep(50);
  }
  throw new Error(`${label} timeout · last=${last instanceof Error ? last.message : JSON.stringify(last)}`);
}

async function status() {
  const response = await fetch(`${BASE}/status`, { cache: "no-store" });
  if (!response.ok) throw new Error(`status ${response.status}`);
  return response.json();
}

function makeClient(player, token = null) {
  const params = new URLSearchParams({ player });
  if (token) params.set("token", token);
  const ws = new WebSocket(`${WS_BASE}/ws?${params}`);
  const messages = [];
  ws.addEventListener("message", (event) => {
    try { messages.push(JSON.parse(String(event.data))); } catch { /* ignore */ }
  });
  const opened = new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", () => reject(new Error(`${player} websocket error before open`)), { once: true });
  });
  return { player, ws, messages, opened };
}

async function welcome(client) {
  await client.opened;
  return waitFor(
    () => client.messages.find((message) => message?.type === "continuity_welcome") || false,
    `${client.player} welcome`,
  );
}

function sendInput(client, x) {
  if (client.ws.readyState !== WebSocket.OPEN) return false;
  client.ws.send(JSON.stringify({ type: "input", x }));
  return true;
}

async function sustainInput(client, x, durationMs) {
  const started = Date.now();
  while (Date.now() - started < durationMs) {
    sendInput(client, x);
    await sleep(45);
  }
}

await waitFor(async () => {
  try {
    const s = await status();
    return s?.revision === "world-v0-continuity-audit-do-v1" ? s : false;
  } catch {
    return false;
  }
}, "local continuity worker readiness", 20_000);

const a = makeClient("owner-a");
const aw = await welcome(a);
const b = makeClient("owner-b");
const bw = await welcome(b);

if (!aw.token || !bw.token) throw new Error("welcome missing stable session token");
if (aw.resumed || bw.resumed) throw new Error("fresh joins unexpectedly marked resumed");
if (aw.worldEpoch !== bw.worldEpoch) throw new Error("fresh peers did not share one WorldEpoch");
if (aw.actorId === bw.actorId) throw new Error("fresh peers received same actorId");
const epoch = aw.worldEpoch;
const bActorId = bw.actorId;

// Establish active physical motion for both actors before transport loss.
await Promise.all([
  sustainInput(a, 1, 650),
  sustainInput(b, -1, 650),
]);
const beforeDrop = await status();
const aBeforeDrop = beforeDrop.actors.find((actor) => actor.actorId === aw.actorId);
const bBeforeDrop = beforeDrop.actors.find((actor) => actor.actorId === bw.actorId);
if (!aBeforeDrop || !bBeforeDrop) throw new Error("actors missing before drop");
const dropTick = beforeDrop.boundaryTick;

// Lose only B's transport. A continues producing intent while B crosses the same
// 36-tick / 600 ms lease currently used by production World V0.
b.ws.close(1000, "audit_drop_b");
const aPump = (async () => {
  while (true) {
    const s = await status();
    if (s.boundaryTick >= dropTick + 52) return;
    sendInput(a, 1);
    await sleep(45);
  }
})();

const staleState = await waitFor(async () => {
  const s = await status();
  const actorB = s.actors.find((actor) => actor.actorId === bActorId);
  if (!actorB) return false;
  if (s.boundaryTick < dropTick + 40) return false;
  if (!actorB.stale || actorB.connected) return false;
  return s;
}, "B stale-neutral while world stays alive");
await aPump;

if (staleState.worldEpoch !== epoch) throw new Error("WorldEpoch rotated after one transport loss");
if (!staleState.finite) throw new Error("world became non-finite during transport loss");
if (staleState.actors.length !== 2) throw new Error("actor was destroyed after socket loss");
const aDuringDrop = staleState.actors.find((actor) => actor.actorId === aw.actorId);
const bDuringDrop = staleState.actors.find((actor) => actor.actorId === bActorId);
if (!aDuringDrop?.connected) throw new Error("healthy peer did not stay connected");
if (!bDuringDrop?.stale) throw new Error("lost peer never entered stale-neutral state");
if (dist3(aBeforeDrop.position, aDuringDrop.position) < 0.4) {
  throw new Error("healthy actor did not continue physical motion during peer loss");
}
const bPositionBeforeResume = [...bDuringDrop.position];
const propPositionBeforeResume = staleState.prop ? [...staleState.prop.position] : null;

// Rebind a fresh socket to the stable B session token.
const b2 = makeClient("owner-b", bw.token);
const b2w = await welcome(b2);
if (!b2w.resumed) throw new Error("resume token was accepted as a fresh actor");
if (b2w.actorId !== bActorId) throw new Error(`resume rebound wrong actor ${b2w.actorId}`);
if (b2w.worldEpoch !== epoch) throw new Error("resume rotated WorldEpoch");
if (b2w.token !== bw.token) throw new Error("resume changed stable session token");

const immediatelyResumed = await status();
const bImmediatelyResumed = immediatelyResumed.actors.find((actor) => actor.actorId === bActorId);
if (!bImmediatelyResumed?.connected) throw new Error("resumed actor not connected");
if (dist3(bPositionBeforeResume, bImmediatelyResumed.position) > 0.25) {
  throw new Error("resume recreated or teleported actor instead of retaining body state");
}
if (propPositionBeforeResume && immediatelyResumed.prop && dist3(propPositionBeforeResume, immediatelyResumed.prop.position) > 0.25) {
  throw new Error("shared world state jumped during actor resume");
}

const resumeTick = immediatelyResumed.boundaryTick;
await Promise.all([
  sustainInput(a, 1, 550),
  sustainInput(b2, -1, 550),
]);
const afterResume = await waitFor(async () => {
  const s = await status();
  return s.boundaryTick >= resumeTick + 24 ? s : false;
}, "post-resume continuation");
const bAfterResume = afterResume.actors.find((actor) => actor.actorId === bActorId);
const aAfterResume = afterResume.actors.find((actor) => actor.actorId === aw.actorId);
if (afterResume.worldEpoch !== epoch) throw new Error("WorldEpoch rotated after resumed input");
if (!bAfterResume?.connected || bAfterResume.stale) throw new Error("resumed actor failed to return to active state");
if (!aAfterResume?.connected) throw new Error("healthy peer was disrupted by B resume");
if (dist3(bImmediatelyResumed.position, bAfterResume.position) < 0.25) {
  throw new Error("same actor did not continue physical motion after resume");
}
if (!afterResume.finite) throw new Error("post-resume world non-finite");

const result = {
  revision: "world-v0-continuity-do-probe-v1",
  transport: "real WebSocketPair through local Wrangler Durable Object",
  box3d: "project-pinned box3d.js@0.1.1 Worker runtime",
  contract: {
    simulationHz: afterResume.simulationHz,
    leaseTicks: afterResume.inputLeaseTicks,
    leaseMs: afterResume.inputLeaseMs,
  },
  identity: {
    worldEpoch: epoch,
    worldEpochRotationsObserved: 0,
    actorIdBeforeDrop: bActorId,
    actorIdAfterResume: b2w.actorId,
    stableTokenPreserved: b2w.token === bw.token,
    resumeCount: bAfterResume.resumeCount,
  },
  boundaries: {
    dropTick,
    staleObservedTick: staleState.boundaryTick,
    resumeTick,
    finalTick: afterResume.boundaryTick,
  },
  continuity: {
    healthyPeerStayedConnected: true,
    staleActorBodyRetained: true,
    sharedWorldRetained: true,
    resumedSameActor: true,
    finite: afterResume.finite,
  },
  verdict: "WORLD_V0_CONTINUITY_DO_SAME_EPOCH_RESUME_PASS",
  nonClaim: "This proves a real local Durable Object/WebSocket/Box3D lifecycle boundary. It does not yet qualify production protocol security, browser UX, remote Cloudflare placement, DO restart/hibernation reconstruction, or cross-SimBuild restore.",
};

console.log("WORLD_V0_CONTINUITY_DO_PROBE", JSON.stringify(result, null, 2));
console.log(result.verdict);

try { a.ws.close(1000, "audit_done"); } catch {}
try { b2.ws.close(1000, "audit_done"); } catch {}
