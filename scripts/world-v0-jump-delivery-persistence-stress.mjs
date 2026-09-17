import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const iterations = Number.parseInt(process.env.MW_WORLD_V0_PERSISTENCE_STRESS_ITERATIONS || "12", 10);
const minQualified = Number.parseInt(
  process.env.MW_WORLD_V0_PERSISTENCE_STRESS_MIN_QUALIFIED || String(Math.min(6, iterations)),
  10,
);
const variant = process.env.MW_WORLD_V0_PERSISTENCE_STRESS_VARIANT || "unknown";
const output = process.env.MW_WORLD_V0_PERSISTENCE_STRESS_OUTPUT || `persistence-stress-${variant}.json`;
const audit = new URL("./world-v0-jump-delivery-persistence-audit.mjs", import.meta.url).pathname;

if (!Number.isInteger(iterations) || iterations < 1 || iterations > 40) throw new Error(`invalid iterations ${iterations}`);
if (!Number.isInteger(minQualified) || minQualified < 1 || minQualified > iterations) {
  throw new Error(`invalid minimum qualified specimens ${minQualified}/${iterations}`);
}

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

  const pass = evidence?.verdict === "WORLD_V0_JUMP_DELIVERY_PERSISTENCE_PASS" && run.status === 0;
  const preconditionMiss = evidence?.verdict === "WORLD_V0_JUMP_DELIVERY_PERSISTENCE_PRECONDITION_MISS" && run.status === 0;
  const semanticDelayedLanding = Boolean(
    !preconditionMiss && evidence && (
      /delayed landing impulse/i.test(evidence.error || "") ||
      (Number.isInteger(evidence.appliedCountBefore) && Number.isInteger(evidence.appliedCountFinal) &&
        evidence.appliedCountFinal !== evidence.appliedCountBefore + 1)
    )
  );
  const infrastructureFailure = !pass && !preconditionMiss && !semanticDelayedLanding;
  const row = {
    index,
    durationMs: Date.now() - startedAt,
    exitStatus: run.status,
    signal: run.signal,
    pass,
    preconditionMiss,
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
    transportRevision: evidence?.proxy?.after?.transportRevision ?? evidence?.proxy?.transportRevision ?? null,
  };
  results.push(row);
  console.log("PERSISTENCE_STRESS_ITERATION", JSON.stringify(row));
  await sleep(400);
}

const passes = results.filter((x) => x.pass).length;
const preconditionMisses = results.filter((x) => x.preconditionMiss).length;
const semanticDelayedLandingFailures = results.filter((x) => x.semanticDelayedLanding).length;
const infrastructureFailures = results.filter((x) => x.infrastructureFailure).length;
const summary = {
  revision: "world-v0-jump-delivery-persistence-stress-v2-qualified-airborne",
  generatedAt: new Date().toISOString(),
  variant,
  iterations,
  minQualified,
  passes,
  preconditionMisses,
  semanticDelayedLandingFailures,
  infrastructureFailures,
  campaignVerdict: infrastructureFailures > 0
    ? "WORLD_V0_PERSISTENCE_STRESS_INVALID_INFRA_FAILURE"
    : semanticDelayedLandingFailures > 0
      ? "WORLD_V0_PERSISTENCE_STRESS_DELAYED_LANDING_REPRODUCED"
      : passes < minQualified
        ? "WORLD_V0_PERSISTENCE_STRESS_INSUFFICIENT_AIRBORNE_SPECIMENS"
        : "WORLD_V0_PERSISTENCE_STRESS_QUALIFIED_NO_DELAYED_LANDING",
  results,
};
writeFileSync(output, JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
console.log(summary.campaignVerdict);
if (infrastructureFailures > 0 || semanticDelayedLandingFailures > 0 || passes < minQualified) process.exitCode = 2;
