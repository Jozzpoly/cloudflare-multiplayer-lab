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
    nativeDurableCommit:value.nativeDurableWriteConfirmed===true,
    nativeDurableBoot:value.nativeDurableBoot??null,
    strictCaptureAcknowledged:value.strictCaptureAcknowledged===true&&value.strictCaptureDurabilityHint==="strict",
    bridgeDatabasePresent:value.strictPostCrashBridge?.databaseExisted===true&&value.strictPostCrashBridge?.recordPresent===true,
    bridgeMatchesIdentity:value.strictPostCrashBridge?.matchingActor===true,
    bridgeLocalStorageAbsent:value.strictPostCrashBridge?.presentBefore===false&&value.strictPostCrashBridge?.markerBefore===false,
    bridgeRestoredFromIdb:value.strictPostCrashBridge?.bridged===true,
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
const sharedApparatusAll=summaries.every((value)=>!value.error&&
  ["protected-disconnect","half-open-lease-expired"].includes(value.crashObservation)&&
  Number.isFinite(value.authorityProgressTicks)&&value.authorityProgressTicks>60&&
  value.authorityResumePreflightValid&&value.neutralSameOrigin&&
  value.directLinkResumable&&value.persistedRecordPresent);
const strictBridgeExperiment=specimens.some((value)=>value.strictCaptureAcknowledged===true);
const nativeStrictProbe=specimens.some((value)=>value.nativeDurableWriteConfirmed===true);
const apparatusAll=sharedApparatusAll&&summaries.every((value)=>strictBridgeExperiment
  ?value.strictCaptureAcknowledged&&value.bridgeDatabasePresent&&
   value.bridgeMatchesIdentity&&value.bridgeLocalStorageAbsent&&
   value.bridgeRestoredFromIdb&&!value.neutralRecordPresent&&!value.neutralControlPresent
  :nativeStrictProbe
    ?value.nativeDurableCommit&&value.nativeDurableBoot==="hydrated"&&
     !value.neutralRecordPresent&&!value.neutralControlPresent
    :value.neutralRecordPresent&&value.neutralControlPresent);
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
else if(strictBridgeExperiment)classification=
  "F5_STRICT_IDB_ACTOR_SESSION_BRIDGED_RECOVERY_SUPPORTED_AT_RECORDED_DWELL";
else if(nativeStrictProbe)classification=
  "F5_APP_NATIVE_STRICT_IDB_RESUME_SUPPORTED_AT_RECORDED_DWELL";
else classification=summaries.every((value)=>value.preCrashDwellMs===8000)
  ?"F5_BROWSER_PROCESS_RESTART_RECOVERY_SUPPORTED_AFTER_8S_DWELL"
  :"F5_BROWSER_PROCESS_RESTART_RECOVERY_SUPPORTED_AT_RECORDED_DWELL";

const result={
  verdict:"MF6_F5_BROWSER_PROCESS_RESTART_AGGREGATE_COMPLETE",
  classification,
  generatedAt:new Date().toISOString(),
  apparatusAll,
  evidenceMode:strictBridgeExperiment?"strict-idb-assisted-probe":nativeStrictProbe?"app-native-strict-idb":"native-localstorage",
  preCrashDwellMs:summaries.map((value)=>value.preCrashDwellMs),
  identityAll,
  exactAll,
  agencyAll,
  restoredAll,
  summaries,
  interpretation:strictBridgeExperiment
    ?"Two independent real-Chromium process-death specimens lost the ActorSession and control marker in localStorage, recovered the original *private token* from a strict-committed IndexedDB record after restart on a neutral same-origin page, explicitly bridged it into the legacy client path, then proved same-identity exact MF6 recovery and fresh canonical agency. This is test-harness-assisted recovery, NOT native application recovery."
    :nativeStrictProbe
      ?"The *application's own flagged MF6 research code* committed the original private token in strict IndexedDB. After Chrome SIGKILL, the neutral same-origin check found the original localStorage record and control missing; normal app bootstrap rehydrated from IndexedDB without a CDP/Node token bridge, then authority accepted original ActorSession identity, exact six-body physics and fresh agency."
      :"Two fresh-runner specimens abruptly kill Chromium after the recorded foreground dwell, keep five remote actors and authority live, restart with the same persisted profile, verify storage on a neutral same-origin page before app code, recover the exact same authoritative identity and physical state, then prove fresh canonical player agency. The result is conditional on the measured pre-crash dwell.",
  nonClaim:strictBridgeExperiment
    ?"The real app does not yet automatically persist/read IndexedDB for Resume. A test-controlled pre-boot bridge is not production recovery. This does not qualify failure before strict-IDB commit, cross-device transfer, mobile app eviction, partitioned storage, OS sleep/wake, or recovery after authority expires."
    :nativeStrictProbe
      ?"This is a URL-flagged MF6 research-only path, NOT the default deployed or qualified 2P product. Storage denial, stale token conflicts/clear races, IndexedDB blocked upgrades, two tabs, Jaskinia embedding, actual mobile/OS eviction and failure before strict transaction complete are not qualified."
      :"The successful 8-second dwell does not erase the documented 1.5-second F5 failures (run 39180909446). This is not evidence that a brand-new localStorage token survives immediate SIGKILL. It does not qualify cross-device transfer, mobile app eviction, OS sleep/wake, permanent process loss, or return after ActorSession authority expires.",
};
writeFileSync(outputPath,JSON.stringify(result,null,2));
console.log("MF6_F5_BROWSER_PROCESS_RESTART_AGGREGATE",JSON.stringify(result));
console.log(result.verdict);
console.log("MF6_F5_BROWSER_PROCESS_RESTART_CLASSIFICATION_"+classification);
// A green CI job must mean the evidence classifier agrees with the PASS claim.
if(!apparatusAll||!identityAll||!exactAll||!agencyAll||!restoredAll)process.exitCode=1;
