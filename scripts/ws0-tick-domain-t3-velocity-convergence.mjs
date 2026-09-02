import { writeFileSync } from "node:fs";
import Box3D from "box3d.js/inline";

const b3 = await Box3D();

const REVISION = "ws0-tick-domain-t3-velocity-convergence-v1";
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
const POLICIES = [
  { name: "velocity-100", correctionMs: 100, contactOverride: false },
  { name: "velocity-200", correctionMs: 200, contactOverride: false },
  { name: "velocity-400", correctionMs: 400, contactOverride: false },
  { name: "velocity-200-contact", correctionMs: 200, contactOverride: true },
];
const OUTPUT = process.env.WS0_TICK_T3_OUTPUT || "ws0-tick-domain-t3-velocity-convergence.json";

const STARTS = { A: [-6.5, 0.82, -1.4], B: [6.5, 0.82, 0] };
const SCENARIOS = [
  {
    name: "approach-no-contact",
    durationMs: 5800,
    a: [
      { atMs: 0, x: 0, z: 1 }, { atMs: 360, x: 0, z: 0 },
      { atMs: 600, x: 0, z: 1 }, { atMs: 1500, x: 0, z: 0 },
      { atMs: 1800, x: 1, z: 0 }, { atMs: 2800, x: 0, z: 0 },
    ],
    b: [
      { atMs: 0, x: 0, z: 0 }, { atMs: 600, x: 0, z: 1 },
      { atMs: 1500, x: 0, z: 0 }, { atMs: 1800, x: -1, z: 0 },
      { atMs: 2800, x: 0, z: 0 },
    ],
  },
  {
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
  },
];

function distance3(a, b) { return Math.hypot(a[0]-b[0], a[1]-b[1], a[2]-b[2]); }
function horizontalDistance(a, b) { return Math.hypot(a[0]-b[0], a[2]-b[2]); }
function horizontalSpeed(v) { return Math.hypot(v[0], v[2]); }
function percentile(values, p) {
  if (!values.length) return NaN;
  const sorted = [...values].sort((a,b)=>a-b);
  const i = Math.min(sorted.length-1, Math.max(0, Math.ceil(sorted.length*p)-1));
  return sorted[i];
}
function median(values) { return percentile(values, 0.5); }
function moveToward2(cx, cz, tx, tz, maxDelta) {
  const dx=tx-cx, dz=tz-cz, d=Math.hypot(dx,dz);
  if (d<=maxDelta || d<EPS) return [tx,tz];
  const s=maxDelta/d; return [cx+dx*s, cz+dz*s];
}
function createStaticBox(world, position, halfExtents) {
  const def=b3.b3DefaultBodyDef(); def.position=[...position];
  const body=b3.b3CreateBody(world,def);
  b3.b3CreateBoxShape(body,b3.b3DefaultShapeDef(),halfExtents[0],halfExtents[1],halfExtents[2]);
}
function createActorBody(world,start) {
  const def=b3.b3DefaultBodyDef(); def.type=b3.b3BodyType.b3_dynamicBody; def.position=[...start]; def.linearDamping=.3; def.angularDamping=8;
  const body=b3.b3CreateBody(world,def); const shape=b3.b3DefaultShapeDef();
  shape.density=80; shape.baseMaterial.friction=.8; shape.baseMaterial.restitution=.02;
  b3.b3CreateCapsuleShape(body,shape,{center1:[0,-.45,0],center2:[0,.45,0],radius:PLAYER_RADIUS});
  b3.b3Body_SetMotionLocks(body,{linearX:false,linearY:false,linearZ:false,angularX:true,angularY:true,angularZ:true});
  return body;
}
function createSimulation({actorOrder=["A","B"],applyOrder=["A","B"]}={}) {
  const wd=b3.b3DefaultWorldDef(); wd.gravity=[0,-20,0]; const world=b3.b3CreateWorld(wd);
  createStaticBox(world,[0,-.5,0],[10,.5,10]); createStaticBox(world,[-9.5,1.5,0],[.5,2,10]);
  createStaticBox(world,[9.5,1.5,0],[.5,2,10]); createStaticBox(world,[0,1.5,-9.5],[10,2,.5]); createStaticBox(world,[0,1.5,9.5],[10,2,.5]);
  const props=[];
  for(let i=0;i<PROP_COUNT;i++){
    const col=i%4,row=Math.floor(i/4),initial=[(col-1.5)*1.05,.46,(row-1)*1.05];
    const def=b3.b3DefaultBodyDef(); def.type=b3.b3BodyType.b3_dynamicBody; def.position=[...initial]; def.linearDamping=.08; def.angularDamping=.12;
    const body=b3.b3CreateBody(world,def); const shape=b3.b3DefaultShapeDef(); shape.density=22; shape.baseMaterial.friction=.72; shape.baseMaterial.restitution=.04;
    b3.b3CreateBoxShape(body,shape,.46,.46,.46); props.push({body,initial});
  }
  const actors=new Map(); for(const id of actorOrder) actors.set(id,createActorBody(world,STARTS[id]));
  return {world,actors,props,applyOrder:[...applyOrder],inputs:{A:{x:0,z:0},B:{x:0,z:0}}};
}
function destroySimulation(sim){b3.b3DestroyWorld(sim.world);}
function bodyPosition(body){const o=[0,0,0];b3.b3Body_GetPosition(o,body);return [...o];}
function bodyRotation(body){const o=[0,0,0,1];b3.b3Body_GetRotation(o,body);return [...o];}
function bodyVelocity(body){const o=[0,0,0];b3.b3Body_GetLinearVelocity(o,body);return [...o];}
function actorState(sim,id){const body=sim.actors.get(id);return {position:bodyPosition(body),rotation:bodyRotation(body),velocity:bodyVelocity(body)};}
function applyIntent(body,input){
  const v=bodyVelocity(body), has=Math.hypot(input.x,input.z)>.01, tx=input.x*PLAYER_SPEED,tz=input.z*PLAYER_SPEED;
  const accel=has?PLAYER_ACCELERATION:PLAYER_DECELERATION; const [x,z]=moveToward2(v[0],v[2],tx,tz,accel*FIXED_DT);
  b3.b3Body_SetLinearVelocity(body,[x,v[1],z]);
}
function applyEvents(events,cursor,due,inputs,id){while(cursor.index<events.length&&events[cursor.index].atMs<=due+EPS){const e=events[cursor.index++];inputs[id]={x:e.x,z:e.z};}}
function maxPropMovement(sim){let max=0;for(const p of sim.props){const x=bodyPosition(p.body);max=Math.max(max,Math.hypot(x[0]-p.initial[0],x[2]-p.initial[2]));}return max;}
function makeTriplet(){return {authority:createSimulation({actorOrder:["A","B"],applyOrder:["A","B"]}),clientA:createSimulation({actorOrder:["A","B"],applyOrder:["A","B"]}),clientB:createSimulation({actorOrder:["B","A"],applyOrder:["B","A"]})};}
function destroyTriplet(t){destroySimulation(t.authority);destroySimulation(t.clientA);destroySimulation(t.clientB);}
function contactNow(sim){return distance3(bodyPosition(sim.actors.get("A")),bodyPosition(sim.actors.get("B")))<=CONTACT_DISTANCE;}
function snapshotAuthority(sim,sourceTick){return {sourceTick,state:{A:actorState(sim,"A"),B:actorState(sim,"B")}};}
function forecastTarget(snapshot,id,currentTick){
  const s=snapshot.state[id],dt=Math.max(0,currentTick-snapshot.sourceTick)*FIXED_DT;
  return {position:[s.position[0]+s.velocity[0]*dt,s.position[1]+s.velocity[1]*dt,s.position[2]+s.velocity[2]*dt],velocity:[...s.velocity]};
}
function emptyMetrics(selfId,remoteId){return {selfId,remoteId,pendingDesired:null,pendingApplied:false,latestSnapshot:null,queue:[],suspendedContactTicks:0,correctionTicks:0,errorSamples:[],velocityDeltaSamples:[],desiredSpeedMax:0,solverExposed:[],allSelfSolver:[],minSeparation:Infinity,maxSpeed:0};}
function stepAuthority(sim){for(const id of sim.applyOrder)applyIntent(sim.actors.get(id),sim.inputs[id]);b3.b3World_Step(sim.world,FIXED_DT,SUBSTEPS);}
function stepClient(sim,metrics){
  for(const id of sim.applyOrder)applyIntent(sim.actors.get(id),sim.inputs[id]);
  const remote=sim.actors.get(metrics.remoteId);
  if(metrics.pendingDesired){
    const before=bodyVelocity(remote), desired=metrics.pendingDesired;
    b3.b3Body_SetLinearVelocity(remote,[desired[0],before[1],desired[2]]);
    metrics.velocityDeltaSamples.push(horizontalDistance(before,desired));
    metrics.desiredSpeedMax=Math.max(metrics.desiredSpeedMax,Math.hypot(desired[0],desired[2]));
    metrics.correctionTicks+=1; metrics.pendingApplied=true;
  } else metrics.pendingApplied=false;
  const self=sim.actors.get(metrics.selfId),pre=bodyVelocity(self);
  b3.b3World_Step(sim.world,FIXED_DT,SUBSTEPS);
  const post=bodyVelocity(self),solverDelta=horizontalDistance(pre,post);
  metrics.allSelfSolver.push(solverDelta); if(metrics.pendingApplied)metrics.solverExposed.push(solverDelta);
  const a=actorState(sim,"A"),b=actorState(sim,"B");
  metrics.minSeparation=Math.min(metrics.minSeparation,distance3(a.position,b.position));
  metrics.maxSpeed=Math.max(metrics.maxSpeed,horizontalSpeed(a.velocity),horizontalSpeed(b.velocity));
}
function updateDesired(sim,metrics,policy,currentTick){
  const snap=metrics.latestSnapshot;
  if(!snap){metrics.pendingDesired=null;return;}
  if(policy.contactOverride&&contactNow(sim)){metrics.pendingDesired=null;metrics.suspendedContactTicks+=1;return;}
  const target=forecastTarget(snap,metrics.remoteId,currentTick), local=actorState(sim,metrics.remoteId);
  const ex=target.position[0]-local.position[0], ez=target.position[2]-local.position[2];
  const tau=policy.correctionMs/1000;
  const desired=[target.velocity[0]+ex/tau,local.velocity[1],target.velocity[2]+ez/tau];
  metrics.pendingDesired=desired; metrics.errorSamples.push(Math.hypot(ex,ez));
}
function summarizeMetrics(m){return {
  selfId:m.selfId,remoteId:m.remoteId,correctionTicks:m.correctionTicks,suspendedContactTicks:m.suspendedContactTicks,
  targetError:{median:median(m.errorSamples),p95:percentile(m.errorSamples,.95),max:m.errorSamples.length?Math.max(...m.errorSamples):0},
  appliedVelocityDelta:{median:median(m.velocityDeltaSamples),p95:percentile(m.velocityDeltaSamples,.95),max:m.velocityDeltaSamples.length?Math.max(...m.velocityDeltaSamples):0},
  desiredSpeedMax:m.desiredSpeedMax,
  solverExposed:{count:m.solverExposed.length,median:median(m.solverExposed),p95:percentile(m.solverExposed,.95),max:m.solverExposed.length?Math.max(...m.solverExposed):0},
  allSelfSolver:{p95:percentile(m.allSelfSolver,.95),max:m.allSelfSolver.length?Math.max(...m.allSelfSolver):0},
  minSeparation:m.minSeparation,maxSpeed:m.maxSpeed,speedOvershootMax:Math.max(0,m.maxSpeed-PLAYER_SPEED),
};}
function splitState(t){return {actorA:distance3(actorState(t.clientA,"A").position,actorState(t.clientB,"A").position),actorB:distance3(actorState(t.clientB,"B").position,actorState(t.clientA,"B").position)};}

function runCell({scenario,delayMs,phaseMs,policy}){
  const t=makeTriplet(),traces={A:scenario.a,B:scenario.b};
  const ac={A:{index:0},B:{index:0}},ca={self:{index:0},remote:{index:0}},cb={self:{index:0},remote:{index:0}};
  const ma=emptyMetrics("A","B"),mb=emptyMetrics("B","A"); const ageTicks=Math.round(delayMs/STEP_MS);
  const splits=[]; let authorityContactTicks=0,maxAuthorityResidual=0;
  try{
    for(let i=0;i<PRE_ROLL_TICKS;i++){stepAuthority(t.authority);stepClient(t.clientA,ma);stepClient(t.clientB,mb);}
    const total=Math.ceil(scenario.durationMs/STEP_MS)+1;
    for(let tick=0;tick<total;tick++){
      const ms=tick*STEP_MS,logical=tick+1;
      applyEvents(traces.A,ac.A,ms,t.authority.inputs,"A");applyEvents(traces.B,ac.B,ms,t.authority.inputs,"B");
      applyEvents(traces.A,ca.self,ms,t.clientA.inputs,"A");applyEvents(traces.B,ca.remote,ms-delayMs-phaseMs,t.clientA.inputs,"B");
      applyEvents(traces.B,cb.self,ms,t.clientB.inputs,"B");applyEvents(traces.A,cb.remote,ms-delayMs-phaseMs,t.clientB.inputs,"A");
      stepAuthority(t.authority);stepClient(t.clientA,ma);stepClient(t.clientB,mb);
      const s=splitState(t);splits.push(Math.max(s.actorA,s.actorB));
      const aa=actorState(t.authority,"A"),ab=actorState(t.authority,"B");if(distance3(aa.position,ab.position)<=CONTACT_DISTANCE)authorityContactTicks++;
      maxAuthorityResidual=Math.max(maxAuthorityResidual,distance3(actorState(t.clientA,"A").position,aa.position),distance3(actorState(t.clientB,"A").position,aa.position),distance3(actorState(t.clientA,"B").position,ab.position),distance3(actorState(t.clientB,"B").position,ab.position));
      if(logical%SNAPSHOT_EVERY_TICKS===0){const snap=snapshotAuthority(t.authority,logical);ma.queue.push(snap);mb.queue.push(snap);}
      while(ma.queue.length&&ma.queue[0].sourceTick+ageTicks<=logical)ma.latestSnapshot=ma.queue.shift();
      while(mb.queue.length&&mb.queue[0].sourceTick+ageTicks<=logical)mb.latestSnapshot=mb.queue.shift();
      updateDesired(t.clientA,ma,policy,logical);updateDesired(t.clientB,mb,policy,logical);
    }
    const final={authority:{A:actorState(t.authority,"A"),B:actorState(t.authority,"B")},clientA:{A:actorState(t.clientA,"A"),B:actorState(t.clientA,"B")},clientB:{A:actorState(t.clientB,"A"),B:actorState(t.clientB,"B")}};
    const finalSplit={actorA:distance3(final.clientA.A.position,final.clientB.A.position),actorB:distance3(final.clientB.B.position,final.clientA.B.position)};
    const sep={authority:distance3(final.authority.A.position,final.authority.B.position),clientA:distance3(final.clientA.A.position,final.clientA.B.position),clientB:distance3(final.clientB.A.position,final.clientB.B.position)};
    const props={authority:maxPropMovement(t.authority),clientA:maxPropMovement(t.clientA),clientB:maxPropMovement(t.clientB)};
    if(Math.max(...Object.values(props))>.05)throw new Error(`${policy.name}/${scenario.name}/${delayMs}/${phaseMs} prop contamination`);
    if(scenario.name==="approach-no-contact"&&sep.authority<2)throw new Error("authority accidental contact");
    if(scenario.name==="player-contact-only"&&sep.authority>.9)throw new Error("authority contact missing");
    return {policy:policy.name,correctionMs:policy.correctionMs,contactOverride:policy.contactOverride,scenario:scenario.name,delayMs,phaseMs,snapshotAgeTicks:ageTicks,snapshotAgeMs:ageTicks*STEP_MS,directFinalSplit:finalSplit,splitEnvelope:{median:median(splits),p95:percentile(splits,.95),max:Math.max(...splits)},authorityContactTicks,maxAuthorityResidual,finalSeparation:sep,propMovement:props,clientMetrics:{A:summarizeMetrics(ma),B:summarizeMetrics(mb)},final};
  }finally{destroyTriplet(t);}
}

console.log(`${REVISION} · Box3D ${JSON.stringify(b3.b3GetVersion())}`);
const cells=[];
for(const policy of POLICIES)for(const delayMs of DELAYS_MS)for(const phaseMs of PHASES_MS)for(const scenario of SCENARIOS){
  const c=runCell({scenario,delayMs,phaseMs,policy});cells.push(c);
  if(scenario.name==="player-contact-only"){
    const fm=Math.max(c.directFinalSplit.actorA,c.directFinalSplit.actorB),solver=Math.max(c.clientMetrics.A.solverExposed.max,c.clientMetrics.B.solverExposed.max),speed=Math.max(c.clientMetrics.A.desiredSpeedMax,c.clientMetrics.B.desiredSpeedMax);
    console.log(`${policy.name.padEnd(22)} ${delayMs}ms phase=${phaseMs.toFixed(2).padStart(5)} final=${fm.toFixed(3)}m p95=${c.splitEnvelope.p95.toFixed(3)}m solver=${solver.toFixed(3)}m/s desiredSpeed=${speed.toFixed(3)}m/s`);
  }
}
function summaryFor(policy,delayMs){
  const cs=cells.filter(c=>c.policy===policy.name&&c.delayMs===delayMs&&c.scenario==="player-contact-only");
  const ns=cells.filter(c=>c.policy===policy.name&&c.delayMs===delayMs&&c.scenario==="approach-no-contact");
  const finals=cs.map(c=>Math.max(c.directFinalSplit.actorA,c.directFinalSplit.actorB)),p95s=cs.map(c=>c.splitEnvelope.p95),solver=cs.map(c=>Math.max(c.clientMetrics.A.solverExposed.max,c.clientMetrics.B.solverExposed.max)),solver95=cs.map(c=>Math.max(c.clientMetrics.A.solverExposed.p95||0,c.clientMetrics.B.solverExposed.p95||0)),desired=cs.map(c=>Math.max(c.clientMetrics.A.desiredSpeedMax,c.clientMetrics.B.desiredSpeedMax)),minSep=cs.map(c=>Math.min(c.clientMetrics.A.minSeparation,c.clientMetrics.B.minSeparation)),susp=cs.map(c=>c.clientMetrics.A.suspendedContactTicks+c.clientMetrics.B.suspendedContactTicks),noFinal=ns.map(c=>Math.max(c.directFinalSplit.actorA,c.directFinalSplit.actorB));
  return {policy:policy.name,delayMs,correctionMs:policy.correctionMs,contactOverride:policy.contactOverride,noContactFinal:{median:median(noFinal),max:Math.max(...noFinal)},contactFinal:{median:median(finals),max:Math.max(...finals)},contactP95:{median:median(p95s),max:Math.max(...p95s)},solverExposed:{p95Max:Math.max(...solver95),max:Math.max(...solver)},desiredSpeedMax:Math.max(...desired),minSeparation:Math.min(...minSep),suspendedContactTicks:{median:median(susp),max:Math.max(...susp)}};
}
const summary=POLICIES.flatMap(p=>DELAYS_MS.map(d=>summaryFor(p,d)));
console.log("\nT3 policy summary:");
for(const r of summary)console.log(`${r.policy.padEnd(22)} ${r.delayMs}ms · final=${r.contactFinal.median.toFixed(3)}/${r.contactFinal.max.toFixed(3)}m p95=${r.contactP95.median.toFixed(3)}/${r.contactP95.max.toFixed(3)}m solver=${r.solverExposed.max.toFixed(3)}m/s desiredSpeed=${r.desiredSpeedMax.toFixed(3)}m/s minSep=${r.minSeparation.toFixed(3)}m`);
const evidence={revision:REVISION,generatedAt:new Date().toISOString(),design:{qualifiedT2Head:"0302560766b71fde1116a9a8bd75f958661dc8f8",box3d:"box3d.js@0.1.1",simulationHz:60,substeps:SUBSTEPS,snapshotHz:10,snapshotAgeRule:"round delayed-intent ms to nearest physics tick",target:"latest delivered authority snapshot linearly projected to current logical tick",correction:"before each client solver step, after delayed remote intent controller: desired horizontal velocity = forecast target velocity + horizontal position error / correctionTime; no SetTransform",policies:POLICIES,contactOverride:"velocity-200-contact suppresses reconciliation whenever local player-player contact exists at target update time"},cells,summary};
writeFileSync(OUTPUT,JSON.stringify(evidence,null,2));
console.log(`\nT3 STRUCTURAL PASS · evidence written to ${OUTPUT}`);
