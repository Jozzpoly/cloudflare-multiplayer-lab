const EXPECTED_STAGING_WORKER = "cloudflare-multiplayer-lab-staging";

const workersCI = process.env.WORKERS_CI === "1";
const overrideName = process.env.WRANGLER_CI_OVERRIDE_NAME?.trim() || null;

if (workersCI && overrideName !== EXPECTED_STAGING_WORKER) {
  const received = overrideName ?? "<missing>";
  throw new Error(
    `Refusing staging deploy: Workers Builds override targets ${received}, expected ${EXPECTED_STAGING_WORKER}. ` +
    "Connect the repository to the separate staging Worker before running deploy:staging from Workers Builds.",
  );
}

console.log(
  workersCI
    ? `A2R staging deploy guard PASS · Workers Builds target ${overrideName}`
    : "A2R staging deploy guard PASS · no Workers Builds name override",
);
