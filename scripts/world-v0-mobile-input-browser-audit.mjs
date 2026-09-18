import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const BASE=(process.env.MW_WORLD_V0_MOBILE_INPUT_BASE||"http://127.0.0.1:8787").replace(/\/$/,"");
const OUTPUT=process.env.MW_WORLD_V0_MOBILE_INPUT_OUTPUT||"world-v0-mobile-input.json";
const PORT=9981;
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
function assert(v,m){if(!v)throw new Error(m);}
function findChrome(){const o=process.env.CHROME_BIN?.trim();if(o)return o;const p=spawnSync("bash",["-lc","command -v google-chrome || command -v google-chrome-stable || command -v chromium || command -v chromium-browser"],{encoding:"utf8"});const b=p.stdout.trim().split("\n")[0];if(!b)throw new Error("Chrome not found");return b;}
class Cdp{constructor(url){this.ws=new WebSocket(url);this.next=1;this.pending=new Map();this.opened=new Promise((res,rej)=>{this.ws.addEventListener("open",res,{once:true});this.ws.addEventListener("error",()=>rej(new Error("CDP open failed")),{once:true});});this.ws.addEventListener("message",async e=>{const raw=typeof e.data==="string"?e.data:await e.data.text();const m=JSON.parse(raw);if(!m.id)return;const w=this.pending.get(m.id);if(!w)return;this.pending.delete(m.id);m.error?w.rej(new Error(w.method+": "+m.error.message)):w.res(m.result||{});});}async call(method,params={},sessionId){await this.opened;const id=this.next++;return await new Promise((res,rej)=>{this.pending.set(id,{res,rej,method});const p={id,method,params};if(sessionId)p.sessionId=sessionId;this.ws.send(JSON.stringify(p));});}async eval(s,e){const r=await this.call("Runtime.evaluate",{expression:e,awaitPromise:true,returnByValue:true,userGesture:true},s);if(r.exceptionDetails){const d=r.exceptionDetails.exception?.description||r.exceptionDetails.text||"eval failed";throw new Error(String(d));}return r.result?.value;}close(){try{this.ws.close();}catch{}}}
async function debuggerUrl(){const d=Date.now()+20000;while(Date.now()<d){try{const r=await fetch("http://127.0.0.1:"+PORT+"/json/version");if(r.ok){const j=await r.json();if(j.webSocketDebuggerUrl)return j.webSocketDebuggerUrl;}}catch{}await sleep(100);}throw new Error("debugger unavailable");}
async function waitFor(c,s,e,l,t=30000){const d=Date.now()+t;let last=null;while(Date.now()<d){try{last=await c.eval(s,e);if(last)return last;}catch(x){last=x instanceof Error?x.message:String(x);}await sleep(80);}throw new Error(l+" timeout "+JSON.stringify(last));}
async function touch(c,s,type,x,y){await c.call("Input.dispatchTouchEvent",{type,touchPoints:type==="touchEnd"?[]:[{x,y,radiusX:4,radiusY:4,force:1,id:1}]},s);}
function dist(a,b){return Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);}

const suffix=Date.now().toString(36).slice(-6);
const url=BASE+"/world-v0/?run="+encodeURIComponent(("mobile-"+suffix).slice(0,20))+"&lifecycle=r0";
const profile=mkdtempSync(join(tmpdir(),"mw-mobile-input-")),bin=findChrome();
const child=spawn(bin,["--headless=new","--no-sandbox","--disable-dev-shm-usage","--disable-background-timer-throttling","--disable-backgrounding-occluded-windows","--disable-renderer-backgrounding","--remote-debugging-port="+PORT,"--remote-debugging-address=127.0.0.1","--user-data-dir="+profile,"about:blank"],{stdio:["ignore","ignore","pipe"]});
let c=null,s=null;
const result={verdict:"WORLD_V0_MOBILE_INPUT_FAIL",generatedAt:new Date().toISOString()};
try{
 c=new Cdp(await debuggerUrl());await c.opened;
 const q=await c.call("Target.createTarget",{url:"about:blank"});s=(await c.call("Target.attachToTarget",{targetId:q.targetId,flatten:true})).sessionId;
 await c.call("Runtime.enable",{},s);await c.call("Page.enable",{},s);
 await c.call("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:2,mobile:true,screenWidth:390,screenHeight:844},s);
 await c.call("Emulation.setTouchEmulationEnabled",{enabled:true,maxTouchPoints:5},s);
 await c.call("Page.navigate",{url},s);
 await waitFor(c,s,'document.readyState==="complete" && document.querySelector("#enter")?.disabled===false && typeof window.__sharedYardV0Evidence==="function"',"mobile boot");
 await c.eval(s,'(() => { const i=document.querySelector("#callsign"); i.value="MobileOwner"; i.dispatchEvent(new Event("input",{bubbles:true})); document.querySelector("#enter").click(); return true; })()');
 await waitFor(c,s,'(() => { const e=window.__sharedYardV0Evidence?.(); return e && !e.runtimeFailed && e.networkState?.startsWith("live") && e.lifecycle?.topology?.actors?.length===1 && e.metrics?.guardMismatches===0 && getComputedStyle(document.querySelector("#joystick")).display!=="none"; })()',"mobile live",45000);
 const before=await c.eval(s,'window.__sharedYardV0Evidence()');
 const boxes=await c.eval(s,'(() => { const box=(sel)=>{const r=document.querySelector(sel).getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2,w:r.width,h:r.height}}; return {joy:box("#joystick"),gimbal:box("#camera-gimbal"),jump:box("#jump-button")}; })()');

 await touch(c,s,"touchStart",boxes.joy.x,boxes.joy.y);
 await touch(c,s,"touchMove",boxes.joy.x,boxes.joy.y-Math.min(42,boxes.joy.h*0.32));
 await waitFor(c,s,'(() => { const r=window.__sharedYardV0Evidence?.()?.presentation?.rawInput; return r && Math.hypot(r.x,r.z)>0.4; })()',"joystick raw input");
 assert(Array.isArray(before.livePhysics.selfPosition),"mobile live evidence missing self position");
 const startPosition=before.livePhysics.selfPosition;
 await waitFor(c,s,`(() => {
   const p=window.__sharedYardV0Evidence?.()?.livePhysics?.selfPosition;
   const a=${JSON.stringify(startPosition)};
   return Array.isArray(p) && Math.hypot(p[0]-a[0],p[1]-a[1],p[2]-a[2])>0.08;
 })()`,"touch joystick actor motion",5000);
 const moving=await c.eval(s,'window.__sharedYardV0Evidence()');
 await touch(c,s,"touchEnd",boxes.joy.x,boxes.joy.y);
 await waitFor(c,s,'(() => { const r=window.__sharedYardV0Evidence?.()?.presentation?.rawInput; return r && Math.hypot(r.x,r.z)<0.01; })()',"joystick release");
 assert(dist(before.livePhysics.selfPosition,moving.livePhysics.selfPosition)>0.08,"touch joystick did not move actor");

 const jumpBefore=await c.eval(s,'window.__sharedYardV0Evidence().inputScheduler.jumpDelivery.pressSequence');
 await touch(c,s,"touchStart",boxes.jump.x,boxes.jump.y);await sleep(50);await touch(c,s,"touchEnd",boxes.jump.x,boxes.jump.y);
 await waitFor(c,s,'(() => { const j=window.__sharedYardV0Evidence?.()?.inputScheduler?.jumpDelivery; return j && j.pressSequence>='+String(jumpBefore+1)+' && j.deliveredSequence>='+String(jumpBefore+1)+'; })()',"touch jump causal delivery");

 const yawBefore=await c.eval(s,'window.__sharedYardV0Evidence().presentation.cameraOrbit.yaw');
 await touch(c,s,"touchStart",boxes.gimbal.x,boxes.gimbal.y);
 await touch(c,s,"touchMove",boxes.gimbal.x+Math.min(34,boxes.gimbal.w*0.28),boxes.gimbal.y);
 await sleep(350);
 await touch(c,s,"touchEnd",boxes.gimbal.x,boxes.gimbal.y);
 const yawAfter=await c.eval(s,'window.__sharedYardV0Evidence().presentation.cameraOrbit.yaw');
 assert(Math.abs(yawAfter-yawBefore)>0.03,"touch gimbal did not rotate camera");

 const final=await c.eval(s,'window.__sharedYardV0Evidence()');
 assert(final.metrics.guardMismatches===0,"mobile input exact-state guard mismatch");
 Object.assign(result,{verdict:"WORLD_V0_MOBILE_INPUT_PASS",movementMeters:dist(before.livePhysics.selfPosition,moving.livePhysics.selfPosition),jumpSequence:{before:jumpBefore,after:final.inputScheduler.jumpDelivery.pressSequence,delivered:final.inputScheduler.jumpDelivery.deliveredSequence},cameraYawDelta:yawAfter-yawBefore,guardMismatches:final.metrics.guardMismatches,controls:{joystick:boxes.joy,gimbal:boxes.gimbal,jump:boxes.jump}});
 console.log(result.verdict,JSON.stringify(result));
}catch(error){result.error=error instanceof Error?error.stack||error.message:String(error);console.error(result.error);process.exitCode=1;}finally{writeFileSync(OUTPUT,JSON.stringify(result,null,2));c?.close();if(child.exitCode===null)child.kill("SIGKILL");try{rmSync(profile,{recursive:true,force:true});}catch{}}
