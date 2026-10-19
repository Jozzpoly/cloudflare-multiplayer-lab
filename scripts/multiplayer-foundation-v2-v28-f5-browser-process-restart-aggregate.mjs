import { readFileSync, writeFileSync } from "node:fs";

const [,,aPath,bPath,outputPath]=process.argv;
if(!aPath||!bPath||!outputPath)throw new Error("usage: <a.json> <b.json> <output.json>");
const specimens=[JSON.parse(readFileSync(aPath,"utf8")),JSON.parse(readFileSync(bPath,"utf8"))];

function summarize(value,id){
  return {
    id,
    verdict:value.verdict,
    preCrashDwellMs:value.preCrashDwellMs??null,
    authorityResumePreflightValid:value.authorityResumePreflight?.valid===true &&
      value.authorityResumePreflight?.sameIdentity===true,
    neutralSameOrigin:value.profileStorageBeforeApp?.originMatches===true,
    neutralRecordPresent:value.profileStorageBeforeApp?.actorRecordPresent===true,
    neutralControlPresent:value.profileStorageBeforeApp?.controlMarkerPresent===true,
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
  value.authorityResumePreflightValid&&value.neutralSameOrigin&&
  value.neutralRecordPresent&&value.neutralControlPresent&&
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
else classification=summaries.every((value)=>value.preCrashDwellMs===8000)
  ?"F5_BROWSER_PROCESS_RESTART_RECOVERY_SUPPORTED_AFTER_8S_DWELL"
  :"F5_BROWSER_PROCESS_RESTART_RECOVERY_SUPPORTED_AT_RECORDED_DWELL";

const result={
  verdict:"MF6_F5_BROWSER_PROCESS_RESTART_AGGREGATE_COMPLETE",
  classification,
  generatedAt:new Date().toISOString(),
  apparatusAll,
  preCrashDwellMs:summaries.map((value)=>value.preCrashDwellMs),
  identityAll,
  exactAll,
  agencyAll,
  restoredAll,
  summaries,
  interpretation:"Two fresh-runner specimens abruptly kill Chromium after the recorded foreground dwell, keep five remote actors and authority live, restart with the same persisted profile, verify storage on a neutral same-origin page before app code, recover the exact same authoritative identity and physical state, then prove fresh canonical player agency. The result is conditional on the measured pre-crash dwell.",
  nonClaim:"The successful 8-second dwell does not erase the documented 1.5-second F5 failures (run 39180909446). This is not evidence that a brand-new localStorage token survives immediate SIGKILL. It does not qualify cross-device transfer, mobile app eviction, OS sleep/wake, permanent process loss, or return after ActorSession authority expires.",
};
writeFileSync(outputPath,JSON.stringify(result,null,2));
console.log("MF6_F5_BROWSER_PROCESS_RESTART_AGGREGATE",JSON.stringify(result));
console.log(result.verdict);
console.log("MF6_F5_BROWSER_PROCESS_RESTART_CLASSIFICATION_"+classification);
