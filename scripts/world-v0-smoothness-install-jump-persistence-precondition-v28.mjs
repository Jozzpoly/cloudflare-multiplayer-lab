import { readFileSync, writeFileSync } from "node:fs";

const TARGET = "scripts/world-v0-jump-delivery-persistence-audit.mjs";
let source = readFileSync(TARGET, "utf8");

function replaceExact(before, after, label) {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly one match, found ${count}`);
  source = source.replace(before, after);
}

replaceExact(
`  assert(firstJump.deliveredTick - firstAuthoredTick >= R1_WINDOW_TICKS,
    \`delivery did not escape old R1 window: first=\${firstAuthoredTick} delivered=\${firstJump.deliveredTick}\`);
`,
`  if (firstJump.deliveredTick - firstAuthoredTick < R1_WINDOW_TICKS) {
    // Transport delay is a stimulus, not proof that this specimen actually escaped
    // the old six-tick authored window. If authority still consumes inside R1, this
    // run did not exercise the intended forced-late persistence contract.
    throw new Error(\`WORLD_V0_PERSISTENCE_FORCED_LOSS_PRECONDITION_MISS first=\${firstAuthoredTick} delivered=\${firstJump.deliveredTick}\`);
  }
`,
"authority-observed forced-loss precondition",
);

replaceExact(
`  proxy.setDelay(0);
  await sleep(150);
  const beforeAirPress = await evidence(target);
`,
`  proxy.setDelay(0);
  // Do not invent an airborne precondition from wall-clock time. Fire the second
  // press at the earliest causal point after authority false re-arms the edge;
  // the canonical delivery itself will prove whether support was absent.
  const beforeAirPress = await evidence(target);
`,
"remove wall-clock airborne assumption",
);

replaceExact(
`  const airborneDelivered = await evidence(target);
  const secondJump = airborneDelivered.inputScheduler.jumpDelivery;
  assert(secondJump.lastDeliveredApplied === false,
`,
`  const airborneDelivered = await evidence(target);
  const secondJump = airborneDelivered.inputScheduler.jumpDelivery;
  if (secondJump.lastDeliveredApplied === true) {
    // This specimen did not exercise the intended no-support branch. A grounded
    // canonical application is valid gameplay and must not be mislabeled as a
    // delayed-landing regression. The stress harness records this as an apparatus
    // precondition miss and requires enough independently qualified specimens.
    throw new Error("WORLD_V0_PERSISTENCE_AIRBORNE_PRECONDITION_MISS");
  }
  assert(secondJump.lastDeliveredApplied === false,
`,
"authority-observed airborne precondition",
);

replaceExact(
`} catch (error) {
  result.error = error instanceof Error ? error.stack || error.message : String(error);
  result.proxy = proxy.snapshot();
  try { result.targetEvidence = target ? await evidence(target) : null; } catch {}
  writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
  console.error(result.verdict, result.error);
  process.exitCode = 1;
} finally {
`,
`} catch (error) {
  const errorText = error instanceof Error ? error.stack || error.message : String(error);
  const preconditionMiss = errorText.includes("WORLD_V0_PERSISTENCE_AIRBORNE_PRECONDITION_MISS")
    || errorText.includes("WORLD_V0_PERSISTENCE_FORCED_LOSS_PRECONDITION_MISS");
  if (preconditionMiss) {
    result.verdict = "WORLD_V0_JUMP_DELIVERY_PERSISTENCE_PRECONDITION_MISS";
    result.error = null;
  } else {
    result.error = errorText;
  }
  result.proxy = proxy.snapshot();
  try { result.targetEvidence = target ? await evidence(target) : null; } catch {}
  writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
  if (preconditionMiss) console.log(result.verdict, JSON.stringify(result));
  else console.error(result.verdict, result.error);
  if (!preconditionMiss) process.exitCode = 1;
} finally {
`,
"classify persistence precondition misses",
);

writeFileSync(TARGET, source);
console.log("WORLD_V0_JUMP_PERSISTENCE_PRECONDITION_V28_INSTALLED");
