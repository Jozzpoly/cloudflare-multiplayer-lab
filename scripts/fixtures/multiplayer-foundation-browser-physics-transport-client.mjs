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
const interactive = run.startsWith("interactive-");
const CONTINUATION_TICKS = interactive ? 60 : 30;
const INPUT_BATCH_TICKS = 15;
const EXPECTED_INPUT_RESULTS = CONTINUATION_TICKS / INPUT_BATCH_TICKS;
const EXPECTED_COMMIT_MESSAGES = interactive ? 3 * EXPECTED_INPUT_RESULTS : 0;
const EXPECTED_COMMIT_RECORDS = interactive ? 3 * CONTINUATION_TICKS : 0;
const DT = 1 / WORLD_V0_TIMING.simulationHz;
const PROFILE = {
  profileId: "shared-yard-foundation-client-v1",
  buildId: WORLD_V0_SIM_BUILD_ID,
  stateSchemaId: "shared-yard-rigidbody-f32-13-v1",
};
const INTERACTIVE_INPUTS = {
  "actor:0": { x: 0.8, z: 0.6 },
  "actor:1": { x: -0.8, z: 0.6 },
  "actor:2": { x: 0, z: -1 },
};

function assert(condition, message) {
  if (!condition) throw new Error(message || "assertion failed");
}
function publish(value) {
  window.__multiplayerFoundationPhysicsTransportEvidence = value;
}
function fail(error) {
  const value = {
    status: "MULTIPLAYER_FOUNDATION_BROWSER_PHYSICS_TRANSPORT_CLIENT_FAIL",
    actorSessionId,
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : null,
  };
  publish(value);
  console.error("MULTIPLAYER_FOUNDATION_BROWSER_PHYSICS_TRANSPORT_CLIENT_FAIL", value);
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

publish({ status: "RUNNING", actorSessionId, mode: interactive ? "interactive" : "neutral", latestTopologyRevision: 0, syncCount: 0 });

try {
  assert(/^[A-Za-z0-9._|:=+-]{1,512}$/.test(actorSessionId), "invalid fixture ActorSession");
  assert(/^[A-Za-z0-9_-]{1,40}$/.test(run), "invalid fixture run");
  assert(Number.isSafeInteger(authorityPort) && authorityPort > 0, "invalid fixture authority port");

  const b3 = await Box3D();
  const syncs = [];
  const inputStatuses = [];
  const commitSources = new Set();
  let worldEpoch = null;
  let runtime = null;
  let hydrated = null;
  let finalTopologyStartTick = null;
  let finalTopologyDigest = null;
  let finalSeedBytes = null;
  let finalSeedFnv1a32 = null;
  let localFinalGuard = null;
  let exactContinuationTicks = 0;
  let inputResults = 0;
  let commitMessages = 0;
  let commitRecords = 0;
  let batchesSent = false;
  let continuationRan = false;

  const socket = new WebSocket(`ws://127.0.0.1:${authorityPort}/foundation-physics/ws?run=${encodeURIComponent(run)}`);
  window.__multiplayerFoundationPhysicsTransportSocket = socket;

  function sendRuntimeReady(sync, runtimeBootstrap) {
    socket.send(JSON.stringify({
      type: "foundation_runtime_ready",
      revision: FOUNDATION_REPLICATION_PROTOCOL_REVISION,
      worldId,
      worldEpoch,
      actorSessionId,
      syncId: sync.syncId,
      runtimeDigest: runtimeBootstrap.envelopeDigest,
    }));
  }

  function runLocalContinuation() {
    assert(!continuationRan, "local continuation ran twice");
    assert(runtime && hydrated, "final runtime missing before continuation");
    assert(finalTopologyStartTick !== null, "final topology start tick missing");
    let guard = null;
    for (let targetTick = finalTopologyStartTick + 1; targetTick <= finalTopologyStartTick + CONTINUATION_TICKS; targetTick += 1) {
      if (!interactive) {
        const self = hydrated.projection.self;
        const recorded = hydrated.inputLedger.recordPredicted({
          netEntityId: self.netEntityId,
          actorSessionId: self.actorSessionId,
          targetTick,
          x: 0,
          z: 0,
          jump: false,
        }, "local");
        assert(recorded.status === "accepted", `self zero prediction rejected at ${targetTick}: ${recorded.status}`);
      }
      const frame = hydrated.inputLedger.resolveTick(targetTick);
      assert(frame.actors.length === 3, `resolved actor coverage ${frame.actors.length} at ${targetTick}`);
      if (interactive) {
        assert(frame.actors.every((input) => input.source === "authority"), `interactive tick ${targetTick} did not resolve entirely from authority commits`);
      }
      guard = stepFoundationBox3DClientRuntime(runtime, frame, {
        dt: DT,
        substeps: WORLD_V0_TIMING.substeps,
        applyActorInput(body, input) {
          assert(input.jumpTrigger === false, `unexpected jump trigger ${input.actorSessionId}`);
          applyIntent(b3, body, input);
        },
        readBodyState: (body) => bodyValues(b3, body),
      });
    }
    assert(guard, "local continuation produced no guard");
    localFinalGuard = guard.packed;
    exactContinuationTicks = CONTINUATION_TICKS;
    continuationRan = true;
  }

  function maybeRunLocalContinuation() {
    if (continuationRan || inputResults !== EXPECTED_INPUT_RESULTS) return;
    if (interactive && (commitMessages !== EXPECTED_COMMIT_MESSAGES || commitRecords !== EXPECTED_COMMIT_RECORDS)) return;
    runLocalContinuation();
  }

  socket.addEventListener("open", () => {
    socket.send(JSON.stringify({
      type: "foundation_join",
      revision: FOUNDATION_REPLICATION_PROTOCOL_REVISION,
      requestId: `join-${actorSessionId}`,
      worldId,
      actorSessionId,
      executionProfile: PROFILE,
    }));
  });

  socket.addEventListener("message", (event) => {
    try {
      assert(typeof event.data === "string", "physics transport fixture requires text server frames");
      const parsed = parseFoundationReplicationServerMessage(event.data, {
        worldId,
        actorSessionId,
        executionProfile: PROFILE,
        seedFormatId: FOUNDATION_BOX3D_RECORDING_SEED_FORMAT,
        ...(worldEpoch ? { worldEpoch } : {}),
      });
      assert(parsed, "physics server message failed replication protocol validation");

      if (parsed.message.type === "foundation_runtime_sync") {
        const sync = parsed.message;
        const nextHydrated = parsed.hydratedRuntimeBootstrap;
        assert(nextHydrated, "physics runtime sync missing hydrated bootstrap");
        worldEpoch ??= sync.worldEpoch;
        assert(sync.worldEpoch === worldEpoch, "physics runtime WorldEpoch drift");
        assert(nextHydrated.projection.self.actorSessionId === actorSessionId, "physics runtime self ActorSession mismatch");

        const topologyRevision = nextHydrated.envelope.topology.topologyRevision;
        const remoteActors = nextHydrated.projection.remotes.length;
        const selfActorId = nextHydrated.projection.self.netEntityId;
        syncs.push({
          reason: sync.reason,
          topologyRevision,
          canonicalTick: nextHydrated.envelope.canonicalTick,
          selfActorId,
          remoteActors,
          seedBytes: nextHydrated.executionSeedBytes.byteLength,
          seedFnv1a32: sync.runtimeBootstrap.executionSeed.fnv1a32,
        });

        if (sync.reason === "correction") {
          assert(runtime && hydrated, "correction arrived before final client runtime");
          assert(localFinalGuard !== null, "correction arrived before local continuation completed");
          assert(nextHydrated.envelope.canonicalTick === runtime.boundaryTick, "correction boundary tick mismatch");
          assert(nextHydrated.envelope.stateGuard.packed === localFinalGuard, "browser continuation diverged from authority correction guard");
          finalSeedBytes = nextHydrated.executionSeedBytes.byteLength;
          finalSeedFnv1a32 = sync.runtimeBootstrap.executionSeed.fnv1a32;
          destroyFoundationBox3DClientRuntime(runtime);
          runtime = hydrateFoundationBox3DClientRuntimeFromSeedBytes(b3, nextHydrated, (body) => bodyValues(b3, body));
          hydrated = nextHydrated;
          sendRuntimeReady(sync, sync.runtimeBootstrap);
          const evidence = {
            status: "MULTIPLAYER_FOUNDATION_BROWSER_PHYSICS_TRANSPORT_CLIENT_PASS",
            environment: "chromium",
            userAgent: navigator.userAgent,
            mode: interactive ? "interactive" : "neutral",
            actorSessionId,
            selfActorId,
            worldId,
            worldEpoch,
            latestTopologyRevision: topologyRevision,
            topologyRevision,
            topologyDigest: nextHydrated.envelope.topology.topologyDigest,
            remoteActors,
            syncCount: syncs.length,
            syncReasons: syncs.map((entry) => entry.reason),
            topologyRevisions: syncs.map((entry) => entry.topologyRevision),
            exactContinuationTicks,
            correctionTick: nextHydrated.envelope.canonicalTick,
            correctionGuardMatched: true,
            finalSeedBytes,
            finalSeedFnv1a32,
            inputResults,
            inputStatuses: [...inputStatuses],
            commitMessages,
            commitRecords,
            commitSources: [...commitSources].sort(),
          };
          publish(evidence);
          console.log("MULTIPLAYER_FOUNDATION_BROWSER_PHYSICS_TRANSPORT_CLIENT_PASS", JSON.stringify(evidence));
          return;
        }

        if (runtime) destroyFoundationBox3DClientRuntime(runtime);
        runtime = hydrateFoundationBox3DClientRuntimeFromSeedBytes(b3, nextHydrated, (body) => bodyValues(b3, body));
        hydrated = nextHydrated;
        sendRuntimeReady(sync, sync.runtimeBootstrap);

        if (topologyRevision === 3 && !batchesSent) {
          assert(remoteActors === 2, `final physics topology remote count ${remoteActors}`);
          batchesSent = true;
          finalTopologyStartTick = nextHydrated.envelope.canonicalTick;
          finalTopologyDigest = nextHydrated.envelope.topology.topologyDigest;
          const actorId = nextHydrated.projection.self.netEntityId;
          const interactiveInput = INTERACTIVE_INPUTS[actorId];
          assert(!interactive || interactiveInput, `missing interactive input pattern ${actorId}`);
          for (let batchIndex = 0; batchIndex < EXPECTED_INPUT_RESULTS; batchIndex += 1) {
            const firstTick = finalTopologyStartTick + 1 + batchIndex * INPUT_BATCH_TICKS;
            const records = Array.from({ length: INPUT_BATCH_TICKS }, (_, index) => ({
              targetTick: firstTick + index,
              x: interactive ? interactiveInput.x : 0,
              z: interactive ? interactiveInput.z : 0,
            }));
            if (interactive) {
              for (const record of records) {
                const predicted = nextHydrated.inputLedger.recordPredicted({
                  netEntityId: actorId,
                  actorSessionId,
                  targetTick: record.targetTick,
                  x: record.x,
                  z: record.z,
                  jump: false,
                }, "local");
                assert(predicted.status === "accepted", `interactive self prediction rejected at ${record.targetTick}: ${predicted.status}`);
              }
            }
            socket.send(JSON.stringify({
              type: "foundation_input_batch",
              revision: FOUNDATION_REPLICATION_PROTOCOL_REVISION,
              worldId,
              worldEpoch,
              actorSessionId,
              actorId,
              topologyRevision,
              batchSeq: batchIndex + 1,
              records,
            }));
          }
        }

        publish({
          status: "RUNNING",
          actorSessionId,
          mode: interactive ? "interactive" : "neutral",
          selfActorId,
          worldEpoch,
          latestTopologyRevision: topologyRevision,
          remoteActors,
          syncCount: syncs.length,
          syncs: [...syncs],
        });
        return;
      }

      if (parsed.message.type === "foundation_input_commit") {
        assert(interactive, "neutral physics fixture received unexpected input commit");
        assert(hydrated && finalTopologyStartTick !== null, "input commit arrived before final runtime bootstrap");
        assert(parsed.message.topologyRevision === hydrated.envelope.topology.topologyRevision, "input commit topology mismatch");
        assert(parsed.message.authorityBoundaryTick === finalTopologyStartTick, "input commit authority boundary mismatch");
        assert(parsed.message.records.length === INPUT_BATCH_TICKS, "input commit record count mismatch");
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
          assert(recorded.status === "accepted" || recorded.status === "superseded", `authority commit rejected at ${record.targetTick}: ${recorded.status}`);
        }
        commitMessages += 1;
        commitRecords += parsed.message.records.length;
        maybeRunLocalContinuation();
        return;
      }

      assert(batchesSent, "physics input result arrived before final batches");
      assert(parsed.message.records.length === INPUT_BATCH_TICKS, "physics input result record count mismatch");
      assert(parsed.message.records.every((record) => record.status === "accepted"), "physics input record was not accepted");
      inputResults += 1;
      inputStatuses.push(...parsed.message.records.map((record) => record.status));
      maybeRunLocalContinuation();
    } catch (error) {
      fail(error);
    }
  });

  socket.addEventListener("close", (event) => {
    const current = window.__multiplayerFoundationPhysicsTransportEvidence;
    if (current?.status !== "MULTIPLAYER_FOUNDATION_BROWSER_PHYSICS_TRANSPORT_CLIENT_PASS") {
      fail(new Error(`physics transport socket closed before PASS code=${event.code} reason=${event.reason}`));
    }
  });
  socket.addEventListener("error", () => {
    const current = window.__multiplayerFoundationPhysicsTransportEvidence;
    if (current?.status !== "MULTIPLAYER_FOUNDATION_BROWSER_PHYSICS_TRANSPORT_CLIENT_PASS") {
      fail(new Error("physics transport socket error before PASS"));
    }
  });
} catch (error) {
  fail(error);
}