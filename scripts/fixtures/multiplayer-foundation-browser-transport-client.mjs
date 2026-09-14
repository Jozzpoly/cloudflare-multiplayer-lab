import {
  FOUNDATION_REPLICATION_PROTOCOL_REVISION,
  parseFoundationReplicationServerMessage,
} from "/runtime/multiplayer-foundation/replication-protocol.js";
import { FOUNDATION_BOX3D_RECORDING_SEED_FORMAT } from "/runtime/multiplayer-foundation/client-runtime-bootstrap.js";

const params = new URLSearchParams(location.search);
const actorSessionId = params.get("session") || "";
const run = params.get("run") || "";
const authorityPort = Number(params.get("authorityPort") || "0");
const worldId = `foundation-replication-${run}`;
const PROFILE = {
  profileId: "shared-yard-foundation-client-v1",
  buildId: "foundation-local-transport-build-1",
  stateSchemaId: "foundation-local-transport-f32-2-v1",
};

function assert(condition, message) {
  if (!condition) throw new Error(message || "assertion failed");
}
function publish(value) {
  window.__multiplayerFoundationTransportEvidence = value;
}
function fail(error) {
  const value = {
    status: "MULTIPLAYER_FOUNDATION_BROWSER_TRANSPORT_CLIENT_FAIL",
    actorSessionId,
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : null,
  };
  publish(value);
  console.error("MULTIPLAYER_FOUNDATION_BROWSER_TRANSPORT_CLIENT_FAIL", value);
}

publish({
  status: "RUNNING",
  actorSessionId,
  latestTopologyRevision: 0,
  syncCount: 0,
});

try {
  assert(/^[A-Za-z0-9._|:=+-]{1,512}$/.test(actorSessionId), "invalid fixture ActorSession");
  assert(/^[A-Za-z0-9_-]{1,40}$/.test(run), "invalid fixture run");
  assert(Number.isSafeInteger(authorityPort) && authorityPort > 0, "invalid fixture authority port");

  const syncs = [];
  let worldEpoch = null;
  let inputSent = false;
  let inputActorId = null;
  let finalTopologyDigest = null;
  let finalRuntimeDigest = null;
  const socket = new WebSocket(`ws://127.0.0.1:${authorityPort}/foundation-replication/ws?run=${encodeURIComponent(run)}`);
  window.__multiplayerFoundationTransportSocket = socket;

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
      assert(typeof event.data === "string", "transport fixture requires text server frames");
      const parsed = parseFoundationReplicationServerMessage(event.data, {
        worldId,
        actorSessionId,
        executionProfile: PROFILE,
        seedFormatId: FOUNDATION_BOX3D_RECORDING_SEED_FORMAT,
        ...(worldEpoch ? { worldEpoch } : {}),
      });
      assert(parsed, "server message failed replication protocol validation");

      if (parsed.message.type === "foundation_runtime_sync") {
        const sync = parsed.message;
        const hydrated = parsed.hydratedRuntimeBootstrap;
        assert(hydrated, "runtime sync missing hydrated bootstrap");
        worldEpoch ??= sync.worldEpoch;
        assert(sync.worldEpoch === worldEpoch, "runtime sync WorldEpoch drift");
        assert(hydrated.projection.self.actorSessionId === actorSessionId, "runtime sync self ActorSession mismatch");
        const topologyRevision = hydrated.envelope.topology.topologyRevision;
        const remoteActors = hydrated.projection.remotes.length;
        const selfActorId = hydrated.projection.self.netEntityId;
        finalTopologyDigest = hydrated.envelope.topology.topologyDigest;
        finalRuntimeDigest = sync.runtimeBootstrap.envelopeDigest;
        syncs.push({
          syncId: sync.syncId,
          reason: sync.reason,
          topologyRevision,
          canonicalTick: hydrated.envelope.canonicalTick,
          selfActorId,
          remoteActors,
          runtimeDigest: sync.runtimeBootstrap.envelopeDigest,
        });
        publish({
          status: "RUNNING",
          actorSessionId,
          selfActorId,
          worldEpoch,
          latestTopologyRevision: topologyRevision,
          remoteActors,
          syncCount: syncs.length,
          syncs: [...syncs],
        });

        socket.send(JSON.stringify({
          type: "foundation_runtime_ready",
          revision: FOUNDATION_REPLICATION_PROTOCOL_REVISION,
          worldId,
          worldEpoch,
          actorSessionId,
          syncId: sync.syncId,
          runtimeDigest: sync.runtimeBootstrap.envelopeDigest,
        }));

        if (topologyRevision === 3 && !inputSent) {
          assert(remoteActors === 2, `final topology remote count ${remoteActors}`);
          inputSent = true;
          inputActorId = selfActorId;
          const firstTick = hydrated.envelope.canonicalTick + 1;
          const ordinal = Number(selfActorId.slice("actor:".length));
          const cardinal = [
            [1, 0],
            [0, 1],
            [-1, 0],
          ][ordinal % 3];
          socket.send(JSON.stringify({
            type: "foundation_input_batch",
            revision: FOUNDATION_REPLICATION_PROTOCOL_REVISION,
            worldId,
            worldEpoch,
            actorSessionId,
            actorId: selfActorId,
            topologyRevision,
            batchSeq: 1,
            records: [
              { targetTick: firstTick, x: cardinal[0], z: cardinal[1] },
              { targetTick: firstTick + 1, x: cardinal[0], z: cardinal[1] },
            ],
          }));
        }
        return;
      }

      assert(inputSent, "input result arrived before final input batch");
      assert(parsed.message.actorId === inputActorId, "input result actor mismatch");
      assert(parsed.message.batchSeq === 1, "input result batch sequence mismatch");
      assert(parsed.message.records.length === 2, "input result record count mismatch");
      assert(parsed.message.records.every((record) => record.status === "accepted" || record.status === "superseded"), "input result rejected a final-topology record");
      const latest = syncs[syncs.length - 1];
      assert(latest?.topologyRevision === 3, "input result arrived without final topology");
      const evidence = {
        status: "MULTIPLAYER_FOUNDATION_BROWSER_TRANSPORT_CLIENT_PASS",
        environment: "chromium",
        userAgent: navigator.userAgent,
        actorSessionId,
        selfActorId: latest.selfActorId,
        worldId,
        worldEpoch,
        latestTopologyRevision: latest.topologyRevision,
        topologyRevision: latest.topologyRevision,
        topologyDigest: finalTopologyDigest,
        remoteActors: latest.remoteActors,
        runtimeDigest: finalRuntimeDigest,
        syncCount: syncs.length,
        syncReasons: syncs.map((entry) => entry.reason),
        topologyRevisions: syncs.map((entry) => entry.topologyRevision),
        inputStatuses: parsed.message.records.map((record) => record.status),
        inputTicks: parsed.message.records.map((record) => record.targetTick),
      };
      publish(evidence);
      console.log("MULTIPLAYER_FOUNDATION_BROWSER_TRANSPORT_CLIENT_PASS", JSON.stringify(evidence));
    } catch (error) {
      fail(error);
    }
  });

  socket.addEventListener("close", (event) => {
    const evidence = window.__multiplayerFoundationTransportEvidence;
    if (evidence?.status !== "MULTIPLAYER_FOUNDATION_BROWSER_TRANSPORT_CLIENT_PASS") {
      fail(new Error(`transport socket closed before PASS code=${event.code} reason=${event.reason}`));
    }
  });
  socket.addEventListener("error", () => {
    const evidence = window.__multiplayerFoundationTransportEvidence;
    if (evidence?.status !== "MULTIPLAYER_FOUNDATION_BROWSER_TRANSPORT_CLIENT_PASS") {
      fail(new Error("transport socket error before PASS"));
    }
  });
} catch (error) {
  fail(error);
}
