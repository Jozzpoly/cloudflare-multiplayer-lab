import { readFileSync, writeFileSync } from "node:fs";

const TARGET = "scripts/world-v0-smoothness-jump-rapid-repress-probe.mjs";
let source = readFileSync(TARGET, "utf8");

function replaceExact(before, after, label) {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly one match, found ${count}`);
  source = source.replace(before, after);
}

replaceExact(
`const STRESS_MS = Number(process.env.MW_WORLD_V0_RAPID_STRESS_MS || "4000");
`,
`const STRESS_MS = Number(process.env.MW_WORLD_V0_RAPID_STRESS_MS || "4000");
const ATTEMPT_MS = Number(process.env.MW_WORLD_V0_RAPID_ATTEMPT_MS || "200");
`,
"fixed-attempt cadence option",
);

replaceExact(
`  const state = { presses: [], deliveries: [], transitions: [], lastSig: null, lastDeliveredSequence: 0, startedAt: performance.now() };
`,
`  const state = {
    attempts: [], presses: [], deliveries: [], transitions: [],
    lastSig: null, lastDeliveredSequence: 0, startedAt: performance.now(),
    attemptIntervalMs: \${ATTEMPT_MS}, nextAttemptAt: performance.now(),
  };
`,
"rapid driver fixed-attempt state",
);

replaceExact(
`    if (j.edgeArmed && !j.pending) {
      const before = {
        priorDeliveredSequence: j.deliveredSequence,
        priorDeliveredTick: j.deliveredTick,
        priorLastAuthoredTick: j.lastAuthoredTick,
        rearmedTick: j.rearmedTick,
      };
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ', bubbles: true, cancelable: true }));
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', key: ' ', bubbles: true, cancelable: true }));
      const after = window.__sharedYardV0Evidence?.()?.inputScheduler?.jumpDelivery;
      if (after?.pressSequence > j.pressSequence) {
        state.presses.push({ t: performance.now(), boundary: e.localBoundaryTick, sequence: after.pressSequence, ...before });
      }
    }
`,
`    const now = performance.now();
    if (now >= state.nextAttemptAt) {
      while (state.nextAttemptAt <= now) state.nextAttemptAt += state.attemptIntervalMs;
      const before = {
        priorDeliveredSequence: j.deliveredSequence,
        priorDeliveredTick: j.deliveredTick,
        priorLastAuthoredTick: j.lastAuthoredTick,
        rearmedTick: j.rearmedTick,
      };
      const beforeSequence = j.pressSequence;
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ', bubbles: true, cancelable: true }));
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', key: ' ', bubbles: true, cancelable: true }));
      const after = window.__sharedYardV0Evidence?.()?.inputScheduler?.jumpDelivery;
      const accepted = Boolean(after && after.pressSequence > beforeSequence);
      state.attempts.push({
        t: now,
        boundary: e.localBoundaryTick,
        pendingBefore: Boolean(j.pending),
        edgeArmedBefore: Boolean(j.edgeArmed),
        pressSequenceBefore: beforeSequence,
        accepted,
        acceptedSequence: accepted ? after.pressSequence : null,
        ...before,
      });
      if (accepted) {
        state.presses.push({ t: performance.now(), boundary: e.localBoundaryTick, sequence: after.pressSequence, ...before });
      }
    }
`,
"state-independent fixed user attempt schedule",
);

replaceExact(
`  const presses = trace?.presses || [];
  const deliveries = trace?.deliveries || [];
`,
`  const attempts = trace?.attempts || [];
  const presses = trace?.presses || [];
  const deliveries = trace?.deliveries || [];
`,
"fixed-attempt trace extraction",
);

replaceExact(
`  assert(presses.length >= 2, \`insufficient accepted presses: \${presses.length}\`);

  const summary = {
    runKey,
`,
`  assert(attempts.length >= 8, \`insufficient fixed user attempts: \${attempts.length}\`);
  assert(presses.length >= 2, \`insufficient accepted presses: \${presses.length}\`);

  const acceptedAttempts = attempts.filter((attempt) => attempt.accepted);
  const rejectedPendingAttempts = attempts.filter((attempt) => !attempt.accepted && attempt.pendingBefore);
  const rejectedUnarmedAttempts = attempts.filter((attempt) => !attempt.accepted && !attempt.edgeArmedBefore);
  const summary = {
    runKey,
    attempts: attempts.length,
    acceptedAttempts: acceptedAttempts.length,
    acceptanceRatio: attempts.length ? acceptedAttempts.length / attempts.length : null,
    rejectedPendingAttempts: rejectedPendingAttempts.length,
    rejectedUnarmedAttempts: rejectedUnarmedAttempts.length,
    attemptIntervalMs: ATTEMPT_MS,
`,
"fixed-attempt summary metrics",
);

writeFileSync(TARGET, source);
console.log("WORLD_V0_JUMP_FIXED_ATTEMPT_V28_INSTALLED");
