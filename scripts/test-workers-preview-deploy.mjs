import { spawnSync } from "node:child_process";

const script = new URL("./workers-preview-deploy.mjs", import.meta.url);
const baseEnv = { ...process.env };
delete baseEnv.WORKERS_CI;
delete baseEnv.WORKERS_CI_BRANCH;
delete baseEnv.WRANGLER_CI_OVERRIDE_NAME;

function run(extraEnv) {
  return spawnSync(process.execPath, [script.pathname, "--plan"], {
    env: { ...baseEnv, ...extraEnv },
    encoding: "utf8",
  });
}

function parsePlan(result) {
  const line = (result.stdout || "").trim().split("\n").find((entry) => entry.startsWith("A2R preview deploy route · "));
  if (!line) throw new Error(`missing route output\n${result.stdout || ""}${result.stderr || ""}`);
  return JSON.parse(line.slice("A2R preview deploy route · ".length));
}

for (const env of [
  { WORKERS_CI: "1", WORKERS_CI_BRANCH: "world-slice-0-a2r-timeline-rebuild" },
  { WORKERS_CI: "1", WORKERS_CI_BRANCH: "world-slice-0-a2r-timeline-rebuild", WRANGLER_CI_OVERRIDE_NAME: "cloudflare-multiplayer-lab" },
  { WORKERS_CI: "1", WORKERS_CI_BRANCH: "world-slice-0-a2r-timeline-rebuild", WRANGLER_CI_OVERRIDE_NAME: "unexpected-worker" },
]) {
  const result = run(env);
  if (result.status !== 0) throw new Error(`A2R route unexpectedly failed\n${result.stderr}`);
  const plan = parsePlan(result);
  if (plan.target !== "staging-deploy") throw new Error(`A2R target drifted: ${JSON.stringify(plan)}`);
  if (plan.workerOverride !== "cloudflare-multiplayer-lab-staging") throw new Error(`A2R worker override drifted: ${JSON.stringify(plan)}`);
  if (JSON.stringify(plan.args) !== JSON.stringify(["run", "deploy:staging"])) throw new Error(`A2R command drifted: ${JSON.stringify(plan)}`);
}

const other = run({ WORKERS_CI: "1", WORKERS_CI_BRANCH: "some-other-research-branch" });
if (other.status !== 0) throw new Error(`other preview route unexpectedly failed\n${other.stderr}`);
const otherPlan = parsePlan(other);
if (otherPlan.target !== "connected-worker-version-upload") throw new Error(`other branch target drifted: ${JSON.stringify(otherPlan)}`);
if (otherPlan.workerOverride !== null) throw new Error(`other branch must preserve the connected Worker override: ${JSON.stringify(otherPlan)}`);
if (JSON.stringify(otherPlan.args) !== JSON.stringify(["wrangler", "versions", "upload"])) throw new Error(`other branch command drifted: ${JSON.stringify(otherPlan)}`);

const refusalCases = [
  { name: "production branch", env: { WORKERS_CI: "1", WORKERS_CI_BRANCH: "main" } },
  { name: "missing Workers Builds marker", env: { WORKERS_CI_BRANCH: "world-slice-0-a2r-timeline-rebuild" } },
  { name: "missing branch", env: { WORKERS_CI: "1" } },
];
for (const testCase of refusalCases) {
  const result = run(testCase.env);
  if (result.status === 0) throw new Error(`${testCase.name}: router should have refused`);
}

console.log("A2R preview deploy router smoke PASS · guaranteed Workers CI inputs only · A2R→staging · other branches→connected Worker version upload · production refused");
