import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";

const BASE = (process.env.MW_FOUNDATION_RECOVERY_REMOTE_BASE
  || "https://cloudflare-multiplayer-lab-foundation-recovery.jozzpoly.workers.dev").replace(/\/$/, "");
const EXPECTED_BUILD = process.env.MW_FOUNDATION_RECOVERY_EXPECTED_BUILD || process.env.GITHUB_SHA;
const OUTPUT_PATH = process.env.MW_FOUNDATION_RECOVERY_OUTPUT || "foundation-recovery-remote-idle-evidence.json";
const DEPLOY_WAIT_MS = Math.max(30_000, Number(process.env.MW_FOUNDATION_RECOVERY_DEPLOY_WAIT_MS || 10 * 60_000));
const REQUEST_TIMEOUT_MS = 20_000;

assert(EXPECTED_BUILD && /^[0-9a-f]{40}$/.test(EXPECTED_BUILD), "expected deployed commit SHA required");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const deadline = Date.now() + DEPLOY_WAIT_MS;
let last = null;

while (Date.now() < deadline) {
  try {
    const response = await fetch(`${BASE}/build`, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    const body = await response.json();
    last = body;
    if (
      response.ok
      && body.buildId === EXPECTED_BUILD
      && body.phase === "idle"
      && body.campaignId === "unarmed"
    ) {
      const evidence = {
        revision: "multiplayer-foundation-remote-idle-deployment-evidence-v1",
        buildId: EXPECTED_BUILD,
        base: BASE,
        deployed: body,
      };
      writeFileSync(OUTPUT_PATH, `${JSON.stringify(evidence, null, 2)}\n`);
      console.log(`MULTIPLAYER FOUNDATION REMOTE RECOVERY IDLE PASS · build=${EXPECTED_BUILD}`);
      process.exit(0);
    }
  } catch (error) {
    last = { error: error instanceof Error ? error.message : String(error) };
  }
  await sleep(2000);
}

throw new Error(`remote idle deployment did not reach exact expected build; last=${JSON.stringify(last)}`);
