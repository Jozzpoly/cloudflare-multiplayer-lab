import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import {
  WORLD_V0_NET_ENTITY_ORDER,
  WORLD_V0_STATE_COMPONENTS,
  WORLD_V0_TIMING,
} from "../src/world-v0-contract.ts";

const modulePath = resolve("public/world-v0/box3d-i4/box3d.inline.mjs");
const { default: Box3D } = await import(`${pathToFileURL(modulePath).href}?i4b=${Date.now()}`);
const b3 = await Box3D();
for (const name of ["b3Recording_CopyData", "b3RecPlayer_CreateFromBytes", "b3Bytes_Fnv1a32"]) {
  if (typeof b3[name] !== "function") throw new Error(`I4b custom Box3D binding missing ${name}`);
}

const BASE = process.env.MW_WORLD_V0_I4B_BASE ?? "http://127.0.0.1:8796";
const WS_BASE = BASE.replace(/^http/, "ws");
const RUN = process.env.MW_WORLD_V0_I4B_RUN ?? `i4b-auth-${Date.now().toString(36)}`;
const TIMEOUT_MS = 20_000;
const SEED_REVISION = "world-v0-authority-rebase-seed-v1";

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
    await sleep(25);
  }
  throw new Error(`${label} timeout · last=${last instanceof Error ? last.message : JSON.stringify(last)}`);
}

await waitFor(async () => {
  try { return (await fetch(`${BASE}/world-v0/`, { cache: "no-store" })).ok; }
  catch { return false; }
}, "local worker readiness", 20_000);

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
      if (Number.isFinite(message?.boundaryTick)) state.boundaryTick = Math.max(state.boundaryTick, message.boundaryTick);
      if (Number.isFinite(message?.state?.boundaryTick)) state.boundaryTick = Math.max(state.boundaryTick, message.state.boundaryTick);
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
function startInputFeed(client, welcomeMessage, options = {}) {
  const identity = identityFrom(welcomeMessage);
  const protocolStartTick = Number(welcomeMessage.protocolStartTick ?? options.protocolStartTick ?? 0);
  let nextTarget = Math.max(protocolStartTick, Number(options.nextTarget ?? protocolStartTick));
  let batchSeq = Math.max(1, Number(options.nextBatchSeq ?? 1));
  const x = Number(options.x ?? 0);
  const z = Number(options.z ?? 0);
  let active = true;
  const timer = setInterval(() => {
    if (!active || client.ws.readyState !== WebSocket.OPEN) return;
    const maxAuthored = client.state.boundaryTick + WORLD_V0_TIMING.predictionLeadTicks;
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
  return { stop() { active = false; clearInterval(timer); }, get batchSeq() { return batchSeq; } };
}

function decodeBase64(text) {
  return Uint8Array.from(Buffer.from(text, "base64"));
}
function u32Hex(value) { return (Number(value) >>> 0).toString(16).padStart(8, "0"); }
function vec3(body, getter) { const out = [0, 0, 0]; getter(out, body); return out; }
function quat(body) { const out = [0, 0, 0, 1]; b3.b3Body_GetRotation(out, body); return out; }
function flat(body) {
  return [
    ...vec3(body, b3.b3Body_GetPosition),
    ...quat(body),
    ...vec3(body, b3.b3Body_GetLinearVelocity),
    ...vec3(body, b3.b3Body_GetAngularVelocity),
  ];
}
const f32 = new DataView(new ArrayBuffer(4));
function f32hex(value) { f32.setFloat32(0, value, true); return f32.getUint32(0, true).toString(16).padStart(8, "0"); }
function packPlayer(player) {
  const byNetId = new Map();
  const count = b3.b3RecPlayer_GetBodyCount(player);
  for (let ordinal = 0; ordinal < count; ordinal += 1) {
    const body = b3.b3RecPlayer_GetBodyId(player, ordinal);
    if (!b3.b3Body_IsValid(body)) continue;
    const locator = b3.b3Body_GetName(body);
    if (!locator) continue;
    const netEntityId = locator.startsWith("prop:") ? locator.slice(5) : locator;
    if (WORLD_V0_NET_ENTITY_ORDER.includes(netEntityId)) byNetId.set(netEntityId, body);
  }
  let packed = "";
  for (const id of WORLD_V0_NET_ENTITY_ORDER) {
    const body = byNetId.get(id);
    assert(body, `raw authority seed remap missing ${id}`);
    const values = flat(body);
    assert(values.length === WORLD_V0_STATE_COMPONENTS.length, `state component width drift for ${id}`);
    for (const value of values) packed += f32hex(value);
  }
  return packed;
}

const a = makeClient("i4ba");
const aw = await welcome(a);
const b = makeClient("i4bb");
const bw = await welcome(b);
assert(aw.worldEpoch === bw.worldEpoch, "fresh peers split WorldEpoch");
sendReady(a, aw);
sendReady(b, bw);
const startA = await waitMessage(a, (m) => m?.type === "world_v0_start", "A start");
const startB = await waitMessage(b, (m) => m?.type === "world_v0_start", "B start");
aw.protocolStartTick = startA.protocolStartTick;
bw.protocolStartTick = startB.protocolStartTick;
const feedA = startInputFeed(a, aw, { x: 1, z: 0 });
const feedB = startInputFeed(b, bw, { x: -1, z: 0 });

const active = await waitMessage(a, (message) => message?.type === "world_v0_consumed" &&
  message.players?.some((player) => player.netEntityId === bw.selfNetEntityId && player.source === "fresh"),
"B fresh before drop");
const dropBoundary = active.boundaryTick;
feedB.stop();
try { b.ws.close(1000, "i4b_authority_drop"); } catch {}

const leaseExpired = await waitMessage(a, (message) => message?.type === "world_v0_consumed" &&
  message.boundaryTick > dropBoundary &&
  message.players?.some((player) => player.netEntityId === bw.selfNetEntityId && player.source === "lease_expired"),
"B lease expiry", 20_000);
assert(!a.messages.some((m) => m?.type === "world_v0_epoch_ended"), "single actor drop killed epoch");

const b2 = makeClient("i4bb", bw.resumeToken);
const b2w = await welcome(b2);
assert(b2w.resumed === true, "rebind welcome not resumed");
assert(b2w.worldEpoch === bw.worldEpoch, "rebind rotated epoch");
assert(b2w.selfSessionId === bw.selfSessionId, "rebind changed session");
assert(b2w.resumeToken === bw.resumeToken, "rebind changed token");
assert(Number.isInteger(b2w.resumeLastBatchSeq), "rebind missing last batch seq");
const seed = b2w.rebaseSeed;
assert(seed?.revision === SEED_REVISION, "rebind missing exact rebase seed");
assert(seed.boundaryTick === b2w.state?.boundaryTick, `seed/state boundary mismatch ${seed.boundaryTick}/${b2w.state?.boundaryTick}`);
assert(seed.stateGuard?.packed === b2w.state?.stateGuard?.packed, "seed/welcome state guard mismatch");
assert(seed.boundaryTick > leaseExpired.boundaryTick, "seed did not occur after observed lease expiry");
const gapTicks = seed.boundaryTick - dropBoundary;
assert(gapTicks > WORLD_V0_TIMING.inputLeaseMissingTicks, `rebase gap ${gapTicks} did not cross ${WORLD_V0_TIMING.inputLeaseMissingTicks}-tick lease`);
assert(gapTicks > 24, `rebase gap ${gapTicks} did not cross client history horizon`);

const bytes = decodeBase64(seed.bytesBase64);
assert(bytes.byteLength === seed.byteLength, "seed byte length mismatch");
const hash = u32Hex(b3.b3Bytes_Fnv1a32(bytes));
assert(hash === seed.fnv1a32, `seed checksum mismatch ${hash}/${seed.fnv1a32}`);
const player = b3.b3RecPlayer_CreateFromBytes(bytes, 1);
assert(player, "authority raw seed CreateFromBytes failed");
const packed = packPlayer(player);
assert(packed === seed.stateGuard.packed, "authority raw seed is not exact f32 state at B(n)");
b3.b3RecPlayer_Destroy(player);

const feedB2 = startInputFeed(b2, b2w, {
  x: 0,
  z: 1,
  nextBatchSeq: b2w.resumeLastBatchSeq + 1,
  nextTarget: seed.boundaryTick + WORLD_V0_TIMING.predictionLeadTicks,
});
const freshAfter = await waitMessage(a, (message) => message?.type === "world_v0_consumed" &&
  message.boundaryTick > seed.boundaryTick &&
  message.players?.some((entry) => entry.netEntityId === bw.selfNetEntityId && entry.source === "fresh"),
"resumed canonical input", 12_000);

feedA.stop();
feedB2.stop();
try { a.ws.close(1000, "i4b_done"); } catch {}
try { b2.ws.close(1000, "i4b_done"); } catch {}

const result = {
  revision: "world-v0-integration-i4b-authority-rebase-v1",
  run: RUN,
  simBuildId: b2w.simBuildId,
  worldEpoch: b2w.worldEpoch,
  actorSession: {
    sessionId: b2w.selfSessionId,
    sameAcrossRebind: b2w.selfSessionId === bw.selfSessionId,
    resumeCount: b2w.resumeCount,
    resumeLastBatchSeq: b2w.resumeLastBatchSeq,
  },
  gap: {
    dropBoundary,
    leaseExpiredBoundary: leaseExpired.boundaryTick,
    rebaseBoundary: seed.boundaryTick,
    gapTicks,
    crossedClientHistory: gapTicks > 24,
    crossedInputLease: gapTicks > WORLD_V0_TIMING.inputLeaseMissingTicks,
  },
  rawSeed: {
    revision: seed.revision,
    byteLength: seed.byteLength,
    fnv1a32: seed.fnv1a32,
    checksumExact: hash === seed.fnv1a32,
    exactF32Guard: packed === seed.stateGuard.packed,
  },
  continuation: { resumedFreshBoundary: freshAfter.boundaryTick },
  verdict: "WORLD_V0_INTEGRATION_I4B_AUTHORITY_EXACT_REBASE_PASS",
  nonClaim: "This proves exact finalized authority recording bytes and same-ActorSession rebind through the local DO/WebSocket path beyond the client history and input-lease horizons. It does not yet prove browser automatic transport recovery or remote placement.",
};
console.log("WORLD_V0_INTEGRATION_I4B_AUTHORITY_REBASE", JSON.stringify(result, null, 2));
console.log(result.verdict);
