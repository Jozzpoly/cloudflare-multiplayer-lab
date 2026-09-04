const SEGMENT_TICKS = 8;
const RETAIN_TICKS = 24;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

class HistoryModel {
  constructor(policy) {
    this.policy = policy;
    this.boundaryTick = 0;
    this.segments = [];
    this.active = { startTick: 0, frames: 0 };
    this.maxFinalizedSegments = 0;
  }

  cloneSegment(segment) {
    return { ...segment };
  }

  finalizeActive() {
    if (!this.active || this.active.frames <= 0) {
      this.active = null;
      return null;
    }
    const endTick = this.active.startTick + this.active.frames;
    const segment = {
      startTick: this.active.startTick,
      endTick,
      validEndTick: endTick,
    };
    this.segments.push(segment);
    this.active = null;
    this.maxFinalizedSegments = Math.max(this.maxFinalizedSegments, this.segments.length);
    return segment;
  }

  startActive(startTick) {
    this.active = { startTick, frames: 0 };
  }

  trim() {
    const cutoff = this.boundaryTick - RETAIN_TICKS;
    this.segments = this.segments.filter((segment) => {
      if (this.policy === "strict") return segment.validEndTick > cutoff;
      return segment.validEndTick >= cutoff;
    });
    this.maxFinalizedSegments = Math.max(this.maxFinalizedSegments, this.segments.length);
  }

  step({ trim = true } = {}) {
    assert(this.active, `missing active recording at B(${this.boundaryTick})`);
    this.active.frames += 1;
    this.boundaryTick += 1;
    if (this.active.frames >= SEGMENT_TICKS) {
      this.finalizeActive();
      this.startActive(this.boundaryTick);
    }
    if (trim) this.trim();
  }

  selectionSegments() {
    const segments = this.segments.map((segment) => this.cloneSegment(segment));
    if (this.active?.frames > 0) {
      const endTick = this.active.startTick + this.active.frames;
      segments.push({
        startTick: this.active.startTick,
        endTick,
        validEndTick: endTick,
      });
    }
    return segments;
  }

  selectCheckpoint(targetTick) {
    const candidates = this.selectionSegments()
      .filter((segment) => segment.startTick <= targetTick && segment.validEndTick >= targetTick)
      .sort((a, b) => b.startTick - a.startTick);
    return candidates[0] || null;
  }

  missingTargets() {
    const cutoff = Math.max(0, this.boundaryTick - RETAIN_TICKS);
    const missing = [];
    for (let targetTick = cutoff; targetTick < this.boundaryTick; targetTick += 1) {
      if (!this.selectCheckpoint(targetTick)) missing.push(targetTick);
    }
    return missing;
  }

  correction(targetTick) {
    const currentBoundary = this.boundaryTick;
    const cutoff = Math.max(0, currentBoundary - RETAIN_TICKS);
    assert(targetTick >= cutoff && targetTick < currentBoundary, `invalid correction target B(${targetTick}) at B(${currentBoundary})`);

    this.finalizeActive();
    const candidates = this.segments
      .filter((segment) => segment.startTick <= targetTick && segment.validEndTick >= targetTick)
      .sort((a, b) => b.startTick - a.startTick);
    const selected = candidates[0];
    assert(selected, `history_window_miss at B(${targetTick}) from B(${currentBoundary}) policy=${this.policy}`);

    const kept = [];
    for (const segment of this.segments) {
      if (segment === selected && segment.startTick < targetTick) {
        segment.validEndTick = targetTick;
        kept.push(segment);
      } else if (segment.validEndTick <= targetTick) {
        kept.push(segment);
      }
    }
    this.segments = kept;
    this.boundaryTick = targetTick;
    this.startActive(targetTick);

    // Production correction replays through managedPhysicsStep without trimming
    // on every replayed tick, then trims once after the correction has finished.
    while (this.boundaryTick < currentBoundary) this.step({ trim: false });
    this.trim();
  }
}

function runSchedule(policy, schedule, endTick = 160) {
  const model = new HistoryModel(policy);
  const trace = [];
  while (model.boundaryTick < endTick) {
    model.step();
    const missing = model.missingTargets();
    assert(missing.length === 0, `coverage hole after normal step policy=${policy} B(${model.boundaryTick}) missing=${missing.join(",")}`);

    for (const targetTick of schedule.get(model.boundaryTick) || []) {
      model.correction(targetTick);
      const after = model.missingTargets();
      assert(after.length === 0, `coverage hole after correction policy=${policy} B(${model.boundaryTick}) target=${targetTick} missing=${after.join(",")}`);
      trace.push({ boundaryTick: model.boundaryTick, targetTick, finalizedSegments: model.segments.length });
    }
  }
  return { policy, maxFinalizedSegments: model.maxFinalizedSegments, trace };
}

function xorshift32(seed) {
  let x = seed >>> 0 || 0x9e3779b9;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 0x100000000;
  };
}

const exhaustiveCases = [];
for (let boundary = RETAIN_TICKS; boundary <= 96; boundary += 1) {
  for (let target = boundary - RETAIN_TICKS; target < boundary; target += 1) {
    const schedule = new Map([[boundary, [target]]]);
    const inclusive = runSchedule("inclusive", schedule, 112);
    const strict = runSchedule("strict", schedule, 112);
    assert(strict.maxFinalizedSegments <= inclusive.maxFinalizedSegments, `strict retained more than inclusive at B(${boundary}) target=${target}`);
    exhaustiveCases.push({ boundary, target, inclusiveMax: inclusive.maxFinalizedSegments, strictMax: strict.maxFinalizedSegments });
  }
}

const randomCases = [];
for (let seed = 1; seed <= 512; seed += 1) {
  const random = xorshift32(seed);
  const schedule = new Map();
  for (let boundary = RETAIN_TICKS; boundary <= 220; boundary += 1) {
    if (random() >= 0.12) continue;
    const target = boundary - RETAIN_TICKS + Math.floor(random() * RETAIN_TICKS);
    const list = schedule.get(boundary) || [];
    list.push(target);
    schedule.set(boundary, list);
  }
  const inclusive = runSchedule("inclusive", schedule, 240);
  const strict = runSchedule("strict", schedule, 240);
  assert(strict.maxFinalizedSegments <= inclusive.maxFinalizedSegments, `strict retained more than inclusive random seed=${seed}`);
  randomCases.push({ seed, corrections: [...schedule.values()].reduce((sum, list) => sum + list.length, 0), inclusiveMax: inclusive.maxFinalizedSegments, strictMax: strict.maxFinalizedSegments });
}

const baselineInclusive = runSchedule("inclusive", new Map(), 160);
const baselineStrict = runSchedule("strict", new Map(), 160);
assert(baselineInclusive.maxFinalizedSegments === 4, `expected inclusive baseline max 4, got ${baselineInclusive.maxFinalizedSegments}`);
assert(baselineStrict.maxFinalizedSegments === 3, `expected strict baseline max 3, got ${baselineStrict.maxFinalizedSegments}`);

const verdict = {
  verdict: "WORLD_V0_HISTORY_RETENTION_STRICT_COVERAGE_PASS",
  contract: {
    segmentTicks: SEGMENT_TICKS,
    retainTicks: RETAIN_TICKS,
    productionReference: "finalize active before correction; newest covering checkpoint wins; replay starts a new recording at targetTick",
  },
  exhaustiveSingleCorrectionCases: exhaustiveCases.length,
  deterministicRandomSchedules: randomCases.length,
  baseline: {
    inclusiveMaxFinalizedSegments: baselineInclusive.maxFinalizedSegments,
    strictMaxFinalizedSegments: baselineStrict.maxFinalizedSegments,
    reductionFraction: 1 - baselineStrict.maxFinalizedSegments / baselineInclusive.maxFinalizedSegments,
  },
  claimBoundary: "model-level interval/coverage evidence only; no product runtime change authorized",
};

console.log(JSON.stringify(verdict, null, 2));
