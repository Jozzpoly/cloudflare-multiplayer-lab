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
function bodyVelocity(body) { const out=[0,0,0]; b3.b3Body_GetLinearVelocity(out, body); return out; }
function createWorld() {
  const wd = b3.b3DefaultWorldDef();
  wd.gravity = [...WORLD_V0_ARENA.gravity];
  const world = b3.b3CreateWorld(wd);
  for (const box of WORLD_V0_ARENA.staticBoxes) {
    const bd = b3.b3DefaultBodyDef(); bd.position=[...box.position];
    const body=b3.b3CreateBody(world,bd);
    b3.b3Body_SetName(body,box.id);
    b3.b3CreateBoxShape(body,b3.b3DefaultShapeDef(),...box.halfExtents);
  }
  const props=[];
  for (const authored of WORLD_V0_PROP_LAYOUT) {
    const bd=b3.b3DefaultBodyDef(); bd.type=b3.b3BodyType.b3_dynamicBody; bd.position=[...authored.position]; bd.linearDamping=WORLD_V0_PROP_PHYSICS.linearDamping; bd.angularDamping=WORLD_V0_PROP_PHYSICS.angularDamping;
    const body=b3.b3CreateBody(world,bd); b3.b3Body_SetName(body,authored.id);
    const sd=b3.b3DefaultShapeDef(); sd.density=WORLD_V0_PROP_PHYSICS.density; sd.baseMaterial.friction=WORLD_V0_PROP_PHYSICS.friction; sd.baseMaterial.restitution=WORLD_V0_PROP_PHYSICS.restitution;
    b3.b3CreateBoxShape(body,sd,...WORLD_V0_PROP_PHYSICS.halfExtents); props.push(body);
  }
  const players=[];
  for (let slot=0;slot<2;slot++) {
    const bd=b3.b3DefaultBodyDef(); bd.type=b3.b3BodyType.b3_dynamicBody; bd.position=[...WORLD_V0_PLAYER_STARTS[slot]]; bd.linearDamping=WORLD_V0_PLAYER_PHYSICS.linearDamping; bd.angularDamping=WORLD_V0_PLAYER_PHYSICS.angularDamping;
    const body=b3.b3CreateBody(world,bd); b3.b3Body_SetName(body,`actor:${slot}`);
    const sd=b3.b3DefaultShapeDef(); sd.density=WORLD_V0_PLAYER_PHYSICS.density; sd.baseMaterial.friction=WORLD_V0_PLAYER_PHYSICS.friction; sd.baseMaterial.restitution=WORLD_V0_PLAYER_PHYSICS.restitution;
    b3.b3CreateCapsuleShape(body,sd,{center1:[...WORLD_V0_PLAYER_PHYSICS.capsuleCenter1],center2:[...WORLD_V0_PLAYER_PHYSICS.capsuleCenter2],radius:WORLD_V0_PLAYER_PHYSICS.capsuleRadius});
    b3.b3Body_SetMotionLocks(body,{linearX:false,linearY:false,linearZ:false,angularX:true,angularY:true,angularZ:true}); players.push(body);
  }
  return {world,players,props};
}
function step(scene,tick) {
  for (let slot=0;slot<scene.players.length;slot++) {
    const body=scene.players[slot]; const v=bodyVelocity(body);
    // Both actors cross the central barricade repeatedly to build realistic contacts/warm starts.
    const direction = slot===0 ? 1 : -1;
    const phase = tick % 240;
    const sign = phase < 120 ? direction : -direction;
    const targetX=sign*WORLD_V0_MOVEMENT.playerSpeed;
    const maxDelta=WORLD_V0_MOVEMENT.playerAcceleration/WORLD_V0_TIMING.simulationHz;
    const nextX=v[0] < targetX ? Math.min(targetX,v[0]+maxDelta) : Math.max(targetX,v[0]-maxDelta);
    b3.b3Body_SetLinearVelocity(body,[nextX,v[1],0]);
  }
  b3.b3World_Step(scene.world,DT,WORLD_V0_TIMING.substeps);
}
function capture(scene,frames) {
  const recording=b3.b3CreateRecording(0);
  b3.b3World_StartRecording(scene.world,recording);
  for (let i=0;i<frames;i++) step(scene,600+i);
  b3.b3World_StopRecording(scene.world);
  const size=b3.b3Recording_GetSize(recording);
  b3.b3DestroyRecording(recording);
  return size;
}
const scene=createWorld();
for (let tick=0;tick<600;tick++) step(scene,tick);
const seedOnlyBytes=capture(scene,0);
const oneSecondBytes=capture(scene,60);
const fiveSecondBytes=capture(scene,300);
const result={
  dynamicEntities: WORLD_V0_PROP_LAYOUT.length+2,
  staticBodies: WORLD_V0_ARENA.staticBoxes.length,
  seedOnlyBytes,
  seedOnlyKiB: seedOnlyBytes/1024,
  oneSecondBytes,
  oneSecondKiB: oneSecondBytes/1024,
  fiveSecondBytes,
  fiveSecondKiB: fiveSecondBytes/1024,
  incrementalBytesPerSecondApprox:(fiveSecondBytes-seedOnlyBytes)/5,
  note:"Same-build Box3D recording seed, measured after 10s of contact-rich Shared Yard simulation. This is not yet a network format because box3d.js@0.1.1 lacks raw byte bindings.",
};
if (!(seedOnlyBytes>0 && oneSecondBytes>=seedOnlyBytes && fiveSecondBytes>=oneSecondBytes)) throw new Error(`invalid recording size progression ${JSON.stringify(result)}`);
console.log("WORLD_V0_SHARED_YARD_SEED_SIZE_PASS",JSON.stringify(result,null,2));
b3.b3DestroyWorld(scene.world);
