import { writeFileSync } from "node:fs";
import {
  WORLD_V0_CLIENT_SIM_REVISION,
  WORLD_V0_EXPECTED_SERVER_REVISION,
  WORLD_V0_EXPECTED_SIM_BUILD_ID,
  WORLD_V0_EXPECTED_STATE_GUARD_REVISION,
} from "../public/world-v0/build-contract.js";

const BASE = (process.env.MW_WORLD_V0_JUMP_BASE_URL || "http://127.0.0.1:8787").replace(/\/$/, "");
const OUTPUT = process.env.MW_WORLD_V0_JUMP_AUTHORITY_OUTPUT || "world-v0-jump-authority-evidence.json";
const wsBase = new URL(BASE);
wsBase.protocol = wsBase.protocol === "https:" ? "wss:" : "ws:";
const WS_URL = `${wsBase.origin}/world-v0/ws`;
const SAFE_FORWARD_TICKS = 24;
const TOTAL_TICKS = 170;
const FIRST_JUMP_OFFSET = 4;
const AIR_JUMP_OFFSET = 16;
const REJUMP_OFFSET = 96;
const JUMP_OFFSETS = new Set([FIRST_JUMP_OFFSET, AIR_JUMP_OFFSET, REJUMP_OFFSET]);
const EXPECTED_GUARD_LENGTH = 14 * 13 * 8;
const TIMEOUT_MS = 18_000;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function identityFrom(message) {
  return {
    worldId: message.worldId,
    worldEpoch: message.worldEpoch,
    simBuildId: message.simBuildId,
    clientSimRevision: message.clientSimRevision,
  };
}
function assertIdentity(message, identity, label) {
  for (const key of ["worldId", "worldEpoch", "simBuildId", "clientSimRevision"]) {
    assert(message[key] === identity[key], `${label}: ${key} drift`);
  }
}
function assertSnapshot(message, label) {
  assert(message?.finite === true, `${label}: non-finite snapshot`);
  assert(Array.isArray(message.players) && message.players.length === 2, `${label}: player count`);
  assert(Array.isArray(message.props) && message.props.length === 12, `${label}: prop count`);
  assert(message.stateGuard?.revision === WORLD_V0_EXPECTED_STATE_GUARD_REVISION, `${label}: state guard revision`);
  assert(typeof message.stateGuard?.packed === "string" && message.stateGuard.packed.length === EXPECTED_GUARD_LENGTH, `${label}: state guard width`);
}
function createPeer(playerId, runKey) {
  return {
    playerId,
    ws: new WebSocket(`${WS_URL}?player=${encodeURIComponent(playerId)}&run=${encodeURIComponent(runKey)}`),
    welcome: null,
    identity: null,
    start: null,
    latestBoundary: 0,
    batchSeq: 0,
    accepted: 0,
    late: 0,
    rejected: 0,
    consumedFresh: 0,
  };
}
function sendBatch(peer, records) {
  peer.batchSeq += 1;
  peer.ws.send(JSON.stringify({ type: "world_v0_input_batch", ...peer.identity, batchSeq: peer.batchSeq, records }));
}

const runKey = `jump-${Date.now().toString(36)}`.slice(0, 20);
const peers = [createPeer(`jumpA-${Date.now()}`, runKey), createPeer(`jumpB-${Date.now()}`, runKey)];
let activePeer = null;
let nextTick = null;
let scheduledTicks = 0;
let baselineY = null;
let maxY = -Infinity;
let landedBetweenJumps = false;
let firstAirSample = null;
let lastConsumedTick = null;
let sharedGuards = 0;
const guards = new Map();
const jumpEvents = [];
let settled = false;
let timer = null;

function inputFor(peer, tick) {
  if (!activePeer || peer !== activePeer) return { x: 0, z: 0, jump: false };
  const offset = tick - activePeer.start.protocolStartTick;
  return { x: 0, z: 0, jump: JUMP_OFFSETS.has(offset) };
}

function feed() {
  if (!activePeer || peers.some((peer) => !peer.start || !peer.identity)) return;
  if (nextTick === null) nextTick = activePeer.start.protocolStartTick;
  const horizon = Math.min(...peers.map((peer) => peer.latestBoundary)) + SAFE_FORWARD_TICKS;
  const endTick = activePeer.start.protocolStartTick + TOTAL_TICKS;
  while (nextTick < endTick && nextTick + 1 <= horizon) {
    for (const peer of peers) {
      sendBatch(peer, [
        { targetTick: nextTick, ...inputFor(peer, nextTick) },
        { targetTick: nextTick + 1, ...inputFor(peer, nextTick + 1) },
      ]);
    }
    nextTick += 2;
    scheduledTicks += 2;
  }
}

function cleanup() {
  if (timer) clearTimeout(timer);
  for (const peer of peers) {
    try { peer.ws.close(1000, "jump_authority_complete"); } catch { /* best effort */ }
  }
}

function maybeFinish(resolve, reject) {
  if (settled || !activePeer?.start || lastConsumedTick === null) return;
  const endTick = activePeer.start.protocolStartTick + TOTAL_TICKS;
  if (lastConsumedTick < endTick - 1 || activePeer.latestBoundary < endTick) return;
  try {
    assert(scheduledTicks === TOTAL_TICKS, `scheduled ${scheduledTicks}/${TOTAL_TICKS}`);
    for (const peer of peers) {
      assert(peer.accepted === TOTAL_TICKS, `${peer.playerId}: accepted ${peer.accepted}/${TOTAL_TICKS}`);
      assert(peer.late === 0, `${peer.playerId}: late ${peer.late}`);
      assert(peer.rejected === 0, `${peer.playerId}: rejected ${peer.rejected}`);
      assert(peer.consumedFresh >= TOTAL_TICKS - 2, `${peer.playerId}: fresh ${peer.consumedFresh}`);
    }
    assert(jumpEvents.length === 3, `jump event count ${jumpEvents.length}`);
    assert(jumpEvents[0].offset === FIRST_JUMP_OFFSET && jumpEvents[0].jumpApplied === true, `first grounded jump was not applied: ${JSON.stringify(jumpEvents[0])}`);
    assert(jumpEvents[1].offset === AIR_JUMP_OFFSET && jumpEvents[1].jumpApplied === false, `airborne jump was not rejected: ${JSON.stringify(jumpEvents[1])}`);
    assert(jumpEvents[2].offset === REJUMP_OFFSET && jumpEvents[2].jumpApplied === true, `post-landing jump was not re-applied: ${JSON.stringify(jumpEvents[2])}`);
    assert(Number.isFinite(baselineY), `baseline Y missing ${baselineY}`);
    assert(maxY >= baselineY + 0.6, `jump rise too small baseline=${baselineY} max=${maxY}`);
    assert(landedBetweenJumps, `actor did not demonstrably return to support between jump 1 and jump 3`);
    assert(firstAirSample && firstAirSample.y >= baselineY + 0.25, `no airborne snapshot after first jump`);
    assert(sharedGuards >= 20, `only ${sharedGuards} shared exact guard samples`);

    const evidence = {
      verdict: "WORLD_V0_JUMP_AUTHORITY_PASS",
      generatedAt: new Date().toISOString(),
      runKey,
      simBuildId: activePeer.identity.simBuildId,
      protocolStartTick: activePeer.start.protocolStartTick,
      jumpOffsets: [FIRST_JUMP_OFFSET, AIR_JUMP_OFFSET, REJUMP_OFFSET],
      jumpEvents,
      baselineY,
      maxY,
      rise: maxY - baselineY,
      landedBetweenJumps,
      firstAirSample,
      sharedGuards,
      peers: peers.map((peer) => ({
        slot: peer.welcome.slot,
        accepted: peer.accepted,
        late: peer.late,
        rejected: peer.rejected,
        consumedFresh: peer.consumedFresh,
        latestBoundary: peer.latestBoundary,
      })),
    };
    writeFileSync(OUTPUT, JSON.stringify(evidence, null, 2));
    console.log("WORLD_V0_JUMP_AUTHORITY_PASS", JSON.stringify({
      rise: evidence.rise,
      jumpEvents,
      sharedGuards,
    }));
    settled = true;
    cleanup();
    resolve(evidence);
  } catch (error) {
    settled = true;
    cleanup();
    reject(error);
  }
}

await new Promise((resolve, reject) => {
  timer = setTimeout(() => {
    if (settled) return;
    settled = true;
    cleanup();
    reject(new Error(`jump authority timeout · active=${Boolean(activePeer)} next=${nextTick} consumed=${lastConsumedTick}`));
  }, TIMEOUT_MS);

  peers.forEach((peer, peerIndex) => {
    peer.ws.addEventListener("error", () => {
      if (!settled) reject(new Error(`${peer.playerId}: websocket error`));
    });
    peer.ws.addEventListener("close", (event) => {
      if (!settled) reject(new Error(`${peer.playerId}: closed early ${event.code}:${event.reason}`));
    });
    peer.ws.addEventListener("message", async (event) => {
      if (settled) return;
      try {
        const raw = typeof event.data === "string" ? event.data : await event.data.text();
        const message = JSON.parse(raw);
        if (message.type === "world_v0_error") throw new Error(`${peer.playerId}: server ${message.error}`);
        if (message.type === "world_v0_epoch_ended") throw new Error(`${peer.playerId}: epoch ended early ${message.reason}`);

        if (message.type === "world_v0_welcome") {
          assert(message.revision === WORLD_V0_EXPECTED_SERVER_REVISION, `${peer.playerId}: server revision ${message.revision}`);
          assert(message.simBuildId === WORLD_V0_EXPECTED_SIM_BUILD_ID, `${peer.playerId}: SimBuild ${message.simBuildId}`);
          assert(message.clientSimRevision === WORLD_V0_CLIENT_SIM_REVISION, `${peer.playerId}: client sim ${message.clientSimRevision}`);
          peer.welcome = message;
          peer.identity = identityFrom(message);
          peer.latestBoundary = message.state?.boundaryTick ?? 0;
          peer.ws.send(JSON.stringify({ type: "world_v0_ready", ...peer.identity }));
          return;
        }
        if (!peer.identity) throw new Error(`${peer.playerId}: message before welcome`);
        if (message.worldEpoch) assertIdentity(message, peer.identity, `${peer.playerId}:${message.type}`);

        if (message.type === "world_v0_start") {
          assert(message.boundaryTick === 0 && message.state?.boundaryTick === 0, `${peer.playerId}: nonzero start`);
          assertSnapshot(message.state, `${peer.playerId}:B0`);
          peer.start = message;
          peer.latestBoundary = 0;
          if (peers.every((candidate) => candidate.start)) {
            activePeer = peers.find((candidate) => candidate.welcome.slot === 0);
            assert(activePeer, "slot 0 missing");
            const actor = activePeer.start.state.players.find((player) => player.sessionId === activePeer.welcome.selfSessionId);
            assert(actor, "active actor missing at B0");
            baselineY = actor.position[1];
            maxY = baselineY;
            feed();
          }
          return;
        }

        if (message.type === "world_v0_snapshot") {
          assertSnapshot(message, `${peer.playerId}:B${message.boundaryTick}`);
          peer.latestBoundary = Math.max(peer.latestBoundary, message.boundaryTick ?? 0);
          const guard = guards.get(message.boundaryTick) || new Map();
          guard.set(peerIndex, message.stateGuard.packed);
          guards.set(message.boundaryTick, guard);
          if (guard.size === 2) {
            assert(guard.get(0) === guard.get(1), `guard disagreement B${message.boundaryTick}`);
            sharedGuards += 1;
            guards.delete(message.boundaryTick);
          }
          if (peer === activePeer) {
            const actor = message.players.find((player) => player.sessionId === activePeer.welcome.selfSessionId);
            if (actor) {
              const y = actor.position[1];
              maxY = Math.max(maxY, y);
              const offset = message.boundaryTick - activePeer.start.protocolStartTick;
              if (!firstAirSample && offset > FIRST_JUMP_OFFSET && y >= baselineY + 0.25) {
                firstAirSample = { boundaryTick: message.boundaryTick, offset, y, vy: actor.linearVelocity[1] };
              }
              if (offset > FIRST_JUMP_OFFSET + 45 && offset < REJUMP_OFFSET - 4 && y <= baselineY + 0.08 && Math.abs(actor.linearVelocity[1]) < 0.8) {
                landedBetweenJumps = true;
              }
            }
          }
          feed();
          maybeFinish(resolve, reject);
          return;
        }

        if (message.type === "world_v0_batch_ack") {
          peer.latestBoundary = Math.max(peer.latestBoundary, message.boundaryTick ?? 0);
          for (const record of message.records || []) {
            if (record.status === "accepted") peer.accepted += 1;
            else if (record.status === "late") peer.late += 1;
            else if (record.status !== "duplicate_same") peer.rejected += 1;
          }
          feed();
          return;
        }

        if (message.type === "world_v0_peer_records") {
          peer.latestBoundary = Math.max(peer.latestBoundary, message.relayBoundaryTick ?? 0);
          feed();
          return;
        }

        if (message.type === "world_v0_consumed") {
          peer.latestBoundary = Math.max(peer.latestBoundary, message.boundaryTick ?? 0);
          for (const player of message.players || []) if (player.fresh) peer.consumedFresh += 1;
          if (peer === activePeer) {
            lastConsumedTick = message.targetTick;
            const active = (message.players || []).find((player) => player.sessionId === activePeer.welcome.selfSessionId);
            if (active?.jump) {
              jumpEvents.push({
                targetTick: message.targetTick,
                offset: message.targetTick - activePeer.start.protocolStartTick,
                jumpApplied: Boolean(active.jumpApplied),
                source: active.source,
                fresh: Boolean(active.fresh),
              });
            }
          }
          feed();
          maybeFinish(resolve, reject);
        }
      } catch (error) {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      }
    });
  });
});

await sleep(20);
