import assert from "node:assert/strict";
import Box3D from "box3d.js/inline";
import {
  WORLD_V0_PLAYER_PHYSICS,
  WORLD_V0_PROP_PHYSICS,
} from "../src/world-v0-contract.ts";

const b3 = await Box3D();
const SUPPORT_MIN_NORMAL_Y = 0.55;
const SUPPORT_MIN_TOTAL_NORMAL_IMPULSE = 1e-6;

function sameBodyId(a, c) {
  return a.index1 === c.index1 && a.world0 === c.world0 && a.generation === c.generation;
}

function makeSupportReader() {
  const buffer = b3.createContactsBuffer();
  const contact = b3.createContact();
  const manifold = b3.createManifold();

  return {
    read(body) {
      b3.getBodyContactData(buffer, body);
      let bestNormalY = -Infinity;
      let maxTotalNormalImpulse = 0;
      let qualifyingPoints = 0;
      let contactCount = 0;

      for (let i = 0, n = b3.getNumContacts(buffer); i < n; i += 1) {
        b3.getContactAt(contact, buffer, i);
        const bodyA = b3.b3Shape_GetBody(contact.shapeIdA);
        const bodyB = b3.b3Shape_GetBody(contact.shapeIdB);
        const playerIsA = sameBodyId(bodyA, body);
        const playerIsB = sameBodyId(bodyB, body);
        if (!playerIsA && !playerIsB) continue;
        contactCount += 1;

        for (let m = 0; m < contact.manifoldCount; m += 1) {
          b3.getManifoldAt(manifold, contact, m);
          // Box3D manifold normal points shape A -> shape B. Convert that into
          // the contact normal acting on the queried body.
          const normalY = playerIsA ? -manifold.normal[1] : manifold.normal[1];
          for (let p = 0; p < manifold.pointCount; p += 1) {
            const point = manifold.points[p];
            const impulse = point.totalNormalImpulse;
            maxTotalNormalImpulse = Math.max(maxTotalNormalImpulse, impulse);
            if (impulse > SUPPORT_MIN_TOTAL_NORMAL_IMPULSE) {
              bestNormalY = Math.max(bestNormalY, normalY);
              if (normalY >= SUPPORT_MIN_NORMAL_Y) qualifyingPoints += 1;
            }
          }
        }
      }

      return {
        supported: qualifyingPoints > 0,
        contactCount,
        qualifyingPoints,
        bestNormalY: Number.isFinite(bestNormalY) ? bestNormalY : null,
        maxTotalNormalImpulse,
      };
    },
    destroy() {
      b3.destroyContactsBuffer(buffer);
    },
  };
}

function createWorld(gravity = [0, -20, 0]) {
  const def = b3.b3DefaultWorldDef();
  def.gravity = gravity;
  return b3.b3CreateWorld(def);
}

function createStaticBox(world, position, halfExtents) {
  const def = b3.b3DefaultBodyDef();
  def.position = position;
  const body = b3.b3CreateBody(world, def);
  b3.b3CreateBoxShape(body, b3.b3DefaultShapeDef(), halfExtents[0], halfExtents[1], halfExtents[2]);
  return body;
}

function createDynamicBox(world, position, halfExtents = WORLD_V0_PROP_PHYSICS.halfExtents) {
  const def = b3.b3DefaultBodyDef();
  def.type = b3.b3BodyType.b3_dynamicBody;
  def.position = [...position];
  def.linearDamping = WORLD_V0_PROP_PHYSICS.linearDamping;
  def.angularDamping = WORLD_V0_PROP_PHYSICS.angularDamping;
  const body = b3.b3CreateBody(world, def);
  const shape = b3.b3DefaultShapeDef();
  shape.density = WORLD_V0_PROP_PHYSICS.density;
  shape.baseMaterial.friction = WORLD_V0_PROP_PHYSICS.friction;
  shape.baseMaterial.restitution = WORLD_V0_PROP_PHYSICS.restitution;
  b3.b3CreateBoxShape(body, shape, halfExtents[0], halfExtents[1], halfExtents[2]);
  return body;
}

function createPlayer(world, position) {
  const physics = WORLD_V0_PLAYER_PHYSICS;
  const def = b3.b3DefaultBodyDef();
  def.type = b3.b3BodyType.b3_dynamicBody;
  def.position = [...position];
  def.linearDamping = physics.linearDamping;
  def.angularDamping = physics.angularDamping;
  const body = b3.b3CreateBody(world, def);
  const shape = b3.b3DefaultShapeDef();
  shape.density = physics.density;
  shape.baseMaterial.friction = physics.friction;
  shape.baseMaterial.restitution = physics.restitution;
  b3.b3CreateCapsuleShape(body, shape, {
    center1: [...physics.capsuleCenter1],
    center2: [...physics.capsuleCenter2],
    radius: physics.capsuleRadius,
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

function step(world, count) {
  for (let i = 0; i < count; i += 1) b3.b3World_Step(world, 1 / 60, 4);
}

function runGround() {
  const world = createWorld();
  const reader = makeSupportReader();
  try {
    createStaticBox(world, [0, -0.5, 0], [8, 0.5, 8]);
    const player = createPlayer(world, [0, 0.82, 0]);
    step(world, 30);
    const evidence = reader.read(player);
    assert.equal(evidence.supported, true, `ground must support player: ${JSON.stringify(evidence)}`);
    assert(evidence.bestNormalY >= 0.99, `ground support should point up: ${JSON.stringify(evidence)}`);
    return evidence;
  } finally {
    reader.destroy();
    b3.b3DestroyWorld(world);
  }
}

function runAirborne() {
  const world = createWorld();
  const reader = makeSupportReader();
  try {
    createStaticBox(world, [0, -0.5, 0], [8, 0.5, 8]);
    const player = createPlayer(world, [0, 5, 0]);
    step(world, 3);
    const evidence = reader.read(player);
    assert.equal(evidence.supported, false, `airborne player must not be supported: ${JSON.stringify(evidence)}`);
    return evidence;
  } finally {
    reader.destroy();
    b3.b3DestroyWorld(world);
  }
}

function runWallOnly() {
  const world = createWorld([0, 0, 0]);
  const reader = makeSupportReader();
  try {
    createStaticBox(world, [0, 2, 0], [0.5, 2, 4]);
    const player = createPlayer(world, [0.86, 2, 0]);
    b3.b3Body_SetLinearVelocity(player, [-3, 0, 0]);
    step(world, 20);
    const evidence = reader.read(player);
    assert(evidence.contactCount > 0, `wall probe must actually create contact: ${JSON.stringify(evidence)}`);
    assert.equal(evidence.supported, false, `wall contact must not count as support: ${JSON.stringify(evidence)}`);
    assert(Math.abs(evidence.bestNormalY ?? 0) < 0.1, `wall contact normal should stay horizontal: ${JSON.stringify(evidence)}`);
    return evidence;
  } finally {
    reader.destroy();
    b3.b3DestroyWorld(world);
  }
}

function runDynamicBox() {
  const world = createWorld();
  const reader = makeSupportReader();
  try {
    createStaticBox(world, [0, -0.5, 0], [8, 0.5, 8]);
    createDynamicBox(world, [0, 0.46, 0]);
    const player = createPlayer(world, [0, 1.74, 0]);
    step(world, 90);
    const evidence = reader.read(player);
    assert.equal(evidence.supported, true, `dynamic prop should support player: ${JSON.stringify(evidence)}`);
    assert(evidence.bestNormalY >= 0.9, `dynamic prop support should point mostly up: ${JSON.stringify(evidence)}`);
    return evidence;
  } finally {
    reader.destroy();
    b3.b3DestroyWorld(world);
  }
}

const evidence = {
  supportMinNormalY: SUPPORT_MIN_NORMAL_Y,
  supportMinTotalNormalImpulse: SUPPORT_MIN_TOTAL_NORMAL_IMPULSE,
  ground: runGround(),
  airborne: runAirborne(),
  wallOnly: runWallOnly(),
  dynamicBox: runDynamicBox(),
};

console.log("WORLD_V0_JUMP_SUPPORT_PROBE_PASS", JSON.stringify(evidence));
