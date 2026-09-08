import { writeFileSync } from "node:fs";
import Box3D from "box3d.js/inline";

const b3 = await Box3D();

const REVISION = "ws0-tick-domain-t5-prop-causal-relay-v1";
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
const OUTPUT = process.env.WS0_TICK_T5_OUTPUT || "ws0-tick-domain-t5-prop-causal-relay.json";
const CONTACT_GATE_END_MS = 3500;
const RELAY_DRIVE_START_MS = 3600;

const STARTS = {
  A: [-6.5, 0.82, -1.4],
  B: [6.5, 0.82, 0],
};

const RELAY_START = [0, 0.46, 6.2];

const SCENARIO = {
  name: "player-contact-prop-relay",
  durationMs: 6500,
  a: [
    { atMs: 0, x: 0, z: 1 },
    { atMs: 360, x: 0, z: 0 },
    { atMs: 600, x: 0, z: 1 },
    { atMs: 1500, x: 0, z: 0 },
    { atMs: 1800, x: 1, z: 0 },
    { atMs: 3400, x: 0, z: 0 },
    { atMs: 3600, x: 0, z: 1 },
    { atMs: 4300, x: 0, z: 0 },
  ],
  b: [
    { atMs: 0, x: 0, z: 0 },
    { atMs: 600, x: 0, z: 1 },
    { atMs: 1500, x: 0, z: 0 },
    { atMs: 1800, x: -1, z: 0 },
    { atMs: 3400, x: 0, z: 0 },
    { atMs: 3600, x: 0, z: 1 },
    { atMs: 4300, x: 0, z: 0 },
  ],
};

function distance3(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function horizontalDistance(a, b) {
  return Math.hypot(a[0] - b[0], a[2] - b[2]);
}

function quaternionAngle(a, b) {
  const dot = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]);
  return 2 * Math.acos(Math.min(1, Math.max(-1, dot)));
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
  const d = Math.hypot(dx, dz);
  if (d <= maxDelta || d < EPS) return [targetX, targetZ];
  const scale = maxDelta / d;
  return [currentX + dx * scale, currentZ + dz * scale];
}

function createStaticBox(world, position, halfExtents) {
  const def = b3.b3DefaultBodyDef();
  def.position = [...position];
  const body = b3.b3CreateBody(world, def);
  b3.b3CreateBoxShape(body, b3.b3DefaultShapeDef(), halfExtents[0], halfExtents[1], halfExtents[2]);
}

function createDynamicBox(world, position, halfExtents, density = 22) {
  const def = b3.b3DefaultBodyDef();
  def.type = b3.b3BodyType.b3_dynamicBody;
  def.position = [...position];
  def.linearDamping = 0.08;
  def.angularDamping = 0.12;
  const body = b3.b3CreateBody(world, def);
  const shape = b3.b3DefaultShapeDef();
  shape.density = density;
  shape.baseMaterial.friction = 0.72;
  shape.baseMaterial.restitution = 0.04;
  b3.b3CreateBoxShape(body, shape, halfExtents[0], halfExtents[1], halfExtents[2]);
  return body;
}

function createActorBody(world, start) {
  const def = b3.b3DefaultBodyDef();
  def.type = b3.b3BodyType.b3_dynamicBody;
  def.position = [...start];
  def.linearDamping = 0.3;
  def.angularDamping = 8;
  const body = b3.b3CreateBody(world, def);
  const shape = b3.b3DefaultShapeDef();
  shape.density = 80;
  shape.baseMaterial.friction = 0.8;
  shape.baseMaterial.restitution = 0.02;
  b3.b3CreateCapsuleShape(body, shape, {
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
  const wd = b3.b3DefaultWorldDef();
  wd.gravity = [0, -20, 0];
  const world = b3.b3CreateWorld(wd);

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
    props.push({ id: `prop-${index}`, initial, body: createDynamicBox(world, initial, [0.46, 0.46, 0.46]) });
  }

  const relay = {
    id: "relay",
    initial: [...RELAY_START],
    body: createDynamicBox(world, RELAY_START, [0.46, 0.46, 0.46]),
  };

  const actors = new Map();
  for (const id of actorOrder) actors.set(id, createActorBody(world, STARTS[id]));

  return {
    world,
    actors,
    props,
    relay,
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

function bodyRotation(body) {
  const out = [0, 0, 0, 1];
  b3.b3Body_GetRotation(out, body);
  return [...out];
}

function actorState(sim, id) {
  const body = sim.actors.get(id);
  return { position: bodyPosition(body), velocity: bodyVelocity(body) };
}

function relayState(sim) {
  return {
    position: bodyPosition(sim.relay.body),
    velocity: bodyVelocity(sim.relay.body),
    rotation: bodyRotation(sim.relay.body),
  };
}

function applyIntent(body, input) {
  const v = bodyVelocity(body);
  const hasInput = Math.hypot(input.x, input.z) > 0.01;
  const targetX = input.x * PLAYER_SPEED;
  const targetZ = input.z * PLAYER_SPEED;
  const acceleration = hasInput ? PLAYER_ACCELERATION : PLAYER_DECELERATION;
  const [nextX, nextZ] = moveToward2(v[0], v[2], targetX, targetZ, acceleration * FIXED_DT);
  b3.b3Body_SetLinearVelocity(body, [nextX, v[1], nextZ]);
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

function countArrivals(events, cursor, dueMs) {
  let count = 0;
  while (cursor.index < events.length && events[cursor.index].atMs <= dueMs + EPS) {
    cursor.index += 1;
    count += 1;
  }
  return count;
}

function maxCentralPropMovement(sim) {
  let max = 0;
  for (const prop of sim.props) {
    const p = bodyPosition(prop.body);
    max = Math.max(max, horizontalDistance(p, prop.initial));
  }
  return max;
}

function relayDisplacement(sim) {
  return horizontalDistance(bodyPosition(sim.relay.body), sim.relay.initial);
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
  const remoteCursor = { index: 0 };
  for (let tick = 0; tick <= throughTick; tick += 1) {
    const tMs = tick * STEP_MS;
    applyEvents(selfTrace, selfCursor, tMs, sim.inputs, selfId);
    applyEvents(remoteTrace, remoteCursor, tMs, sim.inputs, remoteId, knownRemoteCount);
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
    selfPositionCorrection: [],
    remotePositionCorrection: [],
    relayPositionCorrection: [],
    relayVelocityCorrection: [],
    relayRotationCorrection: [],
  };
}

function destroyClientRuntime(runtime) {
  destroySimulation(runtime.sim);
}

function advanceClient(runtime, tick, delayMs, phaseMs) {
  const tMs = tick * STEP_MS;
  applyEvents(runtime.selfTrace, runtime.selfCursor, tMs, runtime.sim.inputs, runtime.selfId);

  const newlyArrived = countArrivals(runtime.remoteTrace, runtime.arrivalCursor, tMs - delayMs - phaseMs);
  runtime.knownRemoteCount += newlyArrived;

  if (runtime.policy === "late-live") {
    if (newlyArrived > 0) {
      const latest = runtime.remoteTrace[runtime.knownRemoteCount - 1];
      runtime.sim.inputs[runtime.remoteId] = { x: latest.x, z: latest.z };
    }
    stepSimulation(runtime.sim);
    return false;
  }

  if (newlyArrived === 0) {
    stepSimulation(runtime.sim);
    return false;
  }

  const latest = runtime.remoteTrace[runtime.knownRemoteCount - 1];
  runtime.sim.inputs[runtime.remoteId] = { x: latest.x, z: latest.z };
  stepSimulation(runtime.sim);

  const beforeSelf = actorState(runtime.sim, runtime.selfId);
  const beforeRemote = actorState(runtime.sim, runtime.remoteId);
  const beforeRelay = relayState(runtime.sim);

  const rebuilt = rebuildClientThroughTick({
    selfId: runtime.selfId,
    selfTrace: runtime.selfTrace,
    remoteId: runtime.remoteId,
    remoteTrace: runtime.remoteTrace,
    knownRemoteCount: runtime.knownRemoteCount,
    throughTick: tick,
  });

  const afterSelf = actorState(rebuilt, runtime.selfId);
  const afterRemote = actorState(rebuilt, runtime.remoteId);
  const afterRelay = relayState(rebuilt);

  runtime.selfPositionCorrection.push(distance3(beforeSelf.position, afterSelf.position));
  runtime.remotePositionCorrection.push(distance3(beforeRemote.position, afterRemote.position));
  runtime.relayPositionCorrection.push(distance3(beforeRelay.position, afterRelay.position));
  runtime.relayVelocityCorrection.push(horizontalDistance(beforeRelay.velocity, afterRelay.velocity));
  runtime.relayRotationCorrection.push(quaternionAngle(beforeRelay.rotation, afterRelay.rotation));
  runtime.resimCount += 1;
  runtime.replayedTicks += tick + 1;
  runtime.maxReplayTicks = Math.max(runtime.maxReplayTicks, tick + 1);

  destroySimulation(runtime.sim);
  runtime.sim = rebuilt;
  return true;
}

function summarize(values) {
  return {
    count: values.length,
    median: median(values),
    p95: percentile(values, 0.95),
    max: values.length ? Math.max(...values) : 0,
  };
}

function summarizeClient(runtime) {
  return {
    selfId: runtime.selfId,
    resimCount: runtime.resimCount,
    replayedTicks: runtime.replayedTicks,
    maxReplayTicks: runtime.maxReplayTicks,
    selfPositionCorrection: summarize(runtime.selfPositionCorrection),
    remotePositionCorrection: summarize(runtime.remotePositionCorrection),
    relayPositionCorrection: summarize(runtime.relayPositionCorrection),
    relayVelocityCorrection: summarize(runtime.relayVelocityCorrection),
    relayRotationCorrection: summarize(runtime.relayRotationCorrection),
  };
}

function runCell({ delayMs, phaseMs, policy }) {
  const authority = createSimulation({ actorOrder: ["A", "B"], applyOrder: ["A", "B"] });
  preRoll(authority);
  const authorityCursor = { A: { index: 0 }, B: { index: 0 } };
  const clientA = createClientRuntime("A", SCENARIO.a, "B", SCENARIO.b, policy);
  const clientB = createClientRuntime("B", SCENARIO.b, "A", SCENARIO.a, policy);

  const actorSplitSamples = [];
  const relaySplitSamples = [];
  const relayRotationSplitSamples = [];
  const relayAuthorityResidualSamples = [];
  let authorityMinPlayerSeparationBeforeRelay = Infinity;

  try {
    const totalTicks = Math.ceil(SCENARIO.durationMs / STEP_MS) + 1;
    for (let tick = 0; tick < totalTicks; tick += 1) {
      const tMs = tick * STEP_MS;
      applyEvents(SCENARIO.a, authorityCursor.A, tMs, authority.inputs, "A");
      applyEvents(SCENARIO.b, authorityCursor.B, tMs, authority.inputs, "B");
      stepSimulation(authority);

      advanceClient(clientA, tick, delayMs, phaseMs);
      advanceClient(clientB, tick, delayMs, phaseMs);

      const authA = actorState(authority, "A");
      const authB = actorState(authority, "B");
      if (tMs <= CONTACT_GATE_END_MS) {
        authorityMinPlayerSeparationBeforeRelay = Math.min(
          authorityMinPlayerSeparationBeforeRelay,
          distance3(authA.position, authB.position),
        );
      }

      const aOnA = actorState(clientA.sim, "A");
      const aOnB = actorState(clientB.sim, "A");
      const bOnA = actorState(clientA.sim, "B");
      const bOnB = actorState(clientB.sim, "B");
      actorSplitSamples.push(Math.max(
        distance3(aOnA.position, aOnB.position),
        distance3(bOnA.position, bOnB.position),
      ));

      const relayA = relayState(clientA.sim);
      const relayB = relayState(clientB.sim);
      const relayAuth = relayState(authority);
      relaySplitSamples.push(distance3(relayA.position, relayB.position));
      relayRotationSplitSamples.push(quaternionAngle(relayA.rotation, relayB.rotation));
      relayAuthorityResidualSamples.push(Math.max(
        distance3(relayA.position, relayAuth.position),
        distance3(relayB.position, relayAuth.position),
      ));
    }

    const finalActors = {
      clientA: { A: actorState(clientA.sim, "A"), B: actorState(clientA.sim, "B") },
      clientB: { A: actorState(clientB.sim, "A"), B: actorState(clientB.sim, "B") },
    };
    const finalRelayA = relayState(clientA.sim);
    const finalRelayB = relayState(clientB.sim);
    const finalRelayAuthority = relayState(authority);

    return {
      scenario: SCENARIO.name,
      delayMs,
      phaseMs,
      policy,
      authorityMinPlayerSeparationBeforeRelay,
      relayDriveStartMs: RELAY_DRIVE_START_MS,
      actorSplit: {
        final: Math.max(
          distance3(finalActors.clientA.A.position, finalActors.clientB.A.position),
          distance3(finalActors.clientA.B.position, finalActors.clientB.B.position),
        ),
        p95: percentile(actorSplitSamples, 0.95),
        max: Math.max(...actorSplitSamples),
      },
      relaySplit: {
        finalPosition: distance3(finalRelayA.position, finalRelayB.position),
        p95Position: percentile(relaySplitSamples, 0.95),
        maxPosition: Math.max(...relaySplitSamples),
        finalRotationRad: quaternionAngle(finalRelayA.rotation, finalRelayB.rotation),
        p95RotationRad: percentile(relayRotationSplitSamples, 0.95),
        maxRotationRad: Math.max(...relayRotationSplitSamples),
      },
      relayAuthorityResidual: {
        final: Math.max(
          distance3(finalRelayA.position, finalRelayAuthority.position),
          distance3(finalRelayB.position, finalRelayAuthority.position),
        ),
        p95: percentile(relayAuthorityResidualSamples, 0.95),
        max: Math.max(...relayAuthorityResidualSamples),
      },
      relayDisplacement: {
        authority: relayDisplacement(authority),
        clientA: relayDisplacement(clientA.sim),
        clientB: relayDisplacement(clientB.sim),
      },
      centralPropMovement: {
        authority: maxCentralPropMovement(authority),
        clientA: maxCentralPropMovement(clientA.sim),
        clientB: maxCentralPropMovement(clientB.sim),
      },
      clientA: summarizeClient(clientA),
      clientB: summarizeClient(clientB),
      finalRelay: {
        authority: finalRelayAuthority,
        clientA: finalRelayA,
        clientB: finalRelayB,
      },
    };
  } finally {
    destroySimulation(authority);
    destroyClientRuntime(clientA);
    destroyClientRuntime(clientB);
  }
}

function assertCell(cell) {
  if (cell.authorityMinPlayerSeparationBeforeRelay > 0.72) {
    throw new Error(`${cell.policy}/${cell.delayMs}/${cell.phaseMs}: authority player-contact gate failed: ${cell.authorityMinPlayerSeparationBeforeRelay}`);
  }
  if (cell.relayDisplacement.authority < 0.35) {
    throw new Error(`${cell.policy}/${cell.delayMs}/${cell.phaseMs}: authority relay was not materially pushed: ${cell.relayDisplacement.authority}`);
  }
  const maxCentral = Math.max(
    cell.centralPropMovement.authority,
    cell.centralPropMovement.clientA,
    cell.centralPropMovement.clientB,
  );
  if (maxCentral > 0.05) {
    throw new Error(`${cell.policy}/${cell.delayMs}/${cell.phaseMs}: central props contaminated: ${maxCentral}`);
  }
}

console.log(`${REVISION} · Box3D ${JSON.stringify(b3.b3GetVersion())}`);
console.log(`relay=${JSON.stringify(RELAY_START)} policies=${POLICIES.join(", ")} delays=${DELAYS_MS.join(",")}`);

const cells = [];
for (const policy of POLICIES) {
  for (const delayMs of DELAYS_MS) {
    for (const phaseMs of PHASES_MS) {
      const cell = runCell({ delayMs, phaseMs, policy });
      assertCell(cell);
      cells.push(cell);
      console.log(
        `${policy.padEnd(10)} ${delayMs}ms phase=${phaseMs.toFixed(2).padStart(5)} ` +
        `actorP95=${cell.actorSplit.p95.toFixed(3)}m relayFinal=${cell.relaySplit.finalPosition.toFixed(3)}m ` +
        `relayP95=${cell.relaySplit.p95Position.toFixed(3)}m relayMove=${cell.relayDisplacement.authority.toFixed(3)}m`,
      );
    }
  }
}

const summary = [];
for (const policy of POLICIES) {
  for (const delayMs of DELAYS_MS) {
    const group = cells.filter((cell) => cell.policy === policy && cell.delayMs === delayMs);
    summary.push({
      policy,
      delayMs,
      actorFinalMedian: median(group.map((cell) => cell.actorSplit.final)),
      actorP95Median: median(group.map((cell) => cell.actorSplit.p95)),
      relayFinalPositionMedian: median(group.map((cell) => cell.relaySplit.finalPosition)),
      relayFinalPositionMax: Math.max(...group.map((cell) => cell.relaySplit.finalPosition)),
      relayP95PositionMedian: median(group.map((cell) => cell.relaySplit.p95Position)),
      relayP95PositionMax: Math.max(...group.map((cell) => cell.relaySplit.p95Position)),
      relayFinalRotationMedianRad: median(group.map((cell) => cell.relaySplit.finalRotationRad)),
      relayAuthorityP95Median: median(group.map((cell) => cell.relayAuthorityResidual.p95)),
      authorityRelayDisplacementMedian: median(group.map((cell) => cell.relayDisplacement.authority)),
      maxSelfPositionCorrection: Math.max(...group.flatMap((cell) => [
        cell.clientA.selfPositionCorrection.max,
        cell.clientB.selfPositionCorrection.max,
      ])),
      maxRelayPositionCorrection: Math.max(...group.flatMap((cell) => [
        cell.clientA.relayPositionCorrection.max,
        cell.clientB.relayPositionCorrection.max,
      ])),
      maxRelayVelocityCorrection: Math.max(...group.flatMap((cell) => [
        cell.clientA.relayVelocityCorrection.max,
        cell.clientB.relayVelocityCorrection.max,
      ])),
      maxReplayTicks: Math.max(...group.flatMap((cell) => [cell.clientA.maxReplayTicks, cell.clientB.maxReplayTicks])),
    });
  }
}

console.log("\nT5 coupled-matter causal relay:");
for (const row of summary) {
  console.log(
    `${row.policy.padEnd(10)} ${row.delayMs}ms · actorP95=${row.actorP95Median.toFixed(3)}m ` +
    `relayFinal=${row.relayFinalPositionMedian.toFixed(3)}/${row.relayFinalPositionMax.toFixed(3)}m ` +
    `relayP95=${row.relayP95PositionMedian.toFixed(3)}/${row.relayP95PositionMax.toFixed(3)}m ` +
    `relayCorrMax=${row.maxRelayPositionCorrection.toFixed(3)}m`,
  );
}

const evidence = {
  revision: REVISION,
  generatedAt: new Date().toISOString(),
  design: {
    baseResearchHead: "e4fb8ef62d89fc7a21b05b241f1abcb1c3eb6a3d",
    box3d: "box3d.js@0.1.1",
    simulationHz: 60,
    substeps: SUBSTEPS,
    scenario: SCENARIO,
    relayStart: RELAY_START,
    delaysMs: DELAYS_MS,
    phasesMs: PHASES_MS,
    policies: POLICIES,
    hypothesis: "Human PLAY suggested actor fork -> different later prop contacts -> shared-matter cascade. This test forces direct player contact first, then a bounded two-player push of one dedicated dynamic relay prop, while the original central prop cluster remains an isolation control.",
    lateResimSemantics: "Same qualified T4 favorable oracle: newly known remote input is placed at original source time by deterministic replay from common seed. This is not a production rollback implementation.",
  },
  cells,
  summary,
};

writeFileSync(OUTPUT, JSON.stringify(evidence, null, 2));
console.log(`\nT5 STRUCTURAL PASS · evidence written to ${OUTPUT}`);
