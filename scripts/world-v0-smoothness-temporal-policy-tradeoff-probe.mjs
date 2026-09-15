import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";

const OUTPUT = process.env.MW_WORLD_V0_POLICY_OUTPUT ?? "world-v0-smoothness-temporal-policy-tradeoff.json";
const AUTH_LEAD = 8;
const CURRENT_SIM_LEAD = 2;
const F5_SIM_LEAD = 8;
const HZ = 60;
const STEP_MS = 1000 / HZ;

// This is a semantic thought-experiment made executable. Authority is at B(100)
// when the player changes movement from OLD to NEW. We compare what each policy can
// canonically promise without assuming knowledge of future human input.
const authorityBoundaryAtChange = 100;

function historicalF5() {
  // F5 simulated at approximately authority+L. A target tick was authored exactly
  // once when local predicted simulation reached it. Human NEW sampled now therefore
  // affects the local current predicted tick immediately, which is ~L canonical ticks
  // ahead of authority; authority receives that record with the full lead.
  const localCurrentTick = authorityBoundaryAtChange + F5_SIM_LEAD;
  return {
    policy: "historical-F5-coupled-lead-immutable",
    authorshipLeadTicks: AUTH_LEAD,
    simulationLeadTicks: F5_SIM_LEAD,
    firstLocalTickUsingNewInput: localCurrentTick,
    firstCanonicalAuthorityTickUsingNewInput: localCurrentTick,
    localResponseDelayMs: 0,
    canonicalChangeDelayTicks: localCurrentTick - authorityBoundaryAtChange,
    canonicalChangeDelayMs: (localCurrentTick - authorityBoundaryAtChange) * STEP_MS,
    revisesAlreadyAuthoredTicks: false,
    revisionDeadlineRace: false,
    cost: "client simulates the coupled shared world ~8 ticks ahead, increasing speculative/replay horizon",
  };
}

function splitImmutable() {
  // Current split authorship has already forecast the near future from authority+1
  // through authority+7. If those records become immutable, a NEW human input cannot
  // alter them. The first not-yet-authored target is authority+8.
  const firstUncommittedTick = authorityBoundaryAtChange + AUTH_LEAD;
  const localCurrentTick = authorityBoundaryAtChange + CURRENT_SIM_LEAD;
  return {
    policy: "split-lead-immutable-forecast",
    authorshipLeadTicks: AUTH_LEAD,
    simulationLeadTicks: CURRENT_SIM_LEAD,
    firstLocalTickUsingNewInput: localCurrentTick,
    firstCanonicalAuthorityTickUsingNewInput: firstUncommittedTick,
    localResponseDelayMs: 0,
    localVsCanonicalIntentGapTicks: firstUncommittedTick - localCurrentTick,
    localVsCanonicalIntentGapMs: (firstUncommittedTick - localCurrentTick) * STEP_MS,
    canonicalChangeDelayTicks: firstUncommittedTick - authorityBoundaryAtChange,
    canonicalChangeDelayMs: (firstUncommittedTick - authorityBoundaryAtChange) * STEP_MS,
    revisesAlreadyAuthoredTicks: false,
    revisionDeadlineRace: false,
    cost: "new local input is immediately predicted but authority must keep executing stale preauthored forecast until the immutable horizon expires",
  };
}

function splitMutable({ pumpsPerTick }) {
  // Current semantics let NEW rewrite the already-authored 7-tick future window.
  // Responsiveness is preserved in local prediction and canonical target values can be
  // updated, but the same target remains mutable until <1 tick before consumption.
  const lastRevisionLeadTicks = 1 / pumpsPerTick;
  return {
    policy: `split-lead-mutable-${pumpsPerTick}-pumps-per-tick`,
    authorshipLeadTicks: AUTH_LEAD,
    simulationLeadTicks: CURRENT_SIM_LEAD,
    firstLocalTickUsingNewInput: authorityBoundaryAtChange + CURRENT_SIM_LEAD,
    localResponseDelayMs: 0,
    revisesAlreadyAuthoredTicks: true,
    finalLegalRevisionLeadTicks: lastRevisionLeadTicks,
    finalLegalRevisionLeadMs: lastRevisionLeadTicks * STEP_MS,
    revisionDeadlineRace: true,
    cost: "continuous human input repeatedly rewrites future canonical intent; near-deadline revisions can be late and force authority-consumed/peer corrections",
  };
}

function delayedLocalImmutable() {
  // A logically clean way to preserve immutable preauthoring is to delay local
  // presentation/control until canonical committed input catches up. This avoids a
  // local/canonical intent gap but explicitly spends responsiveness instead.
  return {
    policy: "split-lead-immutable-with-input-delay",
    authorshipLeadTicks: AUTH_LEAD,
    simulationLeadTicks: CURRENT_SIM_LEAD,
    localResponseDelayTicks: AUTH_LEAD,
    localResponseDelayMs: AUTH_LEAD * STEP_MS,
    revisesAlreadyAuthoredTicks: false,
    revisionDeadlineRace: false,
    cost: "human control waits roughly the authorship horizon before both local and authority use the new intent",
  };
}

const policies = [historicalF5(), splitImmutable(), splitMutable({ pumpsPerTick: 1 }), splitMutable({ pumpsPerTick: 2 }), delayedLocalImmutable()];
const f5 = policies[0];
const immutable = policies[1];
const mutableTwoPump = policies[3];
const delayed = policies[4];

assert.equal(f5.revisesAlreadyAuthoredTicks, false);
assert.equal(f5.localResponseDelayMs, 0);
assert.equal(f5.simulationLeadTicks, f5.authorshipLeadTicks);
assert.equal(immutable.localVsCanonicalIntentGapTicks, AUTH_LEAD - CURRENT_SIM_LEAD);
assert.equal(immutable.localVsCanonicalIntentGapTicks, 6);
assert.equal(mutableTwoPump.finalLegalRevisionLeadMs, STEP_MS / 2);
assert(mutableTwoPump.finalLegalRevisionLeadMs < 10);
assert(delayed.localResponseDelayMs > 100);

const result = {
  revision: "world-v0-smoothness-temporal-policy-tradeoff-v1",
  constants: {
    simulationHz: HZ,
    authorshipLeadTicks: AUTH_LEAD,
    currentSimulationLeadTicks: CURRENT_SIM_LEAD,
    historicalF5SimulationLeadTicks: F5_SIM_LEAD,
  },
  policies,
  verdict: "SPLIT_LEAD_TEMPORAL_TRADEOFF_MADE_EXPLICIT",
  conclusion: "When canonical authorship lead exceeds local simulation lead, future target ticks necessarily contain forecast rather than known future human intent. Keeping that forecast immutable spends canonical responsiveness; making it mutable spends revision stability; delaying local control spends human responsiveness. Historical F5 avoided this particular split by coupling simulation and authorship lead, at the cost of a deeper speculative world timeline.",
  nonClaim: "This model does not select the replacement architecture. Authority rollback, ownership changes, commit/freeze zones, adaptive timelines, and presentation separation remain design alternatives requiring their own evidence and tradeoff analysis.",
};

writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
console.log(result.verdict);
