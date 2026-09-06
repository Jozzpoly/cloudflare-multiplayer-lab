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
const REVISION = "world-v0-input-scheduler-topology-audit-v1";

if (HZ !== 60 || LEAD !== 8 || BATCH !== 2 || LEASE !== 36) {
  throw new Error(`audit contract drift: ${JSON.stringify({ HZ, LEAD, BATCH, LEASE })}`);
}

function nextPumpAtOrAfter(ideal, intervalMs, phaseMs = 0) {
  if (ideal <= phaseMs) return phaseMs;
  return phaseMs + Math.ceil((ideal - phaseMs) / intervalMs - 1e-12) * intervalMs;
}

function generatedAt(targetTick, intervalMs, phaseMs = 0, leadTicks = LEAD) {
  const idealAuthorityTime = (targetTick + 1 - leadTicks) * STEP;
  return nextPumpAtOrAfter(idealAuthorityTime, intervalMs, phaseMs);
}

function pairSendAt(targetTick, intervalMs, phaseMs = 0) {
  const pairStart = Math.floor(targetTick / BATCH) * BATCH;
  let sendAt = -Infinity;
  for (let tick = pairStart; tick < pairStart + BATCH; tick += 1) {
    sendAt = Math.max(sendAt, generatedAt(tick, intervalMs, phaseMs));
  }
  return sendAt;
}

function evaluateCadence({ rttMs, intervalMs, phaseMs = 0, ticks = 1800 }) {
  let late = 0;
  let run = 0;
  let maxMissingStreak = 0;
  let minMarginMs = Infinity;
  const warmup = 180;

  for (let tick = warmup; tick < ticks; tick += 1) {
    const arrivalAt = pairSendAt(tick, intervalMs, phaseMs) + rttMs / 2;
    const consumeAt = (tick + 1) * STEP;
    const margin = consumeAt - arrivalAt;
    minMarginMs = Math.min(minMarginMs, margin);
    if (margin < 0) {
      late += 1;
      run += 1;
      maxMissingStreak = Math.max(maxMissingStreak, run);
    } else {
      run = 0;
    }
  }

  return {
    lateRatio: late / (ticks - warmup),
    maxMissingStreak,
    leaseWouldExpire: maxMissingStreak >= LEASE,
    minMarginMs,
  };
}

function sweepCadence({ rttMs, intervalMs }) {
  const phaseSamples = Math.max(16, Math.ceil(intervalMs));
  const samples = [];
  for (let index = 0; index < phaseSamples; index += 1) {
    const phaseMs = (index / phaseSamples) * intervalMs;
    samples.push(evaluateCadence({ rttMs, intervalMs, phaseMs }));
  }
  return {
    rttMs,
    intervalMs,
    lateRatioMax: Math.max(...samples.map((sample) => sample.lateRatio)),
    maxMissingStreak: Math.max(...samples.map((sample) => sample.maxMissingStreak)),
    leasePossible: samples.some((sample) => sample.leaseWouldExpire),
    minMarginMs: Math.min(...samples.map((sample) => sample.minMarginMs)),
  };
}

function currentReactionLag({ transitionAtMs, rttMs, frameMs, phaseMs = 0 }) {
  // Current production semantics author an immutable canonical value only when prediction
  // reaches that future tick. A later input change cannot revise already-authored ticks.
  for (let tick = 0; tick < 2000; tick += 1) {
    const authoredAt = generatedAt(tick, frameMs, phaseMs);
    if (authoredAt + 1e-9 < transitionAtMs) continue;
    const arrivalAt = pairSendAt(tick, frameMs, phaseMs) + rttMs / 2;
    const consumeAt = (tick + 1) * STEP;
    if (arrivalAt <= consumeAt + 1e-9) {
      return consumeAt - transitionAtMs;
    }
  }
  return Infinity;
}

function supersedingReactionLag({ transitionAtMs, rttMs, schedulerMs = STEP, phaseMs = 0 }) {
  // Candidate topology samples intent on the scheduler clock. On a transition it revises the
  // already-authored unconsumed future window immediately in <=ceil(LEAD/BATCH) ordered batches.
  // Revisions that arrive after a target was consumed are harmlessly late; consumed history stays immutable.
  const pumpAt = nextPumpAtOrAfter(transitionAtMs, schedulerMs, phaseMs);
  const estimatedBoundary = Math.floor(pumpAt / STEP + 1e-12);
  const authoredThrough = Math.floor(pumpAt / STEP + LEAD + 1e-12) - 1;
  const arrivalAt = pumpAt + rttMs / 2;

  for (let tick = estimatedBoundary; tick <= authoredThrough; tick += 1) {
    const consumeAt = (tick + 1) * STEP;
    if (arrivalAt <= consumeAt + 1e-9) return consumeAt - transitionAtMs;
  }
  return Infinity;
}

function sweepReaction({ rttMs, frameMs = STEP, schedulerMs = STEP }) {
  const current = [];
  const candidate = [];
  const phaseSamples = 24;
  const transitionSamples = 96;
  const anchor = 5000;
  for (let phaseIndex = 0; phaseIndex < phaseSamples; phaseIndex += 1) {
    const phaseMs = (phaseIndex / phaseSamples) * STEP;
    for (let transitionIndex = 0; transitionIndex < transitionSamples; transitionIndex += 1) {
      const transitionAtMs = anchor + (transitionIndex / transitionSamples) * STEP;
      current.push(currentReactionLag({ transitionAtMs, rttMs, frameMs, phaseMs }));
      candidate.push(supersedingReactionLag({ transitionAtMs, rttMs, schedulerMs, phaseMs }));
    }
  }
  return {
    rttMs,
    currentImmutableFutureMs: {
      min: Math.min(...current),
      max: Math.max(...current),
      mean: current.reduce((sum, value) => sum + value, 0) / current.length,
    },
    supersedingFutureMs: {
      min: Math.min(...candidate),
      max: Math.max(...candidate),
      mean: candidate.reduce((sum, value) => sum + value, 0) / candidate.length,
    },
  };
}

function applySameThreadStall(timeMs, stallStartMs, stallDurationMs) {
  const stallEndMs = stallStartMs + stallDurationMs;
  return timeMs >= stallStartMs && timeMs < stallEndMs ? stallEndMs : timeMs;
}

function evaluateSameThreadStall({ rttMs, stallDurationMs, schedulerMs = STEP, stallStartMs = 5000, ticks = 900 }) {
  let run = 0;
  let maxMissingStreak = 0;
  let late = 0;
  const warmup = 180;
  for (let tick = warmup; tick < ticks; tick += 1) {
    const pairStart = Math.floor(tick / BATCH) * BATCH;
    let sendAt = -Infinity;
    for (let pairTick = pairStart; pairTick < pairStart + BATCH; pairTick += 1) {
      const nominal = generatedAt(pairTick, schedulerMs, 0);
      sendAt = Math.max(sendAt, applySameThreadStall(nominal, stallStartMs, stallDurationMs));
    }
    const arrivalAt = sendAt + rttMs / 2;
    const consumeAt = (tick + 1) * STEP;
    if (arrivalAt > consumeAt + 1e-9) {
      late += 1;
      run += 1;
      maxMissingStreak = Math.max(maxMissingStreak, run);
    } else {
      run = 0;
    }
  }
  return {
    rttMs,
    stallDurationMs,
    lateRecords: late,
    maxMissingStreak,
    leaseWouldExpire: maxMissingStreak >= LEASE,
  };
}

const healthyRtt = 173.1;
const cadence = {
  currentRaf60: sweepCadence({ rttMs: healthyRtt, intervalMs: STEP }),
  currentRaf40ms: sweepCadence({ rttMs: healthyRtt, intervalMs: 40 }),
  currentRaf120ms: sweepCadence({ rttMs: healthyRtt, intervalMs: 120 }),
  candidateScheduler60: sweepCadence({ rttMs: healthyRtt, intervalMs: STEP }),
  candidateHighRtt248: sweepCadence({ rttMs: 248.2, intervalMs: STEP }),
};

const reaction = {
  healthyObservedRtt: sweepReaction({ rttMs: healthyRtt }),
  lowRttControl: sweepReaction({ rttMs: 80 }),
};

const sameThreadStall = {
  stall400: evaluateSameThreadStall({ rttMs: healthyRtt, stallDurationMs: 400 }),
  stall750: evaluateSameThreadStall({ rttMs: healthyRtt, stallDurationMs: 750 }),
};

if (cadence.currentRaf60.lateRatioMax !== 0) throw new Error("healthy 60fps control unexpectedly late");
if (cadence.currentRaf40ms.lateRatioMax <= 0) throw new Error("40ms rAF cadence no longer exposes rAF-coupling loss");
if (cadence.currentRaf120ms.lateRatioMax <= cadence.currentRaf40ms.lateRatioMax) throw new Error("120ms rAF control did not worsen cadence loss");
if (cadence.candidateScheduler60.lateRatioMax !== 0) throw new Error("independent 60Hz scheduler failed healthy RTT cadence isolation");
if (cadence.candidateHighRtt248.lateRatioMax <= 0) throw new Error("candidate incorrectly claims scheduler topology solves high RTT under unchanged lead");
if (!(reaction.healthyObservedRtt.supersedingFutureMs.max < reaction.healthyObservedRtt.currentImmutableFutureMs.max)) {
  throw new Error("supersession did not reduce worst-case shared-authority intent transition lag");
}
if (!(reaction.lowRttControl.supersedingFutureMs.mean < reaction.lowRttControl.currentImmutableFutureMs.mean / 2)) {
  throw new Error("low-RTT control failed to expose lead-horizon intent freezing");
}
if (sameThreadStall.stall400.leaseWouldExpire) throw new Error("400ms same-thread control unexpectedly exceeds current lease");
if (!sameThreadStall.stall750.leaseWouldExpire) throw new Error("750ms same-thread stall no longer exposes unresolved event-loop starvation");

const evidence = {
  revision: REVISION,
  contract: {
    simulationHz: HZ,
    predictionLeadTicks: LEAD,
    inputBatchSize: BATCH,
    inputLeaseMissingTicks: LEASE,
    noTimingConstantChanged: true,
  },
  candidateTopology: {
    logicalIntentScheduler: "fixed-rate clock independent of requestAnimationFrame while the main event loop remains runnable",
    renderPrediction: "remains requestAnimationFrame-driven and consumes the same canonical intended-input timeline",
    transitionRevision: "on press/turn/release/jump change, supersede already-authored unconsumed future ticks using monotonic batchSeq",
    transitionBurstUpperBoundMessages: Math.ceil(LEAD / BATCH),
  },
  cadence,
  reaction,
  sameThreadStall,
  earned: [
    "rAF cadence is causally separable from canonical intended-input production",
    "at the observed healthy ~173ms RTT, a 60Hz logical scheduler removes the modeled 40/120ms rAF starvation without increasing lead",
    "future-intent supersession reduces authority-visible transition lag instead of waiting for the prefilled lead horizon to drain",
  ],
  remainsOpen: [
    "~248ms RTT remains underled with the current lead even when scheduler cadence is healthy",
    "a scheduler on the same JS event loop cannot survive a full 750ms main-thread stall; current lease can still expire",
    "browser implementation and Owner-visible feel remain unqualified",
    "whether a Worker is worth its complexity remains a separate cost/benefit decision, not implied by this proof",
  ],
  verdict: "WORLD_V0_INPUT_SCHEDULER_TOPOLOGY_CAUSAL_PASS",
  nonClaim: "This is a deterministic causal model, not a production implementation or browser qualification. It supports decoupling canonical intended-input authorship from rAF and pairing that topology with supersession semantics. It explicitly does not claim to solve high RTT with unchanged lead, full event-loop blocking, background-tab suspension, mobile OS scheduling, Worker lifecycle, or user-visible control feel.",
};

console.log("WORLD_V0_INPUT_SCHEDULER_TOPOLOGY", JSON.stringify(evidence, null, 2));
console.log(evidence.verdict);
