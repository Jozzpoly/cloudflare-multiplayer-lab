import { writeFileSync } from "node:fs";
import Box3D from "box3d.js/inline";

const b3 = await Box3D();

const REVISION = "ws0-f4-identity-lifecycle-v1";
const OUTPUT = process.env.WS0_F4_IDENTITY_OUTPUT || "ws0-f4-identity-lifecycle.json";
const DT = 1 / 60;
const SUBSTEPS = 4;
const EPS = 1e-6;

function createGround(world) {
  const def = b3.b3DefaultBodyDef();
  def.position = [0, -0.5, 0];
  const body = b3.b3CreateBody(world, def);
  b3.b3CreateBoxShape(body, b3.b3DefaultShapeDef(), 6, 0.5, 6);
  return body;
}
function createTracked(world, name, position) {
  const def = b3.b3DefaultBodyDef();
  def.type = b3.b3BodyType.b3_dynamicBody;
  def.position = [...position];
  const body = b3.b3CreateBody(world, def);
  b3.b3Body_SetName(body, name);
  const shape = b3.b3DefaultShapeDef();
  shape.density = 8;
  b3.b3CreateBoxShape(body, shape, 0.4, 0.4, 0.4);
  return body;
}
function pos(body) {
  const out = [0,0,0];
  b3.b3Body_GetPosition(out, body);
  return [...out];
}
function maxVecDelta(a,b){return Math.max(Math.abs(a[0]-b[0]),Math.abs(a[1]-b[1]),Math.abs(a[2]-b[2]));}
function scanByName(player) {
  const map = new Map();
  const holes = [];
  const count = b3.b3RecPlayer_GetBodyCount(player);
  for (let ordinal=0;ordinal<count;ordinal++) {
    const body = b3.b3RecPlayer_GetBodyId(player, ordinal);
    if (!b3.b3Body_IsValid(body)) {
      holes.push(ordinal);
      continue;
    }
    const name = b3.b3Body_GetName(body);
    if (name) {
      if (map.has(name)) throw new Error(`duplicate body name ${name}`);
      map.set(name,{ordinal,body,position:pos(body)});
    }
  }
  return {count,map,holes};
}
function requireName(scan,name){
  const hit=scan.map.get(name);
  if(!hit)throw new Error(`missing ${name}`);
  return hit;
}

let world=0,rec0=0,player0=0,rec1=0,player1=0;
try {
  const wd=b3.b3DefaultWorldDef();
  wd.gravity=[0,-10,0];
  world=b3.b3CreateWorld(wd);
  createGround(world);
  const stable=createTracked(world,"entity:stable",[-1,1,0]);
  let old=createTracked(world,"entity:old",[1,1,0]);

  rec0=b3.b3CreateRecording(1024*1024);
  b3.b3World_StartRecording(world,rec0);

  for(let i=0;i<2;i++)b3.b3World_Step(world,DT,SUBSTEPS);

  b3.b3DestroyBody(old);
  old=0;
  const replacement=createTracked(world,"entity:new",[1,2,0]);
  b3.b3Body_SetLinearVelocity(replacement,[1.5,0,0]);
  b3.b3World_Step(world,DT,SUBSTEPS);
  for(let i=0;i<2;i++)b3.b3World_Step(world,DT,SUBSTEPS);

  b3.b3World_StopRecording(world);
  const rec0Bytes=b3.b3Recording_GetSize(rec0);

  player0=b3.b3RecPlayer_CreateFromRecording(rec0,0);
  if(!player0)throw new Error("player0 create failed");

  b3.b3RecPlayer_SeekFrame(player0,2);
  const frame2=scanByName(player0);
  const oldAt2=requireName(frame2,"entity:old");
  if(frame2.map.has("entity:new"))throw new Error("new entity visible before create frame");

  b3.b3RecPlayer_SeekFrame(player0,3);
  if(b3.b3RecPlayer_HasDiverged(player0))throw new Error(`player0 diverged at ${b3.b3RecPlayer_GetDivergeFrame(player0)}`);
  const frame3=scanByName(player0);
  const stable0=requireName(frame3,"entity:stable");
  const new0=requireName(frame3,"entity:new");
  if(frame3.map.has("entity:old"))throw new Error("destroyed entity still resolves by name");
  if(!frame3.holes.includes(oldAt2.ordinal))throw new Error(`destroyed creation ordinal ${oldAt2.ordinal} did not remain a hole`);
  if(new0.ordinal===oldAt2.ordinal)throw new Error("new entity reused old creation ordinal inside one recording generation");

  const handoffSeedStable=stable0.position;
  const handoffSeedNew=new0.position;
  const world0=b3.b3RecPlayer_GetWorldId(player0);

  rec1=b3.b3CreateRecording(1024*1024);
  b3.b3World_StartRecording(world0,rec1);
  const rec1SeedBytes=b3.b3Recording_GetSize(rec1);
  for(let i=0;i<4;i++)b3.b3World_Step(world0,DT,SUBSTEPS);
  b3.b3World_StopRecording(world0);
  const rec1Bytes=b3.b3Recording_GetSize(rec1);

  player1=b3.b3RecPlayer_CreateFromRecording(rec1,0);
  if(!player1)throw new Error("player1 create failed");
  const seed1=scanByName(player1);
  const stable1=requireName(seed1,"entity:stable");
  const new1=requireName(seed1,"entity:new");
  if(seed1.map.has("entity:old"))throw new Error("destroyed entity reappeared in fresh generation seed");
  if(maxVecDelta(stable1.position,handoffSeedStable)>EPS)throw new Error("stable seed state changed across generation handoff");
  if(maxVecDelta(new1.position,handoffSeedNew)>EPS)throw new Error("new seed state changed across generation handoff");

  if(new1.ordinal===new0.ordinal)throw new Error("expected generation-local ordinal rebinding was not observed");

  for(let i=0;i<4;i++){
    if(!b3.b3RecPlayer_StepFrame(player1))throw new Error(`player1 ended at ${i}`);
  }
  if(b3.b3RecPlayer_HasDiverged(player1))throw new Error(`player1 diverged at ${b3.b3RecPlayer_GetDivergeFrame(player1)}`);

  const evidence={
    revision:REVISION,
    generatedAt:new Date().toISOString(),
    packageContract:"box3d.js@0.1.1 imported through box3d.js/inline",
    box3dVersion:b3.b3GetVersion(),
    firstGeneration:{
      recordingBytes:rec0Bytes,
      frame2BodyCount:frame2.count,
      oldOrdinal:oldAt2.ordinal,
      frame3BodyCount:frame3.count,
      holesAfterDestroy:frame3.holes,
      stableOrdinal:stable0.ordinal,
      newOrdinal:new0.ordinal,
    },
    secondGeneration:{
      seedBytes:rec1SeedBytes,
      recordingBytes:rec1Bytes,
      seedBodyCount:seed1.count,
      holesAtSeed:seed1.holes,
      stableOrdinal:stable1.ordinal,
      newOrdinal:new1.ordinal,
    },
    qualifiedIdentityRule:
      "NetEntityId is host identity. RecPlayer creation ordinals are generation-local. On every fresh recording/player generation, enumerate live replay bodies and rebind NetEntityId using a preserved locator (F4 uses body name), then use ordinal -> current BodyId only within that generation.",
    boundary:
      "Body name is used here as the current box3d.js-supported preserved locator. F4 does not claim debug names are the final production NetEntityId transport.",
  };
  writeFileSync(OUTPUT,JSON.stringify(evidence,null,2));
  console.log(`${REVISION} · gen0 old=${oldAt2.ordinal} new=${new0.ordinal} holes=[${frame3.holes}] · gen1 new=${new1.ordinal}`);
  console.log(`F4C QUALIFIED · creation ordinal is generation-local · evidence written to ${OUTPUT}`);
} finally {
  if(player1)b3.b3RecPlayer_Destroy(player1);
  if(rec1)b3.b3DestroyRecording(rec1);
  if(player0)b3.b3RecPlayer_Destroy(player0);
  if(rec0)b3.b3DestroyRecording(rec0);
  if(world)b3.b3DestroyWorld(world);
}
