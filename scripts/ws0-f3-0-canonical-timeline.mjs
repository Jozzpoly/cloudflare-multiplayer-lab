import { writeFileSync } from "node:fs";

const REVISION = "ws0-f3-0-canonical-timeline-v1";
const OUTPUT = process.env.WS0_F3_0_OUTPUT || "ws0-f3-0-canonical-timeline.json";
const HZ = 60;
const DT = 1000 / HZ;
const EPS = 1e-9;
const MEASURE_START = 120;
const MEASURE_END = 719;
const GEN_END = MEASURE_END + 32;

const BASE_DELAYS_MS = [35, 65, 85, 120];
const JITTER_MS = [0, 10, 30];
const PATTERNS = ["smooth", "burst-hol"];
const LEADS = [2, 4, 6, 8, 10, 12];
const BATCHES = [1, 2, 4];
const SNAPSHOT_INTERVALS = [6, 3];

const SMOOTH = [-1, -0.5, 0, 0.5, 1, 0.5, 0, -0.5];
const BURST = [0, 0, 1, -1, -1, 0, 0, 0];

function percentile(values, p) {
  if (!values.length) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1));
  return sorted[i];
}

function summarize(values, { p05 = false } = {}) {
  if (!values.length) return { count: 0 };
  const out = {
    count: values.length,
    min: Math.min(...values),
    median: percentile(values, 0.5),
    p95: percentile(values, 0.95),
    max: Math.max(...values),
  };
  if (p05) out.p05 = percentile(values, 0.05);
  return out;
}

function coefficient(pattern, index, phase = 0) {
  const table = pattern === "smooth" ? SMOOTH : BURST;
  return table[(index + phase) % table.length];
}

function networkDelay(baseMs, jitterMs, pattern, index, phase = 0) {
  return Math.max(0, baseMs + jitterMs * coefficient(pattern, index, phase));
}

// Reliable ordered stream approximation: later messages cannot be delivered before an earlier one.
// Equal delivery instants are allowed; message order is still represented by array order.
function deliverOrdered(messages, { baseMs, jitterMs, pattern, phase = 0 }) {
  let previousDelivery = -Infinity;
  return messages.map((message, index) => {
    const delayMs = networkDelay(baseMs, jitterMs, pattern, index, phase);
    const rawArrivalMs = message.sendMs + delayMs;
    const deliveryMs = Math.max(rawArrivalMs, previousDelivery);
    const holBlockedMs = Math.max(0, deliveryMs - rawArrivalMs);
    previousDelivery = deliveryMs;
    return { ...message, delayMs, rawArrivalMs, deliveryMs, holBlockedMs };
  });
}

function generationMs(targetTick, lead) {
  return (targetTick - lead) * DT;
}

function batchEndFor(targetTick, batchSize) {
  return Math.floor(targetTick / batchSize) * batchSize + batchSize - 1;
}

function createInputBatches(lead, batchSize) {
  const batches = [];
  for (let start = 0, index = 0; start <= GEN_END; start += batchSize, index += 1) {
    const end = Math.min(GEN_END, start + batchSize - 1);
    const records = [];
    for (let targetTick = start; targetTick <= end; targetTick += 1) {
      records.push({
        targetTick,
        generatedMs: generationMs(targetTick, lead),
        batchWaitTicks: end - targetTick,
      });
    }
    batches.push({
      kind: "input-batch",
      index,
      startTick: start,
      endTick: end,
      sendMs: generationMs(end, lead),
      records,
    });
  }
  return batches;
}

function predictedTickAt(wallMs, lead) {
  return Math.floor((wallMs + EPS) / DT) + lead;
}

function serverTickAt(wallMs) {
  return Math.floor((wallMs + EPS) / DT);
}

function mapRecordDeliveries(deliveredBatches) {
  const map = new Map();
  for (const batch of deliveredBatches) {
    for (const record of batch.records) map.set(record.targetTick, batch.deliveryMs);
  }
  return map;
}

function authorityMetrics(deliveredUplink) {
  const deliveryByTick = mapRecordDeliveries(deliveredUplink);
  const margins = [];
  const batchWaitTicks = [];
  let onTime = 0;
  let late = 0;

  for (const batch of deliveredUplink) {
    for (const record of batch.records) {
      if (record.targetTick < MEASURE_START || record.targetTick > MEASURE_END) continue;
      const consumeMs = record.targetTick * DT;
      const marginTicks = (consumeMs - batch.deliveryMs) / DT;
      margins.push(marginTicks);
      batchWaitTicks.push(record.batchWaitTicks);
      if (batch.deliveryMs <= consumeMs + EPS) onTime += 1;
      else late += 1;
    }
  }

  // Measure actual future records buffered at each authority consume boundary.
  const buffered = new Set();
  const depths = [];
  let batchCursor = 0;
  for (let tick = 0; tick <= MEASURE_END; tick += 1) {
    const consumeMs = tick * DT;
    while (batchCursor < deliveredUplink.length && deliveredUplink[batchCursor].deliveryMs <= consumeMs + EPS) {
      for (const record of deliveredUplink[batchCursor].records) {
        // A late record for an already-consumed tick is classified late and discarded, not retained.
        if (record.targetTick >= tick) buffered.add(record.targetTick);
      }
      batchCursor += 1;
    }
    if (tick >= MEASURE_START) depths.push(buffered.size);
    buffered.delete(tick);
  }

  const total = onTime + late;
  return {
    total,
    onTime,
    onTimeRate: total ? onTime / total : NaN,
    late,
    lateRate: total ? late / total : NaN,
    missingAtConsume: late,
    authorityMarginTicks: summarize(margins, { p05: true }),
    futureBufferDepthTicks: summarize(depths, { p05: true }),
    batchWaitTicks: summarize(batchWaitTicks),
    deliveryByTick,
  };
}

function peerRelayMetrics(deliveredUplink, { lead, baseMs, jitterMs, pattern }) {
  // This is the contract's ideal immediate validated-relay path. It is kept logically
  // separate from snapshots so it remains a clean lower bound on remote-information age.
  const relayMessages = deliveredUplink.map((batch) => ({
    kind: "relay",
    index: batch.index,
    sendMs: batch.deliveryMs,
    records: batch.records,
  }));
  const downlink = deliverOrdered(relayMessages, {
    baseMs,
    jitterMs,
    pattern,
    phase: 3,
  });

  const lateness = [];
  const rollbackTicks = [];
  const perTarget = new Map();
  const holBlocked = [];
  for (const batch of downlink) {
    holBlocked.push(batch.holBlockedMs / DT);
    const receiverPredictedTick = predictedTickAt(batch.deliveryMs, lead);
    for (const record of batch.records) {
      if (record.targetTick < MEASURE_START || record.targetTick > MEASURE_END) continue;
      const lateTicks = receiverPredictedTick - record.targetTick;
      const rollback = Math.max(0, lateTicks);
      lateness.push(lateTicks);
      rollbackTicks.push(rollback);
      perTarget.set(record.targetTick, { arrivalMs: batch.deliveryMs, lateTicks, rollbackTicks: rollback });
    }
  }

  return {
    arrivalLatenessTicks: summarize(lateness),
    requiredHistoryTicks: summarize(rollbackTicks),
    holBlockedTicks: summarize(holBlocked),
    perTarget,
  };
}

function snapshotMetrics({ lead, baseMs, jitterMs, pattern, interval }) {
  const messages = [];
  for (let tick = 0, index = 0; tick <= MEASURE_END + interval; tick += interval, index += 1) {
    messages.push({ kind: "snapshot", index, tick, sendMs: tick * DT });
  }
  const delivered = deliverOrdered(messages, {
    baseMs,
    jitterMs,
    pattern,
    phase: 5,
  });

  const predictedMinusConfirmed = [];
  const snapshotAge = [];
  const perSnapshotTick = new Map();
  for (const snapshot of delivered) {
    if (snapshot.tick < MEASURE_START || snapshot.tick > MEASURE_END) continue;
    const predicted = predictedTickAt(snapshot.deliveryMs, lead);
    const serverAtReceipt = serverTickAt(snapshot.deliveryMs);
    const distance = predicted - snapshot.tick;
    const age = serverAtReceipt - snapshot.tick;
    predictedMinusConfirmed.push(distance);
    snapshotAge.push(age);
    perSnapshotTick.set(snapshot.tick, { deliveryMs: snapshot.deliveryMs, distance, age });
  }

  // First snapshot with tick >= target tick is the earliest authoritative state capable
  // of containing the consequence of an on-time command for that target tick.
  const perTargetHorizon = new Map();
  for (let targetTick = MEASURE_START; targetTick <= MEASURE_END; targetTick += 1) {
    const confirmTick = Math.ceil(targetTick / interval) * interval;
    const snapshot = delivered.find((x) => x.tick === confirmTick);
    if (!snapshot) continue;
    perTargetHorizon.set(targetTick, {
      confirmTick,
      deliveryMs: snapshot.deliveryMs,
      historyTicks: predictedTickAt(snapshot.deliveryMs, lead) - targetTick,
    });
  }

  return {
    intervalTicks: interval,
    rateHz: HZ / interval,
    predictedMinusConfirmedTicks: summarize(predictedMinusConfirmed),
    snapshotAgeTicks: summarize(snapshotAge),
    impliedHistoryTicks: summarize([...perTargetHorizon.values()].map((x) => x.historyTicks)),
    perTargetHorizon,
  };
}

function runCell({ baseMs, jitterMs, pattern, lead, batchSize }) {
  const batches = createInputBatches(lead, batchSize);
  const uplink = deliverOrdered(batches, { baseMs, jitterMs, pattern, phase: 0 });
  const authority = authorityMetrics(uplink);
  const peer = peerRelayMetrics(uplink, { lead, baseMs, jitterMs, pattern });
  const confirmations = SNAPSHOT_INTERVALS.map((interval) =>
    snapshotMetrics({ lead, baseMs, jitterMs, pattern, interval }),
  );

  return {
    parameters: {
      baseOneWayMs: baseMs,
      jitterAmplitudeMs: jitterMs,
      pattern,
      leadTicks: lead,
      leadMs: lead * DT,
      batchSize,
      sendRateHz: HZ / batchSize,
    },
    timingCost: {
      localPredictedToAuthorityRealizationTicks: lead,
      localPredictedToAuthorityRealizationMs: lead * DT,
      batchWaitTicks: authority.batchWaitTicks,
      batchWaitMs: {
        min: authority.batchWaitTicks.min * DT,
        median: authority.batchWaitTicks.median * DT,
        p95: authority.batchWaitTicks.p95 * DT,
        max: authority.batchWaitTicks.max * DT,
      },
    },
    authority: {
      totalLogicalRecords: authority.total,
      onTimeCount: authority.onTime,
      onTimeRate: authority.onTimeRate,
      lateCount: authority.late,
      lateRate: authority.lateRate,
      missingAtConsumeCount: authority.missingAtConsume,
      authorityMarginTicks: authority.authorityMarginTicks,
      futureBufferDepthTicks: authority.futureBufferDepthTicks,
    },
    peerImmediateRelay: {
      arrivalLatenessTicks: peer.arrivalLatenessTicks,
      requiredHistoryTicks: peer.requiredHistoryTicks,
      holBlockedTicks: peer.holBlockedTicks,
    },
    authoritativeConfirmation: confirmations.map((x) => ({
      intervalTicks: x.intervalTicks,
      rateHz: x.rateHz,
      predictedMinusConfirmedTicks: x.predictedMinusConfirmedTicks,
      snapshotAgeTicks: x.snapshotAgeTicks,
      impliedHistoryTicks: x.impliedHistoryTicks,
    })),
    _debug: { authority, peer, confirmations },
  };
}

function cellKey(p, omitLead = false) {
  return [p.baseOneWayMs, p.jitterAmplitudeMs, p.pattern, omitLead ? "*" : p.leadTicks, p.batchSize].join("|");
}

function auditInvariants(cells) {
  const authorityMonotonicViolations = [];
  const peerLeadInvarianceViolations = [];
  const zeroJitterConfirmationOrderingViolations = [];

  // A: for fixed network/batch, increasing lead must not make authority on-time rate worse.
  const groups = new Map();
  for (const cell of cells) {
    const key = cellKey(cell.parameters, true);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(cell);
  }
  for (const [key, group] of groups) {
    group.sort((a, b) => a.parameters.leadTicks - b.parameters.leadTicks);
    for (let i = 1; i < group.length; i += 1) {
      if (group[i].authority.onTimeRate + EPS < group[i - 1].authority.onTimeRate) {
        authorityMonotonicViolations.push({ key, before: group[i - 1].parameters.leadTicks, after: group[i].parameters.leadTicks });
      }
    }

    // B: integer-tick lead shifts sender and receiver predicted timelines together.
    // On the ideal immediate-relay path, remote lateness should therefore be lead-invariant.
    const ref = group[0]._debug.peer.perTarget;
    for (let i = 1; i < group.length; i += 1) {
      for (const [targetTick, expected] of ref) {
        const actual = group[i]._debug.peer.perTarget.get(targetTick);
        if (!actual || Math.abs(actual.lateTicks - expected.lateTicks) > EPS) {
          peerLeadInvarianceViolations.push({ key, targetTick, lead: group[i].parameters.leadTicks, expected: expected.lateTicks, actual: actual?.lateTicks });
          break;
        }
      }
    }
  }

  // C: with zero jitter and an on-time command, immediate relay is a strict lower-bound path.
  // A snapshot that can contain tick T cannot become useful earlier than that relay under equal fixed one-way delay.
  for (const cell of cells) {
    if (cell.parameters.jitterAmplitudeMs !== 0) continue;
    const authority = cell._debug.authority;
    const peer = cell._debug.peer;
    for (const confirmation of cell._debug.confirmations) {
      for (let targetTick = MEASURE_START; targetTick <= MEASURE_END; targetTick += 1) {
        const authorityDelivery = authority.deliveryByTick.get(targetTick);
        if (authorityDelivery > targetTick * DT + EPS) continue; // late command was not applied to T
        const relay = peer.perTarget.get(targetTick);
        const confirm = confirmation.perTargetHorizon.get(targetTick);
        if (!relay || !confirm) continue;
        const relayHorizon = predictedTickAt(relay.arrivalMs, cell.parameters.leadTicks) - targetTick;
        if (confirm.historyTicks + EPS < relayHorizon) {
          zeroJitterConfirmationOrderingViolations.push({
            parameters: cell.parameters,
            interval: confirmation.intervalTicks,
            targetTick,
            relayHorizon,
            confirmHorizon: confirm.historyTicks,
          });
          break;
        }
      }
    }
  }

  return {
    authorityMonotonicViolations,
    peerLeadInvarianceViolations,
    zeroJitterConfirmationOrderingViolations,
    pass:
      authorityMonotonicViolations.length === 0 &&
      peerLeadInvarianceViolations.length === 0 &&
      zeroJitterConfirmationOrderingViolations.length === 0,
  };
}

function robustCandidates(cells) {
  const candidates = [];
  for (const lead of LEADS) {
    for (const batchSize of BATCHES) {
      const required = cells.filter((cell) =>
        [65, 85].includes(cell.parameters.baseOneWayMs) &&
        cell.parameters.leadTicks === lead &&
        cell.parameters.batchSize === batchSize,
      );
      if (required.length !== 2 * JITTER_MS.length * PATTERNS.length) continue;
      if (required.every((cell) => cell.authority.onTimeRate >= 1 - EPS)) {
        candidates.push({ leadTicks: lead, leadMs: lead * DT, batchSize, sendRateHz: HZ / batchSize });
      }
    }
  }

  const pareto = candidates.filter((candidate) =>
    !candidates.some((other) =>
      other !== candidate &&
      other.leadTicks <= candidate.leadTicks &&
      other.batchSize >= candidate.batchSize &&
      (other.leadTicks < candidate.leadTicks || other.batchSize > candidate.batchSize),
    ),
  ).sort((a, b) => a.leadTicks - b.leadTicks || b.batchSize - a.batchSize);

  return { all: candidates, pareto, smallestRobust: pareto[0] ?? null };
}

function representativeTraces(cells, candidate) {
  if (!candidate) return null;
  const find = (base, jitter, pattern, lead, batch) => cells.find((cell) =>
    cell.parameters.baseOneWayMs === base &&
    cell.parameters.jitterAmplitudeMs === jitter &&
    cell.parameters.pattern === pattern &&
    cell.parameters.leadTicks === lead &&
    cell.parameters.batchSize === batch
  );
  const negativeLead = Math.max(LEADS[0], candidate.leadTicks - 4);
  const summary = (cell) => cell ? {
    parameters: cell.parameters,
    authorityOnTimeRate: cell.authority.onTimeRate,
    authorityMarginTicks: cell.authority.authorityMarginTicks,
    peerHistoryTicks: cell.peerImmediateRelay.requiredHistoryTicks,
    confirmation10HzHistoryTicks: cell.authoritativeConfirmation.find((x) => x.intervalTicks === 6)?.impliedHistoryTicks,
    confirmation20HzHistoryTicks: cell.authoritativeConfirmation.find((x) => x.intervalTicks === 3)?.impliedHistoryTicks,
  } : null;

  return {
    lowLatencyHealthy: summary(find(35, 10, "smooth", candidate.leadTicks, candidate.batchSize)),
    measured65: summary(find(65, 10, "smooth", candidate.leadTicks, candidate.batchSize)),
    measured85: summary(find(85, 10, "smooth", candidate.leadTicks, candidate.batchSize)),
    jitterHolStress: summary(find(85, 30, "burst-hol", candidate.leadTicks, candidate.batchSize)),
    highDelayStress: summary(find(120, 30, "burst-hol", candidate.leadTicks, candidate.batchSize)),
    insufficientLeadNegative: summary(find(85, 10, "smooth", negativeLead, candidate.batchSize)),
  };
}

const cells = [];
for (const baseMs of BASE_DELAYS_MS) {
  for (const jitterMs of JITTER_MS) {
    for (const pattern of PATTERNS) {
      for (const lead of LEADS) {
        for (const batchSize of BATCHES) {
          cells.push(runCell({ baseMs, jitterMs, pattern, lead, batchSize }));
        }
      }
    }
  }
}

const invariants = auditInvariants(cells);
if (!invariants.pass) {
  console.error("F3.0 MODEL AUDIT FAILED", JSON.stringify(invariants, null, 2));
  process.exitCode = 1;
}

const candidates = robustCandidates(cells);
const representative = representativeTraces(cells, candidates.smallestRobust);
const scheduledFamilyEarnsF31 = Boolean(candidates.smallestRobust) && invariants.pass;

const evidence = {
  revision: REVISION,
  generatedAt: new Date().toISOString(),
  contract: "docs/WS0_F3_0_TIMELINE_CONTRACT.md",
  model: {
    simulationHz: HZ,
    dtMs: DT,
    measureTicks: [MEASURE_START, MEASURE_END],
    logicalInput: "one record per predicted canonical tick; transport batches preserve every tick identity",
    authority: "forward-only consume-before-step; late records are measured and not retroactively applied",
    transport: "deterministic reliable ordered-stream approximation with HOL; no loss axis",
    immediateRelay: "separate best-case logical return path used as lower bound on remote-information age",
    snapshots: "separate authoritative confirmation path; zero-jitter ordering invariant audited",
    importantBoundary:
      "F3.0 is timing/topology only. It does not model Box3D, prediction error magnitude, presentation, clock-sync estimation, packet loss/reconnect, or F2 history cost.",
  },
  sweep: {
    baseOneWayMs: BASE_DELAYS_MS,
    jitterAmplitudeMs: JITTER_MS,
    patterns: PATTERNS,
    leadTicks: LEADS,
    batchSizes: BATCHES,
    snapshotIntervalsTicks: SNAPSHOT_INTERVALS,
    cellCount: cells.length,
  },
  analyticInvariants: {
    pass: invariants.pass,
    authorityMonotonicViolationCount: invariants.authorityMonotonicViolations.length,
    peerLeadInvarianceViolationCount: invariants.peerLeadInvarianceViolations.length,
    zeroJitterConfirmationOrderingViolationCount: invariants.zeroJitterConfirmationOrderingViolations.length,
  },
  robustAuthorityCandidates: candidates,
  representativeTracesForF31: representative,
  verdict: {
    scheduledFamilyEarnsF31,
    text: scheduledFamilyEarnsF31
      ? "F3.0 timing feasibility qualified in this deterministic model: a bounded scheduled-tick lead/batch region keeps ordinary authority input on time across the declared 65/85 ms cells while peer uncertainty remains finite and explicitly measurable. Carry representative traces into F3.1 coupled physics; do not infer production architecture yet."
      : "F3.0 scheduled-tick family did not qualify under the frozen discriminator. Redesign timing semantics before coupled Box3D work.",
  },
  cells: cells.map(({ _debug, ...publicCell }) => publicCell),
};

console.log(`${REVISION} · ${cells.length} deterministic cells`);
console.log(`invariants: ${invariants.pass ? "PASS" : "FAIL"}`);
console.log(`robust candidates: ${JSON.stringify(candidates.pareto)}`);
console.log(`smallest robust: ${JSON.stringify(candidates.smallestRobust)}`);
if (representative) {
  console.log(`65 ms peer history p95=${representative.measured65.peerHistoryTicks.p95} ticks · authority on-time=${representative.measured65.authorityOnTimeRate}`);
  console.log(`85 ms peer history p95=${representative.measured85.peerHistoryTicks.p95} ticks · authority on-time=${representative.measured85.authorityOnTimeRate}`);
  console.log(`85+30 HOL peer history p95=${representative.jitterHolStress.peerHistoryTicks.p95} ticks · max=${representative.jitterHolStress.peerHistoryTicks.max}`);
  console.log(`negative control authority on-time=${representative.insufficientLeadNegative.authorityOnTimeRate}`);
}
console.log(evidence.verdict.text);
writeFileSync(OUTPUT, JSON.stringify(evidence, null, 2));
console.log(`evidence written to ${OUTPUT}`);
