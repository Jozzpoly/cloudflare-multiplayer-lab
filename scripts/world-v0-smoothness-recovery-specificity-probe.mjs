import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { WORLD_V0_CLIENT_HISTORY, WORLD_V0_TIMING } from "../src/world-v0-contract.ts";

const OUTPUT = process.env.MW_WORLD_V0_RECOVERY_SPECIFICITY_OUTPUT ?? "world-v0-smoothness-recovery-specificity.json";
const source = readFileSync("public/world-v0/app.js", "utf8");
const margin = 4;
const safeBlindTicks = WORLD_V0_CLIENT_HISTORY.retainTicks - margin;

assert.equal(WORLD_V0_TIMING.simulationHz, 60);
assert.equal(WORLD_V0_CLIENT_HISTORY.retainTicks, 24);
assert.equal(safeBlindTicks, 20);
assert(source.includes('beginActorResume("authority_silence_history_guard", { silenceTicks, safeBlindTicks });'), "authority-silence resume trigger source marker missing");
assert(source.includes('try { staleSocket?.close(4000, "actor_resume_superseded"); }'), "resume no longer retires current socket as expected by probe");
assert(source.includes('if (actorResume.pending || runtimeFailed || roomRecovery.pending || !localState || !identity || !resumeToken) return false;'), "beginActorResume entry guard drifted");

function currentGuard({ localBoundary, lastAuthorityBoundary, socketOpen }) {
  // socketOpen is intentionally unused because the current guard does not consult
  // transport-open state before escalating history safety into ActorSession resume.
  void socketOpen;
  const silenceTicks = Math.max(0, localBoundary - lastAuthorityBoundary);
  return { silenceTicks, triggersActorResume: silenceTicks >= safeBlindTicks };
}

const samplesMs = [100, 200, 300, 333.34, 350, 400, 500, 600].map((gapMs) => {
  const progressedTicks = Math.floor((gapMs / 1000) * WORLD_V0_TIMING.simulationHz);
  const result = currentGuard({ localBoundary: 100 + progressedTicks, lastAuthorityBoundary: 100, socketOpen: true });
  return { gapMs, progressedTicks, socketOpen: true, ...result };
});

const firstTrigger = samplesMs.find((sample) => sample.triggersActorResume) || null;
const exactThresholdMs = safeBlindTicks * (1000 / WORLD_V0_TIMING.simulationHz);
const atThreshold = currentGuard({ localBoundary: 120, lastAuthorityBoundary: 100, socketOpen: true });
const belowThreshold = currentGuard({ localBoundary: 119, lastAuthorityBoundary: 100, socketOpen: true });

assert.equal(belowThreshold.triggersActorResume, false);
assert.equal(atThreshold.triggersActorResume, true, "open healthy socket did not reproduce current history-guard escalation semantics");

const result = {
  revision: "world-v0-smoothness-recovery-specificity-v1",
  contract: {
    simulationHz: WORLD_V0_TIMING.simulationHz,
    retainTicks: WORLD_V0_CLIENT_HISTORY.retainTicks,
    marginTicks: margin,
    safeBlindTicks,
    exactThresholdMs,
  },
  samples: samplesMs,
  firstSampleTrigger: firstTrigger,
  demonstrated: {
    healthySocketStateParticipatesInDecision: false,
    historySafetyCanEscalateToActorResumeWhileSocketOpen: true,
    actorResumeRetiresCurrentSocket: true,
  },
  verdict: "RECOVERY_SPECIFICITY_GAP_PROVEN",
  nonClaim: "This is a semantic/source-level falsifier. It proves the current detector can classify history-window pressure as ActorSession recovery without requiring transport closure. It does not estimate the production probability of a 20-tick authority-observation gap.",
};
writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
console.log(result.verdict);
