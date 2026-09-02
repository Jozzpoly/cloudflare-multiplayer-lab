import { writeFileSync } from "node:fs";
import Box3D from "box3d.js/inline";

const b3 = await Box3D();

const REVISION = "ws0-history-f1-causal-time-topology-v1";
const FIXED_DT = 1 / 60;
const STEP_MS = 1000 / 60;
const SUBSTEPS = 4;
const PLAYER_SPEED = 5.2;
const PLAYER_ACCELERATION = 28;
const PLAYER_DECELERATION = 36;
const PROP_COUNT = 12;
const EPS = 1e-9;
const PRE_ROLL_TICKS = 60;
const LEG_DELAYS_MS = [65, 85];
const DOWNLINK_PHASES_MS = [0, STEP_MS * 0.25, STEP_MS * 0.5, STEP_MS * 0.75];
const POLICIES = ["receipt-live", "peer-authority-tick", "peer-source", "all-source"];
const OUTPUT = process.env.WS0_HISTORY_F1_OUTPUT || "ws0-history-f1-causal-time-topology.json";

const STARTS = { A: [-6.5, 0.82, -1.4], B: [6.5, 0.82, 0] };
const SCENARIO = {
  name: "player-contact-only",
  durationMs: 7200,
  a: [
    { atMs: 0, x: 0, z: 1 }, { atMs: 360, x: 0, z: 0 },
    { atMs: 600, x: 0, z: 1 }, { atMs: 1500, x: 0, z: 0 },
    { atMs: 1800, x: 1, z: 0 }, { atMs: 4300, x: 0, z: 0 },
  ],
  b: [
    { atMs: 0, x: 0, z: 0 }, { atMs: 600, x: 0, z: 1 },
    { atMs: 1500, x: 0, z: 0 }, { atMs: 1800, x: -1, z: 0 },
    { atMs: 4300, x: 0, z: 0 },
  ],
};

function distance3(a, b) { return Math.hypot(a[0]-b[0], a[1]-b[1], a[2]-b[2]); }
function horizontalDistance(a, b) { return Math.hypot(a[0]-b[0], a[2]-b[2]); }
function percentile(values, p) {
  if (!values.length) return NaN;
  const sorted=[...values].sort((a,b)=>a-b);
  return sorted[Math.min(sorted.length-1,Math.max(0,Math.ceil(sorted.length*p)-1))];
}
function median(values){return percentile(values,.5);}
function moveToward2(cx,cz,tx,tz,maxDelta){
  const dx=tx-cx,dz=tz-cz,d=Math.hypot(dx,dz);
  if(d<=maxDelta||d<EPS)return[tx,tz];
  const s=maxDelta/d;return[cx+dx*s,cz+dz*s];
}
function createStaticBox(world,position,half){
  const def=b3.b3DefaultBodyDef();def.position=[...position];const body=b3.b3CreateBody(world,def);
  b3.b3CreateBoxShape(body,b3.b3DefaultShapeDef(),half[0],half[1],half[2]);
}
function createActorBody(world,start){
  const def=b3.b3DefaultBodyDef();def.type=b3.b3BodyType.b3_dynamicBody;def.position=[...start];def.linearDamping=.3;def.angularDamping=8;
  const body=b3.b3CreateBody(world,def);const shape=b3.b3DefaultShapeDef();shape.density=80;shape.baseMaterial.friction=.8;shape.baseMaterial.restitution=.02;
  b3.b3CreateCapsuleShape(body,shape,{center1:[0,-.45,0],center2:[0,.45,0],radius:.35});
  b3.b3Body_SetMotionLocks(body,{linearX:false,linearY:false,linearZ:false,angularX:true,angularY:true,angularZ:true});return body;
}
function createSimulation({actorOrder=["A","B"],applyOrder=["A","B"]}={}){
  const wd=b3.b3DefaultWorldDef();wd.gravity=[0,-20,0];const world=b3.b3CreateWorld(wd);
  createStaticBox(world,[0,-.5,0],[10,.5,10]);createStaticBox(world,[-9.5,1.5,0],[.5,2,10]);createStaticBox(world,[9.5,1.5,0],[.5,2,10]);
  createStaticBox(world,[0,1.5,-9.5],[10,2,.5]);createStaticBox(world,[0,1.5,9.5],[10,2,.5]);
  const props=[];
  for(let i=0;i<PROP_COUNT;i++){
    const col=i%4,row=Math.floor(i/4),initial=[(col-1.5)*1.05,.46,(row-1)*1.05];
    const def=b3.b3DefaultBodyDef();def.type=b3.b3BodyType.b3_dynamicBody;def.position=[...initial];def.linearDamping=.08;def.angularDamping=.12;
    const body=b3.b3CreateBody(world,def);const shape=b3.b3DefaultShapeDef();shape.density=22;shape.baseMaterial.friction=.72;shape.baseMaterial.restitution=.04;
    b3.b3CreateBoxShape(body,shape,.46,.46,.46);props.push({body,initial});
  }
  const actors=new Map();for(const id of actorOrder)actors.set(id,createActorBody(world,STARTS[id]));
  return{world,actors,props,applyOrder:[...applyOrder],inputs:{A:{x:0,z:0},B:{x:0,z:0}}};
}
function destroySimulation(sim){b3.b3DestroyWorld(sim.world);}
function bodyPosition(body){const o=[0,0,0];b3.b3Body_GetPosition(o,body);return[...o];}
function bodyVelocity(body){const o=[0,0,0];b3.b3Body_GetLinearVelocity(o,body);return[...o];}
function actorState(sim,id){const body=sim.actors.get(id);return{position:bodyPosition(body),velocity:bodyVelocity(body)};}
function applyIntent(body,input){
  const v=bodyVelocity(body),has=Math.hypot(input.x,input.z)>.01,tx=input.x*PLAYER_SPEED,tz=input.z*PLAYER_SPEED,accel=has?PLAYER_ACCELERATION:PLAYER_DECELERATION;
  const[x,z]=moveToward2(v[0],v[2],tx,tz,accel*FIXED_DT);b3.b3Body_SetLinearVelocity(body,[x,v[1],z]);
}
function stepSimulation(sim){for(const id of sim.applyOrder)applyIntent(sim.actors.get(id),sim.inputs[id]);b3.b3World_Step(sim.world,FIXED_DT,SUBSTEPS);}
function preRoll(sim){for(let i=0;i<PRE_ROLL_TICKS;i++)stepSimulation(sim);}
function maxPropMovement(sim){let max=0;for(const p of sim.props){const x=bodyPosition(p.body);max=Math.max(max,horizontalDistance(x,p.initial));}return max;}
function applyEvents(events,cursor,dueMs,inputs,id,limit=events.length,mapTime=(e)=>e.atMs){
  while(cursor.index<limit&&cursor.index<events.length&&mapTime(events[cursor.index])<=dueMs+EPS){const e=events[cursor.index++];inputs[id]={x:e.x,z:e.z};}
}
function countArrivals(events,cursor,dueMs,mapTime){let n=0;while(cursor.index<events.length&&mapTime(events[cursor.index])<=dueMs+EPS){cursor.index++;n++;}return n;}
function authorityApplyTick(event,legMs){return Math.ceil((event.atMs+legMs-EPS)/STEP_MS);}
function authorityApplyMs(event,legMs){return authorityApplyTick(event,legMs)*STEP_MS;}
function sourceMap(e){return e.atMs;}
function authorityMap(legMs){return(e)=>authorityApplyMs(e,legMs);}

function rebuildThroughTick({actorOrder,applyOrder,knownA,knownB,tick,mapA,mapB}){
  const sim=createSimulation({actorOrder,applyOrder});preRoll(sim);const ca={index:0},cb={index:0};
  for(let i=0;i<=tick;i++){
    const t=i*STEP_MS;
    applyEvents(SCENARIO.a,ca,t,sim.inputs,"A",knownA,mapA);
    applyEvents(SCENARIO.b,cb,t,sim.inputs,"B",knownB,mapB);
    stepSimulation(sim);
  }
  return sim;
}
function createAuthorityRuntime(policy){const sim=createSimulation();preRoll(sim);return{sim,knownA:0,knownB:0,arrA:{index:0},arrB:{index:0},resims:0,replayedTicks:0,maxReplayTicks:0,policy};}
function createClientRuntime(selfId,policy){
  const actorOrder=selfId==="A"?["A","B"]:["B","A"],applyOrder=[...actorOrder],sim=createSimulation({actorOrder,applyOrder});preRoll(sim);
  return{selfId,remoteId:selfId==="A"?"B":"A",selfTrace:selfId==="A"?SCENARIO.a:SCENARIO.b,remoteTrace:selfId==="A"?SCENARIO.b:SCENARIO.a,
    actorOrder,applyOrder,sim,selfCursor:{index:0},remoteArrival:{index:0},knownRemote:0,resims:0,replayedTicks:0,maxReplayTicks:0,selfPositionReplacement:[],policy};
}
function destroyAuthority(r){destroySimulation(r.sim);}
function destroyClient(r){destroySimulation(r.sim);}

function advanceSourceOracle(sim,cursors,tick){const t=tick*STEP_MS;applyEvents(SCENARIO.a,cursors.A,t,sim.inputs,"A");applyEvents(SCENARIO.b,cursors.B,t,sim.inputs,"B");stepSimulation(sim);}

function advanceAuthority(runtime,tick,legMs){
  const t=tick*STEP_MS;
  const newA=countArrivals(SCENARIO.a,runtime.arrA,t,(e)=>e.atMs+legMs);
  const newB=countArrivals(SCENARIO.b,runtime.arrB,t,(e)=>e.atMs+legMs);
  runtime.knownA+=newA;runtime.knownB+=newB;
  if(runtime.policy!=="all-source"){
    if(newA>0){const e=SCENARIO.a[runtime.knownA-1];runtime.sim.inputs.A={x:e.x,z:e.z};}
    if(newB>0){const e=SCENARIO.b[runtime.knownB-1];runtime.sim.inputs.B={x:e.x,z:e.z};}
    stepSimulation(runtime.sim);return;
  }
  if(newA===0&&newB===0){stepSimulation(runtime.sim);return;}
  const rebuilt=rebuildThroughTick({actorOrder:["A","B"],applyOrder:["A","B"],knownA:runtime.knownA,knownB:runtime.knownB,tick,mapA:sourceMap,mapB:sourceMap});
  destroySimulation(runtime.sim);runtime.sim=rebuilt;runtime.resims+=1;runtime.replayedTicks+=tick+1;runtime.maxReplayTicks=Math.max(runtime.maxReplayTicks,tick+1);
}

function advanceClient(runtime,tick,legMs,phaseMs){
  const t=tick*STEP_MS;
  applyEvents(runtime.selfTrace,runtime.selfCursor,t,runtime.sim.inputs,runtime.selfId);
  const newly=countArrivals(runtime.remoteTrace,runtime.remoteArrival,t,(e)=>e.atMs+2*legMs+phaseMs);
  runtime.knownRemote+=newly;
  if(runtime.policy==="receipt-live"){
    if(newly>0){const e=runtime.remoteTrace[runtime.knownRemote-1];runtime.sim.inputs[runtime.remoteId]={x:e.x,z:e.z};}
    stepSimulation(runtime.sim);return;
  }
  if(newly===0){stepSimulation(runtime.sim);return;}
  const latest=runtime.remoteTrace[runtime.knownRemote-1];runtime.sim.inputs[runtime.remoteId]={x:latest.x,z:latest.z};stepSimulation(runtime.sim);
  const before=actorState(runtime.sim,runtime.selfId);
  const mapRemote=runtime.policy==="peer-authority-tick"?authorityMap(legMs):sourceMap;
  const knownA=runtime.selfId==="A"?SCENARIO.a.length:runtime.knownRemote;
  const knownB=runtime.selfId==="B"?SCENARIO.b.length:runtime.knownRemote;
  const mapA=runtime.selfId==="A"?sourceMap:mapRemote;
  const mapB=runtime.selfId==="B"?sourceMap:mapRemote;
  const rebuilt=rebuildThroughTick({actorOrder:runtime.actorOrder,applyOrder:runtime.applyOrder,knownA,knownB,tick,mapA,mapB});
  const after=actorState(rebuilt,runtime.selfId);
  runtime.selfPositionReplacement.push(distance3(before.position,after.position));
  destroySimulation(runtime.sim);runtime.sim=rebuilt;runtime.resims+=1;runtime.replayedTicks+=tick+1;runtime.maxReplayTicks=Math.max(runtime.maxReplayTicks,tick+1);
}

function maxActorSplit(a,b){return Math.max(distance3(actorState(a,"A").position,actorState(b,"A").position),distance3(actorState(a,"B").position,actorState(b,"B").position));}
function maxWorldResidual(sim,ref){return Math.max(distance3(actorState(sim,"A").position,actorState(ref,"A").position),distance3(actorState(sim,"B").position,actorState(ref,"B").position));}
function summarize(values){return{median:median(values),p95:percentile(values,.95),max:values.length?Math.max(...values):0};}

function runCell({policy,legMs,phaseMs}){
  const sourceOracle=createSimulation();preRoll(sourceOracle);const sourceCursors={A:{index:0},B:{index:0}};
  const authority=createAuthorityRuntime(policy);
  const clientA=createClientRuntime("A",policy),clientB=createClientRuntime("B",policy);
  const clientSplit=[],clientAuthority=[],authoritySource=[],clientSource=[];let oracleMinSeparation=Infinity;
  try{
    const total=Math.ceil(SCENARIO.durationMs/STEP_MS)+1;
    for(let tick=0;tick<total;tick++){
      advanceSourceOracle(sourceOracle,sourceCursors,tick);
      advanceAuthority(authority,tick,legMs);
      advanceClient(clientA,tick,legMs,phaseMs);advanceClient(clientB,tick,legMs,phaseMs);
      oracleMinSeparation=Math.min(oracleMinSeparation,distance3(actorState(sourceOracle,"A").position,actorState(sourceOracle,"B").position));
      clientSplit.push(maxActorSplit(clientA.sim,clientB.sim));
      clientAuthority.push(Math.max(maxWorldResidual(clientA.sim,authority.sim),maxWorldResidual(clientB.sim,authority.sim)));
      authoritySource.push(maxWorldResidual(authority.sim,sourceOracle));
      clientSource.push(Math.max(maxWorldResidual(clientA.sim,sourceOracle),maxWorldResidual(clientB.sim,sourceOracle)));
    }
    return{
      policy,legMs,peerNominalMs:2*legMs,phaseMs,oracleMinSeparation,
      clientSplit:{...summarize(clientSplit),final:clientSplit.at(-1)},
      clientAuthority:{...summarize(clientAuthority),final:clientAuthority.at(-1)},
      authoritySource:{...summarize(authoritySource),final:authoritySource.at(-1)},
      clientSource:{...summarize(clientSource),final:clientSource.at(-1)},
      resim:{authority:authority.resims,clientA:clientA.resims,clientB:clientB.resims,maxReplayTicks:Math.max(authority.maxReplayTicks,clientA.maxReplayTicks,clientB.maxReplayTicks)},
      maxSelfPositionReplacement:Math.max(0,...clientA.selfPositionReplacement,...clientB.selfPositionReplacement),
      propMovement:{source:maxPropMovement(sourceOracle),authority:maxPropMovement(authority.sim),clientA:maxPropMovement(clientA.sim),clientB:maxPropMovement(clientB.sim)},
    };
  }finally{destroySimulation(sourceOracle);destroyAuthority(authority);destroyClient(clientA);destroyClient(clientB);}
}

function assertCell(cell){
  if(cell.oracleMinSeparation>.72)throw new Error(`${cell.policy}/${cell.legMs}/${cell.phaseMs}: source oracle failed player contact ${cell.oracleMinSeparation}`);
  const maxProp=Math.max(...Object.values(cell.propMovement));if(maxProp>.05)throw new Error(`${cell.policy}/${cell.legMs}/${cell.phaseMs}: prop contamination ${maxProp}`);
}

console.log(`${REVISION} · Box3D ${JSON.stringify(b3.b3GetVersion())}`);
console.log(`leg delays=${LEG_DELAYS_MS.join(",")}ms => peer nominal=${LEG_DELAYS_MS.map(v=>v*2).join(",")}ms`);
const cells=[];
for(const policy of POLICIES)for(const legMs of LEG_DELAYS_MS)for(const phaseMs of DOWNLINK_PHASES_MS){
  const cell=runCell({policy,legMs,phaseMs});assertCell(cell);cells.push(cell);
  console.log(`${policy.padEnd(20)} leg=${legMs} peer≈${2*legMs} phase=${phaseMs.toFixed(2).padStart(5)} `+
    `ABp95=${cell.clientSplit.p95.toFixed(3)}m ABfinal=${cell.clientSplit.final.toFixed(3)}m `+
    `authP95=${cell.clientAuthority.p95.toFixed(3)}m authFinal=${cell.clientAuthority.final.toFixed(3)}m sourceFinal=${cell.clientSource.final.toFixed(3)}m`);
}

const summary=[];
for(const policy of POLICIES)for(const legMs of LEG_DELAYS_MS){
  const g=cells.filter(c=>c.policy===policy&&c.legMs===legMs);
  summary.push({policy,legMs,peerNominalMs:2*legMs,
    clientSplitP95Median:median(g.map(c=>c.clientSplit.p95)),clientSplitP95Max:Math.max(...g.map(c=>c.clientSplit.p95)),clientSplitFinalMax:Math.max(...g.map(c=>c.clientSplit.final)),
    clientAuthorityP95Median:median(g.map(c=>c.clientAuthority.p95)),clientAuthorityFinalMax:Math.max(...g.map(c=>c.clientAuthority.final)),
    authoritySourceP95Median:median(g.map(c=>c.authoritySource.p95)),authoritySourceFinalMax:Math.max(...g.map(c=>c.authoritySource.final)),
    clientSourceP95Median:median(g.map(c=>c.clientSource.p95)),clientSourceFinalMax:Math.max(...g.map(c=>c.clientSource.final)),
    maxSelfPositionReplacement:Math.max(...g.map(c=>c.maxSelfPositionReplacement)),maxReplayTicks:Math.max(...g.map(c=>c.resim.maxReplayTicks))});
}
console.log("\nF1 causal-time topology summary:");
for(const r of summary)console.log(`${r.policy.padEnd(20)} leg=${r.legMs} peer≈${r.peerNominalMs}ms · `+
  `ABp95=${r.clientSplitP95Median.toFixed(3)}/${r.clientSplitP95Max.toFixed(3)}m ABfinalMax=${r.clientSplitFinalMax.toFixed(3)}m `+
  `client↔authP95=${r.clientAuthorityP95Median.toFixed(3)}m finalMax=${r.clientAuthorityFinalMax.toFixed(3)}m `+
  `auth↔sourceFinalMax=${r.authoritySourceFinalMax.toFixed(3)}m`);

const evidence={revision:REVISION,generatedAt:new Date().toISOString(),design:{baseResearchHead:"a4263565a1b39de35f93f85c5ada01d8ef9147e3",box3d:"box3d.js@0.1.1",simulationHz:60,substeps:SUBSTEPS,scenario:SCENARIO,
  topology:"self applies input at source tick; authority first learns it after one WAN leg; peer first learns it after a second WAN leg plus explicit phase",
  policies:{
    "receipt-live":"Authority and peer both apply inputs only on receipt; no history.",
    "peer-authority-tick":"Authority remains receipt-time. Peer resimulates newly known remote input to the discrete tick on which authority first applied it. Self remains source-time immediate.",
    "peer-source":"Authority remains receipt-time. Peers resimulate newly known remote input to its original source time; clients may agree with each other while disagreeing with authority.",
    "all-source":"Authority and peers both resimulate newly known input to original source time. This is the source-time canonical-history ceiling and implies authority history repair too."
  },
  boundary:"This is a timing/topology feasibility gate. It does not implement network clock synchronization, trusted tick validation, Box3D checkpoint storage, browser rollback or smoothing."},cells,summary};
writeFileSync(OUTPUT,JSON.stringify(evidence,null,2));
console.log(`\nF1 STRUCTURAL PASS · evidence written to ${OUTPUT}`);
