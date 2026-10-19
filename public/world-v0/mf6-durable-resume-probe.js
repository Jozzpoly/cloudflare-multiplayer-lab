// Research-only MF6 durable ActorSession adapter.
// This module never grants ownership: only the world authority accepts a resumeToken.
// IDB and localStorage are NOT independent identity authorities.
import {
  WORLD_V0_SESSION_CONTINUITY_REVISION,
  readWorldV0StoredSession,
  writeWorldV0StoredSession,
} from "./session-continuity.js";

const DB_NAME="world-v0-mf6-durable-resume-probe-v1";
const STORE_NAME="actors";
const RUN=/^[A-Za-z0-9_-]{1,20}$/;

export function mf6DurableResumeProbeEnabled(search=globalThis.location?.search||""){
  const query=new URLSearchParams(search);
  return query.get("lifecycle")==="mf6" && query.get("mf6DurableResumeProbe")==="1";
}

function openStore(factory=globalThis.indexedDB){
  if(!factory) return Promise.reject(new Error("idb-unavailable"));
  return new Promise((resolve,reject)=>{
    let request;
    try{request=factory.open(DB_NAME,1);}
    catch{reject(new Error("idb-open-unavailable"));return;}
    request.onupgradeneeded=()=>request.result.createObjectStore(STORE_NAME);
    request.onblocked=()=>reject(new Error("idb-blocked"));
    request.onerror=()=>reject(new Error("idb-open-failed"));
    request.onsuccess=()=>resolve(request.result);
  });
}

function validRecord(raw,runKey){
  if(!raw||raw.kind!=="actor"||raw.runKey!==runKey||!RUN.test(runKey))return null;
  // Delegate record normalization, slot bound, format and revision to the
  // existing session-continuity code rather than inventing a second parser.
  const storage={
    getItem:()=>JSON.stringify({
      revision:WORLD_V0_SESSION_CONTINUITY_REVISION,
      sessions:{[runKey]:raw.record},
    }),
    setItem:()=>{},
    removeItem:()=>{},
  };
  return readWorldV0StoredSession(runKey,storage);
}

export async function mf6StoreDurableActorSession(record){
  const normalized=validRecord({kind:"actor",runKey:record?.runKey,record},record?.runKey);
  if(!normalized)return {committed:false,reason:"invalid-record"};
  let db;
  try{
    db=await openStore();
    const committed=await new Promise((resolve,reject)=>{
      let tx;
      try{tx=db.transaction(STORE_NAME,"readwrite",{durability:"strict"});}
      catch{reject(new Error("strict-transaction-unavailable"));return;}
      if(tx.durability!=="strict"){reject(new Error("strict-durability-not-confirmed"));try{tx.abort();}catch{}return;}
      tx.objectStore(STORE_NAME).put({kind:"actor",runKey:record.runKey,record:normalized},record.runKey);
      tx.oncomplete=()=>resolve(true);
      tx.onerror=()=>reject(new Error("strict-transaction-error"));
      tx.onabort=()=>reject(new Error("strict-transaction-aborted"));
    });
    return {committed,reason:"strict-complete"};
  }catch(error){
    return {committed:false,reason:String(error?.message||"idb-unavailable")};
  }finally{try{db?.close();}catch{}}
}

export async function mf6ReadDurableActorSession(runKey){
  if(!RUN.test(String(runKey||"")))return null;
  let db;
  try{
    db=await openStore();
    const raw=await new Promise((resolve,reject)=>{
      const tx=db.transaction(STORE_NAME,"readonly");
      const req=tx.objectStore(STORE_NAME).get(runKey);
      req.onsuccess=()=>resolve(req.result??null);
      req.onerror=()=>reject(new Error("idb-read-failed"));
    });
    return validRecord(raw,runKey);
  }catch{return null;}
  finally{try{db?.close();}catch{}}
}

export async function mf6ClearDurableActorSession(runKey,worldEpoch){
  if(!RUN.test(String(runKey||"")))return false;
  let db;
  try{
    db=await openStore();
    return await new Promise((resolve,reject)=>{
      const tx=db.transaction(STORE_NAME,"readwrite",{durability:"strict"});
      const store=tx.objectStore(STORE_NAME);
      let changed=false;
      const req=store.get(runKey);
      req.onsuccess=()=>{
        const present=validRecord(req.result,runKey);
        if(present&&(!worldEpoch||present.worldEpoch===worldEpoch)){
          store.put({kind:"cleared",runKey,worldEpoch:present.worldEpoch},runKey);
          changed=true;
        }
      };
      tx.oncomplete=()=>resolve(changed);
      tx.onerror=()=>reject(new Error("idb-clear-failed"));
      tx.onabort=()=>reject(new Error("idb-clear-aborted"));
    });
  }catch{return false;}
  finally{try{db?.close();}catch{}}
}

export async function mf6HydrateDurableResumeOnBoot(search=globalThis.location?.search||""){
  if(!mf6DurableResumeProbeEnabled(search))return {mode:"inactive"};
  const run=new URLSearchParams(search).get("run")||"";
  if(!RUN.test(run))return {mode:"no-run"};
  // Never silently overwrite a different local owner / epoch. An ambiguous
  // conflict requires explicit authority resolution rather than last-write-wins.
  if(readWorldV0StoredSession(run))return {mode:"local-existing"};
  const record=await mf6ReadDurableActorSession(run);
  if(!record)return {mode:"no-durable-record"};
  const saved=writeWorldV0StoredSession(record);
  return {mode:saved?"hydrated":"local-storage-unavailable"};
}
