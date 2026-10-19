import assert from "node:assert/strict";
import {planWorldV0VisibleRemotes, WORLD_V0_VISIBLE_ACTOR_ROSTER_REVISION} from "../public/world-v0/visible-actor-roster.js";

const actors=Array.from({length:6},(_,slot)=>({sessionId:"session-"+slot,netEntityId:"actor:"+slot,slot}));
const topology=(entries)=>({actors:entries});
const ids=(entries)=>entries.map(a=>a.sessionId);
const plan=(entries,bodies,rendered)=>planWorldV0VisibleRemotes(topology(entries),"session-5",bodies,rendered);
assert.equal(WORLD_V0_VISIBLE_ACTOR_ROSTER_REVISION,"mf6-visible-actor-roster-v1");

const six=plan(actors,ids(actors),[]);
assert.equal(six.remoteActors.length,5);
assert.deepEqual(six.createSessionIds,ids(actors.slice(0,5)));
assert.deepEqual(six.removeSessionIds,[]);
assert.deepEqual(plan(actors,ids(actors),six.createSessionIds).createSessionIds,[]);

const one=plan([actors[5]],["session-5"],ids(actors.slice(0,5)));
assert.deepEqual(one.remoteActors,[]);
assert.deepEqual(one.removeSessionIds,ids(actors.slice(0,5)));

const withoutBody=plan(actors,ids(actors).filter(s=>s!=="session-2"),ids(actors.slice(0,5)));
assert.deepEqual(withoutBody.removeSessionIds,["session-2"]);

const replacement={sessionId:"session-6",netEntityId:"actor:6",slot:2};
const churn=plan([...actors.slice(0,2),replacement,...actors.slice(3)],
  [...ids(actors).filter(s=>s!=="session-2"),"session-6"],
  ids(actors.slice(0,5)));
assert.deepEqual(churn.removeSessionIds,["session-2"]);
assert.deepEqual(churn.createSessionIds,["session-6"]);
assert.equal(churn.remoteActors.find(a=>a.sessionId==="session-6")?.netEntityId,"actor:6");
assert.ok(!churn.remoteActors.some(a=>a.sessionId==="session-2"));

for (const bad of [
  [...actors.slice(0,5),actors[0]],
  [{...actors[0],slot:6},...actors.slice(1)],
  [...actors.slice(0,5)],
]) assert.throws(()=>plan(bad,ids(actors),[]));
assert.throws(()=>plan([...actors,{...actors[0],sessionId:"x"}],ids(actors),[]));
assert.throws(()=>plan(actors,ids(actors),null));

console.log("MF6_VISIBLE_ACTOR_ROSTER_SMOKE_PASS",JSON.stringify({
  fullPresence:six.remoteActors.length+1,
  churnRemove:churn.removeSessionIds.length,
  churnAdd:churn.createSessionIds.length,
  noGhostAfterSolo:one.removeSessionIds.length,
}));
