import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
function assert(v,m){if(!v)throw new Error(m);}
function chrome(){const o=process.env.CHROME_BIN?.trim();if(o)return o;const p=spawnSync("bash",["-lc","command -v google-chrome || command -v google-chrome-stable || command -v chromium || command -v chromium-browser"],{encoding:"utf8"});const b=p.stdout.trim().split("\n")[0];if(!b)throw new Error("Chrome not found");return b;}
class Cdp{constructor(url){this.ws=new WebSocket(url);this.next=1;this.pending=new Map();this.opened=new Promise((res,rej)=>{this.ws.addEventListener("open",res,{once:true});this.ws.addEventListener("error",()=>rej(new Error("CDP open failed")),{once:true});});this.ws.addEventListener("message",async e=>{const raw=typeof e.data==="string"?e.data:await e.data.text();const m=JSON.parse(raw);if(!m.id)return;const w=this.pending.get(m.id);if(!w)return;this.pending.delete(m.id);m.error?w.rej(new Error(w.method+": "+m.error.message)):w.res(m.result||{});});}async call(method,params={},sessionId){await this.opened;const id=this.next++;return await new Promise((res,rej)=>{this.pending.set(id,{res,rej,method});const p={id,method,params};if(sessionId)p.sessionId=sessionId;this.ws.send(JSON.stringify(p));});}async eval(s,e){const r=await this.call("Runtime.evaluate",{expression:e,awaitPromise:true,returnByValue:true,userGesture:true},s);if(r.exceptionDetails){const detail=r.exceptionDetails.exception?.description||r.exceptionDetails.exception?.value||r.exceptionDetails.text||"eval failed";throw new Error(String(detail));}return r.result?.value;}close(){try{this.ws.close();}catch{}}}
async function debuggerUrl(port){const d=Date.now()+20000;while(Date.now()<d){try{const r=await fetch("http://127.0.0.1:"+port+"/json/version");if(r.ok){const j=await r.json();if(j.webSocketDebuggerUrl)return j.webSocketDebuggerUrl;}}catch{}await sleep(100);}throw new Error("debugger unavailable");}
async function waitFor(c,s,e,l,t=30000){const d=Date.now()+t;let last=null;while(Date.now()<d){try{last=await c.eval(s,e);if(last)return last;}catch(x){last=x instanceof Error?x.message:String(x);}await sleep(100);}throw new Error(l+" timeout "+JSON.stringify(last));}
async function page(c,url){const q=await c.call("Target.createTarget",{url});const a=await c.call("Target.attachToTarget",{targetId:q.targetId,flatten:true});await c.call("Runtime.enable",{},a.sessionId);await c.call("Page.enable",{},a.sessionId);await waitFor(c,a.sessionId,'document.readyState==="complete" && document.querySelector("#enter")?.disabled===false && typeof window.__sharedYardV0Evidence==="function"',"boot");return{targetId:q.targetId,sessionId:a.sessionId};}
async function pageWithInit(c,url,source){const q=await c.call("Target.createTarget",{url:"about:blank"});const a=await c.call("Target.attachToTarget",{targetId:q.targetId,flatten:true});await c.call("Runtime.enable",{},a.sessionId);await c.call("Page.enable",{},a.sessionId);await c.call("Page.addScriptToEvaluateOnNewDocument",{source},a.sessionId);await c.call("Page.navigate",{url},a.sessionId);await waitFor(c,a.sessionId,'document.readyState==="complete" && document.querySelector("#enter")?.disabled===false && typeof window.__sharedYardV0Evidence==="function"',"boot");return{targetId:q.targetId,sessionId:a.sessionId};}
async function enter(c,p,name){await c.eval(p.sessionId,'(() => { const i=document.querySelector("#callsign"); i.value='+JSON.stringify(name)+'; i.dispatchEvent(new Event("input",{bubbles:true})); document.querySelector("#enter").click(); return true; })()');await waitFor(c,p.sessionId,'(() => { const e=window.__sharedYardV0Evidence?.(); return e && !e.runtimeFailed && e.networkState?.startsWith("live") && e.localBoundaryTick>(e.protocolStartTick??0)+20; })()',"live",45000);}
async function closePage(c,p){try{await c.call("Target.closeTarget",{targetId:p.targetId});}catch{}await sleep(250);}

const BASE=(process.env.MW_WORLD_V0_PRIVATE_REBIND_BASE||"http://127.0.0.1:8787").replace(/\/$/,"");
const OUTPUT=process.env.MW_WORLD_V0_PRIVATE_REBIND_OUTPUT||"world-v0-private-rebind.json";
const suffix=Date.now().toString(36).slice(-5);
const runLive=("private-live-"+suffix).slice(0,20);
const runClose=("private-close-"+suffix).slice(0,20);
const runStale=("private-stale-"+suffix).slice(0,20);
const runForeign=("private-none-"+suffix).slice(0,20);
const PORT=9903, profile=mkdtempSync(join(tmpdir(),"mw-private-rebind-")), bin=chrome();
const child=spawn(bin,["--headless=new","--no-sandbox","--disable-dev-shm-usage","--disable-background-timer-throttling","--disable-backgrounding-occluded-windows","--disable-renderer-backgrounding","--remote-debugging-port="+PORT,"--remote-debugging-address=127.0.0.1","--user-data-dir="+profile,"about:blank"],{stdio:["ignore","ignore","pipe"]});
let c=null; const result={verdict:"WORLD_V0_PRIVATE_PROFILE_REBIND_FAIL",generatedAt:new Date().toISOString()};
try{
 c=new Cdp(await debuggerUrl(PORT));await c.opened;
 const liveUrl=BASE+"/world-v0/?run="+runLive+"&lifecycle=r0";
 const p1=await page(c,liveUrl);await enter(c,p1,"PrivateOwner");
 const e1=await c.eval(p1.sessionId,"window.__sharedYardV0Evidence()");
 const p2=await page(c,liveUrl);
 const offerLive=await c.eval(p2.sessionId,"window.__sharedYardV0FriendEntry()");
 result.liveOffer=offerLive;
 assert(offerLive.directLinkResumable===true,"same-profile live private link not offered Resume");
 assert(offerLive.enterLabel==="Resume world","same-profile live private link label is not Resume world");
 await c.eval(p2.sessionId,'document.querySelector("#enter").click()');
 await waitFor(c,p2.sessionId,'(() => { const e=window.__sharedYardV0Evidence?.(); return e && !e.runtimeFailed && e.networkState?.startsWith("live") && e.session?.actorSessionId==='+JSON.stringify(e1.session.actorSessionId)+' && e.lifecycle?.topology?.actors?.length===1 && e.metrics?.guardMismatches===0; })()',"live private rebound");
 const e2=await c.eval(p2.sessionId,"window.__sharedYardV0Evidence()");
 assert(e2.lifecycle.topology.actors.length===1,"live private rebound created extra actor");
 await closePage(c,p1);await closePage(c,p2);

 const closeUrl=BASE+"/world-v0/?run="+runClose+"&lifecycle=r0";
 const p3=await page(c,closeUrl);await enter(c,p3,"PrivateOwner");
 const e3=await c.eval(p3.sessionId,"window.__sharedYardV0Evidence()");
 await closePage(c,p3);
 const p4=await page(c,closeUrl);
 const offerClose=await c.eval(p4.sessionId,"window.__sharedYardV0FriendEntry()");
 result.closeOffer=offerClose;
 assert(offerClose.directLinkResumable===true,"closed private link not offered Resume");
 await c.eval(p4.sessionId,'document.querySelector("#enter").click()');
 await waitFor(c,p4.sessionId,'(() => { const e=window.__sharedYardV0Evidence?.(); return e && !e.runtimeFailed && e.networkState?.startsWith("live") && e.session?.actorSessionId==='+JSON.stringify(e3.session.actorSessionId)+' && e.lifecycle?.topology?.actors?.length===1 && e.metrics?.guardMismatches===0; })()',"closed private rebound");
 const e4=await c.eval(p4.sessionId,"window.__sharedYardV0Evidence()");
 assert(e4.identity.worldEpoch===e3.identity.worldEpoch,"closed private rebound rotated epoch");
 assert(e4.session.selfNetEntityId===e3.session.selfNetEntityId,"closed private rebound changed entity");
 assert(e4.lifecycle.topology.actors.length===1,"closed private rebound left shell actor");
 await closePage(c,p4);

 const staleUrl=BASE+"/world-v0/?run="+runStale+"&lifecycle=r0";
 const p5=await page(c,staleUrl);await enter(c,p5,"PrivateOwner");
 const staleSeed=await c.eval(p5.sessionId,"window.__sharedYardV0Evidence()");
 const corruptTokenSource=`(() => {
   const key="shared-yard-v0-actor-sessions-v1";
   const parsed=JSON.parse(localStorage.getItem(key)||"{}");
   if (parsed.sessions && parsed.sessions[${JSON.stringify(runStale)}]) {
     parsed.sessions[${JSON.stringify(runStale)}].resumeToken="definitely-invalid-private-resume-token";
     localStorage.setItem(key,JSON.stringify(parsed));
   }
 })();`;
 const p6=await pageWithInit(c,staleUrl,corruptTokenSource);
 const staleOffer=await c.eval(p6.sessionId,'({entry:window.__sharedYardV0FriendEntry(),stored:JSON.parse(localStorage.getItem("shared-yard-v0-actor-sessions-v1")||"{}")})');
 result.staleOffer=staleOffer.entry;
 assert(staleOffer.entry.directLinkResumable===false,"invalid private token was offered Resume");
 assert(!staleOffer.stored.sessions?.[runStale],"invalid private ActorSession record was not cleared after authority rejection");
 const staleStillLive=await c.eval(p5.sessionId,"window.__sharedYardV0Evidence()");
 assert(staleStillLive.session.actorSessionId===staleSeed.session.actorSessionId,"invalid-token probe disturbed live authority owner");
 await closePage(c,p6);await closePage(c,p5);

 const foreignUrl=BASE+"/world-v0/?run="+runForeign+"&lifecycle=r0";
 const p7=await page(c,foreignUrl);await enter(c,p7,"PrivateOwner");
 const noRecordSource=`localStorage.removeItem("shared-yard-v0-actor-sessions-v1"); sessionStorage.clear();`;
 const p8=await pageWithInit(c,foreignUrl,noRecordSource);
 const foreignOffer=await c.eval(p8.sessionId,"window.__sharedYardV0FriendEntry()");
 result.noLocalAuthorityOffer=foreignOffer;
 assert(foreignOffer.directLinkResumable===false,"private link without local resume authority was offered Resume");
 await closePage(c,p8);await closePage(c,p7);

 Object.assign(result,{verdict:"WORLD_V0_PRIVATE_PROFILE_REBIND_PASS",live:{session:e2.session.actorSessionId,topology:e2.lifecycle.topology.revision},closed:{session:e4.session.actorSessionId,topology:e4.lifecycle.topology.revision}});
 console.log(result.verdict,JSON.stringify(result));
}catch(error){result.error=error instanceof Error?error.stack||error.message:String(error);console.error(result.error);process.exitCode=1;}finally{writeFileSync(OUTPUT,JSON.stringify(result,null,2));c?.close();if(child.exitCode===null)child.kill("SIGKILL");try{rmSync(profile,{recursive:true,force:true});}catch{}}
