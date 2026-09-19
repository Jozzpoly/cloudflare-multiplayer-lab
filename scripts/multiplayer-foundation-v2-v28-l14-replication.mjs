import { readFileSync, writeFileSync } from "node:fs";
const [,, ...args]=process.argv;
if(args.length<5) throw new Error("usage: <a> <b> <c> <d> <output>");
const [a,b,c,d,output]=args;
const NOMINAL_HOLD_TICKS=42;
function read(path,id){
  const value=JSON.parse(readFileSync(path,"utf8"));
  const h=value.hostile?.diagnostic || value.diagnostic?.hostile || null;
  if(!h) throw new Error(id+" missing hostile diagnostic");
  const commands=h.commandTrain?.commands||[];
  const windows=commands.map(c=>Number(c.maxTargetTickExclusive)-Number(c.startAuthorityBoundary)).filter(Number.isFinite);
  const raw=h.phaseError?.estimateLagTicks||[];
  const eff=h.phaseError?.authorshipEstimateLagTicks||raw;
  return {
    id,
    scriptVerdict:value.verdict,
    exact:h.guardMismatches===0&&h.firstStateMismatch==null,
    delivered:h.agencyDelivery?.delivered??null,
    total:h.agencyDelivery?.total??null,
    missedCommandIndexes:h.agencyDelivery?.missedCommandIndexes||[],
    rttMedianMs:h.rtt?.medianMs??null,
    rttP95Ms:h.rtt?.p95Ms??null,
    serverLate:h.serverLateDelta??null,
    serverRejected:h.serverRejectedDelta??null,
    ackStatus:h.ackStatus||{},
    authorityWindowTicks:windows,
    minAuthorityWindowTicks:windows.length?Math.min(...windows):null,
    medianAuthorityWindowTicks:windows.length?[...windows].sort((x,y)=>x-y)[Math.floor(windows.length/2)]:null,
    windowsBelowNominalHold:windows.filter(v=>v<NOMINAL_HOLD_TICKS).length,
    stallContaminated:windows.some(v=>v<NOMINAL_HOLD_TICKS),
    rawEstimateLagTicks:raw,
    authorshipEstimateLagTicks:eff,
    ceilingActivations:raw.reduce((n,v,i)=>n+(Number.isFinite(v)&&Number.isFinite(eff[i])&&Math.abs(v-eff[i])>1e-6?1:0),0),
    commandAck:(h.commandAck||[]).map(x=>({
      index:x.index,viableRecords:x.viableRecords,lateRecords:x.lateRecords,
      maxArrivalMarginTicks:x.maxArrivalMarginTicks,deliveredInWindow:x.deliveredInWindow
    }))
  };
}
const specimens=[read(a,"l14-a"),read(b,"l14-b"),read(c,"l14-c"),read(d,"l14-d")];
const clean=specimens.filter(s=>!s.stallContaminated);
const result={
  verdict:"MF6_V28_L14_REPLICATION_COMPLETE",
  generatedAt:new Date().toISOString(),
  nominalHoldTicks:NOMINAL_HOLD_TICKS,
  cleanSpecimens:clean.map(s=>s.id),
  stallContaminated:specimens.filter(s=>s.stallContaminated).map(s=>s.id),
  exactAll:specimens.every(s=>s.exact),
  cleanPerfect:clean.filter(s=>s.delivered===8).length,
  cleanTotal:clean.length,
  delivery:specimens.map(s=>`${s.delivered}/${s.total}`),
  rttMedianMs:specimens.map(s=>s.rttMedianMs),
  serverRejected:specimens.map(s=>s.serverRejected),
  tooFuture:specimens.map(s=>s.ackStatus?.too_future?.records||0),
  minAuthorityWindowTicks:specimens.map(s=>s.minAuthorityWindowTicks),
  ceilingActivations:specimens.map(s=>s.ceilingActivations),
  specimens,
  interpretation:"Four fresh-runner L14 specimens under the same 100ms+25ms shaped-TCP profile and opt-in legal-window ceiling. Stall-contaminated specimens are retained as F6 evidence but not counted in clean F4 replication.",
  nonClaim:"This does not select L14 as production policy.",
};
writeFileSync(output,JSON.stringify(result,null,2));
console.log("MF6_V28_L14_REPLICATION",JSON.stringify(result));
console.log(result.verdict);
