import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const trigger = JSON.parse(readFileSync("foundation-recovery-remote-trigger.json", "utf8"));
const BASE = (process.env.MW_FOUNDATION_RECOVERY_REMOTE_BASE
  || "https://cloudflare-multiplayer-lab-foundation-recovery.jozzpoly.workers.dev").replace(/\/$/, "");
const EXPECTED_BUILD = process.env.MW_FOUNDATION_RECOVERY_EXPECTED_BUILD || process.env.GITHUB_SHA;
const ENVELOPE_PATH = process.env.MW_FOUNDATION_RECOVERY_ENVELOPE || null;
const OUTPUT_PATH = process.env.MW_FOUNDATION_RECOVERY_OUTPUT || "foundation-recovery-remote-evidence.json";
const DEPLOY_WAIT_MS = Math.max(30_000, Number(process.env.MW_FOUNDATION_RECOVERY_DEPLOY_WAIT_MS || 10 * 60_000));
const REQUEST_TIMEOUT_MS = 20_000;

assert.equal(trigger.revision, "multiplayer-foundation-remote-recovery-trigger-v1");
assert(["seed", "resume"].includes(trigger.phase), `remote smoke cannot run in phase ${trigger.phase}`);
assert.match(trigger.campaignId, /^[a-z0-9][a-z0-9-]{0,39}$/);
assert(EXPECTED_BUILD && /^[0-9a-f]{40}$/.test(EXPECTED_BUILD), "expected deployed commit SHA required");

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
        && result.body.phase === trigger.phase
        && result.body.campaignId === trigger.campaignId
      ) {
        return result.body;
      }
    } catch (error) {
      last = { error: error instanceof Error ? error.message : String(error) };
    }
    await sleep(2000);
  }
  throw new Error(`remote deployment did not reach exact expected build; last=${JSON.stringify(last)}`);
}

async function health() {
  const result = await fetchJson(`/health?${campaignQuery}`);
  assert.equal(result.response.status, 200, JSON.stringify(result.body));
  return result.body;
}

const deployed = await waitForExactDeployment();
const evidence = {
  revision: "multiplayer-foundation-remote-deployment-recovery-evidence-v1",
  phase: trigger.phase,
  campaignId: trigger.campaignId,
  buildId: EXPECTED_BUILD,
  base: BASE,
  deployed,
};

if (trigger.phase === "seed") {
  assert.equal(trigger.expectedPreviousInstanceNonce, null);
  assert(ENVELOPE_PATH, "seed phase requires MW_FOUNDATION_RECOVERY_ENVELOPE");
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

  const after = await health();
  assert.equal(after.instanceNonce, before.instanceNonce);
  assert.equal(after.restoreState, "empty", "publication must not masquerade as constructor restore");
  assert.equal(after.restoredBoundary, null);

  Object.assign(evidence, {
    instanceNonce: before.instanceNonce,
    envelopeBytes: envelopeBytes.byteLength,
    envelopeSha256,
    physicsBytes: envelope.physics.byteLength,
    chunkCount: published.chunkCount,
  });
  writeFileSync(OUTPUT_PATH, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(
    `MULTIPLAYER FOUNDATION REMOTE RECOVERY SEED PASS · campaign=${trigger.campaignId} · build=${EXPECTED_BUILD} · instanceNonce=${before.instanceNonce} · envelopeBytes=${envelopeBytes.byteLength} · physicsBytes=${envelope.physics.byteLength}`,
  );
} else {
  assert.equal(typeof trigger.expectedPreviousInstanceNonce, "string");
  assert(trigger.expectedPreviousInstanceNonce.length >= 8);

  const restored = await health();
  assert.equal(restored.restoreState, "restored", JSON.stringify(restored));
  assert.equal(restored.restoreError, null);
  assert.notEqual(
    restored.instanceNonce,
    trigger.expectedPreviousInstanceNonce,
    "deployment restart must reconstruct a fresh Durable Object instance",
  );
  assert(restored.restoredBoundary);
  assert.equal(restored.restoredBoundary.generation, 1);
  assert.equal(restored.restoredBoundary.canonicalTick, 260);
  assert.equal(restored.restoredBoundary.physicsByteLength, 41829);
  assert.equal(restored.resumed, false);

  const resumedResult = await fetchJson(`/resume?${campaignQuery}`, { method: "POST" });
  assert.equal(resumedResult.response.status, 200, JSON.stringify(resumedResult.body));
  const resumed = resumedResult.body;
  assert.equal(resumed.instanceNonce, restored.instanceNonce);
  assert.equal(resumed.restoredBoundary.generation, 1);
  assert.equal(resumed.restoredBoundary.canonicalTick, 260);
  assert.equal(resumed.resumedThrough, 329);
  assert(resumed.exactFrameCount > 0);
  assert(resumed.finalActorIds.includes("actor:7"));
  assert(!resumed.finalActorIds.includes("actor:4"));

  const after = await health();
  assert.equal(after.instanceNonce, restored.instanceNonce);
  assert.equal(after.restoreState, "restored");
  assert.equal(after.resumed, true);

  Object.assign(evidence, {
    previousInstanceNonce: trigger.expectedPreviousInstanceNonce,
    restoredInstanceNonce: restored.instanceNonce,
    restoredBoundary: restored.restoredBoundary,
    exactFrameCount: resumed.exactFrameCount,
    resumedThrough: resumed.resumedThrough,
    finalActorIds: resumed.finalActorIds,
  });
  writeFileSync(OUTPUT_PATH, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(
    `MULTIPLAYER FOUNDATION REMOTE DEPLOYMENT RESTART PASS · campaign=${trigger.campaignId} · build=${EXPECTED_BUILD} · constructorNonceChanged=true · restoredBeforeResume=true · exactThrough=329`,
  );
}
