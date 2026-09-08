const EPS = 1e-9;

export class FixedStepClock {
  constructor({ stepSeconds, maxStepsPerAdvance }) {
    if (!(stepSeconds > 0) || !Number.isFinite(stepSeconds)) throw new Error("invalid stepSeconds");
    if (!Number.isInteger(maxStepsPerAdvance) || maxStepsPerAdvance < 1) throw new Error("invalid maxStepsPerAdvance");
    this.stepSeconds = stepSeconds;
    this.maxStepsPerAdvance = maxStepsPerAdvance;
    this.accumulator = 0;
    this.totalSteps = 0;
    this.totalDroppedSteps = 0;
    this.backlogSteps = 0;
    this.maxBacklogSteps = 0;
  }

  reset() {
    this.accumulator = 0;
    this.totalSteps = 0;
    this.totalDroppedSteps = 0;
    this.backlogSteps = 0;
    this.maxBacklogSteps = 0;
  }

  advance(elapsedSeconds, step) {
    if (!Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0) {
      return { steps: 0, droppedSteps: 0, backlogSteps: this.backlogSteps, remainderSeconds: this.accumulator };
    }
    if (typeof step !== "function") throw new Error("step callback required");

    this.accumulator += elapsedSeconds;
    let steps = 0;
    while (this.accumulator + EPS >= this.stepSeconds && steps < this.maxStepsPerAdvance) {
      step();
      this.accumulator -= this.stepSeconds;
      this.totalSteps += 1;
      steps += 1;
    }

    // A2R intentionally does not discard simulation debt. With no continuous
    // authority correction, throwing away a fixed tick creates permanent phase
    // drift. Catch-up remains CPU-bounded per render advance; excess debt is
    // carried into later frames and remains observable as backlogSteps.
    this.backlogSteps = Math.max(0, Math.floor((this.accumulator + EPS) / this.stepSeconds));
    this.maxBacklogSteps = Math.max(this.maxBacklogSteps, this.backlogSteps);

    if (Math.abs(this.accumulator) < EPS) this.accumulator = 0;
    return { steps, droppedSteps: 0, backlogSteps: this.backlogSteps, remainderSeconds: this.accumulator };
  }
}
