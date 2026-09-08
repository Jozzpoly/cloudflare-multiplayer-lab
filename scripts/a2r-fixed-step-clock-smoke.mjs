import { FixedStepClock } from "../public/world0-a2r/fixed-step-clock.js";

const DT = 1 / 60;

function simulate(frameDt, frames) {
  const clock = new FixedStepClock({ stepSeconds: DT, maxStepsPerAdvance: 8 });
  for (let i = 0; i < frames; i += 1) clock.advance(frameDt, () => {});
  return clock;
}

for (const fps of [30, 60, 90, 120, 144, 240]) {
  const seconds = 10;
  const frames = fps * seconds;
  const clock = simulate(1 / fps, frames);
  if (clock.totalDroppedSteps !== 0) throw new Error(`${fps} FPS unexpectedly dropped ${clock.totalDroppedSteps} steps`);
  if (clock.backlogSteps !== 0) throw new Error(`${fps} FPS ended with ${clock.backlogSteps} backlog steps`);
  if (Math.abs(clock.totalSteps - 600) > 1) throw new Error(`${fps} FPS produced ${clock.totalSteps} steps, expected ~600`);
}

function drainAt60Hz(clock, maxFrames = 240) {
  let frames = 0;
  while (clock.backlogSteps > 0 && frames < maxFrames) {
    clock.advance(DT, () => {});
    frames += 1;
  }
  return frames;
}

const stallClock = new FixedStepClock({ stepSeconds: DT, maxStepsPerAdvance: 8 });
for (let i = 0; i < 60; i += 1) stallClock.advance(DT, () => {});
const beforeStall = stallClock.totalSteps;
const stall = stallClock.advance(0.25, () => {});
if (stall.steps !== 8) throw new Error(`250ms stall executed ${stall.steps} steps, expected bounded 8`);
if (stall.backlogSteps !== 7) throw new Error(`250ms stall retained ${stall.backlogSteps} backlog steps, expected 7`);
if (stallClock.totalSteps !== beforeStall + 8) throw new Error("stall step accounting mismatch");
if (stallClock.totalDroppedSteps !== 0) throw new Error("250ms stall discarded simulation time");
const shortDrainFrames = drainAt60Hz(stallClock);
if (stallClock.backlogSteps !== 0) throw new Error("250ms stall backlog did not drain");

const longStall = stallClock.advance(2, () => {});
if (longStall.steps !== 8) throw new Error(`2s stall executed ${longStall.steps} steps, expected bounded 8`);
if (longStall.backlogSteps < 100) throw new Error(`2s stall failed to retain debt: ${longStall.backlogSteps} backlog steps`);
if (stallClock.totalDroppedSteps !== 0) throw new Error("2s stall discarded simulation time");
const longDrainFrames = drainAt60Hz(stallClock, 300);
if (stallClock.backlogSteps !== 0) throw new Error(`2s stall backlog did not drain: ${stallClock.backlogSteps} remaining`);

console.log(`A2R fixed-step clock smoke PASS · normal cadences 0 backlog · 250ms retained 7 and drained in ${shortDrainFrames} frames · 2s retained ${longStall.backlogSteps} and drained in ${longDrainFrames} frames · 0 dropped`);
