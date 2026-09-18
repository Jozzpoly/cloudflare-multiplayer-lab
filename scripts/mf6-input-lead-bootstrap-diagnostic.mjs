import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { createShapedTcpProxy } from "./multiplayer-foundation-v2-shaped-tcp-proxy.mjs";

const BASE=(process.env.MF6_BOOTSTRAP_BASE||"http://127.0.0.1:8787").replace(/\/$/,"");
const OUTPUT=process.env.MF6_BOOTSTRAP_OUTPUT||"mf6-bootstrap-diagnostic.json";
const DEBUG_PORT_BASE=Number(process.env.MF6_BOOTSTRAP_DEBUG_PORT||9450);
const TIMEOUT_MS=30_000;
const USE_PROXY=process.env.MF6_BOOTSTRAP_USE_PROXY==="1";
const PROXY_PORT_BASE=Number(process.env.MF6_BOOTSTRAP_PROXY_PORT||8792);
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));

function findChrome(){
  const override=process.env.CHROME_BIN?.trim();
  if(override)return override;
  const p=spawnSync("bash",["-lc","command -v google-chrome || command -v google-chrome-stable || command -v chromium || command -v chromium-browser"],{encoding:"utf8"});
  const binary=p.stdout.trim().split("\n")[0];
  if(!binary)throw new Error("Chrome binary not found: "+(p.stderr||"no candidate"));
  return binary;
}

class Cdp {
  constructor(url){
    this.ws=new WebSocket(url);
    this.nextId=1;
    this.pending=new Map();
    this.events=[];
    this.opened=new Promise((resolve,reject)=>{
      this.ws.addEventListener("open",resolve,{once:true});
      this.ws.addEventListener("error",()=>reject(new Error("CDP open failed")),{once:true});
    });
    this.ws.addEventListener("message",async(event)=>{
      const raw=typeof event.data==="string"?event.data:await event.data.text();
      const message=JSON.parse(raw);
      if(!message.id){
        this.events.push(message);
        if(this.events.length>400)this.events.shift();
        return;
      }
      const waiter=this.pending.get(message.id);
      if(!waiter)return;
      this.pending.delete(message.id);
      if(message.error)waiter.reject(new Error(waiter.method+": "+message.error.message));
      else waiter.resolve(message.result||{});
    });
  }
  async call(method,params={},sessionId){
    await this.opened;
    const id=this.nextId++;
    return new Promise((resolve,reject)=>{
      this.pending.set(id,{resolve,reject,method});
      const payload={id,method,params};
      if(sessionId)payload.sessionId=sessionId;
      this.ws.send(JSON.stringify(payload));
    });
  }
  async eval(sessionId,expression){
    const r=await this.call("Runtime.evaluate",{expression,awaitPromise:true,returnByValue:true},sessionId);
    if(r.exceptionDetails)throw new Error(r.exceptionDetails.text||"evaluation failed");
    return r.result?.value;
  }
  close(){try{this.ws.close();}catch{}}
}

async function waitDebugger(port,timeout=15_000){
  const end=Date.now()+timeout;
  while(Date.now()<end){
    try{
      const r=await fetch("http://127.0.0.1:"+port+"/json/version");
      if(r.ok){
        const j=await r.json();
        if(j.webSocketDebuggerUrl)return j.webSocketDebuggerUrl;
      }
    }catch{}
    await sleep(100);
  }
  throw new Error("Chrome debugger timeout");
}

async function runLead(lead,index){
  const port=DEBUG_PORT_BASE+index;
  const profile=mkdtempSync(join(tmpdir(),"mf6-bootstrap-"));
  const stderr=[];
  let chrome=null;
  let cdp=null;
  let sessionId=null;
  let proxy=null;
  const startedAt=Date.now();
  try{
    const pageBase=USE_PROXY ? "http://127.0.0.1:"+(PROXY_PORT_BASE+index) : BASE;
    if(USE_PROXY){
      proxy=createShapedTcpProxy({target:BASE,port:PROXY_PORT_BASE+index,seed:0x5f3759df+index});
      await proxy.listen();
      proxy.passthrough();
    }
    chrome=spawn(findChrome(),[
      "--headless=new","--no-sandbox","--disable-dev-shm-usage",
      "--disable-background-networking","--disable-background-timer-throttling",
      "--disable-backgrounding-occluded-windows","--disable-renderer-backgrounding",
      "--use-gl=angle","--use-angle=swiftshader-webgl","--enable-unsafe-swiftshader",
      "--remote-debugging-port="+port,"--remote-debugging-address=127.0.0.1",
      "--user-data-dir="+profile,"about:blank",
    ],{stdio:["ignore","ignore","pipe"]});
    chrome.stderr?.on("data",(chunk)=>{
      stderr.push(String(chunk));
      if(stderr.length>80)stderr.shift();
    });

    cdp=new Cdp(await waitDebugger(port));
    await cdp.opened;
    const target=await cdp.call("Target.createTarget",{url:"about:blank"});
    const attached=await cdp.call("Target.attachToTarget",{targetId:target.targetId,flatten:true});
    sessionId=attached.sessionId;
    await cdp.call("Runtime.enable",{},sessionId);
    await cdp.call("Page.enable",{},sessionId);
    await cdp.call("Network.enable",{},sessionId);
    await cdp.call("Log.enable",{},sessionId);

    const url=new URL(pageBase+"/world-v0/");
    url.searchParams.set("run","bootdiag-"+lead+"-"+Date.now().toString(36));
    url.searchParams.set("lifecycle","mf6");
    url.searchParams.set("player","mf6-bootstrap");
    if(lead!==8)url.searchParams.set("mf6InputLeadProbe",String(lead));
    await cdp.call("Page.navigate",{url:url.toString()},sessionId);

    let state=null;
    const end=Date.now()+TIMEOUT_MS;
    while(Date.now()<end){
      try{
        state=await cdp.eval(sessionId,`({
          href: location.href,
          readyState: document.readyState,
          enterExists: Boolean(document.querySelector("#enter")),
          enterDisabled: document.querySelector("#enter")?.disabled ?? null,
          enterText: document.querySelector("#enter")?.textContent ?? null,
          bootStatus: document.querySelector("#boot-status")?.textContent ?? null,
          evidenceType: typeof window.__sharedYardV0Evidence,
          bodyText: document.body?.innerText?.slice(0,500) ?? null
        })`);
        if(state?.readyState==="complete"&&state?.enterDisabled===false&&state?.evidenceType==="function")break;
      }catch{}
      await sleep(200);
    }

    const eventSummary=cdp.events
      .filter(e=>["Runtime.exceptionThrown","Log.entryAdded","Network.loadingFailed","Network.responseReceived"].includes(e.method))
      .map(e=>({method:e.method,params:e.params}))
      .slice(-120);
    const failures=eventSummary.filter(e=>e.method==="Network.loadingFailed");
    const exceptions=eventSummary.filter(e=>e.method==="Runtime.exceptionThrown"||e.method==="Log.entryAdded");
    const responses=eventSummary
      .filter(e=>e.method==="Network.responseReceived")
      .map(e=>({url:e.params?.response?.url,status:e.params?.response?.status,mimeType:e.params?.response?.mimeType}))
      .filter(e=>e.url?.includes("cdn.jsdelivr")||e.url?.includes("/world-v0/"));

    const ready=state?.readyState==="complete"&&state?.enterDisabled===false&&state?.evidenceType==="function";
    return {
      lead,ready,durationMs:Date.now()-startedAt,state,
      failures,
      exceptions,
      relevantResponses:responses,
      proxy:proxy?.snapshot()||null,
      chromeStderr:stderr.join("").slice(-8000),
    };
  } finally {
    cdp?.close();
    if(chrome?.exitCode===null)chrome.kill("SIGKILL");
    try{await proxy?.close();}catch{}
    await sleep(100);
    rmSync(profile,{recursive:true,force:true});
  }
}

const requestedLeads=(process.env.MF6_BOOTSTRAP_LEADS||"8,10,12")
  .split(",")
  .map(value=>Number(value.trim()))
  .filter(Number.isFinite);
const results=[];
for(const [index,lead] of requestedLeads.entries()){
  results.push(await runLead(lead,index));
}
const output={
  verdict:"MF6_INPUT_LEAD_BOOTSTRAP_DIAGNOSTIC_COMPLETE",
  generatedAt:new Date().toISOString(),
  results,
};
writeFileSync(OUTPUT,JSON.stringify(output,null,2));
console.log("MF6_INPUT_LEAD_BOOTSTRAP_DIAGNOSTIC",JSON.stringify(output));
if(!results.every(r=>r.ready))process.exitCode=1;
