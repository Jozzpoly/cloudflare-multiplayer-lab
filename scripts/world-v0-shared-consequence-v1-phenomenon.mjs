import { writeFileSync } from "node:fs";
import {
  WORLD_V0_CLIENT_SIM_REVISION,
  WORLD_V0_EXPECTED_SERVER_REVISION,
  WORLD_V0_EXPECTED_SIM_BUILD_ID,
  WORLD_V0_EXPECTED_STATE_GUARD_REVISION,
} from "../public/world-v0/build-contract.js";

const BASE = (process.env.MW_WORLD_V0_PHENOMENON_BASE_URL || "http://127.0.0.1:8787").replace(/\/$/, "");
const OUTPUT = process.env.MW_WORLD_V0_PHENOMENON_OUTPUT || "world-v0-shared-consequence-v1-phenomenon.json";
const wsBase = new URL(BASE);
wsBase.protocol = wsBase.protocol === "https:" ? "wss:" : "ws:";
const WS_URL = `${wsBase.origin}/world-v0/ws`;

const EXPECTED_PROPS = 18;
const EXPECTED_GUARD_LENGTH = 20 * 13 * 8;
const SAFE_FORWARD_TICKS = 24;
const PHASE = {
  neutral: 30,
  zDrive: 49,
  zBrake: 9,
  xDrive: 69,
  xBrake: 9,
  push: 150,
  settle: 60,
};
const ROUTE_END_OFFSET = PHASE.neutral + PHASE.zDrive + PHASE.zBrake + PHASE.xDrive + PHASE.xBrake;
const PUSH_END_OFFSET = ROUTE_END_OFFSET + PHASE.push;
const TOTAL_TICKS = PUSH_END_OFFSET + PHASE.settle;
const TRAIN_IDS = ["prop-9"];
const WALL_IDS = ["prop-15", "prop-16", "prop-17", "prop-18", "prop-19", "prop-20", "prop-21", "prop-22"];
const CALIBRATED_PRE_PUSH = [-0.675510215759277, 0.799859344959259, 2.665433883666992];
const TIMEOUT_MS = 24_000;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
    assert(message[key] === identity[key], `${label}: ${key} drift`);
  }
}
function finiteVector(value, length) {
  return Array.isArray(value) && value.length === length && value.every(Number.isFinite);
}
function assertSnapshot(message, label) {
  assert(message?.finite === true, `${label}: non-finite snapshot`);
  assert(Array.isArray(message.players) && message.players.length === 2, `${label}: player count`);
  assert(Array.isArray(message.props) && message.props.length === EXPECTED_PROPS, `${label}: prop count ${message.props?.length}`);
  for (const entity of [...message.players, ...message.props]) {
    assert(
      finiteVector(entity.position, 3) && finiteVector(entity.rotation, 4) &&
      finiteVector(entity.linearVelocity, 3) && finiteVector(entity.angularVelocity, 3),
      `${label}: invalid dynamic state ${entity.netEntityId}`,
    );
  }
  assert(message.stateGuard?.revision === WORLD_V0_EXPECTED_STATE_GUARD_REVISION, `${label}: guard revision`);
  assert(
    typeof message.stateGuard?.packed === "string" && message.stateGuard.packed.length === EXPECTED_GUARD_LENGTH,
    `${label}: guard width ${message.stateGuard?.packed?.length}`,
  );
}
function entityMaps(message) {
  const copy = (entity) => ({
    position: [...entity.position],
    rotation: [...entity.rotation],
    linearVelocity: [...entity.linearVelocity],
    angularVelocity: [...entity.angularVelocity],
  });
  return {
    props: new Map((message.props || []).map((p) => [p.id, copy(p)])),
    players: new Map((message.players || []).map((p) => [p.sessionId, copy(p)])),
  };
}
function distance(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}
function distanceXZ(a, b) {
  return Math.hypot(a[0] - b[0], a[2] - b[2]);
}
function horizontalSpeed(entity) {
  return Math.hypot(entity.linearVelocity[0], entity.linearVelocity[2]);
}
function groupStats(current, baseline, ids) {
  const perEntity = ids.map((id) => {
    const before = baseline.get(id);
    const after = current.get(id);
    assert(before && after, `missing group entity ${id}`);
    return { id, displacement: distance(before.position, after.position) };
  });
  const values = perEntity.map((entry) => entry.displacement);
  return {
    max: Math.max(...values),
    mean: values.reduce((sum, value) => sum + value, 0) / values.length,
    movedOver20mm: values.filter((value) => value > 0.02).length,
    movedOver100mm: values.filter((value) => value > 0.10).length,
    perEntity,
  };
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
    freshSelf: 0,
    freshRemote: 0,
    initial: null,
    prePush: null,
    final: null,
  };
}
function sendBatch(peer, records) {
  peer.batchSeq += 1;
  peer.ws.send(JSON.stringify({
    type: "world_v0_input_batch",
    ...peer.identity,
    batchSeq: peer.batchSeq,
    records,
  }));
}
function activeInputAt(offset) {
  let cursor = 0;
  cursor += PHASE.neutral;
  if (offset < cursor) return { x: 0, z: 0, phase: "neutral" };
  cursor += PHASE.zDrive;
  if (offset < cursor) return { x: 0, z: 1, phase: "z-drive" };
  cursor += PHASE.zBrake;
  if (offset < cursor) return { x: 0, z: 0, phase: "z-brake" };
  cursor += PHASE.xDrive;
  if (offset < cursor) return { x: 1, z: 0, phase: "x-drive" };
  cursor += PHASE.xBrake;
  if (offset < cursor) return { x: 0, z: 0, phase: "x-brake" };
  cursor += PHASE.push;
  if (offset < cursor) return { x: 1, z: 0, phase: "impact-push" };
  return { x: 0, z: 0, phase: "settle" };
}

async function runScenario(mode) {
  const suffix = `${mode}-${Date.now().toString(36)}`;
  const runKey = `scv1-${suffix}`.slice(0, 20);
  const peers = [createPeer(`scv1A-${Date.now()}`, runKey), createPeer(`scv1B-${Date.now()}`, runKey)];
  const guards = new Map();
  let sharedGuards = 0;
  let nextTick = null;
  let scheduledTicks = 0;
  let activePeer = null;
  let pushStartTick = null;
  let measureEndTick = null;
  let timer = null;
  let settled = false;

  const cleanup = () => {
    if (timer) clearTimeout(timer);
    for (const peer of peers) {
      try { peer.ws.close(1000, "phenomenon_measurement_complete"); } catch { /* best effort */ }
    }
  };
  const inputAt = (peer, tick) => {
    if (mode === "control" || peer !== activePeer) return { x: 0, z: 0 };
    const offset = tick - activePeer.start.protocolStartTick;
    const input = activeInputAt(offset);
    return { x: input.x, z: input.z };
  };
  const feed = () => {
    if (peers.some((peer) => !peer.start || !peer.identity) || !activePeer) return;
    if (nextTick === null) nextTick = activePeer.start.protocolStartTick;
    const horizon = Math.min(...peers.map((peer) => peer.latestBoundary)) + SAFE_FORWARD_TICKS;
    const endTick = activePeer.start.protocolStartTick + TOTAL_TICKS;
    while (nextTick < endTick && nextTick + 1 <= horizon) {
      for (const peer of peers) {
        sendBatch(peer, [
          { targetTick: nextTick, ...inputAt(peer, nextTick) },
          { targetTick: nextTick + 1, ...inputAt(peer, nextTick + 1) },
        ]);
      }
      nextTick += 2;
      scheduledTicks += 2;
    }
  };

  return await new Promise((resolve, reject) => {
    const fail = (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error instanceof Error ? error : new Error(String(error)));
    };
    const maybeFinish = () => {
      if (settled || !activePeer?.final) return;
      try {
        assert(scheduledTicks === TOTAL_TICKS, `${mode}: scheduled ${scheduledTicks}/${TOTAL_TICKS}`);
        for (const peer of peers) {
          assert(peer.accepted === TOTAL_TICKS, `${mode}:${peer.playerId} accepted ${peer.accepted}/${TOTAL_TICKS}`);
          assert(peer.late === 0, `${mode}:${peer.playerId} late ${peer.late}`);
          assert(peer.rejected === 0, `${mode}:${peer.playerId} rejected ${peer.rejected}`);
          assert(peer.freshSelf >= TOTAL_TICKS - 2, `${mode}:${peer.playerId} fresh self ${peer.freshSelf}`);
          assert(peer.freshRemote >= TOTAL_TICKS - 2, `${mode}:${peer.playerId} fresh remote ${peer.freshRemote}`);
        }
        assert(sharedGuards >= 50, `${mode}: only ${sharedGuards} shared guard samples`);
        assert(activePeer.prePush, `${mode}: missing pre-push sample`);

        const initial = activePeer.initial;
        const pre = activePeer.prePush.state;
        const final = activePeer.final.state;
        const mediator = pre.props.get("prop-9");
        const actorPre = pre.players.get(activePeer.welcome.selfSessionId);
        assert(mediator && actorPre, `${mode}: missing pre-push actor/mediator`);
        const fidelityErrorXZ = distanceXZ(actorPre.position, CALIBRATED_PRE_PUSH);
        const metrics = {
          runKey,
          worldEpoch: activePeer.identity.worldEpoch,
          simBuildId: activePeer.identity.simBuildId,
          activeSlot: activePeer.welcome.slot,
          protocolStartTick: activePeer.start.protocolStartTick,
          pushStartTick,
          prePushBoundary: activePeer.prePush.boundary,
          finalBoundary: activePeer.final.boundary,
          scheduledTicks,
          sharedGuards,
          prePushActorPosition: actorPre.position,
          prePushActorVelocity: actorPre.linearVelocity,
          prePushHorizontalSpeed: horizontalSpeed(actorPre),
          calibratedPrePushPosition: CALIBRATED_PRE_PUSH,
          prePushCalibrationErrorXZ: fidelityErrorXZ,
          prePushActorToMediatorCenterXZ: distanceXZ(actorPre.position, mediator.position),
          prePushFromB0: {
            train: groupStats(pre.props, initial.props, TRAIN_IDS),
            breakwall: groupStats(pre.props, initial.props, WALL_IDS),
          },
          finalFromB0: {
            train: groupStats(final.props, initial.props, TRAIN_IDS),
            breakwall: groupStats(final.props, initial.props, WALL_IDS),
          },
          finalFromPrePush: {
            train: groupStats(final.props, pre.props, TRAIN_IDS),
            breakwall: groupStats(final.props, pre.props, WALL_IDS),
          },
          peers: peers.map((peer) => ({
            slot: peer.welcome.slot,
            accepted: peer.accepted,
            late: peer.late,
            rejected: peer.rejected,
            freshSelf: peer.freshSelf,
            freshRemote: peer.freshRemote,
            latestBoundary: peer.latestBoundary,
          })),
        };
        settled = true;
        cleanup();
        resolve(metrics);
      } catch (error) {
        fail(error);
      }
    };

    timer = setTimeout(() => fail(new Error(`${mode}: phenomenon timeout`)), TIMEOUT_MS);
    peers.forEach((peer, index) => {
      peer.ws.addEventListener("error", () => fail(new Error(`${mode}:${peer.playerId} websocket error`)));
      peer.ws.addEventListener("close", (event) => {
        if (!settled) fail(new Error(`${mode}:${peer.playerId} closed early ${event.code}:${event.reason}`));
      });
      peer.ws.addEventListener("message", async (event) => {
        try {
          const raw = typeof event.data === "string" ? event.data : await event.data.text();
          const message = JSON.parse(raw);
          if (message.type === "world_v0_error") throw new Error(`${mode}: server ${message.error}`);
          if (message.type === "world_v0_epoch_ended") throw new Error(`${mode}: epoch ended early ${message.reason}`);

          if (message.type === "world_v0_welcome") {
            assert(message.revision === WORLD_V0_EXPECTED_SERVER_REVISION, `${mode}: server revision`);
            assert(message.simBuildId === WORLD_V0_EXPECTED_SIM_BUILD_ID, `${mode}: SimBuild ${message.simBuildId}`);
            assert(message.clientSimRevision === WORLD_V0_CLIENT_SIM_REVISION, `${mode}: client sim`);
            peer.welcome = message;
            peer.identity = identityFrom(message);
            peer.latestBoundary = message.state?.boundaryTick ?? 0;
            peer.ws.send(JSON.stringify({ type: "world_v0_ready", ...peer.identity }));
            return;
          }
          if (!peer.identity) throw new Error(`${mode}: message before welcome`);
          if (message.worldEpoch) assertIdentity(message, peer.identity, `${mode}:${message.type}`);

          if (message.type === "world_v0_start") {
            assert(message.boundaryTick === 0 && message.state?.boundaryTick === 0, `${mode}: nonzero start`);
            assertSnapshot(message.state, `${mode}:B0`);
            peer.start = message;
            peer.latestBoundary = 0;
            peer.initial = entityMaps(message.state);
            if (peers.every((candidate) => candidate.start)) {
              activePeer = peers.find((candidate) => candidate.welcome.slot === 0);
              assert(activePeer, `${mode}: slot0 missing`);
              pushStartTick = activePeer.start.protocolStartTick + ROUTE_END_OFFSET;
              measureEndTick = activePeer.start.protocolStartTick + TOTAL_TICKS;
              feed();
            }
            return;
          }

          if (message.type === "world_v0_snapshot") {
            assertSnapshot(message, `${mode}:B${message.boundaryTick}`);
            peer.latestBoundary = Math.max(peer.latestBoundary, message.boundaryTick ?? 0);
            const guard = guards.get(message.boundaryTick) || new Map();
            guard.set(index, message.stateGuard.packed);
            guards.set(message.boundaryTick, guard);
            if (guard.size === 2) {
              assert(guard.get(0) === guard.get(1), `${mode}: guard disagreement B${message.boundaryTick}`);
              sharedGuards += 1;
              guards.delete(message.boundaryTick);
            }
            if (peer === activePeer) {
              const state = entityMaps(message);
              if (message.boundaryTick <= pushStartTick && (!peer.prePush || message.boundaryTick > peer.prePush.boundary)) {
                peer.prePush = { boundary: message.boundaryTick, state };
              }
              if (message.boundaryTick >= measureEndTick && !peer.final) {
                peer.final = { boundary: message.boundaryTick, state };
              }
            }
            feed();
            maybeFinish();
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
            maybeFinish();
            return;
          }
          if (message.type === "world_v0_peer_records") {
            peer.latestBoundary = Math.max(peer.latestBoundary, message.relayBoundaryTick ?? 0);
            feed();
            return;
          }
          if (message.type === "world_v0_consumed") {
            peer.latestBoundary = Math.max(peer.latestBoundary, message.boundaryTick ?? 0);
            const self = (message.players || []).find((player) => player.sessionId === peer.welcome.selfSessionId);
            const remote = (message.players || []).find((player) => player.sessionId !== peer.welcome.selfSessionId);
            if (self?.fresh) peer.freshSelf += 1;
            if (remote?.fresh) peer.freshRemote += 1;
            feed();
            maybeFinish();
          }
        } catch (error) {
          fail(error);
        }
      });
    });
  });
}

const evidence = {
  verdict: "WORLD_V0_SHARED_CONSEQUENCE_V1_MEASUREMENT_INCOMPLETE",
  generatedAt: new Date().toISOString(),
  provenance: {
    githubSha: process.env.GITHUB_SHA || null,
    githubRunId: process.env.GITHUB_RUN_ID || null,
    githubRunAttempt: process.env.GITHUB_RUN_ATTEMPT || null,
  },
  routeRevision: "world-v0-shared-consequence-v1-axis-route-v1",
  phaseTicks: { ...PHASE, routeEndOffset: ROUTE_END_OFFSET, total: TOTAL_TICKS },
  control: null,
  active: null,
  comparison: null,
  error: null,
};

try {
  evidence.control = await runScenario("control");
  await sleep(250);
  evidence.active = await runScenario("active");
  const controlWall = evidence.control.finalFromB0.breakwall;
  const activeWall = evidence.active.finalFromPrePush.breakwall;
  evidence.comparison = {
    controlWallMax: controlWall.max,
    activeWallMax: activeWall.max,
    breakwallMaxDelta: activeWall.max - controlWall.max,
    activeWallMean: activeWall.mean,
    movedOver20mmDelta: activeWall.movedOver20mm - controlWall.movedOver20mm,
    movedOver100mmDelta: activeWall.movedOver100mm - controlWall.movedOver100mm,
    mediatorPostPushDisplacement: evidence.active.finalFromPrePush.train.max,
    activePrePushBreakwallDrift: evidence.active.prePushFromB0.breakwall.max,
    activePrePushMediatorDrift: evidence.active.prePushFromB0.train.max,
    prePushCalibrationErrorXZ: evidence.active.prePushCalibrationErrorXZ,
    prePushHorizontalSpeed: evidence.active.prePushHorizontalSpeed,
  };
  evidence.verdict = "WORLD_V0_SHARED_CONSEQUENCE_V1_MEASUREMENT_COMPLETE";
  writeFileSync(OUTPUT, JSON.stringify(evidence, null, 2));
  console.log("SHARED_CONSEQUENCE_V1_MEASUREMENT_COMPLETE", JSON.stringify({
    phaseTicks: evidence.phaseTicks,
    activePrePush: {
      position: evidence.active.prePushActorPosition,
      velocity: evidence.active.prePushActorVelocity,
      calibrationErrorXZ: evidence.active.prePushCalibrationErrorXZ,
      actorToMediatorCenterXZ: evidence.active.prePushActorToMediatorCenterXZ,
      prePushMediatorDrift: evidence.active.prePushFromB0.train.max,
      prePushWallDrift: evidence.active.prePushFromB0.breakwall.max,
    },
    control: evidence.control.finalFromB0,
    activePost: evidence.active.finalFromPrePush,
    comparison: evidence.comparison,
  }));
} catch (error) {
  evidence.error = error instanceof Error ? error.stack || error.message : String(error);
  writeFileSync(OUTPUT, JSON.stringify(evidence, null, 2));
  throw error;
}
