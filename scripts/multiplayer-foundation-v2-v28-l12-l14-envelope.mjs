import { readFileSync, writeFileSync } from "node:fs";

const [,, ...args] = process.argv;
if (args.length < 5) throw new Error("usage: <l12-a> <l12-b> <l14-a> <l14-b> <output>");
const [l12a,l12b,l14a,l14b,output] = args;
const NOMINAL_HOLD_TICKS = 42;

function read(path,id,lead){
  const value=JSON.parse(readFileSync(path,"utf8"));
  const hostile=value.hostile?.diagnostic || value.diagnostic?.hostile || null;
  if(!hostile) throw new Error(id+" missing hostile diagnostic");
  const commands=hostile.commandTrain?.commands || [];
  const windows=commands.map(c=>Number(c.maxTargetTickExclusive)-Number(c.startAuthorityBoundary)).filter(Number.isFinite);
  const raw=hostile.phaseError?.estimateLagTicks || [];
  const effective=hostile.phaseError?.authorshipEstimateLagTicks || raw;
  const ceilingActivations=raw.reduce((n,v,i)=>n+(Number.isFinite(v)&&Number.isFinite(effective[i])&&Math.abs(v-effective[i])>1e-6?1:0),0);
  return {
    id,lead,
    scriptVerdict:value.verdict,
    exact:hostile.guardMismatches===0 && hostile.firstStateMismatch==null,
    delivered:hostile.agencyDelivery?.delivered ?? null,
    total:hostile.agencyDelivery?.total ?? null,
    missedCommandIndexes:hostile.agencyDelivery?.missedCommandIndexes || [],
    rttMedianMs:hostile.rtt?.medianMs ?? null,
    rttP95Ms:hostile.rtt?.p95Ms ?? null,
    serverLate:hostile.serverLateDelta ?? null,
    serverRejected:hostile.serverRejectedDelta ?? null,
    ackStatus:hostile.ackStatus || {},
    authorityWindowTicks:windows,
    minAuthorityWindowTicks:windows.length?Math.min(...windows):null,
    medianAuthorityWindowTicks:windows.length?[...windows].sort((a,b)=>a-b)[Math.floor(windows.length/2)]:null,
    windowsBelowNominalHold:windows.filter(v=>v<NOMINAL_HOLD_TICKS).length,
    stallContaminated:windows.some(v=>v<NOMINAL_HOLD_TICKS),
    rawEstimateLagTicks:raw,
    authorshipEstimateLagTicks:effective,
    ceilingActivations,
    commandAck:(hostile.commandAck||[]).map(x=>({
      index:x.index,viableRecords:x.viableRecords,lateRecords:x.lateRecords,
      maxArrivalMarginTicks:x.maxArrivalMarginTicks,
      deliveredInWindow:x.deliveredInWindow
    }))
  };
}
const specimens=[
  read(l12a,"l12-a",12),read(l12b,"l12-b",12),
  read(l14a,"l14-a",14),read(l14b,"l14-b",14),
];
function group(lead){
  const rows=specimens.filter(s=>s.lead===lead);
  const clean=rows.filter(s=>!s.stallContaminated);
  return {
    allSpecimens:rows.map(s=>s.id),
    cleanSpecimens:clean.map(s=>s.id),
    stallContaminated:rows.filter(s=>s.stallContaminated).map(s=>s.id),
    exactAll:rows.every(s=>s.exact),
    delivery:rows.map(s=>`${s.delivered}/${s.total}`),
    cleanDelivery:clean.map(s=>`${s.delivered}/${s.total}`),
    rttMedianMs:rows.map(s=>s.rttMedianMs),
    serverRejected:rows.map(s=>s.serverRejected),
    tooFuture:rows.map(s=>s.ackStatus?.too_future?.records||0),
    minAuthorityWindowTicks:rows.map(s=>s.minAuthorityWindowTicks),
    ceilingActivations:rows.map(s=>s.ceilingActivations),
  };
}
const result={
  verdict:"MF6_V28_L12_L14_ENVELOPE_DISCRIMINATOR_COMPLETE",
  generatedAt:new Date().toISOString(),
  nominalHoldTicks:NOMINAL_HOLD_TICKS,
  l12:group(12),
  l14:group(14),
  specimens,
  interpretation:"Fresh-runner L12 vs L14 comparison with the same opt-in estimator ceiling. Specimens with any authority command window below the 42 ticks nominally implied by a 700 ms hold at 60 Hz are retained as F6/stall evidence but excluded from clean F4 interpretation.",
  nonClaim:"This does not select a production lead, adaptive policy or deployed-edge SLO.",
};
writeFileSync(output,JSON.stringify(result,null,2));
console.log("MF6_V28_L12_L14_ENVELOPE_DISCRIMINATOR",JSON.stringify(result));
console.log(result.verdict);
