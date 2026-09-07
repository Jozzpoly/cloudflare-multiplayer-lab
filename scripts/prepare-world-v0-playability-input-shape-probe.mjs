import { readFileSync, writeFileSync } from "node:fs";

const INPUT = "scripts/world-v0-playability-pressure-probe.mjs";
const OUTPUT = "scripts/.world-v0-playability-input-shape-probe.mjs";
let source = readFileSync(INPUT, "utf8");

function replaceOnce(before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`${label}: anchor not found`);
  if (source.indexOf(before, first + before.length) >= 0) throw new Error(`${label}: anchor not unique`);
  source = source.slice(0, first) + after + source.slice(first + before.length);
}

replaceOnce(
  `function validate(end, label) {`,
  `async function measureLocalResponse(client) {
  await evaluate(client, \`window.__sharedYardV0PlayabilityTest.stopDrive(); true\`);
  await sleep(350);
  const before = await evaluate(client, \`window.__sharedYardV0PlayabilityTest.probe()\`);
  const startTick = before?.simulationProbe?.boundaryTick;
  const startedAt = Date.now();
  await evaluate(client, \`window.__sharedYardV0PlayabilityTest.setDrive({ x: 0, z: -1, yaw: 0 }); true\`);
  const reached = await waitFor(
    client,
    \`(() => { const p = window.__sharedYardV0PlayabilityTest?.probe(); const v = p?.simulationProbe?.linearVelocity; return v && Math.hypot(v[0], v[2]) >= 0.5 ? p : null; })()\`,
    \`client ${client.index} local response\`,
    12_000,
  );
  await evaluate(client, \`window.__sharedYardV0PlayabilityTest.stopDrive(); true\`);
  return {
    startBoundaryTick: startTick,
    responseBoundaryTick: reached?.simulationProbe?.boundaryTick ?? null,
    boundaryTickDelay: Number.isInteger(startTick) && Number.isInteger(reached?.simulationProbe?.boundaryTick)
      ? reached.simulationProbe.boundaryTick - startTick
      : null,
    wallClockMs: Date.now() - startedAt,
    responseVelocity: reached?.simulationProbe?.linearVelocity ?? null,
  };
}

function observabilityDelta(start, end) {
  const a = start?.playabilityObservability;
  const b = end?.playabilityObservability;
  if (!a || !b) return null;
  const distance = {};
  for (const key of ["self", "remote", "prop"]) {
    distance[key] = {};
    for (const field of ["total", "over001", "over005", "over010", "over025"]) {
      distance[key][field] = (b.distance?.[key]?.[field] || 0) - (a.distance?.[key]?.[field] || 0);
    }
  }
  return {
    correctionCount: (b.correctionCount || 0) - (a.correctionCount || 0),
    correctionDurationMs: (b.correctionDurationMs || 0) - (a.correctionDurationMs || 0),
    rewindTicks: (b.rewindTicks || 0) - (a.rewindTicks || 0),
    replaySteps: (b.replaySteps || 0) - (a.replaySteps || 0),
    byReason: {
      "peer-record": (b.byReason?.["peer-record"] || 0) - (a.byReason?.["peer-record"] || 0),
      "authority-consumed": (b.byReason?.["authority-consumed"] || 0) - (a.byReason?.["authority-consumed"] || 0),
      other: (b.byReason?.other || 0) - (a.byReason?.other || 0),
    },
    distance,
  };
}

function validate(end, label) {`,
  "response and severity helpers",
);

replaceOnce(
  `    frameMaxMs: end.frame?.maxMs ?? null,
  };`,
  `    frameMaxMs: end.frame?.maxMs ?? null,
    observability: observabilityDelta(start, end),
    authoredDelta: (end.inputScheduler?.authored || 0) - (start.inputScheduler?.authored || 0),
    supersededDelta: (end.inputScheduler?.superseded || 0) - (start.inputScheduler?.superseded || 0),
  };`,
  "summary observability",
);

replaceOnce(
  `document.readyState === "complete" && typeof window.__sharedYardV0Evidence === "function" && document.querySelector("#enter")?.disabled === false`,
  `document.readyState === "complete" && typeof window.__sharedYardV0Evidence === "function" && window.__sharedYardV0PlayabilityTest?.revision === "world-v0-playability-observability-v1" && document.querySelector("#enter")?.disabled === false`,
  "boot requires test hook",
);

const oldWorkload = `  start = await Promise.all(clients.map(evidence));
  assert(start[0].identity.worldEpoch === start[1].identity.worldEpoch, "clients started different epochs");
  assert(start[0].identity.simBuildId === start[1].identity.simBuildId, "clients started different SimBuildId values");

  const patternA = ["KeyD", "KeyW", "KeyA", "KeyS"];
  const patternB = ["KeyA", "KeyS", "KeyD", "KeyW"];
  let prevA = null;
  let prevB = null;
  for (let i = 0; i < CHANGE_COUNT; i += 1) {
    const nextA = patternA[i % patternA.length];
    const nextB = patternB[i % patternB.length];
    await Promise.all([
      switchDirection(clients[0], prevA, nextA),
      switchDirection(clients[1], prevB, nextB),
    ]);
    prevA = nextA;
    prevB = nextB;
    await sleep(CHANGE_INTERVAL_MS);
  }
  await Promise.all([
    switchDirection(clients[0], prevA, null),
    switchDirection(clients[1], prevB, null),
  ]);
  await sleep(1400);

  await Promise.all(clients.map((client, index) => waitFor(
    client,
    \`(() => { const e = window.__sharedYardV0Evidence?.(); return e && !e.runtimeFailed && e.metrics?.guardMismatches === 0 && e.metrics?.guardPending === 0; })()\`,
    \`client \${index} pressure drain\`,
  )));
  end = await Promise.all(clients.map(evidence));`;

const newWorkload = `  assert((await evidence(clients[0])).identity.worldEpoch === (await evidence(clients[1])).identity.worldEpoch, "clients started different epochs");
  assert((await evidence(clients[0])).identity.simBuildId === (await evidence(clients[1])).identity.simBuildId, "clients started different SimBuildId values");

  const localResponse = [];
  for (const client of clients) localResponse.push(await measureLocalResponse(client));
  await sleep(700);
  start = await Promise.all(clients.map(evidence));

  const DRIVE_MS = Number(process.env.MW_WORLD_V0_INPUT_SHAPE_DRIVE_MS || 6000);
  const DRIVE_INTERVAL_MS = Number(process.env.MW_WORLD_V0_INPUT_SHAPE_INTERVAL_MS || 16);
  await Promise.all(clients.map((client, index) => evaluate(client, \`(() => {
    window.__mwInputShapeDone = false;
    const phase = \${index ? Math.PI : 0};
    const started = performance.now();
    const timer = setInterval(() => {
      const elapsed = performance.now() - started;
      const yaw = phase + elapsed / 1000 * 1.25;
      window.__sharedYardV0PlayabilityTest.setDrive({ x: 0, z: -1, yaw });
      if (elapsed >= \${DRIVE_MS}) {
        clearInterval(timer);
        window.__sharedYardV0PlayabilityTest.stopDrive();
        window.__mwInputShapeDone = true;
      }
    }, \${DRIVE_INTERVAL_MS});
    return true;
  })()\`)));
  await Promise.all(clients.map((client, index) => waitFor(client, \`window.__mwInputShapeDone === true\`, \`client \${index} continuous input shape\`, DRIVE_MS + 15_000)));
  await sleep(1800);
  end = await Promise.all(clients.map(evidence));
  result.localResponse = localResponse;
  result.driveMs = DRIVE_MS;
  result.driveIntervalMs = DRIVE_INTERVAL_MS;`;
replaceOnce(oldWorkload, newWorkload, "continuous input workload");

replaceOnce(
  `verdict: "WORLD_V0_PLAYABILITY_PRESSURE_FAIL",`,
  `verdict: "WORLD_V0_PLAYABILITY_INPUT_SHAPE_FAIL",`,
  "initial verdict",
);
replaceOnce(
  `verdict: "WORLD_V0_PLAYABILITY_PRESSURE_PASS",`,
  `verdict: "WORLD_V0_PLAYABILITY_INPUT_SHAPE_PASS",`,
  "pass verdict",
);
replaceOnce(
  `console.log("WORLD_V0_PLAYABILITY_PRESSURE_PASS", JSON.stringify(result.aggregate));`,
  `console.log("WORLD_V0_PLAYABILITY_INPUT_SHAPE_PASS", JSON.stringify({ aggregate: result.aggregate, localResponse: result.localResponse }));`,
  "pass marker",
);

writeFileSync(OUTPUT, source);
console.log("WORLD_V0_PLAYABILITY_INPUT_SHAPE_PROBE_PREPARED", OUTPUT);
