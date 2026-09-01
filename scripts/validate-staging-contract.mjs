import { readFile } from "node:fs/promises";

function assert(condition, message) {
  if (!condition) throw new Error(`staging contract failed: ${message}`);
}

function bindingMap(bindings = []) {
  return new Map(bindings.map((binding) => [binding.name, binding.class_name]));
}

const [wranglerText, packageText] = await Promise.all([
  readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8"),
  readFile(new URL("../package.json", import.meta.url), "utf8"),
]);

const wrangler = JSON.parse(wranglerText.replace(/^\uFEFF/, ""));
const pkg = JSON.parse(packageText.replace(/^\uFEFF/, ""));
const staging = wrangler.env?.staging;

assert(wrangler.name === "cloudflare-multiplayer-lab", "unexpected root Worker name");
assert(staging, "missing env.staging");
assert(staging.name === "cloudflare-multiplayer-lab-staging", "unexpected staging Worker name");
assert(staging.name !== wrangler.name, "staging Worker aliases production/root Worker");
assert(staging.workers_dev === true, "staging must remain workers.dev-addressable");
assert(!staging.route && !staging.routes, "staging must not claim production/custom routes");

const rootBindings = bindingMap(wrangler.durable_objects?.bindings);
const stagingBindings = bindingMap(staging.durable_objects?.bindings);
assert(rootBindings.size > 0, "root Durable Object bindings missing");
assert(stagingBindings.size === rootBindings.size, "staging Durable Object binding count drifted");
for (const [name, className] of rootBindings) {
  assert(stagingBindings.get(name) === className, `staging Durable Object binding drifted: ${name}`);
}

const rootWorkerFirst = new Set(wrangler.assets?.run_worker_first || []);
const stagingWorkerFirst = new Set(staging.assets?.run_worker_first || []);
for (const route of ["/api/*", "/game/*", "/world0/ws"]) {
  assert(rootWorkerFirst.has(route), `root run_worker_first missing ${route}`);
  assert(stagingWorkerFirst.has(route), `staging run_worker_first missing ${route}`);
}

const scripts = pkg.scripts || {};
assert(scripts.deploy === "npm run deploy:staging", "generic npm deploy must route to staging");
assert(scripts["deploy:preview"] === "node scripts/workers-preview-deploy.mjs", "deploy:preview router missing or drifted");
assert(
  scripts["deploy:staging"] === "node scripts/guard-staging-deploy.mjs && wrangler deploy --env staging",
  "deploy:staging must guard Workers Builds name override before Wrangler",
);
assert(scripts["deploy:production"] === "wrangler deploy", "production deploy must remain explicit and separate");
assert(scripts["test:staging-deploy-guard"] === "node scripts/test-staging-deploy-guard.mjs", "staging deploy guard smoke missing");
assert(scripts["test:preview-deploy-router"] === "node scripts/test-workers-preview-deploy.mjs", "preview deploy router smoke missing");
assert(String(scripts.dev || "").includes("--env staging"), "dev must remain staging-scoped");
assert(String(scripts["generate:types"] || "").includes("--env staging"), "type generation must remain staging-scoped");
assert(String(scripts["validate:worker"] || "").includes("--env staging"), "worker dry-run must remain staging-scoped");
assert(String(scripts.check || "").includes("test:staging-deploy-guard"), "main check must exercise staging deploy guard");
assert(String(scripts.check || "").includes("test:preview-deploy-router"), "main check must exercise preview deploy router");

console.log(
  `A2R staging contract PASS · root ${wrangler.name} · staging ${staging.name} · ${stagingBindings.size} DO bindings · guarded preview/staging routing`,
);
