const BASE = (process.env.MW_WORLD_V0_PRESTART_VACANT_BASE || "http://127.0.0.1:8787").replace(/\/$/, "");
const WS_BASE = BASE.replace(/^http/, "ws");
const RUN = process.env.MW_WORLD_V0_PRESTART_VACANT_ROOM || "yard-2";
const TIMEOUT_MS = 15_000;

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function assert(value, message) { if (!value) throw new Error(message); }

async function waitFor(fn, label, timeoutMs = TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    try {
      last = await fn();
      if (last) return last;
    } catch (error) { last = error; }
    await sleep(40);
  }
  throw new Error(`${label} timeout · last=${last instanceof Error ? last.message : JSON.stringify(last)}`);
}

async function room() {
  const response = await fetch(`${BASE}/api/world-v0/rooms?r=${Date.now()}`, { cache: "no-store" });
  assert(response.ok, `directory HTTP ${response.status}`);
  const payload = await response.json();
  assert(payload.revision === "world-v0-public-room-directory-r4-vacant-capacity", `directory revision ${payload.revision}`);
  const value = payload.rooms?.find((candidate) => candidate.id === RUN);
  assert(value, `room ${RUN} missing`);
  return value;
}

function makeClient(playerId, resumeToken = null) {
  const params = new URLSearchParams({ run: RUN, player: playerId });
  if (resumeToken) params.set("resume", resumeToken);
  const ws = new WebSocket(`${WS_BASE}/world-v0/ws?${params}`);
  const messages = [];
  const state = { opened: false, closed: false, error: false };
  ws.addEventListener("open", () => { state.opened = true; });
  ws.addEventListener("error", () => { state.error = true; });
  ws.addEventListener("close", () => { state.closed = true; });
  ws.addEventListener("message", (event) => {
    try { messages.push(JSON.parse(String(event.data))); } catch {}
  });
  return { playerId, ws, messages, state };
}

async function welcome(client) {
  return waitFor(() => client.messages.find((message) => message?.type === "world_v0_welcome") || false, `${client.playerId} welcome`);
}

async function rejected(client, label) {
  await waitFor(() => client.state.error || (client.state.closed && !client.state.opened), label, 8_000);
  assert(!client.state.opened, `${label}: websocket unexpectedly opened`);
}

await waitFor(async () => {
  try { return (await fetch(`${BASE}/api/ping`, { cache: "no-store" })).ok; } catch { return false; }
}, "worker readiness", 20_000);

let a = null;
let b = null;
let c = null;
let stale = null;
try {
  a = makeClient("prestart-vacant-a");
  const aw = await welcome(a);
  b = makeClient("prestart-vacant-b");
  const bw = await welcome(b);
  assert(aw.worldEpoch === bw.worldEpoch, "prestart pair WorldEpoch mismatch");
  assert(aw.protocolStartTick == null && bw.protocolStartTick == null, "prestart pair unexpectedly committed start");
  const oldEpoch = aw.worldEpoch;

  a.ws.close(1000, "prestart_vacant_drop_a");
  b.ws.close(1000, "prestart_vacant_drop_b");

  const vacant = await waitFor(async () => {
    const value = await room();
    return value.worldEpoch === oldEpoch && value.connected === 0 && value.reserved === 2 ? value : false;
  }, "fully vacant prestart classification");

  assert(vacant.replacementCapable === true, `0-online prestart room still owns capacity ${JSON.stringify(vacant)}`);
  assert(vacant.joinable === true, `0-online prestart room not joinable ${JSON.stringify(vacant)}`);

  c = makeClient("prestart-vacant-fresh-c");
  const cw = await welcome(c);
  assert(cw.resumed === false, "fresh C unexpectedly resumed old ActorSession");
  assert(cw.worldEpoch !== oldEpoch, "fresh C failed to rotate fully vacant prestart epoch");

  stale = makeClient("prestart-vacant-a", aw.resumeToken);
  await rejected(stale, "retired prestart token rejection");

  console.log("WORLD_V0_PRESTART_VACANT_CAPACITY_PASS", JSON.stringify({
    run: RUN,
    oldEpoch,
    replacementEpoch: cw.worldEpoch,
    vacantState: vacant.state,
    replacementCapable: vacant.replacementCapable,
    joinable: vacant.joinable,
    staleTokenRejected: true,
  }));
} finally {
  for (const client of [a, b, c, stale]) {
    try { client?.ws?.close(1000, "prestart_vacant_done"); } catch {}
  }
  await sleep(80);
}
