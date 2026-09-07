import { readFileSync, writeFileSync } from "node:fs";

const sourcePath = "scripts/world-v0-chromium-cloud-smoke.mjs";
const outputPath = "scripts/.world-v0-playability-exact-v2.mjs";
let source = readFileSync(sourcePath, "utf8");

const staging = 'const STAGING_PAGE = "https://cloudflare-multiplayer-lab-staging.jozzpoly.workers.dev/world-v0/";';
if (!source.includes(staging)) throw new Error("exact-v2: staging URL anchor missing");
source = source.replace(staging, 'const STAGING_PAGE = "http://127.0.0.1:8787/world-v0/";');

const oldPending = '  assert(value.metrics?.guardPending === 0, `${label}: ${value.metrics?.guardPending} state guards still pending`);';
const newPending = [
  '  const pending = Array.isArray(value.pendingStateGuardBoundaries) ? value.pendingStateGuardBoundaries : [];',
  '  assert(value.metrics?.guardPending === pending.length, `${label}: pending guard accounting drift metrics=${value.metrics?.guardPending} list=${pending.length}`);',
  '  const stalePending = pending.filter((tick) => Number.isInteger(tick) && tick <= value.localBoundaryTick);',
  '  assert(stalePending.length === 0, `${label}: unresolved guards at/past local boundary ${JSON.stringify(stalePending)} local=B(${value.localBoundaryTick})`);',
].join("\n");
if (!source.includes(oldPending)) throw new Error("exact-v2: old pending assertion missing");
source = source.replace(oldPending, newPending);

writeFileSync(outputPath, source);
console.log("WORLD_V0_EXACT_PENDING_SEMANTICS_V2_PREPARED", outputPath);
