import { writeFileSync } from "node:fs";
import Box3D from "box3d.js/inline";

const b3 = await Box3D();

const REVISION = "ws0-tick-domain-t2-snapshot-age-v1";
const FIXED_DT = 1 / 60;
const STEP_MS = 1000 / 60;
const SUBSTEPS = 4;
const SNAPSHOT_EVERY_TICKS = 6;
const PLAYER_SPEED = 5.2;
const PLAYER_ACCELERATION = 28;
const PLAYER_DECELERATION = 36;
const PLAYER_RADIUS = 0.35;
const CONTACT_DISTANCE = PLAYER_RADIUS * 2 + 0.005;
const PROP_COUNT = 12;
const EPS = 1e-9;
const PRE_ROLL_TICKS = 60;
const PHASES_MS = [0, STEP_MS * 0.25, STEP_MS * 0.5, STEP_MS * 0.75];
const DELAYS_MS = [65, 85];
const POLICIES = ["none", "fresh-state", "stale-state", "forecast-state"];
const OUTPUT = process.env.WS0_TICK_T2_OUTPUT || "ws0-tick-domain-t2-snapshot-age.json";

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

function horizontalSpeed(v) {
  return Math.hypot(v[0], v[2]);
}

function moveToward2(currentX, currentZ, targetX, targetZ, maxDelta) {
  const dx = targetX - currentX;
  const dz = targetZ - currentZ;
  const distance = Math.hypot(dx, dz);
  if (distance <= maxDelta || distance < EPS) return [targetX, targetZ];
  const scale = maxDelta / distance;
  return [currentX + dx * scale, currentZ + dz * scale];
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
  return [out[0], out[1], out[2]];
}

function bodyRotation(body) {
  const out = [0, 0, 0, 1];
  b3.b3Body_GetRotation(out, body);
  return [out[0], out[1], out[2], out[3]];
}

function bodyVelocity(body) {
  const out = [0, 0, 0];
  b3.b3Body_GetLinearVelocity(out, body);
  return [out[0], out[1], out[2]];
}

function actorState(sim, id) {
  const body = sim.actors.get(id);
  return {
    position: bodyPosition(body),
    rotation: bodyRotation(body),
    velocity: bodyVelocity(body),
  };
}

function applyIntent(body, input) {
  const velocity = bodyVelocity(body);
  const hasInput = Math.hypot(input.x, input.z) > 0.01;
  const targetX = input.x * PLAYER_SPEED;
  const targetZ = input.z * PLAYER_SPEED;
  const acceleration = hasInput ? PLAYER_ACCELERATION : PLAYER_DECELERATION;
  const [nextX, nextZ] = moveToward2(velocity[0], velocity[2], targetX, targetZ, acceleration * FIXED_DT);
  b3.b3Body_SetLinearVelocity(body, [nextX, velocity[1], nextZ]);
}

function stepSimulation(sim) {
  for (const id of sim.applyOrder) applyIntent(sim.actors.get(id), sim.inputs[id]);
  const preSolver = {
    A: bodyVelocity(sim.actors.get("A")),
    B: bodyVelocity(sim.actors.get("B")),
  };
  b3.b3World_Step(sim.world, FIXED_DT, SUBSTEPS);
  const postSolver = {
    A: bodyVelocity(sim.actors.get("A")),
    B: bodyVelocity(sim.actors.get("B")),
  };
  return {
    solverHorizontalDelta: {
      A: horizontalDistance(preSolver.A, postSolver.A),
      B: horizontalDistance(preSolver.B, postSolver.B),
    },
  };
}

function applyEvents(events, cursor, dueMs, inputs, actorId) {
  while (cursor.index < events.length && events[cursor.index].atMs <= dueMs + EPS) {
    const event = events[cursor.index];
    inputs[actorId] = { x: event.x, z: event.z };
    cursor.index += 1;
  }
}

function maxPropMovement(sim) {
  let max = 0;
  for (const prop of sim.props) {
    const p = bodyPosition(prop.body);
    max = Math.max(max, Math.hypot(p[0] - prop.initial[0], p[2] - prop.initial[2]));
  }
  return max;
}

function makeTriplet() {
  return {
    authority: createSimulation({ actorOrder: ["A", "B"], applyOrder: ["A", "B"] }),
    clientA: createSimulation({ actorOrder: ["A", "B"], applyOrder: ["A", "B"] }),
    clientB: createSimulation({ actorOrder: ["B", "A"], applyOrder: ["B", "A"] }),
  };
}

function destroyTriplet(triplet) {
  destroySimulation(triplet.authority);
  destroySimulation(triplet.clientA);
  destroySimulation(triplet.clientB);
}

function contactNow(sim) {
  return distance3(bodyPosition(sim.actors.get("A")), bodyPosition(sim.actors.get("B"))) <= CONTACT_DISTANCE;
}

function emptyCorrectionStats() {
  return {
    applied: 0,
    nonZero: 0,
    positionSum: 0,
    positionMax: 0,
    velocitySum: 0,
    velocityMax: 0,
  };
}

function emptyClientMetrics(selfId, remoteId) {
  return {
    selfId,
    remoteId,
    correction: emptyCorrectionStats(),
    contactCreated: 0,
    contactRemoved: 0,
    correctionExposedNextStep: false,
    exposedSelfSolverDelta: [],
    allSelfSolverDelta: [],
    minSeparation: Infinity,
    maxHorizontalSpeed: 0,
  };
}

function snapshotFromAuthority(sim, sourceTick) {
  return {
    sourceTick,
    state: {
      A: actorState(sim, "A"),
      B: actorState(sim, "B"),
    },
  };
}

function targetFromSnapshot(snapshot, actorId, policy, ageTicks) {
  const source = snapshot.state[actorId];
  if (policy !== "forecast-state") return source;
  const dt = ageTicks * FIXED_DT;
  return {
    position: [
      source.position[0] + source.velocity[0] * dt,
      source.position[1] + source.velocity[1] * dt,
      source.position[2] + source.velocity[2] * dt,
    ],
    rotation: [...source.rotation],
    velocity: [...source.velocity],
  };
}

function applyRemoteCorrection(sim, metrics, target) {
  const body = sim.actors.get(metrics.remoteId);
  const localPosition = bodyPosition(body);
  const localVelocity = bodyVelocity(body);
  const positionDelta = distance3(localPosition, target.position);
  const velocityDelta = distance3(localVelocity, target.velocity);
  const wasContact = contactNow(sim);

  b3.b3Body_SetTransform(body, target.position, target.rotation);
  b3.b3Body_SetLinearVelocity(body, target.velocity);
  b3.b3Body_SetAwake(body, true);

  const isContact = contactNow(sim);
  if (!wasContact && isContact) metrics.contactCreated += 1;
  if (wasContact && !isContact) metrics.contactRemoved += 1;

  metrics.correction.applied += 1;
  if (positionDelta > 1e-6 || velocityDelta > 1e-6) {
    metrics.correction.nonZero += 1;
    metrics.correctionExposedNextStep = true;
  }
  metrics.correction.positionSum += positionDelta;
  metrics.correction.positionMax = Math.max(metrics.correction.positionMax, positionDelta);
  metrics.correction.velocitySum += velocityDelta;
  metrics.correction.velocityMax = Math.max(metrics.correction.velocityMax, velocityDelta);
}

function recordPostStep(sim, metrics, stepEvidence) {
  const solverDelta = stepEvidence.solverHorizontalDelta[metrics.selfId];
  metrics.allSelfSolverDelta.push(solverDelta);
  if (metrics.correctionExposedNextStep) {
    metrics.exposedSelfSolverDelta.push(solverDelta);
    metrics.correctionExposedNextStep = false;
  }

  const a = actorState(sim, "A");
  const b = actorState(sim, "B");
  metrics.minSeparation = Math.min(metrics.minSeparation, distance3(a.position, b.position));
  metrics.maxHorizontalSpeed = Math.max(
    metrics.maxHorizontalSpeed,
    horizontalSpeed(a.velocity),
    horizontalSpeed(b.velocity),
  );
}

function summarizeCorrection(stats) {
  return {
    ...stats,
    positionMean: stats.applied ? stats.positionSum / stats.applied : 0,
    velocityMean: stats.applied ? stats.velocitySum / stats.applied : 0,
  };
}

function summarizeClientMetrics(metrics) {
  return {
    selfId: metrics.selfId,
    remoteId: metrics.remoteId,
    correction: summarizeCorrection(metrics.correction),
    contactCreated: metrics.contactCreated,
    contactRemoved: metrics.contactRemoved,
    exposedSelfSolverDelta: {
      count: metrics.exposedSelfSolverDelta.length,
      median: median(metrics.exposedSelfSolverDelta),
      p95: percentile(metrics.exposedSelfSolverDelta, 0.95),
      max: metrics.exposedSelfSolverDelta.length ? Math.max(...metrics.exposedSelfSolverDelta) : 0,
    },
    allSelfSolverDelta: {
      median: median(metrics.allSelfSolverDelta),
      p95: percentile(metrics.allSelfSolverDelta, 0.95),
      max: metrics.allSelfSolverDelta.length ? Math.max(...metrics.allSelfSolverDelta) : 0,
    },
    minSeparation: metrics.minSeparation,
    maxHorizontalSpeed: metrics.maxHorizontalSpeed,
    speedOvershootMax: Math.max(0, metrics.maxHorizontalSpeed - PLAYER_SPEED),
  };
}

function splitState(triplet) {
  return {
    actorA: distance3(actorState(triplet.clientA, "A").position, actorState(triplet.clientB, "A").position),
    actorB: distance3(actorState(triplet.clientB, "B").position, actorState(triplet.clientA, "B").position),
  };
}

function runCell({ scenario, delayMs, phaseMs, policy }) {
  const triplet = makeTriplet();
  const traces = { A: scenario.a, B: scenario.b };
  const authorityCursor = { A: { index: 0 }, B: { index: 0 } };
  const aCursor = { self: { index: 0 }, remote: { index: 0 } };
  const bCursor = { self: { index: 0 }, remote: { index: 0 } };
  const metricsA = emptyClientMetrics("A", "B");
  const metricsB = emptyClientMetrics("B", "A");
  const queueA = [];
  const queueB = [];
  const ageTicks = policy === "fresh-state" || policy === "none" ? 0 : Math.round(delayMs / STEP_MS);
  const actualSnapshotAgeMs = ageTicks * STEP_MS;
  const preCorrectionSplits = [];
  const postCorrectionSplits = [];
  let maxAuthorityResidual = 0;
  let authorityContactTicks = 0;

  try {
    for (let tick = 0; tick < PRE_ROLL_TICKS; tick += 1) {
      stepSimulation(triplet.authority);
      recordPostStep(triplet.clientA, metricsA, stepSimulation(triplet.clientA));
      recordPostStep(triplet.clientB, metricsB, stepSimulation(triplet.clientB));
    }

    const totalTicks = Math.ceil(scenario.durationMs / STEP_MS) + 1;
    for (let tick = 0; tick < totalTicks; tick += 1) {
      const tMs = tick * STEP_MS;
      const logicalTick = tick + 1;

      applyEvents(traces.A, authorityCursor.A, tMs, triplet.authority.inputs, "A");
      applyEvents(traces.B, authorityCursor.B, tMs, triplet.authority.inputs, "B");
      applyEvents(traces.A, aCursor.self, tMs, triplet.clientA.inputs, "A");
      applyEvents(traces.B, aCursor.remote, tMs - delayMs - phaseMs, triplet.clientA.inputs, "B");
      applyEvents(traces.B, bCursor.self, tMs, triplet.clientB.inputs, "B");
      applyEvents(traces.A, bCursor.remote, tMs - delayMs - phaseMs, triplet.clientB.inputs, "A");

      stepSimulation(triplet.authority);
      recordPostStep(triplet.clientA, metricsA, stepSimulation(triplet.clientA));
      recordPostStep(triplet.clientB, metricsB, stepSimulation(triplet.clientB));

      const pre = splitState(triplet);
      preCorrectionSplits.push(Math.max(pre.actorA, pre.actorB));

      const authA = actorState(triplet.authority, "A");
      const authB = actorState(triplet.authority, "B");
      if (distance3(authA.position, authB.position) <= CONTACT_DISTANCE) authorityContactTicks += 1;

      maxAuthorityResidual = Math.max(
        maxAuthorityResidual,
        distance3(actorState(triplet.clientA, "A").position, authA.position),
        distance3(actorState(triplet.clientB, "A").position, authA.position),
        distance3(actorState(triplet.clientA, "B").position, authB.position),
        distance3(actorState(triplet.clientB, "B").position, authB.position),
      );

      if (logicalTick % SNAPSHOT_EVERY_TICKS === 0 && policy !== "none") {
        const snapshot = snapshotFromAuthority(triplet.authority, logicalTick);
        if (policy === "fresh-state") {
          applyRemoteCorrection(triplet.clientA, metricsA, snapshot.state[metricsA.remoteId]);
          applyRemoteCorrection(triplet.clientB, metricsB, snapshot.state[metricsB.remoteId]);
        } else {
          queueA.push(snapshot);
          queueB.push(snapshot);
        }
      }

      if (policy === "stale-state" || policy === "forecast-state") {
        while (queueA.length && queueA[0].sourceTick + ageTicks <= logicalTick) {
          const snapshot = queueA.shift();
          applyRemoteCorrection(
            triplet.clientA,
            metricsA,
            targetFromSnapshot(snapshot, metricsA.remoteId, policy, ageTicks),
          );
        }
        while (queueB.length && queueB[0].sourceTick + ageTicks <= logicalTick) {
          const snapshot = queueB.shift();
          applyRemoteCorrection(
            triplet.clientB,
            metricsB,
            targetFromSnapshot(snapshot, metricsB.remoteId, policy, ageTicks),
          );
        }
      }

      const post = splitState(triplet);
      postCorrectionSplits.push(Math.max(post.actorA, post.actorB));
    }

    const final = {
      authority: { A: actorState(triplet.authority, "A"), B: actorState(triplet.authority, "B") },
      clientA: { A: actorState(triplet.clientA, "A"), B: actorState(triplet.clientA, "B") },
      clientB: { A: actorState(triplet.clientB, "A"), B: actorState(triplet.clientB, "B") },
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
      authority: maxPropMovement(triplet.authority),
      clientA: maxPropMovement(triplet.clientA),
      clientB: maxPropMovement(triplet.clientB),
    };

    const maxProp = Math.max(propMovement.authority, propMovement.clientA, propMovement.clientB);
    if (maxProp > 0.05) throw new Error(`${policy}/${scenario.name}/${delayMs}/${phaseMs} contaminated by props: ${maxProp}`);
    if (scenario.name === "approach-no-contact" && finalSeparation.authority < 2.0) {
      throw new Error(`${policy}/${scenario.name}/${delayMs}/${phaseMs} authority accidentally contacted`);
    }
    if (scenario.name === "player-contact-only" && finalSeparation.authority > 0.9) {
      throw new Error(`${policy}/${scenario.name}/${delayMs}/${phaseMs} authority failed contact`);
    }

    return {
      policy,
      scenario: scenario.name,
      delayMs,
      phaseMs,
      snapshotAgeTicks: ageTicks,
      actualSnapshotAgeMs,
      directFinalSplit,
      splitEnvelope: {
        preCorrectionMedian: median(preCorrectionSplits),
        preCorrectionP95: percentile(preCorrectionSplits, 0.95),
        preCorrectionMax: Math.max(...preCorrectionSplits),
        postCorrectionP95: percentile(postCorrectionSplits, 0.95),
        postCorrectionMax: Math.max(...postCorrectionSplits),
      },
      authorityContactTicks,
      maxAuthorityResidual,
      finalSeparation,
      propMovement,
      clientMetrics: {
        A: summarizeClientMetrics(metricsA),
        B: summarizeClientMetrics(metricsB),
      },
      final,
    };
  } finally {
    destroyTriplet(triplet);
  }
}

console.log(`${REVISION} · Box3D ${JSON.stringify(b3.b3GetVersion())}`);
console.log(`policies=${POLICIES.join(", ")} delays=${DELAYS_MS.join(",")} phases=${PHASES_MS.map((v) => v.toFixed(2)).join(",")}`);

const cells = [];
for (const policy of POLICIES) {
  for (const delayMs of DELAYS_MS) {
    for (const phaseMs of PHASES_MS) {
      for (const scenario of SCENARIOS) {
        const cell = runCell({ policy, scenario, delayMs, phaseMs });
        cells.push(cell);
        if (scenario.name === "player-contact-only") {
          const finalMax = Math.max(cell.directFinalSplit.actorA, cell.directFinalSplit.actorB);
          const corrMax = Math.max(
            cell.clientMetrics.A.correction.positionMax,
            cell.clientMetrics.B.correction.positionMax,
          );
          const solverMax = Math.max(
            cell.clientMetrics.A.exposedSelfSolverDelta.max,
            cell.clientMetrics.B.exposedSelfSolverDelta.max,
          );
          console.log(
            `${policy.padEnd(14)} ${String(delayMs).padStart(3)}ms age=${cell.actualSnapshotAgeMs.toFixed(1).padStart(5)} ` +
            `phase=${phaseMs.toFixed(2).padStart(5)} final=${finalMax.toFixed(3)}m ` +
            `p95=${cell.splitEnvelope.preCorrectionP95.toFixed(3)}m corr=${corrMax.toFixed(3)}m ` +
            `solverSelf=${solverMax.toFixed(3)}m/s`,
          );
        }
      }
    }
  }
}

function policyDelaySummary(policy, delayMs) {
  const contact = cells.filter((cell) => cell.policy === policy && cell.delayMs === delayMs && cell.scenario === "player-contact-only");
  const noContact = cells.filter((cell) => cell.policy === policy && cell.delayMs === delayMs && cell.scenario === "approach-no-contact");
  const finalContact = contact.map((cell) => Math.max(cell.directFinalSplit.actorA, cell.directFinalSplit.actorB));
  const p95Contact = contact.map((cell) => cell.splitEnvelope.preCorrectionP95);
  const finalNo = noContact.map((cell) => Math.max(cell.directFinalSplit.actorA, cell.directFinalSplit.actorB));
  const correctionMax = contact.map((cell) => Math.max(cell.clientMetrics.A.correction.positionMax, cell.clientMetrics.B.correction.positionMax));
  const velocityCorrectionMax = contact.map((cell) => Math.max(cell.clientMetrics.A.correction.velocityMax, cell.clientMetrics.B.correction.velocityMax));
  const exposedSolverMax = contact.map((cell) => Math.max(cell.clientMetrics.A.exposedSelfSolverDelta.max, cell.clientMetrics.B.exposedSelfSolverDelta.max));
  const exposedSolverP95 = contact.map((cell) => Math.max(cell.clientMetrics.A.exposedSelfSolverDelta.p95 || 0, cell.clientMetrics.B.exposedSelfSolverDelta.p95 || 0));
  return {
    policy,
    delayMs,
    actualSnapshotAgeMs: contact[0]?.actualSnapshotAgeMs ?? 0,
    noContactFinal: { median: median(finalNo), max: Math.max(...finalNo) },
    contactFinal: { median: median(finalContact), max: Math.max(...finalContact) },
    contactPreCorrectionP95: { median: median(p95Contact), max: Math.max(...p95Contact) },
    correctionPositionMax: { median: median(correctionMax), max: Math.max(...correctionMax) },
    correctionVelocityMax: { median: median(velocityCorrectionMax), max: Math.max(...velocityCorrectionMax) },
    exposedSelfSolverDelta: { p95MaxAcrossPhases: Math.max(...exposedSolverP95), max: Math.max(...exposedSolverMax) },
    contactCreated: contact.reduce((sum, cell) => sum + cell.clientMetrics.A.contactCreated + cell.clientMetrics.B.contactCreated, 0),
    contactRemoved: contact.reduce((sum, cell) => sum + cell.clientMetrics.A.contactRemoved + cell.clientMetrics.B.contactRemoved, 0),
  };
}

const summary = POLICIES.flatMap((policy) => DELAYS_MS.map((delayMs) => policyDelaySummary(policy, delayMs)));

console.log("\nT2 policy summary:");
for (const row of summary) {
  console.log(
    `${row.policy.padEnd(14)} ${row.delayMs}ms age=${row.actualSnapshotAgeMs.toFixed(1)}ms · ` +
    `final=${row.contactFinal.median.toFixed(3)}/${row.contactFinal.max.toFixed(3)}m · ` +
    `p95=${row.contactPreCorrectionP95.median.toFixed(3)}/${row.contactPreCorrectionP95.max.toFixed(3)}m · ` +
    `corr=${row.correctionPositionMax.max.toFixed(3)}m vel=${row.correctionVelocityMax.max.toFixed(3)}m/s · ` +
    `solverSelfMax=${row.exposedSelfSolverDelta.max.toFixed(3)}m/s`,
  );
}

const evidence = {
  revision: REVISION,
  generatedAt: new Date().toISOString(),
  design: {
    qualifiedT1Head: "6fd82b4a24f849dca482b72b614be27c1cab0545",
    box3d: "box3d.js@0.1.1",
    simulationHz: 60,
    substeps: SUBSTEPS,
    snapshotHz: 10,
    snapshotAgeRule: "ageTicks = round(remoteIntentDelayMs / 16.6667ms); 65ms -> 66.67ms, 85ms -> 83.33ms",
    delaysMs: DELAYS_MS,
    remoteArrivalPhasesMs: PHASES_MS,
    policies: POLICIES,
    forecast: "constant-linear-velocity extrapolation of stale authority position by snapshot age; rotation/velocity retained from snapshot",
    solverImpulseMetric: "horizontal self velocity delta after movement-controller application / immediately before Box3D step versus immediately after Box3D step, sampled on the first solver tick after a non-zero remote correction",
  },
  cells,
  summary,
};
writeFileSync(OUTPUT, JSON.stringify(evidence, null, 2));
console.log(`\nT2 STRUCTURAL PASS · evidence written to ${OUTPUT}`);
