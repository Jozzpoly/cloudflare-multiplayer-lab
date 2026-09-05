import Box3D from "box3d.js/inline";
import { generateStressManifest, stressChaosDNA } from "../public/world-v0-stress/phenomenon-manifest.js";

const DT = 1 / 60;
const SUBSTEPS = 4;
const SEGMENT_TICKS = 8;
const RETAIN_TICKS = 24;
const RECORDING_CAPACITY = 2 * 1024 * 1024;
const COUNTS = [32, 64, 128];
const H = 27;
const CURRENT = 48;
const FINAL = 72;
const SEED = 0x51f15e;
const RAM = "stress-body-00000";
const NUDGE_Z = 0.8;
const REPEATS = 2;

function assert(ok, message) { if (!ok) throw new Error(message); }
const f32 = new DataView(new ArrayBuffer(4));
function bits(v) { f32.setFloat32(0, v, true); return f32.getUint32(0, true); }
function bodyState(b3, body) {
  const p = [0, 0, 0], q = [0, 0, 0, 1], lv = [0, 0, 0], av = [0, 0, 0];
  b3.b3Body_GetPosition(p, body); b3.b3Body_GetRotation(q, body);
  b3.b3Body_GetLinearVelocity(lv, body); b3.b3Body_GetAngularVelocity(av, body);
  return [...p, ...q, ...lv, ...av];
}
function snapshot(b3, sim, ids) {
  const out = new Map();
  for (const id of ids) {
    const body = sim.byId.get(id); assert(body && b3.b3Body_IsValid(body), `missing body ${id}`);
    const s = bodyState(b3, body); assert(s.every(Number.isFinite), `non-finite ${id}`); out.set(id, s);
  }
  return out;
}
function hash(snap, ids) {
  let h = 0x811c9dc5 >>> 0;
  for (const id of ids) for (const v of snap.get(id)) { h ^= bits(v); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, "0");
}
function diff(a, b, ids) {
  let affectedBodies = 0, differingComponents = 0, maxPositionDelta = 0, maxLinearVelocityDelta = 0, firstDifference = null;
  for (const id of ids) {
    const x = a.get(id), y = b.get(id); let affected = false;
    for (let i = 0; i < x.length; i += 1) if (bits(x[i]) !== bits(y[i])) {
      affected = true; differingComponents += 1;
      if (!firstDifference) firstDifference = { id, componentIndex: i, left: x[i], right: y[i] };
    }
    if (affected) affectedBodies += 1;
    maxPositionDelta = Math.max(maxPositionDelta, Math.hypot(x[0]-y[0], x[1]-y[1], x[2]-y[2]));
    maxLinearVelocityDelta = Math.max(maxLinearVelocityDelta, Math.hypot(x[7]-y[7], x[8]-y[8], x[9]-y[9]));
  }
  return { affectedBodies, differingComponents, maxPositionDelta, maxLinearVelocityDelta, firstDifference };
}
function staticBox(b3, world, p, h) {
  const d = b3.b3DefaultBodyDef(); d.position = [...p]; const body = b3.b3CreateBody(world, d);
  b3.b3CreateBoxShape(body, b3.b3DefaultShapeDef(), h[0], h[1], h[2]);
}
function build(b3, manifest) {
  const wd = b3.b3DefaultWorldDef(); wd.gravity = [0, -20, 0]; const world = b3.b3CreateWorld(wd); const e = manifest.extent;
  staticBox(b3, world, [0,-0.5,0], [e,0.5,e]); staticBox(b3, world, [-e+0.25,3,0], [0.25,3.5,e]);
  staticBox(b3, world, [e-0.25,3,0], [0.25,3.5,e]); staticBox(b3, world, [0,3,-e+0.25], [e,3.5,0.25]);
  staticBox(b3, world, [0,3,e-0.25], [e,3.5,0.25]);
  const byId = new Map();
  for (const spec of manifest.bodies) {
    const d = b3.b3DefaultBodyDef(); d.type = b3.b3BodyType.b3_dynamicBody; d.position = [...spec.position];
    d.linearDamping = spec.linearDamping; d.angularDamping = spec.angularDamping;
    const body = b3.b3CreateBody(world, d); b3.b3Body_SetName(body, spec.id);
    const sd = b3.b3DefaultShapeDef(); sd.density = spec.density; sd.baseMaterial.friction = spec.friction; sd.baseMaterial.restitution = spec.restitution;
    b3.b3CreateBoxShape(body, sd, ...spec.halfExtents); b3.b3Body_SetLinearVelocity(body, [...spec.initialVelocity]); byId.set(spec.id, body);
  }
  return { world, byId, ownerPlayer: 0 };
}
function destroy(b3, sim) {
  if (!sim) return;
  if (sim.ownerPlayer) { try { b3.b3RecPlayer_Destroy(sim.ownerPlayer); } catch {} }
  else if (sim.world) { try { b3.b3DestroyWorld(sim.world); } catch {} }
  sim.world = 0;
}
function nudge(b3, sim) {
  const body = sim.byId.get(RAM); assert(body, "ram missing"); const v = [0,0,0]; b3.b3Body_GetLinearVelocity(v, body);
  const before = [...v]; v[2] += NUDGE_Z; b3.b3Body_SetLinearVelocity(body, v); return { before, after: [...v] };
}
function step(b3, sim) { b3.b3World_Step(sim.world, DT, SUBSTEPS); }
function runWitness(b3, manifest, ids, intervene) {
  const sim = build(b3, manifest), captures = new Map(); let intervention = null;
  for (let boundary = 0; boundary < FINAL; boundary += 1) {
    if (intervene && boundary === H) intervention = nudge(b3, sim); step(b3, sim);
    const next = boundary + 1; if (next === CURRENT || next === FINAL) captures.set(next, snapshot(b3, sim, ids));
  }
  return { sim, captures, intervention };
}
function startRec(b3, world, startTick) {
  const recording = b3.b3CreateRecording(RECORDING_CAPACITY); assert(recording, `recording create B${startTick}`);
  b3.b3World_StartRecording(world, recording); return { recording, startTick, frames: 0 };
}
function trim(b3, history, boundary) {
  const cutoff = boundary - RETAIN_TICKS, kept = [];
  for (const s of history.segments) { if (s.validEndTick >= cutoff) kept.push(s); else b3.b3DestroyRecording(s.recording); }
  history.segments = kept;
}
function rotate(b3, sim, history, boundary) {
  const a = history.active; b3.b3World_StopRecording(sim.world); history.active = null;
  history.segments.push({ recording:a.recording, startTick:a.startTick, endTick:a.startTick+a.frames, validEndTick:a.startTick+a.frames, frames:a.frames, bytes:b3.b3Recording_GetSize(a.recording) });
  trim(b3, history, boundary); history.active = startRec(b3, sim.world, boundary);
}
function predicted(b3, manifest, ids) {
  const sim = build(b3, manifest), history = { active:startRec(b3, sim.world, 0), segments:[] };
  for (let boundary = 0; boundary < CURRENT; boundary += 1) {
    step(b3, sim); history.active.frames += 1; if (history.active.frames === SEGMENT_TICKS) rotate(b3, sim, history, boundary+1);
  }
  b3.b3World_StopRecording(sim.world); b3.b3DestroyRecording(history.active.recording); history.active = null;
  return { sim, history, atCurrent:snapshot(b3, sim, ids) };
}
function checkpoint(history) {
  const c = history.segments.filter(s => s.startTick <= H && s.validEndTick >= H).sort((a,b) => b.startTick-a.startTick)[0];
  assert(c, `history miss B${H}`); return c;
}
function invalidate(b3, history, selected) {
  const t0 = performance.now(), kept = []; let destroyedSegments = 0, destroyedBytes = 0;
  for (const s of history.segments) {
    if (s === selected && s.startTick < H) { s.validEndTick = H; kept.push(s); }
    else if (s.validEndTick <= H) kept.push(s);
    else { destroyedSegments += 1; destroyedBytes += s.bytes; b3.b3DestroyRecording(s.recording); }
  }
  history.segments = kept;
  return { ms:performance.now()-t0, destroyedSegments, destroyedBytes, keptSegments:kept.length, keptValidEndTicks:kept.map(s=>s.validEndTick) };
}
function remap(b3, player, ids) {
  const byId = new Map();
  for (let i = 0; i < b3.b3RecPlayer_GetBodyCount(player); i += 1) {
    const body = b3.b3RecPlayer_GetBodyId(player, i); if (!b3.b3Body_IsValid(body)) continue;
    const name = b3.b3Body_GetName(body); if (name) byId.set(name, body);
  }
  for (const id of ids) assert(byId.has(id), `remap missing ${id}`);
  return { world:b3.b3RecPlayer_GetWorldId(player), byId, ownerPlayer:player };
}
function correct(b3, pred, ids) {
  const timing = {}, total = performance.now(); let t = performance.now(); const selected = checkpoint(pred.history); timing.selectMs = performance.now()-t;
  const seekFrame = H-selected.startTick; t=performance.now(); const player = b3.b3RecPlayer_CreateFromRecording(selected.recording,0); assert(player,"RecPlayer create"); timing.createPlayerMs=performance.now()-t;
  let sim = null;
  try {
    t=performance.now(); b3.b3RecPlayer_SeekFrame(player,seekFrame); assert(b3.b3RecPlayer_GetFrame(player)===seekFrame,"seek mismatch");
    assert(!b3.b3RecPlayer_HasDiverged(player),`seek diverged ${b3.b3RecPlayer_GetDivergeFrame(player)}`); timing.seekMs=performance.now()-t;
    const invalidation = invalidate(b3,pred.history,selected); timing.invalidateHistoryMs=invalidation.ms;
    t=performance.now(); sim=remap(b3,player,ids); timing.remapMs=performance.now()-t;
    t=performance.now(); b3.b3DestroyWorld(pred.sim.world); pred.sim.world=0; timing.replaceLiveDestroyOldMs=performance.now()-t;
    const intervention=nudge(b3,sim); t=performance.now(); for(let boundary=H;boundary<CURRENT;boundary+=1) step(b3,sim); timing.replayForwardMs=performance.now()-t;
    timing.totalCorrectionMs=performance.now()-total;
    return {sim,selected:{startTick:selected.startTick,endTick:selected.endTick,validEndTick:selected.validEndTick,bytes:selected.bytes},seekFrame,invalidation,intervention,timing};
  } catch (e) { if(sim) destroy(b3,sim); else try{b3.b3RecPlayer_Destroy(player);}catch{} throw e; }
}
function cleanHistory(b3, history) { for(const s of history.segments) try{b3.b3DestroyRecording(s.recording);}catch{} history.segments=[]; }

async function one(count, repeat) {
  const b3 = await Box3D();
  const required=["b3CreateRecording","b3DestroyRecording","b3World_StartRecording","b3World_StopRecording","b3RecPlayer_CreateFromRecording","b3RecPlayer_Destroy","b3RecPlayer_SeekFrame","b3RecPlayer_GetWorldId","b3RecPlayer_GetBodyCount","b3RecPlayer_GetBodyId","b3Body_SetName","b3Body_GetName","b3DestroyWorld"];
  assert(required.every(k=>typeof b3[k]==="function"),"record/replay capability missing");
  const manifest=generateStressManifest({scenario:"ram-chain",count,seed:SEED,durationTicks:FINAL}), ids=manifest.bodies.map(b=>b.id);
  const truth=runWitness(b3,manifest,ids,true), untouched=runWitness(b3,manifest,ids,false), pred=predicted(b3,manifest,ids); let c=null;
  try {
    const uC=untouched.captures.get(CURRENT), uF=untouched.captures.get(FINAL), tC=truth.captures.get(CURRENT), tF=truth.captures.get(FINAL);
    assert(diff(pred.atCurrent,uC,ids).affectedBodies===0,"predicted baseline drift"); c=correct(b3,pred,ids);
    const cC=snapshot(b3,c.sim,ids), exactC=diff(cC,tC,ids), causalC=diff(uC,tC,ids); assert(exactC.affectedBodies===0,`correction mismatch ${JSON.stringify(exactC.firstDifference)}`);
    assert(c.seekFrame>0,`non-boundary seek not exercised: ${c.seekFrame}`); assert(c.invalidation.destroyedSegments>0,"stale future history not invalidated"); assert(causalC.affectedBodies>1,`weak causal footprint ${causalC.affectedBodies}`);
    for(let boundary=CURRENT;boundary<FINAL;boundary+=1) step(b3,c.sim); const cF=snapshot(b3,c.sim,ids), exactF=diff(cF,tF,ids), causalF=diff(uF,tF,ids);
    assert(exactF.affectedBodies===0,`future mismatch ${JSON.stringify(exactF.firstDifference)}`);
    return {count,repeat,phenomenonId:manifest.phenomenonId,chaosDNA:stressChaosDNA(manifest),seekFrame:c.seekFrame,checkpoint:c.selected,invalidation:c.invalidation,intervention:{boundary:H,deltaZ:NUDGE_Z,...c.intervention},timingMs:c.timing,hashes:{untouchedCurrent:hash(uC,ids),truthCurrent:hash(tC,ids),correctedCurrent:hash(cC,ids),untouchedFinal:hash(uF,ids),truthFinal:hash(tF,ids),correctedFinal:hash(cF,ids)},exactRecovery:{current:exactC,final:exactF},causalFootprint:{current:causalC,final:causalF}};
  } finally { if(c?.sim)destroy(b3,c.sim); cleanHistory(b3,pred.history); destroy(b3,pred.sim); destroy(b3,untouched.sim); destroy(b3,truth.sim); }
}

const cells=[];
for(const count of COUNTS){ const runs=[]; for(let repeat=1;repeat<=REPEATS;repeat+=1) runs.push(await one(count,repeat)); const a=runs[0],b=runs[1];
  assert(a.hashes.truthCurrent===b.hashes.truthCurrent&&a.hashes.truthFinal===b.hashes.truthFinal,"truth nondeterministic");
  assert(a.hashes.correctedCurrent===b.hashes.correctedCurrent&&a.hashes.correctedFinal===b.hashes.correctedFinal,"correction nondeterministic");
  assert(a.causalFootprint.current.affectedBodies===b.causalFootprint.current.affectedBodies,"footprint nondeterministic"); cells.push({count,runs}); }

console.log(JSON.stringify({verdict:"WORLD_V0_SP1C_NONBOUNDARY_SCALING_PASS",box3d:"box3d.js@0.1.1",contract:{dt:DT,substeps:SUBSTEPS,segmentTicks:SEGMENT_TICKS,retainTicks:RETAIN_TICKS,recordingInitialCapacityBytes:RECORDING_CAPACITY,scenario:"ram-chain",counts:COUNTS,seed:SEED,interventionBoundary:H,correctionBoundary:CURRENT,finalBoundary:FINAL,repeats:REPEATS},cells,claimBoundary:"isolated hosted Node correction-shock scaling evidence only; no authority, network, browser-frame, device-performance or qualified-product claim"},null,2));
