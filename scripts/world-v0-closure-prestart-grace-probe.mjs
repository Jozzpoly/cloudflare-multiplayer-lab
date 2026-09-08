import { writeFileSync } from "node:fs";

const BASE = (process.env.MW_WORLD_V0_PRESTART_GRACE_BASE || "http://127.0.0.1:8787").replace(/\/$/, "");
const OUTPUT = process.env.MW_WORLD_V0_PRESTART_GRACE_OUTPUT || "world-v0-prestart-grace.json";
const TIMEOUT_MS = 28_000;

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
  throw new Error(`${label} timeout · ${JSON.stringify(client.messages.slice(-6))}`);
}

const suffix = Date.now().toString(36).slice(-7);
const run = `pg-${suffix}`;
const a = connect(run, `GraceA-${suffix}`);
const aw = await waitMessage(a, (m) => m?.type === "world_v0_welcome", "A welcome");
const b = connect(run, `GraceB-${suffix}`);
const bw = await waitMessage(b, (m) => m?.type === "world_v0_welcome", "B welcome");
assert(aw.worldEpoch === bw.worldEpoch, "initial epoch mismatch");
assert(bw.protocolStartTick === null, "pre-start probe unexpectedly scheduled");

b.ws.close(1000, "prestart-grace-first-drop");
await sleep(500);
const resumed = connect(run, `GraceB-${suffix}`, bw.resumeToken);
const rw = await waitMessage(resumed, (m) => m?.type === "world_v0_welcome", "B resume inside grace", 8000);
assert(rw.resumed === true, "B resume inside grace rejected");
assert(rw.worldEpoch === bw.worldEpoch, "B resume rotated epoch");
assert(rw.selfSessionId === bw.selfSessionId, "B resume changed ActorSession");
assert(rw.protocolStartTick === null, "B resume unexpectedly entered active run");

await sleep(250);
const expiryStartedAt = Date.now();
resumed.ws.close(1000, "prestart-grace-expiry-drop");
const ended = await waitMessage(a, (m) => m?.type === "world_v0_epoch_ended", "prestart ambiguity expiry", TIMEOUT_MS);
const expiryMs = Date.now() - expiryStartedAt;
assert(ended.reason === "peer_disconnected_before_start_grace_expired", `unexpected expiry reason ${ended.reason}`);
assert(expiryMs >= 18_000 && expiryMs <= 26_000, `prestart grace outside bounded window: ${expiryMs}ms`);

const fresh = connect(run, `Fresh-${suffix}`);
const fw = await waitMessage(fresh, (m) => m?.type === "world_v0_welcome", "fresh epoch after expiry", 8000);
assert(fw.resumed === false, "fresh actor unexpectedly resumed");
assert(fw.worldEpoch !== aw.worldEpoch, "expired prestart epoch was reused");

const result = {
  revision: "world-v0-closure-prestart-grace-v1",
  run,
  initialEpoch: aw.worldEpoch,
  initialActorSession: bw.selfSessionId,
  resumedInsideGrace: {
    sameEpoch: rw.worldEpoch === bw.worldEpoch,
    sameActorSession: rw.selfSessionId === bw.selfSessionId,
    protocolStartTick: rw.protocolStartTick,
  },
  expiry: { reason: ended.reason, elapsedMs: expiryMs },
  freshAfterExpiry: { worldEpoch: fw.worldEpoch, rotated: fw.worldEpoch !== aw.worldEpoch },
  verdict: "WORLD_V0_CLOSURE_PRESTART_AMBIGUITY_GRACE_PASS",
};
writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
console.log("WORLD_V0_CLOSURE_PRESTART_GRACE", JSON.stringify(result, null, 2));
console.log(result.verdict);

for (const client of [a, b, resumed, fresh]) {
  try { client.ws.close(1000, "prestart-grace-probe-done"); } catch {}
}
