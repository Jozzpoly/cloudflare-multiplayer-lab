import { writeFileSync } from "node:fs";
import Box3D from "box3d.js/inline";

const b3 = await Box3D();

const REVISION = "ws0-tick-domain-t0-v1";
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
const OUTPUT = process.env.WS0_TICK_T0_OUTPUT || "ws0-tick-domain-t0.json";

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

function bodyVelocity(body) {
  const out = [0, 0, 0];
  b3.b3Body_GetLinearVelocity(out, body);
  return [out[0], out[1], out[2]];
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

function actorState(sim, id) {
  const body = sim.actors.get(id);
  return { position: bodyPosition(body), velocity: bodyVelocity(body) };
}

function makeTriplet(topology = "current") {
  const authority = createSimulation({ actorOrder: ["A", "B"], applyOrder: ["A", "B"] });
  const clientA = createSimulation({ actorOrder: ["A", "B"], applyOrder: ["A", "B"] });
  const clientB = topology === "current"
    ? createSimulation({ actorOrder: ["B", "A"], applyOrder: ["B", "A"] })
    : topology === "body-canonical"
      ? createSimulation({ actorOrder: ["A", "B"], applyOrder: ["B", "A"] })
      : createSimulation({ actorOrder: ["A", "B"], applyOrder: ["A", "B"] });
  return { authority, clientA, clientB };
}

function destroyTriplet(triplet) {
  destroySimulation(triplet.authority);
  destroySimulation(triplet.clientA);
  destroySimulation(triplet.clientB);
}

function runCell({ scenario, delayMs, phaseMs = 0, topology = "current" }) {
  const triplet = makeTriplet(topology);
  const traces = { A: scenario.a, B: scenario.b };
  const authorityCursor = { A: { index: 0 }, B: { index: 0 } };
  const aCursor = { self: { index: 0 }, remote: { index: 0 } };
  const bCursor = { self: { index: 0 }, remote: { index: 0 } };

  let maxActorASplit = 0;
  let maxActorBSplit = 0;
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

      const aOnA = actorState(triplet.clientA, "A").position;
      const aOnB = actorState(triplet.clientB, "A").position;
      const bOnA = actorState(triplet.clientA, "B").position;
      const bOnB = actorState(triplet.clientB, "B").position;
      const authA = actorState(triplet.authority, "A").position;
      const authB = actorState(triplet.authority, "B").position;

      maxActorASplit = Math.max(maxActorASplit, distance3(aOnA, aOnB));
      maxActorBSplit = Math.max(maxActorBSplit, distance3(bOnB, bOnA));
      maxAuthorityResidual = Math.max(
        maxAuthorityResidual,
        distance3(aOnA, authA), distance3(aOnB, authA),
        distance3(bOnA, authB), distance3(bOnB, authB),
      );
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

    return {
      scenario: scenario.name,
      delayMs,
      phaseMs,
      topology,
      directFinalSplit,
      peakDirectSplit: { actorA: maxActorASplit, actorB: maxActorBSplit },
      maxAuthorityResidual,
      finalSeparation,
      propMovement,
      final,
    };
  } finally {
    destroyTriplet(triplet);
  }
}

function maxFinalSplit(cell) {
  return Math.max(cell.directFinalSplit.actorA, cell.directFinalSplit.actorB);
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return NaN;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function assertGeometry(cell) {
  const maxProp = Math.max(cell.propMovement.authority, cell.propMovement.clientA, cell.propMovement.clientB);
  if (maxProp > 0.05) throw new Error(`${cell.scenario}/${cell.delayMs}/${cell.phaseMs} contaminated by props: ${maxProp}`);
  const minSep = Math.min(cell.finalSeparation.authority, cell.finalSeparation.clientA, cell.finalSeparation.clientB);
  const maxSep = Math.max(cell.finalSeparation.authority, cell.finalSeparation.clientA, cell.finalSeparation.clientB);
  if (cell.scenario === "approach-no-contact" && minSep < 2.0) {
    throw new Error(`${cell.scenario}/${cell.delayMs}/${cell.phaseMs} accidentally contacted: ${JSON.stringify(cell.finalSeparation)}`);
  }
  if (cell.scenario === "player-contact-only" && maxSep > 0.9) {
    throw new Error(`${cell.scenario}/${cell.delayMs}/${cell.phaseMs} failed contact: ${JSON.stringify(cell.finalSeparation)}`);
  }
}

console.log(`${REVISION} · Box3D ${JSON.stringify(b3.b3GetVersion())}`);

const contactScenario = SCENARIOS.find((scenario) => scenario.name === "player-contact-only");
const sanity = runCell({ scenario: contactScenario, delayMs: 0, phaseMs: 0, topology: "canonical" });
assertGeometry(sanity);
const sanityMax = Math.max(
  sanity.directFinalSplit.actorA,
  sanity.directFinalSplit.actorB,
  sanity.maxAuthorityResidual,
);
if (sanityMax > 1e-7) throw new Error(`determinism sanity failed: max=${sanityMax}`);
console.log(`determinism sanity PASS · max disagreement=${sanityMax.toExponential(3)} m`);

const orderStudy = ["current", "body-canonical", "canonical"].map((topology) => {
  const cell = runCell({ scenario: contactScenario, delayMs: 0, phaseMs: 0, topology });
  assertGeometry(cell);
  console.log(`order ${topology.padEnd(14)} · final A/B=${cell.directFinalSplit.actorA.toFixed(4)}/${cell.directFinalSplit.actorB.toFixed(4)} m`);
  return cell;
});

const qualificationCells = [];
for (const delayMs of DELAYS_MS) {
  for (const phaseMs of PHASES_MS) {
    for (const scenario of SCENARIOS) {
      const cell = runCell({ scenario, delayMs, phaseMs, topology: "current" });
      assertGeometry(cell);
      qualificationCells.push(cell);
      console.log(
        `${scenario.name.padEnd(21)} ${String(delayMs).padStart(3)}ms phase=${phaseMs.toFixed(2).padStart(5)} ` +
        `final A/B=${cell.directFinalSplit.actorA.toFixed(3)}/${cell.directFinalSplit.actorB.toFixed(3)} ` +
        `peak=${Math.max(cell.peakDirectSplit.actorA, cell.peakDirectSplit.actorB).toFixed(3)}m`,
      );
    }
  }
}

const qualificationSummary = DELAYS_MS.map((delayMs) => {
  const noContact = qualificationCells.filter((cell) => cell.delayMs === delayMs && cell.scenario === "approach-no-contact");
  const contact = qualificationCells.filter((cell) => cell.delayMs === delayMs && cell.scenario === "player-contact-only");
  const noValues = noContact.map(maxFinalSplit);
  const contactValues = contact.map(maxFinalSplit);
  return {
    delayMs,
    noContact: { median: median(noValues), max: Math.max(...noValues), values: noValues },
    contact: { median: median(contactValues), max: Math.max(...contactValues), values: contactValues },
    medianAmplification: median(contactValues) / Math.max(median(noValues), 1e-9),
  };
});

console.log("\nT0 qualification summary (interpretation gate, not auto-PASS):");
for (const row of qualificationSummary) {
  console.log(
    `${row.delayMs}ms · no-contact median/max=${row.noContact.median.toFixed(3)}/${row.noContact.max.toFixed(3)}m · ` +
    `contact median/max=${row.contact.median.toFixed(3)}/${row.contact.max.toFixed(3)}m · ` +
    `median amplification=${row.medianAmplification.toFixed(2)}x`,
  );
}

const evidence = {
  revision: REVISION,
  generatedAt: new Date().toISOString(),
  design: {
    sourceControlHead: "2797a23f81cae23e541a668a516e7b7765cf1dc4",
    box3d: "box3d.js@0.1.1",
    simulationHz: 60,
    substeps: SUBSTEPS,
    preRollTicks: PRE_ROLL_TICKS,
    delaysMs: DELAYS_MS,
    remoteArrivalPhasesMs: PHASES_MS,
    note: "Mechanistic tick-domain lab: no browser, WebSocket, Worker wall-clock loop, catch-up or dropped ticks. Self/authority trace events are applied on deterministic fixed-step boundaries; remote trace events are shifted by synthetic delay + explicit arrival phase.",
  },
  sanity,
  orderStudy,
  qualificationCells,
  qualificationSummary,
};
writeFileSync(OUTPUT, JSON.stringify(evidence, null, 2));
console.log(`\nT0 STRUCTURAL PASS · evidence written to ${OUTPUT}`);
