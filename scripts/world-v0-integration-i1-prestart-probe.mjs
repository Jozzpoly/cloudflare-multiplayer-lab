const BASE = process.env.MW_WORLD_V0_I1_BASE ?? "http://127.0.0.1:8792";
const WS_BASE = BASE.replace(/^http/, "ws");
const RUN = process.env.MW_WORLD_V0_I1_WAIT_RUN ?? `i1w-${Date.now().toString(36)}`;
const TIMEOUT_MS = 12_000;

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
    await sleep(25);
  }
  throw new Error(`${label} timeout · last=${last instanceof Error ? last.message : JSON.stringify(last)}`);
}

await waitFor(async () => {
  try {
    const response = await fetch(`${BASE}/world-v0/`, { cache: "no-store" });
    return response.ok;
  } catch {
    return false;
  }
}, "local worker readiness", 20_000);

function makeClient(playerId) {
  const params = new URLSearchParams({ run: RUN, player: playerId });
  const ws = new WebSocket(`${WS_BASE}/world-v0/ws?${params}`);
  const messages = [];
  ws.addEventListener("message", (event) => {
    try { messages.push(JSON.parse(String(event.data))); } catch { /* ignore diagnostic non-json */ }
  });
  const opened = new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", () => reject(new Error(`${playerId} websocket error before open`)), { once: true });
  });
  return { playerId, ws, messages, opened };
}

async function waitMessage(client, predicate, label, timeoutMs = TIMEOUT_MS) {
  await client.opened;
  return waitFor(() => client.messages.find(predicate) || false, label, timeoutMs);
}

async function welcome(client) {
  return waitMessage(client, (message) => message?.type === "world_v0_welcome", `${client.playerId} welcome`);
}

const a = makeClient("wait-a");
const aw = await welcome(a);
const b = makeClient("wait-b");
const bw = await welcome(b);
if (aw.worldEpoch !== bw.worldEpoch) throw new Error("waiting peers did not share initial WorldEpoch");
if (aw.selfSessionId === bw.selfSessionId) throw new Error("waiting peers shared ActorSession identity");
if (aw.protocolStartTick !== null || bw.protocolStartTick !== null) throw new Error("waiting-room specimen unexpectedly started canonical run");
const oldEpoch = aw.worldEpoch;

try { b.ws.close(1000, "i1_prestart_drop_b"); } catch {}
const ended = await waitMessage(a, (message) =>
  message?.type === "world_v0_epoch_ended" && message.reason === "peer_disconnected_before_start",
"waiting epoch fail-closed on peer loss", 12_000);
if (ended.worldEpoch !== oldEpoch) throw new Error("pre-start epoch-ended message carried wrong identity");

await sleep(150);
const c = makeClient("wait-c");
const cw = await welcome(c);
if (cw.worldEpoch === oldEpoch) throw new Error("fresh waiting-room join reused retired epoch");
if (cw.resumed) throw new Error("fresh waiting-room join was marked resumed");
const d = makeClient("wait-d");
const dw = await welcome(d);
if (dw.worldEpoch !== cw.worldEpoch) throw new Error("replacement waiting peers did not share one fresh epoch");
if (cw.slot !== 0 || dw.slot !== 1) throw new Error(`replacement waiting slots not reusable: ${cw.slot}/${dw.slot}`);
if (cw.selfSessionId === aw.selfSessionId || dw.selfSessionId === bw.selfSessionId) {
  throw new Error("replacement waiting room reused retired ActorSession identity");
}

const result = {
  revision: "world-v0-integration-i1-prestart-probe-v1",
  run: RUN,
  retiredEpoch: oldEpoch,
  replacementEpoch: cw.worldEpoch,
  prestart: {
    peerLossEndedWaitingEpoch: true,
    retiredSlotsReusable: true,
    replacementPairSharesFreshEpoch: true,
  },
  verdict: "WORLD_V0_INTEGRATION_I1_PRESTART_FAIL_CLOSED_PASS",
  nonClaim: "This intentionally does not provide same-epoch reconnect before canonical run start. I1 continuity is an active-run contract; waiting-room peer loss remains fail-closed until a richer lobby/session policy is justified.",
};
console.log("WORLD_V0_INTEGRATION_I1_PRESTART_PROBE", JSON.stringify(result, null, 2));
console.log(result.verdict);

for (const client of [a, b, c, d]) {
  try { client.ws.close(1000, "i1_prestart_done"); } catch {}
}
await sleep(50);
process.exit(0);
