import { writeFileSync } from "node:fs";
import Box3D from "box3d.js/inline";

const b3 = await Box3D();

const REVISION = "ws0-tick-domain-t1-actor-state-v1";
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
const POLICIES = ["none", "remote-transform", "remote-state", "both-state"];
const OUTPUT = process.env.WS0_TICK_T1_OUTPUT || "ws0-tick-domain-t1-actor-state.json";

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
  b3.b3World_Step(sim.world, FIXED_DT, SUBSTEPS);
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

function emptyCorrectionStats() {
  return {
    applied: 0,
    nonZero: 0,
    positionSum: 0,
    positionMax: 0,
    authorityVelocityMismatchSum: 0,
    authorityVelocityMismatchMax: 0,
    appliedVelocitySum: 0,
    appliedVelocityMax: 0,
  };
}

function emptyClientMetrics(selfId, remoteId) {
  return {
    selfId,
    remoteId,
    corrections: { self: emptyCorrectionStats(), remote: emptyCorrectionStats() },
    correctionContactCreated: 0,
    correctionContactRemoved: 0,
    postCorrectionPenetrationProxyMax: 0,
    nextStepSelfVelocityJump: { count: 0, sum: 0, max: 0 },
    pendingSelfVelocity: null,
    minSeparation: Infinity,
    maxHorizontalSpeed: 0,
  };
}

function contactNow(sim) {
  return distance3(bodyPosition(sim.actors.get("A")), bodyPosition(sim.actors.get("B"))) <= CONTACT_DISTANCE;
}

function penetrationProxy(sim) {
  const separation = distance3(bodyPosition(sim.actors.get("A")), bodyPosition(sim.actors.get("B")));
  return Math.max(0, PLAYER_RADIUS * 2 - separation);
}

function recordCorrection(stats, positionDelta, authorityVelocityMismatch, appliedVelocityDelta) {
  stats.applied += 1;
  if (positionDelta > 1e-6 || appliedVelocityDelta > 1e-6) stats.nonZero += 1;
  stats.positionSum += positionDelta;
  stats.positionMax = Math.max(stats.positionMax, positionDelta);
  stats.authorityVelocityMismatchSum += authorityVelocityMismatch;
  stats.authorityVelocityMismatchMax = Math.max(stats.authorityVelocityMismatchMax, authorityVelocityMismatch);
  stats.appliedVelocitySum += appliedVelocityDelta;
  stats.appliedVelocityMax = Math.max(stats.appliedVelocityMax, appliedVelocityDelta);
}

function correctActor(sim, actorId, authorityState, mode, stats) {
  const body = sim.actors.get(actorId);
  const localPosition = bodyPosition(body);
  const localVelocity = bodyVelocity(body);
  const positionDelta = distance3(localPosition, authorityState.position);
  const velocityMismatch = distance3(localVelocity, authorityState.velocity);

  b3.b3Body_SetTransform(body, authorityState.position, authorityState.rotation);
  let appliedVelocityDelta = 0;
  if (mode === "state") {
    appliedVelocityDelta = velocityMismatch;
    b3.b3Body_SetLinearVelocity(body, authorityState.velocity);
  } else {
    b3.b3Body_SetLinearVelocity(body, localVelocity);
  }
  b3.b3Body_SetAwake(body, true);
  recordCorrection(stats, positionDelta, velocityMismatch, appliedVelocityDelta);
}

function applyPolicyToClient(policy, sim, clientMetrics, authorityState) {
  if (policy === "none") return;

  const wasContact = contactNow(sim);
  let correctedRemote = false;

  if (policy === "remote-transform" || policy === "remote-state") {
    correctActor(
      sim,
      clientMetrics.remoteId,
      authorityState[clientMetrics.remoteId],
      policy === "remote-state" ? "state" : "transform",
      clientMetrics.corrections.remote,
    );
    correctedRemote = true;
  } else if (policy === "both-state") {
    correctActor(sim, clientMetrics.selfId, authorityState[clientMetrics.selfId], "state", clientMetrics.corrections.self);
    correctActor(sim, clientMetrics.remoteId, authorityState[clientMetrics.remoteId], "state", clientMetrics.corrections.remote);
  } else {
    throw new Error(`unknown policy ${policy}`);
  }

  const isContact = contactNow(sim);
  if (!wasContact && isContact) clientMetrics.correctionContactCreated += 1;
  if (wasContact && !isContact) clientMetrics.correctionContactRemoved += 1;
  clientMetrics.postCorrectionPenetrationProxyMax = Math.max(
    clientMetrics.postCorrectionPenetrationProxyMax,
    penetrationProxy(sim),
  );

  if (correctedRemote) {
    clientMetrics.pendingSelfVelocity = bodyVelocity(sim.actors.get(clientMetrics.selfId));
  }
}

function summarizeCorrection(stats) {
  return {
    ...stats,
    positionMean: stats.applied ? stats.positionSum / stats.applied : 0,
    authorityVelocityMismatchMean: stats.applied ? stats.authorityVelocityMismatchSum / stats.applied : 0,
    appliedVelocityMean: stats.applied ? stats.appliedVelocitySum / stats.applied : 0,
  };
}

function finalizeClientMetrics(metrics) {
  return {
    selfId: metrics.selfId,
    remoteId: metrics.remoteId,
    corrections: {
      self: summarizeCorrection(metrics.corrections.self),
      remote: summarizeCorrection(metrics.corrections.remote),
    },
    correctionContactCreated: metrics.correctionContactCreated,
    correctionContactRemoved: metrics.correctionContactRemoved,
    postCorrectionPenetrationProxyMax: metrics.postCorrectionPenetrationProxyMax,
    nextStepSelfVelocityJump: {
      ...metrics.nextStepSelfVelocityJump,
      mean: metrics.nextStepSelfVelocityJump.count
        ? metrics.nextStepSelfVelocityJump.sum / metrics.nextStepSelfVelocityJump.count
        : 0,
    },
    minSeparation: metrics.minSeparation,
    maxHorizontalSpeed: metrics.maxHorizontalSpeed,
    speedOvershootMax: Math.max(0, metrics.maxHorizontalSpeed - PLAYER_SPEED),
  };
}

function recordClientPostStep(sim, metrics) {
  if (metrics.pendingSelfVelocity) {
    const now = bodyVelocity(sim.actors.get(metrics.selfId));
    const jump = distance3(now, metrics.pendingSelfVelocity);
    metrics.nextStepSelfVelocityJump.count += 1;
    metrics.nextStepSelfVelocityJump.sum += jump;
    metrics.nextStepSelfVelocityJump.max = Math.max(metrics.nextStepSelfVelocityJump.max, jump);
    metrics.pendingSelfVelocity = null;
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

function splitState(triplet) {
  const aA = actorState(triplet.clientA, "A");
  const aB = actorState(triplet.clientB, "A");
  const bA = actorState(triplet.clientA, "B");
  const bB = actorState(triplet.clientB, "B");
  return {
    actorA: distance3(aA.position, aB.position),
    actorB: distance3(bB.position, bA.position),
  };
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

function runCell({ scenario, delayMs, phaseMs, policy }) {
  const triplet = makeTriplet();
  const traces = { A: scenario.a, B: scenario.b };
  const authorityCursor = { A: { index: 0 }, B: { index: 0 } };
  const aCursor = { self: { index: 0 }, remote: { index: 0 } };
  const bCursor = { self: { index: 0 }, remote: { index: 0 } };
  const metricsA = emptyClientMetrics("A", "B");
  const metricsB = emptyClientMetrics("B", "A");
  const preCorrectionSplits = [];
  const postCorrectionSplits = [];
  const authorityContactSplits = [];
  let authorityContactTicks = 0;
  let maxAuthorityResidual = 0;

  try {
    for (let tick = 0; tick < PRE_ROLL_TICKS; tick += 1) {
      stepSimulation(triplet.authority);
      stepSimulation(triplet.clientA);
      stepSimulation(triplet.clientB);
    }

    const totalTicks = Math.ceil(scenario.durationMs / STEP_MS) + 1;
    for (let tick = 0; tick < totalTicks; tick += 1) {
      const tMs = tick * STEP_MS;

      applyEvents(traces.A, authorityCursor.A, tMs, triplet.authority.inputs, "A");
      applyEvents(traces.B, authorityCursor.B, tMs, triplet.authority.inputs, "B");
      applyEvents(traces.A, aCursor.self, tMs, triplet.clientA.inputs, "A");
      applyEvents(traces.B, aCursor.remote, tMs - delayMs - phaseMs, triplet.clientA.inputs, "B");
      applyEvents(traces.B, bCursor.self, tMs, triplet.clientB.inputs, "B");
      applyEvents(traces.A, bCursor.remote, tMs - delayMs - phaseMs, triplet.clientB.inputs, "A");

      stepSimulation(triplet.authority);
      stepSimulation(triplet.clientA);
      stepSimulation(triplet.clientB);

      recordClientPostStep(triplet.clientA, metricsA);
      recordClientPostStep(triplet.clientB, metricsB);

      const pre = splitState(triplet);
      const preMax = Math.max(pre.actorA, pre.actorB);
      preCorrectionSplits.push(preMax);

      const authA = actorState(triplet.authority, "A");
      const authB = actorState(triplet.authority, "B");
      const authorityState = { A: authA, B: authB };
      const authoritySeparation = distance3(authA.position, authB.position);
      if (authoritySeparation <= CONTACT_DISTANCE) {
        authorityContactTicks += 1;
        authorityContactSplits.push(preMax);
      }

      const localStates = [
        actorState(triplet.clientA, "A"), actorState(triplet.clientA, "B"),
        actorState(triplet.clientB, "A"), actorState(triplet.clientB, "B"),
      ];
      maxAuthorityResidual = Math.max(
        maxAuthorityResidual,
        distance3(localStates[0].position, authA.position),
        distance3(localStates[2].position, authA.position),
        distance3(localStates[1].position, authB.position),
        distance3(localStates[3].position, authB.position),
      );

      if ((tick + 1) % SNAPSHOT_EVERY_TICKS === 0) {
        applyPolicyToClient(policy, triplet.clientA, metricsA, authorityState);
        applyPolicyToClient(policy, triplet.clientB, metricsB, authorityState);
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
      throw new Error(`${policy}/${scenario.name}/${delayMs}/${phaseMs} authority accidentally contacted: ${finalSeparation.authority}`);
    }
    if (scenario.name === "player-contact-only" && finalSeparation.authority > 0.9) {
      throw new Error(`${policy}/${scenario.name}/${delayMs}/${phaseMs} authority failed contact: ${finalSeparation.authority}`);
    }

    return {
      policy,
      scenario: scenario.name,
      delayMs,
      phaseMs,
      directFinalSplit,
      splitEnvelope: {
        preCorrectionMedian: median(preCorrectionSplits),
        preCorrectionP95: percentile(preCorrectionSplits, 0.95),
        preCorrectionMax: Math.max(...preCorrectionSplits),
        postCorrectionMedian: median(postCorrectionSplits),
        postCorrectionP95: percentile(postCorrectionSplits, 0.95),
        postCorrectionMax: Math.max(...postCorrectionSplits),
        authorityContactPreCorrectionMax: authorityContactSplits.length ? Math.max(...authorityContactSplits) : 0,
      },
      authorityContactTicks,
      maxAuthorityResidual,
      finalSeparation,
      propMovement,
      clientMetrics: {
        A: finalizeClientMetrics(metricsA),
        B: finalizeClientMetrics(metricsB),
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
          const corrA = cell.clientMetrics.A.corrections.remote.positionMax;
          const corrB = cell.clientMetrics.B.corrections.remote.positionMax;
          console.log(
            `${policy.padEnd(16)} ${String(delayMs).padStart(3)}ms phase=${phaseMs.toFixed(2).padStart(5)} ` +
            `final=${finalMax.toFixed(3)}m p95=${cell.splitEnvelope.preCorrectionP95.toFixed(3)}m ` +
            `remoteCorrMax=${Math.max(corrA, corrB).toFixed(3)}m ` +
            `selfKickMax=${Math.max(cell.clientMetrics.A.nextStepSelfVelocityJump.max, cell.clientMetrics.B.nextStepSelfVelocityJump.max).toFixed(3)}m/s`,
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
  const remoteCorrectionMax = contact.map((cell) => Math.max(
    cell.clientMetrics.A.corrections.remote.positionMax,
    cell.clientMetrics.B.corrections.remote.positionMax,
  ));
  const selfKickMax = contact.map((cell) => Math.max(
    cell.clientMetrics.A.nextStepSelfVelocityJump.max,
    cell.clientMetrics.B.nextStepSelfVelocityJump.max,
  ));
  const speedOvershoot = contact.map((cell) => Math.max(
    cell.clientMetrics.A.speedOvershootMax,
    cell.clientMetrics.B.speedOvershootMax,
  ));
  return {
    policy,
    delayMs,
    noContactFinal: { median: median(finalNo), max: Math.max(...finalNo) },
    contactFinal: { median: median(finalContact), max: Math.max(...finalContact) },
    contactPreCorrectionP95: { median: median(p95Contact), max: Math.max(...p95Contact) },
    remoteCorrectionPositionMax: { median: median(remoteCorrectionMax), max: Math.max(...remoteCorrectionMax) },
    nextStepSelfVelocityJumpMax: { median: median(selfKickMax), max: Math.max(...selfKickMax) },
    speedOvershootMax: { median: median(speedOvershoot), max: Math.max(...speedOvershoot) },
    correctionContactCreated: contact.reduce((sum, cell) => sum + cell.clientMetrics.A.correctionContactCreated + cell.clientMetrics.B.correctionContactCreated, 0),
    correctionContactRemoved: contact.reduce((sum, cell) => sum + cell.clientMetrics.A.correctionContactRemoved + cell.clientMetrics.B.correctionContactRemoved, 0),
  };
}

const summary = POLICIES.flatMap((policy) => DELAYS_MS.map((delayMs) => policyDelaySummary(policy, delayMs)));

console.log("\nT1 policy summary:");
for (const row of summary) {
  console.log(
    `${row.policy.padEnd(16)} ${row.delayMs}ms · final median/max=${row.contactFinal.median.toFixed(3)}/${row.contactFinal.max.toFixed(3)}m · ` +
    `preCorr p95 median/max=${row.contactPreCorrectionP95.median.toFixed(3)}/${row.contactPreCorrectionP95.max.toFixed(3)}m · ` +
    `remote correction max=${row.remoteCorrectionPositionMax.max.toFixed(3)}m · selfKick=${row.nextStepSelfVelocityJumpMax.max.toFixed(3)}m/s`,
  );
}

const evidence = {
  revision: REVISION,
  generatedAt: new Date().toISOString(),
  design: {
    qualifiedT0Head: "dbc8d6953b87705d0e56551db381550681dc7749",
    box3d: "box3d.js@0.1.1",
    simulationHz: 60,
    substeps: SUBSTEPS,
    snapshotHz: 10,
    snapshotAgeMs: 0,
    delaysMs: DELAYS_MS,
    remoteArrivalPhasesMs: PHASES_MS,
    policies: POLICIES,
    note: "Favorable mechanism ceiling: authority actor state is applied after the matching authority/client tick every 6 ticks with no artificial snapshot transport age. Remote-only policies never directly correct the local self actor. both-state is a mechanical ceiling, not a product policy.",
  },
  cells,
  summary,
};
writeFileSync(OUTPUT, JSON.stringify(evidence, null, 2));
console.log(`\nT1 STRUCTURAL PASS · evidence written to ${OUTPUT}`);
