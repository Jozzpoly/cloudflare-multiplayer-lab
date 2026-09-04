import { readFileSync, writeFileSync } from "node:fs";

const path = process.argv[2] || process.env.MW_WORLD_V0_CAPACITY_CC11_OUTPUT || "world-v0-capacity-cc11-evidence.json";
const envelope = JSON.parse(readFileSync(path, "utf8"));
const evidence = envelope.evidence;
if (!evidence || !Array.isArray(evidence.cells)) throw new Error("CC1.1 evidence/cells missing");

for (const cell of evidence.cells) {
  const badRun = (cell.repeats || []).find((run) => run.classification !== "within-lab-envelope");
  if (badRun) {
    cell.determinismStatus = "not-evaluable-after-run-failure";
    cell.classification = badRun.classification;
    continue;
  }
  const hashes = (cell.repeats || []).map((run) => run.finalHash);
  if (hashes.length < 2 || hashes.some((hash) => hash == null)) {
    cell.determinismStatus = "not-evaluable";
    cell.classification = "apparatus:determinism-insufficient-repeats";
    continue;
  }
  const pass = hashes.every((hash) => hash === hashes[0]);
  cell.determinismStatus = pass ? "pass" : "fail";
  cell.deterministic = pass;
  cell.classification = pass ? "within-lab-envelope" : "determinism";
}

const boundaries = {};
for (const historyEnabled of evidence.options?.histories || [true]) {
  for (const scenario of evidence.options?.scenarios || []) {
    const key = `${scenario}:${historyEnabled ? "history" : "raw"}`;
    const ordered = evidence.cells
      .filter((cell) => cell.scenario === scenario && cell.history === historyEnabled)
      .sort((a, b) => a.count - b.count);
    const firstBroken = ordered.find((cell) => cell.classification !== "within-lab-envelope") ?? null;
    const goodBeforeBreak = firstBroken
      ? ordered.filter((cell) => cell.count < firstBroken.count && cell.classification === "within-lab-envelope")
      : ordered.filter((cell) => cell.classification === "within-lab-envelope");
    const lastKnownGood = goodBeforeBreak.length ? goodBeforeBreak[goodBeforeBreak.length - 1] : null;
    boundaries[key] = {
      lastKnownGood: lastKnownGood ? { count: lastKnownGood.count, classification: lastKnownGood.classification } : null,
      firstBroken: firstBroken ? { count: firstBroken.count, classification: firstBroken.classification } : null,
    };
  }
}

evidence.boundaries = boundaries;
evidence.normalization = {
  revision: "cc11-failure-precedence-v1",
  rule: "run failure precedes determinism; determinism is evaluated only across successful repeats",
};
writeFileSync(path, `${JSON.stringify(envelope, null, 2)}\n`);
console.log(`CC1.1 normalized · ${Object.entries(boundaries).map(([key, value]) => `${key}:${value.firstBroken?.classification || "open"}@${value.firstBroken?.count || "?"}`).join(" ")}`);
