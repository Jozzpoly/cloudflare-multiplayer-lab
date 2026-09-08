const BASE = (process.env.MW_WORLD_V0_ALL_DROP_BASE || "http://127.0.0.1:8787").replace(/\/$/, "");
const WS_BASE = BASE.replace(/^http/, "ws");
const DELAYS_MS = (process.env.MW_WORLD_V0_ALL_DROP_DELAYS || "500,1500,5000,11000,14500,19000,21000")
  .split(",").map((value) => Number(value.trim())).filter(Number.isFinite);
const TIMEOUT_MS = 15_000;

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function assert(condition, message) { if (!condition) throw new Error(message); }

async function waitFor(fn, label, timeoutMs = TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    try {
      const value = fn();
      if (value) return value;
      last = value;
    } catch (error) { last = error; }
    await sleep(20);
  }
  throw new Error(`${label} timeout · ${last instanceof Error ? last.message : JSON.stringify(last)}`);
}

function connect(run, player, resume = null) {
  const params = new URLSearchParams({ run, player });
  if (resume) params.set("resume", resume);
  const ws = new WebSocket(`${WS_BASE}/world-v0/ws?${params}`);
  const messages = [];
  const state = { opened: false, closed: false, errored: false, boundaryTick: 0 };
  ws.addEventListener("open", () => { state.opened = true; });
  ws.addEventListener("error", () => { state.errored = true; });
  ws.addEventListener("close", () => { state.closed = true; });
  ws.addEventListener("message", async (event) => {
    try {
      const raw = typeof event.data === "string" ? event.data : await event.data.text();
      const message = JSON.parse(raw);
      messages.push(message);
      if (Number.isInteger(message?.boundaryTick)) state.boundaryTick = Math.max(state.boundaryTick, message.boundaryTick);
      if (Number.isInteger(message?.state?.boundaryTick)) state.boundaryTick = Math.max(state.boundaryTick, message.state.boundaryTick);
    } catch { /* diagnostic only */ }
  });
  return { run, player, ws, messages, state };
}

async function message(client, type, label) {
  return waitFor(() => client.messages.find((item) => item?.type === type), label);
}

function identity(welcome) {
  return {
    worldId: welcome.worldId,
    worldEpoch: welcome.worldEpoch,
    simBuildId: welcome.simBuildId,
    clientSimRevision: welcome.clientSimRevision,
  };
}

function startFeed(client, welcome, start) {
  let target = start.protocolStartTick;
  let batchSeq = 1;
  let active = true;
  const id = identity(welcome);
  const timer = setInterval(() => {
    if (!active || client.ws.readyState !== WebSocket.OPEN) return;
    const horizon = client.state.boundaryTick + 8;
    while (target + 1 <= horizon) {
      client.ws.send(JSON.stringify({
        type: "world_v0_input_batch",
        ...id,
        batchSeq: batchSeq++,
        records: [
          { targetTick: target, x: 0, z: 0, jump: false },
          { targetTick: target + 1, x: 0, z: 0, jump: false },
        ],
      }));
      target += 2;
    }
  }, 8);
  return { stop() { active = false; clearInterval(timer); } };
}

async function attemptResume(run, player, token, oldEpoch, timeoutMs = 2200) {
  const client = connect(run, player, token);
  const outcome = await waitFor(() => {
    const welcome = client.messages.find((item) => item?.type === "world_v0_welcome");
    if (welcome) return { kind: "welcome", welcome };
    if (client.state.errored || client.state.closed) return { kind: "rejected" };
    return false;
  }, `${run} resume outcome`, timeoutMs).catch(() => ({ kind: "timeout" }));
  const preserved = outcome.kind === "welcome" && outcome.welcome.resumed === true && outcome.welcome.worldEpoch === oldEpoch;
  return { client, outcome, preserved };
}

async function runCase(delayMs, index) {
  const run = `ad-${delayMs}-${Date.now().toString(36)}-${index}`.slice(0, 20);
  const a = connect(run, `a-${index}`);
  const aw = await message(a, "world_v0_welcome", `${run} A welcome`);
  const b = connect(run, `b-${index}`);
  const bw = await message(b, "world_v0_welcome", `${run} B welcome`);
  assert(aw.worldEpoch === bw.worldEpoch, `${run} initial epoch mismatch`);
  assert(typeof aw.resumeToken === "string" && typeof bw.resumeToken === "string", `${run} missing resume token`);
  a.ws.send(JSON.stringify({ type: "world_v0_ready", ...identity(aw) }));
  b.ws.send(JSON.stringify({ type: "world_v0_ready", ...identity(bw) }));
  const startA = await message(a, "world_v0_start", `${run} A start`);
  const startB = await message(b, "world_v0_start", `${run} B start`);
  const feedA = startFeed(a, aw, startA);
  const feedB = startFeed(b, bw, startB);
  await waitFor(() => a.messages.find((m) => m?.type === "world_v0_consumed" && m.boundaryTick > startA.protocolStartTick + 12 && m.players?.every((p) => p.source === "fresh")), `${run} fresh steady state`, 20_000);

  const oldEpoch = aw.worldEpoch;
  const closeBoundary = a.state.boundaryTick;
  feedA.stop();
  feedB.stop();
  const closedAt = performance.now();
  try { a.ws.close(1000, "closure_all_drop"); } catch {}
  try { b.ws.close(1000, "closure_all_drop"); } catch {}
  await sleep(delayMs);

  const resumeA = await attemptResume(run, `a-${index}`, aw.resumeToken, oldEpoch);
  let classification;
  let resumedEpoch = null;
  if (resumeA.preserved) {
    classification = "preserved";
    resumedEpoch = resumeA.outcome.welcome.worldEpoch;
  } else {
    classification = "retired";
    try { resumeA.client.ws.close(1000, "resume-rejected-cleanup"); } catch {}
    const fresh = connect(run, `c-${index}`);
    const cw = await message(fresh, "world_v0_welcome", `${run} replacement welcome`);
    resumedEpoch = cw.worldEpoch;
    assert(cw.worldEpoch !== oldEpoch, `${run} resume rejected but fresh actor reused old epoch`);
    try { fresh.ws.close(1000, "probe-done"); } catch {}
  }

  const elapsedMs = Math.round((performance.now() - closedAt) * 10) / 10;
  try { resumeA.client.ws.close(1000, "probe-done"); } catch {}
  return { delayMs, elapsedMs, run, oldEpoch, resultingEpoch: resumedEpoch, closeBoundary, classification };
}

await waitFor(async () => {
  try { return (await fetch(`${BASE}/api/ping`, { signal: AbortSignal.timeout(1500) })).ok; }
  catch { return false; }
}, "worker readiness", 20_000);

const cases = [];
for (let i = 0; i < DELAYS_MS.length; i += 1) {
  const result = await runCase(DELAYS_MS[i], i);
  cases.push(result);
  console.log("WORLD_V0_ALL_DROP_CASE", JSON.stringify(result));
  await sleep(100);
}

const preserved = cases.filter((item) => item.classification === "preserved").map((item) => item.delayMs);
const retired = cases.filter((item) => item.classification === "retired").map((item) => item.delayMs);
assert(preserved.length > 0, "probe did not observe any recoverable all-transport-loss window");
assert(retired.length > 0, "probe did not observe bounded all-disconnected retirement");
const summary = {
  revision: "world-v0-closure-all-drop-window-v2-retry-aligned-grace",
  cases,
  preservedDelaysMs: preserved,
  retiredDelaysMs: retired,
  verdict: "WORLD_V0_CLOSURE_ALL_DROP_WINDOW_MAPPED",
  nonClaim: "This maps explicit simultaneous WebSocket close/rebind timing under local Workerd. It does not model packet loss while sockets remain open, mobile OS process loss, radio handover behavior, or persistence across Durable Object process loss.",
};
console.log("WORLD_V0_CLOSURE_ALL_DROP_WINDOW", JSON.stringify(summary, null, 2));
console.log(summary.verdict);
