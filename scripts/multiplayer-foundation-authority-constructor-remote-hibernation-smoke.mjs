import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const trigger = JSON.parse(readFileSync("foundation-recovery-remote-trigger.json", "utf8"));
const BASE = (process.env.MW_FOUNDATION_RECOVERY_REMOTE_BASE
  || "https://cloudflare-multiplayer-lab-foundation-recovery.jozzpoly.workers.dev").replace(/\/$/, "");
const EXPECTED_BUILD = process.env.MW_FOUNDATION_RECOVERY_EXPECTED_BUILD || process.env.GITHUB_SHA;
const ENVELOPE_PATH = process.env.MW_FOUNDATION_RECOVERY_ENVELOPE || null;
const OUTPUT_PATH = process.env.MW_FOUNDATION_RECOVERY_OUTPUT || "foundation-recovery-remote-hibernation-evidence.json";
const DEPLOY_WAIT_MS = Math.max(30_000, Number(process.env.MW_FOUNDATION_RECOVERY_DEPLOY_WAIT_MS || 10 * 60_000));
const QUIET_MS = Math.max(30_000, Number(process.env.MW_FOUNDATION_RECOVERY_HIBERNATION_QUIET_MS || 30_000));
const REQUEST_TIMEOUT_MS = 20_000;
const REQUIRED_CYCLES = 2;

assert.equal(trigger.revision, "multiplayer-foundation-remote-recovery-trigger-v2");
assert.equal(trigger.phase, "hibernate");
assert.match(trigger.campaignId, /^[a-z0-9][a-z0-9-]{0,39}$/);
assert.notEqual(trigger.campaignId, "unarmed");
assert.equal(trigger.expectedPreviousInstanceNonce, null);
assert(EXPECTED_BUILD && /^[0-9a-f]{40}$/.test(EXPECTED_BUILD), "expected deployed commit SHA required");
assert(ENVELOPE_PATH, "hibernate phase requires MW_FOUNDATION_RECOVERY_ENVELOPE");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const campaignQuery = `campaign=${encodeURIComponent(trigger.campaignId)}`;

async function fetchJson(path, init = undefined) {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  let body;
  try {
    body = await response.json();
  } catch (error) {
    throw new Error(`non-JSON response ${response.status} from ${path}`, { cause: error });
  }
  return { response, body };
}

async function exactBuild() {
  const result = await fetchJson("/build");
  assert.equal(result.response.status, 200, JSON.stringify(result.body));
  assert.equal(result.body.buildId, EXPECTED_BUILD, JSON.stringify(result.body));
  assert.equal(result.body.triggerRevision, trigger.revision, JSON.stringify(result.body));
  assert.equal(result.body.phase, "hibernate", JSON.stringify(result.body));
  assert.equal(result.body.campaignId, trigger.campaignId, JSON.stringify(result.body));
  return result.body;
}

async function waitForExactDeployment() {
  const deadline = Date.now() + DEPLOY_WAIT_MS;
  let last = null;
  while (Date.now() < deadline) {
    try {
      const result = await fetchJson("/build");
      last = result.body;
      if (
        result.response.ok
        && result.body.buildId === EXPECTED_BUILD
        && result.body.triggerRevision === trigger.revision
        && result.body.phase === "hibernate"
        && result.body.campaignId === trigger.campaignId
      ) return result.body;
    } catch (error) {
      last = { error: error instanceof Error ? error.message : String(error) };
    }
    await sleep(2000);
  }
  throw new Error(`remote deployment did not reach exact hibernation build; last=${JSON.stringify(last)}`);
}

async function health() {
  const result = await fetchJson(`/health?${campaignQuery}`);
  assert.equal(result.response.status, 200, JSON.stringify(result.body));
  return result.body;
}

async function resumeExact() {
  const result = await fetchJson(`/resume?${campaignQuery}`, { method: "POST" });
  assert.equal(result.response.status, 200, JSON.stringify(result.body));
  assert.equal(result.body.restoredBoundary.generation, 1);
  assert.equal(result.body.restoredBoundary.canonicalTick, 260);
  assert.equal(result.body.resumedThrough, 329);
  assert.equal(result.body.exactFrameCount, 69);
  assert(result.body.finalActorIds.includes("actor:7"));
  assert(!result.body.finalActorIds.includes("actor:4"));
  return result.body;
}

const deployed = await waitForExactDeployment();
const envelopeBytes = readFileSync(ENVELOPE_PATH);
const envelope = JSON.parse(envelopeBytes.toString("utf8"));
const envelopeSha256 = createHash("sha256").update(envelopeBytes).digest("hex");
assert.equal(envelope.revision, "multiplayer-foundation-authority-byte-envelope-probe-v1");
assert.equal(envelope.canonicalTick, 260);
assert.equal(envelope.physics.byteLength, 41829);

const before = await health();
assert.equal(before.restoreState, "empty", JSON.stringify(before));
assert.equal(before.restoredBoundary, null);
assert.equal(before.resumed, false);

const publishedResult = await fetchJson(`/publish-envelope?${campaignQuery}`, {
  method: "POST",
  headers: { "content-type": "application/octet-stream" },
  body: envelopeBytes,
});
assert.equal(publishedResult.response.status, 200, JSON.stringify(publishedResult.body));
const published = publishedResult.body;
assert.equal(published.instanceNonce, before.instanceNonce);
assert.equal(published.head.generation, 1);
assert.equal(published.head.canonicalTick, 260);
assert.equal(published.payloadByteLength, envelopeBytes.byteLength);
assert.equal(published.payloadSha256, envelopeSha256);
assert(published.chunkCount > 1);

const afterPublish = await health();
assert.equal(afterPublish.instanceNonce, before.instanceNonce);
assert.equal(afterPublish.restoreState, "empty", "publication must not masquerade as constructor restore");
assert.equal(afterPublish.restoredBoundary, null);
assert.equal(afterPublish.resumed, false);

const cycles = [];
let previousNonce = afterPublish.instanceNonce;

for (let cycle = 1; cycle <= REQUIRED_CYCLES; cycle += 1) {
  const quietStartedAt = Date.now();
  console.log(`REMOTE_HIBERNATION_QUIET_START cycle=${cycle} quietMs=${QUIET_MS} previousNonce=${previousNonce}`);
  await sleep(QUIET_MS);
  const quietElapsedMs = Date.now() - quietStartedAt;

  // /build is served by the outer Worker and does not obtain or invoke the Durable Object stub.
  // It therefore proves code identity after the quiet window without touching the tested object.
  const buildAfterQuiet = await exactBuild();

  const restored = await health();
  assert.equal(restored.restoreState, "restored", JSON.stringify(restored));
  assert.equal(restored.restoreError, null);
  assert.notEqual(restored.instanceNonce, previousNonce, `cycle ${cycle} did not reconstruct a fresh Durable Object instance`);
  assert(restored.restoredBoundary);
  assert.equal(restored.restoredBoundary.generation, 1);
  assert.equal(restored.restoredBoundary.canonicalTick, 260);
  assert.equal(restored.restoredBoundary.payloadSha256, envelopeSha256);
  assert.equal(restored.restoredBoundary.physicsByteLength, 41829);
  assert.equal(restored.restoredBoundary.expectedFrameCount, 69);
  assert.equal(restored.resumed, false);

  const resumed = await resumeExact();
  assert.equal(resumed.instanceNonce, restored.instanceNonce);

  const afterResume = await health();
  assert.equal(afterResume.instanceNonce, restored.instanceNonce);
  assert.equal(afterResume.restoreState, "restored");
  assert.equal(afterResume.resumed, true);

  cycles.push({
    cycle,
    quietElapsedMs,
    previousInstanceNonce: previousNonce,
    restoredInstanceNonce: restored.instanceNonce,
    buildAfterQuiet,
    restoredBoundary: restored.restoredBoundary,
    exactFrameCount: resumed.exactFrameCount,
    resumedThrough: resumed.resumedThrough,
    finalActorIds: resumed.finalActorIds,
  });
  previousNonce = afterResume.instanceNonce;
}

assert.equal(new Set([before.instanceNonce, ...cycles.map((cycle) => cycle.restoredInstanceNonce)]).size, REQUIRED_CYCLES + 1);

const evidence = {
  revision: "multiplayer-foundation-remote-hibernation-recovery-evidence-v1",
  campaignId: trigger.campaignId,
  buildId: EXPECTED_BUILD,
  base: BASE,
  deployed,
  quietMsMinimum: QUIET_MS,
  requiredCycles: REQUIRED_CYCLES,
  seedInstanceNonce: before.instanceNonce,
  envelopeBytes: envelopeBytes.byteLength,
  envelopeSha256,
  physicsBytes: envelope.physics.byteLength,
  chunkCount: published.chunkCount,
  cycles,
};
writeFileSync(OUTPUT_PATH, `${JSON.stringify(evidence, null, 2)}\n`);
console.log(
  `MULTIPLAYER FOUNDATION REMOTE HIBERNATION RECOVERY PASS · campaign=${trigger.campaignId} · build=${EXPECTED_BUILD} · cycles=${REQUIRED_CYCLES} · quietMs>=${QUIET_MS} · sameBuild=true · restoredBeforeResume=true · exactThrough=329`,
);
