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
  }

  reset() {
    this.accumulator = 0;
    this.totalSteps = 0;
    this.totalDroppedSteps = 0;
  }

  advance(elapsedSeconds, step) {
    if (!Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0) {
      return { steps: 0, droppedSteps: 0, remainderSeconds: this.accumulator };
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

    let droppedSteps = 0;
    if (this.accumulator + EPS >= this.stepSeconds) {
      droppedSteps = Math.floor((this.accumulator + EPS) / this.stepSeconds);
      this.accumulator -= droppedSteps * this.stepSeconds;
      this.totalDroppedSteps += droppedSteps;
    }

    if (Math.abs(this.accumulator) < EPS) this.accumulator = 0;
    return { steps, droppedSteps, remainderSeconds: this.accumulator };
  }
}
