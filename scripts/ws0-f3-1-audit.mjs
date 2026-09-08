import { readFileSync } from "node:fs";

const INPUT = process.env.WS0_F3_1_OUTPUT || "ws0-f3-1-coupled-timeline.json";
const EPS = 1e-9;
const evidence = JSON.parse(readFileSync(INPUT, "utf8"));

const expectedPeerMax = new Map([
  ["low35", 5],
  ["measured65", 9],
  ["measured85", 11],
  ["hol85", 13],
  ["near-boundary-negative", 11],
]);

const failures = [];
const find = (trace, policy) => evidence.cells.find((cell) => cell.trace === trace && cell.policy === policy);
const residualMax = (r) => Math.max(r.actorPosition, r.relayPosition, r.relayVelocity, r.relayRotation);

for (const [trace, expectedMax] of expectedPeerMax) {
  for (const policy of ["scheduled-forward-reconcile", "source-time-common"]) {
    const cell = find(trace, policy);
    if (!cell) {
      failures.push(`${trace}/${policy}: missing cell`);
      continue;
    }
    const actual = Math.max(cell.clientA.rewindHorizonTicks.max, cell.clientB.rewindHorizonTicks.max);
    if (actual > expectedMax + EPS) {
      failures.push(`${trace}/${policy}: client rewind ${actual} exceeds frozen F3.0 peer bound ${expectedMax}`);
    }
  }
}

for (const trace of ["low35", "measured65", "measured85", "hol85"]) {
  const scheduled = find(trace, "scheduled-forward-reconcile");
  if (!scheduled) continue;
  if (scheduled.authority.timing.missingAtConsume !== 0) failures.push(`${trace}: healthy scheduled authority has missing input`);
  if (scheduled.authority.timing.onTimeRate < 1 - EPS) failures.push(`${trace}: healthy scheduled authority on-time < 100%`);
  if (residualMax(scheduled.authority.sourceOracleResidual) > 1e-6) failures.push(`${trace}: healthy scheduled authority differs from source oracle`);
  if (residualMax(scheduled.finalClientAuthority.A) > 1e-6 || residualMax(scheduled.finalClientAuthority.B) > 1e-6) {
    failures.push(`${trace}: healthy scheduled clients fail final authority convergence`);
  }
}

const negative = find("near-boundary-negative", "scheduled-forward-reconcile");
if (!negative) failures.push("near-boundary-negative/scheduled: missing cell");
else {
  if (negative.authority.timing.missingAtConsume <= 0) failures.push("near-boundary-negative: no authority misses survived");
  if (!(negative.authority.timing.onTimeRate > 0.5 && negative.authority.timing.onTimeRate < 0.9)) {
    failures.push(`near-boundary-negative: expected partial on-time regime, got ${negative.authority.timing.onTimeRate}`);
  }
}

for (const trace of expectedPeerMax.keys()) {
  const source = find(trace, "source-time-common");
  const authorityTime = find(trace, "authority-time-common");
  if (source && residualMax(source.authority.sourceOracleResidual) > 1e-6) failures.push(`${trace}: source-time authority differs from source oracle`);
  if (authorityTime && (residualMax(authorityTime.finalClientAuthority.A) > 1e-6 || residualMax(authorityTime.finalClientAuthority.B) > 1e-6)) {
    failures.push(`${trace}: authority-time clients fail final authority convergence`);
  }
}

const sourceOracle = evidence.sourceOracle;
if (!(sourceOracle.minPlayerSeparationBeforeRelay <= 0.72)) failures.push(`T5 player-contact gate failed: ${sourceOracle.minPlayerSeparationBeforeRelay}`);
if (!(sourceOracle.relayDisplacement >= 0.35)) failures.push(`T5 relay displacement gate failed: ${sourceOracle.relayDisplacement}`);
if (!(sourceOracle.centralPropMovement <= 0.05)) failures.push(`T5 central-prop isolation failed: ${sourceOracle.centralPropMovement}`);

if (failures.length) {
  console.error("F3.1 INDEPENDENT AUDIT FAILED");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("F3.1 INDEPENDENT AUDIT PASS");
for (const [trace, expectedMax] of expectedPeerMax) {
  const scheduled = find(trace, "scheduled-forward-reconcile");
  const source = find(trace, "source-time-common");
  console.log(`${trace.padEnd(22)} frozenPeerMax=${expectedMax} scheduledRewind=${Math.max(scheduled.clientA.rewindHorizonTicks.max, scheduled.clientB.rewindHorizonTicks.max)} sourceRewind=${Math.max(source.clientA.rewindHorizonTicks.max, source.clientB.rewindHorizonTicks.max)}`);
}
console.log(`negative scheduled on-time=${negative.authority.timing.onTimeRate} missing=${negative.authority.timing.missingAtConsume}`);
