import { spawnSync } from "node:child_process";

const ROOT_WORKER = "cloudflare-multiplayer-lab";
const STAGING_WORKER = "cloudflare-multiplayer-lab-staging";
const PRODUCTION_BRANCH = "main";
const A2R_BRANCH = "world-slice-0-a2r-timeline-rebuild";

function buildPlan(env) {
  if (env.WORKERS_CI !== "1") {
    throw new Error("preview deploy router may only run inside Cloudflare Workers Builds");
  }

  const branch = env.WORKERS_CI_BRANCH?.trim();
  const overrideName = env.WRANGLER_CI_OVERRIDE_NAME?.trim();
  if (!branch) throw new Error("WORKERS_CI_BRANCH is missing");
  if (!overrideName) throw new Error("WRANGLER_CI_OVERRIDE_NAME is missing");
  if (branch === PRODUCTION_BRANCH) {
    throw new Error("preview deploy router refuses the production branch");
  }
  if (overrideName !== ROOT_WORKER) {
    throw new Error(`preview deploy router expected root-connected Worker ${ROOT_WORKER}, got ${overrideName}`);
  }

  if (branch === A2R_BRANCH) {
    return {
      branch,
      target: "staging-deploy",
      workerOverride: STAGING_WORKER,
      command: "npm",
      args: ["run", "deploy:staging"],
    };
  }

  return {
    branch,
    target: "root-version-upload",
    workerOverride: ROOT_WORKER,
    command: "npx",
    args: ["wrangler", "versions", "upload"],
  };
}

let plan;
try {
  plan = buildPlan(process.env);
} catch (error) {
  console.error(`A2R preview deploy router REFUSED · ${error instanceof Error ? error.message : String(error)}`);
  process.exit(2);
}

console.log(`A2R preview deploy route · ${JSON.stringify(plan)}`);
if (process.argv.includes("--plan")) process.exit(0);

const result = spawnSync(plan.command, plan.args, {
  stdio: "inherit",
  env: {
    ...process.env,
    WRANGLER_CI_OVERRIDE_NAME: plan.workerOverride,
  },
});

if (result.error) {
  console.error(`A2R preview deploy router failed to start command: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
