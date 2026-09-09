const BASE = (process.env.MW_WORLD_V0_VACANT_BASE || "http://127.0.0.1:8787").replace(/\/$/, "");
const WS_BASE = BASE.replace(/^http/, "ws");
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
    await sleep(35);
  }
  throw new Error(`${label} timeout · last=${last instanceof Error ? last.message : JSON.stringify(last)}`);
}

await waitFor(async () => {
  try { return (await fetch(`${BASE}/api/ping`, { cache: "no-store" })).ok; }
  catch { return false; }
}, "local worker readiness", 20_000);

async function room(run) {
  const response = await fetch(`${BASE}/api/world-v0/rooms?r=${Date.now()}`, { cache: "no-store" });
  assert(response.ok, `room directory HTTP ${response.status}`);
  const payload = await response.json();
  assert(payload.revision === "world-v0-public-room-directory-r4-vacant-capacity", `directory revision ${payload.revision}`);
  const found = payload.rooms?.find((candidate) => candidate.id === run);
  assert(found, `room ${run} missing`);
  return found;
}

function makeClient(run, playerId, resumeToken = null) {
  const params = new URLSearchParams({ run, player: playerId });
  if (resumeToken) params.set("resume", resumeToken);
  const ws = new WebSocket(`${WS_BASE}/world-v0/ws?${params}`);
  const messages = [];
  const state = { opened: false, closed: false, error: false, closeCode: null, closeReason: null };
  ws.addEventListener("open", () => { state.opened = true; });
  ws.addEventListener("error", () => { state.error = true; });
  ws.addEventListener("close", (event) => {
    state.closed = true;
    state.closeCode = event.code;
    state.closeReason = event.reason;
  });
  ws.addEventListener("message", (event) => {
    try { messages.push(JSON.parse(String(event.data))); } catch {}
  });
  return { run, playerId, ws, messages, state };
}

async function welcome(client) {
  return waitFor(() => client.messages.find((message) => message?.type === "world_v0_welcome") || false, `${client.playerId} welcome`);
}

function identity(message) {
  return {
    worldId: message.worldId,
    worldEpoch: message.worldEpoch,
    simBuildId: message.simBuildId,
    clientSimRevision: message.clientSimRevision,
  };
}

function ready(client, welcomeMessage) {
  client.ws.send(JSON.stringify({ type: "world_v0_ready", ...identity(welcomeMessage) }));
}

async function startPair(run, prefix) {
  const a = makeClient(run, `${prefix}-a`);
  const aw = await welcome(a);
  const b = makeClient(run, `${prefix}-b`);
  const bw = await welcome(b);
  assert(aw.worldEpoch === bw.worldEpoch, `${run} pair epoch mismatch`);
  ready(a, aw);
  ready(b, bw);
  const startA = await waitFor(() => a.messages.find((message) => message?.type === "world_v0_start") || false, `${run} A start`);
  await waitFor(() => b.messages.find((message) => message?.type === "world_v0_start") || false, `${run} B start`);
  await waitFor(() => a.messages.find((message) => message?.type === "world_v0_snapshot" && message.boundaryTick > startA.protocolStartTick) || false, `${run} canonical progression`, 20_000);
  return { a, aw, b, bw, epoch: aw.worldEpoch };
}

async function closeAndWait(client, reason) {
  if (client.ws.readyState === WebSocket.OPEN) client.ws.close(1000, reason);
  await waitFor(() => client.state.closed, `${client.playerId} close`);
}

async function rejectResume(run, playerId, token, label) {
  const client = makeClient(run, playerId, token);
  await waitFor(() => client.state.error || (client.state.closed && !client.state.opened), label, 8_000);
  assert(!client.state.opened, `${label}: stale token opened websocket`);
  return { error: client.state.error, closeCode: client.state.closeCode, closeReason: client.state.closeReason };
}

const clients = [];
const evidence = {
  verdict: "WORLD_V0_VACANT_CAPACITY_AUTHORITY_FAIL",
  generatedAt: new Date().toISOString(),
};

try {
  // Case 1: both transports disappear, but the private owner returns first.
  const resumeFirst = await startPair("yard-1", "vacant-resume");
  clients.push(resumeFirst.a, resumeFirst.b);
  await closeAndWait(resumeFirst.a, "vacant_resume_drop_a");
  await closeAndWait(resumeFirst.b, "vacant_resume_drop_b");

  const vacantResumeRoom = await waitFor(async () => {
    const value = await room("yard-1");
    return value.worldEpoch === resumeFirst.epoch && value.connected === 0 && value.reserved === 2 ? value : false;
  }, "resume-first vacant classification");
  assert(vacantResumeRoom.protectedReserved === 2, `resume-first expected protected private authority ${JSON.stringify(vacantResumeRoom)}`);
  assert(vacantResumeRoom.replacementCapable === true && vacantResumeRoom.joinable === true, `resume-first vacant room blocked capacity ${JSON.stringify(vacantResumeRoom)}`);
  assert(vacantResumeRoom.state === "live-vacant-resumable", `resume-first state ${vacantResumeRoom.state}`);

  const aResume = makeClient("yard-1", resumeFirst.aw.selfSessionId ? "vacant-resume-a" : "vacant-resume-a", resumeFirst.aw.resumeToken);
  clients.push(aResume);
  const aResumeWelcome = await welcome(aResume);
  assert(aResumeWelcome.resumed === true, "private resume was not accepted");
  assert(aResumeWelcome.worldEpoch === resumeFirst.epoch, "private resume rotated vacant epoch");
  assert(aResumeWelcome.selfSessionId === resumeFirst.aw.selfSessionId, "private resume changed ActorSession");

  const afterResume = await waitFor(async () => {
    const value = await room("yard-1");
    return value.worldEpoch === resumeFirst.epoch && value.connected === 1 ? value : false;
  }, "resume-first restored presence");
  assert(afterResume.protectedReserved === 1 && afterResume.replacementCapable === false && afterResume.joinable === false, `resume-first failed to restore one-connected protection ${JSON.stringify(afterResume)}`);

  const protectedIntruder = makeClient("yard-1", "vacant-resume-intruder");
  clients.push(protectedIntruder);
  await waitFor(() => protectedIntruder.state.error || (protectedIntruder.state.closed && !protectedIntruder.state.opened), "resume-first protected intruder rejection", 8_000);
  assert(!protectedIntruder.state.opened, "fresh intruder displaced protected peer after owner resumed");

  // Case 2: both transports disappear and an unrelated fresh player asks first.
  const freshFirst = await startPair("yard-2", "vacant-fresh");
  clients.push(freshFirst.a, freshFirst.b);
  await closeAndWait(freshFirst.a, "vacant_fresh_drop_a");
  await closeAndWait(freshFirst.b, "vacant_fresh_drop_b");

  const vacantFreshRoom = await waitFor(async () => {
    const value = await room("yard-2");
    return value.worldEpoch === freshFirst.epoch && value.connected === 0 && value.reserved === 2 ? value : false;
  }, "fresh-first vacant classification");
  assert(vacantFreshRoom.protectedReserved === 2, `fresh-first expected protected private authority ${JSON.stringify(vacantFreshRoom)}`);
  assert(vacantFreshRoom.replacementCapable === true && vacantFreshRoom.joinable === true, `fresh-first vacant room blocked capacity ${JSON.stringify(vacantFreshRoom)}`);

  const freshC = makeClient("yard-2", "vacant-fresh-c");
  clients.push(freshC);
  const freshWelcome = await welcome(freshC);
  assert(freshWelcome.resumed === false, "fresh replacement incorrectly resumed old actor");
  assert(freshWelcome.worldEpoch !== freshFirst.epoch, "fresh-first request failed to rotate vacant epoch");
  assert(freshWelcome.slot === 0, `fresh replacement expected new slot0, got ${freshWelcome.slot}`);

  const replacementWaiting = await waitFor(async () => {
    const value = await room("yard-2");
    return value.worldEpoch === freshWelcome.worldEpoch && value.connected === 1 && value.occupancy === 1 ? value : false;
  }, "fresh-first replacement waiting room");
  assert(replacementWaiting.joinable === true && replacementWaiting.state === "waiting", `fresh replacement not ordinary waiting room ${JSON.stringify(replacementWaiting)}`);

  const staleA = await rejectResume("yard-2", "vacant-fresh-a", freshFirst.aw.resumeToken, "retired A token rejection");
  const staleB = await rejectResume("yard-2", "vacant-fresh-b", freshFirst.bw.resumeToken, "retired B token rejection");

  Object.assign(evidence, {
    verdict: "WORLD_V0_VACANT_CAPACITY_AUTHORITY_PASS",
    resumeFirst: {
      epoch: resumeFirst.epoch,
      vacantState: vacantResumeRoom.state,
      vacantProtected: vacantResumeRoom.protectedReserved,
      vacantJoinable: vacantResumeRoom.joinable,
      sameEpochResumed: aResumeWelcome.worldEpoch === resumeFirst.epoch,
      sameActorSessionResumed: aResumeWelcome.selfSessionId === resumeFirst.aw.selfSessionId,
      afterResumeProtected: afterResume.protectedReserved,
      unrelatedFreshBlockedAfterResume: true,
    },
    freshFirst: {
      oldEpoch: freshFirst.epoch,
      vacantState: vacantFreshRoom.state,
      vacantProtected: vacantFreshRoom.protectedReserved,
      vacantJoinable: vacantFreshRoom.joinable,
      newEpoch: freshWelcome.worldEpoch,
      rotated: freshWelcome.worldEpoch !== freshFirst.epoch,
      replacementSlot: freshWelcome.slot,
      oldTokensRejected: true,
      staleA,
      staleB,
    },
    nonClaim: "Local Workerd admission/lifecycle proof only; remote placement and Owner feel remain separate qualification gates.",
  });
  console.log("WORLD_V0_VACANT_CAPACITY_AUTHORITY", JSON.stringify(evidence));
  console.log(evidence.verdict);
} finally {
  for (const client of clients) {
    try { client?.ws?.close(1000, "vacant_capacity_probe_done"); } catch {}
  }
  await sleep(80);
}
