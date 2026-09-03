import { writeFileSync } from "node:fs";
import {
  WORLD_V0_BROWSER_UI_REVISION,
  WORLD_V0_CLIENT_SIM_REVISION,
  WORLD_V0_EXPECTED_PROTOCOL_REVISION,
  WORLD_V0_EXPECTED_SERVER_REVISION,
  WORLD_V0_EXPECTED_SIM_BUILD_ID,
  WORLD_V0_EXPECTED_STATE_GUARD_REVISION,
} from "../public/world-v0/build-contract.js";
import { deriveWorldV0AuthorityProbe } from "./world-v0-authority-stimulus.mjs";

const BASE = (process.env.MW_WORLD_V0_BASE_URL || "https://cloudflare-multiplayer-lab-staging.jozzpoly.workers.dev").replace(/\/$/, "");
const wsBase = new URL(BASE);
wsBase.protocol = wsBase.protocol === "https:" ? "wss:" : "ws:";
const WS_URL = process.env.MW_WORLD_V0_WS_URL || `${wsBase.origin}/world-v0/ws`;
const PRODUCTION = (process.env.MW_WORLD_V0_PRODUCTION_URL || "https://cloudflare-multiplayer-lab.jozzpoly.workers.dev").replace(/\/$/, "");
const SKIP_PRODUCTION_ISOLATION = process.env.MW_WORLD_V0_SKIP_PRODUCTION_ISOLATION === "1";
const POLL_TIMEOUT_MS = Number(process.env.MW_WORLD_V0_POLL_TIMEOUT_MS || 120_000);
const SMOKE_TIMEOUT_MS = Number(process.env.MW_WORLD_V0_SMOKE_TIMEOUT_MS || 25_000);
const TOTAL_PROBE_RECORDS = 120;
const SAFE_FORWARD_TICKS = 24;
const EXPECTED_GUARD_LENGTH = 14 * 13 * 8;
const EVENT_ORDER_RETAIN = 24;
const OUTPUT = process.env.MW_WORLD_V0_AUTHORITY_OUTPUT || "world-v0-authority-evidence.json";

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function assert(condition, message) { if (!condition) throw new Error(message); }

async function fetchText(url) {
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8000) });
  return { response, text: await response.text() };
}

async function waitForExpectedTarget() {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < POLL_TIMEOUT_MS) {
    try {
      const [build, app, ping] = await Promise.all([
        fetchText(`${BASE}/world-v0/build-contract.js`),
        fetchText(`${BASE}/world-v0/app.js`),
        fetchText(`${BASE}/api/ping`),
      ]);
      last = {
        buildStatus: build.response.status,
        appStatus: app.response.status,
        pingStatus: ping.response.status,
        hasSimBuild: build.text.includes(WORLD_V0_EXPECTED_SIM_BUILD_ID),
        hasUiRevision: build.text.includes(WORLD_V0_BROWSER_UI_REVISION),
      };
      if (build.response.ok && app.response.ok && ping.response.ok && last.hasSimBuild && last.hasUiRevision) {
        console.log(`World V0 target ready · ${BASE} · ${JSON.stringify(last)}`);
        return;
      }
    } catch (error) {
      last = { error: error instanceof Error ? error.message : String(error) };
    }
    await sleep(1000);
  }
  throw new Error(`World V0 target did not reach expected browser build within ${POLL_TIMEOUT_MS}ms · ${JSON.stringify(last)}`);
}

async function assertProductionIsolation(label) {
  if (SKIP_PRODUCTION_ISOLATION) {
    console.log(`${label}: production isolation intentionally skipped for ${BASE}`);
    return;
  }
  const response = await fetch(`${PRODUCTION}/world-v0/build-contract.js`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
  assert(response.status === 404, `${label}: production unexpectedly exposes World V0 asset with ${response.status}`);
  console.log(`${label}: production World V0 asset 404`);
}

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
    assert(message[key] === identity[key], `${label}: ${key} drift ${message[key]} !== ${identity[key]}`);
  }
}

function finiteVector(value, length) {
  return Array.isArray(value) && value.length === length && value.every(Number.isFinite);
}

function assertDynamicSnapshot(message) {
  assert(message.finite === true, `snapshot non-finite at B(${message.boundaryTick})`);
  assert(Array.isArray(message.players) && message.players.length === 2, "snapshot missing two players");
  assert(Array.isArray(message.props) && message.props.length === 12, "snapshot missing 12 props");
  for (const entity of [...message.players, ...message.props]) {
    assert(typeof entity.netEntityId === "string" && entity.netEntityId.length > 0, "dynamic entity missing NetEntityId");
    assert(finiteVector(entity.position, 3), `${entity.netEntityId} invalid position`);
    assert(finiteVector(entity.rotation, 4), `${entity.netEntityId} invalid rotation`);
    assert(finiteVector(entity.linearVelocity, 3), `${entity.netEntityId} invalid linear velocity`);
    assert(finiteVector(entity.angularVelocity, 3), `${entity.netEntityId} invalid angular velocity`);
  }
  assert(message.stateGuard?.revision === WORLD_V0_EXPECTED_STATE_GUARD_REVISION, `state guard revision drift ${message.stateGuard?.revision}`);
  assert(typeof message.stateGuard?.packed === "string", "state guard packed payload missing");
  assert(message.stateGuard.packed.length === EXPECTED_GUARD_LENGTH, `state guard length ${message.stateGuard.packed.length} !== ${EXPECTED_GUARD_LENGTH}`);
}

function createPeer(playerId, runKey) {
  return {
    playerId,
    ws: new WebSocket(`${WS_URL}?player=${encodeURIComponent(playerId)}&run=${encodeURIComponent(runKey)}`),
    welcome: null,
    identity: null,
    start: null,
    probe: null,
    latestBoundaryTick: 0,
    batchSeq: 0,
    acceptedRecords: 0,
    lateRecords: 0,
    rejectedRecords: 0,
    relayedRecords: 0,
    consumedFreshSelf: 0,
    consumedFreshRemote: 0,
    finiteSnapshots: 0,
    leaseExpiredSeen: 0,
    epochEnded: null,
    closed: false,
    close: null,
    eventOrder: [],
    initialProps: new Map(),
    maxPropDisplacement: 0,
  };
}

function sendBatch(peer, firstTick, input) {
  peer.batchSeq += 1;
  peer.ws.send(JSON.stringify({
    type: "world_v0_input_batch",
    ...peer.identity,
    batchSeq: peer.batchSeq,
    records: [
      { targetTick: firstTick, x: input.x, z: input.z },
      { targetTick: firstTick + 1, x: input.x, z: input.z },
    ],
  }));
}

async function runTwoPeerAuthoritySmoke() {
  assert(typeof WebSocket === "function", "Node runtime has no global WebSocket support");
  const runKey = `ci-yard-${Date.now().toString(36)}`;
  const peers = [createPeer(`ciA-${Date.now()}`, runKey), createPeer(`ciB-${Date.now()}`, runKey)];
  const guardByBoundary = new Map();
  let sharedGuardSamples = 0;
  let nextProbeTick = null;
  let scheduledRecords = 0;
  let timeout = null;
  let settled = false;
  let stimulusValidated = false;
  let eventSequence = 0;

  const recordEvent = (peer, type, details = undefined) => {
    peer.eventOrder.push({ seq: ++eventSequence, type, ...(details ? { details } : {}) });
    if (peer.eventOrder.length > EVENT_ORDER_RETAIN) peer.eventOrder.shift();
  };

  const peerEvidence = (peer, peerIndex) => ({
    peerIndex,
    playerId: peer.playerId,
    slot: peer.welcome?.slot ?? null,
    selfSessionId: peer.welcome?.selfSessionId ?? null,
    protocolStartTick: peer.start?.protocolStartTick ?? null,
    b0ActorPosition: peer.probe?.actorPosition ?? null,
    target: peer.probe?.target ?? null,
    input: peer.probe?.input ?? null,
    acceptedRecords: peer.acceptedRecords,
    lateRecords: peer.lateRecords,
    rejectedRecords: peer.rejectedRecords,
    relayedRecords: peer.relayedRecords,
    consumedFreshSelf: peer.consumedFreshSelf,
    consumedFreshRemote: peer.consumedFreshRemote,
    latestBoundaryTick: peer.latestBoundaryTick,
    finiteSnapshots: peer.finiteSnapshots,
    maxPropDisplacement: peer.maxPropDisplacement,
    leaseExpiredSeen: peer.leaseExpiredSeen,
    epochEndedSeen: Boolean(peer.epochEnded),
    epochEndReason: peer.epochEnded?.reason ?? null,
    closed: peer.closed,
    close: peer.close,
    eventOrder: peer.eventOrder,
  });

  const authorityEvidence = () => ({
    runKey,
    target: BASE,
    scheduledRecords,
    sharedGuardSamples,
    stimulusValidated,
    peers: peers.map(peerEvidence),
  });

  const cleanup = () => {
    if (timeout) clearTimeout(timeout);
    for (const peer of peers) {
      try { peer.ws.close(1000, "world_v0_authority_smoke_complete"); } catch { /* best effort */ }
    }
  };

  return await new Promise((resolve, reject) => {
    const fail = (error) => {
      if (settled) return;
      const message = error instanceof Error ? error.message : String(error);
      const diagnostic = authorityEvidence();
      settled = true;
      cleanup();
      const failure = new Error(`${message} · authorityEvidence=${JSON.stringify(diagnostic)}`, { cause: error instanceof Error ? error : undefined });
      failure.authorityEvidence = diagnostic;
      reject(failure);
    };

    const validateStimulus = () => {
      if (stimulusValidated || peers.some((peer) => !peer.start || !peer.identity || !peer.probe)) return;
      const slots = peers.map((peer) => peer.welcome?.slot);
      assert(slots.every(Number.isInteger), `authority slots missing ${JSON.stringify(slots)}`);
      assert(new Set(slots).size === 2, `authority slots are not distinct ${JSON.stringify(slots)}`);
      assert(peers[0].start.protocolStartTick === peers[1].start.protocolStartTick, `protocolStartTick drift ${peers[0].start.protocolStartTick} !== ${peers[1].start.protocolStartTick}`);
      assert(
        JSON.stringify(peers[0].probe.target) === JSON.stringify(peers[1].probe.target),
        `B(0) central target drift ${JSON.stringify(peers.map((peer) => peer.probe.target))}`,
      );
      stimulusValidated = true;
    };

    const feedForwardWindow = () => {
      if (peers.some((peer) => !peer.start || !peer.identity || !peer.probe) || scheduledRecords >= TOTAL_PROBE_RECORDS) return;
      validateStimulus();
      if (!stimulusValidated) return;
      if (nextProbeTick === null) nextProbeTick = peers[0].start.protocolStartTick;
      const minBoundary = Math.min(...peers.map((peer) => peer.latestBoundaryTick));
      const safeHorizon = minBoundary + SAFE_FORWARD_TICKS;
      while (scheduledRecords < TOTAL_PROBE_RECORDS && nextProbeTick + 1 <= safeHorizon) {
        sendBatch(peers[0], nextProbeTick, peers[0].probe.input);
        sendBatch(peers[1], nextProbeTick, peers[1].probe.input);
        nextProbeTick += 2;
        scheduledRecords += 2;
      }
    };

    const maybePass = () => {
      if (settled || peers.some((peer) => !peer.closed)) return;
      try {
        assert(stimulusValidated, "authority physical stimulus was never validated");
        assert(scheduledRecords === TOTAL_PROBE_RECORDS, `scheduled only ${scheduledRecords}/${TOTAL_PROBE_RECORDS} records`);
        for (const peer of peers) {
          assert(peer.start, `${peer.playerId}: missing start`);
          assert(peer.probe, `${peer.playerId}: missing B(0)-derived probe`);
          assert(peer.acceptedRecords >= TOTAL_PROBE_RECORDS - 2, `${peer.playerId}: accepted ${peer.acceptedRecords}`);
          assert(peer.lateRecords <= 2, `${peer.playerId}: excessive late records ${peer.lateRecords}`);
          assert(peer.rejectedRecords === 0, `${peer.playerId}: rejected ${peer.rejectedRecords}`);
          assert(peer.relayedRecords >= TOTAL_PROBE_RECORDS - 2, `${peer.playerId}: relayed ${peer.relayedRecords}`);
          assert(peer.consumedFreshSelf >= TOTAL_PROBE_RECORDS - 4, `${peer.playerId}: fresh self ${peer.consumedFreshSelf}`);
          assert(peer.consumedFreshRemote >= TOTAL_PROBE_RECORDS - 4, `${peer.playerId}: fresh remote ${peer.consumedFreshRemote}`);
          assert(peer.finiteSnapshots >= 20, `${peer.playerId}: finite snapshots ${peer.finiteSnapshots}`);
          assert(peer.leaseExpiredSeen >= 1, `${peer.playerId}: missing lease_expired consumption`);
          assert(peer.epochEnded?.reason?.startsWith("input_lease_expired:"), `${peer.playerId}: unexpected epoch end ${peer.epochEnded?.reason}`);
          assert(peer.maxPropDisplacement > 0.05, `${peer.playerId}: props did not move meaningfully (${peer.maxPropDisplacement})`);
        }
        assert(peers[0].identity.worldEpoch === peers[1].identity.worldEpoch, "peers received different WorldEpoch values");
        assert(peers[0].identity.simBuildId === WORLD_V0_EXPECTED_SIM_BUILD_ID, "unexpected SimBuildId");
        assert(sharedGuardSamples >= 20, `too few identical authority guard samples ${sharedGuardSamples}`);
        const result = {
          runKey,
          target: BASE,
          identity: peers[0].identity,
          scheduledRecords,
          sharedGuardSamples,
          stimulusValidated,
          peers: peers.map(peerEvidence),
        };
        settled = true;
        cleanup();
        resolve(result);
      } catch (error) {
        fail(error);
      }
    };

    timeout = setTimeout(() => fail(new Error(`World V0 authority smoke timeout after ${SMOKE_TIMEOUT_MS}ms`)), SMOKE_TIMEOUT_MS);

    peers.forEach((peer, peerIndex) => {
      peer.ws.addEventListener("error", () => {
        recordEvent(peer, "ws_error");
        fail(new Error(`WebSocket error for ${peer.playerId}`));
      });
      peer.ws.addEventListener("close", (event) => {
        peer.closed = true;
        peer.close = { code: event.code, reason: event.reason, wasClean: event.wasClean };
        recordEvent(peer, "ws_close", peer.close);
        if (!peer.epochEnded && !settled) fail(new Error(`${peer.playerId} closed before world_v0_epoch_ended evidence`));
        else maybePass();
      });
      peer.ws.addEventListener("message", async (event) => {
        try {
          const raw = typeof event.data === "string" ? event.data : await event.data.text();
          const message = JSON.parse(raw);
          if (message.type === "world_v0_error") {
            recordEvent(peer, "world_v0_error", { error: message.error ?? null });
            throw new Error(`World V0 server error ${message.error}`);
          }

          if (message.type === "world_v0_welcome") {
            assert(message.revision === WORLD_V0_EXPECTED_SERVER_REVISION, `server revision drift ${message.revision}`);
            assert(message.simBuildId === WORLD_V0_EXPECTED_SIM_BUILD_ID, `welcome SimBuildId drift ${message.simBuildId}`);
            assert(message.clientSimRevision === WORLD_V0_CLIENT_SIM_REVISION, `welcome client sim drift ${message.clientSimRevision}`);
            assert(message.simulation?.protocolRevision === WORLD_V0_EXPECTED_PROTOCOL_REVISION, `protocol drift ${message.simulation?.protocolRevision}`);
            assert(message.simulation?.stateGuardRevision === WORLD_V0_EXPECTED_STATE_GUARD_REVISION, `guard drift ${message.simulation?.stateGuardRevision}`);
            peer.welcome = message;
            peer.identity = identityFrom(message);
            peer.latestBoundaryTick = message.state?.boundaryTick ?? 0;
            recordEvent(peer, "world_v0_welcome", { slot: message.slot, selfSessionId: message.selfSessionId, boundaryTick: peer.latestBoundaryTick });
            peer.ws.send(JSON.stringify({ type: "world_v0_ready", ...peer.identity }));
            return;
          }

          if (!peer.identity) throw new Error(`${peer.playerId}: message before welcome ${message.type}`);
          if (message.worldEpoch) assertIdentity(message, peer.identity, `${peer.playerId}:${message.type}`);

          if (message.type === "world_v0_start") {
            assert(message.revision === WORLD_V0_EXPECTED_SERVER_REVISION, `start revision drift ${message.revision}`);
            assert(message.boundaryTick === 0 && message.state?.boundaryTick === 0, "Shared Yard did not start from B(0)");
            assertDynamicSnapshot(message.state);
            peer.start = message;
            peer.latestBoundaryTick = 0;
            peer.probe = deriveWorldV0AuthorityProbe(message.state, peer.welcome.selfSessionId);
            peer.initialProps = new Map((message.state.props || []).map((prop) => [prop.id, [...prop.position]]));
            recordEvent(peer, "world_v0_start", {
              protocolStartTick: message.protocolStartTick,
              actorPosition: peer.probe.actorPosition,
              target: peer.probe.target,
              input: peer.probe.input,
            });
            feedForwardWindow();
            return;
          }

          if (message.type === "world_v0_snapshot") {
            peer.latestBoundaryTick = Math.max(peer.latestBoundaryTick, message.boundaryTick ?? 0);
            assertDynamicSnapshot(message);
            peer.finiteSnapshots += 1;
            for (const prop of message.props || []) {
              const initial = peer.initialProps.get(prop.id);
              if (!initial) continue;
              peer.maxPropDisplacement = Math.max(peer.maxPropDisplacement, Math.hypot(
                prop.position[0] - initial[0], prop.position[1] - initial[1], prop.position[2] - initial[2],
              ));
            }
            const guard = guardByBoundary.get(message.boundaryTick) || new Map();
            guard.set(peerIndex, message.stateGuard.packed);
            guardByBoundary.set(message.boundaryTick, guard);
            if (guard.size === 2) {
              assert(guard.get(0) === guard.get(1), `authority sent different state guard to peers at B(${message.boundaryTick})`);
              sharedGuardSamples += 1;
              guardByBoundary.delete(message.boundaryTick);
            }
            feedForwardWindow();
            return;
          }

          if (message.type === "world_v0_batch_ack") {
            peer.latestBoundaryTick = Math.max(peer.latestBoundaryTick, message.boundaryTick ?? 0);
            for (const record of message.records || []) {
              if (record.status === "accepted") peer.acceptedRecords += 1;
              else if (record.status === "late") peer.lateRecords += 1;
              else if (record.status !== "duplicate_same") peer.rejectedRecords += 1;
            }
            feedForwardWindow();
            return;
          }

          if (message.type === "world_v0_peer_records") {
            peer.relayedRecords += (message.records || []).length;
            peer.latestBoundaryTick = Math.max(peer.latestBoundaryTick, message.relayBoundaryTick ?? 0);
            feedForwardWindow();
            return;
          }

          if (message.type === "world_v0_consumed") {
            peer.latestBoundaryTick = Math.max(peer.latestBoundaryTick, message.boundaryTick ?? 0);
            const self = (message.players || []).find((player) => player.sessionId === peer.welcome.selfSessionId);
            const remote = (message.players || []).find((player) => player.sessionId !== peer.welcome.selfSessionId);
            if (self?.fresh) peer.consumedFreshSelf += 1;
            if (remote?.fresh) peer.consumedFreshRemote += 1;
            if ((message.players || []).some((player) => player.source === "lease_expired")) peer.leaseExpiredSeen += 1;
            feedForwardWindow();
            return;
          }

          if (message.type === "world_v0_epoch_ended") {
            peer.epochEnded = message;
            recordEvent(peer, "world_v0_epoch_ended", { reason: message.reason ?? null, boundaryTick: message.boundaryTick ?? null });
            return;
          }
        } catch (error) {
          fail(error);
        }
      });
    });
  });
}

async function runIdentityMismatchSmoke() {
  const runKey = `ci-id-${Date.now().toString(36)}`;
  const peers = [createPeer(`idA-${Date.now()}`, runKey), createPeer(`idB-${Date.now()}`, runKey)];
  let timeout = null;
  let settled = false;
  let wrongSent = false;

  const cleanup = () => {
    if (timeout) clearTimeout(timeout);
    for (const peer of peers) {
      try { peer.ws.close(1000, "identity_smoke_complete"); } catch { /* best effort */ }
    }
  };

  return await new Promise((resolve, reject) => {
    const fail = (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error instanceof Error ? error : new Error(String(error)));
    };
    const maybePass = () => {
      if (settled || peers.some((peer) => !peer.closed)) return;
      try {
        const reasons = peers.map((peer) => peer.epochEnded?.reason).filter(Boolean);
        assert(reasons.some((reason) => reason.startsWith("world_identity_mismatch:")), `identity mismatch did not end epoch: ${JSON.stringify(reasons)}`);
        assert(peers[0].identity?.worldEpoch === peers[1].identity?.worldEpoch, "identity smoke peers began in different epochs");
        settled = true;
        cleanup();
        resolve({ runKey, reason: reasons.find((reason) => reason.startsWith("world_identity_mismatch:")) });
      } catch (error) { fail(error); }
    };

    timeout = setTimeout(() => fail(new Error("identity mismatch smoke timeout")), 10_000);
    peers.forEach((peer, index) => {
      peer.ws.addEventListener("error", () => fail(new Error(`identity smoke WebSocket error ${peer.playerId}`)));
      peer.ws.addEventListener("close", () => { peer.closed = true; maybePass(); });
      peer.ws.addEventListener("message", async (event) => {
        try {
          const raw = typeof event.data === "string" ? event.data : await event.data.text();
          const message = JSON.parse(raw);
          if (message.type === "world_v0_welcome") {
            peer.welcome = message;
            peer.identity = identityFrom(message);
            if (index === 0) {
              peer.ws.send(JSON.stringify({ type: "world_v0_ready", ...peer.identity }));
            } else if (!wrongSent) {
              wrongSent = true;
              peer.ws.send(JSON.stringify({ type: "world_v0_ready", ...peer.identity, worldEpoch: `${peer.identity.worldEpoch}-wrong` }));
            }
            return;
          }
          if (message.type === "world_v0_epoch_ended") peer.epochEnded = message;
          if (message.type === "world_v0_error" && message.error !== "world_identity_mismatch") throw new Error(`unexpected identity smoke server error ${message.error}`);
        } catch (error) { fail(error); }
      });
    });
  });
}

const evidence = {
  verdict: "WORLD_V0_FAIL_AUTHORITY_RUNTIME_SMOKE",
  generatedAt: new Date().toISOString(),
  provenance: {
    githubSha: process.env.GITHUB_SHA || null,
    githubRunId: process.env.GITHUB_RUN_ID || null,
    githubRunAttempt: process.env.GITHUB_RUN_ATTEMPT || null,
  },
  target: BASE,
  productionIsolation: { skipped: SKIP_PRODUCTION_ISOLATION, before: false, after: false },
  sharedYard: null,
  identityMismatch: null,
  failureAuthority: null,
  error: null,
};

try {
  await assertProductionIsolation("before World V0 authority smoke");
  evidence.productionIsolation.before = true;
  await waitForExpectedTarget();
  evidence.sharedYard = await runTwoPeerAuthoritySmoke();
  evidence.identityMismatch = await runIdentityMismatchSmoke();
  await assertProductionIsolation("after World V0 authority smoke");
  evidence.productionIsolation.after = true;
  evidence.verdict = "WORLD_V0_PASS_AUTHORITY_RUNTIME_SMOKE";
  writeFileSync(OUTPUT, JSON.stringify(evidence, null, 2));
  console.log(`WORLD V0 AUTHORITY RUNTIME SMOKE PASS · ${JSON.stringify({ sharedYard: evidence.sharedYard, identityMismatch: evidence.identityMismatch })}`);
} catch (error) {
  evidence.error = error instanceof Error ? error.stack || error.message : String(error);
  evidence.failureAuthority = error?.authorityEvidence ?? null;
  writeFileSync(OUTPUT, JSON.stringify(evidence, null, 2));
  throw error;
}
