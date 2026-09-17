import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const iterations = Number.parseInt(process.env.MW_WORLD_V0_PERSISTENCE_STRESS_ITERATIONS || "12", 10);
const variant = process.env.MW_WORLD_V0_PERSISTENCE_STRESS_VARIANT || "unknown";
const output = process.env.MW_WORLD_V0_PERSISTENCE_STRESS_OUTPUT || `persistence-stress-${variant}.json`;
const audit = new URL("./world-v0-jump-delivery-persistence-audit.mjs", import.meta.url).pathname;

if (!Number.isInteger(iterations) || iterations < 1 || iterations > 40) throw new Error(`invalid iterations ${iterations}`);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const results = [];

for (let index = 1; index <= iterations; index += 1) {
  const jsonPath = `persistence-stress-${variant}-${String(index).padStart(2, "0")}.json`;
  const logPath = `persistence-stress-${variant}-${String(index).padStart(2, "0")}.log`;
  const startedAt = Date.now();
  const run = spawnSync(process.execPath, [audit], {
    env: { ...process.env, MW_WORLD_V0_JUMP_DELIVERY_OUTPUT: jsonPath },
    encoding: "utf8",
    timeout: 180_000,
    maxBuffer: 16 * 1024 * 1024,
  });
  const combined = `${run.stdout || ""}${run.stderr || ""}`;
  writeFileSync(logPath, combined);

  let evidence = null;
  if (existsSync(jsonPath)) {
    try { evidence = JSON.parse(readFileSync(jsonPath, "utf8")); } catch {}
  }

  const semanticDelayedLanding = Boolean(
    evidence && (
      /delayed landing impulse/i.test(evidence.error || "") ||
      (Number.isInteger(evidence.appliedCountBefore) && Number.isInteger(evidence.appliedCountFinal) &&
        evidence.appliedCountFinal !== evidence.appliedCountBefore + 1)
    )
  );
  const pass = evidence?.verdict === "WORLD_V0_JUMP_DELIVERY_PERSISTENCE_PASS" && run.status === 0;
  const infrastructureFailure = !pass && !semanticDelayedLanding;
  const row = {
    index,
    durationMs: Date.now() - startedAt,
    exitStatus: run.status,
    signal: run.signal,
    pass,
    semanticDelayedLanding,
    infrastructureFailure,
    verdict: evidence?.verdict ?? null,
    error: evidence?.error ?? null,
    runKey: evidence?.runKey ?? null,
    actorSessionId: evidence?.actorSessionId ?? null,
    firstPress: evidence?.firstPress ?? null,
    airbornePress: evidence?.airbornePress ?? null,
    appliedCountBefore: evidence?.appliedCountBefore ?? null,
    appliedCountFinal: evidence?.appliedCountFinal ?? null,
    serverLateBefore: evidence?.serverLateBefore ?? null,
    serverLateAfter: evidence?.serverLateAfter ?? null,
    transportRevision: evidence?.proxy?.after?.transportRevision ?? null,
  };
  results.push(row);
  console.log("PERSISTENCE_STRESS_ITERATION", JSON.stringify(row));
  await sleep(400);
}

const summary = {
  revision: "world-v0-jump-delivery-persistence-stress-v1",
  generatedAt: new Date().toISOString(),
  variant,
  iterations,
  passes: results.filter((x) => x.pass).length,
  semanticDelayedLandingFailures: results.filter((x) => x.semanticDelayedLanding).length,
  infrastructureFailures: results.filter((x) => x.infrastructureFailure).length,
  campaignVerdict: results.some((x) => x.infrastructureFailure)
    ? "WORLD_V0_PERSISTENCE_STRESS_INVALID_INFRA_FAILURE"
    : results.some((x) => x.semanticDelayedLanding)
      ? "WORLD_V0_PERSISTENCE_STRESS_DELAYED_LANDING_REPRODUCED"
      : "WORLD_V0_PERSISTENCE_STRESS_NO_DELAYED_LANDING_OBSERVED",
  results,
};
writeFileSync(output, JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
console.log(summary.campaignVerdict);
if (summary.infrastructureFailures > 0) process.exitCode = 2;
