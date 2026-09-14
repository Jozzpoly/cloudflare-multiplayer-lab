import Box3D from "/box3d/box3d.inline.mjs";
import {
  destroyFoundationBox3DClientRuntime,
  hydrateFoundationBox3DClientRuntimeFromSeedBytes,
  stepFoundationBox3DClientRuntime,
} from "/runtime/multiplayer-foundation/client-box3d-runtime.js";
import { FOUNDATION_BOX3D_RECORDING_SEED_FORMAT } from "/runtime/multiplayer-foundation/client-runtime-bootstrap.js";
import {
  FOUNDATION_REPLICATION_PROTOCOL_REVISION,
  parseFoundationReplicationServerMessage,
} from "/runtime/multiplayer-foundation/replication-protocol.js";
import {
  WORLD_V0_MOVEMENT,
  WORLD_V0_SIM_BUILD_ID,
  WORLD_V0_TIMING,
} from "/runtime/world-v0-contract.js";

const params = new URLSearchParams(location.search);
const actorSessionId = params.get("session") || "";
const run = params.get("run") || "";
const authorityPort = Number(params.get("authorityPort") || "0");
const worldId = `foundation-physics-replication-${run}`;
const DT = 1 / WORLD_V0_TIMING.simulationHz;
const SEGMENT_TICKS = 30;
const INPUT_BATCH_TICKS = 15;
const BATCHES_PER_SEGMENT = SEGMENT_TICKS / INPUT_BATCH_TICKS;
const PROFILE = {
  profileId: "shared-yard-foundation-client-v1",
  buildId: WORLD_V0_SIM_BUILD_ID,
  stateSchemaId: "shared-yard-rigidbody-f32-13-v1",
};
const INPUTS = {
  "actor:0": { x: 0.8, z: 0.6 },
  "actor:1": { x: -0.8, z: 0.6 },
  "actor:2": { x: 0, z: -1 },
};

function assert(condition, message) {
  if (!condition) throw new Error(message || "assertion failed");
}
function publish(value) {
  window.__multiplayerFoundationReconnectEvidence = value;
}
function bodyValues(b3, body) {
  const position = [0, 0, 0];
  const rotation = [0, 0, 0, 1];
  const linearVelocity = [0, 0, 0];
  const angularVelocity = [0, 0, 0];
  b3.b3Body_GetPosition(position, body);
  b3.b3Body_GetRotation(rotation, body);
  b3.b3Body_GetLinearVelocity(linearVelocity, body);
  b3.b3Body_GetAngularVelocity(angularVelocity, body);
  return [...position, ...rotation, ...linearVelocity, ...angularVelocity];
}
function moveToward2(cx, cz, tx, tz, maxDelta) {
  const dx = tx - cx;
  const dz = tz - cz;
  const distance = Math.hypot(dx, dz);
  if (distance <= maxDelta || distance < 1e-9) return [tx, tz];
  const scale = maxDelta / distance;
  return [cx + dx * scale, cz + dz * scale];
}
function applyIntent(b3, body, input) {
  const velocity = [0, 0, 0];
  b3.b3Body_GetLinearVelocity(velocity, body);
  const hasInput = Math.hypot(input.x, input.z) > 0.01;
  const [nextX, nextZ] = moveToward2(
    velocity[0],
    velocity[2],
    input.x * WORLD_V0_MOVEMENT.playerSpeed,
    input.z * WORLD_V0_MOVEMENT.playerSpeed,
    (hasInput ? WORLD_V0_MOVEMENT.playerAcceleration : WORLD_V0_MOVEMENT.playerDeceleration) * DT,
  );
  b3.b3Body_SetLinearVelocity(body, [nextX, velocity[1], nextZ]);
}

publish({ status: "RUNNING", actorSessionId, phase: 0, latestTopologyRevision: 0 });

try {
  assert(/^[A-Za-z0-9._|:=+-]{1,512}$/.test(actorSessionId), "invalid reconnect fixture ActorSession");
  assert(/^reconnect-[A-Za-z0-9_-]{1,30}$/.test(run), "invalid reconnect fixture run");
  assert(Number.isSafeInteger(authorityPort) && authorityPort > 0, "invalid reconnect fixture authority port");

  const b3 = await Box3D();
  let socket = null;
  let intentionalDisconnect = false;
  let worldEpoch = null;
  let runtime = null;
  let hydrated = null;
  let phase = 0;
  let phaseStartTick = null;
  let phaseLocalGuard = null;
  let phaseContinuationRan = false;
  let phase2Started = false;
  let selfActorId = null;
  let topologyRevision = null;
  let topologyDigest = null;
  let inputResults = 0;
  let commitMessages = 0;
  let commitRecords = 0;
  let resumeSyncs = 0;
  let exactContinuationTicks = 0;
  const syncReasons = [];
  const commitSources = new Set();

  function evidence(status, extra = {}) {
    return {
      status,
      actorSessionId,
      selfActorId,
      worldId,
      worldEpoch,
      phase,
      latestTopologyRevision: topologyRevision ?? 0,
      topologyRevision,
      topologyDigest,
      inputResults,
      commitMessages,
      commitRecords,
      commitSources: [...commitSources].sort(),
      resumeSyncs,
      exactContinuationTicks,
      syncReasons: [...syncReasons],
      ...extra,
    };
  }

  function fail(error) {
    const value = evidence("MULTIPLAYER_FOUNDATION_BROWSER_RECONNECT_CLIENT_FAIL", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : null,
    });
    publish(value);
    console.error("MULTIPLAYER_FOUNDATION_BROWSER_RECONNECT_CLIENT_FAIL", value);
  }

  function sendRuntimeReady(targetSocket, sync, runtimeBootstrap) {
    targetSocket.send(JSON.stringify({
      type: "foundation_runtime_ready",
      revision: FOUNDATION_REPLICATION_PROTOCOL_REVISION,
      worldId,
      worldEpoch,
      actorSessionId,
      syncId: sync.syncId,
      runtimeDigest: runtimeBootstrap.envelopeDigest,
    }));
  }

  function resetSegment(boundaryTick) {
    phaseStartTick = boundaryTick;
    phaseLocalGuard = null;
    phaseContinuationRan = false;
  }

  function expectedResultsForPhase(targetPhase) {
    return targetPhase * BATCHES_PER_SEGMENT;
  }
  function expectedCommitMessagesForPhase(targetPhase) {
    return targetPhase * 3 * BATCHES_PER_SEGMENT;
  }
  function expectedCommitRecordsForPhase(targetPhase) {
    return targetPhase * 3 * SEGMENT_TICKS;
  }

  function runLocalSegment() {
    assert(runtime && hydrated, "reconnect runtime missing before local segment");
    assert(phaseStartTick !== null, "reconnect phase start tick missing");
    assert(!phaseContinuationRan, "reconnect local segment ran twice");
    let guard = null;
    for (let targetTick = phaseStartTick + 1; targetTick <= phaseStartTick + SEGMENT_TICKS; targetTick += 1) {
      const frame = hydrated.inputLedger.resolveTick(targetTick);
      assert(frame.actors.length === 3, `reconnect resolved actor coverage ${frame.actors.length} at ${targetTick}`);
      assert(frame.actors.every((input) => input.source === "authority"), `reconnect tick ${targetTick} did not resolve entirely from authority commits`);
      guard = stepFoundationBox3DClientRuntime(runtime, frame, {
        dt: DT,
        substeps: WORLD_V0_TIMING.substeps,
        applyActorInput(body, input) {
          assert(input.jumpTrigger === false, `unexpected reconnect jump trigger ${input.actorSessionId}`);
          applyIntent(b3, body, input);
        },
        readBodyState: (body) => bodyValues(b3, body),
      });
    }
    assert(guard, "reconnect local segment produced no guard");
    phaseLocalGuard = guard.packed;
    phaseContinuationRan = true;
    exactContinuationTicks += SEGMENT_TICKS;
  }

  function maybeRunLocalSegment() {
    if (phaseContinuationRan || phase < 1) return;
    if (inputResults !== expectedResultsForPhase(phase)) return;
    if (commitMessages !== expectedCommitMessagesForPhase(phase)) return;
    if (commitRecords !== expectedCommitRecordsForPhase(phase)) return;
    runLocalSegment();
  }

  function sendSegmentBatches(targetPhase) {
    assert(socket?.readyState === WebSocket.OPEN, "reconnect segment requires open socket");
    assert(hydrated && selfActorId && topologyRevision !== null, "reconnect segment missing hydrated identity");
    assert(phaseStartTick !== null, "reconnect segment boundary missing");
    const input = INPUTS[selfActorId];
    assert(input, `missing reconnect input pattern ${selfActorId}`);
    for (let batchIndex = 0; batchIndex < BATCHES_PER_SEGMENT; batchIndex += 1) {
      const batchSeq = (targetPhase - 1) * BATCHES_PER_SEGMENT + batchIndex + 1;
      const firstTick = phaseStartTick + 1 + batchIndex * INPUT_BATCH_TICKS;
      const records = Array.from({ length: INPUT_BATCH_TICKS }, (_, index) => ({
        targetTick: firstTick + index,
        x: input.x,
        z: input.z,
      }));
      for (const record of records) {
        const predicted = hydrated.inputLedger.recordPredicted({
          netEntityId: selfActorId,
          actorSessionId,
          targetTick: record.targetTick,
          x: record.x,
          z: record.z,
          jump: false,
        }, "local");
        assert(predicted.status === "accepted", `reconnect self prediction rejected at ${record.targetTick}: ${predicted.status}`);
      }
      socket.send(JSON.stringify({
        type: "foundation_input_batch",
        revision: FOUNDATION_REPLICATION_PROTOCOL_REVISION,
        worldId,
        worldEpoch,
        actorSessionId,
        actorId: selfActorId,
        topologyRevision,
        batchSeq,
        records,
      }));
    }
  }

  function installSocket(nextSocket, attachmentKind) {
    socket = nextSocket;
    window.__multiplayerFoundationReconnectSocket = nextSocket;
    nextSocket.addEventListener("open", () => {
      try {
        if (attachmentKind === "join") {
          nextSocket.send(JSON.stringify({
            type: "foundation_join",
            revision: FOUNDATION_REPLICATION_PROTOCOL_REVISION,
            requestId: `join-${actorSessionId}`,
            worldId,
            actorSessionId,
            executionProfile: PROFILE,
          }));
          return;
        }
        assert(worldEpoch && selfActorId && topologyRevision !== null && topologyDigest, "resume identity unavailable");
        nextSocket.send(JSON.stringify({
          type: "foundation_resume",
          revision: FOUNDATION_REPLICATION_PROTOCOL_REVISION,
          requestId: `resume-${actorSessionId}`,
          worldId,
          worldEpoch,
          actorSessionId,
          actorId: selfActorId,
          topologyRevision,
          topologyDigest,
          executionProfile: PROFILE,
        }));
      } catch (error) {
        fail(error);
      }
    });

    nextSocket.addEventListener("message", (event) => {
      try {
        assert(typeof event.data === "string", "reconnect fixture requires text server frames");
        const parsed = parseFoundationReplicationServerMessage(event.data, {
          worldId,
          actorSessionId,
          executionProfile: PROFILE,
          seedFormatId: FOUNDATION_BOX3D_RECORDING_SEED_FORMAT,
          ...(worldEpoch ? { worldEpoch } : {}),
        });
        assert(parsed, "reconnect server message failed replication protocol validation");

        if (parsed.message.type === "foundation_runtime_sync") {
          const sync = parsed.message;
          const nextHydrated = parsed.hydratedRuntimeBootstrap;
          assert(nextHydrated, "reconnect runtime sync missing hydrated bootstrap");
          worldEpoch ??= sync.worldEpoch;
          assert(sync.worldEpoch === worldEpoch, "reconnect WorldEpoch drift");
          assert(nextHydrated.projection.self.actorSessionId === actorSessionId, "reconnect self ActorSession mismatch");
          const nextSelfActorId = nextHydrated.projection.self.netEntityId;
          const nextTopologyRevision = nextHydrated.envelope.topology.topologyRevision;
          const nextTopologyDigest = nextHydrated.envelope.topology.topologyDigest;
          if (selfActorId !== null) assert(nextSelfActorId === selfActorId, "reconnect changed ActorId");
          if (topologyRevision !== null && sync.reason === "resume") assert(nextTopologyRevision === topologyRevision, "resume changed topology revision");
          if (topologyDigest !== null && sync.reason === "resume") assert(nextTopologyDigest === topologyDigest, "resume changed topology digest");
          selfActorId = nextSelfActorId;
          topologyRevision = nextTopologyRevision;
          topologyDigest = nextTopologyDigest;
          syncReasons.push(sync.reason);

          if (sync.reason === "correction") {
            assert(runtime && phaseLocalGuard !== null, "reconnect correction arrived before local segment completion");
            assert(nextHydrated.envelope.canonicalTick === runtime.boundaryTick, "reconnect correction boundary mismatch");
            assert(nextHydrated.envelope.stateGuard.packed === phaseLocalGuard, "reconnect browser segment diverged from authority correction guard");
            if (runtime) destroyFoundationBox3DClientRuntime(runtime);
            runtime = hydrateFoundationBox3DClientRuntimeFromSeedBytes(b3, nextHydrated, (body) => bodyValues(b3, body));
            hydrated = nextHydrated;
            sendRuntimeReady(nextSocket, sync, sync.runtimeBootstrap);
            if (nextHydrated.envelope.canonicalTick === 33) {
              phase = 1;
              resetSegment(33);
              publish(evidence("MULTIPLAYER_FOUNDATION_BROWSER_RECONNECT_PHASE1_PASS", {
                correctionTick: 33,
                correctionGuardMatched: true,
              }));
              return;
            }
            if (nextHydrated.envelope.canonicalTick === 63) {
              phase = 2;
              publish(evidence("MULTIPLAYER_FOUNDATION_BROWSER_RECONNECT_CLIENT_PASS", {
                correctionTick: 63,
                correctionGuardMatched: true,
                finalSeedBytes: nextHydrated.executionSeedBytes.byteLength,
                finalSeedFnv1a32: sync.runtimeBootstrap.executionSeed.fnv1a32,
              }));
              return;
            }
            throw new Error(`unexpected reconnect correction tick ${nextHydrated.envelope.canonicalTick}`);
          }

          if (sync.reason === "resume") {
            assert(attachmentKind === "resume", "resume sync arrived on initial transport");
            assert(nextHydrated.envelope.canonicalTick === 33, "resume must occur at phase-1 boundary tick 33");
            assert(runtime && runtime.boundaryTick === 33, "resume client did not preserve phase-1 boundary");
            destroyFoundationBox3DClientRuntime(runtime);
            runtime = hydrateFoundationBox3DClientRuntimeFromSeedBytes(b3, nextHydrated, (body) => bodyValues(b3, body));
            hydrated = nextHydrated;
            resumeSyncs += 1;
            sendRuntimeReady(nextSocket, sync, sync.runtimeBootstrap);
            publish(evidence("MULTIPLAYER_FOUNDATION_BROWSER_RECONNECT_RESUME_PASS", {
              resumeTick: 33,
              resumedActorId: selfActorId,
            }));
            return;
          }

          if (runtime) destroyFoundationBox3DClientRuntime(runtime);
          runtime = hydrateFoundationBox3DClientRuntimeFromSeedBytes(b3, nextHydrated, (body) => bodyValues(b3, body));
          hydrated = nextHydrated;
          sendRuntimeReady(nextSocket, sync, sync.runtimeBootstrap);
          if (nextTopologyRevision === 3 && phase === 0 && phaseStartTick === null) {
            phase = 1;
            resetSegment(nextHydrated.envelope.canonicalTick);
            assert(phaseStartTick === 3, `reconnect final topology boundary ${phaseStartTick} != 3`);
            sendSegmentBatches(1);
          }
          publish(evidence("RUNNING"));
          return;
        }

        if (parsed.message.type === "foundation_input_commit") {
          assert(hydrated && phaseStartTick !== null, "reconnect input commit arrived before active runtime");
          assert(parsed.message.topologyRevision === topologyRevision, "reconnect input commit topology mismatch");
          assert(parsed.message.authorityBoundaryTick === phaseStartTick, "reconnect input commit authority boundary mismatch");
          assert(parsed.message.records.length === INPUT_BATCH_TICKS, "reconnect input commit record count mismatch");
          commitSources.add(parsed.message.sourceActorSessionId);
          for (const record of parsed.message.records) {
            const recorded = hydrated.inputLedger.recordAuthoritative({
              netEntityId: parsed.message.actorId,
              actorSessionId: parsed.message.sourceActorSessionId,
              targetTick: record.targetTick,
              x: record.x,
              z: record.z,
              jump: false,
            });
            assert(recorded.status === "accepted" || recorded.status === "superseded", `reconnect authority commit rejected at ${record.targetTick}: ${recorded.status}`);
          }
          commitMessages += 1;
          commitRecords += parsed.message.records.length;
          maybeRunLocalSegment();
          return;
        }

        assert(parsed.message.type === "foundation_input_result", "unexpected reconnect server message");
        assert(parsed.message.records.length === INPUT_BATCH_TICKS, "reconnect input result record count mismatch");
        assert(parsed.message.records.every((record) => record.status === "accepted"), "reconnect input record was not accepted");
        inputResults += 1;
        maybeRunLocalSegment();
      } catch (error) {
        fail(error);
      }
    });

    nextSocket.addEventListener("close", (event) => {
      const current = window.__multiplayerFoundationReconnectEvidence;
      if (intentionalDisconnect && nextSocket === socket) {
        publish(evidence("MULTIPLAYER_FOUNDATION_BROWSER_RECONNECT_DISCONNECTED", {
          closeCode: event.code,
          closeReason: event.reason,
        }));
        return;
      }
      if (current?.status !== "MULTIPLAYER_FOUNDATION_BROWSER_RECONNECT_CLIENT_PASS") {
        fail(new Error(`reconnect transport closed unexpectedly code=${event.code} reason=${event.reason}`));
      }
    });
    nextSocket.addEventListener("error", () => {
      const current = window.__multiplayerFoundationReconnectEvidence;
      if (!intentionalDisconnect && current?.status !== "MULTIPLAYER_FOUNDATION_BROWSER_RECONNECT_CLIENT_PASS") {
        fail(new Error("reconnect transport socket error before PASS"));
      }
    });
  }

  window.__disconnectFoundationTransport = () => {
    assert(actorSessionId === "session-bravo", "only session-bravo is designated for controlled reconnect");
    assert(phase === 1 && phaseLocalGuard === null, "disconnect requires completed phase-1 correction boundary");
    assert(socket?.readyState === WebSocket.OPEN, "disconnect requires open transport");
    intentionalDisconnect = true;
    socket.close(1000, "controlled-5f4a-disconnect");
    return { actorSessionId, selfActorId, topologyRevision, topologyDigest };
  };

  window.__resumeFoundationTransport = () => {
    assert(actorSessionId === "session-bravo", "only session-bravo is designated for controlled reconnect");
    assert(intentionalDisconnect, "resume requires controlled disconnect first");
    intentionalDisconnect = false;
    const nextSocket = new WebSocket(`ws://127.0.0.1:${authorityPort}/foundation-physics/ws?run=${encodeURIComponent(run)}`);
    installSocket(nextSocket, "resume");
    return { actorSessionId, selfActorId, topologyRevision, topologyDigest };
  };

  window.__startFoundationReconnectPhase2 = () => {
    assert(phase === 1, "phase 2 requires completed phase 1");
    assert(!phase2Started, "phase 2 already started");
    if (actorSessionId === "session-bravo") assert(resumeSyncs === 1, "session-bravo must resume before phase 2");
    assert(socket?.readyState === WebSocket.OPEN, "phase 2 requires open transport");
    phase2Started = true;
    resetSegment(33);
    sendSegmentBatches(2);
    publish(evidence("MULTIPLAYER_FOUNDATION_BROWSER_RECONNECT_PHASE2_RUNNING"));
    return true;
  };

  installSocket(new WebSocket(`ws://127.0.0.1:${authorityPort}/foundation-physics/ws?run=${encodeURIComponent(run)}`), "join");
} catch (error) {
  publish({
    status: "MULTIPLAYER_FOUNDATION_BROWSER_RECONNECT_CLIENT_FAIL",
    actorSessionId,
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : null,
  });
}