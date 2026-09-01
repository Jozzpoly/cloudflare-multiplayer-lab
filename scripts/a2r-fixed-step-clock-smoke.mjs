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
  if (Math.abs(clock.totalSteps - 600) > 1) throw new Error(`${fps} FPS produced ${clock.totalSteps} steps, expected ~600`);
}

const stallClock = new FixedStepClock({ stepSeconds: DT, maxStepsPerAdvance: 8 });
for (let i = 0; i < 60; i += 1) stallClock.advance(DT, () => {});
const beforeStall = stallClock.totalSteps;
const stall = stallClock.advance(0.25, () => {});
if (stall.steps !== 8) throw new Error(`250ms stall executed ${stall.steps} steps, expected bounded 8`);
if (stall.droppedSteps !== 7) throw new Error(`250ms stall reported ${stall.droppedSteps} dropped steps, expected 7`);
if (stallClock.totalSteps !== beforeStall + 8) throw new Error("stall step accounting mismatch");
if (stallClock.totalDroppedSteps !== 7) throw new Error("stall dropped-step total mismatch");

const longStall = stallClock.advance(2, () => {});
if (longStall.steps !== 8) throw new Error(`2s stall executed ${longStall.steps} steps, expected bounded 8`);
if (longStall.droppedSteps < 100) throw new Error(`2s stall hid dropped time: ${longStall.droppedSteps} steps`);

console.log(`A2R fixed-step clock smoke PASS · normal cadences 0 dropped · 250ms stall ${stall.droppedSteps} dropped · 2s stall ${longStall.droppedSteps} dropped`);
