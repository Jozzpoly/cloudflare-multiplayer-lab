import { readFile } from "node:fs/promises";

const STAGING = "https://cloudflare-multiplayer-lab-staging.jozzpoly.workers.dev";
const PRODUCTION = "https://cloudflare-multiplayer-lab.jozzpoly.workers.dev";
const WS_URL = "wss://cloudflare-multiplayer-lab-staging.jozzpoly.workers.dev/world0/ws";
const POLL_TIMEOUT_MS = 120_000;
const SMOKE_TIMEOUT_MS = 14_000;
const INPUT_HEARTBEAT_MS = 66;
const PROP_DISPLACEMENT_PASS = 0.12;

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

function extractClientRevision(text) {
  return /CLIENT_REVISION\s*=\s*["'`]([^"'`]+)["'`]/.exec(text)?.[1] ?? null;
}

function horizontalDistance(a, b) {
  return Math.hypot(a[0] - b[0], a[2] - b[2]);
}

const localApp = await readFile(new URL("../public/world0-a2r/app.js", import.meta.url), "utf8");
const expectedRevision = extractClientRevision(localApp);
const expectedCanary = (await readFile(new URL("../public/a2r-containment-canary.txt", import.meta.url), "utf8")).trim();
assert(expectedRevision, "could not read local A2R client revision");

async function waitForExpectedStaging() {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < POLL_TIMEOUT_MS) {
    try {
      const [app, canary, ping] = await Promise.all([
        fetchText(`${STAGING}/world0-a2r/app.js`),
        fetchText(`${STAGING}/a2r-containment-canary.txt`),
        fetchText(`${STAGING}/api/ping`),
      ]);
      last = {
        appStatus: app.response.status,
        appRevision: extractClientRevision(app.text),
        canaryStatus: canary.response.status,
        canary: canary.text.trim(),
        pingStatus: ping.response.status,
      };
      if (
        app.response.ok &&
        last.appRevision === expectedRevision &&
        canary.response.ok &&
        last.canary === expectedCanary &&
        ping.response.ok
      ) {
        console.log(`A2R staging version ready · ${JSON.stringify(last)}`);
        return;
      }
    } catch (error) {
      last = { error: error instanceof Error ? error.message : String(error) };
    }
    await sleep(2000);
  }
  throw new Error(`staging did not reach expected branch version within ${POLL_TIMEOUT_MS} ms · last ${JSON.stringify(last)}`);
}

async function assertProductionIsolation(label) {
  const canary = await fetch(`${PRODUCTION}/a2r-containment-canary.txt`, {
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  assert(canary.status === 404, `${label}: production containment canary unexpectedly returned ${canary.status}`);
  console.log(`${label}: production canary 404`);
}

function decodeMessageData(data) {
  if (typeof data === "string") return Promise.resolve(data);
  if (data && typeof data.text === "function") return data.text();
  if (data instanceof ArrayBuffer) return Promise.resolve(new TextDecoder().decode(data));
  if (ArrayBuffer.isView(data)) return Promise.resolve(new TextDecoder().decode(data));
  return Promise.resolve(String(data));
}

async function runWebSocketContactSmoke() {
  assert(typeof WebSocket === "function", "Node runtime has no global WebSocket support");
  const playerId = `ci-stage-${Date.now()}`;
  const url = `${WS_URL}?player=${encodeURIComponent(playerId)}`;
  const ws = new WebSocket(url);

  let heartbeat = null;
  let timeout = null;
  let seq = 0;
  let selectedPropId = null;
  let selectedInitial = null;
  let drive = { x: 0, z: 0 };
  let snapshotCount = 0;
  let latestAck = 0;
  let maxSelectedPropDisplacement = 0;
  let maxWorldPropDisplacement = 0;
  let lastTelemetry = null;
  let zeroSent = false;

  const cleanup = () => {
    if (heartbeat) clearInterval(heartbeat);
    if (timeout) clearTimeout(timeout);
    try { ws.close(1000, "cloud_smoke_complete"); } catch { /* best effort */ }
  };

  return await new Promise((resolve, reject) => {
    const fail = (error) => {
      cleanup();
      reject(error instanceof Error ? error : new Error(String(error)));
    };

    timeout = setTimeout(() => {
      fail(new Error(
        `staging WS smoke timeout · snapshots ${snapshotCount} · ack ${latestAck}/${seq} · ` +
        `prop ${selectedPropId} displacement ${maxSelectedPropDisplacement.toFixed(3)} · telemetry ${JSON.stringify(lastTelemetry)}`,
      ));
    }, SMOKE_TIMEOUT_MS);

    const sendInput = (x, z) => {
      if (ws.readyState !== WebSocket.OPEN) return;
      seq += 1;
      ws.send(JSON.stringify({ type: "input", seq, x, z }));
    };

    ws.addEventListener("error", () => fail(new Error("staging WebSocket error")));
    ws.addEventListener("close", (event) => {
      if (!zeroSent) fail(new Error(`staging WebSocket closed early ${event.code} ${event.reason || ""}`));
    });

    ws.addEventListener("message", async (event) => {
      try {
        const raw = await decodeMessageData(event.data);
        const message = JSON.parse(raw);

        if (message.type === "welcome") {
          assert(message.revision === "ws0-a2-upright-v1", `unexpected WS0 revision ${message.revision}`);
          const self = message.state?.players?.find((player) => player.sessionId === message.selfSessionId);
          const props = message.state?.props || [];
          assert(self, "welcome missing self player");
          assert(props.length > 0, "welcome missing props");

          const nearest = props
            .map((prop) => ({ prop, distance: horizontalDistance(self.position, prop.position) }))
            .sort((a, b) => a.distance - b.distance)[0]?.prop;
          assert(nearest, "could not select nearest prop");
          selectedPropId = nearest.id;
          selectedInitial = [...nearest.position];
          const dx = nearest.position[0] - self.position[0];
          const dz = nearest.position[2] - self.position[2];
          const length = Math.hypot(dx, dz);
          assert(length > 0.1, "nearest prop direction degenerate");
          drive = { x: dx / length, z: dz / length };

          sendInput(drive.x, drive.z);
          heartbeat = setInterval(() => sendInput(drive.x, drive.z), INPUT_HEARTBEAT_MS);
          console.log(
            `A2R staging WS welcome · player ${playerId} · selected ${selectedPropId} · ` +
            `distance ${length.toFixed(3)} · drive ${drive.x.toFixed(3)},${drive.z.toFixed(3)}`,
          );
          return;
        }

        if (message.type !== "snapshot" || !selectedPropId || !selectedInitial) return;
        snapshotCount += 1;
        lastTelemetry = message.telemetry || lastTelemetry;
        const self = (message.players || []).find((player) => player.id === playerId);
        if (self && Number.isFinite(self.ack)) latestAck = Math.max(latestAck, self.ack);
        const selected = (message.props || []).find((prop) => prop.id === selectedPropId);
        if (selected) {
          maxSelectedPropDisplacement = Math.max(
            maxSelectedPropDisplacement,
            horizontalDistance(selected.position, selectedInitial),
          );
        }
        if (Number.isFinite(message.telemetry?.maxPropDisplacement)) {
          maxWorldPropDisplacement = Math.max(maxWorldPropDisplacement, message.telemetry.maxPropDisplacement);
        }

        const contactProven = maxSelectedPropDisplacement >= PROP_DISPLACEMENT_PASS;
        const ackProven = latestAck >= 5;
        const telemetryHealthy =
          message.telemetry?.finite === true &&
          (message.telemetry?.droppedTicks ?? Infinity) === 0 &&
          Number.isFinite(message.telemetry?.tickRatio) &&
          message.telemetry.tickRatio > 0.9;

        if (contactProven && ackProven && telemetryHealthy && snapshotCount >= 5) {
          if (heartbeat) clearInterval(heartbeat);
          heartbeat = null;
          sendInput(0, 0);
          zeroSent = true;
          setTimeout(() => {
            cleanup();
            resolve({
              playerId,
              selectedPropId,
              snapshots: snapshotCount,
              latestAck,
              sentSeq: seq,
              selectedPropDisplacement: maxSelectedPropDisplacement,
              worldMaxPropDisplacement: maxWorldPropDisplacement,
              telemetry: lastTelemetry,
            });
          }, 350);
        }
      } catch (error) {
        fail(error);
      }
    });
  });
}

await assertProductionIsolation("before staging smoke");
await waitForExpectedStaging();
const wsResult = await runWebSocketContactSmoke();
await assertProductionIsolation("after staging smoke");

console.log(`A2R STAGING CLOUD SMOKE PASS · ${JSON.stringify(wsResult)}`);
