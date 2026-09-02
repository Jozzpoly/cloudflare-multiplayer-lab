import { writeFileSync } from "node:fs";
import Box3D from "box3d.js/inline";

const b3 = await Box3D();

const REVISION = "ws0-tick-domain-t4-late-input-resim-oracle-v1";
const FIXED_DT = 1 / 60;
const STEP_MS = 1000 / 60;
const SUBSTEPS = 4;
const PLAYER_SPEED = 5.2;
const PLAYER_ACCELERATION = 28;
const PLAYER_DECELERATION = 36;
const PLAYER_RADIUS = 0.35;
const PROP_COUNT = 12;
const EPS = 1e-9;
const PRE_ROLL_TICKS = 60;
const PHASES_MS = [0, STEP_MS * 0.25, STEP_MS * 0.5, STEP_MS * 0.75];
const DELAYS_MS = [65, 85];
const POLICIES = ["late-live", "late-resim"];
const OUTPUT = process.env.WS0_TICK_T4_OUTPUT || "ws0-tick-domain-t4-late-input-resim-oracle.json";

const STARTS = {
  A: [-6.5, 0.82, -1.4],
  B: [6.5, 0.82, 0],
};

const SCENARIOS = [
  {
    name: "approach-no-contact",
    durationMs: 5800,
    a: [
      { atMs: 0, x: 0, z: 1 },
      { atMs: 360, x: 0, z: 0 },
      { atMs: 600, x: 0, z: 1 },
      { atMs: 1500, x: 0, z: 0 },
      { atMs: 1800, x: 1, z: 0 },
      { atMs: 2800, x: 0, z: 0 },
    ],
    b: [
      { atMs: 0, x: 0, z: 0 },
      { atMs: 600, x: 0, z: 1 },
      { atMs: 1500, x: 0, z: 0 },
      { atMs: 1800, x: -1, z: 0 },
      { atMs: 2800, x: 0, z: 0 },
    ],
  },
  {
    name: "player-contact-only",
    durationMs: 7200,
    a: [
      { atMs: 0, x: 0, z: 1 },
      { atMs: 360, x: 0, z: 0 },
      { atMs: 600, x: 0, z: 1 },
      { atMs: 1500, x: 0, z: 0 },
      { atMs: 1800, x: 1, z: 0 },
      { atMs: 4300, x: 0, z: 0 },
    ],
    b: [
      { atMs: 0, x: 0, z: 0 },
      { atMs: 600, x: 0, z: 1 },
      { atMs: 1500, x: 0, z: 0 },
      { atMs: 1800, x: -1, z: 0 },
      { atMs: 4300, x: 0, z: 0 },
    ],
  },
];

function distance3(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function horizontalDistance(a, b) {
  return Math.hypot(a[0] - b[0], a[2] - b[2]);
}

function percentile(values, p) {
  if (!values.length) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1));
  return sorted[index];
}

function median(values) {
  return percentile(values, 0.5);
}

function moveToward2(currentX, currentZ, targetX, targetZ, maxDelta) {
  const dx = targetX - currentX;
  const dz = targetZ - currentZ;
  const distance = Math.hypot(dx, dz);
  if (distance <= maxDelta || distance < EPS) return [targetX, targetZ];
  const scale = maxDelta / distance;
  return [currentX + dx * scale, currentZ + dz * scale];
}

function createStaticBox(world, position, halfExtents) {
  const bodyDef = b3.b3DefaultBodyDef();
  bodyDef.position = [...position];
  const body = b3.b3CreateBody(world, bodyDef);
  b3.b3CreateBoxShape(body, b3.b3DefaultShapeDef(), halfExtents[0], halfExtents[1], halfExtents[2]);
}

function createActorBody(world, start) {
  const bodyDef = b3.b3DefaultBodyDef();
  bodyDef.type = b3.b3BodyType.b3_dynamicBody;
  bodyDef.position = [...start];
  bodyDef.linearDamping = 0.3;
  bodyDef.angularDamping = 8;
  const body = b3.b3CreateBody(world, bodyDef);
  const shapeDef = b3.b3DefaultShapeDef();
  shapeDef.density = 80;
  shapeDef.baseMaterial.friction = 0.8;
  shapeDef.baseMaterial.restitution = 0.02;
  b3.b3CreateCapsuleShape(body, shapeDef, {
    center1: [0, -0.45, 0],
    center2: [0, 0.45, 0],
    radius: PLAYER_RADIUS,
  });
  b3.b3Body_SetMotionLocks(body, {
    linearX: false,
    linearY: false,
    linearZ: false,
    angularX: true,
    angularY: true,
    angularZ: true,
  });
  return body;
}

function createSimulation({ actorOrder = ["A", "B"], applyOrder = ["A", "B"] } = {}) {
  const worldDef = b3.b3DefaultWorldDef();
  worldDef.gravity = [0, -20, 0];
  const world = b3.b3CreateWorld(worldDef);

  createStaticBox(world, [0, -0.5, 0], [10, 0.5, 10]);
  createStaticBox(world, [-9.5, 1.5, 0], [0.5, 2, 10]);
  createStaticBox(world, [9.5, 1.5, 0], [0.5, 2, 10]);
  createStaticBox(world, [0, 1.5, -9.5], [10, 2, 0.5]);
  createStaticBox(world, [0, 1.5, 9.5], [10, 2, 0.5]);

  const props = [];
  for (let index = 0; index < PROP_COUNT; index += 1) {
    const col = index % 4;
    const row = Math.floor(index / 4);
    const initial = [(col - 1.5) * 1.05, 0.46, (row - 1) * 1.05];
    const bodyDef = b3.b3DefaultBodyDef();
    bodyDef.type = b3.b3BodyType.b3_dynamicBody;
    bodyDef.position = [...initial];
    bodyDef.linearDamping = 0.08;
    bodyDef.angularDamping = 0.12;
    const body = b3.b3CreateBody(world, bodyDef);
    const shapeDef = b3.b3DefaultShapeDef();
    shapeDef.density = 22;
    shapeDef.baseMaterial.friction = 0.72;
    shapeDef.baseMaterial.restitution = 0.04;
    b3.b3CreateBoxShape(body, shapeDef, 0.46, 0.46, 0.46);
    props.push({ id: `prop-${index}`, body, initial });
  }

  const actors = new Map();
  for (const id of actorOrder) actors.set(id, createActorBody(world, STARTS[id]));

  return {
    world,
    actors,
    props,
    applyOrder: [...applyOrder],
    inputs: { A: { x: 0, z: 0 }, B: { x: 0, z: 0 } },
  };
}

function destroySimulation(sim) {
  b3.b3DestroyWorld(sim.world);
}

function bodyPosition(body) {
  const out = [0, 0, 0];
  b3.b3Body_GetPosition(out, body);
  return [...out];
}

function bodyVelocity(body) {
  const out = [0, 0, 0];
  b3.b3Body_GetLinearVelocity(out, body);
  return [...out];
}

function actorState(sim, id) {
  const body = sim.actors.get(id);
  return { position: bodyPosition(body), velocity: bodyVelocity(body) };
}

function applyIntent(body, input) {
  const velocity = bodyVelocity(body);
  const hasInput = Math.hypot(input.x, input.z) > 0.01;
  const targetX = input.x * PLAYER_SPEED;
  const targetZ = input.z * PLAYER_SPEED;
  const acceleration = hasInput ? PLAYER_ACCELERATION : PLAYER_DECELERATION;
  const [nextX, nextZ] = moveToward2(
    velocity[0],
    velocity[2],
    targetX,
    targetZ,
    acceleration * FIXED_DT,
  );
  b3.b3Body_SetLinearVelocity(body, [nextX, velocity[1], nextZ]);
}

function stepSimulation(sim) {
  for (const id of sim.applyOrder) applyIntent(sim.actors.get(id), sim.inputs[id]);
  b3.b3World_Step(sim.world, FIXED_DT, SUBSTEPS);
}

function applyEvents(events, cursor, dueMs, inputs, actorId, limit = events.length) {
  while (cursor.index < limit && cursor.index < events.length && events[cursor.index].atMs <= dueMs + EPS) {
    const event = events[cursor.index];
    inputs[actorId] = { x: event.x, z: event.z };
    cursor.index += 1;
  }
}

function countArrivals(events, cursor, arrivalDueMs) {
  let count = 0;
  while (cursor.index < events.length && events[cursor.index].atMs <= arrivalDueMs + EPS) {
    cursor.index += 1;
    count += 1;
  }
  return count;
}

function maxPropMovement(sim) {
  let max = 0;
  for (const prop of sim.props) {
    const p = bodyPosition(prop.body);
    max = Math.max(max, Math.hypot(p[0] - prop.initial[0], p[2] - prop.initial[2]));
  }
  return max;
}

function createClientSimulation(selfId) {
  return selfId === "A"
    ? createSimulation({ actorOrder: ["A", "B"], applyOrder: ["A", "B"] })
    : createSimulation({ actorOrder: ["B", "A"], applyOrder: ["B", "A"] });
}

function preRoll(sim) {
  for (let tick = 0; tick < PRE_ROLL_TICKS; tick += 1) stepSimulation(sim);
}

function rebuildClientThroughTick({ selfId, selfTrace, remoteId, remoteTrace, knownRemoteCount, throughTick }) {
  const sim = createClientSimulation(selfId);
  preRoll(sim);
  const selfCursor = { index: 0 };
  const remoteSourceCursor = { index: 0 };
  for (let tick = 0; tick <= throughTick; tick += 1) {
    const tMs = tick * STEP_MS;
    applyEvents(selfTrace, selfCursor, tMs, sim.inputs, selfId);
    applyEvents(remoteTrace, remoteSourceCursor, tMs, sim.inputs, remoteId, knownRemoteCount);
    stepSimulation(sim);
  }
  return sim;
}

function createClientRuntime(selfId, selfTrace, remoteId, remoteTrace, policy) {
  const sim = createClientSimulation(selfId);
  preRoll(sim);
  return {
    selfId,
    remoteId,
    selfTrace,
    remoteTrace,
    policy,
    sim,
    selfCursor: { index: 0 },
    arrivalCursor: { index: 0 },
    knownRemoteCount: 0,
    resimCount: 0,
    replayedTicks: 0,
    maxReplayTicks: 0,
    correctionSelfPosition: [],
    correctionSelfVelocity: [],
    correctionRemotePosition: [],
    correctionRemoteVelocity: [],
  };
}

function destroyClientRuntime(runtime) {
  destroySimulation(runtime.sim);
}

function advanceClient(runtime, tick, delayMs, phaseMs) {
  const tMs = tick * STEP_MS;
  applyEvents(runtime.selfTrace, runtime.selfCursor, tMs, runtime.sim.inputs, runtime.selfId);

  const newlyArrived = countArrivals(
    runtime.remoteTrace,
    runtime.arrivalCursor,
    tMs - delayMs - phaseMs,
  );
  runtime.knownRemoteCount += newlyArrived;

  if (runtime.policy === "late-live") {
    const latestKnown = runtime.knownRemoteCount > 0
      ? runtime.remoteTrace[runtime.knownRemoteCount - 1]
      : null;
    if (newlyArrived > 0 && latestKnown) {
      runtime.sim.inputs[runtime.remoteId] = { x: latestKnown.x, z: latestKnown.z };
    }
    stepSimulation(runtime.sim);
    return { resimulated: false, newlyArrived };
  }

  if (newlyArrived === 0) {
    stepSimulation(runtime.sim);
    return { resimulated: false, newlyArrived: 0 };
  }

  const latestKnown = runtime.remoteTrace[runtime.knownRemoteCount - 1];
  runtime.sim.inputs[runtime.remoteId] = { x: latestKnown.x, z: latestKnown.z };
  stepSimulation(runtime.sim);
  const before = {
    self: actorState(runtime.sim, runtime.selfId),
    remote: actorState(runtime.sim, runtime.remoteId),
  };

  const rebuilt = rebuildClientThroughTick({
    selfId: runtime.selfId,
    selfTrace: runtime.selfTrace,
    remoteId: runtime.remoteId,
    remoteTrace: runtime.remoteTrace,
    knownRemoteCount: runtime.knownRemoteCount,
    throughTick: tick,
  });
  const after = {
    self: actorState(rebuilt, runtime.selfId),
    remote: actorState(rebuilt, runtime.remoteId),
  };

  runtime.correctionSelfPosition.push(distance3(before.self.position, after.self.position));
  runtime.correctionSelfVelocity.push(horizontalDistance(before.self.velocity, after.self.velocity));
  runtime.correctionRemotePosition.push(distance3(before.remote.position, after.remote.position));
  runtime.correctionRemoteVelocity.push(horizontalDistance(before.remote.velocity, after.remote.velocity));
  runtime.resimCount += 1;
  runtime.replayedTicks += tick + 1;
  runtime.maxReplayTicks = Math.max(runtime.maxReplayTicks, tick + 1);

  destroySimulation(runtime.sim);
  runtime.sim = rebuilt;
  return { resimulated: true, newlyArrived };
}

function summarizeClient(runtime) {
  const summarize = (values) => ({
    count: values.length,
    median: median(values),
    p95: percentile(values, 0.95),
    max: values.length ? Math.max(...values) : 0,
  });
  return {
    selfId: runtime.selfId,
    remoteId: runtime.remoteId,
    resimCount: runtime.resimCount,
    replayedTicks: runtime.replayedTicks,
    maxReplayTicks: runtime.maxReplayTicks,
    selfPositionCorrection: summarize(runtime.correctionSelfPosition),
    selfVelocityCorrection: summarize(runtime.correctionSelfVelocity),
    remotePositionCorrection: summarize(runtime.correctionRemotePosition),
    remoteVelocityCorrection: summarize(runtime.correctionRemoteVelocity),
  };
}

function runCell({ scenario, delayMs, phaseMs, policy }) {
  const authority = createSimulation({ actorOrder: ["A", "B"], applyOrder: ["A", "B"] });
  preRoll(authority);
  const authorityCursor = { A: { index: 0 }, B: { index: 0 } };
  const clientA = createClientRuntime("A", scenario.a, "B", scenario.b, policy);
  const clientB = createClientRuntime("B", scenario.b, "A", scenario.a, policy);

  const splitSamples = [];
  const authorityResidualSamples = [];
  let resimTicks = 0;

  try {
    const totalTicks = Math.ceil(scenario.durationMs / STEP_MS) + 1;
    for (let tick = 0; tick < totalTicks; tick += 1) {
      const tMs = tick * STEP_MS;
      applyEvents(scenario.a, authorityCursor.A, tMs, authority.inputs, "A");
      applyEvents(scenario.b, authorityCursor.B, tMs, authority.inputs, "B");
      stepSimulation(authority);

      const aAdvance = advanceClient(clientA, tick, delayMs, phaseMs);
      const bAdvance = advanceClient(clientB, tick, delayMs, phaseMs);
      if (aAdvance.resimulated || bAdvance.resimulated) resimTicks += 1;

      const aOnA = actorState(clientA.sim, "A");
      const aOnB = actorState(clientB.sim, "A");
      const bOnA = actorState(clientA.sim, "B");
      const bOnB = actorState(clientB.sim, "B");
      const authA = actorState(authority, "A");
      const authB = actorState(authority, "B");

      const actorA = distance3(aOnA.position, aOnB.position);
      const actorB = distance3(bOnB.position, bOnA.position);
      splitSamples.push(Math.max(actorA, actorB));

      authorityResidualSamples.push(Math.max(
        distance3(aOnA.position, authA.position),
        distance3(aOnB.position, authA.position),
        distance3(bOnA.position, authB.position),
        distance3(bOnB.position, authB.position),
      ));
    }

    const final = {
      authority: { A: actorState(authority, "A"), B: actorState(authority, "B") },
      clientA: { A: actorState(clientA.sim, "A"), B: actorState(clientA.sim, "B") },
      clientB: { A: actorState(clientB.sim, "A"), B: actorState(clientB.sim, "B") },
    };
    const directFinalSplit = {
      actorA: distance3(final.clientA.A.position, final.clientB.A.position),
      actorB: distance3(final.clientB.B.position, final.clientA.B.position),
    };
    const finalSeparation = {
      authority: distance3(final.authority.A.position, final.authority.B.position),
      clientA: distance3(final.clientA.A.position, final.clientA.B.position),
      clientB: distance3(final.clientB.A.position, final.clientB.B.position),
    };
    const propMovement = {
      authority: maxPropMovement(authority),
      clientA: maxPropMovement(clientA.sim),
      clientB: maxPropMovement(clientB.sim),
    };

    return {
      scenario: scenario.name,
      delayMs,
      phaseMs,
      policy,
      directFinalSplit,
      split: {
        median: median(splitSamples),
        p95: percentile(splitSamples, 0.95),
        max: Math.max(...splitSamples),
      },
      authorityResidual: {
        median: median(authorityResidualSamples),
        p95: percentile(authorityResidualSamples, 0.95),
        max: Math.max(...authorityResidualSamples),
      },
      resimTicks,
      clientA: summarizeClient(clientA),
      clientB: summarizeClient(clientB),
      finalSeparation,
      propMovement,
      final,
    };
  } finally {
    destroySimulation(authority);
    destroyClientRuntime(clientA);
    destroyClientRuntime(clientB);
  }
}

function assertGeometry(cell) {
  const maxProp = Math.max(cell.propMovement.authority, cell.propMovement.clientA, cell.propMovement.clientB);
  if (maxProp > 0.05) {
    throw new Error(`${cell.policy}/${cell.scenario}/${cell.delayMs}/${cell.phaseMs} contaminated by props: ${maxProp}`);
  }
  const minSep = Math.min(cell.finalSeparation.authority, cell.finalSeparation.clientA, cell.finalSeparation.clientB);
  const maxSep = Math.max(cell.finalSeparation.authority, cell.finalSeparation.clientA, cell.finalSeparation.clientB);
  if (cell.scenario === "approach-no-contact" && minSep < 2.0) {
    throw new Error(`${cell.policy}/${cell.scenario}/${cell.delayMs}/${cell.phaseMs} accidentally contacted: ${JSON.stringify(cell.finalSeparation)}`);
  }
  if (cell.scenario === "player-contact-only" && maxSep > 0.9) {
    throw new Error(`${cell.policy}/${cell.scenario}/${cell.delayMs}/${cell.phaseMs} failed contact: ${JSON.stringify(cell.finalSeparation)}`);
  }
}

function maxFinalSplit(cell) {
  return Math.max(cell.directFinalSplit.actorA, cell.directFinalSplit.actorB);
}

console.log(`${REVISION} · Box3D ${JSON.stringify(b3.b3GetVersion())}`);
console.log(`policies=${POLICIES.join(", ")} delays=${DELAYS_MS.join(",")} phases=${PHASES_MS.map((v) => v.toFixed(2)).join(",")}`);

const cells = [];
for (const policy of POLICIES) {
  for (const delayMs of DELAYS_MS) {
    for (const phaseMs of PHASES_MS) {
      for (const scenario of SCENARIOS) {
        const cell = runCell({ scenario, delayMs, phaseMs, policy });
        assertGeometry(cell);
        cells.push(cell);
        const maxCorrSelf = Math.max(cell.clientA.selfPositionCorrection.max, cell.clientB.selfPositionCorrection.max);
        console.log(
          `${policy.padEnd(10)} ${scenario.name.padEnd(21)} ${String(delayMs).padStart(3)}ms phase=${phaseMs.toFixed(2).padStart(5)} ` +
          `final=${maxFinalSplit(cell).toFixed(3)}m p95=${cell.split.p95.toFixed(3)}m ` +
          `authP95=${cell.authorityResidual.p95.toFixed(3)}m selfCorrMax=${maxCorrSelf.toFixed(3)}m`,
        );
      }
    }
  }
}

const summary = [];
for (const policy of POLICIES) {
  for (const delayMs of DELAYS_MS) {
    for (const scenario of SCENARIOS) {
      const group = cells.filter((cell) =>
        cell.policy === policy && cell.delayMs === delayMs && cell.scenario === scenario.name
      );
      summary.push({
        policy,
        delayMs,
        scenario: scenario.name,
        finalMedian: median(group.map(maxFinalSplit)),
        finalMax: Math.max(...group.map(maxFinalSplit)),
        splitP95Median: median(group.map((cell) => cell.split.p95)),
        splitP95Max: Math.max(...group.map((cell) => cell.split.p95)),
        authorityP95Median: median(group.map((cell) => cell.authorityResidual.p95)),
        maxSelfPositionCorrection: Math.max(...group.flatMap((cell) => [
          cell.clientA.selfPositionCorrection.max,
          cell.clientB.selfPositionCorrection.max,
        ])),
        maxSelfVelocityCorrection: Math.max(...group.flatMap((cell) => [
          cell.clientA.selfVelocityCorrection.max,
          cell.clientB.selfVelocityCorrection.max,
        ])),
        maxRemotePositionCorrection: Math.max(...group.flatMap((cell) => [
          cell.clientA.remotePositionCorrection.max,
          cell.clientB.remotePositionCorrection.max,
        ])),
        maxReplayTicks: Math.max(...group.flatMap((cell) => [
          cell.clientA.maxReplayTicks,
          cell.clientB.maxReplayTicks,
        ])),
      });
    }
  }
}

console.log("\nT4 late-input history result:");
for (const row of summary) {
  console.log(
    `${row.policy.padEnd(10)} ${row.scenario.padEnd(21)} ${row.delayMs}ms · ` +
    `final=${row.finalMedian.toFixed(3)}/${row.finalMax.toFixed(3)}m ` +
    `p95=${row.splitP95Median.toFixed(3)}/${row.splitP95Max.toFixed(3)}m ` +
    `selfCorrMax=${row.maxSelfPositionCorrection.toFixed(3)}m replayMax=${row.maxReplayTicks} ticks`,
  );
}

const evidence = {
  revision: REVISION,
  generatedAt: new Date().toISOString(),
  design: {
    baseResearchHead: "8501a6dc13f6d09b33b37d6cf2c900b718ee3241",
    controlSubstrate: "T0 deterministic three-world Box3D lab",
    box3d: "box3d.js@0.1.1",
    simulationHz: 60,
    substeps: SUBSTEPS,
    delaysMs: DELAYS_MS,
    remoteArrivalPhasesMs: PHASES_MS,
    policies: POLICIES,
    favorableAssumption: "Every received remote intent event carries enough source-time information to replay it at the correct original physics tick. This is a mechanical ceiling; the current browser protocol has not yet earned or implemented this exact timing contract.",
    resimImplementation: "No production snapshot/restore API is assumed. On each newly arrived remote input, the experiment computes the late-applied current-tick state, then reconstructs a fresh deterministic client world from the common seed and replays all self history plus all remote events known so far at their original source times through the current tick.",
    boundary: "This tests whether history-aware late-input repair attacks the persistent contact fork mechanically. It does not select a production rollback storage strategy, visual smoothing policy, protocol timestamp format, or interaction-island scope.",
  },
  cells,
  summary,
};

writeFileSync(OUTPUT, JSON.stringify(evidence, null, 2));
console.log(`\nT4 STRUCTURAL PASS · evidence written to ${OUTPUT}`);
