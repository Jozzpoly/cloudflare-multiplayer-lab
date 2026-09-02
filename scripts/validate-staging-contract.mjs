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
assert(rootBindings.size === 2, "root Durable Object binding count must remain frozen at 2");
assert(rootBindings.get("WORLD") === "World", "root WORLD binding drifted");
assert(rootBindings.get("WORLD_SLICE_0") === "WorldSlice0", "root WORLD_SLICE_0 binding drifted");
assert(!rootBindings.has("WORLD_SLICE_F5"), "F5 binding must not be added to root Worker during research");
for (const [name, className] of rootBindings) {
  assert(stagingBindings.get(name) === className, `staging inherited Durable Object binding drifted: ${name}`);
}
assert(stagingBindings.size === rootBindings.size + 1, "staging must add exactly one isolated F5 Durable Object binding");
assert(stagingBindings.get("WORLD_SLICE_F5") === "WorldSliceF5", "staging WORLD_SLICE_F5 binding missing or wrong");

const rootExports = wrangler.exports || {};
const stagingExports = staging.exports || {};
assert(!rootExports.WorldSliceF5, "F5 Durable Object export must not mutate root lifecycle");
assert(stagingExports.WorldSliceF5?.type === "durable-object", "staging F5 export missing");
assert(stagingExports.WorldSliceF5?.storage === "sqlite", "staging F5 Durable Object must use sqlite storage");

const rootWorkerFirst = new Set(wrangler.assets?.run_worker_first || []);
const stagingWorkerFirst = new Set(staging.assets?.run_worker_first || []);
for (const route of ["/api/*", "/game/*", "/world0/ws"]) {
  assert(rootWorkerFirst.has(route), `root run_worker_first missing ${route}`);
  assert(stagingWorkerFirst.has(route), `staging run_worker_first missing ${route}`);
}
assert(!rootWorkerFirst.has("/world0-f5/ws"), "F5 worker-first route must remain staging-only");
assert(stagingWorkerFirst.has("/world0-f5/ws"), "staging run_worker_first missing /world0-f5/ws");

const scripts = pkg.scripts || {};
assert(scripts.deploy === "npm run deploy:staging", "generic npm deploy must route to staging");
assert(
  scripts["deploy:staging"] === "node scripts/guard-staging-deploy.mjs && wrangler deploy --env staging",
  "deploy:staging must guard Workers Builds name override before Wrangler",
);
assert(scripts["deploy:production"] === "wrangler deploy", "production deploy must remain explicit and separate");
assert(scripts["test:staging-deploy-guard"] === "node scripts/test-staging-deploy-guard.mjs", "staging deploy guard smoke missing");
assert(scripts["test:f5-protocol"] === "node --experimental-strip-types scripts/ws0-f5-protocol-smoke.ts", "F5 protocol smoke missing");
assert(String(scripts.dev || "").includes("--env staging"), "dev must remain staging-scoped");
assert(String(scripts["generate:types"] || "").includes("--env staging"), "type generation must remain staging-scoped");
assert(String(scripts["validate:worker"] || "").includes("--env staging"), "worker dry-run must remain staging-scoped");
assert(String(scripts.check || "").includes("test:staging-deploy-guard"), "main check must exercise staging deploy guard");
assert(String(scripts.check || "").includes("test:f5-protocol"), "main check must exercise F5 protocol smoke");
assert(!scripts["deploy:preview"], "obsolete root-connected preview deploy router must remain removed");
assert(!scripts["test:preview-deploy-router"], "obsolete preview deploy router smoke must remain removed");

console.log(
  `F5 staging contract PASS · root ${wrangler.name} frozen at ${rootBindings.size} DO bindings · staging ${staging.name} has ${stagingBindings.size} with isolated WORLD_SLICE_F5`,
);
