import { readFileSync, writeFileSync } from "node:fs";

const [,,aPath,bPath,outputPath]=process.argv;
if(!aPath||!bPath||!outputPath)throw new Error("usage: <a.json> <b.json> <output.json>");
const specimens=[JSON.parse(readFileSync(aPath,"utf8")),JSON.parse(readFileSync(bPath,"utf8"))];

function summarize(value,id){
  return {
    id,
    verdict:value.verdict,
    error:value.error||null,
    identityPreserved:value.identity?.preserved===true,
    crashObservation:value.crash?.authorityObservation||null,
    authorityProgressTicks:value.crash?.authorityProgressTicks??null,
    directLinkResumable:value.resumeOffer?.directLinkResumable===true,
    persistedRecordPresent:value.resumeOffer?.persistedRecordPresent===true,
    recoveryGuardMismatches:value.recovery?.guardMismatches??null,
    recoveryFirstStateMismatch:value.recovery?.firstStateMismatch??null,
    recoveryRebases:value.recovery?.rebases??null,
    recoveryNetworkState:value.recovery?.networkState??null,
    postRestartAgencyWitness:value.postRestartAgency?.witness||null,
    finalGuardMismatches:value.final?.guardMismatches??null,
    finalConnectedPlayers:value.final?.authorityConnectedPlayers??null,
    finalActorCount:value.final?.actorCount??null,
  };
}

const summaries=specimens.map((value,index)=>summarize(value,index===0?"a":"b"));
const apparatusAll=summaries.every((value)=>!value.error&&
  ["protected-disconnect","half-open-lease-expired"].includes(value.crashObservation)&&
  Number.isFinite(value.authorityProgressTicks)&&value.authorityProgressTicks>60&&
  value.directLinkResumable&&value.persistedRecordPresent);
const identityAll=summaries.every((value)=>value.identityPreserved);
const exactAll=summaries.every((value)=>
  value.recoveryGuardMismatches===0&&
  value.recoveryFirstStateMismatch==null&&
  value.finalGuardMismatches===0);
const agencyAll=summaries.every((value)=>Boolean(value.postRestartAgencyWitness));
const restoredAll=summaries.every((value)=>value.finalConnectedPlayers===6&&value.finalActorCount===6);

let classification="F5_BROWSER_PROCESS_RESTART_MIXED";
if(!apparatusAll)classification="F5_BROWSER_PROCESS_RESTART_APPARATUS_RED";
else if(!identityAll||!exactAll||!agencyAll||!restoredAll)classification="F5_BROWSER_PROCESS_RESTART_RECOVERY_RED";
else classification="F5_BROWSER_PROCESS_RESTART_RECOVERY_SUPPORTED";

const result={
  verdict:"MF6_F5_BROWSER_PROCESS_RESTART_AGGREGATE_COMPLETE",
  classification,
  generatedAt:new Date().toISOString(),
  apparatusAll,
  identityAll,
  exactAll,
  agencyAll,
  restoredAll,
  summaries,
  interpretation:"Two fresh-runner specimens abruptly kill Chromium, keep five remote actors and authority live, restart Chromium on the same persisted browser profile, require an authority-backed direct Resume offer, exact same-identity recovery, restored six-actor topology and fresh authority-consumed player agency.",
  nonClaim:"This does not qualify cross-device transfer, mobile app eviction, OS sleep/wake, permanent process loss, or restart after ActorSession authority reservation expires.",
};
writeFileSync(outputPath,JSON.stringify(result,null,2));
console.log("MF6_F5_BROWSER_PROCESS_RESTART_AGGREGATE",JSON.stringify(result));
console.log(result.verdict);
console.log("MF6_F5_BROWSER_PROCESS_RESTART_CLASSIFICATION_"+classification);
