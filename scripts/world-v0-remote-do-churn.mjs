const BASE = (process.env.MW_WORLD_V0_CHURN_BASE || "https://cloudflare-multiplayer-lab-qualified-play.jozzpoly.workers.dev").replace(/\/$/, "");
const WS_BASE = BASE.replace(/^http/, "ws");
const RUN = String(process.env.MW_WORLD_V0_CHURN_RUN || `churn-${Date.now().toString(36)}`).slice(0, 20);
const CYCLES = Math.max(1, Number(process.env.MW_WORLD_V0_CHURN_CYCLES || 12));
const TIMEOUT_MS = 12_000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function assert(value, message) { if (!value) throw new Error(message); }

function identityOf(message) {
  return {
    worldId: message.worldId,
    worldEpoch: message.worldEpoch,
    simBuildId: message.simBuildId,
    clientSimRevision: message.clientSimRevision,
  };
}

async function connectFresh(player, timeout = TIMEOUT_MS) {
  const started = Date.now();
  const ws = new WebSocket(`${WS_BASE}/world-v0/ws?${new URLSearchParams({ run: RUN, player })}`);
  const messages = [];
  let opened = false;
  let closed = null;
  ws.addEventListener("open", () => { opened = true; });
  ws.addEventListener("message", async (event) => {
    const raw = typeof event.data === "string" ? event.data : await event.data.text();
    try { messages.push(JSON.parse(raw)); } catch {}
  });
  ws.addEventListener("close", (event) => { closed = { code: event.code, reason: event.reason || null, clean: event.wasClean }; });
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const welcome = messages.find((message) => message?.type === "world_v0_welcome");
    if (welcome) return { ws, messages, welcome, opened, durationMs: Date.now() - started };
    if (closed) throw new Error(`fresh ${player} closed before welcome ${JSON.stringify(closed)}`);
    await sleep(30);
  }
  try { ws.close(); } catch {}
  throw new Error(`fresh ${player} welcome timeout opened=${opened} messages=${JSON.stringify(messages.slice(-3))}`);
}

async function waitMessage(client, predicate, label, timeout = TIMEOUT_MS) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const found = client.messages.find(predicate);
    if (found) return found;
    await sleep(25);
  }
  throw new Error(`${label} timeout tail=${JSON.stringify(client.messages.slice(-4))}`);
}

function sendReady(client) {
  client.ws.send(JSON.stringify({ type: "world_v0_ready", ...identityOf(client.welcome) }));
}

async function closeAndSettle(...clients) {
  for (const client of clients) {
    try { client?.ws?.close(1000, "churn_cycle_close"); } catch {}
  }
  await sleep(300);
}

const epochs = [];
for (let cycle = 1; cycle <= CYCLES; cycle += 1) {
  const a = await connectFresh(`CA${cycle}`);
  const b = await connectFresh(`CB${cycle}`);
  assert(a.welcome.worldEpoch === b.welcome.worldEpoch, `cycle ${cycle} pair epoch mismatch`);
  sendReady(a); sendReady(b);
  const startA = await waitMessage(a, (message) => message?.type === "world_v0_start", `cycle ${cycle} A start`);
  await waitMessage(b, (message) => message?.type === "world_v0_start", `cycle ${cycle} B start`);
  const activeEpoch = startA.worldEpoch;
  epochs.push({ cycle, activeEpoch, pairAWelcomeMs: a.durationMs, pairBWelcomeMs: b.durationMs });

  await closeAndSettle(a, b);

  // Zero connected humans must not own capacity. Fresh P retires the just-used
  // active epoch and receives a new waiting epoch on the same Durable Object.
  let preempt = null;
  let lastError = null;
  for (let attempt = 1; attempt <= 12 && !preempt; attempt += 1) {
    try {
      preempt = await connectFresh(`CP${cycle}x${attempt}`, 3000);
    } catch (error) {
      lastError = error;
      await sleep(120);
    }
  }
  if (!preempt) throw new Error(`cycle ${cycle} could not preempt vacant epoch: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
  assert(preempt.welcome.worldEpoch !== activeEpoch, `cycle ${cycle} fresh preempt reused active epoch`);
  epochs[epochs.length - 1].replacementEpoch = preempt.welcome.worldEpoch;
  epochs[epochs.length - 1].replacementWelcomeMs = preempt.durationMs;

  // A lone pre-start actor disconnect has no ambiguous start commitment and should
  // end that replacement epoch, leaving the same DO ready for the next churn cycle.
  await closeAndSettle(preempt);
}

console.log("WORLD_V0_REMOTE_DO_CHURN_PASS", JSON.stringify({ run: RUN, cycles: CYCLES, uniqueEpochs: new Set(epochs.flatMap((entry) => [entry.activeEpoch, entry.replacementEpoch])).size, epochs }));
