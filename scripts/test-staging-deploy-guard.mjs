import { spawnSync } from "node:child_process";

const guard = new URL("./guard-staging-deploy.mjs", import.meta.url);
const baseEnv = { ...process.env };
delete baseEnv.WORKERS_CI;
delete baseEnv.WRANGLER_CI_OVERRIDE_NAME;

const cases = [
  { name: "local-no-override", env: {}, expectSuccess: true },
  {
    name: "staging-workers-build",
    env: { WORKERS_CI: "1", WRANGLER_CI_OVERRIDE_NAME: "cloudflare-multiplayer-lab-staging" },
    expectSuccess: true,
  },
  {
    name: "root-workers-build",
    env: { WORKERS_CI: "1", WRANGLER_CI_OVERRIDE_NAME: "cloudflare-multiplayer-lab" },
    expectSuccess: false,
  },
  { name: "workers-build-missing-override", env: { WORKERS_CI: "1" }, expectSuccess: false },
];

for (const testCase of cases) {
  const result = spawnSync(process.execPath, [guard.pathname], {
    env: { ...baseEnv, ...testCase.env },
    encoding: "utf8",
  });
  const success = result.status === 0;
  if (success !== testCase.expectSuccess) {
    throw new Error(
      `${testCase.name}: expected success=${testCase.expectSuccess}, got status=${result.status}\n` +
      `${result.stdout || ""}${result.stderr || ""}`,
    );
  }
}

console.log("A2R staging deploy guard smoke PASS · local/staging allowed · root/missing override rejected");
