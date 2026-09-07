#!/usr/bin/env bash
set -euo pipefail

: "${VARIANT:?}"
: "${RUNTIME_SHA:?}"
: "${SIM_LEAD_EXPECTED:?}"
: "${SIM_BUILD_EXPECTED:?}"
: "${WORKER:?}"
: "${BASE_URL:?}"
: "${CLOUDFLARE_API_TOKEN:?}"

prefix="ab-${VARIANT}"
config="wrangler.${prefix}.jsonc"

# Restore exactly one clean runtime specimen before adding test-only observability.
git checkout "$RUNTIME_SHA" -- src/world-v0-contract.ts public/world-v0/app.js public/world-v0/build-contract.js
rm -f scripts/.prepare-world-v0-playability-input-shape-probe-fixed.mjs scripts/.world-v0-playability-input-shape-probe.mjs

node scripts/apply-world-v0-playability-observability.mjs | tee "${prefix}-observability.log"
node scripts/apply-world-v0-presentation-shock-observability.mjs | tee "${prefix}-shock-observability.log"
node scripts/prepare-world-v0-playability-input-shape-probe-v2.mjs | tee "${prefix}-prepare-input.log"
node scripts/prepare-world-v0-presentation-shock-probe.mjs | tee "${prefix}-prepare-shock.log"
node scripts/prepare-world-v0-remote-playability-probe.mjs | tee "${prefix}-prepare-semantic.log"
node scripts/prepare-world-v0-playability-no-render-cadence.mjs | tee "${prefix}-prepare-cadence.log"
node --check scripts/.world-v0-playability-input-shape-probe.mjs
npm run check | tee "${prefix}-check.log"

VARIANT="$VARIANT" RUNTIME_SHA="$RUNTIME_SHA" SIM_LEAD_EXPECTED="$SIM_LEAD_EXPECTED" SIM_BUILD_EXPECTED="$SIM_BUILD_EXPECTED" WORKER="$WORKER" node --input-type=module <<'NODE'
import { readFileSync, writeFileSync } from "node:fs";
const c = JSON.parse(readFileSync("wrangler.jsonc", "utf8"));
const template = c.env?.reliability_play;
if (!template) throw new Error("reliability_play template missing");
const forbidden = new Set([c.name, c.env?.staging?.name, template.name]);
if (forbidden.has(process.env.WORKER)) throw new Error("A/B worker is not isolated");
template.name = process.env.WORKER;
writeFileSync(`wrangler.ab-${process.env.VARIANT}.jsonc`, JSON.stringify(c, null, 2) + "\n");
const p = {
  purpose: "world-v0-playability-remote-ab-no-render-cadence",
  variant: process.env.VARIANT,
  runtimeSha: process.env.RUNTIME_SHA,
  probeBranchSha: process.env.GITHUB_SHA,
  worker: process.env.WORKER,
  simBuildId: process.env.SIM_BUILD_EXPECTED,
  inputLeadTicks: 8,
  simulationLeadTicks: Number(process.env.SIM_LEAD_EXPECTED),
  apparatusMode: "no-webgl-draw-rAF-v1",
  instrumentedPresentationShock: true,
};
writeFileSync("public/world-v0/playability-ab-provenance.json", JSON.stringify(p, null, 2) + "\n");
console.log("WORLD_V0_PLAYABILITY_AB_TARGET_PASS", JSON.stringify(p));
NODE

npx wrangler deploy --dry-run --env reliability_play --config "$config" --outdir ".wrangler-${prefix}-dry-run"
npx wrangler deploy --env reliability_play --config "$config" | tee "${prefix}-deploy.log"

BASE_URL="$BASE_URL" VARIANT="$VARIANT" RUNTIME_SHA="$RUNTIME_SHA" SIM_LEAD_EXPECTED="$SIM_LEAD_EXPECTED" SIM_BUILD_EXPECTED="$SIM_BUILD_EXPECTED" WORKER="$WORKER" node --input-type=module <<'NODE'
const url = `${process.env.BASE_URL}/world-v0/playability-ab-provenance.json?r=${Date.now()}`;
const deadline = Date.now() + 120000;
let last = null;
while (Date.now() < deadline) {
  try {
    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    const p = response.ok ? await response.json() : null;
    last = p;
    if (
      p?.variant === process.env.VARIANT &&
      p?.runtimeSha === process.env.RUNTIME_SHA &&
      p?.probeBranchSha === process.env.GITHUB_SHA &&
      p?.worker === process.env.WORKER &&
      p?.simBuildId === process.env.SIM_BUILD_EXPECTED &&
      p?.inputLeadTicks === 8 &&
      p?.simulationLeadTicks === Number(process.env.SIM_LEAD_EXPECTED) &&
      p?.apparatusMode === "no-webgl-draw-rAF-v1"
    ) {
      console.log("WORLD_V0_PLAYABILITY_AB_PROVENANCE_PASS", JSON.stringify(p));
      process.exit(0);
    }
  } catch (error) { last = error instanceof Error ? error.message : String(error); }
  await new Promise((resolve) => setTimeout(resolve, 1000));
}
throw new Error(`A/B provenance not visible: ${JSON.stringify(last)}`);
NODE

for attempt in 1 2; do
  echo "===== ${VARIANT} ATTEMPT ${attempt} ====="
  MW_WORLD_V0_PLAYABILITY_BASE_URL="$BASE_URL" \
  MW_WORLD_V0_PLAYABILITY_OUTPUT="${prefix}-${attempt}.json" \
  MW_WORLD_V0_INPUT_SHAPE_DRIVE_MS=6000 \
  MW_WORLD_V0_INPUT_SHAPE_INTERVAL_MS=16 \
  node scripts/.world-v0-playability-input-shape-probe.mjs | tee "${prefix}-${attempt}.log"
done

VARIANT="$VARIANT" RUNTIME_SHA="$RUNTIME_SHA" SIM_LEAD_EXPECTED="$SIM_LEAD_EXPECTED" SIM_BUILD_EXPECTED="$SIM_BUILD_EXPECTED" WORKER="$WORKER" node --input-type=module <<'NODE'
import { readFileSync, writeFileSync } from "node:fs";
const variant = process.env.VARIANT;
const expectedLead = Number(process.env.SIM_LEAD_EXPECTED);
const attempts = [];
for (let attempt = 1; attempt <= 2; attempt += 1) {
  const v = JSON.parse(readFileSync(`ab-${variant}-${attempt}.json`, "utf8"));
  if (v.verdict !== "WORLD_V0_PLAYABILITY_INPUT_SHAPE_PASS") throw new Error(`${variant} attempt ${attempt}: ${v.verdict}`);
  if (v.apparatusMode !== "no-webgl-draw-rAF-v1") throw new Error(`${variant} attempt ${attempt}: apparatus marker drift`);
  const clients = [];
  for (const [index,c] of v.clients.entries()) {
    if (c.inputLeadTicks !== 8 || c.simulationLeadTicks !== expectedLead) throw new Error(`${variant} attempt ${attempt} client ${index}: timing drift`);
    if (c.guardMismatches !== 0 || c.firstStateMismatch !== null) throw new Error(`${variant} attempt ${attempt} client ${index}: exact mismatch`);
    if (c.guardPending !== c.pendingStateGuardBoundaries.length) throw new Error(`${variant} attempt ${attempt} client ${index}: pending accounting drift`);
    const stale = c.pendingStateGuardBoundaries.filter((tick) => Number.isInteger(tick) && tick <= c.localBoundaryTick);
    if (stale.length) throw new Error(`${variant} attempt ${attempt} client ${index}: stale pending guards`);
    if (!c.presentationShock || c.presentationShock.revision !== "world-v0-presentation-shock-v1") throw new Error(`${variant} attempt ${attempt} client ${index}: shock evidence missing`);
    if (!Number.isFinite(c.frameP95Ms) || c.frameP95Ms > 40) throw new Error(`APPARATUS_INVALID ${variant} attempt ${attempt} client ${index}: frame p95 ${c.frameP95Ms} ms`);
    const s = c.presentationShock;
    clients.push({
      corrections: c.corrections,
      correctionsPer1000Ticks: c.correctionsPer1000Ticks,
      supersededDelta: c.supersededDelta,
      serverLate: c.serverLate,
      frameP95Ms: c.frameP95Ms,
      frameMaxMs: c.frameMaxMs,
      rttMedianMs: c.rttMedianMs,
      rttP95Ms: c.rttP95Ms,
      guardMatches: c.guardMatches,
      guardPending: c.guardPending,
      correctedFrames: s.correctedFrames,
      correctionEventsObserved: s.correctionEventsObserved,
      maxCorrectionsInFrame: s.maxCorrectionsInFrame,
      netSelfTotal: s.netCorrection.self.total,
      netRemoteTotal: s.netCorrection.remote.total,
      netSelfOver005: s.netCorrection.self.over005,
      netSelfOver010: s.netCorrection.self.over010,
      netRemoteOver005: s.netCorrection.remote.over005,
      netRemoteOver010: s.netCorrection.remote.over010,
      maxNetSelfShock: s.netCorrection.self.max,
      maxNetRemoteShock: s.netCorrection.remote.max,
    });
  }
  attempts.push({ attempt, clients, aggregate: v.aggregate });
}
const out = {
  verdict: "WORLD_V0_PLAYABILITY_REMOTE_AB_VARIANT_COMPLETE",
  variant,
  runtimeSha: process.env.RUNTIME_SHA,
  simBuildId: process.env.SIM_BUILD_EXPECTED,
  inputLeadTicks: 8,
  simulationLeadTicks: expectedLead,
  worker: process.env.WORKER,
  apparatusMode: "no-webgl-draw-rAF-v1",
  attempts,
};
writeFileSync(`ab-${variant}-summary.json`, JSON.stringify(out, null, 2));
console.log("WORLD_V0_PLAYABILITY_REMOTE_AB_VARIANT_PASS", JSON.stringify(out));
NODE
