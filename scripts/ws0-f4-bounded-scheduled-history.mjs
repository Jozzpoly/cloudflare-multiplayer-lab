import { writeFileSync } from "node:fs";
import Box3D from "box3d.js/inline";

const b3 = await Box3D();

const REVISION = "ws0-f4-bounded-scheduled-history-v1";
const OUTPUT = process.env.WS0_F4_OUTPUT || "ws0-f4-bounded-scheduled-history.json";
const FIXED_DT = 1 / 60;
const STEP_MS = 1000 / 60;
const SUBSTEPS = 4;
const PLAYER_SPEED = 5.2;
const PLAYER_ACCELERATION = 28;
const PLAYER_DECELERATION = 36;
const PLAYER_RADIUS = 0.35;
const PROP_COUNT = 12;
const PRE_ROLL_TICKS = 60;
const SEGMENT_TICKS = 8;
const RETAIN_TICKS = 24;
const RECORDING_CAPACITY = 2 * 1024 * 1024;
const EPS = 1e-9;
const TOL = 1e-6;
const CONTACT_GATE_END_MS = 3500;
const RELAY_START = [0, 0.46, 6.2];
const STARTS = { A: [-6.5, 0.82, -1.4], B: [6.5, 0.82, 0] };
const SMOOTH = [-1, -0.5, 0, 0.5, 1, 0.5, 0, -0.5];
const BURST = [0, 0, 1, -1, -1, 0, 0, 0];

const TRACE_CASES = [
  { name: "measured65", baseMs: 65, jitterMs: 10, pattern: "smooth", lead: 8, batchSize: 2, frozenPeerMax: 9,
    frozenSelfMax: 0.1313939620800649, frozenRelayMax: 0.19328622369140705 },
  { name: "measured85", baseMs: 85, jitterMs: 10, pattern: "smooth", lead: 8, batchSize: 2, frozenPeerMax: 11,
    frozenSelfMax: 0.18498999159256818, frozenRelayMax: 0.27709812671844913 },
  { name: "hol85", baseMs: 85, jitterMs: 30, pattern: "burst-hol", lead: 8, batchSize: 2, frozenPeerMax: 13,
    frozenSelfMax: 0.1313939620800649, frozenRelayMax: 0.19328622369140705 },
];

const SCENARIO = {
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
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1))];
}
function summarize(values) {
  return {
    count: values.length,
    min: values.length ? Math.min(...values) : 0,
    median: percentile(values, 0.5),
    p95: percentile(values, 0.95),
    max: values.length ? Math.max(...values) : 0,
  };
}
function distance3(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); }
function horizontalDistance(a, b) { return Math.hypot(a[0] - b[0], a[2] - b[2]); }
function quaternionAngle(a, b) {
  const dot = Math.abs(a[0]*b[0] + a[1]*b[1] + a[2]*b[2] + a[3]*b[3]);
  return 2 * Math.acos(Math.min(1, Math.max(-1, dot)));
}
function maxResidual(r) { return Math.max(r.actorPosition, r.relayPosition, r.relayVelocity, r.relayRotation); }
function moveToward2(cx, cz, tx, tz, maxDelta) {
  const dx = tx - cx, dz = tz - cz, d = Math.hypot(dx, dz);
  if (d <= maxDelta || d < 1e-9) return [tx, tz];
  const s = maxDelta / d;
  return [cx + dx * s, cz + dz * s];
}
function bodyPosition(body) { const out = [0,0,0]; b3.b3Body_GetPosition(out, body); return [...out]; }
function bodyVelocity(body) { const out = [0,0,0]; b3.b3Body_GetLinearVelocity(out, body); return [...out]; }
function bodyRotation(body) { const out = [0,0,0,1]; b3.b3Body_GetRotation(out, body); return [...out]; }

function createSimulation(selfId = null) {
  const wd = b3.b3DefaultWorldDef();
  wd.gravity = [0, -20, 0];
  const world = b3.b3CreateWorld(wd);
  let nextOrdinal = 0;
  const entityDefs = new Map();
  const entities = new Map();

  function createBody(def, netEntityId = null) {
    const body = b3.b3CreateBody(world, def);
    const ordinal = nextOrdinal++;
    if (netEntityId) {
      b3.b3Body_SetName(body, netEntityId);
      entityDefs.set(netEntityId, { netEntityId, ordinal });
      entities.set(netEntityId, body);
    }
    return body;
  }
  function staticBox(position, half) {
    const def = b3.b3DefaultBodyDef();
    def.position = [...position];
    const body = createBody(def);
    b3.b3CreateBoxShape(body, b3.b3DefaultShapeDef(), half[0], half[1], half[2]);
  }
  function dynamicBox(netEntityId, position, half, density = 22) {
    const def = b3.b3DefaultBodyDef();
    def.type = b3.b3BodyType.b3_dynamicBody;
    def.position = [...position];
    def.linearDamping = 0.08;
    def.angularDamping = 0.12;
    const body = createBody(def, netEntityId);
    const shape = b3.b3DefaultShapeDef();
    shape.density = density;
    shape.baseMaterial.friction = 0.72;
    shape.baseMaterial.restitution = 0.04;
    b3.b3CreateBoxShape(body, shape, half[0], half[1], half[2]);
    return body;
  }
  function actorBody(id) {
    const def = b3.b3DefaultBodyDef();
    def.type = b3.b3BodyType.b3_dynamicBody;
    def.position = [...STARTS[id]];
    def.linearDamping = 0.3;
    def.angularDamping = 8;
    const body = createBody(def, `actor:${id}`);
    const shape = b3.b3DefaultShapeDef();
    shape.density = 80;
    shape.baseMaterial.friction = 0.8;
    shape.baseMaterial.restitution = 0.02;
    b3.b3CreateCapsuleShape(body, shape, { center1:[0,-0.45,0], center2:[0,0.45,0], radius:PLAYER_RADIUS });
    b3.b3Body_SetMotionLocks(body, { linearX:false, linearY:false, linearZ:false, angularX:true, angularY:true, angularZ:true });
    return body;
  }

  staticBox([0,-0.5,0],[10,0.5,10]);
  staticBox([-9.5,1.5,0],[0.5,2,10]);
  staticBox([9.5,1.5,0],[0.5,2,10]);
  staticBox([0,1.5,-9.5],[10,2,0.5]);
  staticBox([0,1.5,9.5],[10,2,0.5]);

  const props = [];
  for (let i=0;i<PROP_COUNT;i++) {
    const col=i%4,row=Math.floor(i/4),initial=[(col-1.5)*1.05,0.46,(row-1)*1.05];
    const id=`prop:${i}`;
    props.push({ id, initial, body:dynamicBox(id, initial, [0.46,0.46,0.46]) });
  }
  const relay = { id:"relay", initial:[...RELAY_START], body:dynamicBox("relay", RELAY_START, [0.46,0.46,0.46]) };
  const actorOrder = selfId === "B" ? ["B","A"] : ["A","B"];
  const actors = new Map();
  for (const id of actorOrder) actors.set(id, actorBody(id));
  const applyOrder = [...actorOrder];

  return {
    world, selfId, actors, props, relay, applyOrder,
    inputs:{A:{x:0,z:0},B:{x:0,z:0}},
    entityDefs:[...entityDefs.values()],
    entities,
    ownerPlayer:0,
  };
}
function remapSimulation(player, selfId, entityDefs) {
  const world = b3.b3RecPlayer_GetWorldId(player);
  const expected = new Set(entityDefs.map(def => def.netEntityId));
  const entities = new Map();
  const resolvedOrdinals = new Map();
  const count = b3.b3RecPlayer_GetBodyCount(player);
  for (let ordinal = 0; ordinal < count; ordinal++) {
    const body = b3.b3RecPlayer_GetBodyId(player, ordinal);
    if (!b3.b3Body_IsValid(body)) continue;
    const name = b3.b3Body_GetName(body);
    if (!expected.has(name)) continue;
    if (entities.has(name)) throw new Error(`duplicate replay entity name ${name}`);
    entities.set(name, body);
    resolvedOrdinals.set(name, ordinal);
  }
  for (const def of entityDefs) {
    if (!entities.has(def.netEntityId)) throw new Error(`entity remap missing: ${def.netEntityId}`);
  }
  const actors = new Map([["A", entities.get("actor:A")], ["B", entities.get("actor:B")]]);
  const props = [];
  for (let i=0;i<PROP_COUNT;i++) props.push({id:`prop:${i}`, initial:[(i%4-1.5)*1.05,0.46,(Math.floor(i/4)-1)*1.05], body:entities.get(`prop:${i}`)});
  const relay = {id:"relay", initial:[...RELAY_START], body:entities.get("relay")};
  const applyOrder = selfId === "B" ? ["B","A"] : ["A","B"];
  return {world,selfId,actors,props,relay,applyOrder,inputs:{A:{x:0,z:0},B:{x:0,z:0}},entityDefs:[...entityDefs],entities,resolvedOrdinals,ownerPlayer:player};
}
function destroySimulation(sim) {
  if (!sim) return;
  if (sim.ownerPlayer) b3.b3RecPlayer_Destroy(sim.ownerPlayer);
  else b3.b3DestroyWorld(sim.world);
  sim.ownerPlayer = 0;
}
function actorState(sim,id){const body=sim.actors.get(id);return{position:bodyPosition(body),velocity:bodyVelocity(body)};}
function relayState(sim){return{position:bodyPosition(sim.relay.body),velocity:bodyVelocity(sim.relay.body),rotation:bodyRotation(sim.relay.body)};}
function capture(sim){return{A:actorState(sim,"A"),B:actorState(sim,"B"),relay:relayState(sim)};}
function stateResidual(a,b){
  return {
    actorPosition:Math.max(distance3(a.A.position,b.A.position),distance3(a.B.position,b.B.position)),
    relayPosition:distance3(a.relay.position,b.relay.position),
    relayVelocity:horizontalDistance(a.relay.velocity,b.relay.velocity),
    relayRotation:quaternionAngle(a.relay.rotation,b.relay.rotation),
  };
}
function maxCentralPropMovement(sim){let m=0;for(const p of sim.props)m=Math.max(m,horizontalDistance(bodyPosition(p.body),p.initial));return m;}
function relayDisplacement(sim){return horizontalDistance(bodyPosition(sim.relay.body),sim.relay.initial);}
function applyIntent(body,input) {
  const v=bodyVelocity(body),has=Math.hypot(input.x,input.z)>0.01,tx=input.x*PLAYER_SPEED,tz=input.z*PLAYER_SPEED,accel=has?PLAYER_ACCELERATION:PLAYER_DECELERATION;
  const [x,z]=moveToward2(v[0],v[2],tx,tz,accel*FIXED_DT);
  b3.b3Body_SetLinearVelocity(body,[x,v[1],z]);
}
function stepSimulation(sim){
  for(const id of sim.applyOrder) applyIntent(sim.actors.get(id),sim.inputs[id]);
  b3.b3World_Step(sim.world,FIXED_DT,SUBSTEPS);
}
function preRoll(sim){for(let i=0;i<PRE_ROLL_TICKS;i++)stepSimulation(sim);}

function targetTick(atMs){return Math.ceil((atMs-EPS)/STEP_MS);}
function transitions(raw){return raw.map((e,index)=>({...e,index,targetTick:targetTick(e.atMs)}));}
const TRANSITIONS={A:transitions(SCENARIO.a),B:transitions(SCENARIO.b)};

function inputTimeline(events) {
  const out=[];let cursor=0,current={x:0,z:0};
  for(let tick=0;tick<TOTAL_TICKS+32;tick++){
    while(cursor<events.length&&events[cursor].targetTick<=tick){current={x:events[cursor].x,z:events[cursor].z};cursor++;}
    out.push({targetTick:tick,x:current.x,z:current.z});
  }
  return out;
}
const RECORDS={A:inputTimeline(TRANSITIONS.A),B:inputTimeline(TRANSITIONS.B)};
function inputAt(events,tick){
  let current={x:0,z:0};
  for(const e of events){if(e.targetTick>tick)break;current={x:e.x,z:e.z};}
  return current;
}
function knownEvents(runtime,id){
  if(id===runtime.selfId)return TRANSITIONS[id];
  return TRANSITIONS[id].filter(e=>runtime.knownRemote.has(e.index));
}

function coeff(pattern,index,phase=0){const t=pattern==="smooth"?SMOOTH:BURST;return t[(index+phase)%t.length];}
function netDelay(trace,index,phase=0){return Math.max(0,trace.baseMs+trace.jitterMs*coeff(trace.pattern,index,phase));}
function deliverOrdered(messages,trace,phase=0){
  let prev=-Infinity;
  return messages.map((m,index)=>{const raw=m.sendMs+netDelay(trace,index,phase),deliveryMs=Math.max(raw,prev);prev=deliveryMs;return{...m,deliveryMs};});
}
function predictedTickAt(ms,lead){return Math.floor((ms+EPS)/STEP_MS)+lead;}
function buildNetwork(actorId,trace){
  const records=RECORDS[actorId],batches=[];
  for(let start=0,index=0;start<records.length;start+=trace.batchSize,index++){
    const end=Math.min(records.length-1,start+trace.batchSize-1);
    batches.push({index,startTick:start,endTick:end,records:records.slice(start,end+1),sendMs:(end-trace.lead)*STEP_MS});
  }
  const uplink=deliverOrdered(batches,trace,0);
  const relay=deliverOrdered(uplink.map(b=>({index:b.index,records:b.records,sendMs:b.deliveryMs})),trace,3);
  const deliveryByTick=new Map();for(const batch of uplink)for(const r of batch.records)deliveryByTick.set(r.targetTick,batch.deliveryMs);
  const transitionInfo=TRANSITIONS[actorId].map(e=>{
    const bi=Math.floor(e.targetTick/trace.batchSize),down=relay[bi];
    return {...e,peerArrivalTick:predictedTickAt(down.deliveryMs,trace.lead)};
  });
  return {deliveryByTick,transitionInfo};
}

function buildAuthority(trace,family){
  const networks={A:buildNetwork("A",trace),B:buildNetwork("B",trace)};
  const sim=createSimulation();
  preRoll(sim);
  const states=[];
  let minSep=Infinity;
  try{
    for(let tick=0;tick<TOTAL_TICKS;tick++){
      if(family==="source"){
        sim.inputs.A=inputAt(TRANSITIONS.A,tick);sim.inputs.B=inputAt(TRANSITIONS.B,tick);
      }else{
        for(const id of ["A","B"]){
          const record=RECORDS[id][tick],delivery=networks[id].deliveryByTick.get(tick);
          if(delivery<=tick*STEP_MS+EPS)sim.inputs[id]={x:record.x,z:record.z};
        }
      }
      stepSimulation(sim);
      const state=capture(sim);states.push(state);
      if(tick*STEP_MS<=CONTACT_GATE_END_MS)minSep=Math.min(minSep,distance3(state.A.position,state.B.position));
    }
    return {networks,states,final:states.at(-1),minSep,relayDisplacement:relayDisplacement(sim),centralPropMovement:maxCentralPropMovement(sim)};
  }finally{destroySimulation(sim);}
}

function createReferenceRuntime(selfId,trace,networks){
  const sim=createSimulation(selfId);preRoll(sim);
  return {selfId,remoteId:selfId==="A"?"B":"A",trace,networks,sim,knownRemote:new Set(),corrections:{self:[],remote:[],relay:[],horizon:[]}};
}
function rebuildReference(runtime,throughTick){
  const sim=createSimulation(runtime.selfId);preRoll(sim);
  for(let tick=0;tick<=throughTick;tick++){
    sim.inputs[runtime.selfId]=inputAt(TRANSITIONS[runtime.selfId],tick);
    sim.inputs[runtime.remoteId]=inputAt(knownEvents(runtime,runtime.remoteId),tick);
    stepSimulation(sim);
  }
  return sim;
}
function recordCorrection(runtime,before,after,horizon){
  runtime.corrections.self.push(distance3(before[runtime.selfId].position,after[runtime.selfId].position));
  runtime.corrections.remote.push(distance3(before[runtime.remoteId].position,after[runtime.remoteId].position));
  runtime.corrections.relay.push(distance3(before.relay.position,after.relay.position));
  runtime.corrections.horizon.push(horizon);
}
function advanceReference(runtime,tick){
  runtime.sim.inputs[runtime.selfId]=inputAt(TRANSITIONS[runtime.selfId],tick);
  const due=runtime.networks[runtime.remoteId].transitionInfo.filter(e=>e.peerArrivalTick===tick);
  if(due.length){const latest=due.at(-1);runtime.sim.inputs[runtime.remoteId]={x:latest.x,z:latest.z};}
  stepSimulation(runtime.sim);
  let correction=null;
  if(due.length){
    const before=capture(runtime.sim);
    for(const e of due)runtime.knownRemote.add(e.index);
    const target=Math.min(...due.map(e=>e.targetTick));
    const rebuilt=rebuildReference(runtime,tick),after=capture(rebuilt);
    const horizon=tick-target;
    recordCorrection(runtime,before,after,horizon);
    destroySimulation(runtime.sim);runtime.sim=rebuilt;
    correction={target,horizon,before,after};
  }
  return {state:capture(runtime.sim),correction};
}

function createHistory(runtime){
  const history={
    runtime,
    segments:[],
    active:null,
    generation:0,
    generationRotations:0,
    segmentRotations:0,
    maxRetainedBytes:0,
    maxSeekPrefix:0,
    maxCorrectedSteps:0,
    maxTotalReplaySteps:0,
    maxCheckpointAge:0,
    remapFailures:0,
    correctionEvidence:[],
  };
  startActive(history,0,"initial");
  return history;
}
function startActive(history,startTick,reason){
  if(history.active)throw new Error("active recording already exists");
  const recording=b3.b3CreateRecording(RECORDING_CAPACITY);
  b3.b3World_StartRecording(history.runtime.sim.world,recording);
  history.active={recording,startTick,frames:0,generation:history.generation,reason,seedBytes:b3.b3Recording_GetSize(recording)};
  updateRetainedBytes(history);
}
function finalizeActive(history,reason){
  const active=history.active;
  if(!active)return null;
  b3.b3World_StopRecording(history.runtime.sim.world);
  history.active=null;
  const bytes=b3.b3Recording_GetSize(active.recording);
  if(active.frames===0){
    b3.b3DestroyRecording(active.recording);
    return null;
  }
  const seg={...active,endTick:active.startTick+active.frames,validEndTick:active.startTick+active.frames,bytes,finalizeReason:reason};
  history.segments.push(seg);
  updateRetainedBytes(history);
  return seg;
}
function updateRetainedBytes(history){
  let bytes=history.segments.reduce((s,x)=>s+x.bytes,0);
  if(history.active)bytes+=b3.b3Recording_GetSize(history.active.recording);
  history.maxRetainedBytes=Math.max(history.maxRetainedBytes,bytes);
  return bytes;
}
function rotateIfNeeded(history,boundaryTick){
  if(history.active.frames<SEGMENT_TICKS)return;
  finalizeActive(history,"periodic");
  history.segmentRotations++;
  startActive(history,boundaryTick,"periodic");
}
function managedStep(history,tick){
  stepSimulation(history.runtime.sim);
  history.active.frames++;
  rotateIfNeeded(history,tick+1);
  updateRetainedBytes(history);
}
function trimHistory(history,currentBoundary){
  const cutoff=currentBoundary-RETAIN_TICKS;
  const kept=[];
  for(const seg of history.segments){
    if(seg.validEndTick>=cutoff)kept.push(seg);
    else b3.b3DestroyRecording(seg.recording);
  }
  history.segments=kept;
  updateRetainedBytes(history);
}
function selectCheckpoint(history,targetTick){
  const candidates=history.segments.filter(s=>s.startTick<=targetTick&&s.validEndTick>=targetTick);
  if(!candidates.length)throw new Error(`no retained checkpoint for B(${targetTick})`);
  candidates.sort((a,b)=>b.startTick-a.startTick);
  return candidates[0];
}
function invalidateFrom(history,targetTick,selected){
  const kept=[];
  for(const seg of history.segments){
    if(seg===selected&&seg.startTick<targetTick){
      seg.validEndTick=targetTick;
      kept.push(seg);
    }else if(seg.validEndTick<=targetTick){
      kept.push(seg);
    }else{
      b3.b3DestroyRecording(seg.recording);
    }
  }
  history.segments=kept;
}
function replaceLiveWithPlayer(runtime,player){
  const old=runtime.sim;
  const next=remapSimulation(player,runtime.selfId,old.entityDefs);
  runtime.sim=next;
  destroySimulation(old);
}
function applyCanonicalInputs(runtime,tick){
  runtime.sim.inputs[runtime.selfId]=inputAt(TRANSITIONS[runtime.selfId],tick);
  runtime.sim.inputs[runtime.remoteId]=inputAt(knownEvents(runtime,runtime.remoteId),tick);
}
function boundedCorrect(runtime,tick,due){
  const history=runtime.history;
  const before=capture(runtime.sim);
  for(const e of due)runtime.knownRemote.add(e.index);
  const target=Math.min(...due.map(e=>e.targetTick));
  const horizon=tick-target;
  finalizeActive(history,"correction-cut");
  const selected=selectCheckpoint(history,target);
  const seekPrefix=target-selected.startTick;
  const player=b3.b3RecPlayer_CreateFromRecording(selected.recording,0);
  if(!player)throw new Error(`player create failed for correction target ${target}`);
  b3.b3RecPlayer_SeekFrame(player,seekPrefix);
  if(b3.b3RecPlayer_GetFrame(player)!==seekPrefix){b3.b3RecPlayer_Destroy(player);throw new Error(`seek mismatch target ${target}`);}
  if(b3.b3RecPlayer_HasDiverged(player)){const d=b3.b3RecPlayer_GetDivergeFrame(player);b3.b3RecPlayer_Destroy(player);throw new Error(`checkpoint replay diverged at ${d}`);}

  invalidateFrom(history,target,selected);
  replaceLiveWithPlayer(runtime,player);
  history.generation++;
  history.generationRotations++;
  startActive(history,target,`correction-${history.generation}`);

  const correctedSteps=tick-target+1;
  for(let t=target;t<=tick;t++){
    applyCanonicalInputs(runtime,t);
    managedStep(history,t);
  }
  const after=capture(runtime.sim);
  recordCorrection(runtime,before,after,horizon);

  history.maxSeekPrefix=Math.max(history.maxSeekPrefix,seekPrefix);
  history.maxCorrectedSteps=Math.max(history.maxCorrectedSteps,correctedSteps);
  history.maxTotalReplaySteps=Math.max(history.maxTotalReplaySteps,seekPrefix+correctedSteps);
  history.maxCheckpointAge=Math.max(history.maxCheckpointAge,(tick+1)-selected.startTick);
  history.correctionEvidence.push({
    targetTick:target,currentTick:tick,horizonTicks:horizon,
    checkpointStartTick:selected.startTick,checkpointValidEndTick:selected.validEndTick,
    checkpointGeneration:selected.generation,seekPrefixTicks:seekPrefix,correctedSteps,totalReplaySteps:seekPrefix+correctedSteps,
    retainedBytes:updateRetainedBytes(history),
  });
  trimHistory(history,tick+1);
  return {target,horizon,before,after};
}
function createBoundedRuntime(selfId,trace,networks){
  const sim=createSimulation(selfId);preRoll(sim);
  const runtime={selfId,remoteId:selfId==="A"?"B":"A",trace,networks,sim,knownRemote:new Set(),corrections:{self:[],remote:[],relay:[],horizon:[]},history:null};
  runtime.history=createHistory(runtime);
  return runtime;
}
function advanceBounded(runtime,tick){
  runtime.sim.inputs[runtime.selfId]=inputAt(TRANSITIONS[runtime.selfId],tick);
  const due=runtime.networks[runtime.remoteId].transitionInfo.filter(e=>e.peerArrivalTick===tick);
  if(due.length){const latest=due.at(-1);runtime.sim.inputs[runtime.remoteId]={x:latest.x,z:latest.z};}
  managedStep(runtime.history,tick);
  let correction=null;
  if(due.length)correction=boundedCorrect(runtime,tick,due);
  trimHistory(runtime.history,tick+1);
  return {state:capture(runtime.sim),correction};
}
function destroyBounded(runtime){
  if(runtime.history.active)finalizeActive(runtime.history,"shutdown");
  for(const seg of runtime.history.segments)b3.b3DestroyRecording(seg.recording);
  runtime.history.segments=[];
  destroySimulation(runtime.sim);
}
function correctionSummary(runtime){
  return {
    count:runtime.corrections.self.length,
    selfPosition:summarize(runtime.corrections.self),
    remotePosition:summarize(runtime.corrections.remote),
    relayPosition:summarize(runtime.corrections.relay),
    horizonTicks:summarize(runtime.corrections.horizon),
  };
}

function runF4aTrace(trace,sourceOracle){
  const authority=buildAuthority(trace,"scheduled");
  if(maxResidual(stateResidual(authority.final,sourceOracle.final))>TOL)throw new Error(`${trace.name}: scheduled authority != source oracle`);
  const results=[];
  for(const selfId of ["A","B"]){
    const ref=createReferenceRuntime(selfId,trace,authority.networks);
    const bounded=createBoundedRuntime(selfId,trace,authority.networks);
    let maxReferenceResidual=0;
    try{
      for(let tick=0;tick<TOTAL_TICKS;tick++){
        const r=advanceReference(ref,tick),b=advanceBounded(bounded,tick);
        const rb=stateResidual(r.state,b.state);
        maxReferenceResidual=Math.max(maxReferenceResidual,maxResidual(rb));
        if(maxResidual(rb)>TOL)throw new Error(`${trace.name}/${selfId}: bounded != F3.1 reference at tick ${tick}: ${JSON.stringify(rb)}`);
        if(Boolean(r.correction)!==Boolean(b.correction))throw new Error(`${trace.name}/${selfId}: correction schedule mismatch at tick ${tick}`);
        if(r.correction&&b.correction&&r.correction.horizon!==b.correction.horizon)throw new Error(`${trace.name}/${selfId}: correction horizon mismatch`);
      }
      const refSummary=correctionSummary(ref),boundedSummary=correctionSummary(bounded);
      const finalState=capture(bounded.sim),authResidual=stateResidual(finalState,authority.final);
      if(maxResidual(authResidual)>TOL)throw new Error(`${trace.name}/${selfId}: bounded final != authority`);
      if(refSummary.horizonTicks.max>trace.frozenPeerMax||boundedSummary.horizonTicks.max>trace.frozenPeerMax)throw new Error(`${trace.name}/${selfId}: logical rewind exceeded frozen F3.1 bound`);
      results.push({
        selfId,maxReferenceResidual,reference:refSummary,bounded:boundedSummary,finalAuthorityResidual:authResidual,
        history:{
          segmentTicks:SEGMENT_TICKS,retainTicks:RETAIN_TICKS,
          generationRotations:bounded.history.generationRotations,
          segmentRotations:bounded.history.segmentRotations,
          maxRetainedBytes:bounded.history.maxRetainedBytes,
          maxSeekPrefixTicks:bounded.history.maxSeekPrefix,
          maxCorrectedSteps:bounded.history.maxCorrectedSteps,
          maxTotalReplaySteps:bounded.history.maxTotalReplaySteps,
          maxCheckpointAgeTicks:bounded.history.maxCheckpointAge,
          remapFailures:bounded.history.remapFailures,
          corrections:bounded.history.correctionEvidence,
        },
      });
    }finally{
      destroySimulation(ref.sim);
      destroyBounded(bounded);
    }
  }
  const selfMax=Math.max(...results.map(r=>r.bounded.selfPosition.max));
  const relayMax=Math.max(...results.map(r=>r.bounded.relayPosition.max));
  const horizonMax=Math.max(...results.map(r=>r.bounded.horizonTicks.max));
  if(Math.abs(selfMax-trace.frozenSelfMax)>1e-5)throw new Error(`${trace.name}: F3.1 self correction drift ${selfMax}`);
  if(Math.abs(relayMax-trace.frozenRelayMax)>1e-5)throw new Error(`${trace.name}: F3.1 relay correction drift ${relayMax}`);
  if(horizonMax!==trace.frozenPeerMax)throw new Error(`${trace.name}: F3.1 horizon drift ${horizonMax}`);
  return {
    trace:trace.name,parameters:{baseMs:trace.baseMs,jitterMs:trace.jitterMs,pattern:trace.pattern,lead:trace.lead,batchSize:trace.batchSize},
    authority:{sourceResidual:stateResidual(authority.final,sourceOracle.final)},
    frozenF31:{selfMax:trace.frozenSelfMax,relayMax:trace.frozenRelayMax,peerMax:trace.frozenPeerMax},
    measured:{selfMax,relayMax,horizonMax},
    clients:results,
  };
}

function runOverlapProbe(){
  const eventsSelf=[{index:0,targetTick:0,x:0,z:0}];
  const eventsRemote=[
    {index:0,targetTick:10,x:0,z:1,arrivalTick:18},
    {index:1,targetTick:14,x:0,z:0,arrivalTick:20},
  ];
  const totalTicks=28;
  function inputAtLocal(events,tick){let c={x:0,z:0};for(const e of events){if(e.targetTick>tick)break;c={x:e.x,z:e.z};}return c;}
  const sim=createSimulation("A");preRoll(sim);
  const runtime={selfId:"A",remoteId:"B",sim,knownRemote:new Set(),corrections:{self:[],remote:[],relay:[],horizon:[]},history:null};
  runtime.history=createHistory(runtime);

  function localKnownRemote(){return eventsRemote.filter(e=>runtime.knownRemote.has(e.index));}
  function localApply(tick){
    runtime.sim.inputs.A=inputAtLocal(eventsSelf,tick);
    runtime.sim.inputs.B=inputAtLocal(localKnownRemote(),tick);
  }
  function localCorrect(tick,due){
    const history=runtime.history,before=capture(runtime.sim);
    for(const e of due)runtime.knownRemote.add(e.index);
    const target=Math.min(...due.map(e=>e.targetTick)),horizon=tick-target;
    finalizeActive(history,"overlap-cut");
    const selected=selectCheckpoint(history,target),seekPrefix=target-selected.startTick;
    const player=b3.b3RecPlayer_CreateFromRecording(selected.recording,0);
    if(!player)throw new Error("overlap player create failed");
    b3.b3RecPlayer_SeekFrame(player,seekPrefix);
    if(b3.b3RecPlayer_GetFrame(player)!==seekPrefix)throw new Error("overlap seek failed");
    invalidateFrom(history,target,selected);
    replaceLiveWithPlayer(runtime,player);
    history.generation++;history.generationRotations++;
    startActive(history,target,`overlap-correction-${history.generation}`);
    for(let t=target;t<=tick;t++){localApply(t);managedStep(history,t);}
    const after=capture(runtime.sim);recordCorrection(runtime,before,after,horizon);
    history.correctionEvidence.push({targetTick:target,currentTick:tick,checkpointStartTick:selected.startTick,checkpointGeneration:selected.generation,seekPrefixTicks:seekPrefix,correctedSteps:tick-target+1});
    trimHistory(history,tick+1);
    return {selectedGeneration:selected.generation,target};
  }

  let secondSelection=null;
  try{
    for(let tick=0;tick<totalTicks;tick++){
      runtime.sim.inputs.A=inputAtLocal(eventsSelf,tick);
      const due=eventsRemote.filter(e=>e.arrivalTick===tick);
      if(due.length){const latest=due.at(-1);runtime.sim.inputs.B={x:latest.x,z:latest.z};}
      managedStep(runtime.history,tick);
      if(due.length){
        const c=localCorrect(tick,due);
        if(due.some(e=>e.index===1))secondSelection=c;
      }
    }
    const finalBounded=capture(runtime.sim);
    const oracle=createSimulation("A");preRoll(oracle);
    try{
      for(let tick=0;tick<totalTicks;tick++){
        oracle.inputs.A=inputAtLocal(eventsSelf,tick);
        oracle.inputs.B=inputAtLocal(eventsRemote,tick);
        stepSimulation(oracle);
      }
      const oracleState=capture(oracle),residual=stateResidual(finalBounded,oracleState);
      if(maxResidual(residual)>TOL)throw new Error(`overlap final != clean oracle ${JSON.stringify(residual)}`);
      if(!secondSelection||secondSelection.selectedGeneration<1)throw new Error("C2 did not restore from C1-corrected generation");
      return {
        events:eventsRemote.map(e=>({targetTick:e.targetTick,arrivalTick:e.arrivalTick})),
        secondCorrectionSelectedGeneration:secondSelection.selectedGeneration,
        finalOracleResidual:residual,
        correctionEvidence:runtime.history.correctionEvidence,
      };
    }finally{destroySimulation(oracle);}
  }finally{destroyBounded(runtime);}
}

const sourceOracle=buildAuthority(TRACE_CASES[0],"source");
if(sourceOracle.minSep>0.72)throw new Error(`T5 source contact gate failed: ${sourceOracle.minSep}`);
if(sourceOracle.relayDisplacement<0.35)throw new Error(`T5 source relay gate failed: ${sourceOracle.relayDisplacement}`);
if(sourceOracle.centralPropMovement>0.05)throw new Error(`T5 central prop isolation failed: ${sourceOracle.centralPropMovement}`);

console.log(`${REVISION} · Box3D ${JSON.stringify(b3.b3GetVersion())}`);
console.log(`T5 oracle contact=${sourceOracle.minSep.toFixed(4)} relay=${sourceOracle.relayDisplacement.toFixed(4)} central=${sourceOracle.centralPropMovement.toFixed(6)}`);

const traces=[];
for(const trace of TRACE_CASES){
  const result=runF4aTrace(trace,sourceOracle);
  traces.push(result);
  const maxReplay=Math.max(...result.clients.map(c=>c.history.maxTotalReplaySteps));
  const maxBytes=Math.max(...result.clients.map(c=>c.history.maxRetainedBytes));
  console.log(`${trace.name}: bounded==reference · correction self=${result.measured.selfMax.toFixed(6)} relay=${result.measured.relayMax.toFixed(6)} horizon=${result.measured.horizonMax} maxReplay=${maxReplay} retained<=${maxBytes}B`);
}
const overlap=runOverlapProbe();
console.log(`overlap: C2 selected corrected generation ${overlap.secondCorrectionSelectedGeneration} · final oracle residual=${maxResidual(overlap.finalOracleResidual)}`);

const evidence={
  revision:REVISION,
  generatedAt:new Date().toISOString(),
  contract:"docs/WS0_F4_BOUNDED_SCHEDULED_HISTORY_CONTRACT.md",
  packageContract:"box3d.js@0.1.1 imported through box3d.js/inline",
  box3dVersion:b3.b3GetVersion(),
  design:{
    segmentTicks:SEGMENT_TICKS,
    retainTicks:RETAIN_TICKS,
    boundarySemantics:"Recording seed at B(S); SeekFrame(T-S) restores B(T); corrected tick T is then executed again.",
    identity:"host NetEntityId; each replay generation scans preserved names to bind generation-local ordinal -> current BodyId",
  },
  t5Oracle:{minPlayerSeparation:sourceOracle.minSep,relayDisplacement:sourceOracle.relayDisplacement,centralPropMovement:sourceOracle.centralPropMovement},
  traces,
  overlap,
  verdict:"F4A_BOUNDED_HISTORY_AND_F4B_OVERLAP_QUALIFIED",
};
writeFileSync(OUTPUT,JSON.stringify(evidence,null,2));
console.log(`F4A/F4B QUALIFIED · evidence written to ${OUTPUT}`);
