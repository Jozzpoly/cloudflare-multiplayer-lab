import Box3D from 'box3d.js';

const b3 = await Box3D();
const HZ = 60;
const DT = 1 / HZ;
const SUBSTEPS = 4;
const SPEED = 5.2;
const ACCEL = 28;
const DECEL = 36;
const PLAYER_DAMPING = 0.3;
const HEARTBEAT_MS = 66;
const PROP_COUNT = 12;
const PLAYER = 'player';
const EPS = 1e-9;

const SHARED = {
  tau: 0.18,
  maxLinearAccel: 16,
  maxAngularAccel: 21.6,
  collisionScale: 0,
  rampMs: 260,
  positionDeadzone: 0.015,
  velocityDeadzone: 0.05,
  angleDeadzone: 0.02,
  angularVelocityDeadzone: 0.05,
};

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1))];
}
function length3(v) { return Math.hypot(v[0], v[1], v[2]); }
function distance3(a, b) { return Math.hypot(a[0]-b[0], a[1]-b[1], a[2]-b[2]); }
function distanceXZ(a, b) { return Math.hypot(a[0]-b[0], a[2]-b[2]); }
function clampVector(v, max) {
  const len = length3(v);
  if (len <= max || len < EPS) return v;
  const s = max / len;
  return [v[0]*s, v[1]*s, v[2]*s];
}
function moveToward2(cx, cz, tx, tz, maxDelta) {
  const dx = tx-cx, dz = tz-cz, d = Math.hypot(dx,dz);
  if (d <= maxDelta || d < EPS) return [tx,tz];
  const s = maxDelta/d;
  return [cx+dx*s, cz+dz*s];
}
function normalizeInput([x,z]) { const d=Math.hypot(x,z); return d>1?[x/d,z/d]:[x,z]; }
function shapeKey(id) { return `${id.index1}:${id.world0}:${id.generation}`; }

function quatNormalize(q) {
  const d=Math.hypot(q[0],q[1],q[2],q[3]);
  return d<EPS?[0,0,0,1]:q.map(v=>v/d);
}
function quatMultiply(a,b) {
  return [
    a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],
    a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],
    a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3],
    a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2],
  ];
}
function quatConjugate(q){ return [-q[0],-q[1],-q[2],q[3]]; }
function integrateRotation(q,w,dt) {
  const speed=length3(w); if(speed<EPS||dt<=0)return q;
  const h=.5*speed*dt, s=Math.sin(h)/speed;
  return quatNormalize(quatMultiply([w[0]*s,w[1]*s,w[2]*s,Math.cos(h)],q));
}
function rotationVector(current,target) {
  let e=quatNormalize(quatMultiply(target,quatConjugate(current)));
  if(e[3]<0)e=e.map(v=>-v);
  const w=clamp(e[3],-1,1), angle=2*Math.acos(w), sh=Math.sqrt(Math.max(0,1-w*w));
  if(sh<1e-6||angle<1e-6)return [0,0,0];
  const s=angle/sh; return [e[0]*s,e[1]*s,e[2]*s];
}

function makeRng(seed){ let x=seed>>>0; return()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return(x>>>0)/0x100000000;}; }
function delayMs(base,jitter,rng){ return Math.max(0,base+(rng()*2-1)*jitter); }
function enqueue(q,at,payload){q.push({at,payload});q.sort((a,b)=>a.at-b.at);}
function deliver(q,now,fn){while(q.length&&q[0].at<=now+1e-6)fn(q.shift().payload);}
function inputChanged(a,b){return !b||Math.abs(a[0]-b[0])>EPS||Math.abs(a[1]-b[1])>EPS;}

function staticBox(world,p,h){const d=b3.b3DefaultBodyDef();d.position=p;const body=b3.b3CreateBody(world,d);b3.b3CreateBoxShape(body,b3.b3DefaultShapeDef(),h[0],h[1],h[2]);}
function createWorld(eventsEnabled=false) {
  const wd=b3.b3DefaultWorldDef();wd.gravity=[0,-20,0];const world=b3.b3CreateWorld(wd);
  staticBox(world,[0,-.5,0],[10,.5,10]);
  staticBox(world,[-9.5,1.5,0],[.5,2,10]);staticBox(world,[9.5,1.5,0],[.5,2,10]);
  staticBox(world,[0,1.5,-9.5],[10,2,.5]);staticBox(world,[0,1.5,9.5],[10,2,.5]);
  const bodies=new Map(), shapeOwners=new Map();
  for(let i=0;i<PROP_COUNT;i++){
    const col=i%4,row=Math.floor(i/4),initial=[(col-1.5)*1.05,.46,(row-1)*1.05];
    const bd=b3.b3DefaultBodyDef();bd.type=b3.b3BodyType.b3_dynamicBody;bd.position=initial;bd.linearDamping=.08;bd.angularDamping=.12;
    const body=b3.b3CreateBody(world,bd), sd=b3.b3DefaultShapeDef();
    sd.density=22;sd.baseMaterial.friction=.72;sd.baseMaterial.restitution=.04;sd.enableContactEvents=eventsEnabled;sd.enableHitEvents=eventsEnabled;
    const shape=b3.b3CreateBoxShape(body,sd,.46,.46,.46),id=`prop-${i}`;
    bodies.set(id,{id,body,shape,kind:'prop'});shapeOwners.set(shapeKey(shape),id);
  }
  const bd=b3.b3DefaultBodyDef();bd.type=b3.b3BodyType.b3_dynamicBody;bd.position=[-6.5,.82,-1.4];bd.linearDamping=PLAYER_DAMPING;bd.angularDamping=8;
  const body=b3.b3CreateBody(world,bd),sd=b3.b3DefaultShapeDef();sd.density=80;sd.baseMaterial.friction=.8;sd.baseMaterial.restitution=.02;sd.enableContactEvents=eventsEnabled;sd.enableHitEvents=eventsEnabled;
  const shape=b3.b3CreateCapsuleShape(body,sd,{center1:[0,-.45,0],center2:[0,.45,0],radius:.35});
  b3.b3Body_SetMotionLocks(body,{linearX:false,linearY:false,linearZ:false,angularX:true,angularY:true,angularZ:true});
  bodies.set(PLAYER,{id:PLAYER,body,shape,kind:'player'});shapeOwners.set(shapeKey(shape),PLAYER);
  return {world,bodies,shapeOwners,events:eventsEnabled?b3.createEventsBuffer():null,touch:eventsEnabled?b3.createContactTouchEvent():null,hit:eventsEnabled?b3.createContactHitEvent():null,activePairs:new Map(),cooldown:new Map()};
}
function destroy(sim){if(sim.events)b3.destroyEventsBuffer(sim.events);b3.b3DestroyWorld(sim.world);}
function bodyState(record){
  const position=[0,0,0],rotation=[0,0,0,1],linearVelocity=[0,0,0],angularVelocity=[0,0,0];
  b3.b3Body_GetPosition(position,record.body);b3.b3Body_GetRotation(rotation,record.body);b3.b3Body_GetLinearVelocity(linearVelocity,record.body);b3.b3Body_GetAngularVelocity(angularVelocity,record.body);
  return {position:[...position],rotation:[...rotation],linearVelocity:[...linearVelocity],angularVelocity:[...angularVelocity],awake:b3.b3Body_IsAwake(record.body)};
}
function snapshot(sim,tick,ack){const states={};for(const[id,r]of sim.bodies)states[id]=bodyState(r);return{tick,ack,states};}
function applyInput(sim,raw){
  const [x,z]=normalizeInput(raw),r=sim.bodies.get(PLAYER),v=[0,0,0];b3.b3Body_GetLinearVelocity(v,r.body);
  const active=Math.hypot(x,z)>.01,[vx,vz]=moveToward2(v[0],v[2],x*SPEED,z*SPEED,(active?ACCEL:DECEL)*DT);
  b3.b3Body_SetLinearVelocity(r.body,[vx,v[1],vz]);
}
function pairFromEvent(sim,aId,bId){const a=sim.shapeOwners.get(shapeKey(aId)),b=sim.shapeOwners.get(shapeKey(bId));if(!a||!b||a===b)return null;const x=a<b?a:b,y=a<b?b:a;return{key:`${x}|${y}`,a:x,b:y};}
function updateContacts(sim,tick){
  if(!sim.events)return;b3.getEvents(sim.events,sim.world);const cooldownTicks=Math.max(1,Math.round(SHARED.rampMs/1000*HZ));
  for(let i=0,n=b3.getNumContactBeginEvents(sim.events);i<n;i++){b3.getContactBeginEventAt(sim.touch,sim.events,i);const p=pairFromEvent(sim,sim.touch.shapeIdA,sim.touch.shapeIdB);if(!p)continue;sim.activePairs.set(p.key,p);sim.cooldown.set(p.a,tick+cooldownTicks);sim.cooldown.set(p.b,tick+cooldownTicks);}
  for(let i=0,n=b3.getNumContactEndEvents(sim.events);i<n;i++){b3.getContactEndEventAt(sim.touch,sim.events,i);const p=pairFromEvent(sim,sim.touch.shapeIdA,sim.touch.shapeIdB);if(!p)continue;sim.activePairs.delete(p.key);sim.cooldown.set(p.a,tick+cooldownTicks);sim.cooldown.set(p.b,tick+cooldownTicks);}
  for(let i=0,n=b3.getNumContactHitEvents(sim.events);i<n;i++){b3.getContactHitEventAt(sim.hit,sim.events,i);const p=pairFromEvent(sim,sim.hit.shapeIdA,sim.hit.shapeIdB);if(!p)continue;sim.cooldown.set(p.a,tick+cooldownTicks);sim.cooldown.set(p.b,tick+cooldownTicks);}
}
function contactBodies(sim){const s=new Set();for(const p of sim.activePairs.values()){s.add(p.a);s.add(p.b);}return s;}
function correctionScale(sim,id,tick,contacts){if(contacts.has(id))return SHARED.collisionScale;const until=sim.cooldown.get(id)??-Infinity;if(tick>=until)return 1;const ramp=Math.max(1,Math.round(SHARED.rampMs/1000*HZ)),t=clamp(1-(until-tick)/ramp,0,1);return SHARED.collisionScale+(1-SHARED.collisionScale)*t;}
function projected(s,age){return{position:[s.position[0]+s.linearVelocity[0]*age,s.position[1]+s.linearVelocity[1]*age,s.position[2]+s.linearVelocity[2]*age],rotation:integrateRotation(s.rotation,s.angularVelocity,age),linearVelocity:s.linearVelocity,angularVelocity:s.angularVelocity};}
function projectOwnerInputAware(s,input,age){
  const [x,z]=normalizeInput(input),active=Math.hypot(x,z)>.01,p=[...s.position],v=[...s.linearVelocity];let left=Math.max(0,age);
  while(left>EPS){const h=Math.min(DT,left),[vx,vz]=moveToward2(v[0],v[2],x*SPEED,z*SPEED,(active?ACCEL:DECEL)*h),d=1/(1+PLAYER_DAMPING*h);v[0]=vx*d;v[2]=vz*d;p[0]+=v[0]*h;p[2]+=v[2]*h;left-=h;}
  return{position:p,linearVelocity:v};
}
function applySharedCorrection(sim,snap,tick,metrics){
  if(!snap)return;const age=Math.max(0,tick-snap.tick)*DT,contacts=contactBodies(sim),kp=4/(SHARED.tau*SHARED.tau),kd=4/SHARED.tau;
  for(const[id,r]of sim.bodies){if(r.kind!=='prop')continue;const a=snap.states[id];if(!a)continue;const target=projected(a,age),local=bodyState(r),scale=correctionScale(sim,id,tick,contacts),pe=target.position.map((v,i)=>v-local.position[i]),ve=target.linearVelocity.map((v,i)=>v-local.linearVelocity[i]);
    let la=(length3(pe)<SHARED.positionDeadzone&&length3(ve)<SHARED.velocityDeadzone)?[0,0,0]:pe.map((v,i)=>v*kp+ve[i]*kd);la=clampVector(la,SHARED.maxLinearAccel*scale);metrics.sharedAccel.push(length3(la));if(length3(la)>EPS)b3.b3Body_SetLinearVelocity(r.body,local.linearVelocity.map((v,i)=>v+la[i]*DT));
    const re=rotationVector(local.rotation,target.rotation),ave=target.angularVelocity.map((v,i)=>v-local.angularVelocity[i]);let aa=(length3(re)<SHARED.angleDeadzone&&length3(ave)<SHARED.angularVelocityDeadzone)?[0,0,0]:re.map((v,i)=>v*kp+ave[i]*kd);aa=clampVector(aa,SHARED.maxAngularAccel*scale);if(length3(aa)>EPS)b3.b3Body_SetAngularVelocity(r.body,local.angularVelocity.map((v,i)=>v+aa[i]*DT));
  }
}
function applyOwnerCorrection(sim,snap,tick,input,lastChangeSeq,policy,metrics){
  let corr=[0,0,0];if(!snap||policy.owner==='none')return corr;const contacts=contactBodies(sim);if(policy.suppressOwnerOnContact&&contacts.has(PLAYER))return corr;if(policy.owner!=='naive'&&snap.ack<lastChangeSeq)return corr;
  const r=sim.bodies.get(PLAYER),local=bodyState(r),age=Math.max(0,tick-snap.tick)*DT,target=policy.owner==='ack-input'?projectOwnerInputAware(snap.states[PLAYER],input,age):projected(snap.states[PLAYER],age),pe=target.position.map((v,i)=>v-local.position[i]),ve=target.linearVelocity.map((v,i)=>v-local.linearVelocity[i]),kp=4/(policy.ownerTau*policy.ownerTau),kd=4/policy.ownerTau;
  corr=(length3(pe)<.015&&length3(ve)<.05)?[0,0,0]:clampVector(pe.map((v,i)=>v*kp+ve[i]*kd),policy.ownerMaxAccel);metrics.ownerAccel.push(length3(corr));if(length3(corr)>EPS)b3.b3Body_SetLinearVelocity(r.body,local.linearVelocity.map((v,i)=>v+corr[i]*DT));return corr;
}
function maxPropDistance(a,b){let m=0;for(let i=0;i<PROP_COUNT;i++){const id=`prop-${i}`;m=Math.max(m,distance3(bodyState(a.bodies.get(id)).position,bodyState(b.bodies.get(id)).position));}return m;}
function finite(sim){for(const r of sim.bodies.values()){const s=bodyState(r);if(![...s.position,...s.rotation,...s.linearVelocity,...s.angularVelocity].every(Number.isFinite))return false;}return true;}

const SCENARIOS={
  push:{duration:7,activeUntil:4.2,input:t=>t<4.2?[1,0]:[0,0]},
  reversal:{duration:8,activeUntil:5,input(t){if(t<2.6)return[1,0];if(t<5)return[-1,0];return[0,0];}},
  diagonal:{duration:8,activeUntil:5,input(t){if(t<2.4)return[1,.35];if(t<5)return[1,-.5];return[0,0];}},
};
const POLICIES=[
  {name:'local-only',shared:false,owner:'none',ownerMaxAccel:0,ownerTau:.4,suppressOwnerOnContact:true},
  {name:'shared-only',shared:true,owner:'none',ownerMaxAccel:0,ownerTau:.4,suppressOwnerOnContact:true},
  {name:'shared+naive-owner',shared:true,owner:'naive',ownerMaxAccel:4,ownerTau:.18,suppressOwnerOnContact:false},
  {name:'shared+ack-input',shared:true,owner:'ack-input',ownerMaxAccel:4,ownerTau:.4,suppressOwnerOnContact:false},
  {name:'shared+ack-input-contact-off',shared:true,owner:'ack-input',ownerMaxAccel:4,ownerTau:.4,suppressOwnerOnContact:true},
];

function run(scenario,policy,network,seed){
  const authority=createWorld(false),client=createWorld(true),ideal=createWorld(false),inputQ=[],snapQ=[],rng=makeRng(seed),m={intentPlayer:[],intentProp:[],contactPlayer:[],contactProp:[],settledPlayer:[],settledProp:[],ownerAccel:[],ownerJerk:[],sharedAccel:[]};
  let authorityInput=[0,0],authorityAck=0,packetSeq=0,lastChangeSeq=0,lastSent=null,nextHeartbeat=0,snap=null,prevOwner=[0,0,0],contactTicks=0;const total=Math.round(scenario.duration*HZ),snapEvery=Math.round(HZ/network.snapshotHz);
  try{
    for(let tick=0;tick<total;tick++){
      const t=tick*DT,now=t*1000,input=scenario.input(t),changed=inputChanged(input,lastSent);
      if(changed||now+1e-6>=nextHeartbeat){packetSeq++;if(changed)lastChangeSeq=packetSeq;enqueue(inputQ,now+delayMs(network.oneWayMs,network.jitterMs,rng),{seq:packetSeq,input:[...input]});lastSent=[...input];nextHeartbeat=now+HEARTBEAT_MS;}
      deliver(inputQ,now,p=>{if(p.seq<=authorityAck)return;authorityAck=p.seq;authorityInput=p.input;});deliver(snapQ,now,s=>{snap=s;});
      applyInput(authority,authorityInput);applyInput(client,input);applyInput(ideal,input);
      if(policy.shared)applySharedCorrection(client,snap,tick,m);
      const ownerCorr=applyOwnerCorrection(client,snap,tick,input,lastChangeSeq,policy,m);m.ownerJerk.push(length3(ownerCorr.map((v,i)=>v-prevOwner[i]))/DT);prevOwner=ownerCorr;
      b3.b3World_Step(authority.world,DT,SUBSTEPS);b3.b3World_Step(client.world,DT,SUBSTEPS);b3.b3World_Step(ideal.world,DT,SUBSTEPS);updateContacts(client,tick);
      if((tick+1)%snapEvery===0)enqueue(snapQ,now+DT*1000+delayMs(network.oneWayMs,network.jitterMs,rng),snapshot(authority,tick+1,authorityAck));
      const cp=bodyState(client.bodies.get(PLAYER)).position,ip=bodyState(ideal.bodies.get(PLAYER)).position,ap=bodyState(authority.bodies.get(PLAYER)).position,propIntent=maxPropDistance(client,ideal),contacts=contactBodies(client),inPlayerContact=contacts.has(PLAYER);
      if(t<scenario.activeUntil){m.intentPlayer.push(distanceXZ(cp,ip));m.intentProp.push(propIntent);if(inPlayerContact){contactTicks++;m.contactPlayer.push(distanceXZ(cp,ip));m.contactProp.push(propIntent);}}
      if(t>scenario.activeUntil+.8){m.settledPlayer.push(distanceXZ(cp,ap));m.settledProp.push(maxPropDistance(client,authority));}
      if(!finite(authority)||!finite(client)||!finite(ideal))throw new Error(`non-finite at ${tick}`);
    }
    const cp=bodyState(client.bodies.get(PLAYER)).position,ap=bodyState(authority.bodies.get(PLAYER)).position;
    return{intentPlayerP95:percentile(m.intentPlayer,.95),intentPropP95:percentile(m.intentProp,.95),contactPlayerP95:percentile(m.contactPlayer,.95),contactPropP95:percentile(m.contactProp,.95),settledPlayerP95:percentile(m.settledPlayer,.95),settledPropP95:percentile(m.settledProp,.95),finalPlayer:distanceXZ(cp,ap),finalProp:maxPropDistance(client,authority),ownerAccelP95:percentile(m.ownerAccel,.95),ownerJerkP95:percentile(m.ownerJerk,.95),sharedAccelP95:percentile(m.sharedAccel,.95),contactTicks};
  }finally{destroy(authority);destroy(client);destroy(ideal);}
}
function aggregate(results){const out={};for(const k of Object.keys(results[0]))out[k]=Math.max(...results.map(r=>r[k]));return out;}
function score(s){return s.intentPlayerP95*3+s.intentPropP95*2+s.contactPlayerP95*3+s.contactPropP95*2+s.settledPlayerP95*2+s.settledPropP95*2+s.finalPlayer*2+s.finalProp*2+s.ownerAccelP95*.01+s.ownerJerkP95*.0005+s.sharedAccelP95*.005;}
function f(v){return Number(v).toFixed(3);}

const network={oneWayMs:63,jitterMs:6,snapshotHz:10};
const ranked=POLICIES.map(policy=>{const details=Object.entries(SCENARIOS).map(([name,scenario],i)=>({name,result:run(scenario,policy,network,7300+i)})),summary=aggregate(details.map(d=>d.result));return{policy,details,summary,score:score(summary)};}).sort((a,b)=>a.score-b.score);
console.log('\nA2R full-world hybrid lab — observed A2 latency');
for(const e of ranked){const s=e.summary;console.log(`  ${e.policy.name} | score ${f(e.score)} | intent player/prop ${f(s.intentPlayerP95)}/${f(s.intentPropP95)} | contact ${f(s.contactPlayerP95)}/${f(s.contactPropP95)} | settled ${f(s.settledPlayerP95)}/${f(s.settledPropP95)} | final ${f(s.finalPlayer)}/${f(s.finalProp)} | owner jerk ${f(s.ownerJerkP95)} | shared accel ${f(s.sharedAccelP95)} | contactTicks ${s.contactTicks}`);}
console.log('\nBest detail:');for(const d of ranked[0].details)console.log(`  ${d.name}: ${JSON.stringify(d.result)}`);
if(!ranked.every(e=>Object.values(e.summary).every(Number.isFinite)))throw new Error('non-finite hybrid lab result');
