#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

bash scripts/build-foundation-recovery-box3d.sh
python scripts/patch-foundation-recovery-deterministic-driver.py \
  scripts/fixtures/multiplayer-foundation-authority-constructor-worker.mjs

node --input-type=module <<'NODE'
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const trigger = JSON.parse(readFileSync("foundation-recovery-remote-trigger.json", "utf8"));
if (trigger.revision !== "multiplayer-foundation-remote-recovery-trigger-v2") {
  throw new Error("remote recovery trigger revision mismatch");
}
if (!["idle", "seed", "resume", "hibernate"].includes(trigger.phase)) {
  throw new Error(`invalid remote recovery phase ${trigger.phase}`);
}
if (typeof trigger.campaignId !== "string" || !/^[a-z0-9][a-z0-9-]{0,39}$/.test(trigger.campaignId)) {
  throw new Error("invalid remote recovery campaignId");
}
if (trigger.phase === "idle") {
  if (trigger.campaignId !== "unarmed" || trigger.expectedPreviousInstanceNonce !== null) {
    throw new Error("idle remote recovery trigger must remain unarmed");
  }
} else if (trigger.phase === "seed" || trigger.phase === "hibernate") {
  if (trigger.campaignId === "unarmed" || trigger.expectedPreviousInstanceNonce !== null) {
    throw new Error(`${trigger.phase} remote recovery trigger fields are invalid`);
  }
} else if (
  trigger.campaignId === "unarmed"
  || typeof trigger.expectedPreviousInstanceNonce !== "string"
  || trigger.expectedPreviousInstanceNonce.length < 8
) {
  throw new Error("resume remote recovery trigger requires the seeded instance nonce");
}

const buildId = process.env.WORKERS_CI_COMMIT_SHA
  || process.env.GITHUB_SHA
  || execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
if (!/^[0-9a-f]{40}$/.test(buildId)) throw new Error(`invalid build commit ${buildId}`);

const generated = [
  `export const FOUNDATION_RECOVERY_REMOTE_BUILD_ID = ${JSON.stringify(buildId)};`,
  `export const FOUNDATION_RECOVERY_REMOTE_TRIGGER = ${JSON.stringify(trigger)};`,
  "",
].join("\n");
writeFileSync("scripts/fixtures/foundation-recovery-remote-build.generated.mjs", generated);
console.log("FOUNDATION_RECOVERY_REMOTE_BUILD_METADATA_PASS", JSON.stringify({ buildId, ...trigger }));
NODE
