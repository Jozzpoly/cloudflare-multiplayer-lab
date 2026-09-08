import { writeFileSync } from "node:fs";
import Box3D from "box3d.js/inline";

const b3 = await Box3D();

const REVISION = "ws0-f3-1-coupled-timeline-v1";
const OUTPUT = process.env.WS0_F3_1_OUTPUT || "ws0-f3-1-coupled-timeline.json";
const FIXED_DT = 1 / 60;
const STEP_MS = 1000 / 60;
const SUBSTEPS = 4;
const PLAYER_SPEED = 5.2;
const PLAYER_ACCELERATION = 28;
const PLAYER_DECELERATION = 36;
const PLAYER_RADIUS = 0.35;
const PROP_COUNT = 12;
const PRE_ROLL_TICKS = 60;
const EPS = 1e-9;
const TOL = 1e-6;
const CONTACT_GATE_END_MS = 3500;
const RELAY_START = [0, 0.46, 6.2];
const STARTS = { A: [-6.5, 0.82, -1.4], B: [6.5, 0.82, 0] };
const SMOOTH = [-1, -0.5, 0, 0.5, 1, 0.5, 0, -0.5];
const BURST = [0, 0, 1, -1, -1, 0, 0, 0];

const TRACE_CASES = [
  { name: "low35", baseMs: 35, jitterMs: 10, pattern: "smooth", lead: 8, batchSize: 2, scheduledHealthy: true },
  { name: "measured65", baseMs: 65, jitterMs: 10, pattern: "smooth", lead: 8, batchSize: 2, scheduledHealthy: true },
  { name: "measured85", baseMs: 85, jitterMs: 10, pattern: "smooth", lead: 8, batchSize: 2, scheduledHealthy: true },
  { name: "hol85", baseMs: 85, jitterMs: 30, pattern: "burst-hol", lead: 8, batchSize: 2, scheduledHealthy: true },
  { name: "near-boundary-negative", baseMs: 85, jitterMs: 10, pattern: "smooth", lead: 6, batchSize: 2, scheduledHealthy: false },
];
const POLICIES = ["receipt-live", "scheduled-forward-reconcile", "authority-time-common", "source-time-common"];

const SCENARIO = {
  name: "player-contact-prop-relay",
  durationMs: 6500,
  a: [
    { atMs: 0, x: 0, z: 1 }, { atMs: 360, x: 0, z: 0 },
    { atMs: 600, x: 0, z: 1 }, { atMs: 1500, x: 0, z: 0 },
    { atMs: 1800, x: 1, z: 0 }, { atMs: 3400, x: 0, z: 0 },
    { atMs: 3600, x: 0, z: 1 }, { atMs: 4300, x: 0, z: 0 },
  ],
  b: [
    { atMs: 0, x: 0, z: 0 }, { atMs: 600, x: 0, z: 1 },
    { atMs: 1500, x: 0, z: 0 }, { atMs: 1800, x: -1, z: 0 },
    { atMs: 3400, x: 0, z: 0 }, { atMs: 3600, x: 0, z: 1 },
    { atMs: 4300, x: 0, z: 0 },
  ],
};

const TOTAL_TICKS = Math.ceil(SCENARIO.durationMs / STEP_MS) + 1;

function percentile(values, p) {
  if (!values.length) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1))];
}
function summarize(values) {
  return {
    count: values.length,
    min: values.length ? Math.min(...values) : 0,
    median: values.length ? percentile(values, 0.5) : 0,
    p95: values.length ? percentile(values, 0.95) : 0,
    max: values.length ? Math.max(...values) : 0,
  };
}
function distance3(a, b) { return Math.hypot(a[0]-b[0], a[1]-b[1], a[2]-b[2]); }
function horizontalDistance(a, b) { return Math.hypot(a[0]-b[0], a[2]-b[2]); }
function quaternionAngle(a, b) {
  const dot = Math.abs(a[0]*b[0] + a[1]*b[1] + a[2]*b[2] + a[3]*b[3]);
  return 2 * Math.acos(Math.min(1, Math.max(-1, dot)));
}
function moveToward2(cx, cz, tx, tz, maxDelta) {
  const dx=tx-cx, dz=tz-cz, d=Math.hypot(dx,dz);
  if (d<=maxDelta || d<1e-9) return [tx,tz];
  const s=maxDelta/d; return [cx+dx*s, cz+dz*s];
}

function createStaticBox(world, position, half) {
  const def=b3.b3DefaultBodyDef(); def.position=[...position];
  const body=b3.b3CreateBody(world,def);
  b3.b3CreateBoxShape(body,b3.b3DefaultShapeDef(),half[0],half[1],half[2]);
}
function createDynamicBox(world, position, half, density=22) {
  const def=b3.b3DefaultBodyDef(); def.type=b3.b3BodyType.b3_dynamicBody; def.position=[...position]; def.linearDamping=.08; def.angularDamping=.12;
  const body=b3.b3CreateBody(world,def); const shape=b3.b3DefaultShapeDef(); shape.density=density; shape.baseMaterial.friction=.72; shape.baseMaterial.restitution=.04;
  b3.b3CreateBoxShape(body,shape,half[0],half[1],half[2]); return body;
}
function createActorBody(world,start) {
  const def=b3.b3DefaultBodyDef(); def.type=b3.b3BodyType.b3_dynamicBody; def.position=[...start]; def.linearDamping=.3; def.angularDamping=8;
  const body=b3.b3CreateBody(world,def); const shape=b3.b3DefaultShapeDef(); shape.density=80; shape.baseMaterial.friction=.8; shape.baseMaterial.restitution=.02;
  b3.b3CreateCapsuleShape(body,shape,{center1:[0,-.45,0],center2:[0,.45,0],radius:PLAYER_RADIUS});
  b3.b3Body_SetMotionLocks(body,{linearX:false,linearY:false,linearZ:false,angularX:true,angularY:true,angularZ:true}); return body;
}
function createSimulation({actorOrder=["A","B"],applyOrder=["A","B"]}={}) {
  const wd=b3.b3DefaultWorldDef(); wd.gravity=[0,-20,0]; const world=b3.b3CreateWorld(wd);
  createStaticBox(world,[0,-.5,0],[10,.5,10]); createStaticBox(world,[-9.5,1.5,0],[.5,2,10]); createStaticBox(world,[9.5,1.5,0],[.5,2,10]);
  createStaticBox(world,[0,1.5,-9.5],[10,2,.5]); createStaticBox(world,[0,1.5,9.5],[10,2,.5]);
  const props=[];
  for(let i=0;i<PROP_COUNT;i++){
    const col=i%4,row=Math.floor(i/4),initial=[(col-1.5)*1.05,.46,(row-1)*1.05];
    props.push({id:`prop-${i}`,initial,body:createDynamicBox(world,initial,[.46,.46,.46])});
  }
  const relay={id:"relay",initial:[...RELAY_START],body:createDynamicBox(world,RELAY_START,[.46,.46,.46])};
  const actors=new Map(); for(const id of actorOrder) actors.set(id,createActorBody(world,STARTS[id]));
  return {world,actors,props,relay,applyOrder:[...applyOrder],inputs:{A:{x:0,z:0},B:{x:0,z:0}}};
}
function createClientSimulation(selfId){return selfId==="A"?createSimulation({actorOrder:["A","B"],applyOrder:["A","B"]}):createSimulation({actorOrder:["B","A"],applyOrder:["B","A"]});}
function destroySimulation(sim){b3.b3DestroyWorld(sim.world);}
function bodyPosition(body){const out=[0,0,0]; b3.b3Body_GetPosition(out,body); return [...out];}
function bodyVelocity(body){const out=[0,0,0]; b3.b3Body_GetLinearVelocity(out,body); return [...out];}
function bodyRotation(body){const out=[0,0,0,1]; b3.b3Body_GetRotation(out,body); return [...out];}
function actorState(sim,id){const body=sim.actors.get(id); return {position:bodyPosition(body),velocity:bodyVelocity(body)};}
function relayState(sim){return {position:bodyPosition(sim.relay.body),velocity:bodyVelocity(sim.relay.body),rotation:bodyRotation(sim.relay.body)};}
function applyIntent(body,input){
  const v=bodyVelocity(body), has=Math.hypot(input.x,input.z)>.01, tx=input.x*PLAYER_SPEED,tz=input.z*PLAYER_SPEED,accel=has?PLAYER_ACCELERATION:PLAYER_DECELERATION;
  const [x,z]=moveToward2(v[0],v[2],tx,tz,accel*FIXED_DT); b3.b3Body_SetLinearVelocity(body,[x,v[1],z]);
}
function stepSimulation(sim){for(const id of sim.applyOrder)applyIntent(sim.actors.get(id),sim.inputs[id]); b3.b3World_Step(sim.world,FIXED_DT,SUBSTEPS);}
function preRoll(sim){for(let i=0;i<PRE_ROLL_TICKS;i++)stepSimulation(sim);}
function maxCentralPropMovement(sim){let m=0;for(const p of sim.props)m=Math.max(m,horizontalDistance(bodyPosition(p.body),p.initial));return m;}
function relayDisplacement(sim){return horizontalDistance(bodyPosition(sim.relay.body),sim.relay.initial);}

function targetTick(atMs){return Math.ceil((atMs-EPS)/STEP_MS);}
function transitions(raw){return raw.map((e,index)=>({...e,index,targetTick:targetTick(e.atMs)}));}
const TRANSITIONS={A:transitions(SCENARIO.a),B:transitions(SCENARIO.b)};

function inputTimeline(events) {
  const out=[]; let cursor=0,current={x:0,z:0};
  for(let tick=0;tick<TOTAL_TICKS+32;tick++){
    while(cursor<events.length && events[cursor].targetTick<=tick){current={x:events[cursor].x,z:events[cursor].z};cursor++;}
    out.push({targetTick:tick,x:current.x,z:current.z});
  }
  return out;
}
const RECORDS={A:inputTimeline(TRANSITIONS.A),B:inputTimeline(TRANSITIONS.B)};

function coeff(pattern,index,phase=0){const t=pattern==="smooth"?SMOOTH:BURST;return t[(index+phase)%t.length];}
function netDelay(trace,index,phase=0){return Math.max(0,trace.baseMs+trace.jitterMs*coeff(trace.pattern,index,phase));}
function deliverOrdered(messages,trace,phase=0){
  let prev=-Infinity;
  return messages.map((m,index)=>{const raw=m.sendMs+netDelay(trace,index,phase),deliveryMs=Math.max(raw,prev);prev=deliveryMs;return{...m,deliveryMs,holBlockedMs:Math.max(0,deliveryMs-raw)};});
}
function predictedTickAt(ms,lead){return Math.floor((ms+EPS)/STEP_MS)+lead;}
function consumeTickForArrival(ms){return Math.max(0,Math.ceil((ms-EPS)/STEP_MS));}

function buildNetwork(actorId,trace,lead){
  const records=RECORDS[actorId], batches=[];
  for(let start=0,index=0;start<records.length;start+=trace.batchSize,index++){
    const end=Math.min(records.length-1,start+trace.batchSize-1);
    batches.push({index,startTick:start,endTick:end,records:records.slice(start,end+1),sendMs:(end-lead)*STEP_MS});
  }
  const uplink=deliverOrdered(batches,trace,0);
  const relay=deliverOrdered(uplink.map(b=>({index:b.index,records:b.records,sendMs:b.deliveryMs})),trace,3);
  const deliveryByTick=new Map(); for(const b of uplink)for(const r of b.records)deliveryByTick.set(r.targetTick,b.deliveryMs);
  const transitionInfo=TRANSITIONS[actorId].map(e=>{
    const bi=Math.floor(e.targetTick/trace.batchSize), up=uplink[bi], down=relay[bi], applyTick=consumeTickForArrival(up.deliveryMs);
    return {...e,uplinkDeliveryMs:up.deliveryMs,authorityApplyTick:applyTick,peerArrivalTick:predictedTickAt(down.deliveryMs,lead)};
  });
  const metadata=deliverOrdered(transitionInfo.map((e,index)=>({index,eventIndex:e.index,sendMs:e.authorityApplyTick*STEP_MS})),trace,5);
  for(let i=0;i<transitionInfo.length;i++)transitionInfo[i].metadataArrivalTick=predictedTickAt(metadata[i].deliveryMs,0);
  return {actorId,lead,batches,uplink,relay,deliveryByTick,transitionInfo};
}

function capture(sim){return {A:actorState(sim,"A"),B:actorState(sim,"B"),relay:relayState(sim)};}
function stateResidual(a,b){
  return {
    actorPosition:Math.max(distance3(a.A.position,b.A.position),distance3(a.B.position,b.B.position)),
    relayPosition:distance3(a.relay.position,b.relay.position),
    relayVelocity:horizontalDistance(a.relay.velocity,b.relay.velocity),
    relayRotation:quaternionAngle(a.relay.rotation,b.relay.rotation),
  };
}
function maxResidual(r){return Math.max(r.actorPosition,r.relayPosition,r.relayVelocity,r.relayRotation);}

function applyMappedEvents(events,cursor,tick,inputs,id){while(cursor.index<events.length&&events[cursor.index].applyTick<=tick){inputs[id]={x:events[cursor.index].x,z:events[cursor.index].z};cursor.index++;}}
function sourceMapped(actorId){return TRANSITIONS[actorId].map(e=>({...e,applyTick:e.targetTick}));}
function sortMapped(events){return [...events].sort((a,b)=>a.applyTick-b.applyTick||a.index-b.index);}

function rebuildClient(selfId,selfEvents,remoteEvents,throughTick){
  const sim=createClientSimulation(selfId);preRoll(sim);const cs={index:0},cr={index:0};
  const se=sortMapped(selfEvents),re=sortMapped(remoteEvents),remoteId=selfId==="A"?"B":"A";
  for(let tick=0;tick<=throughTick;tick++){applyMappedEvents(se,cs,tick,sim.inputs,selfId);applyMappedEvents(re,cr,tick,sim.inputs,remoteId);stepSimulation(sim);}return sim;
}

function buildAuthority(trace,family,networks){
  const sim=createSimulation();preRoll(sim);const states=[];const cursors={A:{index:0},B:{index:0}}, batchCursor={A:0,B:0};
  let minSep=Infinity;
  try{
    for(let tick=0;tick<TOTAL_TICKS;tick++){
      if(family==="source"){
        applyMappedEvents(sourceMapped("A"),cursors.A,tick,sim.inputs,"A");applyMappedEvents(sourceMapped("B"),cursors.B,tick,sim.inputs,"B");
      } else if(family==="receipt"){
        for(const id of ["A","B"]){const net=networks[id];while(batchCursor[id]<net.uplink.length&&net.uplink[batchCursor[id]].deliveryMs<=tick*STEP_MS+EPS){const batch=net.uplink[batchCursor[id]++];const last=batch.records[batch.records.length-1];sim.inputs[id]={x:last.x,z:last.z};}}
      } else if(family==="scheduled"){
        for(const id of ["A","B"]){const record=RECORDS[id][tick],delivery=networks[id].deliveryByTick.get(tick);if(delivery<=tick*STEP_MS+EPS)sim.inputs[id]={x:record.x,z:record.z};}
      }
      stepSimulation(sim);const state=capture(sim);states.push(state);
      if(tick*STEP_MS<=CONTACT_GATE_END_MS)minSep=Math.min(minSep,distance3(state.A.position,state.B.position));
    }
    return {states,final:states.at(-1),minSep,relayDisplacement:relayDisplacement(sim),centralPropMovement:maxCentralPropMovement(sim)};
  } finally {destroySimulation(sim);}
}

function authorityTiming(trace,policy,networks){
  if(policy==="source-time-common"){
    const horizons=[];for(const id of ["A","B"])for(const e of networks[id].transitionInfo)horizons.push(Math.max(0,e.authorityApplyTick-e.targetTick));
    return {rollbackCount:horizons.length,rewindHorizonTicks:summarize(horizons),missingAtConsume:0,onTimeRate:null};
  }
  if(policy==="scheduled-forward-reconcile"){
    let total=0,on=0;for(const id of ["A","B"])for(let tick=0;tick<TOTAL_TICKS;tick++){total++;if(networks[id].deliveryByTick.get(tick)<=tick*STEP_MS+EPS)on++;}
    return {rollbackCount:0,rewindHorizonTicks:summarize([]),missingAtConsume:total-on,onTimeRate:on/total};
  }
  return {rollbackCount:0,rewindHorizonTicks:summarize([]),missingAtConsume:0,onTimeRate:null};
}

function createClientRuntime(selfId,policy,trace,networks){
  const sim=createClientSimulation(selfId);preRoll(sim);
  return {selfId,remoteId:selfId==="A"?"B":"A",policy,trace,networks,sim,selfCursor:{index:0},knownRemote:new Set(),knownSelfMeta:new Set(),knownRemoteMeta:new Set(),
    corrections:{self:[],remote:[],relayPosition:[],relayVelocity:[],relayRotation:[],horizon:[]},authorityResidualActor:[],authorityResidualRelay:[]};
}
function destroyClient(r){destroySimulation(r.sim);}
function recordCorrection(runtime,before,after,horizon){
  runtime.corrections.self.push(distance3(before[runtime.selfId].position,after[runtime.selfId].position));
  runtime.corrections.remote.push(distance3(before[runtime.remoteId].position,after[runtime.remoteId].position));
  runtime.corrections.relayPosition.push(distance3(before.relay.position,after.relay.position));
  runtime.corrections.relayVelocity.push(horizontalDistance(before.relay.velocity,after.relay.velocity));
  runtime.corrections.relayRotation.push(quaternionAngle(before.relay.rotation,after.relay.rotation));runtime.corrections.horizon.push(horizon);
}
function mappedForAuthorityTime(runtime,id){
  const self=id===runtime.selfId, known=self?runtime.knownSelfMeta:runtime.knownRemoteMeta, net=runtime.networks[id];
  const out=[];for(const e of TRANSITIONS[id]){
    if(self){const info=net.transitionInfo[e.index];out.push({...e,applyTick:known.has(e.index)?info.authorityApplyTick:e.targetTick});}
    else if(known.has(e.index)){const info=net.transitionInfo[e.index];out.push({...e,applyTick:info.authorityApplyTick});}
  }return out;
}
function knownRemoteSource(runtime){return TRANSITIONS[runtime.remoteId].filter(e=>runtime.knownRemote.has(e.index)).map(e=>({...e,applyTick:e.targetTick}));}

function advanceClient(runtime,tick,authorityState){
  const selfEvents=TRANSITIONS[runtime.selfId];
  for(const e of selfEvents)if(e.targetTick===tick)runtime.sim.inputs[runtime.selfId]={x:e.x,z:e.z};
  const remoteNet=runtime.networks[runtime.remoteId], selfNet=runtime.networks[runtime.selfId];

  if(runtime.policy==="receipt-live"){
    const due=remoteNet.transitionInfo.filter(e=>e.peerArrivalTick===tick);if(due.length){const e=due.at(-1);runtime.sim.inputs[runtime.remoteId]={x:e.x,z:e.z};}
    stepSimulation(runtime.sim);
  } else if(runtime.policy==="scheduled-forward-reconcile"||runtime.policy==="source-time-common"){
    const due=remoteNet.transitionInfo.filter(e=>e.peerArrivalTick===tick);
    if(!due.length){stepSimulation(runtime.sim);}else{
      const latest=due.at(-1);runtime.sim.inputs[runtime.remoteId]={x:latest.x,z:latest.z};stepSimulation(runtime.sim);const before=capture(runtime.sim);
      for(const e of due)runtime.knownRemote.add(e.index);
      const rebuilt=rebuildClient(runtime.selfId,sourceMapped(runtime.selfId),knownRemoteSource(runtime),tick),after=capture(rebuilt);
      recordCorrection(runtime,before,after,Math.max(0,tick-Math.min(...due.map(e=>e.targetTick))));destroySimulation(runtime.sim);runtime.sim=rebuilt;
    }
  } else if(runtime.policy==="authority-time-common"){
    const dueSelf=selfNet.transitionInfo.filter(e=>e.metadataArrivalTick===tick),dueRemote=remoteNet.transitionInfo.filter(e=>e.metadataArrivalTick===tick);
    if(!dueSelf.length&&!dueRemote.length){stepSimulation(runtime.sim);}else{
      if(dueRemote.length){const e=dueRemote.at(-1);runtime.sim.inputs[runtime.remoteId]={x:e.x,z:e.z};}
      stepSimulation(runtime.sim);const before=capture(runtime.sim);
      for(const e of dueSelf)runtime.knownSelfMeta.add(e.index);for(const e of dueRemote)runtime.knownRemoteMeta.add(e.index);
      const selfMapped=mappedForAuthorityTime(runtime,runtime.selfId),remoteMapped=mappedForAuthorityTime(runtime,runtime.remoteId);
      const earliest=Math.min(...[
        ...dueSelf.map(e=>Math.min(e.targetTick,e.authorityApplyTick)),
        ...dueRemote.map(e=>e.authorityApplyTick),
      ]);
      const rebuilt=rebuildClient(runtime.selfId,selfMapped,remoteMapped,tick),after=capture(rebuilt);
      recordCorrection(runtime,before,after,Math.max(0,tick-earliest));destroySimulation(runtime.sim);runtime.sim=rebuilt;
    }
  }

  const s=capture(runtime.sim),r=stateResidual(s,authorityState);runtime.authorityResidualActor.push(r.actorPosition);runtime.authorityResidualRelay.push(r.relayPosition);return s;
}

function clientSummary(r){return {correctionCount:r.corrections.self.length,selfPositionCorrection:summarize(r.corrections.self),remotePositionCorrection:summarize(r.corrections.remote),relayPositionCorrection:summarize(r.corrections.relayPosition),relayVelocityCorrection:summarize(r.corrections.relayVelocity),relayRotationCorrection:summarize(r.corrections.relayRotation),rewindHorizonTicks:summarize(r.corrections.horizon),authorityActorResidual:summarize(r.authorityResidualActor),authorityRelayResidual:summarize(r.authorityResidualRelay)};}

function runCell(trace,policy,sourceOracle){
  const lead=policy==="scheduled-forward-reconcile"?trace.lead:0;
  const networks={A:buildNetwork("A",trace,lead),B:buildNetwork("B",trace,lead)};
  const authorityFamily=policy==="scheduled-forward-reconcile"?"scheduled":policy==="source-time-common"?"source":"receipt";
  const authority=buildAuthority(trace,authorityFamily,networks),timing=authorityTiming(trace,policy,networks);
  const clientA=createClientRuntime("A",policy,trace,networks),clientB=createClientRuntime("B",policy,trace,networks);
  const actorSplit=[],relaySplit=[],relayRotSplit=[];
  try{
    for(let tick=0;tick<TOTAL_TICKS;tick++){
      const a=advanceClient(clientA,tick,authority.states[tick]),bb=advanceClient(clientB,tick,authority.states[tick]);
      actorSplit.push(Math.max(distance3(a.A.position,bb.A.position),distance3(a.B.position,bb.B.position)));
      relaySplit.push(distance3(a.relay.position,bb.relay.position));relayRotSplit.push(quaternionAngle(a.relay.rotation,bb.relay.rotation));
    }
    const finalA=capture(clientA.sim),finalB=capture(clientB.sim),authoritySource=stateResidual(authority.final,sourceOracle.final);
    return {trace:trace.name,parameters:{baseMs:trace.baseMs,jitterMs:trace.jitterMs,pattern:trace.pattern,leadTicks:lead,batchSize:trace.batchSize,scheduledHealthy:trace.scheduledHealthy},policy,
      authority:{timing,minPlayerSeparationBeforeRelay:authority.minSep,relayDisplacement:authority.relayDisplacement,centralPropMovement:authority.centralPropMovement,sourceOracleResidual:authoritySource},
      actorSplit:{final:Math.max(distance3(finalA.A.position,finalB.A.position),distance3(finalA.B.position,finalB.B.position)),p95:percentile(actorSplit,.95),max:Math.max(...actorSplit)},
      relaySplit:{finalPosition:distance3(finalA.relay.position,finalB.relay.position),p95Position:percentile(relaySplit,.95),maxPosition:Math.max(...relaySplit),finalRotationRad:quaternionAngle(finalA.relay.rotation,finalB.relay.rotation),p95RotationRad:percentile(relayRotSplit,.95),maxRotationRad:Math.max(...relayRotSplit)},
      finalClientAuthority:{A:stateResidual(finalA,authority.final),B:stateResidual(finalB,authority.final)},clientA:clientSummary(clientA),clientB:clientSummary(clientB)};
  } finally {destroyClient(clientA);destroyClient(clientB);}
}

function auditCell(cell){
  if(cell.policy==="source-time-common"&&maxResidual(cell.authority.sourceOracleResidual)>TOL)throw new Error(`${cell.trace}: source authority != source oracle`);
  if(cell.policy==="scheduled-forward-reconcile"&&cell.parameters.scheduledHealthy){
    if(cell.authority.timing.missingAtConsume!==0)throw new Error(`${cell.trace}: healthy scheduled cell has missing inputs`);
    if(maxResidual(cell.authority.sourceOracleResidual)>TOL)throw new Error(`${cell.trace}: healthy scheduled authority != source oracle`);
    if(maxResidual(cell.finalClientAuthority.A)>TOL||maxResidual(cell.finalClientAuthority.B)>TOL)throw new Error(`${cell.trace}: healthy scheduled clients did not converge to authority`);
  }
  if(cell.policy==="scheduled-forward-reconcile"&&!cell.parameters.scheduledHealthy&&cell.authority.timing.missingAtConsume===0)throw new Error(`${cell.trace}: negative scheduled control lost its missing inputs`);
  if(cell.policy==="authority-time-common"&&(maxResidual(cell.finalClientAuthority.A)>TOL||maxResidual(cell.finalClientAuthority.B)>TOL))throw new Error(`${cell.trace}: authority-time clients did not converge to authority`);
}

const sourceNetworks={A:buildNetwork("A",TRACE_CASES[0],0),B:buildNetwork("B",TRACE_CASES[0],0)};
const sourceOracle=buildAuthority(TRACE_CASES[0],"source",sourceNetworks);
if(sourceOracle.minSep>0.72)throw new Error(`T5 source contact gate failed: ${sourceOracle.minSep}`);
if(sourceOracle.relayDisplacement<0.35)throw new Error(`T5 source relay gate failed: ${sourceOracle.relayDisplacement}`);
if(sourceOracle.centralPropMovement>0.05)throw new Error(`T5 source central-prop isolation failed: ${sourceOracle.centralPropMovement}`);

console.log(`${REVISION} · Box3D ${JSON.stringify(b3.b3GetVersion())}`);
console.log(`T5 oracle contact=${sourceOracle.minSep.toFixed(4)}m relay=${sourceOracle.relayDisplacement.toFixed(4)}m central=${sourceOracle.centralPropMovement.toFixed(4)}m`);
const cells=[];
for(const trace of TRACE_CASES){
  for(const policy of POLICIES){const cell=runCell(trace,policy,sourceOracle);auditCell(cell);cells.push(cell);console.log(`${trace.padEnd(22)} ${policy.padEnd(29)} actorP95=${cell.actorSplit.p95.toFixed(3)} relayFinal=${cell.relaySplit.finalPosition.toFixed(3)} authSrc=${cell.authority.sourceOracleResidual.relayPosition.toFixed(3)} selfCorr=${Math.max(cell.clientA.selfPositionCorrection.max,cell.clientB.selfPositionCorrection.max).toFixed(3)} horizon=${Math.max(cell.clientA.rewindHorizonTicks.max,cell.clientB.rewindHorizonTicks.max)} missing=${cell.authority.timing.missingAtConsume}`);}
}

const scheduledHealthy=cells.filter(c=>c.policy==="scheduled-forward-reconcile"&&c.parameters.scheduledHealthy&&["measured65","measured85","hol85"].includes(c.trace));
const scheduledEarnsNext=scheduledHealthy.every(c=>c.authority.timing.missingAtConsume===0&&maxResidual(c.authority.sourceOracleResidual)<=TOL&&c.actorSplit.final<=TOL&&c.relaySplit.finalPosition<=TOL&&maxResidual(c.finalClientAuthority.A)<=TOL&&maxResidual(c.finalClientAuthority.B)<=TOL);
const paired=[];
for(const name of ["measured65","measured85","hol85"]){
  const s=cells.find(c=>c.trace===name&&c.policy==="scheduled-forward-reconcile"),src=cells.find(c=>c.trace===name&&c.policy==="source-time-common"),auth=cells.find(c=>c.trace===name&&c.policy==="authority-time-common"),live=cells.find(c=>c.trace===name&&c.policy==="receipt-live");
  paired.push({trace:name,scheduled:{maxSelfCorrection:Math.max(s.clientA.selfPositionCorrection.max,s.clientB.selfPositionCorrection.max),maxRelayCorrection:Math.max(s.clientA.relayPositionCorrection.max,s.clientB.relayPositionCorrection.max),maxClientRewind:Math.max(s.clientA.rewindHorizonTicks.max,s.clientB.rewindHorizonTicks.max),authorityRollback:s.authority.timing.rollbackCount},sourceTime:{maxSelfCorrection:Math.max(src.clientA.selfPositionCorrection.max,src.clientB.selfPositionCorrection.max),maxRelayCorrection:Math.max(src.clientA.relayPositionCorrection.max,src.clientB.relayPositionCorrection.max),maxClientRewind:Math.max(src.clientA.rewindHorizonTicks.max,src.clientB.rewindHorizonTicks.max),authorityRollback:src.authority.timing.rollbackCount,authorityRewindMax:src.authority.timing.rewindHorizonTicks.max},authorityTime:{maxSelfCorrection:Math.max(auth.clientA.selfPositionCorrection.max,auth.clientB.selfPositionCorrection.max),maxRelayCorrection:Math.max(auth.clientA.relayPositionCorrection.max,auth.clientB.relayPositionCorrection.max),maxClientRewind:Math.max(auth.clientA.rewindHorizonTicks.max,auth.clientB.rewindHorizonTicks.max)},receiptLive:{actorFinal:live.actorSplit.final,relayFinal:live.relaySplit.finalPosition,relayP95:live.relaySplit.p95Position}});
}

const evidence={revision:REVISION,generatedAt:new Date().toISOString(),contract:"docs/WS0_F3_1_COUPLED_TIMELINE_CONTRACT.md",provenance:{t5Head:"a4263565a1b39de35f93f85c5ada01d8ef9147e3",f30Head:"01a741f2f6df40bf2edddc191ffa7dd72135a296",box3d:"box3d.js@0.1.1"},design:{simulationHz:60,substeps:SUBSTEPS,totalTicks:TOTAL_TICKS,scenario:SCENARIO,transitionTicks:{A:TRANSITIONS.A.map(e=>e.targetTick),B:TRANSITIONS.B.map(e=>e.targetTick)},traces:TRACE_CASES,policies:POLICIES,historyImplementation:"deterministic global-seed rebuild oracle; reported rewind horizons are semantic history requirement, not production replay cost",boundary:"No F2 checkpoint integration, browser runtime, smoothing, protocol write, packet loss or clock-drift model in F3.1."},sourceOracle:{minPlayerSeparationBeforeRelay:sourceOracle.minSep,relayDisplacement:sourceOracle.relayDisplacement,centralPropMovement:sourceOracle.centralPropMovement},cells,pairedSummary:paired,verdict:{scheduledEarnsNext,text:scheduledEarnsNext?"F3.1 scheduled-forward temporal semantics qualified through coupled T5 actor->shared-prop physics in the declared healthy traces. Forward authority can preserve the intended canonical physical history while complete client history repair absorbs RTT-scale remote uncertainty. Compare correction budgets against source-time and authority-time before selecting implementation; next gate may bind the winning semantics to F2 bounded checkpoints.":"F3.1 scheduled-forward semantics did not qualify in the declared coupled-physics traces; audit temporal placement before F2 productionization."}};

console.log("\nF3.1 paired summary:");for(const row of paired)console.log(JSON.stringify(row));
console.log(evidence.verdict.text);writeFileSync(OUTPUT,JSON.stringify(evidence,null,2));console.log(`evidence written to ${OUTPUT}`);
