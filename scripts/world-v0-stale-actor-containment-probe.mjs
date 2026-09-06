import Box3D from "box3d.js/inline";
import {
  WORLD_V0_ARENA,
  WORLD_V0_MOVEMENT,
  WORLD_V0_PLAYER_PHYSICS,
  WORLD_V0_PLAYER_STARTS,
  WORLD_V0_PROP_LAYOUT,
  WORLD_V0_PROP_PHYSICS,
  WORLD_V0_TIMING,
} from "../src/world-v0-contract.ts";

const b3 = await Box3D();
const DT = 1 / WORLD_V0_TIMING.simulationHz;
const SUBSTEPS = WORLD_V0_TIMING.substeps;
const STALE_START = 180;
const LEASE_TICKS = WORLD_V0_TIMING.inputLeaseMissingTicks;
const LEASE_BOUNDARY = STALE_START + LEASE_TICKS;
const REJOIN_BOUNDARY = 300;
const CONTINUE_TICKS = 120;

function sameId(a, c) {
  return a.index1 === c.index1 && a.world0 === c.world0 && a.generation === c.generation;
}
function vec3(body, getter) {
  const out = [0, 0, 0];
  getter(out, body);
  return out;
}
function position(body) { return vec3(body, b3.b3Body_GetPosition); }
function linearVelocity(body) { return vec3(body, b3.b3Body_GetLinearVelocity); }
function rotation(body) {
  const out = [0, 0, 0, 1];
  b3.b3Body_GetRotation(out, body);
  return out;
}
function angularVelocity(body) { return vec3(body, b3.b3Body_GetAngularVelocity); }
function flat(body) { return [...position(body), ...rotation(body), ...linearVelocity(body), ...angularVelocity(body)]; }
const dv = new DataView(new ArrayBuffer(4));
function f32bits(value) { dv.setFloat32(0, value, true); return dv.getUint32(0, true); }
function exactBody(a, c) { const x = flat(a); const y = flat(c); return x.every((v, i) => f32bits(v) === f32bits(y[i])); }
function dist3(a, c) { return Math.hypot(a[0]-c[0], a[1]-c[1], a[2]-c[2]); }
function moveToward2(vx, vz, tx, tz, delta) {
  const dx = tx - vx, dz = tz - vz;
  const length = Math.hypot(dx, dz);
  if (length <= delta || length === 0) return [tx, tz];
  const scale = delta / length;
  return [vx + dx * scale, vz + dz * scale];
}

function makeWorld() {
  const wd = b3.b3DefaultWorldDef();
  wd.gravity = [...WORLD_V0_ARENA.gravity];
  const world = b3.b3CreateWorld(wd);
  for (const box of WORLD_V0_ARENA.staticBoxes) {
    const def = b3.b3DefaultBodyDef();
    def.position = [...box.position];
    const body = b3.b3CreateBody(world, def);
    b3.b3CreateBoxShape(body, b3.b3DefaultShapeDef(), ...box.halfExtents);
  }
  const bodies = new Map();
  for (const prop of WORLD_V0_PROP_LAYOUT) {
    const def = b3.b3DefaultBodyDef();
    def.type = b3.b3BodyType.b3_dynamicBody;
    def.position = [...prop.position];
    def.linearDamping = WORLD_V0_PROP_PHYSICS.linearDamping;
    def.angularDamping = WORLD_V0_PROP_PHYSICS.angularDamping;
    const body = b3.b3CreateBody(world, def);
    b3.b3Body_SetName(body, prop.id);
    const shape = b3.b3DefaultShapeDef();
    shape.density = WORLD_V0_PROP_PHYSICS.density;
    shape.baseMaterial.friction = WORLD_V0_PROP_PHYSICS.friction;
    shape.baseMaterial.restitution = WORLD_V0_PROP_PHYSICS.restitution;
    b3.b3CreateBoxShape(body, shape, ...WORLD_V0_PROP_PHYSICS.halfExtents);
    bodies.set(prop.id, body);
  }
  for (let slot = 0; slot < 2; slot += 1) {
    const def = b3.b3DefaultBodyDef();
    def.type = b3.b3BodyType.b3_dynamicBody;
    def.position = [...WORLD_V0_PLAYER_STARTS[slot]];
    def.linearDamping = WORLD_V0_PLAYER_PHYSICS.linearDamping;
    def.angularDamping = WORLD_V0_PLAYER_PHYSICS.angularDamping;
    const body = b3.b3CreateBody(world, def);
    b3.b3Body_SetName(body, `actor:${slot}`);
    const shape = b3.b3DefaultShapeDef();
    shape.density = WORLD_V0_PLAYER_PHYSICS.density;
    shape.baseMaterial.friction = WORLD_V0_PLAYER_PHYSICS.friction;
    shape.baseMaterial.restitution = WORLD_V0_PLAYER_PHYSICS.restitution;
    b3.b3CreateCapsuleShape(body, shape, {
      center1: [...WORLD_V0_PLAYER_PHYSICS.capsuleCenter1],
      center2: [...WORLD_V0_PLAYER_PHYSICS.capsuleCenter2],
      radius: WORLD_V0_PLAYER_PHYSICS.capsuleRadius,
    });
    b3.b3Body_SetMotionLocks(body, { linearX:false, linearY:false, linearZ:false, angularX:true, angularY:true, angularZ:true });
    bodies.set(`actor:${slot}`, body);
  }
  return { world, bodies };
}

function applyHorizontalIntent(body, input) {
  const velocity = linearVelocity(body);
  const hasInput = Math.hypot(input.x, input.z) > 0.01;
  const accel = hasInput ? WORLD_V0_MOVEMENT.playerAcceleration : WORLD_V0_MOVEMENT.playerDeceleration;
  const [x, z] = moveToward2(velocity[0], velocity[2], input.x * WORLD_V0_MOVEMENT.playerSpeed, input.z * WORLD_V0_MOVEMENT.playerSpeed, accel * DT);
  b3.b3Body_SetLinearVelocity(body, [x, velocity[1], z]);
}

function canonicalInputs(tick) {
  const healthy = tick < 360 ? { x: 1, z: 0 } : { x: 0, z: -1 };
  let stale;
  let source;
  if (tick < STALE_START) {
    stale = { x: -1, z: 0 };
    source = "fresh";
  } else if (tick < LEASE_BOUNDARY) {
    stale = { x: -1, z: 0 };
    source = "held-last-within-lease";
  } else {
    // Proposed containment semantics: stale transport neutralizes this actor only.
    // The body remains physical and can still be pushed by the shared world.
    stale = { x: 0, z: 0 };
    source = "stale-neutral";
  }
  return { healthy, stale, source };
}

function step(sim, tick) {
  const inputs = canonicalInputs(tick);
  applyHorizontalIntent(sim.bodies.get("actor:0"), inputs.healthy);
  applyHorizontalIntent(sim.bodies.get("actor:1"), inputs.stale);
  b3.b3World_Step(sim.world, DT, SUBSTEPS);
  return inputs.source;
}

function remapFromPlayer(player) {
  const world = b3.b3RecPlayer_GetWorldId(player);
  const bodies = new Map();
  const count = b3.b3RecPlayer_GetBodyCount(player);
  for (let i = 0; i < count; i += 1) {
    const body = b3.b3RecPlayer_GetBodyId(player, i);
    if (!b3.b3Body_IsValid(body)) continue;
    const name = b3.b3Body_GetName(body);
    if (name) bodies.set(name, body);
  }
  for (const id of ["actor:0", "actor:1", ...WORLD_V0_PROP_LAYOUT.map((p) => p.id)]) {
    if (!bodies.has(id)) throw new Error(`rebase remap missing ${id}`);
  }
  return { world, bodies, player };
}

function exactWorld(a, c) {
  for (const [id, body] of a.bodies) {
    const other = c.bodies.get(id);
    if (!other || !exactBody(body, other)) return { exact:false, id };
  }
  return { exact:true, id:null };
}

const authority = makeWorld();
const healthyStart = position(authority.bodies.get("actor:0"));
const staleStart = position(authority.bodies.get("actor:1"));
const propStart = new Map(WORLD_V0_PROP_LAYOUT.map((p) => [p.id, position(authority.bodies.get(p.id))]));
let firstNeutralTick = null;
for (let tick = 0; tick < REJOIN_BOUNDARY; tick += 1) {
  const source = step(authority, tick);
  if (source === "stale-neutral" && firstNeutralTick === null) firstNeutralTick = tick;
}

const healthyAtRejoin = position(authority.bodies.get("actor:0"));
const staleAtRejoin = position(authority.bodies.get("actor:1"));
let maxPropDisplacement = 0;
for (const prop of WORLD_V0_PROP_LAYOUT) {
  maxPropDisplacement = Math.max(maxPropDisplacement, dist3(propStart.get(prop.id), position(authority.bodies.get(prop.id))));
}

const recording = b3.b3CreateRecording(0);
b3.b3World_StartRecording(authority.world, recording);
const seedBytes = b3.b3Recording_GetSize(recording);
b3.b3World_StopRecording(authority.world);
const player = b3.b3RecPlayer_CreateFromRecording(recording, 1);
if (!player) throw new Error("same-build returning-client rebase failed");
const returningClient = remapFromPlayer(player);
const seedExact = exactWorld(authority, returningClient);
if (!seedExact.exact) throw new Error(`rebase seed mismatch ${seedExact.id}`);

for (let tick = REJOIN_BOUNDARY; tick < REJOIN_BOUNDARY + CONTINUE_TICKS; tick += 1) {
  step(authority, tick);
  step(returningClient, tick);
  const exact = exactWorld(authority, returningClient);
  if (!exact.exact) throw new Error(`post-rejoin exact continuation diverged at tick ${tick} entity ${exact.id}`);
}

const result = {
  revision: "world-v0-stale-actor-containment-probe-v1",
  contract: {
    simulationHz: WORLD_V0_TIMING.simulationHz,
    leaseTicks: LEASE_TICKS,
    leaseMs: 1000 * LEASE_TICKS / WORLD_V0_TIMING.simulationHz,
  },
  boundaries: { staleStart: STALE_START, firstNeutralTick, leaseBoundary: LEASE_BOUNDARY, rejoinBoundary: REJOIN_BOUNDARY, finalBoundary: REJOIN_BOUNDARY + CONTINUE_TICKS },
  continuity: {
    worldEpochRotationsRequiredBySpecimen: 0,
    healthyActorDisplacementByRejoin: dist3(healthyStart, healthyAtRejoin),
    staleActorDisplacementByRejoin: dist3(staleStart, staleAtRejoin),
    maxPropDisplacementByRejoin: maxPropDisplacement,
  },
  rebase: {
    seedBytes,
    seedKiB: seedBytes / 1024,
    exactAtSeed: seedExact.exact,
    exactContinuationTicks: CONTINUE_TICKS,
  },
  verdict: "WORLD_V0_STALE_ACTOR_CONTAINMENT_PHYSICS_PASS",
  nonClaim: "This proves the physics/truth feasibility of stale-neutral actor containment plus same-build full-state rebase. It does not yet prove Durable Object session-token/rebind semantics or browser UX.",
};
console.log("WORLD_V0_STALE_ACTOR_CONTAINMENT_PROBE", JSON.stringify(result, null, 2));
if (firstNeutralTick !== LEASE_BOUNDARY) throw new Error(`neutralization boundary drift ${firstNeutralTick}`);
if (result.continuity.healthyActorDisplacementByRejoin < 1) throw new Error("healthy actor did not continue meaningfully after peer staleness");
if (!result.rebase.exactAtSeed) throw new Error("rebase seed not exact");
console.log(result.verdict);

b3.b3RecPlayer_Destroy(player);
b3.b3DestroyRecording(recording);
b3.b3DestroyWorld(authority.world);
