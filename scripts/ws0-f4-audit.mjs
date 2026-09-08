import { readFileSync } from "node:fs";

const f4=JSON.parse(readFileSync(process.env.WS0_F4_OUTPUT||"ws0-f4-bounded-scheduled-history.json","utf8"));
const id=JSON.parse(readFileSync(process.env.WS0_F4_IDENTITY_OUTPUT||"ws0-f4-identity-lifecycle.json","utf8"));
const TOL=1e-6;
const expected={
  measured65:{peer:9,self:0.1313939620800649,relay:0.19328622369140705},
  measured85:{peer:11,self:0.18498999159256818,relay:0.27709812671844913},
  hol85:{peer:13,self:0.1313939620800649,relay:0.19328622369140705},
};
function maxResidual(r){return Math.max(r.actorPosition,r.relayPosition,r.relayVelocity,r.relayRotation);}

if(f4.revision!=="ws0-f4-bounded-scheduled-history-v1")throw new Error("unexpected F4 revision");
if(f4.verdict!=="F4A_BOUNDED_HISTORY_AND_F4B_OVERLAP_QUALIFIED")throw new Error("F4 apparatus did not qualify");
for(const trace of f4.traces){
  const e=expected[trace.trace];
  if(!e)throw new Error(`unexpected trace ${trace.trace}`);
  if(trace.measured.horizonMax!==e.peer)throw new Error(`${trace.trace}: horizon drift`);
  if(Math.abs(trace.measured.selfMax-e.self)>1e-5)throw new Error(`${trace.trace}: self correction drift`);
  if(Math.abs(trace.measured.relayMax-e.relay)>1e-5)throw new Error(`${trace.trace}: relay correction drift`);
  if(maxResidual(trace.authority.sourceResidual)>TOL)throw new Error(`${trace.trace}: authority source residual`);
  for(const client of trace.clients){
    if(client.maxReferenceResidual>TOL)throw new Error(`${trace.trace}/${client.selfId}: bounded != reference`);
    if(maxResidual(client.finalAuthorityResidual)>TOL)throw new Error(`${trace.trace}/${client.selfId}: final != authority`);
    if(client.history.maxTotalReplaySteps>21)throw new Error(`${trace.trace}/${client.selfId}: >21 replay steps`);
    if(client.history.maxCheckpointAgeTicks>21)throw new Error(`${trace.trace}/${client.selfId}: checkpoint age >21 ticks`);
    if(client.history.remapFailures!==0)throw new Error(`${trace.trace}/${client.selfId}: remap failures`);
  }
}
if(f4.overlap.secondCorrectionSelectedGeneration<1)throw new Error("overlap C2 did not use corrected history");
if(maxResidual(f4.overlap.finalOracleResidual)>TOL)throw new Error("overlap final != clean oracle");

if(id.revision!=="ws0-f4-identity-lifecycle-v1")throw new Error("unexpected identity revision");
if(!id.firstGeneration.holesAfterDestroy.includes(id.firstGeneration.oldOrdinal))throw new Error("destroy hole missing");
if(id.firstGeneration.newOrdinal===id.firstGeneration.oldOrdinal)throw new Error("creation ordinal reused within generation");
if(id.secondGeneration.newOrdinal===id.firstGeneration.newOrdinal)throw new Error("fresh generation did not demonstrate ordinal rebinding");
if(id.secondGeneration.holesAtSeed.length!==0)throw new Error("fresh seed unexpectedly carried historical creation holes");

console.log("F4 INDEPENDENT AUDIT PASS");
for(const trace of f4.traces){
  const maxReplay=Math.max(...trace.clients.map(c=>c.history.maxTotalReplaySteps));
  const maxBytes=Math.max(...trace.clients.map(c=>c.history.maxRetainedBytes));
  console.log(`${trace.trace.padEnd(10)} horizon=${trace.measured.horizonMax} maxReplay=${maxReplay} retained<=${maxBytes}B`);
}
console.log(`identity gen0 newOrdinal=${id.firstGeneration.newOrdinal} -> gen1 seedOrdinal=${id.secondGeneration.newOrdinal}`);
