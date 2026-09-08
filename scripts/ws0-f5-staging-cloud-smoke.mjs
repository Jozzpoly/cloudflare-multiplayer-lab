import { readFile } from "node:fs/promises";

const STAGING = "https://cloudflare-multiplayer-lab-staging.jozzpoly.workers.dev";
const PRODUCTION = "https://cloudflare-multiplayer-lab.jozzpoly.workers.dev";
const WS_URL = "wss://cloudflare-multiplayer-lab-staging.jozzpoly.workers.dev/world0-f5/ws";
const POLL_TIMEOUT_MS = 120_000;
const SMOKE_TIMEOUT_MS = 20_000;
const EXPECTED_SERVER_REVISION = "ws0-f5-authority-v1";
const EXPECTED_PROTOCOL_REVISION = "ws0-f5-scheduled-input-v1";
const EXPECTED_BOX3D_PACKAGE = "box3d.js@0.1.1";
const SEGMENT_TICKS = 8;
const RETAIN_TICKS = 24;
const RECORDING_CAPACITY = 2 * 1024 * 1024;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function fetchText(url) {
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8000) });
  return { response, text: await response.text() };
}

function extractStringConst(text, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`const\\s+${escaped}\\s*=\\s*["'\x60]([^"'\x60]+)["'\x60]`).exec(text)?.[1] ?? null;
}

function deriveSimBuildId(clientRevision, serverRevision, contract) {
  const box3d = contract?.box3dRuntime || {};
  return [
    "ws0-f5-sim-v1",
    `server=${serverRevision || "unknown"}`,
    `client=${clientRevision}`,
    `protocol=${EXPECTED_PROTOCOL_REVISION}`,
    `box3d=${box3d.package || "unknown"}:${box3d.build || "unknown"}`,
    `hz=${contract?.simulationHz ?? "unknown"}`,
    `substeps=${contract?.substeps ?? "unknown"}`,
    `snapshotHz=${contract?.snapshotHz ?? "unknown"}`,
    `lead=${contract?.predictionLeadTicks ?? "unknown"}`,
    `batch=${contract?.inputBatchSize ?? "unknown"}`,
    `speed=${contract?.playerSpeed ?? "unknown"}`,
    `accel=${contract?.playerAcceleration ?? "unknown"}`,
    `decel=${contract?.playerDeceleration ?? "unknown"}`,
    `history=${SEGMENT_TICKS}/${RETAIN_TICKS}`,
    `recording=${RECORDING_CAPACITY}`,
  ].join("|");
}

function decodeMessageData(data) {
  if (typeof data === "string") return Promise.resolve(data);
  if (data && typeof data.text === "function") return data.text();
  if (data instanceof ArrayBuffer) return Promise.resolve(new TextDecoder().decode(data));
  if (ArrayBuffer.isView(data)) return Promise.resolve(new TextDecoder().decode(data));
  return Promise.resolve(String(data));
}

function finiteVector(value, length) {
  return Array.isArray(value) && value.length === length && value.every(Number.isFinite);
}

function assertFiniteSnapshot(message) {
  assert(message.finite === true, `authority snapshot reports non-finite state at B(${message.boundaryTick})`);
  assert(Array.isArray(message.players) && message.players.length === 2, "authority snapshot missing two players");
  assert(Array.isArray(message.props) && message.props.length > 0, "authority snapshot missing props");
  for (const player of message.players) {
    assert(finiteVector(player.position, 3), `non-finite player position ${player.sessionId}`);
    assert(finiteVector(player.rotation, 4), `non-finite player rotation ${player.sessionId}`);
    assert(finiteVector(player.velocity, 3), `non-finite player velocity ${player.sessionId}`);
  }
  for (const prop of message.props) {
    assert(finiteVector(prop.position, 3), `non-finite prop position ${prop.id}`);
    assert(finiteVector(prop.rotation, 4), `non-finite prop rotation ${prop.id}`);
  }
}

const localApp = await readFile(new URL("../public/world0-f5/app.js", import.meta.url), "utf8");
const expectedClientRevision = extractStringConst(localApp, "CLIENT_REVISION");
const expectedProtocolRevision = extractStringConst(localApp, "PROTOCOL_REVISION");
const expectedBrowserBox3d = extractStringConst(localApp, "BOX3D_PACKAGE");
assert(expectedClientRevision, "could not read local F5 client revision");
assert(expectedProtocolRevision === EXPECTED_PROTOCOL_REVISION, `local protocol revision drift ${expectedProtocolRevision}`);
assert(expectedBrowserBox3d === EXPECTED_BOX3D_PACKAGE, `local browser Box3D package drift ${expectedBrowserBox3d}`);

async function waitForExpectedStaging() {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < POLL_TIMEOUT_MS) {
    try {
      const [app, ping] = await Promise.all([
        fetchText(`${STAGING}/world0-f5/app.js`),
        fetchText(`${STAGING}/api/ping`),
      ]);
      last = {
        appStatus: app.response.status,
        appRevision: extractStringConst(app.text, "CLIENT_REVISION"),
        pingStatus: ping.response.status,
      };
      if (app.response.ok && last.appRevision === expectedClientRevision && ping.response.ok) {
        console.log(`F5 staging asset ready · ${JSON.stringify(last)}`);
        return last;
      }
    } catch (error) {
      last = { error: error instanceof Error ? error.message : String(error) };
    }
    await sleep(2000);
  }
  throw new Error(`F5 staging did not reach expected client revision within ${POLL_TIMEOUT_MS} ms · last ${JSON.stringify(last)}`);
}

async function assertProductionIsolation(label) {
  const response = await fetch(`${PRODUCTION}/world0-f5/app.js`, {
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  assert(response.status === 404, `${label}: production unexpectedly exposes F5 browser asset with ${response.status}`);
  console.log(`${label}: production F5 asset 404`);
}

function createPeer(playerId, runKey) {
  const ws = new WebSocket(`${WS_URL}?player=${encodeURIComponent(playerId)}&run=${encodeURIComponent(runKey)}`);
  const state = {
    playerId,
    ws,
    welcome: null,
    start: null,
    latestBoundaryTick: 0,
    batchSeq: 0,
    acceptedRecords: 0,
    relayedRecords: 0,
    consumedFreshSelf: 0,
    consumedFreshRemote: 0,
    finiteSnapshots: 0,
    sentProbe: false,
    fingerprint: null,
  };
  return state;
}

function sendProbeRecords(peer, firstTick, input) {
  if (peer.sentProbe) return;
  for (let offset = 0; offset < 6; offset += 2) {
    peer.batchSeq += 1;
    peer.ws.send(JSON.stringify({
      type: "f5_input_batch",
      batchSeq: peer.batchSeq,
      records: [
        { targetTick: firstTick + offset, x: input.x, z: input.z },
        { targetTick: firstTick + offset + 1, x: input.x, z: input.z },
      ],
    }));
  }
  peer.sentProbe = true;
}

async function runTwoPeerSmoke() {
  assert(typeof WebSocket === "function", "Node runtime has no global WebSocket support");
  const runKey = `ci-f5-${Date.now().toString(36)}`;
  const peers = [createPeer(`ciA-${Date.now()}`, runKey), createPeer(`ciB-${Date.now()}`, runKey)];
  let timeout = null;
  let readySent = false;

  const cleanup = () => {
    if (timeout) clearTimeout(timeout);
    for (const peer of peers) {
      try { peer.ws.close(1000, "f5_cloud_smoke_complete"); } catch { /* best effort */ }
    }
  };

  return await new Promise((resolve, reject) => {
    const fail = (error) => {
      cleanup();
      reject(error instanceof Error ? error : new Error(String(error)));
    };

    const maybeReady = () => {
      if (readySent || peers.some((peer) => !peer.welcome)) return;
      readySent = true;
      for (const peer of peers) peer.ws.send(JSON.stringify({ type: "f5_ready" }));
    };

    const maybeSendProbe = () => {
      if (peers.some((peer) => !peer.start)) return;
      const protocolStartTick = peers[0].start.protocolStartTick;
      const minBoundary = Math.min(...peers.map((peer) => peer.latestBoundaryTick));
      if (minBoundary < protocolStartTick - 16) return;
      sendProbeRecords(peers[0], protocolStartTick, { x: 1, z: 0 });
      sendProbeRecords(peers[1], protocolStartTick, { x: 0, z: 1 });
    };

    const maybePass = () => {
      if (peers.some((peer) => !peer.start || !peer.sentProbe)) return;
      const healthy = peers.every((peer) =>
        peer.acceptedRecords >= 6 &&
        peer.relayedRecords >= 6 &&
        peer.consumedFreshSelf >= 1 &&
        peer.consumedFreshRemote >= 1 &&
        peer.finiteSnapshots >= 1 &&
        peer.fingerprint,
      );
      if (!healthy) return;
      assert(peers[0].fingerprint === peers[1].fingerprint, "peers derived different F5 simulation fingerprints");
      const result = {
        runKey,
        clientRevision: expectedClientRevision,
        serverRevision: peers[0].welcome.revision,
        protocolRevision: peers[0].welcome.protocolRevision,
        simBuildId: peers[0].fingerprint,
        peers: peers.map((peer) => ({
          playerId: peer.playerId,
          slot: peer.welcome.slot,
          protocolStartTick: peer.start.protocolStartTick,
          acceptedRecords: peer.acceptedRecords,
          relayedRecords: peer.relayedRecords,
          consumedFreshSelf: peer.consumedFreshSelf,
          consumedFreshRemote: peer.consumedFreshRemote,
          finiteSnapshots: peer.finiteSnapshots,
          latestBoundaryTick: peer.latestBoundaryTick,
        })),
      };
      cleanup();
      resolve(result);
    };

    timeout = setTimeout(() => {
      fail(new Error(`F5 staging WS smoke timeout · ${JSON.stringify(peers.map((peer) => ({
        playerId: peer.playerId,
        welcome: Boolean(peer.welcome),
        start: peer.start?.protocolStartTick ?? null,
        latestBoundaryTick: peer.latestBoundaryTick,
        sentProbe: peer.sentProbe,
        acceptedRecords: peer.acceptedRecords,
        relayedRecords: peer.relayedRecords,
        consumedFreshSelf: peer.consumedFreshSelf,
        consumedFreshRemote: peer.consumedFreshRemote,
        finiteSnapshots: peer.finiteSnapshots,
      })))}`));
    }, SMOKE_TIMEOUT_MS);

    for (const peer of peers) {
      peer.ws.addEventListener("error", () => fail(new Error(`F5 staging WebSocket error for ${peer.playerId}`)));
      peer.ws.addEventListener("close", (event) => {
        if (!peer.start) fail(new Error(`F5 staging WebSocket closed early ${peer.playerId} ${event.code} ${event.reason || ""}`));
      });
      peer.ws.addEventListener("message", async (event) => {
        try {
          const raw = await decodeMessageData(event.data);
          const message = JSON.parse(raw);

          if (message.type === "f5_error") throw new Error(`F5 server error ${message.error}`);

          if (message.type === "f5_welcome") {
            assert(message.revision === EXPECTED_SERVER_REVISION, `unexpected F5 server revision ${message.revision}`);
            assert(message.protocolRevision === EXPECTED_PROTOCOL_REVISION, `unexpected F5 protocol revision ${message.protocolRevision}`);
            assert(message.simulation?.box3dRuntime?.package === EXPECTED_BOX3D_PACKAGE, `unexpected authority Box3D package ${message.simulation?.box3dRuntime?.package}`);
            peer.welcome = message;
            peer.latestBoundaryTick = message.state?.boundaryTick ?? message.boundaryTick ?? 0;
            peer.fingerprint = deriveSimBuildId(expectedClientRevision, message.revision, message.simulation);
            maybeReady();
            return;
          }

          if (message.type === "f5_start") {
            assert(message.revision === EXPECTED_SERVER_REVISION, `start server revision drift ${message.revision}`);
            assert(message.protocolRevision === EXPECTED_PROTOCOL_REVISION, `start protocol revision drift ${message.protocolRevision}`);
            assert(Number.isInteger(message.protocolStartTick), "F5 start missing protocolStartTick");
            const startFingerprint = deriveSimBuildId(expectedClientRevision, message.revision, message.simulation);
            assert(startFingerprint === peer.fingerprint, "F5 welcome/start fingerprint drift");
            peer.start = message;
            peer.latestBoundaryTick = Math.max(peer.latestBoundaryTick, message.boundaryTick ?? 0);
            maybeSendProbe();
            return;
          }

          if (message.type === "f5_snapshot") {
            peer.latestBoundaryTick = Math.max(peer.latestBoundaryTick, message.boundaryTick ?? 0);
            assertFiniteSnapshot(message);
            peer.finiteSnapshots += 1;
            maybeSendProbe();
            maybePass();
            return;
          }

          if (message.type === "f5_batch_ack") {
            peer.latestBoundaryTick = Math.max(peer.latestBoundaryTick, message.boundaryTick ?? 0);
            for (const record of message.records || []) {
              if (record.status === "accepted") peer.acceptedRecords += 1;
              else if (record.status !== "duplicate_same") throw new Error(`unexpected F5 record status ${record.status} at ${record.targetTick}`);
            }
            maybeSendProbe();
            maybePass();
            return;
          }

          if (message.type === "f5_peer_records") {
            peer.relayedRecords += (message.records || []).length;
            peer.latestBoundaryTick = Math.max(peer.latestBoundaryTick, message.relayBoundaryTick ?? 0);
            maybeSendProbe();
            maybePass();
            return;
          }

          if (message.type === "f5_consumed") {
            peer.latestBoundaryTick = Math.max(peer.latestBoundaryTick, message.boundaryTick ?? 0);
            const self = (message.players || []).find((player) => player.sessionId === peer.welcome?.selfSessionId);
            const remote = (message.players || []).find((player) => player.sessionId !== peer.welcome?.selfSessionId);
            if (self?.fresh) peer.consumedFreshSelf += 1;
            if (remote?.fresh) peer.consumedFreshRemote += 1;
            maybeSendProbe();
            maybePass();
          }
        } catch (error) {
          fail(error);
        }
      });
    }
  });
}

await assertProductionIsolation("before F5 staging smoke");
await waitForExpectedStaging();
const wsResult = await runTwoPeerSmoke();
await assertProductionIsolation("after F5 staging smoke");

console.log(`F5 STAGING CLOUD SMOKE PASS · ${JSON.stringify(wsResult)}`);
