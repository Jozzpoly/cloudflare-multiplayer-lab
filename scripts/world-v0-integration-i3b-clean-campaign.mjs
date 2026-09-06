import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const base = process.env.MW_WORLD_V0_I3_BASE || "http://127.0.0.1:8797";
const freezeMs = Number(process.env.MW_WORLD_V0_I3_FREEZE_MS || 1200);
const requiredClean = Number(process.env.MW_WORLD_V0_I3B_CLEAN_REQUIRED || 4);
const maxAttempts = Number(process.env.MW_WORLD_V0_I3B_MAX_ATTEMPTS || 12);
const prefix = process.env.MW_WORLD_V0_I3B_PREFIX || "world-v0-i3b-i3";
if (!Number.isInteger(requiredClean) || requiredClean < 1 || requiredClean > 8) throw new Error(`invalid I3b clean requirement ${requiredClean}`);
if (!Number.isInteger(maxAttempts) || maxAttempts < requiredClean || maxAttempts > 20) throw new Error(`invalid I3b max attempts ${maxAttempts}`);

const RECOVERY_TYPES = new Set([
  "actor-resume-pending",
  "actor-resume-attempt",
  "authority-rebase",
  "actor-resume-complete",
]);
const RECOVERY_COMPATIBLE_FAILURE = /candidate-authored freeze input was late|candidate hit input lease during isolated rAF freeze|candidate freeze ACK coverage mismatch/i;

function recoveryEvents(payload) {
  const events = [];
  for (const client of payload?.clients || []) {
    for (const event of client?.evidence?.lifecycleEvents || []) {
      if (RECOVERY_TYPES.has(event?.type)) events.push({ client: client.index, ...event });
    }
  }
  return events;
}

let clean = 0;
let invalid = 0;
const attempts = [];

for (let attempt = 1; attempt <= maxAttempts && clean < requiredClean; attempt += 1) {
  const output = `${prefix}-attempt-${attempt}.json`;
  const log = `${prefix}-attempt-${attempt}.log`;
  console.log(`WORLD_V0_I3B_CLEAN_ATTEMPT_BEGIN ${attempt}`);
  const child = spawnSync(
    process.execPath,
    ["scripts/world-v0-integration-i3-chromium-raf-audit.mjs"],
    {
      env: {
        ...process.env,
        MW_WORLD_V0_I3_MODE: "candidate",
        MW_WORLD_V0_I3_BASE: base,
        MW_WORLD_V0_I3_FREEZE_MS: String(freezeMs),
        MW_WORLD_V0_CHROMIUM_OUTPUT: output,
      },
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    },
  );
  const combined = `${child.stdout || ""}${child.stderr || ""}`;
  process.stdout.write(child.stdout || "");
  process.stderr.write(child.stderr || "");
  writeFileSync(log, combined);

  let payload = null;
  try { payload = JSON.parse(readFileSync(output, "utf8")); } catch { /* classified below */ }
  const recovery = recoveryEvents(payload);
  const errorText = `${payload?.error || ""}\n${combined}`;
  const exitCode = child.status ?? 1;

  if (recovery.length > 0) {
    if (exitCode !== 0 && !RECOVERY_COMPATIBLE_FAILURE.test(errorText)) {
      throw new Error(`I3b attempt ${attempt} failed for a non-recovery reason while recovery was also present; see ${log}`);
    }
    invalid += 1;
    attempts.push({ attempt, verdict: "CROSS_CONTRACT_INVALID", exitCode, recoveryEvents: recovery });
    console.log(`WORLD_V0_I3B_CROSS_CONTRACT_INVALID attempt=${attempt} recoveryEvents=${recovery.length}`);
    continue;
  }

  if (exitCode !== 0) {
    attempts.push({ attempt, verdict: "FAIL", exitCode, recoveryEvents: [] });
    throw new Error(`I3b clean attempt ${attempt} failed without actor recovery contamination; see ${log}`);
  }

  clean += 1;
  attempts.push({ attempt, verdict: "CLEAN_PASS", exitCode: 0, recoveryEvents: [] });
  console.log(`WORLD_V0_I3B_CLEAN_PASS attempt=${attempt} clean=${clean}/${requiredClean}`);
}

const summary = {
  revision: "world-v0-i3b-clean-campaign-v1",
  base,
  freezeMs,
  requiredClean,
  maxAttempts,
  clean,
  crossContractInvalid: invalid,
  attempts,
  verdict: clean >= requiredClean ? "WORLD_V0_I3B_CLEAN_CAMPAIGN_PASS" : "WORLD_V0_I3B_CLEAN_CAMPAIGN_INSUFFICIENT",
  nonClaim: "Recovery-contaminated runs are not counted as I3 evidence. They remain covered by separate I4b and resume-buffer gates; any failure without recovery contamination fails this campaign immediately.",
};
writeFileSync(`${prefix}-campaign-summary.json`, JSON.stringify(summary, null, 2));
console.log("WORLD_V0_I3B_CLEAN_CAMPAIGN", JSON.stringify(summary, null, 2));
if (clean < requiredClean) throw new Error(`I3b obtained only ${clean}/${requiredClean} clean runs in ${maxAttempts} attempts`);
console.log(summary.verdict);
