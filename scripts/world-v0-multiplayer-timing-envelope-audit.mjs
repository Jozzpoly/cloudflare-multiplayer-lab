import { readFileSync } from "node:fs";

const contractText = readFileSync(new URL("../src/world-v0-contract.ts", import.meta.url), "utf8");
function numberFromContract(name) {
  const match = new RegExp(`${name}:\\s*([0-9.]+)`).exec(contractText);
  if (!match) throw new Error(`missing ${name} in world-v0-contract.ts`);
  return Number(match[1]);
}

const HZ = numberFromContract("simulationHz");
const LEAD = numberFromContract("predictionLeadTicks");
const BATCH = numberFromContract("inputBatchSize");
const LEASE = numberFromContract("inputLeaseMissingTicks");
const STEP = 1000 / HZ;

if (HZ !== 60 || LEAD !== 8 || BATCH !== 2 || LEASE !== 36) {
  throw new Error(`audit contract drift: ${JSON.stringify({ HZ, LEAD, BATCH, LEASE })}`);
}

function nextFrameAtOrAfter(ideal, frameMs, phaseMs) {
  if (ideal <= phaseMs) return phaseMs;
  return phaseMs + Math.ceil((ideal - phaseMs) / frameMs - 1e-12) * frameMs;
}

function generatedAt(targetTick, frameMs, phaseMs, leadTicks = LEAD) {
  // advancePrediction generates tick k once targetBoundary=floor(authorityEstimate+lead) is > k.
  const idealAuthorityTime = (targetTick + 1 - leadTicks) * STEP;
  return nextFrameAtOrAfter(idealAuthorityTime, frameMs, phaseMs);
}

function evaluate({ rttMs, frameMs, phaseMs = 0, leadTicks = LEAD, extraOneWayMs = 0, ticks = 1800 }) {
  const arrivals = new Map();
  const pending = [];
  for (let tick = 0; tick < ticks; tick += 1) {
    pending.push({ tick, generatedAt: generatedAt(tick, frameMs, phaseMs, leadTicks) });
    if (pending.length === BATCH) {
      const sendAt = Math.max(...pending.map((record) => record.generatedAt));
      const arrivalAt = sendAt + rttMs / 2 + extraOneWayMs;
      for (const record of pending) arrivals.set(record.tick, arrivalAt);
      pending.length = 0;
    }
  }

  let late = 0;
  let run = 0;
  let maxMissingStreak = 0;
  let minMarginMs = Infinity;
  let sumMarginMs = 0;
  let sampleCount = 0;
  const warmup = 180;
  for (let tick = warmup; tick < ticks; tick += 1) {
    // Authority starts canonical tick k when boundary=k, on the (k+1)-th timer pump.
    // A record is useful if it has arrived before that consumption boundary.
    const consumeAt = (tick + 1) * STEP;
    const arrivalAt = arrivals.get(tick) ?? Infinity;
    const margin = consumeAt - arrivalAt;
    minMarginMs = Math.min(minMarginMs, margin);
    sumMarginMs += margin;
    sampleCount += 1;
    if (margin < 0) {
      late += 1;
      run += 1;
      maxMissingStreak = Math.max(maxMissingStreak, run);
    } else {
      run = 0;
    }
  }
  return {
    lateRatio: late / sampleCount,
    lateRecords: late,
    maxMissingStreak,
    leaseWouldExpire: maxMissingStreak >= LEASE,
    minMarginMs,
    meanMarginMs: sumMarginMs / sampleCount,
  };
}

function sweep({ rttMs, frameMs, leadTicks = LEAD, extraOneWayMs = 0 }) {
  const samples = [];
  const phaseSamples = Math.max(8, Math.ceil(frameMs));
  for (let i = 0; i < phaseSamples; i += 1) {
    const phaseMs = (i / phaseSamples) * frameMs;
    samples.push(evaluate({ rttMs, frameMs, phaseMs, leadTicks, extraOneWayMs }));
  }
  return {
    rttMs,
    frameMs,
    leadTicks,
    extraOneWayMs,
    lateRatioMin: Math.min(...samples.map((x) => x.lateRatio)),
    lateRatioMax: Math.max(...samples.map((x) => x.lateRatio)),
    maxMissingStreak: Math.max(...samples.map((x) => x.maxMissingStreak)),
    leasePossible: samples.some((x) => x.leaseWouldExpire),
    minMarginMs: Math.min(...samples.map((x) => x.minMarginMs)),
    meanMarginMinMs: Math.min(...samples.map((x) => x.meanMarginMs)),
    meanMarginMaxMs: Math.max(...samples.map((x) => x.meanMarginMs)),
  };
}

function findMinimumLead({ rttMs, frameMs, extraOneWayMs = 0, maxLead = 32 }) {
  for (let leadTicks = 1; leadTicks <= maxLead; leadTicks += 1) {
    const result = sweep({ rttMs, frameMs, leadTicks, extraOneWayMs });
    if (result.lateRatioMax === 0 && result.minMarginMs >= 0) return leadTicks;
  }
  return null;
}

const observed = [
  { label: "desktop-173", rttMs: 173.1, frameMs: 1000 / 60 },
  { label: "desktop-190", rttMs: 190.1, frameMs: 1000 / 60 },
  { label: "mobile-204", rttMs: 203.7, frameMs: 25.0 },
  { label: "mobile-248", rttMs: 248.2, frameMs: 25.0 },
  { label: "mobile-302", rttMs: 301.8, frameMs: 25.0 },
];

const rows = observed.map((scenario) => {
  const baseline = sweep(scenario);
  const with8msJitterBudget = sweep({ ...scenario, extraOneWayMs: 8 });
  return {
    label: scenario.label,
    rttMs: scenario.rttMs,
    frameMs: scenario.frameMs,
    currentLeadTicks: LEAD,
    latePctRange: [baseline.lateRatioMin * 100, baseline.lateRatioMax * 100],
    maxMissingStreak: baseline.maxMissingStreak,
    leasePossible: baseline.leasePossible,
    minMarginMs: baseline.minMarginMs,
    latePctRangePlus8msOneWay: [with8msJitterBudget.lateRatioMin * 100, with8msJitterBudget.lateRatioMax * 100],
    leasePossiblePlus8msOneWay: with8msJitterBudget.leasePossible,
    minimumZeroLateLeadTicksIdeal: findMinimumLead(scenario),
    minimumZeroLateLeadTicksPlus8msOneWay: findMinimumLead({ ...scenario, extraOneWayMs: 8 }),
  };
});

console.log("WORLD_V0_MULTIPLAYER_TIMING_ENVELOPE", JSON.stringify({
  contract: { simulationHz: HZ, stepMs: STEP, predictionLeadTicks: LEAD, inputBatchSize: BATCH, inputLeaseMissingTicks: LEASE, inputLeaseMs: LEASE * STEP },
  model: "current rAF prediction scheduler; RTT/2 path; 2-record batch send; phase sweep; no server or clock jitter unless stated",
  rows,
}, null, 2));

const mobile248 = rows.find((row) => row.label === "mobile-248");
const mobile302 = rows.find((row) => row.label === "mobile-302");
const desktop173 = rows.find((row) => row.label === "desktop-173");
if (!desktop173 || desktop173.latePctRange[1] !== 0) throw new Error("model no longer preserves healthy desktop-173 envelope");
if (!mobile248 || mobile248.latePctRange[1] <= 0) throw new Error("model failed to expose observed mobile-248 underlead");
if (!mobile302 || !mobile302.leasePossible) throw new Error("model failed to expose mobile-302 lease-risk envelope");
console.log("WORLD_V0_MULTIPLAYER_TIMING_ENVELOPE_CAUSAL_PASS");
